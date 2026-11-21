'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { resolve, DEFAULTS } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');
const { renderBoot } = require('../src/start-page');
const { createSplash } = require('../src/splash');
const { whenPainted } = require('../src/page-ready');

const lua = (source) => {
  const host = createLuaHost({});
  const error = host.run(source, 'kaiak.lua');
  const result = resolve(host.data);
  host.close();
  return { ...result, error };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('boot: padrão ligado, sem aviso, max_ms 4000; k.boot valida tudo e reaproveita o fundo da página inicial', () => {
  const d = resolve();
  assert.deepEqual(d.warnings, []);
  assert.equal(d.config.boot.enabled, true);
  assert.equal(d.config.boot.max_ms, 4000);
  const ok = lua('k.boot { min_ms = 500, max_ms = 2000, background = { gradient = "linear-gradient(#111, #222)", image = { file = "~/a.svg", tint = true } } }');
  assert.deepEqual(ok.warnings, []);
  assert.equal(ok.config.boot.background.image.tint, true);
  const bad = lua('k.boot { enabled = "sim", min_ms = -1, max_ms = 99999, background = { color = "x;y", image = { size = "grande", file = "a" } } }');
  const text = bad.warnings.join('\n');
  for (const part of [/"boot\.enabled"/, /"boot\.min_ms"/, /"boot\.max_ms"/, /"boot\.background\.color"/, /"boot\.background\.image\.size"/]) assert.match(text, part);
  assert.match(lua('k.boot { min_ms = 3000, max_ms = 1000 }').warnings[0], /não pode passar de max_ms/);
  assert.match(lua('k.boot { bakground = {} }').warnings[0], /quis dizer "background"/);
  assert.equal(lua('k.start { background = { color = "red;}" } }').warnings[0].includes('"start.background.color"'), true, 'a página inicial ainda usa o mesmo validador');
});

test('boot: a página gerada tem só fundo (sem script), com a imagem e o tema; o tema não escapa do CSS', () => {
  const boot = lua('k.boot { background = { image = { file = "x.svg", size = "20%", tint = true } } }').config.boot;
  const html = renderBoot({ boot, theme: { ...DEFAULTS.theme, fg: '#fff;}</style><script>x</script>' }, art: 'data:image/svg+xml;base64,AAAA' });
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /-webkit-mask:url\(data:image\/svg\+xml;base64,AAAA\)/);
  assert.match(html, new RegExp(`background: ${DEFAULTS.theme.bg}`));
  assert.match(html, /default-src 'none'/);
});

// janela e view falsas para a tela de boot
const fakeWin = () => {
  const win = new EventEmitter();
  win.children = new Set();
  win.getContentBounds = () => ({ width: 1280, height: 800 });
  win.contentView = { addChildView: (v) => win.children.add(v), removeChildView: (v) => win.children.delete(v) };
  return win;
};
const fakeSplashView = () => ({ bounds: null, closed: false, setBounds(b) { this.bounds = b; }, webContents: { close() { this.closed = true; } } });

test('splash: cobre a janela, segue o redimensionamento e some quando a 1ª aba fica pronta', async () => {
  const win = fakeWin(); const view = fakeSplashView();
  const splash = createSplash({ win, view, minMs: 0, maxMs: 1000 });
  assert.deepEqual(view.bounds, { x: 0, y: 0, width: 1280, height: 800 });
  assert.ok(win.children.has(view));
  win.getContentBounds = () => ({ width: 900, height: 600 });
  win.emit('resize');
  assert.deepEqual(view.bounds, { x: 0, y: 0, width: 900, height: 600 });
  let ready; splash.finishWhen(new Promise((r) => { ready = r; }));
  await sleep(20);
  assert.ok(splash.isOpen(), 'não some antes de a aba ficar pronta');
  ready();
  await sleep(20);
  assert.equal(splash.isOpen(), false);
  assert.equal(win.children.has(view), false);
  assert.equal(win.listenerCount('resize'), 0);
});

test('splash: min_ms segura a tela; max_ms derruba mesmo sem a aba ficar pronta', async () => {
  const held = createSplash({ win: fakeWin(), view: fakeSplashView(), minMs: 120, maxMs: 1000 });
  held.finishWhen(Promise.resolve());
  await sleep(60);
  assert.ok(held.isOpen(), 'segurada pelo mínimo');
  await sleep(120);
  assert.equal(held.isOpen(), false);
  const capped = createSplash({ win: fakeWin(), view: fakeSplashView(), minMs: 0, maxMs: 80 });
  capped.finishWhen(new Promise(() => {}));
  await sleep(160);
  assert.equal(capped.isOpen(), false, 'o prazo máximo venceu');
});

test('splash: raise() recoloca a view por cima (os slots são re-adicionados depois dela)', () => {
  const win = fakeWin(); const view = fakeSplashView();
  const splash = createSplash({ win, view, minMs: 0, maxMs: 1000 });
  win.children.delete(view);
  splash.raise();
  assert.ok(win.children.has(view));
});

test('whenPainted: página de fora vale pelo fim do carregamento; kaiak:// exige o marcador; sempre há prazo', async () => {
  const page = (url) => { const wc = new EventEmitter(); wc.getURL = () => url; return wc; };
  const web = page('https://x.test/');
  const p1 = whenPainted(web, 500);
  web.emit('console-message', { message: 'kaiak:ready' }); // um SITE logando o marcador não vale
  web.emit('did-stop-loading');
  await p1;
  const internal = page('kaiak://start/');
  let done = false;
  const p2 = whenPainted(internal, 500).then(() => { done = true; });
  internal.emit('did-stop-loading');
  internal.emit('console-message', { message: 'outra coisa' });
  await sleep(20);
  assert.equal(done, false);
  internal.emit('console-message', { message: 'kaiak:ready' });
  await p2;
  assert.equal(internal.listenerCount('console-message'), 0);
  const t0 = Date.now();
  await whenPainted(page('kaiak://start/'), 60);
  assert.ok(Date.now() - t0 >= 55);
});
