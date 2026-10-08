const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'..','storage.js'),'utf8'),key='galaxy:user-data',oldKey='tool-galaxy:user-data';
const entry={id:'entry',name:'Name',description:'',parentId:null,x:250,y:300,appearance:{archetype:'ringed',future:'keep'}};
const reference={id:'portal:a',targetEntryId:'entry',parentEntryId:'parent',createdAt:'2026-01-01T00:00:00Z'};
const plain=v=>JSON.parse(JSON.stringify(v));
function make(records=[]){
    const data=new Map(records),localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
    const context=vm.createContext({localStorage});vm.runInContext(source,context);
    return {data,localStorage,adapter:vm.runInContext('galaxyStorage',context)};
}
test('empty storage has no snapshot',()=>assert.equal(make().adapter.load(),null));
test('archived Galaxy metadata is additive at v5, preserves canonical data and rejects invalid containers',()=>{
    const {adapter,data}=make(),snapshot={entries:[entry],layout:[],portals:[reference],constellations:[],
        archivedGalaxies:[{galaxyId:entry.id,archivedAt:'2026-10-08T12:00:00Z',expandedIds:[entry.id]}]};
    adapter.save(snapshot);assert.equal(JSON.parse(data.get(key)).version,5);
    assert.deepEqual(plain(adapter.load().archivedGalaxies),snapshot.archivedGalaxies);
    assert.deepEqual(plain(adapter.load().entries),snapshot.entries);assert.deepEqual(plain(adapter.load().portals),snapshot.portals);
    adapter.save({...snapshot,archivedGalaxies:[]});assert.deepEqual(plain(adapter.load().archivedGalaxies),[]);
    const raw=JSON.stringify({...snapshot,version:5,archivedGalaxies:{invalid:true}});data.set(key,raw);
    assert.throws(()=>adapter.load());assert.equal(data.get(key),raw);
});
test('optional Constellations round-trip additively at version 5; old snapshots remain valid',()=>{
    const constellations=[{id:'collection',name:'Favorites',memberEntryIds:['entry'],createdAt:'2026-01-01T00:00:00Z'}];
    const {adapter,data}=make();adapter.save({entries:[entry],portals:[reference],layout:[],constellations});
    assert.equal(JSON.parse(data.get(key)).version,5);assert.deepEqual(plain(adapter.load().constellations),constellations);
    assert.deepEqual(plain(adapter.load().portals),[reference]);
    const raw=JSON.stringify({version:5,entries:[entry],layout:[],constellations:{invalid:true}});data.set(key,raw);
    assert.throws(()=>adapter.load());assert.equal(data.get(key),raw);
});
test('legacy pairwise records are discarded at the boundary without altering canonical content, Portals or layout',()=>{
    for(const connections of [[{from:'entry',to:'parent',id:'old',type:'uses'}],{malformed:true},'obsolete']){
        const snapshot={version:5,entries:[entry,{id:'parent',name:'Parent',content:{version:1,notes:{format:'plain',text:'Keep notes'},links:[],attachments:[]}}],connections,portals:[reference],layout:[{id:'entry',parentId:'parent',angle:1,radius:50}]};
        const raw=JSON.stringify(snapshot),{adapter,data}=make([[key,raw]]),loaded=plain(adapter.load());
        assert.equal('connections' in loaded,false);assert.equal(loaded.needsCanonicalSave,true);
        assert.deepEqual(loaded.entries,snapshot.entries);assert.deepEqual(loaded.portals,[reference]);assert.deepEqual(loaded.layout,snapshot.layout);
        assert.equal(data.get(key),raw,'loading alone never writes');adapter.save(loaded);
        const saved=JSON.parse(data.get(key));assert.equal(saved.version,5);assert.deepEqual(saved.connections,[]);
        assert.deepEqual(saved.entries,snapshot.entries);assert.deepEqual(saved.portals,[reference]);assert.deepEqual(saved.layout,snapshot.layout);
        assert.equal(adapter.load().needsCanonicalSave,undefined);
    }
});
test('snapshots with no legacy connection field load; new saves retain only an empty compatibility slot',()=>{
    const {adapter,data}=make([[key,JSON.stringify({version:5,entries:[entry],layout:[]})]]);
    assert.equal(adapter.load().entries[0].id,'entry');assert.equal('connections' in adapter.load(),false);
    adapter.save({entries:[entry],layout:[],connections:[{from:'entry',to:'other'}]});
    assert.deepEqual(JSON.parse(data.get(key)),{version:5,entries:[entry],connections:[],layout:[]});
});
test('v1/v2 partial starter positions and IDs migrate without pairwise data',()=>{
    for(const version of [1,2]){
        const snapshot={version,...(version===1?{tools:[entry]}:{entries:[entry]}),builtInPositions:[{id:'github',x:300,y:250}],connections:[{from:'entry',to:'github'}]};
        const raw=JSON.stringify(snapshot),{adapter,data}=make([[oldKey,raw]]),loaded=plain(adapter.load());
        assert.equal(loaded.legacy,true);assert.equal(loaded.migrateTree,true);assert.equal(loaded.needsCanonicalSave,true);
        assert.deepEqual(loaded.entries,[entry,...snapshot.builtInPositions]);assert.equal(data.get(oldKey),raw);
        adapter.save(loaded);assert.equal(data.get('galaxy:user-data:pre-hierarchy'),raw);assert.equal(data.get(oldKey),raw);
    }
});
test('current snapshots take priority over legacy keys and corrupt current snapshots are preserved',()=>{
    const raw=JSON.stringify({version:5,entries:[entry],layout:[]}),{adapter,data}=make([[key,raw],[oldKey,'{old broken']]);
    assert.equal(adapter.load().entries[0].id,'entry');data.set(key,'{broken');assert.throws(()=>adapter.load());assert.equal(data.get(key),'{broken');
});
test('invalid/future containers remain protected against overwrite',()=>{
    for(const snapshot of [{version:99,entries:[],layout:[]},{version:5,entries:{},layout:[]},{version:5,entries:[],layout:{}},{version:5,entries:[],layout:[],portals:{}},{version:2,entries:[],builtInPositions:{}}]){
        const raw=JSON.stringify(snapshot),{adapter,data}=make([[key,raw]]);assert.throws(()=>adapter.load());assert.equal(data.get(key),raw);
        if(snapshot.version===99)assert.throws(()=>adapter.save({entries:[],layout:[]}),/cannot be overwritten/);
    }
});
test('v3/v4 upgrades preserve exact backups, hierarchy/appearance and layout',()=>{
    for(const version of [3,4]){
        const snapshot={version,entries:[entry],connections:[{from:'entry',to:'github'}],...(version===4?{layout:[{id:'entry',x:900,y:500,pinned:true}]}:{})};
        const raw=JSON.stringify(snapshot),{adapter,data}=make([[key,raw]]),loaded=plain(adapter.load());
        assert.deepEqual(loaded.entries,[entry]);assert.equal(loaded.legacy,false);assert.equal(loaded.migrateTree,true);
        assert.deepEqual(loaded.layout,snapshot.layout||[]);adapter.save(loaded);
        assert.equal(data.get(version===3?'galaxy:user-data:pre-layout':'galaxy:user-data:pre-cosmic-tree'),raw);
        adapter.save({entries:[],layout:[]});assert.equal(data.get('galaxy:user-data:pre-cosmic-tree'),raw);
    }
});
test('failed backups and quota writes do not replace the original snapshot',()=>{
    for(const version of [2,3,4,5]){
        const snapshot={version,entries:[entry],connections:[],layout:[],builtInPositions:[]},raw=JSON.stringify(snapshot),{adapter,data,localStorage}=make([[key,raw]]);
        localStorage.setItem=()=>{throw new Error('quota')};assert.throws(()=>adapter.save({entries:[],layout:[]}),/quota/);assert.equal(data.get(key),raw);
    }
});
test('Portal references, content metadata and deep ancestry round-trip in version 5 without connection state',()=>{
    const {adapter}=make(),snapshot={entries:[{...entry,parentId:'parent',content:{version:1,notes:{format:'plain',text:'Keep'},links:[{id:'bookmark',url:'https://example.com/'}],attachments:[]}},{id:'parent',name:'Parent'}],portals:[reference],layout:[]};
    adapter.save(snapshot);assert.deepEqual(plain(adapter.load()),{version:5,migrateTree:false,legacy:false,...snapshot});
});
test('storage access failures propagate to existing error handling',()=>{
    const {adapter,localStorage}=make();localStorage.getItem=()=>{throw new Error('blocked')};assert.throws(()=>adapter.load(),/blocked/);
});
