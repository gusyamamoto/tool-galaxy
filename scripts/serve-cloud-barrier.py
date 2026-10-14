"""Development-only loopback static server + bounded two-context barrier.
No Supabase, database, Auth credentials or domain writes. Standard library only.
Run manually at the SAME port/origins as the existing diagnostic after stopping
the previous local server. Never deploy this server.
"""
import argparse
import functools
import http.server
import json
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def validate_plan(plan, port):
    if set(plan) != {'format', 'barrierVersion', 'prior', 'operationId', 'planId'} or plan['format'] != 'cosmifold-phase-b-barrier' or plan['barrierVersion'] != 1:
        raise ValueError('Invalid barrier plan')
    prior = plan['prior']
    if set(prior) != {'fixture', 'format', 'operationId', 'planId', 'recoveryVersion', 'winner'} or prior['format'] != 'cosmifold-phase-b-concurrent-recovery' or prior['recoveryVersion'] != 1 or prior['winner'] not in ('left', 'right'):
        raise ValueError('Invalid prior plan')
    f = prior['fixture']
    if set(f) != {'format', 'fixtureVersion', 'scope', 'leftOrigin', 'rightOrigin', 'operations'} or f['format'] != 'cosmifold-phase-b' or f['fixtureVersion'] != 1:
        raise ValueError('Invalid fixture')
    if set(f['scope']) != {'ownerUserId', 'universeId'} or set(f['operations']) != {'seed', 'left', 'right', 'identical', 'newer'}:
        raise ValueError('Invalid identities')
    ids = [f['scope']['universeId'], *f['operations'].values(), prior['operationId'], prior['planId'], plan['operationId'], plan['planId']]
    for identity in [f['scope']['ownerUserId'], *ids]:
        if str(uuid.UUID(identity)) != identity:
            raise ValueError('Invalid UUID')
    if len(set(ids)) != len(ids):
        raise ValueError('Reused identity')
    for origin in (f['leftOrigin'], f['rightOrigin']):
        u = urlsplit(origin)
        if u.scheme != 'http' or u.hostname not in ('127.0.0.1', 'localhost') or u.port != port or u.path or u.query or u.fragment or u.username or u.password:
            raise ValueError('Exact loopback origins on this server required')
    if f['leftOrigin'] == f['rightOrigin']:
        raise ValueError('Independent origins required')


class Barrier:
    def __init__(self, port, clock=time.monotonic, wall=time.time):
        self.port, self.clock, self.wall = port, clock, wall
        self.lock, self.runs = threading.Lock(), {}

    def handle(self, body, origin):
        if set(body) != {'plan', 'role', 'contextId', 'action'} or body['role'] not in ('left', 'right') or body['action'] not in ('park', 'poll', 'confirm', 'abort'):
            raise ValueError('Invalid request')
        plan, role, context, action = body['plan'], body['role'], body['contextId'], body['action']
        validate_plan(plan, self.port)
        if str(uuid.UUID(context)) != context:
            raise ValueError('Invalid context')
        if origin != plan['prior']['fixture'][role + 'Origin']:
            raise ValueError('Wrong role/origin')
        with self.lock:
            t = self.clock()
            run = self.runs.get(plan['planId'])
            if not run:
                if action != 'park' or len(self.runs) >= 8:
                    raise ValueError('Unknown run or bounded capacity reached')
                run = self.runs[plan['planId']] = {'plan': plan, 'created': t, 'roles': {}, 'status': 'waiting'}
            if run['plan'] != plan:
                raise ValueError('Plan mismatch')
            own = run['roles'].get(role)
            if own and own['context'] != context:
                raise ValueError('Context replacement refused')
            if not own:
                if action != 'park' or run['status'] != 'waiting':
                    raise ValueError('Not an admissible park')
                if any(v['context'] == context for v in run['roles'].values()):
                    raise ValueError('Independent context IDs required')
                own = run['roles'][role] = {'context': context, 'seen': t, 'confirmed': False}
            own['seen'] = t
            if action == 'abort' or t - run['created'] > 120 or any(t - v['seen'] > 2 for v in run['roles'].values()):
                run['status'] = 'aborted'
            elif run['status'] not in ('released', 'aborted'):
                if len(run['roles']) == 2 and run['status'] == 'waiting':
                    run['status'] = 'confirm'
                if action == 'confirm' and run['status'] == 'confirm':
                    own['confirmed'] = True
                if run['status'] == 'confirm' and all(v['confirmed'] for v in run['roles'].values()):
                    run['status'], run['release'] = 'scheduled', t + 1
                if run['status'] == 'scheduled' and t >= run['release']:
                    run['status'], run['releasedAt'] = 'released', int(self.wall() * 1000)
            return {'status': run['status'], 'planId': plan['planId'], **({'releasedAt': run['releasedAt']} if run['status'] == 'released' else {})}


def make_handler(base=http.server.SimpleHTTPRequestHandler):
    class Handler(base):
        def do_POST(self):
            if self.path != '/__phase_b_barrier__':
                if base is not http.server.SimpleHTTPRequestHandler:
                    return super().do_POST()
                self.send_error(404)
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 16384 or self.headers.get('Content-Type') != 'application/json':
                    raise ValueError('Bounded JSON only')
                if self.headers.get('Authorization') or self.headers.get('Cookie'):
                    raise ValueError('Do not send credentials')
                host = self.headers.get('Host', '')
                if host not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'):
                    raise ValueError('Loopback Host required')
                if self.headers.get('Origin') != 'http://' + host:
                    raise ValueError('Same-origin relay request required')
                body = json.loads(self.rfile.read(length))
                value = self.server.phase_b_barrier.handle(body, self.headers.get('Origin'))
                # Both confirmed contexts keep an HTTP wait outstanding; deliver
                # the same release to both without a 100ms polling skew.
                wait_until = time.monotonic() + 1.5
                while value['status'] == 'scheduled' and time.monotonic() < wait_until:
                    time.sleep(0.01)
                    value = self.server.phase_b_barrier.handle({**body, 'action': 'poll'}, self.headers.get('Origin'))
                data = json.dumps(value).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(data)
            except (ValueError, TypeError, KeyError, AttributeError):
                self.send_error(400, 'Invalid or stale development barrier request')

        def end_headers(self):
            if base is http.server.SimpleHTTPRequestHandler:
                for line in (ROOT / '_headers').read_text(encoding='utf-8').splitlines():
                    if line.startswith('  ') and ':' in line:
                        name, value = line.strip().split(':', 1)
                        self.send_header(name, value.strip())
            super().end_headers()

        def log_message(self, *args):
            pass  # Never log request bodies or credentials.
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, required=True)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Use the existing development port, 1024..65535')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), functools.partial(make_handler(), directory=str(ROOT)))
    server.phase_b_barrier = Barrier(args.port)
    print(f'Development only. Both http://127.0.0.1:{args.port} and http://localhost:{args.port}; Ctrl+C stops. No Supabase/SQL connections.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
