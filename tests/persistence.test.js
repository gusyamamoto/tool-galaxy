const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const {test} = require('node:test');
const context = vm.createContext({Blob, structuredClone, URL});
for (const file of ['config.js','model.js','portals.js','constellations.js','persistence/local-metadata-store.js',
    'persistence/local-preferences-store.js','persistence/memory-stores.js','persistence/composition.js','services/universe-repository.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
const local = vm.runInContext('createLocalMetadataStore',context), prefs = vm.runInContext('createLocalPreferencesStore',context);
const memory = vm.runInContext('createMemoryMetadataStore',context), memoryFiles = vm.runInContext('createMemoryFileStore',context);
const compose = vm.runInContext('createPersistence',context), createRepository = vm.runInContext('createUniverseRepository',context);
const plain = value => JSON.parse(JSON.stringify(value));
const snapshot = () => ({entries:[{id:'g',name:'Same name',parentId:null,x:1,y:2},{id:'a',name:'Same name',parentId:'g',x:3,y:4},
    {id:'keep',name:'Same name',parentId:null}],layout:[{id:'a',parentId:'g',radius:50}],
    portals:[{id:'p',targetEntryId:'a',parentEntryId:'keep',createdAt:'2026-01-01T00:00:00Z'}],
    constellations:[{id:'c',name:'Week',memberEntryIds:['a','keep'],createdAt:'2026-01-01T00:00:00Z'}]});
function storage() { const data = new Map(); return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}; }
function setup() {
    const metadata = memory(snapshot()), files = memoryFiles();
    const persistence = compose({metadata,files,preferences:{load:()=>({}),update:()=>{}}});
    return {metadata,files,persistence,repo:createRepository({persistence})};
}
test('default local keys, scoped data and independent UI preferences round-trip without migration', () => {
    const browser = storage(), source = () => browser;
    const original = local({storage:source}), scoped = local({storage:source,scope:'account/workspace'}), other = local({storage:source,scope:'another'});
    original.save(snapshot());scoped.save({...snapshot(),entries:[]});
    assert.equal(JSON.parse(browser.data.get('galaxy:user-data')).version,5);
    assert.equal(original.load().entries.length,3);assert.equal(scoped.load().entries.length,0);assert.equal(other.load(),null);
    const ui = prefs({storage:source}), workspaceUi = prefs({storage:source,scope:'account/workspace'});
    ui.update({universeCollapsed:true});ui.update({archivedCollapsed:false});workspaceUi.update({width:200});
    assert.deepEqual(plain(ui.load()),{universeCollapsed:true,archivedCollapsed:false});assert.deepEqual(plain(workspaceUi.load()),{width:200});
    scoped.clear();assert.equal(scoped.load(),null);assert.equal(original.load().entries.length,3);
});
test('optional corrupt or inaccessible preferences recover without overwriting domain metadata', () => {
    const browser=storage();browser.data.set('galaxy:navigation-ui','[]');const ui=prefs({storage:()=>browser});
    assert.deepEqual(plain(ui.load()),{});ui.update({width:260});assert.equal(ui.load().width,260);
    const denied=prefs({storage:()=>{throw new Error('denied')}});assert.deepEqual(plain(denied.load()),{});assert.doesNotThrow(()=>denied.update({width:180}));
});
test('Sample forcibly selects disposable stores even if real adapters were supplied', async () => {
    const forbidden=new Proxy({}, {get(){throw new Error('real adapter accessed')}});
    const sample=compose({sample:true,sampleSnapshot:snapshot(),metadata:forbidden,files:forbidden,preferences:forbidden});
    const repo=createRepository({persistence:sample});let emitted=0;repo.subscribe(()=>emitted++);
    repo.archive(repo.load(),{galaxyId:'g',archivedAt:'2026-01-01T00:00:00Z'});
    await sample.files.save({key:'sample',entryId:'a',blob:new Blob(['safe'])});
    sample.preferences.update({universeCollapsed:true});assert.equal(sample.preferences.load().universeCollapsed,true);
    assert.equal(await (await sample.files.get('sample')).blob.text(),'safe');assert.equal(repo.load().archivedGalaxies[0].galaxyId,'g');assert.equal(emitted,0);
    sample.metadata.clear();assert.equal(sample.metadata.load(),null);
});
test('metadata errors preserve quota classification, cause, operation and scope', () => {
    const cause=Object.assign(new Error('Full'),{name:'QuotaExceededError'}),{persistence,repo}=setup();
    // Test the real wrapping boundary rather than replacing its public method.
    const composed=compose({config:{workspaceId:'me'},metadata:{save(){throw cause}},files:{},preferences:{}});
    assert.throws(()=>createRepository({persistence:composed}).save(snapshot()), error => error.name==='QuotaExceededError'&&error.cause===cause&&error.store==='metadata'&&error.operation==='save'&&error.scope==='me');
    assert.equal(composed.diagnostics.lastError.cause,cause);
});
test('controlled writes expose typed intent only after success and observer failures cannot invalidate saves', () => {
    const {repo,persistence}=setup(),events=[];const unsubscribe=repo.subscribe(event=>events.push(plain(event)));
    repo.subscribe(()=>{throw new Error('observer')});repo.restore(snapshot(),'g');
    assert.equal(events[0].type,'galaxy.restored');assert.deepEqual(events[0].ids,['g']);assert.equal(repo.lastObserverError.message,'observer');
    const before=plain(repo.load());persistence.metadata.save=()=>{throw new Error('quota')};
    assert.throws(()=>repo.archive(snapshot(),{galaxyId:'g'}),/quota/);assert.deepEqual(plain(repo.load()),before);assert.equal(events.length,1);unsubscribe();
});
test('archive/restore and Constellations preserve stable IDs, content, layout and shared placements', () => {
    const {repo}=setup(),original=snapshot();repo.archive(original,{galaxyId:'g',archivedAt:'2026-01-01T00:00:00Z'});
    assert.deepEqual(plain(repo.load().entries),original.entries);assert.deepEqual(plain(repo.load().portals),original.portals);
    repo.restore(repo.load(),'g');assert.deepEqual(plain(repo.load().layout),original.layout);assert.deepEqual(plain(repo.load().archivedGalaxies),[]);
    const next=repo.replaceConstellations(repo.load(),[{...original.constellations[0],name:'Weekend'}]);
    assert.ok(next[0].updatedAt);assert.deepEqual(plain(repo.load().constellations),plain(next));
    assert.equal(repo.replaceConstellations(repo.load(),next)[0].updatedAt,next[0].updatedAt,'unchanged collections retain their timestamp');
});
test('content updates use IDs, retain legacy optional lifecycle fields, and restore complete metadata on recovery', () => {
    const {repo}=setup(),content={version:1,notes:{format:'plain',text:'Packing'},links:[],attachments:[]};
    const updated=repo.updateContent(repo.load(),'a',content);assert.ok(updated.updatedAt);assert.equal(updated.createdAt,undefined);
    assert.equal(repo.load().entries.find(e=>e.id==='g').content,undefined,'duplicate display names are not identity');
    const recovered=repo.updateContent(repo.load(),'a',undefined,{});assert.equal(recovered.updatedAt,undefined);assert.equal(recovered.content,undefined);
});
test('compound subtree deletion removes bytes, placements, memberships and layout in one intent', async () => {
    const {repo,files}=setup(),events=[];repo.subscribe(event=>events.push(event));
    await files.save({key:'file-a',entryId:'a',blob:new Blob(['A'])});await files.save({key:'file-keep',entryId:'keep',blob:new Blob(['K'])});
    await repo.deleteSubtree(repo.load(),['g','a']);
    assert.deepEqual(plain(repo.load().entries).map(e=>e.id),['keep']);assert.deepEqual(plain(repo.load().portals),[]);
    assert.deepEqual(plain(repo.load().constellations[0].memberEntryIds),['keep']);assert.deepEqual(plain(repo.load().layout),[]);
    assert.ok(repo.load().constellations[0].updatedAt,'compound membership cleanup has a lifecycle timestamp too');
    assert.equal(await files.get('file-a'),null);assert.equal(await (await files.get('file-keep')).blob.text(),'K');assert.equal(events.length,1);assert.equal(events[0].type,'items.deleted');
});
test('failed metadata or changed-subtree validation preserves every part of a compound delete', async () => {
    const {repo,files,persistence}=setup(),before=plain(repo.load());await files.save({key:'a',entryId:'a',blob:new Blob(['A'])});
    await assert.rejects(repo.deleteSubtree(repo.load(),['a'],{validate(){throw new Error('changed')}}),/changed/);
    persistence.metadata.save=()=>{throw new Error('quota')};await assert.rejects(repo.deleteSubtree(repo.load(),['a']),/quota/);
    assert.deepEqual(plain(repo.load()),before);assert.equal(await (await files.get('a')).blob.text(),'A');
});
test('late file abort compensates metadata before rejecting and emits no successful deletion', async () => {
    const {repo,persistence}=setup(),before=plain(repo.load()),events=[];repo.subscribe(event=>events.push(event));
    persistence.files.deleteEntries=async(ids,commit,rollback)=>{commit();rollback();throw new Error('late abort')};
    await assert.rejects(repo.deleteSubtree(repo.load(),['a']),/late abort/);assert.deepEqual(plain(repo.load()),before);assert.equal(events.length,0);
});
test('a queued subtree deletion reads current state at commit and cannot lose unrelated content', async () => {
    const {repo,persistence}=setup(),old=repo.load();let latest=repo.load();
    persistence.files.deleteEntries=async(ids,commit)=>{
        latest.entries.find(entry=>entry.id==='keep').content={version:1,notes:{format:'plain',text:'Finished while deletion queued'},links:[],attachments:[]};
        commit();
    };
    await repo.deleteSubtree(old,['a'],{readSnapshot:()=>latest});
    assert.equal(repo.load().entries.find(entry=>entry.id==='keep').content.notes.text,'Finished while deletion queued');
});
test('read-only recovery rejects writes and async-only metadata adapters fail explicitly', () => {
    const {persistence}=setup();assert.throws(()=>createRepository({persistence,canWrite:()=>false}).save(snapshot()),/preserved/);
    const asyncOnly=compose({metadata:{save:async()=>{}},files:{},preferences:{}});
    assert.throws(()=>createRepository({persistence:asyncOnly}).save(snapshot()),/synchronous/);
});
