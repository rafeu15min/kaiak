'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolve } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');
const { buildExec, DEFAULTS } = require('../src/exec-config');
const { createExecRunner, MAX_RUNNING } = require('../src/exec-runner');

const ops = (obj) => Object.entries(obj).map(([id, spec]) => ({ id, spec }));
const build = (obj) => { const warnings = []; const specs = buildExec(ops(obj), warnings); return { specs, warnings }; };
const lua = (source) => { const h = createLuaHost({}); const error = h.run(source, 'kaiak.lua'); const r = resolve(h.data); return { ...r, error, host: h }; };
const waitFor = (fn, ms = 4000) => new Promise((resolveWait, reject) => {
  const start = Date.now();
  const tick = () => (fn() ? resolveWait() : Date.now() - start > ms ? reject(new Error('timeout do teste')) : setTimeout(tick, 15));
  tick();
});

// ---- validação (pura) ------------------------------------------------------------------------
test('exec-config: padrões, args em texto, env em texto; ordem de declaração', () => {
  const { specs, warnings } = build({ b: { cmd: 'echo', args: ['a', 2] }, a: { cmd: 'ls', env: { N: 3 } } });
  assert.deepEqual(warnings, []);
  assert.deepEqual(Object.keys(specs), ['b', 'a']);
  assert.deepEqual(specs.b, { ...DEFAULTS, cmd: 'echo', args: ['a', '2'] });
  assert.deepEqual(specs.a.env, { N: '3' });
});

