'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { surfaceBounds, contentHeight } = require('../src/notify-layout');
const { createNotifier } = require('../src/notifier');
const { STYLES, PLACES } = require('../src/notify-styles');
const { DEFAULTS, resolve } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');

const region = { x: 42, y: 40, width: 958, height: 760 }; // a área da página de uma janela 1000x800
const pill = STYLES.pill;
const strip = STYLES.strip;

// ---------- geometria (pura)
test('toast padrão: canto inferior direito, igual ao popup antigo', () => {
  assert.deepEqual(surfaceBounds(DEFAULTS.notification.surfaces.toast, pill, region, 1), { x: 644, y: 720, width: 340, height: 64 });
});

test('strip padrão: topo da página, largura total, altura 14 + 18 por linha', () => {
  const spec = DEFAULTS.notification.surfaces.strip;
  assert.deepEqual(surfaceBounds(spec, strip, region, 1), { x: 42, y: 40, width: 958, height: 32 });
  assert.equal(surfaceBounds(spec, strip, region, 3).height, 68);
  assert.equal(contentHeight(strip, 8), 14 + 8 * 18);
});

test('os 8 lugares (4 cantos e 4 bordas) ficam dentro da região e encostados nas bordas certas', () => {
  const at = (place) => surfaceBounds({ place, offset: [10, 10] }, pill, region, 1);
  assert.equal(PLACES.length, 8);
  assert.ok(!PLACES.includes('center'), 'não existe centro');
  for (const place of PLACES) {
    const b = at(place);
    assert.ok(b.x >= region.x && b.x + b.width <= region.x + region.width, `${place} x`);
    assert.ok(b.y >= region.y && b.y + b.height <= region.y + region.height, `${place} y`);
  }
  const right = region.x + region.width;
  const bottom = region.y + region.height;
  assert.deepEqual([at('top-left').x, at('top-left').y], [52, 50]);
  assert.deepEqual([at('top-right').x + 340, at('top-right').y], [right - 10, 50]);
  assert.deepEqual([at('bottom-left').x, at('bottom-left').y + 64], [52, bottom - 10]);
  assert.deepEqual([at('bottom-right').x + 340, at('bottom-right').y + 64], [right - 10, bottom - 10]);
  // meios de borda: encostam em UMA borda e se centralizam ao longo dela
  assert.deepEqual([at('top').x, at('top').y], [42 + (958 - 340) / 2, 50]);
  assert.equal(at('bottom').y + 64, bottom - 10);
  assert.deepEqual([at('left').x, at('left').y], [52, 40 + (760 - 64) / 2]);
  assert.deepEqual([at('right').x + 340, at('right').y], [right - 10, 40 + (760 - 64) / 2]);
});

test('o offset só vale no eixo encostado: mudar o x de "top" ou o y de "left" não move nada', () => {
  const at = (place, offset) => surfaceBounds({ place, offset }, pill, region, 1);
  assert.deepEqual(at('top', [10, 20]), at('top', [300, 20]));
  assert.deepEqual(at('left', [20, 10]), at('left', [20, 300]));
  assert.notDeepEqual(at('top', [10, 20]), at('top', [10, 30]));
});

test('lista empilhada cresce com o número de itens', () => {
  const spec = { place: 'bottom-right', offset: [16, 16] };
  assert.equal(surfaceBounds(spec, pill, region, 3).height, 3 * 64 + 2 * 8);
});

test('janela estreita ou baixa: nunca passa da região', () => {
  const tiny = { x: 0, y: 0, width: 200, height: 50 };
  const b = surfaceBounds({ place: 'bottom-right', offset: [16, 16] }, pill, tiny, 3);
  assert.ok(b.width <= 200 - 32 && b.height <= 50 - 32);
  assert.ok(b.x >= 0 && b.y >= 0);
});

