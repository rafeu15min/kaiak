'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve, DEFAULTS } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');
const { contextKind, contextText, buildMenu } = require('../src/context-menu');
const { BUILTIN_IDS, DEFAULT_LISTS } = require('../src/context-menu-config');

const lua = (source) => {
  const host = createLuaHost({});
  const error = host.run(source, 'kaiak.lua');
  const result = resolve(host.data);
  return { ...result, error, host };
};
const menu = (params, over = {}, extra = {}) => buildMenu({
  menuConfig: over.config ?? resolve().config.context_menu, params, pageUrl: 'https://p.test/', edit: { canCopy: true, canPaste: false },
  nav: { canBack: true, canForward: false }, engineName: 'ddg', ...extra,
});
const labels = (built) => built.items.map((i) => (i.separator ? '-' : i.label));

test('contexto: campo de texto > link > imagem > seleção > página', () => {
  assert.equal(contextKind({ isEditable: true, linkURL: 'x', selectionText: 'a' }), 'editable');
  assert.equal(contextKind({ linkURL: 'https://a.test', mediaType: 'image', srcURL: 'x', selectionText: 'a' }), 'link');
  assert.equal(contextKind({ mediaType: 'image', srcURL: 'https://a.test/i.png', selectionText: 'a' }), 'image');
  assert.equal(contextKind({ mediaType: 'image', srcURL: '', selectionText: '  ' }), 'page', 'imagem sem endereço e seleção só de espaços');
  assert.equal(contextKind({ selectionText: 'texto' }), 'selection');
  assert.equal(contextKind({}), 'page');
});

test('padrões de fábrica: toda lista usa só ids conhecidos e o menu monta com rótulos em português', () => {
  for (const [context, list] of Object.entries(DEFAULT_LISTS)) {
    list.forEach((id) => assert.ok(id === '-' || BUILTIN_IDS.includes(id), `${context}: ${id}`));
  }
  const page = menu({});
  assert.deepEqual(labels(page), ['Voltar', 'Avançar', 'Recarregar', '-', 'Buscar na página…', 'Imprimir…', 'Salvar como PDF', '-', 'Inspecionar']);
  assert.deepEqual(page.items.map((i) => i.enabled), [true, false, true, undefined, true, true, true, undefined, true], 'avançar fica apagado sem histórico');
  assert.deepEqual(labels(menu({ linkURL: 'https://a.test/x' })), ['Abrir link em nova aba', 'Abrir link em segundo plano', 'Abrir link em aba privativa', '-', 'Copiar endereço do link', '-', 'Inspecionar']);
  const sel = menu({ selectionText: 'um texto bem comprido que passa do limite da etiqueta' });
  assert.match(sel.items[1].label, /^Pesquisar “um texto bem comprido que p…” no ddg$/);
  const edit = menu({ isEditable: true });
  assert.deepEqual(edit.items.filter((i) => !i.separator).map((i) => [i.label, i.enabled]), [['Desfazer', undefined], ['Refazer', undefined], ['Recortar', undefined], ['Copiar', true], ['Colar', false], ['Selecionar tudo', undefined]]);
});

test('cada item executa a operação certa no host', () => {
  const calls = [];
  const host = new Proxy({}, { get: (_t, name) => (...args) => calls.push([name, ...args]) });
  const run = (params, label) => menu(params).items.find((i) => i.label === label).run(host);
  run({ linkURL: 'https://a.test/x' }, 'Abrir link em nova aba');
  run({ linkURL: 'https://a.test/x' }, 'Abrir link em segundo plano');
  run({ linkURL: 'https://a.test/x' }, 'Abrir link em aba privativa');
  run({ linkURL: 'https://a.test/x' }, 'Copiar endereço do link');
  run({ mediaType: 'image', srcURL: 'https://a.test/i.png', x: 5, y: 6 }, 'Salvar imagem como…');
  run({ mediaType: 'image', srcURL: 'https://a.test/i.png', x: 5, y: 6 }, 'Copiar imagem');
  run({ isEditable: true }, 'Colar');
  run({}, 'Recarregar');
  run({ x: 9, y: 8 }, 'Inspecionar');
  assert.deepEqual(calls, [
    ['openUrl', 'https://a.test/x', 'tab'], ['openUrl', 'https://a.test/x', 'background'], ['openUrl', 'https://a.test/x', 'private'],
    ['copyText', 'https://a.test/x'], ['saveUrl', 'https://a.test/i.png'], ['copyImageAt', 5, 6], ['edit', 'paste'], ['action', 'reload'], ['inspect', 9, 8],
  ]);
});

test('listas do .lua substituem as de fábrica; separadores sobrando são limpos; lista vazia = sem menu', () => {
  const r = lua('k.context_menu { page = { "-", "reload", "-", "-", "back", "-" }, link = {} }');
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(labels(menu({}, { config: r.config.context_menu })), ['Recarregar', '-', 'Voltar']);
  assert.equal(menu({ linkURL: 'https://a.test' }, { config: r.config.context_menu }).items.length, 0);
  assert.deepEqual(r.config.context_menu.selection, DEFAULT_LISTS.selection, 'o contexto que não foi citado fica de fábrica');
});

