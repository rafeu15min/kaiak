'use strict';
// Páginas internas sem ponte (erro, bloqueio): o main passa o tema em ?theme=<json>. Chaves desconhecidas e valores que
// não são texto são ignorados; sem tema (ou JSON ruim), valem as cores de fábrica do CSS (escuro).
const THEME_KEYS = { bg: '--bg', fg: '--fg', muted: '--muted', accent: '--accent', panel: '--panel', input: '--input', tab_active: '--tab-active', hover: '--hover' };

function applyQueryTheme() {
  let theme = {};
  try { theme = JSON.parse(new URLSearchParams(location.search).get('theme') ?? '{}'); } catch { return; }
  for (const [key, cssVar] of Object.entries(THEME_KEYS)) {
    if (typeof theme[key] === 'string') document.documentElement.style.setProperty(cssVar, theme[key]);
  }
  if (typeof theme.color_scheme === 'string') document.documentElement.style.colorScheme = theme.color_scheme;
  if (typeof theme.scheme === 'string') document.documentElement.dataset.scheme = theme.scheme;
  for (const [name, value] of Object.entries(theme.vars ?? {})) document.documentElement.style.setProperty(`--${name}`, String(value));
}
applyQueryTheme();
