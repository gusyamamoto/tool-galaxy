// Phase A only: fixed disposable data, real identity/privacy boundary, no app activation.
const cloudBoundaryFixtures=(()=>{
    const assert=cloudBoundaryAssert,contract=cosmifoldCloudContract,projection=cosmifoldCloudProjection;
    const names=Object.freeze({A1:'Boundary A1',A2:'Boundary A2',B1:'Boundary B1'});
    function validate(record){
        assert(record&&Object.hasOwn(names,record.label),'INVALID_BOUNDARY_FIXTURE');contract.scope(record);
        assert([0,1,2].includes(record.stage)&&(record.stage!==2||record.label==='A1'),'INVALID_BOUNDARY_STAGE');
        assert(Array.isArray(record.operations)&&record.operations.length===2,'INVALID_BOUNDARY_OPERATIONS');
        for(const id of [...record.operations,record.syntheticOperationId])contract.scope({ownerUserId:id,universeId:id});
        assert(new Set([...record.operations,record.syntheticOperationId]).size===3,'DUPLICATE_BOUNDARY_OPERATIONS');
        assert(Object.keys(record).every(key=>['label','ownerUserId','universeId','stage','operations','syntheticOperationId'].includes(key)),'INVALID_BOUNDARY_FIXTURE');
        return record;
    }
    function snapshot(record,stage=record.stage){validate(record);return {version:5,entries:stage?[{
        id:'boundary-shared-entry',name:names[record.label]+(stage===2?' verified':''),parentId:null}]:[],
        layout:[],connections:[],portals:[],constellations:[],archivedGalaxies:[]};}
    function metadata(record,stage=record.stage){return projection.toRelational(snapshot(record,stage),{...contract.scope(record),revision:String(stage)}).metadata;}
    function command(record,stage){
        assert(stage===1||stage===2,'INVALID_BOUNDARY_STAGE');
        const intended=metadata(record,stage);intended.universe.revision=String(stage-1);
        return contract.command({scope:contract.scope(record),operationId:record.operations[stage-1],baseRevision:String(stage-1),
            type:stage===1?'items.created':'items.renamed',payload:cosmifoldCloudChanges.between(metadata(record,stage-1),intended)});
    }
    function acknowledgement(record,stage){const c=command(record,stage);return {scope:c.scope,operationId:c.operationId,baseRevision:c.baseRevision,
        revision:String(stage),status:'committed',replayed:false,result:null};}
    return Object.freeze({names,validate,snapshot,metadata,command,acknowledgement});
})();

