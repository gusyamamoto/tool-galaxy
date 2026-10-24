const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {createLockManager}=require('./local-write-fixture');
const context=vm.createContext({URL,Blob});
vm.runInContext(fs.readFileSync('persistence/indexeddb-file-store.js','utf8'),context);
const plan=vm.runInContext('planAttachmentRecovery',context);
const operation=(type='add',stage='files-written')=>({id:'operation',version:1,type,stage,files:[{key:'file',entryId:'owner'}]});
const snapshot=referenced=>({entries:[{id:'owner',content:{attachments:referenced?[{storageKey:'file'}]:[]}}]});

for(const type of ['add','copy','remove','deleteEntries'])for(const referenced of [false,true])test(`${type}: canonical reference ${referenced?'preserves':'cleans'} journal-owned file`,()=>{
    const result=plan([operation(type)],snapshot(referenced));
    assert.equal(result[0].files[0].remove,!referenced);
    assert.equal(result[0].files[0].referencedBy,referenced?'owner':undefined);
});
test('prepared add/copy cannot claim ownership of an existing collision or unknown orphan',()=>{
    for(const type of ['add','copy'])assert.equal(plan([operation(type,'prepared')],snapshot(false))[0].files[0].remove,false);
});
test('prepared remove identifies only its enumerated keys; unknown blobs are not scanned',()=>{
    const result=plan([operation('remove','prepared')],snapshot(false));
    assert.equal(result[0].files.length,1);assert.equal(result[0].files[0].key,'file');assert.equal(result[0].files[0].remove,true);
});
test('all journals validate before a plan can authorize any destructive cleanup',()=>{
    for(const broken of [{...operation(),version:2},{...operation(),type:'restore'},{...operation(),stage:'unknown'},
        {...operation(),files:[{key:'file'}]},{...operation(),files:[...operation().files,...operation().files]},null]){
        assert.throws(()=>plan([operation(),broken],snapshot(false)),{code:'ATTACHMENT_RECOVERY_REQUIRED'});
    }
});
test('archived references, absence of a blob, and other owners never authorize reference deletion',()=>{
    const result=plan([operation('remove')],{entries:[{id:'archived',content:{attachments:[{storageKey:'file'}]}}],archivedGalaxies:[{galaxyId:'archived'}]});
    assert.equal(result[0].files[0].remove,false);assert.equal(result[0].files[0].referencedBy,'archived');
});
test('repeated planning is deterministic and never mutates canonical metadata or journals',()=>{
    const journal=[operation()],data=snapshot(false),before=JSON.stringify({journal,data});
    assert.equal(JSON.stringify(plan(journal,data)),JSON.stringify(plan(journal,data)));
    assert.equal(JSON.stringify({journal,data}),before);
});

function recoveryFixture(raw){
    const locks=createLockManager(),disk=new Map([['galaxy:user-data',raw]]),events=[];
    const ctx=vm.createContext({URL,Blob,navigator:{locks},localStorage:{getItem:key=>disk.get(key)??null,setItem:(key,value)=>disk.set(key,value)}});
    for(const file of ['model.js','persistence/local-metadata-store.js','services/universe-repository.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
    const metadata=vm.runInContext('createLocalMetadataStore()',ctx),create=vm.runInContext('createUniverseRepository',ctx);
    const repo=create({persistence:{metadata,files:{async recoverOperations(value){assert.equal(locks.held(),1);events.push(value);}}}});
    return {repo,events,disk,metadata};
}
test('startup reconciliation validates canonical metadata and holds the same exclusive F1 write lock',async()=>{
    const raw=JSON.stringify({version:5,entries:[{id:'owner',name:'Owner',parentId:null}],layout:[]}),{repo,events,disk}=recoveryFixture(raw);
    await repo.recoverAttachmentOperations();assert.equal(events.length,1);assert.equal(disk.get('galaxy:user-data'),raw);
});
test('F3 syntax/structural corruption prevents all attachment recovery',async()=>{
    for(const raw of ['{bad',JSON.stringify({version:5,entries:[{id:'orphan',name:'Keep',parentId:'missing'}],layout:[]})]){
        const {repo,events,disk}=recoveryFixture(raw);
        await assert.rejects(repo.recoverAttachmentOperations(),error=>['LOCAL_DATA_SYNTAX','LOCAL_DATA_STRUCTURE'].includes(error.code));
        assert.equal(events.length,0);assert.equal(disk.get('galaxy:user-data'),raw);
    }
});
test('a stale recovery instance cannot act on a changed snapshot',async()=>{
    const raw=JSON.stringify({version:5,entries:[],layout:[]}),{repo,metadata,disk,events}=recoveryFixture(raw);metadata.load();
    disk.set('galaxy:user-data',JSON.stringify({version:5,entries:[{id:'new',name:'Other tab'}],layout:[]}));
    await assert.rejects(repo.recoverAttachmentOperations(),{code:'LOCAL_SNAPSHOT_STALE'});assert.equal(events.length,0);
});
