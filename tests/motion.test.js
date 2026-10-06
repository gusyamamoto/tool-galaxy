const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const {test}=require('node:test');
function env(){let now=0,serial=0;const timers=new Map(),canceled=[],created=[];
    const element=()=>({isConnected:true,style:{},classList:{add(){},replace(){}},children:[],setAttribute(){},append(...nodes){this.children.push(...nodes);},remove(){this.isConnected=false;},
        animate(frames,options){let resolve,reject;const finished=new Promise((a,b)=>{resolve=a;reject=b;});const animation={frames,options,finished,cancel(){reject(new Error('cancel'));},finish:resolve};this.lastAnimation=animation;return animation;}});
    const document={hidden:false,createElement:()=>{const node=element();created.push(node);return node;},createElementNS:()=>{const node=element();created.push(node);return node;}};
    const setTimer=(cb,delay)=>{timers.set(++serial,{cb,delay});return serial;},clearTimer=id=>{canceled.push(id);timers.delete(id);};
    document.body=element();
    const context=vm.createContext({document,matchMedia:()=>({matches:false}),performance:{now:()=>now},setTimeout:setTimer,clearTimeout:clearTimer,getComputedStyle:()=>({outline:'1px solid blue',opacity:'1',strokeOpacity:'.48'})});
    for(const file of ['motion.js','background.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
    return {Motion:vm.runInContext('CosmosMotion',context),Ambient:vm.runInContext('CosmosAmbient',context),element,document,timers,canceled,setTimer,clearTimer,created,time:value=>now=value};
}
test('motion bounds illumination/line stagger and cancellation restores static reduced-motion state',async()=>{
    const e=env(),motion=new e.Motion(),nodes=Array.from({length:200},e.element);
    motion.beginConstellation(nodes);assert.equal(motion.animations.size,96);assert.ok([...motion.animations].every(r=>r.animation.options.delay<=150));
    assert.equal(nodes[0].lastAnimation.frames[0].opacity,.5);
    const lines=Array.from({length:1000},e.element);lines.forEach((line,i)=>motion.drawLine(line,i,lines.length));
    assert.equal(motion.animations.size,224);assert.ok([...motion.animations].every(r=>r.animation.options.duration+r.animation.options.delay<=400));
    assert.equal(lines[0].lastAnimation.frames[0].strokeOpacity,.6);
    motion.beginConstellation(nodes.slice(0,2));assert.equal(motion.animations.size,2);
    motion.setReducedMotion(true);await Promise.resolve();assert.equal(motion.animations.size,0);assert.equal(motion.constellationAnimating,false);
    motion.beginConstellation(nodes);assert.equal(motion.animations.size,0);assert.equal(motion.play(nodes[0],[{opacity:0}]),null);
});
test('Galaxy response is relative, bounded, single-timed and removed on teardown',()=>{
    const e=env(),motion=new e.Motion(),region={renderOpacity:.5};motion.cloud(region);e.time(130);assert.equal(motion.cloudFactor(region),.92);
    motion.cloud(region);assert.equal(e.timers.size,1);motion.destroy();assert.equal(e.timers.size,0);assert.equal(motion.cloudFactor(region),1);
});
test('separate randomized ambient timers defer busy/overlapping passes and restart only after completion',async()=>{
    const e=env(),root=e.element();root.getBoundingClientRect=()=>({width:800,height:600});let busy=false,visible=true;
    const ambient=new e.Ambient({root,busy:()=>busy,visible:()=>visible,random:()=>.5,setTimer:e.setTimer,clearTimer:e.clearTimer});
    assert.equal(e.timers.size,2);assert.equal(ambient.delays.comet,23500);assert.equal(ambient.delays.ufo,82500);
    const fire=kind=>{const id=ambient.timers[kind],timer=e.timers.get(id);e.timers.delete(id);timer.cb();};
    busy=true;fire('comet');assert.equal(ambient.stats.comet,0);assert.equal(e.timers.size,2);
    busy=false;fire('comet');assert.equal(ambient.stats.comet,1);assert.equal(e.timers.size,1);assert.equal(ambient.timers.comet,null);
    fire('ufo');assert.equal(ambient.stats.ufo,0);assert.equal(e.timers.size,1); // No overlap; UFO gets a fresh randomized defer.
    const active=ambient.active;active.animation.finish();await Promise.resolve();assert.equal(ambient.active,null);assert.equal(active.object.isConnected,false);assert.equal(e.timers.size,2);
    visible=false;ambient.refresh();assert.equal(e.timers.size,0);assert.equal(ambient.trigger('ufo'),false);
    visible=true;ambient.setReducedMotion(true);assert.equal(e.timers.size,0);assert.equal(ambient.trigger('comet'),false);
    ambient.destroy();ambient.refresh();assert.equal(e.timers.size,0);
});
test('canonical deletion echo is bounded, independently cleaned and skipped with reduced motion',async()=>{
    const e=env(),motion=new e.Motion(),ghost=e.element();ghost.style.opacity='.8';
    motion.implode(ghost);assert.equal(motion.stats.deletion,1);assert.equal(motion.ghosts.size,1);
    assert.equal(ghost.lastAnimation.options.duration,240);assert.equal(ghost.lastAnimation.frames.at(-1).transform,'scale(.06)');
    ghost.lastAnimation.finish();await Promise.resolve();assert.equal(motion.ghosts.size,0);assert.equal(ghost.isConnected,false);
    const interrupted=e.element();interrupted.style.opacity='1';motion.implode(interrupted);
    motion.beginConstellation([]);await Promise.resolve();assert.equal(motion.ghosts.size,0);assert.equal(interrupted.isConnected,false);
    const unavailable=e.element();unavailable.animate=()=>{throw new Error('Animation unavailable');};
    motion.implode(unavailable);assert.equal(unavailable.isConnected,false);assert.equal(motion.ghosts.size,0);
    const deleted=motion.stats.deletion;
    motion.setReducedMotion(true);motion.implode(e.element());assert.equal(motion.stats.deletion,deleted);assert.equal(motion.ghosts.size,0);
});
test('debug previews bypass focus/busy guards without randomness, scheduling changes or production interference',async()=>{
    const e=env(),root=e.element();root.getBoundingClientRect=()=>({width:800,height:600});
    let focused=true,busy=false,draws=0;
    const ambient=new e.Ambient({root,visible:()=>focused,busy:()=>busy,random:()=>{draws++;return .5;},setTimer:e.setTimer,clearTimer:e.clearTimer});
    const production=()=>[JSON.stringify(ambient.timers),JSON.stringify(ambient.delays),draws,JSON.stringify(ambient.stats)];
    const before=production();focused=false;busy=true;
    assert.equal(ambient.debug('comet'),true);const comet=ambient.debugActive;
    assert.equal(comet.animation.frames[0].opacity,.72);assert.equal(comet.animation.options.duration,1100);
    assert.equal(ambient.active,null);assert.deepEqual(production(),before);
    ambient.refresh();assert.equal(ambient.debugActive,comet); // Console focus loss doesn't cancel the preview.
    const afterRefresh=production();
    assert.equal(ambient.debug('ufo'),true);const ufo=ambient.debugActive;
    assert.equal(comet.object.isConnected,false);assert.equal(ufo.animation.frames[0].opacity,.55);assert.equal(ufo.animation.options.duration,3200);
    await Promise.resolve();assert.equal(ambient.debugActive,ufo);assert.deepEqual(production(),afterRefresh);
    focused=true;busy=false;assert.equal(ambient.trigger('comet'),false);
    assert.equal(ambient.debugActive,ufo);assert.equal(ambient.active,null); // Previews obey the single-pass rule.
    ufo.animation.finish();await Promise.resolve();assert.equal(ambient.debugActive,null);assert.equal(ufo.object.isConnected,false);
    assert.equal(ambient.trigger('comet'),true);assert.match(ambient.debug('ufo'),/already active/);
    ambient.setReducedMotion(true);assert.match(ambient.debug('comet'),/reduced motion/);
    ambient.setReducedMotion(false);e.document.hidden=true;assert.match(ambient.debug('ufo'),/page is hidden/);
    e.document.hidden=false;ambient.debug('comet');ambient.destroy();await Promise.resolve();
    assert.equal(ambient.debugActive,null);assert.equal(e.timers.size,0);assert.match(ambient.debug('ufo'),/unavailable/);
});
test('comet and UFO timing windows stay distinct at both random endpoints',()=>{
    const e=env(),a=new e.Ambient({root:e.element(),visible:()=>true,random:()=>0});
    assert.equal(a.delays.comet,12000);assert.equal(a.delays.ufo,45000);
    const b=new e.Ambient({root:e.element(),visible:()=>true,random:()=>1});
    assert.equal(b.delays.comet,35000);assert.equal(b.delays.ufo,120000);a.destroy();b.destroy();
});
test('production paths vary independently of previews, with diagonal comets and flatter slower UFOs',()=>{
    const e=env(),root=e.element();root.getBoundingClientRect=()=>({width:800,height:600});let seed=7919;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const ambient=new e.Ambient({root,visible:()=>true,random,setTimer:e.setTimer,clearTimer:e.clearTimer});
    for(const kind of ['comet','ufo']){
        const samples=[];
        for(let i=0;i<24;i++){
            assert.equal(ambient.trigger(kind),true);const {animation}=ambient.active;
            const point=frame=>frame.transform.match(/translate\(([-\d.]+)px,([-\d.]+)px\)/).slice(1).map(Number);
            const start=point(animation.frames[0]),end=point(animation.frames.at(-1)),dy=end[1]-start[1];
            samples.push({start,end,direction:Math.sign(end[0]-start[0]),duration:animation.options.duration});
            if(kind==='comet'){assert.ok(Math.abs(dy)>=60-1e-8);assert.ok(animation.options.duration>=900&&animation.options.duration<=1400);}
            else{assert.ok(Math.abs(dy)<=24+1e-8);assert.ok(animation.options.duration>=2800&&animation.options.duration<=4000);}
            ambient.stopPass('active');
        }
        assert.equal(new Set(samples.map(s=>s.direction)).size,2);
        assert.ok(new Set(samples.map(s=>JSON.stringify(s.start))).size>20);
        assert.ok(new Set(samples.map(s=>JSON.stringify(s.end))).size>20);
        assert.ok(new Set(samples.map(s=>s.duration)).size>20);
    }
    for(const kind of ['comet','ufo']){
        ambient.debug(kind);const first=JSON.stringify([ambient.debugActive.animation.frames,ambient.debugActive.animation.options]);
        ambient.debug(kind);assert.equal(JSON.stringify([ambient.debugActive.animation.frames,ambient.debugActive.animation.options]),first);
    }
    ambient.destroy();
});