// ---------- gerenciador (host e timers falsos)
function harness(over = {}) {
  const log = { created: [], added: [], removed: [], bounds: [], sent: [] };
  const loadCallbacks = [];
  let nextView = 100;
  const host = {
    createView(onLoaded) { const v = { id: nextView++ }; log.created.push(v.id); loadCallbacks.push(onLoaded); return v; },
    add: (v) => log.added.push(v.id),
    remove: (v) => log.removed.push(v.id),
    setBounds: (v, r) => log.bounds.push([v.id, r]),
    region: () => region,
    send: (v, channel, data) => log.sent.push([v.id, channel, data]),
    idOf: (v) => v.id,
  };
  const pending = new Map();
  let handle = 0;
  const timers = {
    set: (fn, ms) => { pending.set(++handle, { fn, ms }); return handle; },
    clear: (h) => pending.delete(h),
  };
  const { config } = resolve(over);
  const notifier = createNotifier({ config, host, timers });
  const load = (i = 0) => loadCallbacks[i]();
  const fire = () => { const [h, t] = [...pending][0]; pending.delete(h); t.fn(); };
  return { notifier, log, load, fire, pending, config };
}

test('a view da superfície só nasce no primeiro aviso dela (lazy)', () => {
  const h = harness();
  assert.equal(h.log.created.length, 0);
  h.notifier.notify({ kind: 'download', title: 'Baixando', text: 'a.bin' });
  assert.equal(h.log.created.length, 1);
  assert.equal(h.notifier.created('strip'), false);
});

test('rota: download vai ao toast, alerta vai à strip', () => {
  const h = harness();
  h.notifier.notify({ kind: 'download', title: 'x', text: 'y' });
  h.notifier.notify({ kind: 'alert', level: 'info', text: 'z' });
  assert.equal(h.notifier.count('toast'), 1);
  assert.equal(h.notifier.count('strip'), 1);
});

test('só envia depois que a view carregou, e envia o estado atual', () => {
  const h = harness();
  h.notifier.notify({ kind: 'download', title: 'A', text: 'a' });
  assert.equal(h.log.sent.length, 0);
  h.load(0);
  const [, channel, data] = h.log.sent.at(-1);
  assert.equal(channel, 'notify:render');
  assert.equal(data.items.length, 1);
  assert.equal(data.html, STYLES.pill.item);
  assert.ok(data.css.includes('.pill'));
});

test('duração: download usa timeout_ms do tipo download; alerta informativo usa o do tipo alert; system fica até dispensar', () => {
  const h = harness({ notification: { types: { download: { timeout_ms: 1500 }, alert: { timeout_ms: 700 } } } });
  h.notifier.notify({ kind: 'download', title: 'd', text: 'd' });
  h.notifier.notify({ kind: 'alert', level: 'info', text: 'a' });
  h.notifier.notify({ kind: 'system', level: 'error', text: 'e' });
  assert.deepEqual([...h.pending.values()].map((t) => t.ms), [1500, 700]);
});

test('0 = não mostrar (por tipo), mas o alerta de sistema aparece mesmo com tudo zerado', () => {
  const h = harness({ notification: { types: { download: { timeout_ms: 0 }, alert: { timeout_ms: 0 } } } });
  assert.equal(h.notifier.notify({ kind: 'download', title: 'x', text: 'y' }), null);
  assert.equal(h.notifier.notify({ kind: 'alert', level: 'info', text: 'z' }), null);
  assert.notEqual(h.notifier.notify({ kind: 'system', level: 'error', text: 'erro' }), null);
  assert.equal(h.notifier.count('system'), 1);
});

test('o timer remove o aviso e esconde a view quando não sobra nada', () => {
  const h = harness();
  h.notifier.notify({ kind: 'download', title: 'x', text: 'y' });
  h.load(0);
  h.fire();
  assert.equal(h.notifier.count('toast'), 0);
  assert.deepEqual(h.log.removed, [100]);
  assert.deepEqual(h.log.sent.at(-1)[2].items, [], 'a view oculta fica com o conteúdo em dia');
});

