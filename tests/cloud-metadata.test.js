const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({URL});
for(const file of ['services/cloud-repository-contract.js','services/cloud-metadata-projection.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const get=name=>vm.runInContext(name,context),contract=get('cosmifoldCloudContract'),projection=get('cosmifoldCloudProjection');
const plain=value=>JSON.parse(JSON.stringify(value));
const scope={ownerUserId:'00000000-0000-4000-8000-000000000001',universeId:'00000000-0000-4000-8000-000000000002',revision:'42'};
const date='2026-10-12T00:00:00.000Z';
function fixture(){return {
 version:5,connections:[],entries:[
  {id:'archived-root',parentId:null,name:'Archive',x:11,y:22,appearance:{seed:0,custom:{color:'blue'}},createdAt:date},
  {id:'legacy:archived',parentId:'archived-root',name:'Old notes',content:{version:1,notes:{format:'plain',text:'Archived notes'},links:[],attachments:[]}},
  {id:'galaxy',parentId:null,name:'Japan',description:'Trip',category:'Travel',x:400,y:350,appearance:{seed:7},createdAt:date,updatedAt:date},
  {id:'entry-text-not-a-uuid',parentId:'galaxy',name:'Tokyo',content:{version:1,notes:{format:'plain',text:'Keep\nall text'},links:[{id:'bookmark',url:'https://example.com',title:''},{id:'bookmark-2',url:'https://example.org/'}],attachments:[]},location:{text:'Tokyo Station'},updatedAt:date},
  ...Array.from({length:7},(_,index)=>({id:'depth-'+index,name:'Level '+index,parentId:index?'depth-'+(index-1):'entry-text-not-a-uuid'})),
  {id:'structure:copy',parentId:'galaxy',name:'Tokyo',content:{version:1,notes:{format:'plain',text:''},links:[{id:'bookmark',url:'http://example.net/'}],attachments:[]}}
 ],
 layout:[{id:'depth-0',parentId:'entry-text-not-a-uuid',angle:.25,radius:48},{id:'legacy:archived',parentId:'archived-root',angle:-2,radius:12}],
 constellations:[{id:'collection',name:'Favorites',memberEntryIds:['depth-6','legacy:archived','galaxy'],createdAt:date,updatedAt:date},{id:'empty-collection',name:'Empty',memberEntryIds:[],createdAt:date}],
 portals:[{id:'portal:one',targetEntryId:'legacy:archived',parentEntryId:'galaxy',createdAt:date},{id:'portal:ancestor',targetEntryId:'galaxy',parentEntryId:'depth-6',createdAt:date}],
 archivedGalaxies:[{galaxyId:'archived-root',archivedAt:date,expandedIds:['legacy:archived','archived-root']}]
};}
function rejects(action,code='INVALID_METADATA'){assert.throws(action,error=>error.code===code&&error.outcome==='not-committed');}
function mutateSnapshot(mutate,code){const data=fixture();mutate(data);const before=structuredClone(data);rejects(()=>projection.toRelational(data,scope),code);assert.deepEqual(data,before);}
function mutateRows(mutate,code){const data=projection.toRelational(fixture(),scope);mutate(data);const before=plain(data);rejects(()=>projection.toStorageV5(data.metadata,data.presentation),code);assert.deepEqual(plain(data),before);}

test('rich v5 -> rows -> v5 preserves exact IDs, active/archive content and explicit array order',()=>{
 const input=fixture(),before=structuredClone(input),rows=projection.toRelational(input,scope);
 assert.deepEqual(plain(projection.toStorageV5(rows.metadata,rows.presentation)),input);
 assert.deepEqual(input,before);assert.deepEqual(plain(rows.metadata.entries.map(row=>row.id)),input.entries.map(entry=>entry.id));
 assert.equal(rows.metadata.entries.find(row=>row.id==='archived-root').archive_json.archivedAt,date);
 assert.equal(rows.metadata.entries.find(row=>row.id==='entry-text-not-a-uuid').attributes_json.content.links[0].url,'https://example.com');
 assert.deepEqual(plain(projection.validateRelational(rows.metadata)),plain(rows.metadata));
});
test('presentation sidecar preserves positions/layout without entering semantic rows',()=>{
 const data=fixture(),a=projection.toRelational(data,scope);data.entries[0].x+=999;data.entries[2].y=-600;data.layout[0].radius+=25;
 const b=projection.toRelational(data,scope);assert.deepEqual(plain(a.metadata),plain(b.metadata));assert.notDeepEqual(plain(a.presentation),plain(b.presentation));
 const noPresentation=projection.toStorageV5(a.metadata);assert.deepEqual(plain(noPresentation.layout),[]);assert.ok(noPresentation.entries.every(entry=>!Object.hasOwn(entry,'x')&&!Object.hasOwn(entry,'y')));
 assert.deepEqual(plain(projection.toStorageV5(b.metadata,b.presentation)),data);
});
test('empty Cosmos and absent versus empty optional fields round-trip without defaults or generated IDs',()=>{
 for(const data of [{version:5,entries:[],layout:[]},{version:5,connections:[],entries:[],layout:[],constellations:[],portals:[],archivedGalaxies:[]},
  {version:5,entries:[{id:'old-root',name:'Old root'}],layout:[]}]){
  const rows=projection.toRelational(data,scope);assert.deepEqual(plain(projection.toStorageV5(rows.metadata,rows.presentation)),data);
 }
});
test('repeated projections are deterministic and both directions return independent objects',()=>{
 const data=fixture(),a=projection.toRelational(data,scope),b=projection.toRelational(data,scope);assert.deepEqual(plain(a),plain(b));
 const result=projection.toStorageV5(a.metadata,a.presentation);result.entries[0].appearance.custom.color='changed';result.constellations[0].memberEntryIds.reverse();
 assert.deepEqual(data,fixture());assert.deepEqual(plain(a),plain(b));
});
test('relational row arrival order does not change entry, collection, member, placement or archive ordering',()=>{
 const data=fixture();data.entries.push({id:'archive-2',name:'Other archive',parentId:null});data.archivedGalaxies.unshift({galaxyId:'archive-2',archivedAt:date,expandedIds:[]});
 const rows=projection.toRelational(data,scope);for(const key of ['entries','constellations','constellation_members','linked_placements'])rows.metadata[key].reverse();rows.presentation.positions.reverse();
 assert.deepEqual(plain(projection.toStorageV5(rows.metadata,rows.presentation)),data);
});
test('one owner can own multiple Universes with identical textual canonical IDs',()=>{
 const a=projection.toRelational(fixture(),scope),b=projection.toRelational(fixture(),{...scope,universeId:'00000000-0000-4000-8000-000000000003'});
 assert.equal(a.metadata.universe.owner_id,b.metadata.universe.owner_id);assert.notEqual(a.metadata.universe.id,b.metadata.universe.id);
 assert.deepEqual(plain(projection.toStorageV5(a.metadata,a.presentation)),plain(projection.toStorageV5(b.metadata,b.presentation)));
 mutateRows(rows=>rows.metadata.entries[0].universe_id=b.metadata.universe.id);
});
test('missing parents, cycles, self-parenting, duplicate IDs and invalid parent types are rejected',()=>{
 for(const mutate of [s=>s.entries[3].parentId='missing',s=>s.entries[2].parentId='depth-6',s=>s.entries[0].parentId=s.entries[0].id,
  s=>s.entries.push({...s.entries[0]}),s=>s.entries[1].parentId=123])mutateSnapshot(mutate);
});
test('missing/duplicate members and invalid linked placements are rejected without filtering',()=>{
 for(const mutate of [s=>s.constellations[0].memberEntryIds.push('missing'),s=>s.constellations[0].memberEntryIds.push('galaxy'),
  s=>s.portals[0].targetEntryId='missing',s=>s.portals[0].parentEntryId='missing',s=>s.portals.push({...s.portals[0],id:'duplicate-pair'}),
  s=>s.constellations[0].id=s.entries[0].id,s=>s.constellations[0].id=s.portals[0].id])mutateSnapshot(mutate);
});
test('archive requires distinct roots, valid dates and expanded IDs in that root subtree',()=>{
 for(const mutate of [s=>s.archivedGalaxies[0].galaxyId='legacy:archived',s=>s.archivedGalaxies[0].galaxyId='missing',
  s=>s.archivedGalaxies.push({...s.archivedGalaxies[0]}),s=>s.archivedGalaxies[0].archivedAt='bad date',
  s=>s.archivedGalaxies[0].expandedIds.push('galaxy'),s=>s.archivedGalaxies[0].expandedIds.push('archived-root')])mutateSnapshot(mutate);
});
test('attachment-bearing snapshots and relational content fail explicitly, including archived entries',()=>{
 for(const owner of [1,3])mutateSnapshot(s=>s.entries[owner].content.attachments.push({id:'file',storageKey:'file'}),'UNSUPPORTED_ATTACHMENTS');
 mutateRows(rows=>rows.metadata.entries[3].attributes_json.content.attachments.push({id:'file'}),'UNSUPPORTED_ATTACHMENTS');
});
test('content limits, unsafe URLs, duplicate Bookmarks and malformed optional fields are rejected',()=>{
 for(const mutate of [s=>s.entries[3].content.notes.text='x'.repeat(100001),s=>s.entries[3].content.notes.format='html',
  s=>s.entries[3].content.links[0].url='javascript:alert(1)',s=>s.entries[3].content.links[1].id='bookmark',
  s=>s.entries[3].location.text=' Tokyo ',s=>s.entries[3].location=null,s=>s.entries[0].appearance=[],s=>s.entries[0].createdAt='invalid',
  s=>s.entries[0].name='',s=>s.connections.push({from:'galaxy'}),s=>s.entries[0].role='galaxy',s=>s.extra='unknown'])mutateSnapshot(mutate);
 mutateSnapshot(s=>s.version=6,'UNSUPPORTED_VERSION');
});
test('invalid or cross-universe row references and dishonest ordering/presence flags are rejected',()=>{
 for(const mutate of [r=>r.metadata.entries[1].parent_id='missing',r=>r.metadata.entries[1].ordinal=0,r=>r.metadata.entries[1].ordinal=100,
  r=>r.metadata.constellation_members[0].entry_id='missing',r=>r.metadata.constellation_members[0].constellation_id='missing',
  r=>r.metadata.constellation_members[0].universe_id='other',r=>r.metadata.constellation_members[1].ordinal=0,
  r=>r.metadata.linked_placements[0].universe_id='other',r=>r.metadata.constellations[0].universe_id='other',
  r=>r.metadata.snapshot_fields.portals=false,r=>r.metadata.entries[2].archive_json={ordinal:0,archivedAt:date},
  r=>r.metadata.entries[0].parent_id_present='invalid',r=>r.metadata.entries[0].attributes_json.x=2])mutateRows(mutate);
 mutateRows(r=>r.metadata.projectionVersion=2,'UNSUPPORTED_VERSION');
});
test('presentation rejects unknown/duplicate IDs, mismatched scope, bad numbers and invalid layout relationships',()=>{
 for(const mutate of [r=>r.presentation.universe_id='other',r=>r.presentation.positions[0].id='missing',r=>r.presentation.positions.push({...r.presentation.positions[0]}),
  r=>r.presentation.positions[0].x=Infinity,r=>r.presentation.layout[0].parentId='galaxy',r=>r.presentation.layout[0].radius=-1,
  r=>r.presentation.layout.push({...r.presentation.layout[0]}),r=>r.presentation.layout[0].pinned=true]){
  const rows=projection.toRelational(fixture(),scope);mutate(rows);rejects(()=>projection.toStorageV5(rows.metadata,rows.presentation));
 }
});
test('JSON input cannot execute getters/toJSON or silently omit unsafe values',()=>{
 let executed=0;const getter={};Object.defineProperty(getter,'payload',{enumerable:true,get(){executed++;return 1;}});rejects(()=>contract.json(getter));assert.equal(executed,0);
 const inherited=Object.create({toJSON(){executed++;return {};}});rejects(()=>contract.json(inherited));assert.equal(executed,0);
 for(const value of [JSON.parse('{"__proto__":{}}'),{x:undefined},{x:NaN},{x:()=>{}},{x:new Date()},new Map(),[,,],{x:1n}])rejects(()=>contract.json(value));
 const cycle={};cycle.x=cycle;rejects(()=>contract.json(cycle));
 const shared={x:1};assert.deepEqual(plain(contract.json({a:shared,b:shared})),{a:{x:1},b:{x:1}});
});
function request(){return {scope:{ownerUserId:scope.ownerUserId,universeId:scope.universeId},operationId:'00000000-0000-4000-8000-000000000004',baseRevision:'42',type:'items.renamed',payload:{id:'galaxy',name:'New name'}};}
function ack(){return {scope:request().scope,operationId:request().operationId,baseRevision:'42',revision:'43',status:'committed',replayed:false,result:null};}
test('cloud contract declares metadata-only capabilities without exposing a working repository',()=>{
 contract.requireCapability('metadataWrite');for(const name of ['attachments','localReplacementRestore','automaticLayoutWrite','offlineReplay','realtime'])rejects(()=>contract.requireCapability(name),'UNSUPPORTED_CAPABILITY');
 assert.equal(contract.commitMetadata,undefined);rejects(()=>contract.command({...request(),type:'layout.saved'}),'INVALID_COMMAND');
});
test('revision protocol preserves bigint precision and scopes commands independently of owner uniqueness',()=>{
 assert.equal(contract.revision('9223372036854775807'),'9223372036854775807');
 for(const value of [42,'042','-1','1.5','9223372036854775808'])rejects(()=>contract.revision(value),'INVALID_COMMAND');
 assert.deepEqual(plain(contract.command(request())),request());rejects(()=>contract.command({...request(),operationId:'bad'}),'INVALID_COMMAND');
});
test('acknowledgement verifies operation/scope/revisions and supports validated no-ops/replayed receipts',()=>{
 assert.deepEqual(plain(contract.acknowledgement(ack(),request())),ack());
 const unchanged={...ack(),status:'unchanged',revision:'42',replayed:true};assert.deepEqual(plain(contract.acknowledgement(unchanged,request())),unchanged);
 for(const mutate of [a=>a.operationId='other',a=>a.scope.universeId='00000000-0000-4000-8000-000000000003',a=>a.revision='44',a=>a.baseRevision='41',a=>a.status='saved-locally',a=>a.replayed=1]){
  const a=ack();mutate(a);assert.throws(()=>contract.acknowledgement(a,request()),error=>error.code==='INVALID_ACKNOWLEDGEMENT'&&error.requiresReconciliation);
 }
});
test('error outcomes distinguish definite rejection from unknown commit status',()=>{
 for(const code of ['INVALID_METADATA','UNSUPPORTED_ATTACHMENTS','REVISION_CONFLICT','UNAUTHENTICATED','FORBIDDEN']){
  const error=new contract.CloudMetadataError(code);assert.equal(error.outcome,'not-committed');assert.equal(error.requiresReconciliation,false);
 }
 const timeout=new contract.CloudMetadataError('OUTCOME_UNKNOWN');assert.equal(timeout.requiresReconciliation,true);assert.equal(timeout.outcome,'unknown');
});
test('new modules are inert: no app script registration or production persistence/Auth changes',()=>{
 const html=fs.readFileSync('index.html','utf8');assert.equal(html.includes('cloud-metadata-projection.js'),false);assert.equal(html.includes('cloud-repository-contract.js'),false);
 for(const file of ['services/cloud-metadata-projection.js','services/cloud-repository-contract.js'])assert.equal(/localStorage|indexedDB|fetch\(|createClient\(|\.rpc\(/.test(fs.readFileSync(file,'utf8')),false);
});
