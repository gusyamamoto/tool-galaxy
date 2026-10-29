// Application bootstrap boundary. No beta storage adapters, import or editor.
function createTravelAlphaFoundation({config,auth,gateway,origin=globalThis.location?.origin,
    storage=()=>globalThis.localStorage,locks=globalThis.navigator?.locks,
    newUniverseId=()=>crypto.randomUUID()}={}){
    const contract=cosmifoldCloudContract,projection=cosmifoldCloudProjection;
    if(config?.applicationMode!=='cloud-alpha')throw new Error('Alpha configuration required');
    const enabled=config.cloudEnabled===true&&!!config.allowedOrigin&&origin===config.allowedOrigin&&
        !!config.localBetaOrigin&&origin!==config.localBetaOrigin;
    const empty=()=>({version:5,entries:[],connections:[],layout:[],portals:[],constellations:[],archivedGalaxies:[]});
    const copy=value=>contract.json(value),listeners=new Set();let disposed=false,generation=0,identity=null;
    let state={mode:'cloud-alpha',cloudEnabled:enabled,status:enabled?'signed-out':'disabled',user:null,
        universes:[],dataset:{kind:'preview',scope:null,revision:null,snapshot:empty()},readOnly:true,creating:false,error:null};
    const fail=code=>Object.assign(new Error(code),{code});
    function actor(){const s=auth.getState();return s.ready&&!s.failed&&s.available!==false&&s.user?.id?s.user:null;}
    function valid(user,version){return !disposed&&generation===version&&actor()?.id===user&&identity===user;}
    function emit(patch){if(disposed)return;state={...state,...patch};for(const listener of listeners){try{listener(copy(state));}catch{}}}
    function clear(patch={}){emit({dataset:{kind:'preview',scope:null,revision:null,snapshot:empty()},...patch});}
    function requireActor(){if(!enabled||disposed||!actor()||identity!==actor().id)throw fail('ALPHA_CLOUD_UNAVAILABLE');return identity;}
    const creationKey=user=>`cosmifold:travel-alpha:create:v1:${contract.scope({ownerUserId:user,universeId:user}).ownerUserId}`;
    function pending(user){
        const raw=storage().getItem(creationKey(user));if(raw===null)return null;
        let value;try{value=JSON.parse(raw);contract.scope(value);}catch{throw fail('ALPHA_CREATION_RECORD_INVALID');}
        if(Object.keys(value).sort().join(',')!=='ownerUserId,universeId'||value.ownerUserId!==user)throw fail('ALPHA_CREATION_RECORD_INVALID');
        return value;
    }
    // Namespace the existing validated cache without ever touching its old keys.
    const cacheStorage=()=>({
        getItem(key){if(!key.startsWith('cosmifold:cloud-cache:v1:'))throw fail('ALPHA_CACHE_KEY');return storage().getItem('cosmifold:travel-alpha:cache:'+key);},
        setItem(key,value){if(!key.startsWith('cosmifold:cloud-cache:v1:'))throw fail('ALPHA_CACHE_KEY');storage().setItem('cosmifold:travel-alpha:cache:'+key,value);}
    });
    const workspace=enabled?createCloudWorkspace({auth,gateway,cache:createCloudCacheStore({storage:cacheStorage,locks})}):null;
    const unsubscribeWorkspace=workspace?.subscribe(value=>{
        const user=actor();
        if(!user||identity!==user.id||value.scope?.ownerUserId!==user.id){clear();return;}
        let dataset={kind:'preview',scope:null,revision:null,snapshot:empty()};
        if(value.source){try{dataset={kind:'cloud',scope:value.scope,revision:value.revision,snapshot:workspace.load()};}catch{}}
        emit({status:value.status,dataset,error:value.error?.code||null});
    });
    const unsubscribeAuth=auth.subscribe(value=>{
        const next=value.ready&&!value.failed&&value.available!==false?value.user:null;
        if(next?.id!==identity){generation++;identity=next?.id||null;workspace?.close();
            clear({universes:[],creating:false,status:enabled?(identity?'universe-not-selected':'signed-out'):'disabled',error:null});}
        emit({user:enabled&&next?{id:next.id,email:next.email||''}:null});
        if(enabled&&value.ready&&(value.failed||value.available===false))clear({status:'auth-unavailable',error:'ALPHA_AUTH_UNAVAILABLE'});
    });
    async function open(id,user,version){
        if(!valid(user,version))return;
        await workspace.bootstrap(id);
        if(!valid(user,version))return;
        const current=workspace.getState();
        if(current.source==='server'&&current.scope?.ownerUserId===user&&current.scope.universeId===id){
            const record=pending(user);
            if(record?.universeId===id)storage().removeItem(creationKey(user));
        }
    }
    async function refresh(){
        const user=requireActor();if(state.creating)throw fail('ALPHA_CREATION_BUSY');const version=++generation;
        clear({universes:[],status:'discovering',error:null});
        try{
            const result=await workspace.discover();if(!valid(user,version))return;
            if(result.status!=='universes-available'&&result.status!=='no-cloud-universe'){
                clear({status:result.status,error:result.error?.code||null});return;
            }
            emit({universes:result.universes||[],status:result.status});
            const record=pending(user);
            if(record){
                if(state.universes.some(row=>row.id===record.universeId))await open(record.universeId,user,version);
                else clear({status:'creation-uncertain',error:'ALPHA_CREATION_UNRESOLVED'});
            }
        }catch(error){if(valid(user,version))clear({status:'blocked',error:error.code||'ALPHA_LOOKUP_FAILED'});}
    }
    async function select(id){
        const user=requireActor();
        if(state.creating||!state.universes.some(row=>row.id===id&&row.owner_id===user))throw fail('ALPHA_DATASET_NOT_LISTED');
        const version=++generation;clear({status:'opening',error:null});
        try{await open(id,user,version);}catch(error){if(valid(user,version))clear({status:'blocked',error:error.code||'ALPHA_OPEN_FAILED'});}
    }
    async function createEmpty(){
        const user=requireActor();
        if(state.creating||!locks?.request)throw fail('ALPHA_CREATION_LOCK_REQUIRED');
        const version=++generation;workspace.close();
        clear({creating:true,status:'creating',error:null});
        try{
            await locks.request(`cosmifold:travel-alpha:create:${user}`,{mode:'exclusive',ifAvailable:true},async lock=>{
                if(!lock)throw fail('ALPHA_CREATION_BUSY');if(!valid(user,version))return;
                if(pending(user))throw fail('ALPHA_CREATION_UNRESOLVED');
                const scope=contract.scope({ownerUserId:user,universeId:newUniverseId()});
                // Record the exact identity before dispatch. Unknown outcomes
                // survive reload; Refresh only reads, never resends creation.
                storage().setItem(creationKey(user),JSON.stringify(scope));
                const metadata=projection.validateRelational(await gateway.createUniverse(scope.universeId));
                if(!valid(user,version))return;
                if(metadata.universe.owner_id!==user||metadata.universe.id!==scope.universeId||metadata.universe.revision!=='0'||
                    ['entries','constellations','constellation_members','linked_placements'].some(key=>metadata[key].length))throw fail('ALPHA_CREATED_UNIVERSE_NOT_EMPTY');
                await open(scope.universeId,user,version);
            });
        }catch(error){if(valid(user,version))clear({status:'creation-uncertain',error:error.code||'ALPHA_CREATION_UNCERTAIN'});}
        finally{if(valid(user,version))emit({creating:false});}
    }
    return Object.freeze({
        getState:()=>copy(state),
        subscribe(listener){listeners.add(listener);listener(copy(state));return ()=>listeners.delete(listener);},
        refresh,select,createEmpty,
        close(){generation++;workspace?.close();clear({universes:[],creating:false,status:enabled?'universe-not-selected':'disabled',error:null});},
        dispose(){generation++;workspace?.dispose();unsubscribeWorkspace?.();unsubscribeAuth();clear({universes:[],user:null,status:'disposed'});disposed=true;listeners.clear();}
    });
}
