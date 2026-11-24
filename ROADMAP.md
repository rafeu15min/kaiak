# KaiaK — Roadmap

Registro de planos. O que está aqui NÃO está em andamento, a não ser que diga "em andamento".

## Em andamento
- Protótipo Electron (`proto-electron/`): abas verticais de 42 px que expandem ao passar o mouse,
  barra de endereço, atalhos, descarte de abas, rolagem vim, política de WebRTC.
  Motivo: Qt WebEngine e WebKitGTK ficam em 60 fps neste monitor de 144 Hz (bugs abertos no
  motor); Electron (Chromium) chega a ~143 fps (ver `bench/` e a skill do projeto).

## Visão de longo prazo (decidida pelo usuário em 18/11/2026; não fazer agora)
**Edição visual do navegador por código, "como o Hyprland, mas navegador".**
Todo o shell (layout, trilho de abas, painéis, barras, atalhos, temas, comportamentos) definido
por código/configuração do próprio usuário e recarregável ao vivo, sem tela de configurações.
Mudar o navegador = editar texto.

Cuidados para não fechar essa porta enquanto o resto é construído:
- manter o shell em módulos pequenos com interfaces estreitas (já separado em layout, tabs,
  atalhos, privacidade);
- manter a interface em HTML/CSS/JS recarregável por view;
- concentrar geometria, atalhos e comportamentos em um lugar só (dados ou funções), sem espalhar.

## Pendências do protótipo (ordem sugerida)
1. (feito em 18/11) Smoke test visual do Electron, probe de fps e RAM ociosa: ~142 fps (p50 7 ms),
   350 MiB PSS ocioso com 1 aba. Falta: comparar RAM com várias abas (Fase B) e com o Qt/GTK.
2. Privacidade: bloqueio de cookies de terceiros (hoje só WebRTC) e, como objetivo, bloqueio de
   anúncios e rastreadores.
3. Extensões (Electron: subconjunto das APIs do Chrome; MV3 ainda sem verificação aqui).
4. Preenchimento de senhas via KeePassXC (Secret Service), sem enviar o formulário.
5. DRM (Widevine): fora de prioridade; Electron oficial não traz o CDM (a verificar).
6. Benchmarks futuros: dividir os navegadores em grupos, um grupo por janela de cota de tokens
   (reinício às 00:50 e a cada 5 h); mais execuções; quadros perdidos; abas em segundo plano.
7. Escolher a linguagem final (Rust só faz sentido com WebKitGTK; com Electron é JavaScript).

---

## Plano: shell programável em Lua, rápido por construção (18/11/2026)

Decisão do usuário: layouts, atalhos, temas e backgrounds definidos **por código**, em Lua ou
linguagem parecida, "como o Hyprland, mas navegador". Fato verificado: o Hyprland dele já usa
Lua (`~/.config/hypr/hyprland.lua`, API `hl.*`), então o KaiaK segue o mesmo estilo (`kaiak.*`).
Opção de motor Lua no Electron encontrada: `wasmoon` (Lua 5.4 oficial compilado para WebAssembly,
v1.15.0, última publicação há ~7 meses); alternativa `fengari` (Lua reescrito em JS). **Custo real
de ambos ainda não medido** (primeiro portão abaixo).

### Princípios para ser rápido (o Lua nunca fica no caminho quente)
1. Quem desenha é o Chromium. O Lua só roda em eventos discretos (tecla, aba criada, recarga).
2. A configuração é avaliada uma vez e vira **dados** (retângulos de layout, variáveis CSS,
   tabela de teclas). Nada de callback Lua por quadro ou por movimento de mouse.
3. Tema e background rodam no compositor (CSS/GPU). Background ESTÁTICO (cor, gradiente, imagem) é o foco. Animação é
   uma possibilidade OPCIONAL para o usuário (decisão em 18/11: o dono não vai usar; não é requisito nem prioridade):
   se existir, fica desligada por padrão, pausa com a janela oculta e tem o custo medido (~9% de um núcleo por view animando).
4. Interface em JS puro, sem framework; poucas views; descarte de abas (já existe).
5. Recarga ao vivo só em modo de desenvolvimento.
6. Cada fase tem orçamento medido com as ferramentas que já temos (probe de fps, PSS, tempo).

### Linha de base medida (proto-electron, 18/11)
~142 fps (p50 7 ms), 350 MiB PSS ocioso com 1 aba (9 processos; Electron puro sem shell 248 MiB),
1,7 s de CPU por 5 s de animação, sandbox ligado.
**Orçamentos propostos (a validar):** carregar a config < 50 ms; ação por tecla < 5 ms; RAM ociosa
com Lua < linha de base + 40 MiB; fps com tema estático = sem queda; (se houver animação opcional: meta < 10% de
um núcleo, sem garantia); nenhum travamento do processo principal por código do usuário.

### Fases (ordem de desenvolvimento)
0. **Feita.** Protótipo Electron e medições.
1. **Modelo de dados em JS, ainda sem Lua.** Mover geometria, tempos, atalhos e cores para uma
   configuração declarativa (`default`), com atalho = tabela `tecla -> ação`, e um barramento de
   eventos (`tab.created`, `key`, `nav`...). Motivo: desenhar a API estável **antes** de ligar a
   linguagem; o Lua só a espelha. Carregador de config do usuário com erro seguro (cai no padrão).
2. **Lua embutido.** Carregar `~/.config/kaiak/kaiak.lua` com `kaiak.config{}`, `kaiak.bind()`,
   `kaiak.on()`, `kaiak.theme{}`; biblioteca padrão restrita (sem `os`/`io` por padrão, opt-in).
   **Portão 1:** medir custo de partida, memória e latência de tecla (wasmoon x fengari). Se
   estourar o orçamento: Lua em worker/utilityProcess, ou DSL em JS, ou módulo nativo.
   Inclui arquivos de tipos para o lua-language-server (autocompletar).
3. **Tema e backgrounds.** Variáveis CSS vindas do Lua, CSS próprio do usuário, background
   (cor, gradiente, imagem com blur; canvas/shader/animação só como extra opcional e por último), com orçamento de CPU/GPU.
4. **Motor de layout.** O Lua declara *slots* (trilho à esquerda/direita/topo, barra, painéis,
   modo sobreposição ou empurrando, auto-ocultar); o processo principal calcula os retângulos
   nativamente e cria uma view por slot, com HTML opcional por slot. **Portão 2:** custo de N views
   (MEDIDO em 18/11: ~11 MiB por view de interface, ver "Portão 2 — resultado"; a estimativa antiga de ~100 MiB para 2 views estava errada).
5. **Ferramentas (recarga ao vivo agora é opcional).** Sobreposição de erros, modo seguro
   (`--safe`), validação com mensagem clara, `kaiak --check`, config versionada em git. Recarga ao
   vivo só se o custo de reiniciar incomodar.
6. **Trilha paralela (viram opções da config a partir da fase 2):** bloqueio de cookies de
   terceiros, bloqueio de anúncios e rastreadores, extensões, senhas via KeePassXC, DRM.
7. **Estabilizar.** Congelar a API `kaiak.*`, documentar, empacotar. **Portão 3:** se o peso do
   Electron (base ~250 MiB + shell) não couber no orçamento, avaliar um hospedeiro Chromium mais
   fino (CEF) com Lua nativo; só então.

### Esboço da API (proposta, não implementada)
```lua
kaiak.config{ rail = { side = "left", width = 42, hover_width = 240 } }
kaiak.bind("ctrl+t", kaiak.dsp.new_tab())
kaiak.bind("ctrl+shift+d", function() kaiak.tabs.open("https://duckduckgo.com") end)
kaiak.theme{ bg = "#1e1f24", accent = "#7aa2f7",
             background = kaiak.bg.image("~/Imagens/wall.jpg", { blur = 6 }) }
kaiak.on("tab.created", function(tab) end)
```

### Riscos
- Código do usuário roda no processo principal (como um `hyprland.lua`): confiança total; um laço
  infinito travaria o navegador, daí o Portão 1 (isolamento/limite).
- Wasmoon com manutenção moderada; plano B documentado.
- O motor de layout (fase 4) é a parte mais difícil; por isso vem depois de tema e atalhos.

### Desenho do arquivo único (acordado em 18/11/2026)
- Um arquivo, `$XDG_CONFIG_HOME/kaiak/kaiak.lua` (`--config` troca). **Opcional**: sem ele vale o
  padrão embutido; na primeira execução o KaiaK grava um modelo completo e comentado.
- Layout, tema e background são tabelas de dados; atalhos são `k.bind("ctrl+t", "new_tab")` (texto
  como no `hl.bind`) ou uma função; reações são `k.on(evento, fn)`. CSS/HTML/shader próprios vão
  dentro do arquivo, em strings longas `[[ ... ]]`. Dividir em vários arquivos é opcional, com o
  `require` normal do Lua apontando para a pasta da config.
- **Roda uma vez na partida.** Os `k.*` só registram dados; o JS aplica. Consequência: se o arquivo
  não registrar nenhuma função (só ações nomeadas e dados), a VM Lua é **liberada** depois da
  partida (custo zero em execução). Se registrar funções (`k.bind` com função, `k.on`), a VM fica
  residente, só para chamá-las em eventos, sem reavaliar o arquivo.
- Erro no arquivo: abre com o padrão, mostra o erro; `--safe` ignora a config.

### Estado das fases
- Fase 1 em andamento: `config.js` (padrão + mesclagem + validação), `keymap.js` (atalhos por
  tabela, texto -> ação ou função), `actions.js` (ações nomeadas), geometria e tema vindos da config.
  Sem barramento de eventos ainda (entra na fase 2, junto do `k.on`, para não ser especulativo).

### Erros de configuração (requisito do usuário, 18/11/2026; implementar junto da fase 2)
Comportamento "como o Hyprland": se a config nova tiver erro, o KaiaK **abre com a última versão
estável** e **aponta os erros numa faixa no topo da tela renderizada**.
- Última estável: após uma partida sem erros, o KaiaK guarda uma cópia validada da config em
  `$XDG_STATE_HOME/kaiak/last-good/` (o arquivo do usuário nunca é sobrescrito). Erro de sintaxe,
  de execução ou de validação => carrega a cópia; sem cópia (primeira vez) => padrão embutido.
- A faixa é uma view própria acima da página (não depende do Lua), com arquivo:linha: mensagem,
  botão de dispensar e atalho para abrir o arquivo no editor. Avisos de validação (valor fora de
  faixa, ação desconhecida) já existem na fase 1 como `warnings` e só vão para o stderr: ligar
  à faixa é o primeiro passo.
- `--safe` continua ignorando a config; `kaiak --check` valida sem abrir janela.

### Tela de boot (splash) personalizável (pedido do usuário, 18/11/2026; fase 3, não fazer agora)
A tela exibida enquanto o KaiaK inicia deve ser trocável pela config, por código, como o resto
do tema (`k.boot{...}`): cor/gradiente, imagem, animação CSS, HTML próprio em string longa
`[[ ... ]]`, ou desligada (`k.boot{ enabled = false }`).
Pontos de desenho:
- **Tem de existir antes do Lua.** A janela e o splash sobem primeiro; a VM Lua e a config carregam
  por trás. Por isso o splash lê um trecho mínimo, estático, da config (último estável em cache,
  ex. `last-good/boot.json`), e não depende de rodar o `kaiak.lua`. Na primeira execução vale o
  splash padrão embutido.
- **Orçamento próprio:** o splash não pode atrasar a partida. Só CSS/HTML leves, sem rede, e some
  assim que a primeira aba termina de carregar (ou após um tempo máximo). Animação pausa ao ocultar.
- **Erro na config:** usa o último estável (mesma regra da faixa de erros); o splash padrão nunca falha.
- Medir o tempo da janela visível (primeiro quadro) com e sem splash personalizado.

### Portão 1 — resultado (18/11/2026, medido em Electron 45 como node; scripts em `bench/lua/`)
Config de ~10 linhas + 40 `k.bind`; 20 000 chamadas de função Lua; 3 rodadas cada (estáveis).

| | wasmoon 1.16.0 (Lua 5.4, WASM) | fengari 0.1.5 (Lua 5.3, JS) |
|---|---|---|
| criar a VM | 15-20 ms | 27 ms |
| rodar a config | ~7 ms | ~6,5 ms |
| RAM extra | ~11-12 MB | ~7-8 MB |
| chamada de função (p50 / p99) | 2,8 / 12-14 µs | 1,1 / 5-6 µs |
| laço de 1 milhão de somas | 8 ms | 60-64 ms |
| interromper laço infinito | **não** (travou até o `timeout` externo) | **sim** (gancho de contagem, abortou em 201 ms) |
| memória após fechar a VM | não voltou (+0,6 MB) | não medido |

Todos os orçamentos do plano passam com folga nos dois (config < 50 ms, tecla < 5 ms, RAM < +40 MB).
**Decisão: fengari.** O trabalho do Lua aqui é minúsculo (registrar dados, tratar uma tecla), onde a
velocidade bruta do wasmoon não aparece; já a capacidade de **abortar código do usuário que não
termina** (config com laço infinito, `k.bind` travado) é requisito para o navegador sempre abrir, e
só o fengari tem. Contras aceitos: Lua 5.3 (sem `goto` novo/inteiros 5.4 de nicho), laço pesado ~8x
mais lento (irrelevante para configuração), pacote pouco atualizado (data da última publicação não
verificada). Plano B: wasmoon em `utilityProcess` descartável (mata o processo se travar).
Ainda não medido: liberar a VM de fato após a partida (fengari) e o custo dentro do app real.

### Botões do navegador por código (pedido do usuário, 18/11/2026; encaixa na fase 4)
O usuário quer adicionar botões à interface do KaiaK pela config: nova aba, configurações, senhas,
cookies etc. Desenho proposto:
- **Botões como dados:** `k.button{ id = "cookies", icon = "🍪", tooltip = "Cookies", slot = "bar.right",
  action = "open_cookies" | function() ... end }`. O `slot` diz onde (barra à esquerda/direita, trilho
  topo/base, painel). A barra padrão passa a ser montada a partir da mesma lista (voltar, avançar,
  recarregar, endereço viram itens da lista padrão e podem ser removidos, reordenados ou trocados).
- **Ações nomeadas ampliadas:** `new_tab`, `open_settings`, `open_passwords`, `open_cookies`... Cada
  uma abre um painel/página interna (`kaiak://cookies`) ou chama função do usuário.
- **Páginas internas** (`kaiak://`) são HTML da própria interface; o gerenciador de cookies pode usar
  `session.cookies` do Electron (listar/apagar por site). Senhas dependem da trilha KeePassXC.
- Ícone: emoji/texto, SVG em string ou caminho de imagem (sem rede). Estado visual por evento
  (`k.on("tab.changed", ...)` poderia pintar um botão), mantendo o Lua fora do caminho quente.
- Orçamento: nenhuma view nova por botão (todos na mesma view da barra).

### Segurança e velocidade — resultado (18/11/2026; scripts em `bench/security/`)
Implementado em `src/security.js`, tudo configurável por `k.security{...}` (padrões seguros):
- **Cookies de terceiros bloqueados** (sem `Cookie` na saída e sem `Set-Cookie` na entrada quando o
  site do pedido difere do da página). Prova no Chromium com dois "sites" locais: com o bloqueio
  desligado o cookie `rastreio=abc123` voltou; com o padrão, não. "Mesmo site" é aproximação (2 rótulos,
  3 em co.uk/com.br); sem lista de sufixos públicos, domínios raros podem errar.
- **HTTPS-only:** `http://` público vira `https://` (testado: example.org). Rede local (localhost,
  10/8, 172.16/12, 192.168/16, 100.64/10 do Tailscale, nomes sem ponto, .local) e `httpsExceptions`
  ficam em http. Não há página de fallback: site que só serve http falha até entrar em `httpsExceptions`.
- **Sinal GPC/DNT** enviado; **Referer** de terceiros só com a origem (já é o padrão do Chromium
  `strict-origin-when-cross-origin`, então o ganho extra não foi medido).
- **Permissões negadas por padrão** (só `fullscreen` e `clipboard-sanitized-write`); câmera/mic/localização
  exigem `permissions` na config. Ainda não há pergunta por site.
- **Páginas só navegam para http/https/about** (sem file:, javascript:, chrome:); links de janela nova idem.
- **Achado de privacidade:** o Electron baixava sozinho o dicionário ortográfico (`pt-br-3-0.bdic`) de
  `redirector.gvt1.com` (Google), mesmo com o corretor off nas páginas. Corrigido com
  `setSpellCheckerEnabled(false)` + idiomas vazios: de 3 conexões externas ociosas para **0**
  (confirmado por `ss` e pelo log de rede `--log-net-log`), PSS 362 -> 358 MiB.
