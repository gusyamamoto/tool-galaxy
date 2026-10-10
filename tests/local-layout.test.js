const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { test } = require('node:test');
function load() {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../local-layout.js'), 'utf8'), context);
    return vm.runInContext('cosmosLocalLayout', context);
}
const plain = value => JSON.parse(JSON.stringify(value));
const anchor = { id: 'recipes', parentId: 'food', depth: 2, x: 431, y: 256 };
const children = count => Array.from({ length: count }, (_, index) => ({
    id: `recipe-${String(index).padStart(3, '0')}`, parentId: anchor.id, depth: 3, x: 500 + index, y: 200 - index
}));
const distance = (a, b) => Math.hypot(a.dx - b.dx, a.dy - b.dy);

test('local worlds are derived without modifying saved hierarchy or world coordinates', () => {
    const layout = load(), entries = children(50), saved = JSON.stringify({ anchor, entries });
    const field = layout.build(Object.freeze({ ...anchor }), entries.map(Object.freeze));
    assert.equal(JSON.stringify({ anchor, entries }), saved);
    assert.equal(field.positions.size, 50);
    assert.ok(field.radius > 330 && field.radius < 365);
    for (const child of entries) assert.equal(child.parentId, anchor.id);
    assert.ok([...field.positions.values()].every(point => Number.isFinite(point.dx) && Number.isFinite(point.dy)));
});

test('ID sectors are deterministic across input order, camera zoom, parent movement and repeated entry', () => {
    const layout = load(), entries = children(24), original = layout.build(anchor, entries);
    const reversed = layout.build({ ...anchor, x: 9999, y: -2000 }, [...entries].reverse(), { scale: 3 });
    assert.equal(reversed, original, 'camera/base-position changes must reuse the local field');
    const expected = plain([...original.positions]);
    layout.clear();
    assert.deepEqual(plain([...layout.build(anchor, [...entries].reverse()).positions]), expected);
});

for (const [count, expectedBands, maximum] of [[50, 3, 365], [100, 5, 540], [300, 9, 890]]) {
    test(`${count} immediate children share ${expectedBands} bounded bands with useful clearance`, () => {
        const layout = load(), field = layout.build(anchor, children(count)), points = [...field.positions.values()];
        assert.equal(field.rings.length, expectedBands);
        assert.ok(field.radius < maximum);
        assert.equal(new Set(points.map(point => point.ring)).size, expectedBands);
        for (let index = 0; index < points.length; index++) {
            const a = points[index];
            for (const b of points.slice(index + 1)) assert.ok(distance(a, b) > 52, `children overlap: ${distance(a, b)}`);
            assert.ok(a.dx >= field.extent.left + 32 && a.dx <= field.extent.right - 32);
            assert.ok(a.dy >= field.extent.top + 32 && a.dy <= field.extent.bottom - 32);
        }
    });
}

test('a second band shares children instead of stranding one child in a sparse outer ring', () => {
    const field = load().build(anchor, children(14));
    assert.equal(field.rings.length, 2);
    const counts = [0, 0]; field.positions.forEach(point => counts[point.ring]++);
    assert.ok(counts.every(count => count >= 5));
    assert.ok(new Set([...field.positions.values()].map(point => Math.round(point.radius))).size > 4,
        'small stable radius variation keeps the layout from being a perfect wheel');
});

test('large focused bodies receive collision-safe local clearance before density expansion', () => {
    const layout = load(), field = layout.build(anchor, children(24), { bodyRadius: 260, clearance: 70 });
    assert.equal(field.innerRadius, 332);
    assert.ok([...field.positions.values()].every(point => point.radius >= 260 + 70));
    assert.ok(field.extent.left <= -260 && field.extent.right >= 260);
    const empty = layout.build(anchor, [], { bodyRadius: 261 });
    assert.deepEqual(plain(empty.extent), { left: -264, right: 264, top: -264, bottom: 264 });
    assert.equal(empty.radius, 0); assert.equal(empty.rings.length, 0);
    const smallerBody = layout.build(anchor, [], { bodyRadius: 40 });
    const largerBody = layout.build(anchor, [], { bodyRadius: 100 });
    assert.notEqual(smallerBody, largerBody, 'the anchor bounds must update even inside the same inner-band profile');
    assert.deepEqual(plain(largerBody.extent), { left: -100, right: 100, top: -100, bottom: 100 });
});

