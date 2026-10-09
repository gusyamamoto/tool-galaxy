const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test'),{randomUUID}=require('node:crypto');
const context=vm.createContext({URL,Blob,crypto:{randomUUID}});
for(const file of ['model.js','attachment-store.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
const model=vm.runInContext('galaxyModel',context),policy=model.filePolicy,prepare=vm.runInContext('galaxyAttachmentFiles.prepare.bind(galaxyAttachmentFiles)',context);
const plain=value=>JSON.parse(JSON.stringify(value));
function file(name,type='',bytes='Original bytes') {const blob=new Blob([bytes],{type});return Object.assign(blob,{name});}
test('Office, archives, design/CAD and unknown files retain names, MIME, extension, IDs and bytes',async()=>{
    for(const [name,type] of [['proposal.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ['budget.XLSX','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],['slides.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation'],
        ['old.doc','application/msword'],['old.xls','application/vnd.ms-excel'],['old.ppt','application/vnd.ms-powerpoint'],
        ['assets.zip','application/zip'],['design.psd','image/vnd.adobe.photoshop'],['model.dwg','application/octet-stream'],['project.blend',''],['data.uncommon','application/x-custom'],['README',''],['file.constructor',''],['file.__proto__','']]){
        const {metadata,record}=await prepare(file(name,type),'owner');
        assert.equal(metadata.filename,name);assert.equal(metadata.mimeType,type||'application/octet-stream');assert.equal(metadata.extension,policy.extension(name));
        assert.equal(metadata.entryId,'owner');assert.equal(metadata.storageKey,metadata.id);assert.ok(Date.parse(metadata.createdAt));
        assert.equal(record.key,metadata.id);assert.equal(await record.blob.text(),'Original bytes');assert.equal(policy.classify(metadata).kind,'generic');assert.equal(record.thumbnail,undefined);
        assert.deepEqual(plain(model.normalizeContent({...model.emptyContent(),attachments:[metadata]},'owner').attachments),[plain(metadata)]);
    }
});
test('preview capability is selective, case insensitive and robust to missing/unknown MIME',()=>{
    for(const [filename,mimeType,kind] of [['IMG.JPG','image/jpeg','image'],['photo.png','application/octet-stream','image'],
        ['photo.WEBP','','image'],['document.PDF','application/octet-stream','pdf'],['notes.TXT','','text'],['readme.MD','text/plain','text'],
        ['photo.jpg','image/pjpeg','image'],['photo.png','image/x-png','image'],['document.pdf','application/x-pdf','pdf'],
        ['notes.md','text/markdown','text'],['photo','image/jpeg','image'],['data.txt','application/zip','generic'],
        ['data.project','image/png','generic'],['icon.svg','image/svg+xml','generic'],['web.html','text/html','generic'],['animation.gif','image/gif','generic']])
        assert.equal(policy.classify({filename,mimeType}).kind,kind,filename);
});

test('video promotion retains original file metadata and bytes while joining Media',async()=>{
    const files=vm.runInContext('galaxyAttachmentFiles',context),preview=files.videoPreview;
    // Browser-native decoding is covered by the real Media suite; this preserves
    // main's original-byte acceptance checks for videos after their promotion.
    files.videoPreview=async()=>{};
    try {
        for(const [name,type] of [['movie.mp4','video/mp4'],['movie.webm','video/webm'],['movie.MOV','video/quicktime']]){
            const {metadata,record}=await prepare(file(name,type),'owner');
            assert.equal(metadata.filename,name);assert.equal(metadata.mimeType,type);
            assert.equal(metadata.extension,policy.extension(name));assert.equal(metadata.entryId,'owner');
            assert.equal(metadata.storageKey,metadata.id);assert.equal(record.key,metadata.id);
            assert.equal(record.blob.size,metadata.size);assert.equal(await record.blob.text(),'Original bytes');
            assert.equal(policy.classify(metadata).kind,'video');assert.equal(policy.isMedia(metadata),true);
            assert.deepEqual(plain(model.normalizeContent({...model.emptyContent(),attachments:[metadata]},'owner').attachments),[plain(metadata)]);
        }
    } finally {files.videoPreview=preview;}
});
test('dangerous extensions and MIME signals block uploads independently, including casing and trailing dots',async()=>{
    for(const extension of policy.blockedExtensions){await assert.rejects(prepare(file('payload.'+extension.toUpperCase(),'application/octet-stream'),'owner'),/cannot be attached/);}
    for(const mime of policy.blockedMimes){await assert.rejects(prepare(file('innocent.docx',mime),'owner'),/cannot be attached/);}
    for(const name of ['setup.EXE.','setup.ExE  ','.EXE','photo.jpg.exe'])await assert.rejects(prepare(file(name),'owner'),/cannot be attached/);
    assert.equal(policy.blocked('project.zip','application/zip'),false);
});
test('generic acceptance retains the exact 10 MiB cap and validates filename before any storage',async()=>{
    const atLimit=file('large.zip','application/zip',new Uint8Array(10*1024*1024));assert.equal((await prepare(atLimit,'owner')).metadata.size,10*1024*1024);
    await assert.rejects(prepare(file('too-large.docx','',new Uint8Array(10*1024*1024+1)),'owner'),/10 MiB/);
    await assert.rejects(prepare(file('x'.repeat(256)),'owner'),/shorter filename/);
});
test('old v5 attachment metadata round-trips exactly; optional extension adds no required migration',()=>{
    const old={id:'old',kind:'upload',entryId:'owner',filename:'plan.pdf',mimeType:'application/pdf',size:12,storageKey:'old',createdAt:'2026-01-01T00:00:00Z'};
    assert.deepEqual(plain(model.normalizeContent({...model.emptyContent(),attachments:[old]},'owner').attachments),[old]);
    assert.equal('extension' in model.normalizeContent({...model.emptyContent(),attachments:[old]},'owner').attachments[0],false);
    assert.equal(model.normalizeContent({...model.emptyContent(),attachments:[{...old,mimeType:'not a MIME'}]},'owner'),null);
});
test('MIME parameters are retained while preview/block decisions use the MIME essence',async()=>{
    const {metadata}=await prepare(file('notes.txt','text/plain;charset=utf-8'),'owner');assert.equal(metadata.mimeType,'text/plain;charset=utf-8');assert.equal(policy.classify(metadata).kind,'text');
    await assert.rejects(prepare(file('plain.project','Application/Javascript; charset=utf-8'),'owner'),/cannot be attached/);
});
