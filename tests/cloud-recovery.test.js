const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {A,U,B,plain,deferred}=require('./fake-cloud-gateway'),{environment}=require('./fake-cloud-workspace');
const empty={version:5,entries:[],layout:[],connections:[],portals:[],constellations:[],archivedGalaxies:[]};
function diagnosticEnvironment(){const e=environment({initial:empty});let seq=10;
    e.auth.initialize=async()=>e.auth.getState();e.gateway.createUniverse=async id=>{e.calls.push({method:'create',id});return e.remote();};
    Object.assign(e.get('globalThis'),{crypto:{randomUUID:()=>`00000000-0000-4000-9000-${String(++seq).padStart(12,'0')}`}});
    for(const file of ['dev/cloud-concurrency-sql.js','dev/cloud-recovery-plan.js','dev/cloud-recovery-diagnostic.js'])e.load(file);
    e.storage.setItem('galaxy:user-data','KEEP_LOCAL');e.storage.setItem('supabase-test-session','KEEP_AUTH');e.storage.setItem('cosmifold:dev:cloud-boundary:v1','KEEP_A');
    const messages=[],factory=e.get('createCloudRecoveryDiagnostic');
    function fresh(extra={}){let count=0;return factory({auth:e.auth,gateway:e.gateway,cache:e.cache,storage:()=>e.storage,locks:()=>e.locks,
        location:{protocol:'http:',hostname:'127.0.0.1',origin:'http://127.0.0.1:5500'},nativeCommitURL:()=> 'https://example.invalid/rest/v1/rpc/cosmifold_commit_metadata',
        randomUUID:()=>++count===1?U:`00000000-0000-4000-9000-${String(++seq).padStart(12,'0')}`,
        report:text=>messages.push(text),...extra});}
    return {...e,fresh,messages};}

async function lateEnvironment(){
    const e=diagnosticEnvironment();let offline=false;
    const commit=e.gateway.commitMetadata,started=deferred(),fail=deferred();
    e.gateway.commitMetadata=async command=>{await commit(command);started.resolve();await fail.promise;
        throw Object.assign(new Error('Native failure'),{code:'OUTCOME_UNKNOWN',outcome:'unknown',reason:'TRANSPORT_FAILURE'});};
    const writer=e.fresh({isOffline:()=>offline}),observer=e.fresh(),identity=await writer.prepare('late-receipt');await writer.armNativeResponse();
    const dispatch=writer.dispatchOnce();await started.promise;writer.recordNativeAdmission(plain(await observer.auditNativeCommit()));
    offline=true;fail.resolve();await dispatch;await writer.checkBlocked();writer.dispose();observer.dispose();offline=false;
    return {...e,identity,resume:()=>e.fresh({isOffline:()=>offline})};
}

test('proved commit with controlled missing receipt survives reload, blocks writes, releases only observation, and recovers original exactly once',async()=>{
    const e=await lateEnvironment(),key=e.cache.key(e.identity.scope),before=e.storage.getItem(key),diag=e.resume();
    await assert.rejects(diag.releaseLateReceipt(),{code:'OBSERVE_CONTROLLED_MISSING_FIRST'});
    for(let i=0;i<2;i++){
        const state=await diag.reopenLateReceipt();assert.equal(state.status,'pending-reconciliation');assert.equal(state.error.reason,'RECEIPT_MISSING');
        await diag.checkBlocked();assert.equal(e.storage.getItem(key),before);assert.equal(e.remote().universe.revision,'1');
    }
    assert.equal(diag.identity().visibility.state,'observed-missing');diag.dispose();const reloaded=e.resume();await reloaded.reopenLateReceipt();
    await reloaded.releaseLateReceipt();assert.equal(e.storage.getItem(key),before);assert.equal(e.record().pending.command.operationId,e.identity.operationId);
    reloaded.dispose();const visible=e.resume();assert.equal((await visible.reopenLateReceipt()).revision,'1');
    await visible.verifyAgain();await visible.verifyAgain();assert.equal(e.record().pending,null);
    assert.equal(e.calls.filter(c=>c.method==='commit').length,1);assert.ok(e.calls.filter(c=>c.method==='receipt').every(c=>c.id===e.identity.operationId));
    let previous='0',advances=0;for(const w of e.storage.writes.filter(w=>w.key===key)){const r=JSON.parse(w.value).acknowledged.revision;if(previous==='0'&&r==='1')advances++;previous=r;}
    assert.equal(advances,1);assert.equal(e.storage.getItem('galaxy:user-data'),'KEEP_LOCAL');assert.equal(e.storage.getItem('supabase-test-session'),'KEEP_AUTH');
    const sql=await visible.cleanupSQL();assert.match(sql,/MANUAL PHASE-C CLEANUP/);assert.ok(sql.includes(e.identity.operationId));assert.ok(sql.includes('Exact receipt/digest changed'));
    const changed=e.remote();changed.entries[0].name='Unexpected';e.setRemote(changed);await assert.rejects(visible.cleanupSQL(),{code:'PHASE_C_SERVER_CHANGED'});visible.dispose();
});

