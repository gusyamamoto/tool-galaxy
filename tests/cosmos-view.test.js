const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { test } = require('node:test');
function load() { const context = vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(__dirname, '../cosmos-view.js'), 'utf8'), context); return vm.runInContext('cosmosView', context); }
const plain = value => JSON.parse(JSON.stringify(value));

test('adjacent label envelopes share bounded smooth handoffs and leave dominant orientation bands',()=>{
    const view=load(),roles=Array.from(view.labelOrder);
    const maxStep=.001*1.5/Math.min(...view.labelHandoffs.map(([start,end])=>end-start))+1e-9;
    const plateaus=[[.02,'galaxy'],[.24,'galaxy'],[.6,'sun'],[1.3,'planet'],[2.4,'moon'],[4,'satellite'],[9,'astronaut']];
    for(const [scale,dominant] of plateaus){
        const d=view.detail(scale);
        for(const role of roles)assert.equal(d.labels[role].opacity,role===dominant?1:0,`${role} at ${scale}`);
    }
    view.labelHandoffs.forEach(([start,end],index)=>{
        const parent=roles[index],child=roles[index+1];
        for(const [scale,a,b] of [[start,1,0],[(start+end)/2,.5,.5],[end,0,1]]){
            assert.ok(Math.abs(view.labelDisclosure(parent,scale,'x')-a)<1e-12);
            assert.ok(Math.abs(view.labelDisclosure(child,scale,'x')-b)<1e-12);
        }
        assert.equal(view.labelDisclosure(child,start-.001,'x'),0,'no early child crowding');
        assert.equal(view.labelDisclosure(parent,end+.001,'x'),0,'no persistent parent floor');
    });
    for(let scale=.001;scale<12;scale+=.003){
        const detail=view.detail(scale),visible=roles.filter(r=>detail.labels[r].opacity>0);
        assert.ok(visible.length<=2,'only adjacent orientation layers overlap');
        if(visible.length===2)assert.equal(roles.indexOf(visible[1])-roles.indexOf(visible[0]),1);
        assert.ok(Math.abs(roles.reduce((sum,r)=>sum+detail.labels[r].opacity,0)-1)<1e-12);
        for(const role of roles){
            const value=view.labelDisclosure(role,scale,'test',detail);
            assert.ok(value>=0&&value<=1);
            assert.equal(value,view.labelDisclosure(role,scale,'another-id'),'ordinary timing belongs to the layer, not the individual name');
            assert.ok(Math.abs(value-view.labelDisclosure(role,scale+.001,'test'))<maxStep,'smoothstep slope stays bounded across band edges');
        }
    }
    assert.deepEqual(plain(view.tiers),{galaxy:.45,system:.58,close:.78});
    assert.equal(view.labelDisclosure('sun',view.tiers.system,'x'),1);
    assert.ok(view.labelDisclosure('planet',view.tiers.close,'x')>0);
});

test('Galaxy yields sooner while earlier Planet emergence stays secondary and deeper envelopes remain unchanged',()=>{
    const view=load(),opacity=(role,s)=>view.labelDisclosure(role,s,'x');
    assert.equal(opacity('galaxy',.24),1);
    assert.ok(opacity('galaxy',.30)<1&&opacity('sun',.30)>0);
    assert.equal(opacity('galaxy',.42),0);
    assert.equal(opacity('sun',.42),1);
    assert.equal(opacity('sun',.6),1);
    assert.equal(opacity('planet',.64),0);
    assert.ok(opacity('planet',.70)>0&&opacity('planet',.70)<.05,'new earlier emergence is subtle');
    assert.ok(opacity('planet',.78)>0&&opacity('planet',.78)<.25);
    assert.ok(opacity('planet',.84)>.18&&opacity('planet',.84)<.5,'useful earlier without taking over');
    assert.ok(opacity('sun',.84)>opacity('planet',.84));
    assert.equal(opacity('planet',1.12),1);
    assert.equal(opacity('planet',1.60),1);
    assert.deepEqual(plain(view.labelHandoffs.slice(2)),[[1.60,2.10],[2.70,3.60],[5,7]]);
});

test('semantic strength ranks names before density suppression, while explicit context stays first',()=>{
    const view=load();
    for(let scale=.01;scale<10;scale+=.01){
        const d=view.detail(scale);
        for(const a of view.labelOrder)for(const b of view.labelOrder){
            assert.ok(d.labels[a].priority>=4);
            if(d.labels[a].opacity>d.labels[b].opacity+.001)assert.ok(d.labels[a].priority<d.labels[b].priority);
        }
    }
});

