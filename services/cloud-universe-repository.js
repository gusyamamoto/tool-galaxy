// Explicit, metadata-only repository. NOT registered in normal app startup.
// Uses the unchanged local repository's planning methods with an injected
// command sink; it never supplies a browser storage adapter or file store.
function createCloudUniverseRepository({scope,gateway,isCurrent=()=>true,newOperationId=()=>crypto.randomUUID()}={}){
    const contract=cosmifoldCloudContract,projection=cosmifoldCloudProjection,changes=cosmifoldCloudChanges;
    const identity=contract.scope(scope),listeners=new Set(),usedOperations=new Set();
    if(!gateway||['readUniverse','commitMetadata','getOperationReceipt'].some(name=>typeof gateway[name]!=='function'))
        throw new TypeError('A cloud metadata gateway is required.');
    let confirmed=null,sidecar=null,phase='unopened',disposed=false,tail=Promise.resolve(),queued=0,pending=null,lastAck=null;
    const copy=value=>contract.json(value),resolve=value=>typeof value==='function'?value():value;
    function failure(code,reason,outcome='not-committed'){
        const error=new Error(`Cloud repository: ${code} (${reason}).`);error.name='CloudRepositoryError';
        Object.assign(error,{code,reason,outcome,requiresReconciliation:outcome==='unknown',scope:identity});
        if(pending)Object.assign(error,{operationId:pending.command.operationId,baseRevision:pending.command.baseRevision});
        return error;
    }
    function active(){if(disposed||!isCurrent())throw failure('REPOSITORY_DISPOSED','SCOPE_NO_LONGER_CURRENT',pending?'unknown':'not-committed');}
    function ready(){active();if(pending)throw failure('OUTCOME_UNKNOWN','RECONCILIATION_REQUIRED','unknown');
        if(phase==='conflict')throw failure('REVISION_CONFLICT','EXPLICIT_READ_REQUIRED');
        if(!confirmed)throw failure('INVALID_COMMAND',phase==='absent'?'UNIVERSE_ABSENT':'OPEN_REQUIRED');}
    function enqueue(action,{reconciliation=false}={}){
        if(pending&&phase==='uncertain'&&!reconciliation)return Promise.reject(failure('OUTCOME_UNKNOWN','RECONCILIATION_REQUIRED','unknown'));
        queued++;const result=tail.then(async()=>{
            active();const previousAck=lastAck,value=await action();
            // An observer/auth event can switch context between acknowledgement
            // and the awaiting caller's continuation. Do not return old objects
            // to that caller; a write already acknowledged must not be called
            // definitely uncommitted.
            if(disposed||!isCurrent())throw failure('REPOSITORY_DISPOSED','RESULT_SCOPE_NO_LONGER_CURRENT',
                pending||lastAck&&lastAck!==previousAck?'unknown':'not-committed');
            return value;
        });
        tail=result.catch(error=>{repository.lastError=error;}).finally(()=>queued--);return result;
    }
    function bound(metadata){
        const value=projection.validateRelational(metadata);
        if(value.universe.id!==identity.universeId||value.universe.owner_id!==identity.ownerUserId)contract.fail('INVALID_METADATA','repository.scope');
        // Canonicalize row arrival order through the approved projection.
        return projection.toRelational(projection.toStorageV5(value),{...identity,revision:value.universe.revision}).metadata;
    }
    function prepared(snapshot){return projection.toRelational(snapshot,{...identity,revision:confirmed.universe.revision});}
    function source(input,expectedRevision){
        ready();const snapshot=projection.validateStorageV5(resolve(input));
        if(expectedRevision!==null&&confirmed.universe.revision!==expectedRevision)throw failure('REVISION_CONFLICT','STALE_CAPTURED_SNAPSHOT');
        if(!changes.equal(prepared(snapshot).metadata,confirmed))throw failure('INVALID_COMMAND','SNAPSHOT_IS_NOT_CONFIRMED_BASE');
        return snapshot;
    }
    function publish(intent,ack){
        for(const listener of listeners){
            if(disposed||!isCurrent())break;
            try{listener({...copy(intent),scope:identity,acknowledgement:copy(ack)});}
            catch{repository.lastObserverError=failure('OBSERVER_FAILED','OBSERVER_FAILED');}
        }
    }
    function checkedAck(value){
        const ack=contract.acknowledgement(value,pending.command);
        if((ack.status==='committed')!==pending.changed)contract.fail('INVALID_ACKNOWLEDGEMENT','repository.change-status');
        return ack;
    }
    function accept(value){
        const ack=checkedAck(value);active();
        const operation=pending,next=copy(operation.prepared.metadata);next.universe.revision=ack.revision;
        // Prepare everything before publishing a single acknowledged replacement.
        const validated=bound(next),presentation=copy(operation.prepared.presentation);
        confirmed=validated;sidecar=presentation;lastAck=ack;pending=null;phase='ready';
        publish(operation.intent,ack);return copy(ack);
    }
    async function reconcilePending(){
        active();if(!pending)return lastAck?copy(lastAck):null;
        let receipt;
        try{receipt=copy(await gateway.getOperationReceipt(identity,pending.command.operationId));active();
            if(receipt?.status==='found'){
                if(Object.keys(receipt).some(key=>!['status','request_digest','acknowledgement'].includes(key))||
                    !/^[a-f0-9]{64}$/.test(receipt.request_digest)||receipt.acknowledgement?.replayed!==true)
                    throw failure('INVALID_ACKNOWLEDGEMENT','INVALID_RECEIPT','unknown');
                return accept(receipt.acknowledgement);
            }
        }catch(error){active();phase='uncertain';throw failure('OUTCOME_UNKNOWN','RECEIPT_UNAVAILABLE_OR_INVALID','unknown');}
        phase='uncertain';
        // FOR SHARE waits for a writer already holding the Universe lock. A
        // missing/absent result cannot fence an original HTTP request still in
        // transit. Never infer definite non-commit or unlock dependent writes.
        throw failure('OUTCOME_UNKNOWN',receipt?.status==='missing'?'RECEIPT_MISSING':receipt?.status==='absent'?'UNIVERSE_ABSENT_DURING_RECONCILIATION':'INVALID_RECEIPT','unknown');
    }
    async function commit(snapshot,intent){
        ready();
        // Deletion deliberately removes deleted IDs from archived expansion
        // preferences as well. Initial input was validated, so this is command
        // planning, not repair of a malformed graph.
        if(intent.type==='items.deleted'&&snapshot.archivedGalaxies){
            const remaining=new Set(snapshot.entries.map(entry=>entry.id));
            const ids=new Set(confirmed.entries.filter(entry=>!remaining.has(entry.id)).map(entry=>entry.id));
            snapshot={...snapshot,archivedGalaxies:snapshot.archivedGalaxies.map(record=>Object.hasOwn(record,'expandedIds')
                ?{...record,expandedIds:record.expandedIds.filter(id=>!ids.has(id))}:record)};}
        const next=prepared(snapshot),payload=changes.between(confirmed,next.metadata),operationId=newOperationId();
        const command=contract.command({scope:identity,operationId,baseRevision:confirmed.universe.revision,type:intent.type,payload});
        if(usedOperations.has(operationId))contract.fail('INVALID_COMMAND','operationId.reused');usedOperations.add(operationId);
        pending={command,prepared:next,intent:copy(intent),changed:Object.keys(payload).length>0};phase='committing';
        try{return accept(await gateway.commitMetadata(copy(command)));}
        catch(error){
            active();
            if(error?.outcome==='not-committed'&&!error.requiresReconciliation){pending=null;phase=error.code==='REVISION_CONFLICT'?'conflict':'ready';throw error;}
            phase='uncertain';return reconcilePending();
        }
    }
    // This private planner's local file/Restore/Backup methods are never exposed.
    const planner=createUniverseRepository({persistence:{sample:false,scope:identity,metadata:{
        load:()=>repository.load(),commit,save(){contract.fail('UNSUPPORTED_CAPABILITY','synchronous-cloud-write');}
    }},canWrite:()=>!disposed&&isCurrent()});
    function semantic(name,input,args=[]){
        const captured=typeof input==='function'?null:confirmed?.universe.revision??null;
        return enqueue(async()=>{const snapshot=source(input,captured);return planner[name](snapshot,...args);});
    }
    function checkedOptions(options,input){
        return {...options,readSnapshot:()=>source(options.readSnapshot?options.readSnapshot():resolve(input),null)};
    }
    const repository={
        scope:identity,capabilities:contract.capabilities,
        getState(){return {scope:identity,phase:disposed||!isCurrent()?'disposed':phase,revision:confirmed?.universe.revision??null,
            operationId:pending?.command.operationId??null};},
        pendingCommand(){active();return pending?copy(pending.command):null;},
        revision(){active();return confirmed?.universe.revision??null;},
        async open(requestScope=identity){
            const checked=contract.scope(requestScope);
            if(!changes.equal(checked,identity))throw failure('FORBIDDEN','REPOSITORY_SCOPE_MISMATCH');
            return enqueue(async()=>{
                if(pending)throw failure('OUTCOME_UNKNOWN','RECONCILIATION_REQUIRED','unknown');
                const previous=phase;phase='opening';
                try{const result=copy(await gateway.readUniverse(identity));active();
                    if(!result||Object.keys(result).some(key=>!['status','metadata'].includes(key)))contract.fail('INVALID_METADATA','read');
                    if(result.status==='absent'&&result.metadata===null){confirmed=null;sidecar=null;lastAck=null;phase='absent';return {status:'absent',snapshot:null,revision:null};}
                    if(result.status!=='found')contract.fail('INVALID_METADATA','read.status');
                    const next=bound(result.metadata);confirmed=next;sidecar=null;phase='ready';lastAck=null;
                    return {status:'found',snapshot:repository.load(),revision:confirmed.universe.revision};
                }catch(error){if(!disposed&&isCurrent())phase=previous;throw error;}
            });
        },
        load(){active();if(!confirmed)throw failure('INVALID_COMMAND','OPEN_FOUND_UNIVERSE_REQUIRED');return projection.toStorageV5(confirmed);},
        presentation(){active();return sidecar?copy(sidecar):null;},
        snapshot(runtime){
            active();const value=planner.snapshot(runtime);
            // The local runtime serializer intentionally creates undefined known
            // optional fields. Remove only those serializer slots; strict JSON
            // still validates all nested content/appearance and supplied v5 data.
            for(const entry of value.entries)for(const key of ['description','category','parentId','x','y'])if(entry[key]===undefined)delete entry[key];
            return projection.validateStorageV5({version:5,connections:[],...value});
        },
        save(input,intent={type:'items.changed'}){
            const captured=typeof input==='function'?null:confirmed?.universe.revision??null;
            return enqueue(async()=>{ready();const snapshot=projection.validateStorageV5(resolve(input));
                if(captured!==null&&captured!==confirmed.universe.revision)throw failure('REVISION_CONFLICT','STALE_CAPTURED_SNAPSHOT');
                await planner.save(snapshot,intent);
            });
        },
        updateContent(input,id,value,recovery=null){
            if(recovery)return Promise.reject(failure('UNSUPPORTED_CAPABILITY','LOCAL_CONTENT_RECOVERY'));
            const captured=typeof input==='function'?null:confirmed?.universe.revision??null;
            return enqueue(async()=>{const snapshot=source(input,captured);
                // Validate proposed fields BEFORE a local normalizer can omit
                // attachments or unknown content properties.
                projection.validateStorageV5({...snapshot,entries:snapshot.entries.map(entry=>{
                    if(entry.id!==id)return entry;const next={...entry};if(value===null)delete next.content;else next.content=value;return next;
                })});
                return planner.updateContent(snapshot,id,value);
            });
        },
        updateLocation(input,id,value){
            const captured=typeof input==='function'?null:confirmed?.universe.revision??null;
            return enqueue(async()=>{const snapshot=source(input,captured);
                projection.validateStorageV5({...snapshot,entries:snapshot.entries.map(entry=>{
                    if(entry.id!==id)return entry;const next={...entry};if(value===null)delete next.location;else next.location=value;return next;
                })});
                return planner.updateLocation(snapshot,id,value);
            });
        },
        replaceConstellations:(input,records)=>semantic('replaceConstellations',input,[records]),
        replacePlacements:(input,records)=>semantic('replacePlacements',input,[records]),
        moveEntries:(input,ids,destination)=>semantic('moveEntries',input,[ids,destination]),
        duplicateStructure:(input,id,name,newId,position)=>semantic('duplicateStructure',input,[id,name,newId,position]),
        archive:(input,record)=>semantic('archive',input,[record]),
        restore:(input,id)=>semantic('restore',input,[id]),
        copyEntries(input,roots,destination,newId,options={}){
            const captured=typeof input==='function'?null:confirmed?.universe.revision??null;
            return enqueue(async()=>{
                const snapshot=source(input,captured),positioned={...snapshot,entries:snapshot.entries.map(entry=>({...entry,x:entry.x??0,y:entry.y??0}))};
                const checked=checkedOptions(options,input);
                return planner.copyEntries(positioned,roots,destination,newId,{...checked,readSnapshot:()=>{
                    const latest=checked.readSnapshot();return {...latest,entries:latest.entries.map(entry=>({...entry,x:entry.x??0,y:entry.y??0}))};
                }});
            });
        },
        deleteSubtree(input,ids,options={}){
            const captured=typeof input==='function'?null:confirmed?.universe.revision??null;
            return enqueue(async()=>{const next=await planner.deleteSubtree(source(input,captured),ids,{...checkedOptions(options,input),deleteFiles:false});
                return {...next,...(Object.hasOwn(next,'archivedGalaxies')?{archivedGalaxies:repository.load().archivedGalaxies}:{})};
            });
        },
        async saveLayout(input){return enqueue(()=>{const snapshot=source(input,null);sidecar=prepared(snapshot).presentation;});},
        checkpointLayout(input){active();if(queued||pending||!confirmed||phase!=='ready')return;sidecar=prepared(source(input,null)).presentation;},
        reconcile:()=>enqueue(reconcilePending,{reconciliation:true}),
        whenIdle:()=>tail,
        subscribe(listener){active();listeners.add(listener);return ()=>listeners.delete(listener);},
        dispose(){disposed=true;phase='disposed';listeners.clear();confirmed=null;sidecar=null;},
        addAttachment:()=>Promise.reject(failure('UNSUPPORTED_ATTACHMENTS','CLOUD_FILES_NOT_IMPLEMENTED')),
        removeAttachment:()=>Promise.reject(failure('UNSUPPORTED_ATTACHMENTS','CLOUD_FILES_NOT_IMPLEMENTED')),
        readBackup:()=>Promise.reject(failure('UNSUPPORTED_CAPABILITY','LOCAL_BACKUP_ONLY')),
        replaceLocalBackup:()=>Promise.reject(failure('UNSUPPORTED_CAPABILITY','LOCAL_RESTORE_ONLY'))
    };
    Object.defineProperty(repository,'scope',{value:identity,enumerable:true,writable:false,configurable:false});
    return repository;
}
