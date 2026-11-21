'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');
const { checkIcon, checkAction } = require('../src/buttons-config');
const { ACTION_NAMES } = require('../src/actions');

const lua = (source) => {
  const host = createLuaHost({});
  const error = host.run(source, 'kaiak.lua');
  const result = resolve(host.data);
  host.close();
  return { ...result, error };
};
const ids = (config) => Object.keys(config.buttons);
const TB = 'k.layout("tb", { content = "buttons", place = "top", size = 34 })\n'
  + 'k.layout("chat", { content = { url = "https://chat.example.org" }, place = "right", size = 300 })\n';

test('padrão: nenhum botão de fábrica e nenhum aviso', () => {
  const r = resolve();
  assert.deepEqual(r.config.buttons, {});
  assert.deepEqual(r.warnings, []);
});

test('botão mínimo (icon + slot + action) e todas as formas de ação', () => {
  const r = lua(TB + `
    k.button("novo", { icon = "+", slot = "tb", action = "new_tab" })
    k.button("site", { icon = "🌐", tooltip = "Abrir o site", slot = "tb", action = { open = "https://example.org" } })
    k.button("lateral", { label = "Chat", slot = "tb", action = { open = "https://chat.example.org", target = "chat" } })
    k.button("painel", { icon = "◧", slot = "tb", action = { toggle = "rail" } })
    k.button("meu", { icon = "★", slot = "tb", action = function() k.tabs.open("https://example.org") end })
  `);
  assert.equal(r.error, null);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(ids(r.config), ['novo', 'site', 'lateral', 'painel', 'meu']);
  assert.equal(typeof r.config.buttons.meu.action, 'function');
  assert.deepEqual(r.config.buttons.lateral.action, { open: 'https://chat.example.org', target: 'chat' });
});

test('botões moram em slots buttons, address e tabs; em outro conteúdo, avisa e ignora', () => {
  for (const slot of ['tb', 'bar', 'rail']) {
    const r = lua(TB + `k.button("x", { icon = "x", slot = "${slot}", action = "reload" })`);
    assert.deepEqual(r.warnings, [], slot);
    assert.equal(r.config.buttons.x.slot, slot);
  }
  const html = lua('k.layout("p", { content = { html = "x" }, place = "right", size = 100 })\nk.button("x", { icon = "x", slot = "p", action = "reload" })');
  assert.match(html.warnings[0], /não mostra botões/);
  assert.deepEqual(ids(html.config), []);
});

test('ORDEM DE LEITURA: redeclarar mescla no lugar; false remove; remover e declarar de novo vai ao fim; handle :remove()', () => {
  const r = lua(TB + `
    k.button("a", { icon = "A", slot = "tb", action = "reload" })
    k.button("b", { icon = "B", slot = "tb", action = "reload" })
    k.button("c", { icon = "C", slot = "tb", action = "reload" })
    k.button("a", { tooltip = "mesclou" })
    local b = k.button("b")
    b:remove()
    k.button("b", { icon = "B2", slot = "tb", action = "back" })
    k.button("c", false)
  `);
  assert.deepEqual(ids(r.config), ['a', 'b']);
  assert.equal(r.config.buttons.a.tooltip, 'mesclou');
  assert.equal(r.config.buttons.a.icon, 'A', 'mesclar mantém o resto');
  assert.equal(r.config.buttons.b.icon, 'B2');
  const table = lua(TB + 'k.button { z = { icon = "Z", slot = "tb", action = "reload" }, a = { icon = "A", slot = "tb", action = "reload" } }');
  assert.deepEqual(ids(table.config), ['z', 'a'], 'forma de tabela: ordem de escrita');
});

test('ícone e ação SUBSTITUEM ao redeclarar (open + toggle seria inválido)', () => {
  const r = lua(TB + `
    k.button("x", { icon = "A", slot = "tb", action = { open = "https://a.test", target = "chat" } })
    k.button("x", { icon = { svg = "<svg viewBox='0 0 1 1'/>" }, action = { toggle = "rail" } })
  `);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.config.buttons.x.action, { toggle: 'rail' });
  assert.deepEqual(Object.keys(r.config.buttons.x.icon), ['svg']);
});

