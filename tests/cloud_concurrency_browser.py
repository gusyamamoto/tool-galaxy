"""Two real browser origins; standard-library local mock server. No Supabase requests/SQL."""
import copy
import hashlib
import json
import threading
import time
import urllib.request


def make_handler(base):
    rows, receipts, calls, lock = {}, {}, [], threading.Lock()

    class Handler(base):
        def do_POST(self):
            if self.path != '/__phase_b_mock_rpc__':
                self.send_error(404)
                return
            request = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            name, params, actor = request['name'], request['params'], request['actor']
            with lock:
                calls.append(request)
                data, error = None, None
                scope = params.get('p_scope') or params.get('p_command', {}).get('scope', {})
                identity = scope.get('universeId') or params.get('p_universe_id')
                row = rows.get(identity)
                if not actor or scope.get('ownerUserId', actor) != actor:
                    error = '42501'
                elif name == 'cosmifold_create_universe':
                    if row and row['universe']['owner_id'] != actor:
                        error = '42501'
                    else:
                        if not row:
                            rows[identity] = copy.deepcopy(request['emptyMetadata'])
                        data = rows[identity]
                elif not row or row['universe']['owner_id'] != actor:
                    data = {'status': 'absent', 'metadata': None} if name == 'cosmifold_read_universe' else {'status': 'absent', 'acknowledgement': None}
                elif name == 'cosmifold_read_universe':
                    data = {'status': 'found', 'metadata': row}
                elif name == 'cosmifold_operation_receipt':
                    receipt = receipts.get((identity, params['p_operation_id']))
                    data = {'status': 'found', 'request_digest': receipt['digest'], 'acknowledgement': {**receipt['ack'], 'replayed': True}} if receipt else {'status': 'missing', 'acknowledgement': None}
                elif name == 'cosmifold_commit_metadata':
                    command = params['p_command']
                    digest = hashlib.sha256(json.dumps(command, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
                    key = (identity, command['operationId'])
                    old_receipt = receipts.get(key)
                    if old_receipt:
                        if digest != old_receipt['digest']:
                            error = 'CM004'
                        else:
                            data = {**old_receipt['ack'], 'replayed': True}
                    elif row['universe']['revision'] != command['baseRevision']:
                        error = 'CM003'
                    else:
                        next_row = copy.deepcopy(row)
                        for relation, upserts in command['payload'].get('upsert', {}).items():
                            for upsert in upserts:
                                next_row[relation] = [r for r in next_row[relation] if r['id'] != upsert['id']] + [upsert]
                        if 'snapshot_fields' in command['payload']:
                            next_row['snapshot_fields'] = command['payload']['snapshot_fields']
                        revision = str(int(row['universe']['revision']) + 1)
                        next_row['universe']['revision'] = revision
                        rows[identity] = next_row
                        data = {'scope': scope, 'operationId': command['operationId'], 'baseRevision': command['baseRevision'], 'revision': revision, 'status': 'committed', 'replayed': False, 'result': None}
                        receipts[key] = {'digest': digest, 'ack': copy.deepcopy(data)}
                else:
                    error = 'PGRST202'
                response = {'status': 400 if error else 200, 'data': data if not error else None, 'error': {'code': error} if error else None}
                encoded = json.dumps(response).encode()
            # Small test-only transport latency makes strict client overlap
            # deterministic for the local revision-4 barrier, not a live claim.
            if name == 'cosmifold_commit_metadata' and params['p_command']['baseRevision'] == '4' and not error:
                time.sleep(0.05)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

    # Same relay used by the manual loopback server; mock RPC transport remains
    # local and is never forwarded to Supabase.
    import importlib.util
    spec=importlib.util.spec_from_file_location('phase_b_relay', __import__('pathlib').Path(__file__).resolve().parents[1]/'scripts/serve-cloud-barrier.py')
    relay=importlib.util.module_from_spec(spec);spec.loader.exec_module(relay)
    with_relay=relay.make_handler(Handler)
    class Combined(with_relay):
        def do_POST(self):
            with lock:
                if not hasattr(self.server,'phase_b_barrier'):
                    self.server.phase_b_barrier=relay.Barrier(self.server.server_port)
            return super().do_POST()
    Combined.phase_b_mock = {'rows': rows, 'receipts': receipts, 'calls': calls}
    return Combined


def run_cloud_concurrency_checks(*, cdp, evaluate, check, origin, root, screenshot_dir):
    baseline = evaluate("localStorage.getItem('galaxy:user-data')")
    fixture = r"""
    if(location.pathname==='/dev/cloud-concurrency-diagnostic.html'){
      document.addEventListener('load',event=>{
        if(!event.target.src?.endsWith('/services/supabase-client.js'))return;
        const id='00000000-0000-4000-8000-000000000001',listeners=new Set(),session={user:{id,email:'fixture@example.invalid'},access_token:'FIXTURE_PRIVATE_TOKEN'};
        globalThis.loadSupabaseAuthSDK=async()=>({
          createClient(){
            return {
              auth:{async getSession(){return {data:{session},error:null};},
                onAuthStateChange(fn){listeners.add(fn);queueMicrotask(()=>fn('INITIAL_SESSION',session));return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};}},
              schema(schema){
                if(schema!=='public')throw Error('Private schema');
                return {rpc(name,params){
                  return {retry:async retry=>{
                    if(retry!==false)throw Error('Automatic retry');const request={name,params,actor:id};
                    if(name==='cosmifold_create_universe')request.emptyMetadata=cloudConcurrencyPlan.metadata(phaseB.fixtures().fixture,0);
                    return (await fetch('/__phase_b_mock_rpc__',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)})).json();
                  }};
                }};
              }
            };
          }
        });
      },true);
    }
    """
    def wait(client, expression, seconds=15):
        deadline = time.monotonic() + seconds
        while not client.evaluate(expression):
            assert time.monotonic() < deadline, 'Phase B browser timeout: ' + expression
            time.sleep(0.05)

    cdp.call('Page.addScriptToEvaluateOnNewDocument', source=fixture)
    cdp.call('Page.navigate', url=origin+'/dev/cloud-concurrency-diagnostic.html')
    wait(cdp, "document.readyState==='complete'&&typeof phaseB!=='undefined'")
    check(not any('/__phase_b_mock_rpc__' in r['url'] for r in cdp.requests), 'Phase B loads without Auth/RPC requests')
    check(cdp.evaluate("loadSupabaseAuthSDK.toString().includes('__phase_b_mock_rpc__')"), 'fake SDK installed before any Auth action')
    target = cdp.call('Target.createTarget', url='about:blank')['targetId']
    debug_port = cdp.sock.getpeername()[1]
    pages = json.load(urllib.request.urlopen(f'http://127.0.0.1:{debug_port}/json'))
    right = type(cdp)(next(p['webSocketDebuggerUrl'] for p in pages if p['id'] == target))
    try:
        for method in ['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable']:
            right.call(method)
        right.call('Page.addScriptToEvaluateOnNewDocument', source=fixture)
        right_origin = origin.replace('127.0.0.1', 'localhost')
        right.call('Page.navigate', url=right_origin+'/dev/cloud-concurrency-diagnostic.html')
        wait(right, "document.readyState==='complete'&&typeof phaseB!=='undefined'")
        right.evaluate("localStorage.setItem('galaxy:user-data','KEEP_RIGHT_LOCAL')")

        def click(client, button, expected):
            client.evaluate(f"document.getElementById('{button}').click()")
            wait(client, "!phaseBBusy", 20)
            output = client.evaluate('phaseBOutput.textContent')
            assert 'STOPPED:' not in output, output + '\nBrowser errors: ' + repr(client.errors)
            check(expected in output, 'Phase B '+button+' reports '+expected)

        click(cdp, 'prepare', 'seeded at revision 1')
        f = cdp.evaluate('phaseB.fixtures().fixture')
        right.evaluate("document.getElementById('join-fixture').value="+json.dumps(json.dumps(f)))
        click(right, 'join', 'independent origin/cache')
        check(cdp.evaluate('location.origin') != right.evaluate('location.origin'), 'two independent browser origins exercised')
        for kind in ['race', 'identical']:
            for client in [cdp, right]:
                client.evaluate("document.getElementById('case').value="+json.dumps(kind)+";document.getElementById('case').dispatchEvent(new Event('change'))")
            readiness = right.evaluate("phaseB.readiness('identical')") if kind=='identical' else None
            if kind=='identical':
                check(not right.evaluate("document.getElementById('case-status').textContent.includes('NOT VERIFIED')"), 'RIGHT explicitly verified race before next case')
                cdp.evaluate("document.getElementById('readiness-json').value="+json.dumps(json.dumps(readiness))+";document.getElementById('readiness-json').dispatchEvent(new Event('input'))")
            ticket = cdp.evaluate("phaseB.makeTicket("+json.dumps(kind)+",5000,"+json.dumps(readiness)+")")
            for client in [cdp, right]:
                client.evaluate("document.getElementById('ticket-json').value="+json.dumps(json.dumps(ticket))+";document.getElementById('arm').click()")
            for client in [cdp, right]:
                wait(client, "!phaseBBusy", 20)
                assert 'STOPPED:' not in client.evaluate('phaseBOutput.textContent'), client.evaluate('phaseBOutput.textContent')
            observations = [client.evaluate('JSON.parse(document.getElementById("observation").value)') for client in [cdp, right]]
            for client, peer in [(cdp, observations[1]), (right, observations[0])]:
                if kind=='race' and client is right:
                    for page in [cdp,right]:
                        page.evaluate("document.getElementById('case').value='identical';document.getElementById('case').dispatchEvent(new Event('change'))")
                    check(right.evaluate("document.getElementById('arm').disabled&&document.getElementById('case-status').textContent.includes('NOT VERIFIED')") and
                          cdp.evaluate("document.getElementById('ticket').disabled"), 'one-sided verification cannot enable next ticket or RIGHT dispatch')
                    for page in [cdp,right]:
                        page.evaluate("document.getElementById('case').value='race';document.getElementById('case').dispatchEvent(new Event('change'))")
                client.evaluate("document.getElementById('peer').value="+json.dumps(json.dumps(peer)))
                click(client, 'verify', 'PASS: '+kind+' verified')
            check(sum(o['result']['outcome']=='stale' for o in observations)==(1 if kind=='race' else 0), kind+' expected stale/success counts')
            check(all(o['result']['submitted']==1 for o in observations), kind+' dispatches once per independent context')
        for client in [cdp, right]:
            click(client, 'reuse', 'changed content with committed operation ID rejected')
        click(cdp, 'hold', 'HELD: real receipt')
        click(right, 'advance', 'committed at revision 4')
        click(cdp, 'refresh', 'prior context disposed')
        click(cdp, 'release', 'held revision-3 acknowledgement fenced')
        click(cdp, 'complete', 'UNVERIFIED: browser concurrency/fencing passed')
        click(cdp, 'lock-scripts', 'scripts generated only; no SQL was executed')
        check('pg_sleep(8)' in cdp.evaluate('document.getElementById("holder-sql").textContent') and 'rollback;' in cdp.evaluate('document.getElementById("waiter-sql").textContent'), 'bounded rollback-only lock scripts generated, not executed')
        click(cdp, 'cleanup', 'PASS: race verified')
        check('test_universes_removed' in cdp.evaluate('document.getElementById("cleanup-sql").textContent'), 'guarded cleanup generated only')
        check(cdp.evaluate("localStorage.getItem('galaxy:user-data')")==baseline and right.evaluate("localStorage.getItem('galaxy:user-data')")=='KEEP_RIGHT_LOCAL', 'both device-local Cosmos datasets untouched')
        check(not cdp.errors and not right.errors, 'no Phase B browser exceptions')
        check(not any('.supabase.co' in r['url'] or 'cdn.jsdelivr.net' in r['url'] for client in [cdp,right] for r in client.requests), 'all requests use local mocked backend; no Supabase/CDN requests')
        for width,height,mobile in [(1440,1000,False),(600,850,False),(390,844,True)]:
            cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=mobile)
            check(cdp.evaluate("document.documentElement.scrollWidth<=innerWidth&&phaseBControls.every(b=>b.getBoundingClientRect().height>=44)"), f'Phase B width {width}: no overflow, touch targets')

        # A second ISOLATED MOCK fixture reproduces the old sequencing failure.
        # Only this temporary browser profile/mock server is touched, never live storage.
        for client in [cdp,right]:
            client.evaluate("phaseB.dispose();sessionStorage.removeItem('cosmifold:dev:cloud-concurrency:v1')")
            client.call('Page.reload');time.sleep(0.2)
            wait(client,"document.readyState==='complete'&&typeof phaseB!=='undefined'&&phaseB.fixtures()===null")
        click(cdp,'prepare','seeded at revision 1');f=cdp.evaluate('phaseB.fixtures().fixture')
        right.evaluate("document.getElementById('join-fixture').value="+json.dumps(json.dumps(f)))
        click(right,'join','independent origin/cache')
        ticket=cdp.evaluate("phaseB.makeTicket('race',5000)")
        for client in [cdp,right]:
            client.evaluate("document.getElementById('ticket-json').value="+json.dumps(json.dumps(ticket))+";document.getElementById('arm').click()")
        for client in [cdp,right]:wait(client,'!phaseBBusy',20)
        race=[client.evaluate('JSON.parse(document.getElementById("observation").value)') for client in [cdp,right]]
        cdp.evaluate("document.getElementById('peer').value="+json.dumps(json.dumps(race[1])))
        click(cdp,'verify','PASS: race verified')
        legacy=cdp.evaluate("cloudConcurrencyPlan.ticket(phaseB.fixtures().fixture,'identical',Date.now()+5000,crypto.randomUUID())")
        check(right.evaluate("phaseB.arm("+json.dumps(legacy)+").catch(e=>e.code)")=='VERIFY_PREVIOUS_CASE_FIRST','mock reproduces RIGHT rejection before dispatch')
        committed=cdp.evaluate("phaseB.arm("+json.dumps(legacy)+")")
        right.evaluate("phaseB.verify('race',"+json.dumps(race[0])+")")
        for client in [cdp,right]:client.evaluate("phaseB.recoverIdentical("+json.dumps(committed)+")")
        check(cdp.evaluate('phaseB.fixtures().verified.identicalCommitted') and right.evaluate('phaseB.fixtures().verified.identicalCommitted'),'both mocked revision-3 contexts recovered without resubmission')
        click(cdp,'concurrent-prepare','fresh concurrent-recovery plan allocated locally')
        plan=cdp.evaluate('JSON.parse(document.getElementById("concurrent-plan").value)')
        right.evaluate("document.getElementById('concurrent-plan').value="+json.dumps(json.dumps(plan)))
        click(right,'concurrent-join','RIGHT joined the same fresh recovery operation read-only')
        for client in [cdp,right]:click(client,'concurrent-ready','readiness checked at revision 3')
        check(cdp.evaluate("document.getElementById('concurrent-ticket').disabled&&document.getElementById('concurrent-arm').disabled"),'manual-copy countdown is retired even before RIGHT readiness')
        readiness=right.evaluate('document.getElementById("concurrent-ready-json").value')
        cdp.evaluate("document.getElementById('concurrent-ready-json').value="+json.dumps(readiness)+";document.getElementById('concurrent-ready-json').dispatchEvent(new Event('input'))")
        check(cdp.evaluate("document.getElementById('concurrent-ticket').disabled&&document.getElementById('concurrent-arm').disabled"),'matching readiness cannot re-enable retired countdown dispatch')
        ticket=cdp.evaluate("phaseB.concurrentTicket(JSON.parse(document.getElementById('concurrent-ready-json').value),5000)")
        # Reproduce the historical released dispatch directly in this mock only.
        # The current page has no countdown-dispatch handler and cannot trigger it.
        observation=cdp.evaluate("phaseB.armConcurrent("+json.dumps(ticket)+")")
        check(right.evaluate("phaseB.armConcurrent("+json.dumps(ticket)+").catch(e=>e.code)")=='TICKET_EXPIRED_OR_TOO_FAR','RIGHT expiry precedes mutation/dispatch marker')
        check(right.evaluate('phaseB.fixtures().attempts.concurrentRecovery.dispatch===undefined'),'expired RIGHT has no recorded dispatch')
        for client in [cdp,right]:
            cached=client.evaluate("localStorage.getItem('cosmifold:cloud-cache:v1:'+phaseB.fixtures().fixture.scope.ownerUserId+':'+phaseB.fixtures().fixture.scope.universeId)")
            client.evaluate("document.getElementById('concurrent-audit-observation').value="+json.dumps(json.dumps(observation)))
            click(client,'concurrent-audit','fresh LEFT recovery commit and receipt verified read-only at revision 4')
            check(client.evaluate("localStorage.getItem('cosmifold:cloud-cache:v1:'+phaseB.fixtures().fixture.scope.ownerUserId+':'+phaseB.fixtures().fixture.scope.universeId)")==cached,'revision-4 read-only audit retains cache bytes')
            check(client.evaluate('phaseB.fixtures().verified.concurrentRecovery!==true'),'LEFT-only commit is never marked concurrent PASS')
        click(cdp,'concurrent-cleanup','fresh concurrent-recovery plan allocated locally')
        check(plan['operationId'] in cdp.evaluate('document.getElementById("cleanup-sql").textContent'),'recovery cleanup pins fresh operation and exact existing Universe')
        check(cdp.evaluate("document.getElementById('advance').disabled&&document.getElementById('replay-identical').disabled"),'original revision-4/replay controls stay disabled on new path')
        check(not cdp.errors and not right.errors,'no recovery browser exceptions')
        click(cdp,'barrier-prepare','start-barrier plan allocated locally')
        plan=cdp.evaluate('JSON.parse(document.getElementById("barrier-plan").value)')
        right.evaluate("document.getElementById('barrier-plan').value="+json.dumps(json.dumps(plan)))
        click(right,'barrier-join','same revision-4 barrier plan read-only')
        cdp.evaluate("document.getElementById('barrier-park').click()")
        wait(cdp,"phaseBOutput.textContent.includes('PARKED: left')",20)
        check(cdp.evaluate('phaseB.fixtures().attempts.startBarrier.dispatch.phase')=='parked','LEFT parks before any barrier mutation')
        right.evaluate("document.getElementById('barrier-park').click()")
        for client in [cdp,right]:
            wait(client,'!phaseBBusy',25)
            assert 'STOPPED:' not in client.evaluate('phaseBOutput.textContent'),client.evaluate('phaseBOutput.textContent')
        pair=[client.evaluate('JSON.parse(document.getElementById("barrier-observation").value)') for client in [cdp,right]]
        check(pair[0]['release']==pair[1]['release'] and sum(o['result']['ack']['replayed'] for o in pair)==1,'local relay delivers same release; one original/replayed acknowledgement')
        for client,peer in [(cdp,pair[1]),(right,pair[0])]:
            client.evaluate("document.getElementById('barrier-peer').value="+json.dumps(json.dumps(peer)))
            # The strict interval check is never relaxed for a fast local mock.
            result=client.evaluate("phaseB.verifyBarrier("+json.dumps(peer)+").then(()=> 'PASS',e=>e.code)")
            check(result in ['PASS','UNVERIFIED_START_BARRIER_OVERLAP'],'barrier browser verification proves overlap or reports UNVERIFIED')
        click(cdp,'barrier-cleanup','start-barrier plan allocated locally')
        check(plan['operationId'] in cdp.evaluate('document.getElementById("cleanup-sql").textContent'),'barrier cleanup pins fifth exact receipt')
        for client in [cdp,right]:
            check(client.evaluate('phaseB.fixtures().attempts.startBarrier.dispatch.observation.result.cacheRevision')=='5','barrier cache advances only to acknowledged revision 5')
        check(not cdp.errors and not right.errors,'no start-barrier browser exceptions')
        check(not any('.supabase.co' in r['url'] or 'cdn.jsdelivr.net' in r['url'] for client in [cdp,right] for r in client.requests),'barrier/browser test makes no real Supabase/CDN requests')
        for client in [cdp,right]:
            check(client.evaluate('phaseB.fixtures().verified.startBarrier===true'),'negative reuse requires this context verified first')
            before_cache=client.evaluate("localStorage.getItem('cosmifold:cloud-cache:v1:'+phaseB.fixtures().fixture.scope.ownerUserId+':'+phaseB.fixtures().fixture.scope.universeId)")
            click(client,'barrier-reuse','changed-content reuse of the committed barrier operation ID rejected definitively')
            check(client.evaluate("localStorage.getItem('cosmifold:cloud-cache:v1:'+phaseB.fixtures().fixture.scope.ownerUserId+':'+phaseB.fixtures().fixture.scope.universeId)")==before_cache,'negative reuse preserves acknowledged revision-5 cache bytes')
            check(client.evaluate("document.getElementById('barrier-reuse').disabled&&phaseB.fixtures().verified.barrierReuse===true"),'negative reuse cannot be clicked twice')
        check(not cdp.errors and not right.errors,'no barrier reuse browser exceptions')
        click(cdp,'barrier-lock-scripts','revision-5 holder/waiter SQL generated only')
        holder=cdp.evaluate('document.getElementById("barrier-holder-sql").textContent')
        waiter=cdp.evaluate('document.getElementById("barrier-waiter-sql").textContent')
        check('pg_sleep(20)' in holder and 'revision=5 for update' in holder and holder.endswith('rollback;') and waiter.endswith('rollback;'),'exact bounded revision-5 locking scripts generated, never executed')
        check(cdp.evaluate('phaseB.fixtures().verified.barrierLocking!==true'),'SQL generation cannot claim independent locking PASS')
        check(right.evaluate('document.getElementById("barrier-lock-scripts").disabled'),'revision-5 SQL procedure starts only from LEFT')
        # Synthetic evidence tests UI wiring only; no SQL or live locking is claimed.
        cdp.evaluate("""(()=>{const m=phaseB.fixtures(),p=m.attempts.startBarrier.plan,t={format:'cosmifold-phase-b-sql-lock',evidenceVersion:1,planId:p.planId,operationId:p.operationId,revision:'5',scope:m.fixture.scope,role:'authenticated'};
            document.getElementById('barrier-lock-evidence').value=JSON.stringify([{...t,kind:'holder',backendPid:10,acquiredAt:10000,holdCompletedAt:30000},{...t,kind:'waiter',backendPid:11,startedAt:12000,finishedAt:14000,outcome:'lock-timeout-observed'}]);})()""")
        click(cdp,'barrier-verify-lock','independent SQL locking at revision 5')
        before_cache=cdp.evaluate("localStorage.getItem('cosmifold:cloud-cache:v1:'+phaseB.fixtures().fixture.scope.ownerUserId+':'+phaseB.fixtures().fixture.scope.universeId)")
        click(cdp,'barrier-hold','HELD: real revision-4 receipt')
        check(cdp.evaluate("document.getElementById('barrier-cleanup').disabled&&!document.getElementById('barrier-refresh').disabled"),'hold enables only fresh-context step, not cleanup/mutation')
        click(cdp,'barrier-refresh','fresh repository opened authoritative revision 5')
        click(cdp,'barrier-release','delayed real revision-4 receipt rejected')
        check(cdp.evaluate("localStorage.getItem('cosmifold:cloud-cache:v1:'+phaseB.fixtures().fixture.scope.ownerUserId+':'+phaseB.fixtures().fixture.scope.universeId)")==before_cache,'delayed receipt fence keeps exact cache bytes')
        click(cdp,'barrier-complete','COMPLETE: Phase B competing writes')
        check(cdp.evaluate('phaseB.fixtures().verified.barrierFencing===true'),'final read-only fence stored alongside unchanged prior evidence')
        check(not cdp.errors and not right.errors,'no final-fencing browser exceptions')
    finally:
        right.sock.close()
        cdp.call('Target.closeTarget', targetId=target)
