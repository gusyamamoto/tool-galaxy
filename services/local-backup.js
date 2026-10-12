// Export-only container: fixed header + UTF-8 manifest + unencoded Blob payloads.
// Nothing here writes storage, normalizes entries or knows a browser origin.
const cosmifoldBackup = {
    format:'cosmifold-backup', backupVersion:1, storageVersion:5,
    magic:'COSMIFOLD-BACKUP\n', maxBytes:512*1024*1024, maxManifestBytes:32*1024*1024,
    filename(date=new Date()) {
        const part=value=>String(value).padStart(2,'0');
        return `cosmifold-backup-${date.getFullYear()}-${part(date.getMonth()+1)}-${part(date.getDate())}.cosmifold`;
    },
    async create(repository,{date=new Date(),signal,onProgress=()=>{},maxBytes=this.maxBytes,maxManifestBytes=this.maxManifestBytes}={}) {
        const check=()=>{if(signal?.aborted)throw new DOMException('Backup cancelled.','AbortError');};
        check();onProgress({stage:'reading'});
        if(!globalThis.crypto?.subtle)throw new Error('This browser cannot create a complete backup. Try an up-to-date browser on HTTPS or localhost.');
        const source=await repository.readBackup();check();
        const parseSaved=(text,label)=>{
            try{return text===null?null:JSON.parse(text);}
            catch(error){throw new Error(`The saved ${label} could not be read. No backup was created.`,{cause:error});}
        };
        const metadata=parseSaved(source.metadataText,'Cosmos');
        if(metadata!==null&&(metadata.version!==5||!Array.isArray(metadata.entries)||!Array.isArray(metadata.layout)))
            throw new Error('The saved Cosmos is not a readable storage-v5 snapshot.');
        for(const key of ['portals','constellations','archivedGalaxies'])
            if(metadata?.[key]!=null&&!Array.isArray(metadata[key]))throw new Error('Some saved Cosmos data is invalid. No backup was created.');
        const preferences=parseSaved(source.preferencesText,'sidebar preferences');
        if(preferences!==null&&(typeof preferences!=='object'||Array.isArray(preferences)))throw new Error('Saved sidebar preferences are invalid.');
        const references=new Map();let attachmentReferences=0,bookmarks=0,notes=0,locations=0;
        const entries=metadata?.entries||[];
        for(const entry of entries){
            if(!entry||typeof entry.id!=='string')throw new Error('The saved item data is invalid.');
            if(entry.location!=null)locations++;
            if(entry.content){
                if(!Array.isArray(entry.content.attachments)||!Array.isArray(entry.content.links))throw new Error('The saved content data is invalid.');
                bookmarks+=entry.content.links.length;if(entry.content.notes?.text)notes++;
                for(const file of entry.content.attachments){
                    if(!file||typeof file.storageKey!=='string'||!file.storageKey||file.entryId!==entry.id||typeof file.id!=='string'||!file.id||file.kind!=='upload'||typeof file.filename!=='string'||!file.filename||typeof file.mimeType!=='string'||!file.mimeType||!Number.isSafeInteger(file.size)||file.size<0)
                        throw new Error('An attachment reference is invalid.');
                    const list=references.get(file.storageKey)||[];list.push(file);references.set(file.storageKey,list);attachmentReferences++;
                }
            }
        }
        if(!Array.isArray(source.records))throw new Error('A stored file record is unreadable.');
        // Current canonical metadata (including archived entries) defines ownership.
        // Ignore orphan debris before validation/hashing without deleting anything.
        const records=source.records.filter(record=>references.has(record?.key)).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0),keys=new Set();let bytes=0;
        for(const record of records){
            if(!record||typeof record.key!=='string'||!record.key||keys.has(record.key)||typeof record.entryId!=='string'||!(record.blob instanceof Blob)||
                (record.thumbnail!=null&&!(record.thumbnail instanceof Blob)))throw new Error('A stored file or thumbnail is unreadable.');
            keys.add(record.key);
            for(const reference of references.get(record.key)||[])
                if(reference.entryId!==record.entryId||reference.size!==record.blob.size)throw new Error(`The stored file “${reference.filename}” does not match its saved metadata.`);
            bytes+=record.blob.size+(record.thumbnail?.size||0);
            if(!Number.isSafeInteger(bytes)||bytes>maxBytes)throw new Error('This backup is too large for this version (512 MiB maximum).');
        }
        for(const [key,files] of references)if(!keys.has(key))throw new Error(`The file “${files[0].filename}” is missing. A complete backup could not be created.`);
        const manifest={format:this.format,backupVersion:this.backupVersion,exportedAt:date.toISOString(),storageVersion:this.storageVersion,
            metadata,metadataText:source.metadataText,preferences,preferencesText:source.preferencesText,
            counts:{entries:entries.length,galaxies:entries.filter(e=>e.parentId==null).length,notes,bookmarks,locations,
                constellations:metadata?.constellations?.length||0,constellationMembers:(metadata?.constellations||[]).reduce((n,c)=>n+(c.memberEntryIds?.length||0),0),
                linkedPlacements:metadata?.portals?.length||0,archivedGalaxies:metadata?.archivedGalaxies?.length||0,layoutPreferences:metadata?.layout?.length||0,
                attachmentReferences,attachmentRecords:records.length,thumbnails:records.filter(r=>r.thumbnail!=null).length},
            payloadBytes:bytes,attachments:[]};
        const parts=[];let offset=0;
        const hex=value=>[...new Uint8Array(value)].map(n=>n.toString(16).padStart(2,'0')).join('');
        const payload=async blob=>{
            check();const buffer=await blob.arrayBuffer();
            if(buffer.byteLength!==blob.size)throw new Error('A file could not be read completely.');
            const digest=await crypto.subtle.digest('SHA-256',buffer);check();
            const descriptor={offset,size:blob.size,type:blob.type,sha256:hex(digest)};
            parts.push(blob);offset+=blob.size;return descriptor;
        };
        for(let index=0;index<records.length;index++){
            check();onProgress({stage:'files',completed:index,total:records.length});
            const record=records[index],recordMetadata={...record};delete recordMetadata.blob;delete recordMetadata.thumbnail;
            // The current record has JSON metadata plus two Blob fields. Fail
            // rather than discard unsupported future binary/object fields.
            const serialized=JSON.stringify(recordMetadata,(_,value)=>{
                if(value instanceof Blob||value instanceof ArrayBuffer||ArrayBuffer.isView(value)||value instanceof Map||value instanceof Set||typeof value==='bigint'||typeof value==='undefined'||(typeof value==='number'&&!Number.isFinite(value)))
                    throw new Error('A stored file has unsupported metadata.');
                return value;
            });
            manifest.attachments.push({record:JSON.parse(serialized),thumbnailPresent:Object.hasOwn(record,'thumbnail'),
                original:await payload(record.blob),thumbnail:record.thumbnail!=null?await payload(record.thumbnail):null});
            onProgress({stage:'files',completed:index+1,total:records.length});
            // Yield between records so progress, cancel and touch stay usable.
            await new Promise(resolve=>setTimeout(resolve,0));
        }
        check();onProgress({stage:'finishing'});
        const json=new TextEncoder().encode(JSON.stringify(manifest));
        const magic=new TextEncoder().encode(this.magic),header=new Uint8Array(magic.length+8+32);
        if(json.length>maxManifestBytes||header.length+json.length+bytes>maxBytes)throw new Error('This backup is too large for this version (512 MiB maximum).');
        header.set(magic);const view=new DataView(header.buffer);view.setUint32(magic.length,this.backupVersion,true);view.setUint32(magic.length+4,json.length,true);
        header.set(new Uint8Array(await crypto.subtle.digest('SHA-256',json)),magic.length+8);check();
        const blob=new Blob([header,json,...parts],{type:'application/octet-stream'});
        return {blob,filename:this.filename(date),manifest};
    }
};
