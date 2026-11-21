'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, resolve } = require('../src/config');

test('sem config do usuário vale o padrão, sem avisos', () => {
  const { config, warnings } = resolve();
  assert.deepEqual(config, DEFAULTS);
  assert.deepEqual(warnings, []);
});

test('config do usuário sobrepõe só o que definiu', () => {
  const { config } = resolve({ layout: { rail: { size: 60 } }, theme: { accent: '#ff0000' } });
  assert.equal(config.layout.rail.size, 60);
  assert.equal(config.layout.rail.expand, DEFAULTS.layout.rail.expand);
  assert.equal(config.theme.accent, '#ff0000');
  assert.equal(config.theme.bg, DEFAULTS.theme.bg);
});

test('número fora da faixa volta ao padrão e avisa', () => {
  const { config, warnings } = resolve({ timing: { hover_delay_ms: -5 }, layout: { bar: { size: 'alta' } } });
  assert.equal(config.timing.hover_delay_ms, DEFAULTS.timing.hover_delay_ms);
  assert.equal(config.layout.bar.size, DEFAULTS.layout.bar.size);
  assert.equal(warnings.length, 2);
});

test('chave desconhecida é ignorada com aviso; tema inválido volta ao padrão', () => {
  const { config, warnings } = resolve({ cor: 1, theme: { bg: 42 } });
  assert.equal(config.theme.bg, DEFAULTS.theme.bg);
  assert.equal(warnings.length, 2);
});

test('a config do usuário não altera o padrão compartilhado', () => {
  resolve({ layout: { rail: { size: 99 } } });
  assert.equal(DEFAULTS.layout.rail.size, 42);
});

test('tema da aba privada: padrão completo, editável e validado', () => {
  assert.equal(DEFAULTS.theme.private_label, 'Privada');
  const ok = resolve({ theme: { private: '#ff5555', private_bg: '#2a1215', private_label: 'Anônima' } });
  assert.deepEqual(ok.warnings, []);
  assert.equal(ok.config.theme.private_label, 'Anônima');
  const bad = resolve({ theme: { private_label: 5 } });
  assert.equal(bad.config.theme.private_label, 'Privada');
  assert.equal(bad.warnings.length, 1);
});

test('cor de fundo própria da aba privada na trilha', () => {
  assert.equal(DEFAULTS.theme.private_tab, '#2c2740');
  assert.equal(resolve({ theme: { private_tab: '#401020' } }).config.theme.private_tab, '#401020');
  assert.equal(resolve({ theme: { private_tab: 1 } }).warnings.length, 1);
});

test('security.cert_exceptions: lista de textos, vazia por padrão; inválida avisa e volta ao padrão', () => {
  assert.deepEqual(resolve().config.security.cert_exceptions, []);
  assert.deepEqual(resolve({ security: { cert_exceptions: ['a.test'] } }).config.security.cert_exceptions, ['a.test']);
  const bad = resolve({ security: { cert_exceptions: 'a.test' } });
  assert.match(bad.warnings[0], /"security\.cert_exceptions" inválido/);
  assert.deepEqual(bad.config.security.cert_exceptions, []);
});
