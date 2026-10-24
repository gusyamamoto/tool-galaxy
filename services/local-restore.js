// Untrusted-file validation is read-only. Only opaque validated handles can restore.
const cosmifoldRestore = (()=>{
    const validated=new WeakMap();
    const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
    const fail=(message='This backup appears to be incomplete or damaged.')=>{throw new Error(message);};
    const version=(value,supported)=>{
        if(!Number.isSafeInteger(value)||value<1)fail();
        if(value>supported)fail("This backup was created by a newer version of Cosmifold and can't be restored here.");
        if(value!==supported)fail("This backup version isn't supported here.");
    };
    const check=signal=>{if(signal?.aborted)throw new DOMException('Restore cancelled.','AbortError');};
    function parse(text){
        let value;try{value=JSON.parse(text);}catch{fail();}
        const queue=[[value,0]];
        for(let index=0;index<queue.length;index++){
            const [node,depth]=queue[index];if(depth>100||queue.length>1000000)fail();
            if(node&&typeof node==='object')for(const key of Object.keys(node)){
                if(['__proto__','prototype','constructor'].includes(key))fail('This backup contains unsafe structured data.');
                queue.push([node[key],depth+1]);
            }
        }
        return value;
    }
    function validateMetadata(metadata){
        if(metadata===null)return new Map();
        if(!object(metadata)||metadata.version!==cosmifoldBackup.storageVersion||!Array.isArray(metadata.entries)||!Array.isArray(metadata.layout))fail('The saved Cosmos in this backup is invalid.');
        for(const field of ['portals','constellations','archivedGalaxies'])if(metadata[field]!=null&&!Array.isArray(metadata[field]))fail();
        if(metadata.connections!=null&&(!Array.isArray(metadata.connections)||metadata.connections.length))fail('This backup contains obsolete relationship data.');
        // Validate the raw candidate with the SAME rules as startup, before any
        // normalized projection can hide invalid fields or any storage is touched.
        try{galaxyModel.validateStoredSnapshot(metadata);}
        catch(cause){throw new Error("This backup can't be restored because its saved structure is invalid.",{cause});}
        const entries=new Map(metadata.entries.map(entry=>[entry.id,entry])),references=new Map();
        // Preserve the existing backup-only checks for exact saved values/file
        // policy. Canonical identity, ancestry and content rules live in model.js.
        for(const entry of metadata.entries){
            if(['x','y'].some(key=>entry[key]!=null&&!Number.isFinite(entry[key]))||
                (entry.location!=null&&galaxyModel.normalizeLocation(entry.location).text!==entry.location.text))fail('This backup contains invalid saved item values.');
            if(entry.content){
                if(entry.content.links.some(link=>galaxyModel.webUrl(link.url)!==link.url))fail('This backup contains an invalid Bookmark.');
                for(const file of entry.content.attachments){
                    if(galaxyModel.filePolicy.blocked(file.filename,file.mimeType))fail('This backup contains invalid file references.');
                    references.set(file.storageKey,file);
                }
            }
        }
        if((metadata.constellations||[]).some(c=>c.name!==c.name.trim()))fail('This backup contains an invalid Constellation name.');
        const layoutIds=new Set();
        for(const record of metadata.layout){
            const entry=entries.get(record?.id);
            if(!entry||layoutIds.has(record.id)||record.parentId!==entry.parentId||!Number.isFinite(record.angle)||!Number.isFinite(record.radius)||record.radius<0||record.pinned===true)fail('This backup contains invalid saved layout data.');
            layoutIds.add(record.id);
        }
        // Cache root ownership once. Calling subtreeIds for every archived root
        // would make a large untrusted manifest quadratic in the number of items.
        const roots=new Map();
        for(const start of entries.values()){
            const path=[];let entry=start;
            while(entry&&!roots.has(entry.id)){path.push(entry);entry=entries.get(entry.parentId);}
            const root=entry?roots.get(entry.id):path.at(-1)?.id;path.forEach(item=>roots.set(item.id,root));
        }
        for(const record of metadata.archivedGalaxies||[]){
            const root=entries.get(record.galaxyId);
            if(record.expandedIds!=null&&(new Set(record.expandedIds).size!==record.expandedIds.length||record.expandedIds.some(id=>roots.get(id)!==root.id)))fail('This backup contains invalid archived item references.');
        }
        return references;
    }
    function counts(metadata,records){
        const entries=metadata?.entries||[];
        return {entries:entries.length,galaxies:entries.filter(e=>e.parentId==null).length,
            notes:entries.filter(e=>e.content?.notes?.text).length,bookmarks:entries.reduce((n,e)=>n+(e.content?.links?.length||0),0),locations:entries.filter(e=>e.location!=null).length,
            constellations:metadata?.constellations?.length||0,constellationMembers:(metadata?.constellations||[]).reduce((n,c)=>n+c.memberEntryIds.length,0),
            linkedPlacements:metadata?.portals?.length||0,archivedGalaxies:metadata?.archivedGalaxies?.length||0,layoutPreferences:metadata?.layout?.length||0,
            attachmentReferences:entries.reduce((n,e)=>n+(e.content?.attachments?.length||0),0),attachmentRecords:records.length,thumbnails:records.filter(r=>r.thumbnail!=null).length};
    }
    async function inspect(file,{signal,onProgress=()=>{}}={}){
        check(signal);onProgress({stage:'checking'});
        const spec=cosmifoldBackup;
        if(!(file instanceof Blob)||file.size>spec.maxBytes)fail('This backup is too large (512 MiB maximum).');
        if(file.size<spec.headerBytes)fail("This doesn't appear to be a Cosmifold backup.");
        if(!globalThis.crypto?.subtle)fail('Restore requires an up-to-date browser on HTTPS or localhost.');
        const header=new Uint8Array(await file.slice(0,spec.headerBytes).arrayBuffer()),magic=new TextEncoder().encode(spec.magic);
        if(!magic.every((byte,i)=>header[i]===byte))fail("This doesn't appear to be a Cosmifold backup.");
        const view=new DataView(header.buffer);
        version(view.getUint32(magic.length,true),spec.backupVersion);
        const length=view.getUint32(magic.length+4,true);
        if(!length||length>spec.maxManifestBytes||length>file.size-spec.headerBytes)fail();
        const json=await file.slice(spec.headerBytes,spec.headerBytes+length).arrayBuffer();check(signal);
        const expected=[...header.slice(magic.length+8)].map(n=>n.toString(16).padStart(2,'0')).join('');
        if(await spec.sha256(json)!==expected)fail();
        let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(json);}catch{fail();}
        const manifest=parse(text);
        if(!object(manifest)||manifest.format!==spec.format)fail("This doesn't appear to be a Cosmifold backup.");
        version(manifest.backupVersion,spec.backupVersion);version(manifest.storageVersion,spec.storageVersion);
        if(typeof manifest.exportedAt!=='string'||!Number.isFinite(Date.parse(manifest.exportedAt))||!Array.isArray(manifest.attachments)||!object(manifest.counts)||Object.hasOwn(manifest,'recoverySnapshots'))fail();
        for(const name of ['metadata','preferences']){
            const raw=manifest[name+'Text'];if(raw!==null&&typeof raw!=='string')fail();
            const parsed=raw===null?null:parse(raw);if(JSON.stringify(parsed)!==JSON.stringify(manifest[name]))fail();
        }
        if(manifest.preferences!==null&&!object(manifest.preferences))fail('This backup contains invalid sidebar preferences.');
        if(manifest.preferences){
            const prefs=manifest.preferences;
            if(prefs.hiddenCompletedTaskListIds!=null&&(!Array.isArray(prefs.hiddenCompletedTaskListIds)||
                prefs.hiddenCompletedTaskListIds.some(id=>typeof id!=='string'||!id.length)))fail('This backup contains invalid sidebar preferences.');
            if(prefs.width!=null&&(!Number.isFinite(prefs.width)||prefs.width<=0))fail('This backup contains invalid sidebar preferences.');
            for(const key of ['collapsed','universeCollapsed','archivedCollapsed','constellationsCollapsed','constellationsSeen','tasksCollapsed','tasksActiveCollapsed','tasksCompletedCollapsed'])
                if(prefs[key]!=null&&typeof prefs[key]!=='boolean')fail('This backup contains invalid sidebar preferences.');
        }
        const refs=validateMetadata(manifest.metadata),keys=new Set(),records=[],start=spec.headerBytes+length;let offset=0;
        const payload=async descriptor=>{
            if(!object(descriptor)||!Number.isSafeInteger(descriptor.offset)||descriptor.offset!==offset||!Number.isSafeInteger(descriptor.size)||descriptor.size<0||descriptor.size>file.size-start-offset||
                typeof descriptor.type!=='string'||descriptor.type.length>255||/[\u0000-\u001f\u007f]/.test(descriptor.type)||!/^([a-f0-9]{64})$/.test(descriptor.sha256))fail();
            const blob=file.slice(start+offset,start+offset+descriptor.size,descriptor.type),bytes=await blob.arrayBuffer();check(signal);
            if(blob.type!==descriptor.type)fail();
            if(await spec.sha256(bytes)!==descriptor.sha256)fail();offset+=descriptor.size;return blob;
        };
        // Bound every descriptor before reading any payload, including the final length.
        let planned=0;
        for(const attachment of manifest.attachments){
            if(!object(attachment)||!object(attachment.record)||typeof attachment.thumbnailPresent!=='boolean'||(attachment.thumbnail!==null&&!attachment.thumbnailPresent)||Object.hasOwn(attachment.record,'blob')||Object.hasOwn(attachment.record,'thumbnail'))fail();
            const record=attachment.record,ref=refs.get(record.key);
            if(!ref||keys.has(record.key)||record.entryId!==ref.entryId||attachment.original?.size!==ref.size)fail('This backup contains missing or invalid file records.');keys.add(record.key);
            for(const descriptor of [attachment.original,...(attachment.thumbnail!==null?[attachment.thumbnail]:[])]){
                if(!object(descriptor)||!Number.isSafeInteger(descriptor.offset)||descriptor.offset!==planned||!Number.isSafeInteger(descriptor.size)||descriptor.size<0||descriptor.size>file.size-start-planned)fail();planned+=descriptor.size;
            }
        }
        if(keys.size!==refs.size||planned!==file.size-start||manifest.payloadBytes!==planned)fail('This backup contains missing or damaged files.');
        for(let i=0;i<manifest.attachments.length;i++){
            check(signal);onProgress({stage:'files',completed:i,total:manifest.attachments.length});
            const attachment=manifest.attachments[i],record={...attachment.record,blob:await payload(attachment.original)};
            if(attachment.thumbnailPresent)record.thumbnail=attachment.thumbnail===null?null:await payload(attachment.thumbnail);
            records.push(record);onProgress({stage:'files',completed:i+1,total:manifest.attachments.length});await new Promise(resolve=>setTimeout(resolve,0));
        }
        const actual=counts(manifest.metadata,records);
        if(Object.keys(manifest.counts).length!==Object.keys(actual).length||Object.entries(actual).some(([key,value])=>manifest.counts[key]!==value))fail('This backup has inconsistent data counts.');
        check(signal);
        const handle=Object.freeze({exportedAt:manifest.exportedAt,counts:Object.freeze(actual),size:file.size});
        validated.set(handle,{metadataText:manifest.metadataText,preferencesText:manifest.preferencesText,records});return handle;
    }
    async function restore(handle,repository){
        const source=validated.get(handle);if(!source)fail('Choose and validate a backup before restoring.');
        await repository.replaceLocalBackup(source);
    }
    return {inspect,restore};
})();
