// Two V8 client contexts, separate storage/session namespaces, one serialized mock server.
// Actual gateway/repository/cache code is exercised; no SDK CDN or network.
const {setup,plain}=require('./fake-cloud-gateway.js'),{disk,fakeLocks,fakeAuth}=require('./fake-cloud-workspace.js');
const crypto=require('node:crypto');
const A='00000000-0000-4000-8000-000000000001';
function backend(order='left'){
    const server={rows:new Map(),receipts:new Map(),calls:[],applications:0,clock:100000,queue:[],waiters:[],order,hold:null};
    const good=data=>({status:200,data:plain(data),error:null}),bad=code=>({status:400,data:null,error:{code}});
    let validate;
    function apply(params,actor){
        const command=plain(params.p_command),id=command.scope.universeId,old=server.rows.get(id);
        if(command.scope.ownerUserId!==actor||old?.universe.owner_id!==actor)return bad('42501');
        const digest=crypto.createHash('sha256').update(JSON.stringify(command)).digest('hex'),key=id+':'+command.operationId,previous=server.receipts.get(key);
        if(previous){if(previous.digest!==digest){server.onRejectedReuse?.();return bad('CM004');}return good({...previous.ack,replayed:true});}
        if(old.universe.revision!==command.baseRevision)return bad('CM003');
        const next=plain(old);
        for(const relation of ['entries','constellations','constellation_members','linked_placements']){
            const key=row=>relation==='constellation_members'?JSON.stringify([row.constellation_id,row.entry_id]):row.id;
            for(const row of command.payload.upsert?.[relation]||[]){const index=next[relation].findIndex(r=>key(r)===key(row));if(index<0)next[relation].push(row);else next[relation][index]=row;}
            if(command.payload.delete?.[relation]?.length)return bad('CM005');
        }
        if(command.payload.snapshot_fields)next.snapshot_fields=command.payload.snapshot_fields;
        try{validate(next);}catch{return bad('CM005');}
        next.universe.revision=String(Number(old.universe.revision)+1);
        const ack={scope:command.scope,operationId:command.operationId,baseRevision:command.baseRevision,revision:next.universe.revision,status:'committed',replayed:false,result:null};
        server.rows.set(id,next);server.receipts.set(key,{command,digest,ack:plain(ack)});server.applications++;return good(ack);
    }
    server.request=async(name,params,actor,origin,plan)=>{
        const call={name,params:plain(params),actor,origin,retry:false};server.calls.push(call);validate ||=metadata=>plan.validate(metadata);
        if(!actor)return bad('42501');const id=params.p_scope?.universeId||params.p_command?.scope.universeId||params.p_universe_id,old=server.rows.get(id);
        if(name==='cosmifold_create_universe'){
            if(old&&old.universe.owner_id!==actor)return bad('42501');
            if(!old)server.rows.set(id,plan.empty(params.p_universe_id,actor));return good(server.rows.get(id));
        }
        if(name==='cosmifold_list_universes')return good([...server.rows.values()].filter(r=>r.universe.owner_id===actor).map(r=>r.universe));
        if(params.p_scope?.ownerUserId!==undefined&&params.p_scope.ownerUserId!==actor)return bad('42501');
        if(!old||old.universe.owner_id!==actor)return good(name==='cosmifold_read_universe'?{status:'absent',metadata:null}:{status:'absent',acknowledgement:null});
        if(name==='cosmifold_read_universe'){
            const value=good({status:'found',metadata:old});if(server.hold){const h=server.hold;server.hold=null;h.captured();await h.gate;}return value;}
        if(name==='cosmifold_operation_receipt'){const receipt=server.receipts.get(id+':'+params.p_operation_id);return good(receipt?{status:'found',request_digest:receipt.digest,acknowledgement:{...receipt.ack,replayed:true}}:{status:'missing',acknowledgement:null});}
        if(name==='cosmifold_commit_metadata'){
            if(server.forceError)return bad(server.forceError);
            const command=params.p_command,queued=!server.single&&!server.receipts.has(id+':'+command.operationId)&&
                (['1','2'].includes(command.baseRevision)||server.recoveryRace&&command.baseRevision==='3'||server.barrierRace&&command.baseRevision==='4');
            if(queued)return new Promise(resolve=>{server.queue.push({params,actor,origin,resolve});if(server.queue.length===2){
                const batch=server.queue.splice(0).sort((a,b)=>(a.origin.includes(server.order==='left'?'127.0.0.1':'localhost')?-1:1));
                server.clock+=2;for(const item of batch)item.resolve(apply(item.params,item.actor));}});
            const result=apply(params,actor);
            if(server.holdCommit){const h=server.holdCommit;server.holdCommit=null;h.captured();await h.gate;}return result;
        }
        return bad('PGRST202');
    };
    server.wait=ms=>new Promise(resolve=>{if(server.single){server.clock+=ms;resolve();return;}server.waiters.push({ms,resolve});if(server.waiters.length===2){const batch=server.waiters.splice(0);server.clock+=Math.max(...batch.map(r=>r.ms));for(const r of batch)r.resolve();}});
    return server;
}
function clients(order='left',options={}){
    const server=backend(order);let sequence=5000;
    function client(origin){
        const e=setup(null),global=e.get('globalThis'),storage=disk(),markers=disk(),auth={...fakeAuth(A),initialize:async()=>{},dispose(){}},listeners=new Set();let actor=A;
        Object.assign(global,{setTimeout,clearTimeout,AbortController,crypto:{randomUUID:()=>`00000000-0000-4000-9000-${String(++sequence).padStart(12,'0')}`},location:{origin}});
        for(const file of ['services/supabase-metadata-gateway.js','persistence/cloud-cache-store.js','dev/cloud-concurrency-plan.js','dev/cloud-concurrent-recovery-plan.js','dev/cloud-start-barrier-plan.js','dev/cloud-start-barrier-client.js','dev/cloud-concurrency-sql.js','dev/cloud-concurrency-diagnostic.js'])e.load(file);
        const projection=e.get('cosmifoldCloudProjection'),api={empty:(id,owner)=>plain(projection.toRelational({version:5,entries:[],layout:[],connections:[],portals:[],constellations:[],archivedGalaxies:[]},{ownerUserId:owner,universeId:id,revision:'0'}).metadata),validate:m=>projection.validateRelational(m)};
        const sdk={auth:{async getSession(){return {data:{session:actor?{user:{id:actor},access_token:'FIXTURE_PRIVATE_TOKEN'}:null}};},
            onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};}},
            schema(schema){if(schema!=='public')throw Error('Private schema used');return {rpc(name,params){return {retry:retry=>{if(retry!==false)throw Error('Retry enabled');return server.request(name,params,actor,origin,api);}};}};}};
        const gateway=e.get('createSupabaseMetadataGateway')({provider:{getClient:async()=>sdk}}),cache=e.get('createCloudCacheStore')({storage:()=>storage,locks:fakeLocks()}),messages=[];
        const diagnostic=e.get('createCloudConcurrencyDiagnostic')({auth,gateway,cache,markers:()=>markers,location:{origin},randomUUID:global.crypto.randomUUID,
            now:()=>server.clock,wait:server.wait,report:m=>messages.push(m),holdTimeoutMs:10000,requestTimeoutMs:options.timeout||15000,barrierHoldTimeoutMs:options.barrierHoldTimeoutMs||120000});
        storage.setItem('galaxy:user-data','KEEP_LOCAL');markers.setItem('cosmifold:dev:cloud-boundary:v1','KEEP_PHASE_A');
        return {...e,storage,markers,auth,gateway,cache,diagnostic,messages,origin,changeUser(id){actor=id;auth.emit(id);listeners.forEach(fn=>fn(id?'SIGNED_IN':'SIGNED_OUT',id?{user:{id},access_token:'FIXTURE_PRIVATE_TOKEN'}:null));}};
    }
    const left=client('http://127.0.0.1:5500'),right=client('http://localhost:5500');
    async function prepare(){const f=await left.diagnostic.prepare(right.origin);await right.diagnostic.join(plain(f));return plain(f);}
    async function race(kind){const ready=kind==='identical'?await right.diagnostic.readiness(kind):null;
        const t=await left.diagnostic.makeTicket(kind,5000,plain(ready)),observations=await Promise.all([left.diagnostic.arm(plain(t)),right.diagnostic.arm(plain(t))]);
        await left.diagnostic.verify(kind,plain(observations[1]));await right.diagnostic.verify(kind,plain(observations[0]));return plain(observations);}
    return {server,left,right,prepare,race,dispose(){left.diagnostic.dispose();right.diagnostic.dispose();}};
}
module.exports={clients,plain};
