'use strict';
// Aviso passageiro (ex.: download). O processo principal decide quando mostrar e quando tirar.
window.kaiak.on('config', applyTheme);
window.kaiak.on('toast', ({ title, text }) => {
  document.getElementById('title').textContent = title;
  document.getElementById('text').textContent = text;
});