test('exec-config: o que é inválido avisa com caminho completo; cmd ruim ignora o comando; o resto volta ao padrão', () => {
  const { specs, warnings } = build({
    sem_cmd: { args: ['x'] }, id_ruim: {}, cmd_vazio: { cmd: '' },
    ok: { cmd: 'x', args: 'nao-lista', timeout_ms: 5, shell: 'sim', output: 'tudo', max_output_kb: 0, cwd: 3, env: { 'A B': 1 }, stdin: 5, on_exit: 'f', timeut_ms: 1 },
    shell_args: { cmd: 'echo $A', shell: true, args: ['x'] },
  });
  const text = warnings.join('\n');
  for (const p of [/exec\.sem_cmd" incompleto \(falta: cmd\)/, /exec\.cmd_vazio\.cmd" inválido/, /exec\.ok\.args" inválido/, /exec\.ok\.timeout_ms/, /exec\.ok\.shell/, /exec\.ok\.output/,
    /exec\.ok\.max_output_kb/, /exec\.ok\.cwd/, /exec\.ok\.env/, /exec\.ok\.stdin/, /exec\.ok\.on_exit/, /quis dizer "timeout_ms"/, /exec\.shell_args.*args" é ignorado|"args" é ignorado/]) assert.match(text, p);
  assert.deepEqual(Object.keys(specs).sort(), ['ok', 'shell_args']);
  assert.deepEqual({ t: specs.ok.timeout_ms, s: specs.ok.shell, o: specs.ok.output, a: specs.ok.args }, { t: 30000, s: false, o: 'none', a: [] });
  assert.deepEqual(specs.shell_args.args, []);
  assert.match(text, /exec "id_ruim"|id_ruim/);
});

test('exec-config: false remove; declarar de novo mescla; args e env substituem em vez de somar', () => {
  const warnings = [];
  const specs = buildExec([
    { id: 'a', spec: { cmd: 'x', args: ['1', '2'], timeout_ms: 500 } }, { id: 'b', spec: { cmd: 'y' } },
    { id: 'a', spec: { args: ['9'] } }, { id: 'b', spec: false },
  ], warnings);
  assert.deepEqual(warnings, []);
  assert.deepEqual(Object.keys(specs), ['a']);
  assert.deepEqual([specs.a.args, specs.a.timeout_ms], [['9'], 500]);
});

test('config: k.exec vem do .lua; chaves e ação de botão { exec } validadas contra os comandos existentes', () => {
  const ok = lua(`k.exec("eco", { cmd = "echo", args = { "oi" } })
    k.layout("rail", { content = "tabs", place = "left", size = 42 })
    k.layout("bar", { content = "buttons", place = "right", size = 40 })
    k.button("b1", { slot = "bar", icon = "E", action = { exec = "eco", args = { "extra" } } })`);
  assert.deepEqual(ok.warnings, []);
  assert.equal(ok.config.exec.eco.cmd, 'echo');
  assert.deepEqual(ok.config.buttons.b1.action, { exec: 'eco', args: ['extra'] });
  const bad = lua(`k.layout("bar", { content = "buttons", place = "right", size = 40 })
    k.button("b1", { slot = "bar", icon = "E", action = { exec = "fantasma" } })
    k.button("b2", { slot = "bar", icon = "E", action = { exec = "eco", args = "x" } })`);
  assert.match(bad.warnings.join('\n'), /comando "fantasma" não existe/);
  assert.match(bad.warnings.join('\n'), /args = \{ "extra" \}/);
  assert.deepEqual(Object.keys(bad.config.buttons), []);
});

test('lua: h:run e k.exec.run chamam o runtime; id desconhecido vira erro com a linha do .lua; antes da partida avisa', () => {
  const calls = [];
  const r = lua(`local h = k.exec("eco", { cmd = "echo" })
    k.bind("f1", function() h:run({ "a", "b" }) end)
    k.bind("f2", function() k.exec.run("eco") end)
    k.bind("f3", function() k.exec.run("nao_existe") end)`);
  assert.equal(r.error, null);
  r.host.attach({ runExec: (id, args) => { calls.push([id, args]); return id === 'nao_existe' ? 'o comando "nao_existe" não existe' : null; } });
  r.config.keys.f1(); r.config.keys.f2();
  assert.deepEqual(calls, [['eco', ['a', 'b']], ['eco', []]]);
  const errors = [];
  const h2 = createLuaHost({ onError: (e) => errors.push(e) });
  h2.run('k.bind("f3", function() k.exec.run("nao_existe") end)', 'kaiak.lua');
  h2.attach({ runExec: () => 'o comando "nao_existe" não existe' });
  resolve(h2.data).config.keys.f3();
  assert.equal(errors.length, 1);
  assert.match(errors[0], /k\.exec: o comando "nao_existe" não existe/);
  const early = lua('k.exec.run("eco")');
  assert.match(early.error, /só funciona depois da partida/);
});

// ---- execução de verdade (spawn real) --------------------------------------------------------
const make = (specsIn, extra = {}) => {
  const notes = [];
  const exits = [];
  const lines = [];
  const warnings = [];
  const raw = Object.fromEntries(Object.entries(specsIn).map(([id, s]) => [id, { ...s, on_exit: s.on_exit === true ? (c, t) => exits.push([id, c, t]) : s.on_exit, on_output: s.on_output === true ? (l) => lines.push(l) : s.on_output }]));
  const specs = buildExec(ops(raw), warnings);
  assert.deepEqual(warnings, []);
  const runner = createExecRunner({ specs, notify: (n) => notes.push(n), home: os.homedir(), ...extra });
  return { runner, notes, exits, lines };
};

test('runner: roda sem shell, junta args, devolve código e saída (stdout + stderr), on_output por linha', async () => {
  const { runner, exits, lines } = make({ eco: { cmd: 'sh', args: ['-c', 'echo "um"; echo "dois"; echo "erro" >&2; exit 0', 'x'], on_exit: true, on_output: true } });
  assert.equal(runner.run('eco'), null);
  await waitFor(() => exits.length === 1);
  assert.equal(exits[0][1], 0);
  assert.deepEqual(lines, ['um', 'dois']);
  assert.match(exits[0][2], /um\ndois\n/);
  assert.match(exits[0][2], /erro/);
  assert.equal(runner.runningCount(), 0);
});

test('runner: SEM shell o texto não é interpretado (nada de $VAR, ; ou |); args extras vão no fim; shell = true interpreta', async () => {
  const { runner, exits } = make({
    puro: { cmd: 'echo', args: ['$HOME; echo injetado | cat'], on_exit: true },
    extra: { cmd: 'echo', args: ['a'], on_exit: true },
    sh: { cmd: 'echo $((1+2))', shell: true, on_exit: true },
  });
  runner.run('puro'); runner.run('extra', ['b', 7]); runner.run('sh');
  await waitFor(() => exits.length === 3);
  const by = Object.fromEntries(exits.map(([id, , t]) => [id, t.trim()]));
  assert.equal(by.puro, '$HOME; echo injetado | cat');
  assert.equal(by.extra, 'a b 7');
  assert.equal(by.sh, '3');
});

test('runner: env, cwd (com ~), stdin', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-exec-'));
  const { runner, exits } = make({
    env: { cmd: 'sh', args: ['-c', 'echo "$MEU_VALOR"'], env: { MEU_VALOR: 'ola' }, on_exit: true },
    cwd: { cmd: 'pwd', cwd: dir, on_exit: true },
    home: { cmd: 'pwd', cwd: '~', on_exit: true },
    stdin: { cmd: 'cat', stdin: 'vindo do stdin', on_exit: true },
  });
  ['env', 'cwd', 'home', 'stdin'].forEach((id) => runner.run(id));
  await waitFor(() => exits.length === 4);
  const by = Object.fromEntries(exits.map(([id, , t]) => [id, t.trim()]));
  assert.deepEqual(by, { env: 'ola', cwd: fs.realpathSync(dir), home: os.homedir(), stdin: 'vindo do stdin' });
});

test('runner: código diferente de zero e comando inexistente viram aviso (com output = notify) e on_exit; output = none não avisa sucesso', async () => {
  const { runner, notes, exits } = make({
    falha: { cmd: 'sh', args: ['-c', 'exit 3'], output: 'notify', on_exit: true },
    nada: { cmd: 'nao-existe-kaiak-xyz', output: 'notify', on_exit: true },
    quieto: { cmd: 'echo', args: ['oi'], on_exit: true },
    avisa: { cmd: 'echo', args: ['feito'], output: 'notify', on_exit: true },
  });
  ['falha', 'nada', 'quieto', 'avisa'].forEach((id) => runner.run(id));
  await waitFor(() => exits.length === 4);
  const code = Object.fromEntries(exits.map(([id, c]) => [id, c]));
  assert.deepEqual(code, { falha: 3, nada: -1, quieto: 0, avisa: 0 });
  const texts = notes.map((n) => n.text).sort();
  assert.ok(texts.some((t) => /exec "falha" falhou \(código 3\)/.test(t)), texts.join('|'));
  assert.ok(texts.some((t) => /comando "nao-existe-kaiak-xyz" não encontrado/.test(t)));
  assert.ok(texts.includes('avisa: feito'));
  assert.ok(!texts.some((t) => t.startsWith('quieto')));
});

test('runner: estourou o prazo -> encerrado, on_exit chega, aviso diz o motivo', async () => {
  const { runner, notes, exits } = make({ lento: { cmd: 'sleep', args: ['30'], timeout_ms: 300, timeout_check: false, output: 'notify', on_exit: true } });
  const start = Date.now();
  runner.run('lento');
  await waitFor(() => exits.length === 1);
  assert.ok(Date.now() - start < 3000, 'não esperou os 30 s');
  assert.ok(notes.some((n) => /estourou 300 ms/.test(n.text)));
  assert.equal(runner.runningCount(), 0);
});

test('runner: a saída é limitada por max_output_kb', async () => {
  const { runner, exits } = make({ muito: { cmd: 'sh', args: ['-c', 'head -c 200000 /dev/zero | tr "\\0" "a"'], max_output_kb: 1, on_exit: true } });
  runner.run('muito');
  await waitFor(() => exits.length === 1);
  assert.equal(exits[0][2].length, 1024);
});

test('runner: teto de comandos simultâneos, id desconhecido, args ruins; killAll não deixa órfão', async () => {
  const { runner, exits } = make({ dorme: { cmd: 'sleep', args: ['30'], on_exit: true } });
  for (let i = 0; i < MAX_RUNNING; i++) assert.equal(runner.run('dorme'), null);
  assert.match(runner.run('dorme'), /já há 8 comandos/);
  assert.match(runner.run('nada'), /não existe/);
  assert.match(runner.run('dorme', 'x'), /lista de textos|já há/);
  assert.equal(runner.runningCount(), MAX_RUNNING);
  runner.killAll();
  await waitFor(() => exits.length === MAX_RUNNING);
  assert.equal(runner.runningCount(), 0);
});

test('runner: erro dentro do callback do .lua não derruba o fluxo', async () => {
  const done = [];
  const { runner } = make({ x: { cmd: 'echo', on_output: () => { throw new Error('quebrou'); }, on_exit: (c) => { done.push(c); throw new Error('de novo'); } } });
  runner.run('x');
  await waitFor(() => done.length === 1);
  assert.deepEqual(done, [0]);
});

test('runner: caractere UTF-8 partido entre dois pedaços da saída chega inteiro ao on_output', async () => {
  const { EventEmitter } = require('node:events');
  const { PassThrough } = require('node:stream');
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill() {} });
  const lines = [];
  const specs = buildExec(ops({ u: { cmd: 'x', on_output: (l) => lines.push(l) } }), []);
  const runner = createExecRunner({ specs, spawn: () => child });
  runner.run('u');
  const bytes = Buffer.from('ção-日本-😀\nsegunda\nfim-sem-quebra');
  for (let i = 0; i < bytes.length; i += 1) child.stdout.write(bytes.subarray(i, i + 1)); // 1 byte por pedaço: o pior caso
  child.stdout.end();
  await waitFor(() => lines.length === 3);
  assert.deepEqual(lines, ['ção-日本-😀', 'segunda', 'fim-sem-quebra']);
  child.emit('close', 0, null);
});

