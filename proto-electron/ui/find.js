'use strict';
// Caixa de busca na página. O main manda o modelo (HTML + CSS, o padrão ou o do .lua) e as opções; aqui só se liga o que
// existir marcado com data-find="...". Texto digitado -> busca; Enter/Shift+Enter percorrem; Esc fecha.
const part = (name) => document.querySelector(`[data-find="${name}"]`);
let options = { matchCase: false, wholeWord: false };

function toggle(name, key) {
  const button = part(name);
  if (!button) return;
  button.classList.toggle('on', options[key]);
  button.addEventListener('click', () => {
    options = { ...options, [key]: !options[key] };
    button.classList.toggle('on', options[key]);
    window.kaiak.send('find:options', options);
    part('input')?.focus();
  });
}

function wire() {
  const input = part('input');
  input.addEventListener('input', () => window.kaiak.send('find:query', input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') window.kaiak.send('find:close');
    if (event.key === 'Enter') window.kaiak.send('find:step', !event.shiftKey);
  });
  part('next')?.addEventListener('click', () => window.kaiak.send('find:step', true));
  part('prev')?.addEventListener('click', () => window.kaiak.send('find:step', false));
  part('close')?.addEventListener('click', () => window.kaiak.send('find:close'));
  toggle('case', 'matchCase');
  toggle('word', 'wholeWord');
}

window.kaiak.on('config', applyTheme);
window.kaiak.on('find:template', ({ html, css, options: initial }) => {
  options = initial;
  document.getElementById('find-css').textContent = css; // o modelo vem do .lua (do dono)
  document.getElementById('root').innerHTML = html;
  wire();
});
window.kaiak.on('find:focus', () => { const input = part('input'); input?.focus(); input?.select(); });
window.kaiak.on('find:state', ({ active, total }) => {
  const input = part('input');
  const typed = input.value !== '';
  const count = part('count');
  if (count) count.textContent = typed ? `${active}/${total}` : '';
  input.classList.toggle('none', typed && total === 0);
});