test('ícones: texto, svg e arquivo válidos; o resto diz o motivo', () => {
  for (const icon of ['+', '🍪', 'abc', { svg: '<svg viewBox="0 0 1 1"/>' }, { file: '~/ic.png' }, { text: 'x' }]) assert.equal(checkIcon(icon), null, JSON.stringify(icon));
  const bad = ['', 'longo demais!', 5, {}, { svg: 'nao é svg' }, { svg: '<svg/>', file: 'x' }, { file: '' }, { cor: 1 }, { svg: `<svg>${'x'.repeat(20000)}</svg>` }];
  for (const icon of bad) assert.ok(checkIcon(icon), JSON.stringify(icon).slice(0, 50));
});

test('ações: nomes conhecidos, função, open e toggle; o resto diz o motivo', () => {
  for (const name of ACTION_NAMES) assert.equal(checkAction(name, ACTION_NAMES), null, name);
  for (const action of [() => {}, { open: 'https://x.org' }, { open: 'http://localhost:3000', target: 'tab' }, { toggle: 'lateral' }]) assert.equal(checkAction(action, ACTION_NAMES), null);
  const bad = ['voar', 5, {}, { open: 'ftp://x' }, { open: 'javascript:alert(1)' }, { open: 'https://x.org', toggle: 'a' }, { toggle: '' }, { toggle: 'a', target: 'b' }, { run: 'x' }, { open: 'https://x.org', target: '' }];
  for (const action of bad) assert.ok(checkAction(action, ACTION_NAMES), JSON.stringify(action));
});

test('validação: slot inexistente, faltando campos, sem icon nem label, id ruim, campo com erro de digitação', () => {
  assert.match(lua('k.button("x", { icon = "x", slot = "nada", action = "reload" })').warnings[0], /o slot "nada" não existe/);
  assert.match(lua('k.button("x", { icon = "x" })').warnings[0], /faltam: slot, action/);
  assert.match(lua('k.button("x", { slot = "bar", action = "reload" })').warnings[0], /sem icon nem label/);
  assert.match(lua('k.button("1ruim", { icon = "x", slot = "bar", action = "reload" })').warnings[0], /botão "1ruim" inválido/);
  const typo = lua('k.button("x", { icon = "x", slot = "bar", action = "reload", tooltp = "oi" })');
  assert.match(typo.warnings[0], /quis dizer "tooltip"/);
  assert.deepEqual(ids(typo.config), ['x'], 'erro de digitação num campo opcional não derruba o botão');
  const longo = lua('k.button("x", { icon = "x", slot = "bar", action = "reload", label = "' + 'a'.repeat(41) + '" })');
  assert.equal(longo.config.buttons.x.label, undefined);
  assert.match(longo.warnings[0], /até 40 caracteres/);
});

test('erros do k.button apontam a linha do kaiak.lua', () => {
  assert.match(lua('k.theme {}\nk.button(5)').error, /^kaiak\.lua:2: k\.button espera uma tabela/);
  assert.match(lua('k.button("x", "texto")').error, /^kaiak\.lua:1: k\.button espera uma tabela, false ou nada/);
});

test('remover o slot depois do botão: o botão perde o destino e é ignorado com aviso', () => {
  const r = lua(TB + 'k.button("x", { icon = "x", slot = "tb", action = "reload" })\nk.layout("tb", false)');
  assert.deepEqual(ids(r.config), []);
  assert.match(r.warnings[0], /o slot "tb" não existe/);
});

test('destinos: open.target precisa ser "tab" ou um slot com SITE; toggle precisa de um slot que exista', () => {
  const ok = lua(TB + 'k.button("a", { icon = "a", slot = "tb", action = { open = "https://x.org", target = "tab" } })\nk.button("b", { icon = "b", slot = "tb", action = { toggle = "chat" } })');
  assert.deepEqual(ok.warnings, []);
  const semSlot = lua(TB + 'k.button("a", { icon = "a", slot = "tb", action = { open = "https://x.org", target = "nada" } })');
  assert.match(semSlot.warnings[0], /target "nada": esse slot não existe/);
  const html = lua(TB + 'k.layout("n", { content = { html = "x" }, place = "bottom", size = 90 })\nk.button("a", { icon = "a", slot = "tb", action = { open = "https://x.org", target = "n" } })');
  assert.match(html.warnings[0], /não tem um site/);
  const toggle = lua(TB + 'k.button("a", { icon = "a", slot = "tb", action = { toggle = "nada" } })');
  assert.match(toggle.warnings[0], /o slot "nada" não existe/);
  assert.deepEqual(ids(toggle.config), []);
});

