'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { findBounds } = require('../src/find-layout');
const { createFind } = require('../src/find');
const { DEFAULT_HTML } = require('../src/find-template');
const { resolve } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');
const { buildKeymap } = require('../src/keymap');
const { createActions } = require('../src/actions');

const PAGE = { x: 46, y: 44, width: 1000, height: 600 };
const BOX = { width: 380, height: 46 };

test('findBounds: os 8 lugares ficam dentro da página, com margem', () => {
  const at = (place) => findBounds(PAGE, place, BOX, 12);
  assert.deepEqual(at('top-right'), { x: 46 + 1000 - 12 - 380, y: 44 + 12, width: 380, height: 46 });
  assert.deepEqual(at('top-left'), { x: 58, y: 56, width: 380, height: 46 });
  assert.deepEqual(at('bottom-left'), { x: 58, y: 44 + 600 - 12 - 46, width: 380, height: 46 });
  assert.deepEqual(at('bottom-right'), { x: 654, y: 586, width: 380, height: 46 });
  assert.equal(at('top').x, 46 + (1000 - 380) / 2);
  assert.equal(at('left').y, 44 + (600 - 46) / 2);
  assert.equal(at('right').x, 654);
  for (const place of ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right']) {
    const b = at(place);
    assert.ok(b.x >= PAGE.x && b.y >= PAGE.y && b.x + b.width <= PAGE.x + PAGE.width && b.y + b.height <= PAGE.y + PAGE.height, place);
  }
});

test('findBounds: página pequena encolhe a caixa em vez de sair da área', () => {
  const b = findBounds({ x: 0, y: 0, width: 200, height: 40 }, 'top-right', BOX, 12);
  assert.equal(b.width, 176);
  assert.equal(b.height, 16);
  assert.ok(b.x >= 0 && b.x + b.width <= 200);
});

// ---- controlador, com janela, view e aba falsas
const SETTINGS = { place: 'top-right', width: 380, height: 46, margin: 12, caseSensitive: false, wholeWord: false, html: DEFAULT_HTML, css: '' };
const setup = (overrides = {}, wordTotal = 3) => {
  const log = [];
  const win = { contentView: { addChildView: (v) => log.push(['add', v.name]), removeChildView: (v) => log.push(['remove', v.name]) } };
  const tab = new EventEmitter();
  Object.assign(tab, {
    destroyed: false, isDestroyed() { return this.destroyed; },
    findInPage: (q, o) => log.push(['find', q, o]), stopFindInPage: (a) => log.push(['stop', a]), focus: () => log.push(['focus-page']),
    executeJavaScript: (code) => { log.push(['js', code]); return Promise.resolve(code.includes('n++') ? wordTotal : true); },
  });
  let active = tab;
  let views = 0;
  const sent = [];
  const createView = (onLoaded) => {
    const view = { name: `v${++views}`, bounds: null, setBounds(b) { this.bounds = b; }, webContents: { send: (...a) => sent.push(a), close: () => log.push(['destroy', view.name]) } };
    view.loaded = onLoaded;
    return view;
  };
  const find = createFind({ createView, win, pageBounds: () => PAGE, activeContents: () => active, settings: { ...SETTINGS, ...overrides } });
  return { find, log, tab, sent, setActive: (t) => { active = t; } };
};
const tick = () => new Promise((r) => setImmediate(r));

test('abrir: cria a view por cima da página, posiciona, escuta found-in-page; abrir de novo só foca', () => {
  const { find, log, tab, sent } = setup();
  find.open();
  assert.deepEqual(log[0], ['add', 'v1']);
  assert.equal(tab.listenerCount('found-in-page'), 1);
  find.open();
  assert.equal(log.filter((e) => e[0] === 'add').length, 1, 'não cria uma segunda caixa');
  assert.deepEqual(sent.at(-1), ['find:focus']);
  assert.equal(find.owns({ not: 'it' }), false);
});

