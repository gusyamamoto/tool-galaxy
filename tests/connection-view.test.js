const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const {test} = require('node:test'), context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../connection-view.js'),'utf8'),context);
const view = vm.runInContext('connectionView',context), plain=value=>JSON.parse(JSON.stringify(value));
test('only segments intersecting the usable viewport can become keyboard or pointer targets',()=>{
    const bounds={left:10,right:90,top:10,bottom:90};
    assert.equal(view.intersects({x:-100,y:50},{x:200,y:50},bounds),true);
    assert.equal(view.intersects({x:0,y:0},{x:5,y:100},bounds),false);
    assert.equal(view.intersects({x:-10,y:0},{x:100,y:0},bounds),false);
    assert.equal(view.intersects({x:20,y:20},{x:20,y:20},bounds),true);
    assert.equal(view.intersects({x:NaN,y:20},{x:30,y:40},bounds),false);
});
test('hit geometry measures the continuous segment, including gaps, end caps and coincident endpoints',()=>{
    assert.deepEqual(plain(view.nearest({x:50,y:4},{x:0,y:0},{x:100,y:0})),{x:50,y:0,t:.5,distance:4});
    assert.equal(view.nearest({x:110,y:0},{x:0,y:0},{x:100,y:0}).distance,10);
    assert.equal(view.nearest({x:3,y:4},{x:0,y:0},{x:0,y:0}).distance,5);
    assert.equal(view.nearest({x:50,y:7},{x:0,y:0},{x:100,y:0}).distance,7);
});
test('crowded crossings prefer distance, then the selected entry connection, then stable identity',()=>{
    const a={link:{id:'a'},distance:0,incident:false},z={link:{id:'z'},distance:0,incident:true};
    assert.equal(view.pick([a,z]).link.id,'z');assert.equal(view.pick([z,a]).link.id,'z');
    assert.equal(view.pick([a,{...z,distance:1}]).link.id,'a');
    assert.equal(view.pick([a,{...z,incident:false}]).link.id,'a');assert.equal(view.pick([]),null);
});
test('navigation chooses the opposite selected endpoint, otherwise the nearest with a stable midpoint tie',()=>{
    const link={from:'a',to:'b'},start={x:0,y:0},end={x:100,y:0};
    assert.equal(view.destination(link,'a',start,start,end),'b');
    assert.equal(view.destination(link,'b',end,start,end),'a');
    assert.equal(view.destination(link,'other',{x:80,y:4},start,end),'b');
    assert.equal(view.destination(link,null,{x:20,y:4},start,end),'a');
    assert.equal(view.destination(link,null,{x:50,y:4},start,end),'a');
});
test('connection descriptions show names and optional semantics rather than internal identifiers',()=>{
    const entries=new Map([['a',{name:'Codex'}],['b',{name:'Fruit'}]]),link={from:'a',to:'b'};
    assert.equal(view.description(link,entries),'Codex ↔ Fruit');
    assert.equal(view.description({...link,type:'related'},entries),'Codex — Related — Fruit');
    assert.equal(view.description({...link,type:'depends-on'},entries),'Codex — Depends on — Fruit');
    assert.equal(view.description({...link,type:'uses',label:'Research reference'},entries),'Codex — Research reference — Fruit');
});
