const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const {test}=require('node:test'),c=vm.createContext({URLSearchParams});
for(const file of ['model.js','appearance.js','sample-data.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c);
const model=vm.runInContext('galaxyModel',c),sample=vm.runInContext('galaxySample',c),appearance=vm.runInContext('galaxyAppearance',c);
const plain=v=>JSON.parse(JSON.stringify(v));
test('development query is explicit and generation deterministic and isolated',()=>{
    assert.equal(sample.isRequested('?sample=large'),true);assert.equal(sample.isRequested(''),false);
    assert.deepEqual(plain(sample.build()),plain(sample.build()));
    assert.equal(fs.readFileSync(path.join(__dirname,'../sample-data.js'),'utf8').includes('localStorage'),false);
});
test('183 entries exercise four Galaxies, eight Suns and seven levels of nesting',()=>{
    const snapshot=sample.build(),entries=new Map(snapshot.entries.map(e=>[e.id,model.normalizeEntry(e)]));
    model.normalizeHierarchy(entries);assert.equal(entries.size,183);
    const counts={};entries.forEach(e=>{counts[e.role]=(counts[e.role]||0)+1;assert.equal(model.validateChange(e,entries),'');});
    assert.deepEqual(counts,{galaxy:4,sun:8,planet:24,moon:48,satellite:99});
    assert.equal(entries.get('sample-deep-7').depth,7);
    const galaxies=[...entries.values()].filter(e=>e.depth===0);
    assert.ok(galaxies.every(e=>model.childrenOf(entries,e.id).length===2));
    assert.equal(new Set(galaxies.map(e=>appearance.resolve(e).archetype)).size,4);
    assert.equal(new Set([...entries.values()].filter(e=>e.depth===2).map(e=>appearance.resolve(e).archetype)).size,6);
    assert.equal(model.buildConnections(entries,[]).length,179);assert.deepEqual(plain(snapshot.layout),[]);
});
