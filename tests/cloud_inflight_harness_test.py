"""Pure coordinator/validation tests, no browser, Supabase or SQL."""
import copy
from contextlib import ExitStack
import errno
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest import mock
import urllib.error

spec=importlib.util.spec_from_file_location('inflight_harness',Path(__file__).resolve().parents[1]/'scripts/cloud-inflight-harness.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
ORIGIN='http://127.0.0.1:5500'
SCOPE={'ownerUserId':'00000000-0000-4000-8000-000000000001','universeId':'00000000-0000-4000-8000-000000000002'}
OP='00000000-0000-4000-8000-000000000003'
DESC={'origin':ORIGIN,'scope':SCOPE,'operationId':OP,'command':{'scope':SCOPE,'operationId':OP,'baseRevision':'0','type':'items.created','payload':{}},
      'commitURL':'https://example.invalid/rest/v1/rpc/cosmifold_commit_metadata','cacheKey':f"cosmifold:cloud-cache:v1:{SCOPE['ownerUserId']}:{SCOPE['universeId']}",'markerKey':'cosmifold:dev:cloud-recovery:v1'}
PROOF={'admissionVersion':1,'source':'independent-receipt-before-native-failure','scope':SCOPE,'operationId':OP,'baseRevision':'0','revision':'1','cacheRevision':'0','pausedStatus':200,'requestDigest':'a'*64}


class DiscoveryTests(unittest.TestCase):
    def pages(self,host='127.0.0.1'):
        return [{'type':'page','url':ORIGIN+'/dev/cloud-recovery-diagnostic.html',
                 'webSocketDebuggerUrl':f'ws://{host}:9222/devtools/page/{role}'} for role in ['writer','observer']]

    def discover(self,results,pages=None):
        opener=mock.Mock();opener.open.side_effect=results
        clients=[mock.Mock(),mock.Mock()]
        for role,client in zip(['writer','observer'],clients):
            client.evaluate.return_value='cosmifold-inflight-'+role
        with ExitStack() as stack:
            connect=stack.enter_context(mock.patch.object(h.socket,'create_connection',side_effect=AssertionError('Real network forbidden')))
            urlopen=stack.enter_context(mock.patch.object(h.urllib.request,'urlopen',side_effect=AssertionError('Unexpected discovery path')))
            build=stack.enter_context(mock.patch.object(h.urllib.request,'build_opener',return_value=opener))
            factory=stack.enter_context(mock.patch.object(h,'SafeCDP',side_effect=clients))
            found=h.find_targets(9222,ORIGIN)
            connect.assert_not_called();urlopen.assert_not_called()
            self.assertEqual(build.call_args.args[0].proxies,{})
            self.assertEqual(found,tuple(clients))
            for client in clients:
                client.evaluate.assert_called_once_with('window.name');client.call.assert_not_called()
            if pages:self.assertEqual(factory.call_args_list,[mock.call(p['webSocketDebuggerUrl']) for p in pages])
        return opener

    def test_ipv4_discovery_still_uses_one_direct_request(self):
        pages=self.pages()
        opener=self.discover([io.StringIO(json.dumps(pages))],pages)
        self.assertEqual(opener.open.call_args_list,[mock.call('http://127.0.0.1:9222/json',timeout=5)])

    def test_ipv6_only_discovery_falls_back_after_wrapped_connection_refused(self):
        pages=self.pages('[0000:0000:0000:0000:0000:0000:0000:0001]')
        error=urllib.error.URLError(ConnectionRefusedError(errno.ECONNREFUSED,'refused'))
        opener=self.discover([error,io.StringIO(json.dumps(pages))],pages)
        self.assertEqual(opener.open.call_args_list,[mock.call('http://127.0.0.1:9222/json',timeout=5),
                                                   mock.call('http://[::1]:9222/json',timeout=5)])

    def test_raw_and_windows_refusal_errors_also_allow_one_ipv6_fallback(self):
        windows=OSError('Windows refused');windows.winerror=10061
        for error in [ConnectionRefusedError(errno.ECONNREFUSED,'refused'),OSError(10061,'refused'),urllib.error.URLError(windows)]:
            with self.subTest(error=type(error).__name__):
                opener=self.discover([error,io.StringIO(json.dumps(self.pages('[::1]')))])
                self.assertEqual(opener.open.call_count,2)

    def test_timeouts_http_errors_permissions_and_string_reasons_do_not_fall_back(self):
        errors=[TimeoutError('timeout'),urllib.error.URLError(TimeoutError('timeout')),
                PermissionError(errno.EACCES,'denied'),urllib.error.URLError('Connection refused'),
                urllib.error.HTTPError('http://127.0.0.1:9222/json',403,'Forbidden',{},None)]
        for error in errors:
            with self.subTest(error=type(error).__name__),mock.patch.object(h.urllib.request,'build_opener') as build:
                build.return_value.open.side_effect=error
                with self.assertRaises(type(error)):h.find_targets(9222,ORIGIN)
                build.return_value.open.assert_called_once_with('http://127.0.0.1:9222/json',timeout=5)

    def test_bad_json_or_missing_roles_does_not_try_another_listener(self):
        for body,error in [('not JSON',json.JSONDecodeError),('[]',h.Unverified)]:
            with mock.patch.object(h.urllib.request,'build_opener') as build:
                build.return_value.open.return_value=io.StringIO(body)
                with self.assertRaises(error):h.find_targets(9222,ORIGIN)
                self.assertEqual(build.return_value.open.call_count,1)

    def test_invalid_port_never_opens_discovery(self):
        with mock.patch.object(h.urllib.request,'build_opener') as build:
            with self.assertRaises(h.Unverified):h.find_targets(1,ORIGIN)
            build.assert_not_called()

    def test_websocket_ipv4_and_both_ipv6_spellings_connect_with_correct_host_header(self):
        for host in ['127.0.0.1','::1','0000:0000:0000:0000:0000:0000:0000:0001']:
            authority=f'[{host}]:9222' if ':' in host else f'{host}:9222'
            sock=mock.Mock();sock.recv.return_value=b'HTTP/1.1 101 Switching Protocols\r\n\r\n'
            with self.subTest(host=host),mock.patch.object(h.socket,'create_connection',return_value=sock) as connect:
                client=h.SafeCDP(f'ws://{authority}/devtools/page/test-target')
                connect.assert_called_once_with((host,9222),timeout=45)
                header=sock.sendall.call_args.args[0].decode()
                self.assertIn(f'Host: {authority}\r\n',header)
                self.assertTrue(header.startswith('GET /devtools/page/test-target HTTP/1.1\r\n'))
                self.assertEqual(client.target_id,'test-target');client.sock.close()

    def test_websocket_validation_still_rejects_nonloopback_and_nonpage_endpoints(self):
        urls=['ws://192.0.2.1:9222/devtools/page/x','ws://[::2]:9222/devtools/page/x',
              'ws://[::ffff:127.0.0.1]:9222/devtools/page/x','ws://example.invalid:9222/devtools/page/x',
              'ws://user:password@[::1]:9222/devtools/page/x','ws://[::1]:9222/devtools/browser/x',
              'ws://[::1]:9222/devtools/page/x?query=1','ws://[::1]:9222/devtools/page/x#fragment']
        with mock.patch.object(h.socket,'create_connection',side_effect=AssertionError('Network forbidden')) as connect:
            for url in urls:
                with self.subTest(url=url),self.assertRaises(h.Unverified):h.SafeCDP(url)
            connect.assert_not_called()


class Client:
    def __init__(self,trace,observer=False,early=False,proof=None,test_case='response-interruption'):
        self.trace=trace;self.observer=observer;self.target_id='observer' if observer else 'writer';self.early=early;self.proof=proof or PROOF;self.pauses=[];self.failures=[];self.admission=None;self.phase='prepared';self.transport=None;self.test_case=test_case
    def call(self,method,**params):
        self.trace.append(method)
        if method=='Fetch.failRequest':
            self.phase='uncertain';self.transport={'attempts':1};self.failures.append({'requestId':'net1','errorText':'net::ERR_INTERNET_DISCONNECTED'})
        return {}
    def evaluate(self,code):
        if code=='recoveryDiagnostic.nativeDescriptor()':return copy.deepcopy(DESC)
        if code=='recoveryDiagnostic.armNativeResponse()':self.phase='native-ready';return None
        if code=="recoveryControls(); !document.getElementById('dispatch').disabled":return True
        if 'dispatch' in code:
            self.phase='dispatched';self.pauses.append({'requestId':'fetch1','networkId':'net1','status':200,'url':DESC['commitURL'],'method':'POST','postData':json.dumps({'p_command':DESC['command']})});return True
        if code=='recoveryDiagnostic.auditNativeCommit()':self.trace.append('independent-receipt');return copy.deepcopy(self.proof)
        if code.startswith('recoveryDiagnostic.recordNativeAdmission('):self.admission=json.loads(code[len('recoveryDiagnostic.recordNativeAdmission('):-1]);self.trace.append('proof-stored');return {'stored':True,'cacheRevision':'0'}
        if 'pendingEqual' in code:return {'phase':self.phase,'case':self.test_case,'operationId':OP,'revision':'1' if self.early else '0','pendingEqual':True,'transport':self.transport,'admission':self.admission}
        if code=='recoveryDiagnostic.dispose()':self.trace.append('disposed')
        return None


class HarnessTests(unittest.TestCase):
    def test_late_receipt_uses_same_native_commit_proof_and_failure_not_a_second_mutation(self):
        trace=[];writer=Client(trace,test_case='late-receipt');observer=Client(trace,observer=True,test_case='late-receipt')
        result=h.coordinate(writer,observer,ORIGIN,report=lambda _:None)
        self.assertEqual(result['proof'],PROOF);self.assertEqual(result['operationId'],OP)
        self.assertLess(trace.index('proof-stored'),trace.index('Fetch.failRequest'))
        self.assertEqual(trace.count('Fetch.failRequest'),1)
    def test_non_native_case_cannot_claim_native_gate(self):
        trace=[]
        with self.assertRaises(h.Unverified):h.coordinate(Client(trace,test_case='lost-reply'),Client(trace,observer=True),ORIGIN,report=lambda _:None)
        self.assertNotIn('independent-receipt',trace)
    def test_exact_native_pause_and_original_body_required(self):
        paused={'requestId':'fetch1','networkId':'net1','status':200,'url':DESC['commitURL'],'method':'POST','postData':json.dumps({'p_command':DESC['command']})}
        h.validate_pause(paused,DESC)
        for fields in [{'status':500},{'method':'GET'},{'url':DESC['commitURL']+'?other=1'},{'postData':'{}'},{'postData':None},{'networkId':None}]:
            with self.assertRaises(h.Unverified):h.validate_pause({**paused,**fields},DESC)
    def test_scope_and_admission_strict(self):
        h.validate_descriptor(DESC,ORIGIN);h.validate_admission(PROOF,DESC)
        for fields in [{'revision':'0'},{'pausedStatus':500},{'operationId':SCOPE['universeId']},{'source':'client-delay'},{'requestDigest':'wrong'},{'extra':True}]:
            with self.assertRaises(h.Unverified):h.validate_admission({**PROOF,**fields},DESC)
        with self.assertRaises(h.Unverified):h.validate_origin('https://example.invalid')
        with self.assertRaises(h.Unverified):h.validate_descriptor({**DESC,'commitURL':'http://example.invalid/rpc'},ORIGIN)
    def test_independent_commit_proof_precedes_native_failure(self):
        trace=[];writer=Client(trace);observer=Client(trace,observer=True)
        result=h.coordinate(writer,observer,ORIGIN,report=lambda _:None)
        self.assertEqual(result['operationId'],OP)
        self.assertLess(trace.index('independent-receipt'),trace.index('proof-stored'))
        self.assertLess(trace.index('proof-stored'),trace.index('Fetch.failRequest'))
        self.assertLess(trace.index('Fetch.failRequest'),trace.index('Fetch.disable'))
        self.assertEqual(trace.count('Fetch.failRequest'),1)
        self.assertFalse(any(name in trace for name in ['Fetch.getResponseBody','Fetch.fulfillRequest','Network.replayXHR']))
    def test_early_acceptance_or_invalid_receipt_fails_closed(self):
        for early,proof in [(True,PROOF),(False,{**PROOF,'revision':'0'})]:
            trace=[];writer=Client(trace,early=early);observer=Client(trace,observer=True,proof=proof)
            with self.assertRaises(h.Unverified):h.coordinate(writer,observer,ORIGIN,report=lambda _:None)
            self.assertIn('disposed',trace)
            self.assertLess(trace.index('disposed'),trace.index('Fetch.failRequest'))
    def test_same_target_is_not_an_independent_observer(self):
        trace=[];writer=Client(trace);observer=Client(trace)
        with self.assertRaises(h.Unverified):h.coordinate(writer,observer,ORIGIN,report=lambda _:None)
        self.assertNotIn('Fetch.failRequest',trace)
    def test_sensitive_native_event_fields_are_discarded(self):
        client=object.__new__(h.SafeCDP);client.pauses=[];client.failures=[]
        client.event({'method':'Fetch.requestPaused','params':{'requestId':'f','networkId':'n','responseStatusCode':200,'responseHeaders':[{'value':'PRIVATE_RESPONSE'}],
            'request':{'url':DESC['commitURL'],'method':'POST','postData':'{}','headers':{'Authorization':'PRIVATE_TOKEN'}}}})
        text=json.dumps(client.pauses);self.assertNotIn('PRIVATE',text);self.assertNotIn('headers',text)
    def test_no_secret_or_general_proxy_interface(self):
        source=(Path(__file__).resolve().parents[1]/'scripts/cloud-inflight-harness.py').read_text()
        self.assertNotIn('Fetch.getResponseBody',source);self.assertNotIn('Fetch.fulfillRequest',source);self.assertNotIn('Network.replayXHR',source)
        self.assertNotIn('sb_secret_',source);self.assertNotIn('service_role',source)
        self.assertIn("requestStage':'Response'",source)


if __name__=='__main__':unittest.main()
