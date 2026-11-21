'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { buildExec } = require('../src/exec-config');
const { createExecRunner } = require('../src/exec-runner');
const { classify } = require('../src/stuck-check');
const { createPlatformSampler, parsePs, parseCim, parseCpuTime, treeOf } = require('../src/platform-sampler');
const { parseIo } = require('../src/proc-sampler');

const ops = (obj) => Object.entries(obj).map(([id, spec]) => ({ id, spec }));
const waitFor = (fn, ms = 15000) => new Promise((ok, fail) => {
  const start = Date.now();
  const tick = () => (fn() ? ok() : Date.now() - start > ms ? fail(new Error('timeout do teste')) : setTimeout(tick, 20));
  tick();
});
const linux = process.platform === 'linux';
const make = (raw, over = {}) => {
  const warnings = []; const notes = []; const pids = [];
  const specs = buildExec(ops(raw), warnings);
  assert.deepEqual(warnings, []);
  const spawn = (...a) => { const c = childProcess.spawn(...a); pids.push(c.pid); return c; };
  return { runner: createExecRunner({ specs, spawn, notify: (n) => notes.push(n.text), ...over }), notes, pids };
};
const S = (at, out, ticks, io, pids) => ({ at, out, ticks, io, pids });

// ---- classificador puro ----------------------------------------------------------------------------
test('classify: saída nova, I/O e filhos que mudam = saudável (mesmo com CPU alta); sem sinais, CPU alta = girando; CPU baixa = parado', () => {
  const base = S(0, 100, 0, 0, [1]);
  assert.equal(classify([base, S(3000, 150, 300, 0, [1])]).healthy, true);
  assert.match(classify([base, S(3000, 150, 300, 0, [1])]).reason, /saída nova \(50 bytes/);
  assert.match(classify([base, S(3000, 100, 0, 9000, [1])]).reason, /I\/O em andamento/);
  assert.match(classify([base, S(3000, 100, 0, 100, [1, 2])]).reason, /filhos mudaram/);
  const spin = classify([base, S(3000, 100, 300, 10, [1])]);
  assert.deepEqual([spin.healthy, spin.cpu], [false, 100]);
  assert.match(spin.reason, /enroscado: CPU 100% sem saída nem I\/O por 3 s/);
  const idle = classify([base, S(3000, 100, 1, 10, [1])]);
  assert.equal(idle.healthy, false);
  assert.match(idle.reason, /enroscado: parado, sem saída/);
  assert.equal(classify([base, S(3000, 100, 90, 0, [1])], { stuckCpu: 20 }).reason.startsWith('enroscado: CPU'), true, 'limiar configurável');
});

// ---- os 4 casos, com processos reais (Linux) -----------------------------------------------------------
test('gatilho: (1) girando sem saída e (2) dormindo para sempre são ENCERRADOS com o motivo certo', { skip: !linux }, async () => {
  const exits = [];
  const { runner, notes } = make({
    gira: { cmd: 'sh', args: ['-c', 'while :; do :; done'], timeout_ms: 400, stuck_window_s: 1, on_exit: () => exits.push('gira') },
    dorme: { cmd: 'sleep', args: ['60'], timeout_ms: 400, stuck_window_s: 1, on_exit: () => exits.push('dorme') },
  });
  runner.run('gira'); runner.run('dorme');
  await waitFor(() => exits.length === 2);
  assert.ok(notes.some((t) => /enroscado: CPU \d+% sem saída nem I\/O/.test(t)), notes.join('|'));
  assert.ok(notes.some((t) => /enroscado: parado, sem saída/.test(t)), notes.join('|'));
});

test('gatilho: (3) trabalho lento que imprime progresso NÃO é encerrado, ganha prazo e termina sozinho; (4) CPU alta COM saída também', { skip: !linux }, async () => {
  const exits = [];
  const { runner, notes } = make({
    lento: { cmd: 'sh', args: ['-c', 'for i in 1 2 3 4 5 6; do echo passo $i; sleep 0.5; done'], timeout_ms: 700, stuck_window_s: 1, on_exit: (c) => exits.push(['lento', c]) },
    codifica: { cmd: 'sh', args: ['-c', 'i=0; while [ $i -lt 6000 ]; do i=$((i+1)); echo $i; done'], timeout_ms: 200, stuck_window_s: 1, on_exit: (c) => exits.push(['codifica', c]) },
  });
  runner.run('lento'); runner.run('codifica');
  await waitFor(() => exits.length === 2);
  assert.deepEqual(Object.fromEntries(exits), { lento: 0, codifica: 0 }, 'terminaram sozinhos, código 0');
  assert.ok(notes.some((t) => /exec "lento" ainda ativo \(saída nova.*\): prazo estendido/.test(t)), notes.join('|'));
  assert.ok(!notes.some((t) => /enroscado/.test(t)));
});

test('gatilho: saudável de fachada bate no teto duro timeout_max_ms e é encerrado', { skip: !linux }, async () => {
  const exits = [];
  const { runner, notes } = make({ falso: { cmd: 'sh', args: ['-c', 'while :; do echo vivo; sleep 0.2; done'], timeout_ms: 500, timeout_max_ms: 2200, stuck_window_s: 1, on_exit: () => exits.push(1) } });
  runner.run('falso');
  await waitFor(() => exits.length === 1);
  assert.ok(notes.some((t) => /prazo máximo de 2200 ms atingido/.test(t)), notes.join('|'));
  assert.ok(notes.filter((t) => /prazo estendido/.test(t)).length >= 1);
});

test('gatilho: timeout_check = false mata direto no prazo, como antes', async () => {
  const exits = []; const start = Date.now();
  const { runner, notes } = make({ x: { cmd: 'sleep', args: ['30'], timeout_ms: 300, timeout_check: false, output: 'notify', on_exit: () => exits.push(1) } });
  runner.run('x');
  await waitFor(() => exits.length === 1);
  assert.ok(Date.now() - start < 3000);
  assert.ok(notes.some((t) => /estourou 300 ms/.test(t)));
});

test('gatilho com plataforma sem amostrador (só saída): sem saída = encerra; com saída = estende', async () => {
  const none = { supported: false, sample: () => null, hz: 100 };
  const exits = [];
  const { runner, notes } = make({
    mudo: { cmd: 'sleep', args: ['30'], timeout_ms: 300, stuck_window_s: 1, on_exit: () => exits.push('mudo') },
    fala: { cmd: 'sh', args: ['-c', 'for i in 1 2 3 4 5; do echo oi; sleep 0.3; done'], timeout_ms: 400, stuck_window_s: 1, on_exit: () => exits.push('fala') },
  }, { sampler: none });
  runner.run('mudo'); runner.run('fala');
  await waitFor(() => exits.length === 2);
  assert.ok(notes.some((t) => /enroscado/.test(t)));
  assert.ok(notes.some((t) => /exec "fala" ainda ativo/.test(t)));
});

// ---- amostradores de macOS e Windows: parsers + árvore com fixtures ----------------------------------
const PS_FIXTURE = `    1     0  12000   0:12.50
  500     1   2048   0:00.10
  501   500   4096   1-02:03:04.00
  502   500   1024   10:05
  900     1  99999   5:00.00
lixo sem numeros
`;
test('macOS: parseCpuTime e parsePs (formatos mm:ss, hh:mm:ss e dd-hh:mm:ss; linhas inválidas ignoradas)', () => {
  assert.equal(parseCpuTime('0:12.50'), 1250);
  assert.equal(parseCpuTime('10:05'), 60500);
  assert.equal(parseCpuTime('1-02:03:04.00'), (86400 + 7384) * 100);
  assert.equal(parseCpuTime('x:y'), null);
  const list = parsePs(PS_FIXTURE);
  assert.equal(list.length, 5);
  assert.deepEqual(list[1], { pid: 500, ppid: 1, ticks: 10, rss: 2048 * 1024, io: 0 });
});

const CIM_FIXTURE = JSON.stringify([
  { ProcessId: 4, ParentProcessId: 0, WorkingSetSize: 100, KernelModeTime: 0, UserModeTime: 0, ReadTransferCount: 0, WriteTransferCount: 0 },
  { ProcessId: 700, ParentProcessId: 4, WorkingSetSize: 5242880, KernelModeTime: 10000000, UserModeTime: 20000000, ReadTransferCount: 1000, WriteTransferCount: 500 },
  { ProcessId: 701, ParentProcessId: 700, WorkingSetSize: 1048576, KernelModeTime: 5000000, UserModeTime: 5000000, ReadTransferCount: 10, WriteTransferCount: 20 },
]);
test('Windows: parseCim (1 objeto ou lista, BOM, tempos de 100 ns) e árvore somando filhos', async () => {
  assert.equal(parseCim('\uFEFF' + JSON.stringify({ ProcessId: 9, ParentProcessId: 1, WorkingSetSize: 5, KernelModeTime: 10000000, UserModeTime: 0 }))[0].ticks, 100);
  assert.deepEqual(parseCim('não é json'), []);
  const calls = [];
  const sampler = createPlatformSampler({ platform: 'win32', run: async (cmd, args) => { calls.push([cmd, args[0]]); return CIM_FIXTURE; } });
  assert.equal(sampler.supported, true);
  assert.deepEqual(await sampler.sample(700, true, true), { ticks: 300 + 100, rss: 5242880 + 1048576, io: 1530, pids: [700, 701] });
  assert.deepEqual(await sampler.sample(700), { ticks: 400, rss: 0 });
  assert.equal(await sampler.sample(99999), null);
  assert.equal(calls[0][0], 'powershell.exe');
});

test('macOS: amostrador por ps soma a árvore e some quando o processo não existe; plataforma desconhecida não é suportada', async () => {
  const sampler = createPlatformSampler({ platform: 'darwin', run: async () => PS_FIXTURE });
  const s = await sampler.sample(500, true, true);
  assert.deepEqual(s, { ticks: 10 + (86400 + 7384) * 100 + 60500, rss: (2048 + 4096 + 1024) * 1024, io: 0, pids: [500, 501, 502] });
  assert.equal(await sampler.sample(12345), null);
  assert.equal(createPlatformSampler({ platform: 'freebsd' }).supported, false);
  assert.deepEqual(treeOf([{ pid: 1, ppid: 1 }, { pid: 2, ppid: 1 }], 1).map((p) => p.pid), [1, 2], 'ciclo pai=filho não trava');
});

test('Linux: parseIo soma rchar+wchar', () => {
  assert.equal(parseIo('rchar: 100\nwchar: 50\nsyscr: 3\n'), 150);
  assert.equal(parseIo(''), 0);
});

// ---- limites do achado C --------------------------------------------------------------------------------
test('config: timeout_check, timeout_max_ms, stuck_cpu, stuck_window_s e on_output_queue_max validados; teto menor que o prazo é corrigido', () => {
  const w = []; const ok = buildExec(ops({ a: { cmd: 'x', timeout_check: false, timeout_max_ms: 120000, stuck_cpu: '80%', stuck_window_s: 5, on_output_queue_max: 500 } }), w);
  assert.deepEqual(w, []);
  assert.deepEqual([ok.a.timeout_check, ok.a.timeout_max_ms, ok.a.stuck_cpu, ok.a.stuck_window_s, ok.a.on_output_queue_max], [false, 120000, '80%', 5, 500]);
  const bad = []; const b = buildExec(ops({ b: { cmd: 'x', timeout_check: 'sim', timeout_max_ms: 5, stuck_cpu: 50, stuck_window_s: 0, on_output_queue_max: 3, timeut_check: true } }), bad);
  const text = bad.join('\n');
  for (const p of [/b\.timeout_check/, /b\.timeout_max_ms/, /b\.stuck_cpu/, /b\.stuck_window_s/, /b\.on_output_queue_max/, /quis dizer "timeout_check"/]) assert.match(text, p);
  assert.deepEqual([b.b.timeout_check, b.b.timeout_max_ms, b.b.on_output_queue_max], [true, 600000, 20000]);
  const low = []; const c = buildExec(ops({ c: { cmd: 'x', timeout_ms: 900000 } }), low);
  assert.match(low[0], /timeout_max_ms.*menor que timeout_ms/);
  assert.equal(c.c.timeout_max_ms, 900000);
});

test('fila de linhas: on_output_queue_max configurável controla o descarte', async () => {
  const got = []; const exits = [];
  const { runner, notes } = make({ m: { cmd: 'sh', args: ['-c', 'seq 1 30000'], on_output_queue_max: 100, on_output: (l) => got.push(l), on_exit: () => exits.push(1) } });
  runner.run('m');
  await waitFor(() => exits.length === 1);
  assert.ok(got.length < 30000);
  assert.ok(notes.some((t) => /linhas descartadas/.test(t)));
});

// ---- killAll de verdade (achado C4) ---------------------------------------------------------------------
const gone = (pid) => { try { process.kill(pid, 0); return false; } catch { return true; } };
test('killAll: derruba serviços vivos e os filhos de um sh; nada sobra', { skip: !linux }, async () => {
  const { runner, pids } = make({
    a: { cmd: 'cat', service: true },
    b: { cmd: 'sh', args: ['-c', 'sleep 60 & sleep 60 & wait'], service: true },
  });
  runner.run('a'); runner.run('b');
  await new Promise((r) => setTimeout(r, 300));
  const kids = childProcess.execSync(`pgrep -P ${pids[1]}`).toString().trim().split('\n').map(Number);
  assert.equal(kids.length, 2);
  runner.killAll();
  await waitFor(() => runner.runningCount() === 0);
  await waitFor(() => [...pids, ...kids].every(gone), 5000);
});
