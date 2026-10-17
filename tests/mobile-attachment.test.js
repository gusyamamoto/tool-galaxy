const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {File}=require('node:buffer'),{webcrypto}=require('node:crypto');

function environment(extra={}) {
    const context=vm.createContext({Blob,File,URL,crypto:webcrypto,setTimeout,clearTimeout,...extra});
    for(const name of ['ids.js','model.js','attachment-store.js','rich-content.js'])
        vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),context);
    return {context,prepare:vm.runInContext('(file)=>galaxyAttachmentFiles.prepare(file,"destination")',context)};
}

function jpeg(width=48,height=32,type='image/jpeg') {
    // Bounded SOF fixture: native decoding is injected independently below.
    return new File([Uint8Array.from([255,216,255,192,0,11,8,height>>8,height&255,width>>8,width&255,3,1,17,0,255,217])],'phone.jpg',{type});
}

test('local HTTP attachment creation works without secure-context randomUUID',async()=>{
    const {prepare}=environment({crypto:{getRandomValues:value=>webcrypto.getRandomValues(value)}});
    const file=new File(['original document'],'phone.txt',{type:''});
    const {metadata,record}=await prepare(file);
    assert.match(metadata.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(metadata.filename,'phone.txt');assert.equal(metadata.mimeType,'application/octet-stream');
    assert.equal(await record.blob.text(),'original document');
});

test('valid JPEG is retained when the native thumbnail decoder rejects',async()=>{
    const {prepare}=environment({createImageBitmap:async()=>{throw Error('unsupported decoder');}});
    for(const type of ['image/jpeg','']) {
        const file=jpeg(48,32,type),{metadata,record}=await prepare(file);
        assert.equal(metadata.filename,file.name);assert.equal(metadata.width,48);assert.equal(metadata.height,32);
        assert.deepEqual(new Uint8Array(await record.blob.arrayBuffer()),new Uint8Array(await file.arrayBuffer()));
        assert.equal(record.thumbnail,undefined);
    }
});

test('high-resolution camera image retains its original without exceeding the preview budget',async()=>{
    let decodes=0;
    const {prepare}=environment({createImageBitmap:async()=>{decodes++;throw Error('must skip oversized preview');}});
    const file=jpeg(8000,6000),{metadata,record}=await prepare(file);
    assert.equal(metadata.width,8000);assert.equal(metadata.height,6000);assert.equal(decodes,0);
    assert.equal(record.blob.size,file.size);assert.equal(record.thumbnail,undefined);
});

test('PNG decoding, unavailable canvas and encoding failures do not discard original bytes',async()=>{
    const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10]);
    const view=new DataView(bytes.buffer);view.setUint32(16,40);view.setUint32(20,30);
    for(const failure of ['decode','canvas','encode']) {
        let closed=0;
        const {prepare}=environment({
            createImageBitmap:async()=>{if(failure==='decode')throw Error('decoder failed');return {width:40,height:30,close(){closed++;}};},
            document:{createElement(){return {getContext(){return failure==='canvas'?null:{drawImage(){}};},toBlob(callback){callback(null);}};}}
        });
        const file=new File([bytes],'phone.png',{type:'image/png'}),{record,metadata}=await prepare(file);
        assert.equal(record.thumbnail,undefined);assert.equal(metadata.width,40);assert.equal(metadata.height,30);
        assert.deepEqual(new Uint8Array(await record.blob.arrayBuffer()),bytes);assert.equal(closed,failure==='decode'?0:1);
    }
});

