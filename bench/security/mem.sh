#!/bin/bash
# Compara a RAM ociosa (PSS) de duas versões do KaiaK, com a config padrão e as listas já baixadas.
# uso: mem.sh <rótulo> <pasta-do-proto-electron>
LABEL=$1; K=$2
T=$(mktemp -d) && mkdir -p $T/cfg || exit 1
printf '%s\n' '-- padrão' > $T/cfg/kaiak.lua
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=mem-$LABEL $K/node_modules/electron/dist/electron $K --remote-debugging-port=9370 --profile-dir $T/p --config $T/cfg/kaiak.lua --state-dir $T/s --discard-after 0 https://example.org', { workspace = '8' })" >/dev/null
sleep 14
CG=/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/mem-$LABEL.scope
t=0; n=0; r=0
for p in $(cat $CG/cgroup.procs); do
  v=$(awk '/^Pss:/{print $2}' /proc/$p/smaps_rollup 2>/dev/null); t=$((t+${v:-0})); n=$((n+1))
  tr '\0' ' ' < /proc/$p/cmdline | grep -q -- '--type=renderer' && r=$((r+1))
done
echo "$LABEL: PSS $((t/1024)) MiB, $n processos, $r renderizadores"
node -e "(async()=>{try{const v=await (await fetch('http://127.0.0.1:9370/json/version')).json();const ws=new WebSocket(v.webSocketDebuggerUrl);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Browser.close'}));setTimeout(()=>process.exit(0),1500)}catch(e){process.exit(0)}})()"
sleep 3; systemctl --user stop mem-$LABEL.scope 2>/dev/null; rm -rf $T
