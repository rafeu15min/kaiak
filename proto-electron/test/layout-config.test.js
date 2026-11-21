'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve, DEFAULTS } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');

// Roda um kaiak.lua e devolve { config, warnings, error }.
function lua(source) {
  const host = createLuaHost({});
  const error = host.run(source, 'kaiak.lua');
  const result = resolve(host.data);
  host.close();
  return { ...result, error };
}
const ids = (config) => Object.keys(config.layout);

test('padrão: rail e bar, nessa ordem, sem avisos', () => {
  const r = resolve();
  assert.deepEqual(ids(r.config), ['rail', 'bar']);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.config.layout, DEFAULTS.layout);
});

test('redeclarar mescla NO LUGAR (a posição da 1ª leitura é mantida)', () => {
  const r = lua('k.layout("rail", { size = 56 })\nk.layout("bar", { place = "bottom" })\nk.layout("rail", { expand = 300 })');
  assert.deepEqual(ids(r.config), ['rail', 'bar']);
  assert.equal(r.config.layout.rail.size, 56);
  assert.equal(r.config.layout.rail.expand, 300);
  assert.equal(r.config.layout.bar.place, 'bottom');
  assert.deepEqual(r.warnings, []);
});

test('false remove; remover e declarar de novo leva ao FIM e volta aos valores de fábrica', () => {
  const removed = lua('k.layout("bar", false)');
  assert.deepEqual(ids(removed.config), ['rail']);
  const moved = lua('k.layout("rail", { size = 99 })\nk.layout("rail", false)\nk.layout("rail")');
  assert.deepEqual(ids(moved.config), ['bar', 'rail'], 'o trilho foi para o fim');
  assert.equal(moved.config.layout.rail.size, DEFAULTS.layout.rail.size, 'voltou ao valor de fábrica (o 99 morreu com a remoção)');
  const reorder = lua('k.layout("rail", false)\nk.layout("bar", { size = 36 })\nk.layout("rail", {})');
  assert.deepEqual(ids(reorder.config), ['bar', 'rail']);
  assert.equal(reorder.config.layout.bar.size, 36);
});

test('false só remove o que veio ANTES dele (como o hl.unbind)', () => {
  const r = lua('k.layout("dock", false)\nk.layout("dock", { content = "address", place = "bottom", size = 30 })');
  assert.deepEqual(ids(r.config), ['rail', 'bar', 'dock'], 'o false veio antes: não leva o dock declarado depois');
  const after = lua('k.layout("dock", { content = "address", place = "bottom", size = 30 })\nk.layout("dock", false)');
  assert.deepEqual(ids(after.config), ['rail', 'bar']);
});

test('slot novo entra no fim, na ordem em que foi lido', () => {
  const r = lua(`
    k.layout("lateral", { content = "address", place = "right", size = 280 })
    k.layout("rodape", { content = "tabs", place = "bottom", size = 36 })
  `);
  assert.deepEqual(ids(r.config), ['rail', 'bar', 'lateral', 'rodape']);
  assert.deepEqual(r.warnings, []);
});

test('forma de tabela: a ordem das chaves é a de escrita; mistura com chamadas por slot', () => {
  const r = lua(`
    k.layout { zeta = { content = "tabs", place = "bottom", size = 30 }, alfa = { content = "address", place = "right", size = 200 }, bar = false }
    k.layout("rail", { place = "right" })
  `);
  assert.deepEqual(ids(r.config), ['rail', 'zeta', 'alfa'], 'bar removido; zeta antes de alfa (ordem de escrita, não alfabética)');
  assert.equal(r.config.layout.rail.place, 'right');
});

test('handle: k.layout devolve algo com :remove(); tabela devolve um handle por id', () => {
  const r = lua(`
    local dock = k.layout("dock", { content = "address", place = "bottom", size = 30 })
    dock:remove()
    local h = k.layout { a = { content = "tabs", place = "top", size = 30 }, b = { content = "tabs", place = "bottom", size = 30 } }
    h.a:remove()
  `);
  assert.equal(r.error, null);
  assert.deepEqual(ids(r.config), ['rail', 'bar', 'b']);
});

test('sem limite de orientação: tabs e address valem em qualquer borda', () => {
  for (const content of ['tabs', 'address']) {
    for (const place of ['left', 'right', 'top', 'bottom']) {
      const r = lua(`k.layout("x", { content = "${content}", place = "${place}", size = 40 })`);
      assert.deepEqual(r.warnings, [], `${content} em ${place}`);
      assert.equal(r.config.layout.x.place, place);
    }
  }
});

