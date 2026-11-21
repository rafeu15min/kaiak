'use strict';
// HTML padrão da caixa de busca. O .lua pode trocá-lo por inteiro (find.html) e acrescentar CSS (find.css). Os elementos que a caixa
// controla são marcados com data-find="...": input (obrigatório), count, prev, next, case, word, close. Falta algum? Só aquele
// controle não existe; não há script no HTML (a CSP da página barra).
const DEFAULT_HTML = `<div class="box">
  <input data-find="input" type="text" placeholder="Buscar na página" spellcheck="false" autocomplete="off" maxlength="200">
  <span data-find="count" class="count"></span>
  <button data-find="case" title="Diferenciar maiúsculas e minúsculas">Aa</button>
  <button data-find="word" title="Palavra inteira">ab</button>
  <button data-find="prev" title="Anterior (Shift+Enter)">↑</button>
  <button data-find="next" title="Próximo (Enter)">↓</button>
  <button data-find="close" title="Fechar (Esc)">×</button>
</div>`;

const DEFAULT_CSS = `
.box { box-sizing: border-box; height: 100%; display: flex; align-items: center; gap: 6px; padding: 0 8px; background: var(--bg);
       border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 4px 18px rgba(0, 0, 0, .35); }
[data-find="input"] { flex: 1; min-width: 0; height: 28px; padding: 0 10px; border: 1px solid var(--border); border-radius: 14px; background: var(--input); color: var(--fg); font: inherit; outline: none; }
[data-find="input"]:focus { border-color: var(--accent); }
[data-find="input"].none { border-color: #f7768e; }
.count { color: var(--muted); min-width: 52px; text-align: center; font-variant-numeric: tabular-nums; }
button { min-width: 28px; height: 28px; padding: 0 4px; border: 0; border-radius: 6px; background: transparent; color: var(--fg); font-size: 14px; cursor: pointer; }
button:hover { background: var(--hover); }
button.on { background: var(--tab-active); color: var(--fg); box-shadow: inset 0 0 0 1px var(--accent); }
`;

module.exports = { DEFAULT_HTML, DEFAULT_CSS };
