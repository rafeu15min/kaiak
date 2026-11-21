'use strict';
// Diferenças de SO do k.exec num adaptador pequeno e injetável (a plataforma vem de fora nos testes):
//   encerrar a ÁRVORE: Unix = grupo de processos (detached + kill(-pid)); Windows = taskkill /T (sem /F = educado, com /F = força)
//   spawn: .bat/.cmd exigem shell no Windows (Node recusa com EINVAL); ~ vale como ~/ e ~\ ; ambiente do Windows ignora caixa das chaves
const childProcess = require('node:child_process');

const isAbsoluteShell = (text) => /^(\/|[A-Za-z]:[\\/])/.test(text); // "/bin/bash" ou "C:\\Git\\bin\\bash.exe"
const BATCH = /\.(bat|cmd)$/i;

const quoteWin = (text) => (/[\s"&|<>^()%!]/.test(text) || text === '' ? `"${text.replace(/"/g, '""')}"` : text);

function expandHome(text, home, platform) {
  if (text === '~') return home;
  const separators = platform === 'win32' ? ['/', '\\'] : ['/'];
  return text.startsWith('~') && separators.includes(text[1]) ? home + text.slice(1) : text;
}

// Base + extras. No Windows os nomes de variáveis não diferenciam caixa (Path = PATH): a chave do usuário substitui a existente.
function mergeEnv(base, extra, platform) {
  if (platform !== 'win32') return { ...base, ...extra };
  const out = { ...base };
  const byUpper = new Map(Object.keys(out).map((key) => [key.toUpperCase(), key]));
  for (const [key, value] of Object.entries(extra ?? {})) {
    const existing = byUpper.get(key.toUpperCase());
    if (existing) delete out[existing];
    out[key] = value;
    byUpper.set(key.toUpperCase(), key);
  }
  return out;
}

function createPlatform({ platform = process.platform, spawnTool = childProcess.spawn, killPid = (pid, signal) => process.kill(pid, signal) } = {}) {
  const windows = platform === 'win32';

  // { command, args, options } prontos para o spawn.
  function prepare(spec, extraArgs, { home, env }) {
    const args = [...spec.args, ...extraArgs.map(String)];
    const options = { env: mergeEnv(env, spec.env, platform), shell: spec.shell, detached: !windows, windowsHide: true };
    if (spec.cwd) options.cwd = expandHome(spec.cwd, home, platform);
    if (spec.shell) return { command: spec.cmd, args, options }; // com shell, cmd é a linha inteira
    const command = expandHome(spec.cmd, home, platform);
    if (!(windows && BATCH.test(command))) return { command, args, options };
    return { command: quoteWin(command), args: args.map(quoteWin), options: { ...options, shell: true } }; // .bat/.cmd só rodam por shell
  }

  // Encerra o comando e TODOS os filhos. signal: 'SIGTERM' (educado, quando o SO permite) ou 'SIGKILL' (força).
  function killTree(child, signal) {
    if (typeof child.pid !== 'number') return;
    try {
      if (windows) spawnTool('taskkill', ['/pid', String(child.pid), '/T', ...(signal === 'SIGKILL' ? ['/F'] : [])], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill(signal));
      else killPid(-child.pid, signal);
    } catch { /* já terminou */ }
  }

  return { prepare, killTree, windows };
}

module.exports = { createPlatform, expandHome, mergeEnv, quoteWin, isAbsoluteShell };
