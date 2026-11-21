'use strict';
// Zoom da página: níveis configuráveis (em %), padrão do .lua, e memória por site (host http/https) em ~/.local/share/kaiak/zoom.json.
// Sem Electron: opera sobre webContents (getZoomFactor/setZoomFactor/on). A aba privada NUNCA grava nada em disco.
const { readJson, writeJsonAtomic } = require('./json-file');

const MAX_SITES = 2000;
const EPS = 0.001;
const toFactor = (percent) => percent / 100;
const toPercent = (factor) => Math.round(factor * 100);

// Só sites de verdade (http/https) têm memória; páginas internas e arquivos seguem o padrão.
function siteKey(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) ? u.hostname : null;
  } catch {
    return null;
  }
}

// config: { levels:[%], default:%, remember, notify }; file: caminho do JSON; notify: (texto) => void
function createZoom({ config, file, notify = () => {} }) {
  const levels = [...config.levels].sort((a, b) => a - b).map(toFactor);
  const base = toFactor(config.default);
  const sites = config.remember ? readJson(file, {}) : {};
  const saved = () => (sites !== null && typeof sites === 'object' ? sites : {});

  const remember = (key, factor) => {
    if (!config.remember || !key) return;
    const all = saved();
    if (Math.abs(factor - base) < EPS) delete all[key];
    else all[key] = factor;
    const keys = Object.keys(all);
    if (keys.length > MAX_SITES) delete all[keys[0]]; // o mais antigo sai
    try { writeJsonAtomic(file, all); } catch { /* sem disco, o zoom vale só nesta sessão */ }
  };

  const factorFor = (url) => {
    const key = siteKey(url);
    const stored = key ? saved()[key] : undefined;
    return typeof stored === 'number' && stored > 0.1 && stored < 6 ? stored : base;
  };

  function apply(wc, factor, { isPrivate }) {
    wc.setZoomFactor(factor);
    if (!isPrivate) remember(siteKey(wc.getURL()), factor);
    notify(`Zoom ${toPercent(factor)}%`);
  }

  // Próximo nível acima/abaixo do atual (se o atual está entre dois níveis, vai ao vizinho nessa direção). Nos extremos fica.
  function neighbor(current, direction) {
    const up = levels.find((level) => level > current + EPS);
    const down = [...levels].reverse().find((level) => level < current - EPS);
    return direction > 0 ? up ?? current : down ?? current;
  }

  return {
    step: (wc, direction, ctx = {}) => apply(wc, neighbor(wc.getZoomFactor(), direction), ctx),
    reset: (wc, ctx = {}) => apply(wc, base, ctx),
    // Liga uma aba: aplica o zoom guardado do site a cada navegação e trata Ctrl+scroll ('zoom-changed' do Chromium).
    attach(wc, { isPrivate = false } = {}) {
      wc.on('did-navigate', (_event, url) => wc.setZoomFactor(factorFor(url)));
      wc.on('zoom-changed', (_event, direction) => this.step(wc, direction === 'in' ? 1 : -1, { isPrivate }));
    },
    factorFor,
    levels,
  };
}

module.exports = { createZoom, siteKey, toFactor, toPercent, MAX_SITES };
