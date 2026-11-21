// Clica num botão do k.button pelo texto do rótulo/tooltip, por CDP, e informa o que mudou. uso: node click-btn.js <porta> <tooltip-ou-rótulo>
(async () => {
  const [port, name] = process.argv.slice(2);
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const target = list.find((t) => t.url.includes('buttons.html'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const expr = `(() => { const b = [...document.querySelectorAll('.bt')].find((x) => x.title === ${JSON.stringify(name)}); if (!b) return 'botão não encontrado'; b.click(); return 'clicado: ' + b.title; })()`;
  ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  ws.onmessage = async (m) => {
    console.log(JSON.parse(m.data).result.result.value);
    await new Promise((r) => setTimeout(r, 1500));
    const all = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    console.log('alvos:', all.filter((t) => t.type === 'page').map((t) => t.url.replace(/^file:.*\//, 'ui/')).join(' | '));
    process.exit(0);
  };
})();
