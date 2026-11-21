'use strict';
// Mede CPU e memória de um processo e dos seus descendentes lendo /proc (só Linux, sem dependência). Um processo preso girando gasta
// ~100% de CPU; um esperando (dormindo, lendo) gasta ~0%: é isso que o prazo em segundos não distingue. Uma amostra custa ~45 µs.
const fs = require('node:fs');

const HZ = 100; // USER_HZ do Linux é fixo em 100 para o espaço de usuário

// Campos de /proc/<pid>/stat depois do ")" do nome: 12 e 13 = utime e stime (em ticks).
function parseTicks(text) {
  const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
  return Number(fields[11]) + Number(fields[12]);
}

// VmRSS (kB) de /proc/<pid>/status, em bytes.
function parseRss(text) {
  const match = /^VmRSS:\s+(\d+)\s+kB/m.exec(text);
  return match ? Number(match[1]) * 1024 : 0;
}

// rchar + wchar de /proc/<pid>/io (bytes lidos e gravados, inclusive por cache); 0 se ilegível.
function parseIo(text) {
  const read = /^rchar:\s+(\d+)/m.exec(text);
  const written = /^wchar:\s+(\d+)/m.exec(text);
  return Number(read?.[1] ?? 0) + Number(written?.[1] ?? 0);
}

function createSampler({ readFile = (file) => fs.readFileSync(file, 'utf8'), exists = fs.existsSync } = {}) {
  const supported = process.platform === 'linux' && exists('/proc/self/stat');
  const read = (file) => { try { return readFile(file); } catch { return null; } };

  const children = (pid) => (read(`/proc/${pid}/task/${pid}/children`) ?? '').trim().split(' ').filter(Boolean).map(Number);
  const tree = (pid) => [pid, ...children(pid).flatMap(tree)]; // recursão sobre a árvore (poucos processos), não sobre coleção que cresce

  // { ticks, rss } somados na árvore; null se o processo já não existe. `withMemory` evita ler o status quando ninguém pediu.
  function sample(pid, withMemory = false, withIo = false) {
    if (!supported) return null;
    const total = { ticks: 0, rss: 0 };
    const ids = tree(pid);
    let found = false;
    for (const id of ids) {
      const stat = read(`/proc/${id}/stat`);
      if (stat === null) continue;
      found = true;
      total.ticks += parseTicks(stat);
      if (withMemory) total.rss += parseRss(read(`/proc/${id}/status`) ?? '');
      if (withIo) total.io = (total.io ?? 0) + parseIo(read(`/proc/${id}/io`) ?? '');
    }
    if (withIo) total.pids = ids.sort((a, b) => a - b);
    return found ? total : null;
  }

  return { supported, sample, hz: HZ };
}

module.exports = { createSampler, parseTicks, parseRss, parseIo, HZ };
