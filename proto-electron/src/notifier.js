'use strict';
// Gerenciador de avisos. Cada aviso tem um TIPO (download, alert); uma ROTA leva o tipo a uma SUPERFÍCIE
// (lugar + estilo + empilhamento). A superfície é uma view criada só no primeiro aviso dela. Este módulo
// não conhece o Electron: fala com a janela pelo `host`, então roda (e é testado) sem ele.
//   host: { createView(onLoaded) -> view, add(view), remove(view), setBounds(view, rect),
//           region() -> rect, send(view, canal, dados), idOf(view) -> id }
const { STYLES, SYSTEM_SURFACE, SYSTEM_SPEC } = require('./notify-styles');
const { surfaceBounds } = require('./notify-layout');

const LABELS = { error: 'erro', warning: 'aviso', info: 'info' };
const MAX_ALIVE = 50; // com contador, os escondidos continuam vivos; este teto evita acúmulo sem fim

function createNotifier({ config, host, timers = { set: setTimeout, clear: clearTimeout } }) {
  const states = new Map(); // nome da superfície -> { spec, style, items, view, loaded, shown }
  let nextId = 1;

  const capacity = (state) => (state.spec.stack === 'replace' ? 1 : state.spec.max ?? state.style.max);

  // O que aparece: os `capacity` mais novos (em 'up' o novo fica no começo da lista; nos outros, no fim).
  function visibleItems(state) {
    const size = capacity(state);
    return state.spec.stack === 'up' ? state.items.slice(0, size) : state.items.slice(-size);
  }

  // Contador (`more`): quantos avisos vivos estão escondidos, no formato `counter_format` (%d = o número;
  // ex.: "+%d" -> "+2", "%d" -> "2", "(%d)", "+%d mais"); vai no item mais novo à vista.
  function moreLabel(state, item, shown) {
    const newest = state.spec.stack === 'up' ? shown[0] : shown.at(-1);
    const hidden = state.items.length - shown.length;
    if (!state.spec.counter || item !== newest || hidden <= 0) return '';
    return state.spec.counter_format.replace('%d', String(hidden));
  }

  const publicItem = (state, item, shown) => ({
    id: item.id, title: item.title ?? '', text: item.text ?? '', level: item.level,
    label: LABELS[item.level] ?? item.level, more: moreLabel(state, item, shown), dismissible: item.dismissible,
  });

  function send(state) {
    if (!state.loaded) return;
    host.send(state.view, 'notify:render', {
      items: visibleItems(state).map((item, _i, shown) => publicItem(state, item, shown)),
      html: state.spec.html ?? state.style.item,
      css: state.style.css + (state.spec.css ?? ''),
      close_all: !!state.spec.close_all && state.items.some((item) => item.dismissible), // sobrando só erro, não há o que dispensar
    });
  }

  function hide(state) {
    if (state.shown) host.log?.(`ocultar ${state.name}`);
    if (state.shown) host.remove(state.view);
    state.shown = false;
    send(state); // a view oculta continua com o conteúdo em dia
  }

  function draw(state) {
    if (state.items.length === 0) return hide(state);
    host.setBounds(state.view, surfaceBounds(state.spec, state.style, host.region(), visibleItems(state).length));
    host.add(state.view); // adicionar de novo põe a view por cima das outras
    host.log?.(`mostrar: ${state.name} ${visibleItems(state).map((i) => i.text ?? i.title).join(' | ')}`);
    state.shown = true;
    send(state);
  }

  function stateOf(name) {
    if (states.has(name)) return states.get(name);
    const spec = name === SYSTEM_SURFACE ? SYSTEM_SPEC : config.notification.surfaces[name];
    const state = { name, spec, style: STYLES[spec.style], items: [], view: null, loaded: false, shown: false };
    states.set(name, state);
    state.view = host.createView(() => { state.loaded = true; draw(state); });
    return state;
  }

  // Para onde vai e quanto fica (ms; Infinity = até dispensar; 0 = não mostrar). `system` ignora a config por inteiro.
  function routeOf(kind) {
    if (kind === 'system') return { name: SYSTEM_SURFACE, ms: Infinity };
    const type = config.notification.types[kind];
    return { name: type.surface, ms: type.timeout_ms };
  }

  function insert(state, item) {
    if (state.spec.stack === 'up') state.items.unshift(item);
    else state.items.push(item);
    // sem contador, o que não cabe é descartado; com contador, fica vivo (escondido) até o seu tempo acabar
    const extra = state.items.length - (state.spec.counter ? MAX_ALIVE : capacity(state));
    if (extra <= 0) return;
    const dropped = state.spec.stack === 'up' ? state.items.splice(-extra) : state.items.splice(0, extra);
    dropped.forEach((old) => timers.clear(old.timer));
  }

  function removeWhere(state, test) {
    const gone = state.items.filter(test);
    if (gone.length === 0) return;
    gone.forEach((item) => timers.clear(item.timer));
    state.items = state.items.filter((item) => !test(item));
    draw(state);
  }

  const stateOfView = (viewId) => [...states.values()].find((s) => s.view && host.idOf(s.view) === viewId);

  return {
    // n: { kind: 'download' | 'alert' | 'system', level?, title?, text?, tag?, pinned? }. Devolve o id do aviso, ou null se não for mostrado.
    notify(n) {
      const { name, ms } = routeOf(n.kind);
      if (!name || ms <= 0) return null;
      const state = stateOf(name);
      const level = n.level ?? 'info';
      // Só o erro de SINTAXE do kaiak.lua (n.pinned, vindo do carregador) não se dispensa. Todo o resto se dispensa.
      const dismissible = !(n.kind === 'system' && n.pinned === true);
      const item = { id: nextId++, level, title: n.title, text: n.text, tag: n.tag, timer: null, dismissible };
      insert(state, item);
      if (Number.isFinite(ms)) item.timer = timers.set(() => removeWhere(state, (i) => i.id === item.id), ms);
      draw(state);
      return item.id;
    },
    clearTag(tag) { states.forEach((state) => removeWhere(state, (item) => item.tag === tag)); },
    // Pedidos que vêm da própria view (botões × do template): só valem para a superfície dona da view.
    dismiss(viewId, id) {
      const state = stateOfView(viewId);
      if (state) removeWhere(state, (item) => item.id === id && item.dismissible);
    },
    dismissAll(viewId) {
      const state = stateOfView(viewId);
      if (state) removeWhere(state, (item) => item.dismissible);
    },
    // A janela mudou de tamanho: recalcula o retângulo das superfícies visíveis.
    relayout() {
      states.forEach((s) => { if (s.shown) host.setBounds(s.view, surfaceBounds(s.spec, s.style, host.region(), visibleItems(s).length)); });
    },
    raise() { states.forEach((s) => { if (s.shown) host.add(s.view); }); },
    count(name) { return states.get(name)?.items.length ?? 0; },
    created(name) { return states.has(name); },
  };
}

module.exports = { createNotifier };
