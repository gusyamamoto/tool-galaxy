"""Real isolated browser tabs/reload, mocked Auth and HTTP RPC only; no Supabase/SQL."""
import json
import hashlib
import threading
import time
import urllib.request


def make_handler(base):
    from cloud_concurrency_browser import make_handler as shared_handler
    class RecoveryHandler(shared_handler(base)):
        # Local/mock timing model only; no PostgreSQL lock evidence is fabricated
        # for a manual run. The real coordinator's SQL interface is substituted.
        delay=None
        def do_POST(self):
            if self.path.startswith('/__phase_c_delay__/'):
                request=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                action=self.path.rsplit('/',1)[-1]
                if action=='arm':
                    type(self).delay={'descriptor':request,'arrived':threading.Event(),'release':threading.Event(),'armed':True}
                    result={'armed':True}
                elif action=='release':
                    type(self).delay['release'].set();result={'released':True}
                else:
                    d=type(self).delay;plan=d['descriptor'];rows=self.phase_b_mock['rows'];receipts=self.phase_b_mock['receipts']
                    result={'monitorPid':103,'readOnly':'on','holderActive':not d['release'].is_set(),
                        'exactServer':rows.get(plan['scope']['universeId'])==plan['metadata0'],
                        'originalReceiptCount':sum(1 for key in receipts if key[0]==plan['scope']['universeId']),
                        'requestDigest':hashlib.sha256(json.dumps(plan['command'],sort_keys=True,separators=(',',':')).encode()).hexdigest(),
                        'writers':[{'pid':102,'xid':None,'virtualXid':'6/3','queryStart':'2026-10-14T00:00:00Z','blockers':[101]}] if d['arrived'].is_set() else []}
                encoded=json.dumps(result).encode();self.send_response(200);self.send_header('Content-Type','application/json')
                self.send_header('Content-Length',str(len(encoded)));self.end_headers();self.wfile.write(encoded);return
            if self.path=='/__phase_c_commit__':
                d=type(self).delay
                if d and d['armed']:
                    d['armed']=False;d['arrived'].set()
                    if not d['release'].wait(10):self.send_error(408);return
                self.path='/__phase_b_mock_rpc__'
            return super().do_POST()
    return RecoveryHandler


