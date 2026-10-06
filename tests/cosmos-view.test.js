const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { test } = require('node:test');
function load() { const context = vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(__dirname, '../cosmos-view.js'), 'utf8'), context); return vm.runInContext('cosmosView', context); }
const plain = value => JSON.parse(JSON.stringify(value));

test('Constellation lens keeps bodies distinct from labels and restores non-entry context through normal role fades', () => {
    const view = load(), roles = ['galaxy', 'sun', 'planet', 'moon', 'satellite', 'astronaut'];
    for (const role of roles) {
        assert.deepEqual(plain(view.constellationVisibility(.2, role, { member: true })), { body: 1, label: 0 });
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
    assert.equal(view.constellationVisibility(.6, 'moon').body, 0);
    assert.ok(view.constellationVisibility(.7, 'planet').body > view.constellationVisibility(.7, 'moon').body);
});

test('each zoom tier summarizes the intended hierarchy without residual body opacity', () => {
    const view = load();
    for (const [scale, tier, visible] of [[.10, 'universe', []], [.58, 'system', ['sun']], [.68, 'system', ['sun', 'planet']], [.80, 'close', ['sun', 'planet', 'moon', 'satellite']]]) {
        const detail = view.detail(scale);
        assert.equal(detail.tier, tier);
        for (const role of ['sun', 'planet', 'moon', 'satellite']) assert.equal(detail[role], visible.includes(role) ? 1 : 0);
    }
    assert.equal(view.detail(.3).guides, 0); assert.equal(view.detail(1.1).clouds, 0);
    assert.equal(view.detail(.5).tier, 'galaxy');
    assert.ok(view.detail(.72).moon > 0 && view.detail(.72).moon < 1);
    assert.ok(view.detail(.76).satellite > .7);
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
    assert.ok(view.detail(1.35).astronautLabel>0&&view.detail(1.35).astronautLabel<1);assert.equal(view.detail(1.52).astronautLabel,1);
    assert.deepEqual(plain(view.tiers),{galaxy:.45,system:.58,close:.78});
});
