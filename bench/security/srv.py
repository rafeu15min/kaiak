import http.server, json, sys, threading
LOG = []
class Page(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        body = b'<html><head><meta name="referrer" content="unsafe-url"></head><body>pagina<img src="http://127.0.0.1:8202/set"><script>setTimeout(()=>{new Image().src="http://127.0.0.1:8202/check?r="+Math.random()},1500)</script></body></html>'
        self.send_response(200); self.send_header('Content-Type','text/html'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
class Third(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith('/dump'):
            body = json.dumps(LOG).encode(); self.send_response(200); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body); return
        LOG.append({'path': self.path.split('?')[0], 'cookie': self.headers.get('Cookie'), 'gpc': self.headers.get('Sec-GPC'), 'referer': self.headers.get('Referer')})
        self.send_response(200)
        if self.path.startswith('/set'): self.send_header('Set-Cookie', 'rastreio=abc123; SameSite=None; Secure; Path=/')
        self.send_header('Content-Type','image/gif'); self.send_header('Content-Length','0'); self.end_headers()
threading.Thread(target=http.server.HTTPServer(('127.0.0.1', 8202), Third).serve_forever, daemon=True).start()
http.server.HTTPServer(('localhost', 8201), Page).serve_forever()
