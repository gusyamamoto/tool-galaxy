const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test');
const context=vm.createContext({URL,Blob});
for(const file of ['model.js','attachment-store.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
const model=vm.runInContext('galaxyModel',context),create=vm.runInContext('createGalaxyAttachmentStore',context);
const plain=value=>JSON.parse(JSON.stringify(value));
const file={id:'file-1',kind:'upload',entryId:'entry',filename:'plan.pdf',mimeType:'application/pdf',size:12,storageKey:'object/path/file-1',createdAt:'2026-01-01T00:00:00Z'};
test('content is independent of depth and older entries need no content migration',()=>{
    for(let depth=0;depth<30;depth++){
        const entry=model.normalizeEntry({id:'entry',name:'Name',description:'',content:{...model.emptyContent(),notes:{format:'plain',text:'First\nSecond\n'},attachments:[file]},depth});
        assert.equal(entry.content.notes.text,'First\nSecond\n');assert.deepEqual(plain(entry.content.attachments),[file]);
        const reloaded=model.normalizeEntry(plain(entry));assert.deepEqual(plain(reloaded.content),plain(entry.content));
    }
    assert.equal('content' in model.normalizeEntry({id:'old',name:'Old',description:''}),false);
});
test('links allow only web URLs and preserve stable IDs and optional readable titles',()=>{
    for(const url of ['javascript:alert(1)','data:text/html,test','file:///tmp/private','not a url'])assert.equal(model.webUrl(url),null);
    const content=model.normalizeContent({...model.emptyContent(),links:[{id:'link-1',url:' HTTPS://EXAMPLE.COM/path ',title:'Reference'}]},'entry');
    assert.deepEqual(plain(content.links),[{id:'link-1',url:'https://example.com/path',title:'Reference'}]);
    assert.equal(model.normalizeContent({...content,links:[content.links[0],content.links[0]]},'entry'),null);
});
test('bookmark addresses normalize ordinary domains without accepting unsafe or malformed destinations',()=>{
    for(const [input,expected] of [['google.com','https://google.com/'],[' www.google.com ','https://www.google.com/'],
        ['example.com/path?q=1#notes','https://example.com/path?q=1#notes'],['example.com:8443/path','https://example.com:8443/path'],['HTTPS://EXAMPLE.COM','https://example.com/']]) {
        assert.equal(model.webUrl(input),expected);
    }
    for(const invalid of ['','not-a-domain','example..com','-bad.com','bad-.com','//example.com','user@example.com','example.com\\evil',
        'example.com/has space','java\nscript:alert(1)','mailto:user@example.com','ftp://example.com','data:text/html,test','file:///private']) {
        assert.equal(model.webUrl(invalid),null,invalid);
    }
});
test('notes can be cleared and malformed/future content is preserved through rejection instead of lossy loading',()=>{
    assert.equal(model.normalizeContent(model.emptyContent(),'entry').notes.text,'');
    for(const invalid of [{...model.emptyContent(),version:2},{...model.emptyContent(),notes:{format:'html',text:'<script>'}},
        {...model.emptyContent(),attachments:[{...file,entryId:'other'}]}, {...model.emptyContent(),attachments:[{...file,mimeType:'text/html'}]}]){
        assert.equal(model.normalizeContent(invalid,'entry'),null);
        assert.equal(model.normalizeEntry({id:'entry',name:'Name',content:invalid}),null);
    }
});
test('normalization writes metadata only, retaining image dimensions without embedded bytes',()=>{
    const normalized=model.normalizeContent({...model.emptyContent(),attachments:[{...file,width:20,height:10,blob:new Blob(['bytes']),base64:'SECRET'}]},'entry');
    assert.equal(normalized.attachments[0].width,20);assert.doesNotMatch(JSON.stringify(normalized),/SECRET|base64|blob/);
});
test('temporary store keeps actual bytes separate and aborts removal when metadata save fails',async()=>{
    const store=create({temporary:true});
    await store.save({key:'a',entryId:'entry',blob:new Blob(['A'])});await store.save({key:'b',entryId:'other',blob:new Blob(['B'])});
    await assert.rejects(store.deleteEntries(['entry'],()=>{throw new Error('quota');}),/quota/);
    assert.equal(await (await store.get('a')).blob.text(),'A');
    let committed=false;await store.deleteEntries(['entry'],()=>{committed=true;});
    assert.equal(committed,true);assert.equal(await store.get('a'),null);assert.equal(await (await store.get('b')).blob.text(),'B');
    await assert.rejects(store.save({key:'bad',entryId:'entry',blob:new Blob(['bad'])},()=>{throw new Error('metadata');}),/metadata/);
    assert.equal(await store.get('bad'),null);
});
