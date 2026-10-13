// Temporary, manual HTTP boundary check. No automatic calls or normal-app wiring.
function createCloudMetadataDiagnostic({
    location=globalThis.location,provider=getSharedSupabaseClientProvider(),
    settings=()=>readPublicAuthConfiguration(cosmifoldAuthConfig),
    gateway=createSupabaseMetadataGateway({provider}),fetch=globalThis.fetch.bind(globalThis),
    randomUUID=()=>crypto.randomUUID(),report=()=>{},onTestIdentity=()=>{}
}={}){
    const label='Cosmifold disposable RPC boundary test';
    let busy=false,universeId,ownerUserId;
    function fail(code){const error=new Error(code);error.code=code;throw error;}
    function loopback(){
        if(!['http:','https:'].includes(location.protocol)||!['localhost','127.0.0.1','[::1]'].includes(location.hostname))fail('LOCAL_DEVELOPMENT_ONLY');
    }
    async function anonymous(name,params){
        const config=settings();if(!config)fail('AUTH_NOT_CONFIGURED');
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
        try{
            // No session JWT, cookies, SDK session changes or second SDK client.
            const response=await fetch(config.url+'/rest/v1/rpc/'+name,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',
                headers:{apikey:config.key,'Content-Type':'application/json','Content-Profile':'public'},body:JSON.stringify(params),signal:controller.signal});
            let body;try{body=await response.json();}catch{fail('ANONYMOUS_RESPONSE_INVALID');}
            if(![401,403].includes(response.status)||!['42501','28000','PGRST301','PGRST302','PGRST303'].includes(body?.code))fail('ANONYMOUS_REJECTION_NOT_PROVEN');
            return {httpStatus:response.status,code:body.code};
        }catch(error){if(error.code)throw error;fail('ANONYMOUS_REQUEST_FAILED');}
        finally{clearTimeout(timer);}
    }
    function empty(metadata){
        if(metadata.universe.revision!=='0'||['entries','constellations','constellation_members','linked_placements'].some(key=>metadata[key].length))fail('TEST_UNIVERSE_NOT_EMPTY');
    }
    return Object.freeze({
        async run(){
            loopback();if(busy)fail('DIAGNOSTIC_BUSY');busy=true;
            try{
                const rejection=await anonymous('cosmifold_list_universes',{});
                report(`PASS: anonymous list rejected (HTTP ${rejection.httpStatus}, ${rejection.code}).`);
                const initial=await gateway.listOwnedUniverses();
                report(`PASS: authenticated list returned ${initial.length} Universe(s)${initial.length?'':'; this account currently has no Universe'}.`);
                // Get the same client/session used by the gateway, never expose its tokens.
                const client=await provider.getClient(),result=await client.auth.getSession();
                const id=result.data?.session?.user?.id;
                if(result.error||!id)fail('SIGN_IN_LOCALLY_FIRST');
                if(ownerUserId&&id!==ownerUserId)fail('ACCOUNT_CHANGED_START_FRESH_PAGE');
                ownerUserId=id;universeId=universeId||randomUUID();
                cosmifoldCloudContract.scope({ownerUserId,universeId});
                onTestIdentity({label,ownerUserId,universeId});
                report(`Test: ${label}. Universe ${universeId}.`);
                const created=await gateway.createUniverse(universeId);empty(created);
                report(`PASS: created/read disposable empty Universe (revision ${created.universe.revision}).`);
                const listed=await gateway.listOwnedUniverses();
                if(!listed.some(row=>row.id===universeId&&row.owner_id===ownerUserId&&row.revision==='0'))fail('TEST_UNIVERSE_NOT_LISTED');
                report('PASS: authenticated list includes the test Universe.');
                const scope={ownerUserId,universeId},read=await gateway.readUniverse(scope);
                if(read.status!=='found')fail('TEST_UNIVERSE_NOT_FOUND');empty(read.metadata);
                report(`PASS: coherent authenticated read returned the empty Universe (revision ${read.metadata.universe.revision}).`);
                const denied=await anonymous('cosmifold_read_universe',{p_scope:scope});
                report(`PASS: anonymous read rejected (HTTP ${denied.httpStatus}, ${denied.code}).`);
                report('COMPLETE: list/create/read HTTP boundary checks passed. No local Cosmos data or semantic cloud metadata was uploaded.');
                return {label,ownerUserId,universeId,revision:'0',initialCount:initial.length};
            }finally{busy=false;}
        },
        dispose(){gateway.dispose();}
    });
}

function cloudMetadataDiagnosticCleanup({ownerUserId,universeId}){
    // Only validated UUIDs reach SQL text. The administrative delete is deliberately
    // guarded against nonempty/modified data; no broad cleanup or cascades.
    cosmifoldCloudContract.scope({ownerUserId,universeId});
    return `delete from cosmifold_private.universes u
where u.id = '${universeId}'::uuid
  and u.owner_id = '${ownerUserId}'::uuid
  and u.revision = 0
${['entries','constellations','constellation_members','linked_placements','operation_receipts'].map(table=>
        `  and not exists (select 1 from cosmifold_private.${table} d where d.universe_id = u.id)`).join('\n')}
returning u.id, u.owner_id;`;
}
