import json, sys, collections
# Lê um log de rede do Chromium (--log-net-log) e mostra, por host de teste, os códigos de erro vistos.
# -20 = ERR_BLOCKED_BY_CLIENT (cancelado pelo KaiaK); -105 = nome não resolvido; sem erro = a requisição foi feita.
WATCH = ('doubleclick.net', 'googleadservices.com', 'googlesyndication.com', 'blocked.test', 'example.com')
raw = open(sys.argv[1]).read()
try:
    d = json.loads(raw)
except Exception:
    d = json.loads(raw.rstrip().rstrip(',') + ']}')
url_of = {}
errors = collections.defaultdict(set)
started = collections.Counter()
for e in d['events']:
    p = e.get('params') or {}
    sid = (e.get('source') or {}).get('id')
    url = p.get('url')
    if isinstance(url, str) and sid is not None:
        url_of.setdefault(sid, url)
        host = url.split('/')[2] if '//' in url else url
        if any(host.endswith(w) for w in WATCH):
            started[host] += 1
    if 'net_error' in p and sid in url_of:
        host = url_of[sid].split('/')[2] if '//' in url_of[sid] else ''
        if any(host.endswith(w) for w in WATCH):
            errors[host].add(p['net_error'])
for w in WATCH:
    hosts = sorted({h for h in list(started) + list(errors) if h.endswith(w)})
    if not hosts:
        print(f"  {w:22} nenhum evento de rede")
    for h in hosts:
        print(f"  {h:22} pedidos={started[h]} erros={sorted(errors[h]) or '-'}")
