// Shared Node/browser fixture. All SDK and fetch activity terminates here, never on a network.
function installCloudBoundaryFixture(){
    const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
    const listeners=new Set(),rows=new Map(),receipts=new Map(),commands=new Map(),calls=[];let current=A,clients=0;
    const copy=value=>JSON.parse(JSON.stringify(value)),session=()=>current?{user:{id:current,email:'fixture@example.invalid'},access_token:'FIXTURE_PRIVATE_TOKEN_'+current}:null;
    const response=(status,body)=>({status,async json(){return copy(body);}}),denied=()=>response(403,{code:'42501'});
    const fixture={A,B,rows,receipts,calls,graphqlState:'enabled',exposedTable:false,extraRpc:false,wrongRestError:false,openapiStatus:403,openapiMalformed:false,
        audit(){
            return {format:'cosmifold-api-surface-audit',auditVersion:1,checkedAt:new Date().toISOString(),privateSchemaExists:true,publicRelations:[],
                publicFunctions:cloudBoundarySurface.rpcs.map(name=>({name,arguments:cloudBoundarySurface.signatures[name],result:'jsonb',securityDefiner:false,authenticated:true,anonymous:false})),
                privateTables:cloudBoundarySurface.tables.map(name=>({name,rlsEnabled:true,rlsForced:true}))};},
        graphqlAudit(){return {format:'cosmifold-graphql-surface-audit',auditVersion:1,checkedAt:new Date().toISOString(),
            extensionInstalled:false,extensionVersion:null,schemas:[],functions:[],browserAccessibleRelations:[]};},
        stockInspection(){
            const specs=[['extensions','grant_pg_graphql_access','',cloudGraphqlStock.grant,'issue_pg_graphql_access','ddl_command_end','CREATE EXTENSION'],
                ['extensions','set_graphql_placeholder','',cloudGraphqlStock.set,'issue_graphql_placeholder','sql_drop','DROP EXTENSION'],
                ['graphql_public','graphql','"operationName" text, query text, variables jsonb, extensions jsonb',cloudGraphqlStock.placeholder]];
            const rows=specs.map(([schema,name,args,body,trigger,event,tag])=>({schema,name,signature:`${schema}.${name}(${trigger?'':'text,text,jsonb,jsonb'})`,
                identityArguments:args,result:trigger?'event_trigger':'jsonb',returnType:trigger?'event_trigger':'jsonb',owner:'supabase_admin',
                language:'plpgsql',languageHandler:'plpgsql_call_handler()',routineKind:'f',securityDefiner:false,volatility:'volatile',
                argumentCount:trigger?0:4,triggerContextOnly:!!trigger,publicExecute:true,
                rolePrivileges:['anon','authenticated','service_role'].map(role=>({role,effectiveExecute:true,schemaUsage:true,executeAndUsage:true,superuser:false,bypassRls:role==='service_role'})),
                aclSource:'PostgreSQL default ACL',explicitAcl:[],proconfig:name==='grant_pg_graphql_access'?['search_path=""']:null,
                fixedSearchPath:name==='grant_pg_graphql_access'?'search_path=""':null,definition:'fixture definition',body,
                stateChangingTextIndicators:{grants:!!trigger,schemaDDL:false,extensionDDL:name==='grant_pg_graphql_access',functionDDL:!!trigger,dataWrites:false,dynamicSQL:false},
                eventTriggers:trigger?[{name:trigger,owner:'supabase_admin',event,enabled:'O',tags:[tag]}]:[],dependencies:[]}));
            return {format:'cosmifold-graphql-helper-inspection',auditVersion:1,checkedAt:new Date().toISOString(),extensionInstalled:false,extensionVersion:null,
                targetExists:true,exactTarget:copy(rows[0]),allRelatedFunctions:rows,browserGrantQualifiedFunctions:copy(rows),limitations:'fixture'};
        },
        stockSurfaceAudit(){const inspection=this.stockInspection(),audit=this.graphqlAudit();
            audit.schemas=[{name:'graphql_public',anonymousUsage:true,authenticatedUsage:true}];
            audit.functions=inspection.allRelatedFunctions.map(row=>({schema:row.schema,name:row.name,arguments:row.identityArguments,result:row.result,securityDefiner:row.securityDefiner,
                anonymousExecute:true,authenticatedExecute:true,anonymousUsage:true,authenticatedUsage:true,publicExecute:true}));return audit;},
        get clients(){return clients;},switchUser(id){current=null;listeners.forEach(fn=>fn('SIGNED_OUT',null));current=id;
            if(id)listeners.forEach(fn=>fn('SIGNED_IN',session()));},current:()=>current};
    async function rpc(name,params,actor){
        if(!cloudBoundarySurface.rpcs.includes(name))return response(404,{code:'PGRST202'});
        if(!actor)return denied();
        if(name==='cosmifold_list_universes')return response(200,[...rows.values()].filter(row=>row.universe.owner_id===actor).map(row=>copy(row.universe)));
        if(name==='cosmifold_create_universe'){
            let row=rows.get(params.p_universe_id);
            if(row&&row.universe.owner_id!==actor)return denied();
            if(!row){row={format:'cosmifold-cloud-metadata',projectionVersion:1,storageVersion:5,universe:{id:params.p_universe_id,owner_id:actor,revision:'0'},
                snapshot_fields:{connections:true,portals:true,constellations:true,archivedGalaxies:true},entries:[],constellations:[],constellation_members:[],linked_placements:[]};rows.set(params.p_universe_id,row);}
            return response(200,row);
        }
        const command=params.p_command,scope=params.p_scope||command?.scope;
        if(scope.ownerUserId!==actor)return denied();
        const row=rows.get(scope.universeId),owned=row?.universe.owner_id===actor;
        if(name==='cosmifold_read_universe')return response(200,owned?{status:'found',metadata:copy(row)}:{status:'absent',metadata:null});
        if(name==='cosmifold_operation_receipt'){
            const stored=receipts.get(scope.universeId+':'+params.p_operation_id);
            return response(200,!owned?{status:'absent',acknowledgement:null}:stored?{status:'found',request_digest:'a'.repeat(64),acknowledgement:{...copy(stored),replayed:true}}:{status:'missing',acknowledgement:null});
        }
        if(name==='cosmifold_commit_metadata'){
            if(!owned)return response(400,{code:'CM007'});
            const key=scope.universeId+':'+command.operationId,previous=receipts.get(key);
            if(previous)return cosmifoldCloudChanges.equal(commands.get(key),command)?response(200,{...copy(previous),replayed:true}):response(400,{code:'CM004'});
            if(command.baseRevision!==row.universe.revision)return response(400,{code:'CM003'});
            row.entries=copy(command.payload.upsert.entries);row.universe.revision=(BigInt(row.universe.revision)+1n).toString();
            const ack={scope:copy(scope),operationId:command.operationId,baseRevision:command.baseRevision,revision:row.universe.revision,status:'committed',replayed:false,result:null};
            receipts.set(key,copy(ack));commands.set(key,copy(command));return response(200,ack);
        }
        return response(404,{code:'PGRST202'});
    }
    const client={auth:{async getSession(){return {data:{session:session()},error:null};},
        onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};},
        async signOut(){fixture.switchUser(null);return {data:{},error:null};}},
        schema(schema){return {rpc(name,params){return {retry:async retry=>{
            calls.push({source:'sdk',name,params:copy(params),actor:current,schema,retry});
            const value=await rpc(name,params,current),data=await value.json();return {status:value.status,data:value.status===200?data:null,error:value.status===200?null:data};
        }};}}}};
    globalThis.loadSupabaseAuthSDK=async()=>({createClient(){clients++;return client;}});
    globalThis.fetch=async(url,options={})=>{
        const path=new URL(url).pathname,actor=options.headers?.Authorization?.replace('Bearer FIXTURE_PRIVATE_TOKEN_','')||null;
        const body=options.body?JSON.parse(options.body):{};
        calls.push({source:'http',path,method:options.method,profile:options.headers['Accept-Profile']||options.headers['Content-Profile'],actor,
            ...(path==='/graphql/v1'?{query:body.query}:{})});
        if(path==='/rest/v1/'){
            if(fixture.extraRpc||fixture.openapiStatus===200)return response(200,fixture.openapiMalformed?{}:{paths:Object.fromEntries([...cloudBoundarySurface.rpcs,...(fixture.extraRpc?['cosmifold_unapproved']:[])].map(name=>['/rpc/'+name,{}]))});
            return response(fixture.openapiStatus,{message:'Secret API key required'});
        }
        if(path.startsWith('/rest/v1/rpc/'))return rpc(path.slice('/rest/v1/rpc/'.length),body,actor);
        if(path.startsWith('/rest/v1/')){
            if(options.headers['Accept-Profile']==='cosmifold_private'||options.headers['Content-Profile']==='cosmifold_private')
                return fixture.exposedTable?response(200,[]):fixture.wrongRestError?response(400,{code:'23514'}):response(406,{code:'PGRST106'});
            return response(404,{code:'PGRST205'});
        }
        if(path==='/graphql/v1'){
            if(fixture.graphqlProbeMismatch&&body.query.includes('BoundaryReachability'))return response(200,{data:{__typename:'Query'}});
            if(fixture.graphqlState==='disabled-engine')return response(200,{errors:[{message:fixture.legacyDisabledMessage?
                'pg_graphql is only available on projects running Postgres 14 onwards.':'pg_graphql extension is not enabled'}]});
            if(fixture.graphqlState==='anonymous-denied'&&!actor)return denied();
            if(fixture.graphqlState==='unavailable')return response(404,{message:'Not Found'});
            if(body.query.includes('BoundaryReachability'))return response(200,{data:{__typename:'Query'}});
            if(fixture.graphqlState==='blocked-introspection')return response(200,{errors:[{message:'Unknown field "__schema" on type Query'}]});
            if(fixture.graphqlState==='malformed-introspection')return response(200,{data:{__schema:{types:[],queryType:{fields:null}}}});
            if(fixture.graphqlState==='failed-introspection')return response(503,{message:'Unavailable'});
            if(body.query.includes('__schema'))return response(200,{data:{__schema:{queryType:{fields:[{name:'node'}]},mutationType:{fields:[]},
                types:[{name:'Query',fields:fixture.graphqlState==='exposed'?[{name:'entriesCollection'}]:[{name:'node'}]}]}}});
            if(body.query.includes('node(nodeId:'))return response(200,{data:{node:fixture.graphqlState==='node-exposed'?{nodeId:'private'}:null}});
            const field=body.query.match(/\{\s*(\w+)/)[1];return response(200,{errors:[{message:`Unknown field '${field}'`}]});
        }
        throw Error('Unexpected mocked HTTP path');
    };
    globalThis.boundaryFixture=fixture;return fixture;
}
if(typeof module!=='undefined')module.exports={installCloudBoundaryFixture};