const { svgHasColor, checkBadge } = require('../src/buttons-config');

test('svgHasColor: sem cor informada => pintado com o tema; com cor própria => fica como está', () => {
  const semCor = ['<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>', '<svg><path fill="currentColor" d="M0 0"/></svg>', '<svg><path fill="none" stroke="currentColor"/></svg>', '<svg><g style="fill:none;stroke:currentColor"/></svg>'];
  const comCor = ['<svg><path fill="#f00"/></svg>', "<svg><path stroke='red'/></svg>", '<svg><g style="fill:#fff"/></svg>', '<svg><linearGradient id="a"/></svg>', '<svg><image href="x.png"/></svg>', '<svg><style>p{fill:red}</style></svg>', '<svg><stop stop-color="#000"/></svg>'];
  semCor.forEach((svg) => assert.equal(svgHasColor(svg), false, svg));
  comCor.forEach((svg) => assert.equal(svgHasColor(svg), true, svg));
});

test('selo: inteiro >= 0, texto até 4 caracteres ou false', () => {
  [0, 3, 120, '!', 'novo', false].forEach((v) => assert.equal(checkBadge(v), null, String(v)));
  [-1, 1.5, '', 'longo demais', null, {}].forEach((v) => assert.ok(checkBadge(v), String(v)));
  assert.match(lua(TB + 'k.button("x", { icon = "x", slot = "tb", action = "reload", badge = "enorme!" })').warnings[0], /"buttons\.x\.badge" inválido/);
  assert.equal(lua(TB + 'k.button("x", { icon = "x", slot = "tb", action = "reload", badge = 4 })').config.buttons.x.badge, 4);
});

test('forma e posição do texto: shape square|row, label_place right|left; square com label avisa', () => {
  const ok = lua(TB + 'k.button("a", { icon = "a", label = "A", slot = "tb", action = "reload", shape = "row", label_place = "left" })');
  assert.deepEqual(ok.warnings, []);
  assert.equal(ok.config.buttons.a.label_place, 'left');
  assert.match(lua(TB + 'k.button("a", { icon = "a", slot = "tb", action = "reload", shape = "redondo" })').warnings[0], /"buttons\.a\.shape" inválido/);
  assert.match(lua(TB + 'k.button("a", { icon = "a", slot = "tb", action = "reload", label_place = "cima" })').warnings[0], /label_place/);
  assert.match(lua(TB + 'k.button("a", { icon = "a", label = "A", slot = "tb", action = "reload", shape = "square" })').warnings[0], /não mostra label/);
});

test('estados: cada um sobrescreve icon/label/tooltip; state inicial precisa existir; chave errada avisa', () => {
  const ok = lua(TB + 'k.button("m", { icon = "🔊", slot = "tb", action = "reload", state = "mudo", states = { mudo = { icon = "🔇", tooltip = "Mudo" } } })');
  assert.deepEqual(ok.warnings, []);
  assert.equal(ok.config.buttons.m.state, 'mudo');
  const semEstado = lua(TB + 'k.button("m", { icon = "a", slot = "tb", action = "reload", state = "x" })');
  assert.match(semEstado.warnings[0], /o estado "x" não existe/);
  assert.equal(semEstado.config.buttons.m.state, undefined);
  const ruim = lua(TB + 'k.button("m", { icon = "a", slot = "tb", action = "reload", states = { a = { cor = 1 }, b = { icon = {} }, c = 5 } })');
  assert.equal(ruim.warnings.length, 3);
  assert.deepEqual(Object.keys(ruim.config.buttons.m.states), []);
});

test('set_state/set_badge/set_enabled só funcionam depois da partida', () => {
  const r = lua(TB + 'local h = k.button("a", { icon = "a", slot = "tb", action = "reload" })\nh:set_badge(3)');
  assert.match(r.error, /^kaiak\.lua:\d: k\.button só funciona depois da partida/);
});

test('shape automático: com label (mesmo vazio) é row; sem label é square', () => {
  const r = lua(TB + 'k.button("a", { icon = "a", label = "", slot = "tb", action = "reload" })\nk.button("b", { icon = "b", slot = "tb", action = "reload" })');
  assert.deepEqual(r.warnings, []);
  assert.equal(r.config.buttons.a.label, '');
  assert.equal(r.config.buttons.b.label, undefined);
});
