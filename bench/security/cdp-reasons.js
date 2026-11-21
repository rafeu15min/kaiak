// Recarrega a página de teste com Network habilitado e imprime o motivo de cada pedido que falhou.
(async () => {
  const list = await (await fetch(`http://127.0.0.1:${process.env.PORT || 9338}/json`)).json();
  const page = list.find((t) => t.type === 'page' && t.url.includes('ads.html'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const urls = {};
  const lines = [];
  let id = 0;
  const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.method === 'Network.requestWillBeSent') urls[msg.params.requestId] = msg.params.request.url;
    if (msg.method === 'Network.loadingFailed') {
      lines.push(`  ${(urls[msg.params.requestId] || '?').slice(0, 45).padEnd(46)} ${msg.params.errorText}${msg.params.blockedReason ? ' (' + msg.params.blockedReason + ')' : ''}`);
    }
    if (msg.method === 'Network.loadingFinished') lines.push(`  ${(urls[msg.params.requestId] || '?').slice(0, 45).padEnd(46)} ok`);
  };
  ws.onopen = () => { send('Network.enable'); send('Page.enable'); send('Page.reload', { ignoreCache: true }); };
  setTimeout(() => { console.log([...new Set(lines)].join('\n')); process.exit(0); }, 6000);
})();