- **Velocidade:** opções do Chromium (`--disable-background-networking`, `--disable-component-update`,
  `--no-pings`, `--disable-domain-reliability`, `--disable-features=MediaRouter,...`) foram medidas
  (3 rodadas): 360-362 MiB nos dois casos e as mesmas 3 conexões => **nenhum ganho, não adotadas**.
  Os ganhos reais de velocidade vêm do descarte de abas, do sandbox ligado e da interface sem framework.
- Não feito: bloqueio de anúncios/rastreadores (lista de filtros), pergunta de permissão por site,
  Safe Browsing (o Chromium do Electron não o inclui), atualizações do Electron (a vigiar).

### Limites da segurança — atualização (18/11/2026)
- **"Mesmo site" agora usa a Public Suffix List** (`data/public_suffix_list.dat`, 342 KB, versão
  2026-11-17, 10 463 regras, MPL-2.0; leitor em `src/psl.js`, sem dependência nova; atualizar com
  `npm run psl`). Cobre curinga/exceção (`*.ck`, `!www.ck`), seção privada (dois inquilinos de
  `github.io` são sites diferentes) e domínios internacionais. Custo: carga 16 ms na partida, ~2 us
  por consulta. Se o arquivo faltar, cai em 2 rótulos e avisa.
- **Referer medido, a opção vale:** o Chromium já corta para a origem por padrão, mas uma página
  com `Referrer-Policy: unsafe-url` manda a URL inteira para terceiros. Teste local (página com
  `?q=segredo`): com `trimReferrer = false` o terceiro recebeu `http://localhost:8201/pagina?q=segredo`;
  com o padrão recebeu só `http://localhost:8201/`. Ressalva: testado com uma política de página
  só (`unsafe-url`), não com todas.
- **Safe Browsing:** sai de brinde com o bloqueio de anúncios (lista local de domínios maliciosos).
- **Aviso de HTTPS e pergunta de permissão por site:** só por config no `.lua` (decisão do usuário),
  sem interface por enquanto.

### Bloqueio de anúncios, rastreadores e malware — resultado (18/11/2026)
Implementado em `src/blocklist.js`, configurável por `k.blocking{ enabled, ads, malware, allow, block }`.
- **Por domínio** (formato hosts): bloqueia o domínio e seus subdomínios. Ordem de decisão: `allow`
  vence tudo > `block` do usuário (tudo, inclusive navegar) > malware (tudo, inclusive navegar) >
  anúncios (só subrecursos de OUTRO site, pela PSL; navegar direto ou estar no próprio site passa).
- **Listas** (`npm run blocklists`, em `data/blocklists/`, fora do git): StevenBlack unified (MIT,
  76 104 domínios, de 15/11) para anúncios e rastreadores; `urlhaus-filter-hosts-online` do
  malware-filter (573 domínios, atualizada em 18/11, renova a cada 12 h) para malware/phishing, que
  faz o papel do Safe Browsing sem mandar nada ao Google.
- **Achado:** o abuse.ch desligou os downloads sem chave do URLhaus em ~21/10/2026 (HTTP 410); o
  acesso direto agora exige chave gratuita só para uso não comercial. Não criei conta/chave; uso o
  mirror do malware-filter. Lista DandelionSprout (13 mil linhas) descartada: inclui TLDs inteiros,
  risco de falso positivo.
- **Provado no Chromium** (log de rede + CDP): `doubleclick.net`, `googleadservices.com` e um
  domínio do `block` do usuário (em iframe) falham com `net::ERR_BLOCKED_BY_CLIENT`; com
  `enabled = false` os mesmos pedidos saem. O controle (`example.com`) passa nos dois casos.
- **Custo:** parse de 76 104 domínios ~62 ms na partida; heap +4,8 MiB (RSS +~20 MiB medido, em parte
  transitório); decisão por pedido ~4 us bloqueando e ~1 us liberando.
- **Limites:** só domínio inteiro (sem regras de caminho nem filtros cosméticos: anúncios de
  YouTube/Google na própria página não saem); WebSocket não passa pelo filtro; sem página própria
  de bloqueio (aparece o erro do Chromium); as listas NÃO se atualizam sozinhas (a de malware muda a
  cada 12 h): falta atualização automática; falso positivo da StevenBlack se resolve com `allow`.
- **Não testado ao vivo:** `allow` (só em teste unitário) e a faixa de aviso quando as listas faltam.

### Busca, DevTools, navegação anônima e limites do bloqueio — resultado (18/11/2026)
Tudo configurável no `kaiak.lua`; modelo comentado atualizado. 75 testes passando.
- **Busca** (`k.search{ default, engines }`): padrão trocável; palavra-atalho na barra (`yt lofi`,
  `w linux`); `false` remove um mecanismo; inválido gera aviso. Provado na tela: texto comum e `l ...`
  foram para os mecanismos certos. Correção de passagem: `localhost:3000` e `192.168.x.x` vão em
  `http://` (antes viravam busca ou https).
- **DevTools** (`k.devtools{ enabled, mode = right|bottom|detach, size }`): `right` e `bottom`
  embutidas numa view própria (`setDevToolsWebContents`), `detach` em janela separada, `enabled=false`
  desativa. Provado: right e bottom na tela, detach e enabled=false por contagem de alvos. Ctrl+Shift+I
  vem do teclado real; **F12 só foi provado com tecla injetada pelo CDP** (a ferramenta de teste não
  entrega F12). Embutida vale para UMA aba: trocar de aba a fecha. Bug achado no teste: sem passar o
  modo ao `openDevTools`, o `bottom` desenhava a DevTools só na metade direita.
- **Navegação anônima** (Ctrl+Shift+N, ou `k.tabs.open(url, true)`): partição em memória
  (`kaiak-private`, sem `persist:`), apagada quando a ÚLTIMA aba privada fecha; mesmas regras de
  segurança e bloqueio; selo roxo "Privada", barra e aba coloridas; links abertos de uma privada
  continuam privados. Provado com servidor de cookie: privada não vê o cookie da normal, as privadas
  compartilham jar entre si, a jar some ao fechar a última, a normal não é tocada, e 0 itens foram
  gravados em disco. Limites: não esconde seu IP; ainda não existe histórico, então nada a "não gravar";
  descartar uma aba privada mantém a sessão (só fechar a última apaga).
- **Bloqueio, limites tratados:** (1) WebSocket passa pelo filtro (provado por log de rede);
  (2) página própria de bloqueio (`ui/blocked.html`) mostra domínio, motivo e a linha para liberar, sem botão
  de "continuar" (decisão do usuário: liberar é só por config); a barra mantém a URL digitada;
  (3) atualização automática: `updateHours` (padrão 12), 5 s após abrir e a cada hora, download para
  `~/.local/share/kaiak/blocklists` (`--data-dir`), recusa lista vazia/pequena e erro HTTP (mantém a
  boa), troca no bloqueador sem reiniciar; provado de ponta a ponta com pasta vazia; aviso quando a
  lista falta ou tem mais de 7 dias; (4) `allow` provado ao vivo.
  Continua sendo bloqueio por DOMÍNIO inteiro: sem regras de caminho nem filtros cosméticos (anúncio
  do YouTube dentro da página não sai). Se isso incomodar, a opção é adotar uma biblioteca de filtros
  ABP (ex.: `@ghostery/adblocker`), que traz dependência e RAM; não medido.
- **Privacidade da atualização:** é a única conexão de saída do próprio navegador sem você pedir: GitHub
  (raw.githubusercontent.com) e GitLab Pages, com o agente `KaiaK-blocklist-updater`, até a cada 12 h.
  `updateHours = 0` desliga.
- **Faltou:** o aviso "baixando em segundo plano" continua na faixa depois que o download termina;
  a faixa não se atualiza sozinha.

- **Tema da aba privada (18/11):** `k.theme{ private, privateBg, privateLabel }` (destaque, fundo da barra
  com uma aba privada ativa, texto do selo). Provado na tela com vermelho e "Anônima". A aba na trilha
  usa o `private` com 16% de mistura sobre o fundo; não há cor separada para o fundo dela.

### Downloads, avisos passageiros e tela de erro — resultado (18/11/2026)
- **Downloads sem diálogo** (`src/downloads.js`): o arquivo vai direto para `k.downloads{ dir }` (vazio = pasta
  de Downloads do sistema; `~/` vale), com nome seguro (sem `../`, sem pontos iniciais) e sem sobrescrever
  (`arquivo (1).bin`). Antes o Electron abria o diálogo nativo de "salvar como". Provado: duas abas baixando
  o mesmo arquivo geraram `arquivo.bin` e `arquivo (1).bin`.
- **Aviso passageiro** (`k.popups{ downloadMs = 1000, noticeMs = 1000 }`, 0 = não mostrar): aparece ao
  começar e ao terminar o download, no canto inferior direito, e some. Medido pelo log do processo
  principal: ficou 1002 ms na tela. Visto na tela: "Download concluído / arquivo.bin".
  Bug achado no teste: o aviso era posicionado com o tamanho INICIAL da janela (1920x1080); o Hyprland a
  encaixou depois em 1896x1010 e o aviso ficou fora da área visível. Corrigido reposicionando no `resize`.
  Vale para qualquer overlay novo: sempre recalcular os limites no `resize`.
- **O aviso "lista ausente: baixando em segundo plano"** segue a mesma regra (`noticeMs`): aparece e some
  sozinho (medido: t=0,1 s aparece, t=1,0 s some). Só o informativo é passageiro; o que pede ação do
  usuário (falha ao baixar, lista com mais de 7 dias, `updateHours = 0`) fica até ser dispensado.
- **Tela de erro padrão** (`ui/error.html`): troca o erro do Chromium por uma página com o motivo em
  português, o código técnico, "Tentar de novo" e "Voltar"; se o só-HTTPS promoveu o endereço, mostra a
  linha `k.security { httpsExceptions = { "host" } }` para liberar. Provado na tela com um domínio
  inexistente. O endereço da aba passa a acompanhar uma navegação que falhou.
- **Atualização das listas só no boot** (decisão do usuário): uma verificação 5 s depois de abrir.
  A faixa de avisos agora se atualiza (some quando a lista chega). **Cor de fundo da aba privada:** `theme.privateTab`.
- 83 testes passando. **Ainda não feito desta rodada:** DevTools por aba (1.3), Referer com as outras
  políticas (1.4), popups invasivos (1.5), melhorias da anônima (1.8) e a interface de cookies (1.9).

- **Alertas não são downloads (18/11, decisão do usuário):** o aviso "lista ausente: baixando em segundo
  plano" é um ALERTA, com regra própria e editável, separada da dos downloads:
  `k.popups{ downloadMs = 1000, alertMs = 1000 }` (0 = não mostrar). Antes se chamava `noticeMs`; renomeado
  para o vocabulário do usuário. Provado com a linha do tempo da faixa: `downloadMs = 0, alertMs = 1000` ->
  alerta aparece em t=0,1 s e some em t=1,0 s; `alertMs = 0` -> nenhum alerta; `alertMs = 3000` -> some em
  t=3,0 s. O alerta fica na faixa do topo; o popup de download, no canto inferior direito.

### Motor de avisos, passo 1 (18/11/2026) — feito
Os dois avisos fixos (faixa do topo e popup de download) viraram instâncias de um mecanismo só:
**tipo -> rota -> superfície**. 106 testes passando; o padrão se comporta como antes.
- **Tipos:** `download` e `alert` (a regra de tempo de cada um segue em `k.popups{ downloadMs, alertMs }`;
  alerta que pede ação do usuário é `sticky`, fica até dispensar).
- **Superfícies** (`k.surface(nome, { place, style, stack, offset, max, closeAll, html, css })`): 7 lugares
  (top, top-left, top-right, bottom, bottom-left, bottom-right, center), 2 estilos de fábrica (`pill`,
  `strip`), 3 empilhamentos (`replace`, `down`, `up`). Superfícies novas valem; `k.route{ download = "x",
  alert = false }` liga tipo a superfície (false = não mostrar).
- **Estilos de fábrica são templates comuns** (HTML de um item com `data-bind` + CSS): o HTML próprio do
  usuário usa o mesmo formato, então a saída de emergência já nasce provada. Textos entram por
  `textContent`; CSP sem script inline.
- **Posição é função pura** (`notify-layout.js`), relativa à área da página, recalculada no `resize`.
- **View por superfície, criada só no primeiro aviso** (`notifier.js` não conhece o Electron; testado com
  host e timers falsos).
- **Provas ao vivo:** (1) regressão: alerta some em ~1 s (e 3 s se configurado), `alertMs = 0` não cria view
  nenhuma; download: toast 1005 ms e strip 1001 ms; popup padrão visto no canto; (2) novo: popup movido para
  o canto superior direito, `stack = "down"`, `max = 3`, HTML e CSS próprios, visto na tela; (3) segurança:
  `<img src=x onerror=alert(1)>` como texto de aviso aparece LITERAL (0 `<img>`, 0 script, sem execução);
  (4) botão × (dispensar tudo) dispensa a faixa e o popup continua; (5) **RAM ociosa: 368-371 MiB / 10
  processos antes, 357-360 MiB / 9 depois** (3 rodadas), porque a faixa deixou de ser criada na partida.
- **Bug achado no teste:** a faixa tinha 2 px de sobra (linha de 20 px contra os 18 px do cálculo) e
  mostrava uma barra de rolagem; corrigido fixando `line-height: 18px`.
- **Limites conhecidos:** duas superfícies no mesmo lugar se sobrepõem (ex.: toast em `top-right` por cima da
  faixa do topo; nada reposiciona); o `offset` é ignorado no eixo centralizado; `k.notify` e
  `k.on("notify")` ainda não existem (passo 2); `presets`, mais estilos, animações e progresso do
  download (passos 2 e 3); superfícies embutidas na barra/trilha dependem do motor de layout (passo 4).

## FILA — o que falta terminar, em ordem (18/11/2026)
É só uma fila de trabalho (sem datas nem horários; o usuário pediu "colocar na fila", não uma agenda). Cada item só
começa depois de o anterior estar commitado e provado.

**A. Avisos, passo 2** (motor já existe)
1. ~~Mais estilos de fábrica: `card`, `minimal`~~ **FEITO (18/11)** (`progress` fica no passo 3). Catálogo atual:
   `pill` (compacto), `card` (84 px, faixa de cor no topo, × por item), `minimal` (1 linha de 32 px), `strip`
   (faixa larga). Vistos na tela: card no canto inferior direito (2 itens + selo "+4"), minimal no superior direito.
2. Animações CSS (nenhuma, desvanecer, deslizar, saltar; respeita "reduzir movimento").
3. Presets: `discreto` (padrão), `classico`, `silencioso`, `chamativo`.
4. `k.notify{}` (avisos gerados pelo Lua) e `k.on("notify", fn)` (reroteia/filtra por código).
5. Avisos do MESMO tipo: ~~`counter`~~ **FEITO (18/11)**: `k.surface{ counter = true }` põe o selo "+N" (escondidos)
   no item mais novo à vista (`data-bind="more"`; teto de 50 vivos). Máscara editável por superfície:
   `counterFormat = "+%d"` (padrão), `"%d"` (sem mais), `"(%d)"`, `"+%d mais"`...; exige exatamente um `%d`. Falta `stack = "pile"` (pilha visual com
   cartões espiando atrás). Sobreposição de superfícies de tipos diferentes no mesmo lugar: aceita.
6. ~~`offset` nos lugares centralizados~~ **FEITO (18/11), com a decisão do usuário:** avisos só nas BORDAS do
   navegador, sem centro. Lugares: `top-left`, `top`, `top-right`, `left`, `right`, `bottom-left`, `bottom`,
   `bottom-right`. O `offset` vale só no eixo em que o aviso encosta numa borda (em `top`/`bottom` o
   horizontal é ignorado; em `left`/`right`, o vertical). `center` virou valor inválido (aviso + padrão).

**B. Avisos, passo 3**
7. Barra de progresso do download (estilo `progress`) e clique que abre a pasta.

**C. Avisos, passo 4 (depende do motor de layout)**
8. Superfícies embutidas na barra e na trilha (selo com contador), preset `classico` completo.

**D. Pendências do pacote anterior**
9. DevTools por aba (1.3): cada aba com a sua, trocar de aba só esconde.
10. Referer com as outras políticas (1.4).
11. Popups invasivos (1.5): `window.open` só com gesto do usuário, e nunca para domínio da lista de anúncios.
12. Melhorias da aba anônima (1.8): proxy configurável só para a sessão privada (ex.: SOCKS) e DNS remoto.
13. Interface de cookies e dados de sites (1.9): `kaiak://cookies` (ver/apagar), depois permissões por site.

