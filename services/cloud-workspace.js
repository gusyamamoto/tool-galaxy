// Inactive, explicit account/Universe bootstrap boundary. No normal-app wiring.
function createCloudWorkspace({auth,gateway,cache=createCloudCacheStore(),contextId=crypto.randomUUID(),
    newOperationId=()=>crypto.randomUUID(),requestTimeoutMs=15000}={}){
    const contract=cosmifoldCloudContract,projection=cosmifoldCloudProjection,changes=cosmifoldCloudChanges;
    const schema=cosmifoldCloudCacheFormat,listeners=new Set();let generation=0,current=null,disposed=false;
    function owner(){const state=auth.getState();return state.ready&&state.user?.id?schema.scope({ownerUserId:state.user.id,universeId:state.user.id}).ownerUserId:null;}
    let observedOwner=owner(),state={status:observedOwner?'universe-not-selected':'unauthenticated',source:null,revision:null,canMutate:false,scope:null,generation};
    const copy=value=>contract.json(value),safe=error=>({code:error?.code||'CLOUD_LOOKUP_FAILED',reason:error?.reason||error?.code||'REQUEST_FAILED'});
    function live(ctx){return !disposed&&current===ctx&&generation===ctx.generation&&owner()===ctx.ownerUserId;}
    function guard(ctx){if(!live(ctx))throw schema.error('CACHE_CONTEXT_CHANGED');}
    function emit(next,ctx=null){
        if(ctx&&!live(ctx))return;state=copy(next);if(ctx)ctx.state=state;
        for(const listener of listeners){if(ctx&&!live(ctx))break;try{listener(copy(state));}catch{}}
    }
    function invalidate(){generation++;current?.repo?.dispose();current=null;}
    function result(ctx,status,extra={}){
        const next={status,scope:ctx.scope||null,generation:ctx.generation,source:null,revision:ctx.repo?.revision()??null,canMutate:false,...extra};
        emit(next,ctx);return live(ctx)?copy(next):ignored(ctx);
    }
    const ignored=ctx=>({status:'disposed',scope:ctx.scope||null,generation:ctx.generation,source:null,revision:null,canMutate:false});
    function timed(ctx,method,args){
        guard(ctx);
        return new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(Object.assign(new Error('Cloud request timed out'),{
                code:method==='commitMetadata'?'OUTCOME_UNKNOWN':'NETWORK_UNAVAILABLE',reason:'REQUEST_TIMEOUT',
                outcome:method==='commitMetadata'?'unknown':'not-committed',requiresReconciliation:method==='commitMetadata'})),requestTimeoutMs);
            Promise.resolve().then(()=>{guard(ctx);return gateway[method](...args);}).then(value=>{
                clearTimeout(timer);try{guard(ctx);resolve(value);}catch(error){reject(error);}
            },error=>{clearTimeout(timer);reject(error);});
            // Losing the race does not cancel a server write. Late resolution
            // is consumed here, never published or applied; journal stays live.
        });
    }
    function queue(ctx,action){
        const value=ctx.tail.then(async()=>{guard(ctx);return ctx.session.exclusive(async()=>{guard(ctx);return action();});});
        ctx.tail=value.catch(()=>{});return value;
    }
    function makeRepo(ctx){
        ctx.repo?.dispose();ctx.repo=createCloudUniverseRepository({scope:ctx.scope,isCurrent:()=>live(ctx),newOperationId,
            gateway:{readUniverse:s=>timed(ctx,'readUniverse',[s]),commitMetadata:c=>timed(ctx,'commitMetadata',[c]),
                getOperationReceipt:(s,id)=>timed(ctx,'getOperationReceipt',[s,id])},
            durability:{prepare:op=>{guard(ctx);return ctx.session.prepare(op);},accept:op=>{guard(ctx);return ctx.session.accept(op);},
                reject:c=>{guard(ctx);return ctx.session.reject(c);},savePresentation:value=>{guard(ctx);return ctx.session.savePresentation(value);}}});
        ctx.repo.subscribe(event=>{
            if(!live(ctx)||ctx.bootstrapping)return;
            const cached=ctx.repo.getState().phase==='cached';
            result(ctx,cached?'cached-degraded':'loaded',{source:cached?'cache':'server',revision:ctx.repo.revision(),cacheStatus:'valid',canMutate:!cached});
            for(const listener of ctx.observers){if(!live(ctx))break;try{listener(copy(event));}catch{}}
        });
    }
    function cacheProblem(ctx,reading){return result(ctx,reading.status==='unavailable'?'cache-unavailable':'invalid-cache',
        {cacheStatus:reading.status,error:reading.error});}
    function checkDisk(ctx){
        const reading=ctx.session.read();
        if(reading.status!=='valid'||!reading.record.acknowledged)throw schema.error('CACHE_BASE_CHANGED');
        const pending=ctx.repo.pendingCommand();
        if(reading.record.pending&&!changes.equal(reading.record.pending.command,pending))throw schema.error('PENDING_RECONCILIATION_REQUIRED');
        if(!changes.equal(reading.record.acknowledged,{snapshot:ctx.repo.load(),revision:ctx.repo.revision()}))throw schema.error('CACHE_BASE_CHANGED');
        return reading;
    }
    function afterFailure(ctx,error){
        if(!live(ctx))return;
        if(ctx.repo.pendingCommand())result(ctx,'pending-reconciliation',{source:'cache',cacheStatus:'valid',pendingOperationId:ctx.repo.pendingCommand().operationId,error:safe(error)});
        else if(error.code==='PENDING_RECONCILIATION_REQUIRED')result(ctx,'pending-reconciliation',{source:'cache',cacheStatus:'valid',error:safe(error)});
        else if(error.code==='REVISION_CONFLICT'||error.code==='CACHE_BASE_CHANGED')result(ctx,'cached-degraded',{source:'cache',cacheStatus:'valid',error:safe(error)});
        else result(ctx,ctx.state?.status==='loaded'?'loaded':'cached-degraded',{source:ctx.state?.source||'cache',cacheStatus:error.code?.startsWith('CACHE_')?'write-failed':'valid',
            canMutate:ctx.state?.canMutate===true&&!error.code?.startsWith('CACHE_')&&ctx.repo.getState().phase==='ready',error:safe(error)});
    }
    function facade(ctx){
        const mutations=contract.repositoryInterface.semanticCommands;
        const api={
            scope:ctx.scope,capabilities:contract.capabilities,
            getState:()=>live(ctx)?{...copy(ctx.state),phase:ctx.repo.getState().phase}:ignored(ctx),
            pendingCommand(){guard(ctx);return ctx.repo.pendingCommand();},
            load(){guard(ctx);if(!ctx.state?.source)throw schema.error('CLOUD_STATE_UNAVAILABLE');return ctx.repo.load();},
            revision(){guard(ctx);return ctx.repo.revision();},presentation(){guard(ctx);return ctx.repo.presentation();},
            snapshot(runtime){guard(ctx);return ctx.repo.snapshot(runtime);},
            subscribe(listener){guard(ctx);ctx.observers.add(listener);return ()=>ctx.observers.delete(listener);},
            whenIdle:()=>ctx.tail,
            checkpointLayout(input){guard(ctx);ctx.repo.checkpointLayout(input);},
            reconcile:()=>recover(ctx),
            saveLayout:input=>invoke(ctx,'saveLayout',[input])
        };
        for(const name of mutations)api[name]=(...args)=>invoke(ctx,name,args);
        return Object.freeze(api);
    }
    function invoke(ctx,name,args){
        try{guard(ctx);}catch(error){return Promise.reject(error);}
        const revision=typeof args[0]==='function'?null:ctx.repo.revision();
        return queue(ctx,async()=>{
            if(!ctx.state?.canMutate)throw schema.error(ctx.state?.status==='pending-reconciliation'?'PENDING_RECONCILIATION_REQUIRED':'CACHED_READ_ONLY');
            try{
                checkDisk(ctx);if(revision!==null&&revision!==ctx.repo.revision())throw Object.assign(schema.error('REVISION_CONFLICT'),{reason:'STALE_CAPTURED_SNAPSHOT'});
                const value=await ctx.repo[name](...args);guard(ctx);return value;
            }catch(error){afterFailure(ctx,error);throw error;}
        }).catch(error=>{afterFailure(ctx,error);throw error;});
    }
    async function finishRead(ctx,canCache=true){
        try{
            const opened=await ctx.repo.open();guard(ctx);
            if(opened.status==='absent'){
                if(canCache)ctx.session.refresh(null);
                return result(ctx,'universe-absent',{cacheStatus:canCache?'valid':'unavailable'});
            }
            const metadata=projection.toRelational(ctx.repo.load(),{...ctx.scope,revision:ctx.repo.revision()}).metadata;
            if(canCache){try{ctx.session.refresh(metadata,ctx.repo.presentation());}
                catch(error){return result(ctx,'loaded',{source:'server',cacheStatus:'write-failed',error:safe(error)});}}
            return result(ctx,'loaded',{source:'server',cacheStatus:canCache?'valid':'unavailable',canMutate:canCache});
        }catch(error){
            if(!live(ctx))return ignored(ctx);
            let cached=null;try{cached=ctx.repo.load();}catch{}
            return result(ctx,cached?'cached-degraded':'lookup-failed',{source:cached?'cache':null,cacheStatus:ctx.cacheStatus,error:safe(error)});
        }
    }
    async function recover(ctx){
        return queue(ctx,async()=>{
            try{checkDisk(ctx);await ctx.repo.reconcile();guard(ctx);return await finishRead(ctx);}
            catch(error){if(!live(ctx))return ignored(ctx);afterFailure(ctx,error);return copy(ctx.state);}
        }).catch(error=>live(ctx)?result(ctx,'pending-reconciliation',{source:ctx.state?.source||null,error:safe(error)}):ignored(ctx));
    }
    const manager={
        getState:()=>copy(state),
        subscribe(listener){listeners.add(listener);listener(copy(state));return ()=>listeners.delete(listener);},
        load(){if(!current?.facade)throw schema.error('CLOUD_STATE_UNAVAILABLE');return current.facade.load();},
        repository(){if(!current?.facade||!live(current))throw schema.error('CLOUD_STATE_UNAVAILABLE');return current.facade;},
        async discover(){
            invalidate();const ownerUserId=owner();if(disposed||!ownerUserId){emit({status:disposed?'disposed':'unauthenticated',scope:null,source:null,revision:null,canMutate:false,generation});return copy(state);}
            const ctx={ownerUserId,generation,scope:null};current=ctx;result(ctx,'discovering');
            try{
                const list=copy(await timed(ctx,'listOwnedUniverses',[]));guard(ctx);
                if(!Array.isArray(list))throw schema.error('INVALID_RPC_RESPONSE');const seen=new Set();
                for(const row of list){contract.scope({ownerUserId:row.owner_id,universeId:row.id});contract.revision(row.revision);
                    if(row.owner_id!==ownerUserId||seen.has(row.id)||Object.keys(row).some(key=>!['id','owner_id','revision'].includes(key)))throw schema.error('INVALID_RPC_RESPONSE');seen.add(row.id);}
                return result(ctx,list.length?'universes-available':'no-cloud-universe',{universes:list});
            }catch(error){return live(ctx)?result(ctx,'lookup-failed',{error:safe(error)}):ignored(ctx);}
        },
        async bootstrap(universeId){
            if(universeId===undefined)return manager.discover();
            invalidate();const ownerUserId=owner();
            if(disposed||!ownerUserId){emit({status:disposed?'disposed':'unauthenticated',scope:null,source:null,revision:null,canMutate:false,generation});return copy(state);}
            const scope=schema.scope({ownerUserId,universeId}),ctx={scope,ownerUserId,generation,tail:Promise.resolve(),observers:new Set(),bootstrapping:true};current=ctx;
            ctx.session=cache.bind({scope,contextId,generation,isCurrent:()=>live(ctx)});makeRepo(ctx);ctx.facade=facade(ctx);result(ctx,'opening');
            let reading=ctx.session.read();ctx.cacheStatus=reading.status;
            if(['invalid','incompatible'].includes(reading.status))return cacheProblem(ctx,reading);
            try{
                if(reading.status==='valid'&&reading.record.acknowledged)await ctx.repo.hydrateCache(reading.record);
                return await queue(ctx,async()=>{
                    reading=ctx.session.read();ctx.cacheStatus=reading.status;
                    if(['invalid','incompatible'].includes(reading.status))return cacheProblem(ctx,reading);
                    makeRepo(ctx);if(reading.status==='valid'&&reading.record.acknowledged)await ctx.repo.hydrateCache(reading.record);
                    if(reading.status==='valid'&&reading.record.pending){
                        try{await ctx.repo.reconcile();guard(ctx);}catch(error){
                            if(!live(ctx))return ignored(ctx);
                            return result(ctx,'pending-reconciliation',{source:'cache',cacheStatus:'valid',pendingOperationId:reading.record.pending.command.operationId,error:safe(error)});
                        }
                    }
                    return finishRead(ctx,reading.status!=='unavailable');
                });
            }catch(error){
                if(!live(ctx))return ignored(ctx);
                if(ctx.repo.pendingCommand())return result(ctx,'pending-reconciliation',{source:'cache',cacheStatus:ctx.cacheStatus,pendingOperationId:ctx.repo.pendingCommand().operationId,error:safe(error)});
                if(error.code==='CACHE_LOCK_UNAVAILABLE')return finishRead(ctx,false);
                let cached=null;try{cached=ctx.repo.load();}catch{}
                return result(ctx,cached?'cached-degraded':'lookup-failed',{source:cached?'cache':null,cacheStatus:ctx.cacheStatus,error:safe(error)});
            }finally{ctx.bootstrapping=false;}
        },
        reconcile(){if(!current?.repo)return Promise.resolve(copy(state));return recover(current);},
        close(){invalidate();emit({status:disposed?'disposed':owner()?'universe-not-selected':'unauthenticated',scope:null,source:null,revision:null,canMutate:false,generation});},
        dispose(){disposed=true;manager.close();unsubscribe();listeners.clear();}
    };
    const unsubscribe=auth.subscribe(()=>{
        const next=owner();if(next!==observedOwner){observedOwner=next;manager.close();}
    });
    return Object.freeze(manager);
}