test('image previews use bounded high-quality resolution without enlarging small originals',async()=>{
    for(const [width,height,expectedWidth,expectedHeight] of [[1600,1200,768,576],[1200,1600,576,768],[200,100,200,100]]) {
        let options,canvas,quality,closed=0;
        const drawing={drawImage(){}};
        const {prepare}=environment({
            createImageBitmap:async(file,value)=>{options=value;return {width:value.resizeWidth,height:value.resizeHeight,close(){closed++;}};},
            document:{createElement(){canvas={getContext:()=>drawing,toBlob(callback,type,value){assert.equal(type,'image/webp');quality=value;callback(new Blob(['preview']));}};return canvas;}}
        });
        const file=jpeg(width,height),{metadata,record}=await prepare(file);
        assert.equal(options.resizeQuality,'high');assert.equal(options.resizeWidth,expectedWidth);assert.equal(options.resizeHeight,expectedHeight);
        assert.equal(canvas.width,expectedWidth);assert.equal(canvas.height,expectedHeight);
        assert.equal(drawing.imageSmoothingEnabled,true);assert.equal(drawing.imageSmoothingQuality,'high');assert.equal(quality,.85);
        assert.equal(metadata.width,width);assert.equal(metadata.height,height);assert.equal(closed,1);
        assert.deepEqual(new Uint8Array(await record.blob.arrayBuffer()),new Uint8Array(await file.arrayBuffer()));
    }
});

test('native HEIF previews share the image cap while decoder failure keeps the existing original-only fallback',async()=>{
    let canvas,closed=0;
    const {prepare}=environment({
        createImageBitmap:async()=>({width:1600,height:1200,close(){closed++;}}),
        document:{createElement(){canvas={getContext:()=>({drawImage(){}}),toBlob(callback){callback(new Blob(['preview']));}};return canvas;}}
    });
    const original=new File(['Original HEIF bytes'],'phone.heif',{type:'image/heif'});
    const {record,metadata}=await prepare(original);
    assert.equal(canvas.width,768);assert.equal(canvas.height,576);assert.equal(closed,1);
    assert.equal(metadata.width,1600);assert.equal(metadata.height,1200);assert.equal(await record.blob.text(),await original.text());
    const fallback=environment({createImageBitmap:async()=>{throw Error('unsupported HEIF');}});
    const retained=await fallback.prepare(original);
    assert.equal(retained.record.thumbnail,undefined);assert.equal(await retained.record.blob.text(),await original.text());
});

test('preview fallback preserves security, byte-size, invalid-header and source-read rejection',async()=>{
    const {prepare}=environment({createImageBitmap:async()=>{throw Error('decoder unavailable');}});
    await assert.rejects(prepare(new File(['code'],'photo.exe',{type:'image/jpeg'})),/Executable/);
    await assert.rejects(prepare(new File(['code'],'photo.jpg',{type:'application/javascript'})),/Executable/);
    await assert.rejects(prepare(new File([new Uint8Array(10*1024*1024+1)],'large.jpg',{type:'image/jpeg'})),/10 MiB/);
    await assert.rejects(prepare(new File(['not an image'],'invalid.jpg',{type:'image/jpeg'})),/invalid or unsupported header/);
    await assert.rejects(prepare(new File(['bytes'],'',{type:'image/jpeg'})),/no filename/);
    const unreadable=jpeg();unreadable.arrayBuffer=async()=>{const error=Error('provider denied read');error.name='NotReadableError';throw error;};
    await assert.rejects(prepare(unreadable),{name:'NotReadableError'});
    const unavailable=environment({crypto:{}});
    await assert.rejects(unavailable.prepare(new File(['text'],'file.txt')),/updated browser.*HTTPS/);
});

test('file-provider and storage errors have useful messages instead of technical exceptions',()=>{
    const {context}=environment();
    const error=vm.runInContext('EntryContentInspector.prototype.error',context),seen=[];
    const inspector={message:(text,isError)=>seen.push({text,isError})};
    for(const name of ['NotReadableError','NotFoundError','SecurityError','DataCloneError','QuotaExceededError'])error.call(inspector,{name,message:'internal failure'});
    assert.match(seen[0].text,/could not be read.*this device/);
    assert.match(seen[1].text,/no longer available/);
    assert.match(seen[2].text,/blocking access/);
    assert.match(seen[3].text,/could not be saved/);
    assert.match(seen[4].text,/enough local browser storage/);
    assert.ok(seen.every(value=>value.isError&&!value.text.includes('internal failure')));
});
