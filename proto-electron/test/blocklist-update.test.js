'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { downloadList, refreshIfStale, startUpdates, SOURCES } = require('../src/blocklist-update');
const { createBlocker, loadLists, listDir, parseHosts } = require('../src/blocklist');
const { DEFAULTS, resolve } = require('../src/config');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kk-bl-'));
const hosts = (n, prefix = 'd') => Array.from({ length: n }, (_, i) => `0.0.0.0 ${prefix}${i}.test`).join('\n');
const ok = (body) => async () => ({ ok: true, status: 200, text: async () => body });
const cfg = (over = {}) => ({ ...DEFAULTS.blocking, ...over });

test('downloadList grava a lista e devolve o conjunto', async () => {
  const dir = tmp();
  const set = await downloadList('malware', dir, ok(hosts(60)));
  assert.equal(set.size, 60);
  assert.equal(fs.readFileSync(path.join(dir, SOURCES.malware.file), 'utf8'), hosts(60));
  assert.equal(fs.existsSync(path.join(dir, `${SOURCES.malware.file}.tmp`)), false, 'sem arquivo temporário sobrando');
});

test('HTTP de erro ou lista pequena demais NÃO apaga a lista boa', async () => {
  const dir = tmp();
  const file = path.join(dir, SOURCES.malware.file);
  fs.writeFileSync(file, hosts(80, 'bom'));
  await assert.rejects(downloadList('malware', dir, async () => ({ ok: false, status: 500, text: async () => '' })), /HTTP 500/);
  await assert.rejects(downloadList('malware', dir, ok('<html>captive portal</html>')), /suspeita/);
  await assert.rejects(downloadList('malware', dir, async () => { throw new Error('sem rede'); }), /sem rede/);
  assert.equal(fs.readFileSync(file, 'utf8'), hosts(80, 'bom'));
});

test('refreshIfStale: lista nova não baixa; velha baixa; falha vira log e null', async () => {
  const dir = tmp();
  const file = path.join(dir, SOURCES.malware.file);
  fs.writeFileSync(file, hosts(80, 'velho'));
  const logs = [];
  let calls = 0;
  const fetchFn = async () => { calls++; return ok(hosts(70, 'novo'))(); };
  assert.equal(await refreshIfStale('malware', { dir, maxAgeHours: 12, fetchFn, log: (m) => logs.push(m) }), null);
  assert.equal(calls, 0);
  const old = new Date(Date.now() - 13 * 3600 * 1000);
  fs.utimesSync(file, old, old);
  const set = await refreshIfStale('malware', { dir, maxAgeHours: 12, fetchFn, log: (m) => logs.push(m) });
  assert.equal(set.size, 70);
  assert.equal(calls, 1);
  fs.utimesSync(file, old, old);
  const failed = await refreshIfStale('malware', { dir, maxAgeHours: 12, fetchFn: async () => { throw new Error('x'); }, log: (m) => logs.push(m) });
  assert.equal(failed, null);
  assert.match(logs.at(-1), /falha ao atualizar/);
});

test('arquivo inexistente conta como velho: baixa na primeira vez', async () => {
  const dir = tmp();
  const set = await refreshIfStale('malware', { dir, maxAgeHours: 12, fetchFn: ok(hosts(55)), log() {} });
  assert.equal(set.size, 55);
});

test('startUpdates troca a lista no bloqueador sem reiniciar; update_hours = 0 não faz nada', async () => {
  const dir = tmp();
  const blocker = createBlocker(cfg(), { malware: parseHosts('antigo.test') });
  assert.equal(blocker.decide('http://novo0.test/', 'mainFrame', ''), null);
  const results = [];
  const stop = startUpdates({ config: cfg({ ads: false }), dir, blocker, fetchFn: ok(hosts(60, 'novo')), log() {}, firstMs: 5, onResult: (r) => results.push(r) });
  await new Promise((r) => setTimeout(r, 150));
  stop();
  assert.deepEqual(results, [{ kind: 'malware', ok: true }]);
  assert.equal(blocker.decide('http://novo0.test/', 'mainFrame', ''), 'malware');
  assert.equal(blocker.decide('http://antigo.test/', 'mainFrame', ''), null, 'a lista antiga foi substituída');
  let called = false;
  const off = startUpdates({ config: cfg({ update_hours: 0 }), dir, blocker, fetchFn: async () => { called = true; return ok('')(); }, log() {}, firstMs: 1 });
  await new Promise((r) => setTimeout(r, 40));
  off();
  assert.equal(called, false);
});

test('explain: motivo de uma navegação sem contar estatística; anúncio em navegação não bloqueia', () => {
  const b = createBlocker(cfg({ block: ['x.test'] }), { malware: parseHosts('evil.test'), ads: parseHosts('ads.test') });
  assert.equal(b.explain('http://evil.test/a'), 'malware');
  assert.equal(b.explain('http://x.test/'), 'user');
  assert.equal(b.explain('http://ads.test/'), null);
  assert.equal(b.explain('lixo'), null);
  assert.deepEqual(b.stats, { ads: 0, malware: 0, user: 0 });
});

test('loadLists: ausente avisa conforme update_hours; lista velha (>7 dias) avisa; nova não', () => {
  const dir = tmp();
  assert.match(loadLists(cfg(), dir).warnings[0].text, /baixando em segundo plano/);
  assert.equal(loadLists(cfg(), dir).warnings[0].kind, 'ads');
  assert.equal(loadLists(cfg(), dir).warnings[0].transient, true, 'baixando: só informa, some sozinho');
  assert.match(loadLists(cfg({ update_hours: 0 }), dir).warnings[0].text, /npm run blocklists/);
  assert.equal(loadLists(cfg({ update_hours: 0 }), dir).warnings[0].transient, false, 'pede ação: fica na faixa');
  const file = path.join(dir, SOURCES.malware.file);
  fs.writeFileSync(file, hosts(60));
  assert.equal(loadLists(cfg({ ads: false }), dir).warnings.length, 0);
  const old = new Date(Date.now() - 9 * 86400 * 1000);
  fs.utimesSync(file, old, old);
  assert.match(loadLists(cfg({ ads: false }), dir).warnings[0].text, /tem 9 dias/);
  assert.equal(loadLists(cfg({ ads: false }), dir).warnings[0].transient, false);
});

test('listDir: --data-dir e XDG_DATA_HOME', () => {
  assert.equal(listDir({ dataDir: '/x/y' }), '/x/y/blocklists');
  assert.equal(listDir({}, { XDG_DATA_HOME: '/d' }), '/d/kaiak/blocklists');
});

test('config: update_hours fora da faixa volta ao padrão', () => {
  const r = resolve({ blocking: { update_hours: -3 } });
  assert.equal(r.config.blocking.update_hours, 12);
  assert.equal(r.warnings.length, 1);
});

test('startUpdates roda uma vez só (sem repetição durante o uso) e reporta a falha por lista', async () => {
  const dir = tmp();
  const blocker = createBlocker(cfg(), {});
  let calls = 0;
  const results = [];
  const stop = startUpdates({
    config: cfg({ ads: false }), dir, blocker, log() {}, firstMs: 5, onResult: (r) => results.push(r),
    fetchFn: async () => { calls++; throw new Error('sem rede'); },
  });
  await new Promise((r) => setTimeout(r, 200));
  stop();
  assert.equal(calls, 1);
  assert.deepEqual(results, [{ kind: 'malware', ok: false, error: 'sem rede' }]);
});
