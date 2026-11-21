'use strict';
// Carrega o kaiak.lua UMA vez na partida. Erro de sintaxe/execução/tempo => abre com a última
// versão estável (cópia validada em $XDG_STATE_HOME/kaiak/last-good) ou, sem ela, com o padrão,
// e devolve os erros para a faixa do topo. O arquivo do usuário nunca é alterado.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULTS, resolve } = require('./config');
const { createLuaHost } = require('./lua-host');

const TEMPLATE = path.join(__dirname, 'template.lua');
// pinned: erro de SINTAXE do kaiak.lua; é o único alerta que não se dispensa (ver notifier).
const entry = (level, text, pinned = false) => ({ level, text, pinned });

function resolvePaths(opts, env = process.env) {
  const home = os.homedir();
  const configHome = env.XDG_CONFIG_HOME || path.join(home, '.config');
  const stateHome = env.XDG_STATE_HOME || path.join(home, '.local', 'state');
  const file = opts.configFile || path.join(configHome, 'kaiak', 'kaiak.lua');
  const stateDir = opts.stateDir || path.join(stateHome, 'kaiak');
  return { file, dir: path.dirname(file), lastGood: path.join(stateDir, 'last-good', 'kaiak.lua') };
}

// Executa um arquivo Lua. Devolve { host, error }; em erro, a VM já vem fechada.
function runFile(file, dir, onError) {
  const host = createLuaHost({ requireDir: dir, onError });
  const error = host.run(fs.readFileSync(file, 'utf8'), path.basename(file));
  if (error) host.close();
  return { host, error, syntax: host.syntaxError };
}

function writeTemplateIfMissing(file) {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(TEMPLATE, file);
}

function fallback(paths, onError) {
  if (!fs.existsSync(paths.lastGood)) return { source: 'default', ...resolve({}), host: null };
  const { host, error } = runFile(paths.lastGood, paths.dir, onError);
  if (error) return { source: 'default', ...resolve({}), host: null };
  return { source: 'last-good', ...resolve(host.data), host };
}

const FALLBACK_NOTE = {
  'last-good': 'abrindo com a última configuração estável',
  default: 'abrindo com a configuração padrão',
};

function loadConfig(opts, { onError = () => {}, env = process.env } = {}) {
  const paths = resolvePaths(opts, env);
  const base = { paths, host: null, errors: [], source: 'default' };
  if (opts.safe) return { ...base, ...resolve({}), source: 'safe', commit() {} };
  if (!fs.existsSync(paths.file)) {
    writeTemplateIfMissing(paths.file);
    return { ...base, ...resolve({}), commit() {} };
  }
  const { host, error, syntax } = runFile(paths.file, paths.dir, onError);
  if (error) {
    const used = fallback(paths, onError);
    const errors = [entry('error', error, syntax), entry('info', FALLBACK_NOTE[used.source])];
    return { ...base, ...used, config: used.config, errors, commit() {} };
  }
  const { config, warnings } = resolve(host.data);
  return {
    ...base, config, host, source: 'user',
    errors: warnings.map((w) => entry('warning', w)),
    // Chamado pela partida quando tudo (inclusive atalhos) validou: guarda a cópia estável.
    commit() {
      fs.mkdirSync(path.dirname(paths.lastGood), { recursive: true });
      fs.copyFileSync(paths.file, paths.lastGood);
    },
  };
}

module.exports = { loadConfig, resolvePaths, DEFAULTS };
