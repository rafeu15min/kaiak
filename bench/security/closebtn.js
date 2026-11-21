// Informa se a faixa de alertas tem o botão "dispensar tudo" e o texto atual. uso: node closebtn.js <porta>
(async () => {
  const list = await (await fetch(`http://127.0.0.1:${process.argv[2] || 9354}/json`)).json();
  for (const t of list.filter((x) => x.url.includes('notify.html'))) {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    const expr = (process.argv[3] === 'click' ? 'document.getElementById("close-all")?.click();' : '') + 'JSON.stringify({ botao: !!document.getElementById("close-all"), texto: document.getElementById("items").innerText.replace(/\\n/g, " | ").slice(0, 120) })';
    await new Promise((resolve) => {
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
      ws.onmessage = (m) => { const v = JSON.parse(m.data).result?.result?.value; if (v && !v.includes('"texto":""')) console.log(v); ws.close(); resolve(); };
    });
  }
  process.exit(0);
})();
