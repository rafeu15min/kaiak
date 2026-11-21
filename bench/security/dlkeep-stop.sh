#!/bin/bash
# Encerra e limpa o que dlkeep.sh deixou aberto.
T=$(cat /tmp/kk-keep 2>/dev/null) || exit 0
node -e "(async()=>{try{const v=await (await fetch('http://127.0.0.1:9354/json/version')).json();const ws=new WebSocket(v.webSocketDebuggerUrl);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Browser.close'}));setTimeout(()=>process.exit(0),1500)}catch(e){process.exit(0)}})()"
sleep 2; systemctl --user stop kk-keep.scope 2>/dev/null
kill "$(cat $T/srv.pid 2>/dev/null)" 2>/dev/null
rm -rf "$T" /tmp/kk-keep
echo parado