test('itens do dono: ação nomeada, { open } com %s (seleção > link > imagem > página) e função com ctx', () => {
  const r = lua(`k.context_menu {
    selection = { "wiki", "ir_tema" }, link = { "arquivo" }, page = { "meu" },
    items = {
      wiki = { label = "Wikipédia", action = { open = "https://pt.wikipedia.org/?search=%s", target = "background" } },
      ir_tema = { label = "Alternar tema", action = "toggle_theme" },
      arquivo = { label = "Arquivar", action = { open = "https://archive.test/?u=%s" } },
      meu = { label = "Meu", action = function(ctx) k.tabs.open(ctx.page) end },
    } }`);
  assert.deepEqual(r.warnings, []);
  const calls = [];
  const host = new Proxy({}, { get: (_t, name) => (...args) => calls.push([name, ...args]) });
  menu({ selectionText: 'café & chá' }, { config: r.config.context_menu }).items[0].run(host);
  menu({ selectionText: 'x' }, { config: r.config.context_menu }).items[1].run(host);
  menu({ linkURL: 'https://l.test/a?b=1' }, { config: r.config.context_menu }).items[0].run(host);
  assert.deepEqual(calls[0], ['openUrl', 'https://pt.wikipedia.org/?search=caf%C3%A9%20%26%20ch%C3%A1', 'background']);
  assert.deepEqual(calls[1], ['action', 'toggle_theme']);
  assert.deepEqual(calls[2], ['openUrl', 'https://archive.test/?u=https%3A%2F%2Fl.test%2Fa%3Fb%3D1', 'tab']);
  assert.equal(contextText({ mediaType: 'image', srcURL: 'https://i.test/a.png' }, 'https://p.test/'), 'https://i.test/a.png');
  assert.equal(contextText({}, 'https://p.test/'), 'https://p.test/');
});

test('função Lua do item recebe o ctx como TABELA de verdade (kind, link, image, selection, page)', () => {
  const errors = [];
  const host = createLuaHost({ onError: (e) => errors.push(e) });
  const err = host.run(`k.context_menu { link = { "meu" }, items = { meu = { label = "Meu",
    action = function(ctx) error(table.concat({ ctx.kind, ctx.link, ctx.page, tostring(ctx.selection == ""), type(ctx) }, "|")) end } } }`, 'kaiak.lua');
  assert.equal(err, null);
  const config = resolve(host.data).config.context_menu;
  host.attach({});
  const built = buildMenu({ menuConfig: config, params: { linkURL: 'https://a.test/x' }, pageUrl: 'https://p.test/', edit: {}, nav: {}, engineName: 'ddg' });
  built.items[0].run({ callLua: (fn, ctx) => fn(ctx) });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /link\|https:\/\/a\.test\/x\|https:\/\/p\.test\/\|true\|table$/, 'a função leu os campos de uma tabela');
  host.close();
});

test('config: validação de listas, itens e enabled; chaves com sugestão', () => {
  assert.equal(resolve().config.context_menu.enabled, true);
  const bad = lua(`k.context_menu { enabled = "sim", page = "reload", link = { "voar", 7 }, selection = { "copy", "fantasma" },
    items = { Maiuscula = { label = "x", action = "reload" }, copy = { label = "x", action = "reload" }, a = { label = "", action = "reload" },
              b = { label = "ok", action = "voar" }, c = { label = "ok" }, d = { label = "ok", action = { open = "ftp://x" } },
              e = { label = "ok", action = { open = "https://x.test", target = "lua" } }, f = { label = "ok", action = "reload", cor = 1 }, g = 5 } }`);
  const text = bad.warnings.join('\n');
  for (const part of [/context_menu\.enabled/, /context_menu\.page" inválido/, /context_menu\.link" inválido/, /item desconhecido "fantasma"/,
    /items\.Maiuscula/, /items\.copy/, /items\.a" inválido: label/, /items\.b.*ação desconhecida "voar"/, /items\.c.*falta action/, /items\.d.*http/, /items\.e.*target/, /items\.f.*chave desconhecida "cor"/, /items\.g/]) {
    assert.match(text, part);
  }
  assert.deepEqual(bad.config.context_menu.page, DEFAULT_LISTS.page);
  assert.deepEqual(bad.config.context_menu.selection, ['copy'], 'item desconhecido sai, o válido fica');
  assert.deepEqual(Object.keys(bad.config.context_menu.items), []);
  assert.match(lua('k.context_menu { selecton = {} }').warnings[0], /quis dizer "selection"/);
  assert.equal(DEFAULTS.context_menu.link[0], 'open_link_tab');
});
