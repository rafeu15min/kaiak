import http.server, json, sys
PAGE = b"""<!doctype html><meta charset=utf-8><body style="font:14px sans-serif;background:#16322a;color:#d8f5e8;margin:0;padding:14px">
<h3 style="margin:0 0 8px">PAINEL WEB (site)</h3><div id=gpc>GPC=?</div><div id=ponte>ponte=?</div>
<img src="http://blocked.test/x.png" width=1 height=1 onerror="document.getElementById('img').textContent='imagem de blocked.test: BLOQUEADA'" onload="document.getElementById('img').textContent='imagem carregou'">
<div id=img>imagem: ?</div>
<script>fetch('/echo').then(r=>r.json()).then(h=>{document.getElementById('gpc').textContent='Sec-GPC='+h['sec-gpc']});
document.getElementById('ponte').textContent='window.kaiak='+typeof window.kaiak;</script>"""
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith('/echo'):
            body = json.dumps({k.lower(): v for k, v in self.headers.items()}).encode()
            open(sys.argv[2], 'a').write(self.headers.get('Sec-GPC', 'ausente') + '\n')
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(body); return
        self.send_response(200); self.send_header('Content-Type', 'text/html'); self.end_headers(); self.wfile.write(PAGE)
http.server.HTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
