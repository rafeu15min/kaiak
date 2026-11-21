'use strict';
// Renderizador genérico de avisos: recebe { items, html, css, close_all } e desenha. O `html` é o template de
// UM item (de fábrica ou do usuário). Os textos entram por textContent; o CSP não permite script inline,
// então um template com <script> ou onclick não executa nada.
const skin = document.getElementById('skin');
const frame = document.getElementById('frame');
const list = document.getElementById('items');

function fillText(node, item) {
  const targets = [node, ...node.querySelectorAll('[data-bind]')].filter((el) => el.dataset.bind !== undefined);
  targets.forEach((el) => { el.textContent = String(item[el.dataset.bind] ?? ''); });
}

function wireDismiss(node, item) {
  if (item.dismissible === false) return;
  const buttons = [node, ...node.querySelectorAll('[data-action="dismiss"]')].filter((el) => el.dataset.action === 'dismiss');
  buttons.forEach((el) => el.addEventListener('click', () => window.kaiak.send('notify:dismiss', item.id)));
}

function buildItem(template, item) {
  const holder = document.createElement('template');
  holder.innerHTML = template;
  const node = holder.content.firstElementChild;
  if (!node) return null;
  node.classList.add(`level-${item.level}`);
  node.classList.toggle('undismissable', item.dismissible === false); // erro de sistema: sem ×
  fillText(node, item);
  wireDismiss(node, item);
  return node;
}

function renderCloseAll(show) {
  document.getElementById('close-all')?.remove();
  if (!show) return;
  const button = document.createElement('button');
  button.id = 'close-all';
  button.title = 'Dispensar';
  button.textContent = '×';
  button.dataset.action = 'dismiss-all';
  button.addEventListener('click', () => window.kaiak.send('notify:dismiss-all'));
  frame.append(button);
}

window.kaiak.on('notify:render', ({ items, html, css, close_all }) => {
  skin.textContent = css;
  list.replaceChildren(...items.map((item) => buildItem(html, item)).filter(Boolean));
  renderCloseAll(close_all);
});
window.kaiak.on('config', applyTheme);
