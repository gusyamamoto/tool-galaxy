const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {A,U,B,plain,deferred}=require('./fake-cloud-gateway');
const {environment,fakeLocks}=require('./fake-cloud-workspace');
const config={applicationMode:'cloud-alpha',cloudEnabled:true,allowedOrigin:'https://alpha.example.invalid',localBetaOrigin:'https://beta.example.invalid'};
function setup(overrides={}){
    const e=environment();e.get('globalThis').crypto=require('node:crypto').webcrypto;e.load('alpha/foundation.js');
    const reads=[],storage={getItem(key){reads.push(key);return e.storage.getItem(key);},setItem:(...a)=>e.storage.setItem(...a),removeItem:key=>e.storage.removeItem(key)};
    const create=e.get('createTravelAlphaFoundation'),options={config,auth:e.auth,gateway:e.gateway,storage:()=>storage,locks:fakeLocks(),origin:config.allowedOrigin,newUniverseId:()=>U,...overrides};
    const alpha=create(options);return {...e,alpha,create,options,reads};
}
const creationKey=`cosmifold:travel-alpha:create:v1:${A}`;
const list=[{id:U,owner_id:A,revision:'0'}];
const empty=()=>({version:5,entries:[],connections:[],layout:[],portals:[],constellations:[],archivedGalaxies:[]});
function provision(e){let calls=0;
    e.setRemote(null);
    e.gateway.createUniverse=async id=>{calls++;assert.equal(JSON.parse(e.storage.getItem(creationKey)).universeId,id,'identity is durable before dispatch');
        const rows=plain(e.get('cosmifoldCloudProjection').toRelational(empty(),{ownerUserId:A,universeId:id,revision:'0'}).metadata);e.setRemote(rows);e.setList(list);return rows;};
    return ()=>calls;
}

