const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const MiB=1024*1024;
function fixture(storage={estimate:async()=>({usage:950*MiB,quota:1000*MiB})},extras={}){
    const context=vm.createContext({navigator:{storage},setTimeout,clearTimeout,...extras});
    vm.runInContext(fs.readFileSync('storage-capacity.js','utf8'),context);
    const api=vm.runInContext('cosmifoldStorageCapacity',context);
    return {api,context};
}
const file=size=>({size});
for(const value of [undefined,null,{}, {usage:0},{quota:100},
    ...[undefined,null,NaN,Infinity,-1,'100',Number.MAX_VALUE].flatMap(v=>[{usage:v,quota:100},{usage:1,quota:v}]),
    {usage:0,quota:0},{usage:101,quota:100}]){
    test(`invalid estimate fails open: ${JSON.stringify(value)}`,()=>{
        const {api}=fixture();const result=api.normalize(value);
        assert.equal(result.supported,false);assert.equal(api.warning(result,api.incoming([file(10)])),null);
    });
}
test('zero usage, rounded fractional bytes and completely full storage are safe arithmetic',()=>{
    const {api}=fixture();
    for(const value of [{usage:0,quota:100},{usage:90.5,quota:100.5},{usage:100,quota:100}]){
        const e=api.normalize(value);assert.equal(e.supported,true);assert.equal(e.availableBytes,value.quota-value.usage);
    }
});
test('general warning requires BOTH high utilization and little absolute headroom',()=>{
    const {api}=fixture();
    for(const [usage,quota,expected] of [[100,10000,null],[95000,100000,null],[9500,10000,null],[400,450,null],[900,1000,'low'],[950,1000,'low']]){
        assert.equal(api.warning(api.normalize({usage:usage*MiB,quota:quota*MiB}),null),expected);
    }
});
test('operation margin includes 25% bytes, 256 KiB per file and 1 MiB per batch',()=>{
    const {api}=fixture(),batch=api.incoming([file(10*MiB),file(20*MiB)]);
    assert.equal(batch.bytes,30*MiB);assert.equal(batch.requiredBytes,39*MiB);
    assert.equal(api.warning(api.normalize({usage:500*MiB,quota:530*MiB}),batch),'operation');
    assert.equal(api.warning(api.normalize({usage:0,quota:32*MiB}),batch),'operation');
});
test('copies include known thumbnails; invalid sums and overflow do not make predictions',()=>{
    const {api}=fixture();
    assert.equal(api.incoming([{blob:{size:10},thumbnail:{size:20}}],{copies:true}).bytes,30);
    for(const files of [[],[{}],[file(-1)],[file(Infinity)],[file(Number.MAX_SAFE_INTEGER),file(1)]])assert.equal(api.incoming(files),null);
});
for(const [name,storage] of [['missing',undefined],['throws',{estimate(){throw Error('test');}}],
    ['rejects',{estimate:async()=>{throw Error('test');}}],['incomplete',{estimate:async()=>({quota:100})}]]){
    test(`${name} API continues without warning`,async()=>{
        const {api,context}=fixture(storage);if(!storage)context.navigator={};
        let notices=0;await api.create({notify:()=>notices++}).check([file(10)]);assert.equal(notices,0);
        assert.equal((await api.estimate()).supported,false);
    });
}
test('hung API times out without holding an operation indefinitely',async()=>{
    const {api}=fixture({estimate:()=>new Promise(()=>{})});
    assert.equal((await api.estimate()).supported,false);
});
test('dismissal deduplicates, deteriorating space, larger operation and time re-warn',async()=>{
    let usage=950*MiB,time=0,notices=0,hides=0;
    const {api}=fixture({estimate:async()=>({usage,quota:1000*MiB})});
    const service=api.create({notify:()=>notices++,hide:()=>hides++,now:()=>time});
    await service.check([file(1)]);service.dismiss();await service.check([file(1)]);assert.equal(notices,1);
    usage=980*MiB;await service.check([file(1)]);assert.equal(notices,2);
    await service.check([file(20*MiB)]);assert.equal(notices,3);
    await service.check([file(45*MiB)]);assert.equal(notices,4);
    time+=api.policy.repeatMs;await service.check([file(45*MiB)]);assert.equal(notices,5);assert.ok(hides);
});
test('full estimate does not repeatedly re-warn after dismiss',async()=>{
    const {api}=fixture({estimate:async()=>({usage:MiB,quota:MiB})});let notices=0;
    const service=api.create({notify:()=>notices++});await service.check([file(1)]);service.dismiss();
    await service.check([file(1)]);assert.equal(notices,1);
});
test('fresh estimates detect healthy to low changes; healthy clears old warning',async()=>{
    let usage=100*MiB,notices=0,hides=0;
    const {api}=fixture({estimate:async()=>({usage,quota:1000*MiB})});
    const service=api.create({notify:()=>notices++,hide:()=>hides++});
    await service.check([file(1)]);assert.equal(notices,0);
    usage=950*MiB;await service.check([file(1)]);assert.equal(notices,1);
    usage=100*MiB;await service.check([file(1)]);assert.equal(hides,2);
});
test('newer operation, canceled UI and F2 failure invalidate deferred estimates',async()=>{
    for(const action of ['newer','cancel','invalidate','failure','scope']){
        const pending=[];let current=true,notices=0;
        const {api}=fixture({estimate:()=>new Promise(resolve=>pending.push(resolve))});
        const service=api.create({notify:()=>notices++});const first=service.check([file(1)],{isCurrent:()=>current});
        await Promise.resolve();
        if(action==='newer'){
            const second=service.check([file(1)]);await Promise.resolve();pending[1]({usage:0,quota:1000*MiB});await second;
        }else if(action==='scope')current=false;else service[action]();
        pending[0]({usage:950*MiB,quota:1000*MiB});await first;assert.equal(notices,0,action);
    }
});
test('an existing authoritative failure suppresses advisory notices',async()=>{
    const {api}=fixture();let notices=0;await api.create({notify:()=>notices++,canShow:()=>false}).check([file(1)]);assert.equal(notices,0);
});

test('quota feedback for metadata also dismisses a prior capacity advisory',()=>{
    const {context}=fixture();vm.runInContext(fs.readFileSync('rich-content.js','utf8'),context);
    const Inspector=vm.runInContext('EntryContentInspector',context);let hides=0,message;
    const i=Object.assign(Object.create(Inspector.prototype),{capacityFailure:()=>hides++,message:text=>message=text});
    i.error({cause:{name:'QuotaExceededError'}});assert.equal(hides,1);assert.match(message,/storage/);
});
test('upload checks once for the full batch before existing prepare/add and preserves partial success',async()=>{
    const {context}=fixture();vm.runInContext(fs.readFileSync('rich-content.js','utf8'),context);
    const Inspector=vm.runInContext('EntryContentInspector',context),events=[];
    context.galaxyAttachmentFiles={async prepare(file){events.push('prepare:'+file.name);return {record:{},metadata:{filename:file.name}};}};
    const i=Object.assign(Object.create(Inspector.prototype),{entryId:'owner',visible:true,getEntry:()=>({}),
        async checkCapacity(files){events.push('estimate:'+files.reduce((n,f)=>n+f.size,0));},
        job(id,run){return run({});},async addAttachment(id,record,metadata){events.push('save:'+metadata.filename);if(metadata.filename==='b')throw Error('quota');}});
    await assert.rejects(i.upload([{name:'a',size:10},{name:'b',size:20},{name:'c',size:30}]),/quota/);
    assert.deepEqual(events,['estimate:60','prepare:a','save:a','prepare:b','save:b']);
});
