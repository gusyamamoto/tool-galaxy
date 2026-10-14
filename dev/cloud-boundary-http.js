// Manual loopback transport. Session credentials are used internally, never returned or logged.
const cloudBoundarySurface=Object.freeze({
    tables:Object.freeze(['universes','entries','constellations','constellation_members','linked_placements','operation_receipts']),
    privateFunctions:Object.freeze(['utf16_length','js_trim','valid_id','exact_keys','valid_timestamp','valid_ordinal','valid_json','valid_web_url',
        'valid_attributes','valid_archive','valid_snapshot_fields','owns_universe','checked_scope','project_universe','assert_integrity','valid_scoped_row']),
    rpcs:Object.freeze(['cosmifold_list_universes','cosmifold_create_universe','cosmifold_read_universe','cosmifold_commit_metadata','cosmifold_operation_receipt']),
    signatures:Object.freeze({cosmifold_list_universes:'',cosmifold_create_universe:'p_universe_id uuid',cosmifold_read_universe:'p_scope jsonb',
        cosmifold_commit_metadata:'p_command jsonb',cosmifold_operation_receipt:'p_scope jsonb, p_operation_id uuid'})
});
function cloudBoundaryAssert(condition,code){if(!condition)throw Object.assign(new Error(code),{code});}
function cloudBoundaryLoopback(location){
    cloudBoundaryAssert(['http:','https:'].includes(location.protocol)&&['localhost','127.0.0.1','[::1]'].includes(location.hostname),'LOCAL_DEVELOPMENT_ONLY');
}
function createCloudBoundaryHttp({provider=getSharedSupabaseClientProvider(),settings=()=>readPublicAuthConfiguration(cosmifoldAuthConfig),
    fetch=globalThis.fetch.bind(globalThis),location=globalThis.location,timeoutMs=15000}={}){
    const assert=cloudBoundaryAssert;let disposed=false,subscription,actorId,generation=0,surfaceAudit=null,graphqlAudit=null,stockAudit=null;const controllers=new Set();
    function acceptGraphqlHelperAudit(input){
        stockAudit=null;
        const reject=(path,expected,actual='rejected')=>{throw Object.assign(new Error('INVALID_GRAPHQL_STOCK_PROOF'),{
            code:'INVALID_GRAPHQL_STOCK_PROOF',auditFailure:{path,condition:'exact reviewed stock configuration',expected,actual}});};
        let value;try{value=typeof input==='string'?JSON.parse(input):input;value=cosmifoldCloudContract.json(value);}catch{reject('$','plain JSON');}
        if(Array.isArray(value)){if(value.length!==1)reject('$','one row');value=value[0];}
        if(value&&Object.hasOwn(value,'cloud_graphql_helper_inspection')){
            if(Object.keys(value).length!==1)reject('$','one named column');value=value.cloud_graphql_helper_inspection;}
        if(typeof value==='string'){try{value=cosmifoldCloudContract.json(JSON.parse(value));}catch{reject('$','JSON cell');}}
        const equal=(actual,expected,path)=>{if(actual!==expected)reject(path,expected,actual);};
        const fresh=Date.now()-Date.parse(value?.checkedAt);
        if(!value||value.format!=='cosmifold-graphql-helper-inspection'||value.auditVersion!==1)reject('format/auditVersion','helper inspection v1');
        if(typeof value.checkedAt!=='string'||!Number.isFinite(fresh)||fresh>1200000||fresh < -300000)reject('checkedAt','fresh timestamp');
        equal(value.extensionInstalled,false,'extensionInstalled');equal(value.extensionVersion,null,'extensionVersion');equal(value.targetExists,true,'targetExists');
        if(!Array.isArray(value.allRelatedFunctions)||value.allRelatedFunctions.length!==3)reject('allRelatedFunctions','exactly three stock routines');
        const specs=[{schema:'extensions',name:'grant_pg_graphql_access',args:'',result:'event_trigger',body:cloudGraphqlStock.grant,event:'ddl_command_end',trigger:'issue_pg_graphql_access',tag:'CREATE EXTENSION'},
            {schema:'extensions',name:'set_graphql_placeholder',args:'',result:'event_trigger',body:cloudGraphqlStock.set,event:'sql_drop',trigger:'issue_graphql_placeholder',tag:'DROP EXTENSION'},
            {schema:'graphql_public',name:'graphql',args:'"operationName" text, query text, variables jsonb, extensions jsonb',result:'jsonb',body:cloudGraphqlStock.placeholder}];
        let grantBodyVariant,setBodyVariant;
        for(const spec of specs){
            const rows=value.allRelatedFunctions.filter(row=>row.schema===spec.schema&&row.name===spec.name),path=`functions(${spec.schema}.${spec.name})`;
            if(rows.length!==1)reject(path,'one exact routine');const row=rows[0];
            for(const [field,expected] of Object.entries({owner:'supabase_admin',language:'plpgsql',routineKind:'f',securityDefiner:false,
                volatility:'volatile',result:spec.result,returnType:spec.result,argumentCount:spec.trigger?0:4,triggerContextOnly:!!spec.trigger}))equal(row[field],expected,path+'.'+field);
            equal(cloudGraphqlStockTokens(row.identityArguments),cloudGraphqlStockTokens(spec.args),path+'.identityArguments');
            const args=spec.trigger?'':'text,text,jsonb,jsonb';
            // regprocedure text qualifies names only when needed by the SQL Editor search_path.
            if(![`${spec.schema}.${spec.name}(${args})`,`${spec.name}(${args})`].some(s=>cloudGraphqlStockTokens(s)===cloudGraphqlStockTokens(row.signature)))
                reject(path+'.signature','exact stock signature (qualified or catalog-unqualified spelling)');
            if(!['plpgsql_call_handler()','pg_catalog.plpgsql_call_handler()'].includes(row.languageHandler))reject(path+'.languageHandler','PostgreSQL PL/pgSQL handler');
            const variants=spec.name==='grant_pg_graphql_access'?cloudGraphqlStockGrantVariants:
                spec.name==='set_graphql_placeholder'?cloudGraphqlStockSetVariants:[{id:spec.name,body:spec.body}];
            const matched=variants.find(variant=>cloudGraphqlStockTokens(row.body)===cloudGraphqlStockTokens(variant.body));
            if(!matched)reject(path+'.body','exact reviewed stock body (not keyword heuristics)',cloudGraphqlStockDifference(spec.body,row.body));
            if(spec.name==='grant_pg_graphql_access')grantBodyVariant=matched.id;
            if(spec.name==='set_graphql_placeholder')setBodyVariant=matched.id;
            if(!Array.isArray(row.eventTriggers)||row.eventTriggers.length!==(spec.trigger?1:0))reject(path+'.eventTriggers','exact stock registration');
            if(spec.trigger){const event=row.eventTriggers[0];
                for(const [field,expected] of Object.entries({name:spec.trigger,owner:'supabase_admin',event:spec.event,enabled:'O'}))equal(event[field],expected,path+'.eventTriggers.'+field);
                if(JSON.stringify(event.tags)!==JSON.stringify([spec.tag]))reject(path+'.eventTriggers.tags',[spec.tag]);}
            const emptyPath=row.proconfig===null&&row.fixedSearchPath===null||
                JSON.stringify(row.proconfig)===JSON.stringify(['search_path=""'])&&row.fixedSearchPath==='search_path=""';
            if(!emptyPath||spec.name==='grant_pg_graphql_access'&&row.proconfig===null)reject(path+'.proconfig','reviewed absent/empty path; grant helper must have fixed empty path');
            if(!Array.isArray(row.rolePrivileges)||row.rolePrivileges.length!==3||new Set(row.rolePrivileges.map(r=>r.role)).size!==3)reject(path+'.rolePrivileges','three distinct platform roles');
            for(const role of ['anon','authenticated','service_role']){
                const r=row.rolePrivileges.find(r=>r.role===role);if(!r)reject(path+'.rolePrivileges',role);
                for(const field of ['effectiveExecute','schemaUsage','executeAndUsage','superuser','bypassRls'])if(typeof r[field]!=='boolean')reject(path+'.rolePrivileges.'+field,'boolean');
                equal(r.executeAndUsage,r.effectiveExecute&&r.schemaUsage,path+'.rolePrivileges.executeAndUsage');
                if(role!=='service_role'&&(r.superuser||r.bypassRls))reject(path+'.rolePrivileges','ordinary unprivileged browser roles');}
            if(typeof row.publicExecute!=='boolean')reject(path+'.publicExecute','boolean');
            if(!spec.trigger){for(const field of ['grants','schemaDDL','extensionDDL','functionDDL','dataWrites','dynamicSQL'])equal(row.stateChangingTextIndicators?.[field],false,path+'.stateChangingTextIndicators.'+field);}
        }
        const target=value.allRelatedFunctions.find(r=>r.name==='grant_pg_graphql_access');
        if(!cosmifoldCloudChanges.equal(value.exactTarget,target))reject('exactTarget','same exact target as inventory');
        const qualified=value.allRelatedFunctions.filter(r=>r.rolePrivileges.some(role=>['anon','authenticated'].includes(role.role)&&role.executeAndUsage));
        if(!cosmifoldCloudChanges.equal(value.browserGrantQualifiedFunctions,qualified))reject('browserGrantQualifiedFunctions','matches complete inspection');
        stockAudit=value;return {checkedAt:value.checkedAt,grantBodyVariant,setBodyVariant};
    }
    function acceptGraphqlAudit(input){
        graphqlAudit=null;
        const reject=(path,expected,actual)=>{throw Object.assign(new Error('INVALID_GRAPHQL_SURFACE_AUDIT'),{
            code:'INVALID_GRAPHQL_SURFACE_AUDIT',auditFailure:{path,condition:'GraphQL catalog contract',expected,actual}});};
        let value=input;
        try{if(typeof value==='string')value=JSON.parse(value);value=cosmifoldCloudContract.json(value);}catch{reject('$','plain valid JSON','rejected');}
        if(Array.isArray(value)){if(value.length!==1)reject('$','exactly one result row',value.length);value=value[0];}
        if(value&&typeof value==='object'&&Object.hasOwn(value,'cloud_graphql_surface_audit')){
            if(Object.keys(value).length!==1)reject('$','one named result column',Object.keys(value));value=value.cloud_graphql_surface_audit;
        }
        if(typeof value==='string'){try{value=cosmifoldCloudContract.json(JSON.parse(value));}catch{reject('$','valid JSON cell','rejected');}}
        const shape=(v,fields,path)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==fields.length||fields.some(f=>!Object.hasOwn(v,f)))reject(path,fields,'incorrect shape');};
        const bool=(v,path)=>{if(typeof v!=='boolean')reject(path,'boolean',typeof v);};
        shape(value,['format','auditVersion','checkedAt','extensionInstalled','extensionVersion','schemas','functions','browserAccessibleRelations'],'$');
        if(value.format!=='cosmifold-graphql-surface-audit'||value.auditVersion!==1)reject('format/auditVersion','supported GraphQL audit v1','unsupported');
        const age=Date.now()-Date.parse(value.checkedAt);
        if(typeof value.checkedAt!=='string'||!Number.isFinite(age)||age < -300000||age > 1200000)reject('checkedAt','fresh timestamp (20 minutes)','stale/invalid');
        bool(value.extensionInstalled,'extensionInstalled');
        if(value.extensionInstalled?typeof value.extensionVersion!=='string'||!value.extensionVersion:value.extensionVersion!==null)
            reject('extensionVersion','installed version string or null when absent',value.extensionVersion);
        for(const field of ['schemas','functions','browserAccessibleRelations'])if(!Array.isArray(value[field]))reject(field,'array',typeof value[field]);
        const strings=(v,fields,path)=>fields.forEach(f=>{if(typeof v[f]!=='string'||!v[f])reject(path+'.'+f,'nonempty string',v[f]);});
        const unique=(rows,key,path)=>{const ids=rows.map(key);if(new Set(ids).size!==ids.length)reject(path,'unique identities','duplicates');};
        value.schemas.forEach((row,i)=>{const path=`schemas[${i}]`;shape(row,['name','anonymousUsage','authenticatedUsage'],path);strings(row,['name'],path);
            if(!/^graphql($|_)/.test(row.name))reject(path+'.name','GraphQL schema',row.name);bool(row.anonymousUsage,path);bool(row.authenticatedUsage,path);});
        value.functions.forEach((row,i)=>{const path=`functions[${i}]`;shape(row,['schema','name','arguments','result','securityDefiner','anonymousExecute','authenticatedExecute','anonymousUsage','authenticatedUsage','publicExecute'],path);
            strings(row,['schema','name','result'],path);if(typeof row.arguments!=='string')reject(path+'.arguments','string',typeof row.arguments);
            if(!/^graphql($|_)/.test(row.schema)&&!/graphql/i.test(row.name))reject(path,'GraphQL schema or function name','unrelated');
            for(const field of ['securityDefiner','anonymousExecute','authenticatedExecute','anonymousUsage','authenticatedUsage','publicExecute'])bool(row[field],path+'.'+field);});
        value.browserAccessibleRelations.forEach((row,i)=>{shape(row,['schema','name'],`browserAccessibleRelations[${i}]`);strings(row,['schema','name'],`browserAccessibleRelations[${i}]`);});
        unique(value.schemas,r=>r.name,'schemas');unique(value.functions,r=>JSON.stringify([r.schema,r.name,r.arguments]),'functions');
        unique(value.browserAccessibleRelations,r=>JSON.stringify([r.schema,r.name]),'browserAccessibleRelations');
        graphqlAudit=value;return {checkedAt:value.checkedAt,extensionInstalled:value.extensionInstalled};
    }
    function acceptSurfaceAudit(input){
        // Operator-supplied read-only catalog evidence, not browser discovery or a signed attestation.
        surfaceAudit=null;let audit;
        const reject=(path,condition,expected,actual,code='INVALID_API_SURFACE_AUDIT')=>{
            throw Object.assign(new Error(code),{code,auditFailure:{path,condition,expected,actual}});
        };
        const parse=(text,path)=>{try{return JSON.parse(text);}catch{reject(path,'invalid JSON','valid JSON','parse failed');}};
        let decoded=typeof input==='string'?parse(input,'$'):input,source='canonical-object';
        try{decoded=cosmifoldCloudContract.json(decoded);}catch(error){reject(error.path||'$','unsupported JSON structure','plain JSON without unsafe keys','rejected');}
        // SQL Editor Copy JSON exports result rows, whereas copying the JSONB cell exports the object.
        // Normalize only one row with the exact one-column alias; never discard extra rows/columns.
        if(Array.isArray(decoded)){
            if(decoded.length!==1)reject('$','result row count',1,decoded.length);
            decoded=decoded[0];source='sql-result-row';
        }
        if(decoded&&typeof decoded==='object'&&!Array.isArray(decoded)&&Object.hasOwn(decoded,'cloud_api_surface_audit')){
            if(Object.keys(decoded).length!==1)reject('$','result columns',['cloud_api_surface_audit'],Object.keys(decoded));
            decoded=decoded.cloud_api_surface_audit;source='sql-result-column';
        }else if(source==='sql-result-row')reject('$[0]','result column',['cloud_api_surface_audit'],decoded&&typeof decoded==='object'?Object.keys(decoded):typeof decoded);
        if(typeof decoded==='string'){decoded=parse(decoded,'cloud_api_surface_audit');source='json-cell-string';}
        try{audit=cosmifoldCloudContract.json(decoded);}catch(error){reject(error.path||'$','unsupported JSON structure','plain JSON without unsafe keys','rejected');}
        const shape=(value,fields,path)=>{
            if(!value||typeof value!=='object'||Array.isArray(value))reject(path,'object shape',fields,value===null?'null':Array.isArray(value)?'array':typeof value);
            const missing=fields.filter(field=>!Object.hasOwn(value,field)),extra=Object.keys(value).filter(field=>!fields.includes(field));
            if(missing.length||extra.length)reject(path,'exact fields',fields,{missing,extra});
        };
        const equal=(actual,expected,path)=>{if(actual!==expected)reject(path,'value',expected,actual);};
        const array=(value,path)=>{if(!Array.isArray(value))reject(path,'array type','array',value===null?'null':typeof value);};
        shape(audit,['format','auditVersion','checkedAt','privateSchemaExists','publicFunctions','publicRelations','privateTables'],'$');
        equal(audit.format,'cosmifold-api-surface-audit','format');equal(audit.auditVersion,1,'auditVersion');
        if(typeof audit.checkedAt!=='string'||!Number.isFinite(Date.parse(audit.checkedAt)))reject('checkedAt','timestamp','valid timestamp string',audit.checkedAt);
        equal(audit.privateSchemaExists,true,'privateSchemaExists');
        array(audit.publicRelations,'publicRelations');
        if(audit.publicRelations.length)reject('publicRelations','public table/view/column privileges','empty array',audit.publicRelations);
        array(audit.publicFunctions,'publicFunctions');
        audit.publicFunctions.forEach((fn,index)=>{
            shape(fn,['name','arguments','result','securityDefiner','authenticated','anonymous'],`publicFunctions[${index}]`);
            if(typeof fn.name!=='string')reject(`publicFunctions[${index}].name`,'RPC name type','string',typeof fn.name);
        });
        const names=audit.publicFunctions.map(fn=>fn.name),expectedNames=[...cloudBoundarySurface.rpcs].sort();
        const difference=(actual,expected)=>({missing:expected.filter(name=>!actual.includes(name)),unexpected:actual.filter(name=>!expected.includes(name)),
            duplicates:[...new Set(actual.filter((name,index)=>actual.indexOf(name)!==index))]});
        if(JSON.stringify([...names].sort())!==JSON.stringify(expectedNames))reject('publicFunctions.name','exact RPC inventory',expectedNames,difference(names,expectedNames),'UNEXPECTED_COSMIFOLD_RPC_SURFACE');
        audit.publicFunctions.forEach((fn,index)=>{
            const at=`publicFunctions[${index}](${fn.name})`;
            equal(fn.arguments,cloudBoundarySurface.signatures[fn.name],at+'.arguments');equal(fn.result,'jsonb',at+'.result');
            equal(fn.securityDefiner,false,at+'.securityDefiner');equal(fn.authenticated,true,at+'.authenticated');equal(fn.anonymous,false,at+'.anonymous');
        });
        array(audit.privateTables,'privateTables');
        audit.privateTables.forEach((table,index)=>{
            shape(table,['name','rlsEnabled','rlsForced'],`privateTables[${index}]`);
            if(typeof table.name!=='string')reject(`privateTables[${index}].name`,'table name type','string',typeof table.name);
        });
        const tables=audit.privateTables.map(table=>table.name),expectedTables=[...cloudBoundarySurface.tables].sort();
        if(JSON.stringify([...tables].sort())!==JSON.stringify(expectedTables))reject('privateTables.name','exact private table inventory',expectedTables,difference(tables,expectedTables));
        audit.privateTables.forEach((table,index)=>{
            const at=`privateTables[${index}](${table.name})`;equal(table.rlsEnabled,true,at+'.rlsEnabled');equal(table.rlsForced,true,at+'.rlsForced');
        });
        surfaceAudit=audit;return {checkedAt:audit.checkedAt,source};
    }
    async function request(path,{anonymous=false,method='POST',profile='public',body,accept='application/json'}={}){
        cloudBoundaryLoopback(location);assert(!disposed,'DIAGNOSTIC_DISPOSED');
        const config=settings();assert(config,'AUTH_NOT_CONFIGURED');
        const headers={apikey:config.key,Accept:accept,'Content-Type':'application/json'};
        if(profile)headers[method==='GET'?'Accept-Profile':'Content-Profile']=profile;
        let client,owner,requestGeneration;
        if(!anonymous){client=await provider.getClient();assert(client,'AUTH_NOT_CONFIGURED');
            if(!subscription)subscription=client.auth.onAuthStateChange((event,next)=>{const id=next?.user?.id||null;
                if(event==='SIGNED_OUT'||actorId!==undefined&&id!==actorId)generation++;actorId=id;}).data.subscription;
            const result=await client.auth.getSession(),session=result?.data?.session;
            assert(!result?.error&&session?.user?.id&&session.access_token,'SIGN_IN_LOCALLY_FIRST');
            owner=session.user.id;if(actorId!==undefined&&actorId!==owner)generation++;actorId=owner;requestGeneration=generation;
            headers.Authorization='Bearer '+session.access_token;
        }
        const controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),timeoutMs);
        try{
            const response=await fetch(config.url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),
                credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});
            let data;try{data=await response.json();}catch{data=null;}
            assert(!disposed,'DIAGNOSTIC_DISPOSED');
            if(client){const result=await client.auth.getSession();assert(!result.error&&result.data?.session?.user?.id===owner&&generation===requestGeneration,'ACCOUNT_CHANGED_DURING_HTTP_CHECK');}
            return {status:response.status,body:data};
        }catch(error){if(error.code)throw error;throw Object.assign(new Error('HTTP_CHECK_UNAVAILABLE'),{code:'HTTP_CHECK_UNAVAILABLE'});}
        finally{clearTimeout(timer);controllers.delete(controller);}
    }
    const rpc=(name,body,options={})=>{assert(cloudBoundarySurface.rpcs.includes(name),'UNAPPROVED_TEST_RPC');return request('/rest/v1/rpc/'+name,{...options,body});};
    function denied(value){assert([401,403].includes(value.status)&&['42501','28000','PGRST301','PGRST302','PGRST303'].includes(value.body?.code),'AUTHORIZATION_DENIAL_NOT_PROVEN');}
    async function privateRest(anonymous,universeId){
        for(const table of cloudBoundarySurface.tables){
            for(const method of ['GET','POST','PATCH','DELETE']){
                const query=method==='POST'?'':`?${table==='universes'?'id':'universe_id'}=eq.${universeId}`;
                const value=await request('/rest/v1/'+table+query,{anonymous,method,profile:'cosmifold_private',body:['POST','PATCH'].includes(method)?{}:undefined});
                // Constraint errors, RLS-filtered empty rows, 5xx and generic 404s are NOT evidence of schema exclusion.
                assert(value.status===406&&value.body?.code==='PGRST106','PRIVATE_SCHEMA_HTTP_EXCLUSION_NOT_PROVEN');
            }
            const value=await request('/rest/v1/'+table+'?limit=0',{anonymous,method:'GET'});
            assert(value.status===404&&value.body?.code==='PGRST205','PUBLIC_TABLE_ALIAS_EXCLUSION_NOT_PROVEN');
        }
    }
    async function publicSurface(record){
        const value=await request('/rest/v1/',{method:'GET',accept:'application/openapi+json'});
        let inventorySource;
        if(value.status===200){
            assert(value.body?.paths&&typeof value.body.paths==='object'&&!Array.isArray(value.body.paths),'OPENAPI_SURFACE_UNVERIFIED');
            const paths=Object.keys(value.body.paths),names=paths.filter(p=>p.startsWith('/rpc/')).map(p=>p.slice(5)).sort();
            assert(JSON.stringify(names)===JSON.stringify([...cloudBoundarySurface.rpcs].sort()),'UNEXPECTED_COSMIFOLD_RPC_SURFACE');
            assert(paths.every(path=>path==='/'||path.startsWith('/rpc/'))&&!paths.some(p=>/cosmifold_private/.test(p)||cloudBoundarySurface.tables.some(t=>p==='/'+t)||
                cloudBoundarySurface.privateFunctions.some(name=>p==='/rpc/'+name)),'PRIVATE_TABLE_IN_OPENAPI');
            inventorySource='browser-openapi';
        }else{
            // Hosted Supabase restricts root OpenAPI to privileged keys. Never introduce one here.
            assert([401,403].includes(value.status),'OPENAPI_SURFACE_UNVERIFIED');
            if(!surfaceAudit)throw Object.assign(new Error('API_SURFACE_AUDIT_REQUIRED'),{code:'API_SURFACE_AUDIT_REQUIRED',httpStatus:value.status});
            inventorySource='manual-read-only-catalog';
        }
        cloudBoundaryFixtures.validate(record);const same=cosmifoldCloudChanges.equal,scope=cosmifoldCloudContract.scope(record);
        const command=cloudBoundaryFixtures.command(record,1),expected=cloudBoundaryFixtures.metadata(record);
        const list=await rpc('cosmifold_list_universes',{});
        assert(list.status===200&&Array.isArray(list.body)&&list.body.every(row=>row.owner_id===record.ownerUserId)&&
            list.body.some(row=>row.id===record.universeId&&row.revision===String(record.stage)),'APPROVED_RPC_REACHABILITY_NOT_PROVEN');
        const read=await rpc('cosmifold_read_universe',{p_scope:scope});
        assert(read.status===200&&same(read.body,{status:'found',metadata:expected}),'APPROVED_RPC_REACHABILITY_NOT_PROVEN');
        const receipt=await rpc('cosmifold_operation_receipt',{p_scope:scope,p_operation_id:command.operationId});
        const original=cloudBoundaryFixtures.acknowledgement(record,1),replayed={...original,replayed:true};
        assert(receipt.status===200&&receipt.body?.status==='found'&&/^[a-f0-9]{64}$/.test(receipt.body.request_digest)&&same(receipt.body.acknowledgement,replayed),
            'APPROVED_RPC_REACHABILITY_NOT_PROVEN');
        // Existing, verified UUID only; idempotent create cannot replace the fixture.
        const create=await rpc('cosmifold_create_universe',{p_universe_id:record.universeId});
        assert(create.status===200&&same(create.body,expected),'APPROVED_RPC_REACHABILITY_NOT_PROVEN');
        // Replay an existing, receipt-checked command exactly. No new operation or semantic write.
        const replay=await rpc('cosmifold_commit_metadata',{p_command:command});
        assert(replay.status===200&&same(replay.body,replayed),'APPROVED_RPC_REACHABILITY_NOT_PROVEN');
        const after=await rpc('cosmifold_read_universe',{p_scope:scope});
        assert(after.status===200&&same(after.body,read.body),'RPC_REPLAY_CHANGED_FIXTURE');
        for(const anonymous of [true,false])for(const name of cloudBoundarySurface.privateFunctions){
            const params={value:null};
            if(['owns_universe','project_universe','assert_integrity'].includes(name)){delete params.value;params.target=record.universeId;}
            if(name==='valid_id')params.maximum=100;
            if(name==='exact_keys')Object.assign(params,{allowed:[],required:[]});
            if(name==='valid_scoped_row')Object.assign(params,{target:record.universeId,relation:'entries'});
            const helper=await request('/rest/v1/rpc/'+name,{anonymous,body:params});
            assert(helper.status===404&&helper.body?.code==='PGRST202','PRIVATE_HELPER_HTTP_EXCLUSION_NOT_PROVEN');
        }
        return {inventorySource,openapiHttpStatus:value.status,checkedAt:surfaceAudit?.checkedAt||null};
    }
    async function graphql(anonymous,identity){
        const send=query=>request('/graphql/v1',{anonymous,profile:null,body:{query}});
        const value=await send('query BoundarySchema { __schema { queryType { fields { name } } mutationType { fields { name } } types { name fields { name } } } }');
        const disabled=result=>result.status===200&&result.body&&typeof result.body==='object'&&!Array.isArray(result.body)&&
            (!Object.hasOwn(result.body,'data')||result.body.data===null||
                typeof result.body.data==='object'&&!Array.isArray(result.body.data)&&Object.keys(result.body.data).length===0)&&
            Array.isArray(result.body?.errors)&&result.body.errors.length>0&&result.body.errors.every(error=>
                typeof error?.message==='string'&&(/^pg_graphql extension is not enabled\.?$/i.test(error.message.trim())||
                    stockAudit&&error.message.trim()==='pg_graphql is only available on projects running Postgres 14 onwards.'));
        if(disabled(value)){
            const stop=(path,condition)=>{throw Object.assign(new Error('GRAPHQL_DISABLED_UNVERIFIED'),{code:'GRAPHQL_DISABLED_UNVERIFIED',
                graphqlFailure:{actor:anonymous?'anonymous':'authenticated',path,state:'disabled-http-observed-catalog-unverified',
                    httpStatus:value.status,errorMessages:[condition]}});};
            if(!graphqlAudit)stop('catalog','Fresh read-only GraphQL catalog audit required; HTTP disabled error alone is not proof.');
            if(Date.now()-Date.parse(graphqlAudit.checkedAt)>1200000)stop('catalog.checkedAt','GraphQL catalog audit expired; rerun it.');
            if(graphqlAudit.extensionInstalled)stop('catalog.extensionInstalled','pg_graphql is installed; disabled proof refused.');
            const callable=graphqlAudit.functions.find(fn=>fn.anonymousExecute&&fn.anonymousUsage||fn.authenticatedExecute&&fn.authenticatedUsage);
            if(callable||stockAudit){
                if(!stockAudit)stop(`catalog.functions(${callable.schema}.${callable.name}(${callable.arguments}))`,'Fresh exact stock helper inspection required.');
                if(Date.now()-Date.parse(stockAudit.checkedAt)>1200000)stop('stock.checkedAt','Stock helper inspection expired.');
                if(graphqlAudit.functions.length!==stockAudit.allRelatedFunctions.length)stop('catalog.functions','Surface inventory differs from stock inspection.');
                for(const fn of graphqlAudit.functions){
                    const row=stockAudit.allRelatedFunctions.find(r=>r.schema===fn.schema&&r.name===fn.name&&cloudGraphqlStockTokens(r.identityArguments)===cloudGraphqlStockTokens(fn.arguments));
                    if(!row)stop('catalog.functions','Unexpected function/overload.');
                    if(row.result!==fn.result||row.securityDefiner!==fn.securityDefiner||row.publicExecute!==fn.publicExecute)stop('catalog.functions','Catalog characteristics disagree.');
                    for(const [prefix,role] of [['anonymous','anon'],['authenticated','authenticated']]){
                        const r=row.rolePrivileges.find(r=>r.role===role);
                        if(r.effectiveExecute!==fn[prefix+'Execute']||r.schemaUsage!==fn[prefix+'Usage'])stop('catalog.functions','Catalog grants disagree.');
                    }
                }
            }
            if(graphqlAudit.browserAccessibleRelations.length)stop('catalog.browserAccessibleRelations','Browser-accessible GraphQL-schema relation exists; review required.');
            // No GraphQL engine: every query/mutation must fail before resolving fields.
            // This permits safe negative probes, not executing a private helper/mutation.
            const probes=['query BoundaryReachability { __typename }'];
            for(const table of cloudBoundarySurface.tables){
                const camel=table.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase());
                for(const name of new Set([table,camel,'cosmifold_private_'+table])){
                    probes.push(`query { ${name}Collection(first: 0) { __typename } }`);
                    probes.push(`mutation { insertInto${name[0].toUpperCase()+name.slice(1)}Collection(objects: []) { affectedCount } }`);
                }
            }
            for(const name of cloudBoundarySurface.privateFunctions)probes.push(`query { ${name} }`);
            for(const parts of [['cosmifold_private','universes',identity.universeId],['cosmifold_private','entries',identity.universeId,'boundary-shared-entry']])
                probes.push(`query { node(nodeId: "${btoa(JSON.stringify(parts))}") { nodeId } }`);
            for(let i=0;i<probes.length;i++)if(!disabled(await send(probes[i])))stop(`HTTP.probes[${i}]`,'Expected only the disabled-engine error and no data; response differed.');
            return {state:'disabled-independently-verified',httpStatus:200,checkedAt:graphqlAudit.checkedAt,probeCount:probes.length+1};
        }
        if(value.status===404){
            const mutation=await send('mutation BoundaryUnavailable { insertIntoUniversesCollection(objects: []) { affectedCount } }');
            assert(mutation.status===404,'GRAPHQL_ENDPOINT_STATE_INCONSISTENT');
            // Observed HTTP unavailability is not proof the database extension is disabled.
            return {state:'endpoint-unavailable',httpStatus:404};
        }
        if(anonymous&&[401,403].includes(value.status)){
            denied(value);
            denied(await send('query { universesCollection(first: 0) { __typename } }'));
            denied(await send('mutation { insertIntoUniversesCollection { __typename } }'));
            return {state:'anonymous-denied',httpStatus:value.status};
        }
        const schema=value.body?.data?.__schema;
        if(!(value.status===200&&schema&&Array.isArray(schema.types)&&Array.isArray(schema.queryType?.fields)&&!value.body.errors)){
            // Ordinary read-only field: reachability evidence, never privacy proof.
            const control=await send('query BoundaryReachability { __typename }');
            const reachable=control.status===200&&control.body?.data?.__typename==='Query'&&!control.body.errors;
            const messages=Array.isArray(value.body?.errors)?value.body.errors.slice(0,4).map(error=>
                typeof error?.message==='string'?error.message:'[missing error.message]'):[];
            const blocked=reachable&&value.status===200&&messages.some(message=>
                /introspection.*(?:disabled|blocked|not allowed)/i.test(message)||/(?:unknown field|cannot query field).*__schema/i.test(message));
            const path=value.status!==200?'HTTP status':value.body?.errors?'errors':!schema?'data.__schema':
                !Array.isArray(schema.types)?'data.__schema.types':'data.__schema.queryType.fields';
            const code=blocked?'GRAPHQL_INTROSPECTION_BLOCKED':'GRAPHQL_INTROSPECTION_UNVERIFIED';
            throw Object.assign(new Error(code),{code,graphqlFailure:{actor:anonymous?'anonymous':'authenticated',path,
                state:blocked?'endpoint-reachable-introspection-blocked':reachable?'endpoint-reachable-introspection-unverified':'endpoint-state-unverified',
                httpStatus:value.status,errorMessages:messages,controlHttpStatus:control.status,
                controlQueryType:typeof control.body?.data?.__typename==='string'?control.body.data.__typename:null}});
        }
        const normalize=name=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
        const privateName=name=>normalize(name).includes('cosmifoldprivate')||cloudBoundarySurface.privateFunctions.some(fn=>normalize(name)===normalize(fn))||cloudBoundarySurface.tables.some(table=>{
            const t=normalize(table),n=normalize(name);return n===t||n.startsWith(t+'collection')||n.startsWith(t+'connection')||n.startsWith(t+'edge')||
                n.startsWith(t+'filter')||n.startsWith(t+'insert')||n.startsWith(t+'update')||n.startsWith(t+'delete')||
                ['insertinto','update','deletefrom'].some(prefix=>n.startsWith(prefix+t+'collection'));
        });
        const names=schema.types.flatMap(type=>[type.name,...(type.fields||[]).map(field=>field.name)]);
        assert(names.every(name=>typeof name==='string'&&!privateName(name)),'PRIVATE_GRAPHQL_TYPE_EXPOSED');
        // Probe both normal pg_graphql names and inflected variants, after confirming they do not exist.
        for(const table of cloudBoundarySurface.tables){
            const camel=table.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase());
            for(const name of new Set([table,camel])){
                const title=name[0].toUpperCase()+name.slice(1);
                const fields=new Set([name+'Collection',...['insertInto','update','deleteFrom'].flatMap(prefix=>[prefix+name+'Collection',prefix+title+'Collection'])]);
                for(const field of fields){
                    const mutation=field!==name+'Collection';
                    const query=mutation?`mutation { ${field} { __typename } }`:`query { ${field}(first: 0) { __typename } }`;
                    const result=await send(query);
                    assert(result.status===200&&!result.body?.data&&Array.isArray(result.body?.errors)&&result.body.errors.some(error=>
                        typeof error.message==='string'&&error.message.includes(field)&&/unknown field|cannot query field|does not exist/i.test(error.message)),
                        'GRAPHQL_FIELD_EXCLUSION_NOT_PROVEN');
                }
            }
        }
        // Node IDs identify SQL schema/table/PK, independently of GraphQL inflection or renamed fields.
        if(schema.queryType.fields.some(field=>field.name==='node')){
            for(const parts of [['cosmifold_private','universes',identity.universeId],
                ['cosmifold_private','entries',identity.universeId,'boundary-shared-entry']]){
                const nodeId=btoa(JSON.stringify(parts)),result=await send(`query { node(nodeId: "${nodeId}") { nodeId } }`);
                assert(result.status===200&&result.body?.data?.node===null&&!result.body.errors,'PRIVATE_GRAPHQL_NODE_EXCLUSION_NOT_PROVEN');
            }
        }
        return {state:'schema-inspected-private-excluded',httpStatus:200};
    }
    return Object.freeze({request,rpc,denied,privateRest,acceptSurfaceAudit,acceptGraphqlAudit,acceptGraphqlHelperAudit,publicSurface,graphql,dispose(){disposed=true;subscription?.unsubscribe();controllers.forEach(c=>c.abort());}});
}