test('late controlled missing cannot be claimed without a real original receipt, digest, acknowledgement and exact authoritative state',async()=>{
    for(const mode of ['missing','digest','scope','operation','base','revision','ack','state','unavailable']){
        const e=await lateEnvironment(),diag=e.resume(),key=e.cache.key(e.identity.scope),before=e.storage.getItem(key),get=e.gateway.getOperationReceipt;
        e.gateway.getOperationReceipt=async(...args)=>{const r=plain(await get(...args));
            if(mode==='missing')return {status:'missing',acknowledgement:null};
            if(mode==='unavailable')throw Object.assign(new Error('Network'),{code:'NETWORK_UNAVAILABLE'});
            if(mode==='digest')r.request_digest='f'.repeat(64);
            if(mode==='scope')r.acknowledgement.scope.ownerUserId=B;
            if(mode==='operation')r.acknowledgement.operationId=U;
            if(mode==='base')r.acknowledgement.baseRevision='1';
            if(mode==='revision')r.acknowledgement.revision='2';
            if(mode==='ack')r.acknowledgement.replayed=false;
            return r;};
        if(mode==='state'){const remote=e.remote();remote.entries[0].name='Wrong';e.setRemote(remote);}
        await assert.rejects(diag.reopenLateReceipt(),{code:'CONTROLLED_MISSING_NOT_BLOCKED'});
        assert.equal(diag.identity().visibility.state,'withheld');assert.equal(e.storage.getItem(key),before);
        assert.equal(e.messages.some(m=>m.startsWith('OBSERVATION:')),false);assert.equal(e.calls.filter(c=>c.method==='commit').length,1);diag.dispose();
    }
});

test('released late receipt rejects digest mismatch before any durable acknowledgement or publication',async()=>{
    const e=await lateEnvironment(),diag=e.resume(),key=e.cache.key(e.identity.scope);await diag.reopenLateReceipt();await diag.releaseLateReceipt();
    const before=e.storage.getItem(key),get=e.gateway.getOperationReceipt;e.gateway.getOperationReceipt=async(...args)=>({...plain(await get(...args)),request_digest:'f'.repeat(64)});
    await assert.rejects(diag.reopenLateReceipt(),{code:'ADMITTED_COMMIT_CHANGED'});assert.equal(e.storage.getItem(key),before);
    assert.equal(e.record().pending.command.operationId,e.identity.operationId);assert.equal(e.calls.filter(c=>c.method==='commit').length,1);diag.dispose();
});

test('late receipt observation is fenced on account switch or disposal without cache/control publication',async()=>{
    for(const mode of ['account','dispose']){
        const e=await lateEnvironment(),diag=e.resume(),get=e.gateway.getOperationReceipt,started=deferred(),gate=deferred();
        e.gateway.getOperationReceipt=async(...args)=>{const r=await get(...args);started.resolve();await gate.promise;return r;};
        const key=e.cache.key(e.identity.scope),before=e.storage.getItem(key),marker=e.storage.getItem(diag.markerKey),recover=diag.reopenLateReceipt();await started.promise;
        if(mode==='account')e.auth.emit(B);else diag.dispose();gate.resolve();await assert.rejects(recover,{code:'ACCOUNT_CONTEXT_CHANGED'});
        assert.equal(e.storage.getItem(key),before);assert.equal(e.storage.getItem(diag.markerKey),marker);assert.equal(e.messages.some(m=>m.startsWith('OBSERVATION:')),false);
        assert.equal(e.storage.getItem(e.cache.key({ownerUserId:B,universeId:U})),null);diag.dispose();
    }
});

test('same-origin late receipt peer cannot overwrite authoritative recovery or auto-release its observation gate',async()=>{
    const e=await lateEnvironment(),left=e.resume(),right=e.resume();await left.reopenLateReceipt();await right.reopenLateReceipt();await left.releaseLateReceipt();
    await left.reopenLateReceipt();const confirmed=e.storage.getItem(e.cache.key(e.identity.scope));
    await right.checkStalePeer();assert.equal(e.storage.getItem(e.cache.key(e.identity.scope)),confirmed);
    await assert.rejects(right.releaseLateReceipt(),{code:'OBSERVE_CONTROLLED_MISSING_FIRST'});await right.reopenAcknowledged();
    assert.equal(e.record().acknowledged.revision,'1');assert.equal(e.calls.filter(c=>c.method==='commit').length,1);left.dispose();right.dispose();
});

