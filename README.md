# KaiaK — protótipos (ETAPA 1)

Dois protótipos mínimos do navegador pessoal KaiaK, com **o mesmo conjunto de funções**,
para comparar motores antes de escolher um:

| | Protótipo A | Protótipo B |
|---|---|---|
| Arquivo | `proto-qt/kaiak_qt.py` | `proto-gtk/kaiak_gtk.py` |
| Motor | Qt WebEngine (Chromium) via PySide6 | WebKitGTK 6.0 via GTK4 + PyGObject |
| Pacotes (Arch) | `pyside6`, `qt6-webengine` | `gtk4`, `webkitgtk-6.0`, `python-gobject` |

Use sempre `/usr/bin/python3` (o Python do sistema, onde estão PySide6 e PyGObject).

## Como rodar

```sh
# perfil temporário (recomendado para testes)
P=$(mktemp -d)
/usr/bin/python3 proto-qt/kaiak_qt.py   --profile-dir "$P" --discard-after 120 https://example.org
/usr/bin/python3 proto-gtk/kaiak_gtk.py --profile-dir "$P" --discard-after 120 https://example.org
```

Argumentos (iguais nos dois):

- `URL ...` — URLs iniciais, uma aba cada (a primeira fica ativa). Sem URL: `about:blank`.
- `--profile-dir DIR` — onde ficam cookies/cache. Padrão: `~/.local/share/kaiak-qt` ou
  `~/.local/share/kaiak-gtk`.
- `--discard-after SEG` — descarta abas em segundo plano após SEG segundos (padrão 120;
  `0` desliga).
- Só Qt: argumentos desconhecidos seguem para o `QApplication` (ex.: `--webEngineArgs ...`).

Nenhuma flag de ambiente foi necessária neste PC (Hyprland/Wayland, NVIDIA GTX 1660,
nvidia-open): o WebKitGTK renderizou sem `WEBKIT_DISABLE_DMABUF_RENDERER=1`. O Qt WebEngine
avisa `GBM is not supported ... Fallback to Vulkan rendering in Chromium` e funciona.

## O que os dois fazem

- Janela única; coluna vertical de abas à esquerda (42 px) com o favicon ou, sem favicon,
  a inicial do título; título completo no tooltip.
- Barra no topo: voltar, avançar, recarregar e endereço. Enter navega. Texto com esquema
  (`https://`, `about:`, `file:`, `data:`) vai direto; `dominio.tld` sem espaço ganha
  `https://`; o resto vira busca em `https://duckduckgo.com/?q=`.
- Atalhos: `Ctrl+T` nova aba, `Ctrl+W` fecha aba (a última fecha a janela), `Ctrl+L` foca o
  endereço, `Ctrl+Tab` / `Ctrl+Shift+Tab` próxima/anterior, `Alt+←` / `Alt+→` voltar/avançar.
- Rolagem estilo vim com o foco na página: `j`/`k` (60 px), `d`/`u` (meia tela), `g` (topo),
  `G` (fim). Ligada por padrão nos dois: é um script injetado num mundo JS isolado que
  ignora campos editáveis (input/textarea/select/contenteditable), teclas com
  Ctrl/Alt/Meta e eventos que a própria página já tratou (`defaultPrevented`).
- Descarte de abas em segundo plano:
  - Qt: `QWebEnginePage.setLifecycleState(Discarded)`; ao voltar, `Active` (o Qt recarrega).
  - GTK: não há equivalente. Guarda URL/título, encerra o WebProcess da aba
    (`terminate_web_process`) e destrói o `WebView`; ao selecionar a aba ele é recriado.
    O término explícito é necessário: medido no WebKitGTK 2.54, destruir o WebView
    **não** encerra o processo dele. Fechar aba (`Ctrl+W`) faz o mesmo.
  - Os dois registram `discard:` / `restore:` no stderr.

Fora de escopo (YAGNI): extensões, sync, painel lateral, Widevine, downloads, sessão salva,
links `target=_blank`/`window.open` (não abrem nada nos dois).

## Limitações conhecidas

- GTK: favicon em SVG não aparece (usa a propriedade `favicon`, depreciada no WebKitGTK
  2.54 em favor de `page-icons`, que só entrega bytes crus). Nesse caso aparece a inicial.
- GTK: processos que o WebKit cria ao navegar entre sites (troca de processo) continuam
  vivos depois que a aba fecha; só o processo atual da aba é encerrado. Considerar isso
  na medição de RAM.
- Qt: o processo principal ficou com cerca de 0,5 GB de RSS nos testes; não há processo de
  GPU separado (a GPU do Chromium roda dentro dele).

## proto-electron (Electron 45, Chromium)

Mesmo conjunto mínimo dos outros dois: trilho vertical de abas (42 px; ao passar o mouse expande
para 240 px por cima da página, com título e o X de fechar), barra de endereço, atalhos
(Ctrl+T, Ctrl+W, Ctrl+L, Ctrl+Tab, Ctrl+Shift+Tab, Alt+setas, F5/Ctrl+R), rolagem vim, descarte
de abas inativas, links de janela nova abrem em aba, política de WebRTC só por interface pública.
Ainda sem: bloqueio de cookies de terceiros, bloqueio de anúncios, extensões, DRM, senhas.

```
cd proto-electron && npm install && node node_modules/electron/install.js   # baixa o binário
node_modules/electron/dist/electron . --profile-dir "$(mktemp -d)" --discard-after 120 URL...
```

Estrutura (módulos pequenos, para a visão de editar o navegador por código; ver `ROADMAP.md`):
`src/layout.js` (geometria), `src/tabs.js` (abas e descarte), `src/shortcuts.js`, `src/privacy.js`,
`src/vim-scroll.js`, `src/main.js` (monta a janela), `ui/rail.*` e `ui/bar.*` (interface).
O trilho é uma view própria por cima da página, para expandir sem empurrar o conteúdo.

## Licença

Todos os direitos reservados.
