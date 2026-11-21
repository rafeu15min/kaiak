// uso: node evalt.js <porta> <trecho-da-url> '<js>'
(async () => {
  const [port, match, expr] = process.argv.slice(2);
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const t = list.find((x) => x.url.includes(match));
  if (!t) { console.log('alvo não encontrado:', list.map((x) => x.url.slice(-20)).join(' | ')); process.exit(0); }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  ws.onmessage = (m) => { console.log(JSON.stringify(JSON.parse(m.data).result?.result?.value)); process.exit(0); };
  setTimeout(() => process.exit(0), 4000);
})();
