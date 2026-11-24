'use strict';
// Configuração do KaiaK: padrão embutido + o que o usuário definir, lida UMA vez na partida.
// Valores são dados (não funções chamadas por quadro). Os atalhos podem apontar para uma ação
// nomeada (texto) ou para uma função do usuário; `false` desfaz um atalho do padrão.
const { STYLES, PLACES, STACKS, KINDS, SYSTEM_SURFACE } = require('./notify-styles');
const { parsePercent, parseLength } = require('./units');
const { unknownKeys, unknownMessage } = require('./config-keys');
const { checkContent, contentKind } = require('./slot-content');
const { buildButtons, initialTheme } = require('./buttons-config');
const { buildExec } = require('./exec-config');
const { PAGE_SIZES, MARGINS } = require('./print');
const { CONTEXT_MENU_DEFAULTS, checkContextMenu } = require('./context-menu-config');
const { START_DEFAULTS, BOOT_DEFAULTS, checkStart, checkBoot, isColor } = require('./start-config');
const { ACTION_NAMES } = require('./actions');

const DEFAULTS = {
  layout: { // slots: faixas encostadas numa borda; mordem a janela NA ORDEM DE LEITURA do kaiak.lua (sem campo `order`)
    rail: { content: 'tabs', place: 'left', size: 42, expand: 240, mode: 'push' }, // trilho de abas; expande ao passar o mouse
    bar: { content: 'address', place: 'top', size: 40, mode: 'push' }, // barra de endereço
  },
  // menu de contexto (botão direito): uma lista por contexto (link, image, selection, editable, page) + items próprios (k.context_menu)
  context_menu: CONTEXT_MENU_DEFAULTS,
  // impressão: page_size (A3 A4 A5 Legal Letter Tabloid), landscape (paisagem), background (cores e imagens de fundo) valem para o PDF e o diálogo
  // scale em % (10-200), margins = default|none|minimum; place/width/height/css/html = layout da tela de impressão (html com data-print="save")
  print: { page_size: 'A4', landscape: false, background: true, scale: 100, margins: 'default', place: 'center', width: 440, height: 400, css: '', html: '' },
  // zoom da página: levels em % (Ctrl +/-/scroll percorrem), default em %, remember = guarda por site (aba privada nunca), notify = aviso "Zoom N%"
  zoom: { levels: [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500], default: 100, remember: true, notify: true },
  // busca na página (Ctrl+F): caixa por cima da página. html/css vazios = modelo de fábrica; case_sensitive/whole_word = estado inicial dos botões
  find: { enabled: true, place: 'top-right', width: 400, height: 46, margin: 12, case_sensitive: false, whole_word: false, html: '', css: '' },
  session: { restore: true }, // abas ao abrir (k.session): true = reabre as abas da última vez (a privativa nunca é guardada)
  boot: BOOT_DEFAULTS, // tela de boot (k.boot): fundo enquanto a 1ª aba carrega
  start: START_DEFAULTS, // página inicial kaiak://start (fundo, busca)
  themes: {}, // temas nomeados (k.theme("nome", {...})), cada um completo; o 1º declarado é o inicial; vazio = só `theme`
  exec: {}, // comandos da máquina (k.exec): nenhum de fábrica
  buttons: {}, // botões extras (k.button): nenhum de fábrica; a barra tem voltar/avançar/recarregar embutidos
  timing: { hover_delay_ms: 120, collapse_delay_ms: 250, animation_ms: 150, discard_after_s: 120 },
  theme: {
    bg: '#1e1f24', fg: '#d8dae0', muted: '#8a8d98', accent: '#7aa2f7',
    panel: '#2a2c33', border: '#2b2d34', input: '#15161a', color_scheme: 'dark', scheme: 'default', vars: {}, tab_active: '#33364a', tab_icon: '#44475a', hover: '#3d4050', disabled: '#50525c', private: '#bb9af7', private_bg: '#231f2e', private_tab: '#2c2740', private_label: 'Privada', font: 'system-ui, sans-serif',
  },
  security: {
    https_only: true, // http:// vira https:// (rede local e 'https_exceptions' ficam de fora)
    https_exceptions: [], // hosts que podem ficar em http
    cert_exceptions: [], // hosts cujo certificado inválido (autoassinado, vencido...) é ACEITO mesmo assim: só o .lua decide, sem botão na tela
    block_third_party_cookies: true, // sem Cookie/Set-Cookie em pedidos de outro site
    send_gpc: true, // envia Sec-GPC e DNT
    trim_referrer: true, // para outro site, o Referer leva só a origem
    permissions: ['fullscreen', 'clipboard-sanitized-write'], // o resto (câmera, localização...) é negado
    allowed_schemes: ['http:', 'https:', 'about:'], // esquemas que uma página pode abrir
  },
  devtools: {
    enabled: true, // false: F12 e Ctrl+Shift+I não fazem nada
    place: 'right', // 'right' | 'bottom' (embutidas no navegador) | 'window' (janela separada)
    size: '40%', // parte da janela que as DevTools ocupam, de '15%' a '80%'
  },
  downloads: {
    dir: '', // pasta de destino ("~/x" vale); vazio = a pasta de Downloads do sistema
  },
  notification: { // avisos: cada TIPO vai para uma SUPERFÍCIE (onde/como aparece) e fica na tela por timeout_ms
    types: {
      download: { surface: 'toast', timeout_ms: 1000 }, // "Baixando..." e "Download concluído"; surface = false: não mostrar
      alert: { surface: 'strip', timeout_ms: 1000 }, // alertas informativos; os que pedem ação ficam até dispensar; NÃO é download
    },
    surfaces: {
      toast: { place: 'bottom-right', style: 'pill', stack: 'replace', offset: [16, 16], close_all: false, counter: false, counter_format: '+%d' },
      strip: { place: 'top', style: 'strip', stack: 'down', offset: [0, 0], close_all: true, counter: false, counter_format: '+%d' },
    },
  },
  search: {
    default: 'ddg', // mecanismo usado quando você digita algo que não é endereço
    engines: { // "%s" = a consulta; "yt lofi" na barra usa o mecanismo "yt"; false remove um padrão
      ddg: 'https://duckduckgo.com/?q=%s',
      g: 'https://www.google.com/search?q=%s',
      yt: 'https://www.youtube.com/results?search_query=%s',
      w: 'https://pt.wikipedia.org/w/index.php?search=%s',
    },
  },
  blocking: {
    enabled: true, // liga/desliga todo o bloqueio
    ads: true, // anúncios e rastreadores: só subrecursos de outro site (lista data/blocklists/ads.hosts)
    malware: true, // domínios de malware/phishing, inclusive ao navegar (data/blocklists/malware.hosts)
    update_hours: 12, // baixa as listas de novo quando passam de N horas (0 desliga a atualização automática)
    allow: [], // domínios que NUNCA são bloqueados (vence tudo)
    block: [], // domínios que você quer bloquear sempre, inclusive ao navegar
  },
  keys: {
    'ctrl+t': 'new_tab',
    'ctrl+w': 'close_tab',
    'ctrl+l': 'focus_address',
    'ctrl+tab': 'next_tab',
    'ctrl+shift+tab': 'prev_tab',
    'alt+left': 'back',
    'alt+right': 'forward',
    'f5': 'reload',
    'f12': 'toggle_devtools',
    'ctrl+shift+n': 'new_private_tab',
    'ctrl+shift+i': 'toggle_devtools',
    'ctrl+r': 'reload',
    'ctrl+=': 'zoom_in',
    'ctrl+plus': 'zoom_in',
    'ctrl+shift+plus': 'zoom_in',
    'ctrl+-': 'zoom_out',
    'ctrl+0': 'zoom_reset',
    'ctrl+p': 'print', // como o Chromium: abre a tela de impressão (com "Salvar como PDF")
    'ctrl+shift+p': 'print_system', // como o Chromium: diálogo de impressão do sistema (precisa de impressora)
    'ctrl+f': 'find',
    'f3': 'find_next',
    'shift+f3': 'find_prev',
  },
};

