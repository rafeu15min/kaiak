// Mede, numa página kaiak://start recarregada: fim do carregamento (load) x marcador "pronta" (console), em ms.
(async () => {
  const port = process.argv[2];
  const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.url.startsWith('kaiak://start'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const marks = {}; let t0 = 0;
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.args?.[0]?.value === 'kaiak:ready') marks.ready = Math.round(d.params.timestamp - t0);
  };
  ws.send(JSON.stringify({ id: 1, method: 'Page.enable' })); ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
  await new Promise((r) => setTimeout(r, 300));
  t0 = Date.now(); ws.send(JSON.stringify({ id: 3, method: 'Page.reload' }));
  await new Promise((r) => setTimeout(r, 2500));
  const ev = await new Promise((resolve) => { ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 9) resolve(d.result.result.value); }; ws.send(JSON.stringify({ id: 9, method: 'Runtime.evaluate', params: { expression: 'performance.timeOrigin + performance.getEntriesByType("navigation")[0].loadEventEnd', returnByValue: true } })); });
  marks.load = Math.round(ev - t0);
  console.log('ms desde o reload:', JSON.stringify(marks), marks.ready && marks.load ? `-> o marcador chega ${marks.ready - marks.load} ms depois do load` : '');
  process.exit(0);
})();
