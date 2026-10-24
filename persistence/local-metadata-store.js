// Persistence adapter: exchange plain data with the app, never DOM elements.
// Keep current keys, exact legacy backups and the v5 format inside this adapter.
function createLocalMetadataStore({storage = () => globalThis.localStorage, scope = null, locks = globalThis.navigator?.locks} = {}) {
    const prefix = scope == null ? "galaxy:user-data" : `galaxy:workspace:${encodeURIComponent(scope)}:user-data`;
    // The exact persisted text is the durable snapshot identity, including legacy
    // data. Only a successful load/write acknowledges it; Backup never rebases it.
    const writeLock = `cosmifold-workspace-write:${JSON.stringify(scope)}`, listeners = new Set();
    let acknowledged = false, expected = null, stale = false, writing = false, loadFailure = null;
    const current = () => storage().getItem(prefix) ?? (scope == null ? storage().getItem('tool-galaxy:user-data') : null);
    const remember = text => { expected = text; acknowledged = true; };
    function staleError() {
        const error = new Error('Cosmifold changed in another tab. Reload this tab to continue safely.');
        error.code = 'LOCAL_SNAPSHOT_STALE';
        if (!stale) {
            stale = true;
            listeners.forEach(listener => { try { listener(error); } catch { /* Observers cannot permit a stale write. */ } });
        }
        return error;
    }
    function assertCurrent() {
        if (loadFailure) throw loadFailure;
        if (stale) throw staleError();
        const text = current();
        if (acknowledged && text !== expected) throw staleError();
        if (!acknowledged) remember(text);
        return text;
    }
    function validate(data) {
        const records = data?.version === 1 ? data.tools : data?.entries;
        if (!data || ![1, 2, 3, 4, 5].includes(data.version) || !Array.isArray(records) ||
            (data.version < 3 && !Array.isArray(data.builtInPositions)) ||
            (data.version >= 4 && !Array.isArray(data.layout)) ||
            (data.portals != null && !Array.isArray(data.portals)) ||
            (data.constellations != null && !Array.isArray(data.constellations)) ||
            (data.archivedGalaxies != null && !Array.isArray(data.archivedGalaxies))) {
            throw new Error("Unsupported or invalid saved galaxy.");
        }
        galaxyModel.validateStoredSnapshot(data);
    }
    function parseStored(text) {
        let data;
        try { data=JSON.parse(text); }
        catch(cause) {
            loadFailure=Object.assign(new Error('Saved local data could not be read.',{cause}),{code:'LOCAL_DATA_SYNTAX'});
            throw loadFailure;
        }
        try { validate(data); }
        catch(cause) {
            loadFailure=Object.assign(new Error('Saved local data could not be loaded safely.',{cause}),{code:'LOCAL_DATA_STRUCTURE'});
            throw loadFailure;
        }
        return data;
    }
    return {
        subscribeStale(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        async withWrite(action, {replacement = false} = {}) {
            if (!locks?.request) {
                const error = new Error('Safe local saving requires a current browser on HTTPS or localhost.');
                error.code = 'LOCAL_WRITE_LOCK_UNAVAILABLE'; throw error;
            }
            return locks.request(writeLock, {mode:'exclusive'}, async () => {
                if (!replacement) assertCurrent();
                writing = true;
                try { return await action(); } finally { writing = false; }
            });
        },
        checkpoint(snapshot) {
            assertCurrent();
            // pagehide cannot await a new Web Lock. Never bypass serialization.
            if (!writing) return false;
            this.save(snapshot); return true;
        },
        key: prefix,
        legacyKey: scope == null ? "tool-galaxy:user-data" : prefix,
        backupKey: prefix + ":pre-hierarchy",
        layoutBackupKey: prefix + ":pre-layout",
        treeBackupKey: prefix + ":pre-cosmic-tree",
        restoreKey: prefix + ":restore-pending",
        readRestoreJournal() { const text=storage().getItem(this.restoreKey);return text===null?null:JSON.parse(text); },
        beginRestore(journal) { storage().setItem(this.restoreKey,JSON.stringify(journal)); },
        endRestore() { storage().removeItem(this.restoreKey); },
        captureRestoreState() { const disk=storage();return {current:disk.getItem(this.key),legacy:this.legacyKey===this.key?null:disk.getItem(this.legacyKey)}; },
        replaceRaw(text) {
            const disk=storage();if(text===null)disk.removeItem(this.key);else disk.setItem(this.key,text);
            if(this.legacyKey!==this.key)disk.removeItem(this.legacyKey);
            remember(current());
            loadFailure=null;
        },
        recoverRaw(previous) {
            const disk=storage(),put=(key,text)=>text===null?disk.removeItem(key):disk.setItem(key,text);
            put(this.key,previous.current);if(this.legacyKey!==this.key)put(this.legacyKey,previous.legacy);
            remember(current());
            // A failed Restore may have briefly installed good metadata. Its
            // rollback must reinstate the original recovery write guard too.
            loadFailure=null;
            const text=current();if(text!==null)try{parseStored(text);}catch{ /* Raw rollback remains successful. */ }
        },

        readForBackup() {
            const localStorage = storage();
            return {
                metadataText: localStorage.getItem(this.key) ?? localStorage.getItem(this.legacyKey)
            };
        },

        load() {
            const localStorage = storage();
            const stored = localStorage.getItem(this.key) ?? localStorage.getItem(this.legacyKey);
            if (stored === null) {
                if (!acknowledged) remember(null);
                return null;
            }

            const data = parseStored(stored);
            if (!acknowledged) remember(stored);
            const records = data.version === 1 ? data.tools : data.entries;
            // Version 3 keeps all entries (including built-in edits/positions) together.
            // Partial legacy built-in records are merged with defaults by the application.
            return {
                version: 5,
                migrateTree: data.version < 5,
                legacy: data.version < 3,
                entries: data.version < 3 ? [...records, ...data.builtInPositions] : records,
                // Compatibility boundary only: obsolete records never enter active state.
                ...(data.connections != null && (!Array.isArray(data.connections) || data.connections.length) ? { needsCanonicalSave: true } : {}),
                layout: data.version >= 4 ? data.layout : [],
                ...(data.portals != null ? { portals: data.portals } : {}),
                ...(data.constellations != null ? { constellations: data.constellations } : {}),
                ...(data.archivedGalaxies != null ? { archivedGalaxies: data.archivedGalaxies } : {})
            };
        },

        async commit(snapshot,intent) { this.save(snapshot,intent); },
        save(snapshot) {
            const localStorage = storage();
            const previous = assertCurrent();
            const previousData = previous === null ? null : parseStored(previous);
            const previousVersion = previousData?.version ?? null;
            if (previousVersion !== null && ![1, 2, 3, 4, 5].includes(previousVersion)) {
                throw new Error("Unsupported saved galaxy cannot be overwritten.");
            }
            if (previousVersion !== null && previousVersion < 3 && localStorage.getItem(this.backupKey) === null) {
                // Back up the exact old snapshot before replacing it. If this fails, keep it untouched.
                localStorage.setItem(this.backupKey, previous);
            }
            if (previousVersion === 3 && localStorage.getItem(this.layoutBackupKey) === null) {
                localStorage.setItem(this.layoutBackupKey, previous);
            }
            if (previousVersion !== null && previousVersion < 5 && localStorage.getItem(this.treeBackupKey) === null) {
                localStorage.setItem(this.treeBackupKey, previous);
            }
            const text = JSON.stringify({
                // Empty legacy slot keeps older version-5 readers able to open the snapshot.
                version: 5, entries: snapshot.entries, connections: [], layout: snapshot.layout || [],
                ...(snapshot.portals != null ? { portals: snapshot.portals } : {}),
                ...(snapshot.constellations != null ? { constellations: snapshot.constellations } : {}),
                ...(snapshot.archivedGalaxies != null ? { archivedGalaxies: snapshot.archivedGalaxies } : {})
            });
            localStorage.setItem(this.key, text);
            remember(text);
        },
        clear() {
            const localStorage = storage();
            localStorage.removeItem(this.key);
            if (this.legacyKey !== this.key) localStorage.removeItem(this.legacyKey);
            // Recovery backups intentionally remain available.
        }
    };
}
