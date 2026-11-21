'use strict';
const address = document.getElementById('address');
const back = document.getElementById('back');
const forward = document.getElementById('forward');

function render(state) {
  document.body.classList.toggle('private', !!state.activePrivate);
  back.disabled = !state.canBack;
  forward.disabled = !state.canForward;
  // A página inicial própria aparece com a barra vazia (como no Vivaldi); o campo foca ao abrir uma aba nova.
  if (document.activeElement !== address) address.value = state.url.startsWith('kaiak://start') ? '' : state.url;
}

address.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  window.kaiak.send('nav:go', address.value);
  address.blur();
});
back.addEventListener('click', () => window.kaiak.send('nav:back'));
forward.addEventListener('click', () => window.kaiak.send('nav:forward'));
document.getElementById('reload').addEventListener('click', () => window.kaiak.send('nav:reload'));
window.kaiak.on('state', render);
window.kaiak.on('focus-address', () => { address.focus(); address.select(); });
window.kaiak.on('config', (config) => {
  applyTheme(config);
  document.getElementById('priv').textContent = config.theme.private_label;
});
