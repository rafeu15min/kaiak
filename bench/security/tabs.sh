#!/bin/bash
D=$(cd "$(dirname "$0")" && pwd); K=$(cd "$(dirname "$0")/../.." && pwd)/proto-electron
T=$(mktemp -d); mkdir -p $T/cfg; printf '%s\n' 'k.blocking { block = { "blocked.test" } }' > $T/cfg/kaiak.lua
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=adb-tabs $K/node_modules/electron/dist/electron $K --remote-debugging-port=9337 --profile-dir $T/p --config $T/cfg/kaiak.lua --state-dir $T/s --discard-after 0 http://blocked.test/', { workspace = '8' })" >/dev/null
sleep 9
curl -s http://127.0.0.1:9337/json | python3 -c "import sys,json; [print(' ',t['type'],'|',t['title'][:40],'|',t['url'][:70]) for t in json.load(sys.stdin) if 'ui/' not in t['url']]"
node -e "(async()=>{const v=await (await fetch('http://127.0.0.1:9337/json/version')).json();const ws=new WebSocket(v.webSocketDebuggerUrl);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Browser.close'}));setTimeout(()=>process.exit(0),1500)})()"
sleep 3; systemctl --user stop adb-tabs.scope 2>/dev/null; rm -rf $T