test('runner: "~/arquivo.sh" no cmd vira o home; script sem chmod +x avisa EACCES; "sh script" roda sem o chmod; ~ nos args fica literal', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-home-'));
  fs.mkdirSync(path.join(home, 'bin'));
  fs.writeFileSync(path.join(home, 'bin/ok.sh'), '#!/bin/sh\necho "ok $*"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(home, 'bin/semx.sh'), '#!/bin/sh\necho "sem x"\n', { mode: 0o644 });
  const exits = []; const notes = [];
  const specs = buildExec(ops({
    til: { cmd: '~/bin/ok.sh', args: ['~/literal'], on_exit: (c, t) => exits.push(['til', c, t.trim()]) },
    semx: { cmd: '~/bin/semx.sh', on_exit: (c) => exits.push(['semx', c]) },
    viash: { cmd: 'sh', args: [path.join(home, 'bin/semx.sh')], on_exit: (c, t) => exits.push(['viash', c, t.trim()]) },
  }), []);
  const runner = createExecRunner({ specs, home, notify: (n) => notes.push(n.text) });
  ['til', 'semx', 'viash'].forEach((id) => runner.run(id));
  await waitFor(() => exits.length === 3);
  const by = Object.fromEntries(exits.map(([id, ...rest]) => [id, rest]));
  assert.deepEqual(by.til, [0, 'ok ~/literal']);
  assert.deepEqual(by.semx, [-1]);
  assert.deepEqual(by.viash, [0, 'sem x']);
  assert.ok(notes.some((t) => /EACCES/.test(t)));
});
