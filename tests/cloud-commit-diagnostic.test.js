const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {A,U,scope,plain,failure,setup}=require('./fake-cloud-gateway.js');
const initial={version:5,entries:[],layout:[],connections:[],constellations:[],portals:[],archivedGalaxies:[]};
function diagnostic(){
 const s=setup(initial);s.load('dev/cloud-metadata-commit-diagnostic.js');
 const messages=[],identities=[];let uid=0,session={user:{id:A},access_token:'PRIVATE_TEST_TOKEN'};
 const client={auth:{async getSession(){return {data:{session},error:null};},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}}};
 s.gateway.createUniverse=async id=>{s.calls.push({method:'create',id});return s.remote();};
 const options={location:{protocol:'http:',hostname:'127.0.0.1'},provider:{async getClient(){return client;}},gateway:s.gateway,
  randomUUID:()=>++uid===1?U:`00000000-0000-4000-9000-${String(uid).padStart(12,'0')}`,
  report:m=>messages.push(m),onTestIdentity:i=>identities.push(plain(i))};
 return {...s,messages,identities,options,setSession:value=>session=value};
}
test('commit diagnostic starts inert, executes one commit plus one rejected stale attempt and reconciles the same receipt',async()=>{
 const s=diagnostic(),d=s.get('createCloudMetadataCommitDiagnostic')(s.options);assert.equal(s.calls.length,0);const result=await d.run();
 assert.equal(result.revision,'1');assert.equal(s.calls.filter(c=>c.method==='commit').length,2);
 const [valid,stale]=s.calls.filter(c=>c.method==='commit');assert.equal(valid.command.baseRevision,'0');assert.equal(stale.command.baseRevision,'0');
 assert.notEqual(valid.command.operationId,stale.command.operationId);assert.equal(s.receipts.size,1);
 assert.equal(s.remote().universe.revision,'1');assert.equal(s.remote().entries[0].name,'Cosmifold metadata commit test');
 assert.ok(s.calls.filter(c=>c.method==='receipt').every(c=>c.id===valid.command.operationId));
 assert.ok(s.messages.at(-1).startsWith('COMPLETE:'));assert.equal(JSON.stringify(s.messages).includes('PRIVATE_TEST_TOKEN'),false);
 assert.equal(s.identities[0].operationId,null);assert.equal(s.identities[1].operationId,valid.command.operationId);
 await assert.rejects(d.run(),e=>e.code==='DIAGNOSTIC_ALREADY_STARTED');assert.equal(s.calls.filter(c=>c.method==='create').length,1);
});
test('commit diagnostic refuses production/file origins and requires sign-in before creating test data',async()=>{
 for(const location of [{protocol:'https:',hostname:'tool-galaxy.pages.dev'},{protocol:'file:',hostname:''}]){
  const s=diagnostic();await assert.rejects(s.get('createCloudMetadataCommitDiagnostic')({...s.options,location}).run(),e=>e.code==='LOCAL_DEVELOPMENT_ONLY');assert.equal(s.calls.length,0);
 }
 const s=diagnostic();s.setSession(null);await assert.rejects(s.get('createCloudMetadataCommitDiagnostic')(s.options).run(),e=>e.code==='SIGN_IN_LOCALLY_FIRST');assert.equal(s.calls.length,0);
});
test('uncertain live outcome stops and retains the recorded operation identity without retry',async()=>{
 const s=diagnostic();s.gateway.commitMetadata=async c=>{s.calls.push({method:'commit',command:plain(c)});throw failure('OUTCOME_UNKNOWN','unknown');};
 await assert.rejects(s.get('createCloudMetadataCommitDiagnostic')(s.options).run(),e=>e.code==='OUTCOME_UNKNOWN');
 assert.equal(s.calls.filter(c=>c.method==='commit').length,1);assert.ok(s.identities.at(-1).operationId);assert.equal(s.messages.some(m=>m.startsWith('COMPLETE:')),false);
});
test('stale mutation unexpectedly accepted fails diagnostic instead of reporting success',async()=>{
 const s=diagnostic(),original=s.gateway.commitMetadata;let writes=0;
 s.gateway.commitMetadata=async c=>++writes===1?original(c):{scope:c.scope,operationId:c.operationId,baseRevision:'0',revision:'1',status:'committed',replayed:false,result:null};
 await assert.rejects(s.get('createCloudMetadataCommitDiagnostic')(s.options).run(),e=>e.code==='STALE_WRITE_ACCEPTED');assert.equal(s.messages.some(m=>m.startsWith('COMPLETE:')),false);
});
test('commit-test cleanup guards owner/UUID/revision, exact fixture, receipt identity and deletes no broad data',()=>{
 const s=diagnostic(),cleanup=s.get('cloudMetadataCommitDiagnosticCleanup'),sql=cleanup({ownerUserId:A,universeId:U,operationId:A});
 for(const text of [A,U,'for update','current_revision = 0','current_revision = 1','diagnostic-entry','attributes_json',
  'operation_id = expected_operation','base_revision = 0','resulting_revision = 1','test_universe_removed'])assert.ok(sql.includes(text));
 assert.ok(sql.startsWith('begin;')&&sql.endsWith('commit;'));assert.equal(/cascade/i.test(sql),false);assert.throws(()=>cleanup({ownerUserId:A,universeId:U,operationId:"'bad"}));
});
test('separate commit diagnostic HTML assets resolve, no normal-app link or inline code',()=>{
 const html=fs.readFileSync('dev/cloud-metadata-commit-diagnostic.html','utf8');
 for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g))assert.ok(fs.existsSync(require('node:path').resolve('dev',match[1])));
 assert.equal(/<script>/.test(html),false);assert.equal(fs.readFileSync('index.html','utf8').includes('cloud-metadata-commit-diagnostic'),false);
 assert.equal(/innerHTML|console\./.test(fs.readFileSync('dev/cloud-metadata-commit-diagnostic-page.js','utf8')),false);
});
