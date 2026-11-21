'use strict';
// Menu de contexto: decide o CONTEXTO do clique, monta os itens da lista daquele contexto e executa o escolhido. Sem Electron:
// o main passa `host` (abrir aba, copiar, salvar...) e transforma os descritores num Menu nativo.
const { SEPARATOR } = require('./context-menu-config');

const MAX_LABEL_TEXT = 28;
const short = (text) => (text.length > MAX_LABEL_TEXT ? `${text.slice(0, MAX_LABEL_TEXT - 1)}…` : text);

// Prioridade: campo de texto > link > imagem > texto selecionado > página.
function contextKind(params) {
  if (params.isEditable) return 'editable';
  if (params.linkURL) return 'link';
  if (params.mediaType === 'image' && params.srcURL) return 'image';
  if (params.selectionText?.trim()) return 'selection';
  return 'page';
}

// Texto que o %s de uma ação { open } recebe, na ordem: seleção, link, imagem, endereço da página.
const contextText = (params, pageUrl) => params.selectionText?.trim() || params.linkURL || (params.mediaType === 'image' ? params.srcURL : '') || pageUrl;

// ctx entregue às funções Lua dos itens do dono (só dados simples).
const luaContext = (kind, params, pageUrl) => ({ kind, link: params.linkURL || '', image: params.mediaType === 'image' ? params.srcURL : '', selection: params.selectionText || '', page: pageUrl });

// Itens de fábrica: id -> ({ params, edit, nav, engineName }) => { label, enabled?, run(host) }
const BUILTIN = {
  open_link_tab: ({ params }) => ({ label: 'Abrir link em nova aba', run: (h) => h.openUrl(params.linkURL, 'tab') }),
  open_link_background: ({ params }) => ({ label: 'Abrir link em segundo plano', run: (h) => h.openUrl(params.linkURL, 'background') }),
  open_link_private: ({ params }) => ({ label: 'Abrir link em aba privativa', run: (h) => h.openUrl(params.linkURL, 'private') }),
  copy_link: ({ params }) => ({ label: 'Copiar endereço do link', run: (h) => h.copyText(params.linkURL) }),
  open_image_tab: ({ params }) => ({ label: 'Abrir imagem em nova aba', run: (h) => h.openUrl(params.srcURL, 'tab') }),
  save_image: ({ params }) => ({ label: 'Salvar imagem como…', run: (h) => h.saveUrl(params.srcURL) }),
  copy_image: ({ params }) => ({ label: 'Copiar imagem', run: (h) => h.copyImageAt(params.x, params.y) }),
  copy_image_address: ({ params }) => ({ label: 'Copiar endereço da imagem', run: (h) => h.copyText(params.srcURL) }),
  undo: ({ edit }) => ({ label: 'Desfazer', enabled: edit.canUndo, run: (h) => h.edit('undo') }),
  redo: ({ edit }) => ({ label: 'Refazer', enabled: edit.canRedo, run: (h) => h.edit('redo') }),
  cut: ({ edit }) => ({ label: 'Recortar', enabled: edit.canCut, run: (h) => h.edit('cut') }),
  copy: ({ edit }) => ({ label: 'Copiar', enabled: edit.canCopy, run: (h) => h.edit('copy') }),
  paste: ({ edit }) => ({ label: 'Colar', enabled: edit.canPaste, run: (h) => h.edit('paste') }),
  select_all: ({ edit }) => ({ label: 'Selecionar tudo', enabled: edit.canSelectAll, run: (h) => h.edit('selectAll') }),
  search_selection: ({ params, engineName }) => ({ label: `Pesquisar “${short(params.selectionText.trim())}” no ${engineName}`, run: (h) => h.searchText(params.selectionText.trim()) }),
  back: ({ nav }) => ({ label: 'Voltar', enabled: nav.canBack, run: (h) => h.action('back') }),
  forward: ({ nav }) => ({ label: 'Avançar', enabled: nav.canForward, run: (h) => h.action('forward') }),
  reload: () => ({ label: 'Recarregar', run: (h) => h.action('reload') }),
  find: () => ({ label: 'Buscar na página…', run: (h) => h.action('find') }),
  print: () => ({ label: 'Imprimir…', run: (h) => h.action('print') }),
  save_pdf: () => ({ label: 'Salvar como PDF', run: (h) => h.action('save_pdf') }),
  inspect: ({ params }) => ({ label: 'Inspecionar', run: (h) => h.inspect(params.x, params.y) }),
};

// Ação de um item do .lua -> função que roda com o host e o contexto.
function customRun(item, text, luaCtx) {
  const { action } = item;
  if (typeof action === 'function') return (h) => h.callLua(action, luaCtx);
  if (typeof action === 'string') return (h) => h.action(action);
  const url = action.open.split('%s').join(encodeURIComponent(text));
  return (h) => h.openUrl(url, action.target ?? 'tab');
}

// Monta os descritores: [{ separator: true } | { label, enabled, run }]. Separadores repetidos ou nas pontas são removidos.
function buildMenu({ menuConfig, params, pageUrl, edit = {}, nav = {}, engineName = 'buscador' }) {
  const kind = contextKind(params);
  const ctx = { params, edit, nav, engineName };
  const text = contextText(params, pageUrl);
  const luaCtx = luaContext(kind, params, pageUrl);
  const items = menuConfig[kind].map((id) => {
    if (id === SEPARATOR) return { separator: true };
    const make = BUILTIN[id];
    if (make) return { enabled: true, ...make(ctx) };
    const custom = menuConfig.items[id];
    return { label: custom.label, enabled: true, run: customRun(custom, text, luaCtx) };
  });
  const cleaned = [];
  for (const item of items) {
    if (item.separator && (cleaned.length === 0 || cleaned.at(-1).separator)) continue; // sem separador no começo nem repetido
    cleaned.push(item);
  }
  while (cleaned.at(-1)?.separator) cleaned.pop(); // nem no fim
  return { kind, items: cleaned };
}

module.exports = { contextKind, contextText, buildMenu, BUILTIN };
