'use strict';
// Trilho vertical de abas: 42 px só com ícone; ao passar o mouse, expande por cima da página
// (a view do trilho ganha largura no processo principal) mostrando título e o X de fechar.
// Tempos vêm da config (mensagem 'config'); estes valores só valem até ela chegar.
let timing = { hover_delay_ms: 120, collapse_delay_ms: 250, animation_ms: 150 };

const panel = document.getElementById('panel');
const list = document.getElementById('list');
let openTimer = null;
let closeTimer = null;

function iconNode(tab) {
  const box = document.createElement('div');
  box.className = 'icon';
  if (tab.icon) {
    const img = document.createElement('img');
    img.src = tab.icon;
    img.onerror = () => box.replaceChildren(letter(tab));
    box.append(img);
  } else {
    box.append(letter(tab));
  }
  return box;
}

function letter(tab) {
  const span = document.createElement('span');
  span.textContent = (tab.title || '?').trim().charAt(0).toUpperCase() || '?';
  return span;
}

function tabNode(tab, activeId) {
  const row = document.createElement('div');
  row.className = 'tab' + (tab.id === activeId ? ' active' : '') + (tab.discarded ? ' discarded' : '') + (tab.private ? ' private' : '');
  row.title = tab.title;
  row.addEventListener('click', () => window.kaiak.send('tab:select', tab.id));
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = tab.title;
  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '×';
  close.addEventListener('click', (e) => { e.stopPropagation(); window.kaiak.send('tab:close', tab.id); });
  row.append(iconNode(tab), title, close);
  return row;
}

function render(state) {
  list.replaceChildren(...state.tabs.map((tab) => tabNode(tab, state.activeId)));
}

// Só expande se a config deu `expand` maior que `size` (o main manda as espessuras em px na mensagem 'slot').
let expandable = false;
window.kaiak.on('slot', (info) => { expandable = info.expand !== null && info.expand > info.size; });

function expand() {
  if (!expandable) return;
  clearTimeout(closeTimer);
  if (panel.classList.contains('open') || openTimer) return;
  openTimer = setTimeout(() => {
    openTimer = null;
    window.kaiak.send('slot:expand', true);
    requestAnimationFrame(() => panel.classList.add('open'));
  }, timing.hover_delay_ms);
}

function collapse() {
  clearTimeout(openTimer);
  openTimer = null;
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    panel.classList.remove('open');
    setTimeout(() => window.kaiak.send('slot:expand', false), timing.animation_ms + 20);
  }, timing.collapse_delay_ms);
}

document.body.addEventListener('mouseenter', expand);
document.body.addEventListener('mousemove', expand);
document.body.addEventListener('mouseleave', collapse);
document.getElementById('new').addEventListener('click', () => window.kaiak.send('tab:new'));
window.kaiak.on('state', render);
window.kaiak.on('config', (config) => {
  timing = config.timing;
  applyTheme(config);
  panel.style.transitionDuration = `${timing.animation_ms}ms`;
});
