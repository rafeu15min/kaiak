'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../src/user-config');
const { DEFAULTS } = require('../src/config');

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-cfg-'));
  const file = path.join(root, 'cfg', 'kaiak.lua');
  const opts = { configFile: file, stateDir: path.join(root, 'state') };
  const write = (src) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, src); };
  return { root, file, opts, write, lastGood: path.join(root, 'state', 'last-good', 'kaiak.lua') };
}

test('sem arquivo: padrão, grava o modelo comentado e não gera erro', () => {
  const s = sandbox();
  const r = loadConfig(s.opts);
  assert.deepEqual(r.config, DEFAULTS);
  assert.deepEqual(r.errors, []);
  assert.ok(fs.existsSync(s.file));
  // o modelo gravado carrega sem erro e sem mudar nada
  const again = loadConfig(s.opts);
  assert.deepEqual(again.errors, []);
  assert.deepEqual(again.config, DEFAULTS);
  again.host?.close();
});

test('config boa vale, e commit() guarda a cópia estável', () => {
  const s = sandbox();
  s.write('k.theme { accent = "#111111" }');
  const r = loadConfig(s.opts);
  assert.equal(r.source, 'user');
  assert.equal(r.config.theme.accent, '#111111');
  assert.equal(fs.existsSync(s.lastGood), false);
  r.commit();
  assert.equal(fs.readFileSync(s.lastGood, 'utf8'), 'k.theme { accent = "#111111" }');
  r.host.close();
});

test('config quebrada: abre com a última estável e aponta o erro', () => {
  const s = sandbox();
  s.write('k.theme { accent = "#111111" }');
  loadConfig(s.opts).commit();
  s.write('k.theme {\nbg = ');
  const r = loadConfig(s.opts);
  assert.equal(r.source, 'last-good');
  assert.equal(r.config.theme.accent, '#111111');
  assert.equal(r.errors[0].level, 'error');
  assert.match(r.errors[0].text, /kaiak\.lua:\d+:/);
  assert.match(r.errors[1].text, /última configuração estável/);
  assert.equal(fs.readFileSync(s.file, 'utf8'), 'k.theme {\nbg = ', 'o arquivo do usuário não é alterado');
  r.host?.close();
});

test('config quebrada sem cópia estável: abre com o padrão', () => {
  const s = sandbox();
  s.write('error("x")');
  const r = loadConfig(s.opts);
  assert.equal(r.source, 'default');
  assert.deepEqual(r.config, DEFAULTS);
  assert.match(r.errors[1].text, /padrão/);
});

test('laço infinito na config não trava a partida', () => {
  const s = sandbox();
  s.write('while true do end');
  const t0 = Date.now();
  const r = loadConfig(s.opts);
  assert.match(r.errors[0].text, /tempo esgotado/);
  assert.ok(Date.now() - t0 < 2000);
});

test('valor inválido vira aviso (não erro) e usa o padrão naquele campo', () => {
  const s = sandbox();
  s.write('k.timing { hover_delay_ms = -1 }');
  const r = loadConfig(s.opts);
  assert.equal(r.config.timing.hover_delay_ms, DEFAULTS.timing.hover_delay_ms);
  assert.equal(r.errors[0].level, 'warning');
  r.host?.close();
});

test('--safe ignora o arquivo', () => {
  const s = sandbox();
  s.write('error("x")');
  const r = loadConfig({ ...s.opts, safe: true });
  assert.equal(r.source, 'safe');
  assert.deepEqual(r.errors, []);
});

// Só o erro de SINTAXE é fixo na tela (pinned); erro de execução e de tempo se dispensam.
test('erro de sintaxe vem pinned; erro de execução e laço infinito não', () => {
  const syntax = sandbox();
  syntax.write('k.theme {');
  const a = loadConfig(syntax.opts);
  assert.equal(a.errors[0].level, 'error');
  assert.equal(a.errors[0].pinned, true, 'não compila: sintaxe');
  assert.equal(a.errors[1].pinned, false, 'a nota "abrindo com ..." é dispensável');

  const runtime = sandbox();
  runtime.write('local x = nil\nx()');
  const b = loadConfig(runtime.opts);
  assert.equal(b.errors[0].level, 'error');
  assert.equal(b.errors[0].pinned, false, 'compila e quebra ao rodar: execução');

  const loop = sandbox();
  loop.write('while true do end');
  assert.equal(loadConfig(loop.opts).errors[0].pinned, false, 'tempo esgotado também é execução');

  const warn = sandbox();
  warn.write('k.theme { acent = "#fff" }');
  const c = loadConfig(warn.opts);
  assert.equal(c.errors[0].level, 'warning');
  assert.equal(c.errors[0].pinned, false);
  c.host?.close();
});
