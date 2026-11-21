'use strict';
// HTML padrão da tela de impressão (Ctrl+P). O .lua pode trocá-lo por inteiro (print.html) e acrescentar CSS (print.css). Os
// controles são marcados com data-print="...": page_size, landscape, background, scale, margins, pages (valores) e save, system, close
// (botões). Falta algum? Só aquele controle não existe. Sem script no HTML (a CSP barra).
const DEFAULT_HTML = `<div class="dialog">
  <h2>Imprimir</h2>
  <label>Papel <select data-print="page_size">
    <option>A3</option><option>A4</option><option>A5</option><option>Legal</option><option>Letter</option><option>Tabloid</option>
  </select></label>
  <label>Orientação <select data-print="landscape"><option value="false">Retrato</option><option value="true">Paisagem</option></select></label>
  <label>Margens <select data-print="margins"><option value="default">Padrão</option><option value="none">Nenhuma</option><option value="minimum">Mínimas</option></select></label>
  <label>Escala (%) <input data-print="scale" type="number" min="10" max="200" step="5"></label>
  <label>Páginas <input data-print="pages" type="text" placeholder="todas (ex.: 1-3, 5)" spellcheck="false" autocomplete="off" maxlength="60"></label>
  <label class="check"><input data-print="background" type="checkbox"> Imprimir cores e imagens de fundo</label>
  <div class="actions">
    <button data-print="close">Cancelar</button>
    <button data-print="system" title="Diálogo de impressão do sistema (precisa de impressora)">Impressora…</button>
    <button data-print="save" class="primary">Salvar como PDF</button>
  </div>
</div>`;

const DEFAULT_CSS = `
.dialog { box-sizing: border-box; height: 100%; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; background: var(--bg);
          border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 8px 30px rgba(0, 0, 0, .45); }
h2 { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
label { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--muted); }
label.check { justify-content: flex-start; }
select, input[type="number"], input[type="text"] { width: 190px; height: 28px; padding: 0 8px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--input); color: var(--fg); font: inherit; outline: none; box-sizing: border-box; }
select:focus, input:focus { border-color: var(--accent); }
.actions { margin-top: auto; display: flex; justify-content: flex-end; gap: 8px; }
button { height: 30px; padding: 0 14px; border: 0; border-radius: 8px; background: var(--panel); color: var(--fg); font: inherit; cursor: pointer; }
button:hover { background: var(--hover); }
button.primary { background: var(--accent); color: var(--bg); font-weight: 600; }
button:disabled { opacity: .45; cursor: default; }
`;

module.exports = { DEFAULT_HTML, DEFAULT_CSS };
