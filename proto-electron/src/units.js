'use strict';
// Unidades da config. Comprimentos são px (número) por padrão; porcentagem é sempre texto explícito ("40%").
// Tempos levam o sufixo no nome do campo (_ms, _s, _hours).

// "40%" -> 0.4. Devolve null quando não é uma porcentagem válida.
function parsePercent(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,3}(?:\.\d+)?)%$/.exec(value.trim());
  return match ? Number(match[1]) / 100 : null;
}

// Comprimento: número = px; "20%" = parte do total. Devolve { px } | { fraction } | null.
function parseLength(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? { px: value } : null;
  const fraction = parsePercent(value);
  return fraction === null ? null : { fraction };
}

const lengthPx = (length, total) => length.px ?? length.fraction * total;

module.exports = { parsePercent, parseLength, lengthPx };
