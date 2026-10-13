// Deterministic gateway fixture; no SDK, browser storage or network.
const fs=require('node:fs'),vm=require('node:vm');
const A='00000000-0000-4000-8000-000000000001',U='00000000-0000-4000-8000-000000000002',B='00000000-0000-4000-8000-000000000003';
const scope={ownerUserId:A,universeId:U},date='2026-10-12T00:00:00.000Z',plain=v=>JSON.parse(JSON.stringify(v));
const modules=['config.js','model.js','portals.js','constellations.js','clipboard.js','services/universe-repository.js',
 'services/cloud-repository-contract.js','services/cloud-metadata-projection.js','services/cloud-metadata-changes.js','services/cloud-universe-repository.js'];
function fixture(){return {version:5,entries:[
 {id:'g:text',name:'Japan',parentId:null,appearance:{seed:9,color:'blue'}},
 {id:'tokyo',name:'Tokyo',parentId:'g:text',content:{version:1,notes:{format:'plain',text:'Original'},links:[{id:'link',url:'https://example.com/',title:'Booking'}],attachments:[]},location:{text:'Tokyo'}},
 {id:'sushi',name:'Sushi place',parentId:'tokyo'}, {id:'kyoto',name:'Kyoto',parentId:'g:text'},
 {id:'archive',name:'Past trip',parentId:null}, {id:'archived-note',name:'Notes',parentId:'archive'}],layout:[],connections:[],
 constellations:[{id:'favorites',name:'Favorites',memberEntryIds:['tokyo','archived-note'],createdAt:date}],
 portals:[{id:'placement',targetEntryId:'tokyo',parentEntryId:'kyoto',createdAt:date}],
 archivedGalaxies:[{galaxyId:'archive',archivedAt:date,expandedIds:['archive','archived-note']}]};}
function failure(code,outcome='not-committed',reason=code){return Object.assign(new Error(code),{code,reason,outcome,requiresReconciliation:outcome==='unknown'});}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function setup(initial=fixture(),options={}){
 const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:[date]));}static now(){return new Date(date).valueOf();}};
 const context=vm.createContext({URL,Blob,structuredClone,Date:FixedDate});for(const file of modules)vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const get=name=>vm.runInContext(name,context),projection=get('cosmifoldCloudProjection'),changes=get('cosmifoldCloudChanges');
 let remote=initial===null?null:plain(projection.toRelational(initial,{...scope,revision:'0'}).metadata),allocated=0;
 const calls=[],receipts=new Map();
 function owns(s){if(s.ownerUserId!==A||s.universeId!==U)throw failure('FORBIDDEN');}
 function apply(command){
  owns(command.scope);const previous=receipts.get(command.operationId);
  if(previous){if(previous.request!==JSON.stringify(command))throw failure('INVALID_COMMAND');return {...plain(previous.ack),replayed:true};}
  if(!remote)throw failure('INVALID_COMMAND');if(command.baseRevision!==remote.universe.revision)throw failure('REVISION_CONFLICT');
  const next=plain(remote),payload=command.payload;
  for(const relation of ['entries','constellations','constellation_members','linked_placements']){
   const key=row=>relation==='constellation_members'?JSON.stringify([row.constellation_id,row.entry_id]):row.id;
   const removalKey=row=>relation==='constellation_members'?JSON.stringify([row.constellation_id,row.entry_id]):row;
   const removals=new Set((payload.delete?.[relation]||[]).map(removalKey));next[relation]=next[relation].filter(row=>!removals.has(key(row)));
   for(const row of payload.upsert?.[relation]||[]){const index=next[relation].findIndex(old=>key(old)===key(row));if(index<0)next[relation].push(row);else next[relation][index]=row;}
  }
  if(payload.snapshot_fields)next.snapshot_fields=payload.snapshot_fields;
  const validated=plain(projection.toRelational(projection.toStorageV5(next),{...scope,revision:command.baseRevision}).metadata);
  const changed=!changes.equal(validated,remote),revision=(BigInt(command.baseRevision)+(changed?1n:0n)).toString();validated.universe.revision=revision;
  const ack={scope,operationId:command.operationId,baseRevision:command.baseRevision,revision,status:changed?'committed':'unchanged',replayed:false,result:null};
  remote=validated;receipts.set(command.operationId,{request:JSON.stringify(command),ack:plain(ack)});return ack;
 }
 const gateway={
  async readUniverse(s){owns(s);calls.push({method:'read',scope:plain(s)});return remote?{status:'found',metadata:plain(remote)}:{status:'absent',metadata:null};},
  async commitMetadata(command){calls.push({method:'commit',command:plain(command)});return apply(command);},
  async getOperationReceipt(s,id){owns(s);calls.push({method:'receipt',scope:plain(s),id});const stored=receipts.get(id);return stored
   ?{status:'found',request_digest:'a'.repeat(64),acknowledgement:{...plain(stored.ack),replayed:true}}:{status:remote?'missing':'absent',acknowledgement:null};}
 };
 const repo=get('createCloudUniverseRepository')({scope,gateway,newOperationId:()=>`00000000-0000-4000-9000-${String(++allocated).padStart(12,'0')}`,...options});
 return {get,load:file=>vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file}),repo,gateway,calls,apply,receipts,
  remote:()=>plain(remote),setRemote(value){remote=value;},allocated:()=>allocated};
}

module.exports={A,U,B,scope,date,plain,fixture,failure,deferred,setup};
