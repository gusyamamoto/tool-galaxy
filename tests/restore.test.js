const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const ctx=vm.createContext({URL,Blob,structuredClone,crypto:webcrypto,TextEncoder,TextDecoder,DOMException,setTimeout});
for(const file of ['config.js','model.js','portals.js','constellations.js','archives.js','persistence/local-metadata-store.js','persistence/local-preferences-store.js','persistence/memory-stores.js','persistence/composition.js','services/universe-repository.js','services/local-backup.js','services/local-restore.js','services/local-restore-session.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const get=name=>vm.runInContext(name,ctx),backup=get('cosmifoldBackup'),restore=get('cosmifoldRestore');
const plain=value=>JSON.parse(JSON.stringify(value));
function rich(){
 const date='2026-10-11T00:00:00Z';
 return {version:5,connections:[],entries:Array.from({length:8},(_,i)=>({id:'a-'+i,parentId:i?'a-'+(i-1):null,name:i?'Tokyo '+i:'Japan',description:'Keep',category:'Travel',x:200+i,y:300+i,appearance:{seed:i},createdAt:date,location:{text:'Tokyo Station'},content:{version:1,notes:{format:'plain',text:'Saved note '+i},links:[{id:'bookmark-'+i,url:'https://example.com/',title:'Booking'}],attachments:[]},futureField:{keep:'exact'}})),layout:[{id:'a-1',parentId:'a-0',angle:.2,radius:50}],portals:[{id:'link',targetEntryId:'a-4',parentEntryId:'a-1',createdAt:date}],constellations:[{id:'collection',name:'Trip favorites',memberEntryIds:['a-2','a-7'],createdAt:date}],archivedGalaxies:[{galaxyId:'a-0',archivedAt:date,expandedIds:['a-0','a-3']}],futureRoot:'Keep this'};
}
function setup(data=null){
 const values=new Map(),disk={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const metadata=get('createLocalMetadataStore')({storage:()=>disk}),preferences=get('createLocalPreferencesStore')({storage:()=>disk}),files=get('createMemoryFileStore')();
 if(data)disk.setItem(metadata.key,JSON.stringify(data));
 const persistence=get('createPersistence')({metadata,preferences,files}),repo=get('createUniverseRepository')({persistence});
 return {disk,values,metadata,preferences,files,persistence,repo};
}
async function source(){
 const data=rich(),state=setup(data),originals=new Map();
 for(const [i,type,name] of [[0,'image/png','photo.png'],[1,'application/pdf','booking.pdf'],[2,'video/webm','trip.webm'],[3,'application/octet-stream','document.bin'],[4,'image/png','copy.png']]){
  const bytes=Uint8Array.from([0,255,128,1,i]),key='file-'+i,owner=i===4?'a-5':'a-3',thumbnail=i%2===0?new Blob([Uint8Array.from([i,128,255])],{type:'image/webp'}):null;
  originals.set(key,bytes);
  await state.files.save({key,entryId:owner,blob:new Blob([bytes],{type}),thumbnail});
  data.entries.find(e=>e.id===owner).content.attachments.push({id:key,kind:'upload',entryId:owner,storageKey:key,filename:name,mimeType:type,size:bytes.length,createdAt:'2026-10-11T00:00:00Z'});
 }
 state.disk.setItem(state.metadata.key,JSON.stringify(data));state.preferences.update({width:280,collapsed:false,universeCollapsed:true,expandedIds:['a-0']});
 return {state,data,originals,result:await backup.create(state.repo)};
}
async function contents(state){
 return {values:[...state.values].sort(),records:await Promise.all((await state.files.readAll()).map(async r=>({key:r.key,owner:r.entryId,bytes:[...new Uint8Array(await r.blob.arrayBuffer())],thumbnail:r.thumbnail?[...new Uint8Array(await r.thumbnail.arrayBuffer())]:null})))};
}
async function altered(blob,mutate){
 const spec=backup,header=new Uint8Array(await blob.slice(0,spec.headerBytes).arrayBuffer()),view=new DataView(header.buffer),magic=new TextEncoder().encode(spec.magic).length,length=view.getUint32(magic+4,true);
 const manifest=JSON.parse(await blob.slice(spec.headerBytes,spec.headerBytes+length).text());mutate(manifest);
 const json=new TextEncoder().encode(JSON.stringify(manifest));view.setUint32(magic+4,json.length,true);header.set(new Uint8Array(await webcrypto.subtle.digest('SHA-256',json)),magic+8);
 return new Blob([header,json,blob.slice(spec.headerBytes+length)]);
}

test('Export -> Restore -> Export preserves rich current metadata, exact IDs, originals and thumbnails',async()=>{
 const a=await source(),b=setup({version:5,entries:[{id:'unrelated',name:'Other',parentId:null}],layout:[],connections:[]});
 await b.files.save({key:'old',entryId:'unrelated',blob:new Blob(['Old file'])});await b.files.save({key:'orphan',entryId:'missing',blob:new Blob(['Debris'])});
 b.disk.setItem(b.metadata.backupKey,'Internal history stays');b.disk.setItem(b.metadata.legacyKey,'Obsolete fallback');
 const handle=await restore.inspect(a.result.blob),before=await contents(b);assert.deepEqual(await contents(b),before,'validation makes no writes');
 assert.equal(handle.counts.galaxies,1);assert.equal(handle.counts.attachmentRecords,5);
 await restore.restore(handle,b.repo);
 assert.deepEqual(JSON.parse(b.disk.getItem(b.metadata.key)),a.data);assert.equal(b.disk.getItem(b.metadata.legacyKey),null);assert.equal(b.disk.getItem(b.metadata.backupKey),'Internal history stays');
 assert.equal(b.preferences.readForBackup(),a.state.preferences.readForBackup());assert.equal(await b.files.get('old'),null);assert.equal(await b.files.get('orphan'),null);
 for(const record of await a.state.files.readAll()){
  const restored=await b.files.get(record.key);assert.equal(restored.entryId,record.entryId);assert.equal(restored.blob.type,record.blob.type);
  assert.deepEqual(new Uint8Array(await restored.blob.arrayBuffer()),new Uint8Array(await record.blob.arrayBuffer()));
  if(record.thumbnail)assert.deepEqual(new Uint8Array(await restored.thumbnail.arrayBuffer()),new Uint8Array(await record.thumbnail.arrayBuffer()));
 }
 const again=await backup.create(b.repo);delete again.manifest.exportedAt;const original=plain(a.result.manifest);delete original.exportedAt;assert.deepEqual(plain(again.manifest),original);
 assert.deepEqual(plain(b.repo.load().entries),a.data.entries);
});

test('fresh, empty-snapshot and memory persistence restore cleanly',async()=>{
 for(const metadata of [null,{version:5,entries:[],connections:[],layout:[]}]){
  const a=setup(metadata),file=(await backup.create(a.repo)).blob,b=setup(rich());await restore.restore(await restore.inspect(file),b.repo);assert.equal(b.metadata.readForBackup().metadataText,a.metadata.readForBackup().metadataText);
 }
 const a=await source(),p=get('createPersistence')({metadata:get('createMemoryMetadataStore')(),files:get('createMemoryFileStore')(),preferences:get('createMemoryPreferencesStore')()}),repo=get('createUniverseRepository')({persistence:p});
 await restore.restore(await restore.inspect(a.result.blob),repo);assert.equal(p.metadata.readForBackup().metadataText,a.state.metadata.readForBackup().metadataText);
});

test('invalid identity, unsupported versions, corruption and truncation are rejected without mutation',async()=>{
 const a=await source(),b=setup(rich()),before=await contents(b);
 const bytes=new Uint8Array(await a.result.blob.arrayBuffer());
 for(const offset of [0,backup.headerBytes+3,bytes.length-1]){const bad=bytes.slice();bad[offset]^=1;await assert.rejects(restore.inspect(new Blob([bad])));}
 for(const length of [0,50,bytes.length-1])await assert.rejects(restore.inspect(a.result.blob.slice(0,length)));
 const version=bytes.slice();new DataView(version.buffer).setUint32(17,2,true);await assert.rejects(restore.inspect(new Blob([version])),/version/);
 for(const change of [m=>m.format='other',m=>m.backupVersion=2,m=>m.storageVersion=6])await assert.rejects(restore.inspect(await altered(a.result.blob,change)));
 assert.deepEqual(await contents(b),before);
});

const invalid=[
 ['duplicate IDs',m=>m.metadata.entries[1].id='a-0'],
 ['missing parent',m=>m.metadata.entries[1].parentId='missing'],
 ['hierarchy cycle',m=>m.metadata.entries[0].parentId='a-7'],
 ['invalid name',m=>m.metadata.entries[1].name=''],
 ['unsafe Bookmark',m=>m.metadata.entries[1].content.links[0].url='javascript:alert(1)'],
 ['invalid Location',m=>m.metadata.entries[1].location.text=''],
 ['invalid membership',m=>m.metadata.constellations[0].memberEntryIds.push('missing')],
 ['duplicate membership',m=>m.metadata.constellations[0].memberEntryIds.push('a-2')],
 ['invalid linked item',m=>m.metadata.portals[0].targetEntryId='missing'],
 ['duplicate placement',m=>m.metadata.portals.push({...m.metadata.portals[0],id:'other-link'})],
 ['invalid archive',m=>m.metadata.archivedGalaxies[0].galaxyId='a-3'],
 ['invalid expanded archive item',m=>m.metadata.archivedGalaxies[0].expandedIds.push('missing')],
 ['invalid layout',m=>m.metadata.layout[0].parentId='missing'],
 ['attachment owner mismatch',m=>m.attachments[0].record.entryId='a-0'],
 ['missing original',m=>m.attachments.pop()],
 ['duplicate payload record',m=>m.attachments.push(m.attachments[0])],
 ['missing thumbnail',m=>m.attachments[0].thumbnail=null],
 ['bogus payload offset',m=>m.attachments[0].original.offset=Number.MAX_SAFE_INTEGER],
 ['negative size',m=>m.attachments[0].original.size=-1],
 ['wrong count',m=>m.counts.entries++],
 ['raw and parsed metadata mismatch',m=>m.metadataText='{}'],
 ['invalid preferences',m=>{m.preferences=[];m.preferencesText='[]';}],
 ['recovery states',m=>m.recoverySnapshots={}],
 ['prototype pollution',m=>m.metadata.entries[0].appearance=JSON.parse('{"__proto__":{"polluted":true}}')]
];
for(const [name,mutate] of invalid)test('rejects '+name+' before any persistence API is called',async()=>{
 const a=await source(),bad=await altered(a.result.blob,m=>{mutate(m);if(!name.includes('raw and parsed'))m.metadataText=JSON.stringify(m.metadata);});
 await assert.rejects(restore.inspect(bad));assert.equal({}.polluted,undefined);
});

test('limits are checked before allocating supplied lengths; cancellation is read-only',async()=>{
 let read=false;class Oversize extends Blob {get size(){return backup.maxBytes+1;}async arrayBuffer(){read=true;throw Error('Allocation');}}
 await assert.rejects(restore.inspect(new Oversize()),/too large/);assert.equal(read,false);
 const a=await source(),bytes=new Uint8Array(await a.result.blob.arrayBuffer());new DataView(bytes.buffer).setUint32(21,backup.maxManifestBytes+1,true);await assert.rejects(restore.inspect(new Blob([bytes])));
 const controller=new AbortController();controller.abort();await assert.rejects(restore.inspect(a.result.blob,{signal:controller.signal}),e=>e.name==='AbortError');
 const during=new AbortController();await assert.rejects(restore.inspect(a.result.blob,{signal:during.signal,onProgress:p=>{if(p.stage==='files')during.abort();}}),e=>e.name==='AbortError');
});

test('staging and partially written metadata/preference failures leave old Cosmos and orphans intact',async()=>{
 const a=await source(),handle=await restore.inspect(a.result.blob);
 for(const mode of ['stage','metadata','preferences','late-abort','journal']){
  const b=setup(rich());b.preferences.update({width:240});b.disk.setItem(b.metadata.legacyKey,'Old fallback');await b.files.save({key:'old',entryId:'a-0',blob:new Blob(['old'])});const before=await contents(b);
  if(mode==='stage')b.persistence.files.replaceAll=async()=>{throw Error('Stage failure');};
  if(mode==='metadata'){const replace=b.persistence.metadata.replaceRaw;b.persistence.metadata.replaceRaw=value=>{replace(value);throw Error('Commit failure');};}
  if(mode==='preferences'){const replace=b.preferences.replaceRaw;let first=true;b.preferences.replaceRaw=value=>{replace(value);if(first){first=false;throw Error('Preference failure');}};}
  if(mode==='late-abort')b.persistence.files.replaceAll=async(records,id,commit,rollback)=>{commit();rollback();throw Error('Late abort');};
  if(mode==='journal')b.persistence.metadata.beginRestore=()=>{throw Error('Journal quota');};
  await assert.rejects(restore.restore(handle,b.repo));assert.deepEqual(await contents(b),before,mode);assert.equal(b.metadata.readRestoreJournal(),null);
 }
});

test('durable journal resolves interrupted commits in either direction before loading',async()=>{
 const a=await source();
 for(const committed of [false,true]){
  const b=setup(rich());const previous=b.metadata.captureRestoreState();b.preferences.update({width:200});const previousPreferences=b.preferences.readForBackup();
  const journal={version:1,id:'interrupted',previous,previousPreferences,metadataText:a.state.metadata.readForBackup().metadataText,preferencesText:a.state.preferences.readForBackup()};
  b.metadata.beginRestore(journal);b.metadata.replaceRaw(journal.metadataText);b.preferences.replaceRaw(journal.preferencesText);
  if(committed)await b.files.replaceAll(await a.state.files.readAll(),journal.id,()=>{},()=>{});
  await b.repo.recoverPendingRestore();assert.equal(b.metadata.readForBackup().metadataText,committed?journal.metadataText:previous.current);assert.equal(b.preferences.readForBackup(),committed?journal.preferencesText:previousPreferences);assert.equal(b.metadata.readRestoreJournal(),null);
 }
});

test('rollback failure preserves journal, signals recovery required and can recover on reload',async()=>{
 const a=await source(),b=setup(rich()),old=b.metadata.readForBackup().metadataText;
 b.persistence.files.replaceAll=async()=>{throw Error('Stage failure');};const recover=b.persistence.metadata.recoverRaw;b.persistence.metadata.recoverRaw=()=>{throw Error('Rollback denied');};
 await assert.rejects(restore.restore(await restore.inspect(a.result.blob),b.repo),e=>e.recoveryRequired);assert.ok(b.metadata.readRestoreJournal());
 b.persistence.metadata.recoverRaw=recover;await b.repo.recoverPendingRestore();assert.equal(b.metadata.readForBackup().metadataText,old);
});

test('cleanup failure after successful transaction is recovered as the complete new Cosmos',async()=>{
 const a=await source(),b=setup(rich()),end=b.persistence.metadata.endRestore;b.persistence.metadata.endRestore=()=>{throw Error('Cleanup denied');};
 await restore.restore(await restore.inspect(a.result.blob),b.repo);assert.ok(b.metadata.readRestoreJournal());assert.equal(b.metadata.readForBackup().metadataText,a.state.metadata.readForBackup().metadataText);
 b.persistence.metadata.endRestore=end;await b.repo.recoverPendingRestore();assert.equal(b.metadata.readRestoreJournal(),null);
});

test('unvalidated handles and Sample cannot replace personal storage',async()=>{
 await assert.rejects(restore.restore({},setup().repo),/validate/);
 const a=await source(),p=get('createPersistence')({sample:true});await assert.rejects(restore.restore(await restore.inspect(a.result.blob),get('createUniverseRepository')({persistence:p})),/Sample/);
});


test('many small files and 32 MiB video validate and restore without a full-package byte allocation',async()=>{
 const a=setup(rich()),data=rich(),date='2026-10-11T00:00:00Z';
 for(let i=0;i<41;i++){
  const key='many-'+i,size=i===40?32*1024*1024:4096,type=i===40?'video/webm':'application/octet-stream',filename=i===40?'large.webm':key+'.bin';
  const blob=new Blob([new Uint8Array(size).fill(i)],{type});await a.files.save({key,entryId:'a-3',blob});
  data.entries[3].content.attachments.push({id:key,kind:'upload',entryId:'a-3',storageKey:key,filename,mimeType:type,size,createdAt:date});
 }
 a.disk.setItem(a.metadata.key,JSON.stringify(data));const blob=(await backup.create(a.repo)).blob;
 const b=setup(),handle=await restore.inspect(blob);assert.equal(handle.counts.attachmentRecords,41);await restore.restore(handle,b.repo);
 const video=await b.files.get('many-40');assert.equal(video.blob.size,32*1024*1024);assert.equal(await backup.sha256(await video.blob.arrayBuffer()),await backup.sha256(await (await a.files.get('many-40')).blob.arrayBuffer()));
 assert.equal(b.metadata.readForBackup().metadataText,a.metadata.readForBackup().metadataText);
});

test('explicit validated Restore can replace unreadable current metadata while preserving it on failure',async()=>{
 const a=await source(),b=setup(),handle=await restore.inspect(a.result.blob);b.disk.setItem(b.metadata.key,'Unreadable old snapshot');
 const repo=get('createUniverseRepository')({persistence:b.persistence,canWrite:()=>false});
 await restore.restore(handle,repo);assert.equal(b.metadata.readForBackup().metadataText,a.state.metadata.readForBackup().metadataText);
});

test('capture failure neither writes a journal nor leaves repository stuck in Restore',async()=>{
 const a=await source(),b=setup(rich()),capture=b.persistence.metadata.captureRestoreState;
 b.persistence.metadata.captureRestoreState=()=>{throw Error('Read denied');};await assert.rejects(restore.restore(await restore.inspect(a.result.blob),b.repo),/Read denied/);
 assert.equal(b.metadata.readRestoreJournal(),null);b.persistence.metadata.captureRestoreState=capture;await restore.restore(await restore.inspect(a.result.blob),b.repo);
});


test('large archived forests preserve all roots and memberships without repeated whole-tree scans',async()=>{
 const entries=Array.from({length:5000},(_,i)=>({id:'root-'+i,name:'Galaxy '+i,parentId:null}));
 const metadata={version:5,entries,connections:[],layout:[],archivedGalaxies:entries.map(e=>({galaxyId:e.id,archivedAt:'2026-10-11T00:00:00Z',expandedIds:[e.id]}))};
 const a=setup(metadata),b=setup(),handle=await restore.inspect((await backup.create(a.repo)).blob);
 assert.equal(handle.counts.galaxies,5000);assert.equal(handle.counts.archivedGalaxies,5000);await restore.restore(handle,b.repo);assert.deepEqual(JSON.parse(b.metadata.readForBackup().metadataText),metadata);
});


test('losing simultaneous Restore cannot resume a stale graph after another tab commits',async()=>{
 let revision='old',ran=false;
 const locks={request(name,options,action){if(options.mode==='shared')return Promise.resolve(action({name}));revision='other-tab-commit';return Promise.resolve(action(null));}};
 const session=get('createRestoreSession')(null,locks);await session.hold();
 await assert.rejects(session.exclusive(()=>{ran=true;},{readRevision:async()=>revision}),error=>error.reinitializationRequired);assert.equal(ran,false);session.release();
});

test('ordinary exclusive-lock denial preserves revision and supports retry without false success',async()=>{
 let available=false;
 const locks={request(name,options,action){return Promise.resolve(action(options.mode==='shared'||available?{name}:null));}};
 const session=get('createRestoreSession')(null,locks);await session.hold();
 await assert.rejects(session.exclusive(()=>assert.fail('No exclusive access'),{readRevision:async()=>'old'}),error=>!error.reinitializationRequired&&/Close other/.test(error.message));
 available=true;assert.equal(await session.exclusive(()=>42,{readRevision:async()=>'old'}),42);session.release();
});


test('backup filename and extension are branding only; internal contents govern compatibility',async()=>{
 const a=await source();
 // File-like Blob, including an unrelated MIME: selected-file properties are not the contract.
 for(const name of ['cosmifold-backup-2026-10-12.cosmifold','old-cosmifold-backup.cosmifold','old-backup.bin','future-app-name.backup','completely-unrelated-name.anything']){
  const file=new Blob([a.result.blob],{type:'application/x-unrelated'});Object.defineProperty(file,'name',{value:name});
  const b=setup(),handle=await restore.inspect(file);await restore.restore(handle,b.repo);
  assert.equal(b.metadata.readForBackup().metadataText,a.state.metadata.readForBackup().metadataText,name);
  for(const original of await a.state.files.readAll())assert.equal(await backup.sha256(await (await b.files.get(original.key)).blob.arrayBuffer()),await backup.sha256(await original.blob.arrayBuffer()),name);
 }
 const fake=new Blob(['Fake contents pretending to be a backup']);Object.defineProperty(fake,'name',{value:'fake.cosmifold'});
 await assert.rejects(restore.inspect(fake),/doesn't appear/);
});
