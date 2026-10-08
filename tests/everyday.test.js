const {test}=require('node:test'),assert=require('node:assert/strict');
const {cosmosEveryday:ui}=require('../everyday.js');
test('starters are small independent ordinary child lists',()=>{
    assert.deepEqual(ui.starters.map(s=>s.id),['blank','trip','home','class','recipes','photos']);
    for(const starter of ui.starters){assert.ok(starter.children.length<=6);assert.equal(new Set(starter.children).size,starter.children.length);}
    assert.equal(ui.starters[0].children.length,0);
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
