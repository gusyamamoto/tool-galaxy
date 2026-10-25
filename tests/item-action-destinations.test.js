const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({URL,Blob,structuredClone});
for(const file of ['model.js','hierarchy.js','portals.js','constellations.js','clipboard.js','move-destination-picker.js','persistence/memory-stores.js','services/universe-repository.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const {model,copies,Clipboard,Index,metadata,repository}=vm.runInContext('({model:galaxyModel,copies:hierarchyCopies,Clipboard:HierarchyClipboard,Index:MoveDestinationIndex,metadata:createMemoryMetadataStore,repository:createUniverseRepository})',ctx);
const plain=value=>JSON.parse(JSON.stringify(value));
const fresh=()=>{let n=0;return()=>`new-${++n}`;};
function fixture(){return {entries:[
    {id:'a',name:'Galaxy A',parentId:null},{id:'source',name:'Restaurants',parentId:'a',description:'Original notes',category:'Food',location:{text:'Tokyo'}},
    {id:'child',name:'Places',parentId:'source'},{id:'leaf',name:'List entry',parentId:'child'},
    {id:'same',name:'Other location',parentId:'a'},{id:'b',name:'Galaxy B',parentId:null},{id:'elsewhere',name:'Other location',parentId:'b'},
    {id:'list',name:'Tasks',parentId:'b',taskList:true},{id:'task',name:'Task',parentId:'list',completed:true},
    {id:'archived',name:'Archived Galaxy',parentId:null},{id:'inactive',name:'Inactive location',parentId:'archived'}
],archivedGalaxies:[{galaxyId:'archived',archivedAt:'2026-01-01T00:00:00Z'}],portals:[],constellations:[],layout:[]};}
const entriesOf=source=>new Map(source.entries.map(entry=>[entry.id,entry]));
function indexFor(source,id){const data=entriesOf(source),validate=copies.destinationValidator(data,[id],{structure:true,archivedGalaxies:source.archivedGalaxies});return new Index(data,id,entry=>validate(entry.parentId));}

test('empty/deleted clipboard hides Paste; surviving normalized roots remain reusable',()=>{
    const data=entriesOf(fixture()),clip=new Clipboard();assert.ok(clip.copyError(data,'same'));
    clip.copy(data,['source','child']);assert.equal(clip.copyError(data,'same'),'');assert.deepEqual(plain(clip.roots(data)),['source']);
    assert.equal(clip.copyError(data,'elsewhere'),'');assert.deepEqual(plain(clip.roots(data)),['source']);
    data.delete('source');assert.ok(clip.copyError(data,'same'));
});

test('copy destination availability matches actual projected hierarchy rules without consuming production IDs',()=>{
    const source=fixture(),data=entriesOf(source),clip=new Clipboard();clip.copy(data,['source']);
    for(const target of ['a','same','b','elsewhere','source','child','leaf']){
        assert.equal(clip.copyError(data,target),'',target);
        const plan=copies.plan(source,['source'],target,fresh());assert.equal(plan.copies[0].parentId,target);
        assert.equal(plan.copies[0].name,'Restaurants');assert.equal(plan.copies.length,3);
    }
    for(const target of [null,'missing','list','task'])assert.ok(clip.copyError(data,target));
});

test('self/descendant copies remain finite independent snapshots, with original parents untouched',()=>{
    for(const destination of ['source','leaf']){
        const source=fixture(),before=structuredClone(source),plan=copies.plan(source,['source'],destination,fresh());
        assert.equal(plan.copies.length,3);assert.equal(plan.copies[0].parentId,destination);
        assert.equal(plan.copies[1].parentId,plan.copies[0].id);assert.equal(plan.copies[2].parentId,plan.copies[1].id);
        assert.deepEqual(source,before);assert.ok(plan.copies.every(entry=>!model.validateChange(entry,new Map([...entriesOf(source),...plan.copies.map(x=>[x.id,x])]))));
    }
});

test('Task List/task restrictions validate the complete copied branch',()=>{
    const source=fixture(),data=entriesOf(source);
    assert.ok(copies.destinationValidator(data,['source'])('list'));
    assert.ok(copies.destinationValidator(data,['list'])('list'));
    assert.ok(copies.destinationValidator(data,['leaf'])('task'));
    assert.equal(copies.destinationValidator(data,['leaf'])('list'),'');
    assert.equal(copies.destinationValidator(data,['task'])('elsewhere'),'');
});

test('both creation plans reject archived destinations including nested locations',()=>{
    const source=fixture();for(const destination of ['archived','inactive']){
        assert.throws(()=>copies.plan(source,['source'],destination,fresh()),/active Galaxy/);
        assert.throws(()=>copies.structure(source,'source','New',fresh(),{destination}),/active Galaxy/);
    }
});

test('Duplicate index defaults to current parent and shares Move tree paths/search across Galaxies',()=>{
    const index=indexFor(fixture(),'source');assert.equal(index.currentParentId,'a');assert.equal(index.allowed('a'),true);
    assert.equal(index.allowed('elsewhere'),true);assert.equal(index.path('elsewhere'),'Galaxy B › Other location');
    assert.deepEqual(Array.from(index.search('other'),x=>x.id),['same','elsewhere']);
    assert.equal(index.entries.has('inactive'),false);assert.equal(index.entries.has('archived'),false);
});

test('Duplicate structure keeps same-parent behavior when destination is omitted',()=>{
    const source=fixture(),old=copies.structure(source,'source','Restaurants copy',fresh()),explicit=copies.structure(source,'source','Restaurants copy',fresh(),{destination:'a'});
    for(const result of [old,explicit]){assert.equal(result.copies[0].parentId,'a');assert.equal(result.copies.length,3);assert.equal(result.files.length,0);}
});

for(const destination of ['same','elsewhere','source','leaf'])test(`Duplicate into ${destination} validates independent structure without moving originals`,()=>{
    const source=fixture(),before=structuredClone(source),plan=copies.structure(source,'source',' Custom name ',fresh(),{destination,x:42,y:17});
    assert.equal(plan.copies[0].parentId,destination);assert.equal(plan.copies[0].name,'Custom name');assert.equal(plan.copies.length,3);
    assert.deepEqual(source,before);assert.ok(plan.copies.every(e=>!e.content&&!e.location&&!e.appearance&&e.description===''&&e.category===''&&e.x===42&&e.y===17));
    assert.equal(plan.files.length,0);assert.equal(plan.links.length,0);
});

test('Galaxy duplication remains fixed to Universe and cannot produce nested Galaxies',()=>{
    const source=fixture(),index=indexFor(source,'a');assert.equal(index.allowed(null),true);assert.equal(index.entries.size,0);
    assert.throws(()=>copies.structure(source,'a','Galaxy copy',fresh(),{destination:'b'}),/Universe/);
    assert.equal(copies.structure(source,'a','Galaxy copy',fresh(),{destination:null}).copies[0].parentId,null);
});

test('duplicate Task List resets completion and leaf copied into Task List becomes incomplete',()=>{
    const source=fixture(),plan=copies.structure(source,'list','New tasks',fresh(),{destination:'same'});
    assert.equal(plan.copies[0].taskList,true);assert.equal(plan.copies[1].completed,false);
    const task=copies.structure(source,'leaf','New task',fresh(),{destination:'list'}).copies[0];assert.equal(task.completed,false);
    for(const id of ['source','list'])assert.throws(()=>copies.structure(source,id,'No',fresh(),{destination:'list'}));
});

test('invalid/removed duplicate destinations reject before allocation or publication',async()=>{
    const source=fixture(),meta=metadata(source),repo=repository({persistence:{metadata:meta,files:new Proxy({},{get(){throw Error('No file access');}})}});
    let allocations=0,published=0;repo.subscribe(()=>published++);
    await assert.rejects(repo.duplicateStructure(source,'source','New',()=>{allocations++;return 'new';},{destination:'missing'}),/location/);
    assert.equal(allocations,0);assert.equal(published,0);assert.deepEqual(plain(meta.load()),source);
});

test('cross-Galaxy duplication commits once and failure leaves original hierarchy unchanged',async()=>{
    const source=fixture(),meta=metadata(source),repo=repository({persistence:{metadata:meta}});let published=0;repo.subscribe(()=>published++);
    const result=await repo.duplicateStructure(source,'source','Another structure',fresh(),{destination:'elsewhere'});
    assert.equal(published,1);assert.equal(result.copies[0].parentId,'elsewhere');assert.deepEqual(plain(meta.load().entries.slice(0,source.entries.length)),source.entries);
    const failed=metadata(source),failedRepo=repository({persistence:{metadata:failed}});failed.commit=async()=>{throw Error('storage rejected');};
    await assert.rejects(failedRepo.duplicateStructure(source,'source','Another',fresh(),{destination:'elsewhere'}),/storage rejected/);
    assert.deepEqual(plain(failed.load()),source);
});

test('destination validation retains existing unlimited deep Item hierarchy rules',()=>{
    const source=fixture();for(let n=0;n<12;n++)source.entries.push({id:'deep-'+n,name:'Deep '+n,parentId:n?'deep-'+(n-1):'elsewhere'});
    assert.equal(copies.destinationValidator(entriesOf(source),['source'])('deep-11'),'');
    const plan=copies.structure(source,'source','Deep structure',fresh(),{destination:'deep-11'});
    assert.equal(plan.copies.length,3);assert.equal(plan.copies[0].parentId,'deep-11');
});
