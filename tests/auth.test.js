const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const context=vm.createContext({URL,URLSearchParams,Blob,structuredClone,crypto:webcrypto,TextEncoder,TextDecoder,DOMException,setTimeout,clearTimeout});
for(const file of ['auth-config.js','services/supabase-auth.js','services/auth-service.js','tests/fake-auth.js','config.js','model.js','portals.js','constellations.js','archives.js','persistence/local-metadata-store.js','persistence/local-preferences-store.js','persistence/memory-stores.js','persistence/composition.js','services/universe-repository.js','services/local-backup.js','services/local-restore.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const get=name=>vm.runInContext(name,context),plain=value=>JSON.parse(JSON.stringify(value));
const fake=get('createFakeAuthAdapter'),service=get('createAuthService'),provider=get('createSupabaseAuthAdapter');
function disk(){const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}

test('blank configuration does not load the SDK; local Auth initialization is optional',async()=>{
 let loaded=0;const adapter=provider({config:{SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:''},loadSDK:()=>{loaded++;throw Error();}}),auth=service({adapter});
 await auth.initialize();assert.equal(loaded,0);assert.equal(auth.getState().available,false);assert.equal(auth.getState().user,null);
});
test('configured public project matches the exact CSP origin and preserves the pinned SDK policy',()=>{
 const config=get('cosmifoldAuthConfig'),settings=get('readPublicAuthConfiguration')(config);
 assert.equal(settings.url,'https://vaxijeucpakfzyfbjnyv.supabase.co');
 assert.ok(settings.key.startsWith('sb_publishable_'));
 const headers=fs.readFileSync('_headers','utf8'),policy=headers.match(/Content-Security-Policy: (.*)/)[1];
 const directives=Object.fromEntries(policy.split(';').map(part=>{const [name,...sources]=part.trim().split(/\s+/);return [name,sources];}));
 assert.deepEqual(directives['connect-src'],["'self'",'blob:',new URL(config.SUPABASE_URL).origin]);
 assert.deepEqual(directives['script-src'],["'self'",get('supabaseAuthSDK').url]);
 assert.equal(policy.includes('*'),false);
 assert.ok(headers.includes('Cache-Control: no-cache'));
});
test('configuration requires HTTPS root and a publishable key; Sample disables Auth entirely',async()=>{
 const read=get('readPublicAuthConfiguration');
 for(const config of [{SUPABASE_URL:'http://auth.example.invalid/',SUPABASE_PUBLISHABLE_KEY:'invalid'}, {SUPABASE_URL:'https://auth.example.invalid/',SUPABASE_PUBLISHABLE_KEY:'server-only-key'}, {SUPABASE_URL:'https://auth.example.invalid/path',SUPABASE_PUBLISHABLE_KEY:'invalid'}])assert.throws(()=>read(config));
 let loaded=0;const auth=service({adapter:provider({config:{SUPABASE_URL:'invalid'},disabled:true,loadSDK:()=>loaded++})});await auth.initialize();assert.equal(loaded,0);assert.equal(auth.getState().failed,false);
});
test('initialization is single, nonblocking, and retryable after a provider rejection',async()=>{
 const adapter=fake(),release=adapter.delayNext(),auth=service({adapter});const a=auth.initialize(),b=auth.initialize();
 assert.equal(auth.getState().ready,false);release();await Promise.all([a,b]);assert.deepEqual(plain(adapter.calls),['initialize']);
 const rejected=fake();rejected.rejectNext();const retry=service({adapter:rejected});await retry.initialize();assert.equal(retry.getState().failed,true);await retry.initialize();assert.equal(retry.getState().failed,false);
});
test('sign-up requires confirmation without claiming a session; active-session signup works',async()=>{
 const adapter=fake(),auth=service({adapter});await auth.initialize();
 assert.equal((await auth.signUp('member@example.invalid','test password')).confirmationRequired,true);assert.equal(auth.getState().user,null);
 adapter.setConfirmationRequired(false);await auth.signUp('member@example.invalid','test password');assert.equal(auth.getState().user.email,'member@example.invalid');
});
test('sign-in blocks duplicate requests, clears pending after rejection and accepts a later retry',async()=>{
 const adapter=fake(),auth=service({adapter});await auth.initialize();adapter.rejectNext();await assert.rejects(auth.signIn('a@example.invalid','bad'));assert.equal(auth.getState().busy,null);
 const release=adapter.delayNext(),pending=auth.signIn('a@example.invalid','test password');assert.equal(auth.getState().busy,'signIn');await assert.rejects(auth.signIn('a@example.invalid','test password'));release();await pending;assert.equal(adapter.calls.filter(c=>c==='signIn').length,2);
});
test('session recovery, identity changes and password recovery events expose no tokens',async()=>{
 const storage=disk(),adapter=fake({storage}),auth=service({adapter});await auth.initialize();await auth.signIn('a@example.invalid','test password');
 const reloaded=service({adapter:fake({storage})});await reloaded.initialize();assert.equal(reloaded.getState().user.email,'a@example.invalid');
 adapter.emit('PASSWORD_RECOVERY',{id:'a',email:'a@example.invalid',access_token:'NEVER_EXPOSE'});assert.equal(auth.getState().recovery,true);assert.deepEqual(plain(auth.getState().user),{id:'a',email:'a@example.invalid'});
 await auth.updatePassword('new test password');assert.equal(auth.getState().recovery,false);await auth.requestPasswordReset('a@example.invalid');
 adapter.emit('SIGNED_OUT',null);assert.equal(auth.getState().user,null);
});
test('SDK boundary uses pinned v2, persistent PKCE and supported methods; callback cleanup preserves navigation',async()=>{
 const config={SUPABASE_URL:'https://auth.example.invalid/',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_TEST_ONLY_FIXTURE'},location={href:'https://app.example.invalid/?code=TEST_CALLBACK&sample=false#contents'},history={state:{keep:true},replaceState(s,t,url){this.url=url;}};
 const session={user:{id:'u',email:'u@example.invalid'},access_token:'TEST_ONLY_ACCESS_MARKER',refresh_token:'TEST_ONLY_REFRESH_MARKER'};
 let callback,created,unsubscribed=0;const calls=[];
 const sdk={createClient(...args){created=args;return {auth:{
  onAuthStateChange(fn){callback=fn;return {data:{subscription:{unsubscribe(){unsubscribed++;}}}};},
  async getSession(){return {data:{session},error:null};},
  async signUp(args){calls.push(['signUp',args]);return {data:{user:session.user,session:null},error:null};},
  async signInWithPassword(args){calls.push(['signIn',args]);return {data:{session},error:null};},
  async signOut(args){calls.push(['signOut',args]);return {data:{},error:null};},
  async resetPasswordForEmail(...args){calls.push(['reset',...args]);return {data:{},error:null};},
  async updateUser(args){calls.push(['update',args]);return {data:{user:session.user},error:null};},stopAutoRefresh(){}
 }}}};
 const adapter=provider({config,loadSDK:async()=>sdk,location,history}),events=[];await adapter.initialize(e=>events.push(e));
 assert.deepEqual(plain(created[2].auth),{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'});
 callback('INITIAL_SESSION',session);assert.equal(history.url,undefined);callback('PASSWORD_RECOVERY',session);assert.equal(history.url,'/?sample=false#contents');assert.equal(events[1].event,'PASSWORD_RECOVERY');assert.equal(events[1].user.access_token,undefined);
 await adapter.signUp('u@example.invalid','pw');await adapter.signIn('u@example.invalid','pw');await adapter.requestPasswordReset('u@example.invalid');await adapter.updatePassword('new');await adapter.signOut();
 assert.equal(calls[0][1].options.emailRedirectTo,'https://app.example.invalid/');assert.equal(calls[2][2].redirectTo,'https://app.example.invalid/');assert.deepEqual(plain(calls[4][1]),{scope:'local'});
 adapter.dispose();assert.equal(unsubscribed,1);assert.equal(get('supabaseAuthSDK').version,'2.117.3');assert.ok(fs.readFileSync('_headers','utf8').includes(get('supabaseAuthSDK').url));
});
test('SDK session-recovery retry retains one client and one lifecycle subscription',async()=>{
 let clients=0,subscriptions=0,reads=0,callback;
 const sdk={createClient(){clients++;return {auth:{onAuthStateChange(fn){callback=fn;subscriptions++;return {data:{subscription:{unsubscribe(){}}}};},
  async getSession(){reads++;return reads===1?{error:new Error('Offline fixture')}:{data:{session:null},error:null};},stopAutoRefresh(){}}};}};
 const adapter=provider({config:{SUPABASE_URL:'https://auth.example.invalid/',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_TEST_ONLY_FIXTURE'},loadSDK:async()=>sdk});
 const auth=service({adapter});await auth.initialize();assert.equal(auth.getState().failed,true);
 await auth.initialize();assert.equal(auth.getState().failed,false);assert.equal(clients,1);assert.equal(subscriptions,1);
 callback('SIGNED_IN',{user:{id:'u',email:'u@example.invalid'},access_token:'TEST_ONLY_ACCESS_MARKER'});assert.equal(auth.getState().user.id,'u');auth.dispose();
});
test('accounts A/B and sign-out leave Cosmos, files and preferences identical; Backup/Restore exclude and preserve Auth',async()=>{
 const storage=disk(),metadata=get('createLocalMetadataStore')({storage:()=>storage}),preferences=get('createLocalPreferencesStore')({storage:()=>storage}),files=get('createMemoryFileStore')();
 const data={version:5,entries:[{id:'galaxy',name:'My local Cosmos',parentId:null,location:{text:'Tokyo'},content:{version:1,notes:{format:'plain',text:'Local note'},links:[],attachments:[{id:'photo',kind:'upload',entryId:'galaxy',storageKey:'photo',filename:'photo.png',mimeType:'image/png',size:3,createdAt:'2026-10-12T00:00:00Z'}]}}],layout:[],connections:[]};
 storage.setItem(metadata.key,JSON.stringify(data));await preferences.update({width:290});await files.save({key:'photo',entryId:'galaxy',blob:new Blob([new Uint8Array([0,128,255])],{type:'image/png'}),thumbnail:new Blob(['thumbnail'],{type:'image/webp'})});
 const repository=get('createUniverseRepository')({persistence:get('createPersistence')({metadata,preferences,files})});
 const adapter=fake({storage}),auth=service({adapter});await auth.initialize();const before=metadata.readForBackup().metadataText,prefs=preferences.readForBackup();
 await auth.signIn('a@example.invalid','test password');await auth.signOut();await auth.signIn('b@example.invalid','test password');
 assert.equal(metadata.readForBackup().metadataText,before);assert.equal(preferences.readForBackup(),prefs);assert.deepEqual([...new Uint8Array(await (await files.get('photo')).blob.arrayBuffer())],[0,128,255]);
 const backup=await get('cosmifoldBackup').create(repository);const manifest=JSON.stringify(backup.manifest);
 for(const secret of ['TEST_ONLY_ACCESS_MARKER','TEST_ONLY_REFRESH_MARKER','TEST_ONLY_PKCE_MARKER','test:auth-session','b@example.invalid','test password'])assert.equal(manifest.includes(secret),false);
 const session=storage.getItem('test:auth-session');await get('cosmifoldRestore').restore(await get('cosmifoldRestore').inspect(backup.blob),repository);
 assert.equal(storage.getItem('test:auth-session'),session);assert.equal(auth.getState().user.email,'b@example.invalid');assert.equal(metadata.readForBackup().metadataText,before);
});