test('campo inválido: avisa com o esperado e volta ao valor de fábrica (slot de fábrica) ou ignora o campo (novo)', () => {
  const r = lua('k.layout("rail", { place = "centro", size = 5, expand = "0.5", mode = "boiando" })');
  assert.equal(r.warnings.length, 4);
  assert.equal(r.config.layout.rail.place, 'left');
  assert.equal(r.config.layout.rail.size, 42);
  assert.equal(r.config.layout.rail.expand, 240);
  assert.equal(r.config.layout.rail.mode, 'push');
  assert.ok(r.warnings.some((w) => w.includes('layout.rail.place') && w.includes('left, right, top, bottom')));
  const novo = lua('k.layout("x", { content = "tabs", place = "left", size = 40, expand = "nada" })');
  assert.equal(novo.warnings.length, 1);
  assert.equal(novo.config.layout.x.expand, undefined);
});

test('slot novo incompleto ou com nome ruim é ignorado, dizendo o que faltou', () => {
  const r = lua('k.layout("x", { place = "left" })\nk.layout("1ruim", { content = "tabs", place = "left", size = 40 })');
  assert.deepEqual(ids(r.config), ['rail', 'bar']);
  assert.equal(r.warnings.length, 2);
  assert.ok(r.warnings.some((w) => w.includes('faltam: content, size')));
  assert.ok(r.warnings.some((w) => w.includes('"1ruim"')));
});

test('spec que não é tabela: o Lua recusa na hora; vindo de outro lugar (resolve), a validação avisa', () => {
  assert.match(lua('k.layout("y", 7)').error, /^kaiak\.lua:1: k\.layout espera/);
  const r = resolve({ layout: [{ id: 'y', spec: 7 }] });
  assert.deepEqual(ids(r.config), ['rail', 'bar']);
  assert.ok(r.warnings[0].includes('"layout.y"'));
});

test('erro de digitação num campo: aviso com "quis dizer"', () => {
  const r = lua('k.layout("rail", { plce = "right", sise = 50 })');
  assert.equal(r.warnings.length, 2);
  assert.ok(r.warnings.some((w) => w.includes('layout.rail.plce') && w.includes('quis dizer "place"')));
  assert.ok(r.warnings.some((w) => w.includes('layout.rail.sise') && w.includes('quis dizer "size"')));
});

test('porcentagem em size e expand; expand = false desliga a expansão', () => {
  const r = lua('k.layout("rail", { size = "8%", expand = "25%" })\nk.layout("bar", { size = "6%" })');
  assert.deepEqual(r.warnings, []);
  assert.equal(r.config.layout.rail.size, '8%');
  const off = lua('k.layout("rail", { expand = false })');
  assert.equal(off.config.layout.rail.expand, undefined);
  assert.deepEqual(off.warnings, []);
  for (const bad of ['1%', '90%', '5 %', '0.5']) assert.equal(lua(`k.layout("rail", { size = "${bad}" })`).warnings.length, 1, bad);
});

test('erros do k.layout apontam a linha do kaiak.lua do usuário', () => {
  assert.match(lua('k.theme {}\n\nk.layout(5)').error, /^kaiak\.lua:3: k\.layout espera uma tabela/);
  assert.match(lua('k.layout("rail", "texto")').error, /^kaiak\.lua:1: k\.layout espera uma tabela, false ou nada/);
  assert.match(lua('k.notification.surface(5, {})').error, /^kaiak\.lua:1: k\.notification\.surface/);
});

test('resolve também aceita o layout como lista de operações ou como tabela (tests e ferramentas)', () => {
  const list = resolve({ layout: [{ id: 'rail', spec: { size: 50 } }, { id: 'rail', spec: false }, { id: 'rail', spec: {} }] });
  assert.deepEqual(ids(list.config), ['bar', 'rail']);
  const table = resolve({ layout: { rail: { size: 50 } } });
  assert.equal(table.config.layout.rail.size, 50);
});

test('slot: bg (cor própria do slot) aceita cor válida; o resto avisa e é ignorado', () => {
  const ok = lua('k.layout("rail", { bg = "#2b395e" })\nk.layout("bar", { bg = "rgb(10, 20, 30)" })');
  assert.deepEqual(ok.warnings, []);
  assert.equal(ok.config.layout.rail.bg, '#2b395e');
  assert.equal(ok.config.layout.bar.bg, 'rgb(10, 20, 30)');
  const bad = lua('k.layout("rail", { bg = "red;}</style>" })');
  assert.match(bad.warnings[0], /"layout\.rail\.bg" inválido/);
  assert.equal(bad.config.layout.rail.bg, undefined);
});
