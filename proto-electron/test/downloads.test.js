'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { safeName, uniquePath, resolveDir } = require('../src/downloads');
const { DEFAULTS, resolve } = require('../src/config');

test('safeName: só o último trecho, sem barras nem pontos iniciais, nunca vazio', () => {
  assert.equal(safeName('relatorio.pdf'), 'relatorio.pdf');
  assert.equal(safeName('../../etc/passwd'), 'passwd');
  assert.equal(safeName('a\\b\\c.txt'), 'c.txt');
  assert.equal(safeName('.bashrc'), 'bashrc');
  assert.equal(safeName('..'), 'download');
  assert.equal(safeName(''), 'download');
  assert.equal(safeName('x\u0000y.bin'), 'xy.bin');
});

test('uniquePath: não sobrescreve; numera antes da extensão', () => {
  const taken = new Set(['/d/a.zip', '/d/a (1).zip', '/d/semext']);
  const exists = (p) => taken.has(p);
  assert.equal(uniquePath('/d', 'b.zip', exists), '/d/b.zip');
  assert.equal(uniquePath('/d', 'a.zip', exists), '/d/a (2).zip');
  assert.equal(uniquePath('/d', 'semext', exists), '/d/semext (1)');
  assert.equal(uniquePath('/d', '../../a.zip', exists), '/d/a (2).zip');
});

test('resolveDir: ~ vira o home; vazio vale a pasta do sistema', () => {
  assert.equal(resolveDir('~/Baixados', '/home/x', '/sys'), '/home/x/Baixados');
  assert.equal(resolveDir('~', '/home/x', '/sys'), '/home/x');
  assert.equal(resolveDir('/abs', '/home/x', '/sys'), '/abs');
  assert.equal(resolveDir('  ', '/home/x', '/sys'), '/sys');
});

test('config: tempos dos avisos e dir validados; padrão é 1 segundo', () => {
  assert.equal(DEFAULTS.notification.types.download.timeout_ms, 1000);
  assert.equal(DEFAULTS.notification.types.alert.timeout_ms, 1000);
  assert.equal(resolve({ notification: { types: { download: { timeout_ms: 0 }, alert: { timeout_ms: 0 } } } }).config.notification.types.alert.timeout_ms, 0);
  const bad = resolve({ notification: { types: { download: { timeout_ms: -1 }, alert: { timeout_ms: 'x' } } }, downloads: { dir: 5 } });
  assert.equal(bad.config.notification.types.download.timeout_ms, 1000);
  assert.equal(bad.config.notification.types.alert.timeout_ms, 1000);
  assert.equal(bad.warnings.length, 3);
});
