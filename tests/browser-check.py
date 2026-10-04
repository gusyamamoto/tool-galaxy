"""Real-browser regression checks using only Python's standard library and Chrome/Edge.

Runs on a local HTTP server with an isolated temporary browser profile. It never
opens or modifies your regular browser's localStorage. Use --screenshots to retain
desktop/mobile previews in the OS temporary directory printed at the end.
"""
import argparse
import base64
import functools
import http.server
import json
import os
from pathlib import Path
import shutil
import socket
import struct
import subprocess
import tempfile
import threading
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, BrokenPipeError):
            # Chrome may close speculative HTTP connections during test cleanup.
            pass


class CDP:
    def __init__(self, url):
        from urllib.parse import urlparse
        parsed = urlparse(url)
        self.sock = socket.create_connection((parsed.hostname, parsed.port), timeout=15)
        self.buffer = b""
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(f"GET {parsed.path} HTTP/1.1\r\nHost: {parsed.hostname}:{parsed.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode())
        while b"\r\n\r\n" not in self.buffer:
            self.buffer += self.sock.recv(65536)
        header, self.buffer = self.buffer.split(b"\r\n\r\n", 1)
        assert header.startswith(b"HTTP/1.1 101 "), header
        self.id = 0
        self.errors = []

    def read(self, length):
        while len(self.buffer) < length:
            chunk = self.sock.recv(65536)
            assert chunk, "Browser closed the connection"
            self.buffer += chunk
        result, self.buffer = self.buffer[:length], self.buffer[length:]
        return result

    def receive(self):
        first, second = self.read(2)
        length = second & 127
        if length == 126:
            length = struct.unpack("!H", self.read(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", self.read(8))[0]
        payload = self.read(length)
        assert first & 15 == 1, first
        return json.loads(payload)

    def call(self, method, **params):
        self.id += 1
        payload = json.dumps({"id": self.id, "method": method, "params": params}).encode()
        mask = os.urandom(4)
        header = bytes([129, 128 | len(payload)]) if len(payload) < 126 else bytes([129, 254]) + struct.pack("!H", len(payload))
        self.sock.sendall(header + mask + bytes(value ^ mask[i % 4] for i, value in enumerate(payload)))
        while True:
            message = self.receive()
            if message.get("method") == "Runtime.exceptionThrown":
                self.errors.append(message["params"])
            if message.get("id") == self.id:
                assert "error" not in message, message
                return message.get("result", {})

    def evaluate(self, code):
        response = self.call("Runtime.evaluate", expression=code, returnByValue=True, awaitPromise=True)
        assert "exceptionDetails" not in response, response
        return response["result"].get("value")


def find_browser():
    candidates = [
        os.environ.get("GALAXY_BROWSER", ""),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        shutil.which("google-chrome"), shutil.which("chromium"), shutil.which("chromium-browser")
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    raise RuntimeError("Chrome/Edge was not found. Set GALAXY_BROWSER to its executable path.")


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--screenshots", action="store_true")
    args.add_argument("--visual-only", action="store_true", help="Capture normal/sample zoom levels without the CRUD regression prelude")
    options = args.parse_args()
    browser = find_browser()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    with socket.socket() as port_socket:
        port_socket.bind(("127.0.0.1", 0))
        debug_port = port_socket.getsockname()[1]
    temp_root = Path(tempfile.gettempdir()).resolve()
    profile = Path(tempfile.mkdtemp(prefix="galaxy-test-profile-")).resolve()
    assert profile.is_relative_to(temp_root)
    popen_options = {}
    if os.name == "nt":
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = subprocess.SW_HIDE
        popen_options["startupinfo"] = startup
    process = subprocess.Popen([
        browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        f"--user-data-dir={profile}", f"--remote-debugging-port={debug_port}", "about:blank"
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **popen_options)
    cdp = None
    count = 0
    screenshot_dir = Path(tempfile.mkdtemp(prefix="galaxy-preview-")) if options.screenshots else None
    try:
        until = time.monotonic() + 15
        while True:
            try:
                pages = json.load(urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json", timeout=1))
                page = next(page for page in pages if page["type"] == "page")
                break
            except (OSError, StopIteration):
                assert time.monotonic() < until, "Browser did not start"
                time.sleep(0.1)
        cdp = CDP(page["webSocketDebuggerUrl"])
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Emulation.setDeviceMetricsOverride", width=1440, height=1000, deviceScaleFactor=1, mobile=False)
        origin = f"http://127.0.0.1:{server.server_port}"
        legacy = {
            "version": 2,
            "entries": [
                {"id": "old-star", "name": "Legacy category", "description": "A saved category", "category": "Ideas", "role": "group", "x": 220, "y": 400},
                {"id": "old-moon", "name": "Legacy resource", "description": "A saved resource", "category": "Ideas", "x": 450, "y": 600}
            ],
            "connections": [{"from": "old-moon", "to": "github"}],
            "builtInPositions": [{"id": "github", "x": 310, "y": 300}, {"id": "vs-code", "x": 540, "y": 350}, {"id": "codex", "x": 750, "y": 300}]
        }
        old_raw = json.dumps(legacy)
        cdp.call("Page.addScriptToEvaluateOnNewDocument", source=f"""
            if (location.origin === {json.dumps(origin)} && !sessionStorage.getItem('seeded')) {{
                localStorage.setItem('galaxy:user-data',{json.dumps(old_raw)});
                sessionStorage.setItem('seeded','yes');
            }}
            document.addEventListener('DOMContentLoaded',()=>physics.setReducedMotion(false));
        """)

        def evaluate(code):
            return cdp.evaluate(code)

        def check(condition, title):
            nonlocal count
            assert condition, title
            count += 1
            print(f"PASS {title}", flush=True)

        def wait_for(code, timeout=15):
            until = time.monotonic() + timeout
            while not evaluate(code):
                if time.monotonic() >= until:
                    state = evaluate("typeof physics==='undefined' ? null : ({alpha:physics.simulation.alpha(),target:physics.simulation.alphaTarget(),paused:physics.paused,settled:physics.settled,dragging:[...physics.dragging],hidden:document.hidden,dialog:dialog.open,deleteDialog:deleteDialog.open})")
                    raise AssertionError(f"Timed out: {code}; state: {state}")
                time.sleep(0.1)

        def check_rendered(code, title):
            # Headless rendering can present opacity transitions after a fixed
            # sleep has elapsed. Wait for the existing visual assertion itself.
            wait_for(code)
            check(evaluate(code), title)

        def load():
            wait_for("document.readyState==='complete' && typeof physics!=='undefined'")
            wait_for("physics.settled")

        def wait_camera():
            wait_for("camera.frame===null")
            # Let the compositor present the final transform before mouse hit-testing.
            evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")

        def add(name, role, parent=None, extras=()):
            evaluate(f"""addEntryButton.click();fields[0].value={json.dumps(name)};fields[1].value='Description of '+fields[0].value;
                fields[2].value='Test';roleField.value={json.dumps(role)};roleField.dispatchEvent(new Event('change'));
                parentField.value={json.dumps(parent or '')};parentField.dispatchEvent(new Event('change'));
                [...connectionOptions.querySelectorAll('input')].forEach(c=>c.checked={json.dumps(list(extras))}.includes(c.value));form.requestSubmit();""")
            assert evaluate("!dialog.open"), evaluate("formError.textContent")
            return evaluate("selectedNode.dataset.entryId")

        def edit(entry_id, name=None, role=None, parent=None):
            evaluate(f"selectEntry(entries.get({json.dumps(entry_id)}),nodes.get({json.dumps(entry_id)}));editEntryButton.click()")
            if name is not None:
                evaluate(f"fields[0].value={json.dumps(name)};fields[1].value='Updated description';fields[2].value='Updated label'")
            if role is not None:
                evaluate(f"roleField.value={json.dumps(role)};roleField.dispatchEvent(new Event('change'))")
            if parent is not None:
                evaluate(f"parentField.value={json.dumps(parent)};parentField.dispatchEvent(new Event('change'))")
            evaluate("form.requestSubmit()")

        def hierarchy_edge(parent, child):
            return evaluate(f"connections.some(c=>c.from==={json.dumps(parent)} && c.to==={json.dumps(child)} && c.kind==='hierarchy')")

        def select(entry_id):
            evaluate(f"selectEntry(entries.get({json.dumps(entry_id)}),nodes.get({json.dumps(entry_id)}))")

        def mouse(kind, x, y, **kwargs):
            cdp.call("Input.dispatchMouseEvent", type=kind, x=x, y=y, **kwargs)

        def drag_to(entry_id, world_x, world_y):
            evaluate(f"focusEntry({json.dumps(entry_id)})")
            wait_camera()
            point = evaluate("(()=>{const r=selectedNode.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
            target = evaluate(f"camera.worldToScreen({world_x},{world_y})")
            mouse("mousePressed", **point, button="left", clickCount=1)
            mouse("mouseMoved", **target, button="left", buttons=1)
            time.sleep(0.2)
            mouse("mouseReleased", **target, button="left", clickCount=1)
            wait_for("physics.settled")

        def aligned():
            return evaluate("""lines.every(({from,to,element})=>{
                const m=connectionsLayer.getScreenCTM();return [[from,'x1','y1'],[to,'x2','y2']].every(([id,x,y])=>{
                    const p=new DOMPoint(+element.getAttribute(x),+element.getAttribute(y)).matrixTransform(m);
                    const r=nodes.get(id).getBoundingClientRect();return Math.hypot(p.x-r.x-r.width/2,p.y-r.y-r.height/2)<0.2;
                });
            })""")

        def check_native_rendering(title):
            check(evaluate("nodesLayer.parentElement===graphViewport && getComputedStyle(nodesLayer).transform==='none' && [...nodes.values()].every(n=>{const b=new DOMMatrix(getComputedStyle(n).transform),t=new DOMMatrix(getComputedStyle(n.querySelector('.node-label')).transform);return b.a===1 && b.d===1 && t.a===1 && t.d===1;})"), title)

        def visible_guides():
            return evaluate("orbitGuides.filter(g=>getComputedStyle(g.element).display!=='none' && parseFloat(getComputedStyle(g.element).opacity)>0).length")

        cdp.call("Page.navigate", url=origin)
        load()
        if options.visual_only:
            assert screenshot_dir, "Use --screenshots with --visual-only"

            def capture_levels(prefix, sun_id, planet_id):
                for scale, level in [(0.3, "far"), (0.65, "medium"), (1.7, "close")]:
                    select(planet_id if level == "close" else sun_id)
                    center = evaluate(f"({{...entries.get({json.dumps(planet_id if level == 'close' else sun_id)})}})")
                    evaluate(f"camera.setView({{x:(physics.bounds.left+physics.bounds.right)/2-({center['x']})*{scale},y:(physics.bounds.top+physics.bounds.bottom)/2-({center['y']})*{scale},scale:{scale}}},false)")
                    time.sleep(0.35)
                    result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
                    (screenshot_dir / f"{prefix}-{level}.png").write_bytes(base64.b64decode(result["data"]))
                    check(aligned(), f"{prefix} connections align at {level} zoom")
                    check_native_rendering(f"{prefix} bodies and text use native dimensions at {level} zoom")
                    check(visible_guides() == {"far": 0, "medium": 1, "close": 2}[level], f"{prefix} shows only contextual orbital bands at {level} zoom")
                    check(evaluate("orbitGuides.every(g=>g.element.tagName==='ellipse') && !connectionsLayer.querySelector('path.orbit-guide')"), f"{prefix} has no partial decorative orbit paths")
                    print(f"CAPTURE {prefix}-{level}: " + json.dumps(evaluate("({scale:camera.view.scale,worldTransform:getComputedStyle(graphWorld).transform,nodeTransform:getComputedStyle(selectedNode).transform,labelTransform:getComputedStyle(selectedNode.querySelector('.node-label')).transform,guides:orbitGuides.length})")), flush=True)

                metrics = evaluate("""new Promise(resolve=>{
                    const widths=[],frames=[],native=[],label=selectedNode.querySelector('.node-label');let last;
                    const original=camera.onChange,costs=[];
                    camera.onChange=view=>{const start=performance.now();original(view);costs.push(performance.now()-start);};
                    camera.zoomAt((physics.bounds.left+physics.bounds.right)/2,(physics.bounds.top+physics.bounds.bottom)/2,1.12);
                    const frame=t=>{if(last!==undefined)frames.push(t-last);last=t;
                        widths.push(label.getBoundingClientRect().width);
                        const m=new DOMMatrix(getComputedStyle(label).transform);native.push(m.a===1 && m.d===1);
                        if(camera.frame!==null)requestAnimationFrame(frame);else{
                            camera.onChange=original;costs.sort((a,b)=>a-b);
                            resolve({native:native.every(Boolean),widthChange:Math.max(...widths)-Math.min(...widths),frames:frames.length,renderP95:costs[Math.floor(costs.length*.95)]||0});}};
                    requestAnimationFrame(frame);
                })""")
                check(metrics["native"] and metrics["widthChange"] < 0.2 and metrics["frames"] > 2, f"{prefix} labels stay at native resolution throughout animated zoom")
                check(metrics["renderP95"] < 20, f"{prefix} camera projection remains responsive ({metrics['renderP95']:.1f}ms p95)")

                evaluate(f"(()=>{{const s=entries.get({json.dumps(sun_id)});camera.setView({{x:(physics.bounds.left+physics.bounds.right)/2-s.x*.65,y:(physics.bounds.top+physics.bounds.bottom)/2-s.y*.65,scale:.65}},false);clearSelection();}})()")
                mouse("mouseMoved", 1070, 940)
                point = evaluate(f"(()=>{{const r=nodes.get({json.dumps(sun_id)}).getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}};}})()")
                mouse("mouseMoved", **point)
                wait_for("orbitGuides.filter(g=>g.element.dataset.active==='true').length===1")
                check(visible_guides() == 1, f"{prefix} hover reveals only the nearby system's Sun band")
                mouse("mouseMoved", 1070, 940)
                wait_for("orbitGuides.every(g=>g.element.dataset.active==='false')")
                check(visible_guides() == 0, f"{prefix} guides disappear when neither selected nor hovered")
                select(planet_id)
                evaluate(f"(()=>{{const p=entries.get({json.dumps(planet_id)});camera.setView({{x:(physics.bounds.left+physics.bounds.right)/2-p.x*1.7,y:(physics.bounds.top+physics.bounds.bottom)/2-p.y*1.7,scale:1.7}},false);}})()")

            def drop_beside_pin(entry_id, sibling_id, title):
                select(sibling_id)
                evaluate("pinPositionButton.click()")
                wait_for("physics.settled", timeout=15)
                pin = evaluate(f"({{...entries.get({json.dumps(sibling_id)})}})")
                drag_to(entry_id, pin["x"], pin["y"])
                check(evaluate(f"(()=>{{const a=physics.particles.get({json.dumps(entry_id)}),b=physics.particles.get({json.dumps(sibling_id)});return Math.hypot(a.x-b.x,a.y-b.y)>=a.radius+b.radius+12 && b.x===({pin['x']}) && b.y===({pin['y']}) && a.parentId===b.parentId;}})()"), title)

            sun = add("Visual Sun", "category")
            planet = add("Visual Planet", "subcategory", sun)
            sibling_planet = add("Sibling Planet", "subcategory", sun)
            moon = add("Visual Moon", "entry", planet)
            sibling_moon = add("Sibling Moon", "entry", planet)
            wait_for("physics.settled", timeout=15)
            capture_levels("normal", sun, planet)
            drop_beside_pin(planet, sibling_planet, "normal Planet siblings separate after an overlapping drop beside a pin")
            drop_beside_pin(moon, sibling_moon, "normal Moon siblings separate after an overlapping drop beside a pin")
            evaluate("loadSampleButton.click()")
            wait_for("document.readyState==='complete' && typeof physics!=='undefined' && sampleMode")
            wait_for("physics.settled", timeout=15)
            capture_levels("sample", "sample-sun-technology", "sample-planet-0-0")
            cdp.call("Emulation.setDeviceMetricsOverride", width=1440, height=1000, deviceScaleFactor=2, mobile=False)
            time.sleep(.35)
            check_native_rendering("native body and label transforms also hold on a 2x display")
            result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
            (screenshot_dir / "sample-close-2x.png").write_bytes(base64.b64decode(result["data"]))
            cdp.call("Emulation.setDeviceMetricsOverride", width=1440, height=1000, deviceScaleFactor=1, mobile=False)
            drop_beside_pin("sample-planet-0-0", "sample-planet-0-1", "sample Planet siblings separate without moving an exact pin")
            drop_beside_pin("sample-moon-0-0-0", "sample-moon-0-0-1", "sample Moon siblings separate without moving an exact pin")
            check(not cdp.errors, f"no browser exceptions: {cdp.errors}")
            print(f"{count} visual checks passed", flush=True)
            return
        check(evaluate("entryRoles.category.name==='Sun' && entryRoles.category.body==='sun' && [...roleField.options].every(o=>!o.textContent.includes('Star')) && document.getElementById('role-help').textContent.includes('Sun')"), "hierarchy UI consistently presents top-level entries as Suns")
        check(evaluate("entries.size===5 && entries.get('old-star').role==='category' && entries.get('old-moon').parentId===null"), "legacy roles and unassigned entries remain usable")
        check(evaluate("relationships.length===3"), "legacy optional and built-in connections remain")
        check(evaluate("localStorage.getItem('galaxy:user-data:pre-hierarchy')") == old_raw, "exact pre-hierarchy snapshot retained as backup")
        evaluate("addEntryButton.click();fields[0].value='Blocked moon';fields[1].value='Needs a Planet';roleField.value='entry';roleField.dispatchEvent(new Event('change'));form.requestSubmit()")
        check(evaluate("dialog.open && parentField.validity.valueMissing && document.getElementById('parent-help').textContent.includes('No Planets') && entries.size===5"), "creating a Moon without any Planets is blocked with guidance")
        evaluate("dialog.close()")

        s1 = add("Food", "category")
        check(evaluate(f"entries.get({json.dumps(s1)}).parentId===null"), "create Sun without parent")
        p1 = add("Fruit", "subcategory", s1)
        check(hierarchy_edge(s1, p1), "create Planet with automatic Sun connection")
        m1 = add("Apple", "entry", p1, ["github", "codex"])
        check(hierarchy_edge(p1, m1), "create Moon with automatic Planet connection")
        check(evaluate(f"relationships.filter(c=>c.from==={json.dumps(m1)}).length===2"), "optional relationships coexist with hierarchy")
        s2 = add("Development", "category")
        p2 = add("AI", "subcategory", s2)
        wait_for("physics.settled")
        cdp.call("Page.reload")
        load()
        check(evaluate(f"entries.has({json.dumps(s1)}) && entries.get({json.dumps(p1)}).parentId==={json.dumps(s1)} && entries.get({json.dumps(m1)}).parentId==={json.dumps(p1)}"), "Sun, Planet and Moon persist after refresh")
        check(hierarchy_edge(s1, p1) and hierarchy_edge(p1, m1), "hierarchy connections regenerate on refresh")
        check(evaluate("JSON.parse(localStorage.getItem('galaxy:user-data')).version===4"), "version 4 stores layout separately from hierarchy")

        # Deliberate manual placement, including persistence and the optional hard pin.
        select(s1)
        check(evaluate("panelPlacement.textContent.includes('Automatic') && releasePositionButton.disabled"), "new entries start in Automatic mode")
        evaluate("pinPositionButton.click();window.fixedStar={...entries.get(selectedNode.dataset.entryId)}")
        wait_for("physics.settled")
        check(evaluate(f"layout.get({json.dumps(s1)}).pinned && panelPlacement.textContent.includes('Pinned')"), "Pin position exposes a precise pinned state")
        star = evaluate(f"({{x:entries.get({json.dumps(s1)}).x,y:entries.get({json.dumps(s1)}).y}})")
        planet = evaluate(f"({{x:entries.get({json.dumps(p1)}).x,y:entries.get({json.dumps(p1)}).y}})")
        old_distance = ((planet["x"]-star["x"])**2+(planet["y"]-star["y"])**2)**0.5
        direction = 1 if planet["x"] >= star["x"] else -1
        evaluate(f"window.neighborBefore={{...entries.get({json.dumps(m1)})}}")
        drag_to(p1, planet["x"] + direction * 450, planet["y"] + 60)
        planet_drift = evaluate(f"Math.hypot(entries.get({json.dumps(p1)}).x-layout.get({json.dumps(p1)}).x,entries.get({json.dumps(p1)}).y-layout.get({json.dumps(p1)}).y)")
        check(planet_drift < 85, f"far-dragged Planet settles near the deliberately chosen location ({planet_drift:.1f}px drift)")
        check(evaluate(f"Math.hypot(entries.get({json.dumps(p1)}).x-entries.get({json.dumps(s1)}).x,entries.get({json.dumps(p1)}).y-entries.get({json.dumps(s1)}).y)>{old_distance}+200"), "Planet does not snap back to the original link distance")
        check(evaluate(f"Math.hypot(entries.get({json.dumps(m1)}).x-neighborBefore.x,entries.get({json.dumps(m1)}).y-neighborBefore.y)>5"), "connected neighboring bodies still react to dragging")
        check(evaluate("panelPlacement.textContent.includes('Soft positioned') && !releasePositionButton.disabled"), "drag release shows Soft positioned mode")
        check(evaluate(f"entries.get({json.dumps(s1)}).x===fixedStar.x && entries.get({json.dumps(s1)}).y===fixedStar.y"), "Sun pin stays exact while its Planet moves")

        planet = evaluate(f"({{x:entries.get({json.dumps(p1)}).x,y:entries.get({json.dumps(p1)}).y}})")
        moon = evaluate(f"({{x:entries.get({json.dumps(m1)}).x,y:entries.get({json.dumps(m1)}).y}})")
        moon_direction = -1 if moon["x"] >= planet["x"] else 1
        drag_to(m1, planet["x"] + moon_direction * 230, planet["y"] + 150)
        check(evaluate(f"(entries.get({json.dumps(m1)}).x-entries.get({json.dumps(p1)}).x)*{moon_direction}>100"), "Moon remains on the chosen opposite side of its Planet")
        check(evaluate(f"Math.hypot(entries.get({json.dumps(m1)}).x-layout.get({json.dumps(m1)}).x,entries.get({json.dumps(m1)}).y-layout.get({json.dumps(m1)}).y)<85"), "Moon's soft preference resists its former orientation")
        preferences = evaluate("JSON.parse(JSON.stringify([...layout]))")
        edit(p1, name="Arranged fruit")
        check(evaluate("JSON.parse(JSON.stringify([...layout]))") == preferences, "editing preserves preferred coordinates and pins")
        wait_for("physics.settled")
        cdp.call("Page.reload")
        load()
        check(evaluate("JSON.parse(JSON.stringify([...layout]))") == preferences, "refresh preserves all preferred coordinates and pin modes")
        check(evaluate(f"Math.hypot(entries.get({json.dumps(p1)}).x-layout.get({json.dumps(p1)}).x,entries.get({json.dumps(p1)}).y-layout.get({json.dumps(p1)}).y)<85"), "restored Planet remains softly near its manual location")
        check(hierarchy_edge(s1, p1) and hierarchy_edge(p1, m1), "manual placement leaves hierarchy connections unchanged")

        select(m1)
        evaluate("pinPositionButton.click();window.moonPin={...entries.get(selectedNode.dataset.entryId)}")
        pin = evaluate("({x:moonPin.x,y:moonPin.y})")
        wait_for("physics.settled")
        cdp.call("Page.reload")
        load()
        check(evaluate(f"entries.get({json.dumps(m1)}).x==={pin['x']} && entries.get({json.dumps(m1)}).y==={pin['y']} && layout.get({json.dumps(m1)}).pinned"), "hard pin restores exact world coordinates after refresh")
        drag_to(p1, pin["x"], pin["y"])
        check(evaluate(f"entries.get({json.dumps(m1)}).x==={pin['x']} && entries.get({json.dumps(m1)}).y==={pin['y']}"), "dragging another body around a pin never moves the pinned body")
        check(evaluate(f"Math.hypot(entries.get({json.dumps(p1)}).x-entries.get({json.dumps(m1)}).x,entries.get({json.dumps(p1)}).y-entries.get({json.dumps(m1)}).y)>=physics.particles.get({json.dumps(p1)}).radius+physics.particles.get({json.dumps(m1)}).radius-0.5"), "soft body yields to collisions around a pinned body")
        select(m1)
        evaluate("window.beforeUnpin={...entries.get(selectedNode.dataset.entryId)};pinPositionButton.click()")
        check(evaluate(f"!layout.get({json.dumps(m1)}).pinned && layout.get({json.dumps(m1)}).x===beforeUnpin.x && layout.get({json.dumps(m1)}).y===beforeUnpin.y && physics.particles.get({json.dumps(m1)}).fx===null"), "Unpin retains current position as a soft preference without a jump")
        wait_for("physics.settled")
        cdp.call("Page.reload")
        load()
        check(evaluate(f"!layout.get({json.dumps(m1)}).pinned && physics.particles.get({json.dumps(m1)}).fx===null"), "Unpin remains soft after refresh")
        for entry_id in [p1, m1, s1]:
            select(entry_id)
            evaluate("releasePositionButton.click()")
        wait_for("physics.settled")
        check(evaluate("layout.size===0 && panelPlacement.textContent.includes('Automatic')"), "Release to physics clears preferences and every pin")
        cdp.call("Page.reload")
        load()
        check(evaluate("layout.size===0 && JSON.parse(localStorage.getItem('galaxy:user-data')).layout.length===0"), "Release to physics persists automatic layout after refresh")
        check(aligned(), "connections follow bodies through all three placement modes")

        edit(s1, name="Cuisine")
        edit(p1, name="Seasonal fruit")
        edit(m1, name="Green apple")
        check(evaluate(f"entries.get({json.dumps(s1)}).name==='Cuisine' && entries.get({json.dumps(p1)}).name==='Seasonal fruit' && entries.get({json.dumps(m1)}).name==='Green apple'"), "edit all three types while preserving their IDs")
        check(evaluate(f"nodes.get({json.dumps(m1)}).querySelector('.node-label').textContent==='Green apple' && panelDescription.textContent==='Updated description' && panelCategory.textContent.includes('Updated label')"), "edited label, description and category update immediately")
        edit(p1, parent=s2)
        check(not hierarchy_edge(s1, p1) and hierarchy_edge(s2, p1), "move Planet to another Sun and replace its hierarchy edge")
        check(evaluate(f"entries.get({json.dumps(m1)}).parentId==={json.dumps(p1)}"), "Planet reparenting preserves its children")
        edit(m1, parent=p2)
        check(not hierarchy_edge(p1, m1) and hierarchy_edge(p2, m1), "move Moon to another Planet and replace its hierarchy edge")
        check(evaluate(f"physics.particles.get({json.dumps(m1)}).parentId==={json.dumps(p2)}"), "reparenting updates the live physics particles")
        check(evaluate(f"relationships.filter(c=>c.from==={json.dumps(m1)} || c.to==={json.dumps(m1)}).length===2"), "editing and reparenting preserve optional connections")

        edit(s2, role="entry", parent=p1)
        check(evaluate("dialog.open && !formError.hidden && formError.textContent.includes('children')"), "incompatible role changes with children are blocked")
        evaluate("dialog.close()")
        edit(p1, role="category")
        check(evaluate(f"entries.get({json.dumps(p1)}).role==='category' && entries.get({json.dumps(p1)}).parentId===null && nodes.get({json.dumps(p1)}).dataset.body==='sun'"), "role edit updates celestial appearance and hierarchy")
        edit(p1, role="subcategory", parent=s1)
        check(hierarchy_edge(s1, p1), "role edit can restore a valid Planet parent")

        evaluate("addEntryButton.click();roleField.value='entry';roleField.dispatchEvent(new Event('change'))")
        check(evaluate("[...parentField.options].slice(1).every(o=>entries.get(o.value).role==='subcategory') && parentField.required"), "Moon form offers only Planets as parents")
        evaluate("roleField.value='subcategory';roleField.dispatchEvent(new Event('change'))")
        check(evaluate("[...parentField.options].slice(1).every(o=>entries.get(o.value).role==='category')"), "Planet form offers only Suns as parents")
        evaluate("roleField.value='category';roleField.dispatchEvent(new Event('change'))")
        check(evaluate("!parentField.required && document.getElementById('parent-field').hidden"), "Sun form hides and clears parent selection")
        evaluate("dialog.close()")

        wait_for("physics.settled")
        check(aligned(), "all dynamic connections align with settled bodies")
        moon_distance = evaluate(f"Math.hypot(entries.get({json.dumps(m1)}).x-entries.get({json.dumps(p2)}).x,entries.get({json.dumps(m1)}).y-entries.get({json.dumps(p2)}).y)")
        # Two optional links can stretch the automatic Moon cluster a little.
        check(moon_distance < 300, f"Moons settle near their Planet ({moon_distance:.1f}px)")
        evaluate(f"focusEntry({json.dumps(s2)})")
        wait_camera()
        evaluate("physics.pause();window.dragStart={...entries.get(selectedNode.dataset.entryId)};window.childBefore={...entries.get(" + json.dumps(p2) + ")}")
        point = evaluate("(()=>{const r=selectedNode.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
        scale = evaluate("camera.view.scale")
        hit = evaluate(f"document.elementFromPoint({point['x']},{point['y']})?.closest('.entry-node')?.dataset.entryId")
        check(hit == s2, "focused parent is reachable at its center")
        mouse("mouseMoved", **point)
        wait_camera()
        check(evaluate(f"document.elementFromPoint({point['x']},{point['y']})?.closest('.entry-node')?.dataset.entryId") == s2, "browser focus restoration does not redirect the camera during pointer input")
        mouse("mousePressed", **point, button="left", clickCount=1)
        mouse("mouseMoved", point["x"] + 35, point["y"] + 25, button="left", buttons=1)
        drag_error = evaluate(f"Math.abs(entries.get({json.dumps(s2)}).x-dragStart.x-35/{scale})")
        drag_state = evaluate("({selected:selectedNode.dataset.entryId,activeNodeDrags,pan,view:camera.view,scroll:[graphViewport.scrollLeft,graphViewport.scrollTop]})")
        check(drag_error < 0.5, f"parent dragging works at focused zoom (error {drag_error:.2f}px; expected {s2}; state {drag_state})")
        check(aligned(), "connections update while parent is dragged")
        evaluate("physics.resume()")
        time.sleep(0.25)
        check(evaluate(f"Math.hypot(entries.get({json.dumps(p2)}).x-childBefore.x,entries.get({json.dumps(p2)}).y-childBefore.y)>1"), "dragging a parent makes its child system react")
        mouse("mouseReleased", point["x"] + 35, point["y"] + 25, button="left", clickCount=1)
        wait_for("physics.settled")
        check(evaluate(f"entries.get({json.dumps(p2)}).parentId==={json.dumps(s2)}"), "dragging preserves hierarchy")
        evaluate(f"focusEntry({json.dumps(m1)})")
        wait_camera()
        point = evaluate("(()=>{const r=selectedNode.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
        mouse("mousePressed", **point, button="left", clickCount=1)
        mouse("mouseMoved", point["x"] - 25, point["y"] + 20, button="left", buttons=1)
        mouse("mouseReleased", point["x"] - 25, point["y"] + 20, button="left", clickCount=1)
        wait_for("physics.settled")
        check(evaluate(f"entries.get({json.dumps(m1)}).parentId==={json.dumps(p2)}") and hierarchy_edge(p2, m1), "dragging a child preserves its parent and hierarchy connection")

        select(s2)
        evaluate("deleteEntryButton.click()")
        check(evaluate("!deleteDialog.open && !actionStatus.hidden && actionStatus.textContent.includes('child')"), "deleting a parent with children is safely blocked")
        select(m1)
        evaluate("deleteEntryButton.click()")
        check(evaluate("deleteDialog.open && physics.paused"), "deleting a leaf requires confirmation")
        evaluate("document.getElementById('cancel-delete-entry').click()")
        check(evaluate(f"entries.has({json.dumps(m1)})"), "canceling deletion preserves the entry")
        evaluate("deleteEntryButton.click();document.getElementById('delete-entry-form').requestSubmit()")
        check(evaluate(f"!entries.has({json.dumps(m1)}) && !nodes.has({json.dumps(m1)}) && !layout.has({json.dumps(m1)}) && !physics.particles.has({json.dumps(m1)}) && !connections.some(c=>c.from==={json.dumps(m1)} || c.to==={json.dumps(m1)})"), "confirmed deletion removes node, layout, connections and physics particle")
        check(evaluate("selectedNode===null && entryActions.hidden && panelName.textContent==='Select an entry'"), "deletion clears the selected detail panel")

        wait_for("physics.settled")
        evaluate("camera.setView({x:-1500,y:-900,scale:0.55},false);searchField.value='seasonal';searchField.dispatchEvent(new Event('input'))")
        check(evaluate("!searchResults.hidden && searchResultList.querySelectorAll('button').length===1"), "case-insensitive name search finds an edited entry")
        evaluate("searchResultList.querySelector('button').click()")
        check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(p1)} && panelName.textContent==='Seasonal fruit' && camera.frame!==null"), "search result selects entry, opens details and smoothly focuses camera")
        wait_camera()
        check(evaluate("(()=>{const p=camera.worldToScreen(entries.get(selectedNode.dataset.entryId).x,entries.get(selectedNode.dataset.entryId).y);return Math.abs(p.x-(physics.bounds.left+physics.bounds.right)/2)<1 && Math.abs(p.y-(physics.bounds.top+physics.bounds.bottom)/2)<1 && camera.view.scale>=1;})()"), "search focus centers the entry at a useful scale")

        evaluate("window.zoomBefore=camera.view.scale")
        mouse("mouseWheel", 600, 500, deltaX=0, deltaY=-120)
        wait_camera()
        check(evaluate("camera.view.scale>zoomBefore"), "normal wheel zoom continues after search focus")
        evaluate("window.panBefore={...camera.view}")
        mouse("mousePressed", 1000, 800, button="left", clickCount=1)
        mouse("mouseMoved", 1040, 820, button="left", buttons=1)
        mouse("mouseReleased", 1040, 820, button="left", clickCount=1)
        check(evaluate("Math.abs(camera.view.x-panBefore.x-40)<0.5 && Math.abs(camera.view.y-panBefore.y-20)<0.5"), "normal background panning continues after search focus")
        evaluate("document.getElementById('reset-view-button').click()")
        wait_camera()
        check(evaluate("(()=>{const b=galaxyBounds(),a=camera.worldToScreen(b.left,b.top),z=camera.worldToScreen(b.right,b.bottom);return a.x>=physics.bounds.left+31 && a.y>=physics.bounds.top+31 && z.x<=physics.bounds.right-31 && z.y<=physics.bounds.bottom-31;})()"), "Fit Galaxy centers and fits the small dataset beside panels")

        edit("github", name="Repositories", role="category")
        check(evaluate("deleteEntryButton.hidden && panelName.textContent==='Repositories'"), "built-in entries can be edited but stay protected from deletion")
        wait_for("physics.settled")
        cdp.call("Page.reload")
        load()
        check(evaluate(f"!entries.has({json.dumps(m1)}) && entries.get('github').name==='Repositories' && entries.get('github').role==='category' && entries.get({json.dumps(p1)}).parentId==={json.dumps(s1)}"), "refresh retains deletion, edits, role changes and reparenting")
        check(evaluate("localStorage.getItem('galaxy:user-data:pre-hierarchy')") == old_raw, "later saves keep the original migration backup unchanged")
        check(aligned(), "connections load correctly after edited/deleted hierarchy refresh")

        for width, height, name in [(1440, 1000, "desktop"), (430, 932, "mobile")]:
            cdp.call("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=1, mobile=width < 760)
            time.sleep(0.2)
            wait_for("physics.settled")
            select(p1)
            check(evaluate("document.documentElement.scrollWidth===innerWidth"), f"{name} layout has no horizontal overflow")
            check(aligned(), f"{name} connections follow responsive body sizes")
            if screenshot_dir:
                result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
                (screenshot_dir / f"{name}.png").write_bytes(base64.b64decode(result["data"]))
            check(evaluate("(()=>{const p=panel.getBoundingClientRect();return [entryActions,panelPlacement,pinPositionButton,releasePositionButton].every(el=>{const a=el.getBoundingClientRect();return a.top>=p.top && a.bottom<=p.bottom && a.left>=p.left && a.right<=p.right;});})()"), f"{name} entry actions and placement controls stay visible without scrolling")
            evaluate("editEntryButton.click()")
            check(evaluate("dialog.open && parentField.value===entries.get(editingId).parentId"), f"{name} edit form loads the correct parent")
            if screenshot_dir:
                result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
                (screenshot_dir / f"{name}-form.png").write_bytes(base64.b64decode(result["data"]))
            evaluate("dialog.close()")

        # Load the actual development sample from its visible UI control. It must
        # never replace the saved galaxy, and its activation URL must be transient.
        # Flush any responsive-layout movement before taking the byte-for-byte baseline;
        # pagehide would otherwise persist it during the navigation below.
        cdp.call("Emulation.setDeviceMetricsOverride", width=1440, height=1000, deviceScaleFactor=1, mobile=False)
        time.sleep(0.2)
        wait_for("physics.settled")
        evaluate("physics.pause();saveGalaxy()")
        real_snapshot = evaluate("localStorage.getItem('galaxy:user-data')")
        started = time.monotonic()
        check(evaluate("!sampleMode && !loadSampleButton.disabled && removeSampleButton.disabled"), "development controls offer Load Sample Galaxy in the real galaxy")
        evaluate("loadSampleButton.click()")
        wait_for("document.readyState==='complete' && typeof physics!=='undefined'")
        wait_for("physics.settled", timeout=15)
        density_settle = time.monotonic() - started
        check(evaluate("sampleMode && sampleControls.classList.contains('sample-active') && sampleModeLabel.textContent==='Sample galaxy' && entries.size===77 && [...entries.values()].filter(e=>e.role==='category').length===7 && [...entries.values()].filter(e=>e.role==='subcategory').length===21 && [...entries.values()].filter(e=>e.role==='entry').length===49"), "development sample loads 7 Suns, 21 Planets and 49 Moons")
        check(evaluate("loadSampleButton.disabled && !removeSampleButton.disabled && !location.search.includes('sample')"), "sample mode exposes Remove Sample Galaxy and cannot survive a refresh")
        check(evaluate("connections.length===70 && connections.every(c=>c.kind==='hierarchy')"), "all 70 sample connections come from normal hierarchy data")
        check(evaluate("localStorage.getItem('galaxy:user-data')") == real_snapshot, "loading the sample leaves the saved galaxy untouched")
        check(density_settle < 15, f"77-body sample settles in a reasonable time ({density_settle:.2f}s)")
        wait_camera()
        check(evaluate("physics.systems.size===7 && [...physics.systems.values()].every(s=>s.members.length===11)"), "77 bodies are grouped into seven independent solar systems")
        metrics = evaluate("""(()=>{const systems=[...physics.systems.values()];return {
            maxSunExtent:Math.max(...systems.map(s=>Math.hypot(s.root.x-physics.origin.x,s.root.y-physics.origin.y))),
            galaxyRadius:physics.galaxyRadius,
            minSeparation:Math.min(...systems.flatMap((s,i)=>systems.slice(i+1).map(t=>Math.hypot(s.root.x-t.root.x,s.root.y-t.root.y)/(s.radius+t.radius)))),
            maxPlanetDistance:Math.max(...[...physics.particles.values()].filter(n=>n.role==='subcategory').map(n=>Math.hypot(n.x-n.parent.x,n.y-n.parent.y))),
            maxMoonDistance:Math.max(...[...physics.particles.values()].filter(n=>n.parent && n.role==='entry').map(n=>Math.hypot(n.x-n.parent.x,n.y-n.parent.y))),
            fitScale:camera.view.scale};})()""")
        check(metrics["minSeparation"] > .85, f"solar systems remain separated ({metrics['minSeparation']:.2f} footprint ratio)")
        check(metrics["maxSunExtent"] < metrics["galaxyRadius"], f"system centers stay in the soft galaxy extent ({metrics['maxSunExtent']:.0f}px)")
        check(metrics["maxPlanetDistance"] < 240 and metrics["maxMoonDistance"] < 125, f"Planets and Moons retain local hierarchy ({metrics['maxPlanetDistance']:.0f}/{metrics['maxMoonDistance']:.0f}px maximum parent distances)")
        check(evaluate("(()=>{const b=galaxyBounds(),a=camera.worldToScreen(b.left,b.top),z=camera.worldToScreen(b.right,b.bottom);return a.x>=physics.bounds.left+31 && a.y>=physics.bounds.top+31 && z.x<=physics.bounds.right-31 && z.y<=physics.bounds.bottom-31;})()"), "initial Fit Galaxy shows every sample body inside the usable viewport")
        if screenshot_dir:
            result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
            (screenshot_dir / "sample-fit-galaxy.png").write_bytes(base64.b64decode(result["data"]))

        evaluate("(()=>{const s=entries.get('sample-sun-technology');camera.setView({x:(physics.bounds.left+physics.bounds.right)/2-s.x,y:(physics.bounds.top+physics.bounds.bottom)/2-s.y,scale:1},false);})()")
        sizes = evaluate("(()=>Object.fromEntries(['category','subcategory','entry'].map(role=>{const r=nodes.get([...entries.values()].find(e=>e.role===role).id).getBoundingClientRect();return [role,r.width];})))()")
        check(58 <= sizes["category"] <= 66 and 43 <= sizes["subcategory"] <= 49 and 27 <= sizes["entry"] <= 33 and sizes["category"] > sizes["subcategory"] > sizes["entry"], f"compact hierarchy renders at Sun/Planet/Moon {sizes['category']:.1f}/{sizes['subcategory']:.1f}/{sizes['entry']:.1f}px")
        check(evaluate("[...nodes.values()].every(n=>n.querySelector('.node-label').getBoundingClientRect().width<=n.getBoundingClientRect().width+23)"), "normal labels stay compact relative to their bodies")
        check(evaluate("nodes.get('sample-sun-technology').dataset.body==='sun' && getComputedStyle(nodes.get('sample-sun-technology')).backgroundImage.includes('radial-gradient') && getComputedStyle(nodes.get('sample-sun-technology')).boxShadow!=='none'"), "sample Suns use their distinct luminous rendering")
        time.sleep(.25)
        if screenshot_dir:
            result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
            (screenshot_dir / "sample-overview-100-percent.png").write_bytes(base64.b64decode(result["data"]))

        evaluate("(()=>{const s=entries.get('sample-sun-technology');camera.setView({x:(physics.bounds.left+physics.bounds.right)/2-s.x*.65,y:(physics.bounds.top+physics.bounds.bottom)/2-s.y*.65,scale:.65},false);})()")
        time.sleep(0.25)
        check_rendered("galaxy.dataset.detailLevel==='medium' && getComputedStyle(nodes.get('sample-moon-0-0-0').querySelector('.node-label')).opacity==='0' && parseFloat(getComputedStyle(nodes.get('sample-planet-0-0').querySelector('.node-label')).opacity)>.9", "65% system zoom prioritizes Planet names and suppresses routine Moon labels")
        select("sample-planet-0-0")
        time.sleep(.25)
        check_rendered("parseFloat(getComputedStyle(nodes.get('sample-moon-0-0-0').querySelector('.node-label')).opacity)>.9 && nodes.get('sample-sun-technology').classList.contains('related') && nodes.get('sample-planet-0-1').classList.contains('related')", "Planet selection reveals its Moons, sibling Planets and Sun")
        evaluate("clearSelection()")
        time.sleep(.25)
        if screenshot_dir:
            result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
            (screenshot_dir / "sample-overview-60-percent.png").write_bytes(base64.b64decode(result["data"]))
        evaluate("fitGalaxy(false)")
        time.sleep(0.25)
        check_rendered("galaxy.dataset.detailLevel==='far' && getComputedStyle(nodes.get('sample-moon-0-0-0').querySelector('.node-label')).opacity==='0' && parseFloat(getComputedStyle(nodes.get('sample-moon-0-0-0')).opacity)<.03 && parseFloat(getComputedStyle(nodes.get('sample-sun-technology').querySelector('.node-label')).opacity)>.8", "Galaxy overview hides routine Moons while retaining readable Sun landmarks")
        check(evaluate("parseFloat(getComputedStyle(lines.find(l=>!l.element.classList.contains('selected')).element).opacity)<=.1"), "Galaxy overview keeps unselected connections restrained")
        check(evaluate("nodes.get('sample-sun-technology').getBoundingClientRect().width>=18"), "Sun landmarks retain a usable screen size at far zoom")
        select("sample-moon-0-0-0")
        time.sleep(0.25)
        check_rendered("getComputedStyle(nodes.get('sample-moon-0-0-0').querySelector('.node-label')).opacity==='1' && nodes.get('sample-moon-0-0-0').querySelector('.node-label').getBoundingClientRect().height>=9 && lines.some(l=>l.element.classList.contains('context-link') && parseFloat(getComputedStyle(l.element).opacity)>0 && parseFloat(getComputedStyle(l.element).opacity)<=.12) && nodes.get('sample-sun-technology').classList.contains('related')", "selected sample Moon and its ancestry remain identifiable with subtle contextual links at Galaxy zoom")
        if screenshot_dir:
            result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
            (screenshot_dir / "sample-overview-30-percent.png").write_bytes(base64.b64decode(result["data"]))

        evaluate("clearSelection();searchField.value='Visual Studio';searchField.dispatchEvent(new Event('input'))")
        time.sleep(.25)
        check_rendered("nodes.get('sample-moon-0-0-0').classList.contains('search-match') && getComputedStyle(nodes.get('sample-moon-0-0-0')).opacity==='1'", "search matches reveal a hidden Moon even before focusing")
        evaluate("searchResultList.querySelector('button').click()")
        wait_camera()
        time.sleep(.25)
        check(evaluate("selectedNode.dataset.entryId==='sample-moon-0-0-0' && panelName.textContent==='Visual Studio Code' && camera.view.scale>=1.15 && galaxy.dataset.detailLevel==='near' && nodes.get('sample-planet-0-0').classList.contains('related') && nodes.get('sample-sun-technology').classList.contains('related')"), "Moon search smoothly reveals entry details and ancestry at close zoom")
        check_rendered("getComputedStyle(nodes.get('sample-moon-0-0-1').querySelector('.node-label')).opacity==='1'", "close zoom makes routine Moon labels usable")
        evaluate("searchField.value='';refreshSearchResults()")
        if screenshot_dir:
            result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
            (screenshot_dir / "sample-entry-focus.png").write_bytes(base64.b64decode(result["data"]))

        sun_before = evaluate("({...entries.get('sample-sun-technology')})")
        moon_before = evaluate("({...entries.get('sample-moon-0-0-0')})")
        drag_to("sample-sun-technology", sun_before["x"] + 160, sun_before["y"] + 80)
        check(evaluate("layout.has('sample-sun-technology') && Math.hypot(entries.get('sample-sun-technology').x-layout.get('sample-sun-technology').x,entries.get('sample-sun-technology').y-layout.get('sample-sun-technology').y)<75"), "sample Sun retains its soft system position after dragging")
        check(evaluate(f"Math.hypot(entries.get('sample-moon-0-0-0').x-({moon_before['x']}),entries.get('sample-moon-0-0-0').y-({moon_before['y']}))>80"), "sample Sun dragging carries its descendants")
        planet_before = evaluate("({...entries.get('sample-planet-0-0')})")
        drag_to("sample-planet-0-0", planet_before["x"] + 100, planet_before["y"] - 70)
        check(evaluate("layout.has('sample-planet-0-0') && Math.hypot(entries.get('sample-moon-0-0-0').x-entries.get('sample-planet-0-0').x,entries.get('sample-moon-0-0-0').y-entries.get('sample-planet-0-0').y)<125"), "sample Planet dragging maintains its local Moon cluster")

        dense_moon = evaluate("({...entries.get('sample-moon-0-0-0')})")
        drag_to("sample-moon-0-0-0", dense_moon["x"] + 90, dense_moon["y"] + 45)
        check(evaluate("layout.has('sample-moon-0-0-0') && entries.get('sample-moon-0-0-0').parentId==='sample-planet-0-0'"), "dragging and soft positioning remain functional in sample mode")
        evaluate("pinPositionButton.click();window.samplePin={...entries.get('sample-moon-0-0-0')}")
        sun_before = evaluate("({...entries.get('sample-sun-technology')})")
        drag_to("sample-sun-technology", sun_before["x"] + 100, sun_before["y"] - 40)
        check(evaluate("layout.get('sample-moon-0-0-0').pinned && entries.get('sample-moon-0-0-0').x===samplePin.x && entries.get('sample-moon-0-0-0').y===samplePin.y"), "sample Moon pin remains exact while its Sun moves")
        select("sample-moon-0-0-0")
        evaluate("releasePositionButton.click()")
        wait_for("physics.settled")
        check(evaluate("!layout.has('sample-moon-0-0-0') && Math.hypot(entries.get('sample-moon-0-0-0').x-entries.get('sample-planet-0-0').x,entries.get('sample-moon-0-0-0').y-entries.get('sample-planet-0-0').y)<125"), "sample Release to physics returns a Moon to its local orbit")
        check(evaluate("localStorage.getItem('galaxy:user-data')") == real_snapshot, "sample interactions still do not write localStorage")
        evaluate("searchField.value='Music';searchField.dispatchEvent(new Event('input'));searchResultList.querySelector('button').click()")
        wait_camera()
        check(evaluate("selectedNode.dataset.entryId==='sample-sun-music' && camera.view.scale>=1"), "search finds and focuses a sample Sun")

        performance = evaluate("""new Promise(resolve=>{
            const originalTick=physics.onTick, costs=[], frames=[];
            physics.onTick=p=>{const start=performance.now();originalTick(p);costs.push(performance.now()-start);};
            physics.reheat(.3);let last;
            const frame=t=>{if(last!==undefined)frames.push(t-last);last=t;
                if(frames.length<60)requestAnimationFrame(frame);else{
                    physics.onTick=originalTick;costs.sort((a,b)=>a-b);frames.sort((a,b)=>a-b);
                    resolve({renderP95:costs[Math.floor(costs.length*.95)]||0,frameMedian:frames[30],frameP95:frames[57],samples:costs.length});}};
            requestAnimationFrame(frame);
        })""")
        check(performance["renderP95"] < 20 and performance["frameMedian"] < 35 and performance["frameP95"] < 80 and performance["samples"] > 10, f"77-body motion remains responsive (render p95 {performance['renderP95']:.1f}ms; frame median/p95 {performance['frameMedian']:.1f}/{performance['frameP95']:.1f}ms)")
        wait_for("physics.settled")
        evaluate("clearSelection();searchField.value='';refreshSearchResults();fitGalaxy()")
        wait_camera()
        for width, height, name in [(1440, 1000, "desktop"), (430, 932, "mobile")]:
            cdp.call("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=1, mobile=width < 760)
            wait_for("physics.settled")
            evaluate("fitGalaxy()")
            wait_camera()
            check(evaluate("(()=>{const b=galaxyBounds(),a=camera.worldToScreen(b.left,b.top),z=camera.worldToScreen(b.right,b.bottom);return a.x>=physics.bounds.left+31 && a.y>=physics.bounds.top+31 && z.x<=physics.bounds.right-31 && z.y<=physics.bounds.bottom-31;})()"), f"{name} Fit Galaxy includes the dragged sample and avoids UI panels")
            check(evaluate("nodes.get('sample-sun-technology').getBoundingClientRect().width>=17 && nodes.get('sample-sun-technology').querySelector('.node-label').getBoundingClientRect().height>=10"), f"{name} Sun landmarks and names remain readable at fitted zoom")
            if screenshot_dir:
                result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
                (screenshot_dir / f"sample-fit-{name}.png").write_bytes(base64.b64decode(result["data"]))

        cdp.call("Page.reload", ignoreCache=True)
        wait_for("document.readyState==='complete' && typeof physics!=='undefined' && !sampleMode")
        wait_for("physics.settled")
        check(evaluate("!entries.has('sample-sun-technology') && entries.has('github')"), "refreshing sample mode returns to the saved galaxy")
        check(evaluate("!JSON.parse(localStorage.getItem('galaxy:user-data')).entries.some(entry=>entry.id.startsWith('sample-'))"), "refresh never mixes sample entries into the saved galaxy")

        evaluate("loadSampleButton.click()")
        wait_for("document.readyState==='complete' && typeof physics!=='undefined' && sampleMode")
        check(evaluate("!removeSampleButton.disabled && entries.size===77"), "Load Sample Galaxy remains available for another manual session")
        evaluate("removeSampleButton.click()")
        wait_for("document.readyState==='complete' && typeof physics!=='undefined' && !sampleMode")
        wait_for("physics.settled")
        check(evaluate("!entries.has('sample-sun-technology') && entries.has('github')"), "Remove Sample Galaxy returns to the saved galaxy")
        check(evaluate("!JSON.parse(localStorage.getItem('galaxy:user-data')).entries.some(entry=>entry.id.startsWith('sample-'))"), "Remove Sample Galaxy never mixes sample entries into persistent storage")
        evaluate("1")
        check(not cdp.errors, f"no browser exceptions: {cdp.errors}")
        print(f"{count} browser checks passed", flush=True)
    finally:
        if cdp:
            if screenshot_dir:
                try:
                    result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
                    (screenshot_dir / "last-state.png").write_bytes(base64.b64decode(result["data"]))
                    print(f"Screenshots: {screenshot_dir}", flush=True)
                except (OSError, AssertionError):
                    pass
            cdp.sock.close()
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
        server.shutdown()
        assert profile.is_relative_to(temp_root) and profile.name.startswith("galaxy-test-profile-")
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
