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

function makePhysics(tools, connections = []) {
    const physics = new GalaxyPhysics({ onTick() {}, onSettle() {} });
    physics.setViewport(bounds, 52);
    physics.setGraph(tools, connections);
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

test("coincident nodes separate and stay finite inside the viewport", () => {
    const physics = makePhysics(Array.from({ length: 12 }, (_, i) => ({ id: `node-${i}`, x: 600, y: 450 })));
    const nodes = advance(physics, 300);
    assertSeparated(nodes);
    nodes.forEach((node) => {
        assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
        assert.ok(node.x >= bounds.left && node.x <= bounds.right);
        assert.ok(node.y >= bounds.top && node.y <= bounds.bottom);
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

test("release allows motion, then cooling and damping reduce it", () => {
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
    assert.ok(distance(physics.particles.get("a"), initial) > 1);
    const nodes = advance(physics, 200);
    assert.ok(physics.simulation.alpha() < physics.simulation.alphaMin());
    assert.ok(nodes.every((node) => Math.hypot(node.vx, node.vy) < 0.1));
    assert.equal(physics.particles.get("a").fx, null);
});

test("adding a node reheats, preserves particle identity, and does not mutate app records", () => {
    const tools = [{ id: "a", x: 400, y: 400 }, { id: "b", x: 600, y: 400 }];
    const connections = [{ from: "a", to: "b" }];
    const original = JSON.stringify({ tools, connections });
    const physics = makePhysics(tools, connections);
    advance(physics, 200);
    const particle = physics.particles.get("a");
    physics.setGraph([...tools, { id: "c", x: 450, y: 450 }], [...connections, { from: "c", to: "a" }]);
    physics.simulation.stop();
    assert.equal(physics.particles.get("a"), particle);
    assert.ok(physics.simulation.alpha() >= 0.55);
    assert.equal(JSON.stringify({ tools, connections }), original);
    assertSeparated(advance(physics, 200));
});

test("dragging is constrained to the viewport and reduced motion cools faster", () => {
    const physics = makePhysics([{ id: "a", x: 400, y: 400 }]);
    physics.beginDrag("a");
    physics.moveDrag("a", -1000, 5000);
    const node = advance(physics, 1)[0];
    assert.equal(node.x, bounds.left);
    assert.equal(node.y, bounds.bottom);
    physics.endDrag("a", true);
    physics.setReducedMotion(true);
    advance(physics, 70);
    assert.ok(physics.simulation.alpha() < physics.simulation.alphaMin());
    assert.equal(physics.simulation.velocityDecay(), 0.6);
});

test("resizing a desktop graph to a narrow viewport keeps nodes apart", () => {
    const tools = Array.from({ length: 8 }, (_, i) => ({ id: `node-${i}`, x: 500 + i * 35, y: 220 + i * 50 }));
    const connections = tools.slice(1).map((node, i) => ({ from: tools[i].id, to: node.id }));
    const physics = makePhysics(tools, connections);
    advance(physics, 200);
    const narrowBounds = { left: 68, right: 322, top: 146, bottom: 610 };
    physics.setViewport(narrowBounds, 44);
    const nodes = advance(physics, 220);
    assertSeparated(nodes, 88);
    nodes.forEach((node) => {
        assert.ok(node.x >= narrowBounds.left && node.x <= narrowBounds.right);
        assert.ok(node.y >= narrowBounds.top && node.y <= narrowBounds.bottom);
    });
});
