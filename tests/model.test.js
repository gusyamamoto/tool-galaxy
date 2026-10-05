const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { test } = require('node:test');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../model.js'), 'utf8'), context);
const model = vm.runInContext('galaxyModel', context);
const entry = (id, parentId = null) => ({ id, parentId, name: id, description: 'Description', category: '', x: 400, y: 350 });
const plain = value => JSON.parse(JSON.stringify(value));
function chain(count = 8) {
    const entries = new Map(Array.from({ length: count }, (_,i) => [`e${i}`, entry(`e${i}`, i ? `e${i-1}` : null)]));
    model.normalizeHierarchy(entries); return entries;
}
test('generic tree computes visual depth through thousands of levels without recursion', () => {
    const entries = chain(2000);
    assert.deepEqual([...entries.values()].slice(0,6).map(e => e.role), ['galaxy','sun','planet','moon','satellite','satellite']);
    assert.equal(entries.get('e1999').depth, 1999);
    assert.equal(model.ancestors(entries,'e1999').length,1999);
    assert.ok([...entries.values()].every(e=>model.validateChange(e, entries)===''));
});
test('reparenting recomputes a whole subtree and allows a tree to stop at any depth', () => {
    const entries=chain(); entries.get('e3').parentId='e0'; model.normalizeHierarchy(entries);
    assert.equal(entries.get('e3').role,'sun'); assert.equal(entries.get('e4').role,'planet');
    entries.get('e3').parentId=null; model.normalizeHierarchy(entries);
    assert.equal(entries.get('e3').role,'galaxy'); assert.equal(entries.get('e7').depth,4);
});
test('self parenting, descendant parenting and missing parents are rejected', () => {
    const entries=chain();
    for(const parentId of ['e0','e4','e7']) assert.match(model.validateChange({...entries.get('e0'), parentId},entries),/ancestor/);
    assert.match(model.validateChange({...entries.get('e0'),parentId:'missing'},entries),/existing parent/);
});
test('malformed stored cycles and missing parents are repaired without dropping records', () => {
    const entries=chain(); entries.get('e0').parentId='e7'; entries.set('orphan',entry('orphan','missing'));
    model.normalizeHierarchy(entries);
    assert.equal(entries.size,9); assert.equal(entries.get('orphan').parentId,null);
    entries.forEach(e=>assert.equal(model.validateChange(e,entries),''));
});
test('legacy migration preserves IDs, content and valid ancestry in a neutral Galaxy', () => {
    const records=[{...entry('sun'),role:'group'},{...entry('planet','sun'),role:'subcategory'},
        {...entry('moon','planet'),role:'entry'},{...entry('orphan','missing'),role:'entry'},
        {...entry('migration-my-galaxy'),role:'category'}];
    const entries=new Map(records.map(r=>[r.id,model.normalizeEntry(r)]));
    model.migrateLegacy(entries,records);
    assert.equal(entries.size,6); assert.equal(entries.get('sun').parentId,'migration-my-galaxy-1');
    assert.equal(entries.get('planet').parentId,'sun'); assert.equal(entries.get('moon').parentId,'planet');
    assert.equal(entries.get('moon').role,'moon'); assert.equal(entries.get('orphan').parentId,'migration-my-galaxy-1');
    records.forEach(r=>assert.equal(entries.get(r.id).description,r.description));
});
test('layout migration uses restored parent coordinates independent of layout record order',()=>{
    const entries=chain(4);
    const records=[{id:'e2',x:600,y:400,pinned:false},{id:'e1',x:500,y:400,pinned:true}];
    const layout=model.normalizeLayout(records,entries);
    assert.equal(layout.get('e2').radius,100);assert.equal(layout.get('e2').angle,0);
    assert.equal(entries.get('e1').x,500);
});
test('old soft positions become initial positions and relative influences; pins stay exact', () => {
    const entries=chain(); const layout=model.normalizeLayout([{id:'e1',x:900,y:600,pinned:false},
        {id:'e2',x:-8000,y:7000,pinned:true},{id:'missing',x:5,y:5},{id:'e4',x:Infinity,y:5}],entries);
    assert.equal(layout.size,2); assert.equal(layout.get('e1').x,undefined);
    assert.equal(layout.get('e1').parentId,'e0'); assert.equal(entries.get('e1').x,900);
    assert.deepEqual(plain(layout.get('e2')),{x:-8000,y:7000,pinned:true});
});
test('derived hierarchy edges override duplicate semantic edges but preserve independent relationships', () => {
    const entries=chain(4), links=[{from:'e1',to:'e0'},{from:'e0',to:'e3'},{from:'e0',to:'e0'},{from:'e0',to:'missing'}];
    const edges=model.buildConnections(entries,links);
    assert.equal(edges.length,4); assert.equal(edges.filter(e=>e.kind==='relationship').length,1);
    entries.get('e3').parentId='e1';
    assert.ok(model.buildConnections(entries,links).some(e=>e.from==='e1'&&e.to==='e3'));
});
test('normalization preserves optional appearance metadata and rejects invalid content', () => {
    const data={...entry('test'),appearance:{mode:'manual',archetype:'ringed',rings:true,palette:'amber'}};
    assert.deepEqual(plain(model.normalizeEntry(data).appearance),data.appearance);
    assert.equal(model.normalizeEntry({...data,name:''}),null);
    assert.equal(model.normalizeEntry({...data,id:''}),null);
});
test('search spans all depths with case insensitive prefix ranking and duplicate names', () => {
    const entries=chain(); entries.get('e0').name='Fresh Apple'; entries.get('e6').name='Apple'; entries.get('e7').name='Apple';
    assert.deepEqual(plain(model.search(entries,' APP ')).map(e=>e.id),['e6','e7','e0']);
    assert.equal(model.search(entries,'').length,0);
});
