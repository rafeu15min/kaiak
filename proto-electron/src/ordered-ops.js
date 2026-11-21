'use strict';
// Coleções ORDENADAS da config (slots do layout, botões...): o kaiak.lua entrega uma lista de operações [{ id, spec }]
// na ordem de leitura. Aplicadas em sequência (mesma regra do hl.unbind + hl.bind do Hyprland):
//   * spec = tabela: mescla no lugar se o item já existe (mantém a posição); senão entra no FIM;
//   * spec = false: remove o item (só o que veio antes);
//   * remover e declarar de novo leva o item ao fim, com os valores de fábrica.
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function merge(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra ?? {})) {
    out[key] = isPlain(value) && isPlain(base[key]) ? merge(base[key], value) : value;
  }
  return out;
}

// Aceita a lista de operações (forma do Lua) ou uma tabela { id = spec } (testes e ferramentas).
function toOps(value) {
  if (Array.isArray(value)) return value;
  return isPlain(value) ? Object.entries(value).map(([id, spec]) => ({ id, spec })) : [];
}

// map: Map id -> spec (modificado). opts: { idPattern, noun ("slot"), path ("layout"), factory, replace: [campos], warnings }
//   factory: { id: specDeFábrica } (valores de partida de itens de fábrica); replace: campos que SUBSTITUEM em vez de mesclar.
function applyOps(map, ops, { idPattern, noun, path, factory = {}, replace = [], warnings }) {
  for (const { id, spec } of ops) {
    if (!idPattern.test(id)) {
      warnings.push(`${noun} "${id}" inválido (nome começa com letra; só letras, números, - e _): ignorado`);
      continue;
    }
    if (spec === false) {
      map.delete(id);
      continue;
    }
    const given = spec ?? {};
    if (!isPlain(given)) {
      warnings.push(`"${path}.${id}" inválido (${JSON.stringify(given)}): esperado uma tabela ou false; ignorado`);
      continue;
    }
    const next = merge(map.get(id) ?? structuredClone(factory[id] ?? {}), given);
    replace.filter((field) => given[field] !== undefined).forEach((field) => { next[field] = given[field]; });
    map.set(id, next); // Map.set numa chave existente mantém a posição
  }
}

module.exports = { applyOps, toOps, merge, isPlain };
