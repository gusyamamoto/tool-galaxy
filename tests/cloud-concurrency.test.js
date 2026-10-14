const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {clients,plain}=require('./fake-cloud-concurrency');
async function throughIdentical(e){const f=await e.prepare();const race=await e.race('race'),identical=await e.race('identical');return {f,race,identical};}
async function singleLeftCommit(e){
    const f=await e.prepare(),ticket=await e.left.diagnostic.makeTicket('race',5000);
    const race=await Promise.all([e.left.diagnostic.arm(plain(ticket)),e.right.diagnostic.arm(plain(ticket))]);
    await e.left.diagnostic.verify('race',plain(race[1]));
    // Reproduce the original released diagnostic's ticket, not a new bypass in the UI.
    const legacy=e.left.get('cloudConcurrencyPlan').ticket(f,'identical',e.server.clock+5000,'00000000-0000-4000-8000-000000000888');
    await assert.rejects(e.right.diagnostic.arm(plain(legacy)),{code:'VERIFY_PREVIOUS_CASE_FIRST'});
    e.server.single=true;const committed=await e.left.diagnostic.arm(plain(legacy));e.server.single=false;
    return {f,race:plain(race),committed:plain(committed)};
}
async function recoveredBoth(e){const state=await singleLeftCommit(e);await e.right.diagnostic.verify('race',state.race[0]);
    for(const client of [e.left,e.right])await client.diagnostic.recoverIdentical(state.committed);return state;}
async function auditedFour(e){const {f}=await recoveredBoth(e),prior=plain(await e.left.diagnostic.prepareConcurrent());await e.right.diagnostic.joinConcurrent(prior);
    await e.left.diagnostic.concurrentReady();const ready=plain(await e.right.diagnostic.concurrentReady()),ticket=plain(await e.left.diagnostic.concurrentTicket(ready,5000));
    e.server.single=true;const committed=plain(await e.left.diagnostic.armConcurrent(ticket));e.server.single=false;
    await assert.rejects(e.right.diagnostic.armConcurrent(ticket),{code:'TICKET_EXPIRED_OR_TOO_FAR'});
    await e.left.diagnostic.auditConcurrentCommit();await e.right.diagnostic.auditConcurrentCommit(committed);return {f,prior};}
async function verifiedFive(e){const {f,prior}=await auditedFour(e),plan=plain(await e.left.diagnostic.prepareBarrier());await e.right.diagnostic.joinBarrier(plan);
    const parked=[],coordinator={wait(binding){return new Promise(resolve=>{parked.push({binding,resolve});if(parked.length===2)
        for(const item of parked)item.resolve({status:'released',planId:plan.planId,releasedAt:e.server.clock});});}};
    e.server.barrierRace=true;const pair=await Promise.all([e.left.diagnostic.parkBarrier(coordinator),e.right.diagnostic.parkBarrier(coordinator)]);
    await e.left.diagnostic.verifyBarrier(plain(pair[1]));await e.right.diagnostic.verifyBarrier(plain(pair[0]));return {f,prior,plan};}
async function lockedFive(e){const state=await verifiedFive(e);await e.left.diagnostic.rejectBarrierReuse();await e.right.diagnostic.rejectBarrierReuse();
    const tags={format:'cosmifold-phase-b-sql-lock',evidenceVersion:1,planId:state.plan.planId,operationId:state.plan.operationId,revision:'5',scope:state.f.scope,role:'authenticated'};
    await e.left.diagnostic.verifyBarrierLocking([{...tags,kind:'holder',backendPid:10,acquiredAt:10000,holdCompletedAt:30000},
        {...tags,kind:'waiter',backendPid:11,startedAt:12000,finishedAt:14000,outcome:'lock-timeout-observed'}]);return state;}

