'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSpeedDial, checkItem, MAX_ITEMS } = require('../src/speed-dial');
const { resolve } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');
const { renderStart } = require('../src/start-page');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kk-dial-')), 'sub', 'speed-dial.json');
const lua = (source) => {
  const host = createLuaHost({});
  const error = host.run(source, 'kaiak.lua');
  const result = resolve(host.data);
  host.close();
  return { ...result, error };
};

test('item: título e endereço http(s) válidos; o resto diz o motivo', () => {
  assert.deepEqual(checkItem({ title: ' GitHub ', url: 'https://github.com' }), { title: 'GitHub', url: 'https://github.com/' });
  for (const bad of [{}, { title: '', url: 'https://a.test' }, { title: 'x', url: 'ftp://a.test' }, { title: 'x', url: 'javascript:alert(1)' },
    { title: 'x', url: 'kaiak://start' }, { title: 'x', url: 'sem esquema' }, { title: 'a'.repeat(41), url: 'https://a.test' }, { title: 'x', url: `https://a.test/${'a'.repeat(2000)}` }]) {
    assert.ok(checkItem(bad).error, JSON.stringify(bad).slice(0, 60));
  }
});

test('arquivo de dados: cria pasta, adiciona, lista, remove; sem arquivo ou com lixo começa vazio', () => {
  const file = tmpFile();
  const dial = createSpeedDial(file);
  assert.deepEqual(dial.list(), []);
  const a = dial.add({ title: 'A', url: 'https://a.test' });
  const b = dial.add({ title: 'B', url: 'https://b.test' });
  assert.equal(dial.list().length, 2);
  assert.notEqual(a.id, b.id);
  assert.deepEqual(dial.remove(a.id), { ok: true });
  assert.deepEqual(dial.list().map((i) => i.title), ['B']);
  assert.ok(dial.remove('nao-existe').error);
  assert.ok(dial.add({ title: '', url: 'https://x.test' }).error);
  fs.writeFileSync(file, 'isto não é JSON');
  assert.deepEqual(dial.list(), []);
  fs.writeFileSync(file, JSON.stringify([{ id: '1', title: 'ok', url: 'https://ok.test' }, { id: '2', title: 'ruim', url: 'javascript:x' }, 5]));
  assert.deepEqual(dial.list().map((i) => i.id), ['1'], 'itens inválidos do arquivo são ignorados');
});

test('limite de atalhos do usuário', () => {
  const dial = createSpeedDial(tmpFile());
  for (let i = 0; i < MAX_ITEMS; i++) dial.add({ title: `t${i}`, url: `https://a.test/${i}` });
  assert.match(dial.add({ title: 'extra', url: 'https://a.test/x' }).error, /no máximo/);
});

test('config: speed_dial desligado por padrão; true usa padrões; tabela valida cada campo', () => {
  assert.equal(resolve().config.start.speed_dial, false);
  const on = lua('k.start { speed_dial = true }').config.start.speed_dial;
  assert.deepEqual({ ...on, items: [] }, { columns: 6, size: 96, shape: 'square', editable: true, items: [] });
  const r = lua(`k.start { speed_dial = { columns = 4, size = 80, shape = "round", editable = false, items = {
    { title = "GitHub", url = "https://github.com", icon = "🐙" }, { title = "MDN", url = "https://developer.mozilla.org" } } } }`);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.config.start.speed_dial.columns, 4);
  assert.equal(r.config.start.speed_dial.editable, false);
  assert.deepEqual(r.config.start.speed_dial.items.map((i) => i.title), ['GitHub', 'MDN']);
  const bad = lua(`k.start { speed_dial = { columns = 99, size = 10, shape = "oval", editable = "sim", cor = 1, items = {
    { title = "ok", url = "ftp://x" }, { title = "x", url = "https://x.test", icon = {} } } } }`);
  const text = bad.warnings.join('\n');
  for (const part of [/columns/, /size/, /shape/, /editable/, /cor" inválido: chave desconhecida/, /items\[1\].*só http/, /items\[2\].*icon/]) assert.match(text, part);
  assert.equal(bad.config.start.speed_dial.items.length, 0);
  assert.equal(lua('k.start { speed_dial = 7 }').config.start.speed_dial, false);
});

test('widgets: lista de blocos { place, width, height, html, css }; valida e limita', () => {
  const ok = lua('k.start { widgets = { { place = "top-right", width = 220, height = "30%", html = "<b>oi</b>", css = "b { color: red }" }, { html = "x" } } }');
  assert.deepEqual(ok.warnings, []);
  assert.deepEqual(ok.config.start.widgets[0], { place: 'top-right', html: '<b>oi</b>', css: 'b { color: red }', width: '220px', height: '30%' });
  assert.equal(ok.config.start.widgets[1].place, 'bottom');
  const bad = lua('k.start { widgets = { { place = "meio", html = "x", width = "larga", css = "</style><script>" }, { html = "" }, { cor = 1, html = "y" }, 5 } }');
  const text = bad.warnings.join('\n');
  for (const part of [/widgets\[1\].place/, /widgets\[1\].width/, /widgets\[1\].css/, /widgets\[2\].html/, /widgets\[3\].cor/, /widgets\[4\]/]) assert.match(text, part);
  assert.deepEqual(bad.config.start.widgets.map((w) => w.html), ['x', 'y']);
  assert.equal(lua(`k.start { widgets = { ${'{ html = "a" },'.repeat(13)} } }`).config.start.widgets.length, 12);
});

test('página: Speed Dial só com speed_dial; dados num bloco JSON seguro; widgets com HTML/CSS próprios', () => {
  const theme = resolve().config.theme;
  const base = { theme, searchTemplate: 'https://s.test/?q=%s' };
  assert.doesNotMatch(renderStart({ ...base, start: resolve().config.start }), /id="dial"/);
  const start = lua('k.start { speed_dial = { editable = true }, widgets = { { place = "bottom-left", html = "<i>oi</i>", css = "i{color:red}", width = 100 } } }').config.start;
  const html = renderStart({ ...base, start, dial: { fixed: [{ title: '</script><b>', url: 'https://a.test/', icon: null }], user: [{ id: '1', title: 'U', url: 'https://u.test/' }] } });
  assert.match(html, /id="dial" data-shape="square" style="--cols:6;--tile:96px"/);
  assert.match(html, /id="addform"/);
  const island = html.match(/<script type="application\/json" id="dial-data">(.*?)<\/script>/s)[1];
  assert.equal(JSON.parse(island).fixed[0].title, '</script><b>');
  assert.doesNotMatch(island, /</, 'o bloco de dados não contém "<"');
  assert.match(html, /<style>i\{color:red\}<\/style>/);
  assert.match(html, /justify-content:flex-start;align-items:flex-end.*<i>oi<\/i>/s);
  assert.doesNotMatch(renderStart({ ...base, start: lua('k.start { speed_dial = { editable = false } }').config.start }), /id="addform"/);
});

test('token da API: a página inicial leva o token da sessão no bloco de dados', () => {
  const start = lua('k.start { speed_dial = true }').config.start;
  const html = renderStart({ theme: resolve().config.theme, searchTemplate: 'x', start, dial: { fixed: [], user: [], token: 'abc123' } });
  assert.equal(JSON.parse(html.match(/id="dial-data">(.*?)<\/script>/s)[1]).token, 'abc123');
});
