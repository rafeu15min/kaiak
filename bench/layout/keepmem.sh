#!/bin/bash
# uso: keepmem.sh <true|false>  -> PSS com o painel aberto, depois de fechar com Ctrl+B, e depois de reabrir
KEEP=$1
./surf.sh "k.layout(\"chat\", { content = { url = \"http://127.0.0.1:8206/panel.html\", partition = \"chat\" }, place = \"right\", size = 380, keep = $KEEP })
local chat = k.layout(\"chat\")
k.bind(\"ctrl+b\", function() chat:toggle() end)" > /dev/null
sleep 12
CG=/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/kk-keep.scope
pss() { t=0; for p in $(cat $CG/cgroup.procs); do v=$(awk '/^Pss:/{print $2}' /proc/$p/smaps_rollup 2>/dev/null); t=$((t+${v:-0})); done; echo "$((t/1024)) MiB, $(wc -l < $CG/cgroup.procs) processos"; }
echo "keep=$KEEP  aberto:   $(pss)"
node ~/.hermes/cache/scratch/key.js 9354 "127.0.0.1:8205" b KeyB 66 2 >/dev/null 2>&1; sleep 4
echo "keep=$KEEP  fechado:  $(pss)"
node ~/.hermes/cache/scratch/key.js 9354 "127.0.0.1:8205" b KeyB 66 2 >/dev/null 2>&1; sleep 4
echo "keep=$KEEP  reaberto: $(pss)"
./dlkeep-stop.sh > /dev/null 2>&1; sleep 2