test('mobile density preserves separation and compact territory in portrait and landscape', () => {
    const layout = load(), entries = children(100);
    const portrait = layout.build(anchor, entries, { mobile: true, width: 360, height: 800 });
    const landscape = layout.build(anchor, entries, { mobile: true, width: 800, height: 360 });
    assert.equal(landscape, portrait, 'rotation retains local sectors');
    assert.equal(portrait.innerRadius, 156);
    assert.equal(portrait.rings.length, 5);
    assert.ok(portrait.radius < 485);
    const points = [...portrait.positions.values()];
    points.forEach((a, index) => points.slice(index + 1).forEach(b => assert.ok(distance(a, b) > 48)));
    assert.equal(layout.build(anchor, entries, { width: 360 }).signature, portrait.signature);
});

test('any generic parentId depth can become a world and only its direct children receive sectors', () => {
    const layout = load(), deepAnchor = { id: 'deep-42', parentId: 'deep-41', depth: 42 };
    const direct = { id: 'deep-43', parentId: deepAnchor.id, depth: 43 };
    const field = layout.build(deepAnchor, [direct, { id: 'grandchild', parentId: direct.id, depth: 44 },
        { id: 'unrelated', parentId: 'other' }, direct, deepAnchor]);
    assert.equal(field.positions.size, 1); assert.equal(field.positions.has(direct.id), true);
    assert.equal(direct.parentId, deepAnchor.id); assert.equal(deepAnchor.parentId, 'deep-41');
    assert.equal(field.rings.length, 1);
});

test('organic particle displacement is bounded without changing canonical state or direction', () => {
    const layout = load();
    assert.deepEqual(plain(layout.boundedOffset(3, 4)), { dx: 3, dy: 4 });
    assert.deepEqual(plain(layout.boundedOffset(30, 40)), { dx: 3.5999999999999996, dy: 4.8 });
    assert.ok(Math.abs(Math.hypot(...Object.values(layout.boundedOffset(-1000, 50))) - 6) < 1e-10);
    assert.deepEqual(plain(layout.boundedOffset(Infinity, NaN)), { dx: 0, dy: 0 });
    assert.deepEqual(plain(layout.boundedOffset(30, 40, 0)), { dx: 0, dy: 0 });
});

test('cached fields are bounded and changed membership gets a distinct layout', () => {
    const layout = load(), original = layout.build(anchor, children(10));
    assert.notEqual(layout.build(anchor, children(11)), original);
    for (let index = 0; index < 17; index++) layout.build({ id: `world-${index}` }, [{ id: 'child' }]);
    assert.notEqual(layout.build(anchor, children(10)), original, 'old fields are evicted rather than accumulating per world');
});

test('Moon detail layout cache includes actual parent ownership and restores it on reparenting',()=>{
    const layout=load(),moon={id:'m',depth:3},items=[{id:'a',parentId:'m',depth:4},{id:'b',parentId:'m',depth:4},
        {id:'astronaut',parentId:'a',depth:5}];
    const first=layout.build(moon,items,{includeDescendants:true});
    const moved=layout.build(moon,items.map(e=>e.id==='astronaut'?{...e,parentId:'b'}:e),{includeDescendants:true});
    assert.notEqual(moved.signature,first.signature);assert.equal(moved.positions.get('astronaut').parentId,'b');
    assert.equal(layout.build(moon,items,{includeDescendants:true}),first);
});

test('folded deep Moon details do not cover their Satellite touch target',()=>{
    const fixture=require('./focus-fixtures.js').make('recipes50'),items=fixture.snapshot.entries;
    const moon=items.find(e=>e.id===fixture.ids.firstChild),descendants=items.filter(e=>
        e.id===fixture.ids.satellite||e.id==='focus-tip-0'||e.id.startsWith('focus-deep-'));
    for(const mobile of [false,true]) {
        const field=load().build(moon,descendants,{includeDescendants:true,mobile,bodyRadius:126});
        const satellite=field.positions.get(fixture.ids.satellite);
        for(const [id,p] of field.positions)if(id!==fixture.ids.satellite)
            assert.ok(distance(p,satellite)>=44,`${id} obscures its Satellite on ${mobile?'phone':'desktop'}`);
        assert.deepEqual(plain([...load().build(moon,[...descendants].reverse(),{includeDescendants:true,mobile,bodyRadius:126}).positions]),plain([...field.positions]));
    }
});
