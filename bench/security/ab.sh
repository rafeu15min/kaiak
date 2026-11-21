#!/bin/bash
# uso: ab.sh <nome> "<flags extras>" -> PSS total, nº de processos e conexões externas após 12 s
NAME=$1; FLAGS=$2
K=$(cd "$(dirname "$0")/../.." && pwd)/proto-electron
T=$(mktemp -d)
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=ab-$NAME $K/node_modules/electron/dist/electron $K $FLAGS --profile-dir $T/p --config $T/none.lua --state-dir $T/s --discard-after 0 http://127.0.0.1:8099/idle.html', { workspace = '8' })" >/dev/null
sleep 12
CG=/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/ab-$NAME.scope
t=0; n=0; for p in $(cat $CG/cgroup.procs); do v=$(awk '/^Pss:/{print $2}' /proc/$p/smaps_rollup 2>/dev/null); t=$((t+${v:-0})); n=$((n+1)); done
pids=$(cat $CG/cgroup.procs | paste -sd'|')
ext=$(ss -tnp 2>/dev/null | grep -E "pid=($pids)," | grep -vE "127\.0\.0\.1|\[::1\]" | wc -l)
echo "$NAME: PSS $((t/1024)) MiB, $n processos, conexões externas: $ext"
systemctl --user stop ab-$NAME.scope; sleep 1; rm -rf $T
