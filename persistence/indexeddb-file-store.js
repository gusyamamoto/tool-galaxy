// Replaceable binary storage boundary. The inspector never uses IndexedDB APIs.
// Metadata callbacks are synchronous so both writes share an abortable IDB tx.
function createIndexedDbFileStore({indexedDB = globalThis.indexedDB, scope = null} = {}) {
    const databaseName = scope == null ? "galaxy-attachments" : `galaxy-attachments:${encodeURIComponent(scope)}`;
    const ownership = new Map();
    let discovered = false;
    let opening = null;
    function open() {
        if (opening) return opening;
        opening = new Promise((resolve, reject) => {
            if (!indexedDB) { reject(new Error("File storage is unavailable in this browser.")); return; }
            const request = indexedDB.open(databaseName, 1);
            let failed = false;
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore("files", { keyPath: "key" });
                store.createIndex("entryId", "entryId", { unique: false });
            };
            request.onblocked = () => { failed = true; reject(new Error("Close other Galaxy tabs and try the file action again.")); };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                if (failed) { db.close(); return; }
                db.onversionchange = () => { db.close(); opening = null; };
                resolve(db);
            };
        }).catch(error => { opening = null; throw error; });
        return opening;
    }
    async function transaction(mode, operation, commit = () => {}, rollback = () => {}) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction("files", mode), store = tx.objectStore("files");
            let result, failure, metadataCommitted = false;
            tx.oncomplete = () => resolve(result);
            tx.onabort = () => {
                if (metadataCommitted) {
                    try { rollback(); } catch (error) { failure = new Error("The file action failed and metadata recovery failed. Reload before continuing.", { cause: error }); }
                }
                reject(failure || tx.error || new Error("File storage could not complete the action."));
            };
            const finish = value => {
                try {
                    const returned = commit();
                    if (returned?.then) throw new Error("Attachment metadata must be committed synchronously.");
                    metadataCommitted = true; result = value;
                } catch (error) { failure = error; tx.abort(); }
            };
            try { operation(store, finish); } catch (error) { failure = error; tx.abort(); }
        });
    }
    // Read keys/owners only at startup, never file bytes or previews. This also
    // lets deletion clean an unreferenced file left by an interrupted old write.
    transaction("readonly", (store, finish) => {
        const request = store.index("entryId").openKeyCursor();
        request.onsuccess = () => { const cursor = request.result;
            if (!cursor) { finish(); return; }
            ownership.set(cursor.primaryKey, cursor.key); cursor.continue();
        };
    }).catch(() => {}).finally(() => { discovered = true; });
    async function remove(commit, rollback, targets, byEntry = false) {
        const removed = [];
        const result = await transaction("readwrite", (store, finish) => {
            let count = 0, index = 0;
            const source = byEntry ? store.index("entryId") : store;
            const next = () => {
                if (index === targets.length) { finish(count); return; }
                const request = source.openKeyCursor(IDBKeyRange.only(targets[index++]));
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor) { next(); return; }
                    store.delete(cursor.primaryKey); removed.push(cursor.primaryKey); count++; cursor.continue();
                };
            };
            next();
        }, commit, rollback);
        removed.forEach(key => ownership.delete(key));
        return result;
    }
    return {
        temporary: false,
        hasEntries(ids) { const set = new Set(ids); return !discovered || [...ownership.values()].some(id => set.has(id)); },
        async save(record, commit, rollback) {
            if (!record?.key || !record.entryId || !(record.blob instanceof Blob)) throw new Error("Invalid attachment file.");
            const result = await transaction("readwrite", (store, finish) => { const request = store.put(record); request.onsuccess = () => finish(); }, commit, rollback);
            ownership.set(record.key, record.entryId); return result;
        },
        async get(key) {
            return transaction("readonly", (store, finish) => { const request = store.get(key); request.onsuccess = () => finish(request.result || null); });
        },
        delete(key, commit, rollback) { return remove(commit, rollback, [key]); },
        deleteEntries(ids, commit, rollback) { const set = new Set(ids); return remove(commit, rollback, [...set], true); }
    };
}

