'use strict';
// Geometria da janela. O layout é uma LISTA ORDENADA de slots (faixas encostadas numa borda) que "mordem" a
// janela na ordem de leitura do kaiak.lua; o que sobra é a página. computeLayout é uma função PURA (sem Electron).
const { parsePercent, parseLength, lengthPx } = require('./units');

const VERTICAL = new Set(['left', 'right']); // faixa vertical: a espessura é a largura

// Retângulo de uma faixa de espessura `t` encostada em `place`, dentro de `area`.
const STRIP = {
  left: (a, t) => ({ x: a.x, y: a.y, width: t, height: a.height }),
  right: (a, t) => ({ x: a.x + a.width - t, y: a.y, width: t, height: a.height }),
  top: (a, t) => ({ x: a.x, y: a.y, width: a.width, height: t }),
  bottom: (a, t) => ({ x: a.x, y: a.y + a.height - t, width: a.width, height: t }),
};
// O que sobra de `area` depois de uma faixa que EMPURRA (mode = push).
const REST = {
  left: (a, t) => ({ ...a, x: a.x + t, width: a.width - t }),
  right: (a, t) => ({ ...a, width: a.width - t }),
  top: (a, t) => ({ ...a, y: a.y + t, height: a.height - t }),
  bottom: (a, t) => ({ ...a, height: a.height - t }),
};

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Espessura em px: número = px, "20%" = parte da janela naquele eixo; nunca passa do espaço que sobrou (`room`).
function thickness(length, place, win, room) {
  const total = VERTICAL.has(place) ? win.width : win.height;
  return clamp(Math.round(lengthPx(parseLength(length), total)), 0, room);
}

// slots: { id: { place, size, expand?, mode } } na ordem de leitura. win: { width, height }.
// Devolve { base: { id: rect }, expanded: { id: rect } (só quem tem `expand`), page: rect }.
function computeLayout(slots, win) {
  let area = { x: 0, y: 0, width: win.width, height: win.height };
  const base = {};
  const expanded = {};
  for (const [id, slot] of Object.entries(slots)) {
    const room = VERTICAL.has(slot.place) ? area.width : area.height;
    const size = thickness(slot.size, slot.place, win, room);
    base[id] = STRIP[slot.place](area, size);
    if (slot.expand !== undefined) { // ao expandir, a faixa cresce por cima do que vier depois (a página inclusive)
      expanded[id] = STRIP[slot.place](area, Math.max(size, thickness(slot.expand, slot.place, win, room)));
    }
    if (slot.mode !== 'overlay') area = REST[slot.place](area, size);
  }
  return { base, expanded, page: area };
}

// Espessura de um retângulo conforme o lado em que está encostado.
const thicknessOfRect = (rect, place) => (VERTICAL.has(place) ? rect.width : rect.height);

function createLayout(slots, dev = { place: 'right', size: '40%' }) {
  const docked = dev.place !== 'window';
  const fraction = parsePercent(dev.size) ?? 0.4;
  const cut = (full) => (dev.place === 'right' ? Math.round(full.width * fraction) : Math.round(full.height * fraction));
  // Slots fechados (visible = false, ou fechados em execução com h:hide()) não entram na conta: a página usa o espaço.
  const hidden = new Set(Object.entries(slots).filter(([, slot]) => slot.visible === false).map(([id]) => id));
  const visibleSlots = () => Object.fromEntries(Object.entries(slots).filter(([id]) => !hidden.has(id)));
  const compute = (win) => computeLayout(visibleSlots(), win.getContentBounds());
  return {
    compute,
    isVisible: (id) => !hidden.has(id),
    setVisible(id, visible) { if (visible) hidden.delete(id); else hidden.add(id); },
    // Retângulo de um slot (undefined se estiver fechado); `open` = o mouse está nele e ele tem `expand`.
    slotBounds(win, id, open = false) {
      const { base, expanded } = compute(win);
      return open && expanded[id] ? expanded[id] : base[id];
    },
    // Área da página; com as DevTools embutidas abertas (devOpen), perde a faixa da direita ou de baixo.
    pageBounds(win, devOpen = false) {
      const full = compute(win).page;
      if (!devOpen || !docked) return full;
      const size = cut(full);
      return dev.place === 'right' ? { ...full, width: full.width - size } : { ...full, height: full.height - size };
    },
    // Faixa das DevTools embutidas (o que a página perdeu).
    devtoolsBounds(win) {
      const page = this.pageBounds(win, true);
      const full = this.pageBounds(win, false);
      if (dev.place === 'right') return { x: page.x + page.width, y: full.y, width: full.width - page.width, height: full.height };
      return { x: full.x, y: page.y + page.height, width: full.width, height: full.height - page.height };
    },
  };
}

module.exports = { createLayout, computeLayout, thicknessOfRect };
