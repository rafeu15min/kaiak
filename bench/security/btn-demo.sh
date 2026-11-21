#!/bin/bash
# Abre o KaiaK com botões de todos os tipos para a prova visual do 1d. Encerrar com dlkeep-stop.sh.
cd ~/.hermes/cache/scratch/sec
./surf.sh "k.layout(\"tb\", { content = \"buttons\", place = \"top\", size = 38 })
k.layout(\"chat\", { content = { url = \"http://127.0.0.1:8206/panel.html\", partition = \"chat\" }, place = \"right\", size = 360, visible = false, keep = false })
k.button(\"novo\", { icon = \"+\", tooltip = \"Nova aba\", slot = \"tb\", action = \"new_tab\" })
k.button(\"svg\", { icon = { svg = \"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='7' fill='#7aa2f7'/></svg>\" }, tooltip = \"icone SVG\", slot = \"tb\", action = \"reload\" })
k.button(\"arq\", { icon = { file = \"$HOME/.hermes/cache/scratch/panels-test/mais.svg\" }, tooltip = \"icone de arquivo\", slot = \"tb\", action = \"focus_address\" })
k.button(\"chat\", { icon = \"💬\", label = \"Chat\", tooltip = \"Painel de chat\", slot = \"tb\", action = { toggle = \"chat\" } })
k.button(\"abrir\", { icon = \"↗\", label = \"No painel\", slot = \"tb\", action = { open = \"http://127.0.0.1:8206/panel.html\", target = \"chat\" } })
k.button(\"aba\", { icon = \"🌐\", label = \"Numa aba\", slot = \"tb\", action = { open = \"http://127.0.0.1:8206/panel.html\" } })
k.button(\"fn\", { icon = \"★\", label = \"Lua\", slot = \"tb\", action = function() k.tabs.open(\"http://127.0.0.1:8205/arquivo.bin\") end })
k.button(\"extra\", { icon = \"⚙\", tooltip = \"extra na barra\", slot = \"bar\", action = \"toggle_devtools\" })
k.button(\"ruim\", { icon = { file = \"/nao/existe.png\" }, slot = \"tb\", action = \"reload\" })
k.button(\"naoexiste\", { icon = \"x\", slot = \"nada\", action = \"reload\" })" > /dev/null
