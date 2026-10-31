"""Native CDP controller over real Alpha UI + loopback-only synthetic HTTP RPCs.

Creates a NEW temporary artifact/profile; blocks HTTPS; no live Supabase/SQL,
credentials, existing deployment artifacts, or regular browser storage.
"""
import copy
import functools
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name,ROOT/path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


h = load('alpha_controller','scripts/travel-alpha-inflight.py')
pack = load('alpha_pack','scripts/prepare-alpha.py')
OWNER = '00000000-0000-4000-8000-000000000001'
UNIVERSE = '00000000-0000-4000-8000-000000000002'


class Service(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):
        pass

    def do_POST(self):
        # Synthetic service only. The controller receives the real request-stage
        # body and must authorize it before any server mutation can occur.
        name = self.path.removeprefix('/rest/v1/rpc/')
        params = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        server = self.server
        server.calls.append((name,copy.deepcopy(params)))
        status = 200
        with server.state_lock:
            if name == 'cosmifold_list_universes':
                result = [dict(id=UNIVERSE,owner_id=OWNER,revision=server.metadata['universe']['revision'])]
            elif name == 'cosmifold_read_universe':
                result = dict(status='found',metadata=copy.deepcopy(server.metadata))
            elif name == 'cosmifold_commit_metadata':
                command = params['p_command']
                if command['scope'] != dict(ownerUserId=OWNER,universeId=UNIVERSE):
                    status,result = 403,dict(code='42501',message='FORBIDDEN')
                elif command['baseRevision'] != server.metadata['universe']['revision']:
                    status,result = 409,dict(code='CM003',message='REVISION_CONFLICT')
                else:
                    next_metadata = copy.deepcopy(server.metadata)
                    for row in command['payload']['upsert']['entries']:
                        index = next(i for i,old in enumerate(next_metadata['entries']) if old['id'] == row['id'])
                        next_metadata['entries'][index] = copy.deepcopy(row)
                    next_metadata['universe']['revision'] = str(int(command['baseRevision'])+1)
                    result = dict(scope=command['scope'],operationId=command['operationId'],baseRevision=command['baseRevision'],
                                  revision=next_metadata['universe']['revision'],status='committed',replayed=False,result=None)
                    receipt = dict(status='found',request_digest=hashlib.sha256(json.dumps(command,sort_keys=True).encode()).hexdigest(),
                                   acknowledgement={**result,'replayed':True})
                    # Atomic local service model, independently observable BEFORE
                    # returning HTTP success. This is not a PostgreSQL claim.
                    server.metadata = next_metadata
                    server.receipts[command['operationId']] = receipt
            elif name == 'cosmifold_operation_receipt':
                result = (copy.deepcopy(server.receipts.get(params['p_operation_id'])) if not server.hide_receipt else None) or dict(status='missing',acknowledgement=None)
            else:
                status,result = 403,dict(code='42501',message='FORBIDDEN')
        encoded = json.dumps(result).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(encoded)))
        self.end_headers()
        try:
            self.wfile.write(encoded)
        except (BrokenPipeError,ConnectionResetError):
            pass


SDK = r"""
 loadSupabaseAuthSDK=async()=>({createClient(){
  const user={id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.invalid'};
  const session={user,access_token:'SYNTHETIC_ONLY_NOT_A_CREDENTIAL'};
  return {auth:{async getSession(){return {data:{session},error:null}},
    async getUser(){return {data:{user},error:null}},
    onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},stopAutoRefresh(){}},
   schema(schema){
    if(schema!=='public')throw Error('Private schema');
    return {rpc(name,params){
     return {async retry(value){
      if(value!==false)throw Error('Retry forbidden');
      const response=await fetch('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)});
      const body=await response.json();return {status:response.status,error:response.ok?null:body,data:response.ok?body:null};
     }};
    }};
   }};
 }});
"""


