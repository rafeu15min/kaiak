'use strict';
// Amostrador de processos para macOS (ps) e Windows (PowerShell/CIM): uma consulta externa devolve TODOS os processos, e a árvore do comando é
// montada aqui. Parsers puros testados com fixtures das saídas reais; a execução do comando é injetável. (Linux usa proc-sampler.js, /proc.)
const childProcess = require('node:child_process');

const HZ = 100;
const RUN_TIMEOUT_MS = 5000;
const MAX_BUFFER = 16 * 1024 * 1024;

// ps do macOS: "pid ppid rss time" (time = [[dd-]hh:]mm:ss[.cc]); rss em KB. Linhas inválidas são ignoradas.
function parseCpuTime(text) {
  const [days, rest] = text.includes('-') ? text.split('-') : ['0', text];
  const parts = rest.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return (Number(days) * 86400 + seconds) * HZ;
}

function parsePs(output) {
  return output.split('\n').flatMap((line) => {
    const [pid, ppid, rss, time] = line.trim().split(/\s+/);
    const ticks = time === undefined ? null : parseCpuTime(time);
    if (![pid, ppid, rss].every((v) => /^\d+$/.test(v ?? '')) || ticks === null) return [];
    return [{ pid: Number(pid), ppid: Number(ppid), ticks, rss: Number(rss) * 1024, io: 0 }]; // o ps não dá I/O
  });
}

// Win32_Process via ConvertTo-Json: um objeto (1 processo) ou lista. Tempos em unidades de 100 ns; contadores de transferência em bytes.
function parseCim(output) {
  let data;
  try { data = JSON.parse(output.replace(/^\uFEFF/, '')); } catch { return []; }
  return (Array.isArray(data) ? data : [data]).flatMap((p) => {
    if (!Number.isInteger(p?.ProcessId)) return [];
    const times = Number(p.KernelModeTime ?? 0) + Number(p.UserModeTime ?? 0);
    return [{ pid: p.ProcessId, ppid: Number(p.ParentProcessId ?? 0), ticks: Math.round(times / 1e7 * HZ), rss: Number(p.WorkingSetSize ?? 0), io: Number(p.ReadTransferCount ?? 0) + Number(p.WriteTransferCount ?? 0) }];
  });
}

const SOURCES = {
  darwin: { cmd: 'ps', args: ['-A', '-o', 'pid=,ppid=,rss=,time='], parse: parsePs },
  win32: {
    cmd: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,KernelModeTime,UserModeTime,ReadTransferCount,WriteTransferCount | ConvertTo-Json -Compress'],
    parse: parseCim,
  },
};

// Raiz + descendentes (pai -> filhos por ppid), sem recursão. Devolve a lista de processos da árvore (vazia se a raiz não existe).
function treeOf(list, rootPid) {
  const byParent = Map.groupBy(list, (p) => p.ppid);
  const byPid = new Map(list.map((p) => [p.pid, p]));
  if (!byPid.has(rootPid)) return [];
  const out = [];
  const stack = [rootPid];
  const seen = new Set();
  while (stack.length > 0) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push(byPid.get(pid));
    (byParent.get(pid) ?? []).forEach((child) => stack.push(child.pid));
  }
  return out;
}

const defaultRun = (cmd, args) => new Promise((resolve, reject) => {
  childProcess.execFile(cmd, args, { timeout: RUN_TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
});

// Mesma interface do proc-sampler, mas assíncrona: sample(pid, withMemory, withIo) -> { ticks, rss?, io?, pids? } | null.
function createPlatformSampler({ platform = process.platform, run = defaultRun } = {}) {
  const source = SOURCES[platform];
  async function sample(pid, withMemory = false, withIo = false) {
    const tree = treeOf(source.parse(await run(source.cmd, source.args)), pid);
    if (tree.length === 0) return null;
    const total = { ticks: tree.reduce((sum, p) => sum + p.ticks, 0), rss: 0 };
    if (withMemory) total.rss = tree.reduce((sum, p) => sum + p.rss, 0);
    if (withIo) Object.assign(total, { io: tree.reduce((sum, p) => sum + p.io, 0), pids: tree.map((p) => p.pid).sort((a, b) => a - b) });
    return total;
  }
  return { supported: source !== undefined, sample, hz: HZ };
}

module.exports = { createPlatformSampler, parsePs, parseCim, parseCpuTime, treeOf };