test('late observation controls reject incompatible or unproved marker variants; old markers do not acquire visibility gates',async()=>{
    const e=await lateEnvironment(),diag=e.resume(),plan=e.get('cloudRecoveryPlan'),m=plain(diag.identity());delete m.cacheKey;
    for(const visibility of [null,{visibilityVersion:2,state:'withheld'},{visibilityVersion:1,state:'unknown'},{visibilityVersion:1,state:'withheld',extra:1}])
        assert.throws(()=>plan.marker({...m,visibility}),{code:'INVALID_RECEIPT_VISIBILITY'});
    assert.throws(()=>plan.marker({...m,case:'response-interruption'}),{code:'UNEXPECTED_RECEIPT_VISIBILITY'});
    const early={...m,phase:'prepared',visibility:{visibilityVersion:1,state:'released'}};delete early.admission;delete early.transport;
    assert.throws(()=>plan.marker(early),{code:'UNPROVED_RECEIPT_VISIBILITY'});diag.dispose();
});

test('lost successful response journals original ID across reload; real receipt recovers once, never resubmits or changes local/Auth data',async()=>{
    const e=diagnosticEnvironment(),first=e.fresh();assert.equal(e.calls.length,0);
    const identity=await first.prepare('lost-reply');await first.dispatchOnce();const original=plain(e.record());
    assert.equal(original.acknowledged.revision,'0');assert.equal(original.pending.command.operationId,identity.operationId);assert.equal(e.remote().universe.revision,'1');
    first.dispose();const reloaded=e.fresh();await reloaded.reopenBlocked();await reloaded.checkBlocked();
    assert.deepEqual(plain(e.record()),original);await reloaded.recoverRealReceipt();await reloaded.verifyAgain();
    assert.equal(e.record().acknowledged.revision,'1');assert.equal(e.record().pending,null);
    assert.equal(e.calls.filter(call=>call.method==='commit').length,1);
    assert.ok(e.calls.filter(call=>call.method==='receipt').every(call=>call.id===identity.operationId));
    for(const [key,value] of [['galaxy:user-data','KEEP_LOCAL'],['supabase-test-session','KEEP_AUTH'],['cosmifold:dev:cloud-boundary:v1','KEEP_A']])assert.equal(e.storage.getItem(key),value);
    await assert.rejects(reloaded.dispatchOnce(),{code:'PREPARE_FIRST_NO_RETRY'});await assert.rejects(reloaded.prepare('lost-reply'),{code:'PHASE_C_FIXTURE_ALREADY_EXISTS'});
    reloaded.dispose();
});

test('withheld dispatch has a real missing receipt; repeated recovery stays blocked with exact original journal and no HTTP commit',async()=>{
    const e=diagnosticEnvironment(),first=e.fresh();const identity=await first.prepare('not-dispatched');await first.dispatchOnce();const original=plain(e.record());first.dispose();
    const reloaded=e.fresh();await reloaded.reopenBlocked();for(let i=0;i<2;i++){const state=await reloaded.recoverRealReceipt();assert.equal(state.status,'pending-reconciliation');await reloaded.checkBlocked();}
    assert.deepEqual(plain(e.record()),original);assert.equal(e.remote().universe.revision,'0');assert.equal(e.calls.filter(c=>c.method==='commit').length,0);
    assert.ok(e.calls.filter(c=>c.method==='receipt').every(c=>c.id===identity.operationId));
    await assert.rejects(reloaded.verifyAgain(),{code:'RECOVER_FIRST'});reloaded.dispose();
});

test('two same-origin contexts share pending journal; peer recovery cannot publish stale state or overwrite newer acknowledgement',async()=>{
    const e=diagnosticEnvironment(),left=e.fresh(),identity=await left.prepare('lost-reply');await left.dispatchOnce();
    const right=e.fresh();await left.reopenBlocked();await right.reopenBlocked();await left.recoverRealReceipt();const acknowledged=e.storage.getItem(e.cache.key(identity.scope));
    await right.checkStalePeer();assert.equal(e.storage.getItem(e.cache.key(identity.scope)),acknowledged);
    await right.reopenAcknowledged();assert.equal(e.record().acknowledged.revision,'1');assert.equal(e.record().pending,null);
    assert.equal(e.calls.filter(c=>c.method==='commit').length,1);left.dispose();right.dispose();
});

