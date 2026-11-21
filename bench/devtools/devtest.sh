#!/bin/bash
# uso: devtest.sh <nome> "<lua>" -> abre o KaiaK, injeta Ctrl+Shift+I e conta as DevTools; deixa a janela aberta
NAME=$1; LUA=$2
K=$(cd "$(dirname "$0")/../.." && pwd)/proto-electron
T=$(mktemp -d); echo $T > /tmp/kk-t; mkdir -p $T/cfg; printf '%s\n' "$LUA" > $T/cfg/kaiak.lua
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=kk-dev-$NAME $K/node_modules/electron/dist/electron $K --remote-debugging-port=9341 --profile-dir $T/p --config $T/cfg/kaiak.lua --state-dir $T/s --discard-after 0 https://example.org', { workspace = '8' })" >/dev/null
sleep 9
node ~/.hermes/cache/scratch/key.js 9341 example.org I KeyI 73 10
sleep 4
curl -s http://127.0.0.1:9341/json | python3 -c "import sys,json; print('$NAME: devtools abertas =', sum(1 for t in json.load(sys.stdin) if t['url'].startswith('devtools://')))"