test('stack replace mantém só o último e cancela o timer do anterior', () => {
  const h = harness();
  h.notifier.notify({ kind: 'download', title: '1', text: '1' });
  h.notifier.notify({ kind: 'download', title: '2', text: '2' });
  assert.equal(h.notifier.count('toast'), 1);
  assert.equal(h.pending.size, 1);
});

test('stack down/up: lista com limite; descarta o mais antigo', () => {
  const h = harness({ notification: { surfaces: { toast: { stack: 'down', max: 2 } } } });
  ['a', 'b', 'c'].forEach((t) => h.notifier.notify({ kind: 'download', title: t, text: t }));
  h.load(0);
  assert.deepEqual(h.log.sent.at(-1)[2].items.map((i) => i.title), ['b', 'c']);
  const up = harness({ notification: { surfaces: { toast: { stack: 'up', max: 2 } } } });
  ['a', 'b', 'c'].forEach((t) => up.notifier.notify({ kind: 'download', title: t, text: t }));
  up.load(0);
  assert.deepEqual(up.log.sent.at(-1)[2].items.map((i) => i.title), ['c', 'b']);
  assert.equal(up.pending.size, 2, 'o timer do descartado foi cancelado');
});

test('clearTag remove só os avisos com a etiqueta', () => {
  const h = harness();
  h.notifier.notify({ kind: 'system', level: 'warning', text: 'lista ads', tag: 'list:ads' });
  h.notifier.notify({ kind: 'system', level: 'warning', text: 'lista malware', tag: 'list:malware' });
  h.notifier.clearTag('list:ads');
  assert.equal(h.notifier.count('system'), 1);
});

test('dismiss só vale para a view dona; dismissAll esvazia a superfície', () => {
  const h = harness();
  const id = h.notifier.notify({ kind: 'system', level: 'warning', text: 'e1' });
  h.notifier.notify({ kind: 'system', level: 'warning', text: 'e2' });
  h.notifier.dismiss(999, id);
  assert.equal(h.notifier.count('system'), 2, 'view desconhecida é ignorada');
  h.notifier.dismiss(100, id);
  assert.equal(h.notifier.count('system'), 1);
  h.notifier.dismissAll(100);
  assert.equal(h.notifier.count('system'), 0);
});

test('relayout recalcula só as superfícies visíveis; raise as põe por cima', () => {
  const h = harness();
  h.notifier.notify({ kind: 'download', title: 'x', text: 'y' });
  const before = h.log.bounds.length;
  h.notifier.relayout();
  assert.equal(h.log.bounds.length, before + 1);
  const added = h.log.added.length;
  h.notifier.raise();
  assert.equal(h.log.added.length, added + 1);
});

test('rota false desliga o tipo; superfície nova e HTML próprio chegam à view', () => {
  const off = harness({ notification: { types: { download: { surface: false } } } });
  assert.equal(off.notifier.notify({ kind: 'download', title: 'x', text: 'y' }), null);
  const custom = harness({
    notification: {
      surfaces: { meu: { place: 'top-right', html: '<i data-bind="text"></i>', css: '.x{}' } },
      types: { download: { surface: 'meu' } },
    },
  });
  custom.notifier.notify({ kind: 'download', title: 't', text: 'abc' });
  custom.load(0);
  const data = custom.log.sent.at(-1)[2];
  assert.equal(data.html, '<i data-bind="text"></i>');
  assert.ok(data.css.endsWith('.x{}') && data.css.includes('.pill'), 'o CSS do usuário soma ao do estilo');
});

// ---------- validação da config
test('config padrão: duas superfícies e dois tipos, sem avisos', () => {
  const r = resolve();
  assert.deepEqual(Object.keys(r.config.notification.surfaces), ['toast', 'strip']);
  assert.deepEqual(r.config.notification.types, { download: { surface: 'toast', timeout_ms: 1000 }, alert: { surface: 'strip', timeout_ms: 1000 } });
  assert.deepEqual(r.warnings, []);
});