test('account switch during receipt recovery fences old result and preserves owner journal with no observer publication',async()=>{
    const e=diagnosticEnvironment(),diag=e.fresh(),identity=await diag.prepare('lost-reply');await diag.dispatchOnce();await diag.reopenBlocked();
    const gate=deferred(),started=deferred(),get=e.gateway.getOperationReceipt;
    e.gateway.getOperationReceipt=async(...args)=>{const value=await get(...args);started.resolve();await gate.promise;return value;};
    const before=e.storage.getItem(e.cache.key(identity.scope)),recovering=diag.recoverRealReceipt();await started.promise;e.auth.emit(B);gate.resolve();
    await assert.rejects(recovering,{code:'ACCOUNT_CONTEXT_CHANGED'});assert.equal(e.storage.getItem(e.cache.key(identity.scope)),before);
    assert.equal(e.messages.some(text=>text.includes('real original receipt recovered')),false);
    assert.equal(e.storage.getItem(e.cache.key({ownerUserId:B,universeId:U})),null);
    await assert.rejects(diag.reopenBlocked(),{code:'ORIGINAL_PHASE_C_OWNER_REQUIRED'});diag.dispose();
});

test('concurrent same-origin recovery is Web-Lock fenced and a stale repository cannot accept the already resolved operation twice',async()=>{
    const e=diagnosticEnvironment(),first=e.fresh(),identity=await first.prepare('lost-reply');await first.dispatchOnce();await first.reopenBlocked();
    const second=e.fresh();await second.reopenBlocked();const get=e.gateway.getOperationReceipt,gate=deferred(),started=deferred();
    e.gateway.getOperationReceipt=async(...args)=>{const value=await get(...args);started.resolve();await gate.promise;return value;};
    const recovering=first.recoverRealReceipt();await started.promise;const pending=e.storage.getItem(e.cache.key(identity.scope));
    await assert.rejects(second.recoverRealReceipt(),{code:'RECEIPT_RECOVERY_NOT_ACKNOWLEDGED'});assert.equal(e.storage.getItem(e.cache.key(identity.scope)),pending);
    gate.resolve();await recovering;const confirmed=e.storage.getItem(e.cache.key(identity.scope));await second.checkStalePeer();assert.equal(e.storage.getItem(e.cache.key(identity.scope)),confirmed);
    first.dispose();second.dispose();
});

test('guarded cleanup covers revision 0/1 exact owner/state/receipt and refuses modified fixture metadata',async()=>{
    for(const testCase of ['lost-reply','not-dispatched']){const e=diagnosticEnvironment(),diag=e.fresh(),identity=await diag.prepare(testCase);await diag.dispatchOnce();
        const sql=await diag.cleanupSQL();for(const guard of ['owner mismatch','Exact entry state changed','Receipt count changed','Exact receipt/digest changed'])assert.ok(sql.includes(guard));
        assert.match(sql,/^-- MANUAL PHASE-C CLEANUP\. Dispose ALL Phase C diagnostics first\./);assert.doesNotMatch(sql,/MANUAL PHASE-B CLEANUP/);
        const m=JSON.parse(e.storage.getItem(diag.markerKey)),plan=e.get('cloudRecoveryPlan'),revision=e.remote().universe.revision;
        const original=e.get('cloudConcurrencyCleanupSQL')({scope:m.scope,metadata:plan.metadata(m,revision),receipts:revision==='0'?[]:[{command:plan.command(m),ack:{...plain(plan.ack(m)),replayed:false}}]});
        assert.match(original,/^-- MANUAL PHASE-B CLEANUP\./);
        assert.equal(sql.slice(sql.indexOf('\n')),original.slice(original.indexOf('\n')),'only the comment changes; every SQL guard/body stays identical');
        assert.ok(sql.includes(identity.scope.universeId));assert.ok(sql.includes(identity.scope.ownerUserId));assert.match(sql,/commit;$/);assert.match(sql,/test_universes_removed/);
        assert.doesNotMatch(sql,/cascade|truncate/i);
        const modified=e.remote();modified.snapshot_fields.unexpected='data';e.setRemote(modified);
        await assert.rejects(diag.cleanupSQL(),{code:'PHASE_C_SERVER_CHANGED'});diag.dispose();}
});

