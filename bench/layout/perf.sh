#!/bin/bash
# Medições do passo 1c: CPU ociosa, memória de GPU, destruir x esconder uma view, e fps com views animadas.
# uso: perf.sh idle "<n>:<tipo>[:anim] ..."   |   perf.sh action "<keep|hide|destroy> ..."   |   perf.sh fps "<n>[:anim] ..."
# (o modo fps precisa do servidor da sonda: python3 -m http.server 8099 em bench/layout/fps-probe, com o log em server.log)
K=$(cd "$(dirname "$0")/../.." && pwd)
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
CGR=/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice
gpu_mem() { nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | tr -d ' '; }
cpu_usec() { awk '/usage_usec/{print $2}' $CGR/$1.scope/cpu.stat 2>/dev/null; }
pss_mib() { local t=0; for p in $(cat $CGR/$1.scope/cgroup.procs 2>/dev/null); do v=$(awk '/^Pss:/{print $2}' /proc/$p/smaps_rollup 2>/dev/null); t=$((t+${v:-0})); done; echo $((t/1024)); }
launch() { # unit n kind [VAR=valor...]
  local unit=$1 n=$2 kind=$3; shift 3
  local envs=""; for v in "$@"; do envs="$envs --setenv=$v"; done
  hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=$unit$envs $K/proto-electron/node_modules/electron/dist/electron --user-data-dir=$T $K/bench/layout/views.js $n $kind', { workspace = '8' })" >/dev/null
}
stop() { systemctl --user stop $1.scope 2>/dev/null; sleep 2; }
mode=$1; shift
for combo in $1; do
  T=$(mktemp -d); unit=pf-$RANDOM
  case $mode in
  idle) IFS=: read n kind anim <<< "$combo"; g0=$(gpu_mem)
    launch $unit $n $kind "VIEWS_ANIM=$([ "$anim" = anim ] && echo 1 || echo 0)"; sleep 12
    c1=$(cpu_usec $unit); sleep 20; c2=$(cpu_usec $unit); g1=$(gpu_mem)
    echo "n=$n tipo=$kind ${anim:-estatica}: CPU $(awk -v a=$c1 -v b=$c2 'BEGIN{printf "%.1f", (b-a)/20e6*100}')% de 1 núcleo, GPU +$((g1-g0)) MiB, PSS $(pss_mib $unit) MiB"; stop $unit;;
  action) launch $unit 8 ui "VIEWS_ACTION=$combo"; sleep 12; a=$(pss_mib $unit); sleep 17; b=$(pss_mib $unit)
    echo "ação=$combo: PSS antes $a MiB -> depois $b MiB (diferença $((b-a)) MiB), processos $(wc -l < $CGR/$unit.scope/cgroup.procs)"; stop $unit;;
  fps) IFS=: read n anim <<< "$combo"; tag=fps-$n-${anim:-static}-$RANDOM
    launch $unit $n ui "VIEWS_ANIM=$([ "$anim" = anim ] && echo 1 || echo 0)" "VIEWS_PAGE=http://127.0.0.1:8099/index.html?tag=$tag"
    for i in $(seq 40); do sleep 1; grep -q "tag=$tag&" $K/bench/layout/fps-probe/server.log 2>/dev/null && break; done
    echo "n=$n ${anim:-estatica}: $(grep "tag=$tag&" $K/bench/layout/fps-probe/server.log | tail -1 | sed -E 's/.*GET \/r\?//; s/ HTTP.*//' | tr '&' ' ')"; stop $unit;;
  esac
  rm -rf $T
done
