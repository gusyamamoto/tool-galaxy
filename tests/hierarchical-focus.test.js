const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { test } = require('node:test');
const plain = value => JSON.parse(JSON.stringify(value));
const desktop = { left: 280, right: 1240, top: 60, bottom: 800 };
const phone = { left: 12, right: 348, top: 72, bottom: 748 };
const roles = ['galaxy', 'sun', 'planet', 'moon', 'satellite', 'astronaut'];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('camera/viewport/Fit changes preserve the entered world geometry and body proportions',()=>{
    const f=make(family({a:20,deepA:20}));f.enter('a',1.5);
    const layout=f.focus.layout,points=plain([...f.focus.projection]);
    for(const scale of [.2,.6,1,1.5,2,3,1.5]){
        f.clock.value+=16;f.frame(scale,{...desktop,right:desktop.right-230});
        assert.equal(f.focus.layout,layout);assert.deepEqual(plain([...f.focus.projection]),points);
    }
    const child=f.entries.get('a-child-000');
    const first=f.focus.diameter(child,13.52,desktop,1),second=f.focus.diameter(child,13.52,desktop,2);
    assert.ok(Math.abs(second/first-2)<.001,'camera magnifies the same child, not only its orbital distance');
});

test('local dragging retains a bounded parent-relative preference through re-entry',()=>{
    const f=make(family({a:4}));f.enter('a',1.5);
    const id='a-child-000',node=f.particles.get(id);node.orbitRadius=100;
    const original={...f.focus.point(node)};
    f.focus.captureDrag(id);node.x+=50;node.y-=35;f.frame(1.5);
    const held={...f.focus.point(node)},placement=f.focus.releaseDrag(id);
    assert.ok(placement&&placement.parentId==='a');node.placement=placement;
    f.clock.value+=700;f.frame(1.5);const settled={...f.focus.point(node)};
    assert.ok(distance(settled,held)<25);assert.ok(distance(settled,original)>30,'release respects intentional placement');
    const anchor={...f.focus.anchorPoint()},relative={x:settled.x-anchor.x,y:settled.y-anchor.y};
    f.enter('s');f.enter('a');const restored={...f.focus.point(node)},newAnchor=f.focus.anchorPoint();
    assert.ok(distance({x:restored.x-newAnchor.x,y:restored.y-newAnchor.y},relative)<.001);
    f.frame(.2);f.frame(3);assert.ok(distance(f.focus.point(node),restored)<.001);
});

test('Satellite has a distinct size hierarchy above its Astronaut children',()=>{
    const f=make([{id:'g',depth:0},{id:'s',parentId:'g',depth:1},{id:'p',parentId:'s',depth:2},{id:'m',parentId:'p',depth:3},
        {id:'sat',parentId:'m',depth:4},{id:'ast',parentId:'sat',depth:5}]);f.enter('m',1.5);
    for(const scale of [.8,1.5,3,8]){
        f.frame(scale);const sat=f.focus.diameter(f.entries.get('sat'),10,desktop,scale),ast=f.focus.diameter(f.entries.get('ast'),7,desktop,scale);
        assert.ok(sat/ast>=1.5&&sat/ast<=2.1);assert.ok(sat<=120&&ast<=60);
    }
});

test('existing v5 angle/radius preferences reproduce a manual local arrangement after reload',()=>{
    const records=family({a:5}),f=make(records);f.enter('a');const id='a-child-002',p=f.particles.get(id);p.orbitRadius=100;
    f.focus.captureDrag(id);p.x-=45;p.y+=35;f.frame(1.5);p.placement=f.focus.releaseDrag(id);f.clock.value+=700;f.frame(1.5);
    const relative=()=>{const a=f.focus.anchorPoint(),b=f.focus.point(f.entries.get(id));return {x:b.x-a.x,y:b.y-a.y};};
    const saved=JSON.parse(JSON.stringify(p.placement)),copy=make(records);copy.particles.get(id).orbitRadius=100;copy.particles.get(id).placement=saved;copy.enter('a');
    const a=copy.focus.anchorPoint(),b=copy.focus.point(copy.entries.get(id));assert.ok(distance(relative(),{x:b.x-a.x,y:b.y-a.y})<.001);
    assert.deepEqual(Object.keys(saved).sort(),['angle','parentId','radius']);
});

