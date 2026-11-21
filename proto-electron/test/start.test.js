'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve, DEFAULTS } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');
const { renderStart } = require('../src/start-page');

const lua = (source) => {
  const host = createLuaHost({});
  const error = host.run(source, 'kaiak.lua');
  const result = resolve(host.data);
  host.close();
  return { ...result, error };
};
const THEME = { ...DEFAULTS.theme };
const render = (start = DEFAULTS.start, art = null) => renderStart({ start, theme: THEME, art, searchTemplate: 'https://s.test/?q=%s' });

test('padrão: página inicial ligada, com busca, sem imagem, fundo da cor do tema', () => {
  const r = resolve();
  assert.deepEqual(r.warnings, []);
  assert.equal(r.config.start.enabled, true);
  assert.equal(r.config.start.search, true);
  assert.equal(r.config.start.background.image, false);
  const html = render();
  assert.match(html, new RegExp(`background: ${DEFAULTS.theme.bg}`));
  assert.match(html, /id="search"/);
  assert.match(html, /data-search="https:\/\/s\.test\/\?q=%s"/);
});

test('fundo: cor, gradiente e imagem válidos passam; o gradiente vence a cor', () => {
  const r = lua(`k.start { background = { color = "#252734", gradient = "linear-gradient(180deg, #111 0%, #333 100%)",
    image = { file = "~/a.svg", size = "30%", place = "bottom-right", tint = "#b2b4dd" } } }`);
  assert.deepEqual(r.warnings, []);
  const html = render(r.config.start, 'data:image/svg+xml;base64,AAAA');
  assert.match(html, /background: linear-gradient\(180deg, #111 0%, #333 100%\)/);
  assert.match(html, /justify-content:flex-end;align-items:flex-end/);
  assert.match(html, /width:30%/);
  assert.match(html, /background:#b2b4dd;-webkit-mask:url\(data:image\/svg\+xml;base64,AAAA\)/);
});

test('imagem: sem tinta vira <img>; tint = true usa a cor de destaque do tema; sem arquivo lido, some', () => {
  const plain = lua('k.start { background = { image = { file = "x.png" } } }').config.start;
  assert.match(render(plain, 'data:image/png;base64,AAAA'), /<img alt="" src="data:image\/png;base64,AAAA"/);
  const tinted = lua('k.start { background = { image = { file = "x.svg", tint = true } } }').config.start;
  assert.match(render(tinted, 'data:x'), new RegExp(`background:${DEFAULTS.theme.accent};-webkit-mask`));
  assert.doesNotMatch(render(plain, null), /class="art"/);
});

test('validação: cor, gradiente, medidas, lugares e chaves desconhecidas avisam e voltam ao padrão', () => {
  const r = lua(`k.start { search = "sim", background = { color = "red;}</style>", gradient = "linear-gradient(url(http://x))",
    image = { file = "a.svg", size = "grande", place = "meio", tint = "x;y", cor = 1 } } }`);
  const text = r.warnings.join('\n');
  assert.match(text, /"start\.search" inválido/);
  assert.match(text, /"start\.background\.color" inválido/);
  assert.match(text, /"start\.background\.gradient" inválido/);
  assert.match(text, /image\.size" inválido/);
  assert.match(text, /image\.place" inválido/);
  assert.match(text, /image\.tint" inválido/);
  assert.match(text, /image\.cor" inválido: chave desconhecida/);
  assert.equal(r.config.start.background.color, '');
  assert.equal(r.config.start.background.gradient, '');
  assert.equal(r.config.start.background.image.size, '40%');
  assert.equal(r.config.start.background.image.place, 'center');
  assert.match(lua('k.start { background = { image = { size = "10%" } } }').warnings[0], /file/);
  assert.equal(lua('k.start { background = { image = false } }').config.start.background.image, false);
  assert.match(lua('k.start { bakground = {} }').warnings[0], /quis dizer "background"/);
});

test('valores do tema não escapam do CSS da página gerada', () => {
  const evil = { ...THEME, fg: '#fff;}</style><script>alert(1)</script>', font: 'x"}</style>' };
  const html = renderStart({ start: DEFAULTS.start, theme: evil, searchTemplate: 'https://s.test/?q=%s' });
  assert.doesNotMatch(html, /<script>alert/);
  assert.equal((html.match(/<\/style>/g) ?? []).length, 1);
});

test('busca desligada: sem campo; enabled = false é lido da config', () => {
  assert.doesNotMatch(render({ ...DEFAULTS.start, search: false }), /id="search"/);
  assert.equal(lua('k.start { enabled = false }').config.start.enabled, false);
});

test('página inicial: color_scheme nativo, data-scheme livre e vars do tema', () => {
  const html = renderStart({ start: DEFAULTS.start, theme: { ...THEME, color_scheme: 'light', scheme: 'dia', vars: { destaque: '#b5651d' } }, searchTemplate: 'https://s.test/?q=%s' });
  assert.match(html, /data-scheme="dia"/);
  assert.match(html, /color-scheme: light/);
  assert.match(html, /--destaque: #b5651d;/);
});
