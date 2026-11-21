'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { resolve } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');
const { buildExec } = require('../src/exec-config');
const { createExecRunner } = require('../src/exec-runner');
const { createSliceQueue } = require('../src/slice-queue');
const { createSampler, parseTicks, parseRss } = require('../src/proc-sampler');

const ops = (obj) => Object.entries(obj).map(([id, spec]) => ({ id, spec }));
const waitFor = (fn, ms = 6000) => new Promise((ok, fail) => {
  const start = Date.now();
  const tick = () => (fn() ? ok() : Date.now() - start > ms ? fail(new Error('timeout do teste')) : setTimeout(tick, 15));
  tick();
});
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const groupAlive = (pid) => { try { process.kill(-pid, 0); return true; } catch { return false; } };

// Runner com spawn real, guardando os pids e os avisos.
const make = (raw, over = {}) => {
  const warnings = [];
  const specs = buildExec(ops(raw), warnings);
  const pids = []; const notes = [];
  const spawn = (...a) => { const child = childProcess.spawn(...a); pids.push(child.pid); return child; };
  const runner = createExecRunner({ specs, spawn, notify: (n) => notes.push(n.text), ...over });
  return { runner, warnings, pids, notes, specs };
};

// ---- validação dos campos novos --------------------------------------------------------------------
test('config: service, shell com caminho, on_error_output, budget, max_cpu, max_cpu_for_s, max_memory_mb', () => {
  const ok = []; const specs = buildExec(ops({ s: { cmd: 'x', service: true, shell: '/bin/bash', on_error_output: () => {}, on_output_budget_ms: 5, max_cpu: '90%', max_cpu_for_s: 20, max_memory_mb: 512 } }), ok);
  assert.deepEqual(ok, []);
  assert.deepEqual([specs.s.service, specs.s.shell, specs.s.on_output_budget_ms, specs.s.max_cpu, specs.s.max_cpu_for_s, specs.s.max_memory_mb], [true, '/bin/bash', 5, '90%', 20, 512]);
  const bad = []; const b = buildExec(ops({ b: { cmd: 'x', service: 'sim', shell: 'bash', on_output_budget_ms: 0, max_cpu: 90, max_cpu_for_s: 0, max_memory_mb: 1, on_error_output: 'f' } }), bad);
  const text = bad.join('\n');
  for (const p of [/b\.service/, /b\.shell.*caminho absoluto de um shell/, /b\.on_output_budget_ms/, /b\.max_cpu"/, /b\.max_cpu_for_s/, /b\.max_memory_mb/, /b\.on_error_output/]) assert.match(text, p);
  assert.deepEqual([b.b.service, b.b.shell, b.b.on_output_budget_ms, b.b.max_cpu_for_s], [false, false, 2, 10]);
  const warn = []; buildExec(ops({ s: { cmd: 'x', service: true, timeout_ms: 500 } }), warn);
  assert.match(warn[0], /com service = true não há prazo; "timeout_ms" é ignorado/);
  for (const v of ['9%', '1700%', '90', 'abc', '5 0%']) { const w = []; buildExec(ops({ c: { cmd: 'x', max_cpu: v } }), w); assert.equal(w.length, 1, v); }
});

// ---- fila fatiada ----------------------------------------------------------------------------------------
test('slice-queue: rodadas com orçamento, cede o laço entre elas, mantém a ordem e avisa quando esvazia', () => {
  let clock = 0; const jobs = []; const seen = [];
  const q = createSliceQueue({ budgetMs: 2, now: () => clock, schedule: (fn) => jobs.push(fn) });
  for (let i = 1; i <= 5; i++) q.push((v) => { seen.push(v); clock += 1; }, i); // cada item "custa" 1 ms
  let idle = 0; q.whenIdle(() => idle++);
  assert.deepEqual(seen, [], 'nada roda antes do laço ceder');
  jobs.shift()();
  assert.deepEqual(seen, [1, 2], 'a 1ª rodada gasta o orçamento de 2 ms');
  assert.equal(idle, 0);
  while (jobs.length) jobs.shift()();
  assert.deepEqual(seen, [1, 2, 3, 4, 5]);
  assert.equal(idle, 1);
  q.whenIdle(() => idle++); assert.equal(idle, 2, 'vazia: chama já');
});

test('slice-queue: teto da fila descarta o excesso e conta', () => {
  const jobs = []; const seen = [];
  const q = createSliceQueue({ budgetMs: 1, cap: 3, now: () => 0, schedule: (fn) => jobs.push(fn) });
  for (let i = 1; i <= 7; i++) q.push((v) => seen.push(v), i);
  jobs.forEach((j) => j());
  assert.deepEqual(seen, [1, 2, 3]);
  assert.equal(q.dropped(), 4);
});

// ---- amostrador de /proc ---------------------------------------------------------------------------------
test('proc-sampler: lê ticks (utime+stime) e VmRSS; processo inexistente = null; soma a árvore', () => {
  assert.equal(parseTicks('123 (nome com ) parênteses) S 1 2 3 4 5 6 7 8 9 10 40 25 0 0'), 65);
  assert.equal(parseRss('Name:\tx\nVmRSS:\t   2048 kB\nThreads:\t1\n'), 2048 * 1024);
  const files = {
    '/proc/10/stat': '10 (a) S 1 1 1 0 0 0 0 0 0 0 100 50 0 0', '/proc/10/task/10/children': '11 12',
    '/proc/11/stat': '11 (b) S 10 1 1 0 0 0 0 0 0 0 10 5 0 0', '/proc/11/task/11/children': '',
    '/proc/12/stat': '12 (c) S 10 1 1 0 0 0 0 0 0 0 1 1 0 0', '/proc/12/task/12/children': '',
    '/proc/10/status': 'VmRSS: 100 kB\n', '/proc/11/status': 'VmRSS: 200 kB\n', '/proc/12/status': 'VmRSS: 300 kB\n',
  };
  const s = createSampler({ readFile: (f) => { if (!(f in files)) throw new Error('ENOENT'); return files[f]; }, exists: () => true });
  if (!s.supported) return; // fora do Linux o amostrador se desliga sozinho
  assert.deepEqual(s.sample(10, true), { ticks: 150 + 15 + 2, rss: 600 * 1024 });
  assert.deepEqual(s.sample(10, false), { ticks: 167, rss: 0 });
  assert.equal(s.sample(99), null);
});

// ---- service: processos de vida longa ----------------------------------------------------------------
test('service: sem prazo, stdin aberto (write), on_output em fatias, running, stop encerra o grupo e on_exit vem depois', async () => {
  const lines = []; const exits = [];
  const { runner, notes, pids } = make({ eco: { cmd: 'cat', service: true, output: 'notify', on_output: (l) => lines.push(l), on_exit: (c, t) => exits.push([c, t]) } });
  assert.equal(runner.run('eco'), null);
  assert.equal(runner.isRunning('eco'), true);
  assert.match(runner.run('eco'), /já está rodando \(service\)/);
  assert.equal(runner.write('eco', 'um\ndois\n'), null);
  await waitFor(() => lines.length === 2);
  assert.deepEqual(lines, ['um', 'dois']);
  assert.equal(runner.write('eco', 'tres\n'), null);
  await waitFor(() => lines.length === 3);
  assert.equal(runner.stop('eco'), true);
  await waitFor(() => exits.length === 1);
  assert.equal(runner.isRunning('eco'), false);
  assert.equal(groupAlive(pids[0]), false, 'o grupo de processos terminou');
  assert.ok(!notes.some((t) => /falhou/.test(t)), 'parar de propósito não é falha');
  assert.equal(runner.stop('eco'), false, 'parar o que não roda devolve false');
  assert.match(runner.write('eco', 'x'), /não está rodando/);
});

test('service: write em comando que não é service recusa; texto obrigatório', async () => {
  const { runner } = make({ s: { cmd: 'cat', service: true }, n: { cmd: 'sleep', args: ['5'] } });
  runner.run('n'); runner.run('s');
  assert.match(runner.write('n', 'x'), /não é um service/);
  assert.match(runner.write('s', 5), /espera um texto/);
  runner.killAll();
  await waitFor(() => runner.runningCount() === 0);
});

test('service: restart reinicia (novo processo) e restart de parado apenas inicia', async () => {
  const exits = [];
  const { runner, pids } = make({ s: { cmd: 'sleep', args: ['30'], service: true, on_exit: (c) => exits.push(c) } });
  assert.equal(runner.restart('s'), null, 'parado: inicia');
  assert.equal(pids.length, 1);
  assert.equal(runner.restart('s'), null);
  await waitFor(() => pids.length === 2 && runner.isRunning('s'));
  assert.equal(exits.length, 1);
  assert.notEqual(pids[0], pids[1]);
  runner.stop('s');
  await waitFor(() => exits.length === 2);
});

test('encerrar derruba os FILHOS também (sh -> yes): nenhum processo órfão depois do prazo', async () => {
  const exits = [];
  const { runner, pids } = make({ g: { cmd: 'sh', args: ['-c', 'yes > /dev/null; echo fim'], timeout_ms: 300, timeout_check: false, on_exit: (c) => exits.push(c) } });
  runner.run('g');
  await waitFor(() => exits.length === 1);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(groupAlive(pids[0]), false, 'o `yes` filho também morreu');
});

test('stderr separado: on_error_output recebe só o stderr; on_output só o stdout; a saída final junta os dois', async () => {
  const out = []; const err = []; const exits = [];
  const { runner } = make({ e: { cmd: 'sh', args: ['-c', 'echo A; echo B >&2; echo C'], on_output: (l) => out.push(l), on_error_output: (l) => err.push(l), on_exit: (c, t) => exits.push(t) } });
  runner.run('e');
  await waitFor(() => exits.length === 1);
  assert.deepEqual([out, err], [['A', 'C'], ['B']]);
  assert.match(exits[0], /A/);
  assert.match(exits[0], /B/);
});

test('shell com caminho: "/bin/bash" expande chaves; shell = true usa o /bin/sh', async () => {
  const exits = [];
  const { runner } = make({ b: { cmd: 'echo {x,y}', shell: '/bin/bash', on_exit: (c, t) => exits.push(t.trim()) } });
  runner.run('b');
  await waitFor(() => exits.length === 1);
  assert.equal(exits[0], 'x y');
});

test('fluxo grande de linhas: entrega fatiada não perde ordem; excesso além do teto é descartado e avisado', async () => {
  const got = []; const exits = [];
  const { runner, notes } = make({ m: { cmd: 'sh', args: ['-c', 'seq 1 60000'], on_output: (l) => got.push(Number(l)), on_exit: (c) => exits.push(c) } });
  runner.run('m');
  await waitFor(() => exits.length === 1, 15000);
  assert.ok(got.length > 0 && got.length <= 60000);
  assert.ok(got.every((v, i) => i === 0 || v > got[i - 1]), 'a ordem se mantém');
  const dropped = 60000 - got.length;
  assert.equal(notes.some((t) => /linhas descartadas/.test(t)), dropped > 0, `descartadas: ${dropped}`);
  assert.equal(exits.length, 1, 'on_exit só depois da última linha entregue');
});

// ---- vigia de CPU e memória ---------------------------------------------------------------------------
const linux = process.platform === 'linux';

test('vigia: processo PRESO girando (100% de CPU) é encerrado; o que só espera, não', { skip: !linux }, async () => {
  const exits = [];
  const { runner, notes } = make({
    preso: { cmd: 'sh', args: ['-c', 'while :; do :; done'], service: true, max_cpu: '60%', max_cpu_for_s: 1, on_exit: (c) => exits.push(['preso', c]) },
    filho: { cmd: 'sh', args: ['-c', 'yes > /dev/null; echo fim'], service: true, max_cpu: '60%', max_cpu_for_s: 1, on_exit: (c) => exits.push(['filho', c]) },
    espera: { cmd: 'sleep', args: ['30'], service: true, max_cpu: '60%', max_cpu_for_s: 1, on_exit: (c) => exits.push(['espera', c]) },
  }, { watchMs: 200 });
  ['preso', 'filho', 'espera'].forEach((id) => runner.run(id));
  await waitFor(() => exits.length === 2, 8000);
  assert.deepEqual(exits.map(([id]) => id).sort(), ['filho', 'preso']);
  assert.equal(runner.isRunning('espera'), true, 'quem só espera segue vivo');
  assert.ok(notes.some((t) => /CPU acima de 60% por 1 s/.test(t)), notes.join('|'));
  runner.stop('espera');
  await waitFor(() => runner.runningCount() === 0);
});

test('vigia: memória acima do limite encerra', { skip: !linux }, async () => {
  const exits = [];
  const { runner, notes } = make({ gordo: { cmd: process.execPath, args: ['-e', 'const b = Buffer.alloc(150 * 1024 * 1024, 1); setTimeout(() => {}, 30000)'], service: true, max_memory_mb: 80, on_exit: (c) => exits.push(c) } }, { watchMs: 200 });
  runner.run('gordo');
  await waitFor(() => exits.length === 1, 8000);
  assert.ok(notes.some((t) => /memória acima de 80 MB/.test(t)), notes.join('|'));
});

test('vigia: sem suporte (fora do Linux) ignora o limite e avisa uma vez', async () => {
  const { runner, notes } = make({ s: { cmd: 'sleep', args: ['5'], service: true, max_cpu: '50%' } }, { sampler: { supported: false, sample: () => null, hz: 100 } });
  runner.run('s');
  assert.ok(notes.some((t) => /só funcionam no Linux/.test(t)));
  runner.killAll();
  await waitFor(() => runner.runningCount() === 0);
});

// ---- ponte Lua ---------------------------------------------------------------------------------------------
test('lua: h:running() e h:stop() devolvem booleano ao Lua; h:write/h:restart passam ao runtime; problema vira erro com a linha', () => {
  const calls = []; const errors = [];
  const host = createLuaHost({ onError: (e) => errors.push(e) });
  host.run(`local h = k.exec("s", { cmd = "cat", service = true })
    k.bind("f1", function() error("r=" .. tostring(h:running()) .. " s=" .. tostring(h:stop()) .. " k=" .. tostring(k.exec.running("s"))) end)
    k.bind("f2", function() h:write("oi\\n"); h:restart() end)
    k.bind("f3", function() k.exec.write("s", "x") end)`, 'kaiak.lua');
  const { keys } = resolve(host.data).config;
  host.attach({ execControl: (id, verb, text) => { calls.push([id, verb, text]); return verb === 'write' && text === 'x' ? { problem: 'não está rodando' } : { value: verb === 'running' || verb === 'stop' } }, runExec: () => null });
  keys.f1();
  assert.match(errors[0], /r=true s=true k=true/);
  keys.f2();
  assert.deepEqual(calls.slice(-2), [['s', 'write', 'oi\n'], ['s', 'restart', undefined]]);
  keys.f3();
  assert.match(errors[1], /k\.exec: não está rodando/);
  host.close();
});
