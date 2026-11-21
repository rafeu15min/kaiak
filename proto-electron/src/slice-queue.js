'use strict';
// Entrega fatiada: itens [função, valor] saem em rodadas com orçamento de tempo (budgetMs) e cedem o laço entre elas, para um fluxo
// grande de linhas não travar a interface (medido: 66 ms de parada -> 2,6 ms). Fila limitada: passou do teto, o excesso é descartado e contado.
const DEFAULT_CAP = 20_000;

function createSliceQueue({ budgetMs, cap = DEFAULT_CAP, now = () => performance.now(), schedule = setImmediate }) {
  let items = [];
  let head = 0;
  let scheduled = false;
  let dropped = 0;
  let waiting = [];

  const empty = () => head >= items.length;
  function settle() {
    const callbacks = waiting;
    waiting = [];
    callbacks.forEach((callback) => callback());
  }

  function drain() {
    scheduled = false;
    const end = now() + budgetMs;
    while (!empty() && now() < end) {
      const [fn, value] = items[head++];
      fn(value);
    }
    if (empty()) {
      items = [];
      head = 0;
      settle();
      return;
    }
    scheduled = true;
    schedule(drain);
  }

  return {
    push(fn, value) {
      if (items.length - head >= cap) {
        dropped++;
        return;
      }
      items.push([fn, value]);
      if (scheduled) return;
      scheduled = true;
      schedule(drain);
    },
    // Chama `callback` quando a fila esvaziar (já, se estiver vazia). Garante que on_exit venha depois da última linha.
    whenIdle(callback) {
      if (empty() && !scheduled) callback();
      else waiting.push(callback);
    },
    dropped: () => dropped,
  };
}

module.exports = { createSliceQueue, DEFAULT_CAP };
