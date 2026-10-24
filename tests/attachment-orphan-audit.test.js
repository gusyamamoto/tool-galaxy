const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createLockManager}=require('./local-write-fixture');
const rawSnapshot=()=>({version:5,entries:[{id:'owner',name:'Owner',parentId:null}],layout:[]});
function fixture(raw=JSON.stringify(rawSnapshot())){
    const locks=createLockManager(),disk=new Map([['galaxy:user-data',raw]]);let writes=0,scans=0,deletes=0;
    if(raw===null)disk.delete('galaxy:user-data');
    const context=vm.createContext({Blob,URL,structuredClone,navigator:{locks},localStorage:{getItem:k=>disk.get(k)??null,setItem(k,v){writes++;disk.set(k,v);},removeItem(k){writes++;disk.delete(k);}}});
    for(const name of ['model.js','persistence/local-metadata-store.js','persistence/indexeddb-file-store.js','services/attachment-storage-audit.js','services/universe-repository.js'])vm.runInContext(fs.readFileSync(name,'utf8'),context);
    const api=vm.runInContext('cosmifoldAttachmentAudit',context),meta=vm.runInContext('createLocalMetadataStore()',context);
    const inventory={records:[],operations:[],restoreState:[],recoveryBlocked:false};
    const files={
        async auditStorage(){assert.equal(locks.held(),1);scans++;return structuredClone(inventory);},
        async removeOrphans(keys,validate){assert.equal(locks.held(),1);deletes++;const state=structuredClone(inventory);state.records=state.records.filter(r=>keys.includes(r.key));
            const removed=validate(state);inventory.records=inventory.records.filter(r=>!removed.includes(r.key));return {removed};}
    };
    const repo=vm.runInContext('createUniverseRepository',context)({persistence:{metadata:meta,files}});
    const describe=(key='old',extra={})=>api.describe({key,entryId:'owner',blob:new Blob(['original']),thumbnail:new Blob(['thumb']),...extra},key);
    return {context,api,meta,repo,disk,inventory,files,locks,describe,stats:()=>({writes,scans,deletes})};
}
function attachment(key='live'){
    return {id:key,kind:'upload',entryId:'owner',filename:key+'.txt',mimeType:'text/plain',size:8,storageKey:key,createdAt:'2026-01-01T00:00:00Z'};
}
function withFile(key='live'){
    const raw=rawSnapshot();raw.entries[0].content={version:1,notes:{format:'plain',text:''},links:[],attachments:[attachment(key)]};return raw;
}