// [caminho, mínimo, máximo]
const NUMBER_RANGES = [
  ['timing.hover_delay_ms', 0, 5000],
  ['timing.collapse_delay_ms', 0, 5000],
  ['timing.animation_ms', 0, 2000],
  ['timing.discard_after_s', 0, 86400],
  ['blocking.update_hours', 0, 720],
  ['notification.types.download.timeout_ms', 0, 60000],
  ['notification.types.alert.timeout_ms', 0, 60000],
];

const { applyOps, toOps, merge, isPlain } = require('./ordered-ops');
const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

function checkNumbers(config, warnings) {
  for (const [path, min, max] of NUMBER_RANGES) {
    const value = getPath(config, path);
    const ok = typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
    if (ok) continue;
    warnings.push(`"${path}" inválido (${String(value)}): esperado número entre ${min} e ${max}; usando o padrão`);
    setPath(config, path, getPath(DEFAULTS, path));
  }
}

function checkTheme(config, warnings) {
  checkThemeColors(config.theme, 'theme', config.theme, warnings);
}

// Confere os campos de um tema (todos texto); o que falta ou é inválido vem de `fallback`.
function checkThemeColors(theme, label, fallback, warnings) {
  for (const key of Object.keys(DEFAULTS.theme).filter((name) => name !== 'vars')) {
    if (typeof theme[key] === 'string') continue;
    warnings.push(`"${label}.${key}" inválido: esperado texto; usando o padrão`);
    theme[key] = DEFAULTS.theme[key] ?? fallback[key];
  }
  checkSchemes(theme, label, warnings);
  checkVars(theme, label, warnings);
}

