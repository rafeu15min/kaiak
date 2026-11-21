'use strict';
// Menu de contexto (botão direito): validação da config `k.context_menu`. Módulo puro.
// Cada CONTEXTO tem uma lista ordenada de itens (ids de fábrica, ids de itens do .lua, ou "-" = separador). A lista do .lua SUBSTITUI a de
// fábrica daquele contexto; lista vazia = nenhum menu naquele contexto.
const SEPARATOR = '-';
const CONTEXTS = ['link', 'image', 'selection', 'editable', 'page'];

const BUILTIN_IDS = [
  'open_link_tab', 'open_link_background', 'open_link_private', 'copy_link',
  'open_image_tab', 'save_image', 'copy_image', 'copy_image_address',
  'undo', 'redo', 'cut', 'copy', 'paste', 'select_all', 'search_selection',
  'back', 'forward', 'reload', 'find', 'print', 'save_pdf', 'inspect',
];

const DEFAULT_LISTS = {
  link: ['open_link_tab', 'open_link_background', 'open_link_private', SEPARATOR, 'copy_link', SEPARATOR, 'inspect'],
  image: ['open_image_tab', 'save_image', SEPARATOR, 'copy_image', 'copy_image_address', SEPARATOR, 'inspect'],
  selection: ['copy', 'search_selection', SEPARATOR, 'inspect'],
  editable: ['undo', 'redo', SEPARATOR, 'cut', 'copy', 'paste', 'select_all'],
  page: ['back', 'forward', 'reload', SEPARATOR, 'find', 'print', 'save_pdf', SEPARATOR, 'inspect'],
};

const CONTEXT_MENU_DEFAULTS = { enabled: true, ...structuredClone(DEFAULT_LISTS), items: {} };

const ITEM_ID = /^[a-z][\w-]*$/;
const ITEM_KEYS = ['label', 'action'];
const MAX_LABEL = 60;
const OPEN_TARGETS = ['tab', 'background', 'private'];
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// action de item do .lua: nome de ação do navegador, função Lua (recebe o contexto) ou { open = "https://...%s", target = "tab" }.
function checkItemAction(action, knownActions) {
  if (typeof action === 'function') return null;
  if (typeof action === 'string') return knownActions.includes(action) ? null : `ação desconhecida "${action}" (conhecidas: ${knownActions.join(', ')})`;
  const keys = isPlain(action) ? Object.keys(action) : [];
  const stray = keys.find((key) => !['open', 'target'].includes(key));
  if (keys.length === 0 || stray) return 'esperado nome de ação, função ou { open = "https://...", target = "tab" }';
  if (!/^https?:\/\/\S+$/.test(action.open ?? '')) return '{ open = ... } precisa de um endereço http:// ou https:// (%s vira o texto do contexto)';
  return action.target === undefined || OPEN_TARGETS.includes(action.target) ? null : `target deve ser um de: ${OPEN_TARGETS.join(', ')}`;
}

function cleanItems(items, knownActions, warnings) {
  const raw = isPlain(items) ? items : {};
  const out = {};
  for (const [id, item] of Object.entries(raw)) {
    const bad = (problem) => warnings.push(`"context_menu.items.${id}" inválido: ${problem}; item ignorado`);
    if (!ITEM_ID.test(id) || BUILTIN_IDS.includes(id) || id === SEPARATOR) { bad('id com letra minúscula inicial (letras, números, - e _), diferente dos itens de fábrica'); continue; }
    const unknown = isPlain(item) ? Object.keys(item).find((key) => !ITEM_KEYS.includes(key)) : null;
    const problem = !isPlain(item) ? 'esperado { label, action }'
      : unknown ? `chave desconhecida "${unknown}" (aceitas: ${ITEM_KEYS.join(', ')})`
      : typeof item.label !== 'string' || item.label === '' || item.label.length > MAX_LABEL ? `label de 1 a ${MAX_LABEL} caracteres`
      : item.action === undefined ? 'falta action' : checkItemAction(item.action, knownActions);
    if (problem) bad(problem);
    else out[id] = item;
  }
  return out;
}

// Confere `config.context_menu` (já mesclado). `knownActions`: nomes de ações do navegador.
function checkContextMenu(menu, knownActions, warnings) {
  if (typeof menu.enabled !== 'boolean') {
    warnings.push('"context_menu.enabled" inválido: true ou false; usando o padrão');
    menu.enabled = true;
  }
  menu.items = cleanItems(menu.items, knownActions, warnings);
  for (const context of CONTEXTS) {
    const raw = isPlain(menu[context]) && Object.keys(menu[context]).length === 0 ? [] : menu[context];
    if (!Array.isArray(raw) || !raw.every((id) => typeof id === 'string')) {
      warnings.push(`"context_menu.${context}" inválido: esperado uma lista de textos { "copy", "-", "inspect" }; usando o padrão`);
      menu[context] = [...DEFAULT_LISTS[context]];
      continue;
    }
    menu[context] = raw.filter((id) => {
      const ok = id === SEPARATOR || BUILTIN_IDS.includes(id) || id in menu.items;
      if (!ok) warnings.push(`"context_menu.${context}": item desconhecido "${id}" (de fábrica: ${BUILTIN_IDS.join(', ')}; ou declare em items); ignorado`);
      return ok;
    });
  }
}

module.exports = { CONTEXT_MENU_DEFAULTS, CONTEXTS, BUILTIN_IDS, DEFAULT_LISTS, SEPARATOR, checkContextMenu };
