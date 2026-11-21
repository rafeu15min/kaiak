'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../src/security');
const { DEFAULTS, resolve } = require('../src/config');

const sec = DEFAULTS.security;

test('registrableDomain: 2 rótulos, 3 em co.uk/com.br, IP e intranet intactos', () => {
  assert.equal(s.registrableDomain('a.b.example.com'), 'example.com');
  assert.equal(s.registrableDomain('www.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(s.registrableDomain('x.famef.com.br'), 'famef.com.br');
  assert.equal(s.registrableDomain('192.168.1.50'), '192.168.1.50');
  assert.equal(s.registrableDomain('nas'), 'nas');
});

test('isThirdParty compara o site, ignora subdomínio, esquemas não-web e dados faltando', () => {
  assert.equal(s.isThirdParty('https://cdn.example.com/a.js', 'https://www.example.com/'), false);
  assert.equal(s.isThirdParty('https://tracker.net/p', 'https://www.example.com/'), true);
  assert.equal(s.isThirdParty('https://tracker.net/p', 'file:///ui/rail.html'), false);
  assert.equal(s.isThirdParty('https://tracker.net/p', ''), false);
  assert.equal(s.isThirdParty('http://localhost:1/', 'http://127.0.0.1:2/'), true);
});

test('httpsUpgrade: promove http público; poupa rede local, exceções e https', () => {
  assert.equal(s.httpsUpgrade('http://example.org/a?b=1', sec), 'https://example.org/a?b=1');
  assert.equal(s.httpsUpgrade('https://example.org/', sec), null);
  for (const h of ['http://localhost:8099/', 'http://127.0.0.1/', 'http://192.168.1.50:3000/', 'http://10.0.0.2:7070/',
    'http://172.20.0.5/', 'http://100.64.0.10:9119/', 'http://nas/', 'http://impressora.local/']) {
    assert.equal(s.httpsUpgrade(h, sec), null, h);
  }
  assert.equal(s.httpsUpgrade('http://antigo.exemplo/', { ...sec, https_exceptions: ['antigo.exemplo'] }), null);
  assert.equal(s.httpsUpgrade('http://example.org/', { ...sec, https_only: false }), null);
  assert.notEqual(s.httpsUpgrade('http://172.32.0.1/', sec), null, '172.32 não é privado');
});

test('cabeçalhos de saída: sem Cookie em terceiros, GPC, Referer só com a origem', () => {
  const h = { Cookie: 'a=1', Referer: 'https://site.com/pagina?q=segredo', Accept: '*/*' };
  const third = s.outgoingHeaders(h, true, sec);
  assert.equal(third.Cookie, undefined);
  assert.equal(third.Referer, 'https://site.com/');
  assert.equal(third['Sec-GPC'], '1');
  const first = s.outgoingHeaders(h, false, sec);
  assert.equal(first.Cookie, 'a=1');
  assert.equal(first.Referer, h.Referer);
  assert.equal(s.outgoingHeaders({ cookie: 'x' }, true, sec).cookie, undefined, 'nome em minúsculas também');
  assert.deepEqual(h, { Cookie: 'a=1', Referer: 'https://site.com/pagina?q=segredo', Accept: '*/*' }, 'entrada intacta');
});

test('cabeçalhos de entrada: Set-Cookie some só em terceiros e com a opção ligada', () => {
  const h = { 'set-cookie': ['a=1'], 'content-type': ['text/html'] };
  assert.equal(s.incomingHeaders(h, true, sec)['set-cookie'], undefined);
  assert.deepEqual(s.incomingHeaders(h, false, sec), h);
  assert.deepEqual(s.incomingHeaders(h, true, { ...sec, block_third_party_cookies: false }), h);
});

test('permissões e esquemas: só o que a config permite', () => {
  assert.equal(s.permissionAllowed('fullscreen', sec), true);
  assert.equal(s.permissionAllowed('geolocation', sec), false);
  assert.equal(s.permissionAllowed('media', { ...sec, permissions: ['media'] }), true);
  assert.equal(s.isAllowedUrl('https://a.com', sec.allowed_schemes), true);
  for (const u of ['file:///etc/passwd', 'javascript:alert(1)', 'chrome://gpu', 'data:text/html,x', 'lixo']) {
    assert.equal(s.isAllowedUrl(u, sec.allowed_schemes), false, u);
  }
});

test('config: segurança inválida volta ao padrão com aviso; tabela Lua vazia vira lista vazia', () => {
  const bad = resolve({ security: { https_only: 'sim', permissions: 5 } });
  assert.equal(bad.config.security.https_only, true);
  assert.deepEqual(bad.config.security.permissions, sec.permissions);
  assert.equal(bad.warnings.length, 2);
  const empty = resolve({ security: { permissions: {} } });
  assert.deepEqual(empty.config.security.permissions, []);
  assert.deepEqual(empty.warnings, []);
});

test('certException: só o host listado em security.cert_exceptions; o resto segue o padrão (recusa)', () => {
  const sec = { cert_exceptions: ['192.168.0.10', 'meu.servidor'] };
  assert.equal(s.certException('https://192.168.0.10:8443/x', sec), true);
  assert.equal(s.certException('https://meu.servidor/', sec), true);
  assert.equal(s.certException('https://outro.servidor/', sec), false);
  assert.equal(s.certException('https://sub.meu.servidor/', sec), false, 'subdomínio não herda a exceção');
  assert.equal(s.certException('lixo', sec), false);
  assert.equal(s.certException('https://x.test/', { cert_exceptions: [] }), false);
});
