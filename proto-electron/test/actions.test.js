'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createActions, ACTION_NAMES } = require('../src/actions');

test('ACTION_NAMES é exatamente o que createActions implementa', () => {
  const actions = createActions({ tabs: {}, focusAddress: () => {} });
  assert.deepEqual([...ACTION_NAMES].sort(), Object.keys(actions).sort());
  Object.values(actions).forEach((fn) => assert.equal(typeof fn, 'function'));
});
