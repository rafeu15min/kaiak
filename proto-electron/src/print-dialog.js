'use strict';
// Tela de impressão (Ctrl+P): uma view de interface sobre a página, criada ao abrir e destruída ao fechar (não custa memória parada).
// Sem Electron aqui: o main injeta a criação da view e o acesso à aba ativa. Fecha ao trocar de aba, como a busca.
const { findBounds } = require('./find-layout');

const MARGIN = 12;

function createPrintDialog({ createView, win, pageBounds, activeContents, settings, canPrintSystem }) {
  let view = null;
  let target = null;
  const size = { width: settings.width, height: settings.height };
  const layout = () => view?.setBounds(findBounds(pageBounds(), settings.place, size, MARGIN));

  async function loaded() {
    const system = await canPrintSystem().catch(() => false); // o botão "Impressora…" só vale com impressora disponível
    if (!view) return; // fechou enquanto perguntava
    view.webContents.send('print:template', {
      html: settings.html, css: settings.css, values: settings.values, system,
    });
  }

  function open() {
    if (view) {
      view.webContents.focus();
      return;
    }
    target = activeContents();
    if (!target) return;
    view = createView(loaded);
    win.contentView.addChildView(view);
    layout();
    view.webContents.focus();
  }

  function close() {
    if (!view) return;
    const page = target;
    win.contentView.removeChildView(view);
    view.webContents.close();
    view = null;
    target = null;
    if (!page.isDestroyed()) page.focus();
  }

  return {
    open, close,
    relayout: layout,
    raise: () => { if (view) win.contentView.addChildView(view); },
    tabChanged: () => { if (view && activeContents() !== target) close(); },
    owns: (contents) => !!view && view.webContents === contents,
  };
}

module.exports = { createPrintDialog };