function make(records, { duration = 420 } = {}) {
    const context = vm.createContext({ performance });
    for (const file of ['cosmos-view.js', 'local-layout.js', 'hierarchical-focus.js'])
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    const Focus = vm.runInContext('HierarchicalFocus', context), clock = { value: 0 };
    const entries = new Map(records.map((record, index) => [record.id, {
        name: record.id, role: roles[Math.min(record.depth || 0, roles.length - 1)],
        x: 400 + index * 13, y: 380 + index * 7, ...record
    }]));
    const particles = new Map([...entries].map(([id, entry]) => [id, { ...entry }]));
    const focus = new Focus({ duration, now: () => clock.value }); focus.rebuild(entries);
    function frame(scale = 2, bounds = desktop, options = {}) {
        return focus.frame(particles, bounds, scale, { now: clock.value, ...options });
    }
    function enter(id, scale = 2, bounds = desktop, options = {}) {
        focus.enter(id); frame(scale, bounds, options);
        clock.value += duration + 1; frame(scale, bounds, options);
        return entries.get(id);
    }
    return { focus, entries, particles, clock, frame, enter };
}
function family({ a = 4, b = 4, deepA = 0, deepB = 0 } = {}) {
    const records = [{ id: 'g', depth: 0 }, { id: 's', parentId: 'g', depth: 1 },
        { id: 'a', parentId: 's', depth: 2 }, { id: 'b', parentId: 's', depth: 2 }];
    for (const [parent, count, deep] of [['a', a, deepA], ['b', b, deepB]]) {
        for (let index = 0; index < count; index++)
            records.push({ id: `${parent}-child-${String(index).padStart(3, '0')}`, parentId: parent, depth: 3 });
        for (let index = 0; index < deep; index++)
            records.push({ id: `${parent}-deep-${String(index).padStart(3, '0')}`,
                parentId: `${parent}-child-${String(index % count).padStart(3, '0')}`, depth: 4 });
    }
    return records;
}

test('camera frames and panning alone cannot steal the semantic anchor', () => {
    const f = make(family({ a: 12, b: 12, deepA: 60, deepB: 60 })); f.enter('a');
    const originalLayout = f.focus.layout;
    for (const scale of [.08, .3, .77, 1.25, 3, .78, .76, 2]) {
        f.clock.value += 16; f.frame(scale, { ...desktop, left: desktop.left + 100, right: desktop.right + 100 });
        assert.equal(f.focus.anchorId, 'a');
        assert.equal(f.focus.layout, originalLayout, 'ordinary camera frames must not reallocate child sectors');
    }
});

test('Sun focus resolves immediate Planets while both sibling descendant systems remain suppressed', () => {
    const f = make(family({ a: 25, b: 25, deepA: 50, deepB: 50 })); f.enter('s');
    assert.equal(f.focus.visibility(f.entries.get('s')).body, 1);
    for (const id of ['a', 'b']) {
        const visible = f.focus.visibility(f.entries.get(id));
        assert.equal(visible.body, 1); assert.ok(visible.label > .5);
    }
    for (const entry of f.entries.values()) if (entry.depth >= 3) {
        const visible = f.focus.visibility(entry);
        assert.equal(visible.body, 0); assert.equal(visible.label, 0);
    }
});

test('deep hints count subtrees without creating one marker per descendant and cap local hint owners', () => {
    const f = make(family({ a: 50, b: 50, deepA: 98, deepB: 98 })); f.enter('s');
    const hint = f.focus.hints(f.entries.get('a'));
    assert.equal(hint.id, 'a'); assert.equal(hint.count, 148);
    assert.equal(hint.mode, 'density'); assert.equal(hint.beads, 1);
    const systemHints = f.focus.hintDescriptors();
    assert.equal(systemHints.length, 2); assert.ok(systemHints.every(item => item.id === 'a' || item.id === 'b'));
    assert.equal(f.focus.hints(f.entries.get('a-deep-000')), null);
    f.enter('a');
    const localHints = f.focus.hintDescriptors();
    assert.ok(localHints.length > 0 && localHints.length <= 16);
    for (const item of localHints) {
        assert.equal(f.entries.get(item.id).parentId, 'a');
        assert.ok(item.beads > 0 && item.beads <= 3); assert.ok(item.count >= item.beads);
    }
});

test('free exploration retains far Galaxy structure and never reveals an entire deep tree at once', () => {
    const f = make(family({ a: 50, b: 50, deepA: 98, deepB: 98 }));
    f.frame(.1);
    assert.equal(f.focus.anchorId, null);
    assert.equal(f.focus.visibility(f.entries.get('g')).body, 1);
    assert.equal(f.focus.visibility(f.entries.get('g')).label, 1);
    for (const entry of f.entries.values()) if (entry.depth >= 2) {
        assert.equal(f.focus.visibility(entry).body, 0);
        assert.equal(f.focus.visibility(entry).label, 0);
    }
    f.frame(3);
    assert.ok(f.focus.visibility(f.entries.get('s')).body > 0);
    assert.ok(f.focus.visibility(f.entries.get('a')).body > 0);
    for (const entry of f.entries.values()) if (entry.depth >= 3) {
        assert.equal(f.focus.visibility(entry).body, 0);
        assert.equal(f.focus.visibility(entry).label, 0);
    }
    const priority = f.focus.visibility(f.entries.get('a-deep-000'), { priority: true });
    assert.equal(priority.body, 1); assert.equal(priority.label, 1);
});

test('switching dense sibling anchors reveals only the new local family and never changes membership', () => {
    const f = make(family({ a: 50, b: 50, deepA: 98, deepB: 98 }));
    const before = JSON.stringify([...f.entries]); assert.equal(f.entries.size, 300);
    for (const [anchorId, other] of [['a', 'b'], ['b', 'a'], ['a', 'b']]) {
        f.enter(anchorId); assert.equal(f.focus.anchorId, anchorId);
        assert.equal(f.focus.layout.positions.size, 50);
        for (const entry of f.entries.values()) {
            const visible = f.focus.visibility(entry);
            if (entry.parentId === anchorId) assert.equal(visible.body, 1);
            if (entry.parentId === other || entry.depth >= 4) {
                assert.equal(visible.body, 0); assert.equal(visible.label, 0);
            }
        }
    }
    assert.equal(JSON.stringify([...f.entries]), before);
});

