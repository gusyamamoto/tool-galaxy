const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const context=vm.createContext({setTimeout,clearTimeout,setInterval,clearInterval,performance,URLSearchParams});
for(const file of ['vendor/d3-force.bundle.min.js','model.js','physics.js','sample-data.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
const Physics=vm.runInContext('GalaxyPhysics',context),model=vm.runInContext('galaxyModel',context),sample=vm.runInContext('galaxySample',context);
const bounds={left:50,right:1100,top:200,bottom:900},plain=v=>JSON.parse(JSON.stringify(v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function make(records,layout=new Map(),links=[]){
    const entries=new Map(records.map(r=>[r.id,{name:r.id,description:'Description',category:'',x:400,y:400,...r}]));
    model.normalizeHierarchy(entries);
    const data=[...entries.values()].map(e=>({...e,sizeScale:model.roles[e.role].scale}));
    const physics=new Physics({onTick(){},onSettle(){}});physics.setViewport(bounds,13);
    physics.setGraph(data,links,layout);physics.simulation.stop();return physics;
}
function advance(p,ticks=300){p.simulation.stop().tick(ticks);return [...p.particles.values()];}
function fixture(){return make(plain(sample.build().entries).map(e=>({...e,seedLayout:true})));}
function family(){return make([{id:'g',seedLayout:true},{id:'s',parentId:'g',seedLayout:true},
    {id:'p',parentId:'s',seedLayout:true},{id:'m',parentId:'p',seedLayout:true},{id:'t',parentId:'m',seedLayout:true}]);}
function separated(nodes){nodes.filter(n=>n.depth>0).forEach((a,i,all)=>all.slice(i+1).forEach(b=>
    assert.ok(distance(a,b)>=a.radius+b.radius-1,`${a.id} overlaps ${b.id}`)));}

test('CRUD graph refresh retains surviving positions/identity and supports restrained reheating',()=>{
    const p=family();advance(p,400);
    const before=new Map(p.ordered.map(n=>[n.id,{node:n,x:n.x,y:n.y,vx:n.vx,vy:n.vy}]));
    const data=p.ordered.map(({id,parentId,role,depth,x,y,sizeScale})=>({id,parentId,role,depth,x,y,sizeScale}));
    p.setGraph([...data,{id:'new',parentId:'t',role:'astronaut',depth:5,x:400,y:400,sizeScale:.5,seedLayout:true}],[],new Map(),{reheat:.12});
    p.simulation.stop();assert.equal(p.simulation.alpha(),.12);
    before.forEach((old,id)=>{const n=p.particles.get(id);assert.equal(n,old.node);assert.deepEqual([n.x,n.y,n.vx,n.vy],[old.x,old.y,old.vx,old.vy]);});
    p.setGraph(data,[],new Map(),{reheat:.12});p.simulation.stop();
    assert.equal(p.particles.has('new'),false);
    before.forEach((old,id)=>{const n=p.particles.get(id);assert.equal(n,old.node);assert.deepEqual([n.x,n.y],[old.x,old.y]);});
});

test('semantic connections have zero influence on positions, envelopes or orbital bands',()=>{
    const records=plain(sample.build().entries).map(entry=>({...entry,seedLayout:true}));
    const a=make(records),b=make(records,new Map(),sample.build().connections);
    advance(a,300);advance(b,300);
    for(const [id,node] of a.particles){
        const other=b.particles.get(id);
        assert.deepEqual([node.x,node.y,node.vx,node.vy,node.envelope,node.orbitRadius],
            [other.x,other.y,other.vx,other.vy,other.envelope,other.orbitRadius]);
    }
    assert.ok(b.linkForce.links().every(link=>b.linkForce.strength()(link)===0));
});
test('187 bodies retain separate Galaxy footprints and local solar trees',()=>{
    const p=fixture(),nodes=advance(p,450),regions=[...p.galaxies.values()];
    assert.equal(regions.length,4);assert.equal(p.systems.size,8);assert.equal(p.ordered.length,187);
    regions.forEach((g,i)=>{
        assert.equal(g.systems.length,2);
        regions.slice(i+1).forEach(h=>assert.ok(distance(g.root,h.root)>(g.radius+h.radius)*.85));
        g.systems.forEach(s=>assert.ok(distance(s.root,g.root)+s.radius<g.radius*1.2));
        assert.ok(distance(g.systems[0].root,g.systems[1].root)>(g.systems[0].radius+g.systems[1].radius)*.85);
    });
    nodes.filter(n=>n.depth>1).forEach(n=>assert.ok(distance(n,n.parent)<(n.role==='astronaut'?p.orbitalRange(n).max+20:n.orbitRadius*1.45+25)));
    assert.ok(nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));separated(nodes);
});
for(const [body,id] of [['Galaxy','sample-galaxy-0'],['Sun','sample-sun-0'],['Planet','sample-planet-0-0'],['Moon','sample-moon-0-0-0'],['Satellite','sample-satellite-0-0-0-0']]){
    test(`${body} release preserves inertia, cools immediately and settles gently`,()=>{
        const p=fixture();advance(p,400);const node=p.particles.get(id);
        const descendants=p.ordered.filter(n=>model.ancestors(new Map(p.ordered.map(n=>[n.id,n])),n.id).some(a=>a.id===id));
        const before=new Map(descendants.map(n=>[n.id,{x:n.x,y:n.y}]));
        p.beginDrag(id);p.moveDrag(id,node.x+100,node.y+60);advance(p,12);
        const alpha=p.simulation.alpha(),velocities=new Map(p.ordered.map(n=>[n.id,{vx:n.vx,vy:n.vy}]));
        const release={x:node.x,y:node.y};p.endDrag(id,true);p.simulation.stop();
        assert.equal(p.simulation.alpha(),alpha);assert.equal(p.simulation.alphaTarget(),0);
        p.ordered.forEach(n=>assert.deepEqual({vx:n.vx,vy:n.vy},velocities.get(n.id)));
        if(node.parent){assert.equal(node.placement.x,undefined);assert.equal(node.placement.parentId,node.parentId);}
        let peakAcceleration=0,excursion=0;
        for(let i=0;i<250;i++){
            const v={vx:node.vx,vy:node.vy};advance(p,1);
            if(i<12)peakAcceleration=Math.max(peakAcceleration,Math.hypot(node.vx-v.vx,node.vy-v.vy));
            excursion=Math.max(excursion,distance(node,release));
        }
        assert.ok(peakAcceleration<1,`sharp initial acceleration: ${peakAcceleration}`);
        assert.ok(excursion<140,`excessive recoil: ${excursion}`);
        assert.equal(node.fx,null);assert.ok(p.simulation.alpha()<p.simulation.alphaMin());
        assert.ok(p.ordered.every(n=>Math.hypot(n.vx,n.vy)<.08));
        descendants.forEach(n=>assert.ok(distance(n,before.get(n.id))>10,'children should visibly follow'));
    });
}

function astronautFamily(count=8, siblings=false){
    return make([{id:'g',seedLayout:true},{id:'s',parentId:'g',seedLayout:true},
        {id:'p',parentId:'s',seedLayout:true},{id:'m',parentId:'p',seedLayout:true},{id:'t',parentId:'m',seedLayout:true},
        ...Array.from({length:count},(_,i)=>({id:`eva-${i}`,parentId:siblings||!i?'t':`eva-${i-1}`,seedLayout:true}))]);
}

test('deep Astronaut chains use bounded compact clusters and never add orbital bands',()=>{
    const p=astronautFamily(24);advance(p,1800);
    const anchor=p.particles.get('t'),figures=p.ordered.filter(n=>n.role==='astronaut');
    assert.equal(figures.length,24);assert.equal(p.particles.get('eva-23').depth,28);
    assert.ok(figures.every(n=>n.childOrbit===0 && n.clusterAnchor===anchor));
    assert.ok(figures.every(n=>distance(n,anchor)<anchor.clusterRadius+25));
    assert.ok(figures.every(n=>distance(n,n.parent)<p.orbitalRange(n).max+30));
    assert.ok(anchor.envelope<190 && p.particles.get('s').envelope<650,'depth must not expand recursive envelopes');
    separated(figures);assert.ok(p.simulation.alpha()<p.simulation.alphaMin());
});

test('Astronaut siblings separate locally and remain compact after an overlapping drop',()=>{
    const p=astronautFamily(8,true);advance(p,600);
    const a=p.particles.get('eva-0'),b=p.particles.get('eva-1'),anchor=p.particles.get('t');
    p.beginDrag(a.id);p.moveDrag(a.id,b.x,b.y);advance(p,12);p.endDrag(a.id,true);advance(p,700);
    const figures=p.ordered.filter(n=>n.role==='astronaut');separated(figures);
    assert.ok(distance(a,b)>a.radius+b.radius+10);
    assert.ok(figures.every(n=>distance(n,anchor)<anchor.clusterRadius+25 && n.fx===null));
});

test('Astronaut drag preserves a reasonable chosen region, moves descendants and softly bounds extreme drops',()=>{
    const p=astronautFamily(3);advance(p,600);
    const node=p.particles.get('eva-0'),child=p.particles.get('eva-1'),parent=node.parent;
    const before={x:child.x,y:child.y};
    p.beginDrag(node.id);p.moveDrag(node.id,parent.x+58,parent.y+18);
    assert.ok(distance(child,before)>5);
    const released={x:node.x,y:node.y},preferred=p.endDrag(node.id,true);
    advance(p,700);
    assert.equal(node.fx,null);assert.equal(node.placement.radius,preferred.radius);
    assert.ok(distance(node,released)<24,'reasonable drag should remain near the chosen local region');
    p.beginDrag(node.id);p.moveDrag(node.id,parent.x+5000,parent.y-3000);p.endDrag(node.id,true);advance(p,10000);
    assert.ok(distance(node,parent)<p.orbitalRange(node).max+35);
    assert.ok(distance(node,node.clusterAnchor)<node.clusterAnchor.clusterRadius+30);
    assert.ok(p.ordered.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
});
test('relative arrangement survives a graph rebuild and moves with its parent',()=>{
    const p=family();advance(p);const moon=p.particles.get('m');
    p.beginDrag('m');p.moveDrag('m',moon.parent.x-160,moon.parent.y+90);const placement=p.endDrag('m',true);advance(p);
    const data=p.ordered.map(({id,parentId,role,depth,x,y,sizeScale})=>({id,parentId,role,depth,x,y,sizeScale}));
    p.setGraph(data,[],new Map([['m',placement]]));advance(p);
    assert.equal(moon.placement.angle,placement.angle);assert.equal(moon.placement.radius,placement.radius);
    const before={x:moon.x,y:moon.y};p.beginDrag('p');const planet=p.particles.get('p');p.moveDrag('p',planet.x+220,planet.y-120);
    assert.ok(Math.abs(moon.x-before.x-220)<.001);assert.ok(Math.abs(moon.y-before.y+120)<.001);
    assert.equal(moon.placement.angle,placement.angle);p.endDrag('p',true);p.simulation.stop();
});
test('drag influences a radial region and yields rather than anchoring coordinates',()=>{
    const p=family();advance(p);const planet=p.particles.get('p'),sun=p.particles.get('s');
    p.beginDrag('p');p.moveDrag('p',sun.x+600,sun.y+100);const released={x:planet.x,y:planet.y};
    const placement=p.endDrag('p',true);advance(p,350);
    assert.equal(placement.x,undefined);assert.equal(planet.fx,null);
    assert.ok(distance(planet,released)>20,'normal drag must not become a strong coordinate spring');
    assert.ok(distance(planet,sun)>planet.orbitRadius,'drag should still influence arrangement');
});
for(const [kind,aId,bId] of [['Planet','sample-planet-0-0','sample-planet-0-1'],['Moon','sample-moon-0-0-0','sample-moon-0-0-1'],['Satellite','sample-satellite-0-0-0-0','sample-satellite-0-0-0-1']]){
    test(`${kind} siblings separate after an overlapping drop while both remain movable`,()=>{
        const p=fixture();advance(p,400);const a=p.particles.get(aId),b=p.particles.get(bId);
        p.beginDrag(aId);p.moveDrag(aId,b.x,b.y);advance(p,12);p.endDrag(aId,true);advance(p,350);
        assert.equal(b.fx,null);assert.equal(a.parentId,b.parentId);
        assert.ok(distance(a,b)>=a.radius+b.radius+12);assert.equal(a.fx,null);
    });
}
test('local sibling impulses do not enlarge or accelerate unrelated Galaxies',()=>{
    const p=fixture();advance(p);const parent=p.particles.get('sample-sun-0'),a=p.particles.get('sample-planet-0-0'),b=p.particles.get('sample-planet-0-1');
    p.ordered.forEach(n=>{n.vx=n.vy=0;});a.x=b.x=parent.x+180;a.y=parent.y;b.y=parent.y+40;
    const sizes=JSON.stringify([...p.galaxies.values()].map(g=>g.radius));p.separateSiblings(.1);
    assert.ok(a.vy<0&&b.vy>0);assert.ok(Math.abs(a.vx)<.0001);
    assert.ok(p.ordered.filter(n=>n.galaxyId!==parent.galaxyId).every(n=>n.vx===0&&n.vy===0));
    assert.equal(JSON.stringify([...p.galaxies.values()].map(g=>g.radius)),sizes);
});
test('Galaxy dragging carries all descendants without fixed branches',()=>{
    const p=fixture();advance(p);const root=p.particles.get('sample-galaxy-0'),moon=p.particles.get('sample-moon-0-0-0'),position={x:moon.x,y:moon.y};
    const sun=p.particles.get('sample-sun-0'),before={x:sun.x,y:sun.y};
    p.beginDrag(root.id);p.moveDrag(root.id,root.x+220,root.y-120);
    assert.ok(Math.abs(sun.x-before.x-220)<.001);assert.equal(moon.x,position.x+220);assert.equal(moon.y,position.y-120);
    p.endDrag(root.id,true);advance(p);assert.equal(moon.fx,null);
});
test('legacy pins normalize to flowing motion through resize, rebuild and subsequent dragging',()=>{
    const records=[{id:'g'},{id:'s',parentId:'g'},{id:'p',parentId:'s'},{id:'m',parentId:'p'}];
    const entries=new Map(records.map(r=>[r.id,{x:400,y:400,...r}]));model.normalizeHierarchy(entries);
    const layout=model.normalizeLayout([{id:'m',x:1300,y:-700,pinned:true}],entries);
    const p=make([...entries.values()],layout),moon=p.particles.get('m');
    assert.equal(moon.x,1300);assert.equal(moon.y,-700);assert.equal(moon.fx,null);assert.equal(moon.placement.pinned,undefined);
    advance(p,1000);assert.ok(distance(moon,{x:1300,y:-700})>100);
    p.setViewport({left:20,right:400,top:200,bottom:500},12);advance(p);assert.equal(moon.fx,null);
    const data=p.ordered.map(n=>({...n,seedLayout:false}));p.setGraph(data,[],layout);advance(p);
    p.beginDrag('m');p.moveDrag('m',1500,-600);const moved=p.endDrag('m',true);advance(p,1000);
    assert.equal(moved.pinned,undefined);assert.equal(moon.fx,null);assert.ok(distance(moon,{x:1500,y:-600})>100);
    assert.ok(Math.abs(p.simulation.velocityDecay()-.42)<1e-12);
});
test('reparenting keeps stable particle identity, changes systems and clears obsolete influence',()=>{
    const p=family();advance(p);const moon=p.particles.get('m');moon.placement=p.influenceFor(moon);
    const data=p.ordered.map(({id,parentId,role,depth,x,y,sizeScale})=>({id,parentId,role,depth,x,y,sizeScale}));
    data.find(n=>n.id==='m').parentId='s';
    const entries=new Map(data.map(e=>[e.id,e]));model.normalizeHierarchy(entries);
    p.setGraph([...entries.values()],[],new Map([['m',moon.placement]]));advance(p);
    assert.equal(p.particles.get('m'),moon);assert.equal(moon.parentId,'s');assert.equal(moon.role,'planet');assert.equal(moon.placement,null);
});
test('semantic relationships between systems never drag a remote branch across Galaxies',()=>{
    const p=fixture(),control=fixture();advance(p);advance(control);
    p.beginDrag('sample-moon-0-0-0');p.moveDrag('sample-moon-0-0-0',8000,-7000);p.endDrag('sample-moon-0-0-0',true);
    p.linkForce.links([{source:'sample-moon-0-0-0',target:'sample-sun-6'}]);
    assert.equal(p.linkForce.strength()(p.linkForce.links()[0]),0);
    control.reheat(.28);advance(p);advance(control);
    assert.ok(distance(p.particles.get('sample-sun-6'),control.particles.get('sample-sun-6'))<5);
});
test('held drags keep other active drags responsive; click release adds no energy or influence',()=>{
    const p=family();advance(p);p.beginDrag('s');p.moveDrag('s',500,550);advance(p,120);
    const alpha=p.simulation.alpha();p.beginDrag('t');p.endDrag('s',true);p.simulation.stop();
    assert.equal(p.simulation.alpha(),alpha);assert.equal(p.simulation.alphaTarget(),.1);
    p.endDrag('t',false);p.simulation.stop();assert.equal(p.particles.get('t').placement,null);assert.equal(p.simulation.alphaTarget(),0);
});
test('deep hierarchy physics stays finite and reduced motion still cools quickly',()=>{
    const records=Array.from({length:80},(_,i)=>({id:`n${i}`,parentId:i?`n${i-1}`:null,seedLayout:true})),p=make(records);
    advance(p,350);assert.equal(p.ordered.length,80);assert.equal(p.particles.get('n79').depth,79);
    assert.ok(p.ordered.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
    p.setReducedMotion(true);p.reheat(.3);advance(p,70);assert.equal(p.simulation.velocityDecay(),.6);assert.ok(p.simulation.alpha()<p.simulation.alphaMin());
});

test('sparse systems stay compact and wide sibling sets grow enough to separate',()=>{
    const system=count=>make([{id:'g',seedLayout:true},{id:'s',parentId:'g',seedLayout:true},
        ...Array.from({length:count},(_,i)=>({id:`p${i}`,parentId:'s',seedLayout:true}))]);
    const sparse=system(3),wide=system(12);advance(sparse,450);advance(wide,450);
    const sparseSun=sparse.particles.get('s'),wideSun=wide.particles.get('s');
    assert.ok(sparseSun.childOrbit<120);assert.ok(wideSun.childOrbit>sparseSun.childOrbit*2);
    assert.ok(sparse.ordered.filter(n=>n.depth===2).every(n=>distance(n,sparseSun)<150));
    separated(sparse.ordered);separated(wide.ordered);
});

for(const [kind,depth] of [['Moon',3],['Satellite',4]]){
    test(`${kind} spacing adapts from two to eight siblings with collision clearance`,()=>{
        const system=count=>make([...Array.from({length:depth},(_,i)=>({id:`n${i}`,parentId:i?`n${i-1}`:null,seedLayout:true})),
            ...Array.from({length:count},(_,i)=>({id:`child${i}`,parentId:`n${depth-1}`,seedLayout:true}))]);
        const sparse=system(2),wide=system(8);advance(sparse,450);advance(wide,450);
        const parent=`n${depth-1}`,a=sparse.particles.get(parent),b=wide.particles.get(parent);
        assert.ok(b.childOrbit>a.childOrbit*1.3);assert.ok(b.childOrbit<150);
        for(const p of [sparse,wide]){
            const children=p.children.get(parent);children.forEach((a,i)=>children.slice(i+1).forEach(b=>assert.ok(distance(a,b)>a.radius+b.radius+12)));
            // The band has a dead zone; collisions still preserve its 24px clearance.
            assert.ok(children.every(n=>distance(n,n.parent)-n.radius-n.parent.radius>22));
        }
        separated(sparse.ordered);separated(wide.ordered);
    });
}

test('deep branches do not recursively enlarge their Sun orbital band',()=>{
    const p=fixture();advance(p,450);
    for(const system of p.systems.values()) assert.ok(system.root.childOrbit<150,system.id);
    const food=p.galaxies.get('sample-galaxy-1');
    assert.ok(distance(food.systems[0].root,food.systems[1].root)<1200);
});

test('extreme drops return locally while old oversized preferences remain bounded',()=>{
    const p=family();advance(p);const sun=p.particles.get('s'),planet=p.particles.get('p');
    p.beginDrag('p');p.moveDrag('p',sun.x+2000,sun.y);const placement=p.endDrag('p',true);
    assert.equal(placement.radius,p.orbitalRange(planet).max);assert.equal(planet.fx,null);
    const limit=p.orbitalRange(planet).max*1.12+16;
    advance(p,1000);assert.ok(distance(planet,sun)<limit);assert.ok(p.simulation.alpha()<p.simulation.alphaMin());
    planet.placement={parentId:'s',angle:0,radius:100000};p.reheat(.3);advance(p,450);
    assert.ok(distance(planet,sun)<limit,'legacy preferences must not stretch an orbit');
});

for(const [kind,id] of [['Planet','p'],['Moon','m']]){
    for(const factor of [1.5,2]) test(`${kind} respects a ${factor}x radial drag and its new angle without default blending`,()=>{
        const p=family();advance(p,450);const node=p.particles.get(id),parent=node.parent,original=distance(node,parent);
        const angle=Math.atan2(node.y-parent.y,node.x-parent.x)+.3,requested=original*factor;
        p.beginDrag(id);p.moveDrag(id,parent.x+Math.cos(angle)*requested,parent.y+Math.sin(angle)*requested);
        const released=distance(node,parent),placement=p.endDrag(id,true);p.simulation.stop();
        assert.ok(Math.abs(placement.radius-released)<.001,'reasonable release must be saved directly');
        assert.ok(Math.abs(placement.angle-angle)<1e-12);
        advance(p,500);const settled=distance(node,parent);
        assert.ok(settled>=released*.85&&settled<=released*1.15,`${kind}: original ${original}, release ${released}, settled ${settled}`);
        const settledAngle=Math.atan2(node.y-parent.y,node.x-parent.x);
        assert.ok(Math.abs(Math.atan2(Math.sin(settledAngle-angle),Math.cos(settledAngle-angle)))<.3);
        assert.equal(node.fx,null);assert.equal(node.parentId,parent.id);
    });
    test(`${kind} extreme drop returns to the safety boundary, not the default band`,()=>{
        const p=family();advance(p,450);const node=p.particles.get(id),parent=node.parent,range=p.orbitalRange(node);
        p.beginDrag(id);p.moveDrag(id,parent.x+5000,parent.y);const release=node.x;
        const placement=p.endDrag(id,true);p.simulation.stop();assert.equal(node.x,release,'release must not snap coordinates');
        assert.equal(placement.radius,range.max);advance(p,1800);
        assert.ok(distance(node,parent)<=range.max*1.12+16);assert.ok(distance(node,parent)>node.orbitRadius*1.7);
        assert.equal(node.fx,null);assert.ok(p.simulation.alpha()<p.simulation.alphaMin());
    });
}
