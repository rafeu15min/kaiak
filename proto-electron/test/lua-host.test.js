'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLuaHost } = require('../src/lua-host');

const run = (src, opts = {}) => {
  const host = createLuaHost({ configTimeoutMs: 300, callTimeoutMs: 100, ...opts });
  const error = host.run(src, 'kaiak.lua');
  return { host, error };
};

test('k.theme/k.layout/k.timing viram dados; k.bind guarda ação, função e false', () => {
  const { host, error } = run(`
    k.theme { accent = "#ff0000" }
    k.layout { rail = { size = 60 }, bar = { size = 30 } }
    k.timing { hover_delay_ms = 10 }
    k.bind("ctrl+t", "new_tab")
    k.bind("f5", false)
    k.bind("ctrl+x", function() end)
  `);
  assert.equal(error, null);
  assert.equal(host.data.theme.accent, '#ff0000');
  assert.deepEqual(host.data.layout, [{ id: 'rail', spec: { size: 60 } }, { id: 'bar', spec: { size: 30 } }]);
  assert.equal(host.data.timing.hover_delay_ms, 10);
  assert.equal(host.data.keys['ctrl+t'], 'new_tab');
  assert.equal(host.data.keys.f5, false);
  assert.equal(typeof host.data.keys['ctrl+x'], 'function');
  host.close();
});

test('erro de sintaxe e de execução trazem arquivo:linha', () => {
  assert.match(run('k.theme {').error, /^kaiak\.lua:\d+:/);
  assert.match(run('\n\nerror("boom")').error, /^kaiak\.lua:3: boom/);
});

test('laço infinito é abortado no prazo', () => {
  const t0 = Date.now();
  const { error } = run('while true do end');
  assert.match(error, /tempo esgotado/);
  assert.ok(Date.now() - t0 < 1500);
});

test('argumento inválido gera erro claro', () => {
  assert.match(run('k.theme(42)').error, /k\.theme espera uma tabela/);
  assert.match(run('k.bind("a", 1)').error, /k\.bind/);
});

test('sandbox: sem io, debug e sem os.execute', () => {
  const { host, error } = run('k.theme { font = tostring(io) .. "|" .. tostring(debug) .. "|" .. tostring(os.execute) }');
  assert.equal(error, null);
  assert.equal(host.data.theme.font, 'nil|nil|nil');
  host.close();
});

test('função registrada por k.on roda no evento e recebe argumentos; erro dela vai para onError', () => {
  const errors = [];
  const { host } = run(`
    k.on("go", function(url) k.tabs.open(url) end)
    k.on("bad", function() error("falhou") end)
  `, { onError: (m) => errors.push(m) });
  const opened = [];
  host.attach({ openTab: (u) => opened.push(u), runAction() {} });
  host.emit('go', 'https://example.org');
  host.emit('bad');
  assert.deepEqual(opened, ['https://example.org']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /falhou/);
  host.close();
});

test('k.tabs.open durante a configuração dá erro (ainda sem janela)', () => {
  assert.match(run('k.tabs.open("x")').error, /depois da partida/);
});

test('callback com laço infinito é abortado e o host continua vivo', () => {
  const errors = [];
  const { host } = run('k.on("loop", function() while true do end end)', { onError: (m) => errors.push(m) });
  host.emit('loop');
  assert.match(errors[0], /tempo esgotado/);
  host.emit('loop');
  assert.equal(errors.length, 2);
  host.close();
});

test('release fecha a VM só quando não há funções registradas', () => {
  const a = run('k.theme { bg = "#000" }').host;
  a.release();
  const b = run('k.on("start", function() end)').host;
  b.release();
  const seen = [];
  b.attach({ openTab() {}, runAction() {} });
  assert.equal(b.hasCallbacks, true);
  assert.doesNotThrow(() => b.emit('start'));
  b.close();
  assert.equal(seen.length, 0);
});

test('require lê arquivos da pasta da config', () => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-'));
  fs.writeFileSync(path.join(dir, 'meu_tema.lua'), 'return { accent = "#abcdef" }');
  const { host, error } = run('k.theme(require("meu_tema"))', { requireDir: dir });
  assert.equal(error, null);
  assert.equal(host.data.theme.accent, '#abcdef');
  host.close();
  fs.rmSync(dir, { recursive: true });
});

// A ordem de leitura do kaiak.lua é a hierarquia da config (ex.: ordem dos slots do layout). O Lua (PUC) não
// garante ordem em tabelas com chaves; o fengari guarda a de inserção. Este teste existe para uma troca de
// versão ou de motor não quebrar isso em silêncio.
test('tabela com chaves chega ao JS na ordem em que foi escrita no .lua', () => {
  const orders = [
    ['zeta', 'alpha', 'mid', 'beta'],
    ['dock', 'bar', 'rail'],
    ['painel_b', 'painel_a', 'rail', 'bar', 'dock', 'lateral', 'm', 'a', 'z', 'b'],
  ];
  for (const ids of orders) {
    const { host, error } = run(`k.notification.surface { ${ids.map((id) => `${id} = { place = "top" }`).join(', ')} }`);
    assert.equal(error, null);
    assert.deepEqual(Object.keys(host.data.notification.surfaces), ids);
    host.close();
  }
});

test('chamadas separadas também preservam a ordem do arquivo (uma chamada por item)', () => {
  const { host } = run(`
    k.notification.surface("c", { place = "top" })
    k.notification.surface("a", { place = "top" })
    k.notification.surface("b", { place = "top" })
    k.notification.surface("c", { style = "card" })
  `);
  assert.deepEqual(Object.keys(host.data.notification.surfaces), ['c', 'a', 'b']);
  assert.equal(host.data.notification.surfaces.c.style, 'card', 'redeclarar mescla no lugar da 1ª leitura');
  host.close();
});

test('syntaxError: true só quando o arquivo não compila', () => {
  const bad = run('k.theme {');
  assert.equal(bad.host.syntaxError, true);
  const runtime = run('local x = nil\nx()');
  assert.ok(runtime.error);
  assert.equal(runtime.host.syntaxError, false);
  const good = run('k.theme { accent = "#fff" }');
  assert.equal(good.host.syntaxError, false);
  [bad, runtime, good].forEach((r) => r.host.close());
});
