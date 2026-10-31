"""Pure controller guards: no HTTP, browser, database, or live service."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('alpha_inflight',ROOT/'scripts/travel-alpha-inflight.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
OPTIONS = dict(origin='http://127.0.0.1:5042',project='https://test-project.supabase.co',
    owner='00000000-0000-4000-8000-000000000001',universe='00000000-0000-4000-8000-000000000002',
    entry='child',revision='3',name='Recovered name')
OP = '00000000-0000-4000-8000-000000000003'


def fixture():
    old = {'id':'child','universe_id':OPTIONS['universe'],'parent_id':'root','parent_id_present':True,
           'name':'Original name','ordinal':1,'attributes_json':{'createdAt':'2026-10-30T00:00:00.000Z'}}
    base = {'universe':{'id':OPTIONS['universe'],'owner_id':OPTIONS['owner'],'revision':'3'},'entries':[old]}
    new = copy.deepcopy(old)
    new['name'] = OPTIONS['name']
    new['attributes_json']['updatedAt'] = '2026-10-30T01:00:00.000Z'
    command = {'scope':{'ownerUserId':OPTIONS['owner'],'universeId':OPTIONS['universe']},'operationId':OP,
               'baseRevision':'3','type':'items.renamed','payload':{'upsert':{'entries':[new]}}}
    intended = copy.deepcopy(base)
    intended['entries'] = [new]
    state = {'metadata':base,'intended':intended,'writeStatus':'saving','cache':{
        'pending':{'command':command},'acknowledged':{'revision':'3'}}}
    expected = copy.deepcopy(intended)
    expected['universe']['revision'] = '4'
    ack = dict(scope=command['scope'],operationId=OP,baseRevision='3',revision='4',status='committed',replayed=True,result=None)
    audit = dict(metadata=expected,receipt=dict(status='found',request_digest='a'*64,acknowledgement=ack))
    return base,command,state,expected,audit


class Guards(unittest.TestCase):
    def test_exact_existing_rename_and_receipt(self):
        base,command,state,expected,audit = fixture()
        self.assertEqual(h.validate_command({'p_command':command},state,OPTIONS,base),(command,expected))
        self.assertEqual(h.validate_receipt(audit,command,expected),'a'*64)

    def test_unrelated_scope_base_type_payload_and_identity_changes_fail(self):
        mutations = [lambda c:c['scope'].update(universeId=OP),lambda c:c.update(baseRevision='4'),
            lambda c:c.update(type='items.created'),lambda c:c['payload'].update(delete={'entries':['root']}),
            lambda c:c['payload']['upsert']['entries'].append(copy.deepcopy(c['payload']['upsert']['entries'][0])),
            lambda c:c['payload']['upsert']['entries'][0].update(parent_id='elsewhere'),
            lambda c:c['payload']['upsert']['entries'][0]['attributes_json'].update(description='unapproved')]
        for mutate in mutations:
            base,command,state,_,_ = fixture()
            mutate(command)
            with self.subTest(command_type=command['type']),self.assertRaises(h.Unverified):
                h.validate_command({'p_command':command},state,OPTIONS,base)

    def test_wrong_pending_or_intended_snapshot_fails(self):
        for field in ('pending','intended'):
            base,command,state,_,_ = fixture()
            if field == 'pending':state['cache']['pending']['command'] = {**command,'operationId':OPTIONS['universe']}
            else:state['intended'] = base
            with self.subTest(field=field),self.assertRaises(h.Unverified):
                h.validate_command({'p_command':command},state,OPTIONS,base)

    def test_missing_receipt_never_authorizes_recovery(self):
        _,command,_,expected,audit = fixture()
        for receipt in (None,{'status':'missing','acknowledgement':None},{'status':'absent','acknowledgement':None}):
            with self.subTest(receipt=receipt),self.assertRaises(h.Unverified):
                h.validate_receipt({**audit,'receipt':receipt},command,expected)

    def test_wrong_receipt_digest_scope_id_revision_and_state_fail(self):
        for field,value in [('operationId',OPTIONS['universe']),('revision','5'),('replayed',False),('result',{})]:
            _,command,_,expected,audit = fixture()
            audit['receipt']['acknowledgement'][field] = value
            with self.subTest(field=field),self.assertRaises(h.Unverified):h.validate_receipt(audit,command,expected)
        _,command,_,expected,audit = fixture()
        with self.assertRaises(h.Unverified):h.validate_receipt(audit,command,expected,'b'*64)
        audit = copy.deepcopy(audit)
        audit['metadata']['entries'][0]['name'] = 'Wrong server state'
        with self.assertRaises(h.Unverified):h.validate_receipt(audit,command,expected)

    def test_cli_origin_project_and_boundaries(self):
        self.assertEqual(h.validate_options(OPTIONS),OPTIONS)
        for patch in [dict(origin='https://example.com'),dict(project='http://test.supabase.co'),
                      dict(project='https://alpha-fixture.invalid'),dict(project='https://x.supabase.co/?secret=x'),
                      dict(project='https://user:private@x.supabase.co'),dict(revision='-1'),dict(name=''),dict(entry='')]:
            with self.subTest(field=list(patch)),self.assertRaises(h.Unverified):h.validate_options({**OPTIONS,**patch})

    def test_cli_without_explicit_authorization_never_connects(self):
        args = ['controller']+[v for k,value in OPTIONS.items() for v in ('--'+k,value)]
        with mock.patch('sys.argv',args),mock.patch.object(h,'find_targets') as find,mock.patch('sys.stdout',new_callable=io.StringIO):
            self.assertEqual(h.main(),2)
            find.assert_not_called()

    def test_safe_events_discard_headers_secrets_errors_and_response_bodies(self):
        client = object.__new__(h.AlphaCDP)
        client.pauses=[];client.failures=[];client.commits=[];client.read_count=0
        client.rpc_prefix=OPTIONS['project']+'/rest/v1/rpc/'
        client.event({'method':'Fetch.requestPaused','params':{'requestId':'f','networkId':'n',
            'responseStatusCode':200,'responseHeaders':[{'value':'PRIVATE_SECRET'}],
            'request':{'url':client.rpc_prefix+'cosmifold_commit_metadata','method':'POST','postData':'{}',
                       'headers':{'Authorization':'PRIVATE_SECRET'},'cookies':'PRIVATE_SECRET'}}})
        client.event({'method':'Runtime.exceptionThrown','params':{'exception':'PRIVATE_SECRET'}})
        self.assertNotIn('PRIVATE',json.dumps(client.__dict__))
        source = (ROOT/'scripts/travel-alpha-inflight.py').read_text()
        for forbidden in ('Fetch.getResponseBody','Fetch.fulfillRequest','Network.replayXHR','Page.addScriptToEvaluateOnNewDocument'):
            self.assertNotIn(forbidden,source)

    def test_duplicate_and_observer_commits_rejected_before_forward(self):
        for observer in (False,True):
            writer,reader = mock.Mock(),mock.Mock()
            writer.target_id='w';reader.target_id='o'
            controller=h.Controller(writer,reader,OPTIONS)
            controller.started=True;controller.request_allowed=1
            item=dict(url=controller.prefix+'cosmifold_commit_metadata',method='POST',status=None,
                      postData=json.dumps({'p_command':{}}),requestId='f')
            with self.assertRaises(h.Unverified):controller.handle(reader if observer else writer,item)
            writer.call.assert_not_called();reader.call.assert_not_called()


if __name__ == '__main__':
    unittest.main()
