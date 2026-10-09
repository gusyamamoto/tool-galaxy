const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test'),{randomUUID}=require('node:crypto');
const context=vm.createContext({URL,Blob,crypto:{randomUUID}});
for(const file of ['model.js','attachment-store.js','persistence/local-metadata-store.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
const model=vm.runInContext('galaxyModel',context),files=vm.runInContext('galaxyAttachmentFiles',context),plain=x=>JSON.parse(JSON.stringify(x));
// Codec/thumbnail behavior is exercised in the real-browser suite. This suite checks policy before decoding.
files.videoPreview=async()=>{};
const attachment={id:'old-docx',kind:'upload',entryId:'owner',filename:'reference.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',extension:'docx',size:15471,storageKey:'old-docx',createdAt:'2026-10-08T23:16:21.024Z'};

test('legitimate general-file v5 data loads losslessly without a migration or any writes',()=>{
 const entry={id:'owner',name:'Test',content:{...plain(model.emptyContent()),attachments:[attachment]}},snapshot={version:5,entries:[entry],connections:[],layout:[]};
 const raw=JSON.stringify(snapshot);let writes=0;
 const adapter=vm.runInContext('createLocalMetadataStore',context)({storage:()=>({getItem:()=>raw,setItem:()=>{writes++}})});
 const loaded=adapter.load();assert.equal(loaded.migrateTree,false);assert.equal(writes,0);
 assert.deepEqual(plain(model.normalizeEntry(loaded.entries[0]).content),entry.content);
 assert.equal(model.filePolicy.classify(attachment).kind,'generic');
});
test('compatibility retains corruption protection for MIME, ownership, duplicate IDs, and future content',()=>{
 for(const defect of [{mimeType:'bad MIME'},{entryId:'someone-else'},{storageKey:''},{size:-1},{extension:{bad:true}}])
  assert.equal(model.normalizeContent({...model.emptyContent(),attachments:[{...attachment,...defect}]},'owner'),null);
 assert.equal(model.normalizeContent({...model.emptyContent(),attachments:[attachment,attachment]},'owner'),null);
 assert.equal(model.normalizeContent({...model.emptyContent(),version:2,attachments:[attachment]},'owner'),null);
});
test('MP4, WebM and MOV route into ordered Media even with missing or unsupported reported codec MIME',()=>{
 for(const [filename,mimeType] of [['movie.MP4','video/mp4'],['movie.webm','video/webm'],['phone.MOV','video/quicktime'],['phone.mov','application/octet-stream'],['phone.mp4',''],['phone.mov','video/mp4']]){
  const file={filename,mimeType};assert.equal(model.filePolicy.classify(file).kind,'video');assert.equal(model.filePolicy.isMedia(file),true);
 }
 for(const file of [{filename:'preview.jpg',mimeType:'image/jpeg'},{filename:'clip',mimeType:'video/mp4'}])assert.equal(model.filePolicy.isMedia(file),true);
 for(const file of [attachment,{filename:'plan.pdf',mimeType:'application/pdf'},{filename:'files.zip',mimeType:'application/zip'}])assert.equal(model.filePolicy.isMedia(file),false);
});
test('100 MiB video boundary is independent of the unchanged 10 MiB document and image limits',async()=>{
 const prepare=(name,size,type='')=>{const file=Object.assign(new Blob(['bytes'],{type}),{name});Object.defineProperty(file,'size',{value:size});return files.prepare(file,'owner');};
 assert.equal(model.contentLimits.videoBytes,100*1024*1024);assert.equal(model.contentLimits.fileBytes,10*1024*1024);
 for(const name of ['clip.mp4','clip.webm','clip.mov']){
  const atLimit=await prepare(name,100*1024*1024);assert.equal(atLimit.metadata.size,100*1024*1024);
  await assert.rejects(prepare(name,100*1024*1024+1),/100 MiB/);
 }
 for(const name of ['data.docx','archive.zip','photo.jpg'])await assert.rejects(prepare(name,10*1024*1024+1),/10 MiB/);
});
test('video dimensions and duration round-trip additively in existing v5 attachment metadata',()=>{
 const video={...attachment,filename:'clip.mp4',mimeType:'video/mp4',extension:'mp4',width:1920,height:1080,duration:65.5};
 assert.deepEqual(plain(model.normalizeContent({...model.emptyContent(),attachments:[video]},'owner').attachments[0]),video);
 for(const duration of [-1,Infinity,NaN,'65'])assert.equal(model.normalizeContent({...model.emptyContent(),attachments:[{...video,duration}]},'owner'),null);
});
