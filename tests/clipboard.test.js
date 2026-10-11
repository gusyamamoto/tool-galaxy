const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({URL,Blob,structuredClone});
for(const file of ['model.js','portals.js','clipboard.js','persistence/memory-stores.js','services/universe-repository.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
const Clipboard=vm.runInContext('HierarchyClipboard',ctx),copies=vm.runInContext('hierarchyCopies',ctx),repoFactory=vm.runInContext('createUniverseRepository',ctx),filesFactory=vm.runInContext('createMemoryFileStore',ctx),metaFactory=vm.runInContext('createMemoryMetadataStore',ctx);
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture(){return {entries:[{id:'g',name:'Mexico',parentId:null,x:1,y:1},{id:'a',name:'Food',parentId:'g',description:'Keep description',category:'Travel',appearance:{seed:17},x:2,y:2,content:{version:1,notes:{format:'plain',text:'Keep note'},links:[{id:'bookmark',url:'https://example.com/',title:'Keep'}],attachments:[{id:'file',kind:'upload',entryId:'a',storageKey:'file',filename:'image.png',mimeType:'image/png',size:4,width:2,height:2,createdAt:'2026-01-01T00:00:00Z'}]}},{id:'b',name:'Restaurants',parentId:'a',x:3,y:3},{id:'d',name:'Japan',parentId:null,x:5,y:5}],portals:[{id:'inside',parentEntryId:'a',targetEntryId:'b',createdAt:'2026-01-01T00:00:00Z'},{id:'external',parentEntryId:'a',targetEntryId:'g',createdAt:'2026-01-01T00:00:00Z'},{id:'elsewhere',parentEntryId:'d',targetEntryId:'a',createdAt:'2026-01-01T00:00:00Z'}],layout:[{id:'a',parentId:'g',radius:70}],constellations:[{id:'c',name:'Chosen',memberEntryIds:['a']}]};}
function ids(){let n=0;return()=>`new-${++n}`;}
test('clipboard normalizes roots, keeps live references and survives repeated paste until refresh',()=>{
 const clip=new Clipboard(),data=fixture(),entries=new Map(data.entries.map(e=>[e.id,e]));
 assert.equal(clip.copy(entries,['a','b','g']),1);assert.deepEqual(plain(clip.copiedRootIds),['g']);assert.ok(clip.copiedAt);
 clip.copy(entries,['a','d']);entries.delete('a');assert.deepEqual(plain(clip.roots(entries)),['d']);entries.delete('d');assert.equal(clip.roots(entries).length,0);
 assert.equal(new Clipboard().copiedRootIds.length,0);
});
test('copy plans remap canonical/attachment/bookmark/internal-link IDs and omit external appearances and membership',()=>{
 const source=fixture(),before=structuredClone(source),plan=copies.plan(source,['a'],'d',ids()),[a,b]=plan.copies;
 assert.equal(a.parentId,'d');assert.equal(b.parentId,a.id);assert.notEqual(a.id,'a');assert.notEqual(b.id,'b');
 assert.equal(a.content.notes.text,'Keep note');assert.notEqual(a.content.links[0].id,'bookmark');assert.equal(a.content.attachments[0].entryId,a.id);assert.notEqual(a.content.attachments[0].storageKey,'file');assert.equal(a.content.attachments[0].width,2);
 assert.deepEqual(plain(a.appearance),before.entries[1].appearance);assert.equal(plan.links.length,1);assert.equal(plan.links[0].targetEntryId,b.id);assert.equal(plan.links[0].parentEntryId,a.id);
 a.content.notes.text='Independent';assert.deepEqual(plain(source),before);assert.deepEqual(plain(source.constellations[0].memberEntryIds),['a']);
});
test('copy planning defensively normalizes redundant roots and creates normal fresh timestamps',()=>{
 const plan=copies.plan(fixture(),['a','b'],'d',ids());
 assert.equal(plan.rootIds.length,1);assert.equal(plan.copies.length,2);assert.equal(plan.copies[1].parentId,plan.copies[0].id);
 assert.ok(Number.isFinite(Date.parse(plan.copies[0].createdAt)));assert.equal(plan.copies[0].createdAt,plan.copies[0].updatedAt);
});
test('independent attachment batches commit once and survive original/copy deletion independently',async()=>{
 const source=fixture(),files=filesFactory(),meta=metaFactory(source);await files.save({key:'file',entryId:'a',blob:new Blob(['data']),thumbnail:new Blob(['thumb'])});
 const repo=repoFactory({persistence:{metadata:meta,files}});let published=0;repo.subscribe(()=>published++);
 const result=await repo.copyEntries(source,['a'],'d',ids());assert.equal(published,1);assert.equal(meta.load().entries.length,6);
 assert.deepEqual(plain(meta.load().constellations),source.constellations);const copied=result.copies[0].content.attachments[0];
 assert.equal(await(await files.get(copied.storageKey)).blob.text(),'data');assert.equal(await(await files.get(copied.storageKey)).thumbnail.text(),'thumb');
 await files.deleteEntries(['a']);assert.equal(await files.get('file'),null);assert.equal(await(await files.get(copied.storageKey)).blob.text(),'data');
 await files.deleteEntries([result.rootIds[0]]);assert.equal(await files.get(copied.storageKey),null);
});
test('missing bytes, quota errors and late abort recovery publish no half-tree or orphan files',async()=>{
 for(const mode of ['missing','quota','late']){
  const source=fixture(),meta=metaFactory(source),files=filesFactory();if(mode!=='missing')await files.save({key:'file',entryId:'a',blob:new Blob(['data'])});
  if(mode==='quota')files.saveBatch=async()=>{throw new Error('quota');};
  if(mode==='late')files.saveBatch=async(records,commit,rollback)=>{commit();rollback();throw new Error('late abort');};
  const repo=repoFactory({persistence:{metadata:meta,files}});let published=0;repo.subscribe(()=>published++);
  await assert.rejects(repo.copyEntries(source,['a'],'d',ids()));assert.equal(published,0);assert.deepEqual(plain(meta.load()),source);assert.equal(await files.get('new-4'),null);
 }
});
test('link availability preserves existing leaf-link rules while rejecting redundant placements in Paste',()=>{
 const source=fixture(),entries=new Map(source.entries.map(e=>[e.id,e])),portals=new Map(source.portals.map(p=>[p.id,p])),clip=new Clipboard();
 clip.copy(entries,['a']);assert.ok(clip.linkError(entries,portals,'a'));assert.ok(clip.linkError(entries,portals,'g'));assert.ok(clip.linkError(entries,portals,'d'));
 clip.copy(entries,['g']);assert.equal(clip.linkError(entries,new Map(),'b'),'','Galaxy/ancestor targets remain supported by the existing leaf-placement architecture');
});
test('a source change during attachment staging is rejected without losing the latest state',async()=>{
 const original=fixture(),latest=structuredClone(original);latest.entries.push({id:'late',name:'New child',parentId:'a'});
 const meta=metaFactory(latest),files=filesFactory();await files.save({key:'file',entryId:'a',blob:new Blob(['data'])});
 const repo=repoFactory({persistence:{metadata:meta,files}});
 await assert.rejects(repo.copyEntries(original,['a'],'d',ids(),{readSnapshot:()=>latest}),/changed/);
 assert.deepEqual(plain(meta.load()),latest);assert.equal(files.hasEntries(['new-1','new-2']),false);
});
