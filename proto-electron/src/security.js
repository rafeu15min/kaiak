'use strict';
// Segurança e privacidade da sessão: funções PURAS (testáveis sem Electron) + a ligação com a sessão.
// Tudo é configurável por k.security{...}. "Mesmo site" vem da Public Suffix List (psl.js).
const { registrableDomain } = require('./psl');
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const WEB = new Set(['http:', 'https:']);

function parse(url) {
  try { return new URL(url); } catch { return null; }
}

// Terceiro = pedido web cujo site difere do site da página de topo. Sem dados ou fora de http(s): não é.
function isThirdParty(requestUrl, topUrl) {
  const req = parse(requestUrl);
  const top = parse(topUrl);
  if (!req || !top || !WEB.has(req.protocol) || !WEB.has(top.protocol)) return false;
  return registrableDomain(req.hostname) !== registrableDomain(top.hostname);
}

function isPrivateHost(host) {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '[::1]' || !host.includes('.')) return true; // nome de intranet sem ponto
  const m = IPV4.test(host) && host.split('.').map(Number);
  if (!m) return false;
  const [a, b] = m;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
    || (a === 100 && b >= 64 && b <= 127); // 100.64/10: Tailscale e CGNAT
}

// URL https para a qual um http deve ser promovido, ou null (já é https, rede local ou exceção).
function httpsUpgrade(url, security) {
  const u = parse(url);
  if (!security.https_only || !u || u.protocol !== 'http:') return null;
  if (isPrivateHost(u.hostname) || security.https_exceptions.includes(u.hostname)) return null;
  u.protocol = 'https:';
  return u.toString();
}

// O host da URL está em security.cert_exceptions? Aí o erro de certificado é ignorado para ele (decisão do dono, só no .lua).
function certException(url, security) {
  const u = parse(url);
  return !!u && security.cert_exceptions.includes(u.hostname);
}

const isAllowedUrl = (url, schemes) => {
  const u = parse(url);
  return !!u && schemes.includes(u.protocol);
};

const permissionAllowed = (permission, security) => security.permissions.includes(permission);

function dropHeader(headers, name) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) if (key.toLowerCase() === lower) delete headers[key];
}

// Cabeçalhos de saída: sem Cookie em terceiros, sinal GPC/DNT, Referer só com a origem em terceiros.
function outgoingHeaders(headers, third, security) {
  const out = { ...headers };
  if (third && security.block_third_party_cookies) dropHeader(out, 'Cookie');
  if (security.send_gpc) Object.assign(out, { 'Sec-GPC': '1', DNT: '1' });
  const referer = Object.keys(out).find((k) => k.toLowerCase() === 'referer');
  if (third && security.trim_referrer && referer) out[referer] = `${new URL(out[referer]).origin}/`;
  return out;
}

function incomingHeaders(headers, third, security) {
  if (!third || !security.block_third_party_cookies) return headers;
  const out = { ...headers };
  dropHeader(out, 'Set-Cookie');
  return out;
}

const topUrlOf = (details) => details.frame?.top?.url || details.webContents?.getURL() || '';
// Navegação de topo é sempre "primeira parte"; só subrecursos e subframes são comparados.
const thirdPartyOf = (details) => details.resourceType !== 'mainFrame' && isThirdParty(details.url, topUrlOf(details));

const WEB_FILTER = { urls: ['http://*/*', 'https://*/*'] };
const BLOCK_FILTER = { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }; // o bloqueio também vale para WebSocket

// Liga tudo à sessão (chamar uma vez, depois do app pronto).
function applySession(ses, security, blocker = null, hooks = {}) {
  // Sem corretor ortográfico: o Electron baixaria o dicionário dos servidores do Google (gvt1.com) sozinho.
  ses.setSpellCheckerEnabled(false);
  ses.setSpellCheckerLanguages([]);
  ses.setPermissionRequestHandler((_wc, permission, done) => done(permissionAllowed(permission, security)));
  ses.setPermissionCheckHandler((_wc, permission) => permissionAllowed(permission, security));
  ses.webRequest.onBeforeRequest(BLOCK_FILTER, (details, done) => {
    if (blocker?.decide(details.url, details.resourceType, topUrlOf(details))) {
      done({ cancel: true });
      return;
    }
    const target = ['mainFrame', 'subFrame'].includes(details.resourceType) ? httpsUpgrade(details.url, security) : null;
    if (target) hooks.onUpgrade?.(new URL(details.url).hostname);
    done(target ? { redirectURL: target } : {});
  });
  ses.webRequest.onBeforeSendHeaders(WEB_FILTER, (details, done) => {
    done({ requestHeaders: outgoingHeaders(details.requestHeaders, thirdPartyOf(details), security) });
  });
  ses.webRequest.onHeadersReceived(WEB_FILTER, (details, done) => {
    done({ responseHeaders: incomingHeaders(details.responseHeaders, thirdPartyOf(details), security) });
  });
}

// Páginas só navegam para esquemas permitidos (sem file:, javascript:, esquemas do sistema).
function guardNavigation(webContents, security) {
  const block = (event, url) => { if (!isAllowedUrl(url, security.allowed_schemes)) event.preventDefault(); };
  webContents.on('will-navigate', block);
  webContents.on('will-redirect', block);
}

module.exports = {
  registrableDomain, isThirdParty, isPrivateHost, httpsUpgrade, certException, isAllowedUrl, permissionAllowed,
  outgoingHeaders, incomingHeaders, applySession, guardNavigation,
};
