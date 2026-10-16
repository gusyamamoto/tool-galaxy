"""MANUAL loopback Chromium harness. No SQL, response body, secrets or retries.

Reuses the test runner's standard-library WebSocket transport; overrides event
handling so request/response headers and exception objects are never retained.
Run only against an isolated debug browser with reviewed disposable fixtures.
"""
import argparse
import errno
import importlib.util
import ipaddress
import json
import os
import re
import socket
import struct
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cosmifold_browser_transport', ROOT/'tests/browser-check.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)


class Unverified(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def require(ok, code):
    if not ok:
        raise Unverified(code)


class SafeCDP(transport.CDP):
    def __init__(self, url, seconds=35):
        try:
            parsed = urlsplit(url)
            loopback = ipaddress.ip_address(parsed.hostname).compressed in ('127.0.0.1','::1')
            port = parsed.port
        except (ValueError,TypeError):
            raise Unverified('LOOPBACK_DEBUG_TARGET_REQUIRED')
        require(parsed.scheme=='ws' and loopback and port and not parsed.username and not parsed.password and
                parsed.path.startswith('/devtools/page/') and not parsed.query and not parsed.fragment,
                'LOOPBACK_DEBUG_TARGET_REQUIRED')
        super().__init__(url)
        self.target_id = parsed.path.rsplit('/',1)[-1]
        self.deadline = time.monotonic()+seconds
        self.pauses = []
        self.failures = []

    def event(self, message):
        # Deliberately discard headers, cookies, response bodies and exception details.
        if message.get('method')=='Fetch.requestPaused':
            params = message['params']
            request = params.get('request', {})
            self.pauses.append({'requestId': params.get('requestId'), 'networkId': params.get('networkId'),
                'status': params.get('responseStatusCode'), 'url': request.get('url'),
                'method': request.get('method'), 'postData': request.get('postData')})
        if message.get('method')=='Network.loadingFailed':
            params = message['params']
            self.failures.append({'requestId': params.get('requestId'), 'errorText': params.get('errorText')})

    def receive(self):
        remaining = self.deadline-time.monotonic()
        require(remaining>0, 'BOUNDED_HARNESS_TIMEOUT')
        self.sock.settimeout(min(remaining, 20))
        return super().receive()

    def call(self, method, **params):
        self.id += 1
        payload = json.dumps({'id': self.id, 'method': method, 'params': params}).encode()
        require(len(payload)<65536, 'BOUNDED_CDP_COMMAND_REQUIRED')
        mask = os.urandom(4)
        header = bytes([129, 128|len(payload)]) if len(payload)<126 else bytes([129,254])+struct.pack('!H',len(payload))
        self.sock.sendall(header+mask+bytes(value^mask[i%4] for i,value in enumerate(payload)))
        while True:
            message = self.receive()
            self.event(message)
            if message.get('id')==self.id:
                require('error' not in message, 'NATIVE_PROTOCOL_UNAVAILABLE')
                return message.get('result', {})

    def evaluate(self, expression):
        response = self.call('Runtime.evaluate', expression=expression, returnByValue=True, awaitPromise=True)
        require('exceptionDetails' not in response, 'DIAGNOSTIC_EVALUATION_FAILED')
        return response.get('result', {}).get('value')


def validate_origin(origin):
    url = urlsplit(origin)
    require(url.scheme in ('http','https') and url.hostname in ('127.0.0.1','localhost','::1') and
            url.port and url.path in ('','/') and not url.query and not url.fragment and not url.username,
            'LOOPBACK_APP_ORIGIN_REQUIRED')
    return origin.rstrip('/')


def validate_descriptor(data, origin, mock=False):
    require(isinstance(data,dict) and set(data)=={'origin','scope','operationId','command','commitURL','cacheKey','markerKey'}, 'INVALID_NATIVE_DESCRIPTOR')
    require(data['origin']==origin and set(data['scope'])=={'ownerUserId','universeId'}, 'NATIVE_SCOPE_OR_ORIGIN_CHANGED')
    for value in [*data['scope'].values(),data['operationId']]:
        try:
            require(str(uuid.UUID(value))==value, 'INVALID_NATIVE_ID')
        except (ValueError, TypeError, AttributeError):
            raise Unverified('INVALID_NATIVE_ID')
    command = data['command']
    require(set(command)=={'scope','operationId','baseRevision','type','payload'} and command['scope']==data['scope'] and
            command['operationId']==data['operationId'] and command['baseRevision']=='0' and command['type']=='items.created', 'ORIGINAL_COMMAND_REQUIRED')
    url = urlsplit(data['commitURL'])
    require(not url.username and not url.query and not url.fragment, 'EXACT_RPC_URL_REQUIRED')
    if mock:
        require(data['commitURL']==origin+'/__phase_c_commit__', 'LOCAL_MOCK_ENDPOINT_REQUIRED')
    else:
        require(url.scheme=='https' and url.hostname and url.path=='/rest/v1/rpc/cosmifold_commit_metadata', 'EXACT_PUBLIC_RPC_REQUIRED')
    require(data['markerKey']=='cosmifold:dev:cloud-recovery:v1' and
            data['cacheKey']==f"cosmifold:cloud-cache:v1:{data['scope']['ownerUserId']}:{data['scope']['universeId']}", 'EXACT_DIAGNOSTIC_KEYS_REQUIRED')
    return data


def validate_pause(paused, descriptor, mock=False):
    require(paused['url']==descriptor['commitURL'] and paused['method']=='POST' and paused['status']==200 and
            isinstance(paused['requestId'],str) and paused['requestId'] and isinstance(paused['networkId'],str), 'EXACT_SUCCESSFUL_RESPONSE_PAUSE_REQUIRED')
    try:
        body = json.loads(paused['postData'])
    except (TypeError,ValueError):
        raise Unverified('ORIGINAL_REQUEST_BODY_UNVERIFIED')
    expected = {'p_command':descriptor['command']}
    if mock:
        require(body.get('name')=='cosmifold_commit_metadata' and body.get('actor')==descriptor['scope']['ownerUserId'], 'MOCK_COMMAND_CHANGED')
        body = body.get('params')
    require(body==expected, 'ORIGINAL_REQUEST_BODY_CHANGED')


def validate_admission(proof, descriptor):
    require(isinstance(proof,dict) and set(proof)=={'admissionVersion','source','scope','operationId','baseRevision','revision','cacheRevision','pausedStatus','requestDigest'} and
            proof['admissionVersion']==1 and proof['source']=='independent-receipt-before-native-failure' and proof['scope']==descriptor['scope'] and
            proof['operationId']==descriptor['operationId'] and proof['baseRevision']=='0' and proof['revision']=='1' and proof['cacheRevision']=='0' and
            proof['pausedStatus']==200 and isinstance(proof['requestDigest'],str) and re.fullmatch('[a-f0-9]{64}',proof['requestDigest']), 'INDEPENDENT_COMMIT_PROOF_INVALID')
    return proof


def pending_summary(writer, descriptor):
    data = json.dumps(descriptor)
    return writer.evaluate("(()=>{const d="+data+",m=recoveryDiagnostic.identity(),r=JSON.parse(localStorage.getItem(d.cacheKey));return {phase:m.phase,case:m.case,operationId:m.operationId,revision:r?.acknowledged?.revision,pendingEqual:cosmifoldCloudChanges.equal(r?.pending?.command,d.command),admission:m.admission||null,transport:m.transport||null};})()")


def coordinate(writer, observer, origin, mock=False, report=print):
    """One explicit original mutation, native response failure, no reload/retry.

mock=True is available to local tests only; the manual CLI always uses real RPCs.
"""
    paused = None
    completed = False
    try:
        writer.call('Network.enable')
        writer.call('Runtime.enable')
        observer.call('Runtime.enable')
        descriptor = validate_descriptor(writer.evaluate('recoveryDiagnostic.nativeDescriptor()'), origin, mock)
        other = validate_descriptor(observer.evaluate('recoveryDiagnostic.nativeDescriptor()'), origin, mock)
        require(descriptor==other, 'INDEPENDENT_OBSERVER_SCOPE_CHANGED')
        require(writer is not observer and writer.target_id!=observer.target_id, 'INDEPENDENT_OBSERVER_REQUIRED')
        writer.call('Fetch.enable', patterns=[{'urlPattern':descriptor['commitURL'],'requestStage':'Response'}])
        writer.evaluate('recoveryDiagnostic.armNativeResponse()')
        require(writer.evaluate("recoveryControls(); !document.getElementById('dispatch').disabled"), 'DISPATCH_CONTROL_NOT_ARMED')
        report('ARMED: exact native commit response only; independent observer ready. Dispatching ONE reviewed disposable command.')
        writer.evaluate("document.getElementById('dispatch').click(); true")
        deadline = time.monotonic()+20
        while not writer.pauses:
            require(time.monotonic()<deadline, 'RESPONSE_PAUSE_UNVERIFIED')
            writer.call('Runtime.evaluate', expression='true', returnByValue=True)
            time.sleep(0.02)
        # OPTIONS may be intercepted before POST; it never carries a semantic command.
        while writer.pauses and writer.pauses[0]['method']=='OPTIONS':
            item = writer.pauses.pop(0)
            require(item['url']==descriptor['commitURL'], 'UNEXPECTED_PREFLIGHT')
            writer.call('Fetch.continueRequest', requestId=item['requestId'])
            while not writer.pauses:
                require(time.monotonic()<deadline, 'COMMIT_RESPONSE_PAUSE_UNVERIFIED')
                writer.call('Runtime.evaluate', expression='true', returnByValue=True)
                time.sleep(0.02)
        require(len(writer.pauses)==1, 'MULTIPLE_COMMIT_RESPONSES')
        paused = writer.pauses.pop(0)
        validate_pause(paused,descriptor,mock)
        before = pending_summary(writer,descriptor)
        require(before['case'] in ('response-interruption','late-receipt') and before['phase']=='dispatched' and before['revision']=='0' and before['pendingEqual'] and not before['transport'], 'CLIENT_ACCEPTED_BEFORE_PROOF')
        proof = validate_admission(observer.evaluate('recoveryDiagnostic.auditNativeCommit()'),descriptor)
        stored = writer.evaluate('recoveryDiagnostic.recordNativeAdmission('+json.dumps(proof)+')')
        require(stored=={'stored':True,'cacheRevision':'0'}, 'ADMISSION_PROOF_NOT_STORED')
        require(pending_summary(writer,descriptor)['revision']=='0', 'EARLY_CACHE_ADVANCE')
        report('PROVED: independent original receipt and exact revision-1 state visible BEFORE interruption; writer journal still at 0.')
        # Native network-layer failure. Never read/fulfill/discard an SDK success.
        writer.call('Network.emulateNetworkConditions',offline=True,latency=0,downloadThroughput=-1,uploadThroughput=-1)
        writer.call('Fetch.failRequest',requestId=paused['requestId'],errorReason='InternetDisconnected')
        failed_id = paused['networkId']
        writer.call('Fetch.disable')
        paused = None
        while True:
            value = pending_summary(writer,descriptor)
            if value['phase']=='uncertain':
                break
            require(time.monotonic()<deadline+10, 'UNCERTAIN_JOURNAL_UNVERIFIED')
            time.sleep(0.03)
        require(value['case']==before['case'] and value['operationId']==descriptor['operationId'] and value['revision']=='0' and
                value['pendingEqual'] and value['admission']==proof and value['transport'] and value['transport']['attempts']==1, 'NATIVE_INTERRUPTION_NOT_DURABLE')
        require(any(f['requestId']==failed_id and f['errorText']=='net::ERR_INTERNET_DISCONNECTED' for f in writer.failures), 'NATIVE_LOADING_FAILURE_UNVERIFIED')
        writer.evaluate('recoveryDiagnostic.checkBlocked()')
        completed = True
        report('PASS: server committed before native response failure; original pending ID/cache at 0, dependent writes blocked, no resend. STOP for review before reconnect/reload.')
        return {'scope':descriptor['scope'],'operationId':descriptor['operationId'],'proof':proof,'cacheKey':descriptor['cacheKey'],'markerKey':descriptor['markerKey']}
    finally:
        pending_pauses = ([paused] if paused else [])+writer.pauses
        if not completed:
            try:
                writer.evaluate('recoveryDiagnostic.dispose()')
            except Exception:
                pass
        if pending_pauses:
            # Never disable interception and accidentally release a successful reply.
            try:
                writer.evaluate('recoveryDiagnostic.dispose()')
                writer.call('Network.emulateNetworkConditions',offline=True,latency=0,downloadThroughput=-1,uploadThroughput=-1)
                for item in pending_pauses:
                    writer.call('Fetch.failRequest',requestId=item['requestId'],errorReason='InternetDisconnected')
            except Exception:
                pass
        if not completed:
            try:
                writer.call('Fetch.disable')
            except Exception:
                pass


def discover_pages(port):
    require(1024<=port<=65535, 'INVALID_DEBUG_PORT')
    # Literal loopback endpoints must connect directly, regardless of proxy
    # environment settings (which often omit IPv6 from their bypass list).
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def read(host):
        with opener.open(f'http://{host}:{port}/json',timeout=5) as response:
            return json.load(response)
    try:
        return read('127.0.0.1')
    except OSError as error:
        reason = error.reason if isinstance(error,urllib.error.URLError) else error
        refused = isinstance(reason,ConnectionRefusedError) or (isinstance(reason,OSError) and
            (reason.errno in (errno.ECONNREFUSED,10061) or getattr(reason,'winerror',None)==10061))
        if not refused:raise
        # Keep the IPv4 failure as exception context if IPv6 fails as well.
        return read('[::1]')


def find_targets(port, origin):
    pages = discover_pages(port)
    roles = {}
    for page in pages:
        if page.get('type')!='page' or page.get('url')!=origin+'/dev/cloud-recovery-diagnostic.html':
            continue
        client = SafeCDP(page['webSocketDebuggerUrl'])
        role = client.evaluate('window.name')
        if role in ('cosmifold-inflight-writer','cosmifold-inflight-observer'):
            require(role not in roles, 'DUPLICATE_NATIVE_ROLE')
            roles[role] = client
        else:
            client.sock.close()
    require(set(roles)=={'cosmifold-inflight-writer','cosmifold-inflight-observer'}, 'TWO_LABELLED_SAME_ORIGIN_TABS_REQUIRED')
    return roles['cosmifold-inflight-writer'],roles['cosmifold-inflight-observer']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--debug-port', type=int, default=9222)
    parser.add_argument('--reconnect', action='store_true', help='Only restore writer transport; no RPC, mutation or reload')
    args = parser.parse_args()
    writer = observer = None
    try:
        origin = validate_origin(args.origin)
        writer,observer = find_targets(args.debug_port,origin)
        if args.reconnect:
            writer.call('Network.emulateNetworkConditions',offline=False,latency=0,downloadThroughput=-1,uploadThroughput=-1)
            print('RECONNECTED: writer network restored only; no RPC, mutation or reload.')
        else:
            print('This sends ONE command to the prepared disposable Universe. No tokens or response bodies are displayed.')
            result = coordinate(writer,observer,origin)
            print(json.dumps(result,sort_keys=True))
        return 0
    except Exception as error:
        code = error.code if isinstance(error,Unverified) and re.fullmatch('[A-Z_]{1,80}',error.code) else 'HARNESS_UNVERIFIED'
        print('STOPPED: '+code+'. Retain original fixture/journal; no mutation retried. Do not reset storage or force cleanup.')
        return 2
    finally:
        for client in (writer,observer):
            if client:
                client.sock.close()


if __name__=='__main__':
    sys.exit(main())