test('buscar: texto vira findInPage com matchCase; vazio limpa; passos usam findNext com a direção', () => {
  const { find, log } = setup({ caseSensitive: true });
  find.open();
  find.search('kaiak');
  find.step(true);
  find.step(false);
  find.search('');
  const finds = log.filter((e) => e[0] === 'find');
  assert.deepEqual(finds[0], ['find', 'kaiak', { findNext: false, matchCase: true }]);
  assert.deepEqual(finds[1], ['find', 'kaiak', { findNext: true, forward: true, matchCase: true }]);
  assert.deepEqual(finds[2], ['find', 'kaiak', { findNext: true, forward: false, matchCase: true }]);
  assert.deepEqual(log.filter((e) => e[0] === 'stop').at(-1), ['stop', 'clearSelection']);
});

test('texto enorme é cortado; contador só aparece na atualização final', () => {
  const { find, log, tab, sent } = setup();
  find.open();
  find.search('a'.repeat(500));
  assert.equal(log.find((e) => e[0] === 'find')[1].length, 200);
  tab.emit('found-in-page', {}, { activeMatchOrdinal: 1, matches: 9, finalUpdate: false });
  assert.equal(sent.filter((s) => s[0] === 'find:state').length, 0);
  tab.emit('found-in-page', {}, { activeMatchOrdinal: 3, matches: 9, finalUpdate: true });
  assert.deepEqual(sent.at(-1), ['find:state', { active: 3, total: 9 }]);
});

test('PALAVRA INTEIRA: conta com window.find (palavra inteira = 5º argumento), percorre com wrap e o contador anda em círculo', async () => {
  const { find, log, sent } = setup({ wholeWord: true }, 3);
  find.open();
  find.search('casa');
  await tick();
  const count = log.find((e) => e[0] === 'js' && e[1].includes('n++'))[1];
  assert.match(count, /window\.find\("casa", false, false, false, true, false, false\)/);
  assert.deepEqual(sent.at(-1), ['find:state', { active: 1, total: 3 }]);
  find.step(true); await tick();
  find.step(true); await tick();
  find.step(true); await tick(); // dá a volta
  assert.deepEqual(sent.at(-1), ['find:state', { active: 1, total: 3 }]);
  find.step(false); await tick();
  assert.deepEqual(sent.at(-1), ['find:state', { active: 3, total: 3 }], 'anterior volta ao fim');
  const stepCode = log.filter((e) => e[0] === 'js' && e[1].startsWith('window.find')).at(-1)[1];
  assert.match(stepCode, /window\.find\("casa", false, true, true, true, false, false\)/, 'backwards = true, wrap = true');
  assert.equal(log.filter((e) => e[0] === 'find').length, 0, 'o motor nativo não é usado nesse modo');
});

test('palavra inteira: a consulta entra como literal JSON (aspas e crases não viram código)', async () => {
  const { find, log } = setup({ wholeWord: true });
  find.open();
  find.search('a"); alert(1); (`');
  await tick();
  const code = log.find((e) => e[0] === 'js' && e[1].includes('n++'))[1];
  assert.ok(code.includes(JSON.stringify('a"); alert(1); (`')));
  assert.ok(!code.includes('a"); alert(1)'), 'sem a consulta crua no código');
});

test('palavra inteira sem ocorrências: 0/0 e passos não fazem nada', async () => {
  const { find, log, sent } = setup({ wholeWord: true }, 0);
  find.open();
  find.search('nada');
  await tick();
  assert.deepEqual(sent.at(-1), ['find:state', { active: 0, total: 0 }]);
  const before = log.length;
  find.step(true); await tick();
  assert.equal(log.length, before);
});

test('opções: ligar "palavra inteira" troca o motor e refaz a busca; desligar volta ao nativo', async () => {
  const { find, log } = setup();
  find.open();
  find.search('casa');
  find.setOptions({ matchCase: true, wholeWord: true });
  await tick();
  assert.ok(log.some((e) => e[0] === 'js' && e[1].includes('n++')));
  find.setOptions({ matchCase: false, wholeWord: false });
  const last = log.filter((e) => e[0] === 'find').at(-1);
  assert.deepEqual(last, ['find', 'casa', { findNext: false, matchCase: false }]);
});

