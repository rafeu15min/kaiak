'use strict';
// Geometria dos avisos: funções PURAS (sem Electron). O lugar vira um retângulo dentro da região de
// referência (a área da página), e é recalculado sempre que a janela muda de tamanho.
const ANCHORS = {
  top: ['center', 'top'], 'top-left': ['left', 'top'], 'top-right': ['right', 'top'],
  bottom: ['center', 'bottom'], 'bottom-left': ['left', 'bottom'], 'bottom-right': ['right', 'bottom'],
  left: ['left', 'middle'], right: ['right', 'middle'],
};

// Início do lado: distância da borda (left/top, right/bottom) ou centralizado ao longo da borda (deslocamento
// ignorado nesse eixo: `top` só usa o offset vertical, `left` só o horizontal).
const nearEdge = (start, _length, _size, offset) => start + offset;
const farEdge = (start, length, size, offset) => start + length - size - offset;
const middle = (start, length, size) => start + (length - size) / 2;
const START = { left: nearEdge, top: nearEdge, right: farEdge, bottom: farEdge, center: middle, middle };

const contentHeight = (style, count) => style.pad + count * style.itemHeight + Math.max(0, count - 1) * style.gap;
const fitWidth = (style, region, margin) => {
  const room = Math.max(0, region.width - 2 * margin);
  return style.width === 'full' ? room : Math.min(style.width, room);
};

// spec: { place, offset: [x, y] }; style: { width, itemHeight, gap, pad }; count: itens visíveis.
function surfaceBounds({ place, offset }, style, region, count) {
  const [horizontal, vertical] = ANCHORS[place];
  const [marginX, marginY] = offset;
  const width = fitWidth(style, region, marginX);
  const height = Math.min(contentHeight(style, count), Math.max(0, region.height - 2 * marginY));
  return {
    x: Math.round(START[horizontal](region.x, region.width, width, marginX)),
    y: Math.round(START[vertical](region.y, region.height, height, marginY)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

module.exports = { surfaceBounds, contentHeight };
