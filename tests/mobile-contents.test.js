const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../mobile-contents.js'),'utf8'),context);
const Sheet=vm.runInContext('MobileContentsSheet',context),plain=x=>JSON.parse(JSON.stringify(x));
test('mobile transitions have only Compact and Contents with no further expansion',()=>{
    assert.equal(Sheet.nextState('compact',1),'browse');assert.equal(Sheet.nextState('browse',1),'browse');
    assert.equal(Sheet.nextState('browse',-1),'compact');assert.equal(Sheet.nextState('compact',-1),'compact');
    const sheet=Object.create(Sheet.prototype);sheet.state='browse';sheet.enabled=()=>true;
    sheet.transition('full');assert.equal(sheet.state,'browse');
});
test('gesture axes need clear intent and preserve the existing dead zone',()=>{
    assert.equal(Sheet.direction(4,4),null);assert.equal(Sheet.direction(80,20),'horizontal');
    assert.equal(Sheet.direction(-80,20),'horizontal');assert.equal(Sheet.direction(20,-80),'vertical');
    assert.equal(Sheet.direction(20,80),'vertical');assert.equal(Sheet.direction(50,50),'ambiguous');
});
test('available canvas bounds account for sheet, compact card, sidebar and visible viewport without changing inputs',()=>{
    const viewport={left:0,top:0,width:390,height:844},visible={left:0,top:0,width:390,height:844};
    const base={viewport,visible},original=JSON.stringify(base);
    assert.deepEqual(plain(Sheet.canvasBounds(base)),{left:0,top:0,right:390,bottom:844,width:390,height:844});
    assert.equal(Sheet.canvasBounds({...base,compact:{top:774}}).bottom,774);
    assert.equal(Sheet.canvasBounds({...base,sheet:{top:523}}).bottom,523);
    assert.equal(Sheet.canvasBounds({...base,sidebar:{right:320}}).left,320);
    assert.equal(Sheet.canvasBounds({...base,sheet:{left:300},sideSheet:true}).right,300);
    const keyboard=Sheet.canvasBounds({...base,visible:{left:0,top:20,width:390,height:400},sheet:{top:280}});
    assert.equal(keyboard.top,20);assert.equal(keyboard.bottom,280);
    assert.equal(JSON.stringify(base),original);
    const safe=Sheet.canvasBounds({...base,insets:{left:12,right:18,top:24,bottom:20}});
    assert.deepEqual(plain(safe),{left:12,top:24,right:372,bottom:824,width:360,height:800});
    assert.equal(Sheet.canvasBounds({...base,insets:{bottom:24},sheet:{top:523}}).bottom,523,'safe area is not subtracted twice above a sheet');
});
