const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const context=vm.createContext({setTimeout,clearTimeout,setInterval,clearInterval,performance,URLSearchParams});
for(const file of ['vendor/d3-force.bundle.min.js','model.js','physics.js','sample-data.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
const Physics=vm.runInContext('GalaxyPhysics',context),model=vm.runInContext('galaxyModel',context),sample=vm.runInContext('galaxySample',context);
const bounds={left:50,right:1100,top:200,bottom:900},plain=v=>JSON.parse(JSON.stringify(v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function make(records,layout=new Map()){
    const entries=new Map(records.map(r=>[r.id,{name:r.id,description:'Description',category:'',x:400,y:400,...r}]));
    model.normalizeHierarchy(entries);
    const data=[...entries.values()].map(e=>({...e,sizeScale:model.roles[e.role].scale}));
    const physics=new Physics({onTick(){},onSettle(){}});physics.setViewport(bounds,13);
    physics.setGraph(data,layout);physics.simulation.stop();return physics;
}
function advance(p,ticks=300){p.simulation.stop().tick(ticks);return [...p.particles.values()];}
test('dense Astronaut clusters grow by count while local offsets remain detail-sized',()=>{
    const records=Array.from({length:5},(_,i)=>({id:`root${i}`,parentId:i?`root${i-1}`:null,seedLayout:true}));
    const family=count=>make([...records,...Array.from({length:count},(_,i)=>({id:`a${i}`,parentId:'root4',seedLayout:true}))]);
    const sparse=family(2),dense=family(7);
    assert.equal(dense.particles.get('a0').orbitRadius,sparse.particles.get('a0').orbitRadius);
    assert.ok(dense.particles.get('root4').clusterRadius>sparse.particles.get('root4').clusterRadius);
    assert.ok(dense.particles.get('root4').clusterRadius<40);assert.equal(dense.collisionPadding(dense.particles.get('a0')),2);
    assert.ok(dense.particles.get('root1').childOrbit>dense.particles.get('root2').childOrbit);
});
// Keep the original 187-body geometry fixture: the added extreme Sample
// families are a separate visual stress workload, not new physics expectations.
function fixture(){return make(plain(sample.build().entries).filter(e=>!e.id.startsWith('sample-stress-')).map(e=>({...e,seedLayout:true})));}
function family(){return make([{id:'g',seedLayout:true},{id:'s',parentId:'g',seedLayout:true},
    {id:'p',parentId:'s',seedLayout:true},{id:'m',parentId:'p',seedLayout:true},{id:'t',parentId:'m',seedLayout:true}]);}
function separated(nodes){nodes.filter(n=>n.depth>0).forEach((a,i,all)=>all.slice(i+1).forEach(b=>
    assert.ok(distance(a,b)>=a.radius+b.radius-1,`${a.id} overlaps ${b.id}`)));}

function crowded(parentRole,count) {
    const path=[{id:'g',seedLayout:true},{id:'s',parentId:'g',seedLayout:true}];
    if(parentRole==='planet')path.push({id:'p',parentId:'s',seedLayout:true});
    const parentId=parentRole==='sun'?'s':'p';
    return make([...path,...Array.from({length:count},(_,i)=>({id:`child-${String(i).padStart(2,'0')}`,parentId,seedLayout:true}))]);
}
test('local child orbits compress small families and grow smoothly with count and subtree demand',()=>{
    for(const role of ['sun','planet']){
        const radii=[2,3,5,8,16,24].map(count=>crowded(role,count).particles.get(role==='sun'?'s':'p').childOrbit);
        radii.slice(1).forEach((radius,index)=>assert.ok(radius>radii[index],'more immediate children need more local room'));
        assert.ok(radii[1]/radii[0]<1.2,'small count changes do not produce an abrupt radius jump');
        const sparse=crowded(role,2),parent=sparse.particles.get(role==='sun'?'s':'p');
        const records=sparse.ordered.map(n=>({...n,seedLayout:true}));
        const deep=make([...records,...Array.from({length:15},(_,i)=>({id:`desc-${i}`,parentId:'child-00',seedLayout:true}))]);
        assert.ok(deep.particles.get(parent.id).childOrbit>parent.childOrbit,'equal child counts differ when one child owns a substantial subtree');
        const radius=parent.childOrbit;sparse.setViewport(bounds,12);sparse.simulation.stop();
        assert.ok(parent.childOrbit<radius&&Math.abs(parent.childOrbit/radius-12/13)<.02,'responsive preference scales with physical units while retaining existing collision floors');
    }
    const samplePhysics=make(plain(sample.build().entries).map(e=>({...e,seedLayout:true})));
    for(const id of ['sample-planet-0-1','sample-planet-0-2']){
        const parent=samplePhysics.particles.get(id);
        assert.equal(samplePhysics.children.get(id).length,2);
        assert.ok(parent.childOrbit<65,'AI and Hardware noticeably compress from the former 80.888-unit preference');
        assert.ok(parent.familyFootprint>parent.childOrbit,'full reservation includes the child territories rather than equalling the local orbit');
    }
});
for(const [role,counts] of [['sun',[4,8,14,24]],['planet',[3,8,16]]])for(const count of counts){
    test(`${role} with ${count} children uses compact soft bands, separates and cools`,()=>{
        const p=crowded(role,count),parent=p.particles.get(role==='sun'?'s':'p'),children=p.children.get(parent.id);
        const before=children.map(n=>[n.id,n.softBandIndex,n.orbitRadius]);
        assert.ok(parent.softBands.length>=1&&parent.softBands.length<=3);
        const local=Math.max(...children.map(child=>child.radius+Math.min(role==='sun'?28:14,Math.max(0,child.envelope-child.radius)*.18)));
        const oldMinimum=parent.radius+local+(role==='sun'?82:48);
        const oldRadius=Math.max(oldMinimum,(local+26)*p.siblingClearanceFactor(parent.depth+1)/Math.sin(Math.PI/count))*(role==='sun'?1:.82);
        assert.ok(parent.childOrbit>=(role==='sun'?110:40),'responsive local demand retains hierarchy scale');
        advance(p,600);separated(p.ordered);
        assert.ok(p.simulation.alpha()<p.simulation.alphaMin(),'bands must settle without keeping physics awake');
        assert.ok(children.every(n=>distance(n,parent)<=parent.softBands[n.softBandIndex].radius*1.35+20));
        p.buildSystems();assert.deepEqual(children.map(n=>[n.id,n.softBandIndex,n.orbitRadius]),before,'rebuild retains stable band preferences');
    });
}
test('untouched band siblings have no mandatory angular slot; manual releases keep their own angle/radius',()=>{
    const p=crowded('sun',24);advance(p,450);const node=p.particles.get('child-00'),parent=node.parent;
    const radius=node.orbitRadius,angle=node.orbitAngle+1.1;
    node.x=parent.x+Math.cos(angle)*radius;node.y=parent.y+Math.sin(angle)*radius;node.vx=node.vy=0;
    p.attractToOrbits(.3);
    assert.ok(Math.abs(-Math.sin(angle)*node.vx+Math.cos(angle)*node.vy)<1e-10,'band pull is radial, not angular');
    const records=p.ordered.map(n=>({...n,seedLayout:false}));
    for(const [id,theta] of [['child-00',.3],['child-08',2.4],['child-20',4.6]]){
        const child=p.particles.get(id),requested=child.orbitRadius*1.35;
        p.beginDrag(id);p.moveDrag(id,parent.x+Math.cos(theta)*requested,parent.y+Math.sin(theta)*requested);
        const release={x:child.x,y:child.y},placement=p.endDrag(id,true);p.simulation.stop();
        assert.deepEqual({x:child.x,y:child.y},release,'no release snapping');
        assert.ok(Math.abs(Math.atan2(Math.sin(placement.angle-theta),Math.cos(placement.angle-theta)))<1e-10);assert.ok(Math.abs(placement.radius-requested)<1e-8);
        advance(p,500);assert.ok(Math.abs(distance(child,parent)-requested)<requested*.2);
        const delta=Math.atan2(Math.sin(Math.atan2(child.y-parent.y,child.x-parent.x)-theta),Math.cos(Math.atan2(child.y-parent.y,child.x-parent.x)-theta));
        assert.ok(Math.abs(delta)<.4,'released angle remains meaningful');
    }
    const placements=new Map(p.ordered.filter(n=>n.placement).map(n=>[n.id,n.placement]));
    p.setGraph(records,placements,{reheat:.12});p.simulation.stop();
    placements.forEach((placement,id)=>assert.deepEqual(plain(p.particles.get(id).placement),plain(placement)));
});
test('adding a sibling retains existing soft-band membership and manual preferences',()=>{
    const p=crowded('sun',14);advance(p,400);
    const bands=new Map(p.children.get('s').map(n=>[n.id,n.softBandIndex]));
    const child=p.particles.get('child-00');child.placement=p.influenceFor(child);
    const placements=new Map([[child.id,child.placement]]),before=plain(child.placement);
    const records=p.ordered.map(n=>({...n,seedLayout:false}));
    p.setGraph([...records,{id:'new-child',role:'planet',depth:2,parentId:'s',x:400,y:400,sizeScale:model.roles.planet.scale,seedLayout:true}],placements);
    p.simulation.stop();bands.forEach((band,id)=>assert.equal(p.particles.get(id).softBandIndex,band));
    assert.deepEqual(plain(child.placement),before);
});
test('legitimate wider v5 manual preferences survive compact band tuning and refresh',()=>{
    const p=crowded('sun',24);advance(p,450);
    const child=p.particles.get('child-00'),parent=child.parent;
    const placement={parentId:parent.id,angle:.9,radius:600};
    const records=p.ordered.map(n=>({...n,seedLayout:false}));
    Object.assign(records.find(n=>n.id===child.id),{x:parent.x+Math.cos(.9)*600,y:parent.y+Math.sin(.9)*600});
    const restored=make(records,new Map([[child.id,placement]])),node=restored.particles.get(child.id);
    assert.deepEqual(plain(node.placement),placement);assert.ok(restored.orbitalRange(node).max>=600);
    advance(restored,600);assert.ok(Math.abs(distance(node,node.parent)-600)<120,'compact defaults must not erase a legitimate old manual radius');
});
test('mixed sibling families get different soft footprints and enough ancestral territory',()=>{
    const p=make(plain(sample.build().entries).map(e=>({...e,seedLayout:true}))),rich=p.particles.get('sample-planet-0-0'),leaf=p.particles.get('sample-stress-planet-01');
    assert.ok(rich.familyFootprint>leaf.familyFootprint*5);assert.ok(rich.orbitRadius>leaf.orbitRadius*1.5,'rich family retains a wider band while ordinary siblings gain count-dependent room');
    const moon=p.particles.get('sample-moon-0-0-0'),satellite=p.particles.get('sample-satellite-0-0-0-0'),sun=p.particles.get('sample-sun-0');
    assert.ok(rich.familyFootprint/sun.familyFootprint>.3&&rich.familyFootprint/sun.familyFootprint<.5);
    assert.ok(moon.familyFootprint/sun.familyFootprint>.12&&moon.familyFootprint/sun.familyFootprint<.24);
    assert.ok(satellite.familyFootprint/sun.familyFootprint>.04&&satellite.familyFootprint/sun.familyFootprint<.1);
    assert.ok(satellite.familyFootprint>p.particles.get('sample-stress-satellite-01').familyFootprint*5);
    advance(p,750);separated(p.ordered);assert.ok(p.simulation.alpha()<p.simulation.alphaMin());
    assert.ok(p.children.get(satellite.id).every(n=>n.parent===satellite&&distance(n,satellite)<satellite.clusterRadius+20));
});

test('band corridors have clear gaps and footprint-weighted preferences inside each zone',()=>{
    const p=make(plain(sample.build().entries).map(e=>({...e,seedLayout:true})));
    const sun=p.particles.get('sample-sun-0');
    sun.softBands.forEach((band,index)=>{
        assert.ok(band.inner<band.radius&&band.radius<band.outer);
        if(index)assert.ok(sun.softBands[index-1].outer<band.inner,'neighboring corridors retain a visible gap');
    });
    const band=sun.softBands[0],leaf=p.particles.get('sample-stress-planet-01');
    const small=p.particles.get('sample-planet-0-1'),large=p.particles.get('sample-planet-0-0');
    assert.ok(p.bandPreference(leaf,band)<p.bandPreference(small,band));
    assert.ok(p.bandPreference(small,band)<p.bandPreference(large,band));
    for(const child of [leaf,small,large])assert.ok(p.bandPreference(child,band)>band.inner&&p.bandPreference(child,band)<band.outer);
    advance(p,750);
    const zone=sun.softBands[large.softBandIndex];
    assert.ok(distance(large,sun)>=zone.inner&&distance(large,sun)<=zone.outer,'Software settles clearly inside its assigned corridor');
    assert.ok(small.childOrbit<65,'AI retains its compact local child orbit');
    assert.ok(p.simulation.alpha()<p.simulation.alphaMin(),'corridor forces still cool');
    separated(p.ordered);
});

test('sustained large-family overflow promotes without snapping, reseeding descendants or demoting',()=>{
    const p=make(plain(sample.build().entries).map(e=>({...e,seedLayout:true})));
    const node=p.particles.get('sample-planet-0-0'),parent=node.parent,band=parent.softBands[0];
    // Reproduce a formerly inner-band large family under outward pressure.
    node.softBandIndex=0;node.x=parent.x+band.outer+band.radius*.08;node.y=parent.y;
    const coordinates=p.ordered.map(n=>[n.id,n.x,n.y]);
    for(let i=0;i<29;i++)p.attractToOrbits(.1);
    assert.equal(node.softBandIndex,0,'transient overflow must not immediately promote');
    p.attractToOrbits(.1);
    assert.ok(node.softBandIndex>0,'sustained pressure on a substantial subtree promotes its root');
    assert.deepEqual(p.ordered.map(n=>[n.id,n.x,n.y]),coordinates,'promotion changes derived preferences, never coordinates');
    const promoted=node.softBandIndex;
    node.x=parent.x+parent.softBands[promoted].radius;node.y=parent.y;
    for(let i=0;i<40;i++)p.attractToOrbits(.1);
    p.buildSystems();assert.equal(node.softBandIndex,promoted,'membership does not oscillate or demote on rebuild');
    const preferred=p.bandPreference(node,parent.softBands[promoted]);
    node.x=parent.x+preferred;node.y=parent.y;node.vx=node.vy=0;
    p.attractToOrbits(.1);assert.ok(Math.abs(node.vy)<1e-9,'radial guidance introduces no angular slots');
});

test('band guidance respects held drags and explicit manual radius preferences',()=>{
    const p=crowded('sun',8),node=p.children.get('s')[0],parent=node.parent;
    const index=node.softBandIndex;p.beginDrag(node.id);p.moveDrag(node.id,parent.x+node.orbitRadius*1.5,parent.y);
    const held={x:node.x,y:node.y};for(let i=0;i<40;i++)p.attractToOrbits(.1);
    assert.deepEqual({x:node.x,y:node.y},held);assert.equal(node.softBandIndex,index);
    const placement=p.endDrag(node.id,true),release={x:node.x,y:node.y};
    assert.deepEqual({x:node.x,y:node.y},release);advance(p,500);
    assert.ok(Math.abs(distance(node,parent)-placement.radius)<placement.radius*.2,'user radius remains meaningful');
    assert.equal(node.softBandIndex,index,'manual arrangements do not trigger automatic pressure promotion');
});

test('whole-family angular placement clears neighboring bands and preserves compact child worlds',()=>{
    const p=make(plain(sample.build().entries).map(e=>({...e,seedLayout:true})));
    const sun=p.particles.get('sample-sun-0'),software=p.particles.get('sample-planet-0-0');
    const siblings=p.children.get(sun.id),leaf=p.particles.get('sample-stress-planet-01');
    assert.ok(software.angularFamilyHalf>leaf.angularFamilyHalf*5,'large subtree reserves a much wider angular sector');
    const local=software.childOrbit;
    advance(p,750);
    for(const other of siblings.filter(n=>n!==software))assert.ok(distance(software,other)>=(software.familyFootprint+other.familyFootprint)*.95,`Software materially invades ${other.id}'s whole-family territory`);
    assert.equal(software.childOrbit,local,'angular placement must not resize the child orbit');
    for(const id of ['sample-planet-0-1','sample-planet-0-2'])assert.ok(p.particles.get(id).childOrbit<65);
    const band=sun.softBands[software.softBandIndex];assert.ok(distance(software,sun)>=band.inner&&distance(software,sun)<=band.outer);
    assert.ok(p.simulation.alpha()<p.simulation.alphaMin());
});

test('angular gap planning treats manual roots as obstacles and steers other families without snapping',()=>{
    const p=crowded('sun',4),children=p.children.get('s'),parent=p.particles.get('s'),held=children[0],neighbor=children[1];
    held.x=parent.x+held.orbitRadius;held.y=parent.y;held.placement=p.influenceFor(held);
    neighbor.x=held.x+2;neighbor.y=held.y+2;
    const coordinates=p.ordered.map(n=>[n.id,n.x,n.y]),manual=plain(held.placement);
    p.placeFamilySectors(parent,true);
    assert.deepEqual(p.ordered.map(n=>[n.id,n.x,n.y]),coordinates,'gap planning changes targets, never coordinates');
    assert.deepEqual(plain(held.placement),manual);assert.equal(held.familyTravelAngle,null);
    assert.ok(neighbor.familyTravelAngle!=null,'an overlapping automatic neighbor gets a temporary route to a suitable gap');
    const target=neighbor.familyTravelAngle;neighbor.vx=neighbor.vy=0;p.attractToOrbits(.2);
    assert.ok(Math.abs(neighbor.vx)+Math.abs(neighbor.vy)>0,'temporary placement uses velocity guidance');
    neighbor.x=parent.x+Math.cos(target)*neighbor.orbitRadius;neighbor.y=parent.y+Math.sin(target)*neighbor.orbitRadius;
    p.attractToOrbits(.2);assert.equal(neighbor.familyTravelAngle,null,'arriving clears the target rather than locking an angular slot');
    p.beginDrag(neighbor.id);p.moveDrag(neighbor.id,parent.x+neighbor.orbitRadius,parent.y+40);p.endDrag(neighbor.id,true);
    assert.equal(neighbor.familyTravelAngle,null,'manual release overrides placement guidance');
});

test('angular family geometry accounts for both radial separation and full footprint',()=>{
    const p=crowded('sun',4),[a,b]=p.children.get('s');
    const small=p.familyAngularClearance(a,200,b,200);a.familyFootprint*=4;
    assert.ok(p.familyAngularClearance(a,200,b,200)>small);
    assert.equal(p.familyAngularClearance(a,200,b,1000),0,'non-overlapping radial territories need no angular exclusion');
    assert.equal(p.familyAngularClearance(a,10,b,10),Math.PI,'a footprint enclosing the parent cannot fit by changing angle alone');
});

test('an exhausted angular gap promotes only the families that cannot fit, with stable membership',()=>{
    const p=crowded('sun',4),parent=p.particles.get('s'),children=p.children.get('s');
    children.forEach(n=>{n.familyFootprint=140;});
    const coordinates=p.ordered.map(n=>[n.id,n.x,n.y]);p.placeFamilySectors(parent,true);
    assert.ok(children.some(n=>n.softBandIndex>0),'whole-family angular demand creates an outer band even with few immediate siblings');
    assert.ok(children.some(n=>n.softBandIndex===0),'families that fit keep their inner band');
    assert.ok(parent.softBands.length<=3);assert.deepEqual(p.ordered.map(n=>[n.id,n.x,n.y]),coordinates);
    const indices=children.map(n=>n.softBandIndex);p.placeFamilySectors(parent,true);
    assert.deepEqual(children.map(n=>n.softBandIndex),indices,'repeated gap searches do not oscillate membership');
});

test('an existing overlapping family receives a soft route without rewriting saved placement or reseeding coordinates',()=>{
    const p=make(plain(sample.build().entries).map(e=>({...e,seedLayout:true})));advance(p,500);
    const software=p.particles.get('sample-planet-0-0'),leaf=p.particles.get('sample-stress-planet-01');
    leaf.x=software.x+(software.familyFootprint+leaf.familyFootprint)*.8;leaf.y=software.y;
    leaf.lastX=leaf.x;leaf.lastY=leaf.y;leaf.vx=leaf.vy=0;
    const coordinates=p.ordered.map(n=>[n.id,n.x,n.y]),records=p.ordered.map(n=>({...n,seedLayout:false}));
    p.setGraph(records,new Map(),{reheat:.55});p.simulation.stop();
    assert.deepEqual(p.ordered.map(n=>[n.id,n.x,n.y]),coordinates,'loading an existing layout must not snap or reseed bodies');
    assert.ok(leaf.familyTravelAngle!=null,'existing overlap gets an angular route');
    advance(p,750);
    assert.ok(distance(software,leaf)>=(software.familyFootprint+leaf.familyFootprint)*.95,'the settled route clears a material full-family overlap');
    assert.equal(leaf.placement,null,'the derived route does not write manual placement metadata');
    assert.ok(p.simulation.alpha()<p.simulation.alphaMin());
});
test('family repulsion moves whole branches gently without pinned roots or fixed angles',()=>{
    const p=crowded('sun',4),a=p.children.get('s')[0],b=p.children.get('s')[1];advance(p,350);
    a.familyFootprint=100;b.familyFootprint=30;a.descendantCount=15;b.descendantCount=0;
    a.x=300;a.y=300;b.x=360;b.y=300;a.vx=a.vy=b.vx=b.vy=0;
    p.separateSiblings(.2);assert.ok(a.vx<0&&b.vx>0);assert.ok(Math.abs(b.vx)>Math.abs(a.vx),'lighter family yields more');
    assert.ok(Math.abs(a.vx)<1&&Math.abs(b.vx)<1);assert.equal(a.fx,null);assert.equal(b.fx,null);
    p.beginDrag(a.id);const held=a.x;p.separateSiblings(.2);assert.equal(a.x,held,'held drag bypasses family forces');p.endDrag(a.id,false);
});
test('full layout reservation is independent from shorter-range live family contact',()=>{
    const p=crowded('sun',2),parent=p.particles.get('s'),[a,b]=p.children.get('s');
    a.familyFootprint=400;b.familyFootprint=30;a.descendantCount=30;b.descendantCount=0;
    const full=a.familyFootprint+b.familyFootprint+p.familyGap(parent),live=p.familyLiveClearance(a,b,parent);
    assert.ok(live<full*.8);assert.ok(live>=a.radius+b.radius+p.collisionPadding(a)+p.collisionPadding(b));
    const reservation=plain({bands:parent.softBands,orbit:a.orbitRadius,footprint:a.familyFootprint});
    function impulse(distance){a.x=300;a.y=300;b.x=300+distance;b.y=300;a.vx=a.vy=b.vx=b.vy=0;p.separateSiblings(.5);return Math.abs(a.vx)+Math.abs(b.vx);}
    assert.equal(impulse((live+full)/2),0,'no extra force through the surrounding reserved area');
    const grazing=impulse(live*.99),overlap=impulse(live*.6);
    assert.ok(grazing>0&&grazing<.001,'contact ramps gently at the boundary');
    assert.ok(overlap>grazing&&overlap<=.6,'substantial overlap remains protected with the lower impulse cap');
    assert.deepEqual(plain({bands:parent.softBands,orbit:a.orbitRadius,footprint:a.familyFootprint}),reservation,'live tuning must not shrink layout reservations');
});

test('preferred territories shrink sharply from Sun through deep actual-parent detail',()=>{
    const p=fixture();
    const sun=p.particles.get('sample-sun-0'),planet=p.particles.get('sample-planet-0-0'),moon=p.particles.get('sample-moon-0-0-0');
    assert.ok(sun.childOrbit>planet.childOrbit*2);assert.ok(planet.childOrbit>moon.childOrbit*1.5);
    for(const id of ['sample-deep-5','sample-deep-6','sample-deep-7','sample-deep-8']) {
        const node=p.particles.get(id);assert.ok(node.orbitRadius<16);assert.ok(node.clusterAnchor.clusterRadius<45);
        assert.equal(node.parentId,id==='sample-deep-5'?'sample-satellite-2-0-0-0':`sample-deep-${Number(id.at(-1))-1}`);
    }
    advance(p,1000);separated(p.ordered);
    assert.ok(p.simulation.alpha()<p.simulation.alphaMin(),'tighter local bands must still settle');
});

test('Planet sectors are stable across input order and graph rebuilds; child bands remain local',()=>{
    const records=[{id:'g',seedLayout:true},{id:'s',parentId:'g',seedLayout:true},
        ...Array.from({length:4},(_,i)=>({id:`p${i}`,parentId:'s',seedLayout:true})),
        ...Array.from({length:4},(_,i)=>({id:`m${i}`,parentId:`p${i}`,seedLayout:true}))];
    const a=make(records),b=make([...records].reverse());
    for(let i=0;i<4;i++) {
        const planet=a.particles.get(`p${i}`),moon=a.particles.get(`m${i}`);
        assert.equal(planet.orbitAngle,b.particles.get(planet.id).orbitAngle);
        assert.equal(planet.orbitRadius,b.particles.get(planet.id).orbitRadius);
        assert.ok(moon.orbitRadius<planet.orbitRadius*.7);
    }
    const angles=a.children.get('s').map(p=>p.orbitAngle);a.buildSystems();
    assert.deepEqual(a.children.get('s').map(p=>p.orbitAngle),angles);
    advance(a,500);separated(a.ordered);
});

test('Sample descendants settle in their Planet territory and default forces cool',()=>{
    const p=fixture();advance(p,1000);
    for(const node of p.ordered.filter(n=>n.depth>=3)) {
        const planet=node.planetAnchor,sun=planet.parent;
        const axis=Math.atan2(planet.y-sun.y,planet.x-sun.x),angle=Math.atan2(node.y-sun.y,node.x-sun.x);
        const delta=Math.abs(Math.atan2(Math.sin(angle-axis),Math.cos(angle-axis)));
        assert.ok(delta<planet.sectorHalfAngle+.16,`${node.id} leaves its local territory: ${delta}`);
    }
    assert.ok(p.simulation.alpha()<p.simulation.alphaMin(),'ordinary families must stop requesting physics work');
});

test('CRUD graph refresh retains surviving positions/identity and supports restrained reheating',()=>{
    const p=family();advance(p,400);
    const before=new Map(p.ordered.map(n=>[n.id,{node:n,x:n.x,y:n.y,vx:n.vx,vy:n.vy}]));
    const data=p.ordered.map(({id,parentId,role,depth,x,y,sizeScale})=>({id,parentId,role,depth,x,y,sizeScale}));
    p.setGraph([...data,{id:'new',parentId:'t',role:'astronaut',depth:5,x:400,y:400,sizeScale:.5,seedLayout:true}],new Map(),{reheat:.12});
    p.simulation.stop();assert.equal(p.simulation.alpha(),.12);
    before.forEach((old,id)=>{const n=p.particles.get(id);assert.equal(n,old.node);assert.deepEqual([n.x,n.y,n.vx,n.vy],[old.x,old.y,old.vx,old.vy]);});
    p.setGraph(data,new Map(),{reheat:.12});p.simulation.stop();
    assert.equal(p.particles.has('new'),false);
    before.forEach((old,id)=>{const n=p.particles.get(id);assert.equal(n,old.node);assert.deepEqual([n.x,n.y],[old.x,old.y]);});
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
        // Compact neighboring families may need a few more cooling ticks after
        // the unchanged extreme-drop return force releases its alpha floor.
        if(p.simulation.alpha()>=p.simulation.alphaMin())advance(p,30);
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
    assert.ok(anchor.envelope<65 && p.particles.get('s').envelope<900,'deep chains use count-based detail footprints rather than summed path envelopes');
    separated(figures);assert.ok(p.simulation.alpha()<p.simulation.alphaMin());
});

test('Astronaut siblings separate locally and remain compact after an overlapping drop',()=>{
    const p=astronautFamily(8,true);advance(p,600);
    const a=p.particles.get('eva-0'),b=p.particles.get('eva-1'),anchor=p.particles.get('t');
    p.beginDrag(a.id);p.moveDrag(a.id,b.x,b.y);advance(p,12);p.endDrag(a.id,true);advance(p,700);
    const figures=p.ordered.filter(n=>n.role==='astronaut');separated(figures);
    assert.ok(distance(a,b)>a.radius+b.radius+3);
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
    assert.ok(distance(node,node.clusterAnchor)<node.clusterAnchor.manualClusterRadius+30);
    assert.ok(p.ordered.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
});
test('relative arrangement survives a graph rebuild and moves with its parent',()=>{
    const p=family();advance(p);const moon=p.particles.get('m');
    p.beginDrag('m');p.moveDrag('m',moon.parent.x-160,moon.parent.y+90);const placement=p.endDrag('m',true);advance(p);
    const data=p.ordered.map(({id,parentId,role,depth,x,y,sizeScale})=>({id,parentId,role,depth,x,y,sizeScale}));
    p.setGraph(data,new Map([['m',placement]]));advance(p);
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
    assert.ok(distance(planet,released)>.1,'release remains part of the force simulation rather than a fixed coordinate');
    assert.ok(distance(planet,sun)>planet.orbitRadius,'drag should still influence arrangement');
});
for(const [kind,aId,bId] of [['Planet','sample-planet-0-0','sample-planet-0-1'],['Moon','sample-moon-0-0-0','sample-moon-0-0-1'],['Satellite','sample-satellite-0-0-0-0','sample-satellite-0-0-0-1']]){
    test(`${kind} siblings separate after an overlapping drop while both remain movable`,()=>{
        const p=fixture();advance(p,400);const a=p.particles.get(aId),b=p.particles.get(bId);
        p.beginDrag(aId);p.moveDrag(aId,b.x,b.y);advance(p,12);p.endDrag(aId,true);advance(p,350);
        assert.equal(b.fx,null);assert.equal(a.parentId,b.parentId);
        assert.ok(distance(a,b)>=a.radius+b.radius+p.collisionPadding(a)+p.collisionPadding(b)-.5);assert.equal(a.fx,null);
    });
}
test('local sibling impulses do not enlarge or accelerate unrelated Galaxies',()=>{
    const p=fixture();advance(p);const parent=p.particles.get('sample-sun-0'),a=p.particles.get('sample-planet-0-0'),b=p.particles.get('sample-planet-0-1');
    p.ordered.forEach(n=>{n.vx=n.vy=0;});p.separateSiblings(.1);
    const unrelated=new Map(p.ordered.filter(n=>n.galaxyId!==parent.galaxyId).map(n=>[n.id,[n.vx,n.vy]]));
    p.ordered.forEach(n=>{n.vx=n.vy=0;});a.x=b.x=parent.x+180;a.y=parent.y;b.y=parent.y+40;
    const sizes=JSON.stringify([...p.galaxies.values()].map(g=>g.radius));p.separateSiblings(.1);
    assert.ok(a.vy<0&&b.vy>0);assert.ok(Math.abs(a.vx)<.0001);
    assert.ok(p.ordered.filter(n=>n.galaxyId!==parent.galaxyId).every(n=>n.vx===unrelated.get(n.id)[0]&&n.vy===unrelated.get(n.id)[1]));
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
    const data=p.ordered.map(n=>({...n,seedLayout:false}));p.setGraph(data,layout);advance(p);
    p.beginDrag('m');p.moveDrag('m',1500,-600);const moved=p.endDrag('m',true);advance(p,1000);
    assert.equal(moved.pinned,undefined);assert.equal(moon.fx,null);assert.ok(distance(moon,{x:1500,y:-600})>100);
    assert.ok(Math.abs(p.simulation.velocityDecay()-.42)<1e-12);
});
test('reparenting keeps stable particle identity, changes systems and clears obsolete influence',()=>{
    const p=family();advance(p);const moon=p.particles.get('m');moon.placement=p.influenceFor(moon);
    const data=p.ordered.map(({id,parentId,role,depth,x,y,sizeScale})=>({id,parentId,role,depth,x,y,sizeScale}));
    data.find(n=>n.id==='m').parentId='s';
    const entries=new Map(data.map(e=>[e.id,e]));model.normalizeHierarchy(entries);
    p.setGraph([...entries.values()],new Map([['m',moon.placement]]));advance(p);
    assert.equal(p.particles.get('m'),moon);assert.equal(moon.parentId,'s');assert.equal(moon.role,'planet');assert.equal(moon.placement,null);
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
    assert.ok(sparseSun.childOrbit<220);assert.ok(wideSun.softBands.at(-1).radius>sparseSun.childOrbit*1.5);
    assert.ok(sparse.ordered.filter(n=>n.depth===2).every(n=>distance(n,sparseSun)<300));
    separated(sparse.ordered);separated(wide.ordered);
});

for(const [kind,depth] of [['Moon',3],['Satellite',4]]){
    test(`${kind} spacing adapts from two to eight siblings with collision clearance`,()=>{
        const system=count=>make([...Array.from({length:depth},(_,i)=>({id:`n${i}`,parentId:i?`n${i-1}`:null,seedLayout:true})),
            ...Array.from({length:count},(_,i)=>({id:`child${i}`,parentId:`n${depth-1}`,seedLayout:true}))]);
        const sparse=system(2),wide=system(8);advance(sparse,450);advance(wide,450);
        const parent=`n${depth-1}`,a=sparse.particles.get(parent),b=wide.particles.get(parent);
        const outer=b.softBands?.at(-1).radius||b.childOrbit;
        assert.ok(outer>a.childOrbit*1.3);assert.ok(outer<150);
        for(const p of [sparse,wide]){
            const children=p.children.get(parent);children.forEach((a,i)=>children.slice(i+1).forEach(b=>assert.ok(distance(a,b)>a.radius+b.radius+12)));
            // The band has a dead zone; collisions still preserve its 24px clearance.
            assert.ok(children.every(n=>distance(n,n.parent)>n.radius+n.parent.radius+5));
        }
        separated(sparse.ordered);separated(wide.ordered);
    });
}

test('deep branches do not recursively enlarge their Sun orbital band',()=>{
    const p=fixture();advance(p,450);
    for(const system of p.systems.values()) assert.ok(system.root.childOrbit<450,system.id);
    const food=p.galaxies.get('sample-galaxy-1');
    assert.ok(distance(food.systems[0].root,food.systems[1].root)<food.root.envelope*1.1);
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
