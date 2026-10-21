const {test}=require('node:test'),assert=require('node:assert/strict');
const {CompletedTaskDismissals}=require('../task-views.js');
function fixture(saved={}) {
    let value={width:280,tasksActiveCollapsed:true,tasksCompletedCollapsed:false,...saved},writes=0;
    const preferences={load:()=>structuredClone(value),update:patch=>{value={...value,...structuredClone(patch)};writes++;return Promise.resolve();}};
    return {preferences,get value(){return value;},get writes(){return writes;}};
}
const complete={list:true,complete:true},active={list:true,complete:false};
test('only completed lists can be dismissed and only IDs enter UI preferences',()=>{
    const f=fixture(),dismissals=new CompletedTaskDismissals(f.preferences);
    for(const state of [undefined,active,{task:true,complete:true},{list:true,complete:false,total:0}])assert.equal(dismissals.dismiss('list',state),false);
    assert.equal(f.writes,0);assert.equal(dismissals.dismiss('list',complete),true);
    assert.deepEqual(f.value,{width:280,tasksActiveCollapsed:true,tasksCompletedCollapsed:false,hiddenCompletedTaskListIds:['list']});
    assert.equal(dismissals.dismiss('list',complete),false);assert.equal(f.writes,1);
});
test('dismissals survive a fresh view instance and accept older/malformed preferences safely',()=>{
    const f=fixture(),first=new CompletedTaskDismissals(f.preferences);first.dismiss('list',complete);
    assert.deepEqual([...new CompletedTaskDismissals(f.preferences).ids],['list']);
    for(const invalid of [null,false,'list',{}])assert.equal(new CompletedTaskDismissals(fixture({hiddenCompletedTaskListIds:invalid}).preferences).ids.size,0);
    assert.deepEqual([...new CompletedTaskDismissals(fixture({hiddenCompletedTaskListIds:['one','one',null,4,'','two']}).preferences).ids],['one','two']);
});
test('becoming incomplete consumes dismissal and re-completion remains visible until hidden again',()=>{
    const f=fixture(),dismissals=new CompletedTaskDismissals(f.preferences),entry={id:'list'};
    dismissals.dismiss(entry.id,complete);
    dismissals.reconcile([{entry,state:complete}]);assert.equal(f.writes,1);
    dismissals.reconcile([{entry,state:active}]);assert.equal(dismissals.ids.has(entry.id),false);assert.deepEqual(f.value.hiddenCompletedTaskListIds,[]);
    dismissals.reconcile([{entry,state:complete}]);assert.equal(dismissals.ids.has(entry.id),false);assert.equal(f.writes,2);
    assert.equal(dismissals.dismiss(entry.id,complete),true);assert.equal(f.writes,3);
});
test('empty initialization and absent/archived lists retain preferences; clear active IDs in one write',()=>{
    const f=fixture({hiddenCompletedTaskListIds:['one','two','absent']}),dismissals=new CompletedTaskDismissals(f.preferences);
    dismissals.reconcile([]);assert.equal(f.writes,0);
    const lists=['one','two'].map(id=>({entry:{id,taskList:true,content:{notes:{text:'Keep'}}},state:active})),before=structuredClone(lists);
    dismissals.reconcile(lists);assert.deepEqual(lists,before);assert.deepEqual(f.value.hiddenCompletedTaskListIds,['absent']);assert.equal(f.writes,1);
});
