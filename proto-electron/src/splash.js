'use strict';
// Tela de boot: uma view por cima de TUDO (slots, página, avisos) desde a abertura da janela até a 1ª aba estar pintada.
// Sem Electron aqui: o main passa a view já criada. Some quando a promessa resolve, respeitando min_ms, ou em max_ms (o que vier primeiro).
function createSplash({ win, view, minMs, maxMs, now = Date.now }) {
  const shownAt = now();
  let closed = false;
  const fit = () => {
    const { width, height } = win.getContentBounds();
    view.setBounds({ x: 0, y: 0, width, height });
  };
  const raise = () => { if (!closed) win.contentView.addChildView(view); };
  const close = () => {
    if (closed) return;
    closed = true;
    win.removeListener('resize', fit);
    win.contentView.removeChildView(view);
    view.webContents.close();
  };
  fit();
  raise();
  win.on('resize', fit);
  return {
    raise,
    isOpen: () => !closed,
    // `ready`: promessa de "1ª aba pintada". Some depois de max(min_ms), no máximo em max_ms.
    finishWhen(ready) {
      const hide = () => setTimeout(close, Math.max(0, minMs - (now() - shownAt)));
      Promise.race([ready, new Promise((resolve) => setTimeout(resolve, Math.max(0, maxMs - (now() - shownAt))))]).then(hide);
    },
  };
}

module.exports = { createSplash };
