'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createZoom, siteKey } = require('../src/zoom');
const { resolve, DEFAULTS } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');
const { buildKeymap } = require('../src/keymap');
const { createActions } = require('../src/actions');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kk-zoom-')), 'zoom.json');
const wcAt = (url, factor = 1) => {
  const wc = new EventEmitter();
  Object.assign(wc, { factor, url, getZoomFactor() { return this.factor; }, setZoomFactor(f) { this.factor = f; }, getURL() { return this.url; } });
  return wc;
};
const make = (over = {}, file = tmp()) => {
  const said = [];
  const zoom = createZoom({ config: { ...DEFAULTS.zoom, ...over }, file, notify: (t) => said.push(t) });
  return { zoom, said, file };
};

test('siteKey: só hosts http/https têm memória', () => {
  assert.equal(siteKey('https://exemplo.org/a?b=1'), 'exemplo.org');
  assert.equal(siteKey('http://127.0.0.1:8080/'), '127.0.0.1');
  for (const bad of ['kaiak://start/', 'file:///etc/x', 'about:blank', 'lixo', '']) assert.equal(siteKey(bad), null, bad);
});

test('passos: sobe e desce pelos níveis; nos extremos fica; entre níveis vai ao vizinho', () => {
  const { zoom } = make();
  const wc = wcAt('https://a.test/', 1);
  zoom.step(wc, 1); assert.equal(wc.factor, 1.1);
  zoom.step(wc, 1); assert.equal(wc.factor, 1.25);
  zoom.step(wc, -1); zoom.step(wc, -1); assert.equal(wc.factor, 1);
  wc.factor = 1.18; zoom.step(wc, 1); assert.equal(wc.factor, 1.25, 'de 118% sobe para 125%');
  wc.factor = 1.18; zoom.step(wc, -1); assert.equal(wc.factor, 1.1, 'de 118% desce para 110%');
  wc.factor = 5; zoom.step(wc, 1); assert.equal(wc.factor, 5, 'no máximo fica');
  wc.factor = 0.25; zoom.step(wc, -1); assert.equal(wc.factor, 0.25, 'no mínimo fica');
});

test('níveis e padrão do .lua: levels próprios e default; reset volta ao padrão', () => {
  const { zoom } = make({ levels: [75, 100, 150], default: 110 });
  const wc = wcAt('https://a.test/', 1.1);
  zoom.step(wc, 1); assert.equal(wc.factor, 1.5);
  zoom.step(wc, 1); assert.equal(wc.factor, 1.5);
  zoom.reset(wc); assert.equal(wc.factor, 1.1);
});

test('lembrar por site: grava ao mudar, volta ao navegar, o padrão apaga a entrada, e outro site não herda', () => {
  const { zoom, file } = make();
  const wc = wcAt('https://a.test/x', 1);
  zoom.attach(wc);
  zoom.step(wc, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { 'a.test': 1.1 });
  wc.url = 'https://b.test/'; wc.emit('did-navigate', {}, wc.url);
  assert.equal(wc.factor, 1, 'outro site volta ao padrão');
  wc.url = 'https://a.test/outra'; wc.emit('did-navigate', {}, wc.url);
  assert.equal(wc.factor, 1.1, 'o site volta ao zoom dele');
  zoom.reset(wc);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {}, 'voltar ao padrão apaga a entrada');
  // nova partida lendo o mesmo arquivo
  zoom.step(wc, 1);
  const again = createZoom({ config: DEFAULTS.zoom, file });
  assert.equal(again.factorFor('https://a.test/'), 1.1);
});

test('aba PRIVATIVA nunca grava (lê a memória, não escreve); páginas internas não lembram; remember = false não lê nem grava', () => {
  const { zoom, file } = make();
  const priv = wcAt('https://a.test/', 1);
  zoom.step(priv, 1, { isPrivate: true });
  assert.equal(fs.existsSync(file), false, 'nada em disco');
  const internal = wcAt('kaiak://start/', 1);
  zoom.step(internal, 1);
  assert.equal(fs.existsSync(file), false);
  const off = make({ remember: false });
  const wc = wcAt('https://a.test/', 1);
  off.zoom.attach(wc);
  off.zoom.step(wc, 1);
  assert.equal(fs.existsSync(off.file), false);
  wc.emit('did-navigate', {}, 'https://a.test/'); assert.equal(wc.factor, 1, 'sem memória volta ao padrão');
});

