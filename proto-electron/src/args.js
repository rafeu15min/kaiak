'use strict';
// Argumentos de linha de comando: mesmos nomes dos outros protótipos.
//   --profile-dir DIR      diretório do perfil (padrão ~/.local/share/kaiak-electron)
//   --discard-after SEG    descarta abas em segundo plano após SEG s (0 desliga; padrão: o da config)
//   --config ARQUIVO       kaiak.lua alternativo (padrão ~/.config/kaiak/kaiak.lua)
//   --state-dir DIR        onde guardar a última config estável (padrão ~/.local/state/kaiak)
//   --data-dir DIR         dados do KaiaK, como as listas de bloqueio (padrão ~/.local/share/kaiak)
//   --safe                 ignora o kaiak.lua e abre com o padrão
//   URL...                 abas iniciais
const os = require('node:os');
const path = require('node:path');

const VALUE_FLAGS = new Set(['--profile-dir', '--discard-after', '--config', '--state-dir', '--data-dir']);

function splitFlag(arg) {
  const eq = arg.indexOf('=');
  return eq === -1 ? [arg, null] : [arg.slice(0, eq), arg.slice(eq + 1)];
}

const SETTERS = {
  '--profile-dir': (o, v) => { o.profileDir = v; },
  '--discard-after': (o, v) => { o.discard_after_s = Number(v) || 0; },
  '--config': (o, v) => { o.configFile = path.resolve(v); },
  '--state-dir': (o, v) => { o.stateDir = path.resolve(v); },
  '--data-dir': (o, v) => { o.dataDir = path.resolve(v); },
};
const applyValue = (opts, flag, value) => SETTERS[flag](opts, value);

function parseArgs(argv) {
  const opts = {
    profileDir: path.join(os.homedir(), '.local', 'share', 'kaiak-electron'),
    discard_after_s: null,
    configFile: null,
    stateDir: null,
    dataDir: null,
    safe: false,
    urls: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    if (flag === '--safe') {
      opts.safe = true;
      continue;
    }
    if (!VALUE_FLAGS.has(flag)) {
      if (!argv[i].startsWith('--')) opts.urls.push(argv[i]);
      continue;
    }
    applyValue(opts, flag, inline ?? argv[++i]);
  }
  return opts;
}

module.exports = { parseArgs };
