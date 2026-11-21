'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BaseWindow, Menu, WebContentsView, ipcMain, session, clipboard } = require('electron');
const { parseArgs } = require('./args');
const { svgHasColor, checkBadge } = require('./buttons-config');
const { loadConfig } = require('./user-config');
const { createLayout, thicknessOfRect } = require('./layout');
const { TabManager } = require('./tabs');
const { createActions } = require('./actions');
const { declareScheme, serveInternal } = require('./internal-pages');
const { renderStart, renderBoot } = require('./start-page');
const { createSplash } = require('./splash');
const { whenPainted } = require('./page-ready');
const { createSessionStore } = require('./session-store');
const { createFind } = require('./find');
const { buildMenu } = require('./context-menu');
const { createZoom } = require('./zoom');
const { createFullscreen } = require('./fullscreen');
const { createPrint } = require('./print');
const { createExecRunner } = require('./exec-runner');
const { createOrphanRegistry } = require('./orphan-registry');
const { createPrintDialog } = require('./print-dialog');
const { DEFAULT_HTML: PRINT_HTML, DEFAULT_CSS: PRINT_CSS } = require('./print-template');
const { DEFAULT_HTML, DEFAULT_CSS } = require('./find-template');
const { createSpeedDial } = require('./speed-dial');
const { readImageDataUrl } = require('./image-file');
const { dataDir } = require('./blocklist');
const { buildKeymap } = require('./keymap');
const { applyPagePrivacy } = require('./privacy');
const { applySession, guardNavigation, isAllowedUrl, certException } = require('./security');
const { createBlocker, loadLists, listDir } = require('./blocklist');
const { startUpdates } = require('./blocklist-update');
const { VIM_SCROLL_JS } = require('./vim-scroll');
const { createResolver, searchUrl } = require('./url');
const { attachDownloads, resolveDir } = require('./downloads');
const { createNotifier } = require('./notifier');
const { createPanelFactory } = require('./panels');

const opts = parseArgs(process.argv.slice(2));
app.setPath('userData', opts.profileDir);
declareScheme();

// O kaiak.lua é lido UMA vez, na partida. Erro => última versão estável (ou padrão) + alerta no topo.
let reportError = () => {};
const loaded = loadConfig(opts, { onError: (text) => reportError({ level: 'error', text }) });
const { config } = loaded;
const layout = createLayout(config.layout, config.devtools);
const toUrl = createResolver(config.search);
const listsDir = listDir(opts);
const blockLists = loadLists(config.blocking, listsDir); // lê as listas uma vez, na partida
const blocker = createBlocker(config.blocking, blockLists.sets);

// onLoaded: roda depois que a view carregou e recebeu a config (é quando já dá para falar com ela).
const uiViews = new Set(); // views de interface vivas: recebem o tema novo quando ele troca
function uiView(file, onLoaded) {
  const view = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true },
  });
  const uiConfig = { layout: config.layout, timing: config.timing, theme: config.theme };
  uiViews.add(view);
  view.webContents.once('destroyed', () => uiViews.delete(view));
  view.webContents.on('console-message', (e) => console.warn(`[kaiak] ui ${file}: ${e.message}`));
  view.webContents.once('did-finish-load', () => {
    view.webContents.send('config', uiConfig);
    onLoaded?.();
  });
  view.webContents.loadFile(path.join(__dirname, '..', 'ui', file));
  return view;
}

let toast = () => {}; // aviso de download; start() liga ao gerenciador de avisos
const downloadHooks = {
  getDir: () => resolveDir(config.downloads.dir, os.homedir(), app.getPath('downloads')),
  notify: (title, text) => toast(title, text),
};

// ---- Página inicial kaiak://start: o fundo (imagem) é lido UMA vez; a página é montada a cada abertura (segue o tema ativo).
const MAX_START_IMAGE_BYTES = 2 * 1024 * 1024;
const UI_DIR = path.join(__dirname, '..', 'ui');
function loadArt(image, label) {
  if (!image) return null;
  try {
    return readImageDataUrl(image.file, MAX_START_IMAGE_BYTES).src;
  } catch (error) {
    reportError({ level: 'warning', text: `${label}: ${image.file}: ${error.message}` });
    return null;
  }
}
let startArt;
let bootArt;
const bootHtml = () => renderBoot({ boot: config.boot, theme: config.theme, art: bootArt });
let startFixed = []; // atalhos do .lua com o ícone já resolvido
const speedDial = createSpeedDial(path.join(dataDir(opts), 'speed-dial.json'));
const startHtml = () => renderStart({
  start: config.start, theme: config.theme, art: startArt, searchTemplate: config.search.engines[config.search.default],
  dial: { fixed: startFixed, user: speedDial.list(), token: startToken },
});
// Só o .lua liga o Speed Dial (start.speed_dial); sem isso a API nega mesmo para a página.
const dialApi = (fn) => (body) => (config.start.speed_dial?.editable ? fn(body) : { error: 'Speed Dial editável está desligado no .lua' });
const startToken = require('node:crypto').randomBytes(16).toString('hex'); // só vai dentro da página gerada (ver internal-pages.js)
const startApi = { 'start/dial/add': dialApi((body) => speedDial.add(body)), 'start/dial/remove': dialApi((body) => speedDial.remove(body?.id)) };
const serveStart = (ses) => serveInternal(ses, { start: startHtml, boot: bootHtml }, UI_DIR, { api: startApi, token: startToken });