test('Ctrl+scroll (zoom-changed) anda os níveis; arquivo ruim ou valor absurdo não derruba', () => {
  const { zoom } = make();
  const wc = wcAt('https://a.test/', 1);
  zoom.attach(wc);
  wc.emit('zoom-changed', {}, 'in'); assert.equal(wc.factor, 1.1);
  wc.emit('zoom-changed', {}, 'out'); wc.emit('zoom-changed', {}, 'out'); assert.equal(wc.factor, 0.9);
  const file = tmp(); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'lixo{');
  assert.equal(createZoom({ config: DEFAULTS.zoom, file }).factorFor('https://a.test/'), 1);
  fs.writeFileSync(file, JSON.stringify({ 'a.test': 999, 'b.test': 'x', 'c.test': 1.5 }));
  const z = createZoom({ config: DEFAULTS.zoom, file });
  assert.deepEqual(['a.test', 'b.test', 'c.test'].map((h) => z.factorFor(`https://${h}/`)), [1, 1, 1.5]);
});

test('aviso "Zoom N%" a cada mudança', () => {
  const { zoom, said } = make();
  const wc = wcAt('https://a.test/', 1);
  zoom.step(wc, 1); zoom.step(wc, 1); zoom.reset(wc);
  assert.deepEqual(said, ['Zoom 110%', 'Zoom 125%', 'Zoom 100%']);
});

test('config: levels/default validados; remember e notify booleanos; chaves e ações padrão', () => {
  const lua = (src) => { const h = createLuaHost({}); h.run(src, 'kaiak.lua'); const r = resolve(h.data); h.close(); return r; };
  assert.deepEqual([resolve().config.zoom.default, resolve().config.zoom.remember, resolve().config.zoom.notify], [100, true, true]);
  const ok = lua('k.zoom { levels = { 150, 50, 100 }, default = 120, remember = false, notify = false }');
  assert.deepEqual(ok.warnings, []);
  assert.deepEqual(ok.config.zoom.levels, [50, 100, 150], 'ordenados');
  const bad = lua('k.zoom { levels = { 100 }, default = 9000, remember = "sim" }');
  const text = bad.warnings.join('\n');
  for (const p of [/zoom\.levels/, /zoom\.default/, /zoom\.remember/]) assert.match(text, p);
  assert.deepEqual(bad.config.zoom.levels, DEFAULTS.zoom.levels);
  assert.equal(lua('k.zoom { levels = { 100, 100, 150 } }').warnings.length, 1, 'repetido');
  assert.equal(lua('k.zoom { levels = { 10, 100 } }').warnings.length, 1, 'fora de 25-500');
  assert.match(lua('k.zoom { defalt = 1 }').warnings[0], /quis dizer "default"/);
  const keys = resolve().config.keys;
  const calls = [];
  const actions = createActions({ tabs: {}, focusAddress() {}, zoom: { step: (d) => calls.push(d), reset: () => calls.push('reset') } });
  const keymap = buildKeymap(keys, actions);
  assert.deepEqual(keymap.warnings, []);
  const press = (key, shift = false) => keymap.handle({ type: 'keyDown', key, control: true, shift, alt: false, meta: false });
  assert.ok(press('=') && press('+', true) && press('+') && press('-') && press('0'), 'todas as combinações de teclado casam');
  assert.deepEqual(calls, [1, 1, 1, -1, 'reset'], 'Ctrl+= , Ctrl+Shift++ , + do teclado numérico, Ctrl+-, Ctrl+0');
  assert.equal(press('9'), false, 'outra tecla não é tratada');
});
