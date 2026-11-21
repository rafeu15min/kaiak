// uso: node key.js <porta> <trecho-da-url-alvo> <key> <code> <vk>   -> injeta rawKeyDown+keyUp via CDP
const [port, match, key, code, vk] = process.argv.slice(2);
(async () => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const t = list.find((x) => x.url.includes(match));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  const ev = (type) => ({ id: type === 'rawKeyDown' ? 1 : 2, method: 'Input.dispatchKeyEvent',
    params: { type, key, code, modifiers: Number(process.argv[7] || 0), windowsVirtualKeyCode: Number(vk), nativeVirtualKeyCode: Number(vk) } });
  ws.onopen = () => { ws.send(JSON.stringify(ev('rawKeyDown'))); ws.send(JSON.stringify(ev('keyUp'))); };
  setTimeout(() => process.exit(0), 1200);
})();