test('preparation/session/origin/marker guards do not create/retry fixtures or inspect unrelated data',async()=>{
    const e=diagnosticEnvironment();await assert.rejects(e.fresh({location:{protocol:'https:',hostname:'tool-galaxy.pages.dev'}}).prepare('lost-reply'),{code:'LOOPBACK_ONLY'});
    e.auth.emit(null);await assert.rejects(e.fresh().prepare('lost-reply'),{code:'SIGN_IN_AT_THIS_ORIGIN_FIRST'});assert.equal(e.calls.length,0);
    e.auth.emit(A);e.storage.setItem('cosmifold:dev:cloud-recovery:v1','{}');await assert.rejects(e.fresh().prepare('lost-reply'),{code:'INVALID_PHASE_C_MARKER'});assert.equal(e.calls.length,0);
});

test('Phase C script assets are static and inactive, UI uses safe text, no private table API or token display',()=>{
    const html=fs.readFileSync('dev/cloud-recovery-diagnostic.html','utf8');for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g))assert.ok(fs.existsSync(path.resolve('dev',match[1])));
    assert.doesNotMatch(fs.readFileSync('index.html','utf8'),/cloud-recovery/);
    for(const file of ['dev/cloud-recovery-plan.js','dev/cloud-recovery-diagnostic.js','dev/cloud-recovery-page.js'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/innerHTML|access_token|refresh_token|sb_secret_|\.from\(|indexedDB|galaxy:user-data/);
});

test('actual timed-out reply survives disposal/reload; receipt advances acknowledged revision once and late reply cannot publish',async()=>{
    const e=environment({timeout:15}),gate=deferred(),started=deferred(),commit=e.gateway.commitMetadata,get=e.gateway.getOperationReceipt;
    await e.manager.bootstrap(U);let available=false,events=0;e.manager.repository().subscribe(()=>events++);
    e.gateway.getOperationReceipt=async(...args)=>{if(!available)throw Object.assign(new Error('Unavailable'),{code:'NETWORK_UNAVAILABLE'});return get(...args);};
    e.gateway.commitMetadata=async command=>{const ack=await commit(command);started.resolve();await gate.promise;return ack;};
    const repo=e.manager.repository(),save=repo.save(()=>{const next=repo.load();next.entries[1].name='Delayed';return next;});await started.promise;await assert.rejects(save);
    const original=e.record().pending.command.operationId;e.manager.dispose();available=true;const resumed=e.reload();
    assert.equal((await resumed.bootstrap(U)).revision,'1');assert.equal(e.record().pending,null);
    const before=e.storage.getItem(e.cache.key({ownerUserId:A,universeId:U}));gate.resolve();await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(e.storage.getItem(e.cache.key({ownerUserId:A,universeId:U})),before);assert.equal(events,0);
    assert.equal(e.calls.filter(call=>call.method==='commit').length,1);assert.ok(e.calls.filter(call=>call.method==='receipt').every(call=>call.id===original));
    let previous='0',advances=0;for(const write of e.storage.writes.filter(w=>w.key===e.cache.key({ownerUserId:A,universeId:U}))){const revision=JSON.parse(write.value).acknowledged.revision;
        if(previous==='0'&&revision==='1')advances++;previous=revision;}assert.equal(advances,1);resumed.dispose();
});

test('real missing receipt followed by original late commit recovers only the durable original ID without another dispatch',async()=>{
    const e=environment();await e.manager.bootstrap(U);e.gateway.commitMetadata=async command=>{e.calls.push({method:'commit',command:plain(command)});throw Object.assign(new Error('Lost'),{code:'OUTCOME_UNKNOWN',outcome:'unknown'});};
    const repo=e.manager.repository();await assert.rejects(repo.save(()=>{const next=repo.load();next.entries[1].name='Eventually';return next;}));
    const original=e.record().pending.command;e.manager.dispose();const pending=e.reload();assert.equal((await pending.bootstrap(U)).status,'pending-reconciliation');
    assert.equal(e.record().pending.command.operationId,original.operationId);e.apply(original);
    assert.equal((await pending.reconcile()).revision,'1');assert.equal(e.record().pending,null);assert.equal(e.calls.filter(c=>c.method==='commit').length,1);pending.dispose();
});

test('cache acceptance failure after receipt leaves original durable pending state; later reload resolves without second mutation',async()=>{
    const e=diagnosticEnvironment(),diag=e.fresh(),identity=await diag.prepare('lost-reply');await diag.dispatchOnce();await diag.reopenBlocked();
    const put=e.storage.setItem.bind(e.storage),before=e.storage.getItem(e.cache.key(identity.scope));
    e.storage.setItem=(key,value)=>{if(key===e.cache.key(identity.scope))throw Error('Quota');return put(key,value);};
    await assert.rejects(diag.recoverRealReceipt(),{code:'RECEIPT_RECOVERY_NOT_ACKNOWLEDGED'});assert.equal(e.storage.getItem(e.cache.key(identity.scope)),before);
    diag.dispose();e.storage.setItem=put;const reloaded=e.fresh();await reloaded.reopenBlocked();await reloaded.recoverRealReceipt();
    assert.equal(e.record().acknowledged.revision,'1');assert.equal(e.record().pending,null);assert.equal(e.calls.filter(c=>c.method==='commit').length,1);reloaded.dispose();
});

