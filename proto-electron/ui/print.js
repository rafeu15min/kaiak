'use strict';
// Tela de impressão. O main manda o modelo (HTML + CSS, o padrão ou o do .lua) e os valores iniciais; aqui só se liga o que
// existir marcado com data-print="...". Enter salva, Esc fecha.
const part = (name) => document.querySelector(`[data-print="${name}"]`);
const FIELDS = ['page_size', 'landscape', 'margins', 'scale', 'pages', 'background'];

function fill(values) {
  FIELDS.forEach((name) => {
    const el = part(name);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = values[name];
    else el.value = String(values[name]);
  });
}

// Lê só os controles que existem; o main valida tudo de novo (nada daqui é confiável).
function collect() {
  const out = {};
  FIELDS.forEach((name) => {
    const el = part(name);
    if (!el) return;
    if (el.type === 'checkbox') out[name] = el.checked;
    else if (el.type === 'number') out[name] = Number(el.value);
    else out[name] = ['landscape'].includes(name) ? el.value === 'true' : el.value;
  });
  return out;
}

function wire(system) {
  part('save')?.addEventListener('click', () => window.kaiak.send('print:save', collect()));
  part('close')?.addEventListener('click', () => window.kaiak.send('print:close'));
  const sys = part('system');
  if (sys) {
    sys.disabled = !system;
    if (!system) sys.title = 'Nenhuma impressora disponível neste sistema';
    sys.addEventListener('click', () => window.kaiak.send('print:system', collect()));
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') window.kaiak.send('print:close');
    if (event.key === 'Enter' && event.target.tagName !== 'BUTTON') window.kaiak.send('print:save', collect());
  });
}

window.kaiak.on('config', applyTheme);
window.kaiak.on('print:template', ({ html, css, values, system }) => {
  document.getElementById('print-css').textContent = css; // o modelo vem do .lua (do dono)
  document.getElementById('root').innerHTML = html;
  fill(values);
  wire(system);
  (part('save') ?? part('page_size'))?.focus();
});
