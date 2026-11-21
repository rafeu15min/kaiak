'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { TabManager } = require('../src/tabs');

// webContents falso: reload() "termina" depois de `delay` ms (nunca, se delay = null).
// Páginas kaiak:// só ficam prontas com o marcador no console; as outras, com o fim do carregamento.
const fakeView = (url, delay, { stopOnly = false } = {}) => {
  const wc = new EventEmitter();
  wc.reloads = 0;
  wc.getURL = () => url;
  wc.reload = () => {
    wc.reloads++;
    if (delay === null) return;
    setTimeout(() => {
      wc.emit('did-stop-loading');
      if (url.startsWith('kaiak://') && !stopOnly) setTimeout(() => wc.emit('console-message', { message: 'kaiak:ready' }), 5);
    }, delay);
  };
  return { webContents: wc };
};
const manager = (specs) => {
  const m = new TabManager({ changed() {}, createView() { return null; }, show() {}, hide() {} });
  m.tabs = specs.map(([url, view], i) => ({ id: i + 1, url, view }));
  return m;
};
const isStart = (url) => url.startsWith('kaiak://start');

test('reloadMatching recarrega só as abas vivas que casam e resolve DEPOIS de todas ficarem prontas', async () => {
  const a = fakeView('kaiak://start/', 30); const b = fakeView('kaiak://start/', 60); const other = fakeView('https://x.test/', 5);
  const m = manager([['kaiak://start/', a], ['kaiak://start/', b], ['https://x.test/', other], ['kaiak://start/', null]]);
  const started = Date.now();
  await m.reloadMatching(isStart);
  assert.ok(Date.now() - started >= 60, 'esperou a mais lenta (carregamento + marcador)');
  assert.deepEqual([a, b, other].map((v) => v.webContents.reloads), [1, 1, 0]);
});

test('página kaiak:// que só terminou de carregar (sem o marcador) NÃO conta como pronta: vale o prazo', async () => {
  const noMarker = fakeView('kaiak://start/', 5, { stopOnly: true });
  const started = Date.now();
  await manager([['kaiak://start/', noMarker]]).reloadMatching(isStart, 120);
  assert.ok(Date.now() - started >= 110, 'esperou o prazo, não o did-stop-loading');
});

test('reloadMatching não trava se uma aba nunca termina: resolve no prazo e não deixa ouvinte pendurado', async () => {
  const stuck = fakeView('kaiak://start/', null);
  const started = Date.now();
  await manager([['kaiak://start/', stuck]]).reloadMatching(() => true, 80);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 75 && elapsed < 400, `resolveu em ${elapsed} ms`);
  assert.equal(stuck.webContents.listenerCount('did-stop-loading'), 0);
  assert.equal(stuck.webContents.listenerCount('console-message'), 0);
});

test('reloadMatching sem nenhuma aba que case resolve na hora', async () => {
  await manager([['https://x.test/', fakeView('https://x.test/', 10)]]).reloadMatching(isStart);
});