test('reverse and rapidly changing zoom evaluate exactly the same stateless envelopes',()=>{
    const view=load(),scales=Array.from({length:180},(_,i)=>.02+i*.05);
    const expected=new Map(scales.map(scale=>[scale,JSON.stringify(view.detail(scale).labels)]));
    for(const scale of [...scales,...scales.slice().reverse(),.24,7,.4,2,.31,9,.6]){
        const detail=JSON.stringify(view.detail(scale).labels);
        assert.equal(detail,expected.get(scale)??JSON.stringify(load().detail(scale).labels));
    }
});

test('deep tether staggering and established Constellation lens remain independent of ordinary envelopes',()=>{
    const view=load(),id='sample-stress-astronaut-00';
    assert.equal(view.deepTetherOpacity(1.8,id),0);assert.equal(view.deepTetherOpacity(12,id),.14);
    assert.equal(view.deepTetherOpacity(.9,id,true),.25);
    assert.equal(view.constellationVisibility(1.6,'astronaut',{member:true}).label,1);
    assert.equal(view.constellationVisibility(.8,'sun',{priority:true}).label,1);
    assert.equal(view.labelDisclosure('astronaut',4,id),0);
    assert.equal(view.labelDisclosure('satellite',9,id),0);
});

test('only a decreasing user-owned zoom in overview releases focus, with no automatic re-selection rule',()=>{
    const view=load();
    assert.equal(view.releasesOverviewSelection(.45,.46,'user-zoom'),true);
    assert.equal(view.releasesOverviewSelection(.2,.21,'user-zoom'),true);
    for(const source of ['programmatic','navigation',undefined])assert.equal(view.releasesOverviewSelection(.2,1,source),false);
    assert.equal(view.releasesOverviewSelection(.451,.5,'user-zoom'),false);
    assert.equal(view.releasesOverviewSelection(.46,.44,'user-zoom'),false);
    assert.equal(view.releasesOverviewSelection(.44,.44,'user-zoom'),false);
});

test('screen diameters plateau independently by role while semantic detail keeps revealing', () => {
    const view = load(), sizes = { sun: 52, planet: 28.6, moon: 13.52, satellite: 9.88, astronaut: 7.28 };
    const caps = { sun: 100, planet: 32, moon: 16, satellite: 12, astronaut: 8 };
    for (const [role, diameter] of Object.entries(sizes)) {
        assert.equal(view.renderedDiameter(role, diameter, 1), Math.min(caps[role],diameter*(view.visualScale[role]||1)));
        assert.equal(view.renderedDiameter(role, diameter, 3), caps[role]);
        assert.equal(view.renderedDiameter(role, diameter, 100), view.inspectionCaps[role]||caps[role]);
        let previous = 0;
        for (let scale = .1; scale < 3; scale += .01) {
            const size = view.renderedDiameter(role, diameter, scale, view.detail(scale)[role]);
            assert.ok(size >= previous && size <= caps[role]); previous = size;
        }
    }
    assert.equal(view.detail(1.6).astronautLabel, 0);
});

test('detail inspection scales smoothly without changing normal caps or larger roles',()=>{
    const view=load();
    for(const [role,normal,close] of [['satellite',12,26],['astronaut',8,14]]){
        for(const scale of [.1,1,1.8,2.4,3])assert.equal(view.renderCap(role,scale),normal);
        assert.equal(view.renderCap(role,6),(normal+close)/2);assert.equal(view.renderCap(role,9),close);assert.equal(view.renderCap(role,12),close);
        assert.ok(Math.abs(view.renderCap(role,3.0001)-normal)<.00001);
        assert.ok(Math.abs(view.renderCap(role,8.9999)-close)<.00001);
        let previous=normal;
        for(let scale=3;scale<=12;scale+=.03){const cap=view.renderCap(role,scale);assert.ok(cap>=previous&&cap<=close);previous=cap;}
        assert.equal(view.bodyCaps[role],normal,'inspection must not rewrite normal visual caps');
    }
    for(const role of ['sun','planet','moon'])for(const scale of [1,3,6,9,12])assert.equal(view.renderCap(role,scale),view.bodyCaps[role]);
    for(const scale of [1.8,3,6,9,12])assert.ok(view.renderCap('satellite',scale)>view.renderCap('astronaut',scale));
});

test('Constellation lens keeps bodies distinct from labels and restores non-entry context through normal role fades', () => {
    const view = load(), roles = ['galaxy', 'sun', 'planet', 'moon', 'satellite', 'astronaut'];
    for (const role of roles) {
        const label=role==='sun'?view.detail(.2).sunLabel:role==='planet'?view.detail(.2).planetLabel:0;
        assert.deepEqual(plain(view.constellationVisibility(.2, role, { member: true })), { body: 1, label });
        assert.deepEqual(plain(view.constellationVisibility(.2, role)), { body: 0, label: 0 });
        assert.deepEqual(plain(view.constellationVisibility(.2, role, { priority: true })), { body: 1, label: 1 });
        let previous = 0;
        for (let scale = .2; scale <= 1.2; scale += .01) {
            const normal = role === 'galaxy' ? 1 : view.detail(scale)[role], lens = view.constellationVisibility(scale, role);
            assert.ok(lens.body <= normal); assert.ok(lens.body >= previous); previous = lens.body;
            assert.equal(view.constellationVisibility(scale, role, { member: true }).body, 1);
        }
        assert.equal(view.constellationVisibility(1.2, role).body, .78);
    }
    assert.ok(view.constellationVisibility(.6, 'sun').body > 0);
    assert.equal(view.constellationVisibility(.6, 'planet').body > 0, true);
    assert.ok(view.constellationVisibility(.4, 'planet').body > view.constellationVisibility(.4, 'moon').body);
});