**E. DevTools modulares** (discutido em 18/11; desenho abaixo, não iniciado)
14. Barra de módulos junto da DevTools embutida, botões com ações de fábrica e ações próprias em Lua.
    DECISÃO (18/11): posição da barra e comportamento do `detach` (janela flutuante?) ficam a cargo do `.lua`.
    Primeiro teste da fila: o protocolo de depuração (CDP) funciona com as DevTools abertas na mesma aba?

**F. Plano geral (já no roadmap)**: botões do navegador por código, motor de layout com slots, tema e
backgrounds, tela de boot, barramento de eventos, extensões, senhas (KeePassXC), DRM, `kaiak://`,
congelar a API, atualizações do Electron.

- **Lugares dos avisos (18/11, decisão do usuário):** só bordas e cantos; `center` foi removido (aviso no meio da
  tela atrapalha) e `left`/`right` foram acrescentados. Visto na tela: um aviso em `right` e outro em `left`,
  colados nas bordas e centralizados na altura. Corrigido de passagem: alerta sem título deixava a 1ª linha do
  cartão `pill` vazia; agora o texto sobe e quebra em até 3 linhas.

## PRINCÍPIO (usuário, 18/11/2026): tudo de LAYOUT é `.lua`, SEMPRE
Posição, tamanho, ordem e visibilidade de qualquer elemento (trilho, barra, painéis laterais, botões, barra de
módulos das DevTools, superfícies de avisos, selos, modo do `detach`) só se define no `kaiak.lua`. Nunca há tela de
configurações, arrastar-e-soltar nem flag que decida layout; a tela de configurações é só para DADOS. Consequências:
o layout de fábrica é escrito no MESMO formato que o do usuário (o padrão é "um `kaiak.lua` embutido", sem exceção
no código); toda parte nova de interface nasce já com `place`/`side`/`size` vindos da config, não de constantes.

## PRINCÍPIO (usuário, 18/11/2026): configurar o KaiaK é "dev friendly"
Vale para toda API do `kaiak.lua`, a partir de agora: nomes previsíveis (uma convenção só, uma palavra por conceito),
unidades explícitas, regras de forma fixas (config única = `k.nome{}`; coleção = `k.nome("id", {})`; `false` remove ou
desliga; chave desconhecida avisa, sem nunca ignorar em silêncio), erro com caminho + esperado + sugestão ("quis dizer
...?"), valores padrão sempre visíveis no modelo comentado, e ferramentas de desenvolvedor (`kaiak --check`, `--print-config`,
tipos para o lua-language-server). Uma única fonte da verdade (esquema) deve alimentar validação, documentação, tipos e modelo.
Recap dos nomes e decisões de normalização: ver a conversa de 18/11 e a tabela no commit seguinte.

## VOCABULÁRIO DA API `kaiak.lua` (decidido em 18/11/2026; vale daqui para frente)
Convenções: `snake_case` em tudo (campos, ações, eventos); tempo sempre com sufixo (`_ms`, `_s`, `_hours`);
comprimento é px (número), porcentagem é texto (`"40%"`); uma palavra de posição só: `place`; config única =
`k.nome{}`; coleção = `k.nome("id", {})` OU `k.nome { id = {}, ... }` (formas equivalentes); `false` remove/desliga;
chave desconhecida avisa com caminho + "quis dizer ...?".

| Comando | Campos (padrão entre parênteses quando útil) |
|---|---|
| `k.theme{}` | `bg fg muted accent panel border private private_bg private_tab private_label font` |
| `k.layout("id", {})` / `k.layout { id = {} }` | slots na ORDEM DE LEITURA: `content("tabs"\|"address"\|"buttons"\|{url,partition?}\|{html,css?}\|{file}) visible(false = começa fechado) place(left\|right\|top\|bottom) size(px\|"%") expand(px\|"%"\|false) mode(push\|overlay)`; de fábrica `rail` e `bar`; devolve handle (`h:remove()`); `false` remove; sem campo `order` |
| `k.button("id", {})` / `k.button { id = {} }` | botões na ORDEM DE LEITURA (mesma regra do layout; handle `h:remove()`): `slot`(obrig.) `icon(texto\|{svg}\|{file})` `label` `tooltip` `action`(obrig.: nome de ação \| função \| `{open=url, target="tab"\|slot-com-site}` \| `{toggle=slot}`); moram em slots `buttons`, `address` ou `tabs` |
| `k.timing{}` | `hover_delay_ms collapse_delay_ms animation_ms discard_after_s` |
| `k.security{}` | `https_only https_exceptions block_third_party_cookies send_gpc trim_referrer permissions allowed_schemes` |
| `k.blocking{}` | `enabled ads malware allow block update_hours` |
| `k.search{}` | `default engines` |
| `k.devtools{}` | `enabled place("right"\|"bottom"\|"window") size("40%")` |
| `k.downloads{}` | `dir` |
| `k.notification{}` | `types{download,alert}{surface,timeout_ms}` e `surfaces{nome}{place style stack offset max close_all counter counter_format html css}`; sugar `.type(...)`, `.surface(...)` |
| (fixo, fora da config) alertas de SISTEMA | erro de config, falha ao baixar lista, lista velha: categoria `system`, SEMPRE no topo, ponta a ponta, visual fixo. Ficam até dispensar. ÚNICA exceção que NÃO se dispensa: o erro de SINTAXE do `kaiak.lua` (o arquivo nem compila; `pinned`): sem ×, "dispensar tudo" não o leva, o botão some se só sobrar ele. Erro de execução do `.lua`, de tempo, falha de lista etc. se dispensam. O `.lua` não os desliga, move nem restila; `system` é nome reservado (tipo e superfície) |
| `k.bind(tecla, ação\|função\|false)`, `k.on(evento, fn)`, `k.run(ação)`, `k.tabs.open(url, privada?)` | ações: `new_tab new_private_tab close_tab focus_address next_tab prev_tab back forward reload toggle_devtools` |

Regra do tempo: `timeout_ms = 0` e `surface = false` são equivalentes e valem para o TIPO inteiro (download, alert); só os alertas de sistema escapam.
Ordem dos slots/itens (decisão em andamento): a de LEITURA do `.lua` (último vence ao redeclarar, sem campo `order`); o fengari preserva a ordem de inserção das tabelas (teste em `lua-host.test.js`).

Removidos nesta passada: `k.popups`, `k.surface`, `k.route` (viraram `k.notification`); `devtools.mode/size(0.4)` virou
`devtools.place/size("40%")` (`detach` -> `window`); todos os nomes camelCase e os sem unidade (ver commit a7894d6).

## ORDEM ANTERIOR (18/11/2026; SUBSTITUÍDA pela "ORDEM VIGENTE" no fim deste arquivo; fica como histórico)
Critério: primeiro o que os outros itens exigem, depois o que o usuário vê, por último o que é independente.

**1. Motor de layout, versão mínima (o que destrava o resto; é a fase 4 do plano)**
   1a. **FEITO.** Medir o custo de views extras (Portão 2): MEDIDO (ver "Portão 2 — resultado"): ~11 MiB por view de interface; o número decidiu
       se painéis e superfícies viram views separadas ou se fundem numa só. Sem este número não se desenha o resto.
   1b. **FEITO (18/11).** Layout 100% declarado: trilho e barra passam a ser slots lidos da config (`side`, `size`, `mode`
       empurra|sobrepõe, `autohide`); o layout de fábrica vira o `kaiak.lua` embutido.
   1c. Painéis laterais (`k.panel{ side, width, ... }`), vários e nomeados, qualquer site, sessão isolada por painel,
       aberto/fechado por ação, independente das abas.
   1d. **FEITO (19/11)** Botões (`k.button{ slot, icon, action }`) na barra, no trilho e em painéis; ação `open` com
       `target = "tab" | <painel>`; ações nomeadas (nova aba, configurações, senhas, cookies...).
**2. Páginas internas `kaiak://`** (esquema novo, hoje bloqueado): downloads primeiro, depois cookies e dados de
   sites (item D13), configurações de dados, senhas (depende da trilha KeePassXC). Abrem em aba OU painel.
**3. Não lidos (contador)**: registro por tipo; `%h` (não vistos), `%a` (remanescentes), `%t` (não lidos);
   `counterCount`; `counterFormat` como string OU tabela de frases por faixa; `readOn` (padrão de URL) e ação
   `mark_read`; abrir `kaiak://downloads` (aba ou painel) zera o tipo e some com os avisos. Selo embutido na
   barra/trilha (antiga C8), que é onde o contador sobrevive depois que o último aviso some.
**4. Avisos restantes**: animações (A2), presets (A3), `k.notify` e `k.on("notify")` (A4), pilha visual (`pile`),
   progresso do download e clique que abre a pasta/painel (B7).
**5. DevTools modulares**: teste do CDP com a DevTools aberta (1º passo), DevTools por aba (D9), barra de
   módulos como slot do layout (posição e `detach` por `.lua`), ações de fábrica e botões do usuário com `ctx`.
**6. Segurança e privacidade pendentes**: Referer com as outras políticas (D10), popups invasivos (D11),
   aba anônima: proxy/DNS (D12).
**7. Trilha de fundo**: tema e backgrounds e tela de boot (fase 3), barramento de eventos completo, extensões,
   senhas (KeePassXC), DRM, congelar a API `kaiak.*` (portão 3), atualizações do Electron.

Dependências em uma linha: 1 -> {2, 3(selo), 5(barra)}; 2 -> 3(gatilho `readOn` com a página real);
1c -> 2 (abrir em painel); 4 é independente de 1 e pode entrar em qualquer ponto.

### Portão 2 — resultado: custo de views extras (18/11/2026; `bench/layout/`, bruto em `resultado-bruto.txt`)
Electron 45 sozinho (janela + 1 view de página) com N views extras visíveis, RAM ociosa em PSS do cgroup, 12 s
depois de abrir, repetido nos extremos (variação entre repetições: até 3 MiB).

| Tipo da view extra | 1ª view | média com 8 | marginal (1 -> 8) | processos com 8 |
|---|---|---|---|---|
| interface (`ui/notify.html`, mesmo preload e sandbox) | +17,5 MiB | 11,3 MiB | 10,4 MiB | 15 (1 por view) |
| em branco (`about:blank`) | +10,0 MiB | 9,6 MiB | 9,6 MiB | 15 |
| painel web (sessão isolada, página pequena) | +17,0 MiB | 14,2 MiB | 13,8 MiB | 15 |

- **Conclusão: o Portão 2 passa.** Uma view custa ~10-14 MiB (a 1ª, ~17 MiB), e CADA view é um processo de
  renderização. Fundir as views da interface numa só economizaria ~11 MiB por view fundida: possível mais tarde,
  mas não é necessário agora. A estimativa antiga (~50 MiB por view; "2 views = ~100 MiB") estava errada; a prova
  independente é a faixa de erros removida, que valia -12 MiB (368 -> 357) e bate com ~11 MiB.
- **Regra de projeto que sai disso:** views de interface e superfícies de aviso nascem sob demanda (já é assim) e,
  por serem ~11 MiB cada, o teto fixo é de 2 a 3 views de interface sempre abertas (trilho, barra, +1) para caber
  no orçamento de 350 + 40 MiB. Painéis do usuário são views extras sob demanda; o custo do CONTEÚDO do site vem
  por cima (uma página real passa fácil de 50-300 MiB e isso não depende do KaiaK).
- **Não medido:** custo de CPU/GPU de várias views compositadas; se destruir uma view devolve a memória (o `hide`
  dos avisos só remove da janela, não destrói); custo de painéis com sites pesados.

### Motor de layout, passo 1b (18/11/2026) — feito
Trilho e barra viraram **slots** lidos da config, na ORDEM DE LEITURA do `kaiak.lua` (sem campo `order`), sem limite de
orientação. 161 testes; RAM ociosa igual (356 MiB, 9 processos: nenhuma view nova).
- **Geometria pura** (`src/layout.js`, `computeLayout`): cada slot morde a janela na ordem; o resto é a página; `mode =
  "overlay"` não reserva espaço; `expand` cresce por cima da página; tamanhos em px ou `"%"`, nunca além do que sobrou.
- **Regras de ordem (como o Hyprland: `hl.unbind` só remove o que veio antes; regra com nome redeclarada = atualizada):**
  redeclarar mescla no lugar; `false`/`h:remove()` remove só o que veio antes; remover e redeclarar leva ao fim, com os valores
  de fábrica. O `.lua` entrega uma LISTA de operações (não o estado final), porque a posição depende da sequência.
- **k.layout nas duas formas** (`k.layout("id", {})` e `k.layout { id = {} }`) e handles com `:remove()`; erros do `k.layout`
  e do `k.notification` apontam a linha do `kaiak.lua` (o código interno relança no nível do chamador).
- **Interface adaptável a qualquer borda:** o trilho vira fileira de abas (título sempre visível, `+` no fim) em `top`/`bottom`;
  a barra de endereço vira coluna (botões em cima, campo embaixo) em `left`/`right`. O main manda `place` e as espessuras em px
  (`slot`); canal `rail:expand` virou `slot:expand`.
- **Provas na tela:** padrão idêntico ao anterior; trilho à direita + barra embaixo (barra só no espaço que sobrou, popup
  acompanha a página); abas em fileira no topo + endereço em coluna lateral de 300 px; expansão no hover com o trilho à direita.
- **Limites conhecidos:** `content` só tem `tabs` e `address` (painéis web entram no 1c); `autohide` ficou de fora (precisa de
  zona sensível na borda); marcador da aba ativa nas bordas `right` não é espelhado; sem animação de reordenar.

### Motor de layout, passo 1c (parte 1): conteúdo dos slots (18/11/2026) — feito
`content` aceita tudo que tem direito: `"tabs"`, `"address"`, **site** (`{ url, partition? }`), **HTML** (`{ html, css? }`) e **arquivo
local** (`{ file }`). 170 testes; RAM ociosa igual (357-358 MiB, 9 processos: painéis só custam quando existem).
- **Site:** view própria com sessão isolada (`persist:panel-<nome>`) que recebe as MESMAS proteções (`applySession`): provado na
  tela (`Sec-GPC: 1` chegou ao servidor; imagem de domínio bloqueado BLOQUEADA; `window.kaiak = undefined`, sem ponte).
- **HTML:** modelo `ui/panel.html` com CSP (sem script/onclick; provado: `<script>` e `onerror` não executam).
- **Arquivo:** roda script, mas sem preload, sem ponte, sessão em memória e as mesmas proteções de rede; arquivo ausente vira aviso.
- **Links** de painéis nunca navegam o painel: http(s) abre numa aba; `window.open` idem.
- **Abrir/fechar em execução:** `visible = false` (começa fechado, a view só nasce na 1ª abertura) e handles `h:show()`, `h:hide()`,
  `h:toggle()` dentro de funções de evento (`k.bind`, `k.on`). Fechar remove a view da janela e devolve o espaço à página; a view
  continua viva (estado/login preservados). Provado na tela com Ctrl+B: fecha, a página cresce, os outros slots reordenam e reabre.
- `expand` só vale para tabs e address (um site não avisa quando o mouse entra): nos outros, aviso e é ignorado.
- **Marcador da aba (decisão do usuário):** é PARTE da aba, sempre a mesma barrinha, no lado de fora da faixa conforme a borda
  (`--marker` por `data-place`); checado por CDP nas 4 bordas.
- **Decisão do usuário: `autohide` NÃO será resolvido nem documentado** (nem atalho `autohide`, nem baixar o mínimo de `size`,
  nem a receita size+overlay+expand): é entregar demais de mão beijada. Registrado para ninguém propor de novo.
- **Medição do 1c: feita (ver "Portão 2, parte 2")**; falta decidir a opção `keep` (painel fechado destruído ou vivo); `content` com botões (`k.button`, 1d) e módulos das DevTools (item 5).

### Portão 2, parte 2 — CPU, GPU, fps e destruir uma view (18/11/2026; `bench/layout/perf.sh`, bruto em `resultado-perf.txt`)
Electron 45 sozinho (janela + 1 view de página) com N views extras de interface (`ui/notify.html`) ou de painel web; CPU = delta do
cgroup em 20 s depois de 12 s abertos; fps = sonda `fps-probe` (rAF na página principal, ~5 s). 1 execução por linha: p99 é ruidoso.