test('config: campos inválidos voltam ao padrão da superfície, com o que se esperava', () => {
  const r = resolve({ notification: { surfaces: { toast: { place: 'meio', style: 'cartao', stack: 'x', offset: [1], close_all: 'sim', max: 0 } } } });
  assert.equal(r.warnings.length, 6);
  assert.equal(r.config.notification.surfaces.toast.place, 'bottom-right');
  assert.equal(r.config.notification.surfaces.toast.style, 'pill');
  assert.equal(r.config.notification.surfaces.toast.max, undefined);
  assert.ok(r.warnings.some((w) => w.includes('um de: pill, strip')));
});

test('config: superfície nova completa campos faltantes; nome inválido é ignorado', () => {
  const r = resolve({ notification: { surfaces: { nova: { place: 'left' }, 'a b': {} } } });
  assert.equal(r.config.notification.surfaces.nova.style, 'pill');
  assert.deepEqual(r.config.notification.surfaces.nova.offset, [16, 16]);
  assert.equal(r.config.notification.surfaces['a b'], undefined);
  assert.equal(r.warnings.length, 1);
});

test('config: tipo apontando para superfície inexistente; tipo desconhecido avisa com sugestão', () => {
  const r = resolve({ notification: { types: { download: { surface: 'nao-existe' }, alert: { surface: false }, dowload: { surface: 'toast' } } } });
  assert.equal(r.config.notification.types.download.surface, 'toast');
  assert.equal(r.config.notification.types.alert.surface, false);
  assert.equal(r.warnings.length, 2);
  assert.ok(r.warnings.some((w) => w.includes('"notification.types.dowload"') && w.includes('quis dizer "download"')));
});

test('config: types.<tipo> = false vale como surface = false; tabela inválida volta ao padrão', () => {
  assert.equal(resolve({ notification: { types: { download: false } } }).config.notification.types.download.surface, false);
  const r = resolve({ notification: { types: { alert: 'strip' } } });
  assert.equal(r.config.notification.types.alert.surface, 'strip');
  assert.equal(r.warnings.length, 1);
});

test('config: o padrão compartilhado não é alterado por uma superfície do usuário', () => {
  resolve({ notification: { surfaces: { toast: { place: 'top' } } } });
  assert.equal(DEFAULTS.notification.surfaces.toast.place, 'bottom-right');
});

// ---------- Lua
test('Lua: k.notification (3 formas) vira dados; argumento errado dá erro claro', () => {
  const host = createLuaHost({});
  const error = host.run(`
    k.notification.surface("toast", { place = "top-right", offset = { 8, 8 }, close_all = true })
    k.notification.surface { meu = { style = "strip", html = [[<b data-bind="text"></b>]] }, outro = { place = "left" } }
    k.notification.type("download", { surface = "meu", timeout_ms = 500 })
    k.notification { types = { alert = { surface = false } } }
  `, 'kaiak.lua');
  assert.equal(error, null);
  const n = host.data.notification;
  assert.deepEqual(n.surfaces.toast, { place: 'top-right', offset: [8, 8], close_all: true });
  assert.equal(n.surfaces.meu.html, '<b data-bind="text"></b>');
  assert.equal(n.surfaces.outro.place, 'left');
  assert.deepEqual(n.types, { download: { surface: 'meu', timeout_ms: 500 }, alert: { surface: false } });
  host.close();
  const bad = createLuaHost({});
  assert.match(bad.run('k.notification.surface(5, {})', 'kaiak.lua'), /k\.notification\.surface/);
  bad.close();
  const missing = createLuaHost({});
  assert.match(missing.run('k.notification.surface("x")', 'kaiak.lua'), /espera uma tabela ou false/);
  missing.close();
  const old = createLuaHost({});
  assert.match(old.run('k.surface("x", {})', 'kaiak.lua'), /attempt to call/, 'k.surface não existe mais');
  old.close();
});

