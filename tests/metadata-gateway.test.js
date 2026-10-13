const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const files=['auth-config.js','services/supabase-client.js','services/supabase-auth.js','services/cloud-repository-contract.js',
 'services/cloud-metadata-projection.js','services/supabase-metadata-gateway.js'];
const A='00000000-0000-4000-8000-000000000001',U='00000000-0000-4000-8000-000000000002',B='00000000-0000-4000-8000-000000000003',OP='00000000-0000-4000-8000-000000000004';
const scope={ownerUserId:A,universeId:U},command={scope,operationId:OP,baseRevision:'42',type:'items.changed',payload:{}};
const config={SUPABASE_URL:'https://auth.example.invalid/',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_TEST_ONLY_FIXTURE'};
const plain=value=>JSON.parse(JSON.stringify(value));
const ack=(patch={})=>({scope,operationId:OP,baseRevision:'42',revision:'43',status:'committed',replayed:false,result:null,...patch});
const ok=data=>({data,error:null,status:200});
function setup(){
 const context=vm.createContext({URL,URLSearchParams,setTimeout,clearTimeout});
 for(const file of files)vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const get=name=>vm.runInContext(name,context),calls=[],listeners=new Set();
 let session={user:{id:A,email:'a@example.invalid'},access_token:'PRIVATE_TEST_TOKEN'},created=0,stopped=0,unsubscribed=0;
 const client={auth:{
  onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn);unsubscribed++;}}}};},
  async getSession(){return {data:{session},error:null};},
  async signOut(){emit('SIGNED_OUT',null);return {data:{},error:null};},
  stopAutoRefresh(){stopped++;}
 },schema(schema){return {rpc(name,params){const call={schema,name,params:plain(params)};calls.push(call);
  return {retry(value){call.retry=value;return Promise.resolve().then(()=>response(call));}};
 }}}};
 let response=()=>ok([]);
 const sdk={createClient(...args){created++;client.createdArgs=args;return client;}};
 const provider=get('createSupabaseClientProvider')({config,loadSDK:async()=>sdk});
 const gateway=get('createSupabaseMetadataGateway')({provider});
 function emit(event,next){session=next;for(const listener of listeners)listener(event,next);}
 const projected=get('cosmifoldCloudProjection').toRelational({version:5,entries:[{id:'text:galaxy',name:'Japan',parentId:null}],layout:[],
  connections:[],constellations:[],portals:[],archivedGalaxies:[]},{...scope,revision:'42'}).metadata;
 return {get,provider,gateway,client,calls,projected,emit,setResponse(fn){response=fn;},setSession(next){session=next;},
  counts:()=>({created,stopped,unsubscribed,listeners:listeners.size})};
}
function rejects(promise,code,outcome='not-committed',reason){return assert.rejects(promise,error=>{
 assert.equal(error.code,code);assert.equal(error.outcome,outcome);assert.equal(error.requiresReconciliation,outcome==='unknown');
 if(reason)assert.equal(error.reason,reason);assert.equal(JSON.stringify(error).includes('PRIVATE_TEST_TOKEN'),false);return true;
});}

