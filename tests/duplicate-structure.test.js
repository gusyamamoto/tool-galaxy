const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({URL,Blob,structuredClone,navigator:{locks:require('./local-write-fixture').createLockManager()}});
for(const file of ['model.js','portals.js','constellations.js','clipboard.js','persistence/memory-stores.js','persistence/local-metadata-store.js','services/universe-repository.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
const model=vm.runInContext('galaxyModel',ctx),copies=vm.runInContext('hierarchyCopies',ctx),repoFactory=vm.runInContext('createUniverseRepository',ctx),metaFactory=vm.runInContext('createMemoryMetadataStore',ctx),localFactory=vm.runInContext('createLocalMetadataStore',ctx);
const plain=value=>JSON.parse(JSON.stringify(value));
const ids=()=>{let n=0;return()=>`new-${++n}`;};
const forbiddenFiles=new Proxy({}, {get(){throw new Error('Structure duplication must never access attachment storage.');}});
function fixture(){return {entries:[
 {id:'g',name:'Mexico',parentId:null,x:123,y:456,description:'Trip details',category:'Travel',appearance:{seed:17}},
 {id:'a',name:'Food',parentId:'g',x:150,y:460},
 {id:'b',name:'Restaurants in Mexico',parentId:'a',x:160,y:470},
 {id:'c',name:'Stay',parentId:'g',x:155,y:465},
 {id:'other',name:'Elsewhere',parentId:null,x:600,y:700}
 ],portals:[{id:'internal',parentEntryId:'a',targetEntryId:'b',createdAt:'2026-01-01T00:00:00Z'},{id:'external',parentEntryId:'a',targetEntryId:'other',createdAt:'2026-01-01T00:00:00Z'}],
 constellations:[{id:'favorites',name:'Favorites',memberEntryIds:['g','b'],createdAt:'2026-01-01T00:00:00Z'}],layout:[{id:'a',parentId:'g',angle:2,radius:70}],
 archivedGalaxies:[{galaxyId:'other',archivedAt:'2026-01-01T00:00:00Z'}]};}
function repository(source){const meta=metaFactory(source);return {meta,repo:repoFactory({persistence:{metadata:meta,files:forbiddenFiles}})};}

test('a Galaxy structure receives fresh IDs, correct parents and stable canonical sibling order',async ()=>{
 const source=fixture(),before=structuredClone(source),{repo,meta}=repository(source);
 const result=(await repo.duplicateStructure(source,'g',' Japan ',ids(),{x:0,y:0})),[root,food,stay,restaurants]=result.copies;
 assert.equal(root.name,'Japan');assert.equal(root.parentId,null);
 assert.equal(food.parentId,root.id);assert.equal(stay.parentId,root.id);assert.equal(restaurants.parentId,food.id);
 assert.equal(restaurants.name,'Restaurants in Mexico');
 assert.equal(new Set(result.copies.map(e=>e.id)).size,4);
 assert.ok(result.copies.every(e=>!source.entries.some(old=>old.id===e.id)));
 const entries=new Map(structuredClone(result.snapshot.entries).map(e=>[e.id,e]));model.normalizeHierarchy(entries);
 assert.equal(entries.get(root.id).role,'galaxy');assert.equal(entries.get(food.id).role,'sun');
 assert.deepEqual(plain(model.childrenOf(entries,root.id).map(e=>e.name)),['Food','Stay']);
 assert.deepEqual(plain(source),before);assert.deepEqual(plain(meta.load().entries.slice(0,source.entries.length)),before.entries);
});

test('all six hierarchy depths are reconstructed and roles derive from depth',async ()=>{
 const source=fixture();source.entries=Array.from({length:6},(_,i)=>({id:`depth-${i}`,name:model.roleAtDepth(i),parentId:i?`depth-${i-1}`:null}));
 const result=copies.structure(source,'depth-0','New Galaxy',ids()),entries=new Map(result.copies.map(e=>[e.id,e]));
 assert.equal(result.copies.length,6);assert.ok(result.copies.every(e=>!Object.hasOwn(e,'role')&&!Object.hasOwn(e,'depth')));
 model.normalizeHierarchy(entries);
 result.copies.forEach((entry,i)=>{assert.equal(entry.depth,i);assert.equal(entry.role,model.roleAtDepth(i));assert.equal(entry.parentId,i?result.copies[i-1].id:null);});
});

test('Sun and Planet structures become siblings under the same canonical parent',async ()=>{
 for(const rootId of ['a','b']){
  const source=fixture(),{repo}=repository(source),result=(await repo.duplicateStructure(source,rootId,'Another branch',ids()));
  assert.equal(result.copies[0].parentId,source.entries.find(e=>e.id===rootId).parentId);
  assert.equal(result.copies.length,rootId==='a'?2:1);
  assert.equal(result.copies[0].name,'Another branch');
 }
});

test('only names and hierarchy are reused; content, memberships, placements and incidental metadata are excluded',async ()=>{
 const source=fixture();
 source.entries.forEach(entry=>Object.assign(entry,{
  content:{version:1,notes:{format:'plain',text:'Private notes'},links:[{id:`link-${entry.id}`,url:'https://example.com/'}],attachments:[
   {id:`file-${entry.id}`,kind:'upload',entryId:entry.id,storageKey:`file-${entry.id}`,filename:'trip.pdf',mimeType:'application/pdf',size:4},
   {id:`media-${entry.id}`,kind:'upload',entryId:entry.id,storageKey:`media-${entry.id}`,filename:'trip.png',mimeType:'image/png',size:4}]},
  thumbnail:'old',draft:'old',location:{text:'Frida Kahlo Museum'},selected:true,archived:true,createdAt:'2020-01-01T00:00:00Z',updatedAt:'2020-01-01T00:00:00Z'
 }));
 const {repo}=repository(source),result=(await repo.duplicateStructure(source,'g','Japan',ids()));
 for(const entry of result.copies){
  assert.deepEqual(Object.keys(entry).sort(),['id','name','parentId','description','category','x','y','createdAt','updatedAt'].sort());
  assert.equal(entry.description,'');assert.equal(entry.category,'');assert.equal(entry.x,0);assert.equal(entry.y,0);
  assert.ok(Date.parse(entry.createdAt)>Date.parse('2020-01-01'));assert.equal(entry.updatedAt,entry.createdAt);
 }
 assert.equal(result.files.length,0);assert.equal(result.links.length,0);
 for(const key of ['portals','constellations','layout','archivedGalaxies'])assert.deepEqual(plain(result.snapshot[key]),source[key]);
 assert.ok(result.snapshot.constellations.every(c=>c.memberEntryIds.every(id=>!result.rootIds.includes(id))));
});

test('duplicate and original remain independent through names, content, additions and deletion',async ()=>{
 const source=fixture(),before=structuredClone(source),{repo}=repository(source),result=(await repo.duplicateStructure(source,'g','Japan',ids()));
 const [root,food,stay,restaurants]=result.copies,entries=new Map(result.snapshot.entries.map(e=>[e.id,e]));
 root.name='Japan changed';food.content=model.emptyContent();food.content.notes.text='New notes';
 entries.set('added',{id:'added',name:'New child',parentId:food.id});entries.delete(stay.id);
 assert.deepEqual(plain(source),before);
 entries.get('a').name='Original changed';entries.get('b').content=model.emptyContent();entries.get('b').content.notes.text='Original notes';entries.delete('c');
 assert.equal(food.name,'Food');assert.equal(restaurants.name,'Restaurants in Mexico');assert.equal(food.content.notes.text,'New notes');assert.equal(restaurants.content,undefined);
});

test('one metadata commit publishes once; persistence failure leaves no partial hierarchy or event',async ()=>{
 const source=fixture(),{repo,meta}=repository(source);let writes=0,published=[];
 const save=meta.save;meta.save=value=>{writes++;save(value);};repo.subscribe(event=>published.push(event));
 (await repo.duplicateStructure(source,'g','Japan',ids()));assert.equal(writes,1);assert.equal(published.length,1);assert.equal(published[0].type,'items.structure-duplicated');
 const failed=repository(source);let failedEvents=0;failed.repo.subscribe(()=>failedEvents++);
 failed.meta.save=()=>{throw new Error('Quota exceeded');};
 await assert.rejects(()=>failed.repo.duplicateStructure(source,'g','Japan',ids()),/Quota/);
 assert.deepEqual(plain(failed.meta.load()),source);assert.equal(failedEvents,0);
});

test('invalid names, multiple targets, missing parents and ID collisions cannot publish a duplicate',async ()=>{
 for(const name of ['', '   ', 'x'.repeat(61),null]){
  const source=fixture(),{repo,meta}=repository(source);await assert.rejects(()=>repo.duplicateStructure(source,'g',name,ids()));assert.deepEqual(plain(meta.load()),source);
 }
 const source=fixture(),{repo,meta}=repository(source);
 await assert.rejects(()=>repo.duplicateStructure(source,['g','a'],'Japan',ids()),/one item/);
 await assert.rejects(()=>repo.duplicateStructure(source,'gone','Japan',ids()),/no longer/);
 for(const id of ['g','internal','same'])await assert.rejects(()=>repo.duplicateStructure(source,'g','Japan',()=>id),/IDs/);
 const broken=structuredClone(source);broken.entries[1].parentId='gone';await assert.rejects(()=>repo.duplicateStructure(broken,'a','Japan',ids()),/location/);
 assert.deepEqual(plain(meta.load()),source);
});

test('structure persists through the v5 adapter and reloads as valid canonical entries',async ()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const metadata=localFactory({storage:()=>storage}),source=fixture(),repo=repoFactory({persistence:{metadata,files:forbiddenFiles}});
 const result=(await repo.duplicateStructure(source,'g','Japan',ids()));
 assert.equal(JSON.parse(storage.getItem(metadata.key)).version,5);
 const loaded=localFactory({storage:()=>storage}).load(),entries=new Map(loaded.entries.map(e=>model.normalizeEntry(e)).map(e=>[e.id,e]));model.normalizeHierarchy(entries);
 assert.equal(entries.get(result.rootIds[0]).name,'Japan');assert.equal(model.subtreeIds(entries,result.rootIds[0]).size,4);
 assert.ok(result.copies.every(e=>entries.has(e.id)&&!entries.get(e.id).content));
});
