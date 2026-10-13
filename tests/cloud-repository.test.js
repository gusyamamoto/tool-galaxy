const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {A,U,B,scope,date,plain,fixture,failure,deferred,setup}=require('./fake-cloud-gateway.js');
const edits=repo=>()=>{const data=repo.load();data.entries[1].name='Changed';return data;};
const rejects=(p,code)=>assert.rejects(p,e=>e.code===code);

test('explicit coherent read reconstructs rich semantic v5 exactly, scoped and independently copied',async()=>{
 const s=setup();assert.equal(s.calls.length,0);assert.throws(()=>s.repo.load());const opened=await s.repo.open();
 assert.equal(opened.status,'found');assert.equal(opened.revision,'0');assert.deepEqual(plain(opened.snapshot),fixture());
 opened.snapshot.entries[0].name='Local only';assert.deepEqual(plain(s.repo.load()),fixture());assert.equal(s.repo.presentation(),null);
 assert.equal(s.calls.length,1);assert.equal(s.calls[0].method,'read');
});
test('absent differs from empty; neither open creates or seeds remote data',async()=>{
 const absent=setup(null);assert.equal((await absent.repo.open()).status,'absent');await rejects(absent.repo.save(fixture()),'INVALID_COMMAND');
 const empty=setup({version:5,entries:[],layout:[]});assert.equal((await empty.repo.open()).status,'found');assert.deepEqual(plain(empty.repo.load()),{version:5,entries:[],layout:[]});
 assert.ok(absent.calls.every(c=>c.method==='read'));assert.ok(empty.calls.every(c=>c.method==='read'));
});
test('one acknowledged mutation publishes once and advances revision exactly once; no-op receipt preserves revision',async()=>{
 const s=setup(),events=[];await s.repo.open();s.repo.subscribe(e=>events.push(e));
 await s.repo.save(edits(s.repo),{type:'items.renamed',ids:['tokyo']});assert.equal(s.repo.revision(),'1');assert.equal(events.length,1);
 assert.equal(events[0].acknowledgement.revision,'1');assert.equal(s.repo.load().entries[1].name,'Changed');
 await s.repo.save(()=>s.repo.load());assert.equal(s.repo.revision(),'1');assert.equal(events[1].acknowledgement.status,'unchanged');assert.equal(s.allocated(),2);
 assert.notEqual(s.calls.filter(c=>c.method==='commit')[0].command.operationId,s.calls.filter(c=>c.method==='commit')[1].command.operationId);
});
test('deferred acknowledgement publishes no speculative state; queued lazy commands use latest revision',async()=>{
 const s=setup(),gate=deferred(),started=deferred(),events=[];await s.repo.open();s.repo.subscribe(e=>events.push(e));
 const commit=s.gateway.commitMetadata;s.gateway.commitMetadata=async command=>{started.resolve();await gate.promise;return commit(command);};
 const rename=s.repo.save(edits(s.repo),{type:'items.renamed'}),move=s.repo.moveEntries(()=>s.repo.load(),['tokyo'],'kyoto');await started.promise;
 assert.equal(s.repo.load().entries[1].name,'Tokyo');assert.equal(s.repo.revision(),'0');assert.equal(events.length,0);
 gate.resolve();await Promise.all([rename,move]);assert.equal(s.repo.load().entries[1].name,'Changed');assert.equal(s.repo.load().entries[1].parentId,'kyoto');
 assert.deepEqual(s.calls.filter(c=>c.method==='commit').map(c=>c.command.baseRevision),['0','1']);assert.equal(s.repo.revision(),'2');
});
test('captured stale snapshots cannot overwrite earlier queued results',async()=>{
 const s=setup();await s.repo.open();const first=s.repo.save(edits(s.repo)),second=s.repo.updateLocation(s.repo.load(),'tokyo',{text:'Kyoto'});
 await first;await rejects(second,'REVISION_CONFLICT');assert.equal(s.repo.load().entries[1].name,'Changed');assert.equal(s.repo.revision(),'1');
 assert.equal(s.calls.filter(c=>c.method==='commit').length,1);
});
test('server stale revision surfaces conflict, preserves draft/confirmed state and blocks until explicit read',async()=>{
 const s=setup();await s.repo.open();const draft=s.repo.load();draft.entries[1].name='My draft';const before=plain(s.repo.load());
 s.setRemote({...s.remote(),universe:{...s.remote().universe,revision:'1'}});
 await rejects(s.repo.save(draft),'REVISION_CONFLICT');assert.equal(s.repo.getState().phase,'conflict');assert.deepEqual(plain(s.repo.load()),before);assert.equal(draft.entries[1].name,'My draft');
 await rejects(s.repo.updateLocation(()=>s.repo.load(),'tokyo',{text:'Other'}),'REVISION_CONFLICT');assert.equal(s.calls.filter(c=>c.method==='commit').length,1);
 assert.equal(s.calls.filter(c=>c.method==='read').length,1);await s.repo.open();assert.equal(s.repo.revision(),'1');
});
test('lost response reconciles the identical operation through receipt without second mutation',async()=>{
 const s=setup(),events=[];await s.repo.open();s.repo.subscribe(e=>events.push(e));
 s.gateway.commitMetadata=async command=>{s.calls.push({method:'commit',command:plain(command)});s.apply(command);throw failure('OUTCOME_UNKNOWN','unknown');};
 await s.repo.save(edits(s.repo));assert.equal(s.repo.revision(),'1');assert.equal(s.repo.getState().phase,'ready');assert.equal(events.length,1);assert.equal(events[0].acknowledgement.replayed,true);
 const write=s.calls.find(c=>c.method==='commit'),receipt=s.calls.find(c=>c.method==='receipt');assert.equal(receipt.id,write.command.operationId);assert.equal(s.allocated(),1);
 const ack=await s.repo.reconcile();assert.equal(ack.operationId,write.command.operationId);assert.equal(s.calls.filter(c=>c.method==='commit').length,1);assert.equal(events.length,1);
});
test('missing receipt does not prove non-commit: blocked state retains command/ID for later resolution',async()=>{
 const s=setup(),events=[];await s.repo.open();s.repo.subscribe(e=>events.push(e));
 s.gateway.commitMetadata=async command=>{s.calls.push({method:'commit',command:plain(command)});throw failure('OUTCOME_UNKNOWN','unknown');};
 const draft=edits(s.repo)();await rejects(s.repo.save(draft),'OUTCOME_UNKNOWN');const original=plain(s.repo.pendingCommand());
 assert.equal(s.repo.getState().phase,'uncertain');assert.equal(s.repo.revision(),'0');assert.equal(events.length,0);
 await rejects(s.repo.open(),'OUTCOME_UNKNOWN');await rejects(s.repo.save(edits(s.repo)),'OUTCOME_UNKNOWN');await rejects(s.repo.updateLocation(()=>s.repo.load(),'tokyo',{text:'Other'}),'OUTCOME_UNKNOWN');
 assert.equal(s.calls.filter(c=>c.method==='commit').length,1);assert.equal(s.allocated(),1);assert.deepEqual(plain(s.repo.pendingCommand()),original);
 // Simulate the original delayed request eventually committing, NOT a retry.
 s.apply(original);await s.repo.reconcile();assert.equal(s.repo.revision(),'1');assert.equal(events.length,1);assert.equal(s.allocated(),1);
 assert.equal(s.calls.filter(c=>c.method==='commit').length,1);assert.ok(s.calls.filter(c=>c.method==='receipt').every(c=>c.id===original.operationId));
});
test('failed/absent/malformed or mismatched receipts retain uncertainty, never mutate confirmed state',async()=>{
 for(const receipt of [()=>{throw failure('NETWORK_UNAVAILABLE');},()=>({status:'absent',acknowledgement:null}),
  ()=>({status:'found',request_digest:'bad',acknowledgement:{}}),()=>({status:'found',request_digest:'a'.repeat(64),acknowledgement:{}})]){
  const s=setup();await s.repo.open();s.gateway.commitMetadata=async()=>{throw failure('OUTCOME_UNKNOWN','unknown');};s.gateway.getOperationReceipt=async()=>receipt();
  await rejects(s.repo.save(edits(s.repo)),'OUTCOME_UNKNOWN');assert.equal(s.repo.getState().phase,'uncertain');assert.equal(s.repo.revision(),'0');
  await rejects(s.repo.reconcile(),'OUTCOME_UNKNOWN');assert.equal(s.allocated(),1);assert.equal(s.repo.load().entries[1].name,'Tokyo');
 }
});
test('queued dependent command cannot proceed if predecessor remains uncertain',async()=>{
 const s=setup();await s.repo.open();s.gateway.commitMetadata=async()=>{throw failure('OUTCOME_UNKNOWN','unknown');};
 const first=s.repo.save(edits(s.repo)),second=s.repo.updateLocation(()=>s.repo.load(),'tokyo',{text:'Pending'});
 await rejects(first,'OUTCOME_UNKNOWN');await rejects(second,'OUTCOME_UNKNOWN');assert.equal(s.allocated(),1);
});
test('definite gateway rejection is reported without receipt lookup or state publication',async()=>{
 const s=setup();await s.repo.open();const original=s.gateway.commitMetadata;
 s.gateway.commitMetadata=async command=>{s.calls.push({method:'commit',command});throw failure('INVALID_METADATA');};
 await rejects(s.repo.save(edits(s.repo)),'INVALID_METADATA');assert.equal(s.repo.getState().phase,'ready');assert.equal(s.repo.revision(),'0');assert.equal(s.calls.some(c=>c.method==='receipt'),false);
 s.gateway.commitMetadata=original;await s.repo.save(edits(s.repo));assert.equal(s.repo.revision(),'1');
});
test('malformed acknowledgement after actual commit reconciles; false no-op acknowledgement is not accepted',async()=>{
 const s=setup();await s.repo.open();s.gateway.commitMetadata=async command=>{s.apply(command);return {bad:true};};await s.repo.save(edits(s.repo));assert.equal(s.repo.revision(),'1');
 const bad=setup();await bad.repo.open();bad.gateway.commitMetadata=async command=>({scope,operationId:command.operationId,baseRevision:'0',revision:'0',status:'unchanged',replayed:false,result:null});
 await rejects(bad.repo.save(edits(bad.repo)),'OUTCOME_UNKNOWN');assert.equal(bad.repo.getState().phase,'uncertain');assert.equal(bad.repo.revision(),'0');
});
test('compound create/reorder/content/membership/placement/archive patch is atomic and retains explicit ordering',async()=>{
 const s=setup();await s.repo.open();const draft=s.repo.load();draft.entries.unshift({id:'new:textual',name:'New Galaxy',parentId:null});
 draft.constellations[0].memberEntryIds.reverse();draft.entries[2].content.notes.text='Edited';draft.entries[2].appearance={seed:13};
 draft.portals.push({id:'placement-2',targetEntryId:'sushi',parentEntryId:'new:textual',createdAt:date});draft.archivedGalaxies[0].expandedIds.reverse();
 await s.repo.save(draft);assert.deepEqual(plain(s.repo.load()),plain(draft));assert.equal(s.calls.filter(c=>c.method==='commit').length,1);assert.equal(s.repo.revision(),'1');
 assert.deepEqual(plain(s.get('cosmifoldCloudProjection').toStorageV5(s.remote())),plain(draft));
});
test('compound failure rejects completely; invalid relationships are rejected before remote mutation',async()=>{
 const s=setup();await s.repo.open();const draft=s.repo.load();draft.entries[0].name='Must not publish';draft.constellations[0].memberEntryIds.push('missing');
 await rejects(s.repo.save(draft),'INVALID_METADATA');assert.equal(s.calls.filter(c=>c.method==='commit').length,0);assert.deepEqual(plain(s.repo.load()),fixture());
 const valid=s.repo.load();valid.entries[0].name='Compound valid';valid.constellations[0].name='Changed too';s.gateway.commitMetadata=async()=>{throw failure('INVALID_METADATA');};
 await rejects(s.repo.save(valid),'INVALID_METADATA');assert.deepEqual(plain(s.repo.load()),fixture());assert.deepEqual(s.remote().entries.map(e=>e.name),fixture().entries.map(e=>e.name));
});
test('attachment-bearing save/content/copy/structure/delete inputs fail before any RPC mutation',async()=>{
 const actions=[(r,d)=>r.save(d),(r,d)=>r.updateContent(()=>r.load(),'tokyo',d.entries[1].content),
  (r,d)=>r.copyEntries(d,['tokyo'],'kyoto',()=> 'new'),(r,d)=>r.duplicateStructure(d,'tokyo','Copy',()=> 'new'),
  (r,d)=>r.deleteSubtree(d,['tokyo','sushi'])];
 for(const action of actions){const s=setup();await s.repo.open();const draft=s.repo.load();draft.entries[1].content.attachments=[{id:'local-file',storageKey:'only-local'}];
  await rejects(action(s.repo,draft),'UNSUPPORTED_ATTACHMENTS');assert.equal(s.calls.filter(c=>c.method==='commit').length,0);assert.equal(s.allocated(),0);assert.deepEqual(plain(s.repo.load()),fixture());}
});
test('automatic/device layout stays in an in-memory sidecar and never becomes cloud metadata',async()=>{
 const s=setup();await s.repo.open();const positioned=s.repo.load();positioned.entries[1].x=10;positioned.entries[1].y=20;positioned.layout=[{id:'tokyo',parentId:'g:text',angle:.5,radius:40}];
 await s.repo.saveLayout(positioned);s.repo.checkpointLayout(positioned);assert.equal(s.calls.filter(c=>c.method==='commit').length,0);assert.equal(s.repo.revision(),'0');
 assert.deepEqual(plain(s.repo.load()),fixture());assert.equal(s.repo.presentation().positions[0].x,10);
 positioned.entries[1].name='Changed with layout';await s.repo.save(positioned);const wire=JSON.stringify(s.calls.find(c=>c.method==='commit').command);
 assert.equal(wire.includes('"x"'),false);assert.equal(wire.includes('"layout"'),false);assert.equal(s.repo.load().entries[1].x,undefined);
 const invalid=s.repo.load();invalid.entries[1].name='Semantic under layout';await rejects(s.repo.saveLayout(invalid),'INVALID_COMMAND');
});
test('file-free planning supports Notes/Bookmarks/Location, collections, links, archive/restore and removal',async()=>{
 const s=setup();await s.repo.open();const read=()=>s.repo.load();await s.repo.updateContent(read,'tokyo',{version:1,notes:{format:'plain',text:'New note'},links:[{id:'b',url:'https://example.org/',title:'Guide'}],attachments:[]});
 await s.repo.updateLocation(read,'tokyo',{text:'Tokyo Station'});await s.repo.replaceConstellations(read,[{id:'favorites',name:'Trip',memberEntryIds:['sushi','tokyo'],createdAt:date}]);
 await s.repo.replacePlacements(read,[{id:'linked:new',parentEntryId:'kyoto',targetEntryId:'sushi',createdAt:date}]);
 await s.repo.archive(read,{galaxyId:'g:text',archivedAt:date,expandedIds:['g:text','tokyo']});await s.repo.restore(read,'g:text');
 assert.equal(s.repo.load().entries[1].location.text,'Tokyo Station');assert.equal(s.repo.load().entries[1].content.notes.text,'New note');
 await s.repo.updateContent(read,'tokyo',null);await s.repo.updateLocation(read,'tokyo',null);assert.equal(s.repo.load().entries[1].content,undefined);assert.equal(s.repo.load().entries[1].location,undefined);
 assert.equal(s.repo.revision(),'8');assert.equal(s.repo.load().constellations[0].memberEntryIds[0],'sushi');
});
test('file-free copy and duplicate structure reuse helpers; a single compound commit preserves independent textual IDs',async()=>{
 const s=setup();await s.repo.open();let id=0;const fresh=()=> 'copy:text:'+ ++id;
 const result=await s.repo.copyEntries(()=>s.repo.load(),['tokyo'],'kyoto',fresh);assert.equal(result.files.length,0);assert.equal(result.copies.length,2);assert.equal(s.repo.revision(),'1');
 assert.equal(s.repo.load().entries.find(e=>e.id===result.rootIds[0]).content.notes.text,'Original');assert.equal(s.repo.load().entries[1].id,'tokyo');
 const structure=await s.repo.duplicateStructure(()=>s.repo.load(),'tokyo','Structure',fresh);assert.equal(structure.copies.length,2);assert.ok(structure.copies.every(e=>!e.content));assert.equal(s.repo.revision(),'2');
 assert.equal(s.calls.filter(c=>c.method==='commit').length,2);
});
test('delete updates linked endpoints, memberships and archived expansion references atomically',async()=>{
 const s=setup();await s.repo.open();const removed=await s.repo.deleteSubtree(()=>s.repo.load(),['archived-note','tokyo','sushi']);
 assert.equal(s.repo.load().portals.length,0);assert.deepEqual(plain(s.repo.load().constellations[0].memberEntryIds),[]);
 assert.deepEqual(plain(s.repo.load().archivedGalaxies[0].expandedIds),['archive']);assert.deepEqual(plain(removed.archivedGalaxies),plain(s.repo.load().archivedGalaxies));
 assert.equal(s.calls.filter(c=>c.method==='commit').length,1);assert.equal(s.repo.revision(),'1');
});
test('scopes cannot switch; foreign reads and invalid response scopes/relationships never publish',async()=>{
 const s=setup();await rejects(s.repo.open({ownerUserId:B,universeId:U}),'FORBIDDEN');assert.equal(s.calls.length,0);
 s.gateway.readUniverse=async()=>({status:'found',metadata:{...s.remote(),universe:{...s.remote().universe,owner_id:B}}});await rejects(s.repo.open(),'INVALID_METADATA');assert.throws(()=>s.repo.load());
 const other=s.get('createCloudUniverseRepository')({scope:{ownerUserId:B,universeId:A},gateway:s.gateway});await rejects(other.open(),'INVALID_METADATA');
});
test('late read/commit/receipt after disposal cannot publish into old or new account context',async()=>{
 for(const operation of ['read','commit','receipt']){
  const s=setup(),gate=deferred(),started=deferred(),events=[];if(operation!=='read')await s.repo.open();s.repo.subscribe(e=>events.push(e));
  let pending;
  if(operation==='read'){const read=s.gateway.readUniverse;s.gateway.readUniverse=async scope=>{started.resolve();await gate.promise;return read(scope);};pending=s.repo.open();}
  else if(operation==='commit'){const commit=s.gateway.commitMetadata;s.gateway.commitMetadata=async command=>{started.resolve();await gate.promise;return commit(command);};pending=s.repo.save(edits(s.repo));}
  else{s.gateway.commitMetadata=async command=>{s.apply(command);throw failure('OUTCOME_UNKNOWN','unknown');};const receipt=s.gateway.getOperationReceipt;s.gateway.getOperationReceipt=async(...args)=>{started.resolve();await gate.promise;return receipt(...args);};pending=s.repo.save(edits(s.repo));}
  await started.promise;s.repo.dispose();gate.resolve();await rejects(pending,'REPOSITORY_DISPOSED');assert.equal(events.length,0);assert.throws(()=>s.repo.load());assert.equal(s.repo.getState().phase,'disposed');
 }
});
test('isCurrent account generation fence discards late responses even before explicit dispose',async()=>{
 let current=true;const s=setup(fixture(),{isCurrent:()=>current}),gate=deferred(),started=deferred();await s.repo.open();
 const commit=s.gateway.commitMetadata;s.gateway.commitMetadata=async command=>{started.resolve();await gate.promise;return commit(command);};
 const task=s.repo.save(edits(s.repo));await started.promise;current=false;gate.resolve();await rejects(task,'REPOSITORY_DISPOSED');assert.equal(s.repo.getState().phase,'disposed');assert.throws(()=>s.repo.load());
});
test('reused operation UUID, unsupported capabilities and invalid model commands fail without partial state',async()=>{
 const s=setup(fixture(),{newOperationId:()=>A});await s.repo.open();await s.repo.save(edits(s.repo));
 await rejects(s.repo.updateLocation(()=>s.repo.load(),'tokyo',{text:'New'}),'INVALID_COMMAND');assert.equal(s.repo.revision(),'1');
 await rejects(s.repo.addAttachment(),'UNSUPPORTED_ATTACHMENTS');await rejects(s.repo.replaceLocalBackup(),'UNSUPPORTED_CAPABILITY');
 const count=s.calls.filter(c=>c.method==='commit').length;await assert.rejects(s.repo.moveEntries(()=>s.repo.load(),['g:text'],'sushi'));assert.equal(s.calls.filter(c=>c.method==='commit').length,count);
});
test('observer failure cannot undo acknowledged success; mutation snapshots and pending commands are isolated',async()=>{
 const s=setup();await s.repo.open();s.repo.subscribe(()=>{throw Error('observer');});await s.repo.save(edits(s.repo));assert.equal(s.repo.revision(),'1');assert.equal(s.repo.lastObserverError.code,'OBSERVER_FAILED');
 assert.equal(s.repo.pendingCommand(),null);
});
test('patch projection handles explicit order, optional-array presence and object-key equality without alternate schema',()=>{
 const s=setup(),project=s.get('cosmifoldCloudProjection'),changes=s.get('cosmifoldCloudChanges'),before=project.toRelational(fixture(),{...scope,revision:'0'}).metadata;
 const same=plain(before);same.entries[0].attributes_json.appearance={color:'blue',seed:9};assert.deepEqual(plain(changes.between(before,same)),{});
 const input=fixture();input.entries.reverse();delete input.portals;const after=project.toRelational(input,{...scope,revision:'0'}).metadata,payload=changes.between(before,after);
 assert.equal(payload.upsert.entries.length,6);assert.deepEqual(plain(payload.delete.linked_placements),['placement']);assert.equal(payload.snapshot_fields.portals,false);
 assert.throws(()=>changes.between(before,{...after,universe:{...after.universe,revision:'1'}}));
});
test('normal app does not load the cloud repository or patch module; local code and file stores are not used',()=>{
 const index=fs.readFileSync('index.html','utf8');assert.equal(index.includes('cloud-universe-repository.js'),false);assert.equal(index.includes('cloud-metadata-changes.js'),false);
 const source=fs.readFileSync('services/cloud-universe-repository.js','utf8');assert.equal(/localStorage|indexedDB|\.from\(|createUniverse\(/.test(source),false);
});
test('confirmed reads remain available during uncertainty, pending copies cannot modify the retained operation',async()=>{
 const s=setup();await s.repo.open();s.gateway.commitMetadata=async()=>{throw failure('OUTCOME_UNKNOWN','unknown');};
 await rejects(s.repo.save(edits(s.repo)),'OUTCOME_UNKNOWN');const original=plain(s.repo.pendingCommand()),copy=s.repo.pendingCommand();
 copy.payload.upsert.entries[0].name='Tampered';copy.operationId=A;assert.deepEqual(plain(s.repo.pendingCommand()),original);
 assert.deepEqual(plain(s.repo.load()),fixture());await s.repo.whenIdle();assert.equal(s.repo.getState().phase,'uncertain');
});
test('immutable owner/Universe scope and independent instances do not share confirmed state',async()=>{
 const s=setup();await s.repo.open();assert.equal(Object.getOwnPropertyDescriptor(s.repo,'scope').writable,false);
 const otherScope={ownerUserId:B,universeId:A},projection=s.get('cosmifoldCloudProjection');
 const snapshot=fixture();snapshot.entries[0].name='Other account';
 const otherRows=projection.toRelational(snapshot,{...otherScope,revision:'7'}).metadata;
 const other=s.get('createCloudUniverseRepository')({scope:otherScope,gateway:{async readUniverse(scope){assert.deepEqual(plain(scope),otherScope);return {status:'found',metadata:otherRows};},async commitMetadata(){throw Error();},async getOperationReceipt(){throw Error();}}});
 await other.open();assert.equal(other.revision(),'7');assert.equal(other.load().entries[0].name,'Other account');
 assert.equal(s.repo.revision(),'0');assert.equal(s.repo.load().entries[0].name,'Japan');s.repo.dispose();assert.equal(other.load().entries[0].name,'Other account');
});
test('file-free internal links are copied through the existing helper while collection membership stays original',async()=>{
 const data=fixture();data.portals.push({id:'internal',targetEntryId:'sushi',parentEntryId:'tokyo',createdAt:date});
 const s=setup(data);await s.repo.open();let id=0;const copy=await s.repo.copyEntries(()=>s.repo.load(),['tokyo'],'kyoto',()=> 'fresh:'+ ++id);
 assert.equal(copy.links.length,1);assert.equal(copy.links[0].parentEntryId,copy.rootIds[0]);assert.notEqual(copy.links[0].targetEntryId,'sushi');
 assert.deepEqual(plain(s.repo.load().constellations[0].memberEntryIds),['tokyo','archived-note']);assert.equal(s.repo.load().portals.length,3);
});
test('runtime serializer removes only known undefined slots and validates nested metadata before mutation',async()=>{
 const s=setup();await s.repo.open();const snapshot=s.repo.load(),runtime={entries:new Map(snapshot.entries.map(e=>[e.id,{...e,depth:99,role:'derived'}])),
  portals:new Map(snapshot.portals.map(p=>[p.id,p])),constellations:new Map(snapshot.constellations.map(c=>[c.id,c])),layout:new Map(),archivedGalaxies:new Map(snapshot.archivedGalaxies.map(a=>[a.galaxyId,a]))};
 const saved=s.repo.snapshot(runtime);assert.equal(saved.version,5);assert.equal(saved.entries[1].id,'tokyo');assert.equal(saved.entries[1].role,undefined);
 await s.repo.save(saved);assert.equal(s.repo.revision(),'0');
 runtime.entries.get('tokyo').content.unknown='must not disappear';assert.throws(()=>s.repo.snapshot(runtime),e=>e.code==='INVALID_METADATA');
});
test('near-bigint revision advances without floating-point conversion',async()=>{
 const s=setup();s.setRemote({...s.remote(),universe:{...s.remote().universe,revision:'9223372036854775806'}});await s.repo.open();
 await s.repo.save(edits(s.repo));assert.equal(s.repo.revision(),'9223372036854775807');assert.equal(s.calls.find(c=>c.method==='commit').command.baseRevision,'9223372036854775806');
});
test('explicit absent refresh clears historical acknowledgement without creating a new Universe',async()=>{
 const s=setup();await s.repo.open();await s.repo.save(edits(s.repo));assert.equal((await s.repo.reconcile()).revision,'1');
 s.setRemote(null);assert.equal((await s.repo.open()).status,'absent');assert.equal(await s.repo.reconcile(),null);assert.equal(s.repo.revision(),null);
 assert.throws(()=>s.repo.load());assert.equal(s.calls.filter(c=>c.method==='commit').length,1);
});
test('context switched by acknowledgement observer suppresses later events and old caller result',async()=>{
 let current=true;const s=setup(fixture(),{isCurrent:()=>current});await s.repo.open();let later=0;
 s.repo.subscribe(()=>{current=false;});s.repo.subscribe(()=>later++);
 await assert.rejects(s.repo.save(edits(s.repo)),e=>e.code==='REPOSITORY_DISPOSED'&&e.outcome==='unknown');
 assert.equal(later,0);assert.equal(s.remote().universe.revision,'1');assert.throws(()=>s.repo.load());
});
test('disposal inside acknowledgement observer cannot return acknowledged old-context data to caller',async()=>{
 const s=setup();await s.repo.open();s.repo.subscribe(()=>s.repo.dispose());
 await assert.rejects(s.repo.updateLocation(()=>s.repo.load(),'tokyo',{text:'Tokyo Station'}),e=>e.code==='REPOSITORY_DISPOSED'&&e.outcome==='unknown');
 assert.equal(s.remote().universe.revision,'1');assert.equal(s.repo.getState().phase,'disposed');
});
