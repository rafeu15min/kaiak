'use strict';
// Bloqueio por domínio (formato "hosts"): anúncios/rastreadores e malware, mais a lista do usuário.
// Decisão por pedido: allow > user block > malware (inclusive navegação) > anúncios (só subrecursos
// de OUTRO site). Sem filtros cosméticos nem regras de caminho: bloqueia o domínio inteiro.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registrableDomain } = require('./psl');

const STALE_DAYS = 7; // lista mais velha que isso: a atualização automática provavelmente está falhando
const FILES = { ads: 'ads.hosts', malware: 'malware.hosts' };
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const LOCAL_NAMES = new Set(['localhost', 'localhost.localdomain', 'local', 'broadcasthost', 'ip6-localhost',
  'ip6-loopback', 'ip6-localnet', 'ip6-mcastprefix', 'ip6-allnodes', 'ip6-allrouters', 'ip6-allhosts',
  '0.0.0.0', '127.0.0.1']);

const norm = (name) => String(name).trim().toLowerCase().replace(/\.$/, '');

function addName(set, name) {
  const host = norm(name);
  if (host && !LOCAL_NAMES.has(host)) set.add(host);
}

// "0.0.0.0 dominio" (um ou mais nomes por linha) ou só "dominio"; comentários com #.
const FAST_PREFIX = '0.0.0.0 ';

function parseLine(set, raw) {
  if (raw.startsWith(FAST_PREFIX) && !/[\s#]/.test(raw.slice(FAST_PREFIX.length).trimEnd())) {
    addName(set, raw.slice(FAST_PREFIX.length)); // caminho rápido: ~99% das linhas das listas
    return;
  }
  const parts = raw.split('#')[0].trim().split(/\s+/);
  const names = parts.length > 1 ? parts.slice(1) : parts;
  names.forEach((name) => addName(set, name));
}

function parseHosts(text) {
  const set = new Set();
  for (const raw of text.split('\n')) {
    if (raw.charCodeAt(0) !== 35) parseLine(set, raw); // 35 = '#': pula comentário inteiro
  }
  return set;
}

// O host ou qualquer domínio-pai está no conjunto? (IP: só igualdade exata.)
function inSet(host, set) {
  if (set.size === 0) return false;
  if (IPV4.test(host)) return set.has(host);
  let current = host;
  while (!set.has(current)) {
    const dot = current.indexOf('.');
    if (dot === -1) return false;
    current = current.slice(dot + 1);
  }
  return true;
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

const isOtherSite = (host, topHost) => !topHost || registrableDomain(host) !== registrableDomain(topHost);

// Pasta de dados do KaiaK: --data-dir ou $XDG_DATA_HOME/kaiak (~/.local/share/kaiak).
function dataDir(opts = {}, env = process.env) {
  const dataHome = env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return opts.dataDir || path.join(dataHome, 'kaiak');
}

// Onde ficam as listas: --data-dir/blocklists ou $XDG_DATA_HOME/kaiak/blocklists (~/.local/share/kaiak/...).
function listDir(opts = {}, env = process.env) {
  return path.join(dataDir(opts, env), 'blocklists');
}

function readList(dir, file) {
  try {
    const full = path.join(dir, file);
    return { set: parseHosts(fs.readFileSync(full, 'utf8')), ageDays: (Date.now() - fs.statSync(full).mtimeMs) / 86400000 };
  } catch {
    return null;
  }
}

// transient: só informa (o KaiaK já está baixando); some sozinho. O que pede ação do usuário fica na faixa.
function listWarning(kind, list, config) {
  if (!list) {
    const downloading = config.update_hours > 0;
    const fix = downloading ? 'baixando em segundo plano' : 'rode "npm run blocklists"';
    return { text: `lista de bloqueio "${kind}" ausente: ${fix}`, transient: downloading };
  }
  if (list.ageDays <= STALE_DAYS) return null;
  const text = `lista de bloqueio "${kind}" tem ${Math.floor(list.ageDays)} dias: a atualização falhou? (rode "npm run blocklists")`;
  return { text, transient: false };
}

// Lê só as listas ligadas. Lista ausente ou velha vira aviso, não erro.
function loadLists(config, dir = listDir()) {
  const sets = { ads: new Set(), malware: new Set() };
  const warnings = [];
  if (!config.enabled) return { sets, warnings };
  for (const kind of Object.keys(FILES).filter((k) => config[k])) {
    const list = readList(dir, FILES[kind]);
    if (list) sets[kind] = list.set;
    const warning = listWarning(kind, list, config);
    if (warning) warnings.push({ kind, ...warning });
  }
  return { sets, warnings };
}

function createBlocker(config, sets = {}) {
  let ads = sets.ads ?? new Set();
  let malware = sets.malware ?? new Set();
  const block = new Set(config.block.map(norm));
  const allow = new Set(config.allow.map(norm));
  const stats = { ads: 0, malware: 0, user: 0 };

  function classify(host, resourceType, topHost) {
    if (inSet(host, allow)) return null;
    if (inSet(host, block)) return 'user';
    if (inSet(host, malware)) return 'malware';
    const subresource = resourceType !== 'mainFrame';
    return subresource && inSet(host, ads) && isOtherSite(host, topHost) ? 'ads' : null;
  }

  return {
    stats,
    // Troca listas já em uso (atualização automática), sem reiniciar.
    setSets(next) {
      ads = next.ads ?? ads;
      malware = next.malware ?? malware;
    },
    // Motivo pelo qual uma NAVEGAÇÃO a esta URL seria bloqueada, sem contar estatística (página de bloqueio).
    explain(url) {
      const host = hostOf(url);
      return config.enabled && host ? classify(host, 'mainFrame', '') : null;
    },
    // Devolve 'user' | 'malware' | 'ads' (bloquear) ou null (deixar passar).
    decide(url, resourceType, topUrl) {
      if (!config.enabled) return null;
      const host = hostOf(url);
      const kind = host ? classify(host, resourceType, hostOf(topUrl)) : null;
      if (kind) stats[kind]++;
      return kind;
    },
  };
}

module.exports = { parseHosts, inSet, createBlocker, loadLists, listDir, dataDir };
