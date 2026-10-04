const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "camera.js"), "utf8"), context);
const GraphCamera = vm.runInContext("GraphCamera", context);

function makeCamera() {
    let nextId = 0;
    let time = 0;
    let renders = 0;
    const frames = new Map();
    const camera = new GraphCamera({
        onChange() { renders++; },
        requestFrame(callback) { frames.set(++nextId, callback); return nextId; },
        cancelFrame(id) { frames.delete(id); }
    });
    function step() {
        const pending = [...frames.values()];
        frames.clear();
        time += 16;
        pending.forEach((callback) => callback(time));
    }
    function settle() {
        for (let i = 0; frames.size && i < 150; i++) step();
        assert.equal(frames.size, 0, "camera must settle instead of animating forever");
    }
    return { camera, frames, step, settle, renders: () => renders };
}

function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`); }

test("world and screen conversions round-trip after zoom and pan", () => {
    const { camera } = makeCamera();
    camera.setView({ x: -120, y: 84, scale: 1.7 }, false);
    const screen = camera.worldToScreen(460, 320);
    const world = camera.screenToWorld(screen.x, screen.y);
    near(world.x, 460);
    near(world.y, 320);
});

test("zoom is smooth and holds the world point under the cursor throughout", () => {
    const { camera, step, settle, renders } = makeCamera();
    camera.panTo(48, -22);
    const anchor = camera.screenToWorld(360, 260);
    camera.zoomAt(360, 260, 1.6);
    assert.equal(camera.view.scale, 1);
    step();
    assert.ok(camera.view.scale > 1 && camera.view.scale < 1.6);
    near(camera.screenToWorld(360, 260).x, anchor.x);
    near(camera.screenToWorld(360, 260).y, anchor.y);
    settle();
    near(camera.view.scale, 1.6);
    near(camera.screenToWorld(360, 260).x, anchor.x);
    near(camera.screenToWorld(360, 260).y, anchor.y);
    assert.ok(renders() > 1);
});

test("repeated wheel input accumulates and respects both zoom limits", () => {
    const { camera, settle } = makeCamera();
    camera.zoomAt(300, 200, 1.2);
    camera.zoomAt(300, 200, 1.2);
    settle();
    near(camera.view.scale, 1.44);
    camera.zoomAt(300, 200, 100);
    settle();
    assert.equal(camera.view.scale, 2.4);
    camera.zoomAt(300, 200, 0.001);
    settle();
    assert.equal(camera.view.scale, 0.08);
});

test("starting a drag cancels pending zoom at its visible position", () => {
    const { camera, step, frames } = makeCamera();
    camera.zoomAt(300, 200, 2);
    step();
    const visible = { ...camera.view };
    camera.stopAnimation();
    assert.equal(frames.size, 0);
    near(camera.target.scale, visible.scale);
    camera.panTo(visible.x + 80, visible.y - 30);
    near(camera.view.x, visible.x + 80);
    near(camera.view.y, visible.y - 30);
    near(camera.view.scale, visible.scale);
});

test("reset returns to the original view and reduced motion skips camera animation", () => {
    const { camera, frames, settle } = makeCamera();
    camera.setView({ x: 300, y: -200, scale: 2 }, false);
    camera.reset();
    settle();
    near(camera.view.x, 0);
    near(camera.view.y, 0);
    near(camera.view.scale, 1);
    camera.zoomAt(300, 200, 1.5);
    camera.setReducedMotion(true);
    assert.equal(frames.size, 0);
    near(camera.view.scale, 1.5);
    camera.zoomAt(300, 200, 1.2);
    near(camera.view.scale, 1.8);
    assert.equal(frames.size, 0);
});

test("default animation callbacks invoke browser APIs on the global object", () => {
    const browser = vm.createContext({});
    vm.runInContext(`
        function requestAnimationFrame(callback) {
            if (this !== globalThis) throw new Error('Illegal invocation');
            return 7;
        }
        function cancelAnimationFrame(id) {
            if (this !== globalThis) throw new Error('Illegal invocation');
            if (id !== 7) throw new Error('Wrong animation ID');
        }
    `, browser);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "camera.js"), "utf8"), browser);
    assert.doesNotThrow(() => vm.runInContext(`
        const camera = new GraphCamera({ onChange() {} });
        camera.zoomAt(300, 200, 1.2);
        camera.stopAnimation();
    `, browser));
});

test("Fit Galaxy includes asymmetric world bounds with panel space and padding", () => {
    const { camera, settle } = makeCamera();
    const bounds = { left: -900, right: 1700, top: -600, bottom: 1200 };
    const viewport = { left: 45, right: 1080, top: 220, bottom: 900 };
    camera.fitBounds(bounds, viewport, { padding: 32 });
    settle();
    const topLeft = camera.worldToScreen(bounds.left, bounds.top);
    const bottomRight = camera.worldToScreen(bounds.right, bounds.bottom);
    assert.ok(topLeft.x >= viewport.left + 32);
    assert.ok(topLeft.y >= viewport.top + 32);
    assert.ok(bottomRight.x <= viewport.right - 32);
    assert.ok(bottomRight.y <= viewport.bottom - 32);
    near((topLeft.x + bottomRight.x) / 2, (viewport.left + viewport.right) / 2);
    near((topLeft.y + bottomRight.y) / 2, (viewport.top + viewport.bottom) / 2);
});

test("Fit Galaxy handles deliberately remote pins and avoids magnifying tiny galaxies", () => {
    const { camera, settle } = makeCamera();
    const viewport = { left: 20, right: 400, top: 240, bottom: 600 };
    camera.fitBounds({ left: -100000, right: 100000, top: -5000, bottom: 8000 }, viewport);
    settle();
    assert.ok(camera.view.scale < 0.08);
    assert.ok(camera.worldToScreen(100000, 8000).x <= viewport.right - 32);
    camera.fitBounds({ left: 10, right: 40, top: 20, bottom: 50 }, viewport);
    settle();
    assert.equal(camera.view.scale, 1);
});
