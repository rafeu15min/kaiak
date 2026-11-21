'use strict';
const BLANK = 'about:blank';
const LOCAL = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/; // rede local: http, o HTTPS costuma não existir

const hasScheme = (t) => t.includes('://') || /^(about|file|data):/.test(t);

// "%s" vira a consulta codificada (split/join evita os padrões especiais do String.replace).
const searchUrl = (template, query) => template.split('%s').join(encodeURIComponent(query).replace(/%20/g, '+'));

// Cria o conversor "texto da barra -> URL" com os mecanismos de busca da config:
//   esquema -> como está | "yt lofi" (palavra = mecanismo) -> busca nele | localhost/IP -> http |
//   "dominio.tld" -> https | resto -> busca no mecanismo padrão.
function createResolver({ default: fallback, engines }) {
  return function toUrl(text) {
    const t = text.trim();
    if (hasScheme(t)) return t;
    const [word, ...rest] = t.split(/\s+/);
    if (rest.length > 0 && engines[word]) return searchUrl(engines[word], rest.join(' '));
    if (LOCAL.test(t)) return `http://${t}`;
    if (t.includes('.') && !t.includes(' ')) return `https://${t}`;
    return searchUrl(engines[fallback], t);
  };
}

module.exports = { createResolver, searchUrl, BLANK };