class NativeAlpha(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='cosmifold-alpha-interrupt-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        artifact = self.root/'artifact'
        pack.prepare(artifact)
        self.server = http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Service,directory=str(artifact)))
        self.server.state_lock=threading.Lock();self.server.receipts={};self.server.calls=[];self.server.hide_receipt=False
        self.server.metadata = dict(format='cosmifold-cloud-metadata',projectionVersion=1,storageVersion=5,
            universe=dict(id=UNIVERSE,owner_id=OWNER,revision='3'),
            snapshot_fields=dict(connections=True,portals=True,constellations=True,archivedGalaxies=True),
            entries=[dict(universe_id=UNIVERSE,id=id,parent_id=parent,parent_id_present=True,name=name,ordinal=i,
                          attributes_json={'createdAt':'2026-10-30T00:00:00.000Z'})
                     for i,(id,parent,name) in enumerate([('root',None,'Mexico Alpha'),('child','root','Oaxaca stay')])],
            constellations=[],constellation_members=[],linked_placements=[])
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
        self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
        self.origin = f'http://127.0.0.1:{self.server.server_port}'
        self.options = h.validate_options(dict(origin=self.origin,project='https://alpha-fixture.invalid',owner=OWNER,
            universe=UNIVERSE,entry='child',revision='3',name='Recovered Alpha rename'),synthetic=True)
        (artifact/'alpha/config.js').write_text('const cosmifoldAlphaConfig=Object.freeze('+json.dumps(dict(
            applicationMode='cloud-alpha',milestone=2,cloudEnabled=True,allowedOrigin=self.origin,
            localBetaOrigin='http://127.0.0.1:1',authStorageKey='cosmifold:travel-alpha:auth:v1'))+');',encoding='utf-8')
        (artifact/'alpha/auth-config.js').write_text("const cosmifoldAuthConfig=Object.freeze({SUPABASE_URL:'https://alpha-fixture.invalid/',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_TEST_ONLY'});",encoding='utf-8')
        # Install the synthetic SDK synchronously before Alpha constructs its
        # provider (which captures loadSDK). A script load-event callback does
        # not provide that parser-order guarantee. Only this temporary artifact
        # is changed; production Auth/provider code remains untouched.
        entry = artifact/'index.html'
        client_script = '<script src="services/supabase-client.js"></script>'
        html = entry.read_text(encoding='utf-8')
        self.assertEqual(html.count(client_script),1)
        entry.write_text(html.replace(client_script,client_script+'\n<script>'+SDK+'</script>'),encoding='utf-8')
        with socket.socket() as available:
            available.bind(('127.0.0.1',0));self.port=available.getsockname()[1]
        browser = h.native.transport.find_browser()
        startup = {}
        if os.name == 'nt':
            info = subprocess.STARTUPINFO();info.dwFlags |= subprocess.STARTF_USESHOWWINDOW;info.wShowWindow=subprocess.SW_HIDE
            startup['startupinfo'] = info
        self.process = subprocess.Popen([browser,'--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
            '--remote-debugging-address=127.0.0.1',f'--remote-debugging-port={self.port}',
            '--user-data-dir='+str(self.root/'profile'),'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,**startup)
        self.addCleanup(self.stop_browser)
        until = time.monotonic()+15
        while True:
            try:
                page=next(p for p in h.native.discover_pages(self.port) if p['type']=='page')
                break
            except (OSError,StopIteration):
                if time.monotonic()>until:raise
                time.sleep(.1)
        self.writer = h.AlphaCDP(page['webSocketDebuggerUrl'])
        target = self.writer.call('Target.createTarget',url='about:blank')['targetId']
        page = next(p for p in h.native.discover_pages(self.port) if p['id']==target)
        self.observer = h.AlphaCDP(page['webSocketDebuggerUrl'])
        for client,role in zip((self.writer,self.observer),h.ROLES):
            self.addCleanup(client.sock.close)
            client.call('Network.enable');client.call('Network.setBlockedURLs',urls=['https://*'])
            client.call('Page.navigate',url=self.origin+'/')
            try:
                self.wait(lambda:h.evaluate(client,"typeof travelAlpha!=='undefined'&&alphaAuth.getState().ready&&!!travelAlpha.getState().user"))
            except AssertionError as error:
                raise AssertionError('Synthetic Alpha startup: '+json.dumps(h.evaluate(client,
                    "({ready:document.readyState,auth:typeof alphaAuth==='undefined'?null:alphaAuth.getState(),status:typeof travelAlpha==='undefined'?null:travelAlpha.getState().status})"))) from error
            h.evaluate(client,'window.name='+json.dumps(role))
        h.evaluate(self.writer,"localStorage.setItem('galaxy:user-data','BETA_SENTINEL');document.getElementById('alpha-refresh').click()")
        self.wait(lambda:h.evaluate(self.writer,"travelAlpha.getState().status==='universes-available'"))
        h.evaluate(self.writer,"document.querySelector('#alpha-datasets button').click()")
        self.wait(lambda:h.evaluate(self.writer,"travelAlpha.getState().writeStatus==='saved'&&!travelAlpha.getState().readOnly"))
        h.evaluate(self.writer,"document.querySelector('.entry-node[data-entry-id=child]').click();document.getElementById('alpha-rename-item').click();document.getElementById('entry-name').value="+json.dumps(self.options['name']))
        self.logs=[]

    def stop_browser(self):
        if self.process.poll() is None:
            self.process.terminate()
            self.process.wait(timeout=12)

    def wait(self,predicate,seconds=12):
        deadline=time.monotonic()+seconds
        while not predicate():
            self.assertLess(time.monotonic(),deadline,'Synthetic browser phase timed out')
            time.sleep(.03)

    def controller(self,missing=False):
        controller = h.Controller(self.writer,self.observer,self.options,self.logs.append,_test_rpc_origin=self.origin)
        controller.operator_timeout = 3 if missing else 12
        original_report=controller.report
        def report(message):
            original_report(message)
            if message.startswith('RESTORED:'):
                self.server.hide_receipt=missing
                h.evaluate(self.writer,"document.getElementById('alpha-entry-cancel').click();document.getElementById('alpha-reload').click()")
            if message.startswith('RECOVERED:'):
                h.evaluate(self.writer,"document.getElementById('alpha-reload').click()")
        controller.report=report
        return controller

    def test_native_response_loss_original_receipt_ui_recovery_no_duplicate(self):
        controller=self.controller()
        def restore():
            state=h.probe(self.writer,self.options)
            self.assertEqual(state['writeStatus'],'unresolved')
            self.assertTrue(state['blocked'] and state['formBlocked'] and state['readOnly'])
            self.assertEqual(state['cache']['pending']['command']['operationId'],controller.command['operationId'])
            return True
        result=controller.run(restore)
        self.assertEqual(result['revision'],'4')
        self.assertEqual(sum(name=='cosmifold_commit_metadata' for name,_ in self.server.calls),1)
        self.assertEqual(len(self.server.receipts),1)
        self.assertEqual(self.server.metadata['universe']['revision'],'4')
        self.assertTrue(all(params['p_operation_id']==result['operationId'] for name,params in self.server.calls if name=='cosmifold_operation_receipt'))
        self.assertTrue(any(line.startswith('PROVED:') for line in self.logs))
        self.assertTrue(any(line.startswith('PASS:') for line in self.logs))
        self.assertGreater(controller.receipts_blocked,0)
        self.assertGreaterEqual(controller.receipts_allowed,1)
        self.assertEqual(h.evaluate(self.writer,"localStorage.getItem('galaxy:user-data')"),'BETA_SENTINEL')
        self.assertIsNone(h.evaluate(self.observer,'globalThis.__cosmifoldAlphaInflightAudit'))

    def test_missing_receipt_after_restore_keeps_original_pending_and_stops(self):
        controller=self.controller(missing=True)
        with self.assertRaises(h.Unverified):controller.run(lambda:True)
        self.wait(lambda:h.evaluate(self.writer,"travelAlpha.getState().writeStatus==='unresolved'"))
        state=h.probe(self.writer,self.options)
        self.assertEqual(state['cache']['pending']['command']['operationId'],controller.command['operationId'])
        self.assertEqual(state['cache']['acknowledged']['revision'],'3')
        self.assertTrue(state['blocked'] and state['readOnly'])
        self.assertEqual(sum(name=='cosmifold_commit_metadata' for name,_ in self.server.calls),1)
        self.assertFalse(any(line.startswith('PASS:') for line in self.logs))


if __name__ == '__main__':
    unittest.main()
