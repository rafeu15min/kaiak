'use strict';
// Atualização das listas de bloqueio. Baixa para um arquivo temporário, confere o tamanho e só então
// troca o arquivo (rename atômico): uma resposta de erro ou vazia nunca apaga uma lista boa.
// Uso por linha de comando: `node src/blocklist-update.js [--data-dir DIR]` (npm run blocklists).
const fs = require('node:fs');
const path = require('node:path');
const { parseHosts, listDir } = require('./blocklist');

const SOURCES = {
  ads: {
    file: 'ads.hosts', minDomains: 10000,
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
  },
  malware: {
    file: 'malware.hosts', minDomains: 50,
    url: 'https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-hosts-online.txt',
  },
};
const TIMEOUT_MS = 30000;
const FIRST_CHECK_MS = 5000; // não disputa a partida com o carregamento da primeira página

const ageHours = (file) => {
  try { return (Date.now() - fs.statSync(file).mtimeMs) / 3600000; } catch { return Infinity; }
};

// Baixa e grava uma lista. Devolve o conjunto de domínios; lança em qualquer falha (a lista antiga fica).
async function downloadList(kind, dir, fetchFn = globalThis.fetch) {
  const source = SOURCES[kind];
  const response = await fetchFn(source.url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'KaiaK-blocklist-updater' },
  });
  if (!response.ok) throw new Error(`${kind}: HTTP ${response.status}`);
  const text = await response.text();
  const set = parseHosts(text);
  if (set.size < source.minDomains) throw new Error(`${kind}: lista suspeita (${set.size} domínios, mínimo ${source.minDomains})`);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, source.file);
  fs.writeFileSync(`${target}.tmp`, text);
  fs.renameSync(`${target}.tmp`, target);
  return set;
}

// Atualiza uma lista se passou de `maxAgeHours` (ou sempre, com force). Devolve a nova lista ou null.
async function refreshIfStale(kind, { dir, maxAgeHours, fetchFn, log, onFail = () => {}, force = false }) {
  if (!force && ageHours(path.join(dir, SOURCES[kind].file)) < maxAgeHours) return null;
  try {
    const set = await downloadList(kind, dir, fetchFn);
    log(`[kaiak] lista "${kind}" atualizada (${set.size} domínios)`);
    return set;
  } catch (error) {
    log(`[kaiak] falha ao atualizar a lista "${kind}": ${error.message}`);
    onFail(error);
    return null;
  }
}

// Verifica UMA vez, logo depois da partida (decisão do usuário: nada de rede durante o uso), e troca as
// listas no bloqueador sem reiniciar. onResult({ kind, ok, error }) avisa a interface.
function startUpdates({ config, dir, blocker, fetchFn, log = console.warn, firstMs = FIRST_CHECK_MS, onResult = () => {} }) {
  if (!config.enabled || config.update_hours <= 0) return () => {};
  const kinds = Object.keys(SOURCES).filter((kind) => config[kind]);
  async function check() {
    for (const kind of kinds) {
      const onFail = (error) => onResult({ kind, ok: false, error: error.message });
      const set = await refreshIfStale(kind, { dir, maxAgeHours: config.update_hours, fetchFn, log, onFail });
      if (!set) continue;
      blocker.setSets({ [kind]: set });
      onResult({ kind, ok: true });
    }
  }
  const first = setTimeout(check, firstMs);
  return () => clearTimeout(first);
}

async function main(argv) {
  const at = argv.indexOf('--data-dir');
  const dir = listDir({ dataDir: at === -1 ? null : path.resolve(argv[at + 1]) });
  console.log(`listas em ${dir}`);
  for (const kind of Object.keys(SOURCES)) {
    const set = await refreshIfStale(kind, { dir, maxAgeHours: 0, log: console.log, force: true });
    if (!set) process.exitCode = 1;
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { SOURCES, downloadList, refreshIfStale, startUpdates };
