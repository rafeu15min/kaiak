'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve, DEFAULTS } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');

const lua = (source) => {
  const host = createLuaHost({});
  const error = host.run(source, 'kaiak.lua');
  const result = resolve(host.data);
  host.close();
  return { ...result, error };
};
const names = (config) => Object.keys(config.themes);

test('sem temas nomeados: só o theme base, themes vazio', () => {
  const r = lua('k.theme { accent = "#ff0000" }');
  assert.deepEqual(names(r.config), []);
  assert.equal(r.config.theme.accent, '#ff0000');
});

test('temas nomeados: ordem de leitura, o 1º é o inicial, cada um parte do base e do padrão', () => {
  const r = lua(`
    k.theme { font = "monospace" }
    k.theme("noite", { bg = "#101418", accent = "#7aa2f7" })
    k.theme("dia", { bg = "#f4f4f6", fg = "#202020" })
  `);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(names(r.config), ['noite', 'dia']);
  assert.equal(r.config.theme, r.config.themes.noite);
  assert.equal(r.config.themes.noite.font, 'monospace', 'herda o theme base');
  assert.equal(r.config.themes.dia.accent, DEFAULTS.theme.accent, 'o que falta vem do padrão');
  assert.equal(r.config.themes.dia.fg, '#202020');
});

test('regras de ordem: redeclarar mescla no lugar; false remove; remover e declarar de novo vai ao fim', () => {
  const r = lua(`
    k.theme("a", { bg = "#111111" })
    k.theme("b", { bg = "#222222" })
    k.theme("c", { bg = "#333333" })
    k.theme("a", { accent = "#abcdef" })
    k.theme("b", false)
    k.theme("b", { bg = "#999999" })
  `);
  assert.deepEqual(names(r.config), ['a', 'c', 'b']);
  assert.equal(r.config.themes.a.bg, '#111111');
  assert.equal(r.config.themes.a.accent, '#abcdef');
  assert.equal(r.config.themes.b.bg, '#999999');
});

test('avisos: chave desconhecida com sugestão, valor que não é texto, nome inválido', () => {
  assert.match(lua('k.theme("x", { acent = "#fff" })').warnings[0], /themes\.x\.acent.*quis dizer "accent"/);
  const r = lua('k.theme("x", { bg = 5 })');
  assert.match(r.warnings[0], /"themes\.x\.bg" inválido/);
  assert.equal(r.config.themes.x.bg, DEFAULTS.theme.bg);
  assert.match(lua('k.theme("1x", { bg = "#fff" })').warnings[0], /tema "1x" inválido/);
});

test('botão de alternar só existe se o .lua declarar; ação toggle_theme e { theme = nome } são validadas', () => {
  assert.deepEqual(resolve().config.buttons, {});
  const ok = lua(`
    k.theme("noite", {}) k.theme("dia", {})
    k.button("t", { icon = "◐", slot = "bar", action = "toggle_theme" })
    k.button("d", { icon = "☀", slot = "bar", action = { theme = "dia" } })
  `);
  assert.deepEqual(ok.warnings, []);
  assert.deepEqual(Object.keys(ok.config.buttons), ['t', 'd']);
  const ruim = lua('k.button("d", { icon = "☀", slot = "bar", action = { theme = "dia" } })');
  assert.match(ruim.warnings[0], /o tema "dia" não existe/);
});

test('k.theme.set só funciona depois da partida', () => {
  assert.match(lua('k.theme.set("dia")').error, /^kaiak\.lua:1: k\.theme\.set só funciona depois da partida/);
});

test('color_scheme é nativo (dark|light); scheme é nome livre; vars viram variáveis CSS', () => {
  assert.equal(lua('k.theme("dia", { color_scheme = "light" })').config.themes.dia.color_scheme, 'light');
  assert.equal(resolve().config.theme.color_scheme, 'dark');
  assert.equal(resolve().config.theme.scheme, 'default');
  const livre = lua('k.theme("x", { scheme = "pergaminho-2", vars = { destaque = "#b5651d", raio = "12px" } })');
  assert.deepEqual(livre.warnings, []);
  assert.equal(livre.config.themes.x.scheme, 'pergaminho-2');
  assert.deepEqual(livre.config.themes.x.vars, { destaque: '#b5651d', raio: '12px' });
  const ruim = lua('k.theme("x", { color_scheme = "claro", scheme = "nome com espaço", vars = { Maiuscula = "1", ok = "a;b", certo = "1" } })');
  const text = ruim.warnings.join('\n');
  assert.match(text, /"themes\.x\.color_scheme" inválido/);
  assert.match(text, /"themes\.x\.scheme" inválido/);
  assert.match(text, /"themes\.x\.vars\.Maiuscula" inválido/);
  assert.match(text, /"themes\.x\.vars\.ok" inválido/);
  assert.deepEqual(ruim.config.themes.x.vars, { certo: '1' });
  assert.match(lua('k.theme { scheme = "a b" }').warnings[0], /"theme\.scheme" inválido/);
  assert.equal(lua('k.theme { vars = { a = "1" } }\nk.theme("n", { vars = { b = "2" } })').config.themes.n.vars.a, '1', 'vars do tema base são herdadas');
});
