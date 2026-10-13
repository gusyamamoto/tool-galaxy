const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {A,U,B,plain}=require('./fake-cloud-gateway.js'),{environment,disk}=require('./fake-cloud-workspace.js');
function setup(){
 const e=environment({initial:{version:5,entries:[],layout:[],connections:[],portals:[],constellations:[],archivedGalaxies:[]}});
 e.auth.initialize=async()=>e.auth.getState();e.auth.signOut=async()=>{e.auth.emit(null);return {user:null};};e.auth.dispose=()=>{};
 e.gateway.createUniverse=async id=>{e.calls.push({method:'create',id});return e.remote();};e.gateway.dispose=()=>{};
 e.get('globalThis').crypto={randomUUID:()=> 'cache-diagnostic-context'};e.load('dev/cloud-cache-diagnostic.js');
 const storage=disk(),messages=[],identities=[],options={auth:e.auth,gateway:e.gateway,cache:e.cache,markers:()=>storage,location:{protocol:'http:',hostname:'127.0.0.1'},
  randomUUID:()=>U,report:message=>messages.push(message),onIdentity:identity=>identities.push(plain(identity))};
 return {...e,markers:storage,messages,identities,options};
}
test('diagnostic creates once, reload reuses exact marker/cache and confirms same revision',async()=>{
 const e=setup(),factory=e.get('createCloudCacheDiagnostic'),first=factory(e.options);
 assert.equal(e.calls.length,0);assert.equal((await first.run()).reopened,false);first.dispose();
 const next=factory(e.options);assert.equal((await next.run()).reopened,true);assert.equal(e.calls.filter(c=>c.method==='create').length,1);
 assert.equal(e.record().acknowledged.revision,'0');assert.ok(e.messages.some(message=>message.includes('reopened the same scoped')));
 assert.equal(JSON.stringify(e.identities).includes('access_token'),false);
});
test('sign-out fences prior/current cached readers and another account cannot reuse the marker',async()=>{
 const e=setup(),factory=e.get('createCloudCacheDiagnostic'),test=factory(e.options);await test.run();assert.equal((await test.signOutCheck()).status,'unauthenticated');
 e.auth.emit(B);const count=e.calls.length;await assert.rejects(test.run(),error=>error.code==='TEST_ACCOUNT_MISMATCH');assert.equal(e.calls.length,count);
 assert.ok(e.record().acknowledged);assert.ok(e.messages.some(message=>message.includes('sign-out closed')));
});
test('deliberately delayed actual gateway read is ignored after development-context disposal, without cache writes',async()=>{
 const e=setup(),test=e.get('createCloudCacheDiagnostic')(e.options);await test.run();const before=e.storage.getItem(e.cache.key({ownerUserId:A,universeId:U}));
 assert.equal((await test.delayedCheck()).status,'disposed');assert.equal(e.storage.getItem(e.cache.key({ownerUserId:A,universeId:U})),before);
});
test('development-only origin/sign-in guards run before creating a Universe',async()=>{
 const e=setup();await assert.rejects(e.get('createCloudCacheDiagnostic')({...e.options,location:{protocol:'https:',hostname:'tool-galaxy.pages.dev'}}).run(),error=>error.code==='LOCAL_DEVELOPMENT_ONLY');
 e.auth.emit(null);await assert.rejects(e.get('createCloudCacheDiagnostic')(e.options).run(),error=>error.code==='SIGN_IN_LOCALLY_FIRST');assert.equal(e.calls.length,0);
});
test('HTML assets resolve and normal app does not link/bootstrap the diagnostic',()=>{
 const html=fs.readFileSync('dev/cloud-cache-diagnostic.html','utf8');for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g))assert.ok(fs.existsSync(require('node:path').resolve('dev',match[1])));
 assert.equal(fs.readFileSync('index.html','utf8').includes('cloud-cache-diagnostic'),false);assert.equal(/innerHTML|console\./.test(fs.readFileSync('dev/cloud-cache-diagnostic-page.js','utf8')),false);
});
