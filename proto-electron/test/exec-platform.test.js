'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const { createPlatform, expandHome, mergeEnv, quoteWin, isAbsoluteShell } = require('../src/exec-platform');
const { createOrphanRegistry, startTokenFor } = require('../src/orphan-registry');
const { buildExec } = require('../src/exec-config');

const spec = (over = {}) => ({ cmd: 'x', args: [], env: undefined, cwd: undefined, shell: false, ...over });
const ctx = (env = {}) => ({ home: '/home/u', env });

test('shell: aceita caminhos absolutos de Unix e de Windows, recusa relativo', () => {
  for (const ok of ['/bin/bash', 'C:\\Git\\bin\\bash.exe', 'D:/x/sh.exe']) assert.equal(isAbsoluteShell(ok), true, ok);
  for (const bad of ['bash', 'bin/bash', '~/sh', '']) assert.equal(isAbsoluteShell(bad), false, bad);
  const w = []; buildExec([{ id: 'a', spec: { cmd: 'echo', shell: 'C:\\Git\\bin\\bash.exe' } }], w);
  assert.deepEqual(w, []);
});

test('~ vale como ~/ em todo SO e como ~\\ só no Windows; ~usuario fica literal', () => {
  assert.equal(expandHome('~', '/h', 'linux'), '/h');
  assert.equal(expandHome('~/x', '/h', 'linux'), '/h/x');
  assert.equal(expandHome('~\\x', 'C:\\h', 'linux'), '~\\x');
  assert.equal(expandHome('~\\x', 'C:\\h', 'win32'), 'C:\\h\\x');
  assert.equal(expandHome('~/x', 'C:\\h', 'win32'), 'C:\\h/x');
  assert.equal(expandHome('~maria/x', '/h', 'linux'), '~maria/x');
});

test('ambiente: no Windows a chave do usuário substitui a existente ignorando a caixa; no Unix, não', () => {
  assert.deepEqual(mergeEnv({ Path: 'a', HOME: 'h' }, { PATH: 'b' }, 'win32'), { HOME: 'h', PATH: 'b' });
  assert.deepEqual(mergeEnv({ Path: 'a' }, { PATH: 'b' }, 'linux'), { Path: 'a', PATH: 'b' });
  assert.deepEqual(mergeEnv({ A: '1' }, undefined, 'win32'), { A: '1' });
});

test('prepare: Linux/macOS usam grupo próprio (detached); Windows não e esconde a janela; .bat/.cmd viram shell com aspas', () => {
  const linux = createPlatform({ platform: 'linux' }).prepare(spec({ cmd: '~/a.sh', args: ['1'], cwd: '~/w' }), ['2'], ctx());
  assert.deepEqual([linux.command, linux.args, linux.options.detached, linux.options.cwd, linux.options.shell], ['/home/u/a.sh', ['1', '2'], true, '/home/u/w', false]);
  const mac = createPlatform({ platform: 'darwin' }).prepare(spec(), [], ctx());
  assert.equal(mac.options.detached, true);
  const win = createPlatform({ platform: 'win32' }).prepare(spec({ cmd: 'node.exe' }), [], ctx());
  assert.deepEqual([win.options.detached, win.options.windowsHide, win.options.shell], [false, true, false]);
  const bat = createPlatform({ platform: 'win32' }).prepare(spec({ cmd: 'C:\\Meus Scripts\\a.BAT', args: ['um dois', 'x'] }), [], ctx());
  assert.deepEqual([bat.command, bat.args, bat.options.shell], ['"C:\\Meus Scripts\\a.BAT"', ['"um dois"', 'x'], true]);
  const sh = createPlatform({ platform: 'linux' }).prepare(spec({ cmd: 'echo $HOME', shell: true }), [], ctx());
  assert.equal(sh.command, 'echo $HOME', 'com shell o cmd é a linha inteira, sem ~');
  assert.equal(quoteWin('a"b'), '"a""b"');
});

test('killTree: Unix mata o grupo (-pid); Windows usa taskkill /T (e /F só na força); sem pid não faz nada', () => {
  const kills = []; const tools = [];
  const toolChild = () => Object.assign(new EventEmitter(), {});
  const unix = createPlatform({ platform: 'linux', killPid: (pid, sig) => kills.push([pid, sig]) });
  unix.killTree({ pid: 100 }, 'SIGTERM'); unix.killTree({ pid: 100 }, 'SIGKILL'); unix.killTree({}, 'SIGKILL');
  assert.deepEqual(kills, [[-100, 'SIGTERM'], [-100, 'SIGKILL']]);
  const win = createPlatform({ platform: 'win32', spawnTool: (cmd, args) => { tools.push([cmd, args]); return toolChild(); } });
  win.killTree({ pid: 7 }, 'SIGTERM'); win.killTree({ pid: 7 }, 'SIGKILL');
  assert.deepEqual(tools, [['taskkill', ['/pid', '7', '/T']], ['taskkill', ['/pid', '7', '/T', '/F']]]);
  const noGroup = createPlatform({ platform: 'linux', killPid: () => { throw new Error('ESRCH'); } });
  assert.doesNotThrow(() => noGroup.killTree({ pid: 5 }, 'SIGKILL'));
});

