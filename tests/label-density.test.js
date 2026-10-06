const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const {test}=require('node:test');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../label-density.js'),'utf8'),c);const Layout=vm.runInContext('LabelDensity',c);
const label=(id,x,y,priority=5,protectedLabel=false)=>({id,priority,protected:protectedLabel,rect:{left:x,top:y,right:x+80,bottom:y+24}});
test('collision priority is deterministic, protected interactions always reveal and generic text needs no exceptions',()=>{
    const resolve=items=>[...new Layout().resolve(items,0).hidden];
    assert.deepEqual(resolve([label('astronaut',10,1,9),label('sun',0,0,5)]),['astronaut']);
    assert.deepEqual(resolve([label('b',0,0),label('a',0,0)]),['b']);
    assert.deepEqual(resolve([label('a',0,0,0,true),label('b',0,0,1,true)]),[]);
    assert.deepEqual(resolve([label('b',90,0),label('a',0,0)]),[]);
});
test('overlap tolerance and delayed restoration avoid alternating labels as physics drifts',()=>{
    const layout=new Layout(),run=(x,time)=>layout.resolve([label('a',0,0,4),label('b',x,0,9)],time);
    assert.ok(run(10,0).hidden.has('b'));assert.ok(run(78,10).hidden.has('b'));
    assert.ok(run(90,120).hidden.has('b'));assert.equal(run(90,260).hidden.has('b'),false);
    assert.equal(run(70,300).hidden.has('b'),false);assert.ok(run(30,400).hidden.has('b'));
    assert.ok(run(80,410).hidden.has('b'));layout.resolve([],500);assert.equal(layout.states.size,0);
});
