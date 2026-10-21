const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({URL,structuredClone,Blob});
for(const file of ['model.js','task-lists.js','portals.js','clipboard.js','persistence/local-metadata-store.js','persistence/memory-stores.js','services/universe-repository.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const get=name=>vm.runInContext(name,context),model=get('galaxyModel'),tasks=get('cosmosTasks');
const plain=value=>JSON.parse(JSON.stringify(value));
const entry=(id,parentId=null,extra={})=>({id,name:id,parentId,x:100,y:100,description:'',category:'',...extra});
function repository(entries){
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,v)=>values.set(key,v)};
 const metadata=get('createLocalMetadataStore')({storage:()=>storage});
 const repo=get('createUniverseRepository')({persistence:{metadata}});
 const snapshot=()=>repo.snapshot({entries,portals:new Map(),constellations:new Map(),layout:new Map(),archivedGalaxies:new Map()});
 return {repo,metadata,snapshot,values};
}

function fixture(){return new Map([
 entry('Japan'),entry('Photos','Japan'),entry('Places','Japan'),entry('Before the trip','Japan',{taskList:true}),
 ...['Buy flight','Book hotel','Rent car','Buy eSIM'].map(name=>entry(name,'Before the trip',{completed:false}))
].map(e=>[e.id,e]));}
test('only Task Lists and their direct children participate',()=>{
 const entries=fixture();entries.set('Invalid grandchild',entry('Invalid grandchild','Buy flight'));
 const index=tasks.index(entries);
 for(const id of ['Japan','Photos','Places','Invalid grandchild'])assert.equal(index.get(id).enabled,false);
 assert.equal(index.get('Before the trip').list,true);assert.equal(index.get('Before the trip').task,false);
 for(const id of ['Buy flight','Book hotel','Rent car','Buy eSIM'])assert.equal(index.get(id).task,true);
});
test('direct ratios, stale parent completion, final completion, uncheck and empty lists',()=>{
 const entries=fixture();entries.get('Before the trip').completed=true;
 assert.equal(tasks.index(entries).get('Before the trip').ratio,0);
 entries.get('Buy flight').completed=true;
 assert.equal(tasks.index(entries).get('Before the trip').ratio,.25);
 for(const id of ['Book hotel','Rent car','Buy eSIM'])entries.get(id).completed=true;
 assert.equal(tasks.index(entries).get('Before the trip').complete,true);
 entries.get('Buy flight').completed=false;
 assert.equal(tasks.index(entries).get('Before the trip').complete,false);
 entries.set('Empty',entry('Empty','Japan',{taskList:true}));
 const empty=tasks.index(entries).get('Empty');assert.equal(empty.total,0);assert.equal(empty.ratio,0);assert.equal(empty.complete,false);
 entries.delete('Buy eSIM');assert.equal(tasks.index(entries).get('Before the trip').ratio,2/3);
});
test('three tasks yield 0%, 1/3, 100% without descendant aggregation',()=>{
 const entries=fixture();entries.delete('Buy eSIM');
 assert.equal(tasks.index(entries).get('Before the trip').ratio,0);
 entries.get('Buy flight').completed=true;assert.equal(tasks.index(entries).get('Before the trip').ratio,1/3);
 entries.get('Book hotel').completed=entries.get('Rent car').completed=true;
 assert.equal(tasks.index(entries).get('Before the trip').ratio,1);
});
test('Task List creation validates all names, ignores blanks, allows empty and does not mutate input',()=>{
 const entries=fixture(),before=JSON.stringify([...entries]);let n=0;
 const parent=entry('New list','Japan',{taskList:true});
 const created=tasks.create(entries,parent,['  Flight  ','','  ','Hotel'],()=>`new-${++n}`);
 assert.equal(created[0].taskList,true);assert.deepEqual(plain(created.slice(1).map(e=>e.name)),['Flight','Hotel']);
 assert.ok(created.slice(1).every(e=>e.parentId===parent.id&&e.completed===false));
 assert.equal(tasks.create(entries,parent,[],()=>`new-${++n}`).length,1);
 assert.throws(()=>tasks.create(entries,{...parent,name:' '},[],()=>''),/name/);
 assert.throws(()=>tasks.create(entries,parent,['x'.repeat(61)],()=>`new-${++n}`),/shorten/);
 assert.throws(()=>tasks.create(entries,{...parent,parentId:'Before the trip'},[],()=>''),/another Task List/);
 assert.equal(JSON.stringify([...entries]),before);
});
test('task children reject CB creation, Task Lists reject nested lists and branches',()=>{
 const entries=fixture();
 assert.match(model.validateChange(entry('child','Buy flight'),entries),/cannot contain child/);
 assert.match(model.validateChange(entry('nested','Before the trip',{taskList:true}),entries),/another Task List/);
 entries.set('Album',entry('Album','Photos'));entries.set('Photo',entry('Photo','Album'));
 assert.match(model.movePlan(entries,['Album'],'Before the trip').error,/with children/);
 assert.match(model.movePlan(entries,['Before the trip'],'Buy flight').error,/cannot contain child/);
 assert.equal(model.validateChange(entry('Normal child','Photos'),entries),'');
 assert.match(model.validateChange({...entries.get('Places'),taskList:true},entries),/cannot be changed/);
 assert.match(model.validateChange({...entries.get('Before the trip'),taskList:false},entries),/cannot be changed/);
});
test('move leaf in, task out, task between lists, and Task List with its tasks',()=>{
 const entries=fixture();entries.set('Other list',entry('Other list','Japan',{taskList:true}));
 const move=(id,parentId)=>{assert.equal(model.movePlan(entries,[id],parentId).error,'');entries.get(id).parentId=parentId;};
 move('Places','Before the trip');assert.equal(tasks.index(entries).get('Places').task,true);
 entries.get('Buy flight').completed=true;
 move('Buy flight','Photos');assert.equal(tasks.index(entries).get('Buy flight').enabled,false);assert.equal(entries.get('Buy flight').completed,true);
 move('Buy flight','Other list');assert.equal(tasks.index(entries).get('Buy flight').complete,true);
 move('Before the trip','Photos');assert.equal(tasks.index(entries).get('Book hotel').task,true);
 assert.match(model.movePlan(entries,['Before the trip'],'Other list').error,/another Task List/);
});
test('only direct tasks accept boolean completion; role toggles are retired',()=>{
 const entries=fixture();
 for(const [id,field,value] of [['Photos','completed',true],['Before the trip','completed',true],['Buy flight','taskList',true],['Buy flight','other',true],['Buy flight','completed','true']])assert.throws(()=>tasks.change(entries,id,field,value));
 assert.equal(tasks.change(entries,'Buy flight','completed',true).completed,true);
});
test('old normal data stays normal; experimental flags are dropped; task booleans round trip',()=>{
 const old=model.normalizeEntry(entry('old',null,{taskModeRoot:true}));assert.equal(old.taskList,undefined);assert.equal(old.taskModeRoot,undefined);
 const data=model.normalizeEntry(entry('list',null,{taskList:true,completed:false}));assert.equal(data.taskList,true);assert.equal(data.completed,false);
 for(const extra of [{taskList:'yes'},{completed:1}])assert.equal(model.normalizeEntry(entry('bad',null,extra)),null);
});
test('Task List and completion survive canonical snapshot and fresh storage',async()=>{
 const entries=fixture(),{repo,metadata,snapshot}=repository(entries);
 await repo.updateTask(snapshot,'Buy flight','completed',true);
 const saved=metadata.load(),reloaded=new Map(saved.entries.map(e=>[e.id,model.normalizeEntry(e)]));
 assert.equal(tasks.index(reloaded).get('Buy flight').complete,true);assert.equal(reloaded.get('Before the trip').taskList,true);
 assert.ok(!saved.entries.some(e=>'ratio' in e||'task' in e||'taskModeRoot' in e));
 await repo.updateTask(saved,'Buy flight','completed',false);assert.equal(metadata.load().entries.find(e=>e.id==='Buy flight').completed,false);
});
test('failed persistence publishes no completion mutation',async()=>{
 const entries=fixture(),before=JSON.stringify([...entries]),{snapshot}=repository(entries);
 const failing=get('createUniverseRepository')({persistence:{metadata:{commit:async()=>{throw new Error('disk full');}}}});
 await assert.rejects(failing.updateTask(snapshot,'Buy flight','completed',true),/disk full/);assert.equal(JSON.stringify([...entries]),before);
});
test('duplicate Task List resets tasks, normal structure remains empty and paste derives destination status',()=>{
 const entries=fixture();entries.get('Buy flight').completed=true;let n=0;
 const snapshot={entries:[...entries.values()],portals:[]},copies=get('hierarchyCopies');
 const structure=copies.structure(snapshot,'Before the trip','Next trip',()=>`new-${++n}`);
 assert.equal(structure.copies[0].taskList,true);assert.equal(structure.copies.length,5);
 assert.ok(structure.copies.slice(1).every(e=>e.completed===false));
 const normal=copies.structure(snapshot,'Photos','More photos',()=>`new-${++n}`);assert.equal(normal.copies[0].taskList,undefined);
 const copy=copies.plan(snapshot,['Before the trip'],'Photos',()=>`copy-${++n}`);
 assert.equal(copy.copies[0].taskList,true);assert.equal(copy.copies.find(e=>e.name==='Buy flight').completed,true);
 const single=copies.plan(snapshot,['Buy flight'],'Photos',()=>`copy-${++n}`);
 assert.equal(single.copies[0].taskList,undefined);
 assert.equal(tasks.index(new Map([...entries,...single.copies.map(e=>[e.id,e])])).get(single.rootIds[0]).task,false);
 const into=copies.plan(snapshot,['Places'],'Before the trip',()=>`copy-${++n}`);
 assert.equal(tasks.index(new Map([...entries,...into.copies.map(e=>[e.id,e])])).get(into.rootIds[0]).task,true);
 assert.throws(()=>copies.plan(snapshot,['Before the trip'],'Before the trip',()=>`copy-${++n}`),/another Task List/);
 assert.throws(()=>copies.plan(snapshot,['Japan'],'Before the trip',()=>`copy-${++n}`),/with children/);
 assert.throws(()=>copies.plan(snapshot,['Photos'],'Buy flight',()=>`copy-${++n}`),/cannot contain child/);
});
test('deep normal trees do not inherit participation and metadata never mutates records',()=>{
 const entries=new Map(Array.from({length:15000},(_,i)=>[String(i),entry(String(i),i?String(i-1):null,i?{}:{taskList:true})]));
 entries.get('14999').completed=true;const before=JSON.stringify([...entries]),index=tasks.index(entries);
 assert.equal(index.get('0').total,1);assert.equal(index.get('0').complete,false);assert.equal(index.get('14999').enabled,false);assert.equal(JSON.stringify([...entries]),before);
});

test('secondary view discovers canonical lists in stable model order and keeps all direct tasks',()=>{
 const entries=fixture();entries.get('Buy flight').completed=true;
 entries.set('Home',entry('Home'));entries.set('Renovation',entry('Renovation','Home',{taskList:true}));
 entries.set('Paint',entry('Paint','Renovation'));entries.set('Nested invalid',entry('Nested invalid','Buy flight'));
 const lists=tasks.lists(entries,tasks.index(entries));
 assert.deepEqual(plain(lists.map(x=>x.entry.id)),['Before the trip','Renovation']);
 assert.equal(lists[0].entry,entries.get('Before the trip'));assert.equal(lists[0].tasks.length,4);
 assert.equal(lists[0].tasks[0],entries.get('Buy flight'));assert.equal(lists[0].state.ratio,.25);
 entries.get('Buy flight').parentId='Home';assert.equal(tasks.lists(entries)[0].tasks.length,3);
 entries.delete('Before the trip');assert.deepEqual(plain(tasks.lists(entries).map(x=>x.entry.id)),['Renovation']);
});
