const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test'),context=vm.createContext({});
for(const file of ['model.js','portals.js','hierarchy.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
const model=vm.runInContext('galaxyModel',context),portals=vm.runInContext('galaxyPortals',context),tree=vm.runInContext('cosmosHierarchy',context);
const plain=value=>JSON.parse(JSON.stringify(value));
const entries=new Map([['g',{id:'g',name:'Galaxy'}],...Array.from({length:8},(_,i)=>[`n${i}`,{id:`n${i}`,name:'Name '+i,parentId:i?`n${i-1}`:'g'}]),['h',{id:'h',name:'Other Galaxy'}]]);
model.normalizeHierarchy(entries);
const reference=(id='portal:a',target='n7',parent='h')=>({id,targetEntryId:target,parentEntryId:parent,createdAt:'2026-01-01T00:00:00Z'});
test('Portals reference any canonical depth without changing parent, role, or content',()=>{
    const before=plain([...entries.values()]);
    for(const target of entries.keys())for(const parent of entries.keys())assert.equal(portals.placementError(entries,new Map(),target,parent),'');
    const record=portals.normalize({...reference(),name:'Do not copy',content:{},role:'planet'},entries);
    assert.deepEqual(plain(record),reference());assert.deepEqual(plain([...entries.values()]),before);
});
test('normalization rejects chains, noncanonical containers, ID collisions and broken references; exact placements deduplicate',()=>{
    const valid=reference();
    for(const record of [reference('g'),reference('portal:b','missing'),reference('portal:b','portal:a'),reference('portal:b','n7','portal:a'),{...valid,createdAt:'invalid'}])assert.equal(portals.normalize(record,entries),null);
    assert.deepEqual(plain(portals.normalizeAll([valid,reference('portal:b'),reference('portal:c','n7','g')],entries)),[valid,reference('portal:c','n7','g')]);
    assert.match(portals.placementError(entries,new Map([[valid.id,valid]]),'n7','h'),/already shown/);
});
test('sidebar projection treats ancestor/self/deep references as leaves with their placement level and no recursive expansion',()=>{
    const records=[reference(),reference('portal:self','g','g'),reference('portal:back','g','n7')],refs=new Map(records.map(p=>[p.id,p]));
    const index=tree.index(entries,refs),expanded=new Set([...entries.keys(),...refs.keys()]),rows=tree.visible(entries,index,expanded,refs);
    assert.equal(rows.length,entries.size+refs.size);
    assert.equal(rows.find(r=>r.id==='portal:a').level,2);
    assert.equal(rows.find(r=>r.id==='portal:back').level,10);
    assert.equal(rows.filter(r=>r.kind==='portal').length,3);
    assert.equal(index.children.has('portal:a'),false);
    expanded.delete('h');assert.equal(tree.visible(entries,index,expanded,refs).some(r=>r.id==='portal:a'),false);
});
test('subtree cleanup handles deleted targets and placement parents independently and preserves unrelated references',()=>{
    const records=[reference(),reference('portal:b','g','n3'),reference('portal:keep','g','h')];
    const deleted=model.subtreeIds(entries,'n3');
    assert.deepEqual(plain(portals.withoutEntries(records,deleted)),[records[2]]);
    assert.deepEqual(plain(portals.withoutEntries(records,new Set(['h']))),[records[1]]);
    assert.equal(records.length,3);
});