const PRIVATE_PARTITION = 'kaiak-private'; // sem o prefixo "persist:": vive só na memória
let privateReady = false;

// Sessão privada: mesmas regras de segurança e bloqueio da normal, aplicadas uma vez, na primeira aba privada.
function privateSession() {
  const ses = session.fromPartition(PRIVATE_PARTITION);
  if (!privateReady) {
    applySession(ses, config.security, blocker, sessionHooks);
    attachDownloads(ses, downloadHooks);
    serveStart(ses);
    privateReady = true;
  }
  return ses;
}

// Última aba privada fechou: apaga cookies, armazenamento e cache da sessão privada.
function wipePrivateSession() {
  if (!privateReady) return;
  const ses = session.fromPartition(PRIVATE_PARTITION);
  Promise.all([ses.clearStorageData(), ses.clearCache(), ses.clearHostResolverCache()])
    .catch((e) => console.warn(`[kaiak] limpar sessão privada: ${e.message}`));
}

const ERR_BLOCKED_BY_CLIENT = -20;
const ERR_ABORTED = -3; // navegação trocada por outra (o usuário clicou em outro link)
const upgradedHosts = new Set(); // hosts que o só-HTTPS promoveu: a tela de erro sugere https_exceptions
const sessionHooks = { onUpgrade: (host) => upgradedHosts.add(host) };
const hostnameOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };

// Navegação bloqueada pelo KaiaK: troca o erro do Chromium por uma página que explica o motivo.
function showFailPage(wc) {
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || url.startsWith('file:') || code === ERR_ABORTED) return;
    const theme = JSON.stringify(Object.fromEntries(['bg', 'fg', 'muted', 'accent', 'panel', 'input', 'tab_active', 'hover', 'color_scheme', 'scheme', 'vars'].map((key) => [key, config.theme[key]])));
    const ui = (file, query) => wc.loadFile(path.join(__dirname, '..', 'ui', file), { query: { ...query, theme } });
    const kind = code === ERR_BLOCKED_BY_CLIENT ? blocker.explain(url) : null;
    if (kind) return ui('blocked.html', { url, kind });
    ui('error.html', { url, code: String(code), desc, upgraded: upgradedHosts.has(hostnameOf(url)) ? '1' : '' });
  });
}

function pageView(isPrivate = false) {
  if (isPrivate) privateSession();
  const webPreferences = { sandbox: true, contextIsolation: true, spellcheck: false };
  if (isPrivate) webPreferences.partition = PRIVATE_PARTITION;
  const view = new WebContentsView({ webPreferences });
  view.setBackgroundColor(config.theme.bg); // sem clarão branco enquanto a página carrega
  applyPagePrivacy(view.webContents);
  guardNavigation(view.webContents, config.security);
  view.webContents.on('dom-ready', () => view.webContents.executeJavaScript(VIM_SCROLL_JS));
  showFailPage(view.webContents);
  return view;
}

