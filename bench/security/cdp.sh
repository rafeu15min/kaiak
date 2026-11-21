#!/bin/bash
# Confirma o MOTIVO das falhas pelo CDP (Network.loadingFailed): net::ERR_BLOCKED_BY_CLIENT = cancelado pelo KaiaK.
D=$(cd "$(dirname "$0")" && pwd); K=$(cd "$(dirname "$0")/../.." && pwd)/proto-electron
T=$(mktemp -d); mkdir -p $T/cfg; printf '%s\n' 'k.blocking { block = { "blocked.test" } }' > $T/cfg/kaiak.lua
python3 -m http.server 8203 --bind 127.0.0.1 -d $D >/dev/null 2>&1 & SRV=$!
sleep 1
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=adb-cdp $K/node_modules/electron/dist/electron $K --remote-debugging-port=9338 --profile-dir $T/p --config $T/cfg/kaiak.lua --state-dir $T/s --discard-after 0 http://127.0.0.1:8203/ads.html', { workspace = '8' })" >/dev/null
sleep 9
node $D/cdp-reasons.js
node -e "(async()=>{const v=await (await fetch('http://127.0.0.1:9338/json/version')).json();const ws=new WebSocket(v.webSocketDebuggerUrl);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Browser.close'}));setTimeout(()=>process.exit(0),1500)})()"
sleep 3; systemctl --user stop adb-cdp.scope 2>/dev/null; kill $SRV 2>/dev/null; rm -rf $T
