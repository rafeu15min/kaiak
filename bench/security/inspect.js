// Inspeciona as superfícies de aviso: texto, elementos criados e se há rolagem indevida.
(async () => {
  const port = process.argv[2] || 9354;
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  for (const t of list.filter((x) => x.url.includes('notify.html'))) {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    const expr = `JSON.stringify({
      linhas: [...document.querySelectorAll('#items > *')].length,
      texto: document.getElementById('items').innerText.slice(0, 160),
      imgs: document.querySelectorAll('img').length,
      scripts: document.querySelectorAll('script:not([src])').length,
      itemsScroll: [document.getElementById('items').scrollHeight, document.getElementById('items').clientHeight],
      viewport: [innerWidth, innerHeight],
      pwned: window.__pwned === true,
    })`;
    await new Promise((resolve) => {
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
      ws.onmessage = (m) => { console.log(JSON.parse(m.data).result?.result?.value); ws.close(); resolve(); };
    });
  }
  process.exit(0);
})();
