'use strict';
// Domínio registrável ("site") pela Public Suffix List (lista embutida em data/, licença MPL-2.0).
// Regras: normal ("com.br"), curinga ("*.ck") e exceção ("!www.ck"). Vale o sufixo mais longo; exceção vence.
// Sem a lista (arquivo ausente) o padrão da PSL é "o último rótulo é o sufixo": cai em 2 rótulos.
const fs = require('node:fs');
const path = require('node:path');
const { domainToASCII } = require('node:url');

const LIST_FILE = path.join(__dirname, '..', 'data', 'public_suffix_list.dat');
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

const ascii = (rule) => (/^[\x00-\x7f]*$/.test(rule) ? rule : domainToASCII(rule));

function parseList(text) {
  const rules = new Set();
  const wildcards = new Set();
  const exceptions = new Set();
  for (const raw of text.split('\n')) {
    const line = raw.trim().split(/\s/)[0];
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('!')) exceptions.add(ascii(line.slice(1)));
    else if (line.startsWith('*.')) wildcards.add(ascii(line.slice(2)));
    else rules.add(ascii(line));
  }
  return { rules, wildcards, exceptions };
}

// Quantos rótulos (da direita) formam o sufixo público de `labels`.
function suffixLength(labels, list) {
  const n = labels.length;
  for (let i = 0; i < n; i++) {
    const candidate = labels.slice(i).join('.');
    if (list.exceptions.has(candidate)) return n - i - 1;
    if (list.rules.has(candidate)) return n - i;
    if (i + 1 < n && list.wildcards.has(labels.slice(i + 1).join('.'))) return n - i;
  }
  return 1;
}

function loadList() {
  try {
    return parseList(fs.readFileSync(LIST_FILE, 'utf8'));
  } catch {
    console.warn(`[kaiak] Public Suffix List ausente (${LIST_FILE}): usando 2 rótulos como "site"`);
    return parseList('');
  }
}

const LIST = loadList();

function registrableDomain(host, list = LIST) {
  if (IPV4.test(host) || host.includes(':') || !host.includes('.')) return host;
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  const size = suffixLength(labels, list);
  if (labels.length <= size) return host; // o próprio host é um sufixo público
  return labels.slice(-(size + 1)).join('.');
}

module.exports = { registrableDomain, parseList };
