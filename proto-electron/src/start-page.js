'use strict';
// Gera o HTML de kaiak://start a partir da config e do tema ativo. Módulo puro: sem Electron, sem disco (a imagem chega pronta).
const { PLACES } = require('./start-config');

// Valores do tema entram em CSS: tira o que fecharia o bloco ou o atributo.
const safe = (value) => String(value).replace(/[<>{};"\\]/g, '');
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// place -> alinhamento do flex (justify-content horizontal, align-items vertical)
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end' };
const POSITION = Object.fromEntries(PLACES.map((place) => {
  const [a, b] = place.split('-');
  const vertical = [a, b].includes('top') ? 'start' : [a, b].includes('bottom') ? 'end' : 'center';
  const horizontal = [a, b].includes('left') ? 'start' : [a, b].includes('right') ? 'end' : 'center';
  return [place, { justify: ALIGN[horizontal], align: ALIGN[vertical] }];
}));

function artHtml(image, art, theme) {
  if (!image || !art) return '';
  const { justify, align } = POSITION[image.place];
  const box = `justify-content:${justify};align-items:${align}`;
  const sized = `width:${image.size === 'cover' || image.size === 'contain' ? '100%' : image.size};aspect-ratio:1`;
  if (image.tint === false) {
    return `<div class="art" style="${box}"><img alt="" src="${art}" style="${sized};object-fit:contain"></div>`;
  }
  const color = image.tint === true ? theme.accent : image.tint; // true = cor de destaque do tema
  const mask = `-webkit-mask:url(${art}) center/contain no-repeat;mask:url(${art}) center/contain no-repeat`;
  return `<div class="art" style="${box}"><div style="${sized};background:${color};${mask}"></div></div>`;
}

// Widget: bloco livre do .lua (HTML e CSS dele; a CSP da página barra script) preso a um dos 9 lugares.
function widgetHtml(widget, index) {
  const { justify, align } = POSITION[widget.place];
  const size = `${widget.width ? `width:${widget.width};` : ''}${widget.height ? `height:${widget.height};` : ''}`;
  const css = widget.css ? `<style>${widget.css}</style>` : '';
  return `${css}<div class="wbox" style="justify-content:${justify};align-items:${align}"><div class="widget" id="widget-${index + 1}" style="${size}">${widget.html}</div></div>`;
}

// Dados do Speed Dial para o script da página (bloco JSON, não executa; "<" escapado para não fechar o bloco).
const dataIsland = (data) => `<script type="application/json" id="dial-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

// art: data URL já lido (ou null). searchTemplate: URL com %s do mecanismo padrão.
// dial: { fixed: [{ title, url, icon }] (do .lua, ícones já resolvidos), user: [{ id, title, url }] (do arquivo de dados) }.
function renderStart({ start, theme: rawTheme, art = null, searchTemplate, dial = { fixed: [], user: [] } }) {
  const { vars = {}, ...plain } = rawTheme;
  const theme = Object.fromEntries(Object.entries(plain).map(([key, value]) => [key, safe(value)]));
  const customVars = Object.entries(vars).map(([name, value]) => `--${safe(name)}: ${safe(value)};`).join(' ');
  const bg = start.background;
  const speed = start.speed_dial;
  const paint = bg.gradient || bg.color || theme.bg;
  const search = start.search
    ? `<form id="search" autocomplete="off"><input id="q" type="text" placeholder="Pesquisar" spellcheck="false" autofocus></form>` : '';
  return `<!doctype html>
<html lang="pt-BR" data-scheme="${escapeHtml(theme.scheme)}">
<meta charset="utf-8">
<title>Nova aba</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src kaiak://start; connect-src kaiak://start; form-action 'none'">
<style>
  :root { color-scheme: ${escapeHtml(theme.color_scheme)}; ${customVars} }
  html, body { margin: 0; height: 100%; overflow: hidden; background: ${paint}; color: ${theme.fg}; font: 15px ${theme.font}; }
  .art { position: fixed; inset: ${start.search ? '28% 0 0 0' : '0'}; display: flex; padding: 24px; box-sizing: border-box; pointer-events: none; }
  #search { position: fixed; top: 22%; left: 50%; transform: translateX(-50%); width: min(560px, 80vw); z-index: 1; }
  #q { width: 100%; height: 44px; padding: 0 20px; box-sizing: border-box; border: 1px solid ${theme.border}; border-radius: 22px;
       background: ${theme.input}; color: ${theme.fg}; font: inherit; outline: none; }
  #q:focus { border-color: ${theme.accent}; }
  #q::placeholder { color: ${theme.muted}; }
  .wbox { position: fixed; inset: 0; display: flex; padding: 24px; box-sizing: border-box; pointer-events: none; }
  .widget { pointer-events: auto; max-width: 100%; max-height: 100%; overflow: auto; }
  #main { position: fixed; top: 22%; left: 50%; transform: translateX(-50%); width: min(900px, 92vw); display: flex; flex-direction: column; align-items: center; gap: 28px; z-index: 1; }
  #main #search { position: static; transform: none; }
  #dial { display: grid; grid-template-columns: repeat(var(--cols), var(--tile)); gap: 18px 16px; justify-content: center; }
  .tile { position: relative; width: var(--tile); }
  .tile .open { display: flex; flex-direction: column; align-items: center; gap: 8px; color: ${theme.fg}; text-decoration: none; }
  .tile .box { width: var(--tile); height: var(--tile); display: grid; place-items: center; background: ${theme.panel}; border-radius: 16px; font-size: calc(var(--tile) * .42); overflow: hidden; }
  #dial[data-shape="round"] .box { border-radius: 50%; }
  .tile .open:hover .box { background: ${theme.tab_active}; }
  .tile .box img { width: 55%; height: 55%; object-fit: contain; }
  .tile .box .mask { width: 55%; height: 55%; background: ${theme.fg}; }
  .tile .name { max-width: 100%; font-size: 12px; color: ${theme.muted}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tile .rm { position: absolute; top: -6px; right: -6px; width: 22px; height: 22px; border: 0; border-radius: 50%; background: ${theme.hover}; color: ${theme.fg}; cursor: pointer; display: none; font-size: 14px; line-height: 22px; padding: 0; }
  .tile:hover .rm { display: block; }
  #dial .add { border: 1px dashed ${theme.border}; background: transparent; border-radius: 16px; width: var(--tile); height: var(--tile); color: ${theme.muted}; font-size: 28px; cursor: pointer; }
  #dial[data-shape="round"] .add { border-radius: 50%; }
  #addform { display: flex; gap: 8px; }
  #addform[hidden] { display: none; }
  #addform input { height: 34px; padding: 0 12px; border: 1px solid ${theme.border}; border-radius: 17px; background: ${theme.input}; color: ${theme.fg}; font: inherit; outline: none; }
  #addform button { height: 34px; padding: 0 14px; border: 0; border-radius: 17px; background: ${theme.tab_active}; color: ${theme.fg}; font: inherit; cursor: pointer; }
  #dial-msg { color: ${theme.muted}; font-size: 12px; min-height: 14px; }
</style>
<body data-search="${escapeHtml(searchTemplate)}">
${artHtml(bg.image, art, theme)}${start.widgets.map(widgetHtml).join('')}
<div id="main">${search}${speed ? dialHtml(speed) : ''}</div>
${speed ? dataIsland({ ...dial, editable: speed.editable }) : ''}
<script src="kaiak://start/start.js"></script>
</body>
</html>`;
}

// Esqueleto do Speed Dial: o script monta os atalhos a partir do bloco de dados.
function dialHtml(speed) {
  const form = speed.editable ? '<form id="addform" hidden autocomplete="off"><input id="t" placeholder="Título" maxlength="40"><input id="u" placeholder="https://..." maxlength="2000"><button type="submit">Adicionar</button><button type="button" id="cancel">Cancelar</button></form>' : '';
  return `<div id="dial" data-shape="${speed.shape}" style="--cols:${speed.columns};--tile:${speed.size}px"></div>${form}<div id="dial-msg"></div>`;
}

// Tela de boot: só fundo (cor, gradiente, imagem), sem script. Montada com o tema ativo.
function renderBoot({ boot, theme: rawTheme, art = null }) {
  const theme = Object.fromEntries(Object.entries(rawTheme).filter(([key]) => key !== 'vars').map(([key, value]) => [key, safe(value)]));
  const bg = boot.background;
  return `<!doctype html>
<html lang="pt-BR" data-scheme="${escapeHtml(theme.scheme)}">
<meta charset="utf-8">
<title>KaiaK</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<style>
  :root { color-scheme: ${escapeHtml(theme.color_scheme)}; }
  html, body { margin: 0; height: 100%; overflow: hidden; background: ${bg.gradient || bg.color || theme.bg}; }
  .art { position: fixed; inset: 0; display: flex; padding: 24px; box-sizing: border-box; }
</style>
<body>${artHtml(bg.image, art, theme)}</body>
</html>`;
}

module.exports = { renderStart, renderBoot, escapeHtml };
