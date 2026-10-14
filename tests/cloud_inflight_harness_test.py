"""Pure coordinator/validation tests, no browser, Supabase or SQL."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('inflight_harness',Path(__file__).resolve().parents[1]/'scripts/cloud-inflight-harness.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
ORIGIN='http://127.0.0.1:5500'
SCOPE={'ownerUserId':'00000000-0000-4000-8000-000000000001','universeId':'00000000-0000-4000-8000-000000000002'}
OP='00000000-0000-4000-8000-000000000003'
DESC={'origin':ORIGIN,'scope':SCOPE,'operationId':OP,'command':{'scope':SCOPE,'operationId':OP,'baseRevision':'0','type':'items.created','payload':{}},
      'commitURL':'https://example.invalid/rest/v1/rpc/cosmifold_commit_metadata','cacheKey':f"cosmifold:cloud-cache:v1:{SCOPE['ownerUserId']}:{SCOPE['universeId']}",'markerKey':'cosmifold:dev:cloud-recovery:v1'}
PROOF={'admissionVersion':1,'source':'independent-receipt-before-native-failure','scope':SCOPE,'operationId':OP,'baseRevision':'0','revision':'1','cacheRevision':'0','pausedStatus':200,'requestDigest':'a'*64}


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