test('Lua: false e valores inválidos em types chegam à validação', () => {
  const host = createLuaHost({});
  host.run('k.notification.type("download", false)\nk.notification.type("alert", { surface = "inexistente" })', 'kaiak.lua');
  const { config, warnings } = resolve(host.data);
  assert.equal(config.notification.types.download.surface, false);
  assert.equal(config.notification.types.alert.surface, 'strip');
  assert.equal(warnings.length, 1);
  host.close();
});

test('Lua + config: o que o .lua define chega validado até o gerenciador', () => {
  const host = createLuaHost({});
  host.run('k.notification.surface("toast", { place = "top-left", style = "strip" })\nk.notification.type("download", { surface = "toast" })', 'kaiak.lua');
  const { config, warnings } = resolve(host.data);
  assert.deepEqual(warnings, []);
  assert.equal(config.notification.surfaces.toast.place, 'top-left');
  assert.equal(config.notification.surfaces.toast.style, 'strip');
  host.close();
});

test('config: "center" deixou de existir; left e right valem; o aviso lista os lugares aceitos', () => {
  const bad = resolve({ notification: { surfaces: { toast: { place: 'center' } } } });
  assert.equal(bad.config.notification.surfaces.toast.place, 'bottom-right');
  assert.equal(bad.warnings.length, 1);
  assert.ok(bad.warnings[0].includes('left, right'));
  for (const place of ['left', 'right', 'top', 'bottom', 'top-left']) {
    const ok = resolve({ notification: { surfaces: { toast: { place } } } });
    assert.deepEqual(ok.warnings, [], place);
  }
});

// ---------- contador (counter)
const labels = (h) => h.log.sent.at(-1)[2].items.map((i) => i.more);

test('counter desligado (padrão): "more" sempre vazio', () => {
  const h = harness({ notification: { surfaces: { toast: { stack: 'down', max: 2 } } } });
  ['a', 'b', 'c'].forEach((t) => h.notifier.notify({ kind: 'download', title: t, text: t }));
  h.load(0);
  assert.deepEqual(labels(h), ['', '']);
});

test('counter + replace: o último aparece com "+N" dos escondidos, e todos continuam vivos', () => {
  const h = harness({ notification: { surfaces: { toast: { counter: true } } } });
  ['a', 'b', 'c'].forEach((t) => h.notifier.notify({ kind: 'download', title: t, text: t }));
  h.load(0);
  const items = h.log.sent.at(-1)[2].items;
  assert.deepEqual(items.map((i) => [i.title, i.more]), [['c', '+2']]);
  assert.equal(h.notifier.count('toast'), 3);
  assert.equal(h.pending.size, 3, 'cada aviso mantém o seu próprio timer');
});

test('counter: o contador cai quando um escondido expira e some quando sobra só um', () => {
  const h = harness({ notification: { surfaces: { toast: { counter: true } } } });
  ['a', 'b', 'c'].forEach((t) => h.notifier.notify({ kind: 'download', title: t, text: t }));
  h.load(0);
  h.fire(); // expira o 'a' (o mais antigo)
  assert.equal(labels(h)[0], '+1');
  h.fire(); // expira o 'b'
  assert.deepEqual(labels(h), ['']);
  assert.equal(h.log.sent.at(-1)[2].items[0].title, 'c');
});

test('counter + down/up: selo no item mais novo à vista', () => {
  const down = harness({ notification: { surfaces: { toast: { stack: 'down', max: 2, counter: true } } } });
  ['a', 'b', 'c', 'd'].forEach((t) => down.notifier.notify({ kind: 'download', title: t, text: t }));
  down.load(0);
  assert.deepEqual(down.log.sent.at(-1)[2].items.map((i) => [i.title, i.more]), [['c', ''], ['d', '+2']]);
  const up = harness({ notification: { surfaces: { toast: { stack: 'up', max: 2, counter: true } } } });
  ['a', 'b', 'c', 'd'].forEach((t) => up.notifier.notify({ kind: 'download', title: t, text: t }));
  up.load(0);
  assert.deepEqual(up.log.sent.at(-1)[2].items.map((i) => [i.title, i.more]), [['d', '+2'], ['c', '']]);
});

