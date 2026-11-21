# KaiaK — Etapa 2, Fase A: benchmarks e privacidade

Máquina: PC de testes (CachyOS, Hyprland/Wayland), monitor DP-1 1920x1080@144 Hz (VRR), NVIDIA GTX 1660 (nvidia-open), 15 GB RAM.
Método: um perfil temporário por navegador, workspace 8, apps do usuário fechados (autorizado), um navegador por vez, sem extensões.
RAM = pico de PSS (soma dos processos do scope systemd); CPU = tempo de CPU do scope / tempo de parede (100% = 1 núcleo).
Registros brutos: `results/<navegador>/` e `results/resumo.tsv`; andamento por teste em `PROGRESSO.md`; scripts `launch.sh` e `finish.sh`.

## 1. Desempenho (maior = melhor)

| Navegador | Motor | Speedometer 3.1 (média de 3) | JetStream 3 | MotionMark 1.3.2 | Basemark Web 3 |
|---|---|---|---|---|---|
| Vivaldi (referência de peso: Chromium completo) | Chromium | **19,53** | **165,41** | 906,90 @144 fps | **1709** |
| Firefox 158 (referência de motor leve: Gecko) | Gecko | 18,24 | 108,77 | 529,55 @144 fps | 1538 |
| proto-gtk (KaiaK, GTK4) | WebKitGTK 2.54 | 13,63 | 155,61 | 1905,89 @60 fps | 1656 |
| proto-qt (KaiaK, PySide6) | Qt WebEngine (Chromium 140) | 12,47 | 137,99 | 2277,32 @60 fps | 1271 |
| qutebrowser 3.7.0 | Qt WebEngine (Chromium 140) | 12,14 | 137,74 | 2235,67 @60 fps | 1602 |
| Epiphany 51.2 | WebKitGTK 2.54 | 11,70 | 151,77 | 1487,56 @60 fps | 1334 |
| luakit 2.4.0 | WebKitGTK 2.54 (composição em software) | 9,96 | 142,04 | 702,81 @60 fps | 122 (suspeito) |

Speedometer, por rodada (3 rodadas): Vivaldi 19,3 / 19,7 / 19,60; Firefox 18,0 / 18,35 / 18,37; proto-gtk 13,6 / 13,62 / 13,68; proto-qt 12,3 / 12,60 / 12,5; qutebrowser 12,0 / 12,2 / 12,23; Epiphany 11,7 / 11,8 / 11,6; luakit 9,97 / 9,94 / 9,977.

### Como ler
- **MotionMark não é comparável entre linhas de 144 fps e de 60 fps.** O teste ajusta a complexidade ao alvo de quadros detectado. Só Vivaldi e Firefox ficaram em 144 fps; Qt WebEngine e WebKitGTK ficaram em 60 fps neste monitor de 144 Hz (WebKitGTK: "VBlank Timer 60 Hz" na página de GPU). Compare 144 com 144 e 60 com 60.
- **Qt e WebKitGTK renderizarem a 60 fps num monitor de 144 Hz é um achado de fluidez, e não só de benchmark.** Causa não investigada (hipóteses: o alvo de quadros do compositor do Qt/WebKit sob Wayland/VRR; flag ou variável de ambiente ausente).
- **Qt WebEngine (mesmo motor base do Vivaldi) ficou 36–38% abaixo do Vivaldi no Speedometer** (12,1–12,5 contra 19,5). Causa não investigada (versão do motor, flags do Qt, caminho de GPU Vulkan x GL).
- Uma execução por teste, exceto o Speedometer (3). Há ruído; diferenças pequenas não são conclusivas.
- O luakit só abriu com `WEBKIT_DISABLE_DMABUF_RENDERER=1` (sem ela, "Gdk Error 71"), então rodou com composição em software; as notas dele estão distorcidas e o Basemark (122, suíte acabou em ~70 s) provavelmente falhou nos testes WebGL.
- Epiphany tinha uma aba (GPU) restaurada aberta durante o Speedometer; Firefox tinha 2 abas restauradas em segundo plano.

## 2. Aceleração gráfica (página de GPU de cada motor)

| Navegador | Estado |
|---|---|
| Vivaldi | Canvas/Compositing/Raster/WebGL/WebGPU/Decodificação de vídeo: hardware; codificação de vídeo: software; Vulkan desligado; ANGLE OpenGL ES 3.2 NVIDIA 615.78.08; ozone wayland |
| qutebrowser / proto-qt | Canvas/Compositing/Raster/WebGL(2): hardware; Vulkan ligado; WebGPU desligado; vídeo (dec/enc) em software; GPU in-process; Skia GaneshVulkan |
| Epiphany / proto-gtk | WebGL sim, canvas 2D acelerado, DMABuf em hardware, GL NVIDIA, raster em GPU; VBlank Timer 60 Hz |
| luakit | aceleração "never" (SHM, composição em software), forçado por `WEBKIT_DISABLE_DMABUF_RENDERER=1` |
| Firefox | WebRender em GPU, WebGL em hardware (NVIDIA); compositor nativo e WebGL-DMABUF bloqueados; decodificação de vídeo em hardware bloqueada; WebGPU nulo; alvo de 60 fps |

Nota: o vídeo é decodificado em **software** no Qt WebEngine e no Firefox (o Vivaldi decodifica em hardware). Isso deve pesar em reprodução prolongada (YouTube, player da FAMEF); é uma expectativa, ainda não medida.

