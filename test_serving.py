"""Regression coverage for matching page and asset versions. Run with unittest."""
import hashlib
import http.client
import tempfile
import threading
import unittest
from functools import partial
from pathlib import Path
from http.server import ThreadingHTTPServer

from serve import DemoHandler


class ServingTest(unittest.TestCase):
    def test_asset_versions_change_when_content_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            root.joinpath('index.html').write_text(
                '<link href="styles.css" rel="stylesheet">'
                '<script src="math.js"></script><script src="app.js"></script>'
            )
            for name in ['app.js', 'math.js', 'styles.css']:
                root.joinpath(name).write_text('original')
            server = ThreadingHTTPServer(('127.0.0.1', 0), partial(DemoHandler, directory=directory))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            connection = http.client.HTTPConnection(*server.server_address)
            try:
                connection.request('GET', '/')
                response = connection.getresponse()
                before = response.read().decode()
                self.assertEqual(response.status, 200)
                self.assertEqual(response.getheader('Cache-Control'), 'no-store, max-age=0')
                self.assertEqual(response.getheader('Cloudflare-CDN-Cache-Control'), 'no-store')
                first = hashlib.sha256(b'original').hexdigest()[:16]
                for name in ['app.js', 'math.js', 'styles.css']:
                    self.assertIn(f'{name}?v={first}', before)

                root.joinpath('app.js').write_text('updated')
                connection.request('GET', '/', headers={'If-Modified-Since': 'Tue, 01 Jan 2030 00:00:00 GMT'})
                response = connection.getresponse()
                after = response.read().decode()
                self.assertEqual(response.status, 200)
                second = hashlib.sha256(b'updated').hexdigest()[:16]
                self.assertIn(f'app.js?v={second}', after)
                self.assertIn(f'math.js?v={first}', after)
                self.assertNotEqual(before, after)

                connection.request('GET', f'/app.js?v={second}')
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertEqual(response.read(), b'updated')
                connection.request('GET', '/serve.py')
                response = connection.getresponse()
                self.assertEqual(response.status, 404)
                response.read()
            finally:
                connection.close()
                server.shutdown()
                server.server_close()
                thread.join()


if __name__ == '__main__':
    unittest.main()
