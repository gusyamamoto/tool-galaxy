"""Real isolated browser tabs/reload, mocked Auth and HTTP RPC only; no Supabase/SQL."""
import json
import time
import urllib.request


def run_cloud_recovery_checks(*, cdp, evaluate, check, origin):
    baseline = evaluate("localStorage.getItem('galaxy:user-data')")
    fixture = r"""
    if(location.pathname==='/dev/cloud-recovery-diagnostic.html'){
      document.addEventListener('load',event=>{
        if(!event.target.src?.endsWith('/services/supabase-client.js'))return;
        const id='00000000-0000-4000-8000-000000000001',session={user:{id,email:'fixture@example.invalid'},access_token:'FIXTURE_PRIVATE_TOKEN'};
        globalThis.loadSupabaseAuthSDK=async()=>({createClient(){return {
          auth:{async getSession(){return {data:{session},error:null};},onAuthStateChange(fn){queueMicrotask(()=>fn('INITIAL_SESSION',session));return {data:{subscription:{unsubscribe(){}}}};}},
          schema(schema){if(schema!=='public')throw Error('Private API');return {rpc(name,params){return {retry:async retry=>{
            if(retry!==false)throw Error('Retry');const request={name,params,actor:id};
            if(name==='cosmifold_create_universe')request.emptyMetadata=cloudRecoveryPlan.metadata(JSON.parse(localStorage.getItem(recoveryDiagnostic.markerKey)),'0');
            return (await fetch('/__phase_b_mock_rpc__',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)})).json();
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
    finally:
        peer.sock.close()
        cdp.call('Target.closeTarget', targetId=target)
