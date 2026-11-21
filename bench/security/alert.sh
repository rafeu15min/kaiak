#!/bin/bash
# Prova que as regras de download e de alerta são independentes. uso: alert.sh <nome> "<lua>" [segundos]
NAME=$1; LUA=$2; SECS=${3:-6}
K=$(cd "$(dirname "$0")/../.." && pwd)/proto-electron
T=$(mktemp -d) && mkdir -p $T/cfg || exit 1
printf '%s\n' "$LUA" > $T/cfg/kaiak.lua
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=kk-al-$NAME $K/node_modules/electron/dist/electron $K --remote-debugging-port=9360 --profile-dir $T/p --config $T/cfg/kaiak.lua --state-dir $T/s --data-dir $T/d --discard-after 0 https://example.org', { workspace = '8' })" >/dev/null
echo "== $NAME: $LUA"
node $(dirname "$0")/timeline.js 9360 $SECS
node -e "(async()=>{try{const v=await (await fetch('http://127.0.0.1:9360/json/version')).json();const ws=new WebSocket(v.webSocketDebuggerUrl);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Browser.close'}));setTimeout(()=>process.exit(0),1500)}catch(e){process.exit(0)}})()"
sleep 3; systemctl --user stop kk-al-$NAME.scope 2>/dev/null; rm -rf $T
