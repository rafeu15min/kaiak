'use strict';
// Lê um arquivo de imagem do disco como data URL (uma vez, sem rede). Usado por ícones de botão e pelo fundo da página inicial.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const expandHome = (file) => (file.startsWith('~/') ? path.join(os.homedir(), file.slice(2)) : path.resolve(file));
const dataUrl = (mime, bytes) => `data:${mime};base64,${bytes.toString('base64')}`;

// Devolve { src, mime, text? (conteúdo do SVG) }. Lança Error com o motivo (em português) se não puder ler.
function readImageDataUrl(file, maxBytes) {
  const full = expandHome(file);
  const mime = MIME[path.extname(full).toLowerCase()];
  if (!mime) throw new Error('formato não suportado (png, jpg, gif, webp ou svg)');
  if (fs.statSync(full).size > maxBytes) throw new Error(`arquivo maior que ${Math.round(maxBytes / 1024)} KB`);
  const bytes = fs.readFileSync(full);
  return { src: dataUrl(mime, bytes), mime, text: mime === 'image/svg+xml' ? bytes.toString('utf8') : null, path: full };
}

module.exports = { readImageDataUrl, dataUrl, expandHome };
