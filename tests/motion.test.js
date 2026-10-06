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
test('ambient scheduling uses one long randomized timer, skips busy/hidden workflows and cleans up',async()=>{
    const e=env(),root=e.element();root.getBoundingClientRect=()=>({width:800,height:600});let busy=false,visible=true;
    const ambient=new e.Ambient({root,busy:()=>busy,visible:()=>visible,random:()=>.5,setTimer:e.setTimer,clearTimer:e.clearTimer});
    assert.equal(e.timers.size,1);assert.ok(ambient.nextDelay>=25000&&ambient.nextDelay<=55000);
    busy=true;assert.equal(ambient.trigger('comet'),false);assert.equal(ambient.stats.comet,0);
    busy=false;const production=[ambient.timer,ambient.nextDelay,ambient.opportunities,ambient.ufoAt];
    assert.equal(ambient.trigger('comet'),true);assert.equal(ambient.layer.children.length,1);assert.equal(ambient.trigger('ufo'),false);
    assert.deepEqual([ambient.timer,ambient.nextDelay,ambient.opportunities,ambient.ufoAt],production);
    const active=ambient.active;active.animation.finish();await Promise.resolve();assert.equal(ambient.active,null);assert.equal(active.object.isConnected,false);
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
test('UFO opportunities are bounded to 8–12 comet opportunities and never guarantee a short-session UFO',()=>{
    const e=env(),a=new e.Ambient({root:e.element(),visible:()=>false,random:()=>0});
    for(let i=0;i<7;i++)assert.equal(a.chooseKind(),'comet');assert.equal(a.chooseKind(),'ufo');
    const b=new e.Ambient({root:e.element(),visible:()=>false,random:()=>.999});assert.equal(b.ufoAt,12);
    for(let i=0;i<120;i++)assert.equal(b.chooseKind(),'comet');a.destroy();b.destroy();
});
