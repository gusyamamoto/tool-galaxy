const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test');
const c=vm.createContext({});for(const file of ['model.js','archives.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c);
const model=vm.runInContext('galaxyModel',c),archives=vm.runInContext('galaxyArchives',c),plain=value=>JSON.parse(JSON.stringify(value));
function family(count=8){const entries=new Map(Array.from({length:count},(_,i)=>[`n${i}`,{id:`n${i}`,name:`Item ${i}`,parentId:i?`n${i-1}`:null,x:i*50,y:i*20,content:{notes:'keep'}}]));model.normalizeHierarchy(entries);return entries;}
test('archiving a deep tree partitions presentation without changing IDs, content or coordinates',()=>{
    const entries=family(5000),before=plain([...entries]),records=archives.normalize([{galaxyId:'n0',archivedAt:'2026-10-08T12:00:00Z',expandedIds:['n0','n1','missing']}],entries);
    assert.deepEqual(plain(records.get('n0').expandedIds),['n0','n1']);
    const archived=archives.split(entries,records);assert.equal(entries.size,0);assert.equal(archived.size,5000);
    assert.deepEqual(plain([...archives.join(entries,archived)]),before);
});
test('archive metadata accepts only unique whole Galaxies and rejects corrupt saved state',()=>{
    const entries=family(),valid={galaxyId:'n0',archivedAt:'2026-10-08T12:00:00Z'};
    for(const value of [null,{},[null],[{...valid,galaxyId:'n1'}],[{...valid,galaxyId:'missing'}],[{...valid,archivedAt:'invalid'}],[valid,valid],[{...valid,expandedIds:{}}]])
        assert.throws(()=>archives.normalize(value,entries));
    assert.equal(entries.size,8);assert.equal(archives.normalize([],entries).size,0);
});
test('multiple archived roots remain separate and restore without reparenting',()=>{
    const entries=family();entries.set('other',{id:'other',name:'Other',parentId:null,x:800,y:600});model.normalizeHierarchy(entries);
    const records=archives.normalize(['n0','other'].map(galaxyId=>({galaxyId,archivedAt:'2026-10-08T12:00:00Z'})),entries);
    const archived=archives.split(entries,records),ids=model.subtreeIds(archived,'n0');
    ids.forEach(id=>{entries.set(id,archived.get(id));archived.delete(id);});
    assert.equal(entries.size,8);assert.equal(archived.size,1);assert.equal(entries.get('n7').parentId,'n6');assert.equal(archived.get('other').x,800);
});
