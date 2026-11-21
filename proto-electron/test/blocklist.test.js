'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHosts, inSet, createBlocker, loadLists } = require('../src/blocklist');
const { DEFAULTS, resolve } = require('../src/config');

const cfg = (over = {}) => ({ ...DEFAULTS.blocking, ...over });
const sets = {
  ads: parseHosts('127.0.0.1 localhost\n0.0.0.0 tracker.example.net\n0.0.0.0 ads.site.com # comentário\n'),
  malware: parseHosts('0.0.0.0 evil.test\nphish.test\n0.0.0.0 1.2.3.4\n'),
};

test('parseHosts: formatos, comentários, nomes locais e vários nomes por linha', () => {
  const s = parseHosts('# c\n\n127.0.0.1 localhost\n0.0.0.0 a.com b.com\nC.COM\n255.255.255.255 broadcasthost\n0.0.0.0 d.com.\n');
  assert.deepEqual([...s].sort(), ['a.com', 'b.com', 'c.com', 'd.com']);
});

test('inSet: o domínio e seus pais casam; irmãos e sufixos soltos não; IP só exato', () => {
  const s = parseHosts('tracker.net\n1.2.3.4\n');
  assert.equal(inSet('tracker.net', s), true);
  assert.equal(inSet('a.b.tracker.net', s), true);
  assert.equal(inSet('mytracker.net', s), false);
  assert.equal(inSet('net', s), false);
  assert.equal(inSet('1.2.3.4', s), true);
  assert.equal(inSet('11.2.3.4', s), false);
  assert.equal(inSet('x.com', new Set()), false);
});

test('anúncios: só subrecurso de OUTRO site; navegação e a própria página passam', () => {
  const b = createBlocker(cfg(), sets);
  assert.equal(b.decide('https://tracker.example.net/p.js', 'script', 'https://news.com/'), 'ads');
  assert.equal(b.decide('https://x.ads.site.com/i.gif', 'image', 'https://news.com/'), 'ads');
  assert.equal(b.decide('https://tracker.example.net/', 'mainFrame', ''), null);
  assert.equal(b.decide('https://tracker.example.net/p.js', 'script', 'https://tracker.example.net/home'), null);
  assert.equal(b.decide('https://cdn.example.net/p.js', 'script', 'https://news.com/'), null);
});

test('malware: bloqueia tudo, inclusive a navegação', () => {
  const b = createBlocker(cfg(), sets);
  assert.equal(b.decide('http://evil.test/x.exe', 'mainFrame', ''), 'malware');
  assert.equal(b.decide('https://sub.phish.test/', 'subFrame', 'https://news.com/'), 'malware');
  assert.equal(b.decide('http://1.2.3.4/a', 'mainFrame', ''), 'malware');
});

test('lista do usuário bloqueia tudo; allow vence tudo', () => {
  const b = createBlocker(cfg({ block: ['Irritante.com'], allow: ['evil.test', 'ads.site.com'] }), sets);
  assert.equal(b.decide('https://irritante.com/', 'mainFrame', ''), 'user');
  assert.equal(b.decide('https://cdn.irritante.com/a.js', 'script', 'https://x.com/'), 'user');
  assert.equal(b.decide('http://evil.test/', 'mainFrame', ''), null);
  assert.equal(b.decide('https://ads.site.com/i.gif', 'image', 'https://news.com/'), null);
});

test('enabled = false desliga tudo; ads/malware desligados saem da leitura', () => {
  const off = createBlocker(cfg({ enabled: false, block: ['x.com'] }), sets);
  assert.equal(off.decide('https://x.com/', 'mainFrame', ''), null);
  assert.equal(off.decide('http://evil.test/', 'mainFrame', ''), null);
  const lists = loadLists(cfg({ enabled: false }));
  assert.equal(lists.sets.ads.size, 0);
  assert.deepEqual(lists.warnings, []);
});

test('estatísticas contam por tipo; URL inválida não quebra', () => {
  const b = createBlocker(cfg(), sets);
  b.decide('https://tracker.example.net/a', 'script', 'https://n.com/');
  b.decide('http://evil.test/', 'mainFrame', '');
  assert.equal(b.decide('isso nao e url', 'script', ''), null);
  assert.deepEqual(b.stats, { ads: 1, malware: 1, user: 0 });
});

test('listas reais (se baixadas): domínios conhecidos de anúncio são pegos; sites comuns não', { skip: loadLists(cfg()).warnings.length > 0 }, () => {
  const { sets: real } = loadLists(cfg());
  const b = createBlocker(cfg(), real);
  assert.equal(b.decide('https://doubleclick.net/x', 'script', 'https://news.com/'), 'ads');
  assert.equal(b.decide('https://stats.g.doubleclick.net/x', 'xhr', 'https://news.com/'), 'ads');
  for (const ok of ['https://github.com/', 'https://www.google.com/', 'https://developer.mozilla.org/', 'https://wikipedia.org/',
    'https://portfolio.rafeu.dev/', 'https://www.youtube.com/', 'https://catalogo.estudesemfronteiras.com/']) {
    assert.equal(b.decide(ok, 'script', 'https://news.com/'), null, ok);
  }
});

test('config: blocking inválido volta ao padrão com aviso; lista Lua vazia vale como lista vazia', () => {
  const bad = resolve({ blocking: { enabled: 'sim', allow: 3 } });
  assert.equal(bad.config.blocking.enabled, true);
  assert.deepEqual(bad.config.blocking.allow, []);
  assert.equal(bad.warnings.length, 2);
  assert.deepEqual(resolve({ blocking: { block: {} } }).warnings, []);
});
