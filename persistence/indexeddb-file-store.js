// Replaceable binary storage boundary. The inspector never uses IndexedDB APIs.
// Ordinary mutations bridge durable file transactions and synchronous metadata
// commits with a small journal. Restore retains its separate replacement contract.
function planAttachmentRecovery(operations,snapshot) {
    const fail=()=>{const error=new Error("Cosmifold couldn't finish recovering a file operation. Your saved data has been left unchanged.");error.code='ATTACHMENT_RECOVERY_REQUIRED';throw error;};
    const references=new Map();
    for(const entry of snapshot?.entries||[])for(const file of entry.content?.attachments||[])references.set(file.storageKey,entry.id);
    const ids=new Set();
    return operations.map(operation=>{
        if(!operation||operation.version!==1||typeof operation.id!=='string'||!operation.id||ids.has(operation.id)||
            !['add','copy','remove','deleteEntries'].includes(operation.type)||!['prepared','files-written'].includes(operation.stage)||!Array.isArray(operation.files))fail();
        ids.add(operation.id);const keys=new Set();
        const files=operation.files.map(file=>{
            if(!file||typeof file.key!=='string'||!file.key||typeof file.entryId!=='string'||!file.entryId||keys.has(file.key))fail();
            keys.add(file.key);
            const referencedBy=references.get(file.key);
            // An add's marker is atomic with creation of NEW keys. A prepared
            // add cannot establish ownership of an older collision/orphan.
            return {...file,referencedBy,remove:!referencedBy&&(['remove','deleteEntries'].includes(operation.type)||operation.stage==='files-written')};
        });
        return {id:operation.id,files};
    });
}
function createIndexedDbFileStore({indexedDB = globalThis.indexedDB, scope = null} = {}) {
    const databaseName = scope == null ? "galaxy-attachments" : `galaxy-attachments:${encodeURIComponent(scope)}`;
    const ownership = new Map();
    let discovered = false;
    let opening = null;
    let recoveryBlocked=false;
    let operationStageHook=null;
    function open() {
        if (opening) return opening;
        opening = new Promise((resolve, reject) => {
            if (!indexedDB) { reject(new Error("File storage is unavailable in this browser.")); return; }
            const request = indexedDB.open(databaseName, 3);
            let failed = false;
            request.onupgradeneeded = () => {
                if(!request.result.objectStoreNames.contains('files')) {
                    const store = request.result.createObjectStore("files", { keyPath: "key" });
                    store.createIndex("entryId", "entryId", { unique: false });
                }
                if(!request.result.objectStoreNames.contains('restoreState'))request.result.createObjectStore('restoreState');
                if(!request.result.objectStoreNames.contains('fileOperations'))request.result.createObjectStore('fileOperations',{keyPath:'id'});
            };
            request.onblocked = () => { failed = true; reject(new Error("Close other Cosmifold tabs and try the file action again.")); };
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
    async function durable(stores,operation) {
        const db=await open();
        return new Promise((resolve,reject)=>{
            const tx=db.transaction(stores,'readwrite',{durability:'strict'});let failure;
            tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||new Error('File storage could not complete the action.'));
            const fail=error=>{failure=error;tx.abort();};
            try{operation(tx,fail);}catch(error){fail(error);}
        });
    }
    function commitNow(commit,rollback) {
        try{if(commit?.()?.then)throw new Error('Attachment metadata must be committed synchronously.');}
        catch(error){
            try{rollback?.();}catch(cause){recoveryBlocked=true;const failure=new Error('The file action failed and metadata recovery failed. Reload before continuing.',{cause});failure.recoveryRequired=true;throw failure;}
            throw error;
        }
    }
    function journal(type,files) {
        if(recoveryBlocked){const error=new Error('Reload before continuing with file actions.');error.code='ATTACHMENT_RECOVERY_REQUIRED';throw error;}
        return {version:1,id:cosmifoldIds.uuid(),type,stage:'prepared',files};
    }
    const begin=operation=>durable(['fileOperations'],tx=>tx.objectStore('fileOperations').add(operation));
    const finish=id=>durable(['fileOperations'],tx=>tx.objectStore('fileOperations').delete(id));
    async function finishQuietly(id){try{await finish(id);}catch{ /* Next startup reconciles the durable record; the action already succeeded. */ }}
    async function saveRecords(records,type,commit,rollback) {
        const keys=new Set();
        records.forEach(record=>{if(typeof record?.key!=='string'||!record.key||keys.has(record.key)||typeof record.entryId!=='string'||!record.entryId||!(record.blob instanceof Blob))throw new Error('Invalid attachment file.');keys.add(record.key);});
        if(!records.length){commitNow(commit,rollback);return;}
        const operation=journal(type,records.map(({key,entryId})=>({key,entryId})));
        await begin(operation);let written=false;
        try{
            await durable(['files','fileOperations'],tx=>{
                records.forEach(record=>tx.objectStore('files').add(record));
                tx.objectStore('fileOperations').put({...operation,stage:'files-written'});
            });
            written=true;records.forEach(record=>ownership.set(record.key,record.entryId));
            // Explicit DevTools/test hook: no open IDB tx or file bytes cross it.
            if(operationStageHook)await operationStageHook({stage:'files-written',operation:{...operation,stage:'files-written'}});
            // File bytes and their ownership marker are durable BEFORE metadata.
            commitNow(commit,rollback);
        }catch(error){
            if(!recoveryBlocked)try{
                await durable(['files','fileOperations'],tx=>{
                    if(written)records.forEach(record=>tx.objectStore('files').delete(record.key));
                    tx.objectStore('fileOperations').delete(operation.id);
                });
                if(written)records.forEach(record=>ownership.delete(record.key));
            }catch{ /* Preserve the journal for retry; never report success. */ }
            throw error;
        }
        await finishQuietly(operation.id);
    }
    async function readFiles(operation) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction("files", 'readonly'), store = tx.objectStore("files");
            let result, failure;
            tx.oncomplete = () => resolve(result);
            tx.onabort = () => reject(failure || tx.error || new Error("File storage could not complete the action."));
            const finish = value => { result=value; };
            try { operation(store, finish); } catch (error) { failure = error; tx.abort(); }
        });
    }
    // Read keys/owners only at startup, never file bytes or previews. This also
    // lets deletion clean an unreferenced file left by an interrupted old write.
    readFiles((store, finish) => {
        const request = store.index("entryId").openKeyCursor();
        request.onsuccess = () => { const cursor = request.result;
            if (!cursor) { finish(); return; }
            ownership.set(cursor.primaryKey, cursor.key); cursor.continue();
        };
    }).catch(() => {}).finally(() => { discovered = true; });
    async function remove(commit, rollback, targets, byEntry = false) {
        const files=[];
        await readFiles((store,finish)=>{
            let index=0;
            const next = () => {
                if(index===targets.length){finish();return;}
                const target=targets[index++];
                if(!byEntry){const request=store.get(target);request.onsuccess=()=>{if(request.result)files.push({key:target,entryId:request.result.entryId});next();};return;}
                const request=store.index('entryId').openKeyCursor(IDBKeyRange.only(target));
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor) { next(); return; }
                    files.push({key:cursor.primaryKey,entryId:target});cursor.continue();
                };
            };
            next();
        });
        if(!files.length){commitNow(commit,rollback);return 0;}
        const operation=journal(byEntry?'deleteEntries':'remove',files);await begin(operation);
        try{commitNow(commit,rollback);}catch(error){if(!recoveryBlocked)await finishQuietly(operation.id);throw error;}
        try{
            await durable(['files','fileOperations'],tx=>{
                files.forEach(file=>tx.objectStore('files').delete(file.key));
                tx.objectStore('fileOperations').delete(operation.id);
            });
        }catch(error){
            try{rollback?.();}catch(cause){recoveryBlocked=true;const failure=new Error('The file action failed and metadata recovery failed. Reload before continuing.',{cause});failure.recoveryRequired=true;throw failure;}
            await finishQuietly(operation.id);throw error;
        }
        files.forEach(file=>ownership.delete(file.key));return files.length;
    }
    return {
        setOperationStageHook(hook){operationStageHook=typeof hook==='function'?hook:null;},
        async listOperations(){
            const db=await open();return new Promise((resolve,reject)=>{
                const tx=db.transaction('fileOperations','readonly'),request=tx.objectStore('fileOperations').getAll();
                tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error||new Error('File recovery records could not be read.'));
            });
        },
        async recoverOperations(snapshot){
            try{
                const plan=planAttachmentRecovery(await this.listOperations(),snapshot),removed=[];
                if(!plan.length){recoveryBlocked=false;return;}
                await durable(['files','fileOperations'],(tx,fail)=>{
                    for(const operation of plan){
                        for(const file of operation.files){
                            const request=tx.objectStore('files').get(file.key);
                            request.onsuccess=()=>{
                                try{
                                const record=request.result;
                                if(record&&((file.remove&&record.entryId!==file.entryId)||(file.referencedBy&&record.entryId!==file.referencedBy))){
                                    const error=new Error('File recovery ownership could not be verified.');error.code='ATTACHMENT_RECOVERY_REQUIRED';fail(error);return;
                                }
                                if(file.remove){tx.objectStore('files').delete(file.key);removed.push(file.key);}
                                }catch(error){fail(error);}
                            };
                        }
                        tx.objectStore('fileOperations').delete(operation.id);
                    }
                });
                removed.forEach(key=>ownership.delete(key));recoveryBlocked=false;
            }catch(error){recoveryBlocked=true;throw error;}
        },
        async restoreMarker() {
            const db=await open();return new Promise((resolve,reject)=>{
                const tx=db.transaction('restoreState','readonly'),request=tx.objectStore('restoreState').get('committed');
                tx.oncomplete=()=>resolve(request.result||null);tx.onabort=()=>reject(tx.error||new Error('Restore status unavailable.'));
            });
        },
        async replaceAll(records,id,commit,rollback) {
            const db=await open();
            await new Promise((resolve,reject)=>{
                // All old rows, including orphans, remain intact until this transaction completes.
                const tx=db.transaction(['files','restoreState','fileOperations'],'readwrite',{durability:'strict'}),store=tx.objectStore('files');
                let failure,attempted=false;
                tx.oncomplete=resolve;
                tx.onabort=()=>{
                    if(attempted)try{rollback();}catch(error){failure=new Error('Restore recovery needs a reload before continuing.',{cause:error});failure.recoveryRequired=true;}
                    reject(failure||tx.error||new Error('Could not prepare restored files.'));
                };
                try {
                    store.clear();records.forEach(record=>store.add(record));
                    tx.objectStore('fileOperations').clear();
                    const marker=tx.objectStore('restoreState').put(id,'committed');
                    marker.onsuccess=()=>{try{attempted=true;if(commit()?.then)throw new Error('Restore metadata must commit synchronously.');}catch(error){failure=error;tx.abort();}};
                }catch(error){failure=error;tx.abort();}
            });
            // Cache maintenance must not reject an already committed replacement.
            ownership.clear();
            recoveryBlocked=false;
            try{records.forEach(record=>ownership.set(record.key,record.entryId));discovered=true;}
            catch{ownership.clear();discovered=false;}
        },
        temporary: false,
        hasEntries(ids) { const set = new Set(ids); return !discovered || [...ownership.values()].some(id => set.has(id)); },
        async save(record, commit, rollback) {
            return saveRecords([record],'add',commit,rollback);
        },
        async get(key) {
            return readFiles((store, finish) => { const request = store.get(key); request.onsuccess = () => finish(request.result || null); });
        },
        async readAll() {
            return readFiles((store, finish) => { const request = store.getAll(); request.onsuccess = () => finish(request.result); });
        },
        async saveBatch(records,commit,rollback) {
            return saveRecords(records,'copy',commit,rollback);
        },
        delete(key, commit, rollback) { return remove(commit, rollback, [key]); },
        deleteEntries(ids, commit, rollback) { const set = new Set(ids); return remove(commit, rollback, [...set], true); }
    };
}

