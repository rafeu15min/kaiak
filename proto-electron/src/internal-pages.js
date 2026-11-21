'use strict';
// Esquema kaiak:// (páginas internas). Só as rotas listadas existem; qualquer outra dá 404. Sites NÃO navegam para cá:
// 'kaiak:' não está em security.allowed_schemes, então guardNavigation barra links e redirecionamentos de páginas.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { protocol } = require('electron');

const SCHEME = 'kaiak';
const HTML = { 'content-type': 'text/html; charset=utf-8' };
const SCRIPT = { 'content-type': 'text/javascript; charset=utf-8' };

// Antes de app.whenReady(): o esquema precisa ser declarado como "padrão" e seguro.
function declareScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

const JSON_HEADERS = { 'content-type': 'application/json' };
const MAX_BODY = 8 * 1024;

// POST em kaiak://<rota>/api/...: corpo JSON pequeno que traga o TOKEN da sessão. O token nasce a cada partida e só vai
// dentro da página gerada; um site não lê essa página (nem alcança kaiak://: a navegação é barrada e o fetch cruzado falha
// no CORS), então só a própria página inicial consegue chamar. (O cabeçalho Origin chega como "null" nesse esquema, não serve.)
async function handleApi(request, url, api, token) {
  const handler = api[`${url.hostname}${url.pathname.replace(/^\/api/, '')}`];
  const deny = (status, error) => new Response(JSON.stringify({ error }), { status, headers: JSON_HEADERS });
  if (!handler || request.method !== 'POST') return deny(403, 'negado');
  const text = await request.text();
  if (text.length > MAX_BODY) return deny(413, 'corpo grande demais');
  let body;
  try { body = JSON.parse(text); } catch { return deny(400, 'JSON inválido'); }
  if (typeof body?.token !== 'string' || body.token.length !== token.length || !crypto.timingSafeEqual(Buffer.from(body.token), Buffer.from(token))) return deny(403, 'negado');
  return new Response(JSON.stringify(handler(body)), { headers: JSON_HEADERS });
}

// routes: { 'start': () => html }. api: { 'start/dial/add': (body) => objeto } (+ token da sessão). Atende kaiak://<rota>, scripts estáticos de ui/ e a API.
function serveInternal(ses, routes, uiDir, { api = {}, token = '' } = {}) {
  ses.protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, url, api, token);
    const route = routes[url.hostname];
    if (route && (url.pathname === '/' || url.pathname === '')) return new Response(route(), { headers: HTML });
    const isScript = route && /^\/[\w-]+\.js$/.test(url.pathname);
    if (!isScript) return new Response('não encontrado', { status: 404 });
    return new Response(fs.readFileSync(path.join(uiDir, url.pathname.slice(1))), { headers: SCRIPT });
  });
}

module.exports = { declareScheme, serveInternal, SCHEME };
