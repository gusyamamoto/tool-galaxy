// Inactive loopback diagnostic. All mutations target one freshly allocated fixture.
function createCloudConcurrencyDiagnostic({auth=createAuthService(),gateway=createSupabaseMetadataGateway(),cache=createCloudCacheStore(),
    markers=()=>sessionStorage,location=globalThis.location,randomUUID=()=>crypto.randomUUID(),now=()=>Date.now(),
    wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),report=()=>{},onState=()=>{},holdTimeoutMs=60000,requestTimeoutMs=15000,barrierHoldTimeoutMs=120000}={}){
    const p=cloudConcurrencyPlan,c=cosmifoldCloudContract,projection=cosmifoldCloudProjection,changes=cosmifoldCloudChanges;
    const markerKey='cosmifold:dev:cloud-concurrency:v1';let disposed=false,busy=false,generation=0,owner=null,repo=null,held=null;
    const rawGateway=gateway;
    gateway={...rawGateway};
    for(const method of ['listOwnedUniverses','createUniverse','readUniverse','commitMetadata','getOperationReceipt'])gateway[method]=(...args)=>{
        const at=generation,who=owner,write=['createUniverse','commitMetadata'].includes(method);
        return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Object.assign(new Error('Bounded RPC timeout'),{
            code:write?'OUTCOME_UNKNOWN':'NETWORK_UNAVAILABLE',outcome:write?'unknown':'not-committed',requiresReconciliation:write})),requestTimeoutMs);
            Promise.resolve().then(()=>{p.assert(!disposed&&generation===at&&owner===who,'CONTEXT_CHANGED');return rawGateway[method](...args);}).then(value=>{
                clearTimeout(timer);try{p.assert(!disposed&&generation===at&&owner===who,'CONTEXT_CHANGED');resolve(value);}catch(e){reject(e);}
            },e=>{clearTimeout(timer);reject(e);});
        });
    };
    const subscription=auth.subscribe(state=>{const next=state.ready?state.user?.id||null:null;
        if(owner!==next){owner=next;generation++;repo?.dispose();held?.release();}});
    function marker(){const text=markers().getItem(markerKey);if(text===null)return null;
        let m;try{m=c.json(JSON.parse(text));}catch{p.assert(false,'INVALID_PHASE_B_MARKER');}
        p.fixture(m.fixture);p.assert(m.version===1&&['left','right'].includes(m.role)&&m.attempts&&m.verified&&
            Object.keys(m).sort().join(',')==='attempts,fixture,role,verified,version,winner','INVALID_PHASE_B_MARKER');
        p.assert((m.role==='left'?m.fixture.leftOrigin:m.fixture.rightOrigin)===location.origin,'WRONG_CONTEXT_ORIGIN');return m;}
    function save(m,ctx){guard(ctx);markers().setItem(markerKey,JSON.stringify(c.json(m)));onState(m);}
    function guard(ctx){p.assert(!disposed&&generation===ctx.generation&&auth.getState().user?.id===ctx.owner,'CONTEXT_CHANGED');}
    async function actor(){p.origin(location.origin);p.assert(!disposed,'DIAGNOSTIC_DISPOSED');await auth.initialize();
        const id=auth.getState().user?.id;p.assert(id,'SIGN_IN_AT_THIS_ORIGIN_FIRST');return {owner:id,generation};}
    async function run(action){p.assert(!busy&&!disposed,'DIAGNOSTIC_BUSY');busy=true;try{return await action(await actor());}finally{busy=false;}}
    function owned(ctx){const m=marker();p.assert(m&&m.fixture.scope.ownerUserId===ctx.owner,'ORIGINAL_TEST_OWNER_REQUIRED');return m;}
    function disk(f,ctx){return cache.bind({scope:f.scope,contextId:'phase-b-'+location.origin,generation:ctx.generation,isCurrent:()=>!disposed&&generation===ctx.generation&&owner===ctx.owner});}
    async function read(f,ctx){const r=await gateway.readUniverse(f.scope);guard(ctx);p.assert(r.status==='found','FIXTURE_ABSENT');return r.metadata;}
    async function cacheRead(f,metadata,ctx){const session=disk(f,ctx);await session.exclusive(()=>{guard(ctx);const old=session.read();
        p.assert(['missing','valid'].includes(old.status),'CACHE_REVIEW_REQUIRED');p.assert(!old.record?.pending,'PENDING_REVIEW_REQUIRED');session.refresh(metadata);});guard(ctx);}
    function expected(f,metadata,stage,winner){p.assert(changes.equal(metadata,p.metadata(f,stage,winner)),'FIXTURE_STATE_CHANGED');}
    async function receipt(f,kind,winner,ctx,missing=false){const r=await gateway.getOperationReceipt(f.scope,f.operations[kind]);guard(ctx);
        if(missing){p.assert(r.status==='missing','UNEXPECTED_OPERATION_RECEIPT');return r;}
        p.assert(r.status==='found'&&/^[a-f0-9]{64}$/.test(r.request_digest)&&changes.equal(r.acknowledgement,p.acknowledgement(f,kind,winner,true)),'RECEIPT_CHANGED');return r;}
    async function inspect(f,ctx){const metadata=await read(f,ctx),stage=Number(metadata.universe.revision);p.assert(stage>=0&&stage<=4,'FIXTURE_REVISION_CHANGED');
        let winner=null;
        for(const role of ['left','right']){const r=await gateway.getOperationReceipt(f.scope,f.operations[role]);guard(ctx);
            if(r.status==='found'){p.assert(stage>=2&&!winner&&changes.equal(r.acknowledgement,p.acknowledgement(f,role,null,true))&&/^[a-f0-9]{64}$/.test(r.request_digest),'RACE_RECEIPTS_CHANGED');winner=role;}
            else p.assert(r.status==='missing','UNIVERSE_RECEIPT_ABSENT');}
        p.assert(stage<2?!winner:!!winner,'WINNER_NOT_PROVEN');expected(f,metadata,stage,winner);
        await receipt(f,'seed',winner,ctx,stage<1);await receipt(f,'identical',winner,ctx,stage<3);await receipt(f,'newer',winner,ctx,stage<4);
        return {metadata,stage,winner};}
    function assertIdle(m,kind){p.assert(!m.attempts[kind],'NO_AUTOMATIC_RETRY');p.assert(!held,'HELD_RESPONSE_ACTIVE');}
    async function execute(f,kind,winner,ctx,readyToDispatch=null,custom=null){
        guard(ctx);repo?.dispose();const command=custom?custom.command:p.command(f,kind,winner),base=Number(command.baseRevision),session=disk(f,ctx);
        let submitted=0,ack=null,events=0,requestStartedAt=null,requestSettledAt=null;
        const transport={...gateway,async commitMetadata(actual){guard(ctx);p.assert(changes.equal(actual,command),'COMMAND_PLAN_CHANGED');submitted++;
            p.assert(submitted===1,'MUTATION_RETRIED');p.assert(session.read().record.acknowledged.revision===String(base),'CACHE_ADVANCED_BEFORE_ACK');
            requestStartedAt=now();let value;try{value=await gateway.commitMetadata(actual);}finally{requestSettledAt=now();}
            guard(ctx);p.assert(session.read().record.acknowledged.revision===String(base),'CACHE_ADVANCED_BEFORE_ACK');return value;}};
        const current=createCloudUniverseRepository({scope:f.scope,gateway:transport,isCurrent:()=>!disposed&&generation===ctx.generation&&owner===ctx.owner,
            newOperationId:()=>command.operationId,durability:{prepare:op=>session.prepare(op),accept:op=>session.accept(op),reject:op=>session.reject(op),savePresentation:op=>session.savePresentation(op)}});
        repo=current;current.subscribe(event=>{guard(ctx);events++;ack=event.acknowledgement;});
        await current.open();guard(ctx);const opened=projection.toRelational(current.load(),{...f.scope,revision:current.revision()}).metadata;
        if(custom?.baseMetadata)p.assert(changes.equal(opened,custom.baseMetadata),'CUSTOM_BASE_STATE_CHANGED');else expected(f,opened,base,winner);
        await cacheRead(f,custom?.baseMetadata||p.metadata(f,base,winner),ctx);
        if(readyToDispatch){await readyToDispatch();guard(ctx);}
        let outcome='committed',error=null;
        try{await session.exclusive(async()=>{session.read();await current.save(custom?custom.snapshot:p.snapshot(f,base+1,['left','right'].includes(kind)?kind:winner),{type:command.type});});guard(ctx);}
        catch(e){guard(ctx);if(e.code==='REVISION_CONFLICT'&&e.outcome==='not-committed'){outcome='stale';error={code:e.code,reason:e.reason,outcome:e.outcome};}
            else throw e;}
        p.assert(submitted===1,'DISPATCH_NOT_PROVEN');
        const after=disk(f,ctx).read();p.assert(after.status==='valid'&&after.record.pending===null,'CACHE_NOT_SETTLED');
        if(outcome==='committed')p.assert(events===1&&changes.equal(ack,custom?custom.ack(ack?.replayed):p.acknowledgement(f,kind,winner,ack?.replayed))&&after.record.acknowledged.revision===String(base+1),'ACK_CACHE_NOT_COHERENT');
        else p.assert(events===0&&after.record.acknowledged.revision===String(base),'STALE_PUBLISHED_OR_ADVANCED');
        return {outcome,error,ack,command,submitted,events,cacheRevision:after.record.acknowledged.revision,requestStartedAt,requestSettledAt};
    }
    async function inspectConcurrent(m,ctx){
        const q=cloudConcurrentRecoveryPlan,r=q.validate(m.attempts.concurrentRecovery.plan);p.assert(changes.equal(r.fixture,m.fixture)&&r.winner===m.winner,'RECOVERY_CONTEXT_MISMATCH');
        const metadata=await read(m.fixture,ctx),stage=Number(metadata.universe.revision);p.assert([3,4].includes(stage),'RECOVERY_REVISION_CHANGED');
        p.assert(changes.equal(metadata,stage===3?p.metadata(m.fixture,3,m.winner):q.metadata(r)),'RECOVERY_STATE_CHANGED');
        for(const kind of ['seed',m.winner,'identical'])await receipt(m.fixture,kind,m.winner,ctx);
        await receipt(m.fixture,m.winner==='left'?'right':'left',m.winner,ctx,true);await receipt(m.fixture,'newer',m.winner,ctx,true);
        const original=await receipt(m.fixture,'identical',m.winner,ctx);
        p.assert(original.request_digest===m.attempts.identicalRecovery.requestDigest,'RECOVERY_ORIGINAL_RECEIPT_CHANGED');
        const fresh=await gateway.getOperationReceipt(m.fixture.scope,r.operationId);guard(ctx);
        p.assert(stage===3?fresh.status==='missing':fresh.status==='found'&&/^[a-f0-9]{64}$/.test(fresh.request_digest)&&changes.equal(fresh.acknowledgement,q.ack(r,true)),
            'RECOVERY_RECEIPT_CHANGED');return {metadata,stage,winner:m.winner};
    }
    function recovered(m){p.assert(m.verified.race&&m.verified.identicalCommitted&&!m.verified.identical&&!m.attempts.identicalReplay&&!m.attempts.newer&&!held,
        'EXACT_RECOVERED_REVISION_3_CONTEXT_REQUIRED');}
    async function inspectBarrier(m,ctx){
        const b=cloudStartBarrierPlan,q=cloudConcurrentRecoveryPlan,r=b.validate(m.attempts.startBarrier.plan);
        p.assert(changes.equal(r.prior,m.attempts.concurrentRecovery.plan),'BARRIER_PRIOR_PLAN_CHANGED');
        const metadata=await read(m.fixture,ctx),stage=Number(metadata.universe.revision);p.assert([4,5].includes(stage),'BARRIER_REVISION_CHANGED');
        p.assert(changes.equal(metadata,stage===4?q.metadata(r.prior):b.metadata(r)),'BARRIER_STATE_CHANGED');
        for(const kind of ['seed',m.winner,'identical'])await receipt(m.fixture,kind,m.winner,ctx);
        await receipt(m.fixture,m.winner==='left'?'right':'left',m.winner,ctx,true);await receipt(m.fixture,'newer',m.winner,ctx,true);
        const original=await receipt(m.fixture,'identical',m.winner,ctx);p.assert(original.request_digest===m.attempts.identicalRecovery.requestDigest,'RECOVERY_ORIGINAL_RECEIPT_CHANGED');
        const prior=await gateway.getOperationReceipt(m.fixture.scope,r.prior.operationId);guard(ctx);
        p.assert(prior.status==='found'&&changes.equal(prior.acknowledgement,q.ack(r.prior,true))&&
            prior.request_digest===m.attempts.concurrentRecovery.readOnlyCommit.requestDigest,'BARRIER_PRIOR_RECEIPT_CHANGED');
        const fresh=await gateway.getOperationReceipt(m.fixture.scope,r.operationId);guard(ctx);
        p.assert(stage===4?fresh.status==='missing':fresh.status==='found'&&/^[a-f0-9]{64}$/.test(fresh.request_digest)&&changes.equal(fresh.acknowledgement,b.ack(r,true)),
            'BARRIER_RECEIPT_CHANGED');return {metadata,stage,winner:m.winner};
    }
    return Object.freeze({markerKey,
        fixtures(){const m=marker();if(m)onState(m);return m;},
        async prepare(rightOrigin){return run(async ctx=>{p.assert(!marker(),'FIXTURE_ALREADY_PREPARED');p.origin(rightOrigin);p.assert(rightOrigin!==location.origin,'INDEPENDENT_ORIGINS_REQUIRED');
            const f=p.fixture({format:'cosmifold-phase-b',fixtureVersion:1,scope:{ownerUserId:ctx.owner,universeId:randomUUID()},leftOrigin:location.origin,rightOrigin,
                operations:Object.fromEntries(['seed','left','right','identical','newer'].map(k=>[k,randomUUID()]))});
            const m={version:1,fixture:f,role:'left',attempts:{seed:{phase:'dispatched',command:p.command(f,'seed')}},verified:{},winner:null};save(m,ctx);
            expected(f,await gateway.createUniverse(f.scope.universeId),0);guard(ctx);
            const result=await execute(f,'seed',null,ctx);m.attempts.seed={phase:'done',result};save(m,ctx);
            report('PASS: one NEW disposable Universe seeded at revision 1. Copy its fixture JSON to the other origin; do not repeat preparation.');return f;});},
        async join(input){return run(async ctx=>{const f=p.fixture(typeof input==='string'?JSON.parse(input):input);
            p.assert(location.origin===f.rightOrigin&&ctx.owner===f.scope.ownerUserId,'WRONG_JOIN_CONTEXT');p.assert(!marker(),'FIXTURE_ALREADY_JOINED');
            const state=await inspect(f,ctx);p.assert(state.stage===1,'JOIN_BEFORE_RACE_REQUIRED');await cacheRead(f,state.metadata,ctx);
            const m={version:1,fixture:f,role:'right',attempts:{},verified:{},winner:null};save(m,ctx);report('PASS: joined the SAME revision-1 fixture read-only, with independent origin/cache.');return f;});},
        async readiness(kind){return run(async ctx=>{const m=owned(ctx);p.assert(kind==='identical'&&m.verified.race,'VERIFY_PREVIOUS_CASE_FIRST');assertIdle(m,kind);
            const state=await inspect(m.fixture,ctx);p.assert(state.stage===2,'WRONG_CASE_REVISION');
            return {format:'cosmifold-phase-b-ready',readyVersion:1,fixture:m.fixture,kind,role:m.role,
                origin:location.origin,revision:'2',raceNonce:m.attempts.race.observation.nonce,winner:state.winner,verifiedRace:true};});},
        async makeTicket(kind,delayMs=30000,peerReadiness=null){return run(async ctx=>{const m=owned(ctx);p.assert(m.role==='left','LEFT_CONTEXT_ONLY');assertIdle(m,kind);
            p.assert(kind==='race'||kind==='identical'&&m.verified.race,'VERIFY_PREVIOUS_CASE_FIRST');
            if(kind==='identical'){const r=c.json(typeof peerReadiness==='string'?JSON.parse(peerReadiness):peerReadiness);
                p.assert(changes.equal(r,{format:'cosmifold-phase-b-ready',readyVersion:1,fixture:m.fixture,kind,role:'right',
                    origin:m.fixture.rightOrigin,revision:'2',raceNonce:m.attempts.race.observation.nonce,winner:m.winner,verifiedRace:true}),
                    'RIGHT_VERIFICATION_READINESS_REQUIRED');}
            p.assert(Number.isInteger(delayMs)&&delayMs>=5000&&delayMs<=60000,'BOUNDED_START_REQUIRED');
            const state=await inspect(m.fixture,ctx);p.assert(state.stage===(kind==='race'?1:2),'WRONG_CASE_REVISION');
            return p.ticket(m.fixture,kind,now()+delayMs,randomUUID());});},
        async arm(input){return run(async ctx=>{const m=owned(ctx),t=p.validateTicket(typeof input==='string'?JSON.parse(input):input,m.fixture);assertIdle(m,t.kind);
            p.assert(t.kind==='race'||m.verified.race,'VERIFY_PREVIOUS_CASE_FIRST');p.assert(t.startAt-now()>=1000&&t.startAt-now()<=60000,'TICKET_EXPIRED_OR_TOO_FAR');
            const state=await inspect(m.fixture,ctx),base=t.kind==='race'?1:2;p.assert(state.stage===base,'WRONG_CASE_REVISION');
            m.winner=state.winner;await cacheRead(m.fixture,state.metadata,ctx);
            const kind=t.kind==='race'?m.role:'identical';m.attempts[t.kind]={phase:'armed',ticket:t,command:p.command(m.fixture,kind,state.winner)};save(m,ctx);
            report('ARMED: '+t.kind+'; one scheduled mutation, no retry. Keep both contexts open.');let dispatchedAt;
            try{const result=await execute(m.fixture,kind,state.winner,ctx,async()=>{
                    await wait(Math.max(0,t.startAt-now()));guard(ctx);p.assert(Math.abs(now()-t.startAt)<=2000,'UNVERIFIED_MISSED_DISPATCH_WINDOW');
                    dispatchedAt=now();m.attempts[t.kind].phase='dispatched';save(m,ctx);
                });
                const observation={format:'cosmifold-phase-b-observation',observationVersion:1,fixture:m.fixture,kind:t.kind,role:m.role,origin:location.origin,
                    nonce:t.nonce,startAt:t.startAt,dispatchedAt,completedAt:now(),result};
                m.attempts[t.kind]={phase:'done',ticket:t,observation};save(m,ctx);report('RESULT: '+m.role+' '+result.outcome+'. Exchange observation JSON; server/peer verification is still required.');return observation;
            }catch(error){guard(ctx);m.attempts[t.kind].phase='stopped';save(m,ctx);throw error;}});},
        async verify(kind,input){return run(async ctx=>{const m=owned(ctx),mine=m.attempts[kind]?.observation;p.assert(mine,'LOCAL_OBSERVATION_REQUIRED');
            const peer=c.json(typeof input==='string'?JSON.parse(input):input);p.assert(peer?.format===mine.format&&peer.observationVersion===1&&peer.role!==m.role&&
                ['left','right'].includes(peer.role)&&peer.origin===(peer.role==='left'?m.fixture.leftOrigin:m.fixture.rightOrigin)&&
                changes.equal(peer.fixture,m.fixture)&&peer.kind===kind&&peer.nonce===mine.nonce&&peer.startAt===mine.startAt,'WRONG_PEER_OBSERVATION');
            const pair=[mine,peer];for(const o of pair){p.assert(Number.isSafeInteger(o.dispatchedAt)&&Math.abs(o.dispatchedAt-o.startAt)<=2000&&
                o.completedAt>=o.dispatchedAt&&o.result.submitted===1,'DISPATCH_EVIDENCE_UNVERIFIED');
                const expectedCommand=p.command(m.fixture,kind==='race'?o.role:'identical',m.winner);p.assert(changes.equal(o.result.command,expectedCommand),'PEER_COMMAND_CHANGED');}
            const state=await inspect(m.fixture,ctx);p.assert(kind==='race'?[2,3].includes(state.stage):state.stage===3,'WRONG_FINAL_REVISION');
            if(kind==='race'){p.assert(pair.filter(o=>o.result.outcome==='committed').length===1&&pair.filter(o=>o.result.outcome==='stale').length===1,'RACE_NOT_ONE_WINNER');
                for(const o of pair)if(o.result.outcome==='committed')p.assert(o.role===state.winner&&changes.equal(o.result.ack,p.acknowledgement(m.fixture,o.role,null,false))&&o.result.events===1&&o.result.cacheRevision==='2','WINNER_ACK_CHANGED');
                else p.assert(o.result.error?.code==='REVISION_CONFLICT'&&o.result.error.outcome==='not-committed'&&o.result.events===0&&o.result.cacheRevision==='1','STALE_RESULT_NOT_DEFINITE');
            }else{p.assert(pair.every(o=>o.result.outcome==='committed'&&o.result.events===1&&o.result.cacheRevision==='3'),'IDENTICAL_NOT_COMMITTED');
                p.assert(pair.filter(o=>o.result.ack?.replayed===true).length===1,'IDENTICAL_REPLAY_NOT_PROVEN');
                for(const o of pair)p.assert(changes.equal(o.result.ack,p.acknowledgement(m.fixture,'identical',state.winner,o.result.ack.replayed)),'IDENTICAL_ACK_CHANGED');}
            repo?.dispose();await cacheRead(m.fixture,state.metadata,ctx);m.winner=state.winner;m.verified[kind]=true;save(m,ctx);
            report('PASS: '+kind+' verified against both observations, exact server metadata and original receipts.'+
                (kind==='race'&&state.stage===3?' Historical race verified at current revision 3; no operation was resubmitted.':'')+
                ' Cache refreshed only from the validated server read. Browser outcomes do NOT prove SQL lock overlap.');return state;});},
        async recoverIdentical(input){return run(async ctx=>{const m=owned(ctx);p.assert(m.verified.race&&!m.verified.identical,'VERIFY_RACE_BEFORE_RECOVERY');
            const o=c.json(typeof input==='string'?JSON.parse(input):input),state=await inspect(m.fixture,ctx);p.assert(state.stage===3,'RECOVERY_REQUIRES_EXACT_REVISION_3');
            p.assert(o?.format==='cosmifold-phase-b-observation'&&o.observationVersion===1&&o.kind==='identical'&&o.role==='left'&&
                o.origin===m.fixture.leftOrigin&&changes.equal(o.fixture,m.fixture)&&Number.isSafeInteger(o.startAt)&&Number.isSafeInteger(o.dispatchedAt)&&
                Math.abs(o.dispatchedAt-o.startAt)<=2000&&o.completedAt>=o.dispatchedAt&&o.result?.outcome==='committed'&&
                o.result.submitted===1&&o.result.events===1&&o.result.cacheRevision==='3'&&
                changes.equal(o.result.command,p.command(m.fixture,'identical',state.winner))&&
                changes.equal(o.result.ack,p.acknowledgement(m.fixture,'identical',state.winner,false)),'LEFT_COMMITTED_OBSERVATION_REQUIRED');
            p.assert(m.role==='left'?m.attempts.identical?.phase==='done'&&changes.equal(m.attempts.identical.observation,o):!m.attempts.identical,
                'RECOVERY_NOT_A_SINGLE_LEFT_COMMIT');
            const original=await receipt(m.fixture,'identical',state.winner,ctx);
            const proof={leftObservation:o,requestDigest:original.request_digest};
            if(m.attempts.identicalRecovery)p.assert(changes.equal(m.attempts.identicalRecovery,proof),'RECOVERY_PROOF_CHANGED');
            m.attempts.identicalRecovery=proof;m.winner=state.winner;m.verified.identicalCommitted=true;save(m,ctx);
            report('PASS: original LEFT commit and receipt verified read-only at revision 3. No command resubmitted; caches retained. '+
                'UNVERIFIED: concurrent identical operation did not run. An explicit RIGHT replay can test idempotency only.');return proof;});},
        async replayCommittedIdentical(){return run(async ctx=>{const m=owned(ctx);p.assert(!m.attempts.concurrentRecovery,'RECOVERY_PATH_USE_SEPARATE_NEXT_STEPS');p.assert(m.role==='right'&&m.verified.race&&m.verified.identicalCommitted&&!m.attempts.identical,
                'RIGHT_RECOVERED_CONTEXT_REQUIRED');assertIdle(m,'identicalReplay');
            const before=await inspect(m.fixture,ctx);p.assert(before.stage===3,'RECOVERY_REQUIRES_EXACT_REVISION_3');
            const original=await receipt(m.fixture,'identical',m.winner,ctx),command=p.command(m.fixture,'identical',m.winner);
            p.assert(changes.equal(command,m.attempts.identicalRecovery.leftObservation.result.command)&&
                original.request_digest===m.attempts.identicalRecovery.requestDigest,'RECOVERY_PROOF_CHANGED');
            m.attempts.identicalReplay={phase:'dispatched',command};save(m,ctx);
            const ack=await gateway.commitMetadata(command);guard(ctx);
            p.assert(changes.equal(ack,p.acknowledgement(m.fixture,'identical',m.winner,true)),'REPLAY_ACK_CHANGED');
            const after=await inspect(m.fixture,ctx);p.assert(changes.equal(before,after)&&changes.equal(original,await receipt(m.fixture,'identical',m.winner,ctx)),
                'REPLAY_CHANGED_STATE');
            await cacheRead(m.fixture,after.metadata,ctx);m.attempts.identicalReplay={phase:'done',command,ack};m.verified.identicalReplay=true;save(m,ctx);
            report('PASS: one explicit exact original-ID replay returned the existing acknowledgement; revision 3 and original receipt unchanged. '+
                'UNVERIFIED: this is sequential replay, not concurrent identical submission.');return ack;});},
        async prepareConcurrent(){return run(async ctx=>{const m=owned(ctx);recovered(m);p.assert(m.role==='left'&&!m.attempts.concurrentRecovery,'RECOVERY_PLAN_ALREADY_EXISTS_OR_NOT_LEFT');
            const state=await inspect(m.fixture,ctx);p.assert(state.stage===3,'RECOVERY_REQUIRES_EXACT_REVISION_3');
            const plan=cloudConcurrentRecoveryPlan.validate({format:'cosmifold-phase-b-concurrent-recovery',recoveryVersion:1,fixture:m.fixture,
                winner:state.winner,operationId:randomUUID(),planId:randomUUID()});
            const missing=await gateway.getOperationReceipt(m.fixture.scope,plan.operationId);guard(ctx);p.assert(missing.status==='missing','FRESH_OPERATION_ALREADY_EXISTS');
            m.attempts.concurrentRecovery={plan};save(m,ctx);report('PASS: fresh concurrent-recovery plan allocated locally. Universe remains revision 3; no mutation sent. Copy this plan to RIGHT.');return plan;});},
        async joinConcurrent(input){return run(async ctx=>{const m=owned(ctx);recovered(m);p.assert(m.role==='right'&&!m.attempts.concurrentRecovery,'RECOVERY_PLAN_ALREADY_EXISTS_OR_NOT_RIGHT');
            const plan=cloudConcurrentRecoveryPlan.validate(typeof input==='string'?JSON.parse(input):input);
            p.assert(changes.equal(plan.fixture,m.fixture)&&plan.winner===m.winner,'RECOVERY_CONTEXT_MISMATCH');
            const candidate={...m,attempts:{...m.attempts,concurrentRecovery:{plan}}};const state=await inspectConcurrent(candidate,ctx);p.assert(state.stage===3,'RECOVERY_REQUIRES_EXACT_REVISION_3');
            m.attempts.concurrentRecovery={plan};save(m,ctx);report('PASS: RIGHT joined the same fresh recovery operation read-only at revision 3.');return plan;});},
        async concurrentReady(){return run(async ctx=>{const m=owned(ctx);recovered(m);const r=m.attempts.concurrentRecovery;p.assert(r&&!r.dispatch,'RECOVERY_NOT_READY');
            const state=await inspectConcurrent(m,ctx);p.assert(state.stage===3,'RECOVERY_REQUIRES_EXACT_REVISION_3');
            const cached=disk(m.fixture,ctx).read();p.assert(cached.status==='valid'&&!cached.record.pending,'PENDING_REVIEW_REQUIRED');
            r.ready=cloudConcurrentRecoveryPlan.ready(r.plan,m.role);save(m,ctx);report('PASS: '+m.role.toUpperCase()+' readiness checked at revision 3; fresh operation receipt absent. No mutation sent.');return r.ready;});},
        async concurrentTicket(peer,delayMs=45000){return run(async ctx=>{const m=owned(ctx);recovered(m);const r=m.attempts.concurrentRecovery,q=cloudConcurrentRecoveryPlan;
            p.assert(m.role==='left'&&r?.ready&&!r.dispatch,'LEFT_READY_CONTEXT_REQUIRED');
            p.assert(changes.equal(c.json(typeof peer==='string'?JSON.parse(peer):peer),q.ready(r.plan,'right')),'RIGHT_RECOVERY_READINESS_REQUIRED');
            const state=await inspectConcurrent(m,ctx);p.assert(state.stage===3,'RECOVERY_REQUIRES_EXACT_REVISION_3');
            p.assert(Number.isInteger(delayMs)&&delayMs>=5000&&delayMs<=60000,'BOUNDED_START_REQUIRED');
            const ticket={format:'cosmifold-phase-b-recovery-ticket',ticketVersion:1,plan:r.plan,nonce:randomUUID(),startAt:now()+delayMs,
                leftReady:q.ready(r.plan,'left'),rightReady:q.ready(r.plan,'right')};report('READY: both recovery readiness proofs match. Copy the start ticket to RIGHT, then arm BOTH before its deadline.');return ticket;});},
        async armConcurrent(input){return run(async ctx=>{const m=owned(ctx);recovered(m);const r=m.attempts.concurrentRecovery,q=cloudConcurrentRecoveryPlan;
            p.assert(r?.ready&&!r.dispatch,'RECOVERY_NO_REDISPATCH');const t=c.json(typeof input==='string'?JSON.parse(input):input);
            p.assert(t?.format==='cosmifold-phase-b-recovery-ticket'&&t.ticketVersion===1&&
                Object.keys(t).sort().join(',')==='format,leftReady,nonce,plan,rightReady,startAt,ticketVersion'&&changes.equal(t.plan,r.plan)&&
                changes.equal(t.leftReady,q.ready(r.plan,'left'))&&changes.equal(t.rightReady,q.ready(r.plan,'right')),'RECOVERY_TICKET_MISMATCH');
            c.scope({ownerUserId:t.nonce,universeId:t.nonce});p.assert(Number.isSafeInteger(t.startAt)&&t.startAt-now()>=1000&&t.startAt-now()<=60000,'TICKET_EXPIRED_OR_TOO_FAR');
            const state=await inspectConcurrent(m,ctx);p.assert(state.stage===3,'RECOVERY_REQUIRES_EXACT_REVISION_3');
            r.dispatch={phase:'armed',ticket:t};save(m,ctx);report('ARMED: '+m.role+' fresh identical command at base revision 3. Keep BOTH contexts open; no retry.');let dispatchedAt;
            try{const result=await execute(m.fixture,'concurrentRecovery',m.winner,ctx,async()=>{
                    await wait(Math.max(0,t.startAt-now()));guard(ctx);p.assert(Math.abs(now()-t.startAt)<=2000,'UNVERIFIED_MISSED_DISPATCH_WINDOW');
                    dispatchedAt=now();r.dispatch.phase='dispatched';save(m,ctx);
                },{command:q.command(r.plan),snapshot:projection.toStorageV5(q.metadata(r.plan)),ack:replayed=>q.ack(r.plan,replayed)});
                const observation={format:'cosmifold-phase-b-concurrent-observation',observationVersion:1,plan:r.plan,role:m.role,
                    origin:location.origin,nonce:t.nonce,startAt:t.startAt,dispatchedAt,completedAt:now(),result};
                r.dispatch={phase:'done',ticket:t,observation};save(m,ctx);report('RESULT: '+m.role+' recovery '+result.outcome+'. Exchange recovery observations and verify BOTH.');return observation;
            }catch(error){guard(ctx);r.dispatch.phase='stopped';save(m,ctx);throw error;}});},
        async verifyConcurrent(input){return run(async ctx=>{const m=owned(ctx),r=m.attempts.concurrentRecovery,q=cloudConcurrentRecoveryPlan;
            const mine=r?.dispatch?.observation;p.assert(mine,'RECOVERY_LOCAL_OBSERVATION_REQUIRED');const peer=c.json(typeof input==='string'?JSON.parse(input):input);
            p.assert(peer?.format===mine.format&&peer.observationVersion===1&&changes.equal(peer.plan,r.plan)&&peer.role!==m.role&&['left','right'].includes(peer.role)&&
                peer.origin===(peer.role==='left'?m.fixture.leftOrigin:m.fixture.rightOrigin)&&peer.nonce===mine.nonce&&peer.startAt===mine.startAt,'RECOVERY_PEER_MISMATCH');
            const pair=[mine,peer];for(const o of pair)p.assert(Number.isSafeInteger(o.dispatchedAt)&&Math.abs(o.dispatchedAt-o.startAt)<=2000&&
                Number.isSafeInteger(o.completedAt)&&o.completedAt>=o.dispatchedAt&&o.result?.submitted===1&&o.result.events===1&&o.result.cacheRevision==='4'&&
                o.result.outcome==='committed'&&typeof o.result.ack?.replayed==='boolean'&&changes.equal(o.result.command,q.command(r.plan))&&
                changes.equal(o.result.ack,q.ack(r.plan,o.result.ack.replayed)),'RECOVERY_OBSERVATION_CHANGED');
            p.assert(pair.filter(o=>o.result.ack.replayed).length===1,'RECOVERY_IDENTICAL_REPLAY_NOT_PROVEN');
            p.assert(pair.every(o=>Number.isSafeInteger(o.result.requestStartedAt)&&Number.isSafeInteger(o.result.requestSettledAt)&&
                o.result.requestStartedAt>=o.dispatchedAt&&o.result.requestSettledAt<=o.completedAt&&o.result.requestSettledAt>o.result.requestStartedAt)&&
                Math.max(...pair.map(o=>o.result.requestStartedAt))<Math.min(...pair.map(o=>o.result.requestSettledAt)),
                'UNVERIFIED_RECOVERY_REQUEST_OVERLAP');
            const state=await inspectConcurrent(m,ctx);p.assert(state.stage===4,'RECOVERY_FINAL_REVISION_REQUIRED');
            repo?.dispose();await cacheRead(m.fixture,state.metadata,ctx);m.verified.concurrentRecovery=true;save(m,ctx);
            report('PASS: genuine coordinated identical-operation recovery verified: same fresh command/ID at base revision 3, one original and one replay acknowledgement, exact revision 4 and receipt. '+
                'Prior fixture/receipts preserved. SQL lock overlap remains UNVERIFIED. Stop here for review; do not use the original revision-4 buttons.');return state;});},
        async auditConcurrentCommit(input=null){return run(async ctx=>{const m=owned(ctx),r=m.attempts.concurrentRecovery,q=cloudConcurrentRecoveryPlan;
            p.assert(r&&m.verified.identicalCommitted&&!m.verified.concurrentRecovery,'READ_ONLY_RECOVERY_AUDIT_REQUIRED');
            const o=c.json(input===null?r.dispatch?.observation:typeof input==='string'?JSON.parse(input):input);
            p.assert(o?.format==='cosmifold-phase-b-concurrent-observation'&&o.observationVersion===1&&o.role==='left'&&
                o.origin===m.fixture.leftOrigin&&changes.equal(o.plan,r.plan)&&o.result?.outcome==='committed'&&o.result.submitted===1&&
                o.result.events===1&&o.result.cacheRevision==='4'&&typeof o.result.ack?.replayed==='boolean'&&
                changes.equal(o.result.command,q.command(r.plan))&&changes.equal(o.result.ack,q.ack(r.plan,o.result.ack.replayed)),
                'LEFT_RECOVERY_COMMITTED_OBSERVATION_REQUIRED');
            p.assert(m.role==='left'?r.dispatch?.phase==='done'&&changes.equal(r.dispatch.observation,o):!r.dispatch,
                'READ_ONLY_AUDIT_REQUIRES_SINGLE_LEFT_COMMIT');
            const state=await inspectConcurrent(m,ctx);p.assert(state.stage===4,'READ_ONLY_AUDIT_REQUIRES_REVISION_4');
            const original=await gateway.getOperationReceipt(m.fixture.scope,r.plan.operationId);guard(ctx);
            p.assert(original.status==='found'&&changes.equal(original.acknowledgement,q.ack(r.plan,true))&&/^[a-f0-9]{64}$/.test(original.request_digest),
                'RECOVERY_RECEIPT_CHANGED');
            const proof={leftObservation:o,requestDigest:original.request_digest,revision:'4'};
            if(r.readOnlyCommit)p.assert(changes.equal(r.readOnlyCommit,proof),'READ_ONLY_RECOVERY_PROOF_CHANGED');
            r.readOnlyCommit=proof;m.verified.concurrentRecoveryCommitted=true;save(m,ctx);
            report('PASS: original fresh LEFT recovery commit and receipt verified read-only at revision 4; prior receipts intact, no command resubmitted, caches retained. '+
                'UNVERIFIED: RIGHT never dispatched, so concurrent identical recovery did not run. Stop here; a new operation/transition and two-context start barrier require separate review.');return proof;});},
        async prepareBarrier(){return run(async ctx=>{const m=owned(ctx);p.assert(m.role==='left'&&m.verified.concurrentRecoveryCommitted&&!m.attempts.startBarrier,'BARRIER_LEFT_VERIFIED_CONTEXT_REQUIRED');
            const state=await inspectConcurrent(m,ctx);p.assert(state.stage===4,'BARRIER_REQUIRES_REVISION_4');
            const plan=cloudStartBarrierPlan.validate({format:'cosmifold-phase-b-barrier',barrierVersion:1,prior:m.attempts.concurrentRecovery.plan,
                operationId:randomUUID(),planId:randomUUID()});
            const missing=await gateway.getOperationReceipt(m.fixture.scope,plan.operationId);guard(ctx);p.assert(missing.status==='missing','BARRIER_FRESH_ID_EXISTS');
            m.attempts.startBarrier={plan};save(m,ctx);report('PASS: revision-4 start-barrier plan allocated locally with fresh IDs; no mutation sent. Copy plan to RIGHT before parking either context.');return plan;});},
        async joinBarrier(input){return run(async ctx=>{const m=owned(ctx);p.assert(m.role==='right'&&m.verified.concurrentRecoveryCommitted&&!m.attempts.startBarrier,'BARRIER_RIGHT_VERIFIED_CONTEXT_REQUIRED');
            const plan=cloudStartBarrierPlan.validate(typeof input==='string'?JSON.parse(input):input);
            const candidate={...m,attempts:{...m.attempts,startBarrier:{plan}}};const state=await inspectBarrier(candidate,ctx);p.assert(state.stage===4,'BARRIER_REQUIRES_REVISION_4');
            m.attempts.startBarrier={plan};save(m,ctx);report('PASS: RIGHT joined the same revision-4 barrier plan read-only. No deadline running.');return plan;});},
        async parkBarrier(coordinator=createCloudStartBarrierClient()){return run(async ctx=>{const m=owned(ctx),r=m.attempts.startBarrier,b=cloudStartBarrierPlan;
            p.assert(m.verified.concurrentRecoveryCommitted&&r&&!r.dispatch,'BARRIER_NO_REDISPATCH');const state=await inspectBarrier(m,ctx);p.assert(state.stage===4,'BARRIER_REQUIRES_REVISION_4');
            const contextId=randomUUID();r.dispatch={phase:'preparing',contextId};save(m,ctx);let release;
            try{const result=await execute(m.fixture,'startBarrier',m.winner,ctx,async()=>{
                    r.dispatch.phase='parked';save(m,ctx);report('PARKED: '+m.role+' opened/validated revision 4. No mutation sent; waiting for BOTH contexts and local start barrier.');
                    release=await coordinator.wait({plan:r.plan,role:m.role,contextId,isCurrent:()=>!disposed&&generation===ctx.generation&&owner===ctx.owner},status=>{
                        guard(ctx);report('LOCAL BARRIER: '+status+'; no manual-copy deadline.');});guard(ctx);
                    p.assert(release?.status==='released'&&release.planId===r.plan.planId&&Number.isSafeInteger(release.releasedAt)&&
                        now()-release.releasedAt>=-250&&now()-release.releasedAt<=1500,'UNVERIFIED_START_BARRIER_LATE_RELEASE');
                    r.dispatch.phase='dispatched';save(m,ctx);
                },{command:b.command(r.plan),baseMetadata:cloudConcurrentRecoveryPlan.metadata(r.plan.prior),
                    snapshot:projection.toStorageV5(b.metadata(r.plan)),ack:replayed=>b.ack(r.plan,replayed)});
                const observation={format:'cosmifold-phase-b-barrier-observation',observationVersion:1,plan:r.plan,role:m.role,origin:location.origin,
                    contextId,release,result};r.dispatch={phase:'done',contextId,observation};save(m,ctx);
                report('RESULT: '+m.role+' barrier '+result.outcome+'. Exchange observations and verify BOTH; no other mutations.');return observation;
            }catch(error){guard(ctx);r.dispatch.phase='stopped';save(m,ctx);throw error;}});},
        async verifyBarrier(input){return run(async ctx=>{const m=owned(ctx),r=m.attempts.startBarrier,b=cloudStartBarrierPlan,mine=r?.dispatch?.observation;
            p.assert(mine,'BARRIER_LOCAL_OBSERVATION_REQUIRED');const peer=c.json(typeof input==='string'?JSON.parse(input):input);
            p.assert(peer?.format===mine.format&&peer.observationVersion===1&&changes.equal(peer.plan,r.plan)&&peer.role!==m.role&&['left','right'].includes(peer.role)&&
                peer.origin===(peer.role==='left'?m.fixture.leftOrigin:m.fixture.rightOrigin)&&peer.contextId!==mine.contextId&&
                changes.equal(peer.release,mine.release),'BARRIER_PEER_MISMATCH');
            const pair=[mine,peer];for(const o of pair){c.scope({ownerUserId:o.contextId,universeId:o.contextId});
                p.assert(o.release?.status==='released'&&o.release.planId===r.plan.planId&&o.result?.outcome==='committed'&&o.result.submitted===1&&o.result.events===1&&
                    o.result.cacheRevision==='5'&&typeof o.result.ack?.replayed==='boolean'&&changes.equal(o.result.command,b.command(r.plan))&&
                    changes.equal(o.result.ack,b.ack(r.plan,o.result.ack.replayed)),'BARRIER_OBSERVATION_CHANGED');}
            p.assert(pair.filter(o=>o.result.ack.replayed).length===1,'BARRIER_IDENTICAL_REPLAY_NOT_PROVEN');
            p.assert(pair.every(o=>Number.isSafeInteger(o.result.requestStartedAt)&&Number.isSafeInteger(o.result.requestSettledAt)&&
                    o.result.requestStartedAt>=o.release.releasedAt-250&&o.result.requestStartedAt-o.release.releasedAt<=1500&&
                    o.result.requestSettledAt>o.result.requestStartedAt)&&
                Math.max(...pair.map(o=>o.result.requestStartedAt))<Math.min(...pair.map(o=>o.result.requestSettledAt)),'UNVERIFIED_START_BARRIER_OVERLAP');
            const state=await inspectBarrier(m,ctx);p.assert(state.stage===5,'BARRIER_REQUIRES_REVISION_5');repo?.dispose();await cacheRead(m.fixture,state.metadata,ctx);
            m.verified.startBarrier=true;save(m,ctx);report('PASS: coordinated fresh identical-operation test verified at revision 5: one original/replay acknowledgement, overlapping client calls, exact state/receipt and all prior receipts intact. '+
                'Independent SQL locking and remaining Phase B checks are still open. Stop here.');return state;});},
        async inspectBarrierFixture(){return run(async ctx=>{const m=owned(ctx),state=await inspectBarrier(m,ctx);
            return {fixture:m.fixture,plan:m.attempts.startBarrier.plan,stage:state.stage,winner:state.winner,cacheKey:cache.key(m.fixture.scope),markerKey};});},
        async rejectBarrierReuse(){return run(async ctx=>{const m=owned(ctx),r=m.attempts.startBarrier,b=cloudStartBarrierPlan;
            p.assert(m.verified.startBarrier&&r?.dispatch?.phase==='done','VERIFY_BARRIER_BEFORE_REUSE');
            p.assert(!r.reuse,'BARRIER_REUSE_NO_REDISPATCH');
            const before=await inspectBarrier(m,ctx);p.assert(before.stage===5,'BARRIER_REUSE_REQUIRES_REVISION_5');
            const original=await gateway.getOperationReceipt(m.fixture.scope,r.plan.operationId);guard(ctx);
            p.assert(original.status==='found'&&changes.equal(original.acknowledgement,b.ack(r.plan,true))&&/^[a-f0-9]{64}$/.test(original.request_digest),
                'BARRIER_RECEIPT_CHANGED');
            const session=disk(m.fixture,ctx),cached=session.read();p.assert(cached.status==='valid'&&!cached.record.pending&&cached.record.acknowledged.revision==='5',
                'BARRIER_REUSE_CACHE_NOT_ACKNOWLEDGED');
            const command=b.command(r.plan);command.payload.upsert.entries[0].name='Phase B rejected barrier reuse';
            c.command(command);r.reuse={phase:'dispatched',command};save(m,ctx);
            let rejection=null;
            try{await gateway.commitMetadata(command);}catch(error){guard(ctx);
                p.assert(error.code==='INVALID_COMMAND'&&error.reason==='OPERATION_ID_REUSED'&&error.outcome==='not-committed','BARRIER_REUSE_REJECTION_NOT_DEFINITE');
                rejection={code:error.code,reason:error.reason,outcome:error.outcome};}
            p.assert(rejection,'BARRIER_REUSED_OPERATION_ACCEPTED');
            const after=await inspectBarrier(m,ctx),receiptAfter=await gateway.getOperationReceipt(m.fixture.scope,r.plan.operationId);guard(ctx);
            p.assert(changes.equal(before,after)&&changes.equal(original,receiptAfter),'BARRIER_REUSE_CHANGED_STATE_OR_RECEIPT');
            p.assert(changes.equal(cached,session.read()),'BARRIER_REUSE_CHANGED_CACHE');
            r.reuse={phase:'done',command,rejection};m.verified.barrierReuse=true;save(m,ctx);
            report('PASS: changed-content reuse of the committed barrier operation ID rejected definitively (OPERATION_ID_REUSED); '+
                'revision 5, exact metadata, original receipt and prior receipts unchanged; cache retained. No new operation or semantic mutation applied. '+
                'Stop here; delayed-acknowledgement fencing and independent SQL locking remain open.');return rejection;});},
        async barrierLockScripts(){return run(async ctx=>{const m=owned(ctx);p.assert(m.role==='left'&&m.verified.startBarrier&&m.verified.barrierReuse,
                'VERIFY_BARRIER_AND_REUSE_BEFORE_SQL_LOCKS');
            const state=await inspectBarrier(m,ctx);p.assert(state.stage===5,'SQL_LOCKS_REQUIRE_REVISION_5');
            report('PREPARED: exact revision-5 holder/waiter SQL generated only. No SQL executed; locking UNVERIFIED until independent-session evidence.');
            return cloudStartBarrierLockScripts(m.attempts.startBarrier.plan);});},
        async verifyBarrierLocking(input){return run(async ctx=>{const m=owned(ctx);p.assert(m.role==='left'&&m.verified.startBarrier&&m.verified.barrierReuse,
                'VERIFY_BARRIER_AND_REUSE_BEFORE_SQL_LOCKS');
            const before=await inspectBarrier(m,ctx);p.assert(before.stage===5,'SQL_LOCKS_REQUIRE_REVISION_5');
            const cached=disk(m.fixture,ctx).read(),value=c.json(typeof input==='string'?JSON.parse(input):input);
            const evidence=cloudStartBarrierLockEvidence(value,m.attempts.startBarrier.plan);
            const after=await inspectBarrier(m,ctx);p.assert(changes.equal(before,after)&&changes.equal(cached,disk(m.fixture,ctx).read()),'SQL_LOCKS_STATE_OR_CACHE_CHANGED');
            m.attempts.startBarrier.locking={...evidence,evidence:value};m.verified.barrierLocking=evidence.state==='PASS';save(m,ctx);
            report(evidence.state+': independent SQL locking at revision 5: '+evidence.reason+
                ' Metadata/receipt checks and cache unchanged. Delayed-acknowledgement fencing remains open; Phase B is not COMPLETE. Stop here.');return evidence;});},
        async holdBarrierReceipt(){return run(async ctx=>{const m=owned(ctx),r=m.attempts.startBarrier,q=cloudConcurrentRecoveryPlan;
            p.assert(m.role==='left'&&m.verified.startBarrier&&m.verified.barrierReuse&&m.verified.barrierLocking&&!held&&!r.fencing,
                'VERIFIED_REVISION_5_LEFT_REQUIRED');
            p.assert(cloudStartBarrierLockEvidence(r.locking.evidence,r.plan).state==='PASS','SQL_EVIDENCE_REQUIRED');
            const state=await inspectBarrier(m,ctx);p.assert(state.stage===5,'FENCING_REQUIRES_REVISION_5');
            const session=disk(m.fixture,ctx),cached=session.read();p.assert(cached.status==='valid'&&!cached.record.pending&&cached.record.acknowledged.revision==='5','ACKNOWLEDGED_CACHE_REQUIRED');
            const command=q.command(r.plan.prior),historical=c.json(cached.record);
            // A historical pending recovery exists ONLY in this isolated memory instance.
            // Never write a fabricated pending record or historical revision to disk.
            historical.acknowledged={revision:'3',snapshot:projection.toStorageV5(p.metadata(m.fixture,3,m.winner))};
            historical.presentation=null;historical.pending={pendingVersion:1,command,intendedSnapshot:projection.toStorageV5(q.metadata(r.plan.prior)),
                presentation:null,intent:{type:command.type}};
            let release,capture;const gate=new Promise(resolve=>release=resolve),captured=new Promise(resolve=>capture=resolve);
            const h={kind:'barrier',ctx,session,cached,gate,release,expired:false,events:0,accepts:0,state,old:null};held=h;
            const old=createCloudUniverseRepository({scope:m.fixture.scope,isCurrent:()=>!disposed&&generation===ctx.generation&&owner===ctx.owner,
                gateway:{...gateway,async getOperationReceipt(scope,id){
                    p.assert(id===command.operationId&&changes.equal(scope,m.fixture.scope),'HELD_RECEIPT_ID_CHANGED');
                    const value=await gateway.getOperationReceipt(scope,id);guard(ctx);
                    p.assert(value.status==='found'&&changes.equal(value.acknowledgement,q.ack(r.plan.prior,true))&&
                        value.request_digest===m.attempts.concurrentRecovery.readOnlyCommit.requestDigest,'HELD_RECEIPT_CHANGED');
                    h.value=value;capture();await gate;return value;
                }},durability:{accept(){h.accepts++;throw new Error('Late durability must never run');}}});
            h.old=old;old.subscribe(()=>h.events++);
            try{await old.hydrateCache(historical);h.result=old.reconcile().then(value=>({value}),error=>({error}));
                await Promise.race([captured,h.result.then(()=>p.assert(false,'HELD_RECEIPT_NOT_CAPTURED'))]);guard(ctx);
                r.fencing={phase:'held',operationId:command.operationId,receiptRevision:'4'};save(m,ctx);
                h.timer=setTimeout(()=>{h.expired=true;old.dispose();release();},barrierHoldTimeoutMs);
                report('HELD: real revision-4 receipt in an isolated in-memory recovery repository. No mutation or cache write. LEFT: open revision 5 in a fresh context, then release within 120 seconds. Do not reload.');
            }catch(error){old.dispose();release();held=null;throw error;}});},
        async refreshBarrierContext(){return run(async ctx=>{const m=owned(ctx),h=held;
            p.assert(h?.kind==='barrier'&&!h.expired&&m.attempts.startBarrier.fencing?.phase==='held','HELD_BARRIER_RECEIPT_REQUIRED');
            const state=await inspectBarrier(m,ctx);p.assert(changes.equal(state,h.state)&&changes.equal(disk(m.fixture,ctx).read(),h.cached),'FENCING_STATE_OR_CACHE_CHANGED');
            h.old.dispose();repo?.dispose();generation++;const current={owner:ctx.owner,generation};
            const fresh=createCloudUniverseRepository({scope:m.fixture.scope,gateway,isCurrent:()=>!disposed&&generation===current.generation&&owner===current.owner});
            repo=fresh;await fresh.open();guard(current);
            p.assert(changes.equal(projection.toRelational(fresh.load(),{...m.fixture.scope,revision:fresh.revision()}).metadata,state.metadata)&&
                changes.equal(disk(m.fixture,current).read(),h.cached),'FRESH_CONTEXT_STATE_CHANGED');
            h.current=current;m.attempts.startBarrier.fencing.phase='refreshed';save(m,current);
            report('PASS: fresh repository opened authoritative revision 5; prior recovery repository disposed/generation fenced. Cache bytes retained. LEFT: release held receipt next.');});},
        async releaseBarrierReceipt(){return run(async ctx=>{const m=owned(ctx),h=held;
            p.assert(h?.kind==='barrier'&&!h.expired&&m.attempts.startBarrier.fencing?.phase==='refreshed'&&h.current.generation===ctx.generation,'REFRESHED_BARRIER_CONTEXT_REQUIRED');
            clearTimeout(h.timer);h.release();const result=await h.result;
            p.assert(result.error?.code==='REPOSITORY_DISPOSED'&&h.events===0&&h.accepts===0&&h.old.getState().phase==='disposed','LATE_REPOSITORY_RESULT_NOT_FENCED');
            let fenced=false;try{await h.session.exclusive(()=>{h.session.read();h.session.refresh(cloudConcurrentRecoveryPlan.metadata(m.attempts.startBarrier.plan.prior));});}
            catch(error){p.assert(error.code==='CACHE_CONTEXT_CHANGED','UNEXPECTED_LATE_CACHE_RESULT');fenced=true;}
            p.assert(fenced&&changes.equal(disk(m.fixture,ctx).read(),h.cached)&&repo.revision()==='5','LATE_ACK_CHANGED_CACHE');
            const after=await inspectBarrier(m,ctx);p.assert(changes.equal(after,h.state),'LATE_ACK_CHANGED_SERVER_STATE');
            m.attempts.startBarrier.fencing={...m.attempts.startBarrier.fencing,phase:'verified',repositoryError:result.error.code,events:h.events,accepts:h.accepts,cacheFenced:true};
            m.verified.barrierFencing=true;held=null;save(m,ctx);
            report('PASS: delayed real revision-4 receipt rejected by disposed repository and old cache generation; zero publication/durability calls. Revision 5, all five receipts and cache unchanged. Run the read-only final Phase B check.');});},
        async completeBarrier(){return run(async ctx=>{const m=owned(ctx),r=m.attempts.startBarrier;
            p.assert(m.role==='left'&&!held&&m.verified.race&&m.verified.startBarrier&&m.verified.barrierReuse&&m.verified.barrierLocking&&m.verified.barrierFencing&&
                r?.fencing?.phase==='verified'&&r.fencing.events===0&&r.fencing.accepts===0&&r.fencing.cacheFenced&&
                cloudStartBarrierLockEvidence(r.locking.evidence,r.plan).state==='PASS','PHASE_B_GATES_NOT_COMPLETE');
            const cached=disk(m.fixture,ctx).read(),state=await inspectBarrier(m,ctx);
            p.assert(state.stage===5&&cached.status==='valid'&&!cached.record.pending&&cached.record.acknowledged.revision==='5'&&
                changes.equal(cached.record.acknowledged.snapshot,projection.toStorageV5(state.metadata))&&changes.equal(cached,disk(m.fixture,ctx).read()),'FINAL_STATE_OR_CACHE_CHANGED');
            report('COMPLETE: Phase B competing writes, coordinated identical operation, changed-content rejection, independent SQL locking and delayed-acknowledgement fencing verified at revision 5. Stop; cleanup remains a separate deliberate action.');return {status:'PASS'};});},
        async reusedOperation(){return run(async ctx=>{const m=owned(ctx);p.assert(!m.attempts.concurrentRecovery,'RECOVERY_PATH_USE_SEPARATE_NEXT_STEPS');p.assert(m.verified.identical||m.verified.identicalCommitted,'VERIFY_PREVIOUS_CASE_FIRST');assertIdle(m,'reuse');
            const before=await inspect(m.fixture,ctx);p.assert(before.stage===3,'WRONG_CASE_REVISION');const original=await receipt(m.fixture,'identical',m.winner,ctx);
            m.attempts.reuse={phase:'dispatched',command:p.reused(m.fixture,m.winner)};save(m,ctx);
            let rejected=false;try{await gateway.commitMetadata(m.attempts.reuse.command);}catch(e){guard(ctx);p.assert(e.code==='INVALID_COMMAND'&&e.reason==='OPERATION_ID_REUSED'&&e.outcome==='not-committed','REUSE_REJECTION_NOT_DEFINITE');rejected=true;}
            p.assert(rejected,'REUSED_OPERATION_WAS_ACCEPTED');const after=await inspect(m.fixture,ctx);p.assert(changes.equal(before,after)&&changes.equal(original,await receipt(m.fixture,'identical',m.winner,ctx)),'REUSE_CHANGED_STATE');
            m.attempts.reuse.phase='done';m.verified.reuse=true;save(m,ctx);report('PASS: changed content with committed operation ID rejected; metadata/revision/original receipt unchanged.');});},
        async holdOldReceipt(){return run(async ctx=>{const m=owned(ctx);p.assert(m.role==='left'&&m.verified.reuse&&!held,'LEFT_VERIFIED_CONTEXT_REQUIRED');
            p.assert(!m.attempts.concurrentRecovery,'RECOVERY_PATH_USE_SEPARATE_NEXT_STEPS');
            const state=await inspect(m.fixture,ctx);p.assert(state.stage===3,'WRONG_CASE_REVISION');const session=disk(m.fixture,ctx);
            const value=await receipt(m.fixture,'identical',m.winner,ctx);let release;const gate=new Promise(resolve=>release=resolve);
            held={ctx,session,value,gate,release,expired:false};const h=held;
            h.timer=setTimeout(()=>{h.expired=true;h.release();},holdTimeoutMs);
            report('HELD: real receipt acknowledgement at revision 3. Right writes revision 4; then left refreshes newer state and releases this held response. Do not reload this page.');});},
        async advance(){return run(async ctx=>{const m=owned(ctx);p.assert(m.role==='right'&&m.verified.reuse,'RIGHT_VERIFIED_CONTEXT_REQUIRED');assertIdle(m,'newer');
            p.assert(!m.attempts.concurrentRecovery,'RECOVERY_PATH_USE_SEPARATE_NEXT_STEPS');
            const state=await inspect(m.fixture,ctx);p.assert(state.stage===3,'WRONG_CASE_REVISION');m.attempts.newer={phase:'dispatched',command:p.command(m.fixture,'newer',m.winner)};save(m,ctx);
            const result=await execute(m.fixture,'newer',m.winner,ctx);p.assert(result.outcome==='committed','NEWER_WRITE_FAILED');
            m.attempts.newer={phase:'done',result};save(m,ctx);report('PASS: authoritative newer state committed at revision 4. Left may refresh then release its held acknowledgement.');});},
        async refreshNewer(){return run(async ctx=>{const m=owned(ctx);p.assert(held&&!held.expired,'HELD_RESPONSE_REQUIRED');const state=await inspect(m.fixture,ctx);p.assert(state.stage===4,'NEWER_SERVER_STATE_REQUIRED');
            repo?.dispose();generation++;const current={owner:ctx.owner,generation};await cacheRead(m.fixture,state.metadata,current);
            m.verified.newer=true;save(m,current);report('PASS: confirmed revision 4; prior context disposed. Old acknowledgement remains held.');});},
        async releaseOld(){return run(async ctx=>{const m=owned(ctx),h=held;p.assert(h&&m.verified.newer&&!h.expired,'HELD_RESPONSE_REQUIRED');
            const before=cache.bind({scope:m.fixture.scope,contextId:'current',generation,isCurrent:()=>!disposed&&owner===ctx.owner}).read();
            clearTimeout(h.timer);h.release();await h.gate;let fenced=false;
            try{await h.session.exclusive(()=>{h.session.read();h.session.refresh(p.metadata(m.fixture,3,m.winner));});}catch(e){p.assert(e.code==='CACHE_CONTEXT_CHANGED','UNEXPECTED_LATE_CACHE_RESULT');fenced=true;}
            held=null;p.assert(fenced,'LATE_ACK_NOT_FENCED');const after=disk(m.fixture,ctx).read();p.assert(changes.equal(before,after)&&after.record.acknowledged.revision==='4','LATE_ACK_CHANGED_NEWER_CACHE');
            m.verified.fencing=true;save(m,ctx);report('PASS: held revision-3 acknowledgement fenced; revision-4 cache/state unchanged. SQL locking remains UNVERIFIED until independent-session evidence.');});},
        async finalState(){return run(async ctx=>{const m=owned(ctx),state=await inspect(m.fixture,ctx);p.assert(state.stage===4,'FINAL_REVISION_REQUIRED');
            await cacheRead(m.fixture,state.metadata,ctx);return {fixture:m.fixture,stage:state.stage,winner:state.winner,lockState:m.verified.locking?'PASS':'UNVERIFIED',cacheKey:cache.key(m.fixture.scope),markerKey};});},
        async inspectFixture(){return run(async ctx=>{const m=owned(ctx),state=await inspect(m.fixture,ctx);
            return {fixture:m.fixture,stage:state.stage,winner:state.winner,cacheKey:cache.key(m.fixture.scope),markerKey};});},
        async inspectConcurrentFixture(){return run(async ctx=>{const m=owned(ctx),state=await inspectConcurrent(m,ctx);
            return {fixture:m.fixture,plan:m.attempts.concurrentRecovery.plan,stage:state.stage,winner:state.winner,cacheKey:cache.key(m.fixture.scope),markerKey};});},
        async verifyLocking(input){return run(async ctx=>{const m=owned(ctx),state=await inspect(m.fixture,ctx);p.assert(state.stage===4,'FINAL_REVISION_REQUIRED');
            const evidence=cloudConcurrencyLockEvidence(typeof input==='string'?JSON.parse(input):input,m.fixture);
            m.verified.locking=evidence.state==='PASS';save(m,ctx);report(evidence.state+': SQL locking: '+evidence.reason);return evidence;});},
        async complete(){return run(async ctx=>{const m=owned(ctx),state=await inspect(m.fixture,ctx);p.assert(state.stage===4,'FINAL_REVISION_REQUIRED');
            p.assert(m.role==='left'&&m.verified.race&&(m.verified.identical||m.verified.identicalCommitted)&&m.verified.reuse&&m.verified.fencing,'BROWSER_PHASE_NOT_COMPLETE');
            if(!m.verified.identical){report('UNVERIFIED: the recovered single LEFT commit/replay does not prove concurrent identical operations. '+
                'Other checks may finish on this fixture, but Phase B cannot be COMPLETE.');return {status:'UNVERIFIED'};}
            if(!m.verified.locking){report('UNVERIFIED: browser concurrency/fencing passed; independent-session SQL locking not proved. Phase B is NOT fully complete.');return {status:'UNVERIFIED'};}
            report('COMPLETE: Phase B revision concurrency, idempotency, coherence and independent-session locking passed. Generate guarded cleanup, close both diagnostics, then run it manually.');return {status:'PASS'};});},
        dispose(){disposed=true;generation++;repo?.dispose();held?.old?.dispose();clearTimeout(held?.timer);held?.release();subscription();auth.dispose();gateway.dispose();}
    });
}
