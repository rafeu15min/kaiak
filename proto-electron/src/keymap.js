'use strict';
// Atalhos por tabela: texto da tecla ("ctrl+shift+tab") -> ação nomeada (texto) ou função.
// As teclas são normalizadas (modificadores em ordem fixa, apelidos como "left" -> "arrowleft"),
// então a mesma combinação casa com qualquer grafia.
const MODIFIERS = ['ctrl', 'alt', 'shift', 'meta'];
const ALIASES = {
  control: 'ctrl', super: 'meta', cmd: 'meta',
  left: 'arrowleft', right: 'arrowright', up: 'arrowup', down: 'arrowdown',
  esc: 'escape', return: 'enter', plus: '+', minus: '-',
};
const canon = (s) => ALIASES[s] ?? s;

function join(mods, key) {
  const set = new Set(mods);
  return [...MODIFIERS.filter((m) => set.has(m)), key].join('+');
}

function normalize(combo) {
  const parts = combo.toLowerCase().split('+').map((p) => canon(p.trim()));
  const key = parts.pop();
  return join(parts, key);
}

function fromInput(input) {
  const mods = [input.control && 'ctrl', input.alt && 'alt', input.shift && 'shift', input.meta && 'meta']
    .filter(Boolean);
  return join(mods, input.key.toLowerCase());
}

// keys: { "ctrl+t": "new_tab" | fn | false }, actions: { new_tab: fn, ... }
function buildKeymap(keys, actions) {
  const map = new Map();
  const warnings = [];
  for (const [combo, target] of Object.entries(keys)) {
    if (!target) continue; // false/null desfaz o atalho do padrão
    const fn = typeof target === 'function' ? target : actions[target];
    if (!fn) {
      warnings.push(`atalho "${combo}": ação desconhecida "${target}"`);
      continue;
    }
    map.set(normalize(combo), fn);
  }
  return {
    warnings,
    // true se a tecla foi tratada (o chamador cancela o evento)
    handle(input) {
      if (input.type !== 'keyDown') return false;
      const fn = map.get(fromInput(input));
      if (!fn) return false;
      fn();
      return true;
    },
  };
}

module.exports = { buildKeymap, normalize };
