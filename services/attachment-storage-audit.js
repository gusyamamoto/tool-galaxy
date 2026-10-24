// Read-only classification. Only the repository can authorize maintenance deletion.
const cosmifoldAttachmentAudit = (() => {
    const key=value=>typeof value==='string'&&!!value.trim()&&value.length<=1024;
    const bytes=value=>Number.isSafeInteger(value)&&value>=0;
    const only=(value,names)=>Object.keys(value).every(name=>names.includes(name));
    function describe(record,primaryKey){
        const size=record?.blob instanceof Blob?record.blob.size:null;
        const thumbnailBytes=record?.thumbnail==null?0:record.thumbnail instanceof Blob?record.thumbnail.size:null;
        return {key:primaryKey,entryId:record?.entryId,size,thumbnailBytes,
            recognizable:Object.prototype.toString.call(record)==='[object Object]'&&key(primaryKey)&&record.key===primaryKey&&key(record.entryId)&&record.entryId.length<=150&&
                bytes(size)&&bytes(thumbnailBytes)&&only(record,['key','entryId','blob','thumbnail'])};
    }
    function knownMetadata(raw){
        if(!raw||raw.version!==5||!only(raw,['version','entries','connections','layout','portals','constellations','archivedGalaxies']))return false;
        // F3 preserves extensions. F8 cannot infer whether future fields own files.
        return raw.entries.every(entry=>only(entry,['id','name','description','category','parentId','x','y','appearance','content','location','createdAt','updatedAt','taskList','completed'])&&
            (!entry.content||(only(entry.content,['version','notes','links','attachments'])&&
                only(entry.content.notes,['format','text'])&&entry.content.links.every(link=>only(link,['id','url','title']))&&
                entry.content.attachments.every(file=>only(file,['id','kind','entryId','filename','mimeType','extension','size','storageKey','createdAt','width','height','duration'])))));
    }
    function classify(snapshot,inventory,raw){
        const references=new Map();
        for(const entry of snapshot?.entries||[])for(const file of entry.content?.attachments||[]){
            if(references.has(file.storageKey))throw new Error('Duplicate attachment references cannot be audited safely.');
            references.set(file.storageKey,entry.id);
        }
        const result={live:[],recoveryOwned:[],orphaned:[],unknown:[],orphanedBytes:0,blocked:null};
        const recovery=new Set();let validOperations=true;
        try{planAttachmentRecovery(inventory.operations,snapshot);}catch{validOperations=false;}
        if(validOperations)for(const op of inventory.operations)for(const file of op.files)recovery.add(file.key);
        const marker=inventory.restoreState;
        if(marker.some(record=>record.key!=='committed'||!key(record.value)))result.blocked='Restore state needs to settle before checking unused files.';
        if(inventory.recoveryBlocked||inventory.operations.length)result.blocked='Reload to finish file recovery before removing unused files.';
        if(!knownMetadata(raw))result.blocked='Some saved fields are not recognized by this storage check. Unreferenced file data has been preserved.';
        for(const record of inventory.records){
            if(references.has(record.key))result.live.push(record);
            else if(recovery.has(record.key))result.recoveryOwned.push(record);
            else if(!result.blocked&&record.recognizable)result.orphaned.push(record);
            else result.unknown.push(record);
        }
        for(const record of result.orphaned){
            const total=result.orphanedBytes+record.size+record.thumbnailBytes;
            if(!bytes(total)){result.orphanedBytes=null;break;}result.orphanedBytes=total;
        }
        return result;
    }
    return {describe,classify};
})();