test('fechar durante a contagem da palavra inteira não lança nem manda estado velho', async () => {
  const { find, sent } = setup({ wholeWord: true });
  find.open();
  find.search('casa');
  find.close();
  await tick();
  assert.equal(sent.filter((s) => s[0] === 'find:state').length, 0);
});

test('fechar: limpa a seleção, tira a view, destrói, solta o ouvinte e devolve o foco à página', () => {
  const { find, log, tab } = setup();
  find.open();
  find.close();
  assert.ok(log.some((e) => e[0] === 'stop'));
  assert.deepEqual(log.slice(-3), [['remove', 'v1'], ['destroy', 'v1'], ['focus-page']]);
  assert.equal(tab.listenerCount('found-in-page'), 0);
  find.close();
  assert.equal(log.filter((e) => e[0] === 'destroy').length, 1);
  find.step(true); // passo com a caixa fechada abre
  assert.equal(log.filter((e) => e[0] === 'add').length, 2);
});

test('trocar de aba fecha a busca; a mesma aba não', () => {
  const { find, log, setActive } = setup();
  find.open();
  find.tabChanged();
  assert.equal(log.filter((e) => e[0] === 'destroy').length, 0);
  setActive(new EventEmitter());
  find.tabChanged();
  assert.equal(log.filter((e) => e[0] === 'destroy').length, 1);
});

test('aba fechada durante a busca: fechar não lança; sem aba ativa abrir não faz nada', () => {
  const a = setup();
  a.find.open();
  a.tab.destroyed = true;
  assert.doesNotThrow(() => a.find.close());
  const b = setup();
  b.setActive(null);
  b.find.open();
  assert.equal(b.log.length, 0);
});

test('config: lugar, medidas, estado inicial, css e html próprios (validação completa)', () => {
  const lua = (src) => { const h = createLuaHost({}); h.run(src, 'kaiak.lua'); const r = resolve(h.data); h.close(); return r; };
  const d = resolve().config.find;
  assert.deepEqual([d.place, d.width, d.height, d.margin, d.case_sensitive, d.whole_word, d.html, d.css], ['top-right', 400, 46, 12, false, false, '', '']);
  const ok = lua(`k.find { place = "bottom-left", width = 600, height = 60, margin = 0, case_sensitive = true, whole_word = true,
    css = ".b { color: red }", html = [[<div class="b"><input data-find="input"><span data-find='count'></span></div>]] }`);
  assert.deepEqual(ok.warnings, []);
  assert.equal(ok.config.find.width, 600);
  const bad = lua(`k.find { place = "center", enabled = "sim", width = 5000, height = 3, margin = -4, css = "</style><script>", html = "<b>sem campo</b>" }`);
  const text = bad.warnings.join('\n');
  for (const part of [/find\.place/, /find\.enabled/, /find\.width/, /find\.height/, /find\.margin/, /find\.css.*<\/style/, /find\.html.*data-find="input"/]) assert.match(text, part);
  assert.deepEqual([bad.config.find.place, bad.config.find.width, bad.config.find.css, bad.config.find.html], ['top-right', 400, '', '']);
  assert.match(lua('k.find { widht = 1 }').warnings[0], /quis dizer "width"/);
});

test('modelo de fábrica: todos os controles marcados com data-find e o campo obrigatório presente', () => {
  for (const name of ['input', 'count', 'case', 'word', 'prev', 'next', 'close']) assert.ok(DEFAULT_HTML.includes(`data-find="${name}"`), name);
});

test('teclas padrão e ações da busca', () => {
  const keys = resolve().config.keys;
  assert.deepEqual([keys['ctrl+f'], keys['f3'], keys['shift+f3']], ['find', 'find_next', 'find_prev']);
  const calls = [];
  const actions = createActions({ tabs: {}, focusAddress() {}, find: { open: () => calls.push('open'), step: (f) => calls.push(f ? 'next' : 'prev') } });
  assert.deepEqual(buildKeymap(keys, actions).warnings, []);
  actions.find(); actions.find_next(); actions.find_prev();
  assert.deepEqual(calls, ['open', 'next', 'prev']);
});
