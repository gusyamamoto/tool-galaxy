const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(saved={}){
    const timers=new Map(),elements=new Map();let nextTimer=0;
    const element=()=>({hidden:true,textContent:'',listeners:{},classList:{toggle(){}},addEventListener(type,fn){this.listeners[type]=fn;},
        querySelector(selector){return this.children[selector] ||= element();},children:{},contains(){return false;},focus(){this.focused=true;}});
    const root=element(),hint=element(),writes=[];
    const ctx=vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}},
        setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','first-use.js'),'utf8'),ctx);
    const Controller=vm.runInContext('FirstUseOnboarding',ctx);let created=0,help=0;
    const controller=new Controller({root,hint,preferences:{load:()=>saved,update:patch=>{writes.push(patch);return Promise.resolve();}},
        create:()=>created++,help:()=>help++});
    return {controller,root,hint,writes,timers,get created(){return created;},get help(){return help;}};
}
test('welcome follows real emptiness independently of completed hint preferences and mounts no preview runtime',()=>{
    for(const saved of [{},{firstItemCreated:true},{firstUseHints:{phase:'done'}}]){
        const s=setup(saved);s.controller.sync({empty:true,available:true,entries:new Map()});assert.equal(s.root.hidden,false);
        s.controller.sync({empty:false,available:true,entries:new Map([['real',{}]])});assert.equal(s.root.hidden,true);
        s.controller.sync({empty:true,available:true,entries:new Map()});assert.equal(s.root.hidden,false);
        s.controller.sync({empty:true,available:false,entries:new Map()});assert.equal(s.root.hidden,true);
        assert.equal(s.writes.length,0);assert.equal(s.timers.size,0);assert.equal('preview' in s.controller,false);
    }
});
test('primary and Help controls delegate to their existing flows',()=>{
    const s=setup();s.root.querySelector('#first-use-create').listeners.click();s.root.querySelector('#first-use-help').listeners.click();
    assert.equal(s.created,1);assert.equal(s.help,1);
});
test('Introduction declares local responsive PNGs and has no animation or media runtime',()=>{
    const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    const introduction=html.slice(html.indexOf('<section id="first-use"'),html.indexOf('<aside id="first-use-hint"'));
    assert.match(introduction,/<picture id="first-use-preview"/);assert.match(introduction,/Create your first Item/);
    assert.doesNotMatch(introduction,/<video|<canvas|\s(?:autoplay|controls)(?:\s|=|>)/i);
    const runtime=fs.readFileSync(path.join(__dirname,'..','first-use.js'),'utf8');
    assert.doesNotMatch(runtime,/FirstUsePreview|firstUseScene|firstUseFrame|IntersectionObserver|ResizeObserver|\.play\(/);
    for(const [file,width,height] of [['introduction-example.png',1336,699],['introduction-example-compact.png',1236,690]]){
        assert.ok(introduction.includes('assets/'+file));const bytes=fs.readFileSync(path.join(__dirname,'..','assets',file));
        assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),width);assert.equal(bytes.readUInt32BE(20),height);
    }
});
test('first successful root offers a temporary child hint, then exactly one final branch hint',()=>{
    const s=setup(),root={id:'travel',parentId:null};
    s.controller.created({wasEmpty:true,rootId:root.id,created:[root]});
    assert.equal(s.hint.hidden,false);assert.equal(s.hint.querySelector('p').textContent,'Tap + to add something inside this Item.');
    assert.equal(s.timers.size,1);
    s.controller.created({wasEmpty:false,created:[{id:'unrelated',parentId:null}]});assert.equal(s.controller.state.phase,'child');
    s.controller.created({wasEmpty:false,created:[{id:'japan',parentId:'travel'}]});
    assert.equal(s.controller.state.phase,'done');assert.match(s.hint.querySelector('p').textContent,/That's a branch/);assert.equal(s.timers.size,1);
    [...s.timers.values()][0]();assert.equal(s.hint.hidden,true);assert.equal(s.timers.size,0);
    s.controller.created({wasEmpty:false,created:[{id:'tokyo',parentId:'japan'}]});assert.equal(s.hint.hidden,true);
    assert.ok(!JSON.stringify(s.writes).includes('onboarding-demo-'));
});
test('dismissal and reload never repeat child hints; an eventual first child can finish onboarding',()=>{
    const s=setup({firstUseHints:{phase:'child',rootId:'travel'}});
    s.controller.sync({empty:false,available:true,entries:new Map([['travel',{}]])});assert.equal(s.hint.hidden,true);
    s.controller.created({wasEmpty:false,created:[{id:'japan',parentId:'travel'}]});assert.equal(s.hint.hidden,false);
    s.hint.querySelector('button').listeners.click();assert.equal(s.hint.hidden,true);assert.equal(s.timers.size,0);
    const next=setup({firstUseHints:s.controller.state});next.controller.created({wasEmpty:true,rootId:'other',created:[{id:'other'}]});
    assert.equal(next.hint.hidden,true);
});
test('starter creation with children goes directly to the final hint and removing content clears timers',()=>{
    const s=setup();s.controller.created({wasEmpty:true,rootId:'travel',created:[{id:'travel'},{id:'japan',parentId:'travel'}]});
    assert.equal(s.controller.state.phase,'done');assert.match(s.hint.querySelector('p').textContent,/That's a branch/);
    s.controller.sync({empty:true,available:true,entries:new Map()});assert.equal(s.hint.hidden,true);assert.equal(s.timers.size,0);
});
test('deleting and recreating the first root does not replay the child hint',()=>{
    const s=setup({firstUseHints:{phase:'child',rootId:'deleted'}});
    s.controller.created({wasEmpty:true,rootId:'replacement',created:[{id:'replacement'}]});
    assert.equal(s.hint.hidden,true);assert.equal(s.controller.state.rootId,'replacement');
    s.controller.created({wasEmpty:false,created:[{id:'child',parentId:'replacement'}]});
    assert.equal(s.controller.state.phase,'done');assert.match(s.hint.querySelector('p').textContent,/That's a branch/);
});