test('counter: a altura da superfície segue só os itens visíveis', () => {
  const h = harness({ notification: { surfaces: { toast: { stack: 'down', max: 2, counter: true } } } });
  ['a', 'b', 'c'].forEach((t) => h.notifier.notify({ kind: 'download', title: t, text: t }));
  assert.equal(h.log.bounds.at(-1)[1].height, 2 * 64 + 8);
});

test('counter: teto de 50 avisos vivos descarta o mais antigo; dismiss do visível revela o escondido', () => {
  const h = harness({ notification: { surfaces: { strip: { counter: true, stack: 'replace' } } } });
  for (let i = 0; i < 60; i++) h.notifier.notify({ kind: 'alert', level: 'error', text: `e${i}` });
  assert.equal(h.notifier.count('strip'), 50);
  h.load(0);
  const id = h.log.sent.at(-1)[2].items[0].id;
  h.notifier.dismiss(100, id);
  const after = h.log.sent.at(-1)[2].items[0];
  assert.equal(after.text, 'e58');
  assert.equal(after.more, '+48');
});

test('config: counter inválido volta ao padrão; Lua aceita counter = true', () => {
  const r = resolve({ notification: { surfaces: { toast: { counter: 'sim' } } } });
  assert.equal(r.config.notification.surfaces.toast.counter, false);
  assert.equal(r.warnings.length, 1);
  const host = createLuaHost({});
  host.run('k.notification.surface("toast", { counter = true })', 'kaiak.lua');
  assert.equal(resolve(host.data).config.notification.surfaces.toast.counter, true);
  host.close();
});

// ---------- estilos de fábrica
test('todo estilo de fábrica tem o mesmo formato: um item com data-bind, medidas coerentes e o CSS do item', () => {
  assert.deepEqual(Object.keys(STYLES), ['pill', 'strip', 'card', 'minimal']);
  for (const [name, style] of Object.entries(STYLES)) {
    assert.ok(style.item.startsWith('<div'), `${name}: um único elemento raiz`);
    assert.ok(/data-bind="(text|title)"/.test(style.item), `${name}: mostra o texto`);
    assert.ok(style.itemHeight > 0 && style.max >= 1 && style.gap >= 0, `${name}: medidas`);
    assert.ok(style.css.includes(`.${style.item.match(/class="(\w+)"/)[1]}`), `${name}: CSS da classe do item`);
    assert.ok(!/<script|onclick|onerror/i.test(style.item), `${name}: sem script`);
  }
});

test('card e minimal: alturas somam certo e "more" existe nos dois', () => {
  assert.equal(contentHeight(STYLES.card, 2), 2 * 84 + 10);
  assert.equal(contentHeight(STYLES.minimal, 3), 3 * 32 + 2 * 6);
  assert.ok(STYLES.card.item.includes('data-bind="more"') && STYLES.minimal.item.includes('data-bind="more"'));
  assert.ok(STYLES.card.item.includes('data-action="dismiss"'), 'o card tem o × por item');
});

test('config aceita os novos estilos e a mensagem de erro os lista', () => {
  for (const style of ['card', 'minimal']) assert.deepEqual(resolve({ notification: { surfaces: { toast: { style } } } }).warnings, [], style);
  const bad = resolve({ notification: { surfaces: { toast: { style: 'neon' } } } });
  assert.ok(bad.warnings[0].includes('pill, strip, card, minimal'));
});

test('card e minimal chegam à view com o seu HTML e CSS', () => {
  for (const style of ['card', 'minimal']) {
    const h = harness({ notification: { surfaces: { toast: { style } } } });
    h.notifier.notify({ kind: 'download', title: 'Baixando', text: 'a.bin' });
    h.load(0);
    const data = h.log.sent.at(-1)[2];
    assert.equal(data.html, STYLES[style].item);
    assert.equal(h.log.bounds.at(-1)[1].width, STYLES[style].width);
  }
});

