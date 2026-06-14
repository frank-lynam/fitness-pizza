#!/usr/bin/env python3
"""
iOS build server — run this on the MacBook.
Exposes three endpoints over the local network:

    POST /build      Trigger a build (async). Returns 202 or 409 if already building.
    GET  /status     JSON: { state, started, finished, log }
    GET  /download   Stream the latest IPA file.

Usage:
    python3 scripts/ios-server.py [port]     # default port 12346

The build script (scripts/ios-build.sh) must be executable:
    chmod +x scripts/ios-build.sh
"""

import http.server
import json
import os
import subprocess
import threading
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_DIR = SCRIPT_DIR.parent
BUILD_SCRIPT = SCRIPT_DIR / 'ios-build.sh'
IPA_PATH = PROJECT_DIR / 'build/ios/FitnessPizza.ipa'

_lock = threading.Lock()
_status = {
    'state': 'idle',      # idle | building | success | failed
    'started': None,
    'finished': None,
    'log': '',
}


def _run_build():
    try:
        result = subprocess.run(
            ['bash', str(BUILD_SCRIPT)],
            cwd=str(PROJECT_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        log = result.stdout
        state = 'success' if result.returncode == 0 else 'failed'
    except Exception as exc:
        log = str(exc)
        state = 'failed'
    with _lock:
        _status.update({'state': state, 'finished': time.time(), 'log': log})
    print(f'[build] {state}')


class Handler(http.server.BaseHTTPRequestHandler):

    def do_POST(self):
        if self.path != '/build':
            self.send_error(404)
            return
        with _lock:
            if _status['state'] == 'building':
                self._json(409, {'error': 'Build already in progress'})
                return
            _status.update({'state': 'building', 'started': time.time(), 'finished': None, 'log': ''})
        threading.Thread(target=_run_build, daemon=True).start()
        self._json(202, {'status': 'started'})

    def do_GET(self):
        if self.path == '/status':
            with _lock:
                payload = dict(_status)
            self._json(200, payload)

        elif self.path == '/download':
            if not IPA_PATH.exists():
                self._json(404, {'error': 'No IPA available — trigger a build first'})
                return
            size = IPA_PATH.stat().st_size
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Disposition', 'attachment; filename="FitnessPizza.ipa"')
            self.send_header('Content-Length', str(size))
            self.end_headers()
            with open(IPA_PATH, 'rb') as f:
                self.wfile.write(f.read())

        else:
            self.send_error(404)

    def _json(self, code, data):
        body = json.dumps(data, default=str).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f'[{time.strftime("%H:%M:%S")}] ' + (fmt % args))


if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('IOS_BUILD_PORT', 12346))
    server = http.server.HTTPServer(('0.0.0.0', port), Handler)
    print(f'iOS build server listening on :{port}')
    print(f'  POST http://0.0.0.0:{port}/build')
    print(f'  GET  http://0.0.0.0:{port}/status')
    print(f'  GET  http://0.0.0.0:{port}/download')
    server.serve_forever()
