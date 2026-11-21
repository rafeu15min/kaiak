'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSessionStore, cleanTab, MAX_TABS } = require('../src/session-store');
const { TabManager } = require('../src/tabs');
const { resolve } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kk-sess-')), 'sub', 'session.json');
const lua = (source) => {
  const host = createLuaHost({});
  const error = host.run(source, 'kaiak.lua');
  const result = resolve(host.data);
  host.close();
  return { ...result, error };
};

test('cleanTab: só http, https e a página inicial; título e ícone saneados', () => {
  assert.deepEqual(cleanTab({ url: 'https://a.test/x', title: 'A', icon: 'https://a.test/i.png' }), { url: 'https://a.test/x', title: 'A', icon: 'https://a.test/i.png' });
  assert.deepEqual(cleanTab({ url: 'kaiak://start/' }), { url: 'kaiak://start/', title: '', icon: '' });
  for (const bad of [null, {}, { url: 5 }, { url: 'javascript:alert(1)' }, { url: 'file:///etc/passwd' }, { url: 'data:text/html,x' }, { url: 'kaiak://cookies' }, { url: 'sem esquema' }, { url: `https://a.test/${'a'.repeat(2000)}` }]) {
    assert.equal(cleanTab(bad), null, JSON.stringify(bad)?.slice(0, 50));
  }
  const odd = cleanTab({ url: 'https://a.test/', title: 'x'.repeat(300), icon: 'javascript:x' });
  assert.equal(odd.title, '');
  assert.equal(odd.icon, '');
});

test('arquivo: grava (criando a pasta), relê igual, e arquivo ausente/ruim vira sessão vazia', () => {
  const file = tmpFile();
  const store = createSessionStore(file);
  assert.deepEqual(store.load(), { tabs: [], active: 0 });
  store.save({ tabs: [{ url: 'https://a.test/', title: 'A', icon: '' }, { url: 'https://b.test/', title: 'B', icon: '' }], active: 1 });
  assert.deepEqual(store.load().tabs.map((t) => t.title), ['A', 'B']);
  assert.equal(store.load().active, 1);
  fs.writeFileSync(file, 'lixo{');
  assert.deepEqual(store.load(), { tabs: [], active: 0 });
  fs.writeFileSync(file, JSON.stringify({ tabs: [{ url: 'https://ok.test/' }, { url: 'javascript:x' }, 7], active: 99 }));
  const loaded = store.load();
  assert.equal(loaded.tabs.length, 1, 'itens inválidos do disco são descartados');
  assert.equal(loaded.active, 0, 'índice fora da lista volta para um válido');
});

test('limite de abas guardadas', () => {
  const store = createSessionStore(tmpFile());
  store.save({ tabs: Array.from({ length: MAX_TABS + 50 }, (_, i) => ({ url: `https://a.test/${i}`, title: '', icon: '' })), active: 0 });
  assert.equal(store.load().tabs.length, MAX_TABS);
});

// gerenciador de abas com views falsas
const manager = () => {
  const created = [];
  const m = new TabManager({
    changed() {}, hide() {}, show() {},
    createView(isPrivate) {
      const view = { isPrivate, webContents: { loaded: null, loadURL(url) { this.loaded = url; }, on() {}, once() {}, focus() {}, setWindowOpenHandler() {}, navigationHistory: { canGoBack: () => false, canGoForward: () => false } } };
      created.push(view);
      return view;
    },
  });
  return { m, created };
};

test('sessionState: só abas não privativas, com o índice da ativa dentro da lista guardada', () => {
  const { m } = manager();
  m.open('https://a.test/'); m.open('https://priv.test/', false, true); const c = m.open('https://c.test/');
  const state = m.sessionState();
  assert.deepEqual(state.tabs.map((t) => t.url), ['https://a.test/', 'https://c.test/']);
  assert.equal(state.active, 1);
  m.select(m.tabs[1].id); // a privativa está ativa: o índice não aponta para ela
  assert.equal(m.sessionState().active, 0);
  assert.ok(c);
});

test('restore: abas voltam DESCARTADAS (sem view); só a ativa carrega; título e ícone preservados', () => {
  const { m, created } = manager();
  const active = m.restore({ tabs: [{ url: 'https://a.test/', title: 'A', icon: 'https://a.test/i.png' }, { url: 'https://b.test/', title: 'B', icon: '' }, { url: 'https://c.test/', title: 'C', icon: '' }], active: 1 });
  assert.equal(m.tabs.length, 3);
  assert.equal(active.url, 'https://b.test/');
  assert.equal(m.activeId, active.id);
  assert.equal(created.length, 1, 'uma única view criada: a da aba ativa');
  assert.equal(created[0].webContents.loaded, 'https://b.test/');
  assert.deepEqual(m.tabs.map((t) => t.view !== null), [false, true, false]);
  const snap = m.snapshot();
  assert.deepEqual(snap.tabs.map((t) => [t.title, t.discarded]), [['A', true], ['B', false], ['C', true]]);
  assert.equal(snap.tabs[0].icon, 'https://a.test/i.png');
  m.select(m.tabs[2].id); // clicar numa descartada a carrega na hora
  assert.equal(created.length, 2);
  assert.equal(created[1].webContents.loaded, 'https://c.test/');
});

test('restore com lista vazia não faz nada', () => {
  const { m } = manager();
  assert.equal(m.restore({ tabs: [], active: 0 }), null);
  assert.equal(m.tabs.length, 0);
});

test('config: session.restore é true por padrão, vem do .lua e valida', () => {
  assert.equal(resolve().config.session.restore, true);
  assert.equal(lua('k.session { restore = false }').config.session.restore, false);
  const bad = lua('k.session { restore = "sim" }');
  assert.match(bad.warnings[0], /"session\.restore" inválido/);
  assert.equal(bad.config.session.restore, true);
  assert.match(lua('k.session { restor = true }').warnings[0], /quis dizer "restore"/);
});
