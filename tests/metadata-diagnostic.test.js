const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const A='00000000-0000-4000-8000-000000000001',U='00000000-0000-4000-8000-000000000002';
const config={url:'https://auth.example.invalid',key:'sb_publishable_TEST_ONLY_FIXTURE'};
const empty={universe:{id:U,owner_id:A,revision:'0'},entries:[],constellations:[],constellation_members:[],linked_placements:[]};
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(){
 const context=vm.createContext({URL,setTimeout,clearTimeout,AbortController});
 for(const file of ['services/cloud-repository-contract.js','dev/cloud-metadata-diagnostic.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const events=[],report=[],identities=[],requests=[];let created=false,session={user:{id:A},access_token:'PRIVATE_TEST_TOKEN'},fetchResponse=()=>({status:401,json:async()=>({code:'42501'})});
 const gateway={async listOwnedUniverses(){events.push('list');return created?[{id:U,owner_id:A,revision:'0'}]:[];},
  async createUniverse(id){events.push('create:'+id);created=true;return empty;},async readUniverse(scope){events.push('read');return {status:'found',metadata:empty};},dispose(){events.push('dispose');}};
 const options={location:{hostname:'127.0.0.1',protocol:'http:'},provider:{async getClient(){events.push('client');return {auth:{async getSession(){return {data:{session},error:null};}}};}},
  settings:()=>config,gateway,fetch:async(url,args)=>{requests.push({url,args});events.push('anonymous:'+url.split('/').at(-1));return fetchResponse();},
  randomUUID:()=>U,report:value=>report.push(value),onTestIdentity:value=>identities.push(plain(value))};
 return {get:name=>vm.runInContext(name,context),options,events,report,requests,identities,gateway,
  setSession(value){session=value;},setFetchResponse(fn){fetchResponse=fn;}};
}
test('manual diagnostic is inert until Run and uses only list/create/read in the specified order',async()=>{
 const s=setup(),diagnostic=s.get('createCloudMetadataDiagnostic')(s.options);assert.deepEqual(s.events,[]);
 const result=await diagnostic.run();assert.equal(result.universeId,U);assert.equal(result.initialCount,0);
 assert.deepEqual(s.events,['anonymous:cosmifold_list_universes','list','client','create:'+U,'list','read','anonymous:cosmifold_read_universe']);
 assert.ok(s.report.some(r=>r.includes('no Universe')));assert.equal(s.identities[0].label,'Cosmifold disposable RPC boundary test');
 assert.equal(JSON.stringify(s.report).includes('PRIVATE_TEST_TOKEN'),false);assert.equal(JSON.stringify(s.identities).includes('PRIVATE_TEST_TOKEN'),false);
 assert.ok(s.requests.every(r=>r.args.credentials==='omit'&&!Object.keys(r.args.headers).some(k=>k.toLowerCase()==='authorization')));
 assert.deepEqual(JSON.parse(s.requests[1].args.body),{p_scope:{ownerUserId:A,universeId:U}});assert.equal(s.requests[0].args.headers['Content-Profile'],'public');
});
test('production/file origins are rejected before any SDK, session, settings or request access',async()=>{
 for(const location of [{hostname:'tool-galaxy.pages.dev',protocol:'https:'},{hostname:'',protocol:'file:'}]){
  const s=setup(),d=s.get('createCloudMetadataDiagnostic')({...s.options,location,settings:()=>{throw Error('Must not access config');}});
  await assert.rejects(d.run(),e=>e.code==='LOCAL_DEVELOPMENT_ONLY');assert.deepEqual(s.events,[]);
 }
});
test('HTTP/server/network failures cannot pass as anonymous permission denial',async()=>{
 for(const response of [()=>({status:200,json:async()=>({code:'42501'})}),()=>({status:404,json:async()=>({code:'PGRST202'})}),
  ()=>({status:500,json:async()=>({code:'42501'})}),()=>({status:403,json:async()=>({code:'unrelated'})}),
  ()=>({status:401,json:async()=>{throw Error();}}),()=>{throw Error('PRIVATE_TEST_TOKEN');}]){
  const s=setup();s.setFetchResponse(response);await assert.rejects(s.get('createCloudMetadataDiagnostic')(s.options).run());
  assert.equal(s.events.length,1);assert.equal(s.report.length,0);
 }
});
test('explicit rerun reuses the same Universe UUID; concurrent runs cannot create duplicates',async()=>{
 const s=setup();let generated=0;const d=s.get('createCloudMetadataDiagnostic')({...s.options,randomUUID:()=>{generated++;return U;}});
 const pending=d.run();await assert.rejects(d.run(),e=>e.code==='DIAGNOSTIC_BUSY');await pending;
 await d.run();assert.equal(generated,1);assert.deepEqual(s.events.filter(e=>e.startsWith('create:')),['create:'+U,'create:'+U]);
});
test('create failure preserves the recorded test identity and never silently retries or commits',async()=>{
 const s=setup();s.gateway.createUniverse=async()=>{s.events.push('create');const e=new Error('Unknown');e.code='OUTCOME_UNKNOWN';e.requiresReconciliation=true;throw e;};
 const d=s.get('createCloudMetadataDiagnostic')(s.options);await assert.rejects(d.run(),e=>e.requiresReconciliation);
 assert.equal(s.identities[0].universeId,U);assert.equal(s.events.filter(e=>e==='create').length,1);assert.equal(s.events.includes('read'),false);
});
test('a changed/nonempty test Universe cannot produce a successful diagnostic',async()=>{
 const s=setup();s.gateway.createUniverse=async()=>({...empty,universe:{...empty.universe,revision:'1'}});
 await assert.rejects(s.get('createCloudMetadataDiagnostic')(s.options).run(),e=>e.code==='TEST_UNIVERSE_NOT_EMPTY');
 assert.equal(s.events.includes('read'),false);
});
test('admin cleanup is restricted to exact owner/UUID, revision zero and every empty child table',()=>{
 const s=setup(),cleanup=s.get('cloudMetadataDiagnosticCleanup'),sql=cleanup({ownerUserId:A,universeId:U});
 assert.ok(sql.includes(A)&&sql.includes(U)&&sql.includes('u.revision = 0'));assert.equal((sql.match(/not exists/g)||[]).length,5);
 assert.equal(/cascade|delete from cosmifold_private.entries/i.test(sql),false);assert.throws(()=>cleanup({ownerUserId:"' malicious",universeId:U}));
});
test('dev page is separate, local guarded and removable; there is no automatic run or commit call',()=>{
 const index=fs.readFileSync('index.html','utf8'),page=fs.readFileSync('dev/cloud-metadata-diagnostic-page.js','utf8');
 assert.equal(index.includes('cloud-metadata-diagnostic'),false);assert.ok(page.includes('localhost'));assert.ok(page.includes("addEventListener('click'"));
 assert.equal(/innerHTML|console\./.test(page),false);assert.equal(fs.readFileSync('dev/cloud-metadata-diagnostic.js','utf8').includes('commitMetadata('),false);
});
