'use strict';
// Medição do custo de views extras (Portão 2 do plano). Electron independente, não usa o código do KaiaK.
// uso: electron views.js <N> <ui|blank|panel>
//   ui    : N views carregando ui/notify.html com o mesmo preload/sandbox das views de interface do KaiaK
//   blank : N views em about:blank
//   panel : N views de "painel web", cada uma com sessão (partition) própria, carregando uma página pequena
const { app, BaseWindow, WebContentsView } = require('electron');
const path = require('node:path');

const [rawCount, kind] = process.argv.slice(-2); // as flags do Electron (--user-data-dir) deslocam o resto
const count = Number(rawCount);
const PROTO = path.join(__dirname, '..', '..', 'proto-electron');
const PAGE = 'data:text/html,<body style="background:%23202228;color:%23ddd;font:14px sans-serif">pagina</body>';

// Variáveis de ambiente: VIEWS_ACTION = keep | hide | destroy (o que fazer com as views extras 14 s depois de abrir),
// VIEWS_ANIM = 1 (a 1ª view extra roda uma animação CSS contínua), VIEWS_PAGE = URL da página principal.
const action = process.env.VIEWS_ACTION ?? 'keep';
const animated = process.env.VIEWS_ANIM === '1';
const ANIM = 'data:text/html,<body style="margin:0;background:%23101418;overflow:hidden"><style>@keyframes m{from{transform:translateX(0) rotate(0)}to{transform:translateX(220px) rotate(360deg)}}div{position:absolute;width:40px;height:40px;background:linear-gradient(45deg,%23f7768e,%237aa2f7);animation:m 1.2s linear infinite alternate;will-change:transform}</style><div style="top:2px"></div><div style="top:12px;animation-duration:.9s"></div><div style="top:22px;animation-duration:1.7s"></div></body>';

function makeView(index) {
  const webPreferences = { sandbox: true, contextIsolation: true };
  if (kind === 'ui') webPreferences.preload = path.join(PROTO, 'src', 'preload.js');
  if (kind === 'panel') webPreferences.partition = `panel-${index}`;
  const view = new WebContentsView({ webPreferences });
  if (animated && index === 0) view.webContents.loadURL(ANIM);
  else if (kind === 'ui') view.webContents.loadFile(path.join(PROTO, 'ui', 'notify.html'));
  else view.webContents.loadURL(kind === 'blank' ? 'about:blank' : PAGE);
  return view;
}

app.whenReady().then(() => {
  const win = new BaseWindow({ width: 1000, height: 800 });
  const page = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } });
  page.webContents.loadURL(process.env.VIEWS_PAGE ?? PAGE);
  win.contentView.addChildView(page);
  page.setBounds({ x: 0, y: 0, width: 1000, height: 800 });
  const extras = [];
  for (let i = 0; i < count; i++) {
    const view = makeView(i);
    win.contentView.addChildView(view);
    view.setBounds({ x: 700, y: 40 + i * 20, width: 300, height: 60 }); // visíveis: views ocultas pagam menos
    extras.push(view);
  }
  if (action !== 'keep') {
    setTimeout(() => {
      extras.forEach((view) => win.contentView.removeChildView(view)); // hide: só sai da janela, a view continua viva
      if (action === 'destroy') extras.forEach((view) => view.webContents.close()); // destroy: encerra o renderizador
    }, 14000);
  }
  console.log(`pronto n=${count} kind=${kind}`);
});