// color_scheme é o valor NATIVO do Chromium (barras de rolagem, campos): só dark|light. scheme é um NOME LIVRE do dono
// (vira data-scheme="nome" nas views, para o CSS/HTML próprio escolher estilos).
function checkSchemes(theme, label, warnings) {
  if (!['dark', 'light'].includes(theme.color_scheme)) {
    warnings.push(`"${label}.color_scheme" inválido (${theme.color_scheme}): esperado "dark" ou "light"; usando "dark"`);
    theme.color_scheme = 'dark';
  }
  if (SCHEME_NAME.test(theme.scheme)) return;
  warnings.push(`"${label}.scheme" inválido (${theme.scheme}): nome com letras, números, - e _ (até 40); usando "default"`);
  theme.scheme = 'default';
}

// vars = { nome = "valor" } vira a variável CSS --nome em toda view de interface (para o HTML/CSS próprio do dono).
function checkVars(theme, label, warnings) {
  const vars = theme.vars;
  const ok = vars && typeof vars === 'object' && !Array.isArray(vars);
  if (!ok) {
    warnings.push(`"${label}.vars" inválido: esperado uma tabela { nome = "valor" }; ignorado`);
    theme.vars = {};
    return;
  }
  for (const [name, value] of Object.entries(vars)) {
    if (VAR_NAME.test(name) && typeof value === 'string' && VAR_VALUE.test(value)) continue;
    warnings.push(`"${label}.vars.${name}" inválido: nome começa com letra minúscula (letras, números, - e _) e valor em texto sem ; { } < > " \\ (até 200 caracteres); ignorado`);
    delete vars[name];
  }
}

// Temas nomeados, na ORDEM DE LEITURA do .lua (mesma regra do layout). Cada um parte do `theme` base e vira completo.
// O 1º declarado é o inicial (config.theme); o alternar percorre nessa ordem.
function buildThemes(config, ops, warnings) {
  const specs = new Map();
  applyOps(specs, ops, { idPattern: THEME_ID, noun: 'tema', path: 'themes', warnings });
  config.themes = {};
  for (const [name, spec] of specs) {
    Object.keys(spec).filter((key) => !(key in DEFAULTS.theme)).forEach((key) => {
      warnings.push(unknownMessage(['themes', name, key], Object.keys(DEFAULTS.theme)));
      delete spec[key];
    });
    const theme = merge(config.theme, spec);
    checkThemeColors(theme, `themes.${name}`, config.theme, warnings);
    config.themes[name] = theme;
  }
  const first = Object.keys(config.themes)[0];
  if (first) config.theme = config.themes[first];
}

