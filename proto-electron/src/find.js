'use strict';
// Busca na página (Ctrl+F): uma view pequena de interface por cima da página, criada ao abrir e destruída ao fechar (não custa
// memória parada). Sem Electron aqui: o main injeta a criação da view e o acesso à aba ativa.
// Dois motores: o do Chromium (findInPage: destaca TODAS as ocorrências; opção matchCase) e, para "palavra inteira", o window.find
// do Chromium via script na página (destaca só a ocorrência atual): findInPage não tem essa opção, window.find tem (provado).
const { findBounds } = require('./find-layout');

const MAX_QUERY = 200;
const MAX_WORD_MATCHES = 2000; // teto da contagem no modo palavra inteira

// Scripts do modo palavra inteira. A consulta entra como literal JSON (nunca concatenada como código).
const wordCountScript = (q, cs) => `(() => {
  const s = getSelection(); s.removeAllRanges();
  let n = 0;
  while (n < ${MAX_WORD_MATCHES} && window.find(${JSON.stringify(q)}, ${cs}, false, false, true, false, false)) n++;
  s.removeAllRanges();
  if (n > 0) window.find(${JSON.stringify(q)}, ${cs}, false, false, true, false, false);
  return n;
})()`;
const wordStepScript = (q, cs, forward) => `window.find(${JSON.stringify(q)}, ${cs}, ${!forward}, true, true, false, false)`;

function createFind({ createView, win, pageBounds, activeContents, settings }) {
  let view = null;
  let target = null; // webContents da aba onde se busca
  let query = '';
  let options = { matchCase: settings.caseSensitive, wholeWord: settings.wholeWord };
  let word = { total: 0, ordinal: 0 }; // estado do modo palavra inteira (o motor nativo conta sozinho)
  const size = { width: settings.width, height: settings.height };

  const send = (channel, ...payload) => view?.webContents.send(channel, ...payload);
  const alive = () => !!view && !target.isDestroyed();
  const onFound = (_event, result) => {
    if (result.finalUpdate && !options.wholeWord) send('find:state', { active: result.activeMatchOrdinal, total: result.matches });
  };
  const layout = () => view?.setBounds(findBounds(pageBounds(), settings.place, size, settings.margin));
  const clearHighlights = () => {
    if (target.isDestroyed()) return;
    target.stopFindInPage('clearSelection');
    target.executeJavaScript('getSelection().removeAllRanges()').catch(() => {});
  };
  const loaded = () => {
    send('find:template', { html: settings.html, css: settings.css, options });
    send('find:focus');
  };

  function open() {
    const wc = activeContents();
    if (!wc) return;
    if (view) {
      send('find:focus');
      return;
    }
    target = wc;
    target.on('found-in-page', onFound);
    view = createView(loaded);
    win.contentView.addChildView(view);
    layout();
  }

  function close() {
    if (!view) return;
    const page = target;
    target.removeListener('found-in-page', onFound);
    clearHighlights();
    win.contentView.removeChildView(view);
    view.webContents.close();
    view = null;
    target = null;
    word = { total: 0, ordinal: 0 };
    if (!page.isDestroyed()) page.focus(); // o teclado volta para a página
  }

  async function searchWord() {
    const wc = target;
    const total = await wc.executeJavaScript(wordCountScript(query, options.matchCase)).catch(() => 0);
    if (!alive() || wc !== target) return; // fechou ou trocou de aba durante a contagem
    word = { total, ordinal: total > 0 ? 1 : 0 };
    send('find:state', { active: word.ordinal, total });
  }

  function search(text) {
    if (!view) return;
    query = String(text).slice(0, MAX_QUERY);
    clearHighlights();
    if (query === '') {
      word = { total: 0, ordinal: 0 };
      send('find:state', { active: 0, total: 0 });
      return;
    }
    if (options.wholeWord) searchWord();
    else target.findInPage(query, { findNext: false, matchCase: options.matchCase });
  }

  async function stepWord(forward) {
    if (word.total === 0) return;
    await target.executeJavaScript(wordStepScript(query, options.matchCase, forward)).catch(() => false);
    const next = forward ? (word.ordinal % word.total) + 1 : ((word.ordinal - 2 + word.total) % word.total) + 1;
    word = { ...word, ordinal: next };
    send('find:state', { active: next, total: word.total });
  }

  function step(forward) {
    if (!view) {
      open();
      return;
    }
    if (query === '') return;
    if (options.wholeWord) stepWord(forward);
    else target.findInPage(query, { findNext: true, forward, matchCase: options.matchCase });
  }

  // Botões "Aa" e "ab": muda o modo e refaz a busca atual.
  function setOptions(next) {
    if (!view) return;
    options = { matchCase: !!next.matchCase, wholeWord: !!next.wholeWord };
    search(query);
  }

  return {
    open, close, search, step, setOptions,
    relayout: layout,
    raise: () => { if (view) win.contentView.addChildView(view); },
    // A aba ativa mudou: a busca pertence à aba antiga, então fecha.
    tabChanged: () => { if (view && activeContents() !== target) close(); },
    owns: (contents) => !!view && view.webContents === contents,
  };
}

module.exports = { createFind };