| Medição | Resultado |
|---|---|
| **CPU ociosa**, 0 / 2 / 4 / 8 views estáticas (interface) e 4 / 8 de painel web | **0,2% de 1 núcleo em todas** (não cresce com N) |
| **CPU com 1 view animada** (3 caixas em animação CSS, 300x60 px) + 3 ou 7 estáticas | **8,7% e 8,8% de 1 núcleo**: o custo é por view ANIMANDO, não por view |
| **fps da página principal**, 0 views | 142,3 / 142,2 fps, p50 7,0 ms, p99 7,1 ms |
| fps com 4 estáticas / 4 (1 animada) / 8 (1 animada) | 142,0 (p99 9,2 ms) / 142,1 (p99 7,9 ms) / 141,8 (p99 7,1 ms): **sem queda de fps** |
| **GPU** (nvidia-smi memory.used, total do sistema) | +49 a +70 MiB com ou sem views extras: o custo é do processo de GPU, não cresce com N (ruído de ~±20 MiB) |
| **Esconder** 8 views (`removeChildView`) | PSS 401 -> 399 MiB: **quase nada devolvido**; 15 processos continuam |
| **Destruir** 8 views (`webContents.close()`) | PSS 397 -> 310 MiB: **-87 MiB (~11 MiB por view)**; 15 -> 7 processos |

- **Conclusão:** views extras custam MEMÓRIA (~11 MiB cada, mais o conteúdo), e quase nada de CPU, GPU ou fps enquanto estáticas.
  O risco real de CPU é animação contínua: ~9% de um núcleo por view pequena animando (o orçamento do plano é <10% de um
  núcleo da meta OPCIONAL de animação da fase 3; animação é só uma possibilidade para o usuário, não um requisito do dono).
- **Fechar um painel só o esconde e NÃO devolve memória; destruir devolve ~11 MiB + o conteúdo do site.** Decisão pendente: opção
  `keep` do slot (padrão proposto: `true` = viva, preserva estado e login; `false` = destruída ao fechar, recria ao abrir).
- **Não medido:** animação em view escondida/ocluída (se o Chromium pausa), CPU de painéis com sites reais, GPU por processo (o
  nvidia-smi só mostra o total), mais de uma execução por configuração.

### Motor de layout, passo 1d: botões (`k.button`) e `keep` (18-19/11/2026) — feito
183 testes; RAM ociosa igual (356-357 MiB, 9 processos: sem botões não há nada a mais).
- **`keep` (slot):** `false` = fechar destrói a view (provado: processos 13 -> 12 -> 13 ao reabrir; ~11 MiB + o conteúdo); `true`
  (padrão) = só esconde, preserva estado/login. Provado na tela: o alvo do painel some da lista depois de fechar com `keep = false`.
- **`k.button`:** coleção ORDENADA (mesma regra do layout; código comum extraído para `src/ordered-ops.js`, usado pelos dois).
  Campos `slot icon label tooltip action`; ícone = texto/emoji, `{svg}` (vira `<img>`, não executa) ou `{file}` (lido uma vez, até
  256 KB); ação = nome de ação, função Lua (com prazo), `{open, target}` (aba ou painel de site) ou `{toggle}` (abre/fecha um slot, o
  botão fica pressionado). Destinos validados na config (slot existe, `target` é um site); erros dizem o motivo e ignoram só o botão.
- **Onde moram:** novo conteúdo de slot `"buttons"` (faixa só de botões; fileira em top/bottom, coluna em left/right), e também a
  barra de endereço e o trilho (`address`, `tabs`), via `ui/buttons.js` + `buttons.css` compartilhados.
- **Provas na tela:** faixa com `+`, ícone SVG, ícone de arquivo, `Chat` (toggle: abre o painel e fica pressionado), `No painel`
  (navega o painel), `Numa aba`, `Lua` (função abriu aba) e `?` (arquivo de ícone inexistente vira aviso, o botão continua);
  botão extra `⚙` na barra de endereço; slot inexistente vira aviso claro e o botão é ignorado.
- **Limites:** sem ações `open_settings/passwords/cookies` até existirem as páginas `kaiak://` (item 2); botão não tem estado
  "desabilitado" nem badge; sem menu de contexto; ícone em `tabs` cabe mal numa faixa vertical estreita (42 px) com label.

### 1d, complemento (19/11/2026): tinta do tema, formas, selos e estados — 188 testes
- **SVG acompanha o tema:** sem cor própria (nenhum fill/stroke/stop-color de cor, sem gradiente/imagem/style) o SVG vira máscara
  CSS pintada com a cor do texto do tema; com cor própria fica como está. Vale para `{svg}` e `{file}`; raster não é pintado.
  `.ico` NÃO é aceito (decisão do usuário).
- **Forma:** `shape = "square" | "row"` (padrão: row se `label` foi declarado, MESMO vazio `""`; senão square); `label_place = "right" | "left"`; square ignora o label (aviso).
- **Selos:** `badge` = número (0 esconde, >99 mostra 99+), texto até 4 caracteres ou false; `h:set_badge(...)` em execução.
- **Estados:** `states = { nome = { icon, label, tooltip } }`, `state` inicial, `h:set_state("nome")`; `pressed` automático para
  `{toggle}` (usa `states.pressed` se existir); `enabled = false` / `h:set_enabled(b)` apaga e bloqueia o clique.
- **Provado na tela:** estrela sem cor na cor do tema, bola colorida intacta, texto à direita e à esquerda, selo 99+, selo subindo
  de 2 a 4 por clique (função Lua), 🔊 -> 🔇 por `set_state`, botão desabilitado apagado, botão lateral com selo.
- **Não provado:** clique em botão desabilitado (só o código bloqueia), `states.pressed` automático, SVG por arquivo tingido
  (a lógica é a mesma do `{svg}`). ("Tema claro" não é item: não existe tema embutido, ver decisão de temas.)

## DECISÃO (usuário, 19/11/2026): temas são SÓ do `.lua`
Não existe tema claro/escuro embutido nem detecção do sistema. Os temas são os que o `.lua` declara, cada um COMPLETO (cores,
fundo, ícones, tudo). Haverá um botão/ação para ALTERNAR entre dois temas declarados. Desenho proposto (aguarda confirmação):
O botão de alternar NÃO existe de fábrica: só existe se o `.lua` declarar (`k.button`, sem nenhum botão de fábrica).
Desenho proposto: `k.theme("noite", {...})`, `k.theme("dia", {...})`, ação `toggle_theme` e `{ theme = "dia" }`.
**FEITO (19/11), 195 testes:** temas nomeados na ORDEM DE LEITURA (1º = inicial, sem `use`, escolha NÃO gravada), `k.theme.set(nome)`,
`toggle_theme` percorre a lista; troca ao vivo reenvia o tema às views de interface (sem recarregar). Cores que eram fixas no CSS
viraram chaves do tema (`input tab_active tab_icon hover disabled`). Provado na tela: noite -> dia trocou barra, trilho, campo e botões.
Não coberto: página de erro/bloqueio e `color-scheme` (barras de rolagem) ainda não seguem o tema; fundo das views de página já criadas.

## DECISÃO (usuário, 19/11/2026): scripts em qualquer formato executável (dois mundos)
Ferramentas muito além de "inspeção de navegador". Respostas do dono:
1. **Dois mundos**, e o `.lua` decide qual é qual, com formas de declarar SEPARADAS: **máquina** (qualquer executável do sistema:
   `.sh`, `.exe`, binário...) e **navegador** (código que roda dentro de páginas/painéis: `.js`, css...).
2. Comandos DISTINTOS para cada mundo, igualmente customizáveis.
3. `.so` não é item: biblioteca não é executável (equívoco do dono). Nada de FFI dentro do navegador.
4. **Só o `.lua` executa comandos; sites NUNCA.** Nenhum caminho de página -> exec.
5. Escopo: "tudo que for possível". A responsabilidade pelo que o comando faz é de quem escreve o `.lua`; o KaiaK só fornece a ferramenta.

Desenho proposto (aguarda confirmação do dono), em fatias, cada uma com testes e prova:
- **Fatia 1, máquina:** `k.exec("id", { cmd, args, cwd, env, stdin, timeout_ms, shell?, output })` (coleção ordenada, como layout/button);
  roda por `child_process.spawn` SEM shell (o SO decide se executa: shebang, binfmt); `shell = true` só quando o `.lua` pedir uma
  string de shell. Disparo por ação de botão/tecla `{ exec = "id" }`, por `h:run(args)` e `k.exec.run(...)` em funções. Saída:
  `on_output(linha)`, `on_exit(codigo, saida)`, ou `output = "notify"` (aviso). Limites configuráveis de saída e tempo.
- **Fatia 2, vida longa:** processos que ficam rodando (`h:stop()`, `h:running()`, reiniciar), encerrados ao fechar o navegador.
- **Fatia 3, navegador:** `k.script("id", { file | code, match = {padrões de URL}, target = "page" | id de slot, run_at, world })`;
  injeta JS/CSS nas páginas que casam. Mundo isolado por padrão (a página não lê nem chama o script).
- **Fatia 4, ponte página <-> Lua:** canal NOMEADO declarado no `.lua`, só de dentro de scripts do `.lua` (mundo isolado); o `.lua`
  decide o que fazer com cada mensagem. Site não alcança o canal, e o canal não chega a `exec` sem uma função do `.lua`.
- **Fatia 5, API ampla:** eventos (aba abriu/navegou/fechou, download, tema) e controle de abas para o Lua.

### Item 2: página inicial `kaiak://start` e fundo (19/11/2026) — feito, 202 testes
- **Esquema `kaiak://`** (privilegiado, padrão e seguro) servido por `ses.protocol.handle` nas sessões normal e privada; só rotas
  listadas (`start`, mais scripts `.js` de `ui/`); o resto dá 404. **Sites não chegam lá:** `kaiak:` não está em `allowed_schemes`;
  provado na tela: `location.href` e clique em link para `kaiak://start` ficaram barrados. Base do item 4.
- **`k.start{ enabled, search, background{ color, gradient, image{ file, size, place, tint } } }`**; aba nova (Ctrl+T e privada)
  abre `kaiak://start`; imagem lida uma vez (até 2 MB), `tint = true` pinta com a cor de destaque do tema (máscara CSS), `place`
  nos 9 lugares; valores validados por padrões estritos (nada de `; { } < >` nem `url()` em cor/gradiente) e o HTML gerado
  escapa o tema. A busca usa o mecanismo padrão (só ele; sem "palavra = mecanismo").
- **Provado na tela:** fundo `#252734`, silhueta em lavanda (acompanha o `accent`), campo de busca escuro com borda no foco;
  busca levou a `duckduckgo.com/?q=teste+kaiak`; Ctrl+T e Ctrl+Shift+N abrem a página.
- **Não feito:** atalhos (speed dial) como no Vivaldi, fundo atrás da interface (só com slot `html/css`), `kaiak://start` por aba
  privada com visual diferente, tela de boot, e a troca de tema não repinta páginas iniciais já abertas.

### Item 2, `scheme` livre (19/11/2026) — feito, 203 testes
`color_scheme = "dark"|"light"` (nativo do Chromium: barras de rolagem e campos) e `scheme = "nome-livre"` (padrão `default`,
vira `data-scheme` em toda view de interface, na página inicial e nas telas de erro/bloqueio), mais `vars = { nome = "valor" }`
(variáveis CSS `--nome`, herdadas do tema base e removidas ao trocar de tema). A chave antiga `scheme = "dark"|"light"` mudou para
`color_scheme` (quebra de compatibilidade só de hoje, ainda sem uso fora dos testes). Provado na tela: a troca noite -> dia mudou
`data-scheme`, `--destaque`, `color-scheme` e removeu `--so_noite`; a página inicial aberta depois segue o tema novo.
Nota: uma página `kaiak://` não recarrega nem navega para si mesma por JS (a guarda de navegação barra o esquema); a barra de
endereço e o botão de recarregar do navegador funcionam.

### Item 2: Speed Dial, widgets e recarga no tema (19/11/2026) — feito, 210 testes
- **Troca de tema recarrega as abas na página inicial** (`tabs.reloadMatching`); provado: fundo claro depois do clique, atalhos mantidos.
- **`start.speed_dial`** (`false` padrão; só o `.lua` liga): `columns`, `size`, `shape`, `editable`, `items` (`title`, `url`, `icon` como nos
  botões). Atalhos do `.lua` são fixos; com `editable` a PÁGINA tem "+" e "×" e guarda os atalhos do usuário em
  `~/.local/share/kaiak/speed-dial.json` (até 200, só http/https, gravação atômica; ícone = inicial do título, sem rede).
- **`start.widgets`**: lista (até 12) de blocos `{ place, width, height, html, css }` nos 9 lugares; sem script (CSP); nada de fábrica.
- **API `kaiak://start/api/dial/*`:** POST com **token de sessão** aleatório que só vai dentro da página gerada. O `Origin` chega como
  `"null"` nesse esquema (não serve) e o esquema precisou de `supportFetchAPI`. Provado: sem token = 403; um SITE tentando chamar a API
  ou ler `kaiak://start/` falha no fetch (CORS); adicionar, URL inválida (`javascript:`), remover e o arquivo conferidos na tela.
- **Bug achado pelos testes:** bloco de widget inválido entrava na lista como `undefined` (flatMap sem lista vazia); corrigido.
- **Não feito:** widgets com dados vivos (dependem de `k.exec`, item 3), reordenar atalhos, favicon (rede), editar atalho.

### Troca de tema: a interface só muda no fim do refresh (dono, 19/11) — feito, 213 testes
`tabs.reloadMatching` recarrega as abas na página inicial e devolve uma promessa que resolve quando TODAS terminam de carregar (ou
no prazo de 2 s); só então a interface recebe o tema novo, e uma troca mais nova cancela a anterior (`themeSeq`). Provado na tela
(`bench/layout/theme-sync.js`): página inicial e interface mudam de fundo com ~10-30 ms de diferença, nos dois sentidos.

### Item 1 da ordem v2: o `kaiak.lua` do dono com o visual do Vivaldi (19/11/2026) — feito, 214 testes
`~/.config/kaiak/kaiak.lua` (cópia versionada em `proto-electron/examples/rafeu.kaiak.lua`; arte em `~/.config/kaiak/art/`): tema
"noite" (barras `#252734`, campo `#020314`, destaque lavanda), barra de endereço no topo, trilho à esquerda só com ícones em
`#2b395e`, faixa de botões à direita em `#1b1c27` (DevTools, aba privada, ícones SVG tingidos pelo tema) e página inicial com a
silhueta de caubói. Provado na tela com o arquivo real: layout, tema, navegação a um site e aba nova.
**Lacunas achadas pelo uso real:** (1) slot sem cor própria: resolvido com o campo `bg` do slot (cor só dele; vale depois de troca
de tema); (2) a barra mostrava `kaiak://start/`: agora fica vazia na página inicial, como no Vivaldi; (3) **limite conhecido:** o
`bg` do slot é fixo entre temas, então um 2º tema claro precisaria trocar o `bg` do trilho e do painel (por isso só "noite" por
ora); (4) falta o seletor de workspaces e a barra de favoritos do Vivaldi (itens 5 e 6); (5) o navegador ainda não tem atalho de
desktop/instalação: o dono o abre pelo comando do projeto.

### Item 2 da ordem v2: tela de boot (`k.boot`) e "pronta" da página (19/11/2026) — feito, 221 testes
- **`k.boot{ enabled, background{color,gradient,image}, min_ms, max_ms }`**: uma view só de fundo (rota `kaiak://boot`, sem script)
  por cima de TUDO (também depois de `raiseChrome`) desde a abertura da janela até a 1ª aba ficar pintada; some no máximo em
  `max_ms` (padrão 4000) e não antes de `min_ms`; acompanha o redimensionamento. A janela agora nasce na cor do tema (sem clarão
  branco). Avisos e erros ficam por CIMA dela, de propósito (um erro de boot precisa aparecer). Provado na tela: silhueta
  em lavanda por cima de tudo, sumiu depois de `min_ms` e deixou a página inicial.
- **"pronta" (`src/page-ready.js`)**: páginas `kaiak://` avisam por `console.log('kaiak:ready')` depois de decodificar imagens e de
  2 quadros; as demais valem pelo fim do carregamento; sempre com prazo. Usada na troca de tema (a interface só muda quando as páginas
  iniciais estão prontas) e na tela de boot. Um site que logue o marcador não vale (a URL precisa ser `kaiak://`).
- **Desvio do desenho antigo (decidido pelo assistente, avisar o dono):** o roadmap pedia a tela de boot ANTES do Lua, lendo um
  `last-good/boot.json`. Como o Lua roda em < 50 ms e a janela já nasce na cor do tema, não vale o cache extra: a tela de boot lê a
  config já carregada. Se a medição futura mostrar partida lenta, volta-se ao cache.
- **Medido (honesto):** com a silhueta (arte pequena) o marcador chega só 0 a 4 ms depois do `load`: o ganho sobre o
  `did-stop-loading` é pequeno com arte leve; o valor aparece com imagens grandes. Não medi uma imagem grande.