test('focus projection and fitting never rewrite saved entries or particle coordinates', () => {
    const f = make(family({ a: 50, b: 10, deepA: 100, deepB: 20 }));
    const beforeEntries = JSON.stringify([...f.entries]), beforeParticles = JSON.stringify([...f.particles]);
    for (const entry of f.entries.values()) Object.freeze(entry);
    for (const particle of f.particles.values()) Object.freeze(particle);
    f.enter('a');
    const anchor = f.entries.get('a'), child = f.entries.get('a-child-000');
    assert.deepEqual(plain(f.focus.point(anchor)), { x: anchor.x, y: anchor.y });
    assert.ok(distance(f.focus.point(child), anchor) >= f.focus.layout.innerRadius);
    assert.ok(distance(f.focus.point(child), child) > 20, 'the local field must be presentation coordinates');
    for (const scale of [.2, .6, 1, 2, 3]) f.frame(scale);
    f.focus.bounds();
    assert.equal(JSON.stringify([...f.entries]), beforeEntries);
    assert.equal(JSON.stringify([...f.particles]), beforeParticles);
});

test('deep detail navigation stays in its Moon context without limiting the data hierarchy', () => {
    const records = Array.from({ length: 12 }, (_, depth) => ({ id: `deep-${depth}`,
        parentId: depth ? `deep-${depth - 1}` : null, depth }));
    const f = make(records); f.enter('deep-8');
    assert.equal(f.focus.anchorId, 'deep-3'); assert.equal(f.focus.layout.positions.size, 8);
    assert.equal(f.focus.visibility(f.entries.get('deep-8')).body, 1);
    assert.equal(f.focus.visibility(f.entries.get('deep-9')).body, 1);
    for (const id of ['deep-10', 'deep-11']) assert.equal(f.focus.visibility(f.entries.get(id)).body, 1);
    assert.equal(f.entries.get('deep-8').role, 'astronaut');
    const layout=f.focus.layout;f.enter('deep-9'); assert.equal(f.focus.layout.positions.has('deep-10'), true);
    assert.equal(f.focus.layout,layout);assert.equal(f.focus.inspectionId,'deep-9');
    assert.equal(f.entries.get('deep-10').parentId, 'deep-9');
});

