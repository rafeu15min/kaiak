'use strict';
// Chaves desconhecidas na config do usuário: nunca ignoradas em silêncio. O aviso traz o caminho completo e,
// quando há uma chave parecida, a sugestão ("quis dizer ...?"). Funções puras.

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Distância de edição (Levenshtein) entre duas chaves curtas.
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(above + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

// A chave conhecida mais parecida (ou null se nenhuma chega perto).
function suggest(key, known) {
  const [best] = known.map((name) => [name, distance(key, name)]).sort((x, y) => x[1] - y[1]);
  return best && best[1] <= Math.max(2, Math.floor(key.length / 3)) ? best[0] : null;
}

function unknownMessage(path, known) {
  const hint = suggest(path.at(-1), known);
  return `chave desconhecida "${path.join('.')}" ignorada${hint ? ` (quis dizer "${hint}"?)` : ''}`;
}

// Compara `user` com a forma `shape` (o padrão). `open` lista caminhos cujos nomes são livres (ex.: "search.engines").
function unknownKeys(user, shape, open = new Set(), path = []) {
  if (!isPlain(user)) return [];
  const known = Object.keys(shape);
  return Object.entries(user).flatMap(([key, value]) => {
    const here = [...path, key];
    if (!known.includes(key)) return [unknownMessage(here, known)];
    const nested = isPlain(value) && isPlain(shape[key]) && !open.has(here.join('.'));
    return nested ? unknownKeys(value, shape[key], open, here) : [];
  });
}

module.exports = { unknownKeys, unknownMessage, suggest };