### Item 3 (uso diário), passo 1: erro de certificado (19/11/2026) — feito, 223 testes
- **O padrão do Chromium continua: certificado inválido é RECUSADO.** A tela de erro agora diz o motivo exato por código (-200 nome
  errado, -201 vencido, -202 autoridade não confiável/autoassinado, -206 revogado, fraco...) e mostra a linha do `.lua`.
- **Sem botão "continuar mesmo assim" (decisão de desenho do assistente, na linha do `https_exceptions`: só o `.lua` decide):**
  `k.security { cert_exceptions = { "192.168.0.10" } }` aceita o certificado inválido SÓ desse host (nome exato, subdomínio não herda),
  pelo evento `certificate-error` do app. Provado na tela com um servidor HTTPS autoassinado: sem a exceção, tela de erro com
  `ERR_CERT_AUTHORITY_INVALID`; com ela, a página abre; outro host continua recusado.
- **Não feito:** mostrar detalhes do certificado (emissor, validade); aviso na barra de endereço de que o host tem exceção ativa
  (seria útil: um host com exceção abre sem nenhum sinal de que a verificação está desligada); exceção por impressão digital.

### Item 3 (uso diário), passo 2: restaurar a sessão (19/11/2026) — feito, 230 testes
- **`k.session { restore = true }`** (padrão `true`): as abas (menos as privativas, NUNCA guardadas) vão para
  `~/.local/share/kaiak/session.json` ~1 s depois de cada mudança e ao sair (também por SIGTERM/SIGINT); ao abrir voltam
  DESCARTADAS (sem processo): só a aba ativa carrega, as outras carregam ao clicar. `restore = false` não lê nem escreve.
- O que volta do disco é revalidado: só http, https e `kaiak://start`, textos curtos, ícone http(s), no máximo 300 abas;
  arquivo ruim = sessão vazia. Endereços da linha de comando abrem por cima das restauradas. Gravação atômica
  (`src/json-file.js`, agora compartilhada com o Speed Dial).
- **Provado:** 3 páginas + 1 aba nova + 1 privativa, fechado por SIGTERM; reaberto sem argumentos: 4 abas no trilho, 1 só viva
  (a ativa), a privativa fora do arquivo; `restore = false` abriu só a página inicial e não tocou no arquivo.
- **Não feito:** histórico de navegação (voltar/avançar) de cada aba não é restaurado; rolagem e formulários também não; o
  mesmo vale para a futura persistência POR workspace (`persist`, item 6), que estende este arquivo; a escolha pela tela de
  configurações (item 5) ainda não existe.

### Item 3 (uso diário), passo 3: busca na página, Ctrl+F (19/11/2026) — feito, 240 testes
- **Caixa de busca** (view de interface por cima da página, criada ao abrir e DESTRUÍDA ao fechar: não custa memória parada),
  busca do próprio Chromium (`findInPage`, sem diferenciar maiúsculas), contador `3/16` e campo vermelho quando não acha.
  Ctrl+F abre/foca; Enter e Shift+Enter (ou F3/Shift+F3) percorrem; Esc fecha, limpa o destaque e devolve o foco à página;
  trocar de aba fecha a busca (ela pertence à aba antiga).
- **`k.find { enabled, place }`**: `place` = um dos 8 lugares das bordas da área da página (padrão `top-right`; posição pura em
  `find-layout.js`, encolhe em página pequena). Ações para botões/teclas: `find`, `find_next`, `find_prev`; teclas padrão
  `ctrl+f`, `f3`, `shift+f3` (como tudo, trocáveis no `.lua`).
- **Provado na tela** (página com 16 ocorrências): Ctrl+F abriu a caixa no canto, digitar mostrou `1/16` com o destaque na página,
  Enter foi a `2/16`, Shift+Enter voltou a `1/16`, Esc fechou (seleção limpa), aba nova fechou a busca.
- **Não feito:** diferenciar maiúsculas, palavra inteira, buscar em páginas internas `kaiak://` de forma especial; a caixa não é
  um slot do layout (é flutuante): não tem tema próprio além do tema ativo.
- **Nota de teste:** o texto acentuado da página de teste saiu truncado só porque o HTML de teste não declarava charset.

### Item 3, passo 3 (complemento): layout editável da busca e correção dos limites (19/11/2026) — 246 testes
Limites do passo 3, investigados conforme a regra (solução + viabilidade):
- **Caixa não era editável pelo `.lua` (dono: "tem que poder editar o layout")** -> `k.find { place, width, height, margin, css, html }`:
  `css` vem depois do de fábrica e vence; `html` troca o modelo inteiro, com cada controle marcado por `data-find="input|count|case|
  word|prev|next|close"` (só `input` é obrigatório; sem script, a CSP barra). Validado (medidas, `</style`, `html` sem campo).
  Provado na tela: caixa embaixo, 520x52, pílula azul `#2b395e` do `.lua`. Achado no teste: a view era opaca e deixava um quadrado
  escuro nos cantos arredondados; corrigido com fundo transparente.
- **Diferenciar maiúsculas** -> VIÁVEL e nativo (`findInPage { matchCase }`): botão "Aa" e `case_sensitive` (estado inicial).
- **Palavra inteira** -> o `findInPage` do Electron NÃO tem a opção (só forward/findNext/matchCase); testei o `window.find` do
  Chromium: o 5º argumento (palavra inteira) FUNCIONA (6 de 8 ocorrências, certo). Implementado como segundo motor via script na página:
  conta até 2000 ocorrências, percorre com volta ao início, contador próprio; botão "ab" e `whole_word`. **Custo/limite honesto:**
  nesse modo só a ocorrência ATUAL fica destacada (seleção), não todas; `window.find` não entra em iframes. Contagem provada na
  tela: `casa` = 8 (nativo), 5 com Aa, 3 com Aa + palavra inteira.
- **Teste acentuado truncado** era só do HTML de teste (sem charset): sem ação.

### Item 3 (uso diário), passo 4: zoom (19/11/2026) — feito, 254 testes
- **`k.zoom { levels, default, remember, notify }`**: `levels` em % (padrão 25 33 50 67 75 80 90 100 110 125 150 175 200 250 300 400
  500; do `.lua`, 2 ou mais, 25-500, sem repetir), `default` em % (o que `zoom_reset` restaura). Teclas padrão: `ctrl+=`, `ctrl+plus`,
  `ctrl+shift+plus` (mais), `ctrl+-` (menos), `ctrl+0` (reset) e **Ctrl+scroll**; ações `zoom_in`, `zoom_out`, `zoom_reset` para
  botões/teclas. Apelidos novos de tecla: `plus` e `minus`. De um zoom entre dois níveis vai ao vizinho; nos extremos fica.
- **Memória por site** (`remember = true`): `~/.local/share/kaiak/zoom.json` por host http/https (máx. 2000; voltar ao padrão apaga a
  entrada); aplicada a cada navegação, também depois de reabrir o navegador. **A aba privativa lê a memória mas NUNCA grava**
  (como o incógnito do Chrome); páginas `kaiak://` e arquivos seguem o padrão. `notify = true` mostra "Zoom N%" como alerta
  (troca o anterior pela mesma tag).
- **Provado na tela:** 3x Ctrl+= = 150%, Ctrl+- = 125%; outro host (localhost) fica em 100% e o primeiro volta a 125%; reaberto o
  navegador a aba voltou em 175%; na aba privativa o arquivo não mudou; Ctrl+0 voltou a 100%; alerta "Zoom 200%" visível.
- **Limites investigados (regra nova):**
  1. *Ctrl+scroll via CDP sintético NÃO dispara o zoom* (testei: ficou parado). Solução testada: roda de verdade pelo `ydotool`
     (teclado/mouse virtuais, `ydotoold` já ativo): 2 passos = 125 -> 175%. Conclusão: o código funciona; o CDP é que não
     alcança esse caminho do motor. Viável e usado nas provas.
  2. *O alerta dura ~1 s por padrão* (tipo `alert` do `.lua`): viável mudar com `k.notification { types = { alert = { timeout_ms = N } } }`
     (provado com 15 s); não mexi no padrão global por ser decisão de avisos.
  3. *O zoom é só da página*, não da interface (trilho/barra): escalar a interface exigiria `setZoomFactor` nas views de UI e
     recalcular os slots em px; viável mas muda o layout inteiro: **ficou na fila como opção** (`k.zoom { ui = 1.1 }`), sem urgência.

### Item 3 (uso diário), passo 5: menu de contexto (19/11/2026) — feito, 261 testes
- **`k.context_menu { enabled, link, image, selection, editable, page, items }`**. O contexto do clique é escolhido por prioridade:
  campo de texto > link > imagem > texto selecionado > página. Cada contexto tem uma LISTA ordenada (a do `.lua` substitui a de
  fábrica; `"-"` separa; lista vazia = sem menu ali; contexto não citado fica de fábrica). 20 itens de fábrica (abrir link em
  aba/segundo plano/privativa, copiar link, abrir/salvar/copiar imagem e endereço, desfazer...selecionar tudo, pesquisar a seleção,
  voltar/avançar/recarregar, buscar na página, inspecionar). Itens do dono em `items = { id = { label, action } }` com `action` =
  nome de ação, função Lua `function(ctx)` (`ctx` = tabela `{ kind, link, image, selection, page }`) ou `{ open = "https://...%s",
  target = "tab"|"background"|"private" }` (`%s` = seleção, senão link, imagem ou página, já codificado).
- Menu NATIVO do sistema (Menu do Electron): sem view extra, sem custo parado. Itens sem efeito ficam apagados (ex.: Avançar sem
  histórico, Copiar sem seleção). Link aberto da aba privativa herda a privacidade; esquemas fora de `security.allowed_schemes`
  (javascript:, file:...) nunca abrem por aqui. Ponte Lua ganhou "objeto simples -> tabela".
- **Provado na tela** (botão direito real via `ydotool`): link -> "Abrir link em nova aba" abriu a aba; seleção -> menu com o item
  seu e "Buscar na Wikipedia" abriu `pt.wikipedia.org/?search=Selecione%20esta%20frase...`; imagem -> 5 itens e "Copiar endereço da
  imagem" colocou o endereço na área de transferência; campo de texto -> Desfazer/Refazer/Recortar/Copiar apagados e Colar ativo.
- **Limites investigados (regra 2):**
  1. *O menu usa o tema do sistema, não o do KaiaK* (o desenho dele veio do tema GTK/Qt, ficou escuro por coincidência). Solução:
     menu desenhado em view própria (como a busca) permitiria `css` do `.lua`; viável mas custa uma view por clique e perde itens
     nativos (sugestão ortográfica); **fica na fila como opção** (`context_menu.style = "custom"`), sem urgência.
  2. *Falta no menu: ortografia, "Abrir link como..." e itens de extensões.* Ortografia depende de dicionários do Electron
     (`session.setSpellCheckerLanguages`), entra junto do passo de idiomas; extensões ficam com o item de extensões da fila.
  3. *Itens do `.lua` não somem por condição* (ex.: só em certos sites): a função só roda ao clicar. Viável: `visible = function(ctx)`
     chamada ao abrir o menu (custo: uma chamada Lua por clique, <1 ms); **ficou na fila**, aguarda necessidade.

### Fila (ideia do dono, 19/11/2026): cor de seleção no tema
- Hoje a cor de seleção NÃO faz parte do tema (confirmado no código: nenhuma chave `selection`/`::selection` em `theme`). Entra na
  fila junto dos temas/`scheme` (próximo da revisão do tema, depois do passo 6 do uso diário), como chaves `selection_bg` e
  `selection_fg` (e, se couber, `caret`/`accent_color` de formulários) valendo na INTERFACE (`::selection` nas views de UI).
- **Nas páginas dos sites** o caminho viável a testar é `webContents.insertCSS('::selection{...}', { cssOrigin: 'user' })`: origem
  de usuário perde para o `::selection` do próprio site, então só colore onde o site não decidiu. **Não testado ainda**; testar
  antes de prometer. Função no `.lua` (cor por contexto/site) fica para junto de `k.script` (navegador), item 3b/scripts.

### Item 3 (uso diário), passo 6: tela cheia de página (19/11/2026) — feito, 266 testes
- **Medido antes:** sem código, quando a página pedia tela cheia, a janela já virava tela cheia (Hyprland: `fullscreen=2`), mas o trilho
  e a barra de endereço continuavam visíveis e a página só preenchia a área dela. Agora: `src/fullscreen.js` (`enter`, `leave`,
  `tabChanged`) liga os eventos `enter/leave-html-full-screen`; em tela cheia os slots e a busca somem, a página mede a janela inteira.
- **Provado na tela** (clique real num botão `requestFullscreen`): janela 1896x1010 -> 1920x1080, `innerWidth` 1854 -> 1920, sem
  nenhuma barra; **Esc** devolveu tudo (janela, barras e página em 1854x970); **trocar de aba** (Ctrl+Tab) em tela cheia sai dela e
  avisa a página (`document.exitFullscreen`); voltando à aba antiga ela está no tamanho normal. Se a janela já estava em tela
  cheia antes, sair não a tira. Os avisos de sistema continuam por cima.
- Bug meu pego na prova: `applyPage: relayoutPage` lia a função antes de ela existir (janela em branco no boot); agora são funções
  que leem na hora. Sem isso nenhum teste unitário pegava, só a tela.
- **Limites investigados (regra 2):**
  1. *Não testei com `<video>` real de site (YouTube etc.)*: o caminho é o mesmo evento do Chromium, mas o vídeo com DRM/Widevine
     depende do item de DRM (fora de prioridade). Viável testar com um `.mp4` local num próximo passo; custo: um vídeo de teste.
  2. *F11 (tela cheia da JANELA, com barras)* não existe: não é o mesmo que tela cheia da página. Viável: ação `toggle_fullscreen`
     chamando `win.setFullScreen` (5 linhas); **entra na fila** se você quiser, sem urgência.
  3. *Mostrar a barra ao encostar o mouse no topo em tela cheia* (como o Vivaldi/Chrome): viável como `fullscreen { reveal_edge }`,
     mas é detalhe de aparência; **fica na fila**.

### Fila (ideia do dono, 19/11/2026): trilho que EMPURRA em vez de cobrir
- Hoje o slot com `expand` cresce POR CIMA da página (`layout.js`: a faixa expandida cobre o que vem depois). Opção a oferecer no
  `.lua`, não desejada pelo dono, só como possibilidade: `expand_mode = "overlay"` (padrão, o de hoje) | `"push"` (a página e os
  slots vizinhos se reorganizam). O cálculo é viável (o layout já separa retângulo base e expandido). **Risco/custo não medido:**
  redimensionar a página a cada hover refaz o layout do site (piscada, tremor, custo em páginas pesadas); mitigação provável:
  `expand_delay_ms` de entrada e de saída. Primeira tarefa quando chegar a vez: protótipo medindo fps e piscada num site pesado.
  Posição: junto do motor de layout, na revisão do tema (depois do bloco "Uso diário").

### Item 3 (uso diário), passo 7: impressão e PDF (19/11/2026) — feito, 271 testes
- **`k.print { page_size, landscape, background }`** (`A3 A4 A5 Legal Letter Tabloid`; padrão `A4`, retrato, fundo ligado). Ações `print`
  (**Ctrl+P**, diálogo de impressão do sistema) e `save_pdf` (**Ctrl+Shift+P**, grava o PDF na pasta de downloads; nome = título da
  página, senão o host; sem barras nem caracteres perigosos, 80 letras; nunca sobrescreve: `nome (1).pdf`). Também no menu de contexto
  da página ("Imprimir…", "Salvar como PDF"; editáveis na lista `page`). Aviso "PDF salvo" no toast de downloads.
- **Provado:** Ctrl+Shift+P gerou `Relatorio de teste.pdf` (1 página, A4 595x842 pt, texto e acentos extraídos corretamente,
  **fundo amarelo presente** nos pixels), e uma segunda vez gerou `... (1).pdf`.
- **Limite investigado: o diálogo do Ctrl+P NÃO abriu nesta máquina.** Causa medida no log: `CUPS: Error getting default printer` /
  `Failed to enumerate printers`. Não há CUPS instalado (sem `lpstat`, serviço inativo). O erro chega ao `.lua` do dono como aviso
  "Impressão falhou: nenhuma impressora disponível (o sistema não tem CUPS); use Salvar como PDF". **Solução viável:** instalar e
  ativar o CUPS (e uma impressora, ou "CUPS-PDF"), isso muda o SISTEMA (sudo): não fiz, depende de o dono querer imprimir em papel;
  o PDF já cobre o caso sem impressora. **Não testado:** o diálogo em si e a impressão real em papel.
- Bug de ordem não ocorreu; a suíte cobre nome do PDF, opções, erros do motor, cancelamento e falha sem impressora.

