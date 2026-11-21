#!/bin/bash
# Abre o KaiaK com um .lua dado, dispara 2 downloads e deixa aberto para inspeção/print.
# uso: surf.sh "<lua>"   (encerrar com dlkeep-stop.sh)
K=$(cd "$(dirname "$0")/../.." && pwd)/proto-electron
T=$(mktemp -d) && mkdir -p $T/cfg $T/srv $T/dl || exit 1
echo $T > /tmp/kk-keep
head -c 300000 /dev/urandom > $T/srv/arquivo.bin
printf '%s\n' "k.downloads { dir = \"$T/dl\" }" "k.notification.type { download = { timeout_ms = 60000 }, alert = { timeout_ms = 60000 } }" "$1" > $T/cfg/kaiak.lua
setsid python3 -m http.server 8205 --bind 127.0.0.1 -d $T/srv >/dev/null 2>&1 &
echo $! > $T/srv.pid
sleep 1
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1) WAYLAND_DISPLAY=wayland-1 XDG_RUNTIME_DIR=/run/user/1000
hyprctl dispatch "hl.dsp.exec_cmd('systemd-run --user --scope --collect --unit=kk-keep --setenv=KAIAK_DEBUG=1 bash -c \"exec $K/node_modules/electron/dist/electron $K --remote-debugging-port=9354 --profile-dir $T/p --config $T/cfg/kaiak.lua --state-dir $T/s --data-dir $T/d --discard-after 0 http://127.0.0.1:8205/arquivo.bin http://127.0.0.1:8205/arquivo.bin > $T/log 2>&1\"', { workspace = '8' })" >/dev/null
echo "T=$T"
