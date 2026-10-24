// Snapshot-level product boundary. Keep stable IDs and compound intent together.
// Public writes are ordered Promises; local file callbacks use a private synchronous writer.
function createUniverseRepository({persistence, canWrite = () => true}) {
    const listeners = new Set();
    let restoring=false,tail=Promise.resolve(),pending=0;
    const read=value=>typeof value==='function'?value():value;
    const enqueue=action=>{pending++;const result=tail.then(action);tail=result.catch(()=>{}).finally(()=>pending--);return result;};
    async function commit(snapshot,intent){
        if(restoring||!canWrite())throw new Error('Saved data is unavailable. The original data is being preserved.');
        try{await persistence.metadata.commit(snapshot,intent);}catch(error){repository.lastError=error;throw error;}
        publish(intent);
    }
    function write(snapshot, intent) {
        if(restoring)throw new Error('Restore is in progress.');
        if (!canWrite()) throw new Error('Saved data is unavailable. The original data is being preserved.');
        try { persistence.metadata.save(snapshot, intent); }
        catch (error) { repository.lastError = error; throw error; }
    }
    function publish(intent) {
        if (persistence.sample) return;
        // Observers must never turn a successful local write into a UI failure.
        listeners.forEach(listener => { try { listener({...intent, ...(intent.ids ? {ids:[...intent.ids]} : {}), scope: persistence.scope}); } catch (error) { repository.lastObserverError = error; } });
    }
    function fileCallbacks(commit,rollback){
        let captured=false,before;
        return [()=>{
            if(persistence.metadata.readForBackup){before=persistence.metadata.readForBackup().metadataText;captured=true;}
            return commit();
        },()=>{
            // A quota/validation rejection before a metadata write needs no
            // second write (which could fail for the same storage reason).
            if(captured&&persistence.metadata.readForBackup().metadataText===before)return;
            rollback();
        }];
    }
    function attachmentAuditState(){
        if(persistence.sample||!canWrite()||restoring||!persistence.files.auditStorage||!persistence.metadata.withWrite)
            throw new Error('Unused-file maintenance is unavailable for this workspace.');
        if(persistence.metadata.readRestoreJournal())throw new Error('Finish Restore recovery before checking unused files.');
        const text=persistence.metadata.readForBackup().metadataText;
        const snapshot=persistence.metadata.load(); // The same raw F3 validation as startup.
        if(persistence.metadata.readForBackup().metadataText!==text)throw new Error('Saved data changed. Check unused files again.');
        return {snapshot,text,raw:text===null?null:JSON.parse(text)};
    }
    const repository = {
        async auditAttachmentStorage(){
            const state=attachmentAuditState(),inventory=await persistence.files.auditStorage();
            if(persistence.metadata.readForBackup().metadataText!==state.text)throw new Error('Saved data changed. Check unused files again.');
            return cosmifoldAttachmentAudit.classify(state.snapshot,inventory,state.raw);
        },
        async removeOrphanedAttachments(keys){
            if(!Array.isArray(keys)||keys.some(key=>typeof key!=='string'||!key.trim()||key.length>1024))throw new Error('Check unused files before removing them.');
            keys=[...new Set(keys)];const state=attachmentAuditState();
            const result=await persistence.files.removeOrphans(keys,inventory=>{
                // This synchronous validation runs INSIDE the deletion transaction,
                // while the existing F1 lock excludes metadata/file writers.
                if(persistence.metadata.readRestoreJournal()||persistence.metadata.readForBackup().metadataText!==state.text)
                    throw new Error('Saved data changed. Check unused files again.');
                const audit=cosmifoldAttachmentAudit.classify(state.snapshot,inventory,state.raw);
                if(audit.blocked)throw new Error(audit.blocked);
                return audit.orphaned.map(record=>record.key);
            });
            return {removed:result.removed.length,skipped:keys.length-result.removed.length};
        },
        restoreRevision:()=>persistence.files.restoreMarker(),
        async recoverPendingRestore() {
            if(persistence.sample)return false;
            const journal=persistence.metadata.readRestoreJournal();if(!journal)return false;
            const text=value=>value===null||typeof value==='string';
            if(journal.version!==1||typeof journal.id!=='string'||!text(journal.metadataText)||!text(journal.preferencesText)||
                !text(journal.previous?.current)||!text(journal.previous?.legacy)||!text(journal.previousPreferences))throw new Error('Restore recovery record is unreadable.');
            if(await persistence.files.restoreMarker()===journal.id){
                persistence.metadata.replaceRaw(journal.metadataText);persistence.preferences.replaceRaw(journal.preferencesText);
            }else{
                persistence.metadata.recoverRaw(journal.previous);persistence.preferences.replaceRaw(journal.previousPreferences);
            }
            persistence.metadata.endRestore();return true;
        },
        async replaceLocalBackup(source) {
            if(persistence.sample)throw new Error('Leave Sample mode to restore your Cosmos.');
            if(restoring||persistence.metadata.readRestoreJournal())throw new Error('Finish Restore recovery before continuing.');
            const journal={version:1,id:cosmifoldIds.uuid(),metadataText:source.metadataText,preferencesText:source.preferencesText,
                previous:persistence.metadata.captureRestoreState(),previousPreferences:persistence.preferences.readForBackup()};
            restoring=true;
            const rollback=()=>{
                persistence.metadata.recoverRaw(journal.previous);persistence.preferences.replaceRaw(journal.previousPreferences);
                if(JSON.stringify(persistence.metadata.captureRestoreState())!==JSON.stringify(journal.previous)||persistence.preferences.readForBackup()!==journal.previousPreferences)
                    throw new Error('Restore rollback could not be verified.');
            };
            try{
                persistence.metadata.beginRestore(journal);
                await persistence.files.replaceAll(source.records,journal.id,()=>{
                    persistence.metadata.replaceRaw(source.metadataText);persistence.preferences.replaceRaw(source.preferencesText);
                },rollback);
            }catch(error){
                if(!error.recoveryRequired){
                    try{rollback();persistence.metadata.endRestore();}catch(cause){const failure=new Error('Restore recovery needs a reload before continuing.',{cause});failure.recoveryRequired=true;throw failure;}
                }
                throw error;
            }finally{restoring=false;}
            // A failed journal cleanup does not undo a completed dataset. Startup
            // sees the durable commit marker and idempotently finishes the new state.
            try{persistence.metadata.endRestore();}catch(error){repository.lastError=error;}
            publish({type:'universe.restored'});
        },
        load: () => persistence.metadata.load(),
        async recoverAttachmentOperations(){
            if(persistence.sample||!persistence.files.recoverOperations)return;
            // F3 validation must precede any journal-scoped cleanup.
            const snapshot=persistence.metadata.load();
            await persistence.files.recoverOperations(snapshot);
        },
        async readBackup() {
            if(persistence.sample)throw new Error('Leave Sample mode to back up your saved Cosmos.');
            const saved=persistence.metadata.readForBackup(),preferencesText=persistence.preferences.readForBackup();
            const records=await persistence.files.readAll();
            if(JSON.stringify(saved)!==JSON.stringify(persistence.metadata.readForBackup())||preferencesText!==persistence.preferences.readForBackup())
                throw new Error('Saved data changed while reading it. Try the backup again.');
            return {...saved,preferencesText,records};
        },
        needsCanonicalSave(saved, normalized) {
            return ['portals','constellations'].some(key => JSON.stringify(saved?.[key] || []) !== JSON.stringify(normalized[key]));
        },
        snapshot({entries, portals, constellations, layout, archivedGalaxies}) {
            return {
                entries: [...entries.values()].map(({id,name,description,category,parentId,x,y,appearance,content,location,createdAt,updatedAt,taskList,completed}) =>
                    ({id,name,description,category,parentId,x,y, ...(appearance ? {appearance} : {}), ...(content ? {content} : {}),
                        ...(location ? {location} : {}),
                        ...(taskList === true ? {taskList:true} : {}),
                        ...(typeof completed === 'boolean' ? {completed} : {}),
                        ...(createdAt ? {createdAt} : {}), ...(updatedAt ? {updatedAt} : {})})),
                portals: [...portals.values()].map(record => ({...record})),
                constellations: [...constellations.values()].map(record => ({...record,memberEntryIds:[...record.memberEntryIds]})),
                layout: [...layout].map(([id,record]) => ({id,...record})),
                ...(archivedGalaxies.size ? {archivedGalaxies:[...archivedGalaxies.values()]} : {})
            };
        },
        async save(snapshot, intent = {type: 'items.changed'}) { await commit(read(snapshot),intent); },
        async saveLayout(snapshot){await commit(read(snapshot),{type:'layout.saved'});},
        checkpointLayout(snapshot){
            if(pending||restoring)return false;
            if(persistence.metadata.checkpoint){
                if(!canWrite())return false;
                return persistence.metadata.checkpoint(read(snapshot));
            }
            write(read(snapshot),{type:'layout.checkpoint'});return true;
        },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        async updateContent(snapshot, id, value, recovery = null) {
            snapshot=read(snapshot);
            const entry = snapshot.entries.find(entry => entry.id === id);
            if (!entry) throw new Error('This item no longer exists.');
            const content = value == null && recovery ? null : galaxyModel.normalizeContent(value, id);
            if (value != null && !content) throw new Error('Content is invalid or exceeds its text limits.');
            const updated = {...entry};
            if (content) updated.content = content; else delete updated.content;
            if (recovery) {
                if (recovery.updatedAt) updated.updatedAt = recovery.updatedAt; else delete updated.updatedAt;
            } else updated.updatedAt = new Date().toISOString();
            await commit({...snapshot, entries: snapshot.entries.map(record => record.id === id ? updated : record)},
                {type: recovery ? 'content.recovered' : 'content.changed', ids: [id]});
            return updated;
        },
        async updateLocation(snapshot,id,value) {
            snapshot=read(snapshot);
            const entry=snapshot.entries.find(entry=>entry.id===id);
            if(!entry)throw new Error('This item no longer exists.');
            const location=value===null?null:galaxyModel.normalizeLocation(value);
            if(value!==null&&!location)throw new Error('Enter a place or address of up to 1,000 characters.');
            const updated={...entry,updatedAt:new Date().toISOString()};
            if(location)updated.location=location;else delete updated.location;
            await commit({...snapshot,entries:snapshot.entries.map(record=>record.id===id?updated:record)},
                {type:'location.changed',ids:[id]});
            return updated;
        },
        async updateTask(snapshot,id,field,value) {
            snapshot=read(snapshot);
            const updated=cosmosTasks.change(new Map(snapshot.entries.map(entry=>[entry.id,entry])),id,field,value);
            await commit({...snapshot,entries:snapshot.entries.map(entry=>entry.id===id?updated:entry)},
                {type:'task.changed',ids:[id]});
            return updated;
        },
        async replaceConstellations(snapshot, records) {
            snapshot=read(snapshot);
            const previous = new Map((snapshot.constellations || []).map(record => [record.id, record]));
            const next = records.map(record => {
                const old = previous.get(record.id);
                return !old || old.name !== record.name || JSON.stringify(old.memberEntryIds) !== JSON.stringify(record.memberEntryIds)
                    ? {...record, updatedAt: new Date().toISOString()} : record;
            });
            await commit({...snapshot, constellations: next}, {type: 'constellations.changed', ids: [...new Set([...previous.keys(), ...next.map(record => record.id)])]});
            return next;
        },
        async replacePlacements(snapshot, records) {
            snapshot=read(snapshot);
            await commit({...snapshot, portals: records}, {type: 'placements.changed', ids: [...new Set([...(snapshot.portals || []).map(record => record.id), ...records.map(record => record.id)])]});
        },
        async moveEntries(snapshot, selectedIds, destinationId) {
            snapshot=read(snapshot);
            const entries=new Map(snapshot.entries.map(entry=>[entry.id,entry]));
            const plan=galaxyModel.movePlan(entries,selectedIds,destinationId);
            if(plan.error)throw new Error(plan.error);
            const changed=plan.roots.filter(id=>entries.get(id).parentId!==destinationId), moved=new Set(changed);
            const next={...snapshot,entries:snapshot.entries.map(entry=>moved.has(entry.id)?{...entry,parentId:destinationId}:entry),
                layout:(snapshot.layout||[]).filter(record=>!moved.has(record.id))};
            if(changed.length)await commit(next,{type:'items.moved',ids:changed});
            return {snapshot:next,roots:plan.roots,changed};
        },
        async duplicateStructure(snapshot,rootId,name,newId,position) {
            snapshot=read(snapshot);
            const plan=hierarchyCopies.structure(snapshot,rootId,name,newId,position);
            const next={...snapshot,entries:[...snapshot.entries,...plan.copies]};
            // One synchronous metadata write; no files or UI are touched before success.
            await commit(next,{type:'items.structure-duplicated',ids:plan.rootIds});
            return {...plan,snapshot:next};
        },
        async copyEntries(snapshot,roots,destination,newId,{readSnapshot=()=>snapshot,validate=()=>{},beforeFileWrite=async()=>{}}={}) {
            snapshot=read(snapshot);
            const plan=hierarchyCopies.plan(snapshot,roots,destination,newId),records=[];
            for(const file of plan.files){
                const old=await persistence.files.get(file.source.storageKey);
                if(!old||old.entryId!==file.source.entryId||!(old.blob instanceof Blob)||old.blob.size!==file.source.size)throw new Error('A file is unavailable. Restore it before making copies.');
                records.push({...old,key:file.metadata.storageKey,entryId:file.metadata.entryId});
            }
            if(records.length)await beforeFileWrite(records);
            let previous,next;
            const prepare=()=>{
                validate();previous=readSnapshot();
                const current=new Map(previous.entries.map(e=>[e.id,e])),original=new Map(snapshot.entries.map(e=>[e.id,e]));
                const liveIds=new Set(roots.flatMap(id=>[...galaxyModel.subtreeIds(current,id)]));
                const internal=state=>(state.portals||[]).filter(p=>plan.sourceIds.includes(p.parentEntryId)&&plan.sourceIds.includes(p.targetEntryId));
                if(!current.has(destination)||liveIds.size!==plan.sourceIds.length||plan.sourceIds.some(id=>!liveIds.has(id)||JSON.stringify(current.get(id))!==JSON.stringify(original.get(id)))||JSON.stringify(internal(previous))!==JSON.stringify(internal(snapshot)))throw new Error('The copied items changed. Try Paste again.');
                const occupied=new Set([...current.keys(),...(previous.portals||[]).map(p=>p.id)]);
                if([...plan.copies,...plan.links].some(e=>occupied.has(e.id)))throw new Error('Copied item IDs are no longer available.');
                const combined=new Map([...current,...plan.copies.map(entry=>[entry.id,entry])]);
                for(const entry of plan.copies){const error=galaxyModel.validateChange(entry,combined);if(error)throw new Error(error);}
                next={...previous,entries:[...previous.entries,...plan.copies],portals:[...(previous.portals||[]),...plan.links]};

            };
            const commitLocal=()=>{prepare();write(next,{type:'items.copied',ids:plan.rootIds});};
            if(records.length)await persistence.files.saveBatch(records,...fileCallbacks(commitLocal,()=>{if(previous)write(previous,{type:'items.copy-recovered',ids:plan.rootIds});}));
            else {prepare();if(!canWrite()||restoring)throw new Error('Saved data is unavailable.');await persistence.metadata.commit(next,{type:'items.copied',ids:plan.rootIds});}
            publish({type:'items.copied',ids:plan.rootIds});return {...plan,snapshot:next};
        },
        async archive(snapshot, record) {
            snapshot=read(snapshot);
            await commit({...snapshot, archivedGalaxies: [...(snapshot.archivedGalaxies || []), record]}, {type: 'galaxy.archived', ids: [record.galaxyId]});
        },
        async restore(snapshot, id) {
            snapshot=read(snapshot);
            await commit({...snapshot, archivedGalaxies: (snapshot.archivedGalaxies || []).filter(record => record.galaxyId !== id)}, {type: 'galaxy.restored', ids: [id]});
        },
        async deleteSubtree(snapshot, ids, {deleteFiles = true, validate = () => {}, readSnapshot = () => snapshot} = {}) {
            snapshot=read(snapshot);
            const removed = new Set(ids), intent = {type: 'items.deleted', ids: [...removed]};
            let previous, next;
            const prepare = () => {
                validate(); previous = readSnapshot();
                const collections = galaxyConstellations.withoutEntries(previous.constellations || [], removed);
                const original = new Map((previous.constellations || []).map(record => [record.id,record]));
                next = {...previous,
                    entries: previous.entries.filter(entry => !removed.has(entry.id)),
                    portals: galaxyPortals.withoutEntries(previous.portals || [], removed),
                    constellations: collections.map(record => record.memberEntryIds.length !== original.get(record.id).memberEntryIds.length ? {...record,updatedAt:new Date().toISOString()} : record),
                    archivedGalaxies: (previous.archivedGalaxies || []).filter(record => !removed.has(record.galaxyId)),
                    layout: (previous.layout || []).filter(record => !removed.has(record.id))};

            };
            const commitLocal=()=>{prepare();write(next,intent);};
            if (deleteFiles) await persistence.files.deleteEntries(removed, ...fileCallbacks(commitLocal, () => {
                if (previous) write(previous, {type: 'items.delete-recovered', ids: [...removed]});
            }));
            else {prepare();if(!canWrite()||restoring)throw new Error('Saved data is unavailable.');await persistence.metadata.commit(next,intent);}
            publish(intent);
            return next;
        }
    };
    const localContentCommit=(snapshot,id,value,recovery=null)=>{
        const previous=read(snapshot),entry=previous.entries.find(e=>e.id===id);
        if(!entry)throw new Error('This item no longer exists.');
        const content=value==null&&recovery?null:galaxyModel.normalizeContent(value,id);
        if(value!=null&&!content)throw new Error('Content is invalid or exceeds its text limits.');
        const updated={...entry};if(content)updated.content=content;else delete updated.content;
        if(recovery){if(recovery.updatedAt)updated.updatedAt=recovery.updatedAt;else delete updated.updatedAt;}else updated.updatedAt=new Date().toISOString();
        const intent={type:recovery?'content.recovered':'content.changed',ids:[id]};
        write({...previous,entries:previous.entries.map(e=>e.id===id?updated:e)},intent);return updated;
    };
    repository.addAttachment=async(snapshot,id,record,metadata)=>{
        let previous,updated;
        await persistence.files.save(record,...fileCallbacks(()=>{
            previous=read(snapshot);const entry=previous.entries.find(e=>e.id===id);if(!entry)throw new Error('This item no longer exists.');
            const content=entry.content||galaxyModel.emptyContent();updated=localContentCommit(previous,id,{...content,attachments:[...content.attachments,metadata]});
        },()=>{if(previous)write(previous,{type:'attachment.recovered',ids:[id]});}));
        publish({type:'attachment.added',ids:[id]});return updated;
    };
    repository.removeAttachment=async(snapshot,id,key)=>{
        let previous,updated;
        await persistence.files.delete(key,...fileCallbacks(()=>{
            previous=read(snapshot);const entry=previous.entries.find(e=>e.id===id);
            if(!entry?.content?.attachments.some(file=>file.storageKey===key))throw new Error('This file no longer exists.');
            updated=localContentCommit(previous,id,{...entry.content,attachments:entry.content.attachments.filter(file=>file.storageKey!==key)});
        },()=>{if(previous)write(previous,{type:'attachment.recovered',ids:[id]});}));
        publish({type:'attachment.removed',ids:[id]});return updated;
    };
    for(const name of ['save','saveLayout','updateContent','updateLocation','updateTask','replaceConstellations','replacePlacements','moveEntries','duplicateStructure','archive','restore','copyEntries','deleteSubtree','addAttachment','removeAttachment','replaceLocalBackup','recoverPendingRestore','recoverAttachmentOperations','auditAttachmentStorage','removeOrphanedAttachments']){
        const operation=repository[name];repository[name]=(...args)=>enqueue(()=>{
            const action=()=>operation.apply(repository,args);
            // Keep file callbacks and abort compensation under the SAME write
            // lock. Restore retains its stronger lifetime workspace exclusion.
            return persistence.metadata.withWrite ? persistence.metadata.withWrite(action,
                {replacement:['replaceLocalBackup','recoverPendingRestore'].includes(name)}) : action();
        });
    }
    repository.whenIdle=()=>tail;
    return repository;
}
