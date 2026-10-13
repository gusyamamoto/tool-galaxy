const {test}=require('node:test'),assert=require('node:assert/strict');
const {A,U,B,scope,plain,fixture,failure,deferred,setup}=require('./fake-cloud-gateway.js');
const {environment,disk,fakeAuth,fakeLocks}=require('./fake-cloud-workspace.js');
const rename=repo=>()=>{const snapshot=repo.load();snapshot.entries[1].name='Changed';return snapshot;};
test('fresh explicit remote bootstrap caches acknowledged semantic v5 under user + Universe only',async()=>{
 const e=environment();e.storage.map.set('galaxy:user-data','KEEP_LOCAL');const outcome=await e.manager.bootstrap(U);
 assert.equal(outcome.status,'loaded');assert.equal(outcome.source,'server');assert.equal(outcome.canMutate,true);assert.deepEqual(plain(e.manager.load()),fixture());
 const record=e.record();assert.equal(record.format,'cosmifold-cloud-cache');assert.equal(record.cacheVersion,1);assert.equal(record.storageVersion,5);assert.equal(record.acknowledged.revision,'0');assert.equal(record.pending,null);
 assert.equal(e.storage.getItem('galaxy:user-data'),'KEEP_LOCAL');assert.ok(e.storage.writes.every(w=>w.key.startsWith('cosmifold:cloud-cache:v1:')));
 assert.equal(e.cache.key(scope),`cosmifold:cloud-cache:v1:${A}:${U}`);
});
test('discovery distinguishes genuinely zero Universes, available Universes, failure and signed-out',async()=>{
 const e=environment();assert.equal((await e.manager.discover()).status,'no-cloud-universe');
 e.setList([{id:U,owner_id:A,revision:'0'}]);assert.equal((await e.manager.discover()).status,'universes-available');
 e.gateway.listOwnedUniverses=async()=>{throw failure('NETWORK_UNAVAILABLE');};assert.equal((await e.manager.discover()).status,'lookup-failed');
 e.auth.emit(null);assert.equal((await e.manager.bootstrap(U)).status,'unauthenticated');assert.equal(e.storage.writes.length,0);assert.equal(e.calls.length,0);
});
test('network failure with cache is explicit read-only degraded; without cache remains unknown',async()=>{
 const e=environment();await e.manager.bootstrap(U);const saved=e.storage.getItem(e.cache.key(scope));
 e.gateway.readUniverse=async()=>{throw failure('NETWORK_UNAVAILABLE');};const next=e.reload();
 const result=await next.bootstrap(U);assert.equal(result.status,'cached-degraded');assert.equal(result.source,'cache');assert.equal(result.canMutate,false);assert.deepEqual(plain(next.load()),fixture());
 await assert.rejects(next.repository().save(rename(next.repository())),error=>error.code==='CACHED_READ_ONLY');assert.equal(e.storage.getItem(e.cache.key(scope)),saved);
 const fresh=environment();fresh.gateway.readUniverse=e.gateway.readUniverse;assert.equal((await fresh.manager.bootstrap(U)).status,'lookup-failed');assert.equal(fresh.storage.writes.length,0);assert.throws(()=>fresh.manager.load());
});
test('refresh replaces acknowledged cache; selected absent is distinct from failed/empty-account',async()=>{
 const e=environment();await e.manager.bootstrap(U);const rows=e.remote();rows.entries[0].name='Server latest';rows.universe.revision='3';e.setRemote(rows);
 const reloaded=e.reload();assert.equal((await reloaded.bootstrap(U)).revision,'3');assert.equal(e.record().acknowledged.snapshot.entries[0].name,'Server latest');
 e.setRemote(null);assert.equal((await reloaded.bootstrap(U)).status,'universe-absent');assert.equal(e.record().acknowledged,null);assert.throws(()=>reloaded.load());
});
test('invalid/incompatible/untrusted cached fields are rejected and preserved without refresh/repair',async()=>{
 for(const mutate of [r=>r.cacheVersion=2,r=>r.pending={pendingVersion:99},r=>r.acknowledged.snapshot.entries[1].parentId='missing',
  r=>r.acknowledged.snapshot.entries[1].content.attachments=[{id:'local-only'}],r=>r.scope.ownerUserId=B,
  r=>r.acknowledged.snapshot.entries[1].x=10,r=>r.writer.generation=0]){
  const e=environment();await e.manager.bootstrap(U);const record=e.record();mutate(record);const text=JSON.stringify(record);e.storage.map.set(e.cache.key(scope),text);const before=e.calls.length;
  const result=await e.reload().bootstrap(U);assert.equal(result.status,'invalid-cache');assert.equal(result.canMutate,false);assert.equal(e.storage.getItem(e.cache.key(scope)),text);assert.equal(e.calls.length,before);
 }
});
test('account B cannot see A cache; A2 cannot see A1 cache even on lookup failure',async()=>{
 const e=environment();await e.manager.bootstrap(U);e.gateway.readUniverse=async()=>{throw failure('NETWORK_UNAVAILABLE');};
 e.auth.emit(B);assert.throws(()=>e.manager.load());const b=await e.manager.bootstrap(U);assert.equal(b.status,'lookup-failed');assert.equal(e.storage.getItem(e.cache.key({ownerUserId:B,universeId:U})),null);
 e.auth.emit(A);const a2=await e.manager.bootstrap(B);assert.equal(a2.status,'lookup-failed');assert.throws(()=>e.manager.load());
 assert.notEqual(e.cache.key(scope),e.cache.key({ownerUserId:A,universeId:B}));assert.notEqual(e.cache.key(scope),e.cache.key({ownerUserId:B,universeId:U}));
});
test('late remote read after account switch or Universe switch has disposed outcome and cannot cache/publish',async()=>{
 for(const accountSwitch of [false,true]){
  const e=environment(),gate=deferred(),started=deferred(),events=[];const read=e.gateway.readUniverse;
  e.gateway.readUniverse=async scope=>{started.resolve();await gate.promise;return read(scope);};e.manager.subscribe(s=>events.push(s));
  const old=e.manager.bootstrap(U);await started.promise;
  if(accountSwitch)e.auth.emit(B);else e.manager.close();gate.resolve();assert.equal((await old).status,'disposed');
  assert.equal(e.storage.writes.length,0);assert.equal(e.manager.getState().status,accountSwitch?'universe-not-selected':'universe-not-selected');
  assert.equal(events.filter(s=>s.status==='loaded').length,0);assert.throws(()=>e.manager.load());
 }
});
test('pending record precedes dispatch and never advances acknowledged revision before reply',async()=>{
 const e=environment(),gate=deferred(),started=deferred();await e.manager.bootstrap(U);const commit=e.gateway.commitMetadata;
 e.gateway.commitMetadata=async command=>{assert.equal(e.record().pending.command.operationId,command.operationId);assert.equal(e.record().acknowledged.revision,'0');started.resolve();await gate.promise;return commit(command);};
 const repo=e.manager.repository(),mutation=repo.save(rename(repo));await started.promise;
 assert.equal(repo.revision(),'0');assert.equal(e.record().acknowledged.revision,'0');assert.ok(e.record().pending);gate.resolve();await mutation;
 assert.equal(e.record().acknowledged.revision,'1');assert.equal(e.record().pending,null);assert.equal(repo.revision(),'1');
});
test('uncertain pending survives reload and missing receipt blocks dependent mutations without changing ID',async()=>{
 const e=environment();await e.manager.bootstrap(U);e.gateway.commitMetadata=async command=>{e.calls.push({method:'commit',command:plain(command)});throw failure('OUTCOME_UNKNOWN','unknown');};
 const repo=e.manager.repository();await assert.rejects(repo.save(rename(repo)));const record=e.record(),id=record.pending.command.operationId;
 e.manager.dispose();const resumed=e.reload(),result=await resumed.bootstrap(U);assert.equal(result.status,'pending-reconciliation');assert.equal(result.pendingOperationId,id);
 assert.equal(e.record().acknowledged.revision,'0');assert.equal(e.record().pending.command.operationId,id);
 await assert.rejects(resumed.repository().updateLocation(()=>resumed.load(),'tokyo',{text:'Blocked'}),error=>error.code==='PENDING_RECONCILIATION_REQUIRED');
 assert.equal(e.calls.filter(c=>c.method==='commit').length,1);assert.ok(e.calls.filter(c=>c.method==='receipt').every(c=>c.id===id));
});
test('reload receipt proves delayed original commit, advances cached revision once and never resends',async()=>{
 const e=environment();await e.manager.bootstrap(U);e.gateway.commitMetadata=async c=>{e.calls.push({method:'commit',command:plain(c)});throw failure('OUTCOME_UNKNOWN','unknown');};
 const repo=e.manager.repository();await assert.rejects(repo.save(rename(repo)));const command=e.record().pending.command;
 e.manager.dispose();e.apply(command);const resumed=e.reload(),result=await resumed.bootstrap(U);
 assert.equal(result.status,'loaded');assert.equal(result.revision,'1');assert.equal(e.record().acknowledged.revision,'1');assert.equal(e.record().pending,null);assert.equal(resumed.load().entries[1].name,'Changed');
 await resumed.reconcile();assert.equal(e.calls.filter(c=>c.method==='commit').length,1);assert.equal(e.record().acknowledged.revision,'1');
});
test('disposal during dispatch leaves recoverable A journal, no late acknowledgement cache or observer update',async()=>{
 const e=environment(),gate=deferred(),started=deferred();await e.manager.bootstrap(U);const commit=e.gateway.commitMetadata;
 e.gateway.commitMetadata=async command=>{started.resolve();await gate.promise;return commit(command);};const repo=e.manager.repository(),events=[];repo.subscribe(e=>events.push(e));
 const mutation=repo.save(rename(repo));await started.promise;const id=e.record().pending.command.operationId;e.auth.emit(B);gate.resolve();await assert.rejects(mutation);
 assert.equal(e.record().pending.command.operationId,id);assert.equal(e.record().acknowledged.revision,'0');assert.equal(events.length,0);assert.equal(repo.getState().status,'disposed');assert.throws(()=>repo.load());
 assert.equal(e.storage.getItem(e.cache.key({ownerUserId:B,universeId:U})),null);assert.throws(()=>e.manager.load());
});
test('cache quota failure before prepare prevents dispatch; after acknowledgement keeps journal for recovery',async()=>{
 const e=environment();await e.manager.bootstrap(U);const put=e.storage.setItem.bind(e.storage);let rejectWrites=true;
 e.storage.setItem=(...args)=>{if(rejectWrites)throw Error('Quota');put(...args);};const repo=e.manager.repository();
 await assert.rejects(repo.save(rename(repo)));assert.equal(e.calls.filter(c=>c.method==='commit').length,0);assert.equal(e.record().pending,null);
 rejectWrites=false;await e.manager.bootstrap(U);const next=e.manager.repository(),commit=e.gateway.commitMetadata;
 e.gateway.commitMetadata=async command=>{const ack=await commit(command);rejectWrites=true;return ack;};
 await assert.rejects(next.save(rename(next)));assert.equal(e.record().acknowledged.revision,'0');assert.ok(e.record().pending);assert.equal(e.remote().universe.revision,'1');
 rejectWrites=false;const resumed=e.reload();assert.equal((await resumed.bootstrap(U)).revision,'1');assert.equal(e.record().pending,null);
});
test('presentation is scoped, separate from semantic revision and retained after refresh',async()=>{
 const e=environment();await e.manager.bootstrap(U);const repo=e.manager.repository(),snapshot=repo.load();snapshot.entries[1].x=8;snapshot.entries[1].y=9;snapshot.layout=[{id:'tokyo',parentId:'g:text',angle:1,radius:30}];
 await repo.saveLayout(snapshot);assert.equal(e.record().acknowledged.revision,'0');assert.equal(e.record().acknowledged.snapshot.entries[1].x,undefined);assert.equal(e.record().presentation.positions[0].x,8);
 const resumed=e.reload();await resumed.bootstrap(U);assert.equal(resumed.repository().presentation().positions[0].x,8);assert.equal(resumed.load().layout.length,0);assert.equal(e.calls.some(c=>c.method==='commit'),false);
});
test('concurrent tabs cannot overwrite a live pending journal; operation queue remains ordered',async()=>{
 const e=environment(),gate=deferred(),started=deferred();await e.manager.bootstrap(U);const commit=e.gateway.commitMetadata;
 e.gateway.commitMetadata=async c=>{started.resolve();await gate.promise;return commit(c);};const repo=e.manager.repository();
 const first=repo.save(rename(repo)),second=repo.updateLocation(()=>repo.load(),'tokyo',{text:'Later'});await started.promise;
 const other=e.reload();assert.equal((await other.bootstrap(U)).status,'pending-reconciliation');const original=e.record().pending.command.operationId;
 assert.equal(e.record().pending.command.operationId,original);gate.resolve();await Promise.all([first,second]);assert.equal(e.record().acknowledged.revision,'2');
});
test('unavailable Web Locks permits explicit remote read-only state, never unjournaled writes',async()=>{
 const e=environment({locks:{}});const state=await e.manager.bootstrap(U);assert.equal(state.status,'loaded');assert.equal(state.canMutate,false);assert.equal(e.storage.writes.length,0);
 await assert.rejects(e.manager.repository().save(rename(e.manager.repository())));assert.equal(e.calls.some(c=>c.method==='commit'),false);
});
test('read timeout is bounded and late successful response cannot replace cache or seed state',async()=>{
 const e=environment({timeout:15}),gate=deferred();e.gateway.readUniverse=async()=>{await gate.promise;return {status:'found',metadata:e.remote()};};
 assert.equal((await e.manager.bootstrap(U)).status,'lookup-failed');gate.resolve();await new Promise(r=>setTimeout(r,5));assert.equal(e.storage.writes.length,0);assert.throws(()=>e.manager.load());
});
test('module registration stays inactive; bootstrap has no starter creation, local Cosmos fallback or file APIs',()=>{
 const fs=require('node:fs'),index=fs.readFileSync('index.html','utf8');assert.equal(index.includes('cloud-workspace.js'),false);assert.equal(index.includes('cloud-cache-store.js'),false);
 const source=fs.readFileSync('services/cloud-workspace.js','utf8');assert.equal(/initializeGalaxy|createUniverse\(|indexedDB|galaxy:user-data/.test(source),false);
});
test('real A1->A2 and A->B selections ignore old response without touching either new namespace',async()=>{
 for(const changeAccount of [false,true]){
  const e=environment(),gate=deferred(),started=deferred(),initial=e.remote();
  e.gateway.readUniverse=async identity=>{
   if(identity.universeId===U){started.resolve();await gate.promise;return {status:'found',metadata:initial};}
   const next=plain(initial);next.universe.id=B;next.universe.owner_id=changeAccount?B:A;next.entries[0].name='New context';
   for(const relation of ['entries','constellations','constellation_members','linked_placements'])next[relation].forEach(row=>row.universe_id=B);
   return {status:'found',metadata:next};
  };
  const old=e.manager.bootstrap(U);await started.promise;if(changeAccount)e.auth.emit(B);
  assert.equal((await e.manager.bootstrap(B)).status,'loaded');gate.resolve();assert.equal((await old).status,'disposed');
  assert.equal(e.manager.load().entries[0].name,'New context');assert.equal(e.storage.getItem(e.cache.key(scope)),null);
  assert.equal(e.record({ownerUserId:changeAccount?B:A,universeId:B}).acknowledged.snapshot.entries[0].name,'New context');
 }
});
test('repeated write attempts cannot enable editing after cache-read-only bootstrap',async()=>{
 const e=environment();e.storage.setItem=()=>{throw Error('Quota');};await e.manager.bootstrap(U);assert.equal(e.manager.getState().canMutate,false);
 const repo=e.manager.repository();for(let i=0;i<2;i++)await assert.rejects(repo.save(rename(repo)));
 assert.equal(e.manager.getState().canMutate,false);assert.equal(e.calls.some(c=>c.method==='commit'),false);
});
test('pending corruption never disappears merely because acknowledged snapshot is valid',async()=>{
 const e=environment();await e.manager.bootstrap(U);e.gateway.commitMetadata=async()=>{throw failure('OUTCOME_UNKNOWN','unknown');};
 const repo=e.manager.repository();await assert.rejects(repo.save(rename(repo)));const value=e.record();value.pending.command.operationId=U;value.pending.command.payload={};
 const raw=JSON.stringify(value);e.storage.map.set(e.cache.key(scope),raw);const resumed=e.reload();assert.equal((await resumed.bootstrap(U)).status,'invalid-cache');
 assert.equal(e.storage.getItem(e.cache.key(scope)),raw);assert.throws(()=>resumed.load());
});
test('acknowledged cache regression is refused and original cache remains intact',async()=>{
 const e=environment();const initial=e.remote();initial.universe.revision='5';e.setRemote(initial);await e.manager.bootstrap(U);const saved=e.storage.getItem(e.cache.key(scope));
 initial.universe.revision='4';e.setRemote(initial);const state=await e.reload().bootstrap(U);assert.equal(state.status,'loaded');assert.equal(state.canMutate,false);assert.equal(state.error.code,'CACHE_REVISION_REGRESSION');
 assert.equal(e.storage.getItem(e.cache.key(scope)),saved);
});
test('cache callbacks require lease/current generation and cannot write after closure',async()=>{
 const e=environment();await e.manager.bootstrap(U);let active=true;
 const session=e.cache.bind({scope,contextId:'manual',generation:9,isCurrent:()=>active});session.read();
 assert.throws(()=>session.refresh(e.remote()),error=>error.code==='CACHE_LOCK_REQUIRED');
 active=false;assert.throws(()=>session.read(),error=>error.code==='CACHE_CONTEXT_CHANGED');assert.throws(()=>session.refresh(e.remote()),error=>error.code==='CACHE_CONTEXT_CHANGED');
});
test('a timed-out mutation retains the original journal even after its late server reply succeeds',async()=>{
 const e=environment({timeout:15}),gate=deferred();await e.manager.bootstrap(U);const commit=e.gateway.commitMetadata;
 e.gateway.commitMetadata=async command=>{await gate.promise;return commit(command);};const repo=e.manager.repository();
 await assert.rejects(repo.save(rename(repo)));const original=e.record().pending.command.operationId;assert.equal(e.record().acknowledged.revision,'0');
 gate.resolve();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(e.remote().universe.revision,'1');assert.equal(e.record().acknowledged.revision,'0');
 assert.equal(e.record().pending.command.operationId,original);assert.equal((await e.manager.reconcile()).revision,'1');assert.equal(e.record().pending,null);
});
test('cache recovery with a found receipt but failed refresh advances acknowledged cache and stays read-only',async()=>{
 const e=environment();await e.manager.bootstrap(U);e.gateway.commitMetadata=async command=>{throw failure('OUTCOME_UNKNOWN','unknown');};
 const repo=e.manager.repository();await assert.rejects(repo.save(rename(repo)));e.apply(e.record().pending.command);e.manager.dispose();
 e.gateway.readUniverse=async()=>{throw failure('NETWORK_UNAVAILABLE');};const resumed=e.reload(),state=await resumed.bootstrap(U);
 assert.equal(state.status,'cached-degraded');assert.equal(state.canMutate,false);assert.equal(state.revision,'1');assert.equal(e.record().acknowledged.revision,'1');assert.equal(e.record().pending,null);
 await assert.rejects(resumed.repository().save(()=>resumed.load()));
});
test('existing local metadata/files/preferences and local Backup/Restore exclude and preserve cloud cache/journal',async()=>{
 const {webcrypto}=require('node:crypto'),e=environment();Object.assign(e.get('globalThis'),{crypto:webcrypto,TextEncoder,TextDecoder,DOMException});
 for(const path of ['persistence/local-metadata-store.js','persistence/local-preferences-store.js','persistence/memory-stores.js','persistence/composition.js','services/local-backup.js','services/local-restore.js'])e.load(path);
 const metadata=e.get('createLocalMetadataStore')({storage:()=>e.storage}),preferences=e.get('createLocalPreferencesStore')({storage:()=>e.storage}),files=e.get('createMemoryFileStore')();
 const data={version:5,entries:[{id:'local-galaxy',name:'Only local',parentId:null,content:{version:1,notes:{format:'plain',text:'Keep local'},links:[],attachments:[{
  id:'local-file',kind:'upload',entryId:'local-galaxy',storageKey:'local-file',filename:'local.bin',mimeType:'application/octet-stream',size:3,createdAt:'2026-10-12T00:00:00Z'}]}}],layout:[],connections:[]};
 e.storage.setItem(metadata.key,JSON.stringify(data));await preferences.update({width:280});await files.save({key:'local-file',entryId:'local-galaxy',blob:new Blob([new Uint8Array([0,128,255])])});
 const local=e.get('createUniverseRepository')({persistence:e.get('createPersistence')({metadata,preferences,files})}),before=metadata.readForBackup().metadataText,prefs=preferences.readForBackup();
 await e.manager.bootstrap(U);e.gateway.commitMetadata=async()=>{throw failure('OUTCOME_UNKNOWN','unknown');};const cloud=e.manager.repository();await assert.rejects(cloud.save(rename(cloud)));
 const cached=e.storage.getItem(e.cache.key(scope)),backup=await e.get('cosmifoldBackup').create(local);
 for(const forbidden of ['cosmifold-cloud-cache','pendingVersion',e.record().pending.command.operationId])assert.equal(JSON.stringify(backup.manifest).includes(forbidden),false);
 await e.get('cosmifoldRestore').restore(await e.get('cosmifoldRestore').inspect(backup.blob),local);
 assert.equal(e.storage.getItem(e.cache.key(scope)),cached);assert.equal(metadata.readForBackup().metadataText,before);assert.equal(preferences.readForBackup(),prefs);
 assert.deepEqual([...new Uint8Array(await (await files.get('local-file')).blob.arrayBuffer())],[0,128,255]);
});
