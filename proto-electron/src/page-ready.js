'use strict';
// "Página pronta": o momento em que a página JÁ FOI PINTADA, não só carregada. Páginas kaiak:// avisam sozinhas (console.log
// com o marcador, depois de decodificar imagens e de 2 quadros); as demais valem pelo fim do carregamento. Sempre há um prazo.
const READY_MARKER = 'kaiak:ready';

// wc: webContents (só precisa de on/removeListener/getURL). Resolve em `timeoutMs` no máximo.
function whenPainted(wc, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, timeoutMs);
    function onConsole(event) {
      if (event.message === READY_MARKER && wc.getURL().startsWith('kaiak://')) done();
    }
    function onStop() {
      if (!wc.getURL().startsWith('kaiak://')) done(); // páginas de fora: o fim do carregamento basta
    }
    function done() {
      clearTimeout(timer);
      wc.removeListener('console-message', onConsole);
      wc.removeListener('did-stop-loading', onStop);
      resolve();
    }
    wc.on('console-message', onConsole);
    wc.on('did-stop-loading', onStop);
  });
}

module.exports = { whenPainted, READY_MARKER };