### Item 3, passo 7 (revisão): tela de impressão própria e teclas do Chromium (19/11/2026) — 275 testes
- **Decisão do dono:** padrão das teclas = Chromium; todas as teclas religáveis pelo `.lua` (`k.bind`). O visualizador de PDF do
  Chromium é o padrão (só muda por extensão; sem `.lua` para isso).
- **Causa do diálogo não abrir (medida em um Electron mínimo, sem o KaiaK):** `webContents.print()` exige impressora padrão e falha
  com `Failed to enumerate printers` sem CUPS (`getPrintersAsync()` = `[]`), igual com ou sem `pageSize`.
- **Feito:** `Ctrl+P` (`print`) abre a **tela de impressão do KaiaK** (`src/print-dialog.js`, `print-template.js`, `ui/print.*`): papel, orientação,
  margens, escala, páginas e fundo; **Salvar como PDF** (primário), **Impressora…** (diálogo do sistema; apagado sem impressora),
  Cancelar. `Ctrl+Shift+P` (`print_system`) = diálogo do sistema. `save_pdf` = PDF direto, **sem tecla padrão**. Tudo validado
  (`cleanPrintOptions`: a tela não é confiável). `k.print { page_size, landscape, background, scale, margins, place, width, height, css, html }`;
  `html` próprio exige `data-print="save"`. Fecha com Esc, Enter salva, trocar de aba fecha.
- **Provado na tela:** a tela abre centralizada; com Letter + paisagem + 80% + páginas `1-2` + sem fundo o PDF saiu 792x612 pt (letter),
  2 páginas, sem o fundo amarelo; Esc fecha; `Ctrl+Shift+P` avisa a falta de CUPS e não gera arquivo; numa **aba de PDF** o `Ctrl+P` abre a
  tela e o PDF gerado tem o conteúdo real do documento; pelo `.lua` (place, medidas, css, html próprio e `k.bind`) tudo mudou.
- **Limites investigados:** (1) *sem pré-visualização* da página impressa na tela (Chromium/Firefox mostram): viável com
  `printToPDF` + `<embed>` do visualizador, custa uma geração por mudança de parâmetro; **fica na fila**. (2) *Escala 80% não isolada*
  nos testes (só a validação e o repasse ao motor). (3) *Intervalo de páginas* só vale no PDF; no diálogo do sistema o usuário escolhe lá.
  (4) *CUPS* continua ausente: só o botão "Impressora…" depende dele.

### Fila (dono, 19/11/2026): sobras da impressão, depois do `k.exec`
1. **Pré-visualização na tela de impressão.** Custo medido: página comum ~25 ms por PDF (22 KB); página pesada (22 páginas com sombras e
   gradientes) ~1,8 s e 6,5 MB por mudança de parâmetro, sem ganho de cache. Exige: atraso depois de digitar (~400 ms), geração
   cancelável, prévia só das primeiras páginas, e um visualizador embutido (memória do processo extra NÃO medida).
2. **Intervalo de páginas no diálogo do sistema:** converter "1-3, 5" para `pageRanges` do `print()` (1 linha, lido no tipo do Electron).
   Só testável com impressora/CUPS; fazer quando houver.
- Resolvido sem código: a **escala** funciona (medido: 399 linhas = 15 pág. a 100%, 12 a 80%, 8 a 50%).

### Item 6, fatia 1: `k.exec` (comandos da máquina) (19/11/2026) — feito, 288 testes
- **Decisões tomadas** (o dono respondeu "tudo que for possível; a responsabilidade é de quem escreve o `.lua`" e mandou seguir a fila):
  `spawn` SEM shell por padrão; **`shell = true` explícito** (então `cmd` é a linha de shell e `args` é ignorado, com aviso); **sem sandbox**
  (o dono assume o comando). Só o `.lua` dispara: não existe ação, evento nem canal IPC que uma página alcance (`src/exec-runner.js`
  só é chamado por `runExec` do runtime, botão `{ exec }` e funções do `.lua`).
- **API:** `k.exec("id", { cmd, args, cwd, env, stdin, timeout_ms, shell, output, max_output_kb, on_output, on_exit })` (coleção:
  `false` remove, redeclarar mescla; `args`/`env` substituem), handle `h:run({ extras })`, `k.exec.run("id", { extras })`, botão
  `action = { exec = "id", args = { ... } }` (valida que o comando existe). Padrões: `timeout_ms` 30000, `output` "none", `max_output_kb` 256.
- **Segurança operacional:** nada é interpretado sem `shell = true` (`$HOME; echo x | cat` chega ao programa como texto, testado); prazo
  (SIGTERM, SIGKILL após 2 s), saída limitada, **teto de 8 comandos simultâneos**, todos encerrados em `before-quit`, erro dentro de callback
  do `.lua` não derruba o fluxo, `~` em `cwd`.
- **Provado:** 13 testes novos com processos de verdade (stdout+stderr, `on_output` por linha, env, cwd, stdin, código != 0, comando inexistente,
  prazo de 300 ms, limite de saída, teto de 8, killAll). **Na tela:** F1 rodou `meu.sh` com `fixo da-tecla`, apareceu o aviso `script: linha para
  o aviso`, e o `on_exit` do Lua abriu uma aba nova; botão `S` com `{ exec }` rodou com `fixo do-botao` e abriu outra; F2 mostrou
  `exec "falha" falhou (código 7)`. **Custo:** spawn síncrono mediana 1,5 ms, máx. 4,9 ms (orçamento de tecla: 5 ms).
- **Limites investigados (regra 2):**
  1. *Sem `on_output` do stderr* (só junto na saída final): viável (mesmo `data` do `stderr`), **na fila**; ninguém pediu ainda.
  2. *O callback roda no processo principal, com prazo de 100 ms da VM*: um `on_exit` lento é abortado com erro do `.lua`. Viável
     deixar como está (o trabalho pesado fica no comando, não no callback).
  3. *Linux e macOS apenas por ora*: `shell = true` usa `/bin/sh`; no Windows seria `cmd.exe` (**não testado**, fora do uso do dono).
  4. *`stdin` só texto, uma vez*: um canal interativo (escrever depois, com o processo vivo) é a **fatia 2 (vida longa)**, que é o próximo item.

### Item 6, fatia 1: investigação dos limites (19/11/2026) — medido em scripts descartáveis sobre o código real
1. **`stderr` sem callback próprio — VIÁVEL, custo ~zero.** Medido: hoje stdout e stderr chegam misturados e fora de ordem (`A C B` para
   `echo A; echo B >&2; echo C`). O Node entrega os dois por eventos separados; falta só um campo `on_error_output(linha)` (mesmo caminho
   do `on_output`). **Na fila** (junto da fatia 2), sem urgência.
2. **Callback do `.lua` com prazo de 100 ms — funciona como desenhado.** Um `on_exit` com laço pesado foi abortado em **~106 ms** com o
   erro "tempo esgotado (laço infinito?)" e **a VM continuou viva** (um callback seguinte rodou sem erro). Não há o que consertar;
   a regra para o dono é: o trabalho pesado fica no comando, não no callback.
3. **Só `/bin/sh` com `shell = true` — SOLUÇÃO VIÁVEL: `shell = "/bin/bash"` (caminho do shell).** Testado: `shell: '/bin/bash'` aceita
   `{a,b}` e `[[ ]]` (`a-5 b-5` + `bashismo`); `shell: true` no CachyOS é `/bin/sh` -> bash em modo POSIX e **não** expande chaves (`a b`).
   Custo: aceitar texto além de booleano na validação (~5 linhas). Windows **não testável aqui**. **Na fila.**
4. **Canal interativo (stdin depois da partida) — VIÁVEL.** Testado com `cat`: `write` duas vezes, respostas na ordem, processo vivo. **Obstáculo
   real descoberto:** o prazo máximo é 1 h e `timeout_ms = false` ("sem prazo") hoje **é rejeitado** (volta a 30 s), então um processo de vida
   longa seria morto. A fatia 2 precisa aceitar `timeout_ms = false` e `h:write(texto)`/`h:stop()`.
- **Achado A (defeito meu, CORRIGIDO e testado): UTF-8 partido.** No caminho do `on_output`, um caractere de 2-4 bytes dividido entre dois
  pedaços virava lixo: **64 linhas corrompidas em 300 000** (`ção-ñ-日本-😀`). Corrigido com `StringDecoder`; agora 0 em 300 000; teste novo
  com 1 byte por pedaço (289 testes). A saída final (`on_exit`) nunca teve o problema (usa `Buffer.concat`).
- **Achado B (limite real, NA FILA): fluxo grande de linhas trava o laço principal.** Medido com 200 000 linhas e `on_output` em Lua:
  **até 66 ms** de uma só parada do laço de eventos (o orçamento de quadro a 144 Hz é ~7 ms), mas **1,4 ms** com um callback JS puro: o custo é a
  chamada ao Lua por linha (~130 mil linhas/s). `max_output_kb` **não** limita o `on_output` (só a saída final). Solução testada: entrega
  **fatiada** (fila, orçamento de 2 ms por rodada, `setImmediate`): o atraso máximo caiu de 66 ms para **2,6 ms**, **mas** a vazão caiu para
  ~4 mil linhas/s (23 188 de 200 000 em 6 s; com fila de 5 000 e descarte do excesso, 14 588). Ou seja: **suavidade x vazão**. Sem custo para
  quem emite poucas linhas (o normal: um aviso de progresso). Fica a decisão do dono: (a) deixar como está e documentar; (b) fatiar com
  orçamento configurável (`on_output_budget_ms`); (c) um modo `on_lines(lista)` que entrega várias linhas por chamada ao Lua (**não testado**: a ponte
  JS->Lua hoje não monta listas, só tabelas com chaves).

### Item 6, fatia 1 (correção): scripts `.sh` no `k.exec` (19/11/2026) — 290 testes
- Pergunta do dono: o `k.exec` aceita um `.sh`? **Sim** (provado na tela com `meu.sh` e nos testes). Requisitos: `chmod +x` e shebang; sem
  o `chmod +x` o sistema recusa (`spawn ... EACCES`, aviso de falha, código -1), e `cmd = "sh", args = { "x.sh" }` roda sem ele.
- **Defeito meu corrigido:** o `~` no `cmd` não era expandido (o exemplo do template `~/bin/backup.sh` falhava com "comando não encontrado").
  Agora `~/x.sh` vale no `cmd` (e em `cwd`); nos `args` o `~` continua literal; com `shell = true` a linha de shell é do shell.

### Item 6, fatia 2: processos de vida longa e vigia (19/11/2026) — feito, 305 testes
- **Decisões do dono:** aceita a entrega fatiada (achado B); o prazo de 30 s não basta, importa o que o processo gasta preso; nome melhor que
  `long_life_mode`. **Nome adotado: `service = true`** (conceito conhecido: systemd/Windows Services; curto, `snake_case`). `timeout_ms = false` foi descartado.
- **Medido antes de desenhar (a dúvida do dono estava certa):** lendo `/proc`, um processo dormindo ou esperando leitura gasta **0%** de CPU; um preso
  girando **100%**, inclusive quando o laço está num processo FILHO (`sh -> yes`), pegando a árvore; uma amostra custa ~45 µs. Cuidado: tarefa pesada legítima
  (codificar vídeo) também usa 100%, então o vigia é opt-in por comando.
- **API nova:** `service = true` (sem prazo, uma instância por id, stdin aberto), `h:running()`, `h:stop()`, `h:restart()`, `h:write(texto)` e as formas
  `k.exec.running/stop/restart/write("id")`; `on_error_output(linha)` (stderr separado); `shell = "/bin/bash"` (caminho); `on_output_budget_ms` (2 ms, entrega
  fatiada, fila de 20 000 linhas com descarte avisado, `on_exit` só depois da última linha); vigia `max_cpu = "90%"`, `max_cpu_for_s` (10), `max_memory_mb`.
- **Mais um defeito meu achado e corrigido no caminho:** o prazo e o `stop` matavam só o processo direto, deixando o filho do `sh` rodando solto. Agora o
  comando roda em **grupo de processos próprio** e encerrar derruba o grupo (testado: `sh -> yes` não deixa órfão).
- **Provado:** 15 testes novos (fila fatiada, amostrador de `/proc`, serviço com `cat`, restart, grupo de processos, `stderr` separado, `bash` com chaves,
  60 000 linhas em ordem, vigia matando o girador e o girador-filho e **poupando quem só espera**, vigia de memória, ponte Lua devolvendo booleano). **Na tela:**
  serviço `cat` vivo por F1, `h:write` do Lua abriu a aba com a linha, `h:stop()` encerrou (`parou=true`), vigia matou o `yes` preso depois de 3 s a >60% com o aviso
  `exec "preso" falhou (CPU acima de 60% por 3 s)`; ao fechar o navegador não sobrou `cat` nem `yes` (não isolei o `killAll` de fechamento: o `sess.sh --stop` também derruba
  o escopo inteiro).
- **Limites investigados:** (1) *vigia só no Linux* (`/proc`): no Windows seria outro mecanismo (contadores de desempenho) e não é testável aqui; o limite é ignorado
  com aviso. (2) *descarte quando o fluxo passa de 20 000 linhas pendentes*: documentado e avisado; mudar o teto é uma constante. (3) *o grupo de processos (`detached`)
  não impede órfãos se o KaiaK morrer à força (kill -9)*: só o fechamento normal encerra tudo; viável fechar a brecha com `prctl(PR_SET_PDEATHSIG)`, que o Node não expõe:
  exigiria um passo auxiliar (não feito).

### Item 6, fatia 3: gatilho do prazo, Windows/macOS e os 4 limites (20/11/2026) — 327 testes
- Pedido do dono: preparar Windows/macOS/Linux (vai lançar nos três); o prazo de 30 s deve ser um **gatilho que valida** se o processo está
  enroscado, por consumo/processos; estudar e resolver os limites. (O subagente de risco alto falhou por limite de taxa da Anthropic, ~75 h, sem
  alterar nada; feito na sessão principal.)
- **Gatilho (`src/stuck-check.js`, puro):** ao estourar `timeout_ms`, janela de amostras (`stuck_window_s`=3) de CPU, I/O (`rchar+wchar`; no Windows
  `Read/WriteTransferCount`), conjunto de filhos e bytes de saída. SAUDÁVEL se houver saída nova, I/O >= 4 KB ou filhos mudaram: estende o prazo,
  avisa, e repete até `timeout_max_ms` (600000), quando encerra mesmo assim ("saudável de fachada"). ENROSCADO: CPU >= `stuck_cpu` ("50%") = girando;
  senão parado. `timeout_check = false` = matar direto. Novos nomes: `timeout_check`, `timeout_max_ms`, `stuck_cpu`, `stuck_window_s`, `on_output_queue_max`.
- **Provado (processos reais):** (1) girando sem saída -> encerrado "enroscado: CPU 100% sem saída nem I/O"; (2) `sleep 60` -> "enroscado: parado";
  (3) progresso lento -> "prazo estendido" e terminou sozinho com código 0; (4) CPU alta COM saída (6000 linhas) -> saudável; (5) saudável de fachada
  -> teto duro. **Na tela:** `gira.sh` morto e `prog.sh` estendido (aviso "progresso: passo 1").
- **Multiplataforma (código + fixtures; SEM verificação em SO real):** `exec-platform.js` (Unix: grupo de processos; Windows: `taskkill /T` e `/F` só na
  força, `windowsHide`, `.bat/.cmd` por shell com aspas, `~\x`, ambiente case-insensitive, `shell` com caminho `C:\...`), `platform-sampler.js` (macOS: `ps -A -o pid=,ppid=,rss=,time=`;
  Windows: `Get-CimInstance Win32_Process` -> JSON), parsers testados com saídas realistas. Windows/macOS rodam o runner por adaptadores falsos nos testes.
- **Limites:** (1) vigia só Linux -> **resolvido em código** (ps/CIM), não verificado em SO real; custo de um processo externo por amostra NÃO medido (se
  caro, aumentar o intervalo). (2) descarte de 20 000 linhas -> **configurável** (`on_output_queue_max`). (3) órfãos após `kill -9`: **`setpriv --pdeathsig` testado e NÃO
  resolve** (só alcança o filho direto: os netos `sleep` sobreviveram). Solução implementada: `orphan-registry.js` anota cada grupo (pid + carimbo de início do processo)
  em `exec-pids.json`; no próximo boot encerra o que sobrou COM O MESMO carimbo (não mata quem reaproveitou o pid) e pega o líder morto com netos vivos (Linux,
  `/proc`); aviso "N comando(s) da sessão anterior foram encerrados". Provado de verdade no Linux (sh -> 2 sleeps encerrados, processo alheio poupado). **Limite que
  fica:** os comandos seguem vivos entre o kill -9 e o próximo boot; macOS (`ps lstart`) e Windows (`StartTime`) só por fixture; no Windows o Job Object (matar na
  hora) exigiria código nativo: fora. (4) `killAll`: agora provado por teste automático (serviço `cat` + `sh` com 2 filhos; nada sobra); o gancho `before-quit` é
  uma linha no `main`, não isolada.

