const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {setup,plain}=require('./fake-cloud-gateway.js'),{disk,fakeLocks}=require('./fake-cloud-workspace.js');
function environment(){
    const e=setup(),global=e.get('globalThis'),storage=disk(),markers=disk();let sequence=100;
    Object.assign(global,{setTimeout,clearTimeout,AbortController,btoa,crypto:{randomUUID:()=>`00000000-0000-4000-9000-${String(++sequence).padStart(12,'0')}`},
        location:{protocol:'http:',hostname:'127.0.0.1',href:'http://127.0.0.1:5500/dev/cloud-boundary-diagnostic.html'},
        cosmifoldAuthConfig:{SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_TEST'}});
    for(const file of ['services/supabase-client.js','services/supabase-auth.js','services/auth-service.js','services/supabase-metadata-gateway.js',
        'persistence/cloud-cache-store.js','services/cloud-workspace.js','dev/cloud-graphql-stock.js','dev/cloud-boundary-http.js','dev/cloud-boundary-diagnostic.js','dev/cloud-boundary-cleanup.js','tests/cloud-boundary-fixture.js'])e.load(file);
    const fixture=e.get('installCloudBoundaryFixture')(),auth=e.get('createAuthService')(),gateway=e.get('createSupabaseMetadataGateway')();
    const cache=e.get('createCloudCacheStore')({storage:()=>storage,locks:fakeLocks()}),http=e.get('createCloudBoundaryHttp')(),messages=[],identities=[];
    const diagnostic=e.get('createCloudBoundaryDiagnostic')({auth,gateway,http,cache,markers:()=>markers,report:m=>messages.push(m),onFixtures:r=>identities.push(plain(r))});
    diagnostic.acceptSurfaceAudit(fixture.audit());
    return {...e,fixture,auth,gateway,http,cache,storage,markers,messages,identities,diagnostic,records:()=>plain(diagnostic.fixtures())};
}
test('full real-boundary-shaped fixture covers same entry ID, independent Universes, owner switches and synthetic pending scope',async()=>{
    const e=environment();e.storage.setItem('galaxy:user-data','KEEP_LOCAL');e.storage.setItem('galaxy:navigation-ui','KEEP_PREFERENCES');
    assert.equal(e.fixture.clients,0);assert.equal(e.fixture.calls.length,0);
    try{
        const prepared=await e.diagnostic.prepareA();assert.equal(prepared.status,'a-prepared');
        const [a1,a2]=e.records();assert.equal(a1.stage,2);assert.equal(a2.stage,1);
        const row1=e.fixture.rows.get(a1.universeId),row2=e.fixture.rows.get(a2.universeId);
        assert.equal(row1.entries[0].id,row2.entries[0].id);assert.notEqual(row1.entries[0].name,row2.entries[0].name);assert.notEqual(e.cache.key(a1),e.cache.key(a2));
        assert.equal((await e.diagnostic.privacy()).graphql.authenticated.state,'schema-inspected-private-excluded');
        await e.diagnostic.armAccountSwitch();const before=e.storage.getItem(e.cache.key(a1));e.fixture.switchUser(e.fixture.B);
        assert.equal((await e.diagnostic.checkB()).status,'b-checked');
        assert.equal(e.storage.getItem(e.cache.key(a1)),before);
        const b=e.records().find(r=>r.label==='B1');assert.notEqual(e.cache.key(b),e.cache.key(a1));
        const foreignKey=e.cache.key({ownerUserId:b.ownerUserId,universeId:a1.universeId});assert.equal(JSON.parse(e.storage.getItem(foreignKey)).acknowledged,null);
        await e.diagnostic.privacy();e.fixture.switchUser(e.fixture.A);assert.equal((await e.diagnostic.finishA()).status,'identity-checked');
        assert.equal(JSON.parse(e.storage.getItem(e.cache.key(a2))).pending,null);
        assert.equal(e.storage.getItem('galaxy:user-data'),'KEEP_LOCAL');assert.equal(e.storage.getItem('galaxy:navigation-ui'),'KEEP_PREFERENCES');
        assert.equal(e.fixture.rows.size,3);assert.equal(e.fixture.receipts.size,4);
        const synthetic=new Set(e.records().map(r=>r.syntheticOperationId));
        assert.ok(e.fixture.calls.filter(c=>c.source==='sdk'&&c.name==='cosmifold_commit_metadata').every(c=>!synthetic.has(c.params.p_command.operationId)));
        assert.ok(e.fixture.calls.filter(c=>c.source==='sdk').every(c=>c.schema==='public'&&c.retry===false));
        assert.equal(e.messages.join('\n').includes('FIXTURE_PRIVATE_TOKEN'),false);
    }finally{e.diagnostic.dispose();}
});

test('completed preparation cannot repeat any RPC, cache write, marker update or fixture allocation',async()=>{
    const e=environment();try{
        await e.diagnostic.prepareA();const marker=e.markers.getItem(e.diagnostic.markerKey),rows=JSON.stringify([...e.fixture.rows]),
            calls=e.fixture.calls.length,writes=e.storage.writes.length,receipts=e.fixture.receipts.size;
        await assert.rejects(e.diagnostic.prepareA(),{code:'A_FIXTURES_ALREADY_PREPARED'});
        assert.equal(e.fixture.calls.length,calls);assert.equal(e.storage.writes.length,writes);
        assert.equal(e.markers.getItem(e.diagnostic.markerKey),marker);assert.equal(JSON.stringify([...e.fixture.rows]),rows);assert.equal(e.fixture.receipts.size,receipts);
    }finally{e.diagnostic.dispose();}
});

test('fresh controller verifies existing A1/A2 using reads/receipts only, with no storage mutation',async()=>{
    const e=environment();let resumed;try{
        await e.diagnostic.prepareA();const marker=e.markers.getItem(e.diagnostic.markerKey),rows=JSON.stringify([...e.fixture.rows]),
            calls=e.fixture.calls.length,writes=e.storage.writes.length,receipts=e.fixture.receipts.size;
        resumed=e.get('createCloudBoundaryDiagnostic')({auth:e.auth,gateway:e.gateway,http:e.http,cache:e.cache,markers:()=>e.markers});
        assert.equal((await resumed.verifyExistingA()).status,'existing-a-verified');
        const requests=e.fixture.calls.slice(calls);assert.equal(requests.length,5);
        assert.ok(requests.every(r=>r.source==='sdk'&&['cosmifold_read_universe','cosmifold_operation_receipt'].includes(r.name)));
        assert.equal(e.storage.writes.length,writes);assert.equal(e.markers.getItem(e.diagnostic.markerKey),marker);
        assert.equal(JSON.stringify([...e.fixture.rows]),rows);assert.equal(e.fixture.receipts.size,receipts);
    }finally{resumed?.dispose();e.diagnostic.dispose();}
});

test('read-only recovery preserves SESSION_CHANGED fencing and succeeds only after a fresh valid identity check',async()=>{
    const e=environment();try{
        await e.diagnostic.prepareA();const marker=e.markers.getItem(e.diagnostic.markerKey),rows=JSON.stringify([...e.fixture.rows]),writes=e.storage.writes.length;
        const push=e.fixture.calls.push.bind(e.fixture.calls);let switched=false;
        e.fixture.calls.push=call=>{const n=push(call);if(!switched&&call.source==='sdk'&&call.name==='cosmifold_read_universe'){
            switched=true;e.fixture.switchUser(e.fixture.A);}return n;};
        await assert.rejects(e.diagnostic.verifyExistingA(),{code:'SESSION_CHANGED'});
        assert.equal(e.markers.getItem(e.diagnostic.markerKey),marker);assert.equal(JSON.stringify([...e.fixture.rows]),rows);assert.equal(e.storage.writes.length,writes);
        assert.equal((await e.diagnostic.verifyExistingA()).status,'existing-a-verified');
        e.fixture.switchUser(e.fixture.B);
        await assert.rejects(e.diagnostic.verifyExistingA(),{code:'USE_ORIGINAL_ACCOUNT_A'});
        assert.equal(e.storage.writes.length,writes);
    }finally{e.diagnostic.dispose();}
});

test('read-only recovery stops on existing synthetic pending marker and never clears or dispatches it',async()=>{
    const e=environment();try{
        await e.diagnostic.prepareA();const record=e.records()[0],fixtures=e.get('cloudBoundaryFixtures'),projection=e.get('cosmifoldCloudProjection'),
            contract=e.get('cosmifoldCloudContract'),changes=e.get('cosmifoldCloudChanges'),snapshot=fixtures.snapshot(record);
        snapshot.entries[0].name='never-dispatched recovery fixture';
        const prepared=projection.toRelational(snapshot,{...contract.scope(record),revision:String(record.stage)}),base=fixtures.metadata(record);
        const command=contract.command({scope:contract.scope(record),operationId:record.syntheticOperationId,baseRevision:String(record.stage),type:'items.renamed',payload:changes.between(base,prepared.metadata)});
        const session=e.cache.bind({scope:record,contextId:'pending-test',generation:1,isCurrent:()=>true});
        await session.exclusive(()=>{session.read();session.prepare({base,prepared,command,intent:{type:command.type,ids:['boundary-shared-entry']}});});
        const cache=e.storage.getItem(e.cache.key(record)),writes=e.storage.writes.length,calls=e.fixture.calls.length;
        await assert.rejects(e.diagnostic.verifyExistingA(),{code:'BOUNDARY_PENDING_REVIEW_REQUIRED'});
        assert.equal(e.storage.getItem(e.cache.key(record)),cache);assert.equal(e.storage.writes.length,writes);
        assert.ok(e.fixture.calls.slice(calls).every(r=>r.name!=='cosmifold_commit_metadata'&&r.params?.p_operation_id!==record.syntheticOperationId));
    }finally{e.diagnostic.dispose();}
});
test('account A -> B -> A generation change fences a held A result even when user identity returns to A',async()=>{
    const e=environment();let manager,release;
    try{await e.diagnostic.prepareA();const [a1,a2]=e.records();let captured;
        const received=new Promise(resolve=>captured=resolve),gate=new Promise(resolve=>release=resolve),events=[];
        const delayed={...e.gateway,async readUniverse(scope){const result=await e.gateway.readUniverse(scope);if(scope.universeId===a1.universeId){captured();await gate;}return result;}};
        manager=e.get('createCloudWorkspace')({auth:e.auth,gateway:delayed,cache:e.cache});manager.subscribe(state=>events.push(plain(state)));
        const before=e.storage.getItem(e.cache.key(a1)),opening=manager.bootstrap(a1.universeId);await received;const generation=manager.getState().generation;
        e.fixture.switchUser(e.fixture.B);e.fixture.switchUser(e.fixture.A);assert.ok(manager.getState().generation>generation);
        assert.equal((await manager.bootstrap(a2.universeId)).status,'loaded');const afterSwitch=e.storage.getItem(e.cache.key(a2));release();
        assert.equal((await opening).status,'disposed');assert.equal(e.storage.getItem(e.cache.key(a1)),before);assert.equal(e.storage.getItem(e.cache.key(a2)),afterSwitch);
        assert.ok(events.filter(s=>s.status==='loaded').every(s=>s.scope.universeId===a2.universeId));assert.equal(manager.load().entries[0].name,'Boundary A2');
    }finally{release?.();manager?.dispose();e.diagnostic.dispose();}
});
test('raw HTTP diagnostic also rejects an A -> B -> A result instead of accepting the returned original user ID',async()=>{
    const e=environment();let release;
    try{await e.auth.initialize();let captured;const received=new Promise(resolve=>captured=resolve),gate=new Promise(resolve=>release=resolve);
        const fetch=e.get('globalThis').fetch;const heldFetch=async(...args)=>{const response=await fetch(...args);captured();await gate;return response;};
        const http=e.get('createCloudBoundaryHttp')({fetch:heldFetch});
        const reading=http.rpc('cosmifold_list_universes',{});await received;e.fixture.switchUser(e.fixture.B);e.fixture.switchUser(e.fixture.A);release();
        await assert.rejects(reading,error=>error.code==='ACCOUNT_CHANGED_DURING_HTTP_CHECK');http.dispose();
    }finally{release?.();e.diagnostic.dispose();}
});
test('cleanup cannot target arbitrary metadata and public OpenAPI excludes every installed private helper',()=>{
    const e=environment();try{
        const sql=fs.readFileSync('supabase/migrations/202610120001_cloud_metadata.sql','utf8');
        const installed=[...sql.matchAll(/create function cosmifold_private\.([a-z0-9_]+)/g)].map(match=>match[1]);
        assert.deepEqual(plain(e.get('cloudBoundarySurface').privateFunctions).sort(),installed.sort());
    }finally{e.diagnostic.dispose();}
});
test('privacy requires precise exclusion, stops on exposed schema or constraint errors, and rejects extra public RPCs',async()=>{
    for(const [property,code] of [['exposedTable','PRIVATE_SCHEMA_HTTP_EXCLUSION_NOT_PROVEN'],['wrongRestError','PRIVATE_SCHEMA_HTTP_EXCLUSION_NOT_PROVEN'],['extraRpc','UNEXPECTED_COSMIFOLD_RPC_SURFACE']]){
        const e=environment();try{await e.diagnostic.prepareA();e.fixture[property]=true;
            await assert.rejects(e.diagnostic.privacy(),error=>error.code===code);assert.equal(e.fixture.rows.size,2);
        }finally{e.diagnostic.dispose();}
    }
});
test('GraphQL reports observed unavailability, rejects exposed types/nodes and never treats blocked introspection as proof',async()=>{
    for(const [state,code] of [['exposed','PRIVATE_GRAPHQL_TYPE_EXPOSED'],['node-exposed','PRIVATE_GRAPHQL_NODE_EXCLUSION_NOT_PROVEN'],['blocked-introspection','GRAPHQL_INTROSPECTION_BLOCKED'],['unavailable',null],['anonymous-denied',null]]){
        const e=environment();try{await e.diagnostic.prepareA();e.fixture.graphqlState=state;
            if(code)await assert.rejects(e.diagnostic.privacy(),error=>error.code===code);
            else{const result=await e.diagnostic.privacy();
                if(state==='unavailable'){assert.equal(result.graphql.authenticated.state,'endpoint-unavailable');assert.ok(e.messages.some(m=>m.startsWith('REVIEW: GraphQL HTTP 404')));}
                else{assert.equal(result.graphql.anonymous.state,'anonymous-denied');assert.equal(result.graphql.authenticated.state,'schema-inspected-private-excluded');}}
        }finally{e.diagnostic.dispose();}
    }
});
test('anonymous/authenticated REST read and every mutation method use private profile; anonymous has no Authorization',async()=>{
    const e=environment();try{await e.diagnostic.prepareA();await e.diagnostic.privacy();
        const requests=e.fixture.calls.filter(c=>c.source==='http'&&c.profile==='cosmifold_private');assert.equal(requests.length,48);
        for(const actor of [null,e.fixture.A])for(const method of ['GET','POST','PATCH','DELETE'])assert.equal(requests.filter(c=>c.actor===actor&&c.method===method).length,6);
        const names=new Set(e.fixture.calls.filter(c=>c.source==='http'&&c.path.startsWith('/rest/v1/rpc/')).map(c=>c.path.split('/').at(-1)));
        assert.deepEqual([...names].sort(),[...plain(e.get('cloudBoundarySurface').rpcs),...plain(e.get('cloudBoundarySurface').privateFunctions)].sort());
    }finally{e.diagnostic.dispose();}
});

test('GraphQL failures distinguish blocked introspection, malformed field shape and HTTP failure without changing fixtures',async()=>{
    for(const [state,path,httpStatus,blocked] of [['blocked-introspection','errors',200,true],
        ['malformed-introspection','data.__schema.queryType.fields',200,false],['failed-introspection','HTTP status',503,false]]){
        const e=environment();try{
            await e.diagnostic.prepareA();const before=JSON.stringify(e.records()),marker=e.markers.getItem('cosmifold:dev:cloud-boundary:v1');
            const rows=JSON.stringify([...e.fixture.rows]),receipts=e.fixture.receipts.size;e.fixture.graphqlState=state;
            await assert.rejects(e.diagnostic.privacy(),error=>{
                assert.equal(error.code,blocked?'GRAPHQL_INTROSPECTION_BLOCKED':'GRAPHQL_INTROSPECTION_UNVERIFIED');
                assert.equal(error.graphqlFailure.path,path);assert.equal(error.graphqlFailure.httpStatus,httpStatus);
                assert.equal(error.graphqlFailure.controlQueryType,'Query');
                const text=e.get('cloudBoundaryGraphqlRejection')(error);
                assert.ok(text.includes('rejected '+path));assert.ok(text.includes('not privacy proof'));
                if(blocked)assert.ok(text.includes('Unknown field "__schema"'));
                return true;
            });
            assert.equal(JSON.stringify(e.records()),before);assert.equal(e.markers.getItem('cosmifold:dev:cloud-boundary:v1'),marker);
            assert.equal(JSON.stringify([...e.fixture.rows]),rows);assert.equal(e.fixture.receipts.size,receipts);
        }finally{e.diagnostic.dispose();}
    }
});

test('GraphQL failure output redacts credentials and never serializes response data',()=>{
    const e=environment();try{
        const text=e.get('cloudBoundaryGraphqlRejection')({graphqlFailure:{actor:'anonymous',state:'unverified',path:'errors',httpStatus:200,
            errorMessages:['Bearer TOKEN sb_secret_SECRET'],data:{privateNotes:'DO_NOT_PRINT'}}});
        assert.ok(!text.includes('TOKEN'));assert.ok(!text.includes('sb_secret_SECRET'));assert.ok(!text.includes('DO_NOT_PRINT'));
    }finally{e.diagnostic.dispose();}
});

test('disabled GraphQL needs fresh catalog and all HTTP probes; preserves fixture marker and state',async()=>{
    const e=environment();try{
        await e.diagnostic.prepareA();e.fixture.graphqlState='disabled-engine';
        await assert.rejects(e.diagnostic.privacy(),error=>error.code==='GRAPHQL_DISABLED_UNVERIFIED'&&error.graphqlFailure.path==='catalog');
        e.diagnostic.acceptGraphqlAudit(JSON.stringify([{cloud_graphql_surface_audit:e.fixture.graphqlAudit()}]));
        const marker=e.markers.getItem('cosmifold:dev:cloud-boundary:v1'),rows=JSON.stringify([...e.fixture.rows]),receipts=e.fixture.receipts.size;
        const result=await e.diagnostic.privacy();
        for(const actor of ['anonymous','authenticated']){
            assert.equal(result.graphql[actor].state,'disabled-independently-verified');assert.ok(result.graphql[actor].probeCount>40);
        }
        assert.equal(e.markers.getItem('cosmifold:dev:cloud-boundary:v1'),marker);
        assert.equal(JSON.stringify([...e.fixture.rows]),rows);assert.equal(e.fixture.receipts.size,receipts);
        const queries=e.fixture.calls.filter(c=>c.path==='/graphql/v1').map(c=>c.query||'');
        assert.ok(queries.some(q=>q.includes('cosmifold_private_entriesCollection')));
        assert.ok(queries.some(q=>q.includes('node(nodeId:')));assert.ok(queries.some(q=>q.includes('assert_integrity')));
    }finally{e.diagnostic.dispose();}
});

test('installed extension, callable wrapper or accessible GraphQL relation blocks disabled-engine proof',async()=>{
    for(const kind of ['extension','anonymous-wrapper','authenticated-wrapper','relation']){
        const e=environment();try{
            await e.diagnostic.prepareA();e.fixture.graphqlState='disabled-engine';const audit=e.fixture.graphqlAudit();
            if(kind==='extension'){audit.extensionInstalled=true;audit.extensionVersion='1.6.0';}
            else if(kind==='relation')audit.browserAccessibleRelations=[{schema:'graphql_public',name:'unexpected'}];
            else audit.functions=[{schema:'graphql_public',name:'graphql',arguments:'query text',result:'jsonb',securityDefiner:false,
                anonymousExecute:kind==='anonymous-wrapper',authenticatedExecute:kind==='authenticated-wrapper',anonymousUsage:true,authenticatedUsage:true,publicExecute:false}];
            e.diagnostic.acceptGraphqlAudit(audit);
            await assert.rejects(e.diagnostic.privacy(),error=>error.code==='GRAPHQL_DISABLED_UNVERIFIED'&&error.graphqlFailure.path.startsWith('catalog.'));
            assert.equal(e.fixture.rows.size,2);
        }finally{e.diagnostic.dispose();}
    }
});

test('GraphQL catalog rejects malformed, stale, unsupported and duplicate identities without accepting incomplete proof',()=>{
    const e=environment();try{
        for(const change of [a=>{a.auditVersion=2;},a=>{a.checkedAt='2000-01-01';},a=>{delete a.functions;},
            a=>{a.extensionInstalled='false';},a=>{a.extensionVersion='1.6.0';},
            a=>{a.schemas=[{name:'graphql_public',anonymousUsage:false,authenticatedUsage:false},{name:'graphql_public',anonymousUsage:false,authenticatedUsage:false}];}]){
            const audit=e.fixture.graphqlAudit();change(audit);
            assert.throws(()=>e.diagnostic.acceptGraphqlAudit(audit),error=>error.code==='INVALID_GRAPHQL_SURFACE_AUDIT'&&Boolean(error.auditFailure.path));
        }
        assert.throws(()=>e.diagnostic.acceptGraphqlAudit([{cloud_graphql_surface_audit:e.fixture.graphqlAudit(),other:1}]),{code:'INVALID_GRAPHQL_SURFACE_AUDIT'});
    }finally{e.diagnostic.dispose();}
});

test('disabled catalog cannot override a changed/available HTTP surface',async()=>{
    const e=environment();try{
        await e.diagnostic.prepareA();e.diagnostic.acceptGraphqlAudit(e.fixture.graphqlAudit());e.fixture.graphqlState='disabled-engine';
        e.fixture.graphqlProbeMismatch=true;
        await assert.rejects(e.diagnostic.privacy(),error=>error.code==='GRAPHQL_DISABLED_UNVERIFIED'&&error.graphqlFailure.path==='HTTP.probes[0]');
    }finally{e.diagnostic.dispose();}
});

test('GraphQL catalog SQL is read-only and inventories extension plus effective wrapper/function/table access',()=>{
    const sql=fs.readFileSync('tests/database/cloud-graphql-surface-audit.sql','utf8').replace(/--[^\n]*/g,'');
    assert.doesNotMatch(sql,/\b(create|alter|drop|insert|update|delete|grant|revoke|comment|set|notify)\s/i);
    assert.match(sql,/pg_extension where extname='pg_graphql'/);assert.match(sql,/pg_get_function_identity_arguments/);
    assert.match(sql,/p\.proname ~\* 'graphql'/);assert.match(sql,/has_function_privilege\('anon'/);
    assert.match(sql,/has_function_privilege\('authenticated'/);assert.match(sql,/has_schema_privilege/);
    assert.match(sql,/aclexplode/);assert.match(sql,/has_any_column_privilege/);
    assert.match(sql,/as cloud_graphql_surface_audit/);
});

test('exact GraphQL helper inspection reads type/ACL/body/event/dependency facts without invoking helper or changing state',()=>{
    const sql=fs.readFileSync('tests/database/cloud-graphql-helper-audit.sql','utf8').replace(/--[^\n]*/g,'');
    assert.match(sql,/to_regprocedure\('extensions\.grant_pg_graphql_access\(\)'\)/);
    assert.doesNotMatch(sql,/(?:select|perform|call)\s+extensions\.grant_pg_graphql_access\s*\(/i);
    assert.doesNotMatch(sql,/^\s*(?:create|alter|drop|grant|revoke|set|insert|update|delete|truncate|begin|commit)\b/im);
    for(const field of ['signature','owner','language','languageHandler','securityDefiner','volatility','rolePrivileges',
        'publicExecute','explicitAcl','aclSource','proconfig','fixedSearchPath','definition','body','eventTriggers',
        'dependencies','triggerContextOnly','allRelatedFunctions','browserGrantQualifiedFunctions','stateChangingTextIndicators'])assert.ok(sql.includes("'"+field+"'"),field);
    assert.match(sql,/pg_get_functiondef\(p\.oid\)/);assert.match(sql,/pg_event_trigger t where t\.evtfoid=p\.oid/);
    assert.match(sql,/p\.lanname='plpgsql'/);assert.match(sql,/'pg_catalog\.event_trigger'::regtype/);
    assert.match(sql,/aclexplode\(p\.proacl\)/);assert.match(sql,/acldefault\('f',p\.proowner\)/);
    assert.match(sql,/r\.rolname in \('anon','authenticated','service_role'\)/);
    assert.match(sql,/membership\.deptype='e' and e\.extname='pg_graphql'/);
    assert.match(sql,/from facts where oid=\(select oid from exact_target\)/);
});

test('helper name/event-trigger result does not itself bypass the existing GraphQL gate before live inspection review',async()=>{
    const e=environment();try{
        await e.diagnostic.prepareA();e.fixture.graphqlState='disabled-engine';const audit=e.fixture.graphqlAudit();
        audit.functions=[{schema:'extensions',name:'grant_pg_graphql_access',arguments:'',result:'event_trigger',securityDefiner:false,
            anonymousExecute:true,authenticatedExecute:true,anonymousUsage:true,authenticatedUsage:true,publicExecute:true}];
        e.diagnostic.acceptGraphqlAudit(audit);
        await assert.rejects(e.diagnostic.privacy(),error=>error.code==='GRAPHQL_DISABLED_UNVERIFIED'&&
            error.graphqlFailure.path==='catalog.functions(extensions.grant_pg_graphql_access())');
        assert.equal(e.fixture.rows.size,2);
    }finally{e.diagnostic.dispose();}
});

test('exact stock disabled configuration requires both catalogs and both HTTP callers, preserving A1/A2',async()=>{
    const e=environment();try{
        await e.diagnostic.prepareA();e.fixture.graphqlState='disabled-engine';
        e.diagnostic.acceptGraphqlAudit(e.fixture.stockSurfaceAudit());
        await assert.rejects(e.diagnostic.privacy(),{code:'GRAPHQL_DISABLED_UNVERIFIED'});
        e.diagnostic.acceptGraphqlHelperAudit(JSON.stringify([{cloud_graphql_helper_inspection:e.fixture.stockInspection()}]));
        const marker=e.markers.getItem(e.diagnostic.markerKey),rows=JSON.stringify([...e.fixture.rows]),receipts=e.fixture.receipts.size;
        const result=await e.diagnostic.privacy();
        for(const role of ['anonymous','authenticated'])assert.equal(result.graphql[role].state,'disabled-independently-verified');
        assert.equal(e.markers.getItem(e.diagnostic.markerKey),marker);assert.equal(JSON.stringify([...e.fixture.rows]),rows);assert.equal(e.fixture.receipts.size,receipts);
    }finally{e.diagnostic.dispose();}
});

test('stock proof rejects modified bodies, ordinary trigger impostors, extra routines, definer mode and incorrect registrations',()=>{
    const e=environment();try{
        for(const change of [
            a=>{a.extensionInstalled=true;a.extensionVersion='1.6.0';},
            a=>{a.checkedAt='2000-01-01';},
            a=>{a.allRelatedFunctions.push({...a.allRelatedFunctions[2],name:'extra'});},
            a=>{a.allRelatedFunctions[0].result='void';},
            a=>{a.allRelatedFunctions[0].language='sql';},
            a=>{a.allRelatedFunctions[0].owner='authenticated';},
            a=>{a.allRelatedFunctions[0].proconfig=null;a.allRelatedFunctions[0].fixedSearchPath=null;},
            a=>{a.allRelatedFunctions[1].eventTriggers[0].tags=['CREATE FUNCTION'];},
            a=>{a.allRelatedFunctions[1].body+=' perform arbitrary_side_effect();';},
            a=>{a.allRelatedFunctions[2].securityDefiner=true;},
            a=>{a.allRelatedFunctions[2].body=a.allRelatedFunctions[2].body.replace('select version()','select private_secret()');},
            a=>{a.allRelatedFunctions[2].body+=' execute query;';},
            a=>{a.allRelatedFunctions[2].body+=' grant execute on function private_helper() to anon;';},
            a=>{a.allRelatedFunctions[2].stateChangingTextIndicators.dataWrites=true;},
            a=>{a.allRelatedFunctions[2].identityArguments='query text';},
            a=>{a.allRelatedFunctions[2].rolePrivileges[0].superuser=true;},
            a=>{a.exactTarget.body='not the inventory';},
            a=>{a.browserGrantQualifiedFunctions=[];}
        ]){
            const audit=e.fixture.stockInspection();change(audit);
            assert.throws(()=>e.diagnostic.acceptGraphqlHelperAudit(audit),error=>error.code==='INVALID_GRAPHQL_STOCK_PROOF'&&!!error.auditFailure.path);
        }
    }finally{e.diagnostic.dispose();}
});

test('stock body tokens allow formatting/comments only, preserving string contents and rejecting added statements',()=>{
    const e=environment();try{
        const tokens=e.get('cloudGraphqlStockTokens'),stock=e.get('cloudGraphqlStock');
        assert.equal(tokens(stock.placeholder),tokens(' -- stock formatting\n'+stock.placeholder.replace(/BEGIN/g,'begin').replace(/; /g,';\n')));
        assert.notEqual(tokens(stock.placeholder),tokens(stock.placeholder.replace('extension is not enabled.','extension is enabled.')));
        assert.notEqual(tokens(stock.placeholder),tokens(stock.placeholder+'; select stolen_data();'));
    }finally{e.diagnostic.dispose();}
});

test('pasted live grant body differs only by pg_catalog qualification and matches an explicitly reviewed exact variant',async()=>{
    const e=environment();try{
        const body=fs.readFileSync('tests/cloud-graphql-grant-body.txt','utf8'),tokens=e.get('cloudGraphqlStockTokens'),stock=e.get('cloudGraphqlStock');
        assert.notEqual(tokens(body),tokens(stock.grant));
        assert.equal(tokens(body.replace('pg_catalog.pg_event_trigger_ddl_commands()','pg_event_trigger_ddl_commands()')),tokens(stock.grant));
        await e.diagnostic.prepareA();e.fixture.graphqlState='disabled-engine';e.diagnostic.acceptGraphqlAudit(e.fixture.stockSurfaceAudit());
        const inspection=e.fixture.stockInspection();
        inspection.exactTarget.body=body;inspection.allRelatedFunctions[0].body=body;inspection.browserGrantQualifiedFunctions[0].body=body;
        assert.equal(e.diagnostic.acceptGraphqlHelperAudit(inspection).grantBodyVariant,'catalog-qualified-ddl-helper');
        const marker=e.markers.getItem(e.diagnostic.markerKey),rows=JSON.stringify([...e.fixture.rows]),receipts=e.fixture.receipts.size;
        const result=await e.diagnostic.privacy();
        for(const actor of ['anonymous','authenticated'])assert.equal(result.graphql[actor].state,'disabled-independently-verified');
        assert.equal(e.markers.getItem(e.diagnostic.markerKey),marker);assert.equal(JSON.stringify([...e.fixture.rows]),rows);assert.equal(e.fixture.receipts.size,receipts);
    }finally{e.diagnostic.dispose();}
});

test('reviewed qualification variant rejects any other schema/call/statement/grant change',()=>{
    const e=environment();try{
        const body=fs.readFileSync('tests/cloud-graphql-grant-body.txt','utf8');
        for(const modified of [body.replace('pg_catalog.pg_event_trigger_ddl_commands','public.pg_event_trigger_ddl_commands'),
            body.replace('pg_catalog.pg_extension','public.pg_extension'),body.replace('select graphql.resolve','select public.resolve'),
            body+' perform unreviewed_call();',body.replace('to postgres with grant option','to authenticated with grant option')]){
            const inspection=e.fixture.stockInspection();inspection.allRelatedFunctions[0].body=modified;
            assert.throws(()=>e.diagnostic.acceptGraphqlHelperAudit(inspection),error=>error.code==='INVALID_GRAPHQL_STOCK_PROOF'&&error.auditFailure.path.endsWith('.body'));
        }
    }finally{e.diagnostic.dispose();}
});

test('live set-helper body differs only by the fixed empty path clause and accepts both reviewed variants',()=>{
    const e=environment();try{
        const body=fs.readFileSync('tests/cloud-graphql-set-body.txt','utf8'),stock=e.get('cloudGraphqlStock'),tokens=e.get('cloudGraphqlStockTokens');
        assert.notEqual(tokens(body),tokens(stock.set));
        assert.equal(tokens(body.replace("set search_path to ''",'')),tokens(stock.set));
        assert.equal(e.diagnostic.acceptGraphqlHelperAudit(e.fixture.stockInspection()).setBodyVariant,'schema-17-default-placeholder-path');
        const inspection=e.fixture.stockInspection();inspection.allRelatedFunctions[1].body=body;inspection.browserGrantQualifiedFunctions[1].body=body;
        assert.equal(e.diagnostic.acceptGraphqlHelperAudit(inspection).setBodyVariant,'fixed-empty-placeholder-path');
    }finally{e.diagnostic.dispose();}
});

test('both pasted live helper variants pass the full strict disabled proof without changing A1/A2 or caches',async()=>{
    const e=environment();try{
        await e.diagnostic.prepareA();e.fixture.graphqlState='disabled-engine';e.diagnostic.acceptGraphqlAudit(e.fixture.stockSurfaceAudit());
        const inspection=e.fixture.stockInspection(),grant=fs.readFileSync('tests/cloud-graphql-grant-body.txt','utf8'),set=fs.readFileSync('tests/cloud-graphql-set-body.txt','utf8');
        inspection.exactTarget.body=grant;inspection.allRelatedFunctions[0].body=grant;inspection.browserGrantQualifiedFunctions[0].body=grant;
        inspection.allRelatedFunctions[1].body=set;inspection.browserGrantQualifiedFunctions[1].body=set;
        const proof=e.diagnostic.acceptGraphqlHelperAudit(inspection);
        assert.equal(proof.grantBodyVariant,'catalog-qualified-ddl-helper');assert.equal(proof.setBodyVariant,'fixed-empty-placeholder-path');
        const marker=e.markers.getItem(e.diagnostic.markerKey),rows=JSON.stringify([...e.fixture.rows]),receipts=e.fixture.receipts.size,writes=e.storage.writes.length;
        const result=await e.diagnostic.privacy();
        for(const actor of ['anonymous','authenticated'])assert.equal(result.graphql[actor].state,'disabled-independently-verified');
        assert.equal(e.markers.getItem(e.diagnostic.markerKey),marker);assert.equal(JSON.stringify([...e.fixture.rows]),rows);
        assert.equal(e.fixture.receipts.size,receipts);assert.equal(e.storage.writes.length,writes);
    }finally{e.diagnostic.dispose();}
});

test('set-helper hardening variant rejects alternate paths and all other body changes',()=>{
    const e=environment();try{
        const body=fs.readFileSync('tests/cloud-graphql-set-body.txt','utf8');
        for(const modified of [body.replace("set search_path to ''","set search_path to 'public'"),
            body.replace("set search_path to ''","set search_path to 'pg_catalog'"),
            body.replace('select version()','select application_secret()'),body.replace('language plpgsql','language plpgsql security definer'),
            body+' perform unreviewed_side_effect();',body.replace("'pg_graphql extension is not enabled.'","'changed response'")]){
            const inspection=e.fixture.stockInspection();inspection.allRelatedFunctions[1].body=modified;
            assert.throws(()=>e.diagnostic.acceptGraphqlHelperAudit(inspection),error=>error.code==='INVALID_GRAPHQL_STOCK_PROOF'&&error.auditFailure.path==='functions(extensions.set_graphql_placeholder).body');
        }
    }finally{e.diagnostic.dispose();}
});

test('stock mismatch reports the first normalized differing tokens without accepting a variant or exposing SQL literals',()=>{
    const e=environment();try{
        const audit=e.fixture.stockInspection();audit.allRelatedFunctions[0].body='DECLARE unexpected text; '+audit.allRelatedFunctions[0].body;
        assert.throws(()=>e.diagnostic.acceptGraphqlHelperAudit(audit),error=>{
            assert.equal(error.code,'INVALID_GRAPHQL_STOCK_PROOF');
            assert.equal(error.auditFailure.path,'functions(extensions.grant_pg_graphql_access).body');
            assert.equal(error.auditFailure.actual.firstDifferingToken,0);
            assert.equal(error.auditFailure.actual.expectedContext[0],'begin');assert.equal(error.auditFailure.actual.receivedContext[0],'declare');
            return true;
        });
        const diff=e.get('cloudGraphqlStockDifference')("return 'expected';","return 'PRIVATE_LITERAL';");
        assert.equal(diff.firstDifferingToken,1);assert.equal(diff.receivedContext[1],'[SQL string literal withheld]');
        assert.ok(!JSON.stringify(diff).includes('PRIVATE_LITERAL'));
        const stock=e.get('cloudGraphqlStock'),tokens=e.get('cloudGraphqlStockTokens');
        assert.equal(tokens(stock.grant),tokens(' -- cosmetic comment\n'+stock.grant.replace(/begin/,'BEGIN')));
    }finally{e.diagnostic.dispose();}
});

test('helper body rejection preserves the already accepted unrelated API and GraphQL surface inventories',async()=>{
    const e=environment();try{
        await e.diagnostic.prepareA();e.fixture.graphqlState='disabled-engine';
        e.diagnostic.acceptGraphqlAudit(e.fixture.stockSurfaceAudit());
        const inspection=e.fixture.stockInspection();inspection.allRelatedFunctions[0].body+=' perform unreviewed_call();';
        assert.throws(()=>e.diagnostic.acceptGraphqlHelperAudit(inspection),{code:'INVALID_GRAPHQL_STOCK_PROOF'});
        await assert.rejects(e.diagnostic.privacy(),error=>error.code==='GRAPHQL_DISABLED_UNVERIFIED'&&
            error.graphqlFailure.path.startsWith('catalog.functions('));
        assert.ok(e.messages.some(message=>message.includes('exactly five approved public RPCs verified (manual-read-only-catalog)')));
    }finally{e.diagnostic.dispose();}
});

test('legacy stock disabled message requires the same complete exact stock proof',async()=>{
    const e=environment();try{
        await e.diagnostic.prepareA();e.fixture.graphqlState='disabled-engine';e.fixture.legacyDisabledMessage=true;
        e.diagnostic.acceptGraphqlAudit(e.fixture.stockSurfaceAudit());
        await assert.rejects(e.diagnostic.privacy(),{code:'GRAPHQL_INTROSPECTION_UNVERIFIED'});
        e.diagnostic.acceptGraphqlHelperAudit(e.fixture.stockInspection());
        assert.equal((await e.diagnostic.privacy()).graphql.authenticated.state,'disabled-independently-verified');
    }finally{e.diagnostic.dispose();}
});

test('stock proof never accepts mismatched surface grants, signatures, extra functions or relations',async()=>{
    for(const change of [a=>{a.functions[0].anonymousExecute=false;},a=>{a.functions[2].arguments='query text';},
        a=>{a.functions.push({...a.functions[2],name:'extra_graphql'});},a=>{a.browserAccessibleRelations=[{schema:'graphql_public',name:'data'}];}]){
        const e=environment();try{
            await e.diagnostic.prepareA();e.fixture.graphqlState='disabled-engine';e.diagnostic.acceptGraphqlHelperAudit(e.fixture.stockInspection());
            const audit=e.fixture.stockSurfaceAudit();change(audit);e.diagnostic.acceptGraphqlAudit(audit);
            await assert.rejects(e.diagnostic.privacy(),{code:'GRAPHQL_DISABLED_UNVERIFIED'});
        }finally{e.diagnostic.dispose();}
    }
});
test('restricted OpenAPI is not a pass without exhaustive read-only catalog evidence; replay preserves marker and fixtures after refresh',async()=>{
    const e=environment();let resumed;
    try{
        await e.diagnostic.prepareA();const markerKey=e.diagnostic.markerKey,marker=e.markers.getItem(markerKey);
        const rows=plain([...e.fixture.rows]),receiptCount=e.fixture.receipts.size,allocated=e.fixture.rows.size;
        assert.throws(()=>e.diagnostic.acceptSurfaceAudit('{}'));
        await assert.rejects(e.diagnostic.privacy(),error=>error.code==='API_SURFACE_AUDIT_REQUIRED'&&error.httpStatus===403);
        assert.equal(e.markers.getItem(markerKey),marker);assert.deepEqual(plain([...e.fixture.rows]),rows);
        // A new controller corresponds to refreshing the page; it uses the same marker and SDK identity.
        resumed=e.get('createCloudBoundaryDiagnostic')({auth:e.auth,gateway:e.gateway,http:e.http,cache:e.cache,markers:()=>e.markers});
        resumed.acceptSurfaceAudit(e.fixture.audit());const result=await resumed.privacy();assert.equal(result.status,'privacy-checked');
        assert.equal(e.markers.getItem(markerKey),marker);assert.deepEqual(plain([...e.fixture.rows]),rows);assert.equal(e.fixture.rows.size,allocated);
        assert.equal(e.fixture.receipts.size,receiptCount);assert.ok(e.messages.length);
    }finally{resumed?.dispose();e.diagnostic.dispose();}
});
test('read-only inventory rejects extra functions, overloads, helpers, public relations, anonymous grants and DEFINER functions',()=>{
    const e=environment();try{
        for(const change of [a=>a.publicFunctions.push({...a.publicFunctions[0],name:'surprise'}),a=>a.publicFunctions.push(a.publicFunctions[0]),
            a=>a.publicFunctions[0].securityDefiner=true,a=>a.publicFunctions[0].anonymous=true,a=>a.publicFunctions[0].arguments='unexpected text',
            a=>a.publicRelations.push('entries'),a=>a.privateTables[0].rlsForced=false,a=>a.unexpected='extra']){
            const audit=e.fixture.audit();change(audit);assert.throws(()=>e.diagnostic.acceptSurfaceAudit(audit));
        }
        const sql=fs.readFileSync('tests/database/cloud-api-surface-audit.sql','utf8');
        assert.match(sql,/pg_proc/);assert.match(sql,/has_function_privilege/);assert.match(sql,/has_table_privilege/);
        assert.equal(/^\s*(create|alter|insert|update|delete|drop|truncate|grant|revoke)\b/im.test(sql),false);
        assert.equal(/from\s+(cosmifold_private\.|auth\.users)/i.test(sql),false);
    }finally{e.diagnostic.dispose();}
});
test('canonical SQL JSONB object and exact SQL Editor row/column exports share the same strict representation',()=>{
    const e=environment();try{
        const audit=e.fixture.audit(),cell=JSON.stringify(audit);
        for(const input of [audit,cell,{cloud_api_surface_audit:audit},JSON.stringify([{cloud_api_surface_audit:audit}]),
            JSON.stringify([{cloud_api_surface_audit:cell}]),JSON.stringify(cell)]){
            assert.equal(e.diagnostic.acceptSurfaceAudit(input).checkedAt,audit.checkedAt);
        }
        for(const input of [[audit],[{cloud_api_surface_audit:audit},{cloud_api_surface_audit:audit}],
            [{cloud_api_surface_audit:audit,extra:'do not discard'}],{cloud_api_surface_audit:{...audit,publicRelations:['entries']}}])
            assert.throws(()=>e.diagnostic.acceptSurfaceAudit(input));
        let executed=false;const bad={get cloud_api_surface_audit(){executed=true;return audit;}};
        assert.throws(()=>e.diagnostic.acceptSurfaceAudit(bad));assert.equal(executed,false);
    }finally{e.diagnostic.dispose();}
});
test('every security predicate identifies the exact rejected path and preserves strict acceptance',()=>{
    const e=environment();try{
        const cases=[
            [a=>a.privateSchemaExists=false,'privateSchemaExists'],
            [a=>a.publicRelations=['entries'],'publicRelations'],
            [a=>a.publicFunctions[0].arguments='bad arguments','publicFunctions[0](cosmifold_list_universes).arguments'],
            [a=>a.publicFunctions[0].authenticated=false,'publicFunctions[0](cosmifold_list_universes).authenticated'],
            [a=>a.publicFunctions[0].anonymous=true,'publicFunctions[0](cosmifold_list_universes).anonymous'],
            [a=>a.publicFunctions[0].securityDefiner=true,'publicFunctions[0](cosmifold_list_universes).securityDefiner'],
            [a=>a.privateTables[0].rlsEnabled=false,'privateTables[0](universes).rlsEnabled'],
            [a=>a.privateTables[0].rlsForced=false,'privateTables[0](universes).rlsForced'],
            [a=>a.publicFunctions.push({...a.publicFunctions[0],name:'unexpected_rpc'}),'publicFunctions.name'],
            [a=>a.privateTables.pop(),'privateTables.name'],
            [a=>a.privateTables[0].name='duplicate','privateTables.name'],
            [a=>a.publicFunctions[0].anonymous='false','publicFunctions[0](cosmifold_list_universes).anonymous']
        ];
        for(const [mutate,path] of cases){const audit=e.fixture.audit();mutate(audit);assert.throws(()=>e.diagnostic.acceptSurfaceAudit(audit),error=>{
            assert.equal(error.auditFailure.path,path);const message=e.get('cloudBoundaryAuditRejection')(error);
            assert.ok(message.includes(path));assert.ok(message.includes('Expected'));assert.ok(message.includes('received'));return true;
        });}
        assert.throws(()=>e.diagnostic.acceptSurfaceAudit('{not json'),error=>error.auditFailure.path==='$'&&error.auditFailure.condition==='invalid JSON');
        const audit=e.fixture.audit();audit.publicFunctions[0].arguments='sb_secret_TEST_SECRET';
        assert.throws(()=>e.diagnostic.acceptSurfaceAudit(audit),error=>{assert.equal(e.get('cloudBoundaryAuditRejection')(error).includes('sb_secret_TEST_SECRET'),false);return true;});
    }finally{e.diagnostic.dispose();}
});
test('reported live canonical audit is correctly rejected because all five RPCs have effective anonymous execution',()=>{
    const e=environment();try{
        const reported=e.fixture.audit();reported.checkedAt='2026-10-13T17:33:43.208Z';
        reported.publicFunctions.sort((a,b)=>a.name.localeCompare(b.name));reported.privateTables.sort((a,b)=>a.name.localeCompare(b.name));
        reported.publicFunctions.forEach(fn=>fn.anonymous=true);
        assert.throws(()=>e.diagnostic.acceptSurfaceAudit(JSON.stringify(reported)),error=>{
            assert.equal(error.auditFailure.path,'publicFunctions[0](cosmifold_commit_metadata).anonymous');
            assert.equal(error.auditFailure.expected,false);assert.equal(error.auditFailure.actual,true);
            assert.match(e.get('cloudBoundaryAuditRejection')(error),/Expected false; received true/);return true;
        });
        const sql=fs.readFileSync('tests/database/cloud-api-function-grant-audit.sql','utf8');
        assert.match(sql,/aclexplode/);assert.match(sql,/pg_has_role/);assert.match(sql,/rolsuper/);
        assert.equal(/^\s*(grant|revoke|alter|create|drop|delete|update|insert)\b/im.test(sql),false);
        assert.equal(/from\s+(cosmifold_private\.|auth\.users)/i.test(sql),false);
    }finally{e.diagnostic.dispose();}
});
test('malformed successful OpenAPI and unexpected HTTP failures remain unverified even with a valid audit',async()=>{
    const e=environment();try{
        await e.diagnostic.prepareA();e.fixture.openapiStatus=500;await assert.rejects(e.diagnostic.privacy(),error=>error.code==='OPENAPI_SURFACE_UNVERIFIED');
        e.fixture.openapiStatus=200;e.fixture.openapiMalformed=true;await assert.rejects(e.diagnostic.privacy(),error=>error.code==='OPENAPI_SURFACE_UNVERIFIED');
        e.fixture.openapiMalformed=false;assert.equal((await e.diagnostic.privacy()).status,'privacy-checked');
    }finally{e.diagnostic.dispose();}
});
test('loopback, unsigned identity, account mismatch and duplicate actions fail without creating foreign fixtures',async()=>{
    const e=environment();try{
        e.get('globalThis').location.hostname='tool-galaxy.pages.dev';await assert.rejects(e.diagnostic.prepareA(),error=>error.code==='LOCAL_DEVELOPMENT_ONLY');
        assert.equal(e.fixture.calls.length,0);e.get('globalThis').location.hostname='127.0.0.1';e.fixture.switchUser(null);
        await assert.rejects(e.diagnostic.prepareA(),error=>error.code==='SIGN_IN_LOCALLY_FIRST');e.fixture.switchUser(e.fixture.A);
        await e.diagnostic.prepareA();await assert.rejects(e.diagnostic.checkB(),error=>error.code==='SIGN_IN_AS_DIFFERENT_ACCOUNT_B');
        e.fixture.switchUser(e.fixture.B);await assert.rejects(e.diagnostic.prepareA(),error=>error.code==='USE_ORIGINAL_ACCOUNT_A');assert.equal(e.fixture.rows.size,2);
    }finally{e.diagnostic.dispose();}
});
test('cleanup guards exact owners, revisions, complete entry attributes and exact server-computed receipt digests before any delete',async()=>{
    const e=environment();try{await e.diagnostic.prepareA();const records=e.records(),sql=e.get('cloudBoundaryCleanup')(records);
        assert.match(sql,/begin;[\s\S]*for update[\s\S]*commit;/);assert.match(sql,/actual.owner_id/);assert.match(sql,/actual.snapshot_fields/);
        assert.match(sql,/to_jsonb\(e\)/);assert.match(sql,/archive_json/);assert.match(sql,/r\.request_digest=encode\(sha256/);
        assert.match(sql,/r\.acknowledgement=expected_receipt/);assert.match(sql,/Unexpected receipt count/);assert.match(sql,/test_universes_removed/);
        assert.ok(sql.indexOf('Receipt differs from exact fixture')<sql.indexOf('delete from'));
        assert.ok(records.every(r=>sql.includes(r.ownerUserId)&&sql.includes(r.universeId)&&sql.includes(r.operations[0])));
        assert.throws(()=>e.get('cloudBoundaryCleanup')([{...records[0],ownerUserId:"'; delete from auth.users; --"}]));
        assert.throws(()=>e.get('cloudBoundaryCleanup')([{...records[0],label:'real-private-name'}]));assert.throws(()=>e.get('cloudBoundaryCleanup')([records[0],records[0]]));
    }finally{e.diagnostic.dispose();}
});
test('diagnostic assets resolve; normal app/startup never references Phase A; page uses textContent only',()=>{
    const html=fs.readFileSync('dev/cloud-boundary-diagnostic.html','utf8');for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g))assert.ok(fs.existsSync(path.resolve('dev',match[1])));
    for(const file of ['index.html','startup.js','script.js'])assert.equal(fs.readFileSync(file,'utf8').includes('cloud-boundary'),false);
    assert.equal(/innerHTML|console\./.test(fs.readFileSync('dev/cloud-boundary-diagnostic-page.js','utf8')),false);
});
