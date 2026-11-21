'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TabManager } = require('../src/tabs');

// Janela falsa: guarda o que o TabManager pede, sem Electron.
function fakeHost() {
  const log = { created: [], ended: 0 };
  const wc = () => ({ loadURL() {}, on() {}, once() {}, setWindowOpenHandler() {}, focus() {}, close() {}, navigationHistory: { canGoBack: () => false, canGoForward: () => false } });
  return {
    log,
    toUrl: (t) => t,
    createView(isPrivate) { log.created.push(isPrivate); return { webContents: wc() }; },
    show() {}, hide() {}, changed() {},
    privateEnded() { log.ended++; },
  };
}

test('aba privada pede view privada e aparece marcada no estado', () => {
  const host = fakeHost();
  const tabs = new TabManager(host);
  tabs.open('https://a.com');
  tabs.open('https://b.com', false, true);
  assert.deepEqual(host.log.created, [false, true]);
  const snap = tabs.snapshot();
  assert.deepEqual(snap.tabs.map((t) => t.private), [false, true]);
  assert.equal(snap.activePrivate, true);
  tabs.select(1);
  assert.equal(tabs.snapshot().activePrivate, false);
});

test('a sessão privada só é apagada quando a ÚLTIMA aba privada fecha', () => {
  const host = fakeHost();
  const tabs = new TabManager(host);
  tabs.open('https://a.com');
  const p1 = tabs.open('https://p1.com', false, true);
  const p2 = tabs.open('https://p2.com', false, true);
  tabs.close(p1.id);
  assert.equal(host.log.ended, 0);
  tabs.close(p2.id);
  assert.equal(host.log.ended, 1);
});

test('fechar aba normal não apaga a sessão privada; descartar aba privada também não', () => {
  const host = fakeHost();
  const tabs = new TabManager(host);
  const a = tabs.open('https://a.com');
  const p = tabs.open('https://p.com', false, true);
  tabs.close(a.id);
  assert.equal(host.log.ended, 0);
  tabs.open('https://c.com');
  p.lastActive = 0; // depois do open: sair do foco regrava lastActive
  tabs.discardStale(1);
  assert.equal(p.view, null);
  assert.equal(host.log.ended, 0);
  assert.equal(tabs.tabs.includes(p), true);
});

test('reabrir uma aba privada descartada continua privada', () => {
  const host = fakeHost();
  const tabs = new TabManager(host);
  const p = tabs.open('https://p.com', false, true);
  tabs.open('https://a.com');
  p.lastActive = 0;
  tabs.discardStale(1);
  tabs.select(p.id);
  assert.deepEqual(host.log.created, [true, false, true]);
});
