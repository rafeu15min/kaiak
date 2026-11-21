'use strict';
// Aplica tema e medidas da config às variáveis CSS da página (rail e bar compartilham).
const THEME_VARS = {
  bg: '--bg', fg: '--fg', muted: '--muted', accent: '--accent',
  panel: '--panel', border: '--border', input: '--input', tab_active: '--tab-active', tab_icon: '--tab-icon', hover: '--hover', disabled: '--disabled', private: '--private', private_bg: '--private-bg', private_tab: '--private-tab', font: '--font',
};

let slotBg = null; // fundo próprio do slot (k.layout{ bg }): vale por cima do --bg do tema, também depois de uma troca de tema
let customVars = []; // variáveis --nome do tema anterior (saem quando o tema troca)
function applyTheme(config) {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(THEME_VARS)) root.style.setProperty(cssVar, config.theme[key]);
  root.style.colorScheme = config.theme.color_scheme; // barras de rolagem e campos nativos acompanham (dark | light)
  root.dataset.scheme = config.theme.scheme; // nome livre do dono: [data-scheme="noite"] no CSS próprio
  customVars.forEach((name) => root.style.removeProperty(name));
  customVars = Object.keys(config.theme.vars).map((name) => `--${name}`);
  Object.entries(config.theme.vars).forEach(([name, value]) => root.style.setProperty(`--${name}`, value));
  if (slotBg) root.style.setProperty('--bg', slotBg);
}

// O main avisa onde este slot mora (place) e as espessuras em px (a config aceita "%"): o CSS se adapta à borda.
function applySlot(info) {
  const root = document.documentElement;
  root.dataset.place = info.place;
  slotBg = info.bg;
  if (slotBg) root.style.setProperty('--bg', slotBg);
  root.style.setProperty('--thick-closed', `${info.size}px`);
  root.style.setProperty('--thick-open', `${info.expand ?? info.size}px`);
}
window.kaiak.on('slot', applySlot);
window.kaiak.on('theme', (theme) => applyTheme({ theme })); // troca de tema em execução (k.theme.set / toggle_theme)
