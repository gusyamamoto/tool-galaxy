const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {File}=require('node:buffer'),{createHash}=require('node:crypto');
const context=vm.createContext({Blob,File,ArrayBuffer,Uint8Array});
for(const file of ['persistence/indexeddb-file-store.js','services/attachment-storage-audit.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const binary=vm.runInContext('cosmifoldAttachmentBinary',context),audit=vm.runInContext('cosmifoldAttachmentAudit',context);
const webkit=()=>Object.assign(new Error('Error preparing Blob/File data to be stored in object store'),{name:'UnknownError'});
const hash=async blob=>createHash('sha256').update(new Uint8Array(await blob.arrayBuffer())).digest('hex');
const record=()=>({key:'original',entryId:'owner',blob:new File(['original bytes'],'photo.HEIC',{type:'image/heic',lastModified:1700000000000}),thumbnail:new Blob(['preview'],{type:'image/webp'})});

test('normal Blob/File persistence stays on the primary path without reading bytes',async()=>{
    const value=record();value.blob.arrayBuffer=()=>{throw Error('must not encode a working Blob');};let calls=0;
    await binary.write([value],async rows=>{calls++;assert.equal(rows[0],value);assert.ok(rows[0].blob instanceof Blob);});
    assert.equal(calls,1);assert.equal(binary.decode(value).blob,value.blob);
});

for(const asynchronous of [false,true])test(`${asynchronous?'async':'synchronous'} WebKit preparation error retries bytes once after rejection`,async()=>{
    const value=record(),originalHash=await hash(value.blob);let calls=0,saved;
    await binary.write([value],async rows=>{
        calls++;
        if(calls===1){if(asynchronous)await Promise.resolve();throw webkit();}
        saved=rows[0];assert.ok(saved.blob.bytes instanceof ArrayBuffer);assert.equal(saved.blob.format,'cosmifold-bytes-v1');
        assert.ok(!(saved.blob instanceof Blob));assert.ok(!(saved.thumbnail instanceof Blob));
    });
    assert.equal(calls,2);assert.ok(value.blob instanceof File);
    const decoded=binary.decode(saved);
    assert.ok(decoded.blob instanceof File);assert.equal(decoded.blob.name,'photo.HEIC');assert.equal(decoded.blob.lastModified,1700000000000);
    assert.equal(decoded.blob.type,value.blob.type);assert.equal(decoded.blob.size,value.blob.size);assert.equal(await hash(decoded.blob),originalHash);
    assert.equal(decoded.thumbnail.type,'image/webp');assert.equal(await decoded.thumbnail.text(),'preview');assert.equal(decoded.key,value.key);assert.equal(decoded.entryId,value.entryId);
});

test('byte conversion preserves arbitrary record metadata and does not add transport fields to the public record',async()=>{
    const value={...record(),sha256:'existing-hash',filename:'photo.HEIC',dimensions:{width:42,height:32},version:7};
    const decoded=binary.decode(await binary.encode(value));
    assert.deepEqual(Object.keys(decoded),Object.keys(value));assert.equal(decoded.sha256,value.sha256);
    assert.equal(decoded.filename,value.filename);assert.equal(decoded.dimensions,value.dimensions);assert.equal(decoded.version,7);
});

for(const thumbnail of ['absent','null','empty'])test(`thumbnail ${thumbnail} survives byte encoding without changing presence`,async()=>{
    const value=record();if(thumbnail==='absent')delete value.thumbnail;else value.thumbnail=thumbnail==='null'?null:new Blob([],{type:'image/webp'});
    const decoded=binary.decode(await binary.encode(value));
    assert.equal(Object.hasOwn(decoded,'thumbnail'),Object.hasOwn(value,'thumbnail'));
    if(thumbnail==='empty'){assert.equal(decoded.thumbnail.size,0);assert.equal(decoded.thumbnail.type,'image/webp');}
    else assert.equal(decoded.thumbnail,value.thumbnail);
});

test('Uint8Array views reconstruct only their selected bytes',()=>{
    const bytes=new Uint8Array([99,65,66,88]).subarray(1,3);
    const decoded=binary.decode({key:'view',entryId:'owner',blob:{format:'cosmifold-bytes-v1',bytes,size:2,type:'text/plain'}});
    return decoded.blob.text().then(text=>assert.equal(text,'AB'));
});

test('valid mixed records audit original and thumbnail byte sizes without materializing Blobs',async()=>{
    const value=record(),encoded=await binary.encode(value);
    const summary=audit.describe(encoded,value.key);
    assert.equal(summary.recognizable,true);assert.equal(summary.size,value.blob.size);assert.equal(summary.thumbnailBytes,value.thumbnail.size);
    assert.equal(summary.entryId,'owner');assert.equal(audit.describe(value,value.key).size,summary.size);
});

for(const mutate of [v=>v.size++,v=>v.format='cosmifold-bytes-v2',v=>v.futureOwner='x',v=>v.bytes='lost',v=>v.lastModified=NaN])test('malformed/future byte data remains UNKNOWN to F8 and is never silently repaired',async()=>{
    const encoded=await binary.encode(record());mutate(encoded.blob);
    assert.equal(audit.describe(encoded,'original').recognizable,false);
    const publicValue=binary.decode(encoded,{strict:false});assert.equal(publicValue.blob,encoded.blob);
    if(encoded.blob.format==='cosmifold-bytes-v1')assert.throws(()=>binary.decode(encoded),/unreadable/);
});

for(const name of ['QuotaExceededError','AbortError','DataCloneError','ConstraintError'])test(`${name} without the preparation signature does not switch representation`,async()=>{
    let calls=0;const failure=Object.assign(new Error('write failed'),{name});
    await assert.rejects(binary.write([record()],async()=>{calls++;throw failure;}),error=>error===failure);assert.equal(calls,1);
});

test('fallback failure remains the authoritative error and does not loop',async()=>{
    let calls=0;const failure=Object.assign(new Error('fallback full'),{name:'QuotaExceededError'});
    await assert.rejects(binary.write([record()],async()=>{if(++calls===1)throw webkit();throw failure;}),error=>error===failure);
    assert.equal(calls,2);
});

test('unreadable original or thumbnail prevents any fallback persistence',async()=>{
    for(const field of ['blob','thumbnail']){
        const value=record();value[field].arrayBuffer=async()=>{throw new Error('provider read failed');};let calls=0;
        await assert.rejects(binary.write([value],async()=>{calls++;throw webkit();}),/provider read failed/);assert.equal(calls,1);
    }
});

test('Restore cannot retry after metadata has already been attempted',async()=>{
    let calls=0;
    await assert.rejects(binary.write([record()],async()=>{calls++;throw webkit();},()=>false),/preparing Blob/);assert.equal(calls,1);
});
