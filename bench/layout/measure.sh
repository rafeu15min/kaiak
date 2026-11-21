#!/bin/bash
# Mede PSS (MiB) e processos de views.js para cada combinação. uso: measure.sh "<n>:<tipo> <n>:<tipo> ..."
# Rodar na sessão gráfica do usuário (Hyprland); cada medição abre a janela no workspace 8 e a fecha.
K=$(cd "$(dirname "$0")/../.." && pwd)
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
for combo in $1; do
  n=${combo%%:*}; kind=${combo##*:}; unit=lv-$n-$kind-$RANDOM
  T=$(mktemp -d)
  hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=$unit $K/proto-electron/node_modules/electron/dist/electron --user-data-dir=$T $K/bench/layout/views.js $n $kind', { workspace = '8' })" >/dev/null
  sleep 12
  CG=/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/$unit.scope
  total=0; procs=0; renderers=0
  for p in $(cat $CG/cgroup.procs 2>/dev/null); do
    v=$(awk '/^Pss:/{print $2}' /proc/$p/smaps_rollup 2>/dev/null); total=$((total+${v:-0})); procs=$((procs+1))
    tr '\0' ' ' < /proc/$p/cmdline | grep -q -- '--type=renderer' && renderers=$((renderers+1))
  done
  echo "n=$n tipo=$kind PSS=$((total/1024))MiB processos=$procs renderizadores=$renderers"
  systemctl --user stop $unit.scope 2>/dev/null; sleep 1; rm -rf $T
done
