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
    assert.deepEqual([...entries.values()].slice(0,6).map(e => e.role), ['galaxy','sun','planet','moon','satellite','astronaut']);
    assert.ok([...entries.values()].slice(5).every(e=>e.role==='astronaut'));
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
test('old soft positions and pins retain initial coordinates with only flowing influences', () => {
    const entries=chain(); const layout=model.normalizeLayout([{id:'e1',x:900,y:600,pinned:false},
        {id:'e2',x:-8000,y:7000,pinned:true},{id:'missing',x:5,y:5},{id:'e4',x:Infinity,y:5}],entries);
    assert.equal(layout.size,2); assert.equal(layout.get('e1').x,undefined);
    assert.equal(layout.get('e1').parentId,'e0'); assert.equal(entries.get('e1').x,900);
    assert.equal(entries.get('e2').x,-8000);assert.equal(entries.get('e2').y,7000);
    assert.equal(layout.get('e2').parentId,'e1');assert.equal(layout.get('e2').radius,Math.hypot(-8900,6400));
    assert.ok([...layout.values()].every(p=>!('pinned' in p)&&!('x' in p)));
});

test('root pins release without changing content, ancestry or semantic relationships',()=>{
    const entries=chain(5),before=plain([...entries.values()]),links=[{from:'e0',to:'e4'}];
    const layout=model.normalizeLayout([{id:'e0',x:500,y:400,pinned:true},
        {id:'e4',x:900,y:600,pinned:true}],entries);
    assert.equal(entries.get('e0').x,500);assert.equal(entries.get('e0').y,400);assert.equal(layout.has('e0'),false);
    assert.equal(layout.get('e4').parentId,'e3');
    entries.forEach((e,id)=>{const old=before.find(e=>e.id===id);assert.equal(e.parentId,old.parentId);assert.equal(e.name,old.name);assert.equal(e.description,old.description);});
    assert.ok(model.buildConnections(entries,links).some(e=>e.kind==='relationship'&&e.from==='e0'&&e.to==='e4'));
    assert.deepEqual(plain([...model.normalizeLayout([...layout].map(([id,p])=>({id,...p})),entries)]),plain([...layout]));
});
test('semantic links remain independent even between a structural parent and child', () => {
    const entries=chain(4), links=[{from:'e1',to:'e0'},{from:'e0',to:'e3'},{from:'e0',to:'e0'},{from:'e0',to:'missing'}];
    const edges=model.buildConnections(entries,links);
    assert.equal(edges.length,5); assert.equal(edges.filter(e=>e.kind==='relationship').length,2);
    entries.get('e3').parentId='e1';
    assert.ok(model.buildConnections(entries,links).some(e=>e.from==='e1'&&e.to==='e3'));
});

test('connection normalization preserves legacy pairs, stable IDs and richer labels', () => {
    const entries=chain(5), records=[{from:'e1',to:'e3'}, {from:'e3',to:'e1'},
        {id:'custom-link',from:'e0',to:'e4',type:'uses',label:'Research'},
        {id:'custom-link',sourceId:'e2',targetId:'e4'}, {from:'e0',to:'missing'},
        {from:'e0',to:'e0'}, null, {from:3,to:'e2'}];
    const links=plain(model.normalizeConnections(records,entries));
    assert.equal(links.length,3); assert.equal(new Set(links.map(link=>link.id)).size,3);
    assert.deepEqual(links[1],{id:'custom-link',from:'e0',to:'e4',type:'uses',label:'Research'});
    assert.equal(links[0].type,'related');
    assert.deepEqual(plain(model.normalizeConnections(links,entries)),links);
    assert.equal(model.validateConnection(entries,links,'e1','e3'),'These entries are already connected.');
    assert.equal(model.validateConnection(entries,links,'e3','e1'),'These entries are already connected.');
    assert.equal(model.validateConnection(entries,links,'e2','e2'),'Choose a different entry.');
    assert.equal(model.validateConnection(entries,links,'e0','missing'),'Choose an existing entry.');
    assert.equal(model.validateConnection(entries,links,'e1','e4'),'');
    entries.delete('e4');
    assert.deepEqual(plain(model.normalizeConnections(links,entries)),[links[0]]);
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

test('descriptions are optional at every depth and remain valid after clearing or reload', () => {
    const entries = chain();
    entries.forEach(record => {
        for (const description of ['', '   ', undefined, null]) {
            const normalized = model.normalizeEntry({...record, description});
            assert.ok(normalized);
            assert.equal(normalized.description, description ?? '');
            assert.equal(model.validateChange(normalized, entries), '');
            assert.equal(model.normalizeEntry(plain(normalized)).description, description ?? '');
        }
        assert.equal(model.validateChange({...record, description: ''}, entries), '');
        assert.equal(model.normalizeEntry({...record, description: 42}), null);
        assert.equal(model.normalizeEntry({...record, description: 'x'.repeat(1001)}), null);
        assert.match(model.validateChange({...record, description: 'x'.repeat(1001)}, entries), /shorten/);
        assert.match(model.validateChange({...record, description: '', name: ' '}, entries), /name/);
    });
});

test('subtree collection is iterative through thousands of levels and handles cycles safely',()=>{
    const entries=chain(2500);entries.set('other',entry('other'));
    const ids=model.subtreeIds(entries,'e4');
    assert.equal(ids.size,2496);assert.equal(ids.has('e3'),false);assert.equal(ids.has('other'),false);
    assert.equal(model.subtreeIds(entries,'missing').size,0);
    entries.get('e4').parentId='e2499';
    assert.equal(model.subtreeIds(entries,'e4').size,2496);
});

test('guarded deletion requires explicit subtree intent and protects built-ins anywhere in a branch',()=>{
    const entries=chain(8), before=plain([...entries.values()]);
    assert.match(model.deletionPlan(entries,[],'e2').error,/Confirm/);
    assert.equal(model.deletionPlan(entries,[],'e7').error,'');
    assert.match(model.deletionPlan(entries,[],'e2',{subtree:true,protectedIds:new Set(['e6'])}).error,/protected/);
    assert.match(model.deletionPlan(entries,[],'missing',{subtree:true}).error,/no longer/);
    assert.deepEqual(plain([...entries.values()]),before,'planning never mutates or promotes entries');
});

test('subtree deletion plan cleans incident links in either direction and preserves unrelated metadata',()=>{
    const entries=chain(8);entries.set('remote',entry('remote'));
    const links=[{id:'local',from:'e4',to:'e6',type:'related'},
        {id:'outgoing',from:'e7',to:'remote',type:'uses',label:'Keep meaning'},
        {id:'incoming',from:'e0',to:'e5',type:'references'},
        {id:'unrelated',from:'e1',to:'remote',type:'uses',label:'Unchanged'}];
    const before=plain(links), plan=model.deletionPlan(entries,links,'e4',{subtree:true});
    assert.equal(plan.error,'');assert.deepEqual([...plan.ids],['e4','e5','e6','e7']);
    assert.deepEqual(plain(plan.relationships),[links[3]]);
    assert.equal(plan.relationships[0],links[3]);assert.deepEqual(plain(links),before);
});
