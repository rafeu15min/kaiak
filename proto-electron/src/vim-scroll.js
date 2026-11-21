'use strict';
// Rolagem estilo vim (j/k/d/u/g/G), igual à dos outros protótipos: ignora campos de texto
// e teclas que a página já tratou.
const VIM_SCROLL_JS = `
(() => {
  if (window.__kaiakVim) return;
  window.__kaiakVim = true;
  const editable = (el) => !!el && (el.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const half = () => window.innerHeight / 2;
  const actions = {
    j: () => window.scrollBy(0, 60),
    k: () => window.scrollBy(0, -60),
    d: () => window.scrollBy(0, half()),
    u: () => window.scrollBy(0, -half()),
    g: () => window.scrollTo(0, 0),
    G: () => window.scrollTo(0, document.documentElement.scrollHeight),
  };
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    if (editable(e.composedPath()[0]) || editable(document.activeElement)) return;
    const act = actions[e.key];
    if (!act) return;
    act();
    e.preventDefault();
  });
})();
`;

module.exports = { VIM_SCROLL_JS };
