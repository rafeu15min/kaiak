#!/bin/bash
# Abre o KaiaK com log de rede, mede PSS e conexões externas, fecha com Browser.close e lista os hosts externos.
K=$(cd "$(dirname "$0")/../.." && pwd)/proto-electron
T=$(mktemp -d)
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=ab-net $K/node_modules/electron/dist/electron $K --remote-debugging-port=9335 --log-net-log=$T/net.json --profile-dir $T/p --config $T/none.lua --state-dir $T/s --discard-after 0 http://127.0.0.1:8099/idle.html', { workspace = '8' })" >/dev/null
sleep 13
CG=/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/ab-net.scope
pids=$(cat $CG/cgroup.procs | paste -sd'|')
t=0; for p in $(cat $CG/cgroup.procs); do v=$(awk '/^Pss:/{print $2}' /proc/$p/smaps_rollup 2>/dev/null); t=$((t+${v:-0})); done
echo "PSS $((t/1024)) MiB; conexões externas: $(ss -tnp 2>/dev/null | grep -E "pid=($pids)," | grep -vE "127\.0\.0\.1|\[::1\]" | wc -l)"
node -e "(async()=>{const v=await (await fetch('http://127.0.0.1:9335/json/version')).json();const ws=new WebSocket(v.webSocketDebuggerUrl);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Browser.close'}));setTimeout(()=>process.exit(0),1500)})()"
sleep 4
python3 - "$T/net.json" <<'EOF'
import json, sys, collections
raw = open(sys.argv[1]).read()
try:
    d = json.loads(raw)
except Exception:
    d = json.loads(raw.rstrip().rstrip(',') + ']}')
hosts = collections.Counter()
for e in d['events']:
    p = e.get('params') or {}
    for key in ('host', 'url', 'hostname'):
        v = p.get(key)
        if isinstance(v, str) and '127.0.0.1' not in v and 'localhost' not in v:
            hosts[v[:100]] += 1
print("hosts externos no log:", dict(hosts) or "nenhum")
EOF
systemctl --user stop ab-net.scope 2>/dev/null
rm -rf $T
