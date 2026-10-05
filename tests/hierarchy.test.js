const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { test } = require('node:test');
const context = vm.createContext({});
for (const file of ['model.js', 'hierarchy.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
const model = vm.runInContext('galaxyModel', context), hierarchy = vm.runInContext('cosmosHierarchy', context);
const plain = value => JSON.parse(JSON.stringify(value));
function entries(records) { const map = new Map(records.map(entry => [entry.id, { ...entry }])); model.normalizeHierarchy(map); return map; }

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
    assert.deepEqual(plain(hierarchy.childContext(data)), {parentId:null,depth:0,role:'galaxy',action:'Add Galaxy'});
    for (let i=0; i<8; i++) {
        const child=hierarchy.childContext(data,`n${i}`);
        assert.equal(child.parentId,`n${i}`);assert.equal(child.depth,i+1);
        assert.equal(child.role,model.roleAtDepth(i+1));
        assert.equal(child.action,`Add ${model.roles[child.role].name}`);
    }
    assert.equal(hierarchy.childContext(data,'missing'),null);
});
