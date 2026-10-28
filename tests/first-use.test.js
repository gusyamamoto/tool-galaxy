const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(saved={}){
    const timers=new Map(),elements=new Map();let nextTimer=0;
    const element=()=>({hidden:true,textContent:'',listeners:{},classList:{toggle(){}},addEventListener(type,fn){this.listeners[type]=fn;},
        querySelector(selector){return this.children[selector] ||= element();},children:{},contains(){return false;},focus(){this.focused=true;}});
    const root=element(),hint=element(),writes=[],sourceWrites=[];
    const artwork=[['source','data-srcset','desktop.webp'],['img','data-src','mobile.webp'],
        ['source','data-srcset','compact.png'],['img','data-src','example.png']].map(([tag,key,value])=>({
        tag,attributes:new Map([[key,value]]),
        getAttribute(name){return this.attributes.get(name)??null;},
        setAttribute(name,value){this.attributes.set(name,value);sourceWrites.push(name);},
        removeAttribute(name){this.attributes.delete(name);}
    }));
    root.querySelectorAll=selector=>artwork.filter(node=>selector.split(',').some(part=>{
        const [,tag,attribute]=part.match(/^(img|source)\[([\w-]+)\]$/);return node.tag===tag&&node.attributes.has(attribute);
    }));
    const ctx=vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}},
        setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','first-use.js'),'utf8'),ctx);
    const Controller=vm.runInContext('FirstUseOnboarding',ctx);let created=0,help=0;
    const controller=new Controller({root,hint,preferences:{load:()=>saved,update:patch=>{writes.push(patch);return Promise.resolve();}},
        create:()=>created++,help:()=>help++});
    return {controller,root,hint,writes,timers,artwork,sourceWrites,get created(){return created;},get help(){return help;}};
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
    const images=introduction.match(/<(?:img|source)\b[^>]*>/g);
    assert.equal(images.length,4);
    images.forEach(tag=>{assert.doesNotMatch(tag,/\s(?:src|srcset)=/);assert.match(tag,/\sdata-src(?:set)?=/);});
    const runtime=fs.readFileSync(path.join(__dirname,'..','first-use.js'),'utf8');
    assert.doesNotMatch(runtime,/FirstUsePreview|firstUseScene|firstUseFrame|IntersectionObserver|ResizeObserver|\.play\(/);
    for(const [file,width,height] of [['introduction-example.png',1336,699],['introduction-example-compact.png',1236,690]]){
        assert.ok(introduction.includes('assets/'+file));const bytes=fs.readFileSync(path.join(__dirname,'..','assets',file));
        assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),width);assert.equal(bytes.readUInt32BE(20),height);
    }
});
test('unresolved, unavailable and returning states never activate first-use image URLs',()=>{
    const s=setup();
    assert.equal(s.sourceWrites.length,0);
    for(const state of [{empty:false,available:true},{empty:true,available:false},{empty:true,available:undefined}]){
        s.controller.sync({...state,entries:new Map()});assert.equal(s.root.hidden,true);
        assert.equal(s.sourceWrites.length,0);
        assert.ok(s.artwork.every(n=>!n.attributes.has('src')&&!n.attributes.has('srcset')));
    }
    assert.equal(s.writes.length,0);
});
test('confirmed first-use activates picture sources before fallbacks and repeated sync is idempotent',()=>{
    const s=setup({firstUseHints:{phase:'done'}});
    s.controller.sync({empty:true,available:true,entries:new Map()});
    assert.deepEqual(s.sourceWrites,['srcset','srcset','src','src']);
    assert.deepEqual(s.artwork.map(n=>n.getAttribute(n.tag==='source'?'srcset':'src')),['desktop.webp','mobile.webp','compact.png','example.png']);
    s.controller.sync({empty:true,available:true,entries:new Map()});assert.equal(s.sourceWrites.length,4);
    assert.equal(s.writes.length,0);assert.equal(s.root.hidden,false);
});
test('hiding disarms responsive images; later canonical emptiness can reactivate the same artwork',()=>{
    const s=setup();s.controller.sync({empty:true,available:true,entries:new Map()});
    s.controller.sync({empty:false,available:true,entries:new Map([['real',{}]])});
    assert.equal(s.root.hidden,true);
    assert.ok(s.artwork.every(n=>!n.attributes.has('src')&&!n.attributes.has('srcset')));
    const changes=s.sourceWrites.length;s.controller.sync({empty:false,available:true,entries:new Map()});assert.equal(s.sourceWrites.length,changes);
    s.controller.sync({empty:true,available:true,entries:new Map()});assert.equal(s.root.hidden,false);
    assert.deepEqual(s.artwork.map(n=>n.getAttribute(n.tag==='source'?'srcset':'src')),['desktop.webp','mobile.webp','compact.png','example.png']);
    assert.equal(s.writes.length,0);
});
test('local-storage disclosure is plain first-use copy after Help, with no extra workflow',()=>{
    const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    const introduction=html.slice(html.indexOf('<section id="first-use"'),html.indexOf('<aside id="first-use-hint"'));
    const disclosure=introduction.match(/<p id="first-use-storage"[^>]*>([\s\S]*?)<\/p>/);
    assert.ok(disclosure);
    assert.equal(disclosure[1],'<span>Saved in this browser for now.</span><span>Use Backup to keep a copy.</span>');
    assert.ok(introduction.indexOf('id="first-use-help"')<disclosure.index);
    assert.ok(disclosure.index<introduction.indexOf('<figure class="first-use-example"'));
    assert.doesNotMatch(disclosure[0],/<a\b|<button\b|<dialog\b|<svg\b|\brole=|\bonclick=/);
    assert.equal((html.match(/id="first-use-storage"/g)||[]).length,1);
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
