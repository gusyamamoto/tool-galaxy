const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({URL,Blob,structuredClone});
for(const file of ['config.js','model.js','portals.js','constellations.js','clipboard.js','persistence/memory-stores.js','persistence/composition.js','services/universe-repository.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const get=name=>vm.runInContext(name,ctx),plain=value=>JSON.parse(JSON.stringify(value));
const initial=()=>({entries:[{id:'g',name:'Galaxy',parentId:null},{id:'a',name:'Original',parentId:'g'},{id:'b',name:'Destination',parentId:null}],layout:[],portals:[],constellations:[]});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}
function setup(){const metadata=get('createMemoryMetadataStore')(initial()),files=get('createMemoryFileStore')(),persistence=get('createPersistence')({metadata,files,preferences:get('createMemoryPreferencesStore')()}),repo=get('createUniverseRepository')({persistence});return {metadata,files,persistence,repo};}

test('semantic acknowledgement and typed publication await deferred metadata completion',async()=>{
 const {repo,persistence,metadata}=setup(),start=deferred(),ack=deferred(),events=[];repo.subscribe(intent=>events.push(intent));
 persistence.metadata.commit=async value=>{start.resolve();await ack.promise;metadata.save(value);};
 let finished=false;const result=repo.updateLocation(()=>repo.load(),'a',{text:'Tokyo Station'}).then(value=>{finished=true;return value;});await start.promise;
 assert.equal(finished,false);assert.equal(events.length,0);assert.equal(repo.load().entries[1].location,undefined);
 ack.resolve();const value=await result;assert.equal(value.location.text,'Tokyo Station');assert.equal(events.length,1);assert.equal(events[0].type,'location.changed');
});

test('rejection preserves input/store, emits no success and does not poison subsequent commands',async()=>{
 const {repo,persistence}=setup(),before=plain(repo.load()),ack=deferred(),start=deferred(),commit=persistence.metadata.commit,events=[];repo.subscribe(intent=>events.push(intent));
 persistence.metadata.commit=()=>{start.resolve();return ack.promise;};const content={version:1,notes:{format:'plain',text:'Keep my draft'},links:[],attachments:[]};
 const result=repo.updateContent(()=>repo.load(),'a',content);await start.promise;ack.reject(new Error('Denied'));await assert.rejects(result,/Denied/);
 assert.deepEqual(plain(repo.load()),before);assert.equal(events.length,0);assert.equal(content.notes.text,'Keep my draft');
 persistence.metadata.commit=commit;await repo.updateContent(()=>repo.load(),'a',content);assert.equal(events.length,1);
});

test('rename, move and content writes remain ordered and build from the latest acknowledged snapshot',async()=>{
 const {repo,persistence,metadata}=setup(),requests=[],started=[deferred(),deferred(),deferred()];
 persistence.metadata.commit=value=>{const gate=deferred();requests.push({gate,value:plain(value)});started[requests.length-1].resolve();return gate.promise.then(()=>metadata.save(value));};
 const rename=repo.save(()=>{const state=repo.load();return {...state,entries:state.entries.map(e=>e.id==='a'?{...e,name:'Renamed'}:e)};},{type:'items.renamed',ids:['a']});
 const move=repo.moveEntries(()=>repo.load(),['a'],'b');
 const note=repo.updateContent(()=>repo.load(),'a',{version:1,notes:{format:'plain',text:'Latest'},links:[],attachments:[]});
 await started[0].promise;assert.equal(requests.length,1);requests[0].gate.resolve();await rename;
 await started[1].promise;assert.equal(requests[1].value.entries[1].name,'Renamed');assert.equal(requests[1].value.entries[1].parentId,'b');requests[1].gate.resolve();await move;
 await started[2].promise;assert.equal(requests[2].value.entries[1].name,'Renamed');assert.equal(requests[2].value.entries[1].parentId,'b');requests[2].gate.resolve();await note;
 assert.equal(repo.load().entries[1].content.notes.text,'Latest');
});

test('layout writes have a distinct intent and closing checkpoints cannot overwrite pending semantic writes',async()=>{
 const {repo,persistence,metadata}=setup(),ack=deferred(),start=deferred(),events=[];repo.subscribe(intent=>events.push(intent));
 const commit=persistence.metadata.commit;persistence.metadata.commit=async value=>{start.resolve();await ack.promise;metadata.save(value);};
 const result=repo.updateLocation(()=>repo.load(),'a',{text:'Kyoto'});await start.promise;repo.checkpointLayout(initial());assert.equal(repo.load().entries[1].location,undefined);
 ack.resolve();await result;await repo.whenIdle();persistence.metadata.commit=commit;
 await repo.saveLayout(()=>repo.load());assert.equal(events.at(-1).type,'layout.saved');assert.equal(repo.load().entries[1].location.text,'Kyoto');
});

test('attachment commands acknowledge complete transactions while metadata callbacks stay synchronous',async()=>{
 const {repo,persistence}=setup(),gate=deferred(),start=deferred(),events=[];repo.subscribe(event=>events.push(event));
 const file={id:'f',storageKey:'f',entryId:'a',kind:'upload',filename:'file.bin',mimeType:'application/octet-stream',size:4,createdAt:'2026-10-12T00:00:00Z'};
 persistence.files.save=async(record,commit)=>{assert.equal(commit(),undefined);start.resolve();await gate.promise;};
 let done=false;const result=repo.addAttachment(()=>repo.load(),'a',{key:'f',entryId:'a',blob:new Blob(['data'])},file).then(value=>{done=true;return value;});await start.promise;
 assert.equal(done,false);assert.equal(events.length,0);gate.resolve();assert.equal((await result).content.attachments[0].storageKey,'f');assert.equal(events[0].type,'attachment.added');
});

test('attachment metadata failure and late abort leave prior data/bytes intact without success publication',async()=>{
 for(const failure of ['commit','late']){
  const {repo,persistence}=setup(),before=plain(repo.load()),events=[];repo.subscribe(event=>events.push(event));
  const file={id:'f',storageKey:'f',entryId:'a',kind:'upload',filename:'file.bin',mimeType:'application/octet-stream',size:4,createdAt:'2026-10-12T00:00:00Z'};
  if(failure==='commit')persistence.metadata.save=()=>{throw Error('Local commit failed');};
  else persistence.files.save=async(record,commit,rollback)=>{commit();rollback();throw Error('Late abort');};
  await assert.rejects(repo.addAttachment(()=>repo.load(),'a',{key:'f',entryId:'a',blob:new Blob(['data'])},file));assert.deepEqual(plain(repo.load()),before);assert.equal(events.length,0);
 }
});

test('memory and local-facing command APIs return Promises for no-op, validation error and successful writes',async()=>{
 const {repo}=setup();for(const [name,args] of [['save',[initial()]],['saveLayout',[initial()]],['moveEntries',[initial(),['a'],'g']],['replacePlacements',[initial(),[]]],['replaceConstellations',[initial(),[]]],['archive',[initial(),{galaxyId:'g'}]],['restore',[initial(),'g']]]){
  const result=repo[name](...args);assert.equal(typeof result.then,'function',name);await result;
 }
 const invalid=repo.updateLocation(initial(),'gone',{text:'Keep'});assert.equal(typeof invalid.then,'function');await assert.rejects(invalid);
});
