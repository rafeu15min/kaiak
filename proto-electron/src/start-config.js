'use strict';
// Página inicial (kaiak://start): validação da config `k.start`. Módulo puro. Tudo que chega aqui vira CSS dentro de uma
// página gerada, então cores, gradientes e medidas passam por padrões ESTRITOS (nada de ; { } < > aspas ou url()).
const { checkIcon } = require('./buttons-config');
const { checkItem } = require('./speed-dial');

const START_DEFAULTS = {
  enabled: true, // false: aba nova abre em branco
  search: true, // campo de busca (usa o mecanismo padrão)
  background: { color: '', gradient: '', image: false }, // color vazia = cor de fundo do tema
  speed_dial: false, // grade de atalhos (false = desligado; true = padrões; ou uma tabela). Só o .lua liga.
  widgets: [], // blocos { place, width?, height?, html, css? }
};

const PLACES = ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|(?:rgb|hsl)a?\([\d\s.,%/]{1,40}\))$/i;
const GRADIENT = /^(?:linear|radial|conic)-gradient\([#\w\s.,%()/-]{1,280}\)$/;
const SIZE = /^(?:\d{1,4}(?:\.\d+)?(?:px|%|vw|vh)|cover|contain)$/;
const IMAGE_KEYS = ['file', 'size', 'place', 'tint'];

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isColor = (v) => typeof v === 'string' && COLOR.test(v);
const isGradient = (v) => typeof v === 'string' && GRADIENT.test(v) && !/url\s*\(/i.test(v);

// Confere `config.start` (já mesclado com o padrão). Valor inválido: avisa e usa o padrão.
function checkStart(start, warnings) {
  const bad = (field, problem) => warnings.push(`"start.${field}" inválido: ${problem}; usando o padrão`);
  for (const field of ['enabled', 'search']) {
    if (typeof start[field] === 'boolean') continue;
    bad(field, 'true ou false');
    start[field] = START_DEFAULTS[field];
  }
  checkBackground(start.background, 'start.background', warnings);
  start.speed_dial = checkDial(start.speed_dial, warnings);
  start.widgets = checkWidgets(start.widgets, warnings);
}

// Fundo { color, gradient, image } (compartilhado pela página inicial e pela tela de boot). `label` abre as mensagens.
function checkBackground(bg, label, warnings) {
  const bad = (field, problem) => warnings.push(`"${label}.${field}" inválido: ${problem}; usando o padrão`);
  if (bg.color !== '' && !isColor(bg.color)) { bad('color', 'cor como "#252734", "rgb(...)" ou um nome'); bg.color = ''; }
  if (bg.gradient !== '' && !isGradient(bg.gradient)) { bad('gradient', 'linear-gradient(...), radial-gradient(...) ou conic-gradient(...) sem url()'); bg.gradient = ''; }
  bg.image = checkImage(bg.image, `${label}.image`, warnings);
}

function checkImage(image, label, warnings) {
  if (image === false || image === undefined) return false;
  const bad = (field, problem) => warnings.push(`"${label}${field ? `.${field}` : ''}" inválido: ${problem}`);
  if (!isPlain(image)) { bad('', 'esperado { file = "caminho", size, place, tint } ou false; ignorada'); return false; }
  Object.keys(image).filter((key) => !IMAGE_KEYS.includes(key)).forEach((key) => bad(key, `chave desconhecida (aceitas: ${IMAGE_KEYS.join(', ')})`));
  if (typeof image.file !== 'string' || image.file === '') { bad('file', 'caminho do arquivo (obrigatório); imagem ignorada'); return false; }
  const out = { file: image.file, size: '40%', place: 'center', tint: false };
  if (image.size !== undefined) { SIZE.test(image.size) ? (out.size = image.size) : bad('size', 'medida como "40%", "300px", "cover" ou "contain"; usando 40%'); }
  if (image.place !== undefined) { PLACES.includes(image.place) ? (out.place = image.place) : bad('place', `um de: ${PLACES.join(', ')}; usando center`); }
  if (image.tint !== undefined) {
    const ok = typeof image.tint === 'boolean' || isColor(image.tint);
    ok ? (out.tint = image.tint) : bad('tint', 'true (cor de destaque do tema), uma cor ou false; sem tinta');
  }
  return out;
}

const DIAL_KEYS = ['columns', 'size', 'shape', 'editable', 'items'];
const DIAL_DEFAULTS = { columns: 6, size: 96, shape: 'square', editable: true, items: [] };
const WIDGET_KEYS = ['place', 'width', 'height', 'html', 'css'];
const MAX_WIDGETS = 12;
const MAX_TEXT = 20_000;
const LENGTH = /^\d{1,4}(?:\.\d+)?(?:px|%|vw|vh)$/;

// speed_dial: true | { columns, size, shape, editable, items = { { title, url, icon } } }. Devolve a forma completa (ou false).
function checkDial(dial, warnings) {
  if (dial === false || dial === undefined) return false;
  const bad = (field, problem) => warnings.push(`"start.speed_dial${field ? `.${field}` : ''}" inválido: ${problem}`);
  if (dial === true) return structuredClone(DIAL_DEFAULTS);
  if (!isPlain(dial)) { bad('', 'esperado true, false ou { columns, size, shape, editable, items }; desligado'); return false; }
  Object.keys(dial).filter((key) => !DIAL_KEYS.includes(key)).forEach((key) => bad(key, `chave desconhecida (aceitas: ${DIAL_KEYS.join(', ')})`));
  const out = structuredClone(DIAL_DEFAULTS);
  if (Number.isInteger(dial.columns) && dial.columns >= 1 && dial.columns <= 12) out.columns = dial.columns;
  else if (dial.columns !== undefined) bad('columns', 'inteiro de 1 a 12; usando 6');
  if (Number.isInteger(dial.size) && dial.size >= 48 && dial.size <= 200) out.size = dial.size;
  else if (dial.size !== undefined) bad('size', 'inteiro de 48 a 200 (px); usando 96');
  if (['square', 'round'].includes(dial.shape)) out.shape = dial.shape;
  else if (dial.shape !== undefined) bad('shape', '"square" ou "round"; usando square');
  if (typeof dial.editable === 'boolean') out.editable = dial.editable;
  else if (dial.editable !== undefined) bad('editable', 'true ou false (false: a página não mostra adicionar/remover); usando true');
  out.items = checkDialItems(dial.items, bad);
  return out;
}

function checkDialItems(items, bad) {
  const list = isPlain(items) && Object.keys(items).length === 0 ? [] : items ?? [];
  if (!Array.isArray(list)) { bad('items', 'esperado uma lista { { title, url, icon }, ... }'); return []; }
  return list.flatMap((item, index) => {
    const checked = checkItem(item);
    const iconProblem = item?.icon === undefined ? null : checkIcon(item.icon);
    const problem = checked.error ?? (iconProblem && `icon: ${iconProblem}`);
    if (problem) bad(`items[${index + 1}]`, `${problem}; atalho ignorado`);
    return problem ? [] : [{ ...checked, ...(item.icon === undefined ? {} : { icon: item.icon }) }];
  });
}

// widgets: lista de blocos livres com HTML/CSS próprios (sem script: a CSP da página barra).
function checkWidgets(widgets, warnings) {
  const list = isPlain(widgets) && Object.keys(widgets).length === 0 ? [] : widgets;
  if (!Array.isArray(list)) { warnings.push('"start.widgets" inválido: esperado uma lista { { place, html, css }, ... }; ignorado'); return []; }
  if (list.length > MAX_WIDGETS) warnings.push(`"start.widgets": no máximo ${MAX_WIDGETS} blocos; os demais foram ignorados`);
  return list.slice(0, MAX_WIDGETS).flatMap((widget, index) => {
    const bad = (field, problem) => warnings.push(`"start.widgets[${index + 1}]${field ? `.${field}` : ''}" inválido: ${problem}`);
    const reject = (field, problem) => { bad(field, problem); return []; }; // bloco inteiro descartado (flatMap: lista vazia)
    if (!isPlain(widget)) return reject('', 'esperado { place, html, ... }; ignorado');
    Object.keys(widget).filter((key) => !WIDGET_KEYS.includes(key)).forEach((key) => bad(key, `chave desconhecida (aceitas: ${WIDGET_KEYS.join(', ')})`));
    const text = (v) => typeof v === 'string' && v.length <= MAX_TEXT;
    if (!text(widget.html) || widget.html === '') return reject('html', `texto de 1 a ${MAX_TEXT} caracteres (obrigatório); bloco ignorado`);
    const out = { place: 'bottom', html: widget.html, css: '' };
    if (PLACES.includes(widget.place)) out.place = widget.place;
    else if (widget.place !== undefined) bad('place', `um de: ${PLACES.join(', ')}; usando bottom`);
    for (const field of ['width', 'height']) {
      if (widget[field] === undefined) continue;
      if (Number.isFinite(widget[field]) && widget[field] > 0) out[field] = `${widget[field]}px`;
      else if (typeof widget[field] === 'string' && LENGTH.test(widget[field])) out[field] = widget[field];
      else bad(field, 'número em px ou texto como "40%"; automático');
    }
    if (widget.css !== undefined) {
      if (text(widget.css) && !/<\/style/i.test(widget.css)) out.css = widget.css;
      else bad('css', `texto de até ${MAX_TEXT} caracteres sem </style; ignorado`);
    }
    return [out];
  });
}

const BOOT_DEFAULTS = {
  enabled: true, // false: sem tela de boot (a janela já nasce na cor do tema)
  background: { color: '', gradient: '', image: false }, // mesmos campos da página inicial; color vazia = cor do tema
  min_ms: 0, // tempo mínimo na tela (evita um piscar rápido demais)
  max_ms: 4000, // tempo máximo: some mesmo que a 1ª aba não termine de carregar
};

// k.boot { enabled, background, min_ms, max_ms }: a tela exibida enquanto a 1ª aba carrega.
function checkBoot(boot, warnings) {
  const bad = (field, problem) => warnings.push(`"boot.${field}" inválido: ${problem}; usando o padrão`);
  if (typeof boot.enabled !== 'boolean') { bad('enabled', 'true ou false'); boot.enabled = BOOT_DEFAULTS.enabled; }
  for (const [field, min, max] of [['min_ms', 0, 10_000], ['max_ms', 200, 15_000]]) {
    if (Number.isInteger(boot[field]) && boot[field] >= min && boot[field] <= max) continue;
    bad(field, `inteiro de ${min} a ${max}`);
    boot[field] = BOOT_DEFAULTS[field];
  }
  if (boot.min_ms > boot.max_ms) { bad('min_ms', 'não pode passar de max_ms'); boot.min_ms = 0; }
  checkBackground(boot.background, 'boot.background', warnings);
}

module.exports = { START_DEFAULTS, BOOT_DEFAULTS, DIAL_DEFAULTS, PLACES, checkStart, checkBoot, isColor };
