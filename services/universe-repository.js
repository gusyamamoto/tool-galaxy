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
