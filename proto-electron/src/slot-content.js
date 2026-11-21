'use strict';
// O que pode morar num slot do layout (a chave `content`). Módulo PURO (sem Electron), usado pela validação da config
// e pela partida do navegador. Formas aceitas:
//   "tabs" | "address" | "buttons"           interfaces do próprio KaiaK ("buttons" = faixa só de botões, ver k.button)
//   { url = "https://...", partition? }      um SITE (painel web), com sessão isolada própria
//   { html = "...", css? }                   HTML seu, só leitura (sem script, como os avisos)
//   { file = "~/painel.html" }               arquivo local, com script, isolado e sem acesso ao navegador
const BUILTIN = { tabs: 'rail.html', address: 'bar.html', buttons: 'buttons.html' }; // nome -> arquivo da interface

const FIELDS = { url: ['url', 'partition'], html: ['html', 'css'], file: ['file'] };
const KINDS = Object.keys(FIELDS);
const ALL_KEYS = Object.values(FIELDS).flat();
const MAX_HTML = 200_000;

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.length > 0;

const EXPECTED = 'um de: "tabs", "address", "buttons", ou uma tabela com exatamente UM de url = "https://...", html = "...", file = "caminho"';

// Tipo do conteúdo: 'builtin' | 'url' | 'html' | 'file'. Assume um conteúdo já validado.
function contentKind(content) {
  if (typeof content === 'string') return 'builtin';
  return KINDS.find((kind) => kind in content);
}

// Verificação de cada campo; devolve a descrição do problema ou null.
const FIELD_CHECKS = {
  url: (v) => (typeof v === 'string' && /^https?:\/\/\S+$/.test(v) ? null : '"url" deve ser um endereço http:// ou https://'),
  partition: (v) => (typeof v === 'string' && /^[A-Za-z][\w-]{0,31}$/.test(v) ? null : '"partition" deve ser um nome (letras, números, - e _; até 32)'),
  html: (v) => (isText(v) && v.length <= MAX_HTML ? null : `"html" deve ser um texto não vazio (até ${MAX_HTML} caracteres)`),
  css: (v) => (typeof v === 'string' ? null : '"css" deve ser um texto'),
  file: (v) => (isText(v) ? null : '"file" deve ser o caminho de um arquivo ("~/" vale)'),
};

// Devolve null se o conteúdo é válido, ou o motivo (em português) se não for.
function checkContent(content) {
  if (typeof content === 'string') return content in BUILTIN ? null : `"${content}" não é um conteúdo conhecido (esperado ${EXPECTED})`;
  if (!isPlain(content)) return `esperado ${EXPECTED}`;
  const present = KINDS.filter((kind) => kind in content);
  if (present.length !== 1) return `esperado exatamente UM de url, html ou file (veio: ${present.join(', ') || 'nenhum'})`;
  const allowed = FIELDS[present[0]];
  const stray = Object.keys(content).find((key) => !allowed.includes(key));
  if (stray) return ALL_KEYS.includes(stray) ? `"${stray}" não vale junto de "${present[0]}"` : `chave desconhecida "${stray}" (para ${present[0]}: ${allowed.join(', ')})`;
  return allowed.map((key) => (key in content ? FIELD_CHECKS[key](content[key]) : null)).find(Boolean) ?? null;
}

module.exports = { BUILTIN, contentKind, checkContent };
