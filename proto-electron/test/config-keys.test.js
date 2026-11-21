'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { unknownKeys, suggest } = require('../src/config-keys');
const { resolve, DEFAULTS } = require('../src/config');

test('suggest: erro de digitação aponta a chave certa; coisa sem parecido não sugere nada', () => {
  assert.equal(suggest('acent', ['bg', 'accent', 'fg']), 'accent');
  assert.equal(suggest('hover_delay', ['hover_delay_ms', 'animation_ms']), 'hover_delay_ms');
  assert.equal(suggest('xyzxyzxyz', ['bg', 'accent']), null);
});

test('unknownKeys: caminho completo, sugestão, aninhado, e caminhos abertos não são conferidos', () => {
  const shape = { theme: { accent: 1 }, search: { engines: { ddg: 1 } }, keys: {} };
  const open = new Set(['search.engines']);
  assert.deepEqual(unknownKeys({ theme: { acent: 'x' } }, shape, open), ['chave desconhecida "theme.acent" ignorada (quis dizer "accent"?)']);
  assert.deepEqual(unknownKeys({ search: { engines: { meu: 'x' } } }, shape, open), []);
  assert.deepEqual(unknownKeys({ themes: {} }, shape, open), ['chave desconhecida "themes" ignorada (quis dizer "theme"?)']);
  assert.deepEqual(unknownKeys({ theme: 'texto' }, shape, open), []);
});

test('resolve: chave desconhecida em QUALQUER nível avisa; o padrão sozinho não gera aviso nenhum', () => {
  assert.deepEqual(resolve({}).warnings, []);
  assert.deepEqual(resolve(DEFAULTS).warnings, []);
  const r = resolve({ timing: { hover_delay: 5 }, security: { https_onlyy: false }, notification: { surfaces: { toast: { plce: 'top' } } } });
  assert.equal(r.warnings.length, 3);
  assert.ok(r.warnings.some((w) => w.includes('"timing.hover_delay"') && w.includes('hover_delay_ms')));
  assert.ok(r.warnings.some((w) => w.includes('"security.https_onlyy"') && w.includes('https_only')));
  assert.ok(r.warnings.some((w) => w.includes('"notification.surfaces.toast.plce"') && w.includes('place')));
});

test('resolve: teclas (k.bind) e mecanismos de busca têm nomes livres e não geram aviso', () => {
  assert.deepEqual(resolve({ keys: { 'ctrl+x': 'reload' }, search: { engines: { meu: 'https://x.test/?q=%s' } } }).warnings, []);
});