test('Auth and gateway concurrently share one configured client with unchanged persistent PKCE flags',async()=>{
 const s=setup(),adapter=s.get('createSupabaseAuthAdapter')({provider:s.provider});
 await Promise.all([adapter.initialize(()=>{}),s.gateway.listOwnedUniverses()]);
 assert.equal(s.counts().created,1);assert.deepEqual(plain(s.client.createdArgs[2]),{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
 adapter.dispose();assert.equal(s.counts().stopped,0);assert.equal(s.counts().listeners,1);
 await s.gateway.listOwnedUniverses();s.gateway.dispose();assert.equal(s.counts().stopped,0);s.provider.dispose();assert.equal(s.counts().stopped,1);
});
test('gateway disposal removes only its subscription; Auth sign-out and identity contract remain usable',async()=>{
 const s=setup(),events=[],adapter=s.get('createSupabaseAuthAdapter')({provider:s.provider});
 await adapter.initialize(e=>events.push(e));await s.gateway.listOwnedUniverses();s.gateway.dispose();
 assert.equal(s.counts().listeners,1);await adapter.signOut();assert.equal(events[0].user,null);assert.equal(s.counts().stopped,0);
 await rejects(s.gateway.listOwnedUniverses(),'RPC_UNAVAILABLE');assert.equal(s.calls.length,1);adapter.dispose();
});
test('default Auth and default gateway borrow the same provider without injection',async()=>{
 const s=setup();s.get('globalThis').fixtureSDK={createClient:()=>s.client};
 s.get('loadSupabaseAuthSDK = async () => globalThis.fixtureSDK');
 const adapter=s.get('createSupabaseAuthAdapter')(),gateway=s.get('createSupabaseMetadataGateway')();
 await Promise.all([adapter.initialize(()=>{}),gateway.listOwnedUniverses()]);
 assert.equal(await s.get('getSharedSupabaseClientProvider')().getClient(),s.client);
 assert.equal(s.counts().listeners,2);adapter.dispose();gateway.dispose();assert.equal(s.counts().stopped,0);
});
test('default provider is a singleton; blank/invalid config and transient SDK failures stay lazy',async()=>{
 const s=setup();assert.equal(s.get('getSharedSupabaseClientProvider')(),s.get('getSharedSupabaseClientProvider')());
 let loads=0;const blank=s.get('createSupabaseClientProvider')({config:{},loadSDK:()=>{loads++;throw Error();}});
 assert.equal(await blank.getClient(),null);assert.equal(loads,0);
 await rejects(s.get('createSupabaseMetadataGateway')({provider:blank}).listOwnedUniverses(),'AUTH_UNAVAILABLE');
 const invalid=s.get('createSupabaseClientProvider')({config:{SUPABASE_URL:'bad'},loadSDK:()=>loads++});
 await rejects(s.get('createSupabaseMetadataGateway')({provider:invalid}).listOwnedUniverses(),'AUTH_UNAVAILABLE');assert.equal(loads,0);
 const retry=s.get('createSupabaseClientProvider')({config,loadSDK:async()=>{if(++loads===1)throw Error('Offline');return {createClient:()=>s.client};}});
 await assert.rejects(retry.getClient());assert.equal(await retry.getClient(),s.client);assert.equal(await retry.getClient(),s.client);assert.equal(loads,2);
});
test('all five approved RPCs use public schema, exact parameters and explicitly disabled retries',async()=>{
 const s=setup();s.setResponse(call=>({
  cosmifold_list_universes:ok([{id:U,owner_id:A,revision:'42'}]),cosmifold_create_universe:ok(s.projected),
  cosmifold_read_universe:ok({status:'found',metadata:s.projected}),cosmifold_commit_metadata:ok(ack()),
  cosmifold_operation_receipt:ok({status:'found',request_digest:'a'.repeat(64),acknowledgement:ack({replayed:true})})
 }[call.name]));
 assert.deepEqual(plain(await s.gateway.listOwnedUniverses()),[{id:U,owner_id:A,revision:'42'}]);
 assert.deepEqual(plain(await s.gateway.createUniverse(U)),plain(s.projected));
 assert.deepEqual(plain((await s.gateway.readUniverse(scope)).metadata),plain(s.projected));
 assert.deepEqual(plain(await s.gateway.commitMetadata(command)),ack());
 const receipt=await s.gateway.getOperationReceipt(scope,OP);assert.equal(receipt.request_digest,'a'.repeat(64));assert.equal(receipt.acknowledgement.replayed,true);
 assert.deepEqual(s.calls.map(c=>c.params),[{}, {p_universe_id:U},{p_scope:scope},{p_command:command},{p_scope:scope,p_operation_id:OP}]);
 assert.ok(s.calls.every(c=>c.schema==='public'&&c.retry===false));assert.equal(s.calls.length,5);
});
test('no bootstrap RPCs; unauthenticated and foreign-owner operations stop before transport',async()=>{
 const s=setup();assert.equal(s.counts().created,0);assert.equal(s.calls.length,0);s.setSession(null);
 for(const action of [()=>s.gateway.listOwnedUniverses(),()=>s.gateway.createUniverse(U),()=>s.gateway.readUniverse(scope),
  ()=>s.gateway.commitMetadata(command),()=>s.gateway.getOperationReceipt(scope,OP)])await rejects(action(),'UNAUTHENTICATED');
 assert.equal(s.calls.length,0);s.setSession({user:{id:A},access_token:'PRIVATE_TEST_TOKEN'});
 await rejects(s.gateway.readUniverse({ownerUserId:B,universeId:U}),'FORBIDDEN');assert.equal(s.calls.length,0);
 await rejects(s.gateway.createUniverse('not-uuid'),'INVALID_COMMAND');assert.equal(s.calls.length,0);
});
test('session lookup failures are safe pre-dispatch errors and retain the shared client',async()=>{
 const s=setup(),normal=s.client.auth.getSession;s.client.auth.getSession=async()=>{throw Error('PRIVATE_TEST_TOKEN');};
 await rejects(s.gateway.listOwnedUniverses(),'AUTH_UNAVAILABLE');assert.equal(s.calls.length,0);
 s.client.auth.getSession=normal;await s.gateway.listOwnedUniverses();assert.equal(s.counts().created,1);assert.equal(s.counts().listeners,1);
});
test('empty list, genuinely absent Universe and missing receipt remain distinct successful states',async()=>{
 const s=setup();assert.deepEqual(plain(await s.gateway.listOwnedUniverses()),[]);
 s.setResponse(()=>ok({status:'absent',metadata:null}));assert.deepEqual(plain(await s.gateway.readUniverse(scope)),{status:'absent',metadata:null});
 for(const status of ['absent','missing']){s.setResponse(()=>ok({status,acknowledgement:null}));assert.equal((await s.gateway.getOperationReceipt(scope,OP)).status,status);}
});
test('list rejects foreign owners, duplicate UUIDs, invalid revisions and unexpected fields',async()=>{
 for(const value of [[{id:U,owner_id:B,revision:'0'}],[{id:U,owner_id:A,revision:'0'},{id:U,owner_id:A,revision:'0'}],
  [{id:'text',owner_id:A,revision:'0'}],[{id:U,owner_id:A,revision:0}],[{id:U,owner_id:A,revision:'00'}],
  [{id:U,owner_id:A,revision:'9223372036854775808'}],[{id:U,owner_id:A,revision:'0',extra:true}],{},null]){
  const s=setup();s.setResponse(()=>ok(value));await rejects(s.gateway.listOwnedUniverses(),'INVALID_RPC_RESPONSE');
 }
});
test('read validates the complete projection, scope, attachments, relationships and unsafe JSON',async()=>{
 const mutators=[m=>m.universe.id=B,m=>m.universe.owner_id=B,m=>m.entries[0].parent_id='missing',m=>m.projectionVersion=2,
  m=>m.entries[0].attributes_json.content={version:1,notes:{format:'plain',text:''},links:[],attachments:[{id:'file'}]},
  m=>m.entries[0].attributes_json.x=100,m=>Object.defineProperty(m,'__proto__',{value:{unsafe:true},enumerable:true})];
 for(const mutate of mutators){const s=setup(),m=plain(s.projected);mutate(m);s.setResponse(()=>ok({status:'found',metadata:m}));
  await rejects(s.gateway.readUniverse(scope),'INVALID_RPC_RESPONSE');}
 for(const value of [{status:'absent',metadata:{}},{status:'found',metadata:null},{status:'forbidden',metadata:null},
  {status:'absent',metadata:null,extra:true}]){const s=setup();s.setResponse(()=>ok(value));await rejects(s.gateway.readUniverse(scope),'INVALID_RPC_RESPONSE');}
});
test('validated return objects are independent copies of SDK response objects',async()=>{
 const s=setup();s.setResponse(()=>ok({status:'found',metadata:s.projected}));const read=await s.gateway.readUniverse(scope);
 read.metadata.entries[0].name='Changed';assert.equal(s.projected.entries[0].name,'Japan');
});
test('create projection validation failure is an uncertain mutation, never a successful empty result',async()=>{
 const s=setup();s.setResponse(()=>ok({status:'absent',metadata:null}));
 await assert.rejects(s.gateway.createUniverse(U),e=>e.code==='INVALID_ACKNOWLEDGEMENT'&&e.requiresReconciliation&&e.universeId===U);
 assert.equal(s.calls.length,1);
});
test('committed, unchanged and replayed acknowledgements preserve exact decimal revisions',async()=>{
 for(const value of [ack(),ack({replayed:true}),ack({status:'unchanged',revision:'42'})]){
  const s=setup();s.setResponse(()=>ok(value));assert.deepEqual(plain(await s.gateway.commitMetadata(command)),value);
 }
 const s=setup(),large={...command,baseRevision:'9223372036854775806'};s.setResponse(()=>ok(ack({baseRevision:large.baseRevision,revision:'9223372036854775807'})));
 assert.equal((await s.gateway.commitMetadata(large)).revision,'9223372036854775807');
});
test('acknowledgements with wrong binding/revision or extra fields require reconciliation',async()=>{
 for(const patch of [{operationId:U},{scope:{ownerUserId:B,universeId:U}},{baseRevision:'41'},{revision:'44'},
  {status:'unchanged',revision:'43'},{revision:43},{replayed:1},{extra:true}]){
  const s=setup();s.setResponse(()=>ok(ack(patch)));await rejects(s.gateway.commitMetadata(command),'INVALID_ACKNOWLEDGEMENT','unknown');assert.equal(s.calls.length,1);
 }
});
test('receipt checks digest, owner/Universe/operation identity and replay acknowledgement invariants',async()=>{
 for(const value of [{status:'found',request_digest:'bad',acknowledgement:ack({replayed:true})},
  {status:'found',request_digest:'a'.repeat(64),acknowledgement:ack()},
  {status:'found',request_digest:'a'.repeat(64),acknowledgement:ack({replayed:true,operationId:U})},
  {status:'found',request_digest:'a'.repeat(64),acknowledgement:ack({replayed:true,scope:{ownerUserId:B,universeId:U}})},
  {status:'missing',acknowledgement:ack()}, {status:'absent',acknowledgement:null,request_digest:'a'.repeat(64)}]){
  const s=setup();s.setResponse(()=>ok(value));await rejects(s.gateway.getOperationReceipt(scope,OP),'INVALID_RPC_RESPONSE');
 }
});
test('expected SQL/domain failures are definite non-commits with safe reason codes',async t=>{
 const cases={CM003:['REVISION_CONFLICT','REVISION_CONFLICT'],CM004:['INVALID_COMMAND','OPERATION_ID_REUSED'],
  CM005:['INVALID_METADATA','INVALID_METADATA'],CM006:['UNSUPPORTED_ATTACHMENTS','UNSUPPORTED_ATTACHMENTS'],CM007:['INVALID_COMMAND','UNIVERSE_ABSENT'],
  '28000':['UNAUTHENTICATED','UNAUTHENTICATED'],'42501':['FORBIDDEN','FORBIDDEN'],'22023':['INVALID_COMMAND','INVALID_COMMAND'],
  '22P02':['INVALID_COMMAND','INVALID_COMMAND'],'22003':['INVALID_COMMAND','REVISION_EXHAUSTED'],
  '23514':['INVALID_METADATA','INVALID_METADATA'],'23503':['INVALID_METADATA','INVALID_METADATA'],'23505':['INVALID_METADATA','INVALID_METADATA'],
  PGRST301:['UNAUTHENTICATED','UNAUTHENTICATED'],PGRST302:['UNAUTHENTICATED','UNAUTHENTICATED'],PGRST303:['UNAUTHENTICATED','UNAUTHENTICATED'],
  '40001':['TRANSACTION_ABORTED','TRANSACTION_ABORTED'],'40P01':['TRANSACTION_ABORTED','TRANSACTION_ABORTED'],'57014':['TRANSACTION_ABORTED','TRANSACTION_ABORTED'],
  PGRST106:['RPC_UNAVAILABLE','PGRST106'],PGRST202:['RPC_UNAVAILABLE','PGRST202'],PGRST203:['RPC_UNAVAILABLE','PGRST203']};
 for(const [sql,[code,reason]] of Object.entries(cases))await t.test(sql,async()=>{
  const s=setup();s.setResponse(()=>({data:null,status:400,error:{code:sql,message:'PRIVATE_TEST_TOKEN',details:'private data'}}));
  await rejects(s.gateway.commitMetadata(command),code,'not-committed',reason);assert.equal(s.calls.length,1);
 });
});
test('transport, unexpected server errors and malformed success responses never retry a mutation',async()=>{
 for(const response of [()=>{throw Error('PRIVATE_TEST_TOKEN');},()=>({data:null,error:{code:'',message:'PRIVATE_TEST_TOKEN'},status:0}),
  ()=>({data:null,error:{code:'XX000',message:'PRIVATE_TEST_TOKEN'},status:500}),()=>({data:ack(),error:null,status:503}),
  ()=>({data:ack(),error:null}),()=>null]){
  const s=setup();s.setResponse(response);
  await assert.rejects(s.gateway.commitMetadata(command),e=>e.code==='OUTCOME_UNKNOWN'&&e.requiresReconciliation&&
   e.operationId===OP&&e.baseRevision==='42'&&e.scope.universeId===U&&!JSON.stringify(e).includes('PRIVATE_TEST_TOKEN'));
  assert.equal(s.calls.length,1);assert.equal(s.calls[0].retry,false);
  await rejects(s.gateway.listOwnedUniverses(),'NETWORK_UNAVAILABLE');assert.equal(s.calls.length,2);
 }
});
test('account changes during requests cannot leak responses or acknowledge another identity',async()=>{
 for(const write of [false,true]){
  const s=setup();s.setResponse(()=>{s.emit('SIGNED_IN',{user:{id:B},access_token:'PRIVATE_TEST_TOKEN'});return ok(write?ack():[]);});
  await rejects(write?s.gateway.commitMetadata(command):s.gateway.listOwnedUniverses(),write?'OUTCOME_UNKNOWN':'SESSION_CHANGED',write?'unknown':'not-committed');
 }
});
test('sign-out/re-login to same user invalidates in-flight result; refresh does not',async()=>{
 const s=setup();s.setResponse(()=>{s.emit('SIGNED_OUT',null);s.emit('SIGNED_IN',{user:{id:A},access_token:'PRIVATE_TEST_TOKEN'});return ok(ack());});
 await rejects(s.gateway.commitMetadata(command),'OUTCOME_UNKNOWN','unknown');
 s.setResponse(()=>{s.emit('TOKEN_REFRESHED',{user:{id:A},access_token:'PRIVATE_TEST_TOKEN'});return ok(ack());});
 assert.equal((await s.gateway.commitMetadata(command)).revision,'43');
});
test('gateway stays inert in normal app and has no private-table transport, storage or file APIs',()=>{
 const index=fs.readFileSync('index.html','utf8');assert.ok(index.includes('services/supabase-client.js'));
 assert.equal(index.includes('supabase-metadata-gateway.js'),false);
 const source=fs.readFileSync('services/supabase-metadata-gateway.js','utf8');
 assert.equal(/\.from\(|localStorage|indexedDB|\.storage\.|cosmifold_private/.test(source),false);
});
