// uso: node timeline.js <porta> <segundos>
// Acompanha o texto de TODAS as superfícies de aviso (views notify.html, criadas sob demanda) e imprime quando muda.
(async () => {
  const [port, secs] = process.argv.slice(2);
  const t0 = Date.now();
  const texts = new Map(); // id do alvo -> último texto
  const sockets = new Map();
  let last = null;
  let id = 0;
  const combined = () => [...texts.values()].filter(Boolean).join(' || ');
  const report = () => {
    const now = combined();
    if (now === last) return;
    last = now;
    console.log(`t=${((Date.now() - t0) / 1000).toFixed(1)}s  avisos = ${JSON.stringify(now)}`);
  };
  function attach(target) {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    sockets.set(target.id, ws);
    ws.onopen = () => setInterval(() => ws.send(JSON.stringify({ id: ++id, method: 'Runtime.evaluate',
      params: { expression: 'document.getElementById("items") ? document.getElementById("items").innerText : ""', returnByValue: true } })), 100);
    ws.onmessage = (m) => { texts.set(target.id, JSON.parse(m.data).result?.result?.value ?? ''); report(); };
  }
  async function scan() {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      list.filter((t) => t.url.includes('notify.html') && !sockets.has(t.id)).forEach(attach);
    } catch { /* o navegador ainda não abriu a porta */ }
  }
  setInterval(scan, 50);
  report();
  setTimeout(() => { console.log(`superfícies vistas: ${sockets.size}`); process.exit(0); }, Number(secs) * 1000);
})();