## 3. Memória e CPU por teste (PSS pico / CPU média)

| Navegador | Speedometer | JetStream | MotionMark | Basemark |
|---|---|---|---|---|
| Vivaldi | 1350 MiB / 61,2% | 1921 MiB / 60,6% | 919 MiB / 121,0% | 894 MiB / 20,1% (*) |
| Firefox | 2101 MiB / 84,3% | 2923 MiB / 95,9% | 1475 MiB / 114,0% | 1871 MiB / 100,5% |
| proto-gtk | 1113 MiB / 123,2% | 3170 MiB / 88,5% | 918 MiB / 156,1% | 1047 MiB / 84,3% |
| proto-qt | 963 MiB / 73,1% | 1922 MiB / 96,3% | 879 MiB / 119,8% | 1052 MiB / 59,1% |
| qutebrowser | 1069 MiB / 57,5% | 1984 MiB / 98,4% | 1003 MiB / 126,5% | 1220 MiB / 65,6% |
| Epiphany | 1960 MiB / 86,7% | 4474 MiB / 90,1% | 945 MiB / 76,9% | 1043 MiB / 23,3% |
| luakit | 776 MiB / 84,4% | 3886 MiB / 97,1% | 518 MiB / 77,8% | 623 MiB / 60,5% |

(*) Vivaldi/Basemark: a instância ficou aberta ociosa até 00:52 e os recursos foram recortados até o resultado; a CPU média ficou diluída.
Os três navegadores WebKitGTK têm pico alto no JetStream (3,2 a 4,5 GB). Processos do WebKit que sobram depois de fechar a aba podem inflar esses valores (limitação já conhecida do protótipo GTK).
Os picos são de testes de estresse com uma aba; não representam o uso real com várias abas (isso é a Fase B).

## 4. Privacidade

| Navegador | Cover Your Tracks | WebRTC (BrowserLeaks) | Canvas | AmIUnique |
|---|---|---|---|---|
| Vivaldi | não protegido; fingerprint único | IP local oculto, IP público exposto (= IP remoto) | 99,98% único | único entre 5.712.319 |
| qutebrowser | não protegido; fingerprint único | IP local oculto, público exposto | 100% único | único entre 5.712.335 |
| Epiphany | proteção forte (anúncios e invisíveis); fingerprint único | desativado, sem vazamento | 100% único | único entre 5.712.366 |
| luakit | proteção parcial; fingerprint único | desativado, sem vazamento | 100% único (= Epiphany) | único entre 5.712.384 |
| proto-qt | **não protegido** (reteste em 18/11: No/No, fingerprint quase único; a leitura anterior "forte" era inválida) | ativo, IP local oculto, público exposto | 100% único (= qutebrowser) | único entre 5.712.418 |
| proto-gtk | proteção forte (causa não investigada); fingerprint único | desativado, sem vazamento | 100% único | único entre 5.712.456 |
| Firefox 158 | proteção parcial (anúncios e invisíveis); fingerprint único | IP local oculto, IP público exposto (= IP remoto) | 100% único (assinatura 0C786B20…6032) | único entre 5.712.957 |

Notas:
- Todos os navegadores têm fingerprint único; é esperado num perfil de PC com uma configuração específica.
- A "proteção forte" do proto-qt era uma leitura inválida: o reteste mostrou "não protegido", igual ao qutebrowser (mesmo motor). A do proto-gtk ainda não foi revalidada (reteste planejado depois das mitigações de privacidade).
- O IP "público exposto" no WebRTC é o mesmo IP que o site já vê pela conexão (não é vazamento adicional); o que importa é o IP **local** estar oculto.
- Os screenshots de WebRTC contêm o IP público do usuário: ficam fora do git (`.gitignore`).
- Cópia pública: a barra de status no rodapé dos screenshots de tela inteira foi apagada (mostrava o IP da rede local), e os `privacidade.log` brutos ficaram de fora (alguns tinham o IP público); os números desta seção vêm deles.
- O recurso medido no teste de privacidade do Firefox (parede 14754 s) não vale: a instância ficou aberta por horas depois que o agente anterior foi interrompido pelo limite de taxa.

## 5. O que NÃO foi medido (e por quê)
- Fase B (RAM com 15 a 20 abas, descarte de abas, os 4 sites do usuário: player FAMEF, YouTube, portfolio, Anubis) e Fase C (FAMEF com login): ainda não rodadas.
- Extensões (MV3), abas laterais que expandem ao passar o mouse e DRM (Widevine) ainda não têm código nem teste.
- Basemark Web 3.0 rodou em https://web.gpuscore.com/; uma execução por navegador.
- Falkon não foi testado (pacote bloqueado por `-Syu` pendente).
- Causas dos 60 fps no Qt/WebKit e da diferença de 36–38% do Qt no Speedometer: hipóteses não verificadas.

## 6. Pedidos de melhora do usuário (próximo ciclo)
1. Resolução e taxa de quadros: investigar por que Qt WebEngine e WebKitGTK ficam em 60 fps no monitor de 144 Hz.
2. Melhorar os benchmarks (mais execuções, medir fluidez e quadros perdidos, repetir com abas em segundo plano).
3. Melhorar a privacidade das duas versões (proto-qt e proto-gtk): WebRTC no Qt, proteção de rastreadores, e entender por que o Cover Your Tracks mostra "forte" nelas.
