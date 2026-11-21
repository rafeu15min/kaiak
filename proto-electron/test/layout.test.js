'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLayout, computeLayout, thicknessOfRect } = require('../src/layout');
const { DEFAULTS, resolve } = require('../src/config');

const win = { getContentBounds: () => ({ width: 1000, height: 800 }) };
const size = { width: 1000, height: 800 };
const base = DEFAULTS.layout; // rail 42 (expande a 240) à esquerda, bar 40 no topo
const slot = (over) => ({ place: 'left', size: 42, mode: 'push', ...over });

// ---------- geometria dos slots (função pura)
test('padrão: trilho à esquerda, barra ao lado dele no topo, página no resto (mesmos números de antes)', () => {
  const { base: rects, expanded, page } = computeLayout(base, size);
  assert.deepEqual(rects.rail, { x: 0, y: 0, width: 42, height: 800 });
  assert.deepEqual(rects.bar, { x: 42, y: 0, width: 958, height: 40 });
  assert.deepEqual(page, { x: 42, y: 40, width: 958, height: 760 });
  assert.deepEqual(expanded.rail, { x: 0, y: 0, width: 240, height: 800 }, 'ao expandir cobre a página, sem empurrá-la');
  assert.equal(expanded.bar, undefined, 'quem não tem expand não expande');
});

test('a ORDEM DE LEITURA decide quem morde a janela primeiro', () => {
  const railFirst = computeLayout({ rail: slot({}), bar: slot({ place: 'top', size: 40 }) }, size);
  const barFirst = computeLayout({ bar: slot({ place: 'top', size: 40 }), rail: slot({}) }, size);
  assert.deepEqual(railFirst.base.rail, { x: 0, y: 0, width: 42, height: 800 });
  assert.deepEqual(railFirst.base.bar, { x: 42, y: 0, width: 958, height: 40 });
  assert.deepEqual(barFirst.base.bar, { x: 0, y: 0, width: 1000, height: 40 }, 'barra primeiro: ocupa a largura inteira');
  assert.deepEqual(barFirst.base.rail, { x: 0, y: 40, width: 42, height: 760 }, 'e o trilho fica embaixo dela');
  assert.deepEqual(railFirst.page, barFirst.page, 'a página é a mesma; só mudam os cantos');
});

test('qualquer borda, sem limite: trilho à direita, barra embaixo, trilho em fileira no topo', () => {
  const right = computeLayout({ rail: slot({ place: 'right' }), bar: slot({ place: 'top', size: 40 }) }, size);
  assert.deepEqual(right.base.rail, { x: 958, y: 0, width: 42, height: 800 });
  assert.deepEqual(right.base.bar, { x: 0, y: 0, width: 958, height: 40 });
  assert.deepEqual(right.page, { x: 0, y: 40, width: 958, height: 760 });
  const bottom = computeLayout({ bar: slot({ place: 'bottom', size: 36 }), rail: slot({}) }, size);
  assert.deepEqual(bottom.base.bar, { x: 0, y: 764, width: 1000, height: 36 });
  assert.deepEqual(bottom.base.rail, { x: 0, y: 0, width: 42, height: 764 });
  const row = computeLayout({ tabs: slot({ place: 'top', size: 38 }) }, size);
  assert.deepEqual(row.base.tabs, { x: 0, y: 0, width: 1000, height: 38 });
  assert.deepEqual(row.page, { x: 0, y: 38, width: 1000, height: 762 });
  const lateral = computeLayout({ address: slot({ place: 'left', size: 300 }) }, size);
  assert.deepEqual(lateral.page, { x: 300, y: 0, width: 700, height: 800 }, 'barra de endereço numa lateral');
});

test('mode overlay não reserva espaço: a página usa a janela inteira', () => {
  const r = computeLayout({ rail: slot({ mode: 'overlay', expand: 240 }), bar: slot({ place: 'top', size: 40 }) }, size);
  assert.deepEqual(r.base.rail, { x: 0, y: 0, width: 42, height: 800 });
  assert.deepEqual(r.base.bar, { x: 0, y: 0, width: 1000, height: 40 }, 'a barra nem sabe que o trilho existe');
  assert.deepEqual(r.page, { x: 0, y: 40, width: 1000, height: 760 });
});

