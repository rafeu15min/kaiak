'use strict';
// Painel de HTML do usuário: o main manda { html, css }; o CSP da página bloqueia script e onclick, então o HTML é só visual.
window.kaiak.on('panel', ({ html, css }) => {
  document.getElementById('skin').textContent = css;
  document.getElementById('root').innerHTML = html;
});
window.kaiak.on('config', applyTheme);
