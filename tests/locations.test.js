const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({URL,Blob,structuredClone,navigator:{locks:require('./local-write-fixture').createLockManager()}});
for(const file of ['model.js','portals.js','constellations.js','clipboard.js','persistence/memory-stores.js','persistence/local-metadata-store.js','services/universe-repository.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
const model=vm.runInContext('galaxyModel',ctx),factory=vm.runInContext('createUniverseRepository',ctx),memory=vm.runInContext('createMemoryMetadataStore',ctx),local=vm.runInContext('createLocalMetadataStore',ctx);
const plain=value=>JSON.parse(JSON.stringify(value));
const ids=()=>{let n=0;return()=>`new-${++n}`;};
function fixture(){return {entries:[{id:'g',name:'Mexico',parentId:null,x:100,y:100},{id:'a',name:'Rosetta',parentId:'g',x:110,y:110,description:'Restaurant',category:'Food',appearance:{seed:17},content:{...plain(model.emptyContent()),notes:{format:'plain',text:'Reservation'},links:[{id:'bookmark',url:'https://example.com/'}]},createdAt:'2026-01-01T00:00:00Z'},{id:'other',name:'Personal',parentId:null,x:400,y:400}],portals:[{id:'p',parentEntryId:'other',targetEntryId:'a',createdAt:'2026-01-01T00:00:00Z'}],constellations:[{id:'c',name:'Favorites',memberEntryIds:['a'],createdAt:'2026-01-01T00:00:00Z'}],layout:[]};}
function setup(source=fixture()){const metadata=memory(source),files=new Proxy({},{get(){throw new Error('Location must not touch attachments.');}});return {metadata,repo:factory({persistence:{metadata,files}})};}

test('optional Location normalizes a trimmed text object while legacy and malformed optional metadata retain valid items',async ()=>{
 const legacy=model.normalizeEntry({id:'old',name:'Old item'});assert.equal(Object.hasOwn(legacy,'location'),false);
 const entry=model.normalizeEntry({id:'a',name:'Place',location:{text:'  Frida Kahlo Museum  ',latitude:123,placeId:'unused'}});
 assert.deepEqual(plain(entry.location),{text:'Frida Kahlo Museum'});
 assert.notEqual(entry.location.text,'  Frida Kahlo Museum  ');
 for(const value of [undefined,null,'place',[],{text:''},{text:'   '},{text:12},{text:'x'.repeat(1001)},{text:'place\u0000name'}]){
  assert.equal(model.normalizeLocation(value),null);assert.equal(model.normalizeEntry({id:'a',name:'Place',location:value}).location,undefined);
 }
});

test('add, edit and remove change only the canonical Location and update timestamp after a successful write',async ()=>{
 const source=fixture(),before=structuredClone(source),{repo,metadata}=setup(source);let events=[];repo.subscribe(e=>events.push(e));
 const added=(await repo.updateLocation(source,'a',{text:'  Frida Kahlo Museum  '}));assert.deepEqual(plain(added.location),{text:'Frida Kahlo Museum'});
 assert.deepEqual(plain(source),before);assert.ok(Date.parse(added.updatedAt));
 const edited=(await repo.updateLocation(metadata.load(),'a',{text:'Colima 166, Roma Norte, Mexico City'}));assert.equal(edited.location.text,'Colima 166, Roma Norte, Mexico City');
 const last=metadata.load(),removed=(await repo.updateLocation(last,'a',null));assert.equal(Object.hasOwn(removed,'location'),false);
 for(const key of ['id','name','parentId','description','category','appearance','content','createdAt'])assert.deepEqual(plain(removed[key]),before.entries[1][key]);
 for(const key of ['portals','constellations','layout'])assert.deepEqual(plain(metadata.load()[key]),before[key]);
 assert.deepEqual(events.map(e=>e.type),['location.changed','location.changed','location.changed']);
 assert.deepEqual(plain(events[0].ids),['a']);
});

test('invalid writes, removed items and persistence failure leave the saved Location and all other data unchanged',async ()=>{
 const source=fixture();source.entries[1].location={text:'Original place'};const {repo,metadata}=setup(source);let emitted=0;repo.subscribe(()=>emitted++);
 for(const value of [{text:''},{text:'  '},{text:'x'.repeat(1001)},'invalid',undefined])await assert.rejects(()=>repo.updateLocation(source,'a',value),/place or address/);
 await assert.rejects(()=>repo.updateLocation(source,'missing',{text:'Place'}),/no longer/);
 metadata.save=()=>{throw new Error('Quota exceeded');};await assert.rejects(()=>repo.updateLocation(source,'a',{text:'New place'}),/Quota/);
 await assert.rejects(()=>repo.updateLocation(source,'a',null),/Quota/);assert.deepEqual(plain(metadata.load()),source);assert.equal(emitted,0);
});

test('Google Maps links encode spaces, Unicode and reserved characters solely within the fixed search query',async ()=>{
 for(const text of ['Hyatt Regency Mexico City','Colima 166, Roma Norte, Mexico City','Cuauhtémoc & Café + #1 / 日本 ? api=2','<script>alert("place")</script>']){
  const href=model.locationMapsUrl({text}),url=new URL(href);
  assert.equal(url.origin,'https://www.google.com');assert.equal(url.pathname,'/maps/search/');assert.equal(url.searchParams.get('api'),'1');assert.equal(url.searchParams.get('query'),text);
  assert.equal([...url.searchParams].length,2);assert.equal(url.hash,'');assert.equal(url.username,'');assert.equal(url.searchParams.has('key'),false);
 }
 assert.equal(model.locationMapsUrl(null),null);assert.equal(model.locationMapsUrl({text:'  '}),null);
});

test('canonical snapshots and additive v5 persistence retain Locations without changing old records or schema',async ()=>{
 const source=fixture();source.entries[1].location={text:'Frida Kahlo Museum'};
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const metadata=local({storage:()=>storage}),repo=factory({persistence:{metadata}});
 const snapshot=repo.snapshot({entries:new Map(source.entries.map(e=>[e.id,e])),portals:new Map(source.portals.map(e=>[e.id,e])),constellations:new Map(source.constellations.map(e=>[e.id,e])),layout:new Map(),archivedGalaxies:new Map()});
 assert.deepEqual(plain(snapshot.entries[1].location),source.entries[1].location);(await repo.save(snapshot));
 assert.equal(JSON.parse(storage.getItem(metadata.key)).version,5);
 const loaded=local({storage:()=>storage}).load().entries.map(e=>model.normalizeEntry(e));
 assert.equal(loaded[1].location.text,'Frida Kahlo Museum');assert.equal(loaded[0].location,undefined);
 (await repo.updateLocation({...snapshot,entries:loaded},'a',null));assert.equal(local({storage:()=>storage}).load().entries[1].location,undefined);
});

test('linked placements resolve the same canonical Location and never acquire placement-specific metadata',async ()=>{
 const source=fixture(),{repo,metadata}=setup(source);(await repo.updateLocation(source,'a',{text:'Shared restaurant'}));
 const loaded=metadata.load(),entries=new Map(loaded.entries.map(e=>[e.id,e])),portal=loaded.portals[0];
 assert.equal(entries.get(portal.targetEntryId).location.text,'Shared restaurant');assert.equal(portal.location,undefined);
 (await repo.updateLocation(loaded,portal.targetEntryId,{text:'Shared edited place'}));
 assert.equal(metadata.load().entries.find(e=>e.id==='a').location.text,'Shared edited place');assert.deepEqual(plain(metadata.load().portals),source.portals);
});

test('normal deep copies preserve independently owned Locations while structure duplication omits them at every depth',async()=>{
 const source=fixture();source.entries[0].location={text:'Mexico City'};source.entries[1].location={text:'Colima 166'};
 const {repo,metadata}=setup(source),copy=await repo.copyEntries(source,['g'],'other',ids());
 assert.equal(copy.copies[0].location.text,'Mexico City');assert.equal(copy.copies[1].location.text,'Colima 166');assert.notEqual(copy.copies[1].location,source.entries[1].location);
 const edited=(await repo.updateLocation(metadata.load(),copy.copies[1].id,{text:'Independent place'}));
 assert.equal(edited.location.text,'Independent place');assert.equal(metadata.load().entries.find(e=>e.id==='a').location.text,'Colima 166');
 const structureIds=ids(),structure=(await repo.duplicateStructure(metadata.load(),'g','Japan',()=>`structure-${structureIds()}`));
 assert.ok(structure.copies.every(e=>!Object.hasOwn(e,'location')));
});

test('group move and content updates preserve Location; global Search still matches item names only',async ()=>{
 const source=fixture();source.entries[1].location={text:'Vancouver'};
 source.entries.push({id:'hotel',name:'Hotel',parentId:'g',location:{text:'Mexico City'}});const {repo}=setup(source);
 const moved=(await repo.moveEntries(source,['a','hotel'],'other'));assert.equal(moved.snapshot.entries.find(e=>e.id==='a').location.text,'Vancouver');
 assert.equal(moved.snapshot.entries.find(e=>e.id==='hotel').location.text,'Mexico City');assert.ok(moved.changed.includes('hotel'));
 const updated=(await repo.updateContent(moved.snapshot,'a',{...plain(model.emptyContent()),notes:{format:'plain',text:'Updated note'}}));assert.equal(updated.location.text,'Vancouver');
 const entries=new Map(source.entries.map(e=>[e.id,e]));assert.equal(model.search(entries,'Vancouver').length,0);assert.equal(model.search(entries,'Rosetta')[0].id,'a');
});
