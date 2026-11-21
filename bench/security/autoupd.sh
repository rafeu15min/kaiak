#!/bin/bash
# Atualização automática de ponta a ponta: perfil e pasta de dados NOVOS (sem listas). O KaiaK deve
# baixar as listas sozinho e passar a bloquear sem reiniciar.
D=$(cd "$(dirname "$0")" && pwd); K=$(cd "$(dirname "$0")/../.." && pwd)/proto-electron
T=$(mktemp -d); mkdir -p $T/cfg $T/data
printf '%s\n' '-- padrão' > $T/cfg/kaiak.lua
python3 -m http.server 8203 --bind 127.0.0.1 -d $D >/dev/null 2>&1 & SRV=$!
sleep 1
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=kk-upd bash -c \"exec $K/node_modules/electron/dist/electron $K --remote-debugging-port=9344 --profile-dir $T/p --config $T/cfg/kaiak.lua --state-dir $T/s --data-dir $T/data --discard-after 0 http://127.0.0.1:8203/ads.html > $T/log 2>&1\"', { workspace = '8' })" >/dev/null
sleep 4
echo "# t=4s (antes da 1ª verificação): arquivos de lista = $(ls $T/data/blocklists 2>/dev/null | wc -l)"
echo "# aviso na faixa de erros (DOM do banner):"
node -e "(async()=>{const l=await (await fetch('http://127.0.0.1:9344/json')).json();const t=l.find(x=>x.url.includes('banner.html'));const ws=new WebSocket(t.webSocketDebuggerUrl);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'document.getElementById(\"list\").innerText',returnByValue:true}}));ws.onmessage=m=>{console.log(JSON.stringify(JSON.parse(m.data).result.result.value));process.exit(0)}})()"
echo "# antes da atualização, o anúncio passa (lista vazia):"
PORT=9344 node $D/cdp-reasons.js | grep -E "doubleclick|controle"
sleep 22
echo "# t=30s: arquivos baixados:"; ls -la $T/data/blocklists 2>/dev/null | awk 'NR>1 && $9!="." && $9!=".." {print "  ", $5, $9}'
grep -E "lista .* atualizada|falha ao atualizar" $T/log | cut -c1-110
echo "# depois da atualização, SEM reiniciar, o anúncio é bloqueado:"
PORT=9344 node $D/cdp-reasons.js | grep -E "doubleclick|googleadservices|controle"
node -e "(async()=>{const v=await (await fetch('http://127.0.0.1:9344/json/version')).json();const ws=new WebSocket(v.webSocketDebuggerUrl);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Browser.close'}));setTimeout(()=>process.exit(0),1500)})()"
sleep 3; systemctl --user stop kk-upd.scope 2>/dev/null; kill $SRV 2>/dev/null; rm -rf $T
