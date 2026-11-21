'use strict';
// Tela cheia de página (vídeo, apresentação): enquanto uma aba pede, a janela vira tela cheia, as barras somem e a página cobre tudo.
// Sem Electron: o main injeta as operações. Só UMA aba por vez; trocar de aba ou fechá-la sai da tela cheia.
function createFullscreen({ win, setChromeVisible, applyPage, restorePage }) {
  let state = null; // { wc, wasFullScreen }

  function enter(wc) {
    if (state) return;
    state = { wc, wasFullScreen: win.isFullScreen() };
    win.setFullScreen(true);
    setChromeVisible(false);
    applyPage();
  }

  // A janela só sai da tela cheia se foi a página que a colocou (quem já estava em tela cheia continua).
  function leave() {
    if (!state) return;
    const { wasFullScreen } = state;
    state = null;
    setChromeVisible(true);
    if (!wasFullScreen) win.setFullScreen(false);
    restorePage();
  }

  return {
    enter, leave,
    active: () => state !== null,
    owns: (wc) => state?.wc === wc,
    // A aba ativa mudou: a tela cheia da antiga acaba (a página também é avisada, para sair do modo dela).
    tabChanged(activeWc) {
      if (!state || state.wc === activeWc) return;
      const old = state.wc;
      leave();
      if (!old.isDestroyed()) old.executeJavaScript('document.fullscreenElement && document.exitFullscreen()').catch(() => {});
    },
  };
}

module.exports = { createFullscreen };
