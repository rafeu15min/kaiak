'use strict';
// Botões do navegador (k.button): coleção ORDENADA na ordem de leitura do kaiak.lua. Cada botão mora num slot (`slot`)
// cujo conteúdo mostre botões: "buttons" (faixa só de botões), "address" ou "tabs". Módulo puro (sem Electron).
const { applyOps } = require('./ordered-ops');
const { unknownMessage } = require('./config-keys');
const { contentKind } = require('./slot-content');

const BUTTON_ID = /^[A-Za-z][\w-]*$/;
const SLOT_WITH_BUTTONS = ['buttons', 'address', 'tabs']; // conteúdos de slot que desenham botões
const MAX_SVG = 20_000;
const FIELDS = ['icon', 'label', 'tooltip', 'action', 'slot', 'shape', 'label_place', 'states', 'state', 'badge', 'enabled'];
const STATE_FIELDS = ['icon', 'label', 'tooltip'];
const SHAPES = ['square', 'row'];
const LABEL_PLACES = ['right', 'left'];
const REQUIRED = ['slot', 'action'];
const ICON_KEYS = ['text', 'svg', 'file'];
const ACTION_KEYS = ['open', 'toggle', 'target', 'theme', 'exec', 'args'];
const isText = (v) => typeof v === 'string' && v.length > 0;

// Ícone: texto/emoji ("🍪"), { svg = "<svg ...>" } ou { file = "caminho.png|svg" } (lido uma vez, sem rede).
function checkIcon(icon) {
  if (typeof icon === 'string') return icon.length > 0 && icon.length <= 8 ? null : 'texto de 1 a 8 caracteres (emoji ou letras)';
  const keys = icon && typeof icon === 'object' ? Object.keys(icon) : [];
  if (keys.length !== 1 || !ICON_KEYS.includes(keys[0])) return `texto, ou uma tabela com exatamente UM de: ${ICON_KEYS.join(', ')}`;
  const [key] = keys;
  if (!isText(icon[key])) return `"${key}" deve ser um texto não vazio`;
  if (key === 'svg' && (!/^\s*<svg[\s>]/i.test(icon.svg) || icon.svg.length > MAX_SVG)) return `"svg" deve começar com <svg e ter até ${MAX_SVG} caracteres`;
  return null;
}