// ---------- máscara do contador
test('counter_format: máscaras com mais no começo, sem mais, parênteses, texto e símbolo', () => {
  const masks = { '+%d': '+2', '%d': '2', '(%d)': '(2)', '+%d mais': '+2 mais', '×%d': '×2', 'e mais %d': 'e mais 2' };
  for (const [counter_format, expected] of Object.entries(masks)) {
    const h = harness({ notification: { surfaces: { toast: { counter: true, counter_format } } } });
    ['a', 'b', 'c'].forEach((t) => h.notifier.notify({ kind: 'download', title: t, text: t }));
    h.load(0);
    assert.equal(labels(h)[0], expected, counter_format);
  }
});

test('counter_format: padrão "+%d"; inválido (sem %d, dois %d, longo ou não-texto) volta ao padrão com aviso', () => {
  assert.equal(resolve().config.notification.surfaces.toast.counter_format, '+%d');
  for (const bad of ['sem numero', '%d e %d', 'x'.repeat(21) + '%d', 5, '']) {
    const r = resolve({ notification: { surfaces: { toast: { counter_format: bad } } } });
    assert.equal(r.config.notification.surfaces.toast.counter_format, '+%d', JSON.stringify(bad));
    assert.equal(r.warnings.length, 1, JSON.stringify(bad));
  }
});

test('counter_format vale por superfície e chega pelo Lua; o número continua texto puro', () => {
  const host = createLuaHost({});
  host.run('k.notification.surface("toast", { counter = true, counter_format = "%d <b>x</b>" })', 'kaiak.lua');
  const { config } = resolve(host.data);
  host.close();
  const h = harness({ notification: { surfaces: { toast: config.notification.surfaces.toast } } });
  ['a', 'b'].forEach((t) => h.notifier.notify({ kind: 'download', title: t, text: t }));
  h.load(0);
  assert.equal(labels(h)[0], '1 <b>x</b>', 'o HTML da máscara é só texto: a view usa textContent');
});

// ---------- calar um tipo: timeout_ms = 0 x surface = false
test('calar um tipo: timeout_ms = 0 e surface = false são equivalentes e valem para o tipo inteiro', () => {
  const quiet = (over) => harness(over).notifier.notify({ kind: 'alert', level: 'info', text: 'i' }) === null;
  assert.equal(quiet({}), false);
  assert.equal(quiet({ notification: { types: { alert: { timeout_ms: 0 } } } }), true);
  assert.equal(quiet({ notification: { types: { alert: { surface: false } } } }), true);
  assert.equal(quiet({ notification: { types: { alert: false } } }), true, 'types.alert = false é o mesmo que surface = false');
});

// ---------- alertas de SISTEMA: categoria fixa, o .lua não toca
test('system: nenhuma configuração o cala, move ou restila (tipo, superfícies, tempos, estilos)', () => {
  const hostile = {
    notification: {
      types: { alert: { surface: false, timeout_ms: 0 }, download: false },
      surfaces: { strip: { place: 'bottom-right', style: 'minimal', stack: 'replace', close_all: false }, toast: { place: 'left' } },
    },
  };
  for (const over of [{}, hostile]) {
    const h = harness(over);
    assert.notEqual(h.notifier.notify({ kind: 'system', level: 'error', text: 'erro de sintaxe', pinned: true }), null);
    h.load(0);
    assert.equal(h.log.bounds.at(-1)[1].y, region.y, 'sempre no topo da página');
    assert.equal(h.log.bounds.at(-1)[1].width, region.width, 'sempre de ponta a ponta');
    const data = h.log.sent.at(-1)[2];
    assert.equal(data.html, STYLES.strip.item);
    assert.equal(data.close_all, false, 'só há um erro: não existe botão de dispensar');
    h.notifier.notify({ kind: 'system', level: 'warning', text: 'um aviso' });
    assert.equal(h.log.sent.at(-1)[2].close_all, true, 'com um aviso dispensável o botão existe, mesmo com a config hostil');
    assert.equal(h.pending.size, 0, 'sem timer: fica até dispensar');
    assert.equal(h.notifier.count('system'), 2);
  }
});

