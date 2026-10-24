const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {createLockManager}=require('./local-write-fixture');
const fixture=()=>({version:5,entries:[{id:'root',name:'Travel',parentId:null},{id:'child',name:'Keep me',parentId:'root'}],layout:[]});
function setup(raw){
    const data=new Map([['galaxy:user-data',raw]]),writes=[];
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{writes.push(key);data.set(key,value);},removeItem:key=>data.delete(key)};
    const ctx=vm.createContext({URL,localStorage:storage,navigator:{locks:createLockManager()}});
    for(const file of ['model.js','persistence/local-metadata-store.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
    return {data,writes,store:vm.runInContext('createLocalMetadataStore()',ctx),model:vm.runInContext('galaxyModel',ctx)};
}
const invalid={
    orphan:data=>data.entries[1].parentId='missing',
    duplicate:data=>data.entries.push({...data.entries[0],name:'Other original'}),
    selfParent:data=>data.entries[0].parentId='root',
    cycle:data=>data.entries[0].parentId='child',
    parentType:data=>data.entries[1].parentId=12,
    nameType:data=>data.entries[0].name=12,
    categoryType:data=>data.entries[0].category=[],
    location:data=>data.entries[0].location={text:12},
    completed:data=>data.entries[1].completed='true',
    nestedLists:data=>{data.entries[0].taskList=true;data.entries[1].taskList=true;},
    taskChildren:data=>{data.entries[0].taskList=true;data.entries.push({id:'grandchild',name:'Forbidden',parentId:'child'});},
    constellation:data=>data.constellations=[{id:'c',name:'Keep membership',memberEntryIds:['missing'],createdAt:'2026-01-01T00:00:00Z'}],
    duplicateCollection:data=>data.constellations=[{id:'root',name:'Collision',memberEntryIds:[],createdAt:'2026-01-01T00:00:00Z'}],
    portal:data=>data.portals=[{id:'p',targetEntryId:'missing',parentEntryId:'root',createdAt:'2026-01-01T00:00:00Z'}],
    archive:data=>data.archivedGalaxies=[{galaxyId:'child',archivedAt:'2026-01-01T00:00:00Z'}],
    content:data=>data.entries[0].content={version:1,notes:{format:'plain',text:'Keep these notes'},links:[],attachments:[{id:'invalid'}]},
    timestamps:data=>data.entries[0].createdAt='not a date'
};
for(const [name,mutate] of Object.entries(invalid))test(`structural corruption (${name}) preserves exact bytes and rejects all ordinary writes`,async()=>{
    const snapshot=fixture();mutate(snapshot);const raw=JSON.stringify(snapshot,null,2),{store,data,writes}=setup(raw);
    let staleEvents=0;store.subscribeStale(()=>staleEvents++);
    assert.throws(()=>store.load(),{code:'LOCAL_DATA_STRUCTURE'});
    assert.throws(()=>store.save({entries:[],layout:[]}),{code:'LOCAL_DATA_STRUCTURE'});
    assert.throws(()=>store.checkpoint({entries:[],layout:[]}),{code:'LOCAL_DATA_STRUCTURE'});
    let ran=false;await assert.rejects(store.withWrite(()=>{ran=true;}),{code:'LOCAL_DATA_STRUCTURE'});
    assert.equal(ran,false);assert.equal(staleEvents,0);assert.equal(data.get(store.key),raw);assert.deepEqual(writes,[]);
    assert.equal(store.readForBackup().metadataText,raw);
});

test('invalid JSON has a distinct syntax classification, never acknowledges or rewrites the snapshot',()=>{
    for(const raw of ['{truncated','null','[]']){
        const {store,data,writes}=setup(raw);
        assert.throws(()=>store.load(),{code:raw.startsWith('{')?'LOCAL_DATA_SYNTAX':'LOCAL_DATA_STRUCTURE'});
        assert.throws(()=>store.save(fixture()));assert.equal(data.get(store.key),raw);assert.deepEqual(writes,[]);
    }
});

test('structural guard also applies to a write attempted before load',()=>{
    const snapshot=fixture();invalid.orphan(snapshot);const raw=JSON.stringify(snapshot),{store,data}=setup(raw);
    assert.throws(()=>store.save(fixture()),{code:'LOCAL_DATA_STRUCTURE'});assert.equal(data.get(store.key),raw);
});

test('Restore replacement bypasses only the corruption guard; failed replacement reinstates it',async()=>{
    const original=fixture();invalid.cycle(original);const raw=JSON.stringify(original),{store,data}=setup(raw);
    assert.throws(()=>store.load());const previous=store.captureRestoreState();
    await store.withWrite(()=>{store.replaceRaw(JSON.stringify(fixture()));store.recoverRaw(previous);},{replacement:true});
    assert.equal(data.get(store.key),raw);assert.throws(()=>store.save(fixture()),{code:'LOCAL_DATA_STRUCTURE'});
    await store.withWrite(()=>store.replaceRaw(JSON.stringify(fixture())),{replacement:true});
    assert.equal(store.load().entries.length,2);await store.withWrite(()=>store.save(fixture()));
});

test('valid legacy v1-v4 structures retain supported migration flags and exact backups',()=>{
    for(const version of [1,2,3,4]){
        const snapshot=fixture();snapshot.version=version;
        snapshot.entries[0].role='category';snapshot.entries[1].role='subcategory';
        if(version<3){snapshot.builtInPositions=[{id:'github',x:42,y:24}];if(version===1){snapshot.tools=snapshot.entries;delete snapshot.entries;}}
        const raw=JSON.stringify(snapshot),{store,data,model}=setup(raw),saved=store.load();
        assert.equal(saved.migrateTree,true);assert.equal(saved.entries.find(x=>x.id==='child').name,'Keep me');
        assert.equal(data.get(store.key),raw);
        const entries=new Map(saved.legacy?model.legacyEntries.map(x=>[x.id,{...x}]):[]);
        for(const record of saved.entries)entries.set(record.id,model.normalizeEntry({...entries.get(record.id),...record}));
        model.migrateLegacy(entries,saved.entries);
        store.save({entries:[...entries.values()],layout:[]});
        assert.equal(data.get(store.treeBackupKey),raw);assert.equal(store.load().entries.find(x=>x.id==='child').parentId,'root');
    }
});

test('derived roles/depth/layout, stale disclosure IDs and separate UI state do not become canonical corruption',()=>{
    const snapshot=fixture();Object.assign(snapshot.entries[0],{role:'outdated',depth:999,x:'bad cache'});
    snapshot.layout=[{id:'missing',radius:'bad cache'}];snapshot.archivedGalaxies=[{galaxyId:'root',archivedAt:'2026-01-01T00:00:00Z',expandedIds:['missing']}];
    const {store}=setup(JSON.stringify(snapshot));assert.equal(store.load().entries.length,2);
});

test('missing blobs do not invalidate well-formed metadata, while duplicate file ownership does',()=>{
    const snapshot=fixture(),file={id:'f',kind:'upload',entryId:'root',storageKey:'f',filename:'missing.pdf',mimeType:'application/pdf',size:12,createdAt:'2026-01-01T00:00:00Z'};
    snapshot.entries[0].content={version:1,notes:{format:'plain',text:'Keep'},links:[],attachments:[file]};
    assert.equal(setup(JSON.stringify(snapshot)).store.load().entries[0].content.attachments[0].filename,'missing.pdf');
    snapshot.entries[1].content={version:1,notes:{format:'plain',text:''},links:[],attachments:[{...file,entryId:'child'}]};
    assert.throws(()=>setup(JSON.stringify(snapshot)).store.load(),{code:'LOCAL_DATA_STRUCTURE'});
});

test('a previously valid tab cannot overwrite newly introduced corrupt data, preserving F1 classification',async()=>{
    const {store,data}=setup(JSON.stringify(fixture()));store.load();const broken='{new corrupt data';data.set(store.key,broken);
    await assert.rejects(store.withWrite(()=>store.save(fixture())),{code:'LOCAL_SNAPSHOT_STALE'});
    assert.equal(data.get(store.key),broken);
});
