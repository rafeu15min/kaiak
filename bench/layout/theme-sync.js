// Mede, em ms, quando a página inicial e a interface (buttons.html) ficam com o fundo do tema novo. uso: node theme-sync.js <porta>
(async () => {
  const port = process.argv[2];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const open = async (t) => { const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); return ws; };
  const ask = (ws, expr) => new Promise((resolve) => { const id = Math.floor(Math.random() * 1e9); const on = (m) => { const d = JSON.parse(m.data); if (d.id === id) { ws.removeEventListener('message', on); resolve(d.result?.result?.value); } }; ws.addEventListener('message', on); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); });
  const ui = await open(targets.find((t) => t.url.includes('buttons.html')));
  const start = await open(targets.find((t) => t.url.startsWith('kaiak://start')));
  const bg = (ws) => ask(ws, 'getComputedStyle(document.body).backgroundColor');
  const before = [await bg(ui), await bg(start)];
  const t0 = Date.now(); const seen = {};
  await ask(ui, "[...document.querySelectorAll('.bt')].find((b) => b.title === 'Tema' || b.textContent.includes('Tema')).click()");
  while (Date.now() - t0 < 4000 && Object.keys(seen).length < 2) {
    const [u, s] = [await bg(ui).catch(() => null), await bg(start).catch(() => null)];
    if (u && u !== before[0] && !seen.ui) seen.ui = Date.now() - t0;
    if (s && s !== before[1] && !seen.start) seen.start = Date.now() - t0;
    await new Promise((r) => setTimeout(r, 15));
  }
  console.log('antes:', before.join(' | '), '| mudou em ms:', JSON.stringify(seen));
  process.exit(0);
})();
