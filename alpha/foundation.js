// Alpha composition boundary. No beta storage adapters or local fallback.
function createTravelAlphaFoundation({config,auth,gateway,origin=globalThis.location?.origin,
    storage=()=>globalThis.localStorage,locks=globalThis.navigator?.locks,
    newUniverseId=()=>crypto.randomUUID(),newItemId=()=>crypto.randomUUID(),requestTimeoutMs=15000}={}){
    const contract=cosmifoldCloudContract,projection=cosmifoldCloudProjection;
    if(config?.applicationMode!=='cloud-alpha')throw new Error('Alpha configuration required');
    const enabled=config.cloudEnabled===true&&!!config.allowedOrigin&&origin===config.allowedOrigin&&
        !!config.localBetaOrigin&&origin!==config.localBetaOrigin;
    const empty=()=>({version:5,entries:[],connections:[],layout:[],portals:[],constellations:[],archivedGalaxies:[]});
    const copy=value=>contract.json(value),listeners=new Set();let disposed=false,generation=0,identity=null;
    let state={mode:'cloud-alpha',cloudEnabled:enabled,status:enabled?'signed-out':'disabled',user:null,
        universes:[],dataset:{kind:'preview',scope:null,revision:null,context:null,snapshot:empty()},readOnly:true,creating:false,writing:false,writeStatus:'idle',error:null};
    const fail=code=>Object.assign(new Error(code),{code});
    function actor(){const s=auth.getState();return s.ready&&!s.failed&&s.available!==false&&s.user?.id?s.user:null;}
    function valid(user,version){return !disposed&&generation===version&&actor()?.id===user&&identity===user;}
    function emit(patch){if(disposed)return;state={...state,...patch};for(const listener of listeners){try{listener(copy(state));}catch{}}}
    function clear(patch={}){emit({dataset:{kind:'preview',scope:null,revision:null,context:null,snapshot:empty()},readOnly:true,writing:false,writeStatus:'idle',...patch});}
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
    const workspace=enabled?createCloudWorkspace({auth,gateway,cache:createCloudCacheStore({storage:cacheStorage,locks}),requestTimeoutMs}):null;
    const writeStatus=value=>value.status==='pending-reconciliation'?'unresolved':value.error?'failed':value.status==='loaded'&&value.source==='server'?'saved':'idle';
    const unsubscribeWorkspace=workspace?.subscribe(value=>{
        const user=actor();
        if(!user||identity!==user.id||value.scope?.ownerUserId!==user.id){clear();return;}
        let dataset={kind:'preview',scope:null,revision:null,context:null,snapshot:empty()};
        if(value.source){try{dataset={kind:'cloud',scope:value.scope,revision:value.revision,context:`${generation}:${user.id}:${value.scope.universeId}`,snapshot:workspace.load()};}catch{}}
        emit({status:value.status,dataset,readOnly:state.writing||!value.canMutate,
            writeStatus:state.writing?'saving':writeStatus(value),error:value.error?.code||null});
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
        const user=requireActor();if(state.writing)throw fail('ALPHA_WRITE_BUSY');if(state.creating)throw fail('ALPHA_CREATION_BUSY');const version=++generation;
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
        if(state.writing)throw fail('ALPHA_WRITE_BUSY');
        if(state.creating||!state.universes.some(row=>row.id===id&&row.owner_id===user))throw fail('ALPHA_DATASET_NOT_LISTED');
        const version=++generation;clear({status:'opening',error:null});
        try{await open(id,user,version);}catch(error){if(valid(user,version))clear({status:'blocked',error:error.code||'ALPHA_OPEN_FAILED'});}
    }
    async function createEmpty(){
        const user=requireActor();
        if(state.writing)throw fail('ALPHA_WRITE_BUSY');
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
    async function reload(){
        const user=requireActor(),id=state.dataset.scope?.universeId;
        if(state.writing||state.creating)throw fail('ALPHA_WRITE_BUSY');
        if(!id)throw fail('ALPHA_DATASET_NOT_SELECTED');
        const version=++generation;clear({status:'opening',error:null});
        try{await open(id,user,version);}catch(error){if(valid(user,version))clear({status:'blocked',error:error.code||'ALPHA_OPEN_FAILED'});}
    }
    function editable(context){
        const user=requireActor();
        if(!context||context!==state.dataset.context)throw fail('ALPHA_CONTEXT_CHANGED');
        if(state.writing||state.creating)throw fail('ALPHA_WRITE_BUSY');
        if(state.readOnly||state.dataset.kind!=='cloud'||state.dataset.scope.ownerUserId!==user)throw fail('ALPHA_READ_ONLY');
        return user;
    }
    async function change(context,plan){
        const user=editable(context),version=generation,repo=workspace.repository();
        emit({writing:true,readOnly:true,writeStatus:'saving',error:null});
        try{
            const base=repo.load(),next=plan(copy(base));
            if(next){projection.validateStorageV5(next.snapshot);await repo.save(next.snapshot,next.intent);}
            if(!valid(user,version))throw fail('ALPHA_CONTEXT_CHANGED');
            const value=workspace.getState();
            emit({writing:false,readOnly:!value.canMutate,writeStatus:writeStatus(value),error:value.error?.code||null});
            return next?.id||null;
        }catch(error){
            if(!valid(user,version))throw fail('ALPHA_CONTEXT_CHANGED');
            const value=workspace.getState();
            emit({writing:false,readOnly:!value.canMutate,writeStatus:value.status==='pending-reconciliation'?'unresolved':'failed',error:error.code||'ALPHA_WRITE_FAILED'});
            throw error;
        }
    }
    function activeEntries(snapshot){
        const entries=new Map(snapshot.entries.map(record=>[record.id,record]));
        for(const record of snapshot.archivedGalaxies||[])for(const id of galaxyModel.subtreeIds(entries,record.galaxyId))entries.delete(id);
        return entries;
    }
    function name(value){if(typeof value!=='string'||!value.trim()||value.trim().length>60)throw fail('ALPHA_INVALID_NAME');return value.trim();}
    function createItem({name:value,parentId=null,context}={}){return change(context,snapshot=>{
        const entries=activeEntries(snapshot),id=newItemId();
        if(snapshot.entries.some(record=>record.id===id)||(snapshot.portals||[]).some(record=>record.id===id)||(snapshot.constellations||[]).some(record=>record.id===id))throw fail('ALPHA_ITEM_ID_COLLISION');
        if(parentId!==null&&(!entries.has(parentId)||entries.get(parentId).taskList===true||entries.get(entries.get(parentId).parentId)?.taskList===true))throw fail('ALPHA_PARENT_UNAVAILABLE');
        const now=new Date().toISOString(),entry={id,name:name(value),parentId,createdAt:now,updatedAt:now};
        if(galaxyModel.validateChange(entry,entries))throw fail('ALPHA_INVALID_ITEM');
        return {id,snapshot:{...snapshot,entries:[...snapshot.entries,entry]},intent:{type:'items.created',ids:[id]}};
    });}
    function renameItem({id,name:value,context}={}){return change(context,snapshot=>{
        const entry=activeEntries(snapshot).get(id);if(!entry)throw fail('ALPHA_ITEM_UNAVAILABLE');
        const nextName=name(value);if(entry.name===nextName)return null;
        return {id,snapshot:{...snapshot,entries:snapshot.entries.map(record=>record.id===id?{...record,name:nextName,updatedAt:new Date().toISOString()}:record)},intent:{type:'items.renamed',ids:[id]}};
    });}
    return Object.freeze({
        getState:()=>copy(state),
        subscribe(listener){listeners.add(listener);listener(copy(state));return ()=>listeners.delete(listener);},
        refresh,select,createEmpty,reload,createItem,renameItem,
        close(){generation++;workspace?.close();clear({universes:[],creating:false,status:enabled?'universe-not-selected':'disabled',error:null});},
        dispose(){generation++;workspace?.dispose();unsubscribeWorkspace?.();unsubscribeAuth();clear({universes:[],user:null,status:'disposed'});disposed=true;listeners.clear();}
    });
}
