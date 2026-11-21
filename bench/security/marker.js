// Lê o box-shadow calculado da aba ativa de cada trilho aberto. uso: node marker.js <porta>
(async () => {
  const list = await (await fetch(`http://127.0.0.1:${process.argv[2] || 9354}/json`)).json();
  for (const t of list.filter((x) => x.url.includes('rail.html'))) {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    const expr = `JSON.stringify({ place: document.documentElement.dataset.place, sombra: getComputedStyle(document.querySelector('.tab.active') || document.body).boxShadow })`;
    await new Promise((resolve) => {
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
      ws.onmessage = (m) => { console.log(JSON.parse(m.data).result?.result?.value); ws.close(); resolve(); };
    });
  }
  process.exit(0);
})();
