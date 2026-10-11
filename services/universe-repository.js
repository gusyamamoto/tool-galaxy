// Snapshot-level product boundary. Keep stable IDs and compound intent together.
// Metadata commit is synchronous; files are async with commit/rollback callbacks.
function createUniverseRepository({persistence, canWrite = () => true}) {
    const listeners = new Set();
    function write(snapshot, intent) {
        if (!canWrite()) throw new Error('Saved data is unavailable. The original data is being preserved.');
        try { persistence.metadata.save(snapshot, intent); }
        catch (error) { repository.lastError = error; throw error; }
    }
    function publish(intent) {
        if (persistence.sample) return;
        // Observers must never turn a successful local write into a UI failure.
        listeners.forEach(listener => { try { listener({...intent, ...(intent.ids ? {ids:[...intent.ids]} : {}), scope: persistence.scope}); } catch (error) { repository.lastObserverError = error; } });
    }
    const repository = {
        load: () => persistence.metadata.load(),
        needsCanonicalSave(saved, normalized) {
            return ['portals','constellations'].some(key => JSON.stringify(saved?.[key] || []) !== JSON.stringify(normalized[key]));
        },
        snapshot({entries, portals, constellations, layout, archivedGalaxies}) {
            return {
                entries: [...entries.values()].map(({id,name,description,category,parentId,x,y,appearance,content,createdAt,updatedAt}) =>
                    ({id,name,description,category,parentId,x,y, ...(appearance ? {appearance} : {}), ...(content ? {content} : {}),
                        ...(createdAt ? {createdAt} : {}), ...(updatedAt ? {updatedAt} : {})})),
                portals: [...portals.values()].map(record => ({...record})),
                constellations: [...constellations.values()].map(record => ({...record,memberEntryIds:[...record.memberEntryIds]})),
                layout: [...layout].map(([id,record]) => ({id,...record})),
                ...(archivedGalaxies.size ? {archivedGalaxies:[...archivedGalaxies.values()]} : {})
            };
        },
        save(snapshot, intent = {type: 'layout.saved'}) { write(snapshot, intent); publish(intent); },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        updateContent(snapshot, id, value, recovery = null) {
            const entry = snapshot.entries.find(entry => entry.id === id);
            if (!entry) throw new Error('This item no longer exists.');
            const content = value == null && recovery ? null : galaxyModel.normalizeContent(value, id);
            if (value != null && !content) throw new Error('Content is invalid or exceeds its text limits.');
            const updated = {...entry};
            if (content) updated.content = content; else delete updated.content;
            if (recovery) {
                if (recovery.updatedAt) updated.updatedAt = recovery.updatedAt; else delete updated.updatedAt;
            } else updated.updatedAt = new Date().toISOString();
            this.save({...snapshot, entries: snapshot.entries.map(record => record.id === id ? updated : record)},
                {type: recovery ? 'content.recovered' : 'content.changed', ids: [id]});
            return updated;
        },
        replaceConstellations(snapshot, records) {
            const previous = new Map((snapshot.constellations || []).map(record => [record.id, record]));
            const next = records.map(record => {
                const old = previous.get(record.id);
                return !old || old.name !== record.name || JSON.stringify(old.memberEntryIds) !== JSON.stringify(record.memberEntryIds)
                    ? {...record, updatedAt: new Date().toISOString()} : record;
            });
            this.save({...snapshot, constellations: next}, {type: 'constellations.changed', ids: [...new Set([...previous.keys(), ...next.map(record => record.id)])]});
            return next;
        },
        replacePlacements(snapshot, records) {
            this.save({...snapshot, portals: records}, {type: 'placements.changed', ids: [...new Set([...(snapshot.portals || []).map(record => record.id), ...records.map(record => record.id)])]});
        },
        moveEntries(snapshot, selectedIds, destinationId) {
            const entries=new Map(snapshot.entries.map(entry=>[entry.id,entry]));
            const plan=galaxyModel.movePlan(entries,selectedIds,destinationId);
            if(plan.error)throw new Error(plan.error);
            const changed=plan.roots.filter(id=>entries.get(id).parentId!==destinationId), moved=new Set(changed);
            const next={...snapshot,entries:snapshot.entries.map(entry=>moved.has(entry.id)?{...entry,parentId:destinationId}:entry),
                layout:(snapshot.layout||[]).filter(record=>!moved.has(record.id))};
            if(changed.length)this.save(next,{type:'items.moved',ids:changed});
            return {snapshot:next,roots:plan.roots,changed};
        },
        async copyEntries(snapshot,roots,destination,newId,{readSnapshot=()=>snapshot,validate=()=>{}}={}) {
            const plan=hierarchyCopies.plan(snapshot,roots,destination,newId),records=[];
            for(const file of plan.files){
                const old=await persistence.files.get(file.source.storageKey);
                if(!old||old.entryId!==file.source.entryId||!(old.blob instanceof Blob)||old.blob.size!==file.source.size)throw new Error('A file is unavailable. Restore it before making copies.');
                records.push({...old,key:file.metadata.storageKey,entryId:file.metadata.entryId});
            }
            let previous,next;
            const commit=()=>{
                validate();previous=readSnapshot();
                const current=new Map(previous.entries.map(e=>[e.id,e])),original=new Map(snapshot.entries.map(e=>[e.id,e]));
                const liveIds=new Set(roots.flatMap(id=>[...galaxyModel.subtreeIds(current,id)]));
                const internal=state=>(state.portals||[]).filter(p=>plan.sourceIds.includes(p.parentEntryId)&&plan.sourceIds.includes(p.targetEntryId));
                if(!current.has(destination)||liveIds.size!==plan.sourceIds.length||plan.sourceIds.some(id=>!liveIds.has(id)||JSON.stringify(current.get(id))!==JSON.stringify(original.get(id)))||JSON.stringify(internal(previous))!==JSON.stringify(internal(snapshot)))throw new Error('The copied items changed. Try Paste again.');
                const occupied=new Set([...current.keys(),...(previous.portals||[]).map(p=>p.id)]);
                if([...plan.copies,...plan.links].some(e=>occupied.has(e.id)))throw new Error('Copied item IDs are no longer available.');
                next={...previous,entries:[...previous.entries,...plan.copies],portals:[...(previous.portals||[]),...plan.links]};
                write(next,{type:'items.copied',ids:plan.rootIds});
            };
            if(records.length)await persistence.files.saveBatch(records,commit,()=>write(previous,{type:'items.copy-recovered',ids:plan.rootIds}));
            else commit();
            publish({type:'items.copied',ids:plan.rootIds});return {...plan,snapshot:next};
        },
        archive(snapshot, record) {
            this.save({...snapshot, archivedGalaxies: [...(snapshot.archivedGalaxies || []), record]}, {type: 'galaxy.archived', ids: [record.galaxyId]});
        },
        restore(snapshot, id) {
            this.save({...snapshot, archivedGalaxies: (snapshot.archivedGalaxies || []).filter(record => record.galaxyId !== id)}, {type: 'galaxy.restored', ids: [id]});
        },
        async deleteSubtree(snapshot, ids, {deleteFiles = true, validate = () => {}, readSnapshot = () => snapshot} = {}) {
            const removed = new Set(ids), intent = {type: 'items.deleted', ids: [...removed]};
            let committed = false, previous, next;
            const commit = () => {
                validate(); previous = readSnapshot();
                const collections = galaxyConstellations.withoutEntries(previous.constellations || [], removed);
                const original = new Map((previous.constellations || []).map(record => [record.id,record]));
                next = {...previous,
                    entries: previous.entries.filter(entry => !removed.has(entry.id)),
                    portals: galaxyPortals.withoutEntries(previous.portals || [], removed),
                    constellations: collections.map(record => record.memberEntryIds.length !== original.get(record.id).memberEntryIds.length ? {...record,updatedAt:new Date().toISOString()} : record),
                    archivedGalaxies: (previous.archivedGalaxies || []).filter(record => !removed.has(record.galaxyId)),
                    layout: (previous.layout || []).filter(record => !removed.has(record.id))};
                write(next, intent); committed = true;
            };
            if (deleteFiles) await persistence.files.deleteEntries(removed, commit, () => {
                if (committed) write(previous, {type: 'items.delete-recovered', ids: [...removed]});
            });
            else commit();
            publish(intent);
            return next;
        }
    };
    return repository;
}