// Campos verificados por seção: [booleanos, listas de texto].
const SECTION_FIELDS = {
  security: [['https_only', 'block_third_party_cookies', 'send_gpc', 'trim_referrer'], ['https_exceptions', 'cert_exceptions', 'permissions', 'allowed_schemes']],
  blocking: [['enabled', 'ads', 'malware'], ['allow', 'block']],
  devtools: [['enabled'], []],
  session: [['restore'], []],
  find: [['enabled', 'case_sensitive', 'whole_word'], []],
  zoom: [['remember', 'notify'], []],
  print: [['landscape', 'background'], []],
};

// Uma tabela Lua vazia chega como {}: vale como lista vazia.
function asList(value) {
  return isPlain(value) && Object.keys(value).length === 0 ? [] : value;
}

function checkSection(config, warnings, name) {
  const section = config[name];
  const [booleans, lists] = SECTION_FIELDS[name];
  for (const key of booleans) {
    if (typeof section[key] === 'boolean') continue;
    warnings.push(`"${name}.${key}" inválido: esperado true ou false; usando o padrão`);
    section[key] = DEFAULTS[name][key];
  }
  for (const key of lists) {
    const list = asList(section[key]);
    const ok = Array.isArray(list) && list.every((x) => typeof x === 'string');
    if (!ok) warnings.push(`"${name}.${key}" inválido: esperado lista de textos; usando o padrão`);
    section[key] = ok ? [...list] : [...DEFAULTS[name][key]];
  }
}

const validEngine = (name, template) => typeof template === 'string' && /^\S+$/.test(name)
  && /^https?:\/\/\S+$/.test(template) && template.includes('%s');

// Mecanismos de busca: false remove; inválido é ignorado com aviso; o padrão precisa existir.
function checkSearch(config, warnings) {
  const search = config.search;
  for (const [name, template] of Object.entries(search.engines)) {
    if (template === false) delete search.engines[name];
    else if (!validEngine(name, template)) {
      warnings.push(`"search.engines.${name}" inválido: esperado endereço http(s) com %s; ignorado`);
      delete search.engines[name];
    }
  }
  if (Object.keys(search.engines).length === 0) search.engines = { ...DEFAULTS.search.engines };
  if (typeof search.default === 'string' && search.engines[search.default]) return;
  const fallback = search.engines[DEFAULTS.search.default] ? DEFAULTS.search.default : Object.keys(search.engines)[0];
  warnings.push(`"search.default" inválido (${String(search.default)}): esperado o nome de um mecanismo; usando "${fallback}"`);
  search.default = fallback;
}

const DEVTOOLS_PLACES = ['right', 'bottom', 'window'];

