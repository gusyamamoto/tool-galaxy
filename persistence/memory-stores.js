// Explicit disposable adapters for Sample and tests. Never touch browser storage.
function createMemoryMetadataStore(initial = null) {
    let snapshot = initial;
    return {
        load: () => snapshot == null ? null : structuredClone(snapshot),
        save(value) { snapshot = structuredClone(value); },
        clear() { snapshot = null; }
    };
}
function createMemoryPreferencesStore() {
    let preferences = {};
    return {
        load: () => ({...preferences}),
        update(patch) { preferences = {...preferences, ...patch}; },
        clear() { preferences = {}; }
    };
}
function createMemoryFileStore() {
    const records = new Map();
    function commitNow(commit) {
        if (commit?.()?.then) throw new Error('Attachment metadata must be committed synchronously.');
    }
    return {
        temporary: true,
        hasEntries(ids) { const set = new Set(ids); return [...records.values()].some(record => set.has(record.entryId)); },
        async save(record, commit) {
            if (!record?.key || !record.entryId || !(record.blob instanceof Blob)) throw new Error('Invalid attachment file.');
            commitNow(commit); records.set(record.key, record);
        },
        async get(key) { return records.get(key) || null; },
        async delete(key, commit) { commitNow(commit); return records.delete(key) ? 1 : 0; },
        async deleteEntries(ids, commit) {
            const set = new Set(ids), removed = [...records].filter(([,record]) => set.has(record.entryId));
            commitNow(commit); removed.forEach(([key]) => records.delete(key)); return removed.length;
        }
    };
}
