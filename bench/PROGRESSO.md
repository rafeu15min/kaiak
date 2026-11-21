# Progresso Fase A (atualizado a cada teste)

Método: `launch.sh NAV TESTE URL` / `finish.sh NAV TESTE` (linhas em `results/resumo.tsv`).
Workspace 8, apps do usuário fechados (autorizado). As listas de estado da máquina (antes e na retomada) ficaram fora da cópia pública.

| navegador | teste | resultado | arquivos |
|---|---|---|---|
| vivaldi | setup-wizard | (1ª execução descartada: perfil em tmp-profiles, assistente inicial) | setup-wizard.* |
| vivaldi | gpu | ver gpu.png | gpu.* |
| vivaldi | speedometer | 19.3 ±0.76 / 19.7 ±0.22 / 19.60 ±0.13 | speedometer-1/2/3.png |
| vivaldi | jetstream | 165.41 (URL com startAutomatically) | jetstream.png |
| vivaldi | motionmark | 906.90 @144fps ±1.43% | motionmark.png |
| vivaldi | basemark | 1709 (23:27:43); recursos recortados até o resultado (instância ficou aberta ociosa até 00:52) | basemark.png, basemark-recorte.txt |
| vivaldi | privacidade | CYT: não protegido, fingerprint único; WebRTC: IP local oculto, IP público exposto (=remoto); canvas 99.98% único; AmIUnique: único entre 5.712.319 | privacidade-*.png |
| vivaldi | gpu (lido) | Canvas/Compositing/Raster/WebGL/WebGPU/Video Decode: HW; Video Encode: software; Vulkan off; ANGLE OpenGL ES 3.2 NVIDIA 615.78.08; ozone wayland | gpu.png |
| qutebrowser | gpu | Canvas/Compositing/Raster/WebGL(2): HW; Vulkan on; WebGPU off; vídeo dec/enc software; GPU in-process; Skia GaneshVulkan | gpu.png |
| qutebrowser | speedometer | 12.0 ±0.51 / 12.2 ±0.25 / 12.23 ±0.12 (média 12.14) | speedometer-1/2/3.png |
| qutebrowser | jetstream | 137.74 | jetstream.png |
| qutebrowser | motionmark | 2235.67 @60fps ±5.12% (alvo 60 fps detectado, não 144) | motionmark.png |
| qutebrowser | basemark | 1602 | basemark.png |
| qutebrowser | privacidade | CYT: não protegido, fingerprint único; WebRTC: IP local oculto, público exposto; canvas 100% único; AmIUnique: único entre 5.712.335 | privacidade-*.png |
| epiphany | gpu | WebGL sim, canvas 2D acelerado, DMABuf HW, GL NVIDIA, raster GPU 2 threads; VBlank Timer 60 Hz | gpu.png, gpu-info.txt |
| epiphany | speedometer | 11.7 ±0.62 / 11.8 ±0.18 / 11.6 ±0.46 (média 11.70; aba GPU restaurada aberta junto) | speedometer-1/2/3.png |
| epiphany | jetstream | 151.77 | jetstream.png |
| epiphany | motionmark | 1487.56 @60fps ±0.66% | motionmark.png |
| epiphany | basemark | 1334 | basemark.png |
| epiphany | privacidade | CYT: proteção forte (bloqueia anúncios e invisíveis), fingerprint único; WebRTC desativado, No Leak; canvas 100% único; AmIUnique único entre 5.712.366 | privacidade-*.png |
| luakit | gpu | aceleração "never" (SHM, composição em software) — forçado: sem WEBKIT_DISABLE_DMABUF_RENDERER=1 o luakit morre com Gdk Error 71; WebGL sim; VBlank Timer 60 Hz | gpu.png, gpu-info.txt |
| luakit | speedometer | 9.97 ±0.42 / 9.94 ±0.14 / 9.977 ±0.084 (média 9.96; recarga com "r") | speedometer-1/2/3.png |
| luakit | jetstream | 142.04 | jetstream.png |
| luakit | motionmark | 702.81 @60fps ±6.83% (composição software) | motionmark.png |
| luakit | basemark | 122 (suspeito: suíte acabou em ~70 s; provável falha dos testes WebGL sem aceleração) | basemark.png |
| luakit | privacidade | CYT: proteção parcial (some gaps), fingerprint único; WebRTC desativado, No Leak; canvas 100% único (= assinatura do Epiphany); AmIUnique único entre 5.712.384 | privacidade-*.png |
| proto-qt | gpu | igual ao qutebrowser: HW (Vulkan, GPU in-process), vídeo em software, Sandboxed false | gpu.png |
| proto-qt | speedometer | 12.3 ±0.56 / 12.60 ±0.094 / 12.5 ±0.28 (média 12.47; recarga pelo botão) | speedometer-1/2/3.png |
| proto-qt | jetstream | 137.99 | jetstream.png |
| proto-qt | motionmark | 2277.32 @60fps ±10.72% | motionmark.png |
| proto-qt | basemark | 1271 (1 execução; qutebrowser com o mesmo motor deu 1602) | basemark.png |
| proto-qt | privacidade | CYT: proteção forte (Yes/Yes; causa não investigada), fingerprint único; WebRTC ativo, IP local oculto, público exposto; canvas 100% (= qutebrowser); AmIUnique único entre 5.712.418 | privacidade-*.png |
| proto-gtk | gpu | igual ao Epiphany: aceleração always, DMABuf HW, GL NVIDIA, raster GPU; VBlank Timer 60 Hz | gpu.png, gpu-info.txt |
| proto-gtk | speedometer | 13.6 ±0.65 / 13.62 ±0.13 / 13.68 ±0.12 (média 13.63; recarga pelo botão) | speedometer-1/2/3.png |
| proto-gtk | jetstream | 155.61 | jetstream.png |
| proto-gtk | motionmark | 1905.89 @60fps ±2.42% | motionmark.png |
| proto-gtk | basemark | 1656 | basemark.png |
| proto-gtk | privacidade | CYT: proteção forte (Yes/Yes), fingerprint único; WebRTC desativado, No Leak; canvas 100% (= Epiphany/luakit); AmIUnique único entre 5.712.456 | privacidade-*.png |
| firefox | gpu | WebRender em GPU, WebGL HW (NVIDIA); compositor nativo e WebGL-DMABUF bloqueados; decodificação de vídeo HW bloqueada; WebGPU nulo; Target Frame Rate 60 | gpu.png, gpu-info.txt |
| firefox | speedometer | 18.0 ±0.66 / 18.35 ±0.17 / 18.37 ±0.15 (média 18.24; 2 abas restauradas em 2º plano) | speedometer-1/2/3.png |
| firefox | jetstream | 108.77 | jetstream.png |
| firefox | motionmark | 529.55 @144fps ±1.56% (alvo 144 fps, como Vivaldi) | motionmark.png |
| firefox | basemark | 1538 | basemark.png |
