'use strict';
// Catálogo de avisos: lugares, empilhamentos, tipos e estilos de fábrica.
// Um estilo é um TEMPLATE comum (um item de HTML com data-bind + CSS): o HTML próprio do usuário usa o
// mesmo formato, então a saída de emergência é a mesma porta que os modelos de fábrica já atravessam.
//   data-bind="title|text|label|level|more"  ->  (more = "+2": avisos escondidos, só com counter = true)
//    texto puro (textContent; nunca HTML: o nome de um arquivo baixado
//                                         vem do servidor)   data-action="dismiss" -> dispensa o item.
// Só nas bordas do navegador: 4 cantos e 4 meios de borda. Não existe centro (aviso no meio da tela atrapalha).
const PLACES = ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const STACKS = ['replace', 'down', 'up']; // replace: só o último | down: novo embaixo | up: novo em cima
const KINDS = ['download', 'alert']; // os tipos CONFIGURÁVEIS (k.notification.type)

// Alertas de SISTEMA (erro de config, falha ao baixar lista, lista velha): categoria à parte, fora da config.
// Não têm tipo, tempo nem superfície editáveis: ficam até dispensar, numa faixa fixa no topo, com cores fixas.
// Assim um kaiak.lua quebrado ou mal-intencionado nunca consegue esconder o próprio erro.
const SYSTEM_SURFACE = 'system';
const SYSTEM_SPEC = Object.freeze({
  place: 'top', style: 'strip', stack: 'down', offset: Object.freeze([0, 0]), close_all: true, counter: false, counter_format: '+%d',
});