test('browser Offline requires online preflight, real transport failure and real receipt failure; reconnect/reload retains missing original operation',async()=>{
    const e=diagnosticEnvironment();let offline=false;const rawCommit=e.gateway.commitMetadata,rawReceipt=e.gateway.getOperationReceipt;
    e.gateway.commitMetadata=async command=>{if(offline){e.calls.push({method:'commit',command:plain(command)});throw Object.assign(new Error('Fetch failed'),{code:'OUTCOME_UNKNOWN',reason:'TRANSPORT_FAILURE',outcome:'unknown'});}return rawCommit(command);};
    e.gateway.getOperationReceipt=async(...args)=>{if(offline){e.calls.push({method:'receipt',id:args[1]});throw Object.assign(new Error('Fetch failed'),{code:'NETWORK_UNAVAILABLE'});}return rawReceipt(...args);};
    const diag=e.fresh({isOffline:()=>offline}),identity=await diag.prepare('browser-offline');
    await assert.rejects(diag.dispatchOnce(),{code:'PREPARE_FIRST_NO_RETRY'});await diag.armBrowserOffline();
    await assert.rejects(diag.dispatchOnce(),{code:'BROWSER_OFFLINE_REQUIRED'});assert.equal(e.record().pending,null);
    offline=true;await diag.dispatchOnce();const cached=e.storage.getItem(e.cache.key(identity.scope));
    assert.equal(diag.identity().transport.reason,'TRANSPORT_FAILURE');await diag.checkBrowserOffline();await diag.checkBlocked();
    assert.equal(e.storage.getItem(e.cache.key(identity.scope)),cached);
    await assert.rejects(diag.reopenBrowserNetwork(),{code:'RECONNECT_WITH_ORIGINAL_PROOF_REQUIRED'});
    offline=false;diag.dispose();const reloaded=e.fresh({isOffline:()=>offline});
    for(let i=0;i<2;i++){assert.equal((await reloaded.reopenBrowserNetwork()).status,'pending-reconciliation');await reloaded.checkBlocked();}
    assert.equal(e.storage.getItem(e.cache.key(identity.scope)),cached);assert.equal(e.calls.filter(c=>c.method==='commit').length,1);
    assert.equal(e.record().pending.command.operationId,identity.operationId);assert.equal(e.remote().universe.revision,'0');
    const sql=await reloaded.cleanupSQL();assert.match(sql,/MANUAL PHASE-C CLEANUP/);assert.ok(sql.includes('Receipt count changed'));reloaded.dispose();
});

test('browser transport unknown outcome can resolve only from original found receipt without retry',async()=>{
    const e=diagnosticEnvironment();let offline=false;const commit=e.gateway.commitMetadata,get=e.gateway.getOperationReceipt;
    e.gateway.commitMetadata=async command=>{await commit(command);throw Object.assign(new Error('Response lost'),{code:'OUTCOME_UNKNOWN',reason:'TRANSPORT_FAILURE',outcome:'unknown'});};
    e.gateway.getOperationReceipt=async(...args)=>{if(offline)throw Object.assign(new Error('Offline'),{code:'NETWORK_UNAVAILABLE'});return get(...args);};
    const diag=e.fresh({isOffline:()=>offline}),identity=await diag.prepare('browser-offline');await diag.armBrowserOffline();offline=true;await diag.dispatchOnce();
    assert.equal(e.record().acknowledged.revision,'0');assert.equal(e.remote().universe.revision,'1');offline=false;diag.dispose();
    const reloaded=e.fresh({isOffline:()=>offline});assert.equal((await reloaded.reopenBrowserNetwork()).revision,'1');
    assert.equal(e.record().pending,null);assert.equal(e.calls.filter(c=>c.method==='commit').length,1);
    const original=identity.operationId;assert.ok(e.calls.filter(c=>c.method==='receipt').every(c=>c.id===original));reloaded.dispose();
});