function createCloudBoundaryDiagnostic({auth=createAuthService(),gateway=createSupabaseMetadataGateway(),http=createCloudBoundaryHttp(),
    cache=createCloudCacheStore(),markers=()=>globalThis.sessionStorage,location=globalThis.location,randomUUID=()=>crypto.randomUUID(),
    report=()=>{},onFixtures=()=>{},holdTimeoutMs=180000}={}){
    const assert=cloudBoundaryAssert,fixtures=cloudBoundaryFixtures,contract=cosmifoldCloudContract,changes=cosmifoldCloudChanges;
    const markerKey='cosmifold:dev:cloud-boundary:v1';let busy=false,disposed=false,workspace,held=null,contextCounter=0,accountEvidence=null;
    function marker(){
        const raw=markers().getItem(markerKey);if(raw===null)return {version:1,records:[]};
        let value;try{value=JSON.parse(raw);}catch{assert(false,'INVALID_BOUNDARY_MARKER');}
        assert(value.version===1&&Array.isArray(value.records)&&value.records.length<=3&&Object.keys(value).length===2,'INVALID_BOUNDARY_MARKER');
        value.records.forEach(fixtures.validate);assert(new Set(value.records.map(r=>r.label)).size===value.records.length,'INVALID_BOUNDARY_MARKER');
        assert(new Set(value.records.map(r=>r.universeId)).size===value.records.length,'INVALID_BOUNDARY_MARKER');
        const a=value.records.find(r=>r.label==='A1'),a2=value.records.find(r=>r.label==='A2'),b=value.records.find(r=>r.label==='B1');
        assert((!a2||a&&a2.ownerUserId===a.ownerUserId)&&(!b||a&&b.ownerUserId!==a.ownerUserId),'INVALID_BOUNDARY_OWNER');return value;
    }
    function save(value){markers().setItem(markerKey,JSON.stringify(value));onFixtures(value.records.map(r=>({...r,cacheKey:cache.key(r)})));}
    async function actor(){cloudBoundaryLoopback(location);assert(!disposed,'DIAGNOSTIC_DISPOSED');await auth.initialize();
        const id=auth.getState().user?.id;assert(id,'SIGN_IN_LOCALLY_FIRST');contract.scope({ownerUserId:id,universeId:id});return id;}
    async function run(action){cloudBoundaryLoopback(location);assert(!busy&&!disposed,'DIAGNOSTIC_BUSY');busy=true;
        try{return await action(await actor());}finally{busy=false;}}
    function session(record){return cache.bind({scope:record,contextId:'boundary-inspection-'+(++contextCounter),generation:1,
        isCurrent:()=>!disposed&&auth.getState().user?.id===record.ownerUserId});}
    function disk(record){const value=session(record).read();assert(value.status==='valid','BOUNDARY_CACHE_MISSING');return value.record;}
    function expected(record,value){assert(value.status==='found'&&changes.equal(value.metadata,fixtures.metadata(record)),'BOUNDARY_SERVER_STATE_CHANGED');}
    function blocked(prior){let rejected=false;try{prior.load();}catch{rejected=true;}assert(rejected,'PRIOR_CONTEXT_READABLE');}
    function ensureWorkspace(){
        if(workspace)return workspace;
        const delayed={...gateway,async readUniverse(scope){const result=await gateway.readUniverse(scope);
            if(held&&!held.captured&&changes.equal(scope,held.scope)){held.captured=true;held.ready();await held.gate;}return result;}};
        workspace=createCloudWorkspace({auth,gateway:delayed,cache,requestTimeoutMs:holdTimeoutMs});return workspace;
    }
    async function open(record){const result=await ensureWorkspace().bootstrap(record.universeId);
        assert(result.status==='loaded'&&result.source==='server'&&result.revision===String(record.stage)&&result.canMutate,'BOUNDARY_BOOTSTRAP_FAILED');
        assert(changes.equal(workspace.load(),fixtures.snapshot(record)),'BOUNDARY_CONTEXT_WRONG_DATA');return workspace.repository();}
    async function seed(value,label,ownerUserId){
        let record=value.records.find(r=>r.label===label);
        if(!record){record={label,ownerUserId,universeId:randomUUID(),stage:0,operations:[randomUUID(),randomUUID()],syntheticOperationId:randomUUID()};
            fixtures.validate(record);value.records.push(record);save(value);}
        assert(record.ownerUserId===ownerUserId,'WRONG_TEST_ACCOUNT');
        if(record.stage===0){const metadata=await gateway.createUniverse(record.universeId);
            assert(changes.equal(metadata,fixtures.metadata(record,0)),'BOUNDARY_DESTINATION_NOT_EMPTY');
            const command=fixtures.command(record,1),ack=await gateway.commitMetadata(command);contract.acknowledgement(ack,command);
            record.stage=1;save(value);}
        expected(record,await gateway.readUniverse(record));
        const receipt=await gateway.getOperationReceipt(record,record.operations[record.stage-1]);
        assert(receipt.status==='found','BOUNDARY_RECEIPT_MISSING');contract.acknowledgement(receipt.acknowledgement,fixtures.command(record,record.stage));return record;
    }
    async function hold(record){
        assert(!held,'HELD_RESPONSE_ALREADY_EXISTS');let ready,release;
        const received=new Promise(resolve=>ready=resolve),gate=new Promise(resolve=>release=resolve);
        const next={scope:contract.scope(record),captured:false,ready,gate,release};held=next;
        next.timer=setTimeout(()=>{next.expired=true;release();},holdTimeoutMs);
        next.opening=ensureWorkspace().bootstrap(record.universeId);next.opening.catch(()=>{});
        const captured=await Promise.race([received.then(()=>true),next.opening.then(()=>false)]);
        assert(captured,'HELD_RESPONSE_NOT_CAPTURED');return next;
    }
    async function release(next){clearTimeout(next.timer);next.release();const result=await next.opening;
        if(held===next)held=null;assert(!next.expired&&result.status==='disposed','LATE_RESPONSE_NOT_FENCED');}
    async function stageSynthetic(record){
        const inspection=session(record);await inspection.exclusive(()=>{
            const old=inspection.read();assert(old.status==='valid'&&!old.record.pending,'UNEXPECTED_PENDING_STATE');
            const base=fixtures.metadata(record),intended=fixtures.snapshot(record);intended.entries[0].name='Boundary never-dispatched draft';
            const prepared=cosmifoldCloudProjection.toRelational(intended,{...contract.scope(record),revision:String(record.stage)});
            const command=contract.command({scope:contract.scope(record),operationId:record.syntheticOperationId,baseRevision:String(record.stage),type:'items.renamed',
                payload:changes.between(base,prepared.metadata)});
            inspection.prepare({base,prepared,command,intent:{type:command.type,ids:['boundary-shared-entry']}});
        });
        report(`Synthetic ${record.label} pending marker staged locally; its command is NEVER sent. This tests scope isolation, not network recovery.`);
    }
    async function removeSynthetic(record){
        const inspection=session(record);await inspection.exclusive(()=>{const old=inspection.read();
            assert(old.status==='valid'&&old.record.pending?.command.operationId===record.syntheticOperationId,'UNEXPECTED_PENDING_STATE');
            inspection.reject(old.record.pending.command);});
    }
    async function foreign(record,ownerUserId){
        assert(ownerUserId!==record.ownerUserId,'FOREIGN_OWNER_REQUIRED');
        const list=await http.rpc('cosmifold_list_universes',{});
        assert(list.status===200&&Array.isArray(list.body)&&list.body.every(row=>row.owner_id===ownerUserId)&&!list.body.some(row=>row.id===record.universeId),'FOREIGN_UNIVERSE_LISTED');
        // Both honest foreign owner and forged own-owner + foreign Universe paths go over real HTTP.
        for(const scope of [contract.scope(record),{ownerUserId,universeId:record.universeId}]){
            const honest=scope.ownerUserId===record.ownerUserId;
            const read=await http.rpc('cosmifold_read_universe',{p_scope:scope});
            if(honest)http.denied(read);else assert(read.status===200&&changes.equal(read.body,{status:'absent',metadata:null}),'FOREIGN_READ_NOT_HIDDEN');
            const receipt=await http.rpc('cosmifold_operation_receipt',{p_scope:scope,p_operation_id:record.operations[0]});
            if(honest)http.denied(receipt);else assert(receipt.status===200&&changes.equal(receipt.body,{status:'absent',acknowledgement:null}),'FOREIGN_RECEIPT_NOT_HIDDEN');
            const command={...fixtures.command(record,1),scope,operationId:randomUUID(),baseRevision:String(record.stage)};
            const commit=await http.rpc('cosmifold_commit_metadata',{p_command:command});
            if(honest)http.denied(commit);else assert(commit.status===400&&commit.body?.code==='CM007','FOREIGN_MUTATION_NOT_REJECTED');
        }
        http.denied(await http.rpc('cosmifold_create_universe',{p_universe_id:record.universeId}));
        report('PASS: foreign list/read/receipt/commit/create rejected or concealed by the server, including forged owner scope.');
    }
    return Object.freeze({
        markerKey,
        async prepareA(){return run(async ownerUserId=>{
            const value=marker();assert(!value.records.length||value.records.find(r=>r.label==='A1')?.ownerUserId===ownerUserId,'USE_ORIGINAL_ACCOUNT_A');
            const existingA1=value.records.find(r=>r.label==='A1'),existingA2=value.records.find(r=>r.label==='A2');
            assert(!(existingA1?.stage===2&&existingA2?.stage===1),'A_FIXTURES_ALREADY_PREPARED');
            const a1=await seed(value,'A1',ownerUserId),a2=await seed(value,'A2',ownerUserId);
            if(a1.stage===1){const ack=await gateway.commitMetadata(fixtures.command(a1,2));contract.acknowledgement(ack,fixtures.command(a1,2));a1.stage=2;save(value);}
            const prior=await open(a1);assert(disk(a1).acknowledged.revision==='2'&&a2.stage===1,'REVISIONS_NOT_INDEPENDENT');
            const before=disk(a1),next=await hold(a1);await open(a2);blocked(prior);const a2Before=disk(a2);await release(next);
            assert(changes.equal(before,disk(a1))&&changes.equal(a2Before,disk(a2)),'LATE_UNIVERSE_RESPONSE_WROTE_CACHE');
            await open(a1);await stageSynthetic(a1);const pending=disk(a1).pending;
            await open(a2);assert(changes.equal(disk(a1).pending,pending)&&disk(a2).pending===null,'A1_PENDING_CONTAMINATED_A2');
            await removeSynthetic(a1);await open(a1);
            report('PASS: A1/A2 have identical textual entry IDs but distinct state, revisions and cache keys; late A1 is fenced, A1 pending does not block A2, switching back validates only A1.');
            return {status:'a-prepared',records:value.records};
        });},
        async verifyExistingA(){return run(async ownerUserId=>{
            assert(!held,'HELD_RESPONSE_ALREADY_EXISTS');
            const raw=markers().getItem(markerKey),value=marker(),a1=value.records.find(r=>r.label==='A1'),a2=value.records.find(r=>r.label==='A2');
            assert(value.records.length===2&&a1?.stage===2&&a2?.stage===1,'BOUNDARY_RECOVERY_STAGE_MISMATCH');
            assert(a1.ownerUserId===ownerUserId&&a2.ownerUserId===ownerUserId,'USE_ORIGINAL_ACCOUNT_A');
            for(const record of [a1,a2]){
                expected(record,await gateway.readUniverse(record));
                for(let stage=1;stage<=record.stage;stage++){
                    const receipt=await gateway.getOperationReceipt(record,record.operations[stage-1]);
                    assert(receipt.status==='found'&&/^[a-f0-9]{64}$/.test(receipt.request_digest)&&
                        changes.equal(receipt.acknowledgement,{...fixtures.acknowledgement(record,stage),replayed:true}),'BOUNDARY_RECEIPT_CHANGED');
                }
                // Inspect only. Do not bootstrap, reconcile, refresh caches or clear pending markers.
                const reading=session(record).read();
                assert(reading.status==='valid','BOUNDARY_CACHE_REVIEW_REQUIRED');
                assert(reading.record.pending===null,'BOUNDARY_PENDING_REVIEW_REQUIRED');
                assert(changes.equal(reading.record.acknowledged,{snapshot:fixtures.snapshot(record),revision:String(record.stage)}),'BOUNDARY_CACHE_REVIEW_REQUIRED');
            }
            assert(markers().getItem(markerKey)===raw,'BOUNDARY_MARKER_CHANGED');
            assert(await actor()===ownerUserId,'SESSION_CHANGED');
            report('PASS: existing A1 revision 2 and A2 revision 1, exact metadata/receipts and acknowledged caches verified read-only. No pending marker was cleared; no fixture or cache was changed. Reapply fresh audits and run button 2 only.');
            return {status:'existing-a-verified',records:value.records};
        });},
        async privacy(){return run(async ownerUserId=>{
            const value=marker(),record=value.records.find(r=>r.ownerUserId===ownerUserId);assert(record&&record.stage>0,'PREPARE_CURRENT_TEST_ACCOUNT_FIRST');
            expected(record,await gateway.readUniverse(record));
            const listed=await gateway.listOwnedUniverses();assert(listed.some(row=>row.id===record.universeId)&&listed.every(row=>row.owner_id===ownerUserId),'OWN_UNIVERSE_NOT_LISTED');
            assert(changes.equal(await gateway.createUniverse(record.universeId),fixtures.metadata(record)),'IDEMPOTENT_CREATE_CHANGED_FIXTURE');
            for(const anonymous of [true,false]){await http.privateRest(anonymous,record.universeId);
                report('PASS: '+(anonymous?'anonymous':'authenticated')+' GET/POST/PATCH/DELETE reject all six private tables; public aliases absent.');}
            const surface=await http.publicSurface(record);
            report(`PASS: exactly five approved public RPCs verified (${surface.inventorySource}); each is reachable and private helpers are HTTP-excluded. OpenAPI HTTP ${surface.openapiHttpStatus}.`);
            const params={cosmifold_list_universes:{},cosmifold_create_universe:{p_universe_id:record.universeId},cosmifold_read_universe:{p_scope:contract.scope(record)},
                cosmifold_commit_metadata:{p_command:fixtures.command(record,1)},cosmifold_operation_receipt:{p_scope:contract.scope(record),p_operation_id:record.operations[0]}};
            for(const name of cloudBoundarySurface.rpcs)http.denied(await http.rpc(name,params[name],{anonymous:true}));
            report('PASS: anonymous access to all five approved RPCs is rejected. Authenticated fixture creation/commit/read/list/receipt exercise their real boundary.');
            const anonymous=await http.graphql(true,record),authenticated=await http.graphql(false,record);
            assert((anonymous.state==='disabled-independently-verified')===(authenticated.state==='disabled-independently-verified'),'GRAPHQL_DISABLED_CALLER_STATE_INCONSISTENT');
            report(`GraphQL observed: anonymous ${anonymous.state}; authenticated ${authenticated.state}.`);
            expected(record,await gateway.readUniverse(record));
            report(authenticated.state==='disabled-independently-verified'?'PASS: GraphQL disabled, independently verified by fresh catalog plus negative HTTP/schema-qualified probes for both caller classes.':
                authenticated.state==='endpoint-unavailable'?'REVIEW: GraphQL HTTP 404 observed, not proof the extension is disabled. Verify the intended dashboard configuration; introspection was unavailable.':
                'PASS: inspected GraphQL schema, read/mutation probes and schema-qualified node probes exclude private data.');
            return {status:'privacy-checked',graphql:{anonymous,authenticated}};
        });},
        acceptSurfaceAudit:input=>http.acceptSurfaceAudit(input),
        acceptGraphqlAudit:input=>http.acceptGraphqlAudit(input),
        acceptGraphqlHelperAudit:input=>http.acceptGraphqlHelperAudit(input),
        async armAccountSwitch(){return run(async ownerUserId=>{
            const records=marker().records,record=records.find(r=>r.label==='A1'),pendingRecord=records.find(r=>r.label==='A2');
            assert(record?.ownerUserId===ownerUserId&&record.stage===2&&pendingRecord,'PREPARE_ACCOUNT_A_FIRST');
            // A2 pending state and the held A1 read use different cache locks.
            await open(pendingRecord);await stageSynthetic(pendingRecord);const pending=disk(pendingRecord).pending;
            const prior=await open(record),next=await hold(record);next.before=disk(record);next.prior=prior;
            next.generation=workspace.getState().generation;next.pendingBefore=pending;
            report('ARMED: a real A1 response is held for at most 3 minutes. In the normal local app tab, sign out A and sign in B, then press Check account B here. Do not reload this diagnostic.');
            return {status:'account-switch-armed'};
        });},
        async checkB(){return run(async ownerUserId=>{
            const value=marker(),a1=value.records.find(r=>r.label==='A1'),a2=value.records.find(r=>r.label==='A2');
            assert(a1&&a2&&ownerUserId!==a1.ownerUserId,'SIGN_IN_AS_DIFFERENT_ACCOUNT_B');
            assert(held&&held.scope.ownerUserId===a1.ownerUserId&&!held.expired,'ARM_ACCOUNT_SWITCH_FIRST');
            blocked(held.prior);assert(workspace.getState().source===null&&workspace.getState().generation>held.generation,'A_CACHE_VISIBLE_AFTER_ACCOUNT_CHANGE');
            // Owner-A cache must not act as a fallback under B, even for the same Universe UUID.
            const absent=await workspace.bootstrap(a1.universeId);assert(absent.status==='universe-absent'&&absent.source===null,'FOREIGN_CACHE_USED_AS_B');
            const b=await seed(value,'B1',ownerUserId);await open(b);const before=disk(b),next=held;await release(next);
            assert(changes.equal(before,disk(b))&&changes.equal(workspace.load(),fixtures.snapshot(b)),'LATE_A_RESPONSE_PUBLISHED_IN_B');
            accountEvidence={a1Before:next.before,pendingBefore:next.pendingBefore};
            // Cannot inspect A through owner-fenced cache APIs while B is signed in; compare after returning to A.
            await foreign(a1,ownerUserId);await foreign(a2,ownerUserId);
            expected(b,await gateway.readUniverse(b));report('PASS: B cannot access A1/A2; A cache/pending state does not block B and late A cannot publish or write B cache.');
            return {status:'b-checked'};
        });},
        async finishA(){return run(async ownerUserId=>{
            const value=marker(),a1=value.records.find(r=>r.label==='A1'),a2=value.records.find(r=>r.label==='A2'),b=value.records.find(r=>r.label==='B1');
            assert(a1&&a2&&b&&ownerUserId===a1.ownerUserId,'SIGN_BACK_IN_AS_ACCOUNT_A');assert(!held,'FINISH_ACCOUNT_B_FIRST');
            assert(accountEvidence&&changes.equal(disk(a1),accountEvidence.a1Before)&&changes.equal(disk(a2).pending,accountEvidence.pendingBefore),'A_CACHE_CHANGED_BY_LATE_RESPONSE');
            await foreign(b,ownerUserId);
            const pending=disk(a2).pending;assert(pending?.command.operationId===a2.syntheticOperationId,'A_PENDING_NOT_PRESERVED');
            const outcome=await ensureWorkspace().bootstrap(a2.universeId);
            assert(outcome.status==='pending-reconciliation'&&outcome.canMutate===false,'A_PENDING_NOT_SCOPED_OR_BLOCKED');
            // This one marker is known never dispatched, unlike an actual uncertain operation.
            const receipt=await gateway.getOperationReceipt(a2,a2.syntheticOperationId);assert(receipt.status==='missing','SYNTHETIC_COMMAND_WAS_SENT');
            await removeSynthetic(a2);await open(a1);await open(a2);await open(a1);
            expected(a1,await gateway.readUniverse(a1));expected(a2,await gateway.readUniverse(a2));
            report('PASS: A cannot access B; signing back into A preserves its pending identity and reopens only after validation. All three disposable server fixtures remain exact.');
            report('COMPLETE: identity/Universe phase checks passed. Run/review guarded cleanup, then remove only printed diagnostic/cache keys. Network loss and concurrency were not tested.');
            return {status:'identity-checked',records:value.records};
        });},
        fixtures(){const value=marker();onFixtures(value.records.map(r=>({...r,cacheKey:cache.key(r)})));return value.records;},
        dispose(){disposed=true;clearTimeout(held?.timer);held?.release();workspace?.dispose();auth.dispose();gateway.dispose();http.dispose();}
    });
}
