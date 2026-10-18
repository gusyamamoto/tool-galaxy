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
    function step(elapsed = 16) {
        const pending = [...frames.values()];
        frames.clear();
        time += elapsed;
        pending.forEach((callback) => callback(time));
    }
    function settle() {
        for (let i = 0; frames.size && i < 150; i++) step();
        assert.equal(frames.size, 0, "camera must settle instead of animating forever");
    }
    return { camera, frames, step, settle, renders: () => renders };
}

function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`); }

test('camera changes retain explicit manual ownership only until a programmatic operation replaces it',()=>{
    const {camera,step,settle}=makeCamera(),changes=[];
    camera.onChange=(view,meta)=>changes.push({scale:view.scale,...meta});
    camera.zoomAt(100,100,.4,{source:'user-zoom'});step();
    assert.equal(changes.at(-1).source,'user-zoom');
    assert.equal(changes.at(-1).previousScale,1);
    assert.ok(changes.at(-1).scale<changes.at(-1).previousScale);
    camera.setView({x:0,y:0,scale:.2});settle();
    assert.equal(changes.at(-1).source,'programmatic','pending wheel animation cannot taint navigation');
    camera.setView({x:0,y:0,scale:.1},false,{source:'user-zoom'});
    assert.equal(changes.at(-1).source,'user-zoom');assert.equal(changes.at(-1).previousScale,.2);
    camera.stopAnimation();camera.panTo(20,20);
    assert.equal(changes.at(-1).source,'programmatic');
    camera.travelTo({x:10,y:30,scale:.08},{left:0,top:0,right:400,bottom:800});settle();
    assert.equal(changes.at(-1).source,'navigation');
    camera.setReducedMotion(true);camera.zoomAt(100,100,.5,{source:'user-zoom'});
    assert.equal(changes.at(-1).source,'user-zoom','reduced motion still reports manual ownership');
});

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
    assert.equal(camera.view.scale, camera.maxScale);
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

test("Fit Galaxy handles distant bodies and avoids magnifying tiny galaxies", () => {
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

test('native-pixel framing fits asymmetric world families with one screen-space gutter',()=>{
    const {camera}=makeCamera(),viewport={left:12,right:378,top:24,bottom:510};
    const points=[{x:0,y:0},{x:900,y:180},{x:1200,y:-100}];
    const original=JSON.stringify(points);
    const projected=scale=>({left:Math.min(...points.map(p=>p.x*scale-32)),right:Math.max(...points.map(p=>p.x*scale+32)),top:Math.min(...points.map(p=>p.y*scale-20)),bottom:Math.max(...points.map(p=>p.y*scale+44))});
    const view=camera.projectedBoundsView(projected,viewport,{maxScale:.82});
    camera.setView(view,false);const b=projected(view.scale);
    assert.ok(b.left+view.x>=viewport.left+16-1e-6);assert.ok(b.right+view.x<=viewport.right-16+1e-6);
    assert.ok(b.top+view.y>=viewport.top+16-1e-6);assert.ok(b.bottom+view.y<=viewport.bottom-16+1e-6);
    assert.ok(view.scale>.2&&view.scale<.3,'one-sided family is not symmetrically doubled around its Sun');
    assert.equal(JSON.stringify(points),original);
});

test('native framing includes arbitrarily distant descendants without a semantic scale floor',()=>{
    const {camera}=makeCamera(),viewport={left:0,right:390,top:0,bottom:500};
    const view=camera.projectedBoundsView(s=>({left:-4,right:1e7*s+4,top:-4,bottom:30}),viewport,{maxScale:.82});
    assert.ok(view.scale>0&&view.scale<.0001);assert.equal(camera.minScale,view.scale);
    camera.setView(view,false);assert.ok(camera.worldToScreen(1e7,0).x<=374);
    const tiny=camera.projectedBoundsView(s=>({left:-10,right:s*20+10,top:-10,bottom:35}),viewport,{maxScale:.82});
    assert.equal(tiny.scale,.82,'sparse systems preserve the existing system focus ceiling');
});

test('native framing defers unusable slivers and impossible pixel budgets without changing zoom limits',()=>{
    const {camera}=makeCamera(),project=s=>({left:-40,right:s*200+40,top:-15,bottom:30}),min=camera.minScale;
    assert.equal(camera.projectedBoundsView(project,{left:330,right:390,top:0,bottom:500}),undefined);
    assert.equal(camera.projectedBoundsView(project,{left:0,right:390,top:0,bottom:60}),undefined);
    assert.equal(camera.projectedBoundsView(()=>({left:0,right:1000,top:0,bottom:50}),{left:0,right:390,top:0,bottom:500}),undefined);
    assert.equal(camera.minScale,min);
});

test("focus completion fires once after settling, including reduced motion, and interruption does not complete it", () => {
    const { camera, step, settle } = makeCamera();
    let completed = 0;
    camera.onRest = () => { completed++; assert.equal(camera.frame, null); };
    camera.setView({x:120,y:200,scale:.8});step();assert.equal(completed,0);settle();assert.equal(completed,1);
    camera.setView({x:200,y:300,scale:.6});step();camera.stopAnimation();assert.equal(completed,1);
    camera.setReducedMotion(true);assert.equal(completed,2);
    camera.setView({x:0,y:0,scale:1});assert.equal(completed,3);
});

const travelViewport = {left: 260, right: 1100, top: 40, bottom: 900};
test('nearby navigation travel eases without a context zoom and ends at the exact focus view', () => {
    const {camera, step, settle} = makeCamera();
    const destination = {x: -160, y: 40, scale: 1.2};
    camera.travelTo(destination, travelViewport);
    assert.equal(camera.travel.distant, false);
    assert.ok(camera.travel.duration >= 450 && camera.travel.duration <= 650);
    let completed = 0;
    camera.onRest = () => completed++;
    step(); step();
    assert.ok(camera.view.scale >= 1 && camera.view.scale < 1.01, 'gentle start');
    while (camera.travel) {
        assert.ok(camera.view.scale >= 1 && camera.view.scale <= 1.2, 'no unnecessary zoom out');
        step();
    }
    settle();
    for (const key of ['x','y','scale']) near(camera.view[key], destination[key]);
    assert.equal(completed, 1);
});

test('cross-system and Galaxy travel zoom out, pan continuously, arrive and cap distant timing', () => {
    for (const crossGalaxy of [false, true]) {
        const {camera, step, settle} = makeCamera();
        const destination = {x: -2200, y: -1500, scale: 1.7};
        camera.travelTo(destination, travelViewport, {differentSystem: true, crossGalaxy});
        const {contextScale, duration} = camera.travel;
        assert.ok(contextScale < .68);
        assert.ok(duration >= (crossGalaxy ? 1200 : 800) && duration <= (crossGalaxy ? 1500 : 1100));
        const centers = [], scales = [];
        while (camera.travel) {
            step(); scales.push(camera.view.scale);
            centers.push(camera.screenToWorld(680, 470));
        }
        assert.ok(Math.min(...scales) <= contextScale + 1e-8);
        assert.ok(centers.every((c,i)=>!i || c.x >= centers[i-1].x), 'pan never reverses');
        settle();
        for (const key of ['x','y','scale']) near(camera.view[key], destination[key]);
        camera.travelTo({x:-1e9,y:1e9,scale:1.2}, travelViewport, {crossGalaxy:true});
        assert.equal(camera.travel.duration, 1500);
        assert.ok(camera.travel.contextScale >= camera.minScale);
    }
});

test('wheel, pan, drag cancellation and ordinary focus replace travel from its visible view', () => {
    for (const action of ['wheel', 'pan', 'drag', 'focus']) {
        const {camera, step, settle, frames} = makeCamera();
        camera.travelTo({x:-2000,y:-1000,scale:1.7},travelViewport,{crossGalaxy:true});
        for (let i=0;i<15;i++) step();
        const visible = {...camera.view}, anchor = camera.screenToWorld(400,300);
        if (action === 'wheel') {
            camera.zoomAt(400,300,1.2);
            assert.equal(camera.travel, null);
            near(camera.target.scale,visible.scale*1.2);
            step(); near(camera.screenToWorld(400,300).x,anchor.x); near(camera.screenToWorld(400,300).y,anchor.y);
        } else if (action === 'pan') {
            camera.panTo(visible.x+30,visible.y-20);
            near(camera.view.x,visible.x+30); near(camera.view.scale,visible.scale);
        } else if (action === 'drag') {
            camera.stopAnimation();
            assert.equal(frames.size,0);
            for (const key of ['x','y','scale']) near(camera.view[key],visible[key]);
        } else camera.setView({x:20,y:30,scale:1});
        assert.equal(camera.travel,null);
        settle();
    }
});

test('reduced motion skips navigation travel, including when preference changes mid-route', () => {
    const {camera,step,frames} = makeCamera();
    const destination = {x:-2000,y:-1000,scale:1.7};
    camera.travelTo(destination,travelViewport,{crossGalaxy:true});step();step();
    camera.setReducedMotion(true);
    assert.equal(camera.travel,null);assert.equal(frames.size,0);
    for (const key of ['x','y','scale']) near(camera.view[key],destination[key]);
    camera.travelTo({x:10,y:20,scale:1},travelViewport);
    assert.equal(camera.travel,null);assert.equal(frames.size,0);near(camera.view.x,10);
});

test('navigation travel accelerates through the middle and uses proportional continuous zoom', () => {
    const {camera,step} = makeCamera();
    camera.travelTo({x:-2200,y:-1500,scale:1.7},travelViewport,{crossGalaxy:true});
    const {duration,startScale,contextScale} = camera.travel;
    step();
    const centers = [camera.screenToWorld(680,470)];
    let previous = 0;
    for (const t of [.1,.16,.32,.4,.5,.62,.9,1]) {
        step((t-previous)*duration);previous=t;
        if ([.1,.4,.5,.9,1].includes(t)) centers.push(camera.screenToWorld(680,470));
        if (t === .16) near(camera.view.scale,Math.sqrt(startScale*contextScale));
        if (t === .32 || t === .62) near(camera.view.scale,contextScale);
    }
    const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
    const departure = distance(centers[0],centers[1]);
    const middle = distance(centers[2],centers[3]);
    const arrival = distance(centers[4],centers[5]);
    assert.ok(middle>departure*10 && middle>arrival*10,'equal time windows have a much faster middle');
    near(departure,arrival);
    assert.equal(camera.travel,null);
});
