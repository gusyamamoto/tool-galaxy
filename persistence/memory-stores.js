// Explicit disposable adapters for Sample and tests. Never touch browser storage.
function createMemoryMetadataStore(initial = null) {
    let snapshot = initial, journal=null, raw=null;
    return {
        readRestoreJournal:()=>structuredClone(journal),beginRestore(value){journal=structuredClone(value);},endRestore(){journal=null;},
        captureRestoreState(){return {current:this.readForBackup().metadataText,legacy:null};},
        replaceRaw(text){snapshot=text===null?null:JSON.parse(text);raw=text;},recoverRaw(previous){this.replaceRaw(previous.current);},
        load: () => snapshot == null ? null : structuredClone(snapshot),
        readForBackup: () => ({metadataText: raw ?? (snapshot == null ? null : JSON.stringify({version:5,connections:[],layout:[],...snapshot}))}),
        async commit(value,intent) { this.save(value,intent); },
        save(value) { snapshot = structuredClone(value);raw=null; },
        clear() { snapshot = null;raw=null; }
    };
}
function createMemoryPreferencesStore() {
    let preferences = {},raw;
    return {
        replaceRaw(text){preferences=text===null?{}:JSON.parse(text);raw=text;},
        load: () => ({...preferences}),
        readForBackup: () => raw === undefined ? JSON.stringify(preferences) : raw,
        update(patch) { preferences = {...preferences, ...patch};raw=undefined;return Promise.resolve(); },
        clear() { preferences = {};raw=undefined;return Promise.resolve(); }
    };
}
function createMemoryFileStore() {
    let records = new Map();
    let marker=null;
    function commitNow(commit) {
        if (commit?.()?.then) throw new Error('Attachment metadata must be committed synchronously.');
    }
    return {
        async restoreMarker(){return marker;},
        async replaceAll(values,id,commit,rollback){
            const staged=new Map();values.forEach(record=>{if(!record?.key||staged.has(record.key)||!(record.blob instanceof Blob))throw new Error('Invalid restored file.');staged.set(record.key,record);});
            try{commitNow(commit);}catch(error){try{rollback();}catch(cause){const failure=new Error('Restore recovery needs a reload before continuing.',{cause});failure.recoveryRequired=true;throw failure;}throw error;}
            records=staged;marker=id;
        },
        temporary: true,
        hasEntries(ids) { const set = new Set(ids); return [...records.values()].some(record => set.has(record.entryId)); },
        async save(record, commit) {
            if (!record?.key || !record.entryId || !(record.blob instanceof Blob)) throw new Error('Invalid attachment file.');
            commitNow(commit); records.set(record.key, record);
        },
        async get(key) { return records.get(key) || null; },
        async readAll() { return structuredClone([...records.values()]); },
        async saveBatch(values,commit) {
            const staged=new Map();
            values.forEach(record=>{if(!record?.key||records.has(record.key)||staged.has(record.key)||!record.entryId||!(record.blob instanceof Blob))throw new Error('Invalid attachment copy.');staged.set(record.key,record);});
            commitNow(commit);staged.forEach((record,key)=>records.set(key,record));
        },
        async delete(key, commit) { commitNow(commit); return records.delete(key) ? 1 : 0; },
        async deleteEntries(ids, commit) {
            const set = new Set(ids), removed = [...records].filter(([,record]) => set.has(record.entryId));
            commitNow(commit); removed.forEach(([key]) => records.delete(key)); return removed.length;
        }
    };
}
