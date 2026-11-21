'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildKeymap, normalize } = require('../src/keymap');

const input = (key, mods = {}) => ({ type: 'keyDown', key, control: false, alt: false, shift: false, meta: false, ...mods });

test('a mesma combinação casa com qualquer grafia', () => {
  assert.equal(normalize('Shift+Ctrl+Tab'), 'ctrl+shift+tab');
  assert.equal(normalize('alt+Left'), 'alt+arrowleft');
  assert.equal(normalize('Control+L'), 'ctrl+l');
});

test('atalho por nome de ação dispara a ação', () => {
  let called = 0;
  const km = buildKeymap({ 'ctrl+t': 'new_tab' }, { new_tab: () => called++ });
  assert.equal(km.handle(input('t', { control: true })), true);
  assert.equal(called, 1);
});

test('atalho por função do usuário dispara a função', () => {
  let called = 0;
  const km = buildKeymap({ 'ctrl+shift+d': () => called++ }, {});
  assert.equal(km.handle(input('D', { control: true, shift: true })), true);
  assert.equal(called, 1);
});

test('false desfaz o atalho; tecla sem atalho não é tratada', () => {
  const km = buildKeymap({ 'ctrl+t': false }, { new_tab: () => assert.fail('não deveria') });
  assert.equal(km.handle(input('t', { control: true })), false);
  assert.equal(km.handle(input('x')), false);
});

test('ação desconhecida gera aviso e não quebra', () => {
  const km = buildKeymap({ 'ctrl+t': 'inexistente' }, {});
  assert.equal(km.warnings.length, 1);
  assert.equal(km.handle(input('t', { control: true })), false);
});

test('só keyDown é tratado', () => {
  const km = buildKeymap({ 'ctrl+t': 'a' }, { a: () => assert.fail('não deveria') });
  assert.equal(km.handle({ ...input('t', { control: true }), type: 'keyUp' }), false);
});

test('o padrão tem teclas com ação existente', () => {
  const { DEFAULTS } = require('../src/config');
  const { createActions } = require('../src/actions');
  const actions = createActions({ tabs: {}, focusAddress() {} });
  const km = buildKeymap(DEFAULTS.keys, actions);
  assert.deepEqual(km.warnings, []);
});