// ---- registro de órfãos ----------------------------------------------------------------------------------
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kk-orf-')), 'pids.json');

test('registro (fixture): só encerra quem tem o MESMO carimbo; pid reaproveitado por outro programa é poupado; líder morto com netos vivos é pego', () => {
  const file = tmpFile();
  const alive = { 10: 'A', 20: 'OUTRO', 40: null };
  const killed = [];
  const reg = createOrphanRegistry({
    file, platform: 'linux', startToken: (pid) => alive[pid] ?? null,
    groupMembers: (pgid) => (pgid === 40 ? [{ pid: 41, start: 500 }, { pid: 42, start: 100 }] : []),
    killGroup: (pid) => killed.push(pid),
  });
  fs.writeFileSync(file, JSON.stringify([{ pid: 10, token: 'A' }, { pid: 20, token: 'B' }, { pid: 30, token: 'C' }, { pid: 40, token: '300' }]));
  assert.deepEqual(reg.reap(), [10, 40]);
  assert.deepEqual(killed, [10, 40]);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), [], 'o arquivo é zerado');
  const none = createOrphanRegistry({ file: path.join(os.tmpdir(), 'nao-existe-kk', 'x.json'), startToken: () => null, killGroup: () => {} });
  assert.deepEqual(none.reap(), []);
});

test('registro: add grava o carimbo, remove apaga; sem carimbo (processo já morto) não grava', () => {
  const file = tmpFile();
  const reg = createOrphanRegistry({ file, startToken: (pid) => (pid === 1 ? 'T1' : null), killGroup: () => {} });
  reg.add(1); reg.add(2);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), [{ pid: 1, token: 'T1' }]);
  reg.remove(1);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), []);
});

test('startTokenFor: macOS lê ps lstart e Windows o StartTime (fixtures); falha vira null', () => {
  const calls = [];
  const mac = startTokenFor('darwin', (cmd, args) => { calls.push([cmd, ...args]); return ' Thu Nov 19 21:00:00 2026\n'; });
  assert.equal(mac(10), 'Thu Nov 19 21:00:00 2026');
  assert.deepEqual(calls[0], ['ps', '-o', 'lstart=', '-p', '10']);
  const win = startTokenFor('win32', (cmd, args) => { calls.push([cmd, args.at(-1)]); return '133123456789012345\r\n'; });
  assert.equal(win(7), '133123456789012345');
  assert.match(calls[1][1], /Get-Process -Id 7/);
  assert.equal(startTokenFor('darwin', () => { throw new Error('x'); })(1), null);
});

test('REAL (Linux): fechamento à força deixa netos vivos; o registro do próximo boot os encerra, sem tocar em outros processos', { skip: process.platform !== 'linux' }, async () => {
  const file = tmpFile();
  const reg1 = createOrphanRegistry({ file });
  // "KaiaK" antigo: lança um grupo (sh -> 2 sleeps) e é "morto à força" (aqui: some do registro em memória, sem encerrar nada)
  const leader = childProcess.spawn('sh', ['-c', 'sleep 9181 & sleep 9182 & wait'], { detached: true, stdio: 'ignore' });
  const bystander = childProcess.spawn('sleep', ['9183'], { stdio: 'ignore' }); // outro programa: NÃO pode morrer
  await new Promise((r) => setTimeout(r, 300));
  reg1.add(leader.pid);
  const grouped = () => childProcess.spawnSync('pgrep', ['-g', String(leader.pid)]).stdout.toString().trim().split('\n').filter(Boolean).length;
  assert.equal(grouped(), 3, 'líder + 2 sleeps');
  // "próximo boot"
  const killed = createOrphanRegistry({ file }).reap();
  assert.deepEqual(killed, [leader.pid]);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(grouped(), 0, 'o grupo inteiro (inclusive os netos) morreu');
  assert.equal(process.kill(bystander.pid, 0), true, 'o processo alheio segue vivo');
  bystander.kill('SIGKILL');
});
