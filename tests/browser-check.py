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

        def wait_for(code, timeout=8):
            until = time.monotonic() + timeout
            while not evaluate(code):
                assert time.monotonic() < until, f"Timed out: {code}"
                time.sleep(0.1)

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

        cdp.call("Page.navigate", url=origin)
        load()
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
        check(evaluate("camera.view.scale===1 && camera.view.x===0 && camera.view.y===0"), "Reset View remains functional")

        edit("github", name="Repositories", role="category")
        check(evaluate("deleteEntryButton.hidden && panelName.textContent==='Repositories'"), "built-in entries can be edited but stay protected from deletion")
        wait_for("physics.settled")
        cdp.call("Page.reload")
        load()
        check(evaluate(f"!entries.has({json.dumps(m1)}) && entries.get('github').name==='Repositories' && entries.get('github').role==='category' && entries.get({json.dumps(p1)}).parentId==={json.dumps(s1)}"), "refresh retains deletion, edits, role changes and reparenting")
        check(evaluate("localStorage.getItem('galaxy:user-data:pre-hierarchy')") == old_raw, "later saves keep the original migration backup unchanged")
        check(aligned(), "connections load correctly after edited/deleted hierarchy refresh")

        screenshot_dir = Path(tempfile.mkdtemp(prefix="galaxy-preview-")) if options.screenshots else None
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

        # The actual URL-driven development sample must never replace the saved galaxy.
        # Flush any responsive-layout movement before taking the byte-for-byte baseline;
        # pagehide would otherwise persist it during the navigation below.
        evaluate("physics.pause();saveGalaxy()")
        real_snapshot = evaluate("localStorage.getItem('galaxy:user-data')")
        cdp.call("Emulation.setDeviceMetricsOverride", width=1440, height=1000, deviceScaleFactor=1, mobile=False)
        started = time.monotonic()
        cdp.call("Page.navigate", url=f"{origin}/?sample=large")
        wait_for("document.readyState==='complete' && typeof physics!=='undefined'")
        wait_for("physics.settled", timeout=15)
        density_settle = time.monotonic() - started
        check(evaluate("sampleMode && !sampleModeBanner.hidden && entries.size===77 && [...entries.values()].filter(e=>e.role==='category').length===7 && [...entries.values()].filter(e=>e.role==='subcategory').length===21 && [...entries.values()].filter(e=>e.role==='entry').length===49"), "development sample loads 7 Suns, 21 Planets and 49 Moons")
        check(evaluate("connections.length===70 && connections.every(c=>c.kind==='hierarchy')"), "all 70 sample connections come from normal hierarchy data")
        check(evaluate("localStorage.getItem('galaxy:user-data')") == real_snapshot, "loading the sample leaves the saved galaxy untouched")
        check(density_settle < 15, f"77-body sample settles in a reasonable time ({density_settle:.2f}s)")

        evaluate("camera.setView({x:0,y:0,scale:1},false)")
        sizes = evaluate("(()=>Object.fromEntries(['category','subcategory','entry'].map(role=>{const r=nodes.get([...entries.values()].find(e=>e.role===role).id).getBoundingClientRect();return [role,r.width];})))()")
        check(58 <= sizes["category"] <= 66 and 43 <= sizes["subcategory"] <= 49 and 27 <= sizes["entry"] <= 33 and sizes["category"] > sizes["subcategory"] > sizes["entry"], f"compact hierarchy renders at Sun/Planet/Moon {sizes['category']:.1f}/{sizes['subcategory']:.1f}/{sizes['entry']:.1f}px")
        check(evaluate("[...nodes.values()].every(n=>n.querySelector('.node-label').getBoundingClientRect().width<=n.getBoundingClientRect().width+23)"), "normal labels stay compact relative to their bodies")
        check(evaluate("nodes.get('sample-sun-technology').dataset.body==='sun' && getComputedStyle(nodes.get('sample-sun-technology')).backgroundImage.includes('radial-gradient') && getComputedStyle(nodes.get('sample-sun-technology')).boxShadow!=='none'"), "sample Suns use their distinct luminous rendering")
        if screenshot_dir:
            result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
            (screenshot_dir / "sample-overview-100-percent.png").write_bytes(base64.b64decode(result["data"]))

        evaluate("camera.setView({x:260,y:150,scale:.6},false)")
        time.sleep(0.25)
        check(evaluate("galaxy.dataset.detailLevel==='medium' && parseFloat(getComputedStyle(nodes.get('sample-moon-0-0-0').querySelector('.node-label')).opacity)>0"), "60% zoom keeps all names with reduced Moon prominence")
        if screenshot_dir:
            result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
            (screenshot_dir / "sample-overview-60-percent.png").write_bytes(base64.b64decode(result["data"]))
        evaluate("camera.setView({x:430,y:260,scale:.3},false)")
        time.sleep(0.25)
        check(evaluate("galaxy.dataset.detailLevel==='far' && getComputedStyle(nodes.get('sample-moon-0-0-0').querySelector('.node-label')).opacity==='0' && parseFloat(getComputedStyle(nodes.get('sample-sun-technology').querySelector('.node-label')).opacity)>.8"), "30% overview hides routine Moon names while retaining Sun landmarks")
        check(evaluate("parseFloat(getComputedStyle(lines.find(l=>!l.element.classList.contains('selected')).element).opacity)<=.1"), "30% overview keeps unselected connections restrained")
        select("sample-moon-0-0-0")
        time.sleep(0.25)
        check(evaluate("getComputedStyle(nodes.get('sample-moon-0-0-0').querySelector('.node-label')).opacity==='1' && nodes.get('sample-moon-0-0-0').querySelector('.node-label').getBoundingClientRect().height>=9 && parseFloat(getComputedStyle(lines.find(l=>l.element.classList.contains('selected')).element).opacity)>.5"), "selected sample Moon and its relationship remain identifiable at 30%")
        if screenshot_dir:
            result = cdp.call("Page.captureScreenshot", format="png", captureBeyondViewport=False)
            (screenshot_dir / "sample-overview-30-percent.png").write_bytes(base64.b64decode(result["data"]))

        dense_moon = evaluate("({...entries.get('sample-moon-0-0-0')})")
        drag_to("sample-moon-0-0-0", dense_moon["x"] + 90, dense_moon["y"] + 45)
        check(evaluate("layout.has('sample-moon-0-0-0') && entries.get('sample-moon-0-0-0').parentId==='sample-planet-0-0'"), "dragging and soft positioning remain functional in sample mode")
        check(evaluate("localStorage.getItem('galaxy:user-data')") == real_snapshot, "sample interactions still do not write localStorage")
        evaluate("searchField.value='Music';searchField.dispatchEvent(new Event('input'));searchResultList.querySelector('button').click()")
        wait_camera()
        check(evaluate("selectedNode.dataset.entryId==='sample-sun-music' && camera.view.scale>=1"), "search finds and focuses a sample Sun")

        evaluate("resetSampleButton.click()")
        wait_for("document.readyState==='complete' && typeof physics!=='undefined' && sampleMode")
        wait_for("physics.settled", timeout=15)
        check(evaluate("entries.size===77 && layout.size===0"), "Reset sample restores the original in-memory fixture")
        check(evaluate("localStorage.getItem('galaxy:user-data')") == real_snapshot, "Reset sample leaves localStorage untouched")
        evaluate("exitSampleButton.click()")
        wait_for("document.readyState==='complete' && typeof physics!=='undefined' && !location.search.includes('sample')")
        wait_for("physics.settled")
        check(evaluate("!sampleMode && !entries.has('sample-sun-technology') && entries.has('github')"), "Exit sample returns to the saved galaxy")
        check(evaluate("!JSON.parse(localStorage.getItem('galaxy:user-data')).entries.some(entry=>entry.id.startsWith('sample-'))"), "Exit sample never mixes sample entries into the saved galaxy")
        evaluate("1")
        check(not cdp.errors, f"no browser exceptions: {cdp.errors}")
        print(f"{count} browser checks passed", flush=True)
        if screenshot_dir:
            print(f"Screenshots: {screenshot_dir}", flush=True)
    finally:
        if cdp:
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
