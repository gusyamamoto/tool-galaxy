// Explicit loopback diagnostic only. Never registered in normal application startup.
function createCloudRecoveryDiagnostic({auth=createAuthService(),gateway=createSupabaseMetadataGateway(),cache=createCloudCacheStore(),
    storage=()=>localStorage,locks=()=>navigator.locks,location=globalThis.location,randomUUID=()=>crypto.randomUUID(),report=()=>{},requestTimeoutMs=15000,
    isOffline=()=>globalThis.navigator?.onLine===false}={}){
    const p=cloudRecoveryPlan,c=cosmifoldCloudContract,changes=cosmifoldCloudChanges;
    const markerKey='cosmifold:dev:cloud-recovery:v1';let workspace,busy=false,disposed=false,allowReceipts=false,epoch=0;
    let owner=auth.getState().user?.id||null,commitCalls=0,receiptCalls=0,transportFailure=null;
    const unsubscribe=auth.subscribe(state=>{const next=state.user?.id||null;if(next!==owner){owner=next;epoch++;workspace?.close();}});
    const rawGateway=gateway;gateway={...rawGateway};
    for(const method of ['createUniverse','readUniverse','commitMetadata','getOperationReceipt'])gateway[method]=(...args)=>{
        const ctx={owner,epoch},write=['createUniverse','commitMetadata'].includes(method);
        return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Object.assign(new Error('Bounded diagnostic request timeout'),{
            code:write?'OUTCOME_UNKNOWN':'NETWORK_UNAVAILABLE',outcome:write?'unknown':'not-committed',requiresReconciliation:write})),requestTimeoutMs);
            Promise.resolve().then(()=>{guard(ctx);return rawGateway[method](...args);}).then(value=>{clearTimeout(timer);
                try{guard(ctx);resolve(value);}catch(error){reject(error);}},error=>{clearTimeout(timer);reject(error);});
        });
    };
    function local(){p.assert(['http:','https:'].includes(location.protocol)&&['127.0.0.1','localhost','[::1]'].includes(location.hostname),'LOOPBACK_ONLY');}
    function readMarker(){const text=storage().getItem(markerKey);return text===null?null:p.marker(JSON.parse(text));}
    function guard(ctx){p.assert(!disposed&&ctx.owner===auth.getState().user?.id&&ctx.epoch===epoch,'ACCOUNT_CONTEXT_CHANGED');}
    async function actor(){local();p.assert(!disposed,'DIAGNOSTIC_DISPOSED');await auth.initialize();const id=auth.getState().user?.id;
        p.assert(id,'SIGN_IN_AT_THIS_ORIGIN_FIRST');return {owner:id,epoch};}
    function owned(ctx){const m=readMarker();p.assert(m&&m.scope.ownerUserId===ctx.owner,'ORIGINAL_PHASE_C_OWNER_REQUIRED');return m;}
    async function run(action){p.assert(!busy&&!disposed,'DIAGNOSTIC_BUSY');busy=true;try{return await action(await actor());}finally{busy=false;}}
    async function control(ctx,action){p.assert(locks()?.request,'WEB_LOCKS_REQUIRED');return locks().request(markerKey,{mode:'exclusive',ifAvailable:true},async lock=>{
        p.assert(lock,'DIAGNOSTIC_CONTROL_BUSY');guard(ctx);return action();});}
    function save(m,ctx){guard(ctx);storage().setItem(markerKey,JSON.stringify(p.marker(m)));}
    function reading(m,ctx){guard(ctx);return cache.bind({scope:m.scope,contextId:'phase-c-inspect',generation:ctx.epoch+1,
        isCurrent:()=>!disposed&&owner===ctx.owner&&epoch===ctx.epoch}).read();}
    function checkedCache(m,ctx){const value=reading(m,ctx);p.assert(value.status==='valid'&&value.record.acknowledged,'VALID_PHASE_C_CACHE_REQUIRED');
        const r=value.record.acknowledged;p.assert(['0','1'].includes(r.revision)&&changes.equal(r.snapshot,p.snapshot(m,r.revision)),'PHASE_C_CACHE_CHANGED');
        if(value.record.pending)p.assert(changes.equal(value.record.pending.command,p.command(m))&&
            changes.equal(value.record.pending.intendedSnapshot,p.snapshot(m,'1')),'PHASE_C_PENDING_CHANGED');
        return value.record;}
    function unknown(reason){return Object.assign(new Error('Deliberate Phase C transport injection'),{code:'OUTCOME_UNKNOWN',reason,outcome:'unknown',requiresReconciliation:true});}
    function makeWorkspace(m){workspace?.dispose();const wrapped={...gateway,
        async commitMetadata(command){p.assert(changes.equal(command,p.command(m)),'PHASE_C_COMMAND_CHANGED');
            const pending=readMarker();p.assert(pending?.phase==='dispatched'&&pending.operationId===command.operationId,'NO_UNREVIEWED_DISPATCH');
            const record=reading(m,{owner,epoch});p.assert(record.status==='valid'&&record.record.pending?.command.operationId===m.operationId&&record.record.acknowledged.revision==='0','JOURNAL_MUST_PRECEDE_DISPATCH');
            p.assert(++commitCalls===1,'NO_MUTATION_RETRY');
            if(m.case==='not-dispatched')throw unknown('HARNESS_BLOCKED_BEFORE_HTTP');
            if(m.case==='browser-offline'){
                p.assert(isOffline(),'BROWSER_OFFLINE_REQUIRED');
                try{return await gateway.commitMetadata(command);}catch(error){
                    if(error.code==='OUTCOME_UNKNOWN'&&error.outcome==='unknown'&&['TRANSPORT_FAILURE','UNCLASSIFIED_RPC_FAILURE'].includes(error.reason))
                        transportFailure={attempts:commitCalls,observedOffline:true,code:error.code,reason:error.reason,outcome:error.outcome};
                    throw error;
                }
            }
            const ack=await gateway.commitMetadata(command);c.acknowledgement(ack,command);
            // Intentionally discard even a successful real reply. No ACK enters the cache.
            throw unknown('HARNESS_DROPPED_SUCCESSFUL_REPLY');
        },async getOperationReceipt(scope,id){p.assert(changes.equal(scope,m.scope)&&id===m.operationId,'ORIGINAL_OPERATION_REQUIRED');receiptCalls++;
            if(!allowReceipts&&m.case!=='browser-offline')throw Object.assign(new Error('Harness receipt outage'),{code:'NETWORK_UNAVAILABLE',outcome:'not-committed'});
            const receipt=await gateway.getOperationReceipt(scope,id);
            if(receipt.status==='found')p.assert(changes.equal(receipt.acknowledgement,p.ack(m))&&/^[a-f0-9]{64}$/.test(receipt.request_digest),'PHASE_C_RECEIPT_CHANGED');return receipt;}};
        workspace=createCloudWorkspace({auth,gateway:wrapped,cache,requestTimeoutMs,contextId:'phase-c-'+randomUUID(),
            newOperationId:()=>m.operationId});return workspace;}
    async function inspectServer(m,ctx){const state=await gateway.readUniverse(m.scope);guard(ctx);p.assert(state.status==='found','PHASE_C_FIXTURE_ABSENT');
        const revision=state.metadata.universe.revision;p.assert(['0','1'].includes(revision)&&changes.equal(state.metadata,p.metadata(m,revision)),'PHASE_C_SERVER_CHANGED');
        const receipt=await gateway.getOperationReceipt(m.scope,m.operationId);guard(ctx);
        p.assert(revision==='0'?receipt.status==='missing':receipt.status==='found'&&changes.equal(receipt.acknowledgement,p.ack(m))&&/^[a-f0-9]{64}$/.test(receipt.request_digest),'PHASE_C_RECEIPT_CHANGED');
        return {revision,receipt};}
    return Object.freeze({markerKey,
        identity(){local();const m=readMarker();return m?{...m,cacheKey:cache.key(m.scope)}:null;},
        async prepare(testCase){return run(ctx=>control(ctx,async()=>{p.assert(!readMarker(),'PHASE_C_FIXTURE_ALREADY_EXISTS');
            const m=p.marker({format:'cosmifold-phase-c',fixtureVersion:1,scope:{ownerUserId:ctx.owner,universeId:randomUUID()},operationId:randomUUID(),case:testCase,phase:'allocated'});
            save(m,ctx);const metadata=await gateway.createUniverse(m.scope.universeId);guard(ctx);
            p.assert(changes.equal(metadata,p.metadata(m,'0')),'NEW_FIXTURE_NOT_EMPTY');
            allowReceipts=false;const state=await makeWorkspace(m).bootstrap(m.scope.universeId);guard(ctx);p.assert(state.status==='loaded'&&state.revision==='0'&&state.canMutate,'PREPARATION_NOT_DURABLE');
            m.phase='prepared';save(m,ctx);report('PREPARED: one new disposable empty Universe at revision 0. No local Cosmos read or uploaded.');return this.identity();}));},
        async armBrowserOffline(){return run(ctx=>control(ctx,async()=>{const m=owned(ctx);p.assert(m.case==='browser-offline'&&m.phase==='prepared'&&workspace?.getState().canMutate&&!isOffline(),'ONLINE_PREFLIGHT_REQUIRED');
            const server=await inspectServer(m,ctx),record=checkedCache(m,ctx);p.assert(server.revision==='0'&&record.acknowledged.revision==='0'&&record.pending===null,'NETWORK_PREFLIGHT_CHANGED');
            m.phase='network-ready';save(m,ctx);report('ARMED: online fixture/cache/receipt preflight passed. No mutation sent. Set this tab to DevTools Offline, then dispatch ONCE; no timing deadline.');}));},
        async dispatchOnce(){return run(ctx=>control(ctx,async()=>{const m=owned(ctx),network=m.case==='browser-offline';p.assert(m.phase===(network?'network-ready':'prepared')&&workspace?.getState().canMutate,'PREPARE_FIRST_NO_RETRY');
            if(network)p.assert(isOffline(),'BROWSER_OFFLINE_REQUIRED');
            else{const before=await inspectServer(m,ctx);p.assert(before.revision==='0','DISPATCH_REQUIRES_EMPTY_FIXTURE');}
            allowReceipts=false;m.phase='dispatched';save(m,ctx);let error;
            try{await workspace.repository().save(p.snapshot(m,'1'),{type:'items.created'});}catch(value){error=value;}
            guard(ctx);p.assert(error&&workspace.getState().status==='pending-reconciliation','UNCERTAINTY_NOT_PRESERVED');
            const record=checkedCache(m,ctx);p.assert(record.pending?.command.operationId===m.operationId&&record.acknowledged.revision==='0','ORIGINAL_PENDING_ID_NOT_DURABLE');
            m.phase='uncertain';if(network){p.assert(transportFailure?.attempts===1,'REAL_TRANSPORT_FAILURE_NOT_PROVED');m.transport=transportFailure;}
            save(m,ctx);if(network){report('PASS: actual gateway transport failure while browser offline; original pending ID/cache revision 0 retained. No synthetic receipt outage or successful-reply discard. Check blocked recovery before reconnecting; do not reload offline.');
                return {status:'pending-reconciliation',operationId:m.operationId};}
            report('PASS: original operation journal persisted at acknowledged revision 0; dependent writes blocked. '+
                (m.case==='lost-reply'?'Harness discarded the real commit reply.':'Harness blocked HTTP dispatch; this is not evidence of an actual network drop.')+' Reload this SAME tab next.');return {status:'pending-reconciliation',operationId:m.operationId};}));},
        async reopenBlocked(){return run(async ctx=>{const m=owned(ctx);p.assert(['dispatched','uncertain'].includes(m.phase),'UNCERTAIN_FIXTURE_REQUIRED');
            p.assert(m.case!=='browser-offline','USE_NETWORK_REOPEN');
            const before=checkedCache(m,ctx);p.assert(before.pending?.command.operationId===m.operationId,'PENDING_ALREADY_RESOLVED');allowReceipts=false;
            const state=await makeWorkspace(m).bootstrap(m.scope.universeId);guard(ctx);
            p.assert(state.status==='pending-reconciliation'&&!state.canMutate&&state.pendingOperationId===m.operationId&&changes.equal(before,checkedCache(m,ctx)),'RELOAD_DID_NOT_PRESERVE_PENDING');
            report('PASS: reload/reopen kept the same original operation ID and exact cache while receipt access is harness-unavailable. No command resent.');return state;});},
        async checkBrowserOffline(){return run(async ctx=>{const m=owned(ctx);p.assert(m.case==='browser-offline'&&m.transport&&isOffline()&&workspace?.getState().status==='pending-reconciliation','OFFLINE_PENDING_CONTEXT_REQUIRED');
            const before=checkedCache(m,ctx),calls=commitCalls;const result=await workspace.reconcile();guard(ctx);
            p.assert(result.status==='pending-reconciliation'&&!result.canMutate&&result.error?.reason==='RECEIPT_UNAVAILABLE_OR_INVALID'&&
                calls===commitCalls&&changes.equal(before,checkedCache(m,ctx)),'OFFLINE_RECOVERY_NOT_BLOCKED');
            report('PASS: real offline receipt transport is unavailable; exact journal/cache retained and dependent writes blocked. Restore No throttling, then reload this SAME tab and reopen network recovery.');});},
        async reopenBrowserNetwork(){return run(async ctx=>{const m=owned(ctx);p.assert(m.case==='browser-offline'&&m.phase==='uncertain'&&m.transport&&!isOffline(),'RECONNECT_WITH_ORIGINAL_PROOF_REQUIRED');
            const before=checkedCache(m,ctx),calls=commitCalls;allowReceipts=true;const result=await makeWorkspace(m).bootstrap(m.scope.universeId);guard(ctx);
            const after=checkedCache(m,ctx),server=await inspectServer(m,ctx);
            p.assert(commitCalls===calls,'RECONNECT_RESENT_COMMAND');
            if(server.revision==='0'){
                p.assert(result.status==='pending-reconciliation'&&!result.canMutate&&result.pendingOperationId===m.operationId&&result.error?.reason==='RECEIPT_MISSING'&&
                    changes.equal(before,after)&&after.pending?.command.operationId===m.operationId,'MISSING_RECONNECT_NOT_BLOCKED');
                report('PASS: reconnected real missing receipt at revision 0; original operation remains blocked with exact cache, no resend or replacement ID. Stop; cleanup requires separate review.');
            }else{
                p.assert(result.status==='loaded'&&result.revision==='1'&&after.pending===null&&after.acknowledged.revision==='1','FOUND_RECONNECT_NOT_ACKNOWLEDGED');
                report('PASS: reconnected real original receipt proved revision 1; acknowledgement durable, no command resent. This outcome must be reviewed with transport evidence; no arbitrary in-flight-loss claim.');
            }return result;});},
        async checkBlocked(){return run(async ctx=>{const m=owned(ctx),before=checkedCache(m,ctx),calls=commitCalls;p.assert(workspace?.getState().status==='pending-reconciliation','BLOCKED_CONTEXT_REQUIRED');
            let blocked=false;try{await workspace.repository().save(p.snapshot(m,'1'),{type:'items.created'});}catch(error){blocked=error.code==='PENDING_RECONCILIATION_REQUIRED';}
            guard(ctx);p.assert(blocked&&calls===commitCalls&&changes.equal(before,checkedCache(m,ctx)),'DEPENDENT_MUTATION_NOT_BLOCKED');
            report('PASS: dependent write rejected before command generation/dispatch; original ID/cache retained.');});},
        async recoverRealReceipt(){return run(async ctx=>{const m=owned(ctx);p.assert(workspace?.getState().status==='pending-reconciliation','REOPEN_BLOCKED_FIRST');
            p.assert(m.case!=='browser-offline','USE_NETWORK_REOPEN');
            allowReceipts=true;const state=await workspace.reconcile();guard(ctx);const record=checkedCache(m,ctx);
            if(m.case==='not-dispatched'){
                const server=await inspectServer(m,ctx);p.assert(server.revision==='0'&&state.status==='pending-reconciliation'&&!state.canMutate&&
                    record.pending?.command.operationId===m.operationId&&record.acknowledged.revision==='0','MISSING_RECEIPT_NOT_BLOCKED');
                report('PASS: real missing receipt/empty server leaves original pending operation blocked. No retry or new ID. STOP; cleanup requires separate review.');
            }else{
                p.assert(state.status==='loaded'&&state.revision==='1'&&state.canMutate&&record.pending===null&&record.acknowledged.revision==='1','RECEIPT_RECOVERY_NOT_ACKNOWLEDGED');
                const server=await inspectServer(m,ctx);p.assert(server.revision==='1','RECEIPT_RECOVERY_NOT_ACKNOWLEDGED');
                report('PASS: real original receipt recovered revision 1; journal cleared only after durable acknowledgement. No semantic command resent.');
            }return state;});},
        async verifyAgain(){return run(async ctx=>{const m=owned(ctx);p.assert(m.case==='lost-reply'&&workspace?.getState().status==='loaded','RECOVER_FIRST');
            const server=await inspectServer(m,ctx),before=checkedCache(m,ctx),calls=commitCalls;
            await workspace.reconcile();guard(ctx);const after=checkedCache(m,ctx);
            p.assert(server.revision==='1'&&before.pending===null&&after.pending===null&&before.acknowledged.revision==='1'&&after.acknowledged.revision==='1'&&
                changes.equal(before.acknowledged,after.acknowledged)&&calls===commitCalls,'RECOVERY_APPLIED_TWICE');
            report('PASS: repeated recovery keeps the same revision/state with no second semantic application or mutation call. This is a bounded transport-injection test, not blanket network-loss proof.');});},
        async checkStalePeer(){return run(async ctx=>{const m=owned(ctx);p.assert(workspace?.getState().status==='pending-reconciliation','STALE_BLOCKED_PEER_REQUIRED');
            const before=checkedCache(m,ctx);p.assert(before.pending===null&&before.acknowledged.revision==='1','PEER_MUST_RECOVER_FIRST');
            const calls=receiptCalls,result=await workspace.reconcile();guard(ctx);
            p.assert(result.status==='pending-reconciliation'&&!result.canMutate&&result.error?.code==='CACHE_BASE_CHANGED'&&receiptCalls===calls&&
                changes.equal(before,checkedCache(m,ctx)),'STALE_PEER_PUBLISHED');
            report('PASS: stale same-origin recovery context rejected changed cache base before receipt/publication; peer revision-1 cache untouched. Reopen current acknowledged state explicitly.');});},
        async reopenAcknowledged(){return run(async ctx=>{const m=owned(ctx),before=checkedCache(m,ctx);p.assert(before.pending===null&&before.acknowledged.revision==='1','ACKNOWLEDGED_PEER_REQUIRED');
            const state=await makeWorkspace(m).bootstrap(m.scope.universeId);guard(ctx);p.assert(state.status==='loaded'&&state.revision==='1','ACKNOWLEDGED_REOPEN_FAILED');
            report('PASS: fresh same-origin context reopened only validated authoritative revision 1.');return state;});},
        async cleanupSQL(){return run(async ctx=>{const m=owned(ctx),server=await inspectServer(m,ctx);const record=reading(m,ctx);
            if(record.status==='valid')checkedCache(m,ctx);else p.assert(record.status==='missing','INVALID_CACHE_RETAIN_FOR_REVIEW');
            report('PREPARED: guarded cleanup SQL only. No SQL executed. Dispose ALL Phase C tabs before manual cleanup.');
            return cloudConcurrencyCleanupSQL({scope:m.scope,metadata:p.metadata(m,server.revision),receipts:server.revision==='0'?[]:[{command:p.command(m),ack:{...p.ack(m),replayed:false}}]})
                .replace(/^-- MANUAL PHASE-B CLEANUP\. Close both diagnostics first\./,'-- MANUAL PHASE-C CLEANUP. Dispose ALL Phase C diagnostics first.');});},
        dispose(){if(disposed)return;disposed=true;epoch++;workspace?.dispose();unsubscribe();}
    });
}
