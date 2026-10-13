// Explicit development test only. No local Cosmos reads, tokens or auto-start.
function createCloudCacheDiagnostic({auth=createAuthService(),gateway=createSupabaseMetadataGateway(),cache=createCloudCacheStore(),
    markers=()=>globalThis.sessionStorage,location=globalThis.location,randomUUID=()=>crypto.randomUUID(),report=()=>{},onIdentity=()=>{}}={}){
    const markerKey='cosmifold:dev:cloud-cache-diagnostic:v1',schema=cosmifoldCloudCacheFormat;
    let workspace,busy=false;
    function fail(code){throw Object.assign(new Error(code),{code});}
    function local(){if(!['http:','https:'].includes(location.protocol)||!['localhost','127.0.0.1','[::1]'].includes(location.hostname))fail('LOCAL_DEVELOPMENT_ONLY');}
    async function signedIn(){local();await auth.initialize();const user=auth.getState().user;
        if(!user)fail('SIGN_IN_LOCALLY_FIRST');return schema.scope({ownerUserId:user.id,universeId:user.id}).ownerUserId;}
    function marker(){
        const raw=markers().getItem(markerKey);if(raw===null)return null;
        try{const data=JSON.parse(raw);if(data.version!==1||data.revision!=='0'||Object.keys(data).some(key=>!['version','revision','ownerUserId','universeId'].includes(key)))fail('INVALID_TEST_MARKER');
            return {...schema.scope(data),version:1,revision:'0'};}catch{fail('INVALID_TEST_MARKER');}
    }
    function inspection(identity){return cache.bind({scope:identity,contextId:'diagnostic-inspection',generation:1,
        isCurrent:()=>auth.getState().user?.id===identity.ownerUserId});}
    return Object.freeze({
        async run(){
            local();if(busy)fail('DIAGNOSTIC_BUSY');busy=true;
            try{
                const ownerUserId=await signedIn();let saved=marker();
                if(saved&&saved.ownerUserId!==ownerUserId)fail('TEST_ACCOUNT_MISMATCH');
                if(!saved){
                    saved={version:1,...schema.scope({ownerUserId,universeId:randomUUID()}),revision:'0'};
                    markers().setItem(markerKey,JSON.stringify(saved));onIdentity({...saved,cacheKey:cache.key(saved)});
                    const created=await gateway.createUniverse(saved.universeId);
                    if(created.universe.owner_id!==ownerUserId||created.universe.revision!=='0'||
                        ['entries','constellations','constellation_members','linked_placements'].some(key=>created[key].length))fail('TEST_UNIVERSE_NOT_EMPTY');
                    report('PASS: explicitly created one disposable empty Universe at revision 0.');
                }else onIdentity({...saved,cacheKey:cache.key(saved)});
                const before=inspection(saved).read();
                workspace?.dispose();workspace=createCloudWorkspace({auth,gateway,cache});const outcome=await workspace.bootstrap(saved.universeId);
                if(outcome.status!=='loaded'||outcome.source!=='server'||outcome.revision!=='0'||!outcome.canMutate)fail('BOOTSTRAP_NOT_FRESH_AND_DURABLE');
                const record=inspection(saved).read();
                if(record.status!=='valid'||record.record.pending||record.record.acknowledged?.revision!=='0')fail('ACKNOWLEDGED_CACHE_MISSING');
                if(before.status==='valid'&&before.record.acknowledged)report('PASS: reopened the same scoped acknowledged cache; server refresh confirmed revision 0.');
                else report('PASS: fresh server bootstrap wrote the acknowledged user/Universe cache at revision 0.');
                report(`Cache namespace: ${cache.key(saved)}.`);
                report('PASS: only the disposable cloud Universe was read. No existing local Cosmos data was uploaded.');
                report('Reload this page, then press Run/reopen again. Next, use Check sign-out fencing.');
                return {status:'loaded',scope:schema.scope(saved),revision:'0',reopened:before.status==='valid'};
            }finally{busy=false;}
        },
        async signOutCheck(){
            local();if(busy)fail('DIAGNOSTIC_BUSY');if(!workspace||workspace.getState().status!=='loaded')fail('RUN_CACHE_CHECK_FIRST');busy=true;
            try{const prior=workspace.repository();await auth.signOut();
                if(workspace.getState().status!=='unauthenticated'||workspace.getState().source!==null)fail('SIGN_OUT_DID_NOT_FENCE_CONTEXT');
                let blocked=false;try{prior.load();}catch{blocked=true;}if(!blocked)fail('OLD_CONTEXT_STILL_READABLE');
                blocked=false;try{workspace.load();}catch{blocked=true;}if(!blocked)fail('WORKSPACE_STILL_READABLE');
                report('PASS: sign-out closed the cloud context; neither current nor prior repository exposes its cached Universe.');
                report('The scoped cache remains for its owner. Sign in as another user in the normal app, then Run/reopen must reject this test marker rather than show the previous account.');
                return {status:'unauthenticated'};
            }finally{busy=false;}
        },
        async delayedCheck(){
            local();if(busy)fail('DIAGNOSTIC_BUSY');busy=true;let shadow,release;
            try{
                const ownerUserId=await signedIn(),saved=marker();if(!saved||saved.ownerUserId!==ownerUserId)fail('RUN_CACHE_CHECK_FIRST');
                const inspect=inspection(saved),before=inspect.read();if(before.status!=='valid'||!before.record.acknowledged||before.record.pending)fail('RUN_CACHE_CHECK_FIRST');
                let delivered;const received=new Promise(resolve=>{delivered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
                const delayed={...gateway,async readUniverse(scope){const result=await gateway.readUniverse(scope);delivered();await gate;return result;}};
                shadow=createCloudWorkspace({auth,gateway:delayed,cache});const opening=shadow.bootstrap(saved.universeId);
                const ready=await Promise.race([received.then(()=>true),opening.then(()=>false)]);if(!ready)fail('DELAYED_CHECK_COULD_NOT_LOAD');
                shadow.close();release();const result=await opening;
                if(result.status!=='disposed'||shadow.getState().source!==null||!cosmifoldCloudChanges.equal(inspect.read().record,before.record))fail('LATE_RESPONSE_WAS_NOT_FENCED');
                report('PASS: a real read was deliberately held back; closing that development context ignored its late response and wrote no cache changes.');
                return {status:'disposed'};
            }finally{release?.();shadow?.dispose();busy=false;}
        },
        dispose(){workspace?.dispose();auth.dispose();gateway.dispose();}
    });
}
