'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createResolver } = require('../src/url');
const { DEFAULTS, resolve } = require('../src/config');

const toUrl = createResolver(DEFAULTS.search);

test('esquema passa como está; domínio vira https; rede local vira http', () => {
  assert.equal(toUrl('https://a.com/x'), 'https://a.com/x');
  assert.equal(toUrl('about:blank'), 'about:blank');
  assert.equal(toUrl('example.com/p?q=1'), 'https://example.com/p?q=1');
  assert.equal(toUrl('localhost:3000'), 'http://localhost:3000');
  assert.equal(toUrl('192.168.1.50:3000/ui'), 'http://192.168.1.50:3000/ui');
  assert.equal(toUrl('10.0.0.2'), 'http://10.0.0.2');
});

test('texto comum usa o mecanismo padrão, com a consulta codificada', () => {
  assert.equal(toUrl('gatos fofos'), 'https://duckduckgo.com/?q=gatos+fofos');
  assert.equal(toUrl('a&b=c d'), 'https://duckduckgo.com/?q=a%26b%3Dc+d');
  assert.equal(toUrl('$& injeção'), 'https://duckduckgo.com/?q=%24%26+inje%C3%A7%C3%A3o');
});

test('palavra-atalho usa o mecanismo dela; sozinha ou desconhecida cai na busca padrão', () => {
  assert.equal(toUrl('yt lofi hip hop'), 'https://www.youtube.com/results?search_query=lofi+hip+hop');
  assert.equal(toUrl('w Linux'), 'https://pt.wikipedia.org/w/index.php?search=Linux');
  assert.equal(toUrl('yt'), 'https://duckduckgo.com/?q=yt');
  assert.equal(toUrl('xyz coisa'), 'https://duckduckgo.com/?q=xyz+coisa');
});

test('config: acrescenta, troca o padrão, remove com false; inválido é ignorado com aviso', () => {
  const ok = resolve({ search: { default: 'br', engines: { br: 'https://search.brave.com/search?q=%s', g: false } } });
  assert.deepEqual(ok.warnings, []);
  assert.equal(ok.config.search.engines.g, undefined);
  assert.equal(createResolver(ok.config.search)('oi'), 'https://search.brave.com/search?q=oi');
  const bad = resolve({ search: { default: 'nope', engines: { x: 'sem-esquema/%s', y: 'https://y.com/?q=', z: 5 } } });
  assert.equal(bad.warnings.length, 4);
  assert.equal(bad.config.search.default, 'ddg');
  assert.deepEqual(Object.keys(bad.config.search.engines).sort(), ['ddg', 'g', 'w', 'yt']);
});

test('config: sem nenhum mecanismo válido, restaura os padrões', () => {
  const r = resolve({ search: { engines: { ddg: false, g: false, yt: false, w: false } } });
  assert.deepEqual(Object.keys(r.config.search.engines).sort(), ['ddg', 'g', 'w', 'yt']);
});
