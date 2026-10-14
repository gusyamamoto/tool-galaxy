"""Pure/local tests of the development relay; no Supabase or SQL."""
import copy
import functools
import http.server
import importlib.util
import json
import threading
import unittest
import urllib.error
import urllib.request
import uuid
from pathlib import Path

spec = importlib.util.spec_from_file_location('cloud_barrier_server', Path(__file__).resolve().parents[1] / 'scripts/serve-cloud-barrier.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def plan():
    identity = lambda: str(uuid.uuid4())
    f = {'format': 'cosmifold-phase-b', 'fixtureVersion': 1, 'scope': {'ownerUserId': identity(), 'universeId': identity()},
         'leftOrigin': 'http://127.0.0.1:5500', 'rightOrigin': 'http://localhost:5500',
         'operations': {k: identity() for k in ('seed', 'left', 'right', 'identical', 'newer')}}
    return {'format': 'cosmifold-phase-b-barrier', 'barrierVersion': 1,
            'prior': {'format': 'cosmifold-phase-b-concurrent-recovery', 'recoveryVersion': 1, 'fixture': f, 'winner': 'left', 'operationId': identity(), 'planId': identity()},
            'operationId': identity(), 'planId': identity()}


class BarrierTests(unittest.TestCase):
    def setUp(self):
        self.t = 100
        self.p = plan()
        self.server = module.Barrier(5500, clock=lambda: self.t, wall=lambda: 100000 + self.t)
        self.contexts = {r: str(uuid.uuid4()) for r in ('left', 'right')}

    def call(self, role, action):
        return self.server.handle({'plan': self.p, 'role': role, 'contextId': self.contexts[role], 'action': action}, self.p['prior']['fixture'][role + 'Origin'])

    def test_release_requires_both_parked_and_both_confirmed(self):
        self.assertEqual(self.call('left', 'park')['status'], 'waiting')
        self.t += 1
        self.assertEqual(self.call('left', 'poll')['status'], 'waiting')
        self.assertEqual(self.call('right', 'park')['status'], 'confirm')
        self.assertEqual(self.call('left', 'confirm')['status'], 'confirm')
        self.assertEqual(self.call('right', 'confirm')['status'], 'scheduled')
        self.t += 1
        a, b = self.call('left', 'poll'), self.call('right', 'poll')
        self.assertEqual(a, b)
        self.assertEqual(a['status'], 'released')

    def test_absent_or_lapsed_peer_never_releases(self):
        self.call('left', 'park')
        self.t += 121
        self.assertEqual(self.call('left', 'poll')['status'], 'aborted')
        self.assertEqual(self.call('left', 'park')['status'], 'aborted')

    def test_expired_peer_aborts_before_scheduled_release(self):
        self.call('left', 'park'); self.call('right', 'park')
        self.call('left', 'confirm'); self.call('right', 'confirm')
        self.t += 3
        self.assertEqual(self.call('left', 'poll')['status'], 'aborted')

    def test_abort_is_sticky_and_context_replacement_fails(self):
        self.call('left', 'park')
        original = self.contexts['left']; self.contexts['left'] = str(uuid.uuid4())
        with self.assertRaises(ValueError): self.call('left', 'park')
        self.contexts['left'] = original
        self.assertEqual(self.call('left', 'abort')['status'], 'aborted')
        self.assertEqual(self.call('left', 'park')['status'], 'aborted')

    def test_wrong_origin_same_context_changed_plan_and_credentials_shape_fail(self):
        body = {'plan': self.p, 'role': 'left', 'contextId': self.contexts['left'], 'action': 'park'}
        with self.assertRaises(ValueError): self.server.handle(body, 'https://attacker.invalid')
        self.call('left', 'park')
        self.contexts['right'] = self.contexts['left']
        with self.assertRaises(ValueError): self.call('right', 'park')
        changed = copy.deepcopy(body); changed['plan']['operationId'] = str(uuid.uuid4())
        with self.assertRaises(ValueError): self.server.handle(changed, self.p['prior']['fixture']['leftOrigin'])
        with self.assertRaises(ValueError): self.server.handle({**body, 'access_token': 'NO_CREDENTIALS_ALLOWED'}, self.p['prior']['fixture']['leftOrigin'])

    def test_fresh_ids_and_exact_same_port_origins_required(self):
        bad = copy.deepcopy(self.p); bad['operationId'] = bad['prior']['operationId']
        with self.assertRaises(ValueError): module.validate_plan(bad, 5500)
        with self.assertRaises(ValueError): module.validate_plan(self.p, 5501)

    def test_http_rejects_foreign_origin_and_credentials_and_accepts_same_origin_json(self):
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(module.make_handler(), directory=str(module.ROOT)))
        server.phase_b_barrier = module.Barrier(server.server_port)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        p = plan(); origin = f'http://127.0.0.1:{server.server_port}'
        p['prior']['fixture']['leftOrigin'] = origin
        p['prior']['fixture']['rightOrigin'] = f'http://localhost:{server.server_port}'
        body = json.dumps({'plan': p, 'role': 'left', 'contextId': str(uuid.uuid4()), 'action': 'park'}).encode()
        try:
            for extra in [{'Origin': 'https://attacker.invalid'}, {'Authorization': 'NOT_A_REAL_TOKEN'}, {'Cookie': 'test=1'}]:
                req = urllib.request.Request(origin + '/__phase_b_barrier__', data=body,
                    headers={'Content-Type': 'application/json', 'Origin': origin, **extra})
                with self.assertRaises(urllib.error.HTTPError) as caught: urllib.request.urlopen(req, timeout=3)
                self.assertEqual(caught.exception.code, 400)
            req = urllib.request.Request(origin + '/__phase_b_barrier__', data=body, headers={'Content-Type': 'application/json', 'Origin': origin})
            with urllib.request.urlopen(req, timeout=3) as response: self.assertEqual(json.load(response)['status'], 'waiting')
        finally:
            server.shutdown();server.server_close();thread.join(timeout=3)


if __name__ == '__main__':
    unittest.main()