test('overview keeps Suns and Planets present while deeper roles remain selective', () => {
    const view = load();
    for (const [scale, tier] of [[.02,'universe'],[.10,'universe'],[.58,'system'],[.68,'system'],[.80,'close']]) {
        const detail = view.detail(scale);
        assert.equal(detail.tier, tier);
        assert.ok(detail.sun>=.82&&detail.sun<=1);assert.ok(detail.planet>=.58&&detail.planet<=1);
        assert.equal(detail.clouds,0,'normal presentation never substitutes cloud artwork');
    }
    assert.equal(view.detail(.1).moon,0);assert.ok(view.detail(.3).moon>0&&view.detail(.3).moon<1);
    assert.equal(view.detail(.55).moon,1);assert.equal(view.detail(.68).satellite,0);
    assert.equal(view.detail(.3).guides, 0); assert.equal(view.detail(1.1).clouds, 0);
    assert.equal(view.detail(.5).tier, 'galaxy');
    assert.ok(view.detail(.76).satellite > .7);
});

test('overview diameter floors and Galaxy root are continuous without enlarging close bodies',()=>{
    const view=load();
    assert.equal(view.renderedDiameter('sun',52,.001,view.detail(.001).sun),6);
    assert.equal(view.renderedDiameter('planet',28.6,.001,view.detail(.001).planet),2.5);
    let last={};
    for(let scale=.001;scale<=1.2;scale+=.001){
        const values={galaxy:view.galaxyDiameter(scale),sun:view.renderedDiameter('sun',52,scale,view.detail(scale).sun),planet:view.renderedDiameter('planet',28.6,scale,view.detail(scale).planet)};
        for(const [role,size] of Object.entries(values)){assert.ok(size>0&&size>=(last[role]||0));if(last[role])assert.ok(size-last[role]<.2);}
        last=values;
    }
    assert.equal(view.galaxyDiameter(.001),14);assert.equal(view.galaxyDiameter(1),22);
    assert.equal(view.renderedDiameter('sun',52,1),78);assert.equal(view.renderedDiameter('planet',28.6,1),32);
});

test('body, label and cloud fades are continuous at tier boundaries and monotonic while zooming out', () => {
    const view = load();
    for (const boundary of Object.values(view.tiers)) {
        const before = view.detail(boundary - .00001), after = view.detail(boundary + .00001);
        for (const name of Object.keys(view.fades)) assert.ok(Math.abs(before[name] - after[name]) < .001);
    }
    let previous = view.detail(2);
    for (let scale = 1.99; scale >= 0; scale -= .01) {
        const detail = view.detail(scale);
        for (const role of ['sun', 'planet', 'moon', 'satellite']) assert.ok(detail[role] <= previous[role]);
        assert.ok(detail.clouds >= previous.clouds); previous = detail;
    }
});

test('region includes actual systems and stretched descendants with soft margin', () => {
    const view = load(), root = { x: 100, y: 200 };
    const members = [{ x: -700, y: 100, radius: 31 }, { x: 2600, y: 1100, radius: 31 }, { x: 3400, y: -650, radius: 10 }];
    const region = view.regionTarget(root, members), cx = root.x + region.offsetX, cy = root.y + region.offsetY;
    for (const member of members) {
        assert.ok(Math.abs(member.x - cx) + member.radius < region.width / 2 * .8);
        assert.ok(Math.abs(member.y - cy) + member.radius < region.height / 2 * .8);
    }
    assert.ok(region.width > 3400); assert.ok(region.width < 6000);
});

test('region translates with its Galaxy without resizing or mutating particles', () => {
    const view = load(), root = { x: 0, y: 0 }, members = [{ x: 300, y: 200, radius: 30 }];
    const original = JSON.stringify(members), before = view.regionTarget(root, members);
    const moved = view.regionTarget({ x: 1000, y: -600 }, members.map(node => ({ ...node, x: node.x + 1000, y: node.y - 600 })));
    assert.deepEqual(plain(before), plain(moved)); assert.equal(JSON.stringify(members), original);
});