test('browser offline gate refuses unrelated failures and unexpected success instead of claiming transport proof',async()=>{
    for(const mode of ['auth','success']){const e=diagnosticEnvironment();let offline=false;
        if(mode==='auth')e.gateway.commitMetadata=async()=>{throw Object.assign(new Error('No session'),{code:'AUTH_UNAVAILABLE'});};
        e.gateway.getOperationReceipt=async()=>({status:'missing',acknowledgement:null});
        const diag=e.fresh({isOffline:()=>offline});await diag.prepare('browser-offline');await diag.armBrowserOffline();offline=true;
        await assert.rejects(diag.dispatchOnce(),{code:mode==='auth'?'REAL_TRANSPORT_FAILURE_NOT_PROVED':'UNCERTAINTY_NOT_PRESERVED'});
        assert.equal(diag.identity().phase,'dispatched');assert.equal(diag.identity().transport,undefined);
        await assert.rejects(diag.dispatchOnce(),{code:'PREPARE_FIRST_NO_RETRY'});diag.dispose();
    }
});

test('original Phase C markers remain compatible; fake/mis-scoped network evidence is rejected',()=>{
    const e=diagnosticEnvironment(),plan=e.get('cloudRecoveryPlan'),m={format:'cosmifold-phase-c',fixtureVersion:1,scope:{ownerUserId:A,universeId:U},
        operationId:B,case:'browser-offline',phase:'uncertain',transport:{attempts:1,observedOffline:true,code:'OUTCOME_UNKNOWN',outcome:'unknown',reason:'TRANSPORT_FAILURE'}};
    assert.deepEqual(plain(plan.marker(m)),m);
    for(const field of [{attempts:2},{observedOffline:false},{reason:'REQUEST_TIMEOUT'},{code:'AUTH_UNAVAILABLE'}])assert.throws(()=>plan.marker({...m,transport:{...m.transport,...field}}));
    assert.throws(()=>plan.marker({...m,case:'lost-reply'}));
    const legacy={...m,case:'lost-reply'};delete legacy.transport;assert.deepEqual(plain(plan.marker(legacy)),legacy);
});

test('native interrupted response needs independent committed receipt BEFORE failure; reload recovers original ID once without semantic resend',async()=>{
    const e=diagnosticEnvironment();let offline=false;const commit=e.gateway.commitMetadata,get=e.gateway.getOperationReceipt,started=deferred(),fail=deferred();
    e.gateway.commitMetadata=async command=>{await commit(command);started.resolve();await fail.promise;
        throw Object.assign(new Error('Native response failed'),{code:'OUTCOME_UNKNOWN',outcome:'unknown',reason:'TRANSPORT_FAILURE'});};
    e.gateway.getOperationReceipt=async(...args)=>{if(offline)throw Object.assign(new Error('Offline'),{code:'NETWORK_UNAVAILABLE'});return get(...args);};
    const writer=e.fresh({isOffline:()=>offline}),observer=e.fresh(),identity=await writer.prepare('response-interruption');
    const desc=await writer.nativeDescriptor();assert.equal(desc.operationId,identity.operationId);await writer.armNativeResponse();
    const dispatch=writer.dispatchOnce();await started.promise;const cached=e.storage.getItem(e.cache.key(identity.scope));
    assert.equal(e.remote().universe.revision,'1');assert.equal(e.record().acknowledged.revision,'0');assert.ok(e.record().pending);
    const proof=plain(await observer.auditNativeCommit());assert.equal(e.storage.getItem(e.cache.key(identity.scope)),cached);
    assert.equal(writer.recordNativeAdmission(proof).stored,true);assert.equal(e.storage.getItem(e.cache.key(identity.scope)),cached);
    offline=true;fail.resolve();await dispatch;await writer.checkBlocked();assert.equal(e.storage.getItem(e.cache.key(identity.scope)),cached);
    const m=writer.identity();assert.deepEqual(plain(m.admission),proof);assert.equal(m.transport.attempts,1);
    const noProof=plain(m);delete noProof.cacheKey;delete noProof.admission;
    assert.throws(()=>e.get('cloudRecoveryPlan').marker(noProof),{code:'NATIVE_UNCERTAINTY_PROOF_REQUIRED'});
    writer.dispose();offline=false;const recovered=e.fresh({isOffline:()=>offline});assert.equal((await recovered.reopenBrowserNetwork()).revision,'1');
    await recovered.verifyAgain();await recovered.verifyAgain();assert.equal(e.record().pending,null);
    assert.equal(e.calls.filter(c=>c.method==='commit').length,1);assert.ok(e.calls.filter(c=>c.method==='receipt').every(c=>c.id===identity.operationId));
    assert.match(await recovered.cleanupSQL(),/^-- MANUAL PHASE-C CLEANUP/);assert.equal(e.storage.getItem('galaxy:user-data'),'KEEP_LOCAL');
    observer.dispose();recovered.dispose();
});

