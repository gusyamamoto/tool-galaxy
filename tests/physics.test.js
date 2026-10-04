// Run with: node --test tests/physics.test.js (no test dependencies).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const context = vm.createContext({ setTimeout, clearTimeout, setInterval, clearInterval, performance });
const root = path.resolve(__dirname, "..");
vm.runInContext(fs.readFileSync(path.join(root, "vendor/d3-force.bundle.min.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "physics.js"), "utf8"), context);
const GalaxyPhysics = vm.runInContext("GalaxyPhysics", context);
const bounds = { left: 76, right: 1200, top: 180, bottom: 800 };

function makePhysics(entries, connections = [], layout) {
    const physics = new GalaxyPhysics({ onTick() {}, onSettle() {} });
    physics.setViewport(bounds, 52);
    physics.setGraph(entries, connections, layout);
    physics.simulation.stop();
    return physics;
}

function advance(physics, ticks) {
    physics.simulation.stop().tick(ticks);
    return [...physics.particles.values()];
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function assertSeparated(nodes, diameter = 104) {
    nodes.forEach((node, i) => {
        nodes.slice(i + 1).forEach((other) => {
            assert.ok(distance(node, other) >= diameter, `${node.id} overlaps ${other.id}`);
        });
    });
}

test("springs shorten long connections without overlapping nodes", () => {
    const physics = makePhysics([
        { id: "a", x: 160, y: 450 }, { id: "b", x: 1100, y: 450 }
    ], [{ from: "a", to: "b" }]);
    const nodes = advance(physics, 200);
    assert.ok(distance(...nodes) < 350);
    assertSeparated(nodes);
});

test("unconnected nodes repel rather than falling into the same center", () => {
    const physics = makePhysics([
        { id: "a", x: 560, y: 450 }, { id: "b", x: 710, y: 450 }
    ]);
    const nodes = advance(physics, 200);
    assert.ok(distance(...nodes) > 150);
    assertSeparated(nodes);
});

test("coincident roots separate and stay finite inside the soft galaxy extent", () => {
    const physics = makePhysics(Array.from({ length: 12 }, (_, i) => ({ id: `node-${i}`, x: 600, y: 450 })));
    const nodes = advance(physics, 300);
    assertSeparated(nodes);
    nodes.forEach((node) => {
        assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
        assert.ok(distance(node, physics.origin) < physics.galaxyRadius);
    });
});

test("dragging fixes one node and moves connected and nearby nodes", () => {
    const physics = makePhysics([
        { id: "a", x: 400, y: 400 }, { id: "b", x: 600, y: 400 }, { id: "c", x: 500, y: 600 }
    ], [{ from: "a", to: "b" }]);
    advance(physics, 200);
    const before = [...physics.particles.values()].map((node) => ({ ...node }));
    physics.beginDrag("a");
    physics.moveDrag("a", 780, 500);
    const nodes = advance(physics, 30);
    assert.equal(nodes[0].x, 780);
    assert.equal(nodes[0].y, 500);
    assert.ok(distance(nodes[1], before[1]) > 5);
    assert.ok(distance(nodes[2], before[2]) > 1);
    assertSeparated(nodes);
    physics.endDrag("a", true);
    physics.simulation.stop();
});

test("collision pushes a free node away from a dragged node", () => {
    const physics = makePhysics([
        { id: "a", x: 400, y: 400 }, { id: "b", x: 650, y: 400 }
    ]);
    advance(physics, 200);
    const other = physics.particles.get("b");
    physics.beginDrag("a");
    physics.moveDrag("a", other.x, other.y);
    assertSeparated(advance(physics, 20));
    physics.endDrag("a", true);
    physics.simulation.stop();
});

test("soft release permits local adjustment, then cooling and damping settle it", () => {
    const physics = makePhysics([
        { id: "a", x: 400, y: 400 }, { id: "b", x: 600, y: 400 }
    ], [{ from: "a", to: "b" }]);
    advance(physics, 200);
    physics.beginDrag("a");
    physics.moveDrag("a", 900, 500);
    advance(physics, 15);
    physics.endDrag("a", true);
    const initial = { ...physics.particles.get("a") };
    advance(physics, 10);
    // Cross-system optional links no longer pull a soft root off its manual anchor.
    assert.ok(distance(physics.particles.get("a"), initial) < 60);
    const nodes = advance(physics, 200);
    assert.ok(physics.simulation.alpha() < physics.simulation.alphaMin());
    assert.ok(nodes.every((node) => Math.hypot(node.vx, node.vy) < 0.1));
    assert.equal(physics.particles.get("a").fx, null);
});

vm.runInContext(fs.readFileSync(path.join(root, "sample-data.js"), "utf8"), context);
const sample = vm.runInContext("galaxySample", context);

function samplePhysics() {
    const data = JSON.parse(JSON.stringify(sample.build()));
    const sizes = { category: 1.35, subcategory: 1, entry: 0.66 };
    const physics = makePhysics(data.entries.map(entry => ({ ...entry, sizeScale: sizes[entry.role] })), [], new Map());
    physics.setViewport(bounds, 23);
    advance(physics, 320);
    return physics;
}

for (const [body, id, dx, dy] of [
    ["Sun", "sample-sun-technology", 160, 80],
    ["Planet", "sample-planet-0-0", 100, -70],
    ["Moon", "sample-moon-0-0-0", 90, 45]
]) {
    test(`${body} release keeps inertia, avoids an energy kick and settles with a gentle response`, () => {
        const physics = samplePhysics();
        const node = physics.particles.get(id);
        const members = physics.systems.get(node.systemId).members;
        const before = new Map(members.map(member => [member.id, { x: member.x, y: member.y }]));
        physics.beginDrag(id);
        physics.moveDrag(id, node.x + dx, node.y + dy);
        advance(physics, 12);
        const releaseAlpha = physics.simulation.alpha();
        const release = new Map(members.map(member => [member.id, { ...member }]));
        physics.endDrag(id, true);
        physics.simulation.stop();
        assert.equal(physics.simulation.alpha(), releaseAlpha, "release must not increase restorative energy");
        assert.equal(physics.simulation.alphaTarget(), 0, "last release should start cooling immediately");
        members.forEach(member => {
            assert.equal(member.vx, release.get(member.id).vx, "release must retain existing horizontal inertia");
            assert.equal(member.vy, release.get(member.id).vy, "release must retain existing vertical inertia");
        });
        let peakSpeed = 0;
        let peakAcceleration = 0;
        let excursion = 0;
        for (let tick = 0; tick < 240; tick++) {
            const velocities = new Map(members.map(member => [member.id, { vx: member.vx, vy: member.vy }]));
            advance(physics, 1);
            members.forEach(member => {
                if (tick < 12) {
                    const velocity = velocities.get(member.id);
                    peakSpeed = Math.max(peakSpeed, Math.hypot(member.vx, member.vy));
                    peakAcceleration = Math.max(peakAcceleration, Math.hypot(member.vx - velocity.vx, member.vy - velocity.vy));
                }
                excursion = Math.max(excursion, distance(member, release.get(member.id)));
            });
        }
        assert.ok(peakAcceleration < 0.5, `initial acceleration should stay gentle (${peakAcceleration}px/tick²)`);
        assert.ok(peakSpeed > 0.01 && peakSpeed < 4, `the system should respond visibly without sharp recoil (${peakSpeed}px/tick)`);
        assert.ok(excursion < 125, `post-release displacement should remain restrained (${excursion}px)`);
        assert.ok(distance(node, node.placement) < 40, "dragged body should settle near its soft preference");
        assert.ok(physics.simulation.alpha() < physics.simulation.alphaMin());
        assert.ok(members.every(member => Math.hypot(member.vx, member.vy) < 0.02), "every connected body should settle");
        const descendants = members.filter(member => member.parent === node || member.parent?.parent === node);
        descendants.forEach(member => assert.ok(distance(member, before.get(member.id)) > 20, "automatic descendants should visibly follow their dragged parent"));
    });
}

test("a held drag releases without reheating and keeps another active drag warm", () => {
    const physics = samplePhysics();
    const sun = physics.particles.get("sample-sun-technology");
    const moon = physics.particles.get("sample-moon-0-0-0");
    physics.beginDrag(sun.id);
    physics.moveDrag(sun.id, sun.x + 160, sun.y + 80);
    advance(physics, 120);
    const alpha = physics.simulation.alpha();
    physics.beginDrag(moon.id);
    physics.endDrag(sun.id, true);
    physics.simulation.stop();
    assert.equal(physics.simulation.alpha(), alpha, "a held release must not kick the simulation awake");
    assert.ok(physics.simulation.alphaTarget() > 0, "remaining drag must stay responsive");
    assert.notEqual(moon.fx, null);
    physics.endDrag(moon.id, false);
    physics.simulation.stop();
    assert.equal(physics.simulation.alpha(), alpha, "a click must not add energy");
    assert.equal(physics.simulation.alphaTarget(), 0);
});

for (const [body, draggedId, siblingId] of [
    ["Planet", "sample-planet-0-0", "sample-planet-0-1"],
    ["Moon", "sample-moon-0-0-0", "sample-moon-0-0-1"]
]) {
    test(`${body} siblings separate after a coincident drop beside an exact pin`, () => {
        const physics = samplePhysics();
        const dragged = physics.particles.get(draggedId);
        const sibling = physics.particles.get(siblingId);
        const parentId = dragged.parentId;
        const pin = { x: sibling.x, y: sibling.y, pinned: true };
        physics.setPlacement(siblingId, pin);
        advance(physics, 200);
        physics.beginDrag(draggedId);
        physics.moveDrag(draggedId, pin.x, pin.y);
        advance(physics, 12);
        const preference = physics.endDrag(draggedId, true);
        const nodes = advance(physics, 240);
        assert.ok(distance(dragged, sibling) >= dragged.radius + sibling.radius + 12,
            "released siblings should have local breathing room");
        assert.equal(sibling.x, pin.x);
        assert.equal(sibling.y, pin.y);
        assert.equal(dragged.placement.x, preference.x, "separation must not rewrite a manual preference");
        assert.equal(dragged.placement.y, preference.y);
        assert.equal(dragged.parentId, parentId);
        assert.equal(sibling.parentId, parentId);
        assert.ok(nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
        assert.ok(nodes.every(node => Math.hypot(node.vx, node.vy) < 0.05), "local correction should settle");
    });
}

test("sibling clearance opens angular space without radial/global displacement", () => {
    const physics = samplePhysics();
    const parent = physics.particles.get("sample-sun-technology");
    const a = physics.particles.get("sample-planet-0-0");
    const b = physics.particles.get("sample-planet-0-1");
    physics.particles.forEach(node => { node.vx = node.vy = 0; });
    a.x = parent.x + 180; a.y = parent.y;
    b.x = parent.x + 180; b.y = parent.y + 40;
    const unrelated = [...physics.particles.values()].filter(node => node.systemId !== parent.systemId);
    const homes = JSON.stringify([...physics.systems.values()].map(system => system.home));
    physics.separateSiblings(0.1);
    assert.ok(a.vy < 0 && b.vy > 0, "nearby siblings should gently open their angular gap");
    assert.ok(Math.abs(a.vx) < 0.0001, "the correction should not push a body radially onto a track");
    assert.ok(Math.hypot(a.vx, a.vy) < 0.3 && Math.hypot(b.vx, b.vy) < 0.3,
        "clearance should add a bounded, gentle impulse");
    assert.ok(unrelated.every(node => Math.hypot(node.vx, node.vy) === 0), "unrelated systems should receive no impulse");
    assert.equal(parent.vx, 0);
    assert.equal(parent.vy, 0);
    assert.equal(JSON.stringify([...physics.systems.values()].map(system => system.home)), homes);
    physics.particles.forEach(node => { node.vx = node.vy = 0; });
    b.x = parent.x + 400; b.y = parent.y;
    physics.separateSiblings(0.1);
    assert.equal(b.vx, 0);
    assert.equal(b.vy, 0, "siblings in separate radial regions should remain freely arranged");
});

test("77 bodies form seven separated, contained systems with distinct local orbits", () => {
    const physics = samplePhysics();
    assert.equal(physics.systems.size, 7);
    const systems = [...physics.systems.values()];
    systems.forEach((system, index) => {
        assert.equal(system.members.length, 11);
        assert.ok(distance(system.root, physics.origin) < physics.galaxyRadius);
        systems.slice(index + 1).forEach(other => assert.ok(
            distance(system.root, other.root) > (system.radius + other.radius) * 0.85,
            "systems must retain distinct footprints"));
        system.members.filter(node => node.parent).forEach(node => {
            assert.equal(node.systemId, system.id);
            const radius = distance(node, node.parent);
            assert.ok(Math.abs(radius - node.orbitRadius) < 45, "automatic branch stays in its radial band");
            assert.ok(radius < (node.role === "entry" ? 125 : 240));
        });
    });
    assert.ok(Math.min(...systems.map(system => distance(system.root, physics.origin))) < 260,
        "the galaxy center should be occupied");
    assertSeparated([...physics.particles.values()], 28);
});

test("unrelated Moon motion and semantic links do not exert global repulsion", () => {
    const physics = samplePhysics();
    const unrelated = physics.particles.get("sample-sun-food");
    const control = samplePhysics();
    control.reheat(0.28);
    advance(control, 260);
    const moon = physics.particles.get("sample-moon-0-0-0");
    physics.setPlacement(moon.id, { x: 8000, y: -7000, pinned: true });
    physics.linkForce.links([{ source: moon.id, target: unrelated.id }]);
    advance(physics, 260);
    assert.ok(distance(unrelated, control.particles.get(unrelated.id)) < 25,
        "unrelated system must not chase the remote Moon beyond ordinary reheating adjustment");
    assert.equal(moon.x, 8000);
    assert.equal(moon.y, -7000);
});

test("Sun dragging transports automatic and soft descendants while respecting exact pins", () => {
    const physics = samplePhysics();
    const root = physics.particles.get("sample-sun-technology");
    const moon = physics.particles.get("sample-moon-0-0-0");
    const pinned = physics.particles.get("sample-moon-0-1-0");
    const pin = { x: pinned.x, y: pinned.y, pinned: true };
    physics.setPlacement(pinned.id, pin);
    physics.setPlacement(moon.id, { x: moon.x, y: moon.y, pinned: false });
    const before = { x: moon.x, y: moon.y };
    const stored = { ...moon.placement };
    let translated;
    physics.onPlacementChange = (id, placement) => { if (id === moon.id) translated = placement; };
    physics.beginDrag(root.id);
    physics.moveDrag(root.id, root.x + 220, root.y - 120);
    assert.ok(Math.abs(moon.x - before.x - 220) < 0.01);
    assert.ok(Math.abs(moon.y - before.y + 120) < 0.01);
    assert.equal(translated.x, stored.x + 220);
    assert.equal(translated.y, stored.y - 120);
    assert.equal(pinned.x, pin.x);
    assert.equal(pinned.y, pin.y);
    physics.endDrag(root.id, true);
    advance(physics, 260);
    assert.ok(distance(root, root.placement) < 70);
});

test("containment brings an automatic remote system home but permits an intentional remote pin", () => {
    const physics = samplePhysics();
    const root = physics.particles.get("sample-sun-technology");
    root.x = 6000;
    root.y = -5000;
    physics.reheat(0.8);
    advance(physics, 320);
    assert.ok(distance(root, physics.origin) < physics.galaxyRadius);
    physics.setPlacement(root.id, { x: 6000, y: -5000, pinned: true });
    advance(physics, 260);
    assert.equal(root.x, 6000);
    assert.equal(root.y, -5000);
});

test("adding a node reheats, preserves particle identity, and does not mutate app records", () => {
    const entries = [{ id: "a", x: 400, y: 400 }, { id: "b", x: 600, y: 400 }];
    const connections = [{ from: "a", to: "b" }];
    const original = JSON.stringify({ entries, connections });
    const physics = makePhysics(entries, connections);
    advance(physics, 200);
    const particle = physics.particles.get("a");
    physics.setGraph([...entries, { id: "c", x: 450, y: 450 }], [...connections, { from: "c", to: "a" }]);
    physics.simulation.stop();
    assert.equal(physics.particles.get("a"), particle);
    assert.ok(physics.simulation.alpha() >= 0.55);
    assert.equal(JSON.stringify({ entries, connections }), original);
    assertSeparated(advance(physics, 200));
});

test("manual dragging follows world coordinates beyond the automatic viewport", () => {
    const physics = makePhysics([{ id: "a", x: 400, y: 400 }]);
    physics.beginDrag("a");
    physics.moveDrag("a", -1000, 5000);
    const node = advance(physics, 1)[0];
    assert.equal(node.x, -1000);
    assert.equal(node.y, 5000);
    physics.endDrag("a", true);
    physics.setReducedMotion(true);
    advance(physics, 70);
    assert.ok(physics.simulation.alpha() < physics.simulation.alphaMin());
    assert.equal(physics.simulation.velocityDecay(), 0.6);
});

test("resizing a desktop graph to a narrow viewport keeps nodes apart", () => {
    const entries = Array.from({ length: 8 }, (_, i) => ({ id: `node-${i}`, x: 500 + i * 35, y: 220 + i * 50 }));
    const connections = entries.slice(1).map((node, i) => ({ from: entries[i].id, to: node.id }));
    const physics = makePhysics(entries, connections);
    advance(physics, 200);
    const narrowBounds = { left: 68, right: 322, top: 146, bottom: 610 };
    physics.setViewport(narrowBounds, 44);
    const nodes = advance(physics, 220);
    assertSeparated(nodes, 88);
    nodes.forEach((node) => {
        assert.ok(distance(node, physics.origin) < physics.galaxyRadius);
    });
});

test("larger bodies collide using their actual radii", () => {
    const physics = makePhysics([
        { id: "group", x: 600, y: 450, sizeScale: 1.35 },
        ...Array.from({ length: 5 }, (_, i) => ({ id: `child-${i}`, x: 600, y: 450 }))
    ], [{ from: "group", to: "child-0" }]);
    const nodes = advance(physics, 250);
    assert.equal(physics.particles.get("group").radius, 52 * 1.35);
    nodes.forEach((node, i) => nodes.slice(i + 1).forEach((other) => {
        assert.ok(distance(node, other) >= node.radius + other.radius);
    }));
});

test("a larger body's manual placement retains world coordinates and size ratio on resize", () => {
    const physics = makePhysics([{ id: "group", x: 600, y: 450, sizeScale: 1.35 }]);
    physics.beginDrag("group");
    physics.moveDrag("group", -1000, 5000);
    const node = advance(physics, 1)[0];
    assert.equal(node.x, -1000);
    assert.equal(node.y, 5000);
    physics.setViewport({ left: 68, right: 322, top: 146, bottom: 610 }, 44);
    physics.simulation.stop();
    assert.equal(node.radius, 44 * 1.35);
    assert.equal(node.x, -1000);
    assert.equal(node.y, 5000);
    physics.endDrag("group", true);
    physics.simulation.stop();
});

test("suns, planets and moons separate using their distinct presentation sizes", () => {
    const physics = makePhysics([
        { id: "category", x: 600, y: 450, sizeScale: 1.35 },
        { id: "subcategory", x: 600, y: 450, sizeScale: 1 },
        { id: "entry", x: 600, y: 450, sizeScale: 0.66 }
    ], [{ from: "category", to: "subcategory" }, { from: "subcategory", to: "entry" }]);
    const nodes = advance(physics, 250);
    nodes.forEach((node, i) => nodes.slice(i + 1).forEach((other) => {
        assert.ok(distance(node, other) >= node.radius + other.radius);
    }));
    assert.equal(nodes[0].radius, 70.2);
    assert.equal(nodes[1].radius, 52);
    assert.equal(nodes[2].radius, 34.32);
});

test("hierarchy keeps children closer than separate star systems", () => {
    const entries = [
        { id: "s1", role: "category", x: 250, y: 350, sizeScale: 1.35 },
        { id: "p1", role: "subcategory", parentId: "s1", x: 750, y: 650 },
        { id: "m1", role: "entry", parentId: "p1", x: 1100, y: 200, sizeScale: 0.66 },
        { id: "s2", role: "category", x: 900, y: 500, sizeScale: 1.35 },
        { id: "p2", role: "subcategory", parentId: "s2", x: 200, y: 650 }
    ];
    const links = [
        { from: "s1", to: "p1", kind: "hierarchy" }, { from: "p1", to: "m1", kind: "hierarchy" },
        { from: "s2", to: "p2", kind: "hierarchy" }
    ];
    const original = JSON.stringify({ entries, links });
    const physics = makePhysics(entries, links);
    advance(physics, 280);
    const get = (id) => physics.particles.get(id);
    assert.ok(distance(get("p1"), get("m1")) < 220);
    assert.ok(distance(get("s1"), get("p1")) < 350);
    assert.ok(distance(get("s1"), get("s2")) > distance(get("s1"), get("p1")));
    assert.equal(JSON.stringify({ entries, links }), original);
});

test("dragging a parent moves its system and reparenting updates the live forces", () => {
    const entries = [
        { id: "star", role: "category", x: 350, y: 350, sizeScale: 1.35 },
        { id: "planet", role: "subcategory", parentId: "star", x: 550, y: 350 },
        { id: "moon", role: "entry", parentId: "planet", x: 700, y: 350, sizeScale: 0.66 },
        { id: "other", role: "category", x: 1000, y: 650, sizeScale: 1.35 }
    ];
    const links = [{ from: "star", to: "planet", kind: "hierarchy" }, { from: "planet", to: "moon", kind: "hierarchy" }];
    const physics = makePhysics(entries, links);
    advance(physics, 220);
    const before = { ...physics.particles.get("planet") };
    physics.beginDrag("star");
    physics.moveDrag("star", 800, 200);
    advance(physics, 40);
    assert.ok(distance(physics.particles.get("planet"), before) > 20);
    physics.endDrag("star", true);
    entries[1].parentId = "other";
    physics.setGraph(entries, [{ from: "other", to: "planet", kind: "hierarchy" }, links[1]]);
    const nodes = advance(physics, 240);
    assert.equal(physics.particles.get("planet").parentId, "other");
    assert.ok(distance(physics.particles.get("planet"), physics.particles.get("other")) < 300);
    nodes.forEach((node, i) => nodes.slice(i + 1).forEach((other) => {
        assert.ok(distance(node, other) >= node.radius + other.radius - 0.5);
    }));
});

function arrangedFamily() {
    return makePhysics([
        { id: "star", role: "category", x: 250, y: 400, sizeScale: 1.35 },
        { id: "planet", role: "subcategory", parentId: "star", x: 450, y: 400 },
        { id: "moon", role: "entry", parentId: "planet", x: 580, y: 400, sizeScale: 0.66 }
    ], [{ from: "star", to: "planet", kind: "hierarchy" }, { from: "planet", to: "moon", kind: "hierarchy" }],
    new Map([["star", { x: 250, y: 400, pinned: true }]]));
}

test("a far-dragged Planet stays near its preferred location while its Moon reacts", () => {
    const physics = arrangedFamily();
    advance(physics, 200);
    const moonBefore = { ...physics.particles.get("moon") };
    physics.beginDrag("planet");
    physics.moveDrag("planet", 1000, 550);
    advance(physics, 25);
    const preferred = physics.endDrag("planet", true);
    assert.equal(preferred.x, 1000);
    assert.equal(preferred.y, 550);
    const planet = advance(physics, 250)[1];
    assert.ok(distance(planet, preferred) < 60, `soft placement drifted ${distance(planet, preferred)}px`);
    assert.ok(distance(planet, physics.particles.get("star")) > 650);
    assert.ok(distance(physics.particles.get("moon"), moonBefore) > 30);
    assert.equal(planet.fx, null);
    assert.ok(distance(planet, preferred) > 0.1, "soft placement must still respond to forces");
});

test("a Moon placed on the other side keeps its preferred side and survives graph rebuilds", () => {
    const physics = arrangedFamily();
    physics.setPlacement("planet", { x: 650, y: 450, pinned: true });
    advance(physics, 200);
    physics.beginDrag("moon");
    physics.moveDrag("moon", 440, 650);
    const placement = physics.endDrag("moon", true);
    advance(physics, 240);
    assert.ok(physics.particles.get("moon").x < 500);
    assert.ok(distance(physics.particles.get("moon"), placement) < 40);
    const particles = [...physics.particles.values()].map(({ id, role, parentId, x, y, sizeScale }) => ({ id, role, parentId, x, y, sizeScale }));
    const layout = new Map([...physics.particles].filter(([, node]) => node.placement).map(([id, node]) => [id, node.placement]));
    const restored = makePhysics(particles, [{ from: "star", to: "planet", kind: "hierarchy" }, { from: "planet", to: "moon", kind: "hierarchy" }], layout);
    advance(restored, 240);
    assert.ok(distance(restored.particles.get("moon"), placement) < 40);
    assert.equal(restored.particles.get("moon").parentId, "planet");
});

test("hard pins stay exact through collisions, graph rebuilds, dragging and resize", () => {
    const physics = makePhysics([{ id: "fixed", x: 500, y: 400 }, { id: "free", x: 500, y: 400 }], [],
        new Map([["fixed", { x: 500, y: 400, pinned: true }]]));
    const nodes = advance(physics, 240);
    assert.equal(nodes[0].x, 500);
    assert.equal(nodes[0].y, 400);
    assertSeparated(nodes);
    physics.setViewport({ left: 68, right: 322, top: 146, bottom: 610 }, 44);
    advance(physics, 20);
    assert.equal(nodes[0].x, 500, "viewport resize must not overwrite a saved pin");
    physics.beginDrag("fixed");
    physics.moveDrag("fixed", 700, 500);
    const placement = physics.endDrag("fixed", true);
    advance(physics, 100);
    assert.equal(placement.pinned, true);
    assert.equal(nodes[0].x, 700);
    assert.equal(nodes[0].y, 500);
});

test("unpin keeps a soft preference; release clears it and resumes automatic layout", () => {
    const physics = arrangedFamily();
    physics.setPlacement("planet", { x: 1050, y: 600, pinned: true });
    advance(physics, 240);
    physics.setPlacement("planet", { x: 1050, y: 600, pinned: false });
    const planet = advance(physics, 240)[1];
    assert.equal(planet.fx, null);
    assert.ok(distance(planet, { x: 1050, y: 600 }) < 60);
    physics.setPlacement("planet", null);
    advance(physics, 260);
    assert.equal(planet.placement, null);
    assert.ok(distance(planet, physics.particles.get("star")) < 450);
    assert.ok(distance(planet, { x: 1050, y: 600 }) > 250, "automatic layout must leave the former anchor");
});

test("soft placements yield to collisions and clicks do not create or move preferences", () => {
    const physics = makePhysics([{ id: "fixed", x: 500, y: 400 }, { id: "soft", x: 500, y: 400 }], [],
        new Map([["fixed", { x: 500, y: 400, pinned: true }], ["soft", { x: 500, y: 400, pinned: false }]]));
    const nodes = advance(physics, 240);
    assertSeparated(nodes);
    const before = { ...nodes[1].placement };
    physics.beginDrag("soft");
    physics.endDrag("soft", false);
    physics.simulation.stop();
    assert.equal(nodes[1].placement.x, before.x);
    assert.equal(nodes[1].placement.y, before.y);
    physics.setPlacement("soft", null);
    physics.beginDrag("soft");
    physics.endDrag("soft", false);
    physics.simulation.stop();
    assert.equal(nodes[1].placement, null);
});

test("automatic descendants follow an arranged parent beyond the original viewport", () => {
    const physics = arrangedFamily();
    physics.setPlacement("planet", { x: 1700, y: 550, pinned: false });
    const planet = advance(physics, 300)[1];
    const moon = physics.particles.get("moon");
    assert.ok(distance(planet, { x: 1700, y: 550 }) < 120);
    assert.ok(moon.x > bounds.right, "viewport must not trap an arranged system's children");
    assert.ok(distance(planet, moon) < 250);
    assert.equal(moon.placement, null, "following a parent must not create a manual preference");
    assert.equal(moon.parentId, "planet");
});
