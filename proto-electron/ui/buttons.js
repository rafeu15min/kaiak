'use strict';
// Desenha os botões do k.button num contêiner. O main manda a lista { id, icon, label, tooltip, pressed } já resolvida;
// textos entram por textContent e o SVG vira <img> (data URL): nada aqui executa código do usuário.
function iconNode(icon) {
  const holder = document.createElement('span');
  holder.className = 'bt-icon';
  if (!icon) return holder;
  if (icon.src && icon.tint) {
    holder.classList.add('tint'); // SVG sem cor própria: a imagem vira máscara e é pintada com a cor do texto do tema
    holder.style.setProperty('--icon', `url("${icon.src}")`);
  } else if (icon.src) {
    const img = document.createElement('img');
    img.src = icon.src;
    img.alt = '';
    holder.append(img);
  } else {
    holder.textContent = icon.text;
  }
  return holder;
}

function buttonNode(item) {
  const button = document.createElement('button');
  button.className = `bt ${item.shape} label-${item.labelPlace}` + (item.pressed ? ' pressed' : '') + (item.disabled ? ' disabled' : '');
  button.disabled = item.disabled;
  button.title = item.tooltip || item.label || '';
  button.append(iconNode(item.icon));
  if (item.label !== undefined && item.shape === 'row') { // label vazio ("") também conta: o botão é retangular
    const label = document.createElement('span');
    label.className = 'bt-label';
    label.textContent = item.label;
    button.append(label);
  }
  if (item.badge !== false && item.badge !== undefined) {
    const badge = document.createElement('span');
    badge.className = 'bt-badge';
    badge.textContent = typeof item.badge === 'number' && item.badge > 99 ? '99+' : String(item.badge);
    button.append(badge);
  }
  button.addEventListener('click', () => window.kaiak.send('button:click', item.id));
  return button;
}

function renderButtons(container, list) {
  container.replaceChildren(...list.map(buttonNode));
}

window.kaiak.on('config', applyTheme); // buttons.html não tem outro script que aplique o tema
window.kaiak.on('buttons', (list) => renderButtons(document.getElementById('buttons'), list));