// zoom.levels: lista de inteiros em % (25 a 500, sem repetir, ao menos 2); zoom.default: inteiro em % (25 a 500).
// print: valores de partida, e o layout da tela (lugar, medidas, css e modelo html próprio com data-print="save").
const PRINT_TEXT_MAX = 20_000;
function checkPrint(config, warnings) {
  const print = config.print;
  const bad = (field, problem) => warnings.push(`"print.${field}" inválido (${String(print[field]).slice(0, 40)}): ${problem}; usando o padrão`);
  const checks = [
    ['page_size', PAGE_SIZES.includes(print.page_size), `um de ${PAGE_SIZES.join(', ')}`],
    ['margins', MARGINS.includes(print.margins), `um de ${MARGINS.join(', ')}`],
    ['scale', Number.isInteger(print.scale) && print.scale >= 10 && print.scale <= 200, 'inteiro em % de 10 a 200'],
    ['place', print.place === 'center' || PLACES.includes(print.place), `center ou um de ${PLACES.join(', ')}`],
    ['width', Number.isInteger(print.width) && print.width >= 280 && print.width <= 900, 'inteiro em px de 280 a 900'],
    ['height', Number.isInteger(print.height) && print.height >= 240 && print.height <= 800, 'inteiro em px de 240 a 800'],
    ['html', typeof print.html === 'string' && print.html.length <= PRINT_TEXT_MAX, `texto de até ${PRINT_TEXT_MAX} caracteres`],
    ['css', typeof print.css === 'string' && print.css.length <= PRINT_TEXT_MAX && !/<\/style/i.test(print.css), `texto de até ${PRINT_TEXT_MAX} caracteres, sem </style`],
  ];
  checks.filter(([, ok]) => !ok).forEach(([field, , problem]) => { bad(field, problem); print[field] = DEFAULTS.print[field]; });
  if (print.html !== '' && !/data-print\s*=\s*["']save["']/.test(print.html)) {
    bad('html', 'precisa de um botão marcado com data-print="save" (sem ele não há como gerar o PDF)');
    print.html = '';
  }
}

function checkZoom(config, warnings) {
  const zoom = config.zoom;
  const list = Array.isArray(zoom.levels) ? zoom.levels : (isPlain(zoom.levels) && Object.keys(zoom.levels).length === 0 ? [] : null);
  const okList = list && list.length >= 2 && list.every((n) => Number.isInteger(n) && n >= 25 && n <= 500) && new Set(list).size === list.length;
  if (!okList) {
    warnings.push('"zoom.levels" inválido: esperado uma lista de pelo menos 2 inteiros diferentes em %, de 25 a 500; usando o padrão');
    zoom.levels = [...DEFAULTS.zoom.levels];
  } else {
    zoom.levels = [...list].sort((a, b) => a - b);
  }
  if (Number.isInteger(zoom.default) && zoom.default >= 25 && zoom.default <= 500) return;
  warnings.push(`"zoom.default" inválido (${String(zoom.default)}): esperado inteiro em % de 25 a 500; usando 100`);
  zoom.default = DEFAULTS.zoom.default;
}

// find: lugar (um dos 8 das bordas), medidas, e o modelo próprio (html/css) com data-find="input" obrigatório no html.
const FIND_TEXT_MAX = 20_000;
function checkFind(config, warnings) {
  const find = config.find;
  const bad = (field, problem) => warnings.push(`"find.${field}" inválido: ${problem}; usando o padrão`);
  if (!PLACES.includes(find.place)) { bad('place', `um de ${PLACES.join(', ')}`); find.place = DEFAULTS.find.place; }
  for (const [field, min, max] of [['width', 200, 1000], ['height', 28, 120], ['margin', 0, 100]]) {
    if (Number.isInteger(find[field]) && find[field] >= min && find[field] <= max) continue;
    bad(field, `inteiro em px de ${min} a ${max}`);
    find[field] = DEFAULTS.find[field];
  }
  for (const field of ['html', 'css']) {
    if (typeof find[field] === 'string' && find[field].length <= FIND_TEXT_MAX) continue;
    bad(field, `texto de até ${FIND_TEXT_MAX} caracteres`);
    find[field] = '';
  }
  if (/<\/style/i.test(find.css)) { bad('css', 'não pode conter </style'); find.css = ''; }
  if (find.html !== '' && !/data-find\s*=\s*["']input["']/.test(find.html)) {
    bad('html', 'precisa de um campo marcado com data-find="input" (sem ele não há onde digitar)');
    find.html = '';
  }
}

function checkDevtools(config, warnings) {
  const dev = config.devtools;
  if (!DEVTOOLS_PLACES.includes(dev.place)) {
    warnings.push(`"devtools.place" inválido (${String(dev.place)}): esperado ${DEVTOOLS_PLACES.join(', ')}; usando o padrão`);
    dev.place = DEFAULTS.devtools.place;
  }
  const fraction = parsePercent(dev.size);
  if (fraction !== null && fraction >= 0.15 && fraction <= 0.8) return;
  warnings.push(`"devtools.size" inválido (${JSON.stringify(dev.size)}): esperado texto com porcentagem de "15%" a "80%", ex.: "40%"; usando o padrão`);
  dev.size = DEFAULTS.devtools.size;
}

function checkDownloads(config, warnings) {
  if (typeof config.downloads.dir === 'string') return;
  warnings.push('"downloads.dir" inválido: esperado texto; usando a pasta de Downloads do sistema');
  config.downloads.dir = DEFAULTS.downloads.dir;
}

// ---- Avisos: superfícies (onde/como) e rotas (tipo -> superfície).
const GENERIC_SURFACE = { place: 'bottom-right', style: 'pill', stack: 'replace', offset: [16, 16], close_all: false, counter: false, counter_format: '+%d' };
const SURFACE_NAME = /^[A-Za-z][\w-]*$/;
const isOffset = (v) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(n) && n >= 0 && n <= 400);
const isOptionalText = (v) => typeof v === 'string';
const isCounterFormat = (v) => typeof v === 'string' && v.length <= 20 && v.split('%d').length === 2;
const isMax = (v) => Number.isInteger(v) && v >= 1 && v <= 20;
// campo -> [validador, o que se espera]
const SURFACE_FIELDS = {
  place: [(v) => PLACES.includes(v), `um de: ${PLACES.join(', ')}`],
  style: [(v) => Object.hasOwn(STYLES, v), `um de: ${Object.keys(STYLES).join(', ')}`],
  stack: [(v) => STACKS.includes(v), `um de: ${STACKS.join(', ')}`],
  offset: [isOffset, 'dois números de 0 a 400, ex.: { 16, 16 }'],
  close_all: [(v) => typeof v === 'boolean', 'true ou false'],
  counter: [(v) => typeof v === 'boolean', 'true ou false'],
  counter_format: [isCounterFormat, 'texto com um %d no lugar do número (até 20 caracteres), ex.: "+%d", "%d", "(%d)"'],
  max: [isMax, 'inteiro de 1 a 20'],
  html: [isOptionalText, 'texto (o HTML de UM item)'],
  css: [isOptionalText, 'texto'],
};

function checkSurface(name, spec, warnings) {
  const fallback = DEFAULTS.notification.surfaces[name] ?? GENERIC_SURFACE;
  Object.keys(spec).filter((field) => !(field in SURFACE_FIELDS))
    .forEach((field) => warnings.push(unknownMessage(['notification', 'surfaces', name, field], Object.keys(SURFACE_FIELDS))));
  for (const [field, [valid, expected]] of Object.entries(SURFACE_FIELDS)) {
    const reset = () => (field in fallback ? (spec[field] = fallback[field]) : delete spec[field]);
    if (spec[field] === undefined) reset();
    else if (!valid(spec[field])) {
      warnings.push(`"notification.surfaces.${name}.${field}" inválido (${JSON.stringify(spec[field])}): esperado ${expected}; usando o padrão`);
      reset();
    }
  }
}

// Cada tipo de aviso (KINDS) aponta para uma superfície existente (ou false = não mostrar). O tempo é validado em NUMBER_RANGES.
function checkType(kind, notification, warnings) {
  const spec = notification.types[kind];
  const target = spec.surface;
  if (target === false || (typeof target === 'string' && notification.surfaces[target])) return;
  warnings.push(`"notification.types.${kind}.surface" inválido (${JSON.stringify(target)}): esperado false ou uma superfície (${Object.keys(notification.surfaces).join(', ')}); usando o padrão`);
  spec.surface = DEFAULTS.notification.types[kind].surface;
}

// types.<tipo> = false vale como { surface = false }; entrada que não é tabela volta ao padrão (com aviso).
function normalizeTypes(config, warnings) {
  const { types } = config.notification;
  KINDS.forEach((kind) => {
    if (types[kind] === false) types[kind] = { ...DEFAULTS.notification.types[kind], surface: false };
    if (isPlain(types[kind])) return;
    warnings.push(`"notification.types.${kind}" inválido: esperado uma tabela ou false; usando o padrão`);
    types[kind] = { ...DEFAULTS.notification.types[kind] };
  });
}

// ---- Layout: slots que "mordem" a janela na ORDEM DE LEITURA do kaiak.lua ----
// O .lua entrega uma lista de operações [{ id, spec }] (spec = tabela | false). Aplicadas em sequência:
// redeclarar um slot existente mescla NO LUGAR; false remove (só o que veio antes); remover e declarar de novo
// leva o slot ao FIM (e volta aos valores de fábrica, se for de fábrica). Mesma regra do hl.unbind + hl.bind.
const SLOT_ID = /^[A-Za-z][\w-]*$/;
const SLOT_PLACES = ['left', 'right', 'top', 'bottom'];
const SLOT_MODES = ['push', 'overlay'];
const SLOT_REQUIRED = ['content', 'place', 'size'];

// Comprimento válido: px entre minPx e maxPx, ou porcentagem entre minFraction e maxFraction.
const isLength = (minPx, maxPx, minFraction, maxFraction) => (value) => {
  const length = parseLength(value);
  if (!length) return false;
  if (length.px !== undefined) return length.px >= minPx && length.px <= maxPx;
  return length.fraction >= minFraction && length.fraction <= maxFraction;
};

const SLOT_FIELDS = {
  visible: [(v) => typeof v === 'boolean', 'true ou false (false: o slot começa fechado; abra com h:show() ou h:toggle())'],
  keep: [(v) => typeof v === 'boolean', 'true ou false (false: ao fechar, a view é destruída e a memória devolvida; ao abrir, recarrega)'],
  place: [(v) => SLOT_PLACES.includes(v), `um de: ${SLOT_PLACES.join(', ')}`],
  size: [isLength(10, 1000, 0.05, 0.6), 'número em px (10 a 1000) ou texto com % ("5%" a "60%")'],
  expand: [(v) => v === false || isLength(10, 2000, 0.05, 0.9)(v), 'número em px (10 a 2000), texto com % ("5%" a "90%") ou false (sem expansão)'],
  bg: [(v) => isColor(v), 'cor como "#2b395e", "rgb(...)" ou um nome (fundo só deste slot; o resto vem do tema)'],
  mode: [(v) => SLOT_MODES.includes(v), `um de: ${SLOT_MODES.join(', ')} (push empurra a página; overlay fica por cima)`],
};

// Aplica as operações do layout na ordem de leitura (ver ordered-ops.js). O conteúdo SUBSTITUI (url + html seria inválido).
function applyLayoutOps(slots, ops, warnings) {
  applyOps(slots, ops, { idPattern: SLOT_ID, noun: 'slot', path: 'layout', factory: DEFAULTS.layout, replace: ['content'], warnings });
}

function checkSlotContent(id, spec, factory, warnings) {
  if (spec.content === undefined) return;
  const problem = checkContent(spec.content);
  if (!problem) return;
  warnings.push(`"layout.${id}.content" inválido: ${problem}; ${'content' in factory ? 'usando o padrão' : 'ignorado'}`);
  if ('content' in factory) spec.content = factory.content;
  else delete spec.content;
}

// Valida um slot já mesclado. Devolve false se ele não serve (faltam campos obrigatórios).
function checkSlot(id, spec, warnings) {
  const factory = DEFAULTS.layout[id] ?? {};
  const known = ['content', ...Object.keys(SLOT_FIELDS)];
  Object.keys(spec).filter((field) => !known.includes(field))
    .forEach((field) => warnings.push(unknownMessage(['layout', id, field], known)));
  checkSlotContent(id, spec, factory, warnings);
  for (const [field, [valid, expected]] of Object.entries(SLOT_FIELDS)) {
    if (spec[field] === undefined || valid(spec[field])) continue;
    warnings.push(`"layout.${id}.${field}" inválido (${JSON.stringify(spec[field])}): esperado ${expected}; ${field in factory ? 'usando o padrão' : 'ignorado'}`);
    if (field in factory) spec[field] = factory[field];
    else delete spec[field];
  }
  if (spec.expand === false) delete spec.expand;
  if (spec.expand !== undefined && contentKind(spec.content) !== 'builtin') {
    warnings.push(`"layout.${id}.expand" só vale para tabs e address (um site ou arquivo não avisa quando o mouse entra); ignorado`);
    delete spec.expand;
  }
  const missing = SLOT_REQUIRED.filter((field) => spec[field] === undefined);
  if (missing.length > 0) {
    warnings.push(`slot "${id}" incompleto (faltam: ${missing.join(', ')}): ignorado`);
    return false;
  }
  spec.mode ??= 'push';
  return true;
}

function buildLayout(userLayout, warnings) {
  const slots = new Map(Object.entries(structuredClone(DEFAULTS.layout)));
  applyLayoutOps(slots, toOps(userLayout), warnings);
  const layout = {};
  for (const [id, spec] of slots) {
    if (checkSlot(id, spec, warnings)) layout[id] = spec;
  }
  return layout;
}

// "system" é a categoria fixa dos alertas de sistema: não existe como tipo nem como superfície da config.
const RESERVED_MESSAGE = 'é reservado: alertas de sistema (erro de config, falha ao baixar lista...) não são configuráveis; ignorado';
const RESERVED_PATHS = [`notification.types.${SYSTEM_SURFACE}`, `notification.surfaces.${SYSTEM_SURFACE}`];

function dropReserved(config, warnings) {
  const { types, surfaces } = config.notification;
  for (const [path, group] of [[RESERVED_PATHS[0], types], [RESERVED_PATHS[1], surfaces]]) {
    if (!(SYSTEM_SURFACE in group)) continue;
    warnings.push(`"${path}" ${RESERVED_MESSAGE}`);
    delete group[SYSTEM_SURFACE];
  }
}

function checkNotification(config, warnings) {
  const { notification } = config;
  dropReserved(config, warnings);
  for (const [name, spec] of Object.entries(notification.surfaces)) {
    if (SURFACE_NAME.test(name) && isPlain(spec)) checkSurface(name, spec, warnings);
    else {
      warnings.push(`superfície "${name}" inválida (nome só com letras, números, - e _): ignorada`);
      delete notification.surfaces[name];
    }
  }
  KINDS.forEach((kind) => checkType(kind, notification, warnings));
}

// Caminhos cujos nomes são livres (o usuário cria entradas): os campos de cada entrada são conferidos à parte.
const THEME_ID = /^[A-Za-z][\w-]*$/;
const SCHEME_NAME = /^[\w-]{1,40}$/;
const VAR_NAME = /^[a-z][\w-]{0,39}$/;
const VAR_VALUE = /^[^;{}<>"\\]{1,200}$/;
const OPEN_PATHS = new Set(['context_menu.items', 'theme.vars', 'search.engines', 'keys', 'notification.surfaces', 'layout', 'buttons', 'themes', 'exec']);

// Mescla a config do usuário sobre o padrão e valida. Nunca lança: o que for inválido volta ao padrão.
function resolve(user = {}) {
  const warnings = [];
  // o caminho reservado ganha mensagem própria (dropReserved); aqui não vale como "chave desconhecida"
  warnings.push(...unknownKeys(user, DEFAULTS, OPEN_PATHS).filter((w) => !w.includes(`"${RESERVED_PATHS[0]}"`)));
  const { layout: userLayout, buttons: userButtons, themes: userThemes, exec: userExec, ...rest } = user;
  const config = merge(DEFAULTS, rest);
  checkTheme(config, warnings); // o `theme` base primeiro: os temas nomeados partem dele
  buildThemes(config, toOps(userThemes), warnings);
  config.layout = buildLayout(userLayout, warnings);
  config.exec = buildExec(toOps(userExec), warnings);
  config.buttons = buildButtons(toOps(userButtons), { layout: config.layout, actions: ACTION_NAMES, themes: config.themes, exec: config.exec }, warnings);
  const startTheme = initialTheme(config.buttons); // botão cujo estado inicial traz tema manda; senão vale o 1º declarado
  if (startTheme) { config.initial_theme = startTheme; config.theme = config.themes[startTheme]; }
  normalizeTypes(config, warnings);
  checkNumbers(config, warnings);
  checkStart(config.start, warnings);
  checkBoot(config.boot, warnings);
  checkSearch(config, warnings);
  checkDevtools(config, warnings);
  checkFind(config, warnings);
  checkZoom(config, warnings);
  checkPrint(config, warnings);
  checkContextMenu(config.context_menu, ACTION_NAMES, warnings);
  checkDownloads(config, warnings);
  checkNotification(config, warnings);
  Object.keys(SECTION_FIELDS).forEach((name) => checkSection(config, warnings, name));
  return { config, warnings };
}

module.exports = { DEFAULTS, resolve, merge };