def run_cloud_recovery_checks(*, cdp, evaluate, check, origin):
    baseline = evaluate("localStorage.getItem('galaxy:user-data')")
    fixture = r"""
    if(location.pathname==='/dev/cloud-recovery-diagnostic.html'){
      document.addEventListener('load',event=>{
        if(event.target.src?.endsWith('/dev/cloud-recovery-diagnostic.js')){
          const original=createCloudRecoveryDiagnostic;
          createCloudRecoveryDiagnostic=options=>original({...options,nativeCommitURL:()=>location.origin+'/__phase_c_commit__'});
          return;
        }
        if(!event.target.src?.endsWith('/services/supabase-client.js'))return;
        const id='00000000-0000-4000-8000-000000000001',session={user:{id,email:'fixture@example.invalid'},access_token:'FIXTURE_PRIVATE_TOKEN'};
        globalThis.loadSupabaseAuthSDK=async()=>({createClient(){return {
          auth:{async getSession(){return {data:{session},error:null};},onAuthStateChange(fn){queueMicrotask(()=>fn('INITIAL_SESSION',session));return {data:{subscription:{unsubscribe(){}}}};}},
          schema(schema){if(schema!=='public')throw Error('Private API');return {rpc(name,params){return {retry:async retry=>{
            if(retry!==false)throw Error('Retry');const request={name,params,actor:id};
            if(name==='cosmifold_create_universe')request.emptyMetadata=cloudRecoveryPlan.metadata(JSON.parse(localStorage.getItem(recoveryDiagnostic.markerKey)),'0');
            return (await fetch(name==='cosmifold_commit_metadata'?'/__phase_c_commit__':'/__phase_b_mock_rpc__',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)})).json();
          }};}};}
        };}});
      },true);
    }
    """

    def wait(client, expression):
        until = time.monotonic() + 20
        while not client.evaluate(expression):
            assert time.monotonic() < until, 'Recovery browser timeout: ' + expression
            time.sleep(0.05)

    def navigate(client):
        client.call('Page.navigate', url=origin+'/dev/cloud-recovery-diagnostic.html')
        wait(client, "document.readyState==='complete'&&typeof recoveryDiagnostic!=='undefined'")

    def click(client, button, expected):
        client.evaluate(f"document.getElementById('{button}').click()")
        wait(client, '!recoveryBusy')
        output = client.evaluate('recoveryOutput.textContent')
        assert 'STOPPED:' not in output, output
        check(expected in output, 'Phase C '+button+' reports '+expected)

    cdp.call('Page.addScriptToEvaluateOnNewDocument', source=fixture)
    navigate(cdp)
    check(not any('/__phase_b_mock_rpc__' in r['url'] for r in cdp.requests), 'diagnostic startup makes no Auth/RPC request')
    click(cdp, 'prepare', 'PREPARED:')
    identity = cdp.evaluate('recoveryDiagnostic.identity()')
    click(cdp, 'dispatch', 'original operation journal persisted')
    before = cdp.evaluate('localStorage.getItem('+json.dumps(identity['cacheKey'])+')')
    check(json.loads(before)['pending']['command']['operationId'] == identity['operationId'], 'journal carries original ID')
    cdp.call('Page.reload')
    wait(cdp, "document.readyState==='complete'&&typeof recoveryDiagnostic!=='undefined'")
    click(cdp, 'reopen', 'same original operation ID')
    click(cdp, 'blocked', 'dependent write rejected')
    check(cdp.evaluate('localStorage.getItem('+json.dumps(identity['cacheKey'])+')') == before, 'reload/outage keeps exact pending cache')

    target = cdp.call('Target.createTarget', url='about:blank')['targetId']
    port = cdp.sock.getpeername()[1]
    pages = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json'))
    peer = type(cdp)(next(p['webSocketDebuggerUrl'] for p in pages if p['id'] == target))
    try:
        for method in ['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable']:
            peer.call(method)
        peer.call('Page.addScriptToEvaluateOnNewDocument', source=fixture)
        navigate(peer)
        check(peer.evaluate('location.origin') == cdp.evaluate('location.origin'), 'peer uses exact same origin/shared cache/Web Locks')
        click(peer, 'reopen', 'same original operation ID')
        click(cdp, 'recover', 'real original receipt recovered revision 1')
        confirmed = cdp.evaluate('localStorage.getItem('+json.dumps(identity['cacheKey'])+')')
        click(peer, 'stale', 'stale same-origin recovery context rejected')
        check(peer.evaluate('localStorage.getItem('+json.dumps(identity['cacheKey'])+')') == confirmed, 'stale peer cannot write confirmed cache')
        click(peer, 'acknowledged', 'validated authoritative revision 1')
        click(cdp, 'again', 'no second semantic application')
        click(cdp, 'cleanup', 'guarded cleanup SQL only')
        sql = cdp.evaluate("document.getElementById('cleanup-sql').textContent")
        check(identity['operationId'] in sql and 'Receipt count changed' in sql, 'cleanup binds exact fixture and receipt, never executed')
        check(cdp.evaluate("localStorage.getItem('galaxy:user-data')") == baseline, 'real local Cosmos snapshot unchanged')
        check(not any('.supabase.co' in r['url'] or 'cdn.jsdelivr.net' in r['url'] for client in [cdp,peer] for r in client.requests), 'all Auth/RPC transport mocked; no Supabase/CDN requests')
        check(not cdp.errors and not peer.errors, 'no Phase C browser exceptions')
        # Second case gets a different fixture only in this isolated test profile.
        click(peer, 'dispose', 'DISPOSED:')
        click(cdp, 'dispose', 'DISPOSED:')
        cdp.evaluate('localStorage.removeItem('+json.dumps(identity['cacheKey'])+');localStorage.removeItem("cosmifold:dev:cloud-recovery:v1")')
        navigate(cdp)
        cdp.evaluate("document.getElementById('test-case').value='not-dispatched'")
        click(cdp, 'prepare', 'PREPARED:')
        second = cdp.evaluate('recoveryDiagnostic.identity()')
        check(second['scope']['universeId'] != identity['scope']['universeId'], 'missing-receipt case uses a separate disposable fixture')
        click(cdp, 'dispatch', 'Harness blocked HTTP dispatch')
        cdp.call('Page.reload');wait(cdp, "document.readyState==='complete'&&typeof recoveryDiagnostic!=='undefined'")
        click(cdp, 'reopen', 'same original operation ID')
        click(cdp, 'recover', 'real missing receipt/empty server')
        click(cdp, 'blocked', 'dependent write rejected')
        record = json.loads(cdp.evaluate('localStorage.getItem('+json.dumps(second['cacheKey'])+')'))
        check(record['acknowledged']['revision']=='0' and record['pending']['command']['operationId']==second['operationId'], 'missing receipt leaves original journal unchanged and blocked')
        check(not cdp.errors, 'no missing-receipt browser exceptions')
        # New case: Chromium's actual network emulation, not a thrown Promise.
        click(cdp, 'dispose', 'DISPOSED:')
        cdp.evaluate('localStorage.removeItem('+json.dumps(second['cacheKey'])+');localStorage.removeItem("cosmifold:dev:cloud-recovery:v1")')
        navigate(cdp)
        cdp.evaluate("document.getElementById('test-case').value='browser-offline'")
        click(cdp, 'prepare', 'PREPARED:')
        network_identity = cdp.evaluate('recoveryDiagnostic.identity()')
        click(cdp, 'network-arm', 'online fixture/cache/receipt preflight passed')
        cdp.call('Network.emulateNetworkConditions', offline=True, latency=0, downloadThroughput=-1, uploadThroughput=-1)
        wait(cdp, 'navigator.onLine===false')
        try:
            click(cdp, 'dispatch', 'actual gateway transport failure while browser offline')
            interrupted = cdp.evaluate('localStorage.getItem('+json.dumps(network_identity['cacheKey'])+')')
            proof = cdp.evaluate('recoveryDiagnostic.identity().transport')
            check(proof['attempts']==1 and proof['observedOffline'] and proof['reason']=='TRANSPORT_FAILURE', 'native fetch failure recorded as unknown with one original attempt')
            click(cdp, 'network-blocked', 'real offline receipt transport is unavailable')
            click(cdp, 'blocked', 'dependent write rejected')
            check(cdp.evaluate('localStorage.getItem('+json.dumps(network_identity['cacheKey'])+')')==interrupted, 'native offline receipt failure preserves exact pending cache')
        finally:
            cdp.call('Network.emulateNetworkConditions', offline=False, latency=0, downloadThroughput=-1, uploadThroughput=-1)
        cdp.call('Page.reload');wait(cdp, "document.readyState==='complete'&&typeof recoveryDiagnostic!=='undefined'")
        click(cdp, 'network-reopen', 'reconnected real missing receipt at revision 0')
        click(cdp, 'blocked', 'dependent write rejected')
        check(cdp.evaluate('localStorage.getItem('+json.dumps(network_identity['cacheKey'])+')')==interrupted, 'reconnect/reload keeps exact original journal, no command resent')
        click(cdp, 'network-reopen', 'reconnected real missing receipt at revision 0')
        click(cdp, 'cleanup', 'guarded cleanup SQL only')
        check(cdp.evaluate("localStorage.getItem('galaxy:user-data')")==baseline, 'browser Offline gate leaves real local snapshot unchanged')
        check(not any('.supabase.co' in r['url'] or 'cdn.jsdelivr.net' in r['url'] for client in [cdp,peer] for r in client.requests), 'network-interruption browser test still uses only mocked local backend')
        check(not cdp.errors, 'no unhandled exceptions during native network interruption')
        # Real native response interception plus independent local HTTP receipt.
        # Backend is mocked; this never claims live Supabase validation.
        click(cdp, 'dispose', 'DISPOSED:')
        cdp.evaluate('localStorage.removeItem('+json.dumps(network_identity['cacheKey'])+');localStorage.removeItem("cosmifold:dev:cloud-recovery:v1")')
        navigate(cdp);navigate(peer)
        cdp.evaluate("document.getElementById('test-case').value='response-interruption'")
        click(cdp, 'prepare', 'PREPARED:')
        identity_native=cdp.evaluate('recoveryDiagnostic.identity()')
        import importlib.util
        from pathlib import Path
        spec=importlib.util.spec_from_file_location('native_inflight',Path(__file__).resolve().parents[1]/'scripts/cloud-inflight-harness.py')
        harness=importlib.util.module_from_spec(spec);spec.loader.exec_module(harness)
        pages=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json'))
        writer_url=next(p['webSocketDebuggerUrl'] for p in pages if p.get('url')==origin+'/dev/cloud-recovery-diagnostic.html' and p['id']!=target)
        observer_url=next(p['webSocketDebuggerUrl'] for p in pages if p['id']==target)
        native_writer=harness.SafeCDP(writer_url);native_observer=harness.SafeCDP(observer_url)
        try:
            evidence=harness.coordinate(native_writer,native_observer,origin,mock=True,report=lambda _:None)
            check(evidence['operationId']==identity_native['operationId'],'native coordinator uses exact original operation')
            wait(cdp,'!recoveryBusy')
            record_native=json.loads(cdp.evaluate('localStorage.getItem('+json.dumps(identity_native['cacheKey'])+')'))
            marker_native=cdp.evaluate('recoveryDiagnostic.identity()')
            check(marker_native['admission']['revision']=='1' and record_native['acknowledged']['revision']=='0' and record_native['pending']['command']['operationId']==identity_native['operationId'],'independent committed receipt visible before native failure, SDK/cache still pending at 0')
            check(any(f['errorText']=='net::ERR_INTERNET_DISCONNECTED' for f in native_writer.failures),'native request failed instead of delivering SDK success')
            click(cdp,'blocked','dependent write rejected')
            native_writer.call('Network.emulateNetworkConditions',offline=False,latency=0,downloadThroughput=-1,uploadThroughput=-1)
        finally:
            native_writer.sock.close();native_observer.sock.close()
        cdp.call('Page.reload');wait(cdp,"document.readyState==='complete'&&typeof recoveryDiagnostic!=='undefined'")
        click(cdp,'network-reopen','native interrupted response recovered ORIGINAL receipt at revision 1')
        click(cdp,'again','no second semantic application')
        click(cdp,'again','no second semantic application')
        record_after=json.loads(cdp.evaluate('localStorage.getItem('+json.dumps(identity_native['cacheKey'])+')'))
        check(record_after['acknowledged']['revision']=='1' and record_after['pending'] is None,'native response interruption survives reload and recovers acknowledged original state')
        native_commits=[r for r in cdp.requests if r['url'].endswith('/__phase_c_commit__') and json.loads(r.get('postData','{}')).get('params',{}).get('p_command',{}).get('operationId')==identity_native['operationId']]
        check(len(native_commits)==1,'native original semantic mutation sent exactly once across recovery/repeats')
        click(cdp,'cleanup','guarded cleanup SQL only')
        check(identity_native['operationId'] in cdp.evaluate("document.getElementById('cleanup-sql').textContent"),'native cleanup binds original receipt/digest, no SQL executed')
        check(cdp.evaluate("localStorage.getItem('galaxy:user-data')")==baseline,'native gate preserves local Cosmos')
        check(not any('.supabase.co' in r['url'] or 'cdn.jsdelivr.net' in r['url'] for client in [cdp,peer] for r in client.requests),'native coordinator/browser test makes no Supabase/CDN requests')
        check(not cdp.errors and not peer.errors,'no native gate unhandled browser exceptions')
        # Same native proof, now followed by controlled receipt observation only.
        # Real local HTTP receipt remains present throughout; never label it absent.
        click(cdp,'dispose','DISPOSED:')
        cdp.evaluate('localStorage.removeItem('+json.dumps(identity_native['cacheKey'])+');localStorage.removeItem("cosmifold:dev:cloud-recovery:v1")')
        navigate(cdp);navigate(peer)
        cdp.evaluate("document.getElementById('test-case').value='late-receipt'")
        click(cdp,'prepare','PREPARED:');late=cdp.evaluate('recoveryDiagnostic.identity()')
        native_writer=harness.SafeCDP(writer_url);native_observer=harness.SafeCDP(observer_url)
        try:
            evidence=harness.coordinate(native_writer,native_observer,origin,mock=True,report=lambda _:None)
            check(evidence['operationId']==late['operationId'],'late observation original commit independently proved before native failure')
            wait(cdp,'!recoveryBusy')
            native_writer.call('Network.emulateNetworkConditions',offline=False,latency=0,downloadThroughput=-1,uploadThroughput=-1)
        finally:
            native_writer.sock.close();native_observer.sock.close()
        cdp.call('Page.reload');wait(cdp,"document.readyState==='complete'&&typeof recoveryDiagnostic!=='undefined'")
        late_cache=cdp.evaluate('localStorage.getItem('+json.dumps(late['cacheKey'])+')')
        check(cdp.evaluate("document.getElementById('network-reopen').disabled"),'late case cannot bypass receipt visibility via native-reopen button')
        click(cdp,'late-reopen','controlled missing receipt kept ORIGINAL journal/ID')
        click(cdp,'blocked','dependent write rejected')
        check(cdp.evaluate('localStorage.getItem('+json.dumps(late['cacheKey'])+')')==late_cache,'controlled missing preserves exact journal/cache with original base 0')
        check(cdp.evaluate('recoveryDiagnostic.identity().visibility.state')=='observed-missing','controlled missing observation is durable and explicitly labelled')
        cdp.call('Page.reload');wait(cdp,"document.readyState==='complete'&&typeof recoveryDiagnostic!=='undefined'")
        click(cdp,'late-reopen','controlled missing receipt kept ORIGINAL journal/ID')
        check(cdp.evaluate('localStorage.getItem('+json.dumps(late['cacheKey'])+')')==late_cache,'reload does not silently release receipt visibility or advance cache')
        click(cdp,'late-release','only receipt visibility restored')
        check(cdp.evaluate('localStorage.getItem('+json.dumps(late['cacheKey'])+')')==late_cache,'release changes only observation control, not acknowledged data')
        click(cdp,'late-reopen','SAME ORIGINAL validated receipt at revision 1')
        confirmed=cdp.evaluate('localStorage.getItem('+json.dumps(late['cacheKey'])+')')
        check(json.loads(confirmed)['acknowledged']['revision']=='1' and json.loads(confirmed)['pending'] is None,'same original authoritative receipt resolves only after release')
        click(cdp,'again','no second semantic application');click(cdp,'again','no second semantic application')
        check(json.loads(cdp.evaluate('localStorage.getItem('+json.dumps(late['cacheKey'])+')'))['acknowledged']==json.loads(confirmed)['acknowledged'],'repeat recovery preserves exact acknowledged state')
        late_commits=[r for r in cdp.requests if r['url'].endswith('/__phase_c_commit__') and json.loads(r.get('postData','{}')).get('params',{}).get('p_command',{}).get('operationId')==late['operationId']]
        check(len(late_commits)==1,'late visibility recovery/reload sends exactly one original semantic command')
        click(cdp,'cleanup','guarded cleanup SQL only')
        check(late['operationId'] in cdp.evaluate("document.getElementById('cleanup-sql').textContent"),'late cleanup preserves original receipt guard')
        check(cdp.evaluate("localStorage.getItem('galaxy:user-data')")==baseline,'late receipt diagnostic leaves local Cosmos unchanged')
        check(not any('.supabase.co' in r['url'] or 'cdn.jsdelivr.net' in r['url'] for client in [cdp,peer] for r in client.requests),'late receipt browser tests use only local mock HTTP')
        check(not cdp.errors and not peer.errors,'late receipt gate has no unhandled browser exceptions')
        click(cdp,'dispose','DISPOSED:');click(peer,'dispose','DISPOSED:')
        cdp.evaluate('localStorage.removeItem('+json.dumps(late['cacheKey'])+');localStorage.removeItem("cosmifold:dev:cloud-recovery:v1")')
        navigate(cdp);navigate(peer)
        cdp.evaluate("document.getElementById('test-case').value='delayed-admission'")
        click(cdp,'prepare','PREPARED:')
        import importlib.util
        from pathlib import Path
        spec=importlib.util.spec_from_file_location('delayed_browser_harness',Path(__file__).resolve().parents[1]/'scripts/cloud-delayed-admission-harness.py')
        delayed=importlib.util.module_from_spec(spec);spec.loader.exec_module(delayed)
        plan=delayed.descriptor(cdp.evaluate('recoveryDiagnostic.delayedDescriptor()'),origin,mock=True)
        def control(action,value=None):
            req=urllib.request.Request(origin+'/__phase_c_delay__/'+action,data=json.dumps(value or {}).encode(),headers={'Content-Type':'application/json'})
            return json.load(urllib.request.urlopen(req,timeout=3))
        control('arm',plan)
        class MockHolder:
            identity={'pid':101,'xid':'1001'}
            def release(self):return control('release')
            def close(self):control('release')
        class MockMonitor:
            pid=103
            def query(self,sql):return control('status')
        dw,do=delayed.DelayedCDP(writer_url),delayed.DelayedCDP(observer_url)
        try:
            proof=delayed.coordinate(dw,do,plan,MockHolder(),MockMonitor(),mock=True,report=lambda _:None)
            check(proof['operationId']==plan['operationId'],'actual delayed coordinator uses same original ID through local mock admission/missing/release/recovery')
            check(len(dw.commits)==1,'delayed coordinator emits one original HTTP semantic commit')
        finally:
            dw.sock.close();do.sock.close()
        wait(cdp,'!recoveryBusy')
        check(cdp.evaluate('recoveryDiagnostic.identity().delayedMissing') is True,'real local HTTP missing observation recorded without visibility gate')
        confirmed=cdp.evaluate('localStorage.getItem('+json.dumps(plan['cacheKey'])+')')
        check(json.loads(confirmed)['acknowledged']['revision']=='1' and json.loads(confirmed)['pending'] is None,'delayed original HTTP commit recovered exactly once')
        cdp.call('Page.reload');wait(cdp,"document.readyState==='complete'&&typeof recoveryDiagnostic!=='undefined'")
        click(cdp,'delayed-reopen','SAME ORIGINAL validated receipt')
        click(cdp,'again','no second semantic application');click(cdp,'again','no second semantic application')
        check(json.loads(cdp.evaluate('localStorage.getItem('+json.dumps(plan['cacheKey'])+')'))['acknowledged']==json.loads(confirmed)['acknowledged'],'delayed recovery reload/repeats preserve exact acknowledged state')
        click(cdp,'cleanup','guarded cleanup SQL only')
        check(plan['operationId'] in cdp.evaluate("document.getElementById('cleanup-sql').textContent"),'delayed cleanup binds exact original receipt')
        check(cdp.evaluate("localStorage.getItem('galaxy:user-data')")==baseline,'delayed diagnostic preserves local Cosmos')
        check(not any('.supabase.co' in r['url'] or 'cdn.jsdelivr.net' in r['url'] for client in [cdp,peer] for r in client.requests),'delayed browser checks use local mock HTTP and no PostgreSQL')
        check(not cdp.errors and not peer.errors,'no delayed recovery unhandled browser exceptions')
    finally:
        peer.sock.close()
        cdp.call('Target.closeTarget', targetId=target)
