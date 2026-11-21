import http.server, json, threading, itertools
LOG = []
N = itertools.count(1)
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == '/dump':
            body = json.dumps(LOG).encode(); self.send_response(200); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
        LOG.append({'path': self.path, 'cookie': self.headers.get('Cookie')})
        self.send_response(200)
        if not self.headers.get('Cookie'):
            self.send_header('Set-Cookie', f'sess=v{next(N)}; Path=/')
        body = b'<html><title>t</title><body>ok</body></html>'
        self.send_header('Content-Type', 'text/html'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
http.server.HTTPServer(('localhost', 8204), H).serve_forever()
