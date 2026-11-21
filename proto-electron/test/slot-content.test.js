'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkContent, contentKind, BUILTIN } = require('../src/slot-content');
const { resolve } = require('../src/config');
const { createLayout, computeLayout } = require('../src/layout');
const { createLuaHost } = require('../src/lua-host');

const lua = (source) => {
  const host = createLuaHost({});
  const error = host.run(source, 'kaiak.lua');
  const result = resolve(host.data);
  host.close();
  return { ...result, error };
};

test('todas as formas válidas de content passam e têm o tipo certo', () => {
  const valid = [
    ['tabs', 'builtin'], ['address', 'builtin'],
    [{ url: 'https://chat.example.org/app' }, 'url'], [{ url: 'http://localhost:3000', partition: 'dev' }, 'url'],
    [{ html: '<b>oi</b>' }, 'html'], [{ html: '<i>x</i>', css: 'i { color: red }' }, 'html'],
    [{ file: '~/painel.html' }, 'file'], [{ file: '/tmp/x.html' }, 'file'],
  ];
  for (const [content, kind] of valid) {
    assert.equal(checkContent(content), null, JSON.stringify(content));
    assert.equal(contentKind(content), kind);
  }
  assert.deepEqual(Object.keys(BUILTIN), ['tabs', 'address', 'buttons']);
});

