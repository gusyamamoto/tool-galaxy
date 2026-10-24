const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {webcrypto,createHash}=require('node:crypto');
const ctx=vm.createContext({URL,Blob,structuredClone,crypto:webcrypto,TextEncoder,TextDecoder,DOMException,setTimeout,navigator:{locks:require('./local-write-fixture').createLockManager()}});
for(const file of ['config.js','model.js','portals.js','constellations.js','clipboard.js','persistence/local-metadata-store.js','persistence/local-preferences-store.js','persistence/memory-stores.js','persistence/composition.js','services/universe-repository.js','services/local-backup.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
const get=name=>vm.runInContext(name,ctx),backup=get('cosmifoldBackup'),repository=get('createUniverseRepository'),local=get('createLocalMetadataStore'),prefs=get('createLocalPreferencesStore'),memoryFiles=get('createMemoryFileStore'),compose=get('createPersistence');
const plain=v=>JSON.parse(JSON.stringify(v)),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function storage(){const values=new Map();let writes=0;return {values,get writes(){return writes;},getItem:key=>values.get(key)??null,setItem(key,value){writes++;values.set(key,value);},removeItem(key){writes++;values.delete(key);}};}
function fixture(){return {version:5,entries:Array.from({length:6},(_,i)=>({id:`item-${i}`,name:i?'Descendant '+i:'Trip',parentId:i?`item-${i-1}`:null,x:10+i,y:20+i,appearance:{seed:i},description:'Saved description',category:'Travel',createdAt:'2026-01-01T00:00:00Z',location:{text:'Frida Kahlo Museum'},content:{version:1,notes:{format:'plain',text:'Saved notes'},links:[{id:`bookmark-${i}`,url:'https://example.com/',title:'Keep'}],attachments:[]},futureField:{keep:true}})),connections:[],layout:[{id:'item-1',parentId:'item-0',angle:.2,radius:80}],portals:[{id:'placement',parentEntryId:'item-2',targetEntryId:'item-4',createdAt:'2026-01-01T00:00:00Z'}],constellations:[{id:'favorites',name:'Favorites',memberEntryIds:['item-1','item-5'],createdAt:'2026-01-01T00:00:00Z'}],archivedGalaxies:[{galaxyId:'item-0',archivedAt:'2026-01-01T00:00:00Z',expandedIds:['item-0','item-1']}],futureRoot:{keep:'complete persisted representation'}};}
function setup(metadata=fixture()){
 const disk=storage(),meta=local({storage:()=>disk}),preferences=prefs({storage:()=>disk}),files=memoryFiles();
 if(metadata!==null)disk.setItem(meta.key,JSON.stringify(metadata));
 const persistence=compose({metadata:meta,files,preferences});return {disk,meta,preferences,files,persistence,repo:repository({persistence})};
}
async function inspect(blob){
 const bytes=Buffer.from(await blob.arrayBuffer()),magic=Buffer.from(backup.magic),headerSize=magic.length+40;
 assert.ok(bytes.subarray(0,magic.length).equals(magic));assert.equal(bytes.readUInt32LE(magic.length),1);
 const length=bytes.readUInt32LE(magic.length+4),json=bytes.subarray(headerSize,headerSize+length);
 assert.equal(bytes.subarray(magic.length+8,headerSize).toString('hex'),hash(json),'manifest integrity');
 const manifest=JSON.parse(json.toString('utf8'));assert.equal(manifest.format,'cosmifold-backup');assert.equal(manifest.backupVersion,1);assert.equal(manifest.storageVersion,5);
 const records=new Map();let offset=0;
 for(const file of manifest.attachments){
  const payloads={};
  for(const key of ['original','thumbnail'])if(file[key]){
   const d=file[key];assert.equal(d.offset,offset,'ordered payload without gaps/overlap');
   const payload=bytes.subarray(headerSize+length+d.offset,headerSize+length+d.offset+d.size);
   assert.equal(payload.length,d.size);assert.equal(hash(payload),d.sha256);payloads[key]=payload;offset+=d.size;
  }
  records.set(file.record.key,{...file,payloads});
 }
 assert.equal(offset,manifest.payloadBytes);assert.equal(bytes.length,headerSize+length+offset);
 return {manifest,records,bytes,headerSize,manifestLength:length};
}
async function attach(state,id,bytes,{owner='item-1',type='application/octet-stream',filename=id,thumbnail}={}){
 const record={key:id,entryId:owner,blob:new Blob([bytes],{type}),...(thumbnail!==undefined?{thumbnail:new Blob([thumbnail],{type:'image/webp'})}:{})};
 await state.files.save(record);
 const data=JSON.parse(state.disk.getItem(state.meta.key));
 data.entries.find(e=>e.id===owner).content.attachments.push({id,kind:'upload',entryId:owner,storageKey:id,filename,mimeType:type,size:record.blob.size,createdAt:'2026-01-01T00:00:00Z'});
 state.disk.setItem(state.meta.key,JSON.stringify(data));return record;
}

test('empty storage and minimal Cosmos produce a versioned complete single Blob',async()=>{
 for(const metadata of [null,{version:5,entries:[],connections:[],layout:[]}]){
  const state=setup(metadata),writes=state.disk.writes,result=await backup.create(state.repo),parsed=await inspect(result.blob);
  assert.deepEqual(parsed.manifest.metadata,metadata);assert.equal(parsed.manifest.counts.entries,0);assert.equal(parsed.manifest.attachments.length,0);assert.equal(state.disk.writes,writes);
 }
});

test('deep hierarchy, all content/references, archived data and unknown persisted fields survive exactly without normalization',async()=>{
 const data=fixture(),state=setup(data),original=state.disk.getItem(state.meta.key);
 state.disk.setItem(state.meta.backupKey,'{"version":2,"legacy":"Keep exactly"}');state.preferences.update({width:280,collapsed:false,universeCollapsed:true});
 state.disk.setItem(state.meta.layoutBackupKey,'{"version":3,"oldLayout":true}');
 state.disk.setItem(state.meta.treeBackupKey,'{"version":4,"oldTree":true}');
 state.disk.setItem(state.meta.legacyKey,'{"version":1,"old":"Keep fallback too"}');
 const before=[...state.disk.values],writes=state.disk.writes,{manifest}=await inspect((await backup.create(state.repo)).blob);
 assert.deepEqual(manifest.metadata,data);assert.equal(manifest.metadataText,original);assert.deepEqual(manifest.preferences,{width:280,collapsed:false,universeCollapsed:true});
 assert.equal(Object.hasOwn(manifest,'recoverySnapshots'),false);
 assert.equal(JSON.stringify(manifest).includes('Keep fallback too'),false);
 assert.equal(JSON.stringify(manifest).includes('Keep exactly'),false);
 assert.equal(JSON.stringify(manifest).includes('oldLayout'),false);assert.equal(JSON.stringify(manifest).includes('oldTree'),false);
 assert.equal(manifest.counts.entries,6);assert.equal(manifest.counts.galaxies,1);assert.equal(manifest.counts.notes,6);assert.equal(manifest.counts.bookmarks,6);assert.equal(manifest.counts.locations,6);assert.equal(manifest.counts.constellationMembers,2);assert.equal(manifest.counts.linkedPlacements,1);assert.equal(manifest.counts.archivedGalaxies,1);
 assert.deepEqual([...state.disk.values],before);assert.equal(state.disk.writes,writes);
});

test('image, PDF, video and generic bytes and saved thumbnails round-trip losslessly',async()=>{
 const state=setup(),fixtures=[['photo',Buffer.from([137,80,78,71,0,255]),'image/png'],['pdf',Buffer.from('%PDF-1.4\nBinary\u0000'),'application/pdf'],['video',Buffer.from([0,1,2,0,255,128,99]),'video/webm'],['generic',Buffer.from(Array.from({length:256},(_,i)=>i)),'application/octet-stream']];
 for(const [id,bytes,type] of fixtures)await attach(state,id,bytes,{type,filename:id+'.original',...(id==='photo'||id==='video'?{thumbnail:Buffer.from([1,2,3,255])}:{})});
 const writes=state.disk.writes,{manifest,records}=await inspect((await backup.create(state.repo)).blob);
 assert.equal(manifest.counts.attachmentReferences,4);assert.equal(manifest.counts.attachmentRecords,4);assert.equal(manifest.counts.thumbnails,2);
 for(const [id,bytes,type] of fixtures){assert.deepEqual(records.get(id).payloads.original,bytes);assert.equal(records.get(id).original.type,type);assert.equal(records.get(id).record.entryId,'item-1');}
 assert.deepEqual(records.get('photo').payloads.thumbnail,Buffer.from([1,2,3,255]));assert.equal(records.get('generic').thumbnail,null);assert.equal(state.disk.writes,writes);
});

test('copy-created and archived referenced attachments survive while orphan records remain stored but excluded',async()=>{
 const state=setup();await attach(state,'original',Buffer.from('Independent bytes'),{thumbnail:Buffer.from('Preview')});
 let n=0;const copied=await state.repo.copyEntries(state.repo.load(),['item-1'],'item-0',()=>`new-${++n}`);
 await state.files.save({key:'unreferenced',entryId:'old-owner',blob:new Blob(['Orphan bytes'])});
 const {manifest,records}=await inspect((await backup.create(state.repo)).blob),file=copied.copies[0].content.attachments[0];
 assert.equal(manifest.counts.attachmentRecords,2);assert.equal(Object.hasOwn(manifest.counts,'unreferencedRecords'),false);
 assert.deepEqual(records.get(file.storageKey).payloads.original,records.get('original').payloads.original);assert.equal(records.get(file.storageKey).record.entryId,copied.copies[0].id);
 assert.equal(records.has('unreferenced'),false);assert.equal(await (await state.files.get('unreferenced')).blob.text(),'Orphan bytes');
});

test('missing, mismatched, unreadable originals and corrupt thumbnails fail rather than export partial data',async()=>{
 for(const mode of ['missing','size','owner','thumbnail','read']){
  const state=setup();await attach(state,'file',Buffer.from('data'));const record=await state.files.get('file');
  if(mode==='missing')await state.files.delete('file');
  if(mode==='size')await state.files.save({...record,blob:new Blob(['wrong size'])});
  if(mode==='owner')await state.files.save({...record,entryId:'wrong owner'});
  if(mode==='thumbnail')await state.files.save({...record,thumbnail:'not bytes'});
  if(mode==='read')state.persistence.files.readAll=async()=>{throw new Error('Read failed');};
  const before=[...state.disk.values],writes=state.disk.writes;await assert.rejects(backup.create(state.repo));assert.deepEqual([...state.disk.values],before);assert.equal(state.disk.writes,writes);
 }
});

test('metadata/preference failures and source changes during capture preserve every stored value',async()=>{
 const state=setup();const before=[...state.disk.values],writes=state.disk.writes;
 const old=state.persistence.files.readAll;state.persistence.files.readAll=async()=>{const result=await old();state.preferences.update({width:300});return result;};
 await assert.rejects(backup.create(state.repo),/changed/);assert.equal(state.disk.getItem(state.meta.key),before[0][1]);
 const failed=setup();failed.persistence.metadata.readForBackup=()=>{throw new Error('Storage unavailable');};await assert.rejects(backup.create(failed.repo),/Storage unavailable/);
 assert.equal(failed.disk.writes,1);assert.equal(writes,1);
 const corrupt=setup();corrupt.disk.setItem(corrupt.meta.key,'invalid JSON');await assert.rejects(backup.create(corrupt.repo));assert.equal(corrupt.disk.getItem(corrupt.meta.key),'invalid JSON');
});

test('safe filename uses the local calendar date; repeat exports contain equivalent user data',async()=>{
 const date=new Date(2026,9,11,23,59);assert.equal(backup.filename(date),'cosmifold-backup-2026-10-11.cosmifold');
 const state=setup();await attach(state,'file',Buffer.from([0,255,42]));
 const a=await inspect((await backup.create(state.repo,{date})).blob),b=await inspect((await backup.create(state.repo,{date:new Date(date.getTime()+1000)})).blob);
 delete a.manifest.exportedAt;delete b.manifest.exportedAt;assert.deepEqual(a.manifest,b.manifest);
 assert.equal(/Trip|item-|Frida/.test(backup.filename(date)),false);
});

test('hashes detect manifest corruption, binary corruption and truncated packages',async()=>{
 const state=setup();await attach(state,'file',Buffer.from('Protected bytes'));
 const original=await inspect((await backup.create(state.repo)).blob);
 for(const index of [original.headerSize+5,original.headerSize+original.manifestLength]){
  const damaged=Buffer.from(original.bytes);damaged[index]^=1;await assert.rejects(inspect(new Blob([damaged])));
 }
 await assert.rejects(inspect(new Blob([original.bytes.subarray(0,original.bytes.length-1)])));
});

test('many files and realistic larger payloads avoid base64 expansion and retain every byte',async()=>{
 const state=setup();for(let i=0;i<40;i++)await attach(state,'small-'+String(i).padStart(2,'0'),Buffer.alloc(4096,i));
 for(const [id,size,type] of [['large-pdf',8*1024*1024,'application/pdf'],['large-photo',4*1024*1024,'image/png'],['large-video',32*1024*1024,'video/webm']])await attach(state,id,Buffer.alloc(size,37),{type});
 const result=await backup.create(state.repo),parsed=await inspect(result.blob);
 assert.equal(parsed.manifest.counts.attachmentRecords,43);assert.ok(result.blob.size<parsed.manifest.payloadBytes+100000,'only manifest/header overhead, no base64 payload expansion');
 assert.equal(parsed.records.get('large-video').payloads.original.length,32*1024*1024);assert.ok(parsed.records.get('large-video').payloads.original.every(n=>n===37));
});

test('size caps, cancellation and unsupported versions fail before a downloadable package is returned',async()=>{
 const state=setup();await attach(state,'file',Buffer.alloc(1024));
 await assert.rejects(backup.create(state.repo,{maxBytes:100}),/too large/);await assert.rejects(backup.create(state.repo,{maxManifestBytes:10}),/too large/);
 const controller=new AbortController();controller.abort();await assert.rejects(backup.create(state.repo,{signal:controller.signal}),e=>e.name==='AbortError');
 const during=new AbortController();await assert.rejects(backup.create(state.repo,{signal:during.signal,onProgress:p=>{if(p.stage==='files')during.abort();}}),e=>e.name==='AbortError');
 const legacy=setup({...fixture(),version:4});await assert.rejects(backup.create(legacy.repo),/storage-v5/);assert.equal(legacy.disk.writes,1);
});

test('Sample cannot read personal metadata or export a misleading saved backup',async()=>{
 const forbidden=new Proxy({},{get(){throw new Error('Personal storage accessed');}});
 const repo=repository({persistence:{sample:true,metadata:forbidden,files:forbidden,preferences:forbidden}});
 await assert.rejects(backup.create(repo),/Sample/);
});

test('default 512 MiB guard rejects oversized originals before reading their bytes',async()=>{
 let read=false;
 class OversizedBlob extends Blob {get size(){return 513*1024*1024;}async arrayBuffer(){read=true;throw new Error('Must not allocate oversized data');}}
 const state=setup();await attach(state,'oversized',Buffer.from('data'));
 const data=JSON.parse(state.disk.getItem(state.meta.key));data.entries[1].content.attachments[0].size=513*1024*1024;
 const repo={readBackup:async()=>({metadataText:JSON.stringify(data),preferencesText:null,records:[{key:'oversized',entryId:'item-1',blob:new OversizedBlob(['data'])}]})};
 await assert.rejects(backup.create(repo),/too large/);assert.equal(read,false);
});

test('strict preference reads and binary hash/read failures cause no save or successful event',async()=>{
 const state=setup(),writes=state.disk.writes;let events=0;state.repo.subscribe(()=>events++);
 state.preferences.readForBackup=()=>{throw new Error('Preference read denied');};
 await assert.rejects(backup.create(state.repo),/Preference read denied/);assert.equal(state.disk.writes,writes);assert.equal(events,0);
 class BrokenBlob extends Blob {async arrayBuffer(){throw new Error('Binary read denied');}}
 const binary=setup();await attach(binary,'broken',Buffer.from('data'));
 const repo={readBackup:async()=>({metadataText:binary.disk.getItem(binary.meta.key),preferencesText:null,records:[{key:'broken',entryId:'item-1',blob:new BrokenBlob(['data'])}]})};
 await assert.rejects(backup.create(repo),/Binary read denied/);
});

 test('corrupt and oversized orphans are ignored before validation, size checks and hashing',async()=>{
 const state=setup();await attach(state,'current',Buffer.from('Current bytes'));
 await state.files.save({key:'orphan-current-owner',entryId:'item-1',blob:new Blob(['Debris']),thumbnail:'corrupt cache'});
 const read=state.persistence.files.readAll;let touched=false;
 class DebrisBlob extends Blob {get size(){return 600*1024*1024;}async arrayBuffer(){touched=true;throw new Error('Orphan read');}}
 state.persistence.files.readAll=async()=>[...await read(),{key:'huge-orphan',entryId:'item-1',blob:new DebrisBlob()}];
 const progress=[],before=[...state.disk.values],writes=state.disk.writes;
 const {manifest,records}=await inspect((await backup.create(state.repo,{onProgress:p=>progress.push(p)})).blob);
 assert.equal(manifest.counts.attachmentRecords,1);assert.equal(manifest.counts.thumbnails,0);assert.equal(records.size,1);assert.equal(touched,false);
 assert.ok(progress.filter(p=>p.stage==='files').every(p=>p.total===1));
 assert.equal((await state.files.get('orphan-current-owner')).thumbnail,'corrupt cache');assert.deepEqual([...state.disk.values],before);assert.equal(state.disk.writes,writes);
 });
 test('internal recovery snapshots are never read or used to invalidate current capture',async()=>{
 const state=setup(),getItem=state.disk.getItem;
 state.disk.getItem=key=>{if([state.meta.backupKey,state.meta.layoutBackupKey,state.meta.treeBackupKey].includes(key))throw new Error('Recovery is internal');return getItem(key);};
 const read=state.persistence.files.readAll;state.persistence.files.readAll=async()=>{state.disk.values.set(state.meta.backupKey,'obsolete history');return read();};
 const {manifest}=await inspect((await backup.create(state.repo)).blob);assert.equal(Object.hasOwn(manifest,'recoverySnapshots'),false);assert.deepEqual(manifest.metadata,fixture());
 });
 test('active legacy-key fallback is retained as current metadata',async()=>{
 const state=setup(null);state.disk.setItem(state.meta.legacyKey,JSON.stringify(fixture()));
 const before=[...state.disk.values],writes=state.disk.writes,{manifest}=await inspect((await backup.create(state.repo)).blob);
 assert.deepEqual(manifest.metadata,fixture());assert.equal(manifest.metadataText,state.disk.getItem(state.meta.legacyKey));assert.deepEqual([...state.disk.values],before);assert.equal(state.disk.writes,writes);
 });
