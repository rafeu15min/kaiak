'use strict';
// Fábrica de views dos slots: cria a view certa para cada tipo de `content` (ver slot-content.js).
//   builtin  -> interface do KaiaK (preload fechado, recebe estado e tema)
//   url      -> SITE, sessão própria (partition) com as MESMAS proteções do resto (só-HTTPS, cookies de terceiros,
//               bloqueio de anúncios, permissões negadas): um painel não pode ser um buraco na privacidade
//   html     -> HTML do usuário num modelo com CSP (sem script), como os avisos
//   file     -> arquivo local: tem script, mas vive isolado (sem preload, sem ponte, sessão em memória)
const { contentKind, BUILTIN } = require('./slot-content');

function createPanelFactory({ WebContentsView, session, path, fs, config, uiView, prepareSession, hardenWebContents, openInTab, report, homeDir }) {
  // Links de dentro de um painel nunca o navegam sozinhos: http(s) abre numa aba; o resto é descartado.
  function routeLinks(webContents, stayOn = null) {
    webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) openInTab(url);
      return { action: 'deny' };
    });
    if (stayOn === null) return;
    webContents.on('will-navigate', (event, url) => {
      if (url === stayOn) return;
      event.preventDefault();
      if (/^https?:\/\//.test(url)) openInTab(url);
    });
  }

  function sandboxedView(partition) {
    const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, spellcheck: false, partition } });
    view.setBackgroundColor(config.theme.bg);
    prepareSession(session.fromPartition(partition)); // idempotente: aplica as proteções uma vez por sessão
    hardenWebContents(view.webContents);
    return view;
  }

  function urlView(id, content) {
    const view = sandboxedView(`persist:panel-${content.partition ?? id}`);
    routeLinks(view.webContents); // o site navega por conta própria (guardNavigation já limita os esquemas)
    view.webContents.loadURL(content.url);
    return view;
  }

  const expandHome = (file) => (file.startsWith('~/') ? path.join(homeDir, file.slice(2)) : file);

  function fileView(id, content) {
    const file = path.resolve(expandHome(content.file));
    const view = sandboxedView(`panel-file-${id}`); // sem "persist:": vive só na memória
    if (!fs.existsSync(file)) report({ level: 'warning', text: `slot "${id}": o arquivo ${file} não existe` });
    const home = new URL(`file://${encodeURI(file)}`).href;
    routeLinks(view.webContents, home);
    view.webContents.loadFile(file);
    return view;
  }

  function htmlView(id, content, onLoaded) {
    const view = uiView('panel.html', () => {
      view.webContents.send('panel', { html: content.html, css: content.css ?? '' });
      onLoaded?.();
    });
    hardenWebContents(view.webContents);
    routeLinks(view.webContents, view.webContents.getURL());
    return view;
  }

  const builders = {
    builtin: (id, content, onLoaded) => uiView(BUILTIN[content], onLoaded),
    url: urlView,
    file: fileView,
    html: htmlView,
  };

  return {
    // Cria a view do slot. onLoaded só é chamado pelas interfaces do KaiaK (que precisam saber onde moram).
    build: (id, slot, onLoaded) => builders[contentKind(slot.content)](id, slot.content, onLoaded),
    isBuiltin: (slot) => contentKind(slot.content) === 'builtin',
  };
}

module.exports = { createPanelFactory };