test('formas inválidas dizem o motivo', () => {
  const bad = [
    ['painel', /não é um conteúdo conhecido/], [5, /esperado um de/], [[], /esperado um de/], [{}, /exatamente UM/],
    [{ url: 'https://a.test', html: 'x' }, /exatamente UM.*url, html/], [{ url: 'ftp://x' }, /http:\/\/ ou https:\/\//],
    [{ url: 'javascript:alert(1)' }, /http:\/\/ ou https:\/\//], [{ url: 'file:///etc/passwd' }, /http:\/\/ ou https:\/\//],
    [{ url: 'https://a.test', css: 'x' }, /"css" não vale junto de "url"/], [{ html: 'x', partition: 'p' }, /"partition" não vale junto de "html"/],
    [{ html: 'x', cor: 1 }, /chave desconhecida "cor"/], [{ html: '' }, /não vazio/], [{ html: 'x'.repeat(200001) }, /até 200000/],
    [{ url: 'https://a.test', partition: '1ruim' }, /"partition" deve ser um nome/], [{ file: '' }, /caminho de um arquivo/],
  ];
  for (const [content, pattern] of bad) assert.match(checkContent(content), pattern, JSON.stringify(content).slice(0, 60));
});

test('layout: conteúdo novo chega validado pela config e pelo Lua; o conteúdo SUBSTITUI (não mescla)', () => {
  const r = lua(`
    k.layout("chat", { content = { url = "https://chat.example.org", partition = "chat" }, place = "right", size = 380 })
    k.layout("notas", { content = { html = "<p>nota</p>", css = "p { margin: 8px }" }, place = "bottom", size = 120 })
    k.layout("dash", { content = { file = "~/dash.html" }, place = "left", size = "20%" })
    k.layout("chat", { content = { html = "<p>agora é html</p>" } })
  `);
  assert.equal(r.error, null);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.config.layout.chat.content, { html: '<p>agora é html</p>' }, 'url + partition sumiram: substituído');
  assert.deepEqual(r.config.layout.dash.content, { file: '~/dash.html' });
  assert.deepEqual(Object.keys(r.config.layout), ['rail', 'bar', 'chat', 'notas', 'dash']);
});

test('layout: conteúdo inválido em slot de fábrica volta ao padrão; em slot novo, o campo é ignorado e o slot é recusado', () => {
  const factory = lua('k.layout("rail", { content = { url = "ftp://x" } })');
  assert.equal(factory.config.layout.rail.content, 'tabs');
  assert.equal(factory.warnings.length, 1);
  assert.match(factory.warnings[0], /layout\.rail\.content" inválido: "url" deve ser/);
  const novo = lua('k.layout("x", { content = { url = "ftp://x" }, place = "left", size = 40 })');
  assert.equal(novo.config.layout.x, undefined, 'sem content o slot está incompleto');
  assert.equal(novo.warnings.length, 2);
  assert.ok(novo.warnings.some((w) => w.includes('faltam: content')));
});

test('expand só vale para tabs e address; em site, html ou arquivo avisa e é ignorado', () => {
  const r = lua('k.layout("p", { content = { html = "x" }, place = "left", size = 40, expand = 200 })');
  assert.equal(r.config.layout.p.expand, undefined);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /só vale para tabs e address/);
  assert.deepEqual(lua('k.layout("rail", { expand = 300 })').warnings, []);
});

// ---------- visibilidade
const slots = { rail: { place: 'left', size: 42, mode: 'push' }, painel: { place: 'right', size: 300, mode: 'push', visible: false } };
const win = { getContentBounds: () => ({ width: 1000, height: 800 }) };

test('slot com visible = false não ocupa espaço até ser aberto; fechar de novo devolve o espaço', () => {
  const layout = createLayout(slots);
  assert.equal(layout.isVisible('painel'), false);
  assert.deepEqual(layout.pageBounds(win), { x: 42, y: 0, width: 958, height: 800 });
  assert.equal(layout.slotBounds(win, 'painel'), undefined);
  layout.setVisible('painel', true);
  assert.deepEqual(layout.pageBounds(win), { x: 42, y: 0, width: 658, height: 800 });
  assert.deepEqual(layout.slotBounds(win, 'painel'), { x: 700, y: 0, width: 300, height: 800 });
  layout.setVisible('painel', false);
  assert.equal(layout.pageBounds(win).width, 958);
  assert.equal(computeLayout({}, { width: 10, height: 10 }).page.width, 10);
});

test('a ordem de leitura continua valendo com slots fechados no meio', () => {
  const layout = createLayout({ a: { place: 'left', size: 100, mode: 'push' }, b: { place: 'left', size: 50, mode: 'push', visible: false }, c: { place: 'left', size: 20, mode: 'push' } });
  assert.deepEqual(layout.slotBounds(win, 'c'), { x: 100, y: 0, width: 20, height: 800 }, 'c fica logo depois de a');
  layout.setVisible('b', true);
  assert.deepEqual(layout.slotBounds(win, 'c'), { x: 150, y: 0, width: 20, height: 800 }, 'aberto, b volta à sua posição na ordem');
});

test('config: visible precisa ser true/false', () => {
  const r = lua('k.layout("rail", { visible = "sim" })');
  assert.equal(r.warnings.length, 1);
  assert.equal(r.config.layout.rail.visible, undefined);
  assert.deepEqual(lua('k.layout("rail", { visible = false })').warnings, []);
});

// ---------- handles em execução
test('h:show/hide/toggle chamam o navegador em execução; antes da partida dão erro claro', () => {
  const calls = [];
  const host = createLuaHost({});
  const early = host.run('local h = k.layout("rail")\nh:toggle()', 'kaiak.lua');
  assert.match(early, /^kaiak\.lua:2: k\.layout só funciona depois da partida/);
  host.close();

  const live = createLuaHost({});
  assert.equal(live.run(`
    local side = k.layout("rail")
    k.bind("ctrl+b", function() side:toggle() end)
    k.bind("ctrl+h", function() side:hide() end)
    k.bind("ctrl+s", function() side:show() end)
  `, 'kaiak.lua'), null);
  live.attach({ setSlotVisible: (id, mode) => { calls.push([id, mode]); return id === 'rail'; } });
  live.data.keys['ctrl+b']();
  live.data.keys['ctrl+h']();
  live.data.keys['ctrl+s']();
  assert.deepEqual(calls, [['rail', 'toggle'], ['rail', false], ['rail', true]]);
  live.close();

  const errors = [];
  const unknown = createLuaHost({ onError: (e) => errors.push(e) });
  unknown.run('local h = k.layout("x")\nk.bind("f1", function() h:toggle() end)', 'kaiak.lua');
  unknown.attach({ setSlotVisible: () => false });
  unknown.data.keys.f1();
  assert.match(errors[0], /o slot "x" não existe/);
  unknown.close();
});

// ---------- keep
test('config: keep precisa ser true/false; o padrão (ausente) é manter viva', () => {
  const r = lua('k.layout("p", { content = { html = "x" }, place = "right", size = 200, keep = false })');
  assert.deepEqual(r.warnings, []);
  assert.equal(r.config.layout.p.keep, false);
  assert.equal(lua('k.layout("p", { content = { html = "x" }, place = "right", size = 200 })').config.layout.p.keep, undefined);
  const bad = lua('k.layout("p", { content = { html = "x" }, place = "right", size = 200, keep = "nao" })');
  assert.equal(bad.warnings.length, 1);
  assert.equal(bad.config.layout.p.keep, undefined);
});