test('native admission refuses missing/changed receipt, wrong scope/revision and early acknowledgement; no audit cache writes',async()=>{
    const e=diagnosticEnvironment(),diag=e.fresh(),observer=e.fresh(),identity=await diag.prepare('response-interruption');await diag.armNativeResponse();
    const started=deferred(),release=deferred();e.gateway.commitMetadata=async()=>{started.resolve();await release.promise;throw Object.assign(new Error('Failed'),{code:'OUTCOME_UNKNOWN',reason:'TRANSPORT_FAILURE',outcome:'unknown'});};
    const dispatch=diag.dispatchOnce();await started.promise;const original=e.storage.getItem(e.cache.key(identity.scope));
    await assert.rejects(observer.auditNativeCommit(),{code:'NATIVE_COMMIT_NOT_PROVED'});
    const proof={admissionVersion:1,source:'independent-receipt-before-native-failure',scope:identity.scope,operationId:identity.operationId,baseRevision:'0',revision:'1',cacheRevision:'0',pausedStatus:200,requestDigest:'a'.repeat(64)};
    for(const changed of [{...proof,revision:'2'},{...proof,pausedStatus:500},{...proof,operationId:U},{...proof,scope:{...identity.scope,ownerUserId:B}}])
        assert.throws(()=>diag.recordNativeAdmission(changed),{code:'INVALID_NATIVE_ADMISSION'});
    assert.equal(e.storage.getItem(e.cache.key(identity.scope)),original);diag.dispose();release.resolve();await assert.rejects(dispatch);observer.dispose();
});

test('committed native proof never tolerates a missing or changed original receipt after reconnect',async()=>{
    const e=diagnosticEnvironment();let offline=false;const commit=e.gateway.commitMetadata,get=e.gateway.getOperationReceipt,started=deferred(),fail=deferred();
    e.gateway.commitMetadata=async command=>{await commit(command);started.resolve();await fail.promise;throw Object.assign(new Error('Failed'),{code:'OUTCOME_UNKNOWN',reason:'TRANSPORT_FAILURE',outcome:'unknown'});};
    e.gateway.getOperationReceipt=async(...args)=>{if(offline)throw Object.assign(new Error('Offline'),{code:'NETWORK_UNAVAILABLE'});return get(...args);};
    const diag=e.fresh({isOffline:()=>offline}),observer=e.fresh(),identity=await diag.prepare('response-interruption');await diag.armNativeResponse();
    const dispatch=diag.dispatchOnce();await started.promise;diag.recordNativeAdmission(plain(await observer.auditNativeCommit()));offline=true;fail.resolve();await dispatch;diag.dispose();offline=false;
    e.gateway.getOperationReceipt=async()=>({status:'missing',acknowledgement:null});
    const reloaded=e.fresh({isOffline:()=>offline}),before=e.storage.getItem(e.cache.key(identity.scope));
    await assert.rejects(reloaded.reopenBrowserNetwork(),{code:'PHASE_C_RECEIPT_CHANGED'});
    assert.equal(e.storage.getItem(e.cache.key(identity.scope)),before);assert.equal(e.calls.filter(c=>c.method==='commit').length,1);observer.dispose();reloaded.dispose();
});

test('account switch after native admission fences abandoned writer and retains original journal for validated owner recovery',async()=>{
    const e=diagnosticEnvironment(),started=deferred(),fail=deferred(),commit=e.gateway.commitMetadata;
    e.gateway.commitMetadata=async command=>{await commit(command);started.resolve();await fail.promise;
        throw Object.assign(new Error('Native fail'),{code:'OUTCOME_UNKNOWN',reason:'TRANSPORT_FAILURE',outcome:'unknown'});};
    const writer=e.fresh(),observer=e.fresh(),identity=await writer.prepare('response-interruption');await writer.armNativeResponse();
    const sending=writer.dispatchOnce();await started.promise;writer.recordNativeAdmission(plain(await observer.auditNativeCommit()));
    const before=e.storage.getItem(e.cache.key(identity.scope));e.auth.emit(B);fail.resolve();await assert.rejects(sending,{code:'ACCOUNT_CONTEXT_CHANGED'});
    assert.equal(e.storage.getItem(e.cache.key(identity.scope)),before);assert.equal(e.storage.getItem(e.cache.key({ownerUserId:B,universeId:U})),null);
    assert.equal(e.messages.some(text=>text.includes('independent real receipt proved commit BEFORE')),false);
    e.auth.emit(A);const recovered=e.reload();assert.equal((await recovered.bootstrap(U)).revision,'1');assert.equal(e.record().pending,null);
    assert.equal(e.calls.filter(c=>c.method==='commit').length,1);writer.dispose();observer.dispose();recovered.dispose();
});