test('small settled movement does not make a cloud pulse, while a larger footprint eases without overshoot', () => {
    const view = load(), root = { x: 0, y: 0 }, members = [{ x: 500, y: 100, radius: 30 }];
    const initial = view.regionTarget(root, members);
    let region = view.updateRegion(null, initial, 16);
    for (let i = 0; i < 100; i++) region = view.updateRegion(region, view.regionTarget(root, [{ ...members[0], x: 500 + Math.sin(i) }]), 16);
    assert.equal(region.width, initial.width); assert.equal(region.offsetX, initial.offsetX);
    const grown = view.regionTarget(root, [{ ...members[0], x: 1300 }]);
    let last = region.width;
    for (let i = 0; i < 100; i++) { region = view.updateRegion(region, grown, 16); assert.ok(region.width >= last && region.width <= grown.width); last = region.width; }
    assert.ok(region.width > grown.width * .9);
});

test('empty Galaxy still has a readable finite region', () => {
    const region = load().regionTarget({ x: 17, y: 25 }, []);
    assert.equal(region.offsetX, 0); assert.equal(region.offsetY, 0);
    assert.ok(region.width >= 320 && region.height >= 280);
});

test('a distant Sun or deep dragged branch has bounded influence on its cloud', () => {
    const view = load(), root = { id: 'g', x: 0, y: 0, depth: 0 };
    const sun = { id: 's', x: 200, y: 0, depth: 1, parent: root, radius: 31, orbitRadius: 200, envelope: 160 };
    const planet = { id: 'p', x: 300, y: 0, depth: 2, parent: sun, radius: 23, orbitRadius: 100 };
    const initial = view.regionTarget(root, [sun, planet]);
    planet.x = 100000;
    const stretched = view.regionTarget(root, [sun, planet]);
    assert.ok(stretched.width < initial.width * 1.5);
    assert.equal(planet.x, 100000, 'presentation must never change physics');
    sun.x = 100000;
    assert.ok(view.regionTarget(root, [sun, planet]).width < 1500);
});

test('clouds fade early and smoothly while viewport pressure leaves Universe identity strong', () => {
    const view = load(), large={left:0,right:1400,top:0,bottom:1000}, small={left:260,right:850,top:40,bottom:700};
    const footprint={width:1800,height:1200,offsetX:0,offsetY:0};
    assert.equal(view.cloudOpacity(.2,large,footprint),.92);
    assert.equal(view.cloudOpacity(.2,small,footprint),.92);
    assert.ok(view.cloudOpacity(.58,large,footprint)<.15);
    assert.ok(view.cloudOpacity(.68,large,footprint)<.005);
    assert.equal(view.cloudOpacity(.78,small,footprint),0);
    assert.ok(view.cloudOpacity(.52,small,footprint)<view.cloudOpacity(.52,large,footprint));
    assert.ok(view.cloudOpacity(.52,large,{width:5000,height:4000})<view.cloudOpacity(.52,large,{width:400,height:300}));
    for (const viewport of [large,small]) {
        let previous=.92;
        for(let scale=.2;scale<1;scale+=.001) {
            const opacity=view.cloudOpacity(scale,viewport,footprint);
            assert.ok(opacity<=previous+1e-12 && previous-opacity<.012,'monotonic continuous fade');
            previous=opacity;
        }
    }
    assert.equal(view.cloudOpacity(.52,small,footprint),view.cloudOpacity(.52,small,{...footprint,offsetX:10000,offsetY:-10000}));
});

test('responsive opacity inherits the footprint dead band, so normal floating does not pulse',()=>{
    const view=load(),root={x:0,y:0},viewport={left:260,right:850,top:40,bottom:700};
    let region=view.updateRegion(null,view.regionTarget(root,[{x:500,y:100,radius:30}]),16);
    const opacity=view.cloudOpacity(.52,viewport,region);
    for(let i=0;i<100;i++) {
        region=view.updateRegion(region,view.regionTarget(root,[{x:500+Math.sin(i),y:100,radius:30}]),16);
        assert.equal(view.cloudOpacity(.52,viewport,region),opacity);
    }
});

test('Astronauts and tethers extend detail fades without changing existing tier boundaries',()=>{
    const view=load();
    assert.equal(view.detail(.58).astronaut,0);assert.equal(view.detail(.58).tethers,0);
    assert.ok(view.detail(.8).astronaut>0 && view.detail(.8).astronaut<1);
    assert.equal(view.detail(.78).tethers,0);
    assert.equal(view.detail(.96).astronaut,1);assert.equal(view.detail(.96).astronautLabel,0);assert.equal(view.detail(.96).tethers,1);
    assert.ok(view.detail(5).astronautLabel>0&&view.detail(5).astronautLabel<1);assert.equal(view.detail(8).astronautLabel,1);
    assert.deepEqual(plain(view.tiers),{galaxy:.45,system:.58,close:.78});
});
