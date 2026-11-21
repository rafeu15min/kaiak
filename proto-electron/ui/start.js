'use strict';
// kaiak://start: busca (mecanismo padrão em body[data-search]) e Speed Dial. Os dados vêm de #dial-data (JSON); adicionar e
// remover atalhos do USUÁRIO falam com kaiak://start/api/dial/* (só esta página alcança: sites não podem). Tudo por textContent.
const form = document.getElementById('search');
form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = document.getElementById('q').value.trim();
  if (query === '') return;
  const encoded = encodeURIComponent(query).replace(/%20/g, '+');
  location.href = document.body.dataset.search.split('%s').join(encoded);
});

const dial = document.getElementById('dial');
const message = document.getElementById('dial-msg');
const data = dial ? JSON.parse(document.getElementById('dial-data').textContent) : null;

function iconNode(icon, title) {
  const box = document.createElement('span');
  box.className = 'box';
  if (icon?.src && icon.tint) {
    const mask = document.createElement('span');
    mask.className = 'mask';
    mask.style.setProperty('-webkit-mask', `url("${icon.src}") center/contain no-repeat`);
    mask.style.setProperty('mask', `url("${icon.src}") center/contain no-repeat`);
    box.append(mask);
  } else if (icon?.src) {
    const img = document.createElement('img');
    img.src = icon.src;
    img.alt = '';
    box.append(img);
  } else {
    box.textContent = icon?.text ?? title.trim().charAt(0).toUpperCase();
  }
  return box;
}

function tileNode(item, removable) {
  const tile = document.createElement('div');
  tile.className = 'tile';
  const open = document.createElement('a');
  open.className = 'open';
  open.href = item.url;
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = item.title;
  open.append(iconNode(item.icon, item.title), name);
  tile.append(open);
  if (!removable) return tile;
  const remove = document.createElement('button');
  remove.className = 'rm';
  remove.textContent = '×';
  remove.title = 'Remover atalho';
  remove.addEventListener('click', () => removeItem(item.id, tile));
  tile.append(remove);
  return tile;
}

async function call(route, body) {
  const response = await fetch(`kaiak://start/api/dial/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, token: data.token }) });
  return response.json();
}

async function removeItem(id, tile) {
  const result = await call('remove', { id });
  if (result.error) message.textContent = result.error;
  else tile.remove();
}

function showAddForm(addButton) {
  const addForm = document.getElementById('addform');
  addForm.hidden = false;
  document.getElementById('t').focus();
  document.getElementById('cancel').onclick = () => { addForm.hidden = true; message.textContent = ''; };
  addForm.onsubmit = async (event) => {
    event.preventDefault();
    const result = await call('add', { title: document.getElementById('t').value, url: document.getElementById('u').value });
    if (result.error) { message.textContent = result.error; return; }
    dial.insertBefore(tileNode(result, true), addButton);
    addForm.reset();
    addForm.hidden = true;
    message.textContent = '';
  };
}

if (dial) {
  data.fixed.forEach((item) => dial.append(tileNode(item, false)));
  data.user.forEach((item) => dial.append(tileNode(item, true)));
  if (data.editable) {
    const add = document.createElement('button');
    add.className = 'add';
    add.textContent = '+';
    add.title = 'Adicionar atalho';
    add.addEventListener('click', () => showAddForm(add));
    dial.append(add);
  }
}

// Avisa o navegador (console.log com o marcador; ver page-ready.js) quando a página JÁ FOI PINTADA: imagens decodificadas e 2 quadros.
async function announceReady() {
  const sources = [...document.querySelectorAll('.art img')].map((img) => img.src);
  const mask = document.querySelector('.art div > div');
  const maskUrl = mask && /url\("?([^")]+)"?\)/.exec(getComputedStyle(mask).webkitMaskImage)?.[1];
  if (maskUrl) sources.push(maskUrl);
  await Promise.all(sources.map((src) => { const image = new Image(); image.src = src; return image.decode().catch(() => {}); }));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  console.log('kaiak:ready');
}
announceReady();