test('final revision-5 fencing uses real historical receipt reconciliation, disposes publication/durability and preserves every prior identity/cache/cleanup',async()=>{
    const e=clients();try{const {f,plan}=await lockedFive(e),original=plain(e.left.diagnostic.fixtures()),cache=e.left.storage.getItem(e.left.cache.key(f.scope)),
        rightCache=e.right.storage.getItem(e.right.cache.key(f.scope)),rows=JSON.stringify([...e.server.rows]),receipts=JSON.stringify([...e.server.receipts]),
        cleanup=e.left.get('cloudStartBarrierCleanup')(plan,5),writes=e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata').length;
        await assert.rejects(e.left.diagnostic.completeBarrier(),{code:'PHASE_B_GATES_NOT_COMPLETE'});
        await e.left.diagnostic.holdBarrierReceipt();
        await assert.rejects(e.left.diagnostic.releaseBarrierReceipt(),{code:'REFRESHED_BARRIER_CONTEXT_REQUIRED'});
        await assert.rejects(e.left.diagnostic.holdBarrierReceipt(),{code:'VERIFIED_REVISION_5_LEFT_REQUIRED'});
        await e.left.diagnostic.refreshBarrierContext();await e.left.diagnostic.releaseBarrierReceipt();
        assert.equal((await e.left.diagnostic.completeBarrier()).status,'PASS');
        const after=plain(e.left.diagnostic.fixtures());assert.deepEqual(after.fixture,original.fixture);
        for(const key of Object.keys(original.attempts))if(key!=='startBarrier')assert.deepEqual(after.attempts[key],original.attempts[key]);
        for(const key of Object.keys(original.attempts.startBarrier))assert.deepEqual(after.attempts.startBarrier[key],original.attempts.startBarrier[key]);
        assert.equal(after.attempts.startBarrier.fencing.operationId,plan.prior.operationId);
        assert.equal(after.attempts.startBarrier.fencing.repositoryError,'REPOSITORY_DISPOSED');
        assert.equal(after.attempts.startBarrier.fencing.events,0);assert.equal(after.attempts.startBarrier.fencing.accepts,0);
        assert.equal(e.left.storage.getItem(e.left.cache.key(f.scope)),cache);assert.equal(e.right.storage.getItem(e.right.cache.key(f.scope)),rightCache);
        assert.equal(JSON.stringify([...e.server.rows]),rows);assert.equal(JSON.stringify([...e.server.receipts]),receipts);
        assert.equal(e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata').length,writes);
        assert.equal(e.left.get('cloudStartBarrierCleanup')(plan,5),cleanup);
        assert.equal(e.left.storage.getItem('galaxy:user-data'),'KEEP_LOCAL');
    }finally{e.dispose();}
});

test('final revision-5 fence fails closed without SQL proof, after account switch, or after changed server metadata',async()=>{
    const x=clients();try{await verifiedFive(x);await x.left.diagnostic.rejectBarrierReuse();
        await assert.rejects(x.left.diagnostic.holdBarrierReceipt(),{code:'VERIFIED_REVISION_5_LEFT_REQUIRED'});
    }finally{x.dispose();}
    for(const mode of ['account','metadata','disposed']){const e=clients();try{const {f}=await lockedFive(e),cached=e.left.storage.getItem(e.left.cache.key(f.scope));
        await e.left.diagnostic.holdBarrierReceipt();
        if(mode==='account'){e.left.changeUser(null);await assert.rejects(e.left.diagnostic.refreshBarrierContext());}
        else if(mode==='disposed'){e.left.diagnostic.dispose();await assert.rejects(e.left.diagnostic.releaseBarrierReceipt());}
        else{e.server.rows.get(f.scope.universeId).entries[0].name='changed';await assert.rejects(e.left.diagnostic.refreshBarrierContext(),{code:'BARRIER_STATE_CHANGED'});}
        assert.equal(e.left.storage.getItem(e.left.cache.key(f.scope)),cached);assert.notEqual(e.left.diagnostic.fixtures().verified.barrierFencing,true);
    }finally{e.dispose();}}
});

test('expired final receipt hold or changed historical receipt never completes/retries or writes cache',async()=>{
    for(const mode of ['expired','receipt']){const e=clients('left',{barrierHoldTimeoutMs:15});try{const {f,prior}=await lockedFive(e),cached=e.left.storage.getItem(e.left.cache.key(f.scope));
        if(mode==='receipt'){
            e.server.receipts.get(f.scope.universeId+':'+prior.operationId).digest='f'.repeat(64);
            await assert.rejects(e.left.diagnostic.holdBarrierReceipt(),{code:'BARRIER_PRIOR_RECEIPT_CHANGED'});
        }else{
            await e.left.diagnostic.holdBarrierReceipt();await new Promise(resolve=>setTimeout(resolve,30));
            await assert.rejects(e.left.diagnostic.refreshBarrierContext(),{code:'HELD_BARRIER_RECEIPT_REQUIRED'});
            await assert.rejects(e.left.diagnostic.releaseBarrierReceipt(),{code:'REFRESHED_BARRIER_CONTEXT_REQUIRED'});
        }
        await assert.rejects(e.left.diagnostic.completeBarrier(),{code:'PHASE_B_GATES_NOT_COMPLETE'});
        assert.equal(e.left.storage.getItem(e.left.cache.key(f.scope)),cached);assert.notEqual(e.left.diagnostic.fixtures().verified.barrierFencing,true);
    }finally{e.dispose();}}
});

test('revision-5 SQL locking scripts are exact, rollback-only, tagged to current plan and generated without domain/cache mutations',async()=>{
    const e=clients();try{const {f,plan}=await verifiedFive(e);await e.left.diagnostic.rejectBarrierReuse();await e.right.diagnostic.rejectBarrierReuse();
        const rows=JSON.stringify([...e.server.rows]),receipts=JSON.stringify([...e.server.receipts]),cache=e.left.storage.getItem(e.left.cache.key(f.scope)),marker=e.left.markers.getItem(e.left.diagnostic.markerKey);
        const scripts=await e.left.diagnostic.barrierLockScripts();
        for(const sql of Object.values(scripts)){assert.match(sql,/^begin;/m);assert.match(sql,/\nrollback;$/);assert.match(sql,/set local role authenticated/);
            assert.match(sql,/set local statement_timeout='30s'/);assert.match(sql,/set local lock_timeout='2s'/);
            assert.ok(sql.includes(plan.planId)&&sql.includes(plan.operationId)&&sql.includes(f.scope.ownerUserId));
            assert.doesNotMatch(sql,/^\s*(create|alter|grant|revoke|insert|update|delete|truncate)\b/im);
            assert.match(sql,/jsonb_build_object\('kind',/);assert.match(sql,/\|\| '[^']+'::jsonb\)::text,true/);}
        assert.match(scripts.holder,/revision=5 for update/);assert.match(scripts.holder,/pg_sleep\(20\)/);assert.ok(scripts.holder.includes('Phase B coordinated identical'));
        assert.match(scripts.holder,/auth.uid\(\) is distinct from/);assert.match(scripts.waiter,/exception when lock_not_available/);
        assert.match(scripts.holder,/if state is distinct from jsonb_build_object/);
        assert.equal(JSON.stringify([...e.server.rows]),rows);assert.equal(JSON.stringify([...e.server.receipts]),receipts);
        assert.equal(e.left.storage.getItem(e.left.cache.key(f.scope)),cache);assert.equal(e.left.markers.getItem(e.left.diagnostic.markerKey),marker);
    }finally{e.dispose();}
});

test('revision-5 SQL proof needs exact tags, distinct PIDs and overlapping bounded lock timeout; valid proof preserves cache/receipts without completing Phase B',async()=>{
    const e=clients();try{const {f,plan}=await verifiedFive(e);await e.left.diagnostic.rejectBarrierReuse();
        const tags={format:'cosmifold-phase-b-sql-lock',evidenceVersion:1,planId:plan.planId,operationId:plan.operationId,revision:'5'};
        const holder={...tags,kind:'holder',scope:f.scope,role:'authenticated',backendPid:10,acquiredAt:10000,holdCompletedAt:30000};
        const waiter={...tags,kind:'waiter',scope:f.scope,role:'authenticated',backendPid:11,startedAt:12000,finishedAt:14000,outcome:'lock-timeout-observed'};
        const validator=e.left.get('cloudStartBarrierLockEvidence');assert.equal(validator([holder,waiter],plan).state,'PASS');
        for(const changed of [{...waiter,revision:'4'},{...waiter,planId:plan.prior.planId},{...waiter,backendPid:10},
            {...waiter,startedAt:31000,finishedAt:33000},{...waiter,outcome:'unverified-no-lock-wait'},{...waiter,operationId:plan.prior.operationId}])
            assert.equal(validator([holder,changed],plan).state,'UNVERIFIED');
        const cache=e.left.storage.getItem(e.left.cache.key(f.scope)),receipts=JSON.stringify([...e.server.receipts]);
        assert.equal((await e.left.diagnostic.verifyBarrierLocking([{phase_b_lock_evidence:holder},{phase_b_lock_evidence:waiter}])).state,'PASS');
        assert.equal(e.left.diagnostic.fixtures().verified.barrierLocking,true);
        assert.equal(e.left.storage.getItem(e.left.cache.key(f.scope)),cache);assert.equal(JSON.stringify([...e.server.receipts]),receipts);
        assert.ok(e.left.messages.some(m=>m.includes('Phase B is not COMPLETE')));
        assert.equal((await e.left.diagnostic.verifyBarrierLocking([holder,{...waiter,backendPid:10}])).state,'UNVERIFIED');
        assert.equal(e.left.diagnostic.fixtures().verified.barrierLocking,false);
    }finally{e.dispose();}
});

test('barrier changed-content ID reuse is definitely rejected once per context with all five receipts, metadata, caches and original identities unchanged',async()=>{
    const e=clients();try{const {f,plan}=await verifiedFive(e),rows=JSON.stringify([...e.server.rows]),receipts=JSON.stringify([...e.server.receipts]);
        const count=e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata').length;
        for(const client of [e.left,e.right]){const original=plain(client.diagnostic.fixtures()),cached=client.storage.getItem(client.cache.key(f.scope));
            const rejection=await client.diagnostic.rejectBarrierReuse();assert.equal(rejection.reason,'OPERATION_ID_REUSED');assert.equal(rejection.outcome,'not-committed');
            const after=plain(client.diagnostic.fixtures());assert.deepEqual(after.fixture,original.fixture);
            assert.deepEqual(after.attempts.startBarrier.plan,original.attempts.startBarrier.plan);
            assert.deepEqual(after.attempts.startBarrier.dispatch,original.attempts.startBarrier.dispatch);
            assert.equal(after.attempts.startBarrier.reuse.command.operationId,plan.operationId);
            assert.equal(after.attempts.startBarrier.reuse.command.baseRevision,'4');assert.equal(after.verified.barrierReuse,true);
            assert.equal(client.storage.getItem(client.cache.key(f.scope)),cached);
            await assert.rejects(client.diagnostic.rejectBarrierReuse(),{code:'BARRIER_REUSE_NO_REDISPATCH'});
        }
        assert.equal(e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata').length,count+2);
        assert.equal(JSON.stringify([...e.server.rows]),rows);assert.equal(JSON.stringify([...e.server.receipts]),receipts);
        assert.equal(e.server.applications,5);assert.equal(e.server.receipts.size,5);
    }finally{e.dispose();}
});

test('barrier reuse requires completed verification and rejects wrong error or changed original receipt without marking success/retrying',async()=>{
    const e=clients();try{await e.prepare();await assert.rejects(e.left.diagnostic.rejectBarrierReuse(),{code:'VERIFY_BARRIER_BEFORE_REUSE'});
    }finally{e.dispose();}
    for(const mode of ['wrong-error','changed-receipt']){const x=clients();try{const {f,plan}=await verifiedFive(x),key=x.left.cache.key(f.scope),cached=x.left.storage.getItem(key);
        if(mode==='wrong-error')x.server.forceError='CM003';else x.server.onRejectedReuse=()=>{x.server.receipts.get(f.scope.universeId+':'+plan.operationId).digest='f'.repeat(64);};
        await assert.rejects(x.left.diagnostic.rejectBarrierReuse(),{code:mode==='wrong-error'?'BARRIER_REUSE_REJECTION_NOT_DEFINITE':'BARRIER_REUSE_CHANGED_STATE_OR_RECEIPT'});
        assert.equal(x.left.diagnostic.fixtures().verified.barrierReuse,undefined);
        assert.equal(x.left.diagnostic.fixtures().attempts.startBarrier.reuse.phase,'dispatched');
        assert.equal(x.left.storage.getItem(key),cached);
        const calls=x.server.calls.length;await assert.rejects(x.left.diagnostic.rejectBarrierReuse(),{code:'BARRIER_REUSE_NO_REDISPATCH'});assert.equal(x.server.calls.length,calls);
    }finally{x.dispose();}}
});

test('two-context start barrier parks without mutation, releases both preflighted clients once, and preserves all four existing receipts/cleanup guards',async()=>{
    for(const order of ['left','right']){const e=clients(order);try{const {f,prior}=await auditedFour(e),originals=JSON.stringify([...e.server.receipts]);
        const plan=plain(await e.left.diagnostic.prepareBarrier());await e.right.diagnostic.joinBarrier(plan);
        const baseCleanup=e.left.get('cloudConcurrentRecoveryCleanup')(prior,4),parked=[];let sawLeft;const leftParked=new Promise(r=>sawLeft=r);
        const coordinator={wait(binding){return new Promise(resolve=>{parked.push({binding,resolve});if(parked.length===1)sawLeft();
            if(parked.length===2){assert.deepEqual(plain(parked[0].binding.plan),plain(parked[1].binding.plan));
                assert.notEqual(parked[0].binding.contextId,parked[1].binding.contextId);
                for(const item of parked)item.resolve({status:'released',planId:plan.planId,releasedAt:e.server.clock});}});}};
        e.server.barrierRace=true;const left=e.left.diagnostic.parkBarrier(coordinator);await leftParked;
        assert.equal(e.server.rows.get(f.scope.universeId).universe.revision,'4');assert.equal(e.server.applications,4);
        assert.equal(JSON.parse(e.left.storage.getItem(e.left.cache.key(f.scope))).acknowledged.revision,'4');
        const pair=await Promise.all([left,e.right.diagnostic.parkBarrier(coordinator)]);
        await e.left.diagnostic.verifyBarrier(plain(pair[1]));await e.right.diagnostic.verifyBarrier(plain(pair[0]));
        assert.equal(e.server.applications,5);assert.equal(e.server.receipts.size,5);assert.equal(e.server.rows.get(f.scope.universeId).universe.revision,'5');
        assert.equal(JSON.stringify([...e.server.receipts].slice(0,4)),originals);
        for(const client of [e.left,e.right]){assert.deepEqual(plain(client.diagnostic.fixtures().fixture),f);
            assert.equal(JSON.parse(client.storage.getItem(client.cache.key(f.scope))).acknowledged.revision,'5');}
        assert.deepEqual(plain(pair[0].result.command),plain(pair[1].result.command));assert.equal(pair.filter(o=>o.result.ack.replayed).length,1);
        assert.ok(!Object.values(f.operations).includes(plan.operationId));assert.notEqual(plan.operationId,prior.operationId);
        assert.equal(e.left.get('cloudStartBarrierCleanup')(plan,4),baseCleanup);
        const sql=e.left.get('cloudStartBarrierCleanup')(plan,5);for(const phrase of [plan.operationId,prior.operationId,'Receipt count changed','Exact receipt/digest changed','Phase B coordinated identical'])assert.ok(sql.includes(phrase));
        await assert.rejects(e.left.diagnostic.parkBarrier(coordinator),{code:'BARRIER_NO_REDISPATCH'});
        const bad=plain(pair[1]);bad.result.requestStartedAt+=100;bad.result.requestSettledAt+=100;
        await assert.rejects(e.left.diagnostic.verifyBarrier(bad),{code:'UNVERIFIED_START_BARRIER_OVERLAP'});
    }finally{e.dispose();}}
});

test('disposed or changed account while parked never sends a mutation or accepts a late barrier release',async()=>{
    const e=clients();try{const {f}=await auditedFour(e),plan=plain(await e.left.diagnostic.prepareBarrier());let release,sawPark;
        const parked=new Promise(r=>sawPark=r),coordinator={wait(){sawPark();return new Promise(r=>release=r);}};
        const starting=e.left.diagnostic.parkBarrier(coordinator);await parked;const before=e.left.storage.getItem(e.left.cache.key(f.scope));
        e.left.changeUser('00000000-0000-4000-8000-000000000099');release({status:'released',planId:plan.planId,releasedAt:e.server.clock});
        await assert.rejects(starting,{code:'CONTEXT_CHANGED'});assert.equal(e.server.applications,4);
        assert.equal(e.left.storage.getItem(e.left.cache.key(f.scope)),before);
    }finally{e.dispose();}
});

test('loopback barrier client sends no credentials, confirms both-context stages, and aborts bounded waiting without a mutation retry',async()=>{
    const e=clients();try{await auditedFour(e);const plan=plain(await e.left.diagnostic.prepareBarrier());let clock=1000,index=0;const sent=[];
        const binding={plan,role:'left',contextId:'00000000-0000-4000-8000-000000000999',isCurrent:()=>true};
        const fetch=async(url,options)=>{assert.equal(url,'/__phase_b_barrier__');assert.equal(options.credentials,'omit');
            assert.deepEqual(Object.keys(options.headers),['Content-Type']);const body=JSON.parse(options.body);sent.push(body.action);
            return {ok:true,json:async()=>({status:['waiting','confirm','scheduled','released'][index++],planId:plan.planId,releasedAt:clock})};};
        const client=e.left.get('createCloudStartBarrierClient')({fetch,now:()=>clock,pause:async()=>{clock+=100;}});
        assert.equal((await client.wait(binding)).status,'released');assert.ok(sent.includes('confirm'));
        const waiting=e.left.get('createCloudStartBarrierClient')({fetch:async(url,options)=>{sent.push(JSON.parse(options.body).action);return {ok:true,json:async()=>({status:'waiting',planId:plan.planId})};},
            now:()=>clock,pause:async()=>{clock+=100;},timeoutMs:50});
        await assert.rejects(waiting.wait(binding),{code:'START_BARRIER_WAIT_EXPIRED'});assert.equal(sent.at(-1),'abort');assert.equal(e.server.applications,4);
    }finally{e.dispose();}
});

test('expired RIGHT recovery ticket leaves no dispatch; LEFT-only revision 4 can be audited read-only on both without changing IDs/receipts/caches',async()=>{
    const e=clients();try{const {f}=await recoveredBoth(e),plan=plain(await e.left.diagnostic.prepareConcurrent());await e.right.diagnostic.joinConcurrent(plan);
        await e.left.diagnostic.concurrentReady();const ready=plain(await e.right.diagnostic.concurrentReady());
        const ticket=plain(await e.left.diagnostic.concurrentTicket(ready,5000));
        e.server.single=true;const committed=plain(await e.left.diagnostic.armConcurrent(ticket));e.server.single=false;
        await assert.rejects(e.right.diagnostic.armConcurrent(ticket),{code:'TICKET_EXPIRED_OR_TOO_FAR'});
        assert.equal(e.right.diagnostic.fixtures().attempts.concurrentRecovery.dispatch,undefined);
        assert.equal(e.server.rows.get(f.scope.universeId).universe.revision,'4');
        const rows=JSON.stringify([...e.server.rows]),receipts=JSON.stringify([...e.server.receipts]);
        const commands=e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata').length;
        for(const client of [e.left,e.right]){const key=client.cache.key(f.scope),cache=client.storage.getItem(key),before=plain(client.diagnostic.fixtures());
            await client.diagnostic.auditConcurrentCommit(client===e.left?null:committed);
            const after=plain(client.diagnostic.fixtures());
            assert.equal(client.storage.getItem(key),cache);assert.deepEqual(after.fixture,before.fixture);
            assert.deepEqual(after.attempts.concurrentRecovery.plan,before.attempts.concurrentRecovery.plan);
            assert.deepEqual(after.attempts.concurrentRecovery.dispatch,before.attempts.concurrentRecovery.dispatch);
            assert.equal(after.verified.concurrentRecovery,undefined);assert.equal(after.verified.concurrentRecoveryCommitted,true);
            assert.ok(client.messages.some(m=>m.includes('RIGHT never dispatched')));
        }
        assert.equal(JSON.stringify([...e.server.rows]),rows);assert.equal(JSON.stringify([...e.server.receipts]),receipts);
        assert.equal(e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata').length,commands);
        const state=await e.right.diagnostic.inspectConcurrentFixture();assert.equal(state.stage,4);
        assert.ok(e.right.get('cloudConcurrentRecoveryCleanup')(plan,4).includes(plan.operationId));
        const changed=plain(committed);changed.result.command.operationId=f.operations.identical;
        await assert.rejects(e.right.diagnostic.auditConcurrentCommit(changed),{code:'LEFT_RECOVERY_COMMITTED_OBSERVATION_REQUIRED'});
        const marker=plain(e.right.diagnostic.fixtures());marker.attempts.concurrentRecovery.dispatch={phase:'dispatched'};
        e.right.markers.setItem(e.right.diagnostic.markerKey,JSON.stringify(marker));
        await assert.rejects(e.right.diagnostic.auditConcurrentCommit(committed),{code:'READ_ONLY_AUDIT_REQUIRES_SINGLE_LEFT_COMMIT'});
    }finally{e.dispose();}
});

test('fresh same-fixture concurrent recovery increments 3 to 4 once in either order, preserving all original IDs/receipts and exact cleanup guards',async()=>{
    for(const order of ['left','right']){const e=clients(order);try{const {f}=await recoveredBoth(e);
        const originals=JSON.stringify([...e.server.receipts]),beforeCommands=e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata').length;
        const oldCleanup=e.left.get('cloudConcurrencyCleanup')(f,3,order);
        const plan=plain(await e.left.diagnostic.prepareConcurrent());await e.right.diagnostic.joinConcurrent(plan);
        assert.deepEqual(plan.fixture,f);assert.ok(!Object.values(f.operations).includes(plan.operationId));
        for(const client of [e.left,e.right]){const cache=client.storage.getItem(client.cache.key(f.scope));await client.diagnostic.concurrentReady();
            assert.equal(client.storage.getItem(client.cache.key(f.scope)),cache);assert.deepEqual(plain(client.diagnostic.fixtures().fixture),f);}
        assert.equal(e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata').length,beforeCommands);
        const ticket=plain(await e.left.diagnostic.concurrentTicket(plain(await e.right.diagnostic.concurrentReady()),5000));
        e.server.recoveryRace=true;
        const pair=await Promise.all([e.left.diagnostic.armConcurrent(ticket),e.right.diagnostic.armConcurrent(ticket)]);
        assert.equal(pair.filter(o=>o.result.ack.replayed===false).length,1);assert.equal(pair.filter(o=>o.result.ack.replayed===true).length,1);
        assert.deepEqual(plain(pair[0].result.command),plain(pair[1].result.command));assert.equal(pair[0].result.command.operationId,plan.operationId);
        await e.left.diagnostic.verifyConcurrent(plain(pair[1]));await e.right.diagnostic.verifyConcurrent(plain(pair[0]));
        assert.equal(e.server.rows.get(f.scope.universeId).universe.revision,'4');assert.equal(e.server.applications,4);assert.equal(e.server.receipts.size,4);
        assert.equal(JSON.stringify([...e.server.receipts].slice(0,3)),originals);
        assert.equal(e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata').length,beforeCommands+2);
        const state=await e.left.diagnostic.inspectConcurrentFixture();assert.equal(state.stage,4);
        assert.equal(e.left.get('cloudConcurrentRecoveryCleanup')(plan,3),oldCleanup);
        const sql=e.left.get('cloudConcurrentRecoveryCleanup')(plan,4);
        for(const text of ['owner mismatch','Exact entry state changed','Receipt count changed','Exact receipt/digest changed',plan.operationId,'Phase B concurrent recovery'])assert.ok(sql.includes(text));
        assert.ok(!sql.includes(f.operations.newer));assert.equal(e.left.get('cloudConcurrencyCleanup')(f,3,order),oldCleanup);
        await assert.rejects(e.left.diagnostic.armConcurrent(ticket),{code:'RECOVERY_NO_REDISPATCH'});
        await assert.rejects(e.left.diagnostic.reusedOperation(),{code:'RECOVERY_PATH_USE_SEPARATE_NEXT_STEPS'});
        for(const client of [e.left,e.right])assert.equal(JSON.parse(client.storage.getItem(client.cache.key(f.scope))).acknowledged.revision,'4');
    }finally{e.dispose();}}
});

test('concurrent recovery rejects committed-ID reuse, absent peer readiness, changed state and forged observations without repairing/resubmitting',async()=>{
    const e=clients();try{const {f}=await recoveredBoth(e),plan=plain(await e.left.diagnostic.prepareConcurrent()),q=e.left.get('cloudConcurrentRecoveryPlan');
        assert.throws(()=>q.validate({...plan,operationId:f.operations.identical}),{code:'RECOVERY_REQUIRES_FRESH_IDS'});
        await assert.rejects(e.left.diagnostic.prepareConcurrent(),{code:'RECOVERY_PLAN_ALREADY_EXISTS_OR_NOT_LEFT'});
        await e.right.diagnostic.joinConcurrent(plan);await e.left.diagnostic.concurrentReady();
        await assert.rejects(e.left.diagnostic.concurrentTicket(null,5000),{code:'RIGHT_RECOVERY_READINESS_REQUIRED'});
        const ready=plain(await e.right.diagnostic.concurrentReady()),ticket=plain(await e.left.diagnostic.concurrentTicket(ready,5000));
        e.server.recoveryRace=true;const pair=await Promise.all([e.left.diagnostic.armConcurrent(ticket),e.right.diagnostic.armConcurrent(ticket)]);
        const bad=plain(pair[1]);bad.result.command.operationId=f.operations.identical;
        await assert.rejects(e.left.diagnostic.verifyConcurrent(bad),{code:'RECOVERY_OBSERVATION_CHANGED'});
        const noOverlap=plain(pair[1]);noOverlap.result.requestStartedAt+=10;noOverlap.result.requestSettledAt+=10;noOverlap.completedAt+=10;
        await assert.rejects(e.left.diagnostic.verifyConcurrent(noOverlap),{code:'UNVERIFIED_RECOVERY_REQUEST_OVERLAP'});
        const row=e.server.rows.get(f.scope.universeId);row.entries[0].name='unexpected data';
        await assert.rejects(e.left.diagnostic.inspectConcurrentFixture(),{code:'RECOVERY_STATE_CHANGED'});
        assert.equal(e.server.applications,4);assert.equal(e.server.receipts.size,4);
    }finally{e.dispose();}
});

test('existing one-sided revision-3 commit recovers read-only, preserves original identities/cache and permits only explicit exact replay',async()=>{
    const e=clients();try{const {f,race,committed}=await singleLeftCommit(e);
        assert.equal(e.server.rows.get(f.scope.universeId).universe.revision,'3');assert.equal(e.server.applications,3);
        assert.equal(e.right.diagnostic.fixtures().attempts.identical,undefined);
        await e.right.diagnostic.verify('race',race[0]);
        const beforeRows=JSON.stringify([...e.server.rows]),beforeReceipts=JSON.stringify([...e.server.receipts]);
        const beforeCalls=e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata').length;
        for(const client of [e.left,e.right]){
            const key=client.cache.key(f.scope),cached=client.storage.getItem(key);
            await client.diagnostic.recoverIdentical(committed);
            assert.equal(client.storage.getItem(key),cached);
            assert.deepEqual(plain(client.diagnostic.fixtures().fixture),f);
            assert.equal(client.diagnostic.fixtures().verified.identical,undefined);
        }
        assert.equal(e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata').length,beforeCalls);
        const replay=await e.right.diagnostic.replayCommittedIdentical();assert.equal(replay.replayed,true);
        const sent=e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata').at(-1).params.p_command;
        assert.deepEqual(sent,committed.result.command);assert.equal(e.server.applications,3);
        assert.equal(JSON.stringify([...e.server.rows]),beforeRows);assert.equal(JSON.stringify([...e.server.receipts]),beforeReceipts);
        await assert.rejects(e.right.diagnostic.replayCommittedIdentical(),{code:'NO_AUTOMATIC_RETRY'});
        await e.left.diagnostic.reusedOperation();await e.right.diagnostic.reusedOperation();
        await e.left.diagnostic.holdOldReceipt();await e.right.diagnostic.advance();await e.left.diagnostic.refreshNewer();await e.left.diagnostic.releaseOld();
        await e.left.diagnostic.verifyLocking([{kind:'holder',scope:f.scope,role:'authenticated',backendPid:10,acquiredAt:10000,holdCompletedAt:18000},
            {kind:'waiter',scope:f.scope,role:'authenticated',backendPid:11,startedAt:11000,finishedAt:13000,outcome:'lock-timeout-observed'}]);
        assert.equal((await e.left.diagnostic.complete()).status,'UNVERIFIED');
        assert.ok(e.left.messages.some(m=>m.includes('does not prove concurrent identical')));
        const state=await e.left.diagnostic.inspectFixture();assert.equal(state.stage,4);
        assert.ok(e.left.get('cloudConcurrencyCleanup')(f,4,state.winner).includes('Receipt count changed'));
    }finally{e.dispose();}
});

test('readiness requires BOTH verifications, same fixture and original race; recovery rejects any dispatched RIGHT or changed proof',async()=>{
    const e=clients();try{const {f,race,committed}=await singleLeftCommit(e);
        await assert.rejects(e.right.diagnostic.readiness('identical'),{code:'VERIFY_PREVIOUS_CASE_FIRST'});
        await assert.rejects(e.right.diagnostic.recoverIdentical(committed),{code:'VERIFY_RACE_BEFORE_RECOVERY'});
        await e.right.diagnostic.verify('race',race[0]);
        const changed=plain(committed);changed.result.command.operationId=f.operations.newer;
        await assert.rejects(e.right.diagnostic.recoverIdentical(changed),{code:'LEFT_COMMITTED_OBSERVATION_REQUIRED'});
        const marker=plain(e.right.diagnostic.fixtures());marker.attempts.identical={phase:'dispatched'};
        e.right.markers.setItem(e.right.diagnostic.markerKey,JSON.stringify(marker));
        await assert.rejects(e.right.diagnostic.recoverIdentical(committed),{code:'RECOVERY_NOT_A_SINGLE_LEFT_COMMIT'});
        assert.equal(e.server.applications,3);
    }finally{e.dispose();}
    const both=clients();try{const f=await both.prepare();await both.race('race');
        await assert.rejects(both.left.diagnostic.makeTicket('identical',5000),{code:'RIGHT_VERIFICATION_READINESS_REQUIRED'});
        const ready=plain(await both.right.diagnostic.readiness('identical'));
        await assert.rejects(both.left.diagnostic.makeTicket('identical',5000,{...ready,revision:'3'}),{code:'RIGHT_VERIFICATION_READINESS_REQUIRED'});
        const ticket=await both.left.diagnostic.makeTicket('identical',5000,ready);assert.equal(ticket.kind,'identical');
        assert.deepEqual(plain(ticket.fixture),f);
    }finally{both.dispose();}
});
test('both stale winner/loser orders produce only one winner, exact metadata/receipts and no hidden mutation retry',async()=>{
    for(const order of ['left','right']){const e=clients(order);try{
        const f=await e.prepare(),observations=await e.race('race');
        assert.equal(observations.find(o=>o.result.outcome==='committed').role,order);
        assert.equal(observations.find(o=>o.result.outcome==='stale').result.cacheRevision,'1');
        assert.equal(e.server.rows.get(f.scope.universeId).universe.revision,'2');assert.equal(e.server.applications,2);assert.equal(e.server.receipts.size,2);
        assert.equal(e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata').length,3);
        assert.ok(e.server.calls.every(c=>c.retry===false));
        for(const client of [e.left,e.right]){
            assert.equal(client.storage.getItem('galaxy:user-data'),'KEEP_LOCAL');assert.equal(client.markers.getItem('cosmifold:dev:cloud-boundary:v1'),'KEEP_PHASE_A');
            assert.equal(JSON.parse(client.storage.getItem(client.cache.key(f.scope))).acknowledged.revision,'2');}
    }finally{e.dispose();}}
});
test('concurrent identical request applies once, reconciles both acknowledgements to the one receipt and rejects changed content',async()=>{
    const e=clients();try{const {f,identical}=await throughIdentical(e);
        assert.equal(identical.filter(o=>o.result.ack.replayed).length,1);assert.deepEqual(identical[0].result.command,identical[1].result.command);
        assert.equal(e.server.applications,3);assert.equal(e.server.receipts.size,3);
        const before=JSON.stringify([...e.server.rows]),receipts=JSON.stringify([...e.server.receipts]);
        await e.left.diagnostic.reusedOperation();await e.right.diagnostic.reusedOperation();
        assert.equal(JSON.stringify([...e.server.rows]),before);assert.equal(JSON.stringify([...e.server.receipts]),receipts);
        assert.equal(e.server.rows.get(f.scope.universeId).universe.revision,'3');
    }finally{e.dispose();}
});
test('old real receipt acknowledgement after newer revision cannot publish/cache over it; SQL locking stays unverified',async()=>{
    const e=clients();try{const {f}=await throughIdentical(e);await e.left.diagnostic.reusedOperation();await e.right.diagnostic.reusedOperation();
        await e.left.diagnostic.holdOldReceipt();await e.right.diagnostic.advance();
        await e.left.diagnostic.refreshNewer();const cache=e.left.storage.getItem(e.left.cache.key(f.scope));
        await e.left.diagnostic.releaseOld();assert.equal(e.left.storage.getItem(e.left.cache.key(f.scope)),cache);
        assert.equal((await e.left.diagnostic.complete()).status,'UNVERIFIED');
        assert.equal((await e.left.diagnostic.finalState()).lockState,'UNVERIFIED');assert.equal(e.server.applications,4);assert.equal(e.server.receipts.size,4);
    }finally{e.dispose();}
});
test('repeat preparation/joins, wrong origins/owners and unreviewed re-dispatches fail closed',async()=>{
    const e=clients();try{const f=await e.prepare(),count=e.server.calls.length;
        await assert.rejects(e.left.diagnostic.prepare(e.right.origin),{code:'FIXTURE_ALREADY_PREPARED'});
        await assert.rejects(e.right.diagnostic.join(f),{code:'FIXTURE_ALREADY_JOINED'});assert.equal(e.server.calls.length,count);
        await assert.rejects(e.left.diagnostic.join(f),{code:'WRONG_JOIN_CONTEXT'});
        e.right.changeUser('00000000-0000-4000-8000-000000000099');await assert.rejects(e.right.diagnostic.makeTicket('race'),{code:'ORIGINAL_TEST_OWNER_REQUIRED'});
    }finally{e.dispose();}
});
test('context disposal during a delayed read ignores the result and does not seed/write a cache',async()=>{
    const e=clients();try{const f=await e.left.diagnostic.prepare(e.right.origin);let captured,release;
        const ready=new Promise(r=>captured=r),gate=new Promise(r=>release=r);e.server.hold={captured,gate};
        const opening=e.right.diagnostic.join(f);await ready;e.right.diagnostic.dispose();release();
        await assert.rejects(opening);assert.equal(e.right.storage.getItem(e.right.cache.key(f.scope)),null);
        assert.equal(e.right.markers.getItem(e.right.diagnostic.markerKey),null);
    }finally{e.dispose();}
});

test('disposal after server commit before acknowledgement preserves original pending ID and never publishes/cache-accepts late result',async()=>{
    const e=clients();try{const {f}=await throughIdentical(e);await e.left.diagnostic.reusedOperation();await e.right.diagnostic.reusedOperation();
        let captured,release;const ready=new Promise(r=>captured=r),gate=new Promise(r=>release=r);e.server.holdCommit={captured,gate};
        const writing=e.right.diagnostic.advance();await ready;
        const key=e.right.cache.key(f.scope),before=e.right.storage.getItem(key),record=JSON.parse(before);
        assert.equal(record.acknowledged.revision,'3');assert.equal(record.pending.command.operationId,f.operations.newer);
        assert.equal(e.server.rows.get(f.scope.universeId).universe.revision,'4');e.right.diagnostic.dispose();release();
        await assert.rejects(writing);assert.equal(e.right.storage.getItem(key),before);
        assert.ok(!e.right.messages.some(m=>m.includes('newer state committed')));
    }finally{e.dispose();}
});

test('bounded failed read never becomes an empty fixture/cache and a late result cannot seed it',async()=>{
    const e=clients('left',{timeout:40});try{const f=await e.left.diagnostic.prepare(e.right.origin);let captured,release;
        const ready=new Promise(r=>captured=r),gate=new Promise(r=>release=r);e.server.hold={captured,gate};
        const joining=e.right.diagnostic.join(f);await ready;await assert.rejects(joining,{code:'NETWORK_UNAVAILABLE'});
        release();await new Promise(r=>setTimeout(r,5));
        assert.equal(e.right.markers.getItem(e.right.diagnostic.markerKey),null);assert.equal(e.right.storage.getItem(e.right.cache.key(f.scope)),null);
    }finally{e.dispose();}
});

test('bounded write timeout reconciles the original committed receipt without resubmission or late duplicate publication',async()=>{
    const e=clients('left',{timeout:40});try{const {f}=await throughIdentical(e);await e.left.diagnostic.reusedOperation();await e.right.diagnostic.reusedOperation();
        let captured,release;const ready=new Promise(r=>captured=r),gate=new Promise(r=>release=r);e.server.holdCommit={captured,gate};
        const writing=e.right.diagnostic.advance();await ready;await writing;
        assert.equal(e.server.calls.filter(c=>c.name==='cosmifold_commit_metadata'&&c.params.p_command.operationId===f.operations.newer).length,1);
        assert.equal(e.server.applications,4);const key=e.right.cache.key(f.scope),before=e.right.storage.getItem(key);
        assert.equal(JSON.parse(before).acknowledged.revision,'4');release();await new Promise(r=>setTimeout(r,5));assert.equal(e.right.storage.getItem(key),before);
    }finally{e.dispose();}
});

test('read-only cleanup inspection refuses changed metadata/extra receipts rather than producing permissive cleanup',async()=>{
    const e=clients();try{const {f}=await throughIdentical(e),row=e.server.rows.get(f.scope.universeId);
        row.entries[0].name='unexpected actual user content';await assert.rejects(e.left.diagnostic.inspectFixture(),{code:'FIXTURE_STATE_CHANGED'});
        row.entries[0].name='Phase B Identical';
        const command=e.left.get('cloudConcurrencyPlan').command(f,'newer','left'),ack=e.left.get('cloudConcurrencyPlan').acknowledgement(f,'newer','left');
        e.server.receipts.set(f.scope.universeId+':'+f.operations.newer,{command,digest:'a'.repeat(64),ack});
        await assert.rejects(e.left.diagnostic.inspectFixture(),{code:'UNEXPECTED_OPERATION_RECEIPT'});
    }finally{e.dispose();}
});

test('mismatched peer/winner/cache observations remain blocked without advancing the losing context',async()=>{
    const e=clients();try{const f=await e.prepare(),ticket=await e.left.diagnostic.makeTicket('race',5000),[left,right]=await Promise.all([e.left.diagnostic.arm(plain(ticket)),e.right.diagnostic.arm(plain(ticket))]);
        const key=e.right.cache.key(f.scope),before=e.right.storage.getItem(key);
        const forged=plain(left);forged.result.outcome='stale';forged.result.error={code:'REVISION_CONFLICT',outcome:'not-committed'};
        await assert.rejects(e.right.diagnostic.verify('race',forged),{code:'RACE_NOT_ONE_WINNER'});
        assert.equal(e.right.storage.getItem(key),before);
        await e.right.diagnostic.verify('race',left);
        await assert.rejects(e.right.diagnostic.arm(ticket),{code:'NO_AUTOMATIC_RETRY'});
    }finally{e.dispose();}
});
test('cleanup binds exact owner/state/receipts/digests, refuses unexpected data before deleting and leaves no broad cascade',async()=>{
    const e=clients();try{const {f}=await throughIdentical(e);const sql=e.left.get('cloudConcurrencyCleanup')(f,3,'left');
        for(const phrase of ['owner mismatch','Exact entry state changed','Unexpected related data','Receipt count changed','Exact receipt/digest changed'])assert.ok(sql.includes(phrase));
        assert.ok(sql.indexOf('for update')<sql.indexOf('delete from'));assert.ok(sql.indexOf('actual.request_digest=encode(sha256')<sql.indexOf('delete from'));
        assert.ok(sql.includes(f.scope.universeId));assert.ok(sql.includes(f.scope.ownerUserId));assert.match(sql,/test_universes_removed/);
        assert.doesNotMatch(sql,/cascade|truncate/i);
        assert.throws(()=>e.left.get('cloudConcurrencyCleanup')(f,3,'not-a-winner'));
    }finally{e.dispose();}
});
test('locking needs different PIDs, target identity, actual overlapping bounded timeout; scripts rollback without domain writes',async()=>{
    const e=clients();try{const f=await e.prepare(),check=e.left.get('cloudConcurrencyLockEvidence'),a={kind:'holder',scope:f.scope,role:'authenticated',backendPid:10,acquiredAt:10000,holdCompletedAt:18000},
        b={kind:'waiter',scope:f.scope,role:'authenticated',backendPid:11,startedAt:11000,finishedAt:13000,outcome:'lock-timeout-observed'};
        assert.equal(check([a,b],f).state,'PASS');
        for(const changed of [{...b,backendPid:10},{...b,startedAt:19000,finishedAt:21000},{...b,outcome:'unverified-no-lock-wait'},{...b,scope:{...f.scope,universeId:f.operations.seed}}])assert.equal(check([a,changed],f).state,'UNVERIFIED');
        const scripts=e.left.get('cloudConcurrencyLockScripts')(f,'left');
        for(const sql of Object.values(scripts)){assert.match(sql,/set local role authenticated/);assert.match(sql,/set local lock_timeout='2s'/);assert.match(sql,/\nrollback;$/);
            assert.doesNotMatch(sql,/^\s*(create|alter|grant|revoke|insert|update|delete)\b/im);assert.ok(sql.includes(f.scope.universeId));}
        assert.match(scripts.holder,/pg_sleep\(8\)/);assert.match(scripts.waiter,/exception when lock_not_available/);
    }finally{e.dispose();}
});
test('normal app never loads Phase B and diagnostic assets resolve',()=>{
    const index=fs.readFileSync('index.html','utf8');assert.doesNotMatch(index,/cloud-concurrency/);
    const html=fs.readFileSync('dev/cloud-concurrency-diagnostic.html','utf8');
    for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g))if(!match[1].startsWith('../docs'))assert.ok(fs.existsSync(require('node:path').resolve('dev',match[1])),match[1]);
    for(const file of ['dev/cloud-concurrency-page.js','dev/cloud-concurrency-diagnostic.js'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/\.from\(|\.schema\('cosmifold_private'\)|innerHTML|service_role|sb_secret_/);
});
