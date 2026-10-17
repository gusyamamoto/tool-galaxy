const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const {File} = require('node:buffer');

function environment(extra = {}) {
    const context = vm.createContext({Blob,File,URL,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,...extra});
    for (const name of ['ids.js','model.js','attachment-store.js','rich-content.js'])
        vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),context);
    return context;
}

test('capture picker routes gallery, camera and files without leaking capture attributes', () => {
    const attributes = {}, limit = {hidden:true}, clicks = [];
    const input = {disabled:true,setAttribute(key,value){attributes[key]=value;},removeAttribute(key){delete attributes[key];},click(){clicks.push({...attributes,accept:this.accept,multiple:this.multiple});}};
    Object.defineProperty(input,'accept',{get(){return attributes.accept;},set(value){attributes.accept=value;}});
    const context = environment({document:{getElementById(){return limit;}}});
    const choose = vm.runInContext('EntryContentInspector.prototype.chooseFiles',context);
    const inspector = {files:input,entryId:'selected',jobs:new Map(),getEntry:id=>id==='destination'||id==='selected',onAction(){},onLayout(){},error(){assert.fail('unexpected picker error');}};
    choose.call(inspector,{source:'camera',entryId:'destination'});
    assert.equal(input.disabled,false);
    assert.equal(clicks[0].capture,'environment'); assert.equal(clicks[0].accept,'image/*'); assert.equal(clicks[0].multiple,false);
    assert.equal(inspector.fileSelection.entryId,'destination');
    choose.call(inspector,{source:'gallery'});
    assert.equal(clicks[1].capture,undefined); assert.equal(clicks[1].multiple,true); assert.match(clicks[1].accept,/image\/\*.*\.heic.*\.heif/);
    choose.call(inspector);
    assert.equal(clicks[2].accept,undefined); assert.equal(clicks[2].capture,undefined); assert.equal(clicks[2].multiple,true);
    inspector.jobs.set('destination',1); choose.call(inspector,{entryId:'destination'});
    choose.call(inspector,{entryId:'deleted'}); assert.equal(clicks.length,3);
    input.click=()=>{throw Error('picker unavailable');}; let failure;
    inspector.error=error=>{failure=error.message;}; choose.call(inspector);
    assert.equal(failure,'picker unavailable'); assert.equal(inspector.fileSelection,null); assert.equal(limit.hidden,true);
});

test('HEIC/HEIF without native decoding retain original bytes and metadata', async () => {
    const context = environment({createImageBitmap:async()=>{throw Error('unsupported');}});
    const prepare = vm.runInContext('file => galaxyAttachmentFiles.prepare(file,"body")',context);
    for (const [name,type] of [['original.HEIC','image/heic'],['original.heif','image/heif'],['untyped.heic','']]) {
        const file = new File(['unchanged HEIF original'],name,{type});
        const result = await prepare(file);
        assert.equal(result.metadata.filename,name); assert.equal(result.metadata.size,file.size);
        assert.equal(await result.record.blob.text(),'unchanged HEIF original'); assert.equal(result.record.thumbnail,undefined);
    }
    await assert.rejects(prepare(new File(['executable'],'camera.exe',{type:'image/heic'})),/Executable/);
    await assert.rejects(prepare(new File(['script'],'photo.heic',{type:'application/javascript'})),/Executable/);
});

test('HEIF friendly preview is separate from the original and obeys preview pixel limits', async () => {
    let closed=0, dimensions=[1200,800], drawCount=0;
    const preview=new Blob(['friendly preview'],{type:'image/webp'});
    const context=environment({
        createImageBitmap:async()=>({width:dimensions[0],height:dimensions[1],close(){closed++;}}),
        document:{createElement(){return {getContext(){return {drawImage(){drawCount++;}};},toBlob(callback){callback(preview);}};}}
    });
    const prepare=vm.runInContext('file => galaxyAttachmentFiles.prepare(file,"body")',context);
    const file=new File(['original camera bytes'],'photo.heic',{type:'image/heif'});
    const result=await prepare(file);
    assert.equal(result.record.thumbnail,preview); assert.equal(await result.record.blob.text(),'original camera bytes');
    assert.equal(result.metadata.width,1200); assert.equal(result.metadata.height,800); assert.equal(closed,1);
    dimensions=[10000,10000]; const tooLarge=await prepare(file);
    assert.equal(tooLarge.record.thumbnail,undefined); assert.equal(drawCount,1); assert.equal(closed,2);
    assert.equal(await tooLarge.record.blob.text(),'original camera bytes');
});