// SVG "sem cor informada": nenhum fill/stroke/stop-color com cor de verdade (nem gradiente ou imagem embutida). Esses
// ícones são pintados com a cor do texto do tema; os que trazem cores próprias ficam como estão.
const COLOR_ATTR = /\b(?:fill|stroke|stop-color|flood-color|color)\s*(?:=\s*["']|:\s*)\s*(?!none\b|currentColor\b|inherit\b|transparent\b|url\(#)[^"';}\s]/i;
const svgHasColor = (svg) => COLOR_ATTR.test(svg) || /<(?:image|linearGradient|radialGradient|style)\b/i.test(svg);

// Selo: número inteiro >= 0 (0 some), texto de até 4 caracteres, ou false (sem selo).
const checkBadge = (v) => (v === false || (Number.isInteger(v) && v >= 0) || (typeof v === 'string' && v.length > 0 && v.length <= 4) ? null : 'número inteiro (0 esconde), texto de até 4 caracteres ou false');

// Ação: nome de uma ação do navegador (texto), função Lua, { open = "https://...", target? } ou { toggle = "slot" }.
function checkAction(action, knownActions) {
  if (typeof action === 'function') return null;
  if (typeof action === 'string') return knownActions.includes(action) ? null : `ação desconhecida "${action}" (conhecidas: ${knownActions.join(', ')})`;
  const keys = action && typeof action === 'object' ? Object.keys(action) : [];
  const stray = keys.find((key) => !ACTION_KEYS.includes(key));
  if (keys.length === 0 || stray) return `esperado ação (texto), função, { open = "https://...", target = "tab" }, { toggle = "slot" }, { theme = "nome" } ou { exec = "id" }${stray ? ` (chave "${stray}" desconhecida)` : ''}`;
  if ('exec' in action) {
    const extra = keys.filter((key) => !['exec', 'args'].includes(key));
    const argsOk = action.args === undefined || (Array.isArray(action.args) && action.args.every((a) => ['string', 'number'].includes(typeof a)));
    return isText(action.exec) && extra.length === 0 && argsOk ? null : '{ exec = "id", args = { "extra" } } (args é opcional, lista de textos)';
  }
  if ('theme' in action) return keys.length === 1 && isText(action.theme) ? null : '{ theme = "nome" } não aceita outros campos';
  if ('toggle' in action) return keys.length === 1 && isText(action.toggle) ? null : '{ toggle = "id-do-slot" } não aceita outros campos';
  if (!/^https?:\/\/\S+$/.test(action.open ?? '')) return '{ open = ... } precisa de um endereço http:// ou https://';
  return action.target === undefined || isText(action.target) ? null : '"target" deve ser "tab" ou o id de um slot com site';
}

// Os destinos da ação precisam existir no layout: { toggle = slot } e { open = ..., target = slot com site }.
function checkTargets(action, layout, themes, exec = {}) {
  if (typeof action !== 'object') return null;
  if ('exec' in action) return exec[action.exec] ? null : `o comando "${action.exec}" não existe (declare com k.exec("${action.exec}", { cmd = ... }))`;
  if ('theme' in action) return themes[action.theme] ? null : `o tema "${action.theme}" não existe (declare com k.theme("${action.theme}", {...}))`;
  if ('toggle' in action) return layout[action.toggle] ? null : `o slot "${action.toggle}" não existe no layout`;
  const { target } = action;
  if (target === undefined || target === 'tab') return null;
  if (!layout[target]) return `target "${target}": esse slot não existe no layout (use "tab" ou o id de um slot com site)`;
  return contentKind(layout[target].content) === 'url' ? null : `target "${target}": esse slot não tem um site (content = { url = ... })`;
}

// states = { nome = { icon?, label?, tooltip? } }: cada estado SOBRESCREVE o visual base enquanto ativo; state = nome inicial.
function checkStates(id, spec, warnings) {
  if (spec.states === undefined && spec.state === undefined) return;
  const states = spec.states && typeof spec.states === 'object' && !Array.isArray(spec.states) ? spec.states : null;
  if (!states && spec.states !== undefined) {
    warnings.push(`"buttons.${id}.states" inválido: esperado uma tabela { nome = { icon, label, tooltip } }`);
    delete spec.states;
  }
  for (const [name, state] of Object.entries(states ?? {})) {
    const keys = state && typeof state === 'object' ? Object.keys(state) : null;
    const problem = !keys ? 'esperado uma tabela' : (keys.find((key) => !STATE_FIELDS.includes(key)) && `chave desconhecida (aceitas: ${STATE_FIELDS.join(', ')})`)
      || (state.icon !== undefined && checkIcon(state.icon));
    if (!problem) continue;
    warnings.push(`"buttons.${id}.states.${name}" inválido: ${problem}; estado ignorado`);
    delete states[name];
  }
  if (spec.state !== undefined && !(states && states[spec.state])) {
    warnings.push(`"buttons.${id}.state" inválido: o estado "${spec.state}" não existe em states`);
    delete spec.state;
  }
}

// Confere um botão já mesclado. Devolve false se ele não serve (e diz por quê).
function checkButton(id, spec, ctx, warnings) {
  const bad = (field, problem) => warnings.push(`"buttons.${id}.${field}" inválido: ${problem}`);
  Object.keys(spec).filter((field) => !FIELDS.includes(field))
    .forEach((field) => warnings.push(unknownMessage(['buttons', id, field], FIELDS)));
  const enumProblem = (field, allowed) => spec[field] !== undefined && !allowed.includes(spec[field]);
  for (const [field, allowed] of [['shape', SHAPES], ['label_place', LABEL_PLACES]]) {
    if (!enumProblem(field, allowed)) continue;
    bad(field, `um de: ${allowed.join(', ')}`);
    delete spec[field];
  }
  if (spec.enabled !== undefined && typeof spec.enabled !== 'boolean') { bad('enabled', 'true ou false'); delete spec.enabled; }
  const badgeProblem = spec.badge === undefined ? null : checkBadge(spec.badge);
  if (badgeProblem) { bad('badge', badgeProblem); delete spec.badge; }
  checkStates(id, spec, warnings);
  const missing = REQUIRED.filter((field) => spec[field] === undefined);
  if (missing.length > 0) {
    warnings.push(`botão "${id}" incompleto (faltam: ${missing.join(', ')}): ignorado`);
    return false;
  }
  if (spec.icon === undefined && spec.label === undefined) {
    warnings.push(`botão "${id}" sem icon nem label: ignorado`);
    return false;
  }
  for (const field of ['label', 'tooltip']) {
    if (spec[field] !== undefined && (typeof spec[field] !== 'string' || spec[field].length > 40)) {
      bad(field, 'texto de até 40 caracteres');
      delete spec[field];
    }
  }
  const problems = [
    ['icon', spec.icon === undefined ? null : checkIcon(spec.icon)],
    ['action', checkAction(spec.action, ctx.actions) ?? checkTargets(spec.action, ctx.layout, ctx.themes ?? {}, ctx.exec ?? {})],
    ['slot', ctx.layout[spec.slot] === undefined ? `o slot "${spec.slot}" não existe no layout` : null],
  ];
  const [field, problem] = problems.find(([, p]) => p) ?? [];
  if (problem) {
    bad(field, `${problem}; botão ignorado`);
    return false;
  }
  if (spec.shape === 'square' && spec.label !== undefined) {
    warnings.push(`botão "${id}": shape = "square" não mostra label (vira só o tooltip); use shape = "row" para ver o texto`);
  }
  const kind = ctx.layout[spec.slot].content;
  const supported = typeof kind === 'string' && SLOT_WITH_BUTTONS.includes(kind);
  if (!supported) bad('slot', `o slot "${spec.slot}" não mostra botões (conteúdo precisa ser ${SLOT_WITH_BUTTONS.join(', ')}); botão ignorado`);
  return supported;
}

// ops: lista de operações do Lua. ctx: { layout (já resolvido), actions (nomes de ações) }. Devolve { id: spec } em ordem.
function buildButtons(ops, ctx, warnings) {
  const map = new Map();
  applyOps(map, ops, { idPattern: BUTTON_ID, noun: 'botão', path: 'buttons', replace: ['icon', 'action'], warnings });
  const out = {};
  for (const [id, spec] of map) {
    if (checkButton(id, spec, ctx, warnings)) out[id] = spec;
  }
  return out;
}

module.exports = { buildButtons, checkIcon, checkAction, checkBadge, svgHasColor, SLOT_WITH_BUTTONS };
