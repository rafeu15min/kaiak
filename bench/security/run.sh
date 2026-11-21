#!/bin/bash
# uso: run.sh <nome> "<lua da config>"  -> sobe servidores, abre o KaiaK, imprime o log do servidor "terceiro"
NAME=$1; LUA=$2
K=$(cd "$(dirname "$0")/../.." && pwd)/proto-electron
T=$(mktemp -d); mkdir -p $T/cfg; printf '%s\n' "$LUA" > $T/cfg/kaiak.lua
python3 srv.py & SRV=$!
sleep 1
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=sec-$NAME $K/node_modules/electron/dist/electron $K --remote-debugging-port=9334 --profile-dir $T/p --config $T/cfg/kaiak.lua --state-dir $T/state --discard-after 0 http://localhost:8201/pagina?q=segredo', { workspace = '8' })" >/dev/null
sleep 9
echo "== $NAME: log do servidor de terceiros"; curl -s http://127.0.0.1:8202/dump | python3 -m json.tool --compact
echo "== abas:"; curl -s http://127.0.0.1:9334/json | python3 -c "import sys,json; [print(' ',t['url'][:60]) for t in json.load(sys.stdin) if t['url'].startswith('http')]"
systemctl --user stop sec-$NAME.scope; kill $SRV 2>/dev/null; rm -rf $T
