// Test-only fault injection in an isolated browser profile. This is not a
// physical WebKit reproduction: Chromium supplies real IDB transactions while
// the failing request reports WebKit's exact Blob preparation error.
(() => {
    const add=IDBObjectStore.prototype.add,remove=IDBObjectStore.prototype.delete;
    const signature=()=>new DOMException('Error preparing Blob/File data to be stored in object store','UnknownError');
    window.binaryWrites=[];
    window.binaryOriginals=new Map();
    window.binaryHash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
    window.binarySetMode=mode=>sessionStorage.setItem('test:attachment-binary-mode',mode);
    IDBObjectStore.prototype.add=function(record,...args){
        if(this.name!=='files')return add.call(this,record,...args);
        const blob=record.blob instanceof Blob||record.thumbnail instanceof Blob;
        const mode=sessionStorage.getItem('test:attachment-binary-mode');
        binaryWrites.push({key:record.key,encoding:blob?'blob':'bytes'});
        if(blob)binaryOriginals.set(record.key,record);
        if(blob&&['sync','async','both-fail'].includes(mode)){
            if(mode==='async'){
                add.call(this,record,...args);
                const request=add.call(this,record,...args);
                Object.defineProperty(request,'error',{get:signature});
                return request; // Duplicate-key error aborts and rolls back the REAL transaction.
            }
            throw signature();
        }
        if(!blob&&mode==='both-fail')throw new DOMException('Injected byte storage full','QuotaExceededError');
        return add.call(this,record,...args);
    };
    IDBObjectStore.prototype.delete=function(key){
        if(this.name==='fileOperations'&&window.binaryFailJournalFinish){
            window.binaryFailJournalFinish=false;
            throw new DOMException('Injected journal cleanup interruption','AbortError');
        }
        return remove.call(this,key);
    };
    window.binaryRawState=async()=>{
        const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('galaxy-attachments');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
        try{return await new Promise((resolve,reject)=>{
            const tx=db.transaction(['files','fileOperations'],'readonly');
            const files=tx.objectStore('files').getAll(),ops=tx.objectStore('fileOperations').getAll();
            tx.oncomplete=()=>resolve({files:files.result,operations:ops.result});tx.onabort=()=>reject(tx.error);
        });}finally{db.close();}
    };
})();