test('tamanho em porcentagem vale pelo eixo do slot; nunca passa do espaço que sobrou', () => {
  const pct = computeLayout({ side: slot({ place: 'left', size: '10%' }), foot: slot({ place: 'bottom', size: '10%' }) }, size);
  assert.equal(pct.base.side.width, 100, '10% da largura');
  assert.equal(pct.base.foot.height, 80, '10% da altura');
  const huge = computeLayout({ a: slot({ size: 900 }), b: slot({ size: 900 }) }, size);
  assert.equal(huge.base.a.width, 900);
  assert.equal(huge.base.b.width, 100, 'o 2º só tem o que sobrou');
  assert.deepEqual(huge.page, { x: 1000, y: 0, width: 0, height: 800 });
  assert.deepEqual(computeLayout({}, size).page, { x: 0, y: 0, width: 1000, height: 800 }, 'sem slots a página é tudo');
  assert.equal(computeLayout({ a: slot({}) }, { width: 20, height: 20 }).base.a.width, 20, 'janela minúscula');
});

test('expand: em px ou %, nunca menor que o tamanho fechado; cresce a partir da borda do slot', () => {
  const r = computeLayout({ a: slot({ place: 'right', size: 50, expand: '30%' }), b: slot({ place: 'left', size: 80, expand: 10 }) }, size);
  assert.deepEqual(r.expanded.a, { x: 700, y: 0, width: 300, height: 800 }, '30% de 1000, colado na direita');
  assert.equal(r.expanded.b.width, 80, 'expand menor que size vale o size');
  assert.equal(thicknessOfRect(r.base.a, 'right'), 50);
  assert.equal(thicknessOfRect({ width: 10, height: 99 }, 'top'), 99);
});

// ---------- DevTools sobre o layout novo
test('sem DevTools a página ocupa tudo menos trilho e barra', () => {
  const l = createLayout(base, { place: 'right', size: '40%' });
  assert.deepEqual(l.pageBounds(win), { x: 42, y: 40, width: 958, height: 760 });
});

test('slotBounds: fechado devolve a base, aberto devolve a versão expandida (só de quem expande)', () => {
  const l = createLayout(base);
  assert.deepEqual(l.slotBounds(win, 'rail', false), { x: 0, y: 0, width: 42, height: 800 });
  assert.deepEqual(l.slotBounds(win, 'rail', true), { x: 0, y: 0, width: 240, height: 800 });
  assert.deepEqual(l.slotBounds(win, 'bar', true), l.slotBounds(win, 'bar', false));
});

test('DevTools à direita: a página perde 40% da largura e a faixa é o complemento exato', () => {
  const l = createLayout(base, { place: 'right', size: '40%' });
  const page = l.pageBounds(win, true);
  const dev = l.devtoolsBounds(win);
  assert.deepEqual(page, { x: 42, y: 40, width: 575, height: 760 });
  assert.equal(page.x + page.width, dev.x);
  assert.equal(dev.x + dev.width, 1000);
  assert.equal(dev.height, 760);
});

test('DevTools embaixo: a página perde a altura e a faixa é o complemento exato', () => {
  const l = createLayout(base, { place: 'bottom', size: '25%' });
  const page = l.pageBounds(win, true);
  const dev = l.devtoolsBounds(win);
  assert.equal(page.height, 570);
  assert.equal(page.y + page.height, dev.y);
  assert.equal(dev.y + dev.height, 800);
  assert.equal(dev.width, 958);
});

test('DevTools em janela separada não mexe na página; com o trilho à direita a página acompanha', () => {
  const l = createLayout(base, { place: 'window', size: '40%' });
  assert.deepEqual(l.pageBounds(win, true), l.pageBounds(win, false));
  const moved = createLayout(resolve({ layout: [{ id: 'rail', spec: { place: 'right' } }] }).config.layout);
  assert.deepEqual(moved.pageBounds(win), { x: 0, y: 40, width: 958, height: 760 });
});

test('config: place e size inválidos voltam ao padrão com aviso', () => {
  const r = resolve({ devtools: { place: 'topo', size: 5, enabled: 'sim' } });
  assert.equal(r.config.devtools.place, 'right');
  assert.equal(r.config.devtools.size, '40%');
  assert.equal(r.config.devtools.enabled, true);
  assert.equal(r.warnings.length, 3);
  for (const bad of ['10%', '90%', '0.4', 0.4, '40 %']) assert.equal(resolve({ devtools: { size: bad } }).warnings.length, 1, String(bad));
  for (const good of ['15%', '40%', '80%', '33.5%']) assert.deepEqual(resolve({ devtools: { size: good } }).warnings, [], good);
  for (const place of ['right', 'bottom', 'window']) assert.deepEqual(resolve({ devtools: { place } }).warnings, [], place);
});
