#!/bin/bash
# Prova do download sem diálogo + aviso de N ms. uso: dl.sh <popupMs>
# Baixa o mesmo arquivo em duas abas; confere os arquivos gravados e mede, pelo log do processo
# principal, quanto tempo cada aviso ficou na tela.
POPUP=${1:-1000}
D=$(cd "$(dirname "$0")" && pwd); K=$(cd "$(dirname "$0")/../.." && pwd)/proto-electron
T=$(mktemp -d) && mkdir -p $T/cfg $T/srv $T/dl || exit 1
head -c 300000 /dev/urandom > $T/srv/arquivo.bin
printf '%s\n%s\n' "k.downloads { dir = \"$T/dl\" }" "k.notification.type(\"download\", { timeout_ms = $POPUP })" > $T/cfg/kaiak.lua
python3 -m http.server 8205 --bind 127.0.0.1 -d $T/srv >/dev/null 2>&1 & SRV=$!
sleep 1
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=kk-dl --setenv=KAIAK_DEBUG=1 bash -c \"exec $K/node_modules/electron/dist/electron $K --remote-debugging-port=9351 --profile-dir $T/p --config $T/cfg/kaiak.lua --state-dir $T/s --data-dir $T/d --discard-after 0 http://127.0.0.1:8205/arquivo.bin http://127.0.0.1:8205/arquivo.bin > $T/log 2>&1\"', { workspace = '8' })" >/dev/null
sleep ${2:-12}
echo "# arquivos gravados (sem diálogo):"; for f in $T/dl/*; do echo "   $(stat -c %s "$f") $(basename "$f")"; done
echo "# avisos (ms desde o 1º):"
grep "aviso" $T/log | sed 's/.*\[kaiak\] aviso //' | python3 -c "
import sys
rows=[(l.split(' ',2)+['',''])[:3] for l in sys.stdin.read().strip().splitlines()]
t0=int(rows[0][0]) if rows else 0
since={}
for ms,kind,rest in rows:
    ms=int(ms); surf=rest.split(' ')[0]
    if kind=='mostrar:':
        since.setdefault(surf, ms)
    elif kind=='ocultar':
        print(f'  superfície {rest:6} ficou {ms-since.pop(rest, ms)} ms na tela (desde o 1º aviso do ciclo)')
print('  ciclos ainda abertos:', list(since) or 'nenhum')
"
node -e "(async()=>{const v=await (await fetch('http://127.0.0.1:9351/json/version')).json();const ws=new WebSocket(v.webSocketDebuggerUrl);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Browser.close'}));setTimeout(()=>process.exit(0),1500)})()"
sleep 3; systemctl --user stop kk-dl.scope 2>/dev/null; kill $SRV 2>/dev/null; rm -rf $T
