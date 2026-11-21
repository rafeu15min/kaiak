#!/bin/bash
# uso: adblock.sh <nome> "<lua>" -> abre o KaiaK com a página de teste + aba blocked.test e lista o que a rede viu
NAME=$1; LUA=$2
D=$(cd "$(dirname "$0")" && pwd)
K=$(cd "$(dirname "$0")/../.." && pwd)/proto-electron
T=$(mktemp -d); mkdir -p $T/cfg; printf '%s\n' "$LUA" > $T/cfg/kaiak.lua
python3 -m http.server 8203 --bind 127.0.0.1 -d $D >/dev/null 2>&1 & SRV=$!
sleep 1
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=adb-$NAME $K/node_modules/electron/dist/electron $K --remote-debugging-port=9336 --log-net-log=$T/net.json --profile-dir $T/p --config $T/cfg/kaiak.lua --state-dir $T/s --discard-after 0 http://127.0.0.1:8203/ads.html http://blocked.test/', { workspace = '8' })" >/dev/null
sleep 12
CG=/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/adb-$NAME.scope
t=0; n=0; for p in $(cat $CG/cgroup.procs); do v=$(awk '/^Pss:/{print $2}' /proc/$p/smaps_rollup 2>/dev/null); t=$((t+${v:-0})); n=$((n+1)); done
echo "== $NAME: PSS $((t/1024)) MiB, $n processos"
node -e "(async()=>{const v=await (await fetch('http://127.0.0.1:9336/json/version')).json();const ws=new WebSocket(v.webSocketDebuggerUrl);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Browser.close'}));setTimeout(()=>process.exit(0),1500)})()"
sleep 4
python3 $D/analyze.py $T/net.json
systemctl --user stop adb-$NAME.scope 2>/dev/null; kill $SRV 2>/dev/null; rm -rf $T
