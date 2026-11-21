#!/usr/bin/env bash
# Uso: finish.sh NAVEGADOR TESTE
# Chamado assim que o resultado aparece na tela: registra pico de PSS, pico do
# cgroup e CPU media (tempo de CPU do scope / tempo de parede desde o lancamento),
# depois fecha o navegador (systemctl stop no scope). O perfil ~/.cache/kaiak-bench-profiles/NAV e
# apagado a mao ao terminar todos os testes daquele navegador.
set -u
B=$1; T=$2
BENCH=$(cd "$(dirname "$0")/.." && pwd)/bench
OUT=$BENCH/results/$B; UNIT=kaiak-$B-$T
CG=/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/$UNIT.scope
now=$(date +%s); start=$(cat "$OUT/$T.start")
cpu=$(awk '/usage_usec/{print $2}' "$CG/cpu.stat")
peak=$(cat "$CG/memory.peak")
psspk=$(awk '!/^#/ && $2>m{m=$2} END{print m+0}' "$OUT/$T-samples.log")
nsamp=$(grep -vc '^#' "$OUT/$T-samples.log")
line=$(awk -v b="$B" -v t="$T" -v w=$((now-start)) -v c="$cpu" -v pk="$peak" -v ps="$psspk" -v n="$nsamp" \
  'BEGIN{printf "%s\t%s\tparede_s=%d\tcpu_s=%.1f\tcpu_media_%%core=%.1f\tpss_pico_MiB=%.0f\tcgroup_pico_MiB=%.0f\tamostras=%d\n", b,t,w,c/1e6,(c/1e4)/w,ps/1024,pk/1048576,n}')
echo "$line" | tee -a "$OUT/$T.log" >> "$BENCH/results/resumo.tsv"
echo "$line"
# fechamento gracioso: SIGTERM so no processo raiz do scope (pai fora do scope),
# espera ate 15 s o navegador encerrar os filhos; o que sobrar, systemctl stop.
procs=$(cat "$CG/cgroup.procs")
for p in $procs; do
  echo "$procs" | grep -qx "$(ps -o ppid= -p "$p" | tr -d ' ')" || kill -TERM "$p" 2>/dev/null
done
for i in $(seq 15); do [ -e "$CG/cgroup.procs" ] && [ -n "$(cat "$CG/cgroup.procs" 2>/dev/null)" ] && sleep 1; done
systemctl --user stop "$UNIT.scope" 2>/dev/null
sleep 2
echo "fim $(date '+%F %T')" >> "$OUT/$T.log"