// Safe operator feedback: field/path and bounded catalog values only, never the pasted document.
function cloudBoundaryGraphqlRejection(error){
    const f=error?.graphqlFailure;if(!f)return 'GraphQL privacy remains unverified.';
    const safe=value=>String(value??'missing').replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+|Bearer\s+[^\s"]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted]').slice(0,500);
    return `GraphQL ${safe(f.actor)}: ${safe(f.state)}; /graphql/v1 HTTP ${safe(f.httpStatus)}; rejected ${safe(f.path)}. `+
        `Read-only __typename check: HTTP ${safe(f.controlHttpStatus)}, type ${safe(f.controlQueryType)}. `+
        `GraphQL errors: ${(f.errorMessages||[]).map(safe).join(' | ')||'none'}. `+
        'Blocked/filtered introspection is not privacy proof. Keep fixtures; do not change exposure or enable introspection to force a pass.';
}
function cloudBoundaryAuditRejection(error){
    const failure=error?.auditFailure;
    if(!failure)return 'Inventory rejected: unsupported input. No unverifiable inventory was accepted.';
    const printable=value=>{
        let text;try{text=JSON.stringify(value)??'missing';}catch{text='unreadable';}
        return text.replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+|Bearer\s+[^\s"]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted]').slice(0,1200);
    };
    return `Inventory rejected at ${String(failure.path).slice(0,200)}: ${failure.condition}. Expected ${printable(failure.expected)}; received ${printable(failure.actual)}. No inventory was accepted.`;
}
