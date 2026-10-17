"""Serve diagnostic artifacts read-only on loopback; optional CORS for the lab."""
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from functools import partial
from pathlib import Path
import argparse

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        origin=self.headers.get('Origin')
        if origin in ('http://localhost:8080','http://127.0.0.1:8080'):
            self.send_header('Access-Control-Allow-Origin',origin)
            self.send_header('Vary','Origin')
        self.send_header('Cache-Control','no-store')
        super().end_headers()
    def log_message(self,*args):pass

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--directory',type=Path,default=Path(__file__).resolve().parents[1]/'output/proofs/full-symbol-integrity-2026-10-13');p.add_argument('--port',type=int,default=8091);a=p.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',a.port),partial(Handler,directory=str(a.directory.resolve())))
    print(f'Read-only inspector: http://127.0.0.1:{a.port}',flush=True);server.serve_forever()
