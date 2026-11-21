'use strict';
// Onde a caixa de busca na página fica, dentro da área da página: um dos 8 lugares das bordas (como os avisos), com uma margem.
// Módulo puro. page = { x, y, width, height } (coordenadas da janela); devolve o retângulo da caixa.
function findBounds(page, place, { width, height }, margin) {
  const w = Math.min(width, Math.max(0, page.width - 2 * margin));
  const h = Math.min(height, Math.max(0, page.height - 2 * margin));
  const left = page.x + margin;
  const right = page.x + page.width - margin - w;
  const centerX = Math.round(page.x + (page.width - w) / 2);
  const top = page.y + margin;
  const bottom = page.y + page.height - margin - h;
  const centerY = Math.round(page.y + (page.height - h) / 2);
  const x = place.endsWith('left') || place === 'left' ? left : place.endsWith('right') ? right : centerX;
  const y = place.startsWith('top') ? top : place.startsWith('bottom') ? bottom : centerY;
  return { x, y, width: w, height: h };
}

module.exports = { findBounds };
