const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');

function fixture(){
    const context=vm.createContext({clearTimeout,document:{querySelector:()=>null}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','rich-content.js'),'utf8'),context);
    const Inspector=vm.runInContext('EntryContentInspector',context);
    const entries=new Map([['a',{name:'Travel'}],['b',{name:'Work'}]]),notices=[],inline=[],saved=[];
    const inspector=Object.assign(Object.create(Inspector.prototype),{
        entryId:'a',visible:true,jobs:new Map(),getEntry:id=>entries.get(id),
        notifyFileFailure:text=>notices.push(text),isSessionStale:()=>false,
        status:{hidden:true},onAction(){},busy(){},renderLists(){},onLayout(){},clearPreviews(){},
        error(error){inline.push(error);this.status.hidden=false;},
        async addAttachment(id,record,metadata){saved.push({id,record,metadata});}
    });
    const gate={};gate.promise=new Promise((resolve,reject)=>Object.assign(gate,{resolve,reject}));
    return {context,inspector,entries,notices,inline,saved,gate};
}

test('background rejection retains captured Item, filename and selection without technical exception text',async()=>{
    const {inspector:i,entries,notices,inline,gate}=fixture();
    const pending=i.job('a',()=>gate.promise,{filename:'photo.jpg'});
    i.entryId='b';entries.get('a').name='Renamed';gate.reject(new Error('private exception detail'));
    await pending;
    assert.equal(i.entryId,'b');assert.equal(i.jobs.size,0);assert.equal(inline.length,0);
    assert.deepEqual(notices,['Couldn’t add “photo.jpg” to “Travel”.']);
});

test('quota cause is friendly when same Item Contents is closed',async()=>{
    const {inspector:i,notices,gate}=fixture();
    const pending=i.job('a',()=>gate.promise,{filename:'large.mp4'});
    i.hide();gate.reject({cause:{name:'QuotaExceededError',message:'raw DOMException'}});await pending;
    assert.match(notices[0],/large\.mp4.*Travel.*Browser storage is full/);
    assert.doesNotMatch(notices[0],/DOMException/);
});

test('same visible Item uses inline only, then promotes once when Contents hides',async()=>{
    const {inspector:i,notices,inline}=fixture();
    await i.job('a',async()=>{throw new Error('read failed');},{filename:'notes.txt'});
    assert.equal(inline.length,1);assert.equal(notices.length,0);assert.equal(i.status.hidden,false);
    i.hide();i.hide();assert.equal(notices.length,1);assert.equal(i.status.hidden,true);
});

test('success after navigation remains quiet and completes on original Item',async()=>{
    const {inspector:i,notices,inline,saved,gate}=fixture();
    const pending=i.job('a',async()=>{await gate.promise;await i.addAttachment('a',{},{});});
    i.entryId='b';gate.resolve();await pending;
    assert.equal(saved[0].id,'a');assert.equal(i.entryId,'b');assert.equal(notices.length+inline.length,0);
});

test('sequential upload identifies only failed file and retains earlier success',async()=>{
    const {context,inspector:i,notices,saved}=fixture();
    context.galaxyAttachmentFiles={async prepare(file,id){
        if(file.name==='second.txt')throw new Error('read failed');
        return {record:{},metadata:{filename:file.name,entryId:id}};
    }};
    i.entryId='b';
    await i.upload([{name:'first.txt'},{name:'second.txt'},{name:'third.txt'}],'a');
    assert.equal(saved.length,1);assert.equal(saved[0].metadata.filename,'first.txt');
    assert.equal(notices.length,1);assert.match(notices[0],/second\.txt/);
    assert.doesNotMatch(notices[0],/first|third|batch/);
});

test('deleted original has captured context and cannot be resurrected by feedback',async()=>{
    const {inspector:i,entries,notices,gate}=fixture();
    const pending=i.job('a',()=>gate.promise,{filename:'lost.txt'});
    entries.delete('a');i.entryId='b';gate.reject(new Error('deleted'));await pending;
    assert.equal(entries.has('a'),false);assert.match(notices[0],/lost\.txt.*Travel/);
});

test('remove failure names the original attachment and operation',async()=>{
    const {inspector:i,notices}=fixture();i.visible=false;
    await i.job('a',async()=>{throw new Error('delete failed');},{operation:'remove',filename:'keep.txt'});
    assert.equal(notices[0],'Couldn’t remove “keep.txt” from “Travel”.');
});

test('stale-session rejection remains owned by F1, including wrapped errors and other pending jobs',async()=>{
    for(const error of [{code:'LOCAL_SNAPSHOT_STALE'},{cause:{code:'LOCAL_SNAPSHOT_STALE'}},new Error('another pending failure')]){
        const {inspector:i,notices,inline}=fixture();
        if(error instanceof Error)i.isSessionStale=()=>true;
        await i.job('a',async()=>{throw error;},{filename:'stale.txt'});
        assert.equal(notices.length+inline.length,0);assert.equal(i.jobs.size,0);
    }
});

test('nonfatal preview degradation with a saved original remains quiet',async()=>{
    const {context,inspector:i,notices,inline,saved}=fixture();
    context.galaxyAttachmentFiles={async prepare(file,id){return {record:{blob:'original'},metadata:{filename:file.name,entryId:id}};}};
    await i.upload([{name:'no-preview.jpg'}]);
    assert.equal(saved.length,1);assert.equal(saved[0].record.blob,'original');
    assert.equal(notices.length+inline.length,0);
});
