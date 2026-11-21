'use strict';
// Órfãos depois de um kill -9 no KaiaK: nenhum mecanismo de SO cobre os NETOS (testado: setpriv --pdeathsig só alcança o filho direto).
// Solução: cada comando em execução é anotado num arquivo (pid do líder + "carimbo" de início do processo); no próximo boot, o que ainda
// estiver vivo COM O MESMO carimbo é encerrado (o carimbo evita matar outro programa que reaproveitou o pid).
const fs = require('node:fs');
const childProcess = require('node:child_process');
const { readJson, writeJsonAtomic } = require('./json-file');

// Linux: campo 22 de /proc/<pid>/stat (início em ticks desde o boot). macOS: ps lstart. Windows: StartTime do PowerShell. null = não existe.
function startTokenFor(platform, run = (cmd, args) => childProcess.execFileSync(cmd, args, { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })) {
  return (pid) => {
    try {
      if (platform === 'linux') return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(')').pop().trim().split(' ')[19] ?? null;
      if (platform === 'darwin') return run('ps', ['-o', 'lstart=', '-p', String(pid)]).trim() || null;
      if (platform === 'win32') return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${Number(pid)}).StartTime.ToFileTimeUtc()`]).trim() || null;
    } catch { /* processo não existe */ }
    return null;
  };
}

// Membros vivos do grupo `pgid` com o carimbo de cada um (Linux, via /proc): pega o grupo cujo líder já saiu mas deixou netos.
function linuxGroupMembers(pgid) {
  let entries = [];
  try { entries = fs.readdirSync('/proc').filter((name) => /^\d+$/.test(name)); } catch { return []; }
  return entries.flatMap((pid) => {
    try {
      const fields = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(')').pop().trim().split(' ');
      return Number(fields[2]) === pgid ? [{ pid: Number(pid), start: Number(fields[19]) }] : [];
    } catch { return []; }
  });
}

function createOrphanRegistry({ file, platform = process.platform, startToken = startTokenFor(platform), groupMembers = platform === 'linux' ? linuxGroupMembers : () => [], killGroup, killPid = (pid) => process.kill(pid, 'SIGKILL') }) {
  const load = () => { const data = readJson(file, []); return Array.isArray(data) ? data : []; };
  const save = (list) => { try { writeJsonAtomic(file, list); } catch { /* sem disco: só perde a rede de segurança */ } };
  const group = killGroup ?? ((pid) => (platform === 'win32' ? killPid(pid) : process.kill(-pid, 'SIGKILL')));

  return {
    add(pid) {
      const token = startToken(pid);
      if (token !== null) save([...load().filter((entry) => entry.pid !== pid), { pid, token: String(token) }]);
    },
    remove(pid) { save(load().filter((entry) => entry.pid !== pid)); },
    // No boot: encerra o que sobrou da vida anterior e zera o arquivo. Devolve a lista de pids encerrados.
    reap() {
      const killed = [];
      for (const entry of load()) {
        const same = startToken(entry.pid) === entry.token; // líder ainda vivo e é o mesmo processo
        const survivors = same ? [] : groupMembers(entry.pid).filter((m) => m.start >= Number(entry.token)); // líder saiu, netos ficaram
        if (!same && survivors.length === 0) continue;
        try { group(entry.pid); killed.push(entry.pid); } catch { /* já foi */ }
      }
      save([]);
      return killed;
    },
  };
}

module.exports = { createOrphanRegistry, startTokenFor, linuxGroupMembers };
