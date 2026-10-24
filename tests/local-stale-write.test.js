const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto'),{createLockManager}=require('./local-write-fixture');
const plain=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve};};
const base=()=>({version:5,entries:[{id:'g',name:'Root',parentId:null},{id:'a',name:'Item',parentId:'g'}],connections:[],layout:[]});
function environment(initial=base()){
    const locks=createLockManager(),values=new Map(),disk={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
    const ctx=vm.createContext({URL,Blob,structuredClone,crypto:webcrypto,TextEncoder,TextDecoder,DOMException,setTimeout,navigator:{locks}});
    for(const f of ['ids.js','config.js','model.js','task-lists.js','portals.js','constellations.js','clipboard.js','persistence/local-metadata-store.js','persistence/local-preferences-store.js','persistence/memory-stores.js','persistence/composition.js','services/universe-repository.js','services/local-restore-session.js','services/local-backup.js','services/local-restore.js'])vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
    const get=n=>vm.runInContext(n,ctx),files=get('createMemoryFileStore')();
    if(initial!==null)disk.setItem('galaxy:user-data',JSON.stringify(initial));
    function tab(scope=null,tabLocks=locks){
        const metadata=get('createLocalMetadataStore')({storage:()=>disk,scope,locks:tabLocks}),preferences=get('createLocalPreferencesStore')({storage:()=>disk,scope});
        const persistence=get('createPersistence')({config:{workspaceId:scope},metadata,preferences,files}),repo=get('createUniverseRepository')({persistence});
        let snapshot=repo.load();const warnings=[],events=[];persistence.metadata.subscribeStale(error=>warnings.push(error));repo.subscribe(event=>events.push(event));
        return {metadata,persistence,repo,warnings,events,read:()=>snapshot,accept:value=>{snapshot=value;},session:get('createRestoreSession')(scope,locks)};
    }
    return {get,locks,disk,values,files,tab,raw:()=>disk.getItem('galaxy:user-data'),saved:()=>JSON.parse(disk.getItem('galaxy:user-data'))};
}
const stale=error=>error.code==='LOCAL_SNAPSHOT_STALE'&&error.message==='Cosmifold changed in another tab. Reload this tab to continue safely.';
const content=text=>({version:1,notes:{format:'plain',text},links:[],attachments:[]});

test('A: a stale Notes save cannot erase another tab\'s saved Location; state stays stale',async()=>{
    const e=environment(),a=e.tab(),b=e.tab();
    await a.repo.updateLocation(a.read(),'a',{text:'Tokyo Station'});const saved=e.raw();
    await assert.rejects(b.repo.updateContent(b.read(),'a',content('Stale note')),stale);
    assert.equal(e.raw(),saved);assert.equal(b.read().entries[1].content,undefined);assert.equal(b.events.length,0);
    await assert.rejects(b.repo.save(b.read()),stale);assert.equal(b.warnings.length,1);
    assert.equal(e.saved().entries[1].location.text,'Tokyo Station');
});

test('B: a stale save cannot reintroduce an attachment whose metadata and blob were deleted',async()=>{
    const initial=base(),file={id:'f',storageKey:'f',entryId:'a',kind:'upload',filename:'a.txt',mimeType:'text/plain',size:4,createdAt:'2026-01-01T00:00:00Z'};
    initial.entries[1].content={...content(''),attachments:[file]};
    const e=environment(initial);await e.files.save({key:'f',entryId:'a',blob:new Blob(['data'])});const a=e.tab(),b=e.tab();
    await a.repo.removeAttachment(a.read(),'a','f');const saved=e.raw();
    await assert.rejects(b.repo.updateLocation(b.read(),'a',{text:'Elsewhere'}),stale);
    assert.equal(e.raw(),saved);assert.equal(e.saved().entries[1].content.attachments.length,0);assert.equal(await e.files.get('f'),null);
});

test('C: simultaneous writers serialize comparison with commit and produce one successor',async()=>{
    const e=environment(),a=e.tab(),b=e.tab(),entered=deferred(),release=deferred();
    const commit=a.persistence.metadata.commit;a.persistence.metadata.commit=async(...args)=>{entered.resolve();await release.promise;return commit(...args);};
    const first=a.repo.updateLocation(a.read(),'a',{text:'Winner'});await entered.promise;
    const second=assert.rejects(b.repo.updateLocation(b.read(),'a',{text:'Loser'}),stale);
    assert.equal(e.saved().entries[1].location,undefined);release.resolve();await first;await second;
    assert.equal(e.saved().entries[1].location.text,'Winner');assert.equal(a.events.length,1);assert.equal(b.events.length,0);assert.equal(e.locks.held(),0);
});

test('D: a fresh tab acknowledges current disk and can save after stale detection',async()=>{
    const e=environment(),a=e.tab(),b=e.tab();await a.repo.updateLocation(a.read(),'a',{text:'Preserve'});
    await assert.rejects(b.repo.save(b.read()),stale);const reloaded=e.tab();
    await reloaded.repo.updateContent(reloaded.read(),'a',content('New note'));
    assert.equal(e.saved().entries[1].location.text,'Preserve');assert.equal(e.saved().entries[1].content.notes.text,'New note');
});

test('E: replacement invalidates old bases; Restore still refuses another open shared session',async()=>{
    const e=environment(),a=e.tab(),b=e.tab();await a.session.hold();await b.session.hold();
    let ran=false;await assert.rejects(a.session.exclusive(()=>{ran=true;}),/Close other Cosmifold tabs/);assert.equal(ran,false);
    b.session.release();const replaced=base();replaced.entries[1].name='Restored';const text=JSON.stringify(replaced);
    await a.session.exclusive(()=>a.repo.replaceLocalBackup({metadataText:text,preferencesText:null,records:[]}));
    assert.equal(e.raw(),text);await assert.rejects(b.repo.save(b.read()),stale);
    const fresh=e.tab();await fresh.repo.updateLocation(fresh.read(),'a',{text:'After Restore'});assert.equal(e.saved().entries[1].name,'Restored');a.session.release();
});

test('F: sequential same-tab saves acknowledge each durable snapshot without false conflicts',async()=>{
    const e=environment(),a=e.tab();let previous=e.raw();
    for(let i=0;i<12;i++){
        const updated=await a.repo.updateContent(a.read(),'a',content('Note '+i));
        a.accept({...a.read(),entries:a.read().entries.map(entry=>entry.id==='a'?updated:entry)});
        assert.notEqual(e.raw(),previous);previous=e.raw();
    }
    assert.equal(a.warnings.length,0);assert.equal(a.events.length,12);assert.equal(e.saved().entries[1].content.notes.text,'Note 11');
});

test('failed writes do not acknowledge an unwritten base and release the lock for retry',async()=>{
    const e=environment(),a=e.tab(),before=e.raw(),set=e.disk.setItem;
    e.disk.setItem=()=>{throw Object.assign(new Error('Full'),{name:'QuotaExceededError'});};
    await assert.rejects(a.repo.updateLocation(a.read(),'a',{text:'Retry'}),error=>error.name==='QuotaExceededError');
    assert.equal(e.raw(),before);assert.equal(e.locks.held(),0);assert.equal(a.events.length,0);
    e.disk.setItem=set;await a.repo.updateLocation(a.read(),'a',{text:'Retry'});assert.equal(e.saved().entries[1].location.text,'Retry');
});

test('file save/delete/copy/subtree deletion reject stale bases before touching files',async()=>{
    for(const kind of ['add','remove','copy','subtree']){
        const e=environment(),a=e.tab(),b=e.tab();await a.repo.updateLocation(a.read(),'a',{text:'Keep'});const saved=e.raw();
        for(const method of ['save','delete','get','saveBatch','deleteEntries'])b.persistence.files[method]=()=>{throw new Error('Stale file access');};
        const file={id:'f',storageKey:'f',entryId:'a',kind:'upload',filename:'a.txt',mimeType:'text/plain',size:4,createdAt:'2026-01-01T00:00:00Z'};
        const operation=kind==='add'?()=>b.repo.addAttachment(b.read(),'a',{key:'f',entryId:'a',blob:new Blob(['data'])},file):
            kind==='remove'?()=>b.repo.removeAttachment(b.read(),'a','f'):kind==='copy'?()=>b.repo.copyEntries(b.read(),['a'],'g',()=> 'copy'):
            ()=>b.repo.deleteSubtree(b.read(),['a']);
        await assert.rejects(operation(),stale);assert.equal(e.raw(),saved);
    }
});

test('file abort compensation holds the write lock and restores an acknowledged retry base',async()=>{
    const e=environment(),a=e.tab(),b=e.tab(),entered=deferred(),release=deferred(),before=e.raw();
    a.persistence.files.deleteEntries=async(ids,commit,rollback)=>{commit();entered.resolve();await release.promise;rollback();throw new Error('Late abort');};
    const failed=assert.rejects(a.repo.deleteSubtree(a.read(),['a']),/Late abort/);await entered.promise;
    const next=b.repo.updateLocation(b.read(),'a',{text:'After rollback'});assert.equal(e.saved().entries.length,1);
    release.resolve();await failed;await next;assert.equal(e.saved().entries[1].location.text,'After rollback');assert.equal(e.locks.held(),0);
    assert.notEqual(e.raw(),before);assert.equal(a.events.length,0);
});

test('closing checkpoints skip unowned locks, reject stale state and never replace newer data',async()=>{
    const e=environment(),a=e.tab(),b=e.tab(),before=e.raw();
    assert.equal(a.repo.checkpointLayout(a.read()),false);assert.equal(e.raw(),before);
    await a.repo.updateLocation(a.read(),'a',{text:'Keep'});const saved=e.raw();
    assert.throws(()=>b.repo.checkpointLayout(b.read()),stale);assert.equal(e.raw(),saved);assert.equal(b.warnings.length,1);
});

test('Backup reads current canonical disk without rebasing a stale tab; preferences stay independent',async()=>{
    const e=environment(),a=e.tab(),b=e.tab();await a.repo.updateLocation(a.read(),'a',{text:'Current'});
    await b.persistence.preferences.update({width:300});const backup=await e.get('cosmifoldBackup').create(b.repo);
    assert.equal(backup.manifest.metadata.entries[1].location.text,'Current');assert.equal(b.warnings.length,0);
    await assert.rejects(b.repo.save(b.read()),stale);const again=await e.get('cosmifoldBackup').create(b.repo);assert.equal(again.manifest.metadataText,e.raw());
});

test('scoped workspaces serialize independently; missing Web Locks refuses writes without touching disk',async()=>{
    const e=environment(),a=e.tab(),other=e.tab('other'),unsupported=e.tab(null,null),before=e.raw();
    await other.repo.save({entries:[],layout:[]});await a.repo.updateLocation(a.read(),'a',{text:'Local'});
    const saved=e.raw();await assert.rejects(unsupported.repo.save(unsupported.read()),error=>error.code==='LOCAL_WRITE_LOCK_UNAVAILABLE');assert.equal(e.raw(),saved);
    assert.notEqual(saved,before);assert.equal(unsupported.warnings.length,0);
});