## DECISÃO (usuário, 19/11/2026): Vivaldi como REFERÊNCIA de tema e background (fase 3)
O visual do Vivaldi dele (cores, fundo, disposição) é o exemplo para tema/background, e o `kaiak.lua` dele deve reproduzir aquele
visual. Regra de segurança mantida: ao consultar, só a APARÊNCIA (captura de tela, cores e imagem de fundo); nunca cookies, senhas,
sessão ou o perfil em uso para testes (perfis temporários).

### O que foi visto no Vivaldi do dono (19/11/2026, capturas de tela; só aparência, nenhum dado lido)
Aberto com a autorização dele via claudesktop; uma aba nova foi aberta e fechada. Cores amostradas de pixels (aproximadas):
- **Interface:** barra superior e de favoritos `#252734` (ardósia escura); campo de endereço bem mais escuro `#020314`, formato de
  pílula, com borda vermelha quando em foco; trilho de abas à esquerda **só com ícones** (fileira estreita) em `#2b395e` (azul
  fosco); painel direito (downloads) `#1b1c27`; botão ativo do trilho quase branco `#f0f2f7`; página em tema escuro (`#0d1117`).
- **Estrutura:** seletor de áreas de trabalho (workspaces) no canto superior esquerdo; botões de navegação, barra de favoritos
  abaixo da barra de endereço; painel lateral com ícones numa tira vertical na direita; janela com contorno azul `#3986f4`
  (do Hyprland, não do Vivaldi).
- **"Plano de fundo":** a página inicial é **cor lisa `#252734` + uma imagem monocromática grande ao centro** (arte do Spike, de
  Cowboy Bebop) pintada em lavanda `#b2b4dd`, com campo de busca escuro `#020314` acima e atalhos em ícones. Não há imagem de
  fundo atrás da interface: o fundo é cor lisa. Ou seja, o "background" dele é cor + UMA imagem de uma cor só da paleta (o que
  explica o pedido de SVG que acompanhe a paleta do tema).
- **Consequência para o desenho:** `k.background` = cor/gradiente + imagem/SVG centralizado (tamanho, posição, tingimento pela
  cor do tema para imagens de uma cor), na página inicial (`kaiak://start`) e/ou atrás da interface; a decidir com o dono se o
  fundo aparece só na página inicial (como no Vivaldi dele).

## ORDEM VIGENTE (19/11/2026; substitui a anterior; proposta de encaixe, aguardando o OK do usuário)
Critério: 1º o que já está em andamento ou destrava outros itens; 2º o que o usuário vê; 3º o que é independente. Cada item só
começa depois do anterior commitado e provado. Fila, não agenda.

| # | Item | Por que nessa posição |
|---|---|---|
| ~~1~~ | ~~Motor de layout (1a-1d), `keep`, botões, temas nomeados~~ **FEITO** | base de tudo |
| **2** | *(sobras dos temas FEITAS em 19/11: tela de erro e de bloqueio seguem o tema por `?theme=`, chave `scheme = "dark"\|"light"` para barras de rolagem e campos; falta o fundo das views de página já criadas.)* **Tema e background estáticos + tela de boot** (referência: o Vivaldi dele, só aparência) e as sobras dos temas (página de erro/bloqueio, `color-scheme`, fundo das views de página); **`scheme` livre** (pedido do dono, 19/11): além de `dark`/`light`, o `.lua` define o nome que quiser; proposta: separar `color_scheme` (nativo do Chromium: `dark`/`light`, valida) de `scheme` (nome livre do dono, exposto como `data-scheme="nome"` em toda view de interface e nas telas de erro, para o CSS/HTML próprio escolher estilos), e `vars = { nome = "valor" }` do tema virando variáveis CSS `--nome` para o HTML próprio | continuação direta do 1d, pequeno e visível; o `k.theme` já existe |
| **3** | **Scripts da máquina, fatias 1 e 2: `k.exec`** (qualquer executável, sem shell por padrão, `timeout_ms`, saída para aviso/função; depois processos de vida longa) | pequeno, independente, e dá PODER aos botões e teclas; os itens 8 (DevTools com ações próprias) e 11 (KeePassXC) o usam |
| **3b** | **Botões com ações compostas e estado que muda o tema** (pedido do dono, 19/11): `action` aceita uma LISTA executada em ordem (ações nomeadas, funções Lua, `{ exec = ... }` um ou vários comandos, `{ theme = ... }`, `{ open = ... }`); cada estado do botão (`states`) pode ter a sua ação/lista e um `theme` aplicado ao entrar no estado (ex.: botão ◐ com estados dia/noite que troca o tema e roda um comando). Tudo só no `.lua` | precisa do `k.exec` (3) e dos `states` e temas nomeados (feitos); fazer a lista de ações UMA vez, depois do exec, para não refazer a validação |
| **4** | **Páginas `kaiak://`**: downloads, depois cookies e dados de sites, configurações de dados, senhas | pede o 1c (abrir em painel, feito); destino dos botões "configurações/senhas/cookies" |
| **5** | **Não lidos (contador)** + selo embutido na barra/trilha | depende de `kaiak://downloads` (4) |
| **6** | **Barramento de eventos + `k.on` + API de abas** (aba abriu/navegou/fechou, download, tema; `k.notify` e `k.on("notify")` entram aqui) | os scripts do navegador (8), os avisos (7) e as DevTools (9) assinam eventos; fazer uma vez só |
| | **Portão de benchmark do navegador inteiro** (CPU/GPU/fps/RAM com layout, botões, avisos, `kaiak://`, eventos) | o dono disse que "ainda não está pronto"; depois do 6 já tem o suficiente para medir |
| **7** | **Avisos restantes**: animações, presets, pilha `pile`, progresso do download, clique que abre a pasta/painel | independente; usa os eventos do 6 |
| **8** | **Scripts do navegador, fatias 3 e 4**: `k.script` (JS/CSS por padrão de URL, mundo isolado) e ponte página <-> Lua por canal nomeado (só o `.lua` executa; site nunca) | pede o 6; a infraestrutura de injeção é a MESMA das extensões (13), então vem antes delas |
| **9** | **DevTools modulares**: teste do CDP com a DevTools aberta (1º passo), DevTools por aba, barra de módulos como slot, ações de fábrica e do usuário | usa `k.exec` (3), eventos (6) e scripts (8) para as ações próprias |
| **10** | **Segurança pendente**: Referer, popups invasivos (`window.open` só com gesto e nunca para a lista de anúncios), aba anônima por proxy/DNS | independente; popups e Referer ANTES de abrir injeção em páginas (8) seria mais seguro: se o dono preferir, sobe para antes do 8 |
| **11** | **Scripts, fatia 5 (API ampla)**: o que faltar de controle de abas e eventos para o Lua | fecha o escopo "ferramentas muito além de inspeção" |
| **12** | **Trilha de fundo**: extensões (reusa a injeção do 8), senhas via KeePassXC (pode usar `k.exec`), workspaces (hoje FORA do roadmap; precisa de desenho), DRM, atualizações do Electron | grandes e independentes; ordem interna a decidir quando chegar |
| **13** | **Congelar a API `kaiak.*`**, documentar, empacotar, arquivos de tipos para o lua-language-server (Portão 3) | só depois que tudo acima existir |

Mudanças em relação à ordem anterior: (a) tema/background subiu para o 2º lugar (era a trilha de fundo); (b) `k.exec` entrou em 3º;
(c) o barramento de eventos saiu da trilha de fundo e virou o item 6, porque 4 itens dependem dele; (d) scripts do navegador ficam
depois dos eventos e antes das DevTools e das extensões, que reaproveitam a infraestrutura; (e) `autohide` saiu (decisão do dono);
(f) `scheme` livre entrou no item 2 e as ações compostas com estado->tema no 3b (pedidos de 19/11); (g) o portão de benchmark do navegador inteiro foi marcado entre o 6 e o 7.

Dependências em uma linha: 2, 3 independentes; 3 -> 3b; 4 -> 5; 6 -> {7, 8, 9}; 8 -> {9, 12 extensões}; 3 -> {9, 12 KeePassXC}.

## ORDEM VIGENTE v2 (19/11/2026, noite; substitui a "ORDEM VIGENTE" acima; é a fila que o dono mandou seguir; tabela atualizada em 20/11)
**REGRA (dono, 19/11): todo LIMITE vem com investigação.** Quando aparecer um limite, em vez de só citá-lo: investigar uma solução
possível E a viabilidade dessa solução (testando de verdade quando der: custo, riscos, o que o motor suporta), e relatar os dois.
Um item que é só justificativa/explicação (não um limite) não precisa disso.
**REGRA (dono, 19/11): seguir a ordem da fila.** Não pular para um item de baixo porque parece interessante; só adianta um
item se ele for MUITO necessário para o que está na vez (dependência real), e então diz-se o porquê. Ideias novas entram na
posição certa da fila, sem implementar na hora. Tabela de encaixes recentes: **"ready" da página** (a página `kaiak://` avisa o
navegador quando terminou de PINTAR: DOM, imagem decodificada, 2 quadros; usado na troca de tema e na tela de boot) entra
JUNTO do item 4 (tela de boot), que também precisa dele para sumir só com a 1ª aba pintada; o prazo de 2 s continua como rede de
segurança.

Achado novo: faltam recursos BÁSICOS de navegador, que o roadmap nunca listou (conferido no código: nenhuma ocorrência de menu de
contexto, busca na página, zoom, favoritos, histórico, restaurar sessão, impressão, tratamento de erro de certificado). Sem eles o
dono não troca o Vivaldi. Entram como bloco "Uso diário".

**Tabela atualizada em 20/11/2026 com o estado REAL** (riscado = feito e commitado; detalhes, sobras e posições em
"Fila atualizada (20/11/2026)" logo abaixo; o progresso em % está em "Progresso (20/11/2026)").

| # | Item | Estado em 20/11 |
|---|---|---|
| ~~1,2~~ | ~~Layout, botões, temas, página inicial, Speed Dial, widgets, `scheme`~~ | **FEITO** (19/11) |
| ~~3~~ | ~~O `kaiak.lua` do dono com o visual do Vivaldi (cores, trilho só de ícones, página inicial)~~ | **FEITO** (19/11, 214 testes; arte CC0 no lugar da do Spike) |
| ~~4~~ | ~~Tela de boot (`k.boot`) e "pronta" da página~~ | **FEITO** (19/11, 221 testes) |
| ~~5~~ | ~~Uso diário A: erro de certificado, restaurar sessão, Ctrl+F, zoom, menu de contexto, tela cheia, impressão/PDF com tela própria~~ | **FEITO** (19/11, 275 testes); sobras na fila abaixo |
| ~~6~~ | ~~`k.exec` fatias 1, 2 e 3: comandos, `service`, vigia, gatilho do prazo, adaptadores Windows/macOS, órfãos~~ | **FEITO** (20/11, 327 testes); Windows/macOS só por fixture, sem SO real |
| ~~**3b**~~ | ~~Botões com ações compostas e estado que muda o tema~~ | **FEITO** (23/11, 332 testes): `action` aceita lista em ordem (passos independentes, falha avisa só o seu passo); `states.<nome>` aceita `action` e `theme`; o estado só muda por `set_state`; tema do estado inicial vale na abertura. Provado na tela. Sem `wait`/dependência entre passos (decisão do dono) |
| **7** | **`kaiak://`**: downloads, cookies e dados, **histórico e favoritos** (com slot `bookmarks` para a barra de favoritos), configurações de dados, senhas; o esquema e o token de API já existem | o esquema saiu pronto do item 2 |
| **8** | **Marco "dá para trocar de navegador":** senhas via KeePassXC e **workspaces** (desenho FECHADO em 19/11: janela única, privativo é um workspace, dados em JSON, o `.lua` cita por nome, `persist` por workspace) | só começa depois do 3b e do 7 |
| | **Portão de benchmark do navegador inteiro** | depois do marco 8; só quando o dono pedir, em grupos por janela de cota |
| **9** | Barramento de eventos + `k.on` + API de abas; não lidos + selo; avisos restantes | hoje só existe `k.on("start")` |
| **10** | Segurança pendente (Referer, popups, anônima por proxy/DNS), depois scripts do navegador (`k.script`, ponte página <-> Lua) | segurança ANTES da injeção (decisão do dono) |
| **11** | DevTools modulares; scripts, fatia final | |
| **12** | Extensões, DRM, atualizações do Electron | grandes; DRM fora de prioridade |
| **13** | Congelar a API `kaiak.*`, documentar, empacotar, tipos para o lua-language-server | por último |

## Fila atualizada (20/11/2026)
Reescrita com o estado real do código (327 testes passando, último commit do código `72a6f5e`). Regras de sempre: seguir a ordem;
só adiantar por dependência real (dizendo o porquê); ideias novas entram na posição certa, SEM implementar na hora; todo limite
vem com investigação (solução + viabilidade). As sobras abaixo foram tiradas das seções "Fila" e "Limites" deste arquivo, com a
origem citada; quando o texto não fixava a posição, a posição é **proposta do assistente** (marcada assim) e o dono pode mudar.

**Feito (ordem v2):** 1-2 layout, botões, temas, página inicial, Speed Dial e widgets; 3 `kaiak.lua` do dono; 4 tela de boot e
"pronta"; 5 uso diário A (certificado, sessão, Ctrl+F, zoom, menu de contexto, tela cheia, impressão/PDF com tela própria);
6 `k.exec` fatias 1, 2 e 3 (inclui `service`, vigia, `on_error_output`, `shell = "/bin/bash"`, entrega fatiada, gatilho do prazo,
adaptadores Windows/macOS, registro de órfãos, `killAll` provado por teste).