test('read-only audit distinguishes LIVE and historical ORPHAN, including both Blob sizes',async()=>{
    const raw=JSON.stringify(withFile()),f=fixture(raw);f.inventory.records=[f.describe('live'),f.describe('old')];
    const audit=await f.repo.auditAttachmentStorage();
    assert.equal(audit.live.length,1);assert.equal(audit.orphaned.length,1);assert.equal(audit.orphanedBytes,13);
    assert.deepEqual(f.stats(),{writes:0,scans:1,deletes:0});assert.equal(f.disk.get('galaxy:user-data'),raw);
});
test('archived canonical attachments remain LIVE, without inventing owners through views',async()=>{
    const raw=withFile();raw.archivedGalaxies=[{galaxyId:'owner',archivedAt:'2026-01-01T00:00:00Z'}];
    raw.constellations=[{id:'collection',name:'Favorites',memberEntryIds:['owner'],createdAt:'2026-01-01T00:00:00Z'}];
    const f=fixture(JSON.stringify(raw));f.inventory.records=[f.describe('live')];
    const audit=await f.repo.auditAttachmentStorage();assert.equal(audit.live.length,1);assert.equal(audit.orphaned.length,0);
});
test('missing blobs never produce orphan candidates or metadata repair',async()=>{
    const raw=JSON.stringify(withFile()),f=fixture(raw);const audit=await f.repo.auditAttachmentStorage();
    assert.equal(audit.orphaned.length,0);assert.equal(f.disk.get('galaxy:user-data'),raw);assert.equal(f.stats().writes,0);
});
test('legacy ownerless referenced records remain LIVE by canonical key',async()=>{
    const f=fixture(JSON.stringify(withFile()));f.inventory.records=[f.describe('live',{entryId:undefined})];
    const audit=await f.repo.auditAttachmentStorage();assert.equal(audit.live.length,1);assert.equal(audit.orphaned.length,0);
});
for(const [name,extra] of [['ownerless',{entryId:undefined}],['empty owner',{entryId:''}],['invalid original',{blob:'not Blob'}],
    ['invalid thumbnail',{thumbnail:'not Blob'}],['future binary',{preview:new Blob(['future'])}],['future owner',{futureOwner:'x'}]]){
    test(`unreferenced ${name} record is UNKNOWN and preserved`,async()=>{
        const f=fixture();f.inventory.records=[f.describe('old',extra)];const audit=await f.repo.auditAttachmentStorage();
        assert.equal(audit.unknown.length,1);assert.equal(audit.orphaned.length,0);
        const result=await f.repo.removeOrphanedAttachments(['old']);assert.equal(result.removed,0);assert.equal(f.inventory.records.length,1);
    });
}
for(const mutate of [r=>r.futureFiles=['old'],r=>r.entries[0].futureFileKey='old',r=>r.entries[0].content.attachments[0].previewStorageKey='old',
    r=>r.entries[0].content.notes.previewKey='old',r=>r.entries[0].content.links.push({id:'future-link',url:'https://example.com',previewKey:'old'})]){
    test('unknown canonical extensions prevent orphan deletion',async()=>{
        const raw=withFile();mutate(raw);const f=fixture(JSON.stringify(raw));f.inventory.records=[f.describe('old')];
        const audit=await f.repo.auditAttachmentStorage();assert.ok(audit.blocked);assert.equal(audit.orphaned.length,0);
        await assert.rejects(f.repo.removeOrphanedAttachments(['old']));assert.equal(f.inventory.records.length,1);
    });
}
test('no saved canonical snapshot and valid premigration snapshots preserve all unreferenced data',async()=>{
    for(const raw of [null,JSON.stringify({...rawSnapshot(),version:4})]){
        const f=fixture(raw);f.inventory.records=[f.describe()];const audit=await f.repo.auditAttachmentStorage();
        assert.equal(audit.unknown.length,1);assert.ok(audit.blocked);
    }
});
test('valid F4-owned staged file is RECOVERY-OWNED; unrelated candidates also wait for recovery',async()=>{
    const f=fixture();f.inventory.records=[f.describe('staged'),f.describe('old')];
    f.inventory.operations=[{version:1,id:'operation',type:'add',stage:'files-written',files:[{key:'staged',entryId:'owner'}]}];
    const audit=await f.repo.auditAttachmentStorage();assert.equal(audit.recoveryOwned.length,1);assert.equal(audit.orphaned.length,0);assert.ok(audit.blocked);
    await assert.rejects(f.repo.removeOrphanedAttachments(['staged','old']));assert.equal(f.inventory.records.length,2);
});
for(const operation of [{version:999,files:[{key:'old',entryId:'owner'}]},null,{version:1,id:'x',type:'add',stage:'unknown',files:[]}]){
    test('unresolved or unsupported F4 state blocks all cleanup',async()=>{
        const f=fixture();f.inventory.records=[f.describe()];f.inventory.operations=[operation];
        const audit=await f.repo.auditAttachmentStorage();assert.equal(audit.unknown.length,1);assert.ok(audit.blocked);
        await assert.rejects(f.repo.removeOrphanedAttachments(['old']));assert.equal(f.inventory.records.length,1);
    });
}
test('previous F4 ownership/recovery failure blocks maintenance even without current journals',async()=>{
    const f=fixture();f.inventory.recoveryBlocked=true;f.inventory.records=[f.describe()];
    const audit=await f.repo.auditAttachmentStorage();assert.ok(audit.blocked);assert.equal(audit.orphaned.length,0);
});
for(const raw of ['{broken',JSON.stringify({version:5,entries:[{id:'bad',name:'Bad',parentId:'missing'}],layout:[]}),
    JSON.stringify({...withFile(),entries:[...withFile().entries,{id:'other',name:'Other',content:{...withFile().entries[0].content,attachments:[{...attachment(),entryId:'other'}]}}]})]){
    test('F3 validation, including duplicate blob references, stops before scanning or deleting',async()=>{
        const f=fixture(raw);await assert.rejects(f.repo.auditAttachmentStorage());await assert.rejects(f.repo.removeOrphanedAttachments(['old']));
        assert.equal(f.stats().scans,0);assert.equal(f.stats().deletes,0);assert.equal(f.disk.get('galaxy:user-data'),raw);
    });
}
for(const raw of ['{"version":1}', '{broken']){
    test('pending or unreadable Restore journal stops before any file scan',async()=>{
        const f=fixture();f.disk.set('galaxy:user-data:restore-pending',raw);
        await assert.rejects(f.repo.auditAttachmentStorage());await assert.rejects(f.repo.removeOrphanedAttachments(['old']));
        assert.equal(f.stats().scans,0);assert.equal(f.stats().deletes,0);
    });
}
test('settled Restore commit marker permits audit; ambiguous marker state preserves files',async()=>{
    const f=fixture();f.inventory.records=[f.describe()];f.inventory.restoreState=[{key:'committed',value:'restore-id'}];
    assert.equal((await f.repo.auditAttachmentStorage()).orphaned.length,1);
    for(const marker of [[{key:'committed',value:0}],[{key:'pending',value:'id'}]]){
        f.inventory.restoreState=marker;assert.ok((await f.repo.auditAttachmentStorage()).blocked);
        await assert.rejects(f.repo.removeOrphanedAttachments(['old']));assert.equal(f.inventory.records.length,1);
    }
});
test('final validation skips a formerly orphaned key that became canonically referenced',async()=>{
    const f=fixture();f.inventory.records=[f.describe()];assert.equal((await f.repo.auditAttachmentStorage()).orphaned.length,1);
    await f.meta.withWrite(()=>f.meta.save(withFile('old')));const before=f.disk.get('galaxy:user-data');
    const result=await f.repo.removeOrphanedAttachments(['old']);assert.equal(result.removed,0);assert.equal(result.skipped,1);
    assert.equal(f.inventory.records.length,1);assert.equal(f.disk.get('galaxy:user-data'),before);
});
test('final validation preserves a record whose shape changed after audit',async()=>{
    const f=fixture();f.inventory.records=[f.describe()];await f.repo.auditAttachmentStorage();
    f.inventory.records=[f.describe('old',{preview:new Blob(['future'])})];
    assert.equal((await f.repo.removeOrphanedAttachments(['old'])).removed,0);
});
test('cleanup deletes only selected current orphans and never rewrites canonical data',async()=>{
    const raw=JSON.stringify(withFile()),f=fixture(raw);f.inventory.records=['live','old','another'].map(k=>f.describe(k));
    const result=await f.repo.removeOrphanedAttachments(['old','old','live','absent']);
    assert.equal(result.removed,1);assert.equal(result.skipped,2);assert.equal(f.inventory.records.length,2);
    assert.equal(f.stats().writes,0);assert.equal(f.disk.get('galaxy:user-data'),raw);
});
test('F1 rejects stale maintenance before reading or deleting file records',async()=>{
    const f=fixture();f.meta.load();f.disk.set('galaxy:user-data',JSON.stringify(withFile('old')));
    await assert.rejects(f.repo.removeOrphanedAttachments(['old']),{code:'LOCAL_SNAPSHOT_STALE'});
    assert.equal(f.stats().scans,0);assert.equal(f.stats().deletes,0);
});
test('audit and final deletion serialize through the existing workspace write lock',async()=>{
    const f=fixture();f.inventory.records=[f.describe()];let release,entered=false;
    const barrier=f.locks.request('cosmifold-workspace-write:null',{mode:'exclusive'},()=>{entered=true;return new Promise(resolve=>release=resolve);});
    await Promise.resolve();assert.ok(entered);const pending=f.repo.removeOrphanedAttachments(['old']);
    await Promise.resolve();assert.equal(f.stats().deletes,0);release();await barrier;await pending;
    assert.equal(f.stats().deletes,1);assert.equal(f.locks.requests.every(r=>r.name==='cosmifold-workspace-write:null'&&r.mode==='exclusive'),true);
});
test('audit detects concurrent raw changes without acknowledging or rewriting them',async()=>{
    const f=fixture();f.files.auditStorage=async()=>{f.disk.set('galaxy:user-data',JSON.stringify(withFile()));return structuredClone(f.inventory);};
    await assert.rejects(f.repo.auditAttachmentStorage(),/changed/);assert.equal(f.stats().writes,0);
});
test('unsafe byte totals degrade to count-only without arithmetic overflow',()=>{
    const f=fixture(),records=[{key:'a',recognizable:true,size:Number.MAX_SAFE_INTEGER,thumbnailBytes:1}];
    const result=f.api.classify(rawSnapshot(),{...f.inventory,records},rawSnapshot());assert.equal(result.orphanedBytes,null);
});
