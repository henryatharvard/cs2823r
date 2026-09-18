#!/usr/bin/env python3
"""Serve only the demo's public assets through the existing Cloudflare tunnel."""
import argparse
import hashlib
import io
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

PUBLIC_PATHS = {'/', '/index.html', '/styles.css', '/math.js', '/app.js'}


class DemoHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = urlsplit(self.path).path
        if path not in PUBLIC_PATHS:
            self.send_error(404, 'Not found')
            return None
        if path in {'/', '/index.html'}:
            root = Path(self.directory)
            html = (root / 'index.html').read_text()

            def version_asset(match):
                asset = match.group(2)
                digest = hashlib.sha256((root / asset).read_bytes()).hexdigest()[:16]
                return f'{match.group(1)}{asset}?v={digest}{match.group(3)}'

            html = re.sub(r'((?:src|href)=")(app\.js|math\.js|styles\.css)(?:\?[^"]*)?(")', version_asset, html)
            body = html.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            return io.BytesIO(body)
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('CDN-Cache-Control', 'no-store')
        self.send_header('Cloudflare-CDN-Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8083)
    args = parser.parse_args()
    handler = partial(DemoHandler, directory=str(Path(__file__).resolve().parent))
    with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        print(f'Distill listening on http://127.0.0.1:{args.port}', flush=True)
        server.serve_forever()
