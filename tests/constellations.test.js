const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test'),context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../constellations.js'),'utf8'),context);
const model=vm.runInContext('galaxyConstellations',context),plain=value=>JSON.parse(JSON.stringify(value));
const entries=new Map([['a',{id:'a',parentId:null}],['b',{id:'b',parentId:'a'}],['c',{id:'c',parentId:null}]]);
const collection=(id,members)=>({id,name:'Trip',memberEntryIds:members,createdAt:'2026-01-01T00:00:00Z'});
test('represented Galaxies derive only from current canonical ancestry, including roots, moves, removals and invalid paths',()=>{
    const graph=new Map([...entries].map(([id,entry])=>[id,{...entry}]));
    graph.set('deep',{id:'deep',parentId:'b'});graph.set('cycle',{id:'cycle',parentId:'cycle'});graph.set('orphan',{id:'orphan',parentId:'missing'});
    assert.deepEqual([...model.galaxyIds(['deep','b','c','missing','portal:a','cycle','orphan'],graph)],['a','c']);
    graph.get('b').parentId='c';assert.deepEqual([...model.galaxyIds(['deep'],graph)],['c']);
    graph.delete('deep');assert.deepEqual([...model.galaxyIds(['deep'],graph)],[]);
    assert.deepEqual([...model.galaxyIds([],graph)],[]);
});
test('independent overlapping memberships normalize to unique canonical references, keeping empty collections',()=>{
    const records=[collection('one',['a','a','b','portal:a','missing']),collection('two',['a','c']),collection('empty',['missing'])];
    const before=JSON.stringify([...entries]);const result=plain(model.normalizeAll(records,entries));
    assert.deepEqual(result.map(c=>c.memberEntryIds),[['a','b'],['a','c'],[]]);assert.equal(JSON.stringify([...entries]),before);
    assert.deepEqual(plain(model.normalizeAll(result,entries)),result);
});
test('invalid collection records and duplicate IDs cannot replace canonical entries or valid collections',()=>{
    const records=[collection('a',['a']),collection('ok',['a']),collection('ok',['b']),{...collection('invalid',[]),name:' '},{...collection('bad-date',[]),createdAt:'invalid'},null];
    assert.deepEqual(plain(model.normalizeAll(records,entries)).map(c=>c.id),['ok']);
});
test('Portal context resolves to canonical identity; deletion preserves unrelated references and empty collections',()=>{
    const portals=new Map([['portal:a',{targetEntryId:'a'}]]);
    assert.equal(model.canonicalId('portal:a',entries,portals),'a');assert.equal(model.canonicalId('missing',entries,portals),null);
    const records=[collection('one',['a','b']),collection('two',['a','c'])];
    assert.deepEqual(plain(model.withoutEntries(records,new Set(['a','b']))).map(c=>c.memberEntryIds),[[],['c']]);
    assert.deepEqual(records[0].memberEntryIds,['a','b']);
});
test('sparse pattern is deterministic, connected and exactly n-1 edges at normal and large sizes',()=>{
    for(const n of [0,1,2,5,128,129,1500]){
        const points=Array.from({length:n},(_,i)=>({id:String(i),x:(i*73)%137,y:(i*47)%191}));
        const edges=plain(model.pattern(points));assert.equal(edges.length,Math.max(0,n-1));assert.deepEqual(edges,plain(model.pattern(points)));
        const reached=new Set(n?['0']:[]);while(true){const size=reached.size;edges.forEach(e=>{if(reached.has(e.from)||reached.has(e.to)){reached.add(e.from);reached.add(e.to);}});if(size===reached.size)break;}
        assert.equal(reached.size,n);assert.equal(new Set(edges.map(e=>[e.from,e.to].sort().join(':'))).size,edges.length);
    }
});
test('normal collections use a minimum spanning tree without pairwise or persistent edge data',()=>{
    const points=[{id:'a',x:0,y:0},{id:'b',x:1,y:0},{id:'c',x:3,y:0},{id:'d',x:3,y:2}];
    assert.deepEqual(plain(model.pattern(points)),[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'d'}]);
    assert.deepEqual(Object.keys(plain(model.normalizeAll([collection('one',['a'])],entries))[0]),['id','name','memberEntryIds','createdAt']);
});