test('system: o nome é reservado; tentar defini-lo na config avisa e é ignorado', () => {
  const r = resolve({ notification: { types: { system: { surface: false } }, surfaces: { system: { place: 'left' } } } });
  assert.equal(r.warnings.length, 2);
  assert.ok(r.warnings.every((w) => w.includes('é reservado')));
  assert.equal(r.config.notification.types.system, undefined);
  assert.equal(r.config.notification.surfaces.system, undefined);
  assert.deepEqual(Object.keys(r.config.notification.surfaces), ['toast', 'strip']);
});

test('system pelo Lua: k.notification.surface("system", ...) não muda nada', () => {
  const host = createLuaHost({});
  host.run('k.notification.surface("system", { place = "left" })\nk.notification.type("system", false)', 'kaiak.lua');
  const { config, warnings } = resolve(host.data);
  host.close();
  assert.equal(warnings.length, 2);
  assert.ok(!('system' in config.notification.surfaces) && !('system' in config.notification.types));
});

test('system e alertas informativos convivem: informativo configurável some, o de sistema fica', () => {
  const h = harness({ notification: { types: { alert: { timeout_ms: 700 } } } });
  h.notifier.notify({ kind: 'alert', level: 'info', text: 'lista ausente: baixando' });
  h.notifier.notify({ kind: 'system', level: 'error', text: 'erro de config' });
  assert.equal(h.notifier.count('strip'), 1);
  assert.equal(h.notifier.count('system'), 1);
  assert.deepEqual([...h.pending.values()].map((t) => t.ms), [700]);
});

// ---------- erro de sistema não se dispensa
test('system: SÓ o erro de sintaxe (pinned) não se dispensa; qualquer outro alerta de sistema se dispensa, inclusive nível erro', () => {
  const h = harness();
  const syntax = h.notifier.notify({ kind: 'system', level: 'error', text: 'kaiak.lua:5: unexpected symbol', pinned: true });
  const runtime = h.notifier.notify({ kind: 'system', level: 'error', text: 'kaiak.lua:9: attempt to call a nil value' });
  const warning = h.notifier.notify({ kind: 'system', level: 'warning', text: 'chave desconhecida' });
  h.load(0);
  const items = h.log.sent.at(-1)[2].items;
  assert.deepEqual(items.map((i) => i.dismissible), [false, true, true]);
  assert.equal(h.log.sent.at(-1)[2].close_all, true);
  h.notifier.dismiss(100, syntax);
  assert.equal(h.notifier.count('system'), 3, 'dispensar o erro de sintaxe não faz nada');
  h.notifier.dismiss(100, runtime);
  assert.equal(h.notifier.count('system'), 2, 'erro de execução se dispensa');
  h.notifier.dismissAll(100);
  assert.equal(h.notifier.count('system'), 1, 'dispensar tudo leva o resto e deixa o de sintaxe');
  assert.equal(h.log.sent.at(-1)[2].items[0].text, 'kaiak.lua:5: unexpected symbol');
  assert.equal(h.log.sent.at(-1)[2].close_all, false, 'sobrou só o erro de sintaxe: o botão some');
  assert.ok(warning);
});

test('system: erro de sintaxe sai só quando resolvido (clearTag); alert/download com nível erro continuam dispensáveis', () => {
  const h = harness();
  h.notifier.notify({ kind: 'system', level: 'error', text: 'erro de sintaxe', tag: 'cfg', pinned: true });
  h.load(0);
  assert.equal(h.pending.size, 0);
  h.notifier.clearTag('cfg');
  assert.equal(h.notifier.count('system'), 0, 'resolvido por código do próprio navegador');
  const id = h.notifier.notify({ kind: 'alert', level: 'error', text: 'informativo com nível erro' });
  h.load(1);
  assert.equal(h.log.sent.at(-1)[2].items[0].dismissible, true);
  h.notifier.dismiss(101, id);
  assert.equal(h.notifier.count('strip'), 0);
});