test('source modes are explicit and disabled Alpha cannot be enabled by a URL or storage',async()=>{
    const c=vm.createContext({});for(const f of ['config.js','alpha/config.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
    assert.equal(vm.runInContext('cosmosConfig.applicationMode',c),'local-beta');
    assert.equal(vm.runInContext('cosmifoldAlphaConfig.applicationMode',c),'cloud-alpha');
    assert.equal(vm.runInContext('cosmifoldAlphaConfig.cloudEnabled',c),false);
    const e=setup({config:{...config,cloudEnabled:false}});e.storage.map.set('galaxy:user-data','PRESERVE');
    assert.equal(e.alpha.getState().dataset.snapshot.entries.length,0);assert.equal(e.alpha.getState().dataset.kind,'preview');
    for(const action of [()=>e.alpha.refresh(),()=>e.alpha.select(U),()=>e.alpha.createEmpty()])await assert.rejects(action,{code:'ALPHA_CLOUD_UNAVAILABLE'});
    assert.equal(e.calls.length,0);assert.equal(e.reads.length,0);assert.equal(e.storage.writes.length,0);
});

test('Alpha requires its exact independent origin and never accepts local-beta configuration',()=>{
    const e=setup();assert.throws(()=>e.create({...e.options,config:{applicationMode:'local-beta'}}));
    for(const patch of [{origin:config.localBetaOrigin},{origin:'https://unexpected.invalid'},{config:{...config,localBetaOrigin:''}}]){
        const a=e.create({...e.options,...patch});assert.equal(a.getState().cloudEnabled,false);assert.equal(a.getState().dataset.kind,'preview');a.dispose();
    }
});

test('discovery never selects or seeds; explicit owned selection uses a fenced read-only snapshot',async()=>{
    const e=setup();e.setList(list);
    const protectedKeys=['galaxy:user-data','galaxy:navigation-ui','sb-project-auth-token',`cosmifold:cloud-cache:v1:${A}:${U}`];
    protectedKeys.forEach(key=>e.storage.map.set(key,'PRESERVE:'+key));
    await e.alpha.refresh();assert.equal(e.alpha.getState().dataset.kind,'preview');assert.equal(e.calls.length,0);
    await assert.rejects(()=>e.alpha.select(B),{code:'ALPHA_DATASET_NOT_LISTED'});
    await e.alpha.select(U);const state=e.alpha.getState();assert.equal(state.status,'loaded');assert.equal(state.readOnly,true);
    assert.equal(state.dataset.kind,'cloud');assert.equal(state.dataset.scope.ownerUserId,A);
    state.dataset.snapshot.entries.length=0;assert.ok(e.alpha.getState().dataset.snapshot.entries.length>0);
    assert.equal(e.alpha.repository,undefined);assert.equal(e.alpha.save,undefined);
    assert.ok(e.reads.every(key=>key.startsWith('cosmifold:travel-alpha:')));
    assert.ok(e.storage.writes.every(w=>w.key.startsWith('cosmifold:travel-alpha:')));
    protectedKeys.forEach(key=>assert.equal(e.storage.map.get(key),'PRESERVE:'+key));
});

test('an unowned discovery response cannot publish another account dataset',async()=>{
    const e=setup();e.setList([{id:U,owner_id:B,revision:'0'}]);await e.alpha.refresh();
    assert.equal(e.alpha.getState().status,'lookup-failed');assert.equal(e.alpha.getState().dataset.kind,'preview');
    assert.equal(e.alpha.getState().universes.length,0);assert.equal(e.calls.length,0);
});

test('explicit provisioning creates and confirms only a fresh empty revision-zero Universe',async()=>{
    const e=setup(),calls=provision(e);await e.alpha.createEmpty();
    assert.equal(calls(),1);assert.equal(e.alpha.getState().status,'loaded');
    assert.deepEqual(plain(e.alpha.getState().dataset.snapshot),empty());
    assert.equal(e.alpha.getState().dataset.revision,'0');assert.equal(e.storage.getItem(creationKey),null);
    assert.equal(e.calls.filter(c=>c.method==='commit').length,0);
});

test('uncertain creation survives reload and reads the same identity without a second create',async()=>{
    const e=setup(),create=provision(e),original=e.gateway.createUniverse;
    e.gateway.createUniverse=async id=>{await original(id);throw Object.assign(Error(),{code:'OUTCOME_UNKNOWN'});};
    await e.alpha.createEmpty();assert.equal(e.alpha.getState().status,'creation-uncertain');
    await e.alpha.createEmpty();assert.equal(create(),1);
    e.alpha.dispose();const next=e.create(e.options);await next.refresh();
    assert.equal(next.getState().dataset.kind,'cloud');assert.equal(next.getState().dataset.scope.universeId,U);
    assert.equal(create(),1);assert.equal(e.storage.getItem(creationKey),null);
});

test('a genuinely absent uncertain Universe stays unresolved without resubmission',async()=>{
    const e=setup();let creates=0;e.gateway.createUniverse=async()=>{creates++;throw Error('network unavailable');};
    await e.alpha.createEmpty();await e.alpha.refresh();await e.alpha.createEmpty();
    assert.equal(creates,1);assert.equal(e.alpha.getState().status,'creation-uncertain');
    assert.equal(JSON.parse(e.storage.getItem(creationKey)).universeId,U);
});

test('unreadable creation state and failed durable preparation block all creation',async()=>{
    const e=setup();let creates=0;e.gateway.createUniverse=async()=>{creates++;throw Error();};
    e.storage.map.set(creationKey,'{invalid');await e.alpha.createEmpty();assert.equal(creates,0);assert.equal(e.storage.getItem(creationKey),'{invalid');
    e.storage.map.delete(creationKey);e.storage.setItem=()=>{throw Error('quota');};await e.alpha.createEmpty();assert.equal(creates,0);
});

test('a colliding/nonempty create response never overwrites or selects existing content',async()=>{
    const e=setup(),original=e.remote();e.gateway.createUniverse=async()=>original;
    await e.alpha.createEmpty();assert.equal(e.alpha.getState().error,'ALPHA_CREATED_UNIVERSE_NOT_EMPTY');
    assert.equal(e.alpha.getState().dataset.kind,'preview');assert.deepEqual(e.remote(),original);assert.equal(e.calls.length,0);
});

test('sign-out clears data immediately and late account-A reads cannot publish into B',async()=>{
    const e=setup();e.setList(list);await e.alpha.refresh();const held=deferred();e.gateway.readUniverse=()=>held.promise;
    const reading=e.alpha.select(U);await new Promise(r=>setImmediate(r));e.auth.emit(B);
    assert.equal(e.alpha.getState().dataset.kind,'preview');assert.equal(e.alpha.getState().user.id,B);
    held.resolve({status:'found',metadata:e.remote()});await reading;
    assert.equal(e.alpha.getState().dataset.kind,'preview');e.auth.emit(null);
    assert.equal(e.alpha.getState().user,null);assert.equal(e.alpha.getState().universes.length,0);
});

test('late creation after an account change is retained only under its original owner',async()=>{
    const e=setup(),held=deferred();e.gateway.createUniverse=()=>held.promise;
    const creating=e.alpha.createEmpty();await new Promise(r=>setImmediate(r));
    await assert.rejects(()=>e.alpha.refresh(),{code:'ALPHA_CREATION_BUSY'});e.auth.emit(B);
    held.resolve(plain(e.get('cosmifoldCloudProjection').toRelational(empty(),{ownerUserId:A,universeId:U,revision:'0'}).metadata));await creating;
    assert.equal(e.alpha.getState().user.id,B);assert.equal(e.alpha.getState().dataset.kind,'preview');
    assert.equal(JSON.parse(e.storage.getItem(creationKey)).ownerUserId,A);assert.equal(e.calls.length,0);
});

test('two Alpha contexts cannot provision simultaneously for the same owner',async()=>{
    const e=setup(),held=deferred();let calls=0;e.setRemote(null);e.gateway.createUniverse=()=>{calls++;return held.promise;};
    const peer=e.create(e.options),first=e.alpha.createEmpty();await new Promise(r=>setImmediate(r));await peer.createEmpty();
    assert.equal(calls,1);assert.equal(peer.getState().error,'ALPHA_CREATION_BUSY');
    const rows=plain(e.get('cosmifoldCloudProjection').toRelational(empty(),{ownerUserId:A,universeId:U,revision:'0'}).metadata);
    e.setRemote(rows);held.resolve(rows);await first;assert.equal(e.alpha.getState().dataset.snapshot.entries.length,0);assert.equal(calls,1);
});

test('a failed view observer cannot interrupt dataset/session fencing',async()=>{
    const e=setup();e.setList(list);e.alpha.subscribe(()=>{});
    const remove=e.alpha.subscribe(()=>{});remove();
    // The immediate initial observer call is deliberate; later publications
    // must remain isolated from presentation errors.
    let first=true;e.alpha.subscribe(()=>{if(first){first=false;return;}throw Error('view failed');});
    await e.alpha.refresh();await e.alpha.select(U);e.auth.emit(null);
    assert.equal(e.alpha.getState().dataset.kind,'preview');assert.equal(e.alpha.getState().user,null);
});

test('isolated Auth storage is opt-in and the beta SDK options stay unchanged',async()=>{
    const options=[],sdk={createClient:(url,key,value)=>{options.push(value);return {auth:{stopAutoRefresh(){}}};}};
    const c=vm.createContext({URL,cosmifoldAuthConfig:{},setTimeout,clearTimeout});vm.runInContext(fs.readFileSync('services/supabase-client.js','utf8'),c);
    const provider=vm.runInContext('createSupabaseClientProvider',c),publicConfig={SUPABASE_URL:'https://example.supabase.co/',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_TEST_ONLY_FIXTURE'};
    await provider({config:publicConfig,loadSDK:async()=>sdk}).getClient();
    await provider({config:publicConfig,loadSDK:async()=>sdk,storageKey:'cosmifold:travel-alpha:auth:v1'}).getClient();
    assert.equal(options[0].auth.storageKey,undefined);assert.equal(options[1].auth.storageKey,'cosmifold:travel-alpha:auth:v1');
    assert.throws(()=>provider({storageKey:'sb-project-auth-token'}));
});
