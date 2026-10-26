const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const locks=require('./local-write-fixture').createLockManager();
const ctx=vm.createContext({URL,Blob,structuredClone,crypto:webcrypto,TextEncoder,TextDecoder,DOMException,setTimeout,navigator:{locks}});
for(const file of ['model.js','ids.js','config.js','task-lists.js','portals.js','constellations.js','archives.js','clipboard.js','persistence/local-metadata-store.js','persistence/local-preferences-store.js','persistence/memory-stores.js','persistence/composition.js','services/universe-repository.js','services/local-backup.js','services/local-restore.js','services/local-restore-session.js','services/cloud-repository-contract.js','services/cloud-metadata-projection.js','services/cloud-metadata-changes.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const get=name=>vm.runInContext(name,ctx),model=get('galaxyModel'),time=model.temporal,projection=get('cosmifoldCloudProjection');
const plain=value=>JSON.parse(JSON.stringify(value));
const when=(startDate='2026-11-12',endDate=null,time=null)=>({startDate,endDate,time});
const due=(date='2026-10-29',time=null)=>({date,time});
const entry=(id,parentId=null,rest={})=>({id,name:id,parentId,description:'',category:'',x:400,y:350,...rest});
function fixture(){return {version:5,connections:[],entries:[entry('g',null,{when:when()}),entry('item','g',{when:when('2026-11-12','2026-11-25')}),entry('destination','g'),entry('list','g',{taskList:true}),entry('task','list',{completed:false,due:due('2026-10-29','23:59')}),entry('list2','g',{taskList:true})],layout:[],portals:[],constellations:[],archivedGalaxies:[]};}
function setup(data=fixture(),disk){
 const values=new Map();disk=disk||{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const metadata=get('createLocalMetadataStore')({storage:()=>disk});
 if(data)disk.setItem(metadata.key,JSON.stringify(data));
 const preferences=get('createLocalPreferencesStore')({storage:()=>disk}),files=get('createMemoryFileStore')();
 const persistence=get('createPersistence')({metadata,preferences,files});
 const repo=get('createUniverseRepository')({persistence});return {disk,metadata,repo,persistence,files};
}
const scope={ownerUserId:'00000000-0000-4000-8000-000000000001',universeId:'00000000-0000-4000-8000-000000000002',revision:'0'};
function assertValid(kind,value){const data=fixture();data.entries[kind==='when'?1:4][kind]=value;assert.ok(time.valid(kind,value));assert.doesNotThrow(()=>model.validateStoredSnapshot(data));assert.deepEqual(plain(model.normalizeEntry(data.entries[kind==='when'?1:4]))[kind],value);const rows=projection.toRelational(data,scope);assert.deepEqual(plain(projection.toStorageV5(rows.metadata,rows.presentation)),data);}
for(const [label,value] of [['null',null],['date',when()],['date/time',when('2026-10-28',null,'14:30')],['range',when('2026-11-12','2026-11-25')],['same-day range',when('2026-11-12','2026-11-12')],['leap century',when('2000-02-29')],['leap year',when('2028-02-29')],['earliest',when('0001-01-01')],['latest',when('9999-12-31')]])test('canonical When accepts '+label,()=>assertValid('when',value));
for(const [label,value] of [['null',null],['date',due()],['midnight',due('2026-10-29','00:00')],['date/time',due('2026-10-29','23:59')],['leap year',due('2028-02-29')]])test('canonical Due accepts '+label,()=>assertValid('due',value));
const invalidDates=['2026-02-29','1900-02-29','2026-04-31','2026-00-01','2026-13-01','2026-01-00','2026-01-32','0000-01-01','10000-01-01','2026-1-01','26-01-01',' 2026-01-01','2026-01-01T00:00:00Z',123,null];
const invalidTimes=['24:00','23:60','-1:00','2:30','14:30:00','14:30Z',' 14:30',123,{},undefined];
const invalidWhen=[...invalidDates.map(d=>when(d)),...invalidDates.filter(d=>d!==null).map(d=>when('2026-01-01',d)),...invalidTimes.map(t=>({...when(),time:t})),when('2026-11-25','2026-11-12'),when('2026-11-12','2026-11-25','14:30'),{},[],false,'2026-10-29',{startDate:'2026-10-29'}, {...when(),extra:true}];
const invalidDue=[...invalidDates.map(d=>due(d)),...invalidTimes.map(t=>({...due(),time:t})),{},[],false,'2026-10-29',{date:'2026-10-29'}, {...due(),extra:true}];
for(const [kind,values] of [['when',invalidWhen],['due',invalidDue]])test('invalid '+kind+' is rejected consistently by load, edits and cloud without mutation',()=>{
 for(const value of values){
  const data=fixture(),index=kind==='when'?1:4;data.entries[index][kind]=value;const before=JSON.stringify(data);
  assert.equal(time.valid(kind,value),false,JSON.stringify(value));assert.equal(model.normalizeEntry(data.entries[index]),null);
  assert.throws(()=>model.validateStoredSnapshot(data),/Invalid saved data/);
  assert.ok(model.validateChange(data.entries[index],new Map(data.entries.map(e=>[e.id,e]))));
  assert.throws(()=>projection.toRelational(data,scope),e=>e.code==='INVALID_METADATA');assert.equal(JSON.stringify(data),before);
 }
});
test('missing optional values stay absent; explicit null is accepted; Task Lists cannot own dates',()=>{
 for(const e of fixture().entries){delete e.when;delete e.due;assert.ok(model.normalizeEntry(e));assert.equal(Object.hasOwn(model.normalizeEntry(e),'when'),false);assert.equal(Object.hasOwn(model.normalizeEntry(e),'due'),false);}
 for(const kind of ['when','due']){const data=fixture();data.entries[3][kind]=kind==='when'?when():due();assert.throws(()=>model.validateStoredSnapshot(data));assert.throws(()=>projection.toRelational(data,scope));}
});
test('friendly formatting preserves calendar days and clocks across DST and timezones',()=>{
 const previous=process.env.TZ;
 try{for(const tz of ['America/Vancouver','Pacific/Auckland','Asia/Tokyo','UTC']){process.env.TZ=tz;
  assert.match(time.format('when',when('2026-10-28'), 'en-US'),/Oct 28, 2026/);
  assert.match(time.format('when',when('2026-03-08',null,'02:30'),'en-US'),/Mar 8, 2026.*2:30.*AM/);
  assert.match(time.format('due',due('2026-10-29','23:59'),'en-US'),/Oct 29, 2026.*11:59.*PM/);
  const range=time.format('when',when('2026-11-12','2026-11-25'),'en-US');assert.match(range,/Nov/);assert.match(range,/12/);assert.match(range,/25/);
 }}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
for(const kind of ['when','due'])test(kind+' saves, reloads, removes via coordinated repository; snapshots retain null and exact strings',async()=>{
 const state=setup(),id=kind==='when'?'item':'task',value=kind==='when'?when('2028-02-29',null,'02:30'):due('2028-02-29','00:00');
 state.repo.load();let emitted=0;state.repo.subscribe(()=>emitted++);
 await state.repo.updateTime(()=>state.repo.load(),id,kind,value);
 const loaded=setup(null,state.disk).repo.load();assert.deepEqual(plain(loaded.entries.find(e=>e.id===id)[kind]),value);assert.equal(emitted,1);
 const snapshot=state.repo.snapshot({entries:new Map(loaded.entries.map(e=>[e.id,e])),portals:new Map(),constellations:new Map(),layout:new Map(),archivedGalaxies:new Map()});
 assert.deepEqual(plain(snapshot.entries.find(e=>e.id===id)[kind]),value);
 await state.repo.updateTime(()=>state.repo.load(),id,kind,null);assert.equal(Object.hasOwn(state.repo.load().entries.find(e=>e.id===id),kind),false);
});
test('invalid and role-inappropriate edits and failed persistence never publish changes',async()=>{
 const state=setup(),before=JSON.stringify(state.repo.load());let events=0;state.repo.subscribe(()=>events++);
 for(const args of [['item','when',when('2026-02-29')],['list','when',when()],['task','when',when()],['item','due',due()],['missing','when',when()]])await assert.rejects(()=>state.repo.updateTime(()=>state.repo.load(),...args));
 assert.equal(JSON.stringify(state.repo.load()),before);assert.equal(events,0);
 state.persistence.metadata.commit=async()=>{throw new Error('Quota failure');};
 await assert.rejects(()=>state.repo.updateTime(()=>state.repo.load(),'item','when',when()),/Quota/);assert.equal(JSON.stringify(state.repo.load()),before);assert.equal(events,0);
});
test('Move keeps When, Task reorganization keeps Due, role-changing moves retain dormant metadata',async()=>{
 const state=setup(),source=state.repo.load(),item=plain(source.entries[1].when),task=plain(source.entries[4].due);
 await state.repo.moveEntries(()=>state.repo.load(),['item'],'destination');assert.deepEqual(plain(state.repo.load().entries.find(e=>e.id==='item').when),item);
 await state.repo.moveEntries(()=>state.repo.load(),['task'],'list2');assert.deepEqual(plain(state.repo.load().entries.find(e=>e.id==='task').due),task);
 await state.repo.moveEntries(()=>state.repo.load(),['item'],'list');assert.deepEqual(plain(state.repo.load().entries.find(e=>e.id==='item').when),item);
 await state.repo.moveEntries(()=>state.repo.load(),['task'],'destination');assert.deepEqual(plain(state.repo.load().entries.find(e=>e.id==='task').due),task);
 model.validateStoredSnapshot({version:5,...state.repo.load()});
});
test('full copies retain independent When/Due; structure copies omit both recursively',()=>{
 const data=fixture(),copies=get('hierarchyCopies');let next=0;
 for(const root of ['g','item','task']){
  const destination=root==='task'?'list2':'destination',plan=copies.plan(data,[root],destination,()=>`full-${next++}`);
  for(const id of plan.sourceIds){const source=data.entries.find(e=>e.id===id),copy=plan.copies.find(e=>e.id===plan.remap.get(id));for(const key of ['when','due'])if(source[key]){assert.deepEqual(plain(copy[key]),source[key]);assert.notEqual(copy[key],source[key]);}}
 }
 for(const root of ['g','item','list','task']){
  const plan=copies.structure(data,root,'Template',()=>`structure-${next++}`);
  assert.ok(plan.copies.every(e=>!Object.hasOwn(e,'when')&&!Object.hasOwn(e,'due')));
 }
});
test('archive/unarchive and normal/deep search retain exact canonical dates',async()=>{
 const state=setup(),before=plain(state.repo.load().entries);
 await state.repo.archive(()=>state.repo.load(),{galaxyId:'g',archivedAt:'2026-10-25T00:00:00Z'});assert.deepEqual(plain(state.repo.load().entries),before);
 await state.repo.restore(()=>state.repo.load(),'g');assert.deepEqual(plain(state.repo.load().entries),before);
 assert.deepEqual(plain(model.search(new Map(before.map(e=>[e.id,e])),'task')).map(e=>e.id),['task']);
});
test('repository full copy and structure commits retain the temporal operation contract',async()=>{
 const state=setup();let next=0;
 for(const [id,target,key] of [['item','destination','when'],['task','list2','due']]){
  const snapshot=state.repo.load(),original=plain(snapshot.entries.find(e=>e.id===id)[key]);
  const copy=await state.repo.copyEntries(snapshot,[id],target,()=>`persisted-copy-${next++}`);
  assert.deepEqual(plain(state.repo.load().entries.find(e=>e.id===copy.rootIds[0])[key]),original);
  const structure=await state.repo.duplicateStructure(()=>state.repo.load(),id,'Template',()=>`persisted-template-${next++}`);
  assert.ok(state.repo.load().entries.filter(e=>structure.copies.some(c=>c.id===e.id)).every(e=>!Object.hasOwn(e,'when')&&!Object.hasOwn(e,'due')));
 }
});
test('Backup -> Restore -> Backup keeps date-only, timed, range and Due exactly in existing format',async()=>{
 const data=fixture();data.entries.push(entry('timed','g',{when:when('2026-10-28',null,'14:30')}),entry('date-task','list',{due:due()}));
 const source=setup(data),target=setup({version:5,entries:[],connections:[],layout:[]}),backup=get('cosmifoldBackup'),restore=get('cosmifoldRestore');
 const exported=await backup.create(source.repo),handle=await restore.inspect(exported.blob);await restore.restore(handle,target.repo);
 assert.deepEqual(JSON.parse(target.disk.getItem(target.metadata.key)),data);
 const reexport=await backup.create(target.repo),second=setup(null);await restore.restore(await restore.inspect(reexport.blob),second.repo);assert.deepEqual(JSON.parse(second.disk.getItem(second.metadata.key)),data);
});
test('corrupt temporal data activates preservation guard; original text and bytes remain untouched',async()=>{
 const data=fixture();data.entries[1].when=when('2026-02-29');const state=setup(data),raw=state.disk.getItem(state.metadata.key);
 await state.files.save({key:'original',entryId:'item',blob:new Blob(['Keep original'])});
 assert.throws(()=>state.repo.load(),e=>e.code==='LOCAL_DATA_STRUCTURE');
 await assert.rejects(()=>state.repo.recoverAttachmentOperations());
 await assert.rejects(()=>state.repo.updateTime(()=>state.repo.load(),'item','when',when()));
 assert.equal(state.disk.getItem(state.metadata.key),raw);assert.equal(await (await state.files.get('original')).blob.text(),'Keep original');
 assert.throws(()=>state.metadata.save(fixture()));assert.equal(state.disk.getItem(state.metadata.key),raw);
});
test('Restore rejects correctly hashed backups with corrupt When or Due before any replacement',async()=>{
 const source=setup(),target=setup(),backup=get('cosmifoldBackup'),restore=get('cosmifoldRestore');
 const exported=(await backup.create(source.repo)).blob,before=target.disk.getItem(target.metadata.key);
 for(const [id,key,value] of [['item','when',when('2026-02-29')],['task','due',due('2026-10-29','24:00')]]){
  const header=new Uint8Array(await exported.slice(0,backup.headerBytes).arrayBuffer()),view=new DataView(header.buffer),magic=new TextEncoder().encode(backup.magic).length,length=view.getUint32(magic+4,true);
  const manifest=JSON.parse(await exported.slice(backup.headerBytes,backup.headerBytes+length).text());
  manifest.metadata.entries.find(e=>e.id===id)[key]=value;manifest.metadataText=JSON.stringify(manifest.metadata);
  const json=new TextEncoder().encode(JSON.stringify(manifest));view.setUint32(magic+4,json.length,true);header.set(new Uint8Array(await webcrypto.subtle.digest('SHA-256',json)),magic+8);
  const corrupt=new Blob([header,json,exported.slice(backup.headerBytes+length)]);
  await assert.rejects(()=>restore.inspect(corrupt));assert.equal(target.disk.getItem(target.metadata.key),before);
 }
});
test('cross-tab acknowledged reload preserves dates; stale time edits cannot overwrite newer dates',async()=>{
 const a=setup(),b=setup(null,a.disk);a.repo.load();b.repo.load();
 await a.repo.updateTime(()=>a.repo.load(),'item','when',when('2026-12-25'));
 const after=a.disk.getItem(a.metadata.key);
 await assert.rejects(()=>b.repo.updateTime(()=>b.repo.load(),'task','due',due('2026-12-26')),e=>e.code==='LOCAL_SNAPSHOT_STALE');
 assert.equal(a.disk.getItem(a.metadata.key),after);
 const refreshed=setup(null,a.disk);refreshed.repo.load();await refreshed.repo.updateTime(()=>refreshed.repo.load(),'task','due',due('2026-12-26'));
 assert.deepEqual(plain(refreshed.repo.load().entries.find(e=>e.id==='item').when),when('2026-12-25'));
});
test('cloud metadata patches round-trip both fields without new commands, tables or receipts',()=>{
 const before=fixture(),after=structuredClone(before);after.entries[1].when=when('2026-12-01',null,'14:30');after.entries[4].due=due('2026-12-02','23:59');
 const a=projection.toRelational(before,scope),b=projection.toRelational(after,scope),changes=get('cosmifoldCloudChanges').between(a.metadata,b.metadata);
 assert.equal(changes.upsert.entries.length,2);assert.deepEqual(plain(projection.toStorageV5(b.metadata,b.presentation)),after);
 assert.equal(get('cosmifoldCloudContract').commandTypes.includes('content.changed'),true);
});
test('cloud time edits reuse acknowledgement, queue and stale-revision fences without speculative publication',async()=>{
 const {setup:cloud,fixture,deferred}=require('./fake-cloud-gateway');
 const data=fixture();data.entries.push(entry('time-list','g:text',{taskList:true}),entry('time-task','time-list',{completed:false}));
 const s=cloud(data),gate=deferred(),started=deferred();await s.repo.open();
 const captured=s.repo.load(),commit=s.gateway.commitMetadata;
 s.gateway.commitMetadata=async command=>{started.resolve();await gate.promise;return commit(command);};
 const a=s.repo.updateTime(()=>s.repo.load(),'tokyo','when',when());await started.promise;
 assert.equal(s.repo.load().entries.find(e=>e.id==='tokyo').when,undefined);
 const b=s.repo.updateTime(()=>s.repo.load(),'time-task','due',due());
 const stale=s.repo.updateTime(captured,'tokyo','when',when('2027-01-01'));stale.catch(()=>{});
 gate.resolve();await Promise.all([a,b]);await assert.rejects(stale,e=>e.code==='REVISION_CONFLICT');
 assert.deepEqual(plain(s.repo.load().entries.find(e=>e.id==='tokyo').when),when());assert.deepEqual(plain(s.repo.load().entries.find(e=>e.id==='time-task').due),due());
 assert.deepEqual(s.calls.filter(c=>c.method==='commit').map(c=>c.command.baseRevision),['0','1']);
 assert.ok(s.calls.filter(c=>c.method==='commit').every(c=>c.command.type==='content.changed'));
});
test('uncertain cloud time commit reconciles by its existing receipt and preserves exact time',async()=>{
 const {setup:cloud,failure}=require('./fake-cloud-gateway');const s=cloud();await s.repo.open();
 s.gateway.commitMetadata=async command=>{s.calls.push({method:'commit',command:plain(command)});throw failure('OUTCOME_UNKNOWN','unknown');};
 const value=when('2026-10-28',null,'14:30');
 await assert.rejects(()=>s.repo.updateTime(()=>s.repo.load(),'tokyo','when',value),e=>e.outcome==='unknown');
 assert.equal(s.repo.load().entries.find(e=>e.id==='tokyo').when,undefined);
 s.apply(s.repo.pendingCommand());
 await s.repo.reconcile();assert.deepEqual(plain(s.repo.load().entries.find(e=>e.id==='tokyo').when),value);
 assert.equal(s.calls.filter(c=>c.method==='commit').length,1);
});