test('a 300-level data hierarchy remains accessible inside maximum Moon depth with bounded disclosure', () => {
    const records = Array.from({ length: 300 }, (_, depth) => ({ id: `deep-${depth}`,
        parentId: depth ? `deep-${depth - 1}` : null, depth }));
    const f = make(records); f.enter('deep-250');
    assert.equal(f.focus.hints(f.entries.get('deep-0')).count, 299);
    assert.equal(f.focus.hints(f.entries.get('deep-250')).count, 49);
    assert.equal(f.focus.anchorId,'deep-3');assert.equal(f.focus.layout.positions.size, 296);
    assert.equal(f.focus.visibility(f.entries.get('deep-250')).body, 1);
    assert.equal(f.focus.visibility(f.entries.get('deep-251')).body, 0);
    assert.equal(f.focus.visibility(f.entries.get('deep-252')).body, 0);
    assert.ok(f.focus.hintDescriptors().length<=16);
    assert.ok([...f.focus.projection.values()].every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
});

test('focused bodies grow substantially while viewport caps preserve useful phone space', () => {
    const f = make(family()); const item = f.enter('a');
    const large = f.focus.diameter(item, 28.6, desktop, f.focus.nominalScale(item,desktop));
    assert.ok(large > 200 && large <= 740*.7);
    const small = f.focus.diameter(item, 28.6, phone, f.focus.nominalScale(item,phone,true), { mobile: true });
    assert.ok(small > 100 && small <= 260); assert.ok(small < large);
    assert.ok(f.focus.diameter(item, 28.6, desktop, .25) < large,
        'Fit at lower scale must shrink the body alongside its world territory');
    assert.ok(f.focus.diameter(f.entries.get('a-child-000'), 13.52, desktop, 2) < large / 3);
});

for (const count of [50, 100]) {
    test(`${count} immediate children use expanded multi-band territory and Fit covers their projection`, () => {
        const f = make(family({ a: count, b: 3 })); f.enter('a');
        const anchor = f.entries.get('a'), bounds = f.focus.bounds();
        assert.equal(f.focus.layout.positions.size, count);
        assert.ok(f.focus.layout.rings.length >= 3);
        assert.ok(f.focus.layout.radius > 300 && f.focus.layout.radius < 600);
        assert.ok(bounds.left < anchor.x && bounds.right > anchor.x && bounds.top < anchor.y && bounds.bottom > anchor.y);
        for (const child of f.entries.values()) if (child.parentId === anchor.id) {
            const point = f.focus.point(child);
            assert.ok(point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom);
        }
    });
}

test('Constellation members outside a local family remain restrained while selected/search priorities survive', () => {
    const f = make(family({ deepA: 5, deepB: 5 })); f.enter('a');
    const outsider = f.entries.get('b-deep-000');
    const member = f.focus.visibility(outsider, { member: true });
    assert.ok(member.body > 0 && member.body <= .22); assert.equal(member.label, 0);
    const priority = f.focus.visibility(outsider, { priority: true, member: true });
    assert.equal(priority.body, 1); assert.equal(priority.label, 1);
    assert.equal(f.focus.anchorId, 'a');
});

test('reduced motion resolves focus immediately and normal transitions reach a stable endpoint', () => {
    const f = make(family()); f.focus.enter('a');
    f.frame(2); const initial = f.focus.progress;
    assert.ok(initial >= 0 && initial < 1);
    f.clock.value = 210; f.frame(2); assert.ok(f.focus.progress > initial && f.focus.progress < 1);
    f.clock.value = 421; f.frame(2); assert.equal(f.focus.progress, 1);
    f.focus.enter('b'); f.frame(2, desktop, { reducedMotion: true });
    assert.equal(f.focus.progress, 1); assert.equal(f.focus.anchorId, 'b');
});

test('rapidly changing anchors starts each transition at the currently displayed coordinates', () => {
    const f = make(family()); f.enter('a');
    const target = f.entries.get('b-child-000'), initial = { ...f.focus.point(target) };
    f.focus.enter('b'); f.frame(2);
    assert.ok(distance(f.focus.point(target), initial) < .001);
    f.clock.value += 160; f.frame(2); const intermediate = { ...f.focus.point(target) };
    f.focus.enter('s'); f.frame(2);
    assert.ok(distance(f.focus.point(target), intermediate) < .001);
    f.clock.value += 500; f.frame(2);
    assert.equal(f.focus.anchorId, 's'); assert.equal(f.focus.progress, 1);
});

test('exiting to the Universe clears ownership immediately and smoothly returns projection and hero size', () => {
    const f = make(family()); const anchor = f.enter('a'), child = f.entries.get('a-child-000');
    const from = { ...f.focus.point(child) }, canonical = f.particles.get(child.id);
    const hero = f.focus.diameter(anchor, 28.6, desktop, 2);
    f.focus.clear(); f.frame(2);
    assert.equal(f.focus.anchorId, null); assert.equal(f.focus.bounds(), null);
    assert.equal(f.focus.animating, true); assert.ok(distance(f.focus.point(child), from) < .001);
    assert.equal(f.focus.diameter(anchor, 28.6, desktop, 2), hero);
    f.clock.value += 210; f.frame(2);
    const halfway = f.focus.point(child), size = f.focus.diameter(anchor, 28.6, desktop, 2);
    assert.ok(Math.abs(halfway.x - (from.x + canonical.x) / 2) < .001);
    assert.ok(Math.abs(halfway.y - (from.y + canonical.y) / 2) < .001);
    assert.ok(size > 28.6 && size < hero); assert.equal(f.focus.animating, true);
    f.clock.value += 211; f.frame(2);
    assert.equal(f.focus.point(child).x, canonical.x); assert.equal(f.focus.point(child).y, canonical.y);
    assert.equal(f.focus.diameter(anchor, 28.6, desktop, 2), 28.6);
    assert.equal(f.focus.animating, false);
});

test('reduced motion exits directly to the Universe without leaving a transition running', () => {
    const f = make(family()); const anchor = f.enter('a');
    f.focus.diameter(anchor, 28.6, desktop, 2); f.focus.clear();
    f.frame(2, desktop, { reducedMotion: true });
    assert.equal(f.focus.anchorId, null); assert.equal(f.focus.animating, false);
    assert.equal(f.focus.diameter(anchor, 28.6, desktop, 2), 28.6);
    for (const entry of f.entries.values()) assert.equal(distance(f.focus.point(entry), f.particles.get(entry.id)), 0);
});

test('old and new anchor sizes start at their displayed values and ease together through a focus switch', () => {
    const f = make(family()); const a = f.enter('a'), b = f.entries.get('b');
    const initialA = f.focus.diameter(a, 28.6, desktop, 2), initialB = f.focus.diameter(b, 28.6, desktop, 2);
    assert.ok(initialA > initialB * 10);
    f.focus.enter('b'); f.frame(2);
    assert.equal(f.focus.diameter(a, 28.6, desktop, 2), initialA);
    assert.equal(f.focus.diameter(b, 28.6, desktop, 2), initialB);
    f.clock.value += 210; f.frame(2);
    const midwayA = f.focus.diameter(a, 28.6, desktop, 2), midwayB = f.focus.diameter(b, 28.6, desktop, 2);
    assert.ok(midwayA < initialA && midwayA > initialB);
    assert.ok(midwayB > initialB && midwayB < initialA);
    f.clock.value += 211; f.frame(2);
    assert.equal(f.focus.diameter(a, 28.6, desktop, 2), initialB);
    assert.equal(f.focus.diameter(b, 28.6, desktop, 2), initialA);
    assert.equal(f.focus.animating, false);
});

test('overview hint ownership remains stable inside its zoom deadband in either direction', () => {
    const f = make(family({ deepA: 8, deepB: 8 }));
    const owners = () => f.focus.hintDescriptors().map(hint => hint.id).sort().join(',');
    f.frame(.3); assert.equal(owners(), 's');
    for (const scale of [.5, .62, .51, .6, .64]) { f.frame(scale); assert.equal(owners(), 's'); }
    f.frame(.65); assert.equal(owners(), 'a,b');
    for (const scale of [.62, .5, .58, .49, .48]) { f.frame(scale); assert.equal(owners(), 'a,b'); }
    f.frame(.47); assert.equal(owners(), 's');
    assert.equal(f.focus.anchorId, null);
});

test('rapid entry and Universe exits preserve continuity, finite bounds and all canonical bytes', () => {
    const f = make(family({ a: 50, b: 50, deepA: 98, deepB: 98 })); f.frame(2);
    const savedEntries = JSON.stringify([...f.entries]), savedParticles = JSON.stringify([...f.particles]);
    const tracked = ['a', 'b', 'a-child-000'].map(id => f.entries.get(id));
    for (const entry of tracked) f.focus.diameter(entry, 28.6, desktop, 2);
    for (let index = 0; index < 6; index++) {
        const before = tracked.map(entry => ({ point: { ...f.focus.point(entry) },
            size: f.focus.diameter(entry, 28.6, desktop, 2) }));
        f.focus.enter(index % 2 ? 'b' : 'a'); f.frame(2);
        const bounds = f.focus.bounds(); assert.ok(Object.values(bounds).every(Number.isFinite));
        tracked.forEach((entry, i) => {
            assert.ok(distance(f.focus.point(entry), before[i].point) < .001);
            assert.equal(f.focus.diameter(entry, 28.6, desktop, 2), before[i].size);
        });
        f.clock.value += 80; f.frame(2);
        const local = tracked.map(entry => ({ point: { ...f.focus.point(entry) },
            size: f.focus.diameter(entry, 28.6, desktop, 2) }));
        f.focus.clear(); f.frame(2);
        assert.equal(f.focus.bounds(), null);
        tracked.forEach((entry, i) => {
            assert.ok(distance(f.focus.point(entry), local[i].point) < .001);
            assert.equal(f.focus.diameter(entry, 28.6, desktop, 2), local[i].size);
        });
        f.clock.value += 80; f.frame(2);
        tracked.forEach(entry => f.focus.diameter(entry, 28.6, desktop, 2));
    }
    f.clock.value += 500; f.frame(2);
    assert.equal(f.focus.anchorId, null); assert.equal(f.focus.animating, false);
    for (const entry of f.entries.values()) assert.equal(distance(f.focus.point(entry), f.particles.get(entry.id)), 0);
    assert.equal(JSON.stringify([...f.entries]), savedEntries); assert.equal(JSON.stringify([...f.particles]), savedParticles);
});

test('bounded local motion preserves child sector ownership despite distant canonical displacement', () => {
    const f = make(family({ a: 12 })); f.enter('a');
    const child = f.entries.get('a-child-000'), before = { ...f.focus.point(child) };
    const particle = f.particles.get(child.id); particle.x += 2000; particle.y -= 1500;
    f.clock.value += 16; f.frame(2);
    assert.ok(distance(f.focus.point(child), before) <= 6.000001);
    assert.equal(particle.x, child.x + 2000); assert.equal(particle.y, child.y - 1500);
    assert.equal(f.focus.anchorId, 'a');
});

test('drag capture/release preserves canonical drag coordinates without persisting presentation offsets', () => {
    const f = make(family()); f.enter('a');
    const child = f.entries.get('a-child-000'), particle = f.particles.get(child.id);
    const canonical = { x: particle.x, y: particle.y }, before = { ...f.focus.point(child) };
    f.focus.captureDrag(child.id); particle.x += 30; particle.y -= 12;
    f.frame(2, desktop, { dragging: new Set([child.id]) });
    const during = f.focus.point(child);
    assert.ok(Math.abs(during.x - before.x - 30) < .001 && Math.abs(during.y - before.y + 12) < .001);
    f.focus.releaseDrag(child.id); f.clock.value += 601; f.frame(2);
    assert.equal(child.x, canonical.x); assert.equal(child.y, canonical.y);
    assert.equal(particle.x, canonical.x + 30); assert.equal(particle.y, canonical.y - 12);
    assert.ok(distance(f.focus.point(child), before)>15,'release keeps the parent-relative user placement instead of returning to a generated slot');
});

test('pure clicks release drag capture without starting a local return animation or idle frame loop', () => {
    for (const [focused, id] of [[false, 'a'], [true, 'a'], [true, 'a-child-000']]) {
        const f = make(family()); if (focused) f.enter('a'); else f.frame(2);
        const before = { ...f.focus.point(f.entries.get(id)) };
        f.focus.captureDrag(id); f.frame(2, desktop, { dragging: new Set([id]) });
        f.focus.releaseDrag(id, { moved: false }); f.frame(2);
        assert.equal(f.focus.drags.has(id), false); assert.equal(f.focus.releases.has(id), false);
        assert.equal(f.focus.animating, false); assert.ok(distance(f.focus.point(f.entries.get(id)), before) < .001);
    }
});

for (const focused of [false, true]) {
    test(`${focused ? 'focused anchor' : 'free-view body'} release follows canonical inertia without presentation easing`, () => {
        const f = make(family()); if (focused) f.enter('a'); else f.frame(2);
        const particle = f.particles.get('a'); f.focus.captureDrag('a'); particle.x += 30;
        f.frame(2, desktop, { dragging: new Set(['a']) }); f.focus.releaseDrag('a');
        particle.x += 12; particle.y -= 4; f.clock.value += 100; f.frame(2);
        const point = f.focus.point(f.entries.get('a'));
        assert.equal(point.x, particle.x); assert.equal(point.y, particle.y);
        assert.equal(f.focus.releases.has('a'), false, 'only projected children need a return to their local sector');
    });
}

test('invalid focus targets leave the established world stable and exiting restores canonical projection', () => {
    const f = make(family()); f.enter('a');
    assert.equal(f.focus.enter('missing-entry'), false); assert.equal(f.focus.anchorId, 'a');
    f.focus.clear(); f.clock.value += 500; f.frame(2, desktop, { reducedMotion: true });
    assert.equal(f.focus.anchorId, null);
    for (const entry of f.entries.values()) {
        const point = f.focus.point(entry), particle = f.particles.get(entry.id);
        assert.equal(point.x, particle.x); assert.equal(point.y, particle.y);
    }
});

test('derived child index follows reparenting and deletion without changing canonical hierarchy', () => {
    const f = make(family()); f.enter('a');
    const child = f.entries.get('a-child-000'); child.parentId = 'b';
    f.focus.rebuild(f.entries); f.clock.value += 500; f.frame(2);
    assert.equal(f.focus.anchorId, 'a'); assert.equal(f.focus.layout.positions.has(child.id), false);
    assert.equal(f.focus.children.get('a').length, 3); assert.equal(f.focus.children.get('b').length, 5);
    assert.equal(child.parentId, 'b');
    f.enter('b'); assert.equal(f.focus.layout.positions.has(child.id), true);
    f.entries.delete('b'); f.particles.delete('b'); f.focus.rebuild(f.entries); f.frame(2);
    assert.equal(f.focus.anchorId, null, 'deleted anchors cannot leave an inaccessible local world');
});

test('deleting a child during release settling prunes transient state and lets rendering become idle', () => {
    const f = make(family()); f.enter('a');
    const id = 'a-child-000', particle = f.particles.get(id);
    f.focus.captureDrag(id); particle.x += 20; f.frame(2, desktop, { dragging: new Set([id]) });
    f.focus.releaseDrag(id); assert.equal(f.focus.animating, true);
    f.entries.delete(id); f.particles.delete(id); f.focus.rebuild(f.entries);
    f.clock.value += 1000; f.frame(2);
    assert.equal(f.focus.drags.has(id), false); assert.equal(f.focus.releases.has(id), false);
    assert.equal(f.focus.references.has(id), false);
    assert.equal(f.focus.animating, false, 'a deleted release must not request frames forever');
    assert.equal(f.focus.anchorId, 'a');
});

test('camera zoom in either direction never changes the world or proposes a hierarchy transition',()=>{
    const records=Array.from({length:12},(_,depth)=>({id:`d${depth}`,parentId:depth?`d${depth-1}`:null,depth}));
    const f=make(records);f.frame(.3);
    for(let i=0;i<20;i++)assert.equal(f.focus.zoom(1.4,{selectedId:'d11',nearby:[{id:'d1',distance:0}]}),null);
    assert.equal(f.focus.anchorId,null);f.enter('d11');
    assert.equal(f.focus.anchorId,'d3');assert.deepEqual(plain(f.focus.path),['d0','d1','d2','d3']);
    const layout=f.focus.layout,path=plain(f.focus.path);
    for(const factor of [.8,.8,.8,.01,10,.1,1.4,.001,100]) {
        assert.equal(f.focus.zoom(factor),null);f.frame(Math.max(.08,Math.min(8,f.focus.scale*factor)));
        assert.equal(f.focus.anchorId,'d3');assert.deepEqual(plain(f.focus.path),path);assert.equal(f.focus.layout,layout);
    }
    for(let depth=2;depth>=0;depth--)f.enter(`d${depth}`);
    f.focus.clear();f.clock.value+=421;f.frame(.3);
    assert.equal(f.focus.anchorId,null);assert.deepEqual(plain(f.focus.path),[]);
});

test('ten complete explicit world cycles restore identical geometry, sizes, visibility and root state',()=>{
    const records=[...family({a:14,b:12,deepA:28}),{id:'astronaut',parentId:'a-deep-000',depth:5}];
    const f=make(records);
    const snapshot=()=>JSON.stringify({world:f.focus.anchorId,path:plain(f.focus.path),layout:f.focus.layout?.signature,
        bodies:[...f.entries.values()].map(e=>[e.id,plain(f.focus.point(e)),f.focus.diameter(e,20,desktop,1.5),f.focus.visibility(e)])});
    let expected;
    for(let cycle=0;cycle<10;cycle++) {
        const states=[];
        for(const id of ['g','s','a','a-child-000','a','s','g']){f.enter(id,1.5);states.push(snapshot());}
        f.focus.clear();f.clock.value+=421;f.frame(1.5);states.push(snapshot());
        if(expected)assert.deepEqual(states,expected);else expected=states;
        assert.equal(f.focus.layout,null);assert.equal(f.focus.inspectionId,null);assert.equal(f.focus.references.size,0);
        assert.equal(f.focus.origins.size,0);assert.equal(f.focus.familyIds.size,0);
    }
});

test('Moon keeps Satellite-owned Astronaut groups near their actual parent and apart from other families',()=>{
    const f=make([{id:'g',depth:0},{id:'s',parentId:'g',depth:1},{id:'p',parentId:'s',depth:2},{id:'m',parentId:'p',depth:3},
        {id:'sat-a',parentId:'m',depth:4},{id:'sat-b',parentId:'m',depth:4},{id:'direct',parentId:'m',depth:4},
        {id:'a1',parentId:'sat-a',depth:5},{id:'a2',parentId:'sat-a',depth:5},{id:'b1',parentId:'sat-b',depth:5},
        {id:'nested',parentId:'a1',depth:6}]);
    f.enter('m');const points=f.focus.layout.positions;
    const dist=(a,b)=>Math.hypot(points.get(a).dx-points.get(b).dx,points.get(a).dy-points.get(b).dy);
    for(const id of ['a1','a2'])assert.ok(dist(id,'sat-a')<dist(id,'sat-b')*.5);
    assert.ok(dist('b1','sat-b')<dist('b1','sat-a')*.5);
    assert.ok(dist('nested','a1')<dist('nested','sat-b')*.5);
    assert.equal(points.get('a1').parentId,'sat-a');assert.equal(points.get('direct').parentId,'m');
    const layout=f.focus.layout;f.enter('a1');assert.equal(f.focus.anchorId,'m');assert.equal(f.focus.layout,layout);
});

test('the same camera scale discloses the same details regardless of previous Fit or inspection scale',()=>{
    const f=make([{id:'g',depth:0},{id:'s',parentId:'g',depth:1},{id:'p',parentId:'s',depth:2},{id:'m',parentId:'p',depth:3},
        {id:'sat',parentId:'m',depth:4},{id:'a',parentId:'sat',depth:5},{id:'b',parentId:'sat',depth:5}]);
    f.enter('m',1.2);const visible=plain(f.focus.visibility(f.entries.get('b')));
    f.focus.resetZoom(.2);f.frame(1.2);assert.deepEqual(plain(f.focus.visibility(f.entries.get('b'))),visible);
    f.enter('a',1.2);f.focus.resetZoom(2.1);f.frame(1.2);assert.deepEqual(plain(f.focus.visibility(f.entries.get('b'))),visible);
});

test('Satellite drag and release carry its own Astronaut family without moving another Satellite family',()=>{
    const f=make([{id:'g',depth:0},{id:'s',parentId:'g',depth:1},{id:'p',parentId:'s',depth:2},{id:'m',parentId:'p',depth:3},
        {id:'a',parentId:'m',depth:4},{id:'b',parentId:'m',depth:4},{id:'a1',parentId:'a',depth:5},{id:'b1',parentId:'b',depth:5}]);
    f.enter('m');const a={...f.focus.point(f.entries.get('a'))},child={...f.focus.point(f.entries.get('a1'))},other={...f.focus.point(f.entries.get('b1'))};
    f.focus.captureDrag('a');f.particles.get('a').x+=40;f.frame(1.5);
    const delta=f.focus.point(f.entries.get('a')).x-a.x;
    assert.ok(Math.abs(f.focus.point(f.entries.get('a1')).x-child.x-delta)<=6.01);
    assert.ok(distance(f.focus.point(f.entries.get('b1')),other)<.001);
    f.focus.releaseDrag('a');f.clock.value+=1;f.frame(1.5);
    assert.ok(Math.abs(f.focus.point(f.entries.get('a1')).x-child.x-delta)<=6.1);
});

test('selected or directly hovered children cannot steal an anchor through inward zoom',()=>{
    const f=make(family());f.enter('s');
    const ambiguous=[{id:'a',distance:24,radius:20},{id:'b',distance:31,radius:20}];
    for(let i=0;i<12;i++)assert.equal(f.focus.zoom(1.04,{nearby:ambiguous}),null);
    assert.equal(f.focus.anchorId,'s');
    assert.equal(f.focus.zoom(1.1,{selectedId:'a'}),null);
    assert.equal(f.focus.zoom(1.1,{selectedId:'b'}),null,'changed target starts a fresh intent interval');
    assert.equal(f.focus.zoom(1.6,{selectedId:'b',nearby:[{id:'b',distance:0}]}),null);
    f.enter('a');
    for(let i=0;i<10;i++)assert.equal(f.focus.zoom(1.1,{selectedId:'b',nearby:[{id:'b',distance:0}]}),null);
    assert.equal(f.focus.anchorId,'a');
});

test('camera zoom at Moon keeps the same detail layout even at extreme proximity',()=>{
    const f=make(family());f.enter('s');
    f.enter('a-child-000');const layout=f.focus.layout;
    for(const scale of [2,3,4,8]){assert.equal(f.focus.zoom(1.5),null);f.frame(scale);assert.equal(f.focus.anchorId,'a-child-000');assert.equal(f.focus.layout,layout);}
});

test('Planet and Moon medium sizes are whole while genuinely deep sizes can exceed the viewport reversibly',()=>{
    const f=make(family());
    for(const [id,proportion] of [['a',.55],['a-child-000',.45]]) {
        const entry=f.enter(id),nominal=f.focus.nominalScale(entry,desktop);
        const medium=f.focus.diameter(entry,20,desktop,nominal);
        assert.ok(Math.abs(medium-740*proportion)<1);
        const sizes=[1,1.2,1.6,2,2.4].map(ratio=>f.focus.diameter(entry,20,desktop,nominal*ratio));
        assert.ok(sizes.every((size,i)=>!i||size>sizes[i-1]));assert.ok(sizes.at(-1)>740);
        assert.equal(f.focus.diameter(entry,20,desktop,nominal),medium);
    }
});

test('Sun is whole on entry; Satellite and reused Astronaut roles stay modest at extreme camera scale',()=>{
    const f=make(Array.from({length:10},(_,depth)=>({id:`d${depth}`,parentId:depth?`d${depth-1}`:null,depth})));
    for(const [id,cap] of [['d1',740*2.2],['d4',111],['d5',60],['d8',60]]) {
        const entry=f.enter(id);
        assert.ok(f.focus.diameter(entry,20,desktop,8)<=cap);
        assert.ok(f.focus.layout.positions.size>=1);
        if(entry.depth>3)assert.equal(f.focus.anchorId,'d3');
    }
});

test('Fit and arbitrarily outward camera zoom keep the current world until an explicit exit',()=>{
    const f=make(family({a:100}));f.enter('a');f.focus.resetZoom(.2);f.frame(.2);
    assert.equal(f.focus.localAmount,1);assert.equal(f.focus.zoom(.7),null);
    assert.equal(f.focus.zoom(.7),null);assert.equal(f.focus.anchorId,'a','only explicit navigation changes world');
});

test('camera zoom preserves local world coordinates until intentional entry or explicit exit',()=>{
    const f=make(family());f.enter('a');f.focus.resetZoom(2);f.frame(2);
    const layout=f.focus.layout,child=f.entries.get('a-child-000'),local={...f.focus.point(child)};
    f.frame(1.3);assert.equal(f.focus.localAmount,1);
    assert.ok(distance(f.focus.point(child),local)<.001);
    assert.equal(f.focus.visibility(f.entries.get('b')).body,.08);
    assert.equal(f.focus.layout,layout);f.frame(2);assert.ok(distance(f.focus.point(child),local)<.001);
});

test('entering a clicked child keeps its displayed identity position and returning resolves its parent family',()=>{
    const f=make(family());f.enter('s');const child=f.entries.get('a'),clicked={...f.focus.point(child)};
    f.focus.enter('a');f.frame(2);assert.ok(distance(f.focus.point(child),clicked)<.001);
    f.clock.value+=500;f.frame(2);assert.ok(distance(f.focus.point(child),clicked)<.001);
    f.enter('s');assert.equal(f.focus.anchorId,'s');assert.equal(f.focus.relation(child),'child');
    assert.ok(f.focus.diameter(child,28,desktop,2)<100,'previous world becomes a normal child, including if it remains selected');
});

test('a short landscape canvas with an open draft still uses its real usable height for whole-body sizing',()=>{
    const f=make(family()),b={left:12,right:824,top:52,bottom:132};
    const planet=f.enter('a',.2,b,{mobile:true}),scale=f.focus.nominalScale(planet,b,true);
    const size=f.focus.diameter(planet,8,b,scale,{mobile:true});
    assert.ok(size<=80*.55+1);assert.ok(size<80);
});

test('camera and unrelated physics revisions reuse settled world geometry',()=>{
    const f=make(family());f.enter('a');f.focus.resetZoom(2);
    f.frame(2,desktop,{poseRevision:1});let reads=0,value=f.particles.get('a').x;
    Object.defineProperty(f.particles.get('a'),'x',{get(){reads++;return value;},set(next){value=next;},configurable:true});
    f.frame(2.1,desktop,{poseRevision:1});assert.equal(reads,0);
    value+=24;f.frame(2.1,desktop,{poseRevision:2});assert.equal(reads,0);
    assert.equal(f.focus.point(f.entries.get('a')).x,value-24);
});

test('detail inspection keeps the Moon family fixed and ends its enlargement when returning to a parent',()=>{
    const f=make(Array.from({length:10},(_,depth)=>({id:`d${depth}`,parentId:depth?`d${depth-1}`:null,depth})));
    f.enter('d3');const layout=f.focus.layout,points=JSON.stringify([...f.focus.projection]);
    f.enter('d4');assert.equal(f.focus.anchorId,'d3');assert.equal(f.focus.layout,layout);assert.equal(JSON.stringify([...f.focus.projection]),points);
    const detail=f.entries.get('d4');assert.ok(f.focus.diameter(detail,12,desktop,2)<=120);
    f.enter('d8');assert.equal(f.focus.anchorId,'d3');assert.equal(f.focus.layout,layout);
    f.enter('d2');assert.equal(f.focus.inspectionId,null);assert.ok(f.focus.diameter(detail,12,desktop,2)<=12);
});
