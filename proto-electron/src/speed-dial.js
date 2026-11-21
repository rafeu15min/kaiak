'use strict';
// Atalhos que o usuário adiciona/remove pela própria página inicial (DADOS, num arquivo JSON; os atalhos fixos ficam no .lua).
// Módulo sem Electron: recebe o caminho do arquivo. Gravação atômica (arquivo temporário + rename).
const crypto = require('node:crypto');
const { readJson, writeJsonAtomic } = require('./json-file');

const MAX_ITEMS = 200;
const MAX_TITLE = 40;
const MAX_URL = 2000;

// { title, url } -> item válido ({ error } se não servir). Só http(s): a página inicial nunca aponta para outros esquemas.
function checkItem(input) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const url = typeof input?.url === 'string' ? input.url.trim() : '';
  if (title === '' || title.length > MAX_TITLE) return { error: `título de 1 a ${MAX_TITLE} caracteres` };
  if (url.length > MAX_URL) return { error: 'endereço longo demais' };
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return { error: 'só http:// ou https://' };
    return { title, url: parsed.href };
  } catch {
    return { error: 'endereço inválido (use https://...)' };
  }
}

function createSpeedDial(file) {
  const read = () => {
    const list = readJson(file, []);
    return Array.isArray(list) ? list.filter((item) => item && typeof item.id === 'string' && !checkItem(item).error).slice(0, MAX_ITEMS) : [];
  };
  const write = (list) => writeJsonAtomic(file, list);
  return {
    list: read,
    add(input) {
      const item = checkItem(input);
      if (item.error) return item;
      const list = read();
      if (list.length >= MAX_ITEMS) return { error: `no máximo ${MAX_ITEMS} atalhos` };
      const saved = { id: crypto.randomBytes(6).toString('hex'), ...item };
      write([...list, saved]);
      return saved;
    },
    remove(id) {
      const list = read();
      const next = list.filter((item) => item.id !== id);
      if (next.length === list.length) return { error: 'atalho não encontrado' };
      write(next);
      return { ok: true };
    },
  };
}

module.exports = { createSpeedDial, checkItem, MAX_ITEMS };
