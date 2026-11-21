'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFullscreen } = require('../src/fullscreen');

const make = (wasFullScreen = false) => {
  const log = [];
  const win = { isFullScreen: () => wasFullScreen, setFullScreen: (v) => log.push(['win', v]) };
  const fs = createFullscreen({
    win, setChromeVisible: (v) => log.push(['chrome', v]), applyPage: () => log.push(['apply']), restorePage: () => log.push(['restore']),
  });
  return { fs, log };
};
const wc = (name) => ({ name, isDestroyed: () => false, scripts: [], executeJavaScript(s) { this.scripts.push(s); return Promise.resolve(); } });

test('entrar: janela em tela cheia, barras escondidas, página cobre tudo; sair desfaz na ordem certa', () => {
  const { fs, log } = make();
  const a = wc('a');
  fs.enter(a);
  assert.deepEqual(log, [['win', true], ['chrome', false], ['apply']]);
  assert.ok(fs.active() && fs.owns(a));
  log.length = 0;
  fs.leave();
  assert.deepEqual(log, [['chrome', true], ['win', false], ['restore']]);
  assert.equal(fs.active(), false);
});

test('se a janela já estava em tela cheia, sair NÃO a tira dela', () => {
  const { fs, log } = make(true);
  fs.enter(wc('a')); log.length = 0;
  fs.leave();
  assert.deepEqual(log, [['chrome', true], ['restore']]);
});

test('entrar de novo ou sair sem entrar não faz nada', () => {
  const { fs, log } = make();
  fs.leave(); assert.deepEqual(log, []);
  const a = wc('a'); fs.enter(a); const n = log.length;
  fs.enter(wc('b')); assert.equal(log.length, n);
  assert.ok(fs.owns(a));
});

test('trocar de aba sai da tela cheia e avisa a página antiga; a mesma aba não sai', () => {
  const { fs, log } = make();
  const a = wc('a'); const b = wc('b');
  fs.enter(a); log.length = 0;
  fs.tabChanged(a); assert.deepEqual(log, []);
  fs.tabChanged(b);
  assert.deepEqual(log, [['chrome', true], ['win', false], ['restore']]);
  assert.match(a.scripts[0], /exitFullscreen/);
  fs.tabChanged(b); // sem tela cheia: nada
  assert.equal(log.length, 3);
});

test('aba antiga já destruída: trocar de aba não lança', () => {
  const { fs } = make();
  const a = { ...wc('a'), isDestroyed: () => true };
  fs.enter(a);
  assert.doesNotThrow(() => fs.tabChanged(wc('b')));
});
