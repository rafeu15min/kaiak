#!/bin/bash
# Prova de isolamento da navegação anônima. O servidor local entrega um cookie a quem chega sem cookie
# e registra o Cookie de cada pedido. Sequência (cada passo tem um resultado esperado):
#  1 normal1 (sem cookie, ganha N)   2 privA (SEM cookie: não vê o N)   3 privB (COM cookie da privada: jar compartilhado)
#  4 fecha privB (privA continua)    5 fecha privA (última: apaga)       6 privD (SEM cookie: foi apagado)
#  7 normC (COM cookie N: a sessão normal não foi tocada)
D=$(cd "$(dirname "$0")" && pwd); K=$(cd "$(dirname "$0")/../.." && pwd)/proto-electron; KEY=$HOME/.hermes/cache/scratch/key.js
T=$(mktemp -d); mkdir -p $T/cfg
cat > $T/cfg/kaiak.lua <<'LUA'
k.bind("ctrl+shift+a", function() k.tabs.open("http://localhost:8204/privA", true) end)
k.bind("ctrl+shift+b", function() k.tabs.open("http://localhost:8204/privB", true) end)
k.bind("ctrl+shift+d", function() k.tabs.open("http://localhost:8204/privD", true) end)
k.bind("ctrl+shift+c", function() k.tabs.open("http://localhost:8204/normC") end)
LUA
python3 $D/cookie.py & SRV=$!
sleep 1
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=kk-priv $K/node_modules/electron/dist/electron $K --remote-debugging-port=9342 --profile-dir $T/p --config $T/cfg/kaiak.lua --state-dir $T/s --discard-after 0 http://localhost:8204/normal1', { workspace = '8' })" >/dev/null
sleep 9
send() { node $KEY 9342 "$1" "$2" "$3" "$4" "$5"; sleep 3; }
send normal1 A KeyA 65 10      # 2 privA
send normal1 B KeyB 66 10      # 3 privB
send privB w KeyW 87 2         # 4 fecha privB
send privA w KeyW 87 2         # 5 fecha privA (última privada)
sleep 2
send normal1 D KeyD 68 10      # 6 privD
send normal1 C KeyC 67 10      # 7 normC
curl -s http://localhost:8204/dump | python3 -c "
import sys, json
for e in json.load(sys.stdin):
    if 'favicon' in e['path']: continue
    print(f\"  {e['path']:10} cookie = {e['cookie']}\")"
echo "# itens de sessão privada gravados no perfil em disco:"; find $T/p -ipath "*kaiak-private*" 2>/dev/null | wc -l
node -e "(async()=>{const v=await (await fetch('http://127.0.0.1:9342/json/version')).json();const ws=new WebSocket(v.webSocketDebuggerUrl);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Browser.close'}));setTimeout(()=>process.exit(0),1500)})()"
sleep 3; systemctl --user stop kk-priv.scope 2>/dev/null; kill $SRV 2>/dev/null; rm -rf $T
