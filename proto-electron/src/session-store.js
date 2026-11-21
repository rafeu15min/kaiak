'use strict';
// Sessão (abas abertas) guardada em disco: { tabs: [{ url, title, icon }], active }. Módulo sem Electron.
// Abas PRIVADAS nunca entram aqui (quem chama as filtra). Tudo que volta do disco é revalidado: só URLs que o
// navegador já abriria (http, https, a página inicial kaiak://start), textos curtos, ícone http(s).
const { readJson, writeJsonAtomic } = require('./json-file');

const MAX_TABS = 300;
const MAX_URL = 2000;
const MAX_TITLE = 200;
const START_URL = /^kaiak:\/\/start\/?$/;

const isText = (value, max) => typeof value === 'string' && value.length <= max;

// Um item vindo do disco -> item limpo, ou null se não serve.
function cleanTab(item) {
  if (!item || !isText(item.url, MAX_URL)) return null;
  let u;
  try { u = new URL(item.url); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) && !START_URL.test(item.url)) return null;
  const icon = isText(item.icon, MAX_URL) && /^https?:\/\//.test(item.icon) ? item.icon : '';
  return { url: item.url, title: isText(item.title, MAX_TITLE) ? item.title : '', icon };
}

function createSessionStore(file) {
  return {
    // -> { tabs, active } (active = índice dentro de tabs). Arquivo ausente ou ruim = sessão vazia.
    load() {
      const raw = readJson(file, null);
      const tabs = Array.isArray(raw?.tabs) ? raw.tabs.map(cleanTab).filter(Boolean).slice(0, MAX_TABS) : [];
      const active = Number.isInteger(raw?.active) && raw.active >= 0 && raw.active < tabs.length ? raw.active : Math.max(0, tabs.length - 1);
      return { tabs, active };
    },
    save(state) {
      const tabs = state.tabs.map(cleanTab).filter(Boolean).slice(0, MAX_TABS);
      writeJsonAtomic(file, { tabs, active: Math.min(Math.max(0, state.active), Math.max(0, tabs.length - 1)) });
    },
  };
}

module.exports = { createSessionStore, cleanTab, MAX_TABS };