const STYLES = {
  // Cartão compacto com a cor de destaque do tema na lateral.
  pill: {
    item: '<div class="pill"><div class="t" data-bind="title"></div><div class="s" data-bind="text"></div><span class="more" data-bind="more"></span></div>',
    width: 340, itemHeight: 64, gap: 8, pad: 0, max: 3,
    css: `
      #frame { display: flex; flex-direction: column; gap: 8px; }
      .pill { position: relative; box-sizing: border-box; height: 64px; padding: 9px 14px; border-radius: 10px; background: var(--bg, #1e1f24);
              border: 1px solid var(--border, #2b2d34); color: var(--fg, #d8dae0);
              box-shadow: inset 3px 0 0 var(--accent, #7aa2f7), 0 6px 18px rgba(0, 0, 0, .45); }
      .pill.level-error { box-shadow: inset 3px 0 0 #f7768e, 0 6px 18px rgba(0, 0, 0, .45); }
      .pill.level-warning { box-shadow: inset 3px 0 0 #e0af68, 0 6px 18px rgba(0, 0, 0, .45); }
      .pill .t { font-weight: 600; padding-right: 40px; }
      .pill .more { position: absolute; top: 8px; right: 10px; padding: 1px 7px; border-radius: 10px; font-size: 11px; font-weight: 700;
                    background: var(--accent, #7aa2f7); color: #1e1f24; }
      .more:empty { display: none; }
      .pill .t:empty { display: none; } /* alerta sem título: o texto sobe para a primeira linha */
      .pill .t:empty + .s { margin-top: 0; white-space: normal; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
      .pill .s { margin-top: 2px; color: var(--muted, #8a8d98); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    `,
  },
  // Faixa larga de linhas curtas, com cores FIXAS (precisa ser legível mesmo com um tema quebrado).
  strip: {
    item: '<div class="row"><span class="tag" data-bind="label"></span> <span data-bind="text"></span> <span class="more" data-bind="more"></span></div>',
    width: 'full', itemHeight: 18, gap: 0, pad: 14, max: 8,
    css: `
      #frame { display: flex; align-items: flex-start; height: 100%; box-sizing: border-box; background: #2a1519;
               color: #f2d4d8; border-bottom: 2px solid #f7768e; font: 13px ui-monospace, "JetBrains Mono", monospace; }
      #items { flex: 1; min-width: 0; padding: 6px 10px; max-height: 100%; overflow-y: auto; box-sizing: border-box; }
      .row { box-sizing: border-box; line-height: 18px; padding: 0; white-space: pre-wrap; word-break: break-word; } /* 18px = itemHeight */
      .tag { display: inline-block; min-width: 3.4em; font-weight: 700; }
      .row .more { margin-left: 8px; padding: 0 7px; border-radius: 9px; background: #4a2229; font-weight: 700; }
      .row .more:empty { display: none; }
      .level-error .tag { color: #f7768e; } .level-warning .tag { color: #e0af68; } .level-info .tag { color: #7aa2f7; }
      #close-all { margin: 4px 6px; border: 0; background: transparent; color: #f2d4d8; font-size: 16px; cursor: pointer; border-radius: 4px; }
      #close-all:hover { background: #4a2229; }
    `,
  },
  // Cartão maior e arejado: faixa de cor do nível no topo, título, até 2 linhas de texto e botão × em cada item.
  card: {
    item: '<div class="card"><div class="body"><div class="t" data-bind="title"></div><div class="s" data-bind="text"></div></div><span class="more" data-bind="more"></span><button class="x" data-action="dismiss" title="Dispensar">×</button></div>',
    width: 360, itemHeight: 84, gap: 10, pad: 0, max: 3,
    css: `
      #frame { display: flex; flex-direction: column; gap: 10px; }
      .card { position: relative; box-sizing: border-box; height: 84px; padding: 14px 40px 10px 16px; border-radius: 16px; overflow: hidden;
              background: var(--bg, #1e1f24); color: var(--fg, #d8dae0); border: 1px solid var(--border, #2b2d34);
              box-shadow: 0 10px 28px rgba(0, 0, 0, .5); }
      .card::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--accent, #7aa2f7); }
      .card.level-error::before { background: #f7768e; } .card.level-warning::before { background: #e0af68; }
      .card .t { font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .card .s { margin-top: 3px; color: var(--muted, #8a8d98); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .card .t:empty { display: none; }
      .card .t:empty + .s { margin-top: 0; color: var(--fg, #d8dae0); -webkit-line-clamp: 3; }
      .card .x { position: absolute; top: 10px; right: 8px; width: 22px; height: 22px; border: 0; border-radius: 50%; background: transparent;
                 color: var(--muted, #8a8d98); font-size: 16px; line-height: 20px; cursor: pointer; padding: 0; }
      .card .x:hover { background: var(--border, #2b2d34); color: var(--fg, #d8dae0); }
      .card .more { position: absolute; right: 12px; bottom: 9px; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 700;
                    background: var(--accent, #7aa2f7); color: #1e1f24; }
      .card .more:empty { display: none; }
      .card.undismissable .x { display: none; }
    `,
  },
  // Uma linha só, sem borda: bolinha do nível + título e texto. Para quem quer o aviso o mais discreto possível.
  minimal: {
    item: '<div class="min"><span class="dot"></span><span class="t" data-bind="title"></span><span class="s" data-bind="text"></span><span class="more" data-bind="more"></span></div>',
    width: 320, itemHeight: 32, gap: 6, pad: 0, max: 4,
    css: `
      #frame { display: flex; flex-direction: column; gap: 6px; }
      .min { box-sizing: border-box; height: 32px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-radius: 16px;
             background: color-mix(in srgb, var(--bg, #1e1f24) 88%, transparent); color: var(--fg, #d8dae0); white-space: nowrap; }
      .min .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--accent, #7aa2f7); }
      .min.level-error .dot { background: #f7768e; } .min.level-warning .dot { background: #e0af68; }
      .min .t { flex: none; font-weight: 600; }
      .min .t:empty { display: none; }
      .min .s { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--muted, #8a8d98); }
      .min .t:empty + .s { color: var(--fg, #d8dae0); }
      .min .more { flex: none; padding: 0 7px; border-radius: 9px; font-size: 11px; font-weight: 700; background: var(--accent, #7aa2f7); color: #1e1f24; }
      .min .more:empty { display: none; }
    `,
  },
};

module.exports = { PLACES, STACKS, KINDS, STYLES, SYSTEM_SURFACE, SYSTEM_SPEC };