function start() {
  Menu.setApplicationMenu(null); // sem o menu padrão do Electron
  applySession(session.defaultSession, config.security, blocker, sessionHooks);
  attachDownloads(session.defaultSession, downloadHooks);
  startArt = loadArt(config.start.background.image, 'start.background.image');
  bootArt = loadArt(config.boot.background.image, 'boot.background.image');
  serveStart(session.defaultSession);
  const win = new BaseWindow({ width: 1280, height: 800, title: 'KaiaK (electron)', backgroundColor: config.theme.bg }); // sem clarão branco

  // ---- Tela de boot: por cima de tudo até a 1ª aba estar pintada (k.boot). Some sozinha em max_ms, no pior caso.
  let splash = null;
  if (config.boot.enabled) {
    const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } });
    view.setBackgroundColor(config.boot.background.color || config.theme.bg);
    view.webContents.loadURL('kaiak://boot');
    splash = createSplash({ win, view, minMs: config.boot.min_ms, maxMs: config.boot.max_ms });
  }

  // ---- Slots do layout: uma view por slot, na ordem de leitura. O conteúdo define o tipo (interface do KaiaK, site,
  // HTML ou arquivo; ver panels.js). Slots com visible = false só ganham a view na primeira vez que abrem.
  const slotViews = new Map(); // id do slot -> view
  const slotIdOf = new Map(); // id do webContents -> id do slot (só as interfaces do KaiaK, que falam por IPC)
  const slotOpen = {}; // id -> true enquanto o mouse está num slot que expande
  const preparedSessions = new Set();
  const prepareSession = (ses) => { // proteções do navegador em toda sessão de painel (uma vez por sessão)
    if (preparedSessions.has(ses)) return;
    preparedSessions.add(ses);
    applySession(ses, config.security, blocker, sessionHooks);
    attachDownloads(ses, downloadHooks);
  };
  const panels = createPanelFactory({
    WebContentsView, session, path, fs, config, uiView, prepareSession, homeDir: os.homedir(),
    hardenWebContents(wc) {
      applyPagePrivacy(wc);
      guardNavigation(wc, config.security);
      routeKeys(wc); // os atalhos também valem com o foco dentro do painel
    },
    openInTab: (url) => tabs.open(toUrl(url)),
    report: (problem) => alertOf(problem),
  });
  // ---- Botões (k.button): cada slot que mostra botões recebe a sua lista já resolvida (ícone pronto, estado "pressionado").
  const MAX_ICON_BYTES = 256 * 1024;
  const svgDataUrl = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  function iconFor(buttonId, icon) {
    if (icon === undefined) return null;
    if (typeof icon === 'string') return { text: icon };
    if (icon.text) return { text: icon.text };
    // vira <img>/máscara: SVG em imagem não executa script. Sem cor própria (svgHasColor), a view o pinta com a cor do tema.
    if (icon.svg) return { src: svgDataUrl(icon.svg), tint: !svgHasColor(icon.svg) };
    try {
      const image = readImageDataUrl(icon.file, MAX_ICON_BYTES);
      return { src: image.src, tint: image.mime === 'image/svg+xml' && !svgHasColor(image.text) };
    } catch (error) {
      alertOf({ level: 'warning', text: `botão "${buttonId}": ícone ${icon.file}: ${error.message}`, sticky: true });
      return { text: '?' };
    }
  }
  const iconCache = new Map(); // arquivos são lidos uma vez
  const iconOf = (id, icon) => {
    if (!iconCache.has(id)) iconCache.set(id, iconFor(id, icon));
    return iconCache.get(id);
  };
  startFixed = (config.start.speed_dial?.items ?? []).map((item, index) => ({ title: item.title, url: item.url, icon: item.icon === undefined ? null : iconOf(`dial:${index}`, item.icon) }));
  // Estado de execução de cada botão (mudado pelo Lua): { state, badge, enabled }; começa do que o .lua declarou.
  const buttonRt = new Map(Object.entries(config.buttons).map(([id, s]) => [id, { state: s.state, badge: s.badge ?? false, enabled: s.enabled !== false }]));
  // Visual efetivo: base + estado ativo (o "pressed" automático dos botões de alternar usa states.pressed se existir).
  const buttonView = (id, spec) => {
    const act = spec.action;
    const pressed = typeof act === 'object' && (('toggle' in act && layout.isVisible(act.toggle)) || ('theme' in act && themeName === act.theme));
    const rt = buttonRt.get(id);
    const stateName = rt.state ?? (pressed && spec.states?.pressed ? 'pressed' : undefined);
    const state = (stateName && spec.states?.[stateName]) || {};
    const icon = state.icon ?? spec.icon;
    const label = state.label ?? spec.label;
    const badge = rt.badge === 0 ? false : rt.badge;
    return {
      id, pressed, badge, disabled: !rt.enabled, label, tooltip: state.tooltip ?? spec.tooltip,
      icon: iconOf(`${id}:${stateName ?? ''}`, icon),
      shape: spec.shape ?? (label !== undefined ? 'row' : 'square'), labelPlace: spec.label_place ?? 'right',
    };
  };
  const buttonsOf = (slotId) => Object.entries(config.buttons).filter(([, spec]) => spec.slot === slotId).map(([id, spec]) => buttonView(id, spec));
  // h:set_state / set_badge / set_enabled (Lua). Devolve o motivo do erro, ou null.
  function setButton(id, field, value) {
    const spec = config.buttons[id];
    if (!spec) return `o botão "${id}" não existe`;
    const rt = buttonRt.get(id);
    if (field === 'state' && value !== false && !spec.states?.[value]) return `o botão "${id}" não tem o estado "${value}"`;
    if (field === 'badge' && checkBadge(value)) return `selo inválido (${checkBadge(value)})`;
    if (field === 'enabled' && typeof value !== 'boolean') return 'set_enabled espera true ou false';
    rt[field] = field === 'state' && value === false ? undefined : value;
    sendButtons(spec.slot);
    return null;
  }
  const sendButtons = (id) => {
    const view = slotViews.get(id);
    if (view && layout.isVisible(id) && panels.isBuiltin(config.layout[id])) view.webContents.send('buttons', buttonsOf(id));
  };
  const sendAllButtons = () => Object.keys(config.layout).forEach(sendButtons);

  // Espessuras em px (a config aceita "%"): as interfaces do KaiaK precisam delas para animar a expansão.
  const sendSlot = (id) => {
    const slot = config.layout[id];
    const view = slotViews.get(id);
    if (!view || !layout.isVisible(id) || !panels.isBuiltin(slot)) return;
    const { base, expanded } = layout.compute(win);
    view.webContents.send('slot', {
      id, content: slot.content, place: slot.place, bg: slot.bg ?? null,
      size: thicknessOfRect(base[id], slot.place), expand: expanded[id] ? thicknessOfRect(expanded[id], slot.place) : null,
    });
    sendButtons(id);
  };
  function ensureSlotView(id) {
    if (slotViews.has(id)) return slotViews.get(id);
    const slot = config.layout[id];
    const view = panels.build(id, slot, () => sendSlot(id));
    if (panels.isBuiltin(slot)) {
      view.setBackgroundColor('#00000000');
      slotIdOf.set(view.webContents.id, id);
      view.webContents.on('did-finish-load', () => view.webContents.send('state', tabs.snapshot()));
    }
    slotViews.set(id, view);
    win.contentView.addChildView(view);
    return view;
  }
  // Fecha a view do slot: sai da janela; com keep = false é destruída (devolve ~11 MiB + o conteúdo) e recria ao abrir.
  function closeSlotView(id) {
    const view = slotViews.get(id);
    win.contentView.removeChildView(view);
    if (config.layout[id].keep !== false) return;
    slotViews.delete(id);
    slotIdOf.delete(view.webContents.id);
    view.webContents.close();
  }
  const visibleViews = () => [...slotViews].filter(([id]) => layout.isVisible(id));
  // Slots por cima da página: os fixos primeiro, os que expandem por último (cobrem tudo); depois os avisos.
  const raiseChrome = () => {
    const expands = (id) => Number(config.layout[id].expand !== undefined);
    visibleViews().sort(([a], [b]) => expands(a) - expands(b)).forEach(([, view]) => win.contentView.addChildView(view));
    find.raise();
    printDialog.raise();
    notifier.raise();
    splash?.raise(); // a tela de boot cobre tudo enquanto existir
  };

  // ---- Avisos: cada superfície (toast, strip, ...) é uma view criada só no primeiro aviso dela.
  const notifier = createNotifier({
    config,
    host: {
      createView(onLoaded) {
        const view = uiView('notify.html');
        view.setBackgroundColor('#00000000');
        view.webContents.once('did-finish-load', onLoaded);
        return view;
      },
      add: (view) => win.contentView.addChildView(view),
      remove: (view) => win.contentView.removeChildView(view),
      setBounds: (view, rect) => view.setBounds(rect),
      region: () => layout.pageBounds(win, false), // referência: a área da página (sem as DevTools)
      send: (view, channel, data) => view.webContents.send(channel, data),
      idOf: (view) => view.webContents.id,
      log: process.env.KAIAK_DEBUG ? (msg) => console.warn(`[kaiak] aviso ${Date.now()} ${msg}`) : undefined,
    },
  });
  // Alerta informativo (kind 'alert') é configurável e some sozinho; o que pede ação (erro, falha, lista velha) é do
  // SISTEMA (kind 'system'): categoria fixa, fora da config, fica até dispensar. `sticky` escolhe entre os dois.
  const alertOf = ({ level, text, tag, sticky = true, pinned = false }) => notifier.notify({ kind: sticky ? 'system' : 'alert', level, text, tag, pinned });
  reportError = alertOf;
  toast = (title, text) => notifier.notify({ kind: 'download', level: 'info', title, text });

  const layoutChrome = () => visibleViews().forEach(([id, view]) => view.setBounds(layout.slotBounds(win, id, !!slotOpen[id])));
  const focusAddress = () => {
    const [view] = visibleViews().filter(([id]) => config.layout[id].content === 'address').map(([, v]) => v);
    if (!view) return; // sem barra de endereço visível no layout
    view.webContents.focus();
    view.webContents.send('focus-address');
  };

  const tabs = new TabManager({
    newTabUrl: config.start.enabled ? 'kaiak://start' : undefined, // aba nova sem endereço
    createView(isPrivate) {
      const view = pageView(isPrivate);
      routeKeys(view.webContents); // atalhos também valem com o foco dentro da página
      zoom.attach(view.webContents, { isPrivate }); // zoom guardado por site + Ctrl+scroll
      view.webContents.on('enter-html-full-screen', () => fullscreen.enter(view.webContents));
      view.webContents.on('leave-html-full-screen', () => fullscreen.leave());
      view.webContents.once('destroyed', () => { if (fullscreen.owns(view.webContents)) fullscreen.leave(); });
      view.webContents.on('context-menu', (_event, params) => showContextMenu(view.webContents, params, isPrivate));
      return view;
    },
    show(view) {
      find.tabChanged(); // a busca pertence à aba antiga
      printDialog.tabChanged();
      fullscreen.tabChanged(tabs.active?.view?.webContents);
      closeDevtools(); // as DevTools embutidas valem para uma aba só: trocar de aba as fecha
      view.setBounds(layout.pageBounds(win));
      win.contentView.addChildView(view);
      raiseChrome(); // os slots ficam por cima da página e os avisos por cima de tudo
    },
    hide: (view) => win.contentView.removeChildView(view),
    toUrl,
    privateEnded: wipePrivateSession,
    allowUrl: (url) => isAllowedUrl(url, config.security.allowed_schemes),
    changed() {
      const state = tabs.snapshot();
      visibleViews().filter(([id]) => panels.isBuiltin(config.layout[id])).forEach(([, view]) => view.webContents.send('state', state));
      win.setTitle(`${tabs.active?.title || 'KaiaK'} — KaiaK (electron)`);
      scheduleSessionSave();
    },
  });

  // ---- Menu de contexto (botão direito): a lista do contexto vem do .lua (k.context_menu); o menu é o NATIVO do sistema.
  const openFromMenu = (url, how, fromPrivate) => {
    if (!isAllowedUrl(url, config.security.allowed_schemes)) return; // links javascript:, file: etc. nunca abrem por aqui
    tabs.open(url, how === 'background', how === 'private' || fromPrivate); // herda a privacidade da aba de origem
  };
  const menuHost = (wc, isPrivate) => ({
    openUrl: (url, how) => openFromMenu(url, how, isPrivate),
    copyText: (text) => clipboard.writeText(text),
    saveUrl: (url) => wc.downloadURL(url),
    copyImageAt: (x, y) => wc.copyImageAt(x, y),
    edit: (command) => wc[command](),
    action: (name) => actions[name]?.(),
    searchText: (text) => openFromMenu(searchUrl(config.search.engines[config.search.default], text), 'tab', isPrivate),
    inspect: (x, y) => {
      if (!config.devtools.enabled) return;
      if (!devView && !wc.isDevToolsOpened()) toggleDevtools();
      wc.inspectElement(x, y);
    },
    callLua: (fn, ctx) => fn(ctx),
  });
  function showContextMenu(wc, params, isPrivate) {
    if (!config.context_menu.enabled) return;
    const nav = wc.navigationHistory;
    const { items } = buildMenu({
      menuConfig: config.context_menu, params, pageUrl: wc.getURL(), edit: params.editFlags,
      nav: { canBack: nav.canGoBack(), canForward: nav.canGoForward() }, engineName: config.search.default,
    });
    if (items.length === 0) return;
    const host = menuHost(wc, isPrivate);
    const template = items.map((item) => (item.separator ? { type: 'separator' } : { label: item.label, enabled: item.enabled, click: () => item.run(host) }));
    const page = layout.pageBounds(win); // o clique vem em coordenadas da página: soma o deslocamento dela na janela
    Menu.buildFromTemplate(template).popup({ window: win, x: page.x + params.x, y: page.y + params.y });
  }

  // ---- Tela cheia de página: esconde os slots e a busca, e a página cobre a janela. Os avisos de sistema continuam por cima.
  const fullscreen = createFullscreen({
    win,
    setChromeVisible: (visible) => {
      if (!visible) find.close();
      slotViews.forEach((view) => view.setVisible(visible));
    },
    applyPage: () => relayoutPage(), // lidas só quando a tela cheia acontece (relayoutPage é declarada mais abaixo)
    restorePage: () => relayoutAll(),
  });

  // ---- Impressão (k.print): Ctrl+P abre o diálogo do sistema; Ctrl+Shift+P grava um PDF na pasta de downloads.
  const printer = createPrint({
    activeContents: () => tabs.active?.view?.webContents,
    getDir: downloadHooks.getDir, notify: downloadHooks.notify, settings: config.print,
  });

  const { page_size, landscape, background, scale, margins } = config.print;
  const printDialog = createPrintDialog({
    win,
    settings: {
      place: config.print.place, width: config.print.width, height: config.print.height,
      html: config.print.html || PRINT_HTML, css: PRINT_CSS + config.print.css, // o css do .lua vem DEPOIS: vence o de fábrica
      values: { page_size, landscape, background, scale, margins, pages: '' },
    },
    createView: (onLoaded) => {
      const view = uiView('print.html', onLoaded);
      view.setBackgroundColor('#00000000'); // cantos arredondados sem quadrado escuro atrás
      return view;
    },
    pageBounds: () => layout.pageBounds(win),
    activeContents: () => tabs.active?.view?.webContents ?? null,
    canPrintSystem: async () => (await tabs.active?.view?.webContents.getPrintersAsync())?.length > 0,
  });
  ipcMain.on('print:close', (event) => { if (printDialog.owns(event.sender)) printDialog.close(); });
  ipcMain.on('print:save', (event, values) => { if (printDialog.owns(event.sender)) { printDialog.close(); printer.savePdf(values); } });
  ipcMain.on('print:system', (event, values) => { if (printDialog.owns(event.sender)) { printDialog.close(); printer.printSystem(values); } });

  // ---- Zoom (k.zoom): níveis e padrão do .lua; memória por site em zoom.json; o aviso "Zoom N%" troca o anterior (mesma tag).
  const zoom = createZoom({
    config: config.zoom, file: path.join(dataDir(opts), 'zoom.json'),
    notify: (text) => {
      if (!config.zoom.notify) return;
      notifier.clearTag('zoom');
      alertOf({ level: 'info', text, tag: 'zoom', sticky: false });
    },
  });
  const onActive = (run) => { const tab = tabs.active; if (tab?.view) run(tab.view.webContents, { isPrivate: tab.private }); };
  const zoomActions = { step: (direction) => onActive((wc, ctx) => zoom.step(wc, direction, ctx)), reset: () => onActive((wc, ctx) => zoom.reset(wc, ctx)) };

  // ---- Busca na página (Ctrl+F): caixa por cima da página; a busca é a do Chromium. Desligável (find.enabled = false).
  const findSettings = {
    place: config.find.place, width: config.find.width, height: config.find.height, margin: config.find.margin,
    caseSensitive: config.find.case_sensitive, wholeWord: config.find.whole_word,
    html: config.find.html || DEFAULT_HTML, css: DEFAULT_CSS + config.find.css, // o css do .lua vem DEPOIS: vence o de fábrica
  };
  const find = config.find.enabled ? createFind({
    win, settings: findSettings,
    createView: (onLoaded) => {
      const view = uiView('find.html', onLoaded);
      view.setBackgroundColor('#00000000'); // cantos arredondados (css do .lua) sem um quadrado escuro atrás
      return view;
    },
    pageBounds: () => layout.pageBounds(win),
    activeContents: () => tabs.active?.view?.webContents ?? null,
  }) : { open() {}, close() {}, search() {}, step() {}, setOptions() {}, relayout() {}, raise() {}, tabChanged() {}, owns: () => false };
  ipcMain.on('find:query', (event, text) => { if (find.owns(event.sender)) find.search(text); });
  ipcMain.on('find:step', (event, forward) => { if (find.owns(event.sender)) find.step(!!forward); });
  ipcMain.on('find:close', (event) => { if (find.owns(event.sender)) find.close(); });
  ipcMain.on('find:options', (event, next) => { if (find.owns(event.sender)) find.setOptions(next ?? {}); });

  // ---- Sessão: as abas (menos as privativas) vão para o disco ~1 s depois de cada mudança e ao sair; ao abrir, voltam descartadas.
  const sessionStore = createSessionStore(path.join(dataDir(opts), 'session.json'));
  let sessionTimer = null;
  function saveSession() {
    clearTimeout(sessionTimer);
    sessionTimer = null;
    if (!config.session.restore) return;
    try {
      sessionStore.save(tabs.sessionState());
    } catch (error) {
      console.warn(`[kaiak] não foi possível guardar a sessão: ${error.message}`);
    }
  }
  function scheduleSessionSave() {
    if (config.session.restore && !sessionTimer) sessionTimer = setTimeout(saveSession, 1000);
  }
  app.on('before-quit', saveSession);

  // ---- Temas (só do .lua): o 1º declarado é o inicial; a escolha NÃO é gravada (a ordem do .lua manda).
  let themeName = Object.keys(config.themes)[0];
  let themeSeq = 0;
  function setTheme(name) {
    if (!config.themes[name]) return false;
    themeName = name;
    config.theme = config.themes[name];
    // As páginas iniciais são geradas com o tema: recarregam primeiro, e SÓ no fim do refresh a interface troca (tudo junto).
    const seq = ++themeSeq;
    tabs.reloadMatching((url) => url.startsWith('kaiak://start')).then(() => {
      if (seq !== themeSeq) return; // uma troca mais nova já está a caminho
      uiViews.forEach((view) => view.webContents.send('theme', config.theme));
      sendAllButtons();
    });
    return true;
  }
  function toggleTheme() {
    const names = Object.keys(config.themes);
    if (names.length > 1) setTheme(names[(names.indexOf(themeName) + 1) % names.length]);
  }
  const actions = createActions({ tabs, focusAddress, toggleDevtools: () => toggleDevtools(), toggleTheme, find, zoom: zoomActions, printer, printDialog });
  const keymap = buildKeymap(config.keys, actions);
  const problems = [...loaded.errors, ...keymap.warnings.map((text) => ({ level: 'warning', text }))];
  problems.forEach((p) => console.warn(`[kaiak] config ${p.level}: ${p.text}`));
  if (loaded.source === 'user' && problems.length === 0) loaded.commit(); // só config 100% limpa vira "estável"
  problems.forEach(alertOf);
  blockLists.warnings.forEach((w) => alertOf({ // aviso de ambiente, não da config; o informativo ("baixando...") some sozinho
    level: w.transient ? 'info' : 'warning', text: w.text, tag: `list:${w.kind}`, sticky: !w.transient,
  }));
  // ---- DevTools: embutidas (right/bottom) numa view própria, ou em janela separada (detach). Uma aba por vez.
  let devView = null;
  let devTarget = null;
  // Em tela cheia de página, a página ocupa a janela inteira (sem barras, sem DevTools embutidas).
  const pageArea = () => {
    if (!fullscreen.active()) return layout.pageBounds(win, !!devView);
    const { width, height } = win.getContentBounds();
    return { x: 0, y: 0, width, height };
  };
  const relayoutPage = () => tabs.active?.view?.setBounds(pageArea());
  const bringChromeToFront = raiseChrome;
  function closeDevtools() {
    if (!devTarget) return;
    const target = devTarget;
    const view = devView;
    devTarget = null;
    devView = null;
    win.contentView.removeChildView(view);
    if (!target.isDestroyed()) target.closeDevTools();
    view.webContents.close();
    relayoutPage();
  }
  function openDocked(target) {
    devView = new WebContentsView({ webPreferences: { sandbox: true } });
    devTarget = target;
    routeKeys(devView.webContents);
    target.setDevToolsWebContents(devView.webContents);
    target.once('devtools-closed', closeDevtools);
    win.contentView.addChildView(devView);
    devView.setBounds(layout.devtoolsBounds(win));
    target.openDevTools({ mode: config.devtools.place === 'window' ? 'detach' : config.devtools.place }); // o próprio frontend precisa saber de que lado está encaixado
    relayoutPage();
    bringChromeToFront();
  }
  function toggleDevtools() {
    if (!config.devtools.enabled) return;
    if (devView) return closeDevtools();
    const target = tabs.active?.view?.webContents;
    if (!target) return;
    if (config.devtools.place !== 'window') return openDocked(target);
    if (target.isDevToolsOpened()) target.closeDevTools();
    else target.openDevTools({ mode: 'detach' });
  }
  function routeKeys(wc) {
    wc.on('before-input-event', (event, input) => {
      if (keymap.handle(input)) event.preventDefault();
    });
  }
  slotViews.forEach((view, id) => { if (panels.isBuiltin(config.layout[id])) routeKeys(view.webContents); });

  ipcMain.on('tab:select', (_e, id) => tabs.select(id));
  ipcMain.on('tab:close', (_e, id) => tabs.close(id));
  ipcMain.on('tab:new', actions.new_tab);
  ipcMain.on('nav:go', (_e, text) => tabs.go(String(text)));
  ipcMain.on('nav:back', actions.back);
  ipcMain.on('button:click', (event, id) => {
    const spec = config.buttons[id];
    const enabled = buttonRt.get(id)?.enabled;
    if (spec && enabled && spec.slot === slotIdOf.get(event.sender.id)) runButton(spec); // só vale o botão do slot que o mostra
  });
  ipcMain.on('nav:forward', actions.forward);
  ipcMain.on('nav:reload', actions.reload);
  ipcMain.on('notify:dismiss', (event, id) => notifier.dismiss(event.sender.id, id));
  ipcMain.on('notify:dismiss-all', (event) => notifier.dismissAll(event.sender.id));
  ipcMain.on('slot:expand', (event, open) => {
    const id = slotIdOf.get(event.sender.id);
    if (!id) return;
    slotOpen[id] = !!open;
    layoutChrome();
  });

  // Abre um endereço num painel de site: mostra o painel (se fechado) e navega só dentro dos esquemas permitidos.
  function openInPanel(id, url) {
    if (!isAllowedUrl(url, config.security.allowed_schemes)) return alertOf({ level: 'warning', text: `botão: endereço não permitido: ${url}`, sticky: true });
    setSlotVisible(id, true);
    slotViews.get(id).webContents.loadURL(url);
  }

  // Clique de um botão: ação nomeada, função do usuário (com prazo), abrir em aba ou painel, ou alternar um painel.
  function runButton({ action }) {
    if (typeof action === 'function') return action();
    if (typeof action === 'string') return actions[action]?.();
    if ('toggle' in action) return setSlotVisible(action.toggle, 'toggle');
    if ('exec' in action) return runExec(action.exec, action.args);
    if ('theme' in action) return setTheme(action.theme);
    if (action.target === undefined || action.target === 'tab') return tabs.open(toUrl(action.open));
    return openInPanel(action.target, action.open);
  }

  // ---- Comandos da máquina (k.exec): só o .lua dispara (botão { exec = ... }, tecla, função). Falhas viram aviso.
  const orphans = createOrphanRegistry({ file: path.join(dataDir(opts), 'exec-pids.json') });
  const reaped = orphans.reap(); // sobras de um fechamento à força (kill -9) da vida anterior
  if (reaped.length > 0) alertOf({ level: 'warning', text: `exec: ${reaped.length} comando(s) da sessão anterior ainda rodavam e foram encerrados`, sticky: false });
  const execRunner = createExecRunner({ specs: config.exec, notify: alertOf, home: os.homedir(), registry: orphans });
  function runExec(id, args) {
    const problem = execRunner.run(id, args);
    if (problem) alertOf({ level: 'warning', text: `exec: ${problem}`, tag: `exec:${id}`, sticky: false });
  }
  app.on('before-quit', execRunner.killAll); // nenhum comando fica órfão

  // Tudo que depende da geometria: slots, página, DevTools embutidas e avisos.
  function relayoutAll() {
    layoutChrome();
    slotViews.forEach((_view, id) => sendSlot(id)); // as espessuras em px mudam com a janela (slots em %)
    relayoutPage();
    if (devView) devView.setBounds(layout.devtoolsBounds(win));
    find.relayout();
    printDialog.relayout();
    notifier.relayout(); // a janela pode mudar logo depois de abrir (tiling): os avisos acompanham
  }
  win.on('resize', relayoutAll);

  // Abre/fecha um slot em execução (h:show/hide/toggle do Lua). Fechar remove a view da janela e devolve o espaço à
  // página; a view continua viva (estado do site, login...). Devolve false se o slot não existe.
  function setSlotVisible(id, mode) {
    if (!config.layout[id]) return false;
    const next = mode === 'toggle' ? !layout.isVisible(id) : !!mode;
    if (next === layout.isVisible(id)) return true;
    layout.setVisible(id, next);
    if (next) ensureSlotView(id);
    else closeSlotView(id);
    relayoutAll();
    if (next) raiseChrome();
    sendAllButtons(); // o estado "pressionado" dos botões de alternar acompanha
    return true;
  }
  win.on('closed', () => app.quit());

  Object.keys(config.layout).filter((id) => layout.isVisible(id)).forEach(ensureSlotView); // slots fechados esperam a 1ª abertura
  layoutChrome();
  const runtime = {
    openTab: (url, isPrivate) => tabs.open(toUrl(url), false, isPrivate),
    runAction: (name) => actions[name]?.(),
    runExec: (id, args) => execRunner.run(id, args),
    execControl: (id, verb, text) => {
      if (verb === 'stop') return { value: execRunner.stop(id) };
      if (verb === 'running') return { value: execRunner.isRunning(id) };
      if (verb === 'write') return { problem: execRunner.write(id, text) };
      if (verb === 'restart') return { problem: execRunner.restart(id) };
      return { problem: `ação desconhecida "${verb}"` };
    },
    setSlotVisible,
    setButton,
    setTheme,
  };
  const urls = opts.urls.map(toUrl);
  // Abas da última vez voltam descartadas (só a ativa carrega); endereços da linha de comando abrem por cima.
  const restored = config.session.restore ? tabs.restore(sessionStore.load()) : null;
  const urlTab = urls.length > 0 ? tabs.open(urls[0]) : null;
  urls.slice(1).forEach((u) => tabs.open(u, true));
  const firstTab = urlTab ?? restored ?? tabs.open();
  splash?.finishWhen(whenPainted(firstTab.view.webContents, config.boot.max_ms));
  loaded.host?.attach(runtime);
  loaded.host?.emit('start');
  loaded.host?.release(); // sem funções do usuário registradas, a VM Lua é liberada
  startUpdates({ // renova as listas UMA vez, logo depois de abrir
    config: config.blocking, dir: listsDir, blocker,
    onResult: ({ kind, ok, error }) => {
      notifier.clearTag(`list:${kind}`);
      if (!ok) alertOf({ level: 'warning', text: `não foi possível baixar a lista "${kind}": ${error}`, tag: `list:${kind}` });
    },
  });
  const discard_after_s = opts.discard_after_s ?? config.timing.discard_after_s;
  if (discard_after_s > 0) setInterval(() => tabs.discardStale(discard_after_s * 1000), 5000);
}

// Certificado inválido: o padrão do Chromium é RECUSAR (a tela de erro explica). Só um host listado em security.cert_exceptions passa.
app.on('certificate-error', (event, _wc, url, _error, _certificate, callback) => {
  if (!certException(url, config.security)) return; // sem preventDefault: segue o padrão (recusa)
  event.preventDefault();
  callback(true);
});

app.whenReady().then(start);
app.on('window-all-closed', () => app.quit());
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => app.quit()); // sair pelo sistema também guarda a sessão
