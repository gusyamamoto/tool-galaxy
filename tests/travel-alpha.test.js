const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {A,U,B,plain,deferred,failure}=require('./fake-cloud-gateway');
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

test('discovery never selects or seeds; explicit owned selection exposes only fenced allowlisted writes',async()=>{
    const e=setup();e.setList(list);
    const protectedKeys=['galaxy:user-data','galaxy:navigation-ui','sb-project-auth-token',`cosmifold:cloud-cache:v1:${A}:${U}`];
    protectedKeys.forEach(key=>e.storage.map.set(key,'PRESERVE:'+key));
    await e.alpha.refresh();assert.equal(e.alpha.getState().dataset.kind,'preview');assert.equal(e.calls.length,0);
    await assert.rejects(()=>e.alpha.select(B),{code:'ALPHA_DATASET_NOT_LISTED'});
    await e.alpha.select(U);const state=e.alpha.getState();assert.equal(state.status,'loaded');assert.equal(state.readOnly,false);
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

async function opened(options={}){const e=setup(options);e.setList(list);await e.alpha.refresh();await e.alpha.select(U);return e;}
const edit=e=>e.alpha.getState().dataset.context;
const commits=e=>e.calls.filter(call=>call.method==='commit');
test('create Galaxy and nested Item, rename, then reload from authoritative server and a fresh controller',async()=>{
    const e=await opened(),context=edit(e);
    const root=await e.alpha.createItem({name:'Mexico',context});
    const child=await e.alpha.createItem({name:'Hotel',parentId:root,context});
    await e.alpha.renameItem({id:child,name:'Oaxaca hotel',context});
    assert.equal(e.alpha.getState().writeStatus,'saved');assert.equal(e.alpha.getState().dataset.revision,'3');
    const saved=e.alpha.getState().dataset.snapshot;
    await e.alpha.reload();assert.deepEqual(e.alpha.getState().dataset.snapshot,saved);
    assert.notEqual(edit(e),context);e.alpha.dispose();const next=e.create(e.options);await next.refresh();await next.select(U);
    const snapshot=next.getState().dataset.snapshot;assert.equal(snapshot.entries.find(n=>n.id===child).name,'Oaxaca hotel');
    assert.equal(snapshot.entries.find(n=>n.id===child).parentId,root);assert.equal(commits(e).length,3);
    assert.equal(commits(e)[0].command.type,'items.created');assert.equal(commits(e)[2].command.type,'items.renamed');
});
test('Saving shows only acknowledged bodies, blocks duplicate writes and navigation, then publishes once',async()=>{
    const e=await opened(),held=deferred(),original=e.gateway.commitMetadata,context=edit(e),before=e.alpha.getState().dataset.snapshot;
    e.gateway.commitMetadata=async command=>{await held.promise;return original(command);};
    const creating=e.alpha.createItem({name:'Held',context});await new Promise(r=>setImmediate(r));
    assert.equal(e.alpha.getState().writeStatus,'saving');assert.equal(e.alpha.getState().readOnly,true);
    assert.deepEqual(e.alpha.getState().dataset.snapshot,before);
    for(const action of [()=>e.alpha.createItem({name:'Duplicate',context}),()=>e.alpha.reload(),()=>e.alpha.refresh(),()=>e.alpha.select(U),()=>e.alpha.createEmpty()])await assert.rejects(action,{code:'ALPHA_WRITE_BUSY'});
    held.resolve();await creating;assert.equal(e.alpha.getState().writeStatus,'saved');assert.equal(e.alpha.getState().readOnly,false);assert.equal(commits(e).length,1);
});
test('definite rejection displays Failed, keeps confirmed content, and permits a separate explicit retry',async()=>{
    const e=await opened(),original=e.gateway.commitMetadata,before=e.alpha.getState().dataset.snapshot;
    e.gateway.commitMetadata=async()=>{throw failure('FORBIDDEN');};
    await assert.rejects(()=>e.alpha.renameItem({id:'tokyo',name:'Rejected',context:edit(e)}),{code:'FORBIDDEN'});
    assert.equal(e.alpha.getState().writeStatus,'failed');assert.deepEqual(e.alpha.getState().dataset.snapshot,before);
    assert.equal(e.alpha.getState().readOnly,false);e.gateway.commitMetadata=original;
    await e.alpha.renameItem({id:'tokyo',name:'Accepted',context:edit(e)});assert.equal(e.alpha.getState().writeStatus,'saved');
});
test('revision conflict blocks further writes until explicit authoritative reload, preserving remote edits',async()=>{
    const e=await opened(),remote=e.remote();remote.universe.revision='1';remote.entries.find(r=>r.id==='tokyo').name='Other device';e.setRemote(remote);
    await assert.rejects(()=>e.alpha.renameItem({id:'tokyo',name:'Stale rename',context:edit(e)}),{code:'REVISION_CONFLICT'});
    assert.equal(e.alpha.getState().writeStatus,'failed');assert.equal(e.alpha.getState().readOnly,true);
    assert.equal(e.remote().entries.find(r=>r.id==='tokyo').name,'Other device');
    await assert.rejects(()=>e.alpha.createItem({name:'Blocked',context:edit(e)}),{code:'ALPHA_READ_ONLY'});
    await e.alpha.reload();assert.equal(e.alpha.getState().dataset.snapshot.entries.find(r=>r.id==='tokyo').name,'Other device');
    await e.alpha.renameItem({id:'tokyo',name:'Reviewed change',context:edit(e)});assert.equal(e.alpha.getState().dataset.revision,'2');
});
test('lost response with a receipt resolves once with the original operation and no repeated commit',async()=>{
    const e=await opened(),original=e.gateway.commitMetadata;
    e.gateway.commitMetadata=async command=>{await original(command);throw failure('OUTCOME_UNKNOWN','unknown');};
    await e.alpha.renameItem({id:'tokyo',name:'Receipt confirmed',context:edit(e)});
    assert.equal(e.alpha.getState().writeStatus,'saved');assert.equal(commits(e).length,1);
    assert.equal(e.calls.find(c=>c.method==='receipt').id,commits(e)[0].command.operationId);
});
test('interrupted committed write remains Unresolved across reload until its original receipt is available',async()=>{
    const e=await opened(),original=e.gateway.commitMetadata,receipt=e.gateway.getOperationReceipt;
    e.gateway.commitMetadata=async command=>{await original(command);throw failure('OUTCOME_UNKNOWN','unknown');};
    e.gateway.getOperationReceipt=async()=>{throw failure('NETWORK_UNAVAILABLE');};
    await assert.rejects(()=>e.alpha.renameItem({id:'tokyo',name:'Interrupted',context:edit(e)}),{code:'OUTCOME_UNKNOWN'});
    assert.equal(e.alpha.getState().writeStatus,'unresolved');assert.equal(e.alpha.getState().readOnly,true);
    assert.equal(e.alpha.getState().dataset.snapshot.entries.find(r=>r.id==='tokyo').name,'Tokyo');
    e.alpha.dispose();const next=e.create(e.options);await next.refresh();await next.select(U);
    assert.equal(next.getState().writeStatus,'unresolved');assert.equal(next.getState().readOnly,true);
    await assert.rejects(()=>next.renameItem({id:'tokyo',name:'Duplicate',context:next.getState().dataset.context}),{code:'ALPHA_READ_ONLY'});
    e.gateway.getOperationReceipt=receipt;await next.reload();assert.equal(next.getState().writeStatus,'saved');
    assert.equal(next.getState().dataset.snapshot.entries.find(r=>r.id==='tokyo').name,'Interrupted');assert.equal(commits(e).length,1);
});
test('missing receipt never unlocks a pending operation or automatically resends it',async()=>{
    const e=await opened();let calls=0;e.gateway.commitMetadata=async()=>{calls++;throw failure('OUTCOME_UNKNOWN','unknown');};
    await assert.rejects(()=>e.alpha.createItem({name:'Unconfirmed',context:edit(e)}),{code:'OUTCOME_UNKNOWN'});
    await e.alpha.reload();await e.alpha.reload();assert.equal(e.alpha.getState().writeStatus,'unresolved');assert.equal(calls,1);
    assert.ok(!e.alpha.getState().dataset.snapshot.entries.some(r=>r.name==='Unconfirmed'));
});
test('timed-out requests retain pending identity and cannot publish late replies',async()=>{
    const e=await opened({requestTimeoutMs:20}),held=deferred();let command;e.gateway.commitMetadata=input=>{command=input;return held.promise;};
    await assert.rejects(()=>e.alpha.renameItem({id:'tokyo',name:'Late',context:edit(e)}),{code:'OUTCOME_UNKNOWN'});
    assert.equal(e.alpha.getState().writeStatus,'unresolved');held.resolve(e.apply(command));await new Promise(r=>setImmediate(r));
    assert.equal(e.alpha.getState().writeStatus,'unresolved');assert.equal(e.alpha.getState().dataset.snapshot.entries.find(r=>r.id==='tokyo').name,'Tokyo');
    await e.alpha.reload();assert.equal(e.alpha.getState().dataset.snapshot.entries.find(r=>r.id==='tokyo').name,'Late');
});
test('account switch during write clears all data; late acknowledgement and old editor context cannot leak into B',async()=>{
    const e=await opened(),held=deferred(),original=e.gateway.commitMetadata,context=edit(e);
    e.gateway.commitMetadata=async command=>{await held.promise;return original(command);};
    const writing=e.alpha.renameItem({id:'tokyo',name:'A private rename',context});await new Promise(r=>setImmediate(r));e.auth.emit(B);
    assert.equal(e.alpha.getState().dataset.kind,'preview');assert.equal(e.alpha.getState().writeStatus,'idle');
    held.resolve();await assert.rejects(writing,{code:'ALPHA_CONTEXT_CHANGED'});
    assert.equal(e.alpha.getState().user.id,B);assert.equal(e.alpha.getState().dataset.snapshot.entries.length,0);
    await assert.rejects(()=>e.alpha.createItem({name:'Old form',context}),{code:'ALPHA_CONTEXT_CHANGED'});
    e.auth.emit(A);await e.alpha.refresh();await e.alpha.select(U);
    assert.equal(e.alpha.getState().dataset.snapshot.entries.find(r=>r.id==='tokyo').name,'A private rename');assert.equal(commits(e).length,1);
});
test('cache-only data stays read-only and cannot claim Saved after failed authoritative reload',async()=>{
    const e=await opened();e.gateway.readUniverse=async()=>{throw failure('NETWORK_UNAVAILABLE');};await e.alpha.reload();
    assert.equal(e.alpha.getState().readOnly,true);assert.equal(e.alpha.getState().writeStatus,'failed');
    await assert.rejects(()=>e.alpha.createItem({name:'Offline',context:edit(e)}),{code:'ALPHA_READ_ONLY'});assert.equal(commits(e).length,0);
});
test('create/rename reject stale forms and unsupported hierarchy edits without touching beta storage',async()=>{
    const e=await opened(),context=edit(e),protectedKeys=['galaxy:user-data','galaxy:navigation-ui','sb-project-auth-token'];
    protectedKeys.forEach(key=>e.storage.map.set(key,'BETA:'+key));
    for(const input of [{name:'',context},{name:'x'.repeat(61),context},{name:'Missing parent',parentId:'missing',context},{name:'Archive child',parentId:'archive',context}])await assert.rejects(()=>e.alpha.createItem(input));
    await assert.rejects(()=>e.alpha.renameItem({id:'archived-note',name:'Hidden',context}));
    await e.alpha.reload();await assert.rejects(()=>e.alpha.renameItem({id:'tokyo',name:'Old form',context}),{code:'ALPHA_CONTEXT_CHANGED'});
    await e.alpha.renameItem({id:'tokyo',name:'New form',context:edit(e)});
    assert.equal(e.alpha.save,undefined);assert.equal(e.alpha.updateContent,undefined);assert.equal(e.alpha.deleteSubtree,undefined);
    protectedKeys.forEach(key=>assert.equal(e.storage.map.get(key),'BETA:'+key));
    assert.ok(e.storage.writes.every(w=>w.key.startsWith('cosmifold:travel-alpha:')));assert.ok(e.reads.every(key=>key.startsWith('cosmifold:travel-alpha:')));
});
test('a second context cannot edit over a new acknowledged cache revision',async()=>{
    const e=await opened(),peer=e.create(e.options);await peer.refresh();await peer.select(U);
    await e.alpha.renameItem({id:'tokyo',name:'First tab',context:edit(e)});
    await assert.rejects(()=>peer.renameItem({id:'tokyo',name:'Stale tab',context:peer.getState().dataset.context}),{code:'CACHE_BASE_CHANGED'});
    assert.equal(peer.getState().readOnly,true);assert.equal(peer.getState().writeStatus,'failed');assert.equal(commits(e).length,1);
    await peer.reload();assert.equal(peer.getState().dataset.snapshot.entries.find(r=>r.id==='tokyo').name,'First tab');
});
