#!/usr/bin/env bash
# Uso: launch.sh NAVEGADOR TESTE URL
# Abre o navegador no perfil temporario dele (~/.cache/kaiak-bench-profiles/NAV), dentro de um scope systemd
# (kaiak-NAV-TESTE.scope), na workspace 8, e inicia a amostragem de PSS/CPU.
set -eu
B=$1; T=$2; URL=$3
BENCH=$(cd "$(dirname "$0")/.." && pwd)/bench
PROTO=$(cd "$(dirname "$0")/.." && pwd)
OUT=$BENCH/results/$B; mkdir -p "$OUT"
# um perfil temporario por navegador, reutilizado entre os testes dele (apagado ao fim do navegador)
P=$HOME/.cache/kaiak-bench-profiles/$B; mkdir -p "$P"   # fora do repo git (o Vivaldi avisa se o perfil estiver num repo)
UNIT=kaiak-$B-$T
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1

case $B in
  vivaldi)   rm -rf "$P/Default/Sessions"  # sem restaurar abas da execucao anterior
             CMD="vivaldi-stable --user-data-dir=$P --no-first-run $URL" ;;
  qutebrowser) CMD="qutebrowser --temp-basedir $URL" ;;
  epiphany)  rm -f "$P/session_state.xml" "$P/session_state.xml~"  # sem restaurar abas da execucao anterior
             CMD="epiphany --profile=$P $URL" ;;  # 51.2 recusa --private-instance junto com --profile
  luakit)    CMD="env WEBKIT_DISABLE_DMABUF_RENDERER=1 XDG_CONFIG_HOME=$P/config XDG_DATA_HOME=$P/data XDG_CACHE_HOME=$P/cache luakit --nounique $URL" ;;  # sem a variavel: 'Gdk: Error 71 (Erro de protocolo)' e fecha (GTK3+NVIDIA)
  firefox)   rm -rf "$P/sessionstore.jsonlz4" "$P/sessionstore-backups"  # sem restaurar abas da execucao anterior
             CMD="firefox --no-remote --new-instance --profile $P $URL" ;;
  proto-qt)  CMD="/usr/bin/python3 $PROTO/proto-qt/kaiak_qt.py --profile-dir $P $URL" ;;
  proto-gtk) CMD="/usr/bin/python3 $PROTO/proto-gtk/kaiak_gtk.py --profile-dir $P $URL" ;;
  *) echo "navegador desconhecido: $B"; exit 1 ;;
esac

{
  echo "== $B / $T  inicio $(date '+%F %T')"
  echo "cmd: $CMD"
  echo "uptime: $(uptime)"
  free -m | sed -n 2p | awk '{print "RAM MiB: total="$2" livre="$4" disponivel="$7}'
  hyprctl monitors | grep -m1 '@' | sed 's/^/monitor: /'
} > "$OUT/$T.log"

date +%s > "$OUT/$T.start"
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=$UNIT $CMD', { workspace = '8' })" >/dev/null

# amostragem a cada 2 s: epoch, PSS kB (soma dos processos do scope), memory.current, cpu usage_usec, n processos
CG=/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/$UNIT.scope
SAMPLES=$OUT/$T-samples.log
echo "# epoch pss_kB memcur_B cpu_usec nprocs" > "$SAMPLES"
nohup bash -c "sleep 3; while [ -e $CG/cgroup.procs ]; do
  pids=\$(cat $CG/cgroup.procs); n=\$(echo \"\$pids\" | wc -w)
  pss=\$(for p in \$pids; do cat /proc/\$p/smaps_rollup 2>/dev/null; done | awk '/^Pss:/{s+=\$2} END{print s+0}')
  echo \"\$(date +%s) \$pss \$(cat $CG/memory.current 2>/dev/null) \$(awk '/usage_usec/{print \$2}' $CG/cpu.stat 2>/dev/null) \$n\" >> $SAMPLES
  sleep 2; done" >/dev/null 2>&1 &
echo "lancado $UNIT perfil=$P"
