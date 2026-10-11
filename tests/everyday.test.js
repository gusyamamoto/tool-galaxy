const {test}=require('node:test'),assert=require('node:assert/strict');
const {cosmosEveryday:ui}=require('../everyday.js');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({URL});vm.runInContext(fs.readFileSync(path.join(__dirname,'../model.js'),'utf8'),context);
const model=vm.runInContext('galaxyModel',context);
const expected={
    blank:{count:1,sun:null,branch:[]},
    trip:{count:16,sun:'Trip Plan',branch:['Food','Restaurants','Reservations','Confirmation']},
    home:{count:13,sun:'Project Plan',branch:['Tasks','To do','Next up','First task']},
    class:{count:14,sun:'Course',branch:['Lessons','Module 1','Topics','Topic 1']},
    recipes:{count:11,sun:'Recipe Box',branch:['Dinner','Favorites','Weeknight meals','Recipe idea']},
    photos:{count:11,sun:'Inspiration',branch:['Travel','Places','Favorites','Idea']}
};
test('starter choices preserve Blank and the existing selection IDs',()=>{
    assert.deepEqual(ui.starters.map(s=>s.id),['blank','trip','home','class','recipes','photos']);
    assert.equal(ui.starters[0].children.length,0);
});
for(const [id,want] of Object.entries(expected))test(`${id} creates a small canonical hierarchy with derived roles and no special behavior`,()=>{
    const create=()=>{let number=0;return ui.starterItems(id,'galaxy',()=>`item-${++number}`);};
    const records=create();assert.deepEqual(create(),records,'parent relationships and traversal are deterministic');
    records.forEach(record=>assert.deepEqual(Object.keys(record).sort(),['id','name','parentId']));
    const entries=new Map([{id:'galaxy',name:'My entered name',parentId:null},...records].map(e=>[e.id,{description:'',category:'',x:400,y:350,...e}]));
    model.normalizeHierarchy(entries);
    assert.equal(entries.size,want.count);assert.equal(entries.get('galaxy').name,'My entered name');
    for(const entry of entries.values()){
        assert.ok(!entry.parentId||entries.has(entry.parentId),'no orphan parents');
        assert.equal(entry.depth,model.ancestors(entries,entry.id).length);
        assert.equal(entry.role,model.roleAtDepth(entry.depth));
        assert.ok(!entry.template&&!entry.protected);
    }
    const suns=[...entries.values()].filter(e=>e.parentId==='galaxy');
    assert.equal(suns.length,id==='blank'?0:1);
    assert.equal(Math.max(...[...entries.values()].map(e=>e.depth)),id==='blank'?0:5);
    if(id==='blank')return;
    assert.equal(suns[0].name,want.sun);
    assert.equal(model.childrenOf(entries,suns[0].id).length,5);
    let parent=suns[0];for(const name of want.branch){parent=model.childrenOf(entries,parent.id).find(e=>e.name===name);assert.ok(parent,`missing branch item ${name}`);}
    assert.equal(parent.role,'astronaut');
    // These are plain records, so ordinary edits/copies/moves/deletes work.
    parent.name='My renamed detail';const copy={...parent,id:'ordinary-copy',name:'Copied detail'};entries.set(copy.id,copy);
    copy.parentId=suns[0].id;model.normalizeHierarchy(entries);assert.equal(copy.role,'planet');
    assert.equal(parent.name,'My renamed detail');entries.delete(copy.id);model.normalizeHierarchy(entries);
    assert.equal(entries.size,want.count);
});
test('checklist toggles preserve plain text, neighboring lines and line endings',()=>{
    const text='Planning\r\n- [ ] Book hotel\r\n- [x] Buy ferry tickets\r\n\r\nPlain text';
    const toggled=ui.toggleChecklist(text,1,true);
    assert.equal(toggled,text.replace('[ ]','[x]'));
    assert.equal(ui.toggleChecklist(toggled,1,false),text);
    assert.equal(ui.toggleChecklist(text,0,true),text);
    assert.equal(ui.toggleChecklist(text,99,true),text);
    assert.equal(ui.checklistLine('- [X] Done').checked,true);
    assert.equal(ui.checklistLine('- ordinary bullet'),null);
});
test('dropped address prefers URI list, skips comments and supports browser/plain text fallbacks',()=>{
    const transfer=records=>({getData:type=>records[type]||''});
    assert.equal(ui.droppedAddress(transfer({'text/uri-list':'# title\nhttps://example.com/\nhttps://other.test/','text/plain':'other.test'})),'https://example.com/');
    assert.equal(ui.droppedAddress(transfer({'text/x-moz-url':'https://example.com/\nExample'})),'https://example.com/');
    assert.equal(ui.droppedAddress(transfer({'text/plain':'google.com'})),'google.com');
});