**O que falta, em ordem:**
1. ~~**3b**~~ FEITO (23/11, commit 09c49ab, 332 testes; provado na tela com clique de CDP e de mouse real pelo claudesktop).
1b. **3c — PRÓXIMO (pedido do dono em 23/11: "extremamente necessário"; POSIÇÃO = proposta do assistente, o dono pode mudar).**
   Dependência entre passos da lista de ações, configurável no `.lua`: o passo diz de qual outro depende (`needs`) e o que usa dele
   (resultado ok/falha e, talvez, a saída). Se o passo anterior falha, o dependente é PULADO com UM aviso só ("passo 2 pulado:
   depende do passo 1, que falhou"), em vez de duas falhas; passos sem dependência seguem independentes como hoje. Por que aqui: é o
   remate da lista de ações que acabou de sair, usa o `k.exec` já pronto (precisa esperar o fim do comando e ler código de saída/saída)
   e mexe na mesma validação (`checkActions`); deixar para depois obrigaria a refazer o que o 3b acabou de fixar. Desenho ainda ABERTO
   (decidir na vez, sem inventar): nome dos campos (id do passo, `needs`, `use`), tempo máximo de espera, o que o passo recebe do outro.
2. **Sobra da impressão: pré-visualização na tela de impressão** (origem: "Fila (dono, 19/11): sobras da impressão, depois do
   `k.exec`"; o item 6 da v2 incluía o 3b, por isso vem logo depois dele). Custo já medido: ~25 ms por PDF comum, ~1,8 s e 6,5 MB numa
   página pesada; exige atraso depois de digitar, geração cancelável, só as primeiras páginas, visualizador embutido (memória não medida).
3. **Revisão de tema e layout** (origem: "Fila: cor de seleção no tema" e "Fila: trilho que EMPURRA", ambas "depois do bloco Uso
   diário", que acabou; posição antes do `kaiak://` = **proposta do assistente**): (a) `selection_bg`/`selection_fg` na interface e
   teste de `insertCSS(..., { cssOrigin: 'user' })` nos sites ANTES de prometer; (b) `expand_mode = "push"` como opção (o dono não a
   quer para si), 1ª tarefa = protótipo medindo fps e piscada num site pesado.
4. **7 — `kaiak://`**: downloads, cookies e dados de sites, histórico e favoritos (slot `bookmarks`), configurações de DADOS (inclui a
   escolha de persistência quando o `.lua` não fixa), senhas. Esquema, rotas e token de API já existem.
5. **8 — Marco "dá para trocar de navegador"**: KeePassXC (o dono importa o CSV ele mesmo; o KaiaK lê o Secret Service e preenche sem
   enviar) e workspaces com o desenho FECHADO (janela única; privativo é um workspace; criados no navegador são dados em JSON; o `.lua`
   só cita por nome; `persist` por workspace com padrão `true`).
6. **Portão de benchmark do navegador inteiro** (CPU/GPU/fps/RAM com tudo ligado), só quando o dono pedir, em grupos por janela de cota.
7. **9 — Barramento de eventos + `k.on` + API de abas** (hoje só `k.on("start")`); não lidos + selo embutido; avisos restantes
   (animações, presets, `k.notify`, pilha `pile`, progresso do download, clique que abre a pasta/painel).
8. **10 — Segurança pendente** (Referer com as outras políticas, popups invasivos, anônima por proxy/DNS) e SÓ DEPOIS os scripts do
   navegador (`k.script` em mundo isolado + ponte nomeada página <-> Lua; site nunca alcança `exec`).
9. **11 — DevTools modulares** (1º passo: o CDP funciona com a DevTools aberta?; por aba; barra de módulos como slot; ações de fábrica e
   do usuário) e scripts, fatia final (API ampla).
10. **12 — Extensões, DRM, atualizações do Electron** (MV3 no Electron ainda não verificado; DRM fora de prioridade).
11. **Opcionais "sem urgência"** (o roadmap os deixou "na fila" sem posição; **proposta do assistente:** antes do 13, porque mexem na
    API do `.lua` que o 13 congela; o dono pode puxar qualquer um antes): F11 `toggle_fullscreen` (tela cheia da JANELA) e
    `fullscreen { reveal_edge }` (revelar a barra ao encostar no topo); zoom da interface (`k.zoom { ui = 1.1 }`); menu de contexto
    `style = "custom"` (tema do KaiaK) e `visible = function(ctx)`; prova da tela cheia com `<video>` real (um `.mp4` local).
12. **Dependem de recurso que não existe aqui** (fazer quando houver): intervalo de páginas no diálogo do SISTEMA (`pageRanges`; só
    testável com CUPS/impressora); **verificação do `k.exec` em Windows e macOS REAIS** (adaptadores, vigia por `ps`/CIM, órfãos por
    `lstart`/`StartTime`, custo da amostra externa não medido); tem de acontecer antes do 13, já que o dono vai lançar nos três SOs.
13. **13 — Congelar a API `kaiak.*`**, documentar, empacotar, `kaiak --check`, `--print-config`, tipos para o lua-language-server.

**Registrados como "não feito"/limite, SEM posição na fila** (listados para não se perderem; não implementar sem o dono pedir):
`bg` do slot fixo entre temas (item 1 da v2; caberia no passo 3 acima); fundo das views de página já criadas ao trocar de tema;
ortografia no menu de contexto (o texto diz "junto do passo de idiomas", mas **esse passo não existe na fila**: lacuna);
certificado (detalhes, sinal na barra de host com exceção ativa, exceção por impressão digital); sessão (voltar/avançar, rolagem e
formulários de cada aba); Speed Dial (reordenar, editar, favicon); duas superfícies de aviso no mesmo lugar se sobrepõem; página de
bloqueio personalizável e chave do URLhaus; órfãos vivos entre um `kill -9` e o próximo boot (Job Object do Windows ficou fora).

## Progresso (20/11/2026)
**Método (o MESMO da conta de ~47% feita na conversa de 18/11, que nunca tinha sido gravada aqui):** lista de itens, cada um com um
PESO de esforço relativo (estimativa do assistente, não medição) e a parte pronta; % = pontos prontos / pontos totais. Os 24 itens
antigos mantêm o peso de antes; os itens que surgiram depois (uso diário, `k.exec`, workspaces, eventos, scripts...) entram na mesma
escala. Novidade: a parte pronta agora se divide em **tela** (provado na tela ou medido de verdade), **só teste** (teste automático ou
fixture, sem prova na tela ou sem o SO real) e **pendente**. A tabela é a conta inteira (somas simples das colunas).

| Grupo | Item | Peso | Tela | Só teste | Pendente | Na conta de 47%? |
|---|---|---:|---:|---:|---:|:---:|
| Base | Protótipo Electron + medições (FPS, RAM, benchmarks) | 5 | 5 | 0 | 0 | sim |
| Base | Fase 1: config declarativa, atalhos por tabela, ações | 5 | 5 | 0 | 0 | sim |
| Base | Fase 2: Lua (fengari), última estável, erros no topo, --safe | 8 | 8 | 0 | 0 | sim |
| Base | Abas, trilho, barra de endereço, vim-scroll, descarte | 6 | 6 | 0 | 0 | sim |
| Base | Busca (mecanismos), downloads, tela de erro, aba privada | 6 | 6 | 0 | 0 | sim |
| Segurança | Cookies de terceiros, HTTPS-only, GPC, permissões, esquemas | 4 | 4 | 0 | 0 | sim |
| Segurança | Bloqueio de anúncios/rastreadores/malware + listas | 5 | 5 | 0 | 0 | sim |
| Segurança | Pendentes: Referer completo, popups invasivos, proxy/DNS da anônima | 4 | 0.8 | 0 | 3.2 | sim |
| Avisos | Motor de avisos (tipos, superfícies, estilos, contador, system) | 8 | 8 | 0 | 0 | sim |
| Avisos | Restantes: animações, presets, k.notify/on, pilha, progresso, clique | 5 | 0 | 0 | 5 | sim |
| Avisos | Não lidos: registro, máscaras, readOn, selo embutido | 5 | 0 | 0 | 5 | sim |
| Layout | 1a medir custo de views (Portão 2) | 1 | 1 | 0 | 0 | sim |
| Layout | 1b slots no .lua, ordem de leitura, qualquer borda | 4 | 4 | 0 | 0 | sim |
| Layout | 1c painéis (site/html/arquivo, visible, handles, keep, medição) | 5 | 5 | 0 | 0 | sim |
| Layout | 1d botões (k.button, selos, estados, tinta do tema) | 4 | 3.8 | 0.2 | 0 | sim |
| Layout | Tema nomeado/scheme/vars, fundo da página inicial, tela de boot | 8 | 6.8 | 0 | 1.2 | sim |
| Páginas | kaiak:// downloads, cookies, configurações, senhas (esquema+token prontos) | 8 | 0.8 | 0 | 7.2 | sim |
| DevTools | Modos (right/bottom/window, tamanho) e F12 | 2 | 2 | 0 | 0 | sim |
| DevTools | Por aba + barra de módulos + ações de fábrica/usuário | 8 | 0 | 0 | 8 | sim |
| Fundo | Extensões (MV3 no Electron: não verificado) | 8 | 0 | 0 | 8 | sim |
| Fundo | Senhas via KeePassXC (Secret Service) | 5 | 0 | 0 | 5 | sim |
| Fundo | DRM/Widevine (baixa prioridade) | 4 | 0 | 0 | 4 | sim |
| Fundo | Fase 5: ferramentas (--check, --print-config, tipos LuaLS) | 5 | 0 | 1.25 | 3.75 | sim |
| Fundo | Fase 7: congelar API, documentar, empacotar (Portão 3) | 6 | 0 | 0 | 6 | sim |
| Uso diário | Erro de certificado (cert_exceptions) | 2 | 2 | 0 | 0 | novo |
| Uso diário | Restaurar a sessão | 3 | 3 | 0 | 0 | novo |
| Uso diário | Busca na página (Ctrl+F, Aa, palavra inteira, layout no .lua) | 3 | 3 | 0 | 0 | novo |
| Uso diário | Zoom (níveis, memória por site, Ctrl+scroll) | 2 | 2 | 0 | 0 | novo |
| Uso diário | Menu de contexto configurável | 3 | 3 | 0 | 0 | novo |
| Uso diário | Tela cheia de página (vídeo real de site não testado) | 2 | 1.8 | 0.2 | 0 | novo |
| Uso diário | Impressão/PDF com tela própria (diálogo do sistema sem CUPS: não testado) | 3 | 2.7 | 0.3 | 0 | novo |
| Uso diário | Sobras: prévia de impressão, intervalo no diálogo, F11, revelar barra, zoom da UI, menu custom/visible(ctx), cor de seleção, expand push | 4 | 0 | 0 | 4 | novo |
| Página inicial | kaiak://start + Speed Dial + widgets | 3 | 3 | 0 | 0 | novo |
| Página inicial | kaiak.lua do dono com o visual do Vivaldi | 2 | 2 | 0 | 0 | novo |
| k.exec | Linux: fatias 1-3 (spawn, service, vigia, gatilho do prazo, órfãos, killAll) | 9 | 7.5 | 1.5 | 0 | novo |
| k.exec | Windows/macOS: adaptadores (fixture) + verificação em SO real (pendente) | 3 | 0 | 2 | 1 | novo |
| Botões | 3b: ações compostas e estado que muda o tema | 2 | 2 | 0 | 0 | novo |
| Botões | 3c: dependência entre passos da lista de ações (`needs`, o que usa do outro; pulado com UM aviso) | 3 | 0 | 0 | 3 | novo (peso do assistente) |
| Páginas | Histórico e favoritos (kaiak:// + slot bookmarks) | 5 | 0 | 0 | 5 | novo |
| Marco | Workspaces (desenho fechado, nada construído) | 6 | 0 | 0 | 6 | novo |
| Marco | Portão de benchmark do navegador inteiro | 2 | 0 | 0 | 2 | novo |
| Eventos | Barramento de eventos + k.on amplo + API de abas (hoje só k.on('start')) | 5 | 0 | 0 | 5 | novo |
| Scripts | Scripts do navegador: k.script + ponte página<->Lua | 5 | 0 | 0 | 5 | novo |
| Fundo | Atualizações do Electron | 2 | 0 | 0 | 2 | novo |

| Leitura | Resultado |
|---|---|
| **Escopo atual (44 itens, 198 pontos; recontado em 23/11 com o 3b feito e o 3c novo)** | **54,9% feito** = 52,1% provado na tela + 2,8% só por teste/fixture; **45,1% pendente** (as 4 linhas abaixo são de 20/11 e não foram refeitas) |
| Escopo original (os 24 itens de 18/11, mesmos pesos) | 56,3% (era ~47%) |
| Itens novos (19 itens, 66 pontos) | 51,5% |
| Cada item valendo igual | 58,3% |
| Só uso de dia a dia (base, segurança, avisos, layout, uso diário, página inicial) | 83,3% |

Por grupo: Base 100%, Página inicial 100%, Layout 95%, `k.exec` 92%, Uso diário 82%, Segurança 75%, Avisos 44%, DevTools 20%,
Páginas `kaiak://` 6%, Fundo (extensões, senhas, DRM, ferramentas, congelar API) 4%, e 0% em 3b, workspaces/benchmark, eventos e
scripts do navegador.

**Incertezas e premissas (honestas):**
- Os pesos são do assistente. Extensões (peso 8) seguem sendo o maior risco: MV3 no Electron não foi verificado; se forem inviáveis ou
  caras, o total muda bastante.
- O escopo cresceu de 129 para 195 pontos desde a conta de 47%: por isso o % do escopo atual (54,7%) é MENOR que o do escopo original
  (56,3%). Cada peça nova descoberta derruba o número de novo.
- "Tela" inclui provas com processos reais no Linux e medições (netlog, `/proc`); "só teste" inclui: adaptadores Windows/macOS do
  `k.exec` (só fixture, nenhum SO real), registro de órfãos e `killAll` (teste automático com processos reais, fora da tela), o
  diálogo de impressão do sistema (sem CUPS aqui), tela cheia com vídeo real de site, `--safe`/avisos de chave da fase 5, e três
  detalhes do 1d não provados na tela (clique em botão desabilitado, `states.pressed` automático, SVG por arquivo tingido).
- Frações parciais estimadas: segurança pendente 20% (só o `trim_referrer`); tema/fundo/boot 85% (faltam fundo animado opcional, `bg`
  do slot por tema, fundo das views já criadas); `kaiak://` 10% (esquema, rotas e token prontos, nenhuma das quatro páginas).
- Não é prazo: diz quanto do escopo conhecido está feito, não quanto tempo falta. Workspaces agora entram na conta (antes não entravam).

## DECISÃO (usuário, 19/11/2026): workspaces e persistência de abas
- **Workspaces** (item 8 da ordem v2): vários, **configuráveis pelo `.lua`** (posição do botão seletor, quais existem, aparência etc.),
  mas o CONTEÚDO (abas, links) nasce do USO: nada de listar abas no `.lua`. O Vivaldi do dono tem o seletor no canto superior esquerdo.
- **Persistência das abas** (restaurar ao abrir): configurável pelo `.lua` E nas configurações (`kaiak://settings`, item 7); como
  só o `.lua` manda no layout, a tela de configurações mexe só em DADOS: a regra é `.lua` define o padrão, a tela grava uma escolha
  do usuário que vale quando o `.lua` não fixa (a decidir o desenho exato).
- **Arte da página inicial:** o dono não achou a arte do Spike (Cowboy Bebop, com direitos autorais). Usada uma silhueta CC0 de
  caubói a cavalo (`proto-electron/assets/art/cowboy-silhouette.svg`, origem e licença em `ORIGEM.txt`), pintada com `tint = true`.
  Correção junto: com a busca ligada a arte começa abaixo do campo (antes a cabeça do cavaleiro ficava atrás da busca).

### Workspaces: respostas do dono (19/11/2026, 2ª rodada) e desenho resultante
- O `.lua` define principalmente ONDE FICA O SELETOR (slot de layout, estilo); os workspaces em si NASCEM DO USO (botão "+" no
  seletor: nome, ícone, cor, isolamento). O `.lua` TAMBÉM pode declarar workspaces (`k.workspace("id", {...})`) e ligar um TEMA a cada
  um; tudo configurável por código. Trocar de workspace por botão, por botões direcionais (anterior/próximo), por tecla ou por
  qualquer ação/função do `.lua` (`{ workspace = "id" }`, `next_workspace`, `prev_workspace`, `k.workspace.set("id")`).
- Cada aba pertence a UM workspace. **Isolar** (sessão própria: logins e cookies separados) por `.lua` e pela criação no navegador.
- **A aba privativa é um workspace** (parâmetro `private = true`): sessão só em memória, nunca restaurada nem gravada em disco;
  `private` implica `isolated`. (Opinião do assistente: sim, UM conceito só, com tema próprio e as mesmas formas de trocar.)
- **DECISÃO FINAL sobre persistência (dono, 19/11, depois de rejeitar "gerar Lua" e "editar o kaiak.lua"):** workspaces criados no
  navegador são DADOS (JSON na pasta de dados, ao lado do Speed Dial e das abas); o navegador NUNCA grava Lua. O `.lua` CITA um
  workspace PELO NOME para dar propriedades a ele: `k.workspace("estudo", { theme = "noite", ... })` vale para um workspace que já
  existe nos dados (propriedades aplicadas por cima) e, se ele não existir, o cria como workspace fixo (do código, travado na
  interface). Um dono para cada coisa, sem sincronização. Propriedades isoladas após o workspace já ter abas não mudam a sessão
  (aviso). NÃO existe "fixar no .lua" (correção do dono, 19/11): os workspaces existem FORA do `.lua` e o arquivo apenas os MENCIONA.
- `theme_by` da proposta anterior sai: o tema vem da propriedade `theme` na citação por nome; `k.workspaces{ default_theme }` vale
  para os demais.
- **DESENHO DE WORKSPACES FECHADO (dono, 19/11):**
  1. **Janela única**, como o Vivaldi: todos os workspaces numa janela; trocar só muda as abas do trilho.
  2. **Workspace privativo:** ao fechar a última aba ele some, e também some ao fechar o navegador (nada em disco, nunca restaurado).
  3. **Menção a um nome que não existe nos dados:** o `.lua` CRIA o workspace (travado na interface, porque é código), mas NÃO é a
     fonte primária: existir não exige mencionar no `.lua`; a fonte primária são os criados no navegador.
  4. **Permanência das abas após fechar o navegador** (dono, 19/11): propriedade `persist` POR workspace, configurada no `.lua`
     (citando o workspace pelo nome) e com padrão global em `k.workspaces{ persist = ... }`. `persist = false` = as abas do
     workspace não são guardadas ao fechar o navegador (ele abre vazio). O privativo é sempre `persist = false` (não se muda).
     Também vale a regra já decidida: a tela de configurações (item 7) grava uma escolha do usuário que vale quando o `.lua` não
     fixa o valor. Padrão proposto: `true` (como o Vivaldi), a confirmar.

### Graphify automático (18/11/2026)
Gancho `post-commit` (e checkout/merge/rewrite) do Graphify instalado em TODOS os repositórios de código
(`graphify hook install`), mais `git config --global init.templateDir ~/.git-templates` para repositórios
novos ou clonados. O gancho só atualiza onde já existe `graphify-out/` (testado: repo sem grafo não ganha
nada), roda em segundo plano, só com AST (sem tokens, ~1 s). Mudanças só em docs/imagens são ignoradas.
Fora: `hermes-agent`, `task-observer`, `edl`, `Escrita/Apocalipse` (não são projetos de código próprios).
