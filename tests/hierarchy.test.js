const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { test } = require('node:test');
const context = vm.createContext({});
for (const file of ['model.js', 'hierarchy.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
const model = vm.runInContext('galaxyModel', context), hierarchy = vm.runInContext('cosmosHierarchy', context);
const plain = value => JSON.parse(JSON.stringify(value));
const Selection=vm.runInContext('HierarchySelection',context);
function entries(records) { const map = new Map(records.map(entry => [entry.id, { ...entry }])); model.normalizeHierarchy(map); return map; }

test('single selection and Ctrl/Cmd toggles keep a separate recent active item',()=>{
    const s=new Selection(),visible=['a','b','c','d','e'];
    s.click('a',{visible});s.click('b',{visible});assert.deepEqual([...s.ids],['b']);assert.equal(s.activeEntryId,'b');
    s.click('a',{visible});s.click('c',{visible,toggle:true});s.click('e',{visible,toggle:true});
    assert.deepEqual([...s.ids],['a','c','e']);assert.equal(s.activeEntryId,'e');
    s.click('c',{visible,toggle:true});assert.deepEqual([...s.ids],['a','e']);assert.equal(s.activeEntryId,'e');
    s.click('e',{visible,toggle:true});assert.equal(s.activeEntryId,'a');
    s.click('a',{visible,toggle:true});assert.equal(s.ids.size,0);assert.equal(s.activeEntryId,null);assert.equal(s.anchorId,null);
});
test('Shift ranges use the supplied visible canonical row order and preserve the anchor',()=>{
    const s=new Selection(),visible=['a','b','c','d','e','f'];
    s.click('b',{visible});s.click('f',{visible,range:true});assert.deepEqual([...s.ids],['b','c','d','e','f']);assert.equal(s.activeEntryId,'f');assert.equal(s.anchorId,'b');
    s.click('d',{visible,range:true});assert.deepEqual([...s.ids],['b','c','d']);
    s.click('a',{visible,range:true});assert.deepEqual([...s.ids],['a','b']);assert.equal(s.activeEntryId,'a');
    s.click('a',{visible});s.click('f',{visible:['a','d','f'],range:true});assert.deepEqual([...s.ids],['a','d','f'],'hidden descendants are absent from the range');
    s.single('hidden');s.click('d',{visible,range:true});assert.deepEqual([...s.ids],['d'],'an invisible anchor falls back to single selection');
});
test('collapsing removes invisible secondary selections without clearing active Content state',()=>{
    const s=new Selection(),visible=['a','b','c','d'];s.click('a',{visible});s.click('b',{visible,toggle:true});s.click('d',{visible,toggle:true});
    s.visibleOnly(new Set(['a','d']));assert.deepEqual([...s.ids],['a','d']);assert.equal(s.activeEntryId,'d');
    s.visibleOnly(new Set(['a']));assert.deepEqual([...s.ids],['d'],'a hidden active item remains the sole ordinary selection');assert.equal(s.activeEntryId,'d');
    s.retain(new Set(['a']));assert.equal(s.ids.size,0);assert.equal(s.activeEntryId,null);
});
test('normal navigation resets ephemeral selection without writing hierarchy records',()=>{
    const data=entries([{id:'g'},{id:'a',parentId:'g'},{id:'b',parentId:'g'}]),before=JSON.stringify([...data]);
    const s=new Selection(),visible=hierarchy.visible(data,hierarchy.index(data),new Set(['g'])).map(r=>r.id);
    s.click('a',{visible});s.click('b',{visible,toggle:true});s.single('g');assert.deepEqual([...s.ids],['g']);
    assert.equal(JSON.stringify([...data]),before);
});

test('tree projection handles sparse and arbitrary deep branches without recursion or graph changes', () => {
    const data = entries([{ id: 'other' }, ...Array.from({length: 1500}, (_, i) => ({id: `n${i}`, parentId: i ? `n${i-1}` : null}))]);
    const before = JSON.stringify([...data.values()]), index = hierarchy.index(data);
    assert.deepEqual(plain(index.roots), ['other', 'n0']);
    assert.equal(hierarchy.visible(data, index, new Set(['n0'])).length, 3);
    const rows = hierarchy.visible(data, index, new Set(data.keys()));
    assert.equal(rows.length, 1501); assert.equal(rows.at(-1).level, 1500);
    assert.equal(JSON.stringify([...data.values()]), before);
});

test('collapsing any ancestor hides its entire subtree while preserving other branches', () => {
    const data = entries([{id:'g'}, {id:'s',parentId:'g'}, {id:'p',parentId:'s'}, {id:'m',parentId:'p'}, {id:'h'}, {id:'t',parentId:'h'}]);
    const index = hierarchy.index(data), expanded = new Set(['g','s','p','h']);
    assert.equal(hierarchy.visible(data,index,expanded).length, 6);
    expanded.delete('g');
    assert.deepEqual(plain(hierarchy.visible(data,index,expanded).map(row=>row.id)), ['g','h','t']);
    expanded.add('g'); assert.equal(hierarchy.visible(data,index,expanded).length, 6);
});

test('one creation context derives each parent and child role, including deeper children and missing parents', () => {
    const data = entries(Array.from({length:8}, (_,i)=>({id:`n${i}`,parentId:i?`n${i-1}`:null})));
    assert.deepEqual(plain(hierarchy.childContext(data)), {parentId:null,depth:0,role:'galaxy',action:'New Galaxy'});
    for (let i=0; i<8; i++) {
        const child=hierarchy.childContext(data,`n${i}`);
        assert.equal(child.parentId,`n${i}`);assert.equal(child.depth,i+1);
        assert.equal(child.role,model.roleAtDepth(i+1));
        assert.equal(child.action,'Add item');
    }
    assert.equal(hierarchy.childContext(data,'missing'),null);
});
