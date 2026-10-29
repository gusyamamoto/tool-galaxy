// Test-only synthetic SDK and server. Session storage models a server across
// page reloads, independently of the application's acknowledged local cache.
function installTravelAlphaBrowserFixture(){
    const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
    const serverKey='cosmifold:travel-alpha:test-server:v1',listeners=new Set(),copy=value=>JSON.parse(JSON.stringify(value));
    const saved=JSON.parse(sessionStorage.getItem(serverKey)||'{"rows":[],"receipts":[]}');
    const rows=new Map(saved.rows),receipts=new Map(saved.receipts);let current=null;
    const persist=()=>sessionStorage.setItem(serverKey,JSON.stringify({rows:[...rows],receipts:[...receipts]}));
    const session=()=>current?{user:current,access_token:'TEST_ONLY_TOKEN'}:null;
    const emit=event=>{for(const fn of listeners)fn(event,session());};
    window.alphaFixture={A,B,calls:[],clients:0,mode:'ok',receiptMode:'ok',readMode:'ok',rows,
        bump(id){const row=rows.get(id);row.universe.revision=String(BigInt(row.universe.revision)+1n);persist();},
        switchUser(id){current=id?{id,email:id===A?'a@example.invalid':'b@example.invalid'}:null;emit(id?'SIGNED_IN':'SIGNED_OUT');}};
    const denied=()=>({status:403,error:{code:'42501'}});
    window.alphaFakeSDK={createClient(url,key,options){
        alphaFixture.clients++;alphaFixture.authKey=options.auth.storageKey;
        current=JSON.parse(localStorage.getItem(options.auth.storageKey)||'null');
        return {auth:{
            onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}},
            async getSession(){return {data:{session:session()},error:null}},
            async signInWithPassword({email}){current={id:email.startsWith('b@')?B:A,email};localStorage.setItem(options.auth.storageKey,JSON.stringify(current));emit('SIGNED_IN');return {data:{session:session()},error:null}},
            async signOut(){current=null;localStorage.removeItem(options.auth.storageKey);emit('SIGNED_OUT');return {data:{},error:null}},
            stopAutoRefresh(){}
        },schema(schema){if(schema!=='public')throw Error('Wrong RPC schema');return {rpc(name,params){
            alphaFixture.calls.push({name,params:copy(params)});return {async retry(retry){
                if(retry!==false)throw Error('Unexpected retry');if(!current)return {status:401,error:{code:'28000'}};
                let data;const owner=current.id;
                if(name==='cosmifold_list_universes')data=[...rows.values()].filter(r=>r.universe.owner_id===owner).map(r=>({id:r.universe.id,owner_id:owner,revision:r.universe.revision}));
                else if(name==='cosmifold_create_universe'){
                    if(rows.has(params.p_universe_id))throw Error('Duplicate create');
                    const snapshot={version:5,entries:[],connections:[],layout:[],portals:[],constellations:[],archivedGalaxies:[]};
                    data=copy(cosmifoldCloudProjection.toRelational(snapshot,{ownerUserId:owner,universeId:params.p_universe_id,revision:'0'}).metadata);rows.set(params.p_universe_id,data);persist();
                }else if(name==='cosmifold_read_universe'){
                    if(params.p_scope.ownerUserId!==owner)return denied();if(alphaFixture.readMode==='unavailable')throw Error('Test read offline');
                    const value=rows.get(params.p_scope.universeId);if(value&&value.universe.owner_id!==owner)return denied();data=value?{status:'found',metadata:value}:{status:'absent',metadata:null};
                }else if(name==='cosmifold_commit_metadata'){
                    const command=params.p_command;if(command.scope.ownerUserId!==owner)return denied();
                    const row=rows.get(command.scope.universeId);if(!row||row.universe.owner_id!==owner)return denied();
                    if(alphaFixture.mode==='reject')return denied();
                    const prior=receipts.get(command.operationId);
                    if(prior){if(prior.request!==JSON.stringify(command))return {status:400,error:{code:'CM004'}};data={...prior.ack,replayed:true};}
                    else{
                        if(command.baseRevision!==row.universe.revision)return {status:409,error:{code:'CM003'}};
                        const next=copy(row),payload=command.payload;
                        for(const relation of ['entries','constellations','constellation_members','linked_placements']){
                            const key=value=>relation==='constellation_members'?JSON.stringify([value.constellation_id,value.entry_id]):value.id;
                            const deleteKey=value=>relation==='constellation_members'?JSON.stringify([value.constellation_id,value.entry_id]):value;
                            const deleted=new Set((payload.delete?.[relation]||[]).map(deleteKey));next[relation]=next[relation].filter(value=>!deleted.has(key(value)));
                            for(const value of payload.upsert?.[relation]||[]){const index=next[relation].findIndex(old=>key(old)===key(value));if(index<0)next[relation].push(value);else next[relation][index]=value;}
                        }
                        if(payload.snapshot_fields)next.snapshot_fields=payload.snapshot_fields;
                        const changed=JSON.stringify(next)!==JSON.stringify(row),revision=String(BigInt(command.baseRevision)+(changed?1n:0n));next.universe.revision=revision;
                        cosmifoldCloudProjection.validateRelational(next);rows.set(command.scope.universeId,next);
                        data={scope:command.scope,operationId:command.operationId,baseRevision:command.baseRevision,revision,status:changed?'committed':'unchanged',replayed:false,result:null};
                        receipts.set(command.operationId,{request:JSON.stringify(command),ack:copy(data)});persist();
                    }
                    if(alphaFixture.mode==='unknown')throw Error('Test lost response');
                    if(alphaFixture.mode==='hold')await new Promise(resolve=>{alphaFixture.release=resolve;});
                }else if(name==='cosmifold_operation_receipt'){
                    if(params.p_scope.ownerUserId!==owner)return denied();if(alphaFixture.receiptMode==='unavailable')throw Error('Test receipt offline');
                    const stored=receipts.get(params.p_operation_id);
                    if(stored&&stored.ack.scope.ownerUserId!==owner)return denied();
                    data=stored&&alphaFixture.receiptMode!=='missing'?{status:'found',request_digest:'a'.repeat(64),acknowledgement:{...stored.ack,replayed:true}}:{status:'missing',acknowledgement:null};
                }else throw Error('Unexpected RPC');
                return {status:200,error:null,data:copy(data)};
            }};
        }}}};
    }};
    loadSupabaseAuthSDK=async()=>alphaFakeSDK;
}
