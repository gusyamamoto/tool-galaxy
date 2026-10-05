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
        self.sock = socket.create_connection((parsed.hostname, parsed.port), timeout=45)
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
    args.add_argument("--migration-only", action="store_true", help="Check v2/v4 migration and corrupt-data safeguards in isolation")
    args.add_argument("--performance-only", action="store_true", help="Profile sample physics and browser paint separately")
    args.add_argument("--software-rendering", action="store_true", help="Disable GPU compositing for a separate software-paint profile")
    args.add_argument("--visual-only", action="store_true", help="Check nebula footprints and semantic zoom on the large sample")
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
        browser, "--headless=new", *(["--disable-gpu"] if options.software_rendering else []), "--no-first-run", "--no-default-browser-check",
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
                    state = evaluate("typeof physics==='undefined' ? null : ({alpha:physics.simulation.alpha(),target:physics.simulation.alphaTarget(),paused:physics.paused,settled:physics.settled,dragging:[...physics.dragging],hidden:document.hidden,dialog:dialog.open,deleteDialog:deleteDialog.open,textures:{ready:[...nodes.values()].filter(n=>n.dataset.textureReady==='true').length,pending:[...nodes.values()].filter(n=>n.dataset.textureReady==='pending').length}})")
                    raise AssertionError(f"Timed out: {code}; state: {state}")
                time.sleep(0.1)

        def check_rendered(code, title):
            # Headless rendering can present opacity transitions after a fixed
            # sleep has elapsed. Wait for the existing visual assertion itself.
            wait_for(code)
            check(evaluate(code), title)

        def load():
            wait_for("document.readyState==='complete' && typeof physics!=='undefined'")
            wait_for("physics.settled", timeout=25)

        def wait_camera():
            wait_for("camera.frame===null")
            # Let the compositor present the final transform before mouse hit-testing.
            evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")

        def add(name, parent=None, extras=()):
            evaluate(f"""addEntryButton.click();fields[0].value={json.dumps(name)};fields[1].value='Description of '+fields[0].value;
                fields[2].value='Test';parentField.value={json.dumps(parent or '')};parentField.dispatchEvent(new Event('change'));
                [...connectionOptions.querySelectorAll('input')].forEach(c=>c.checked={json.dumps(list(extras))}.includes(c.value));form.requestSubmit();""")
            assert evaluate("!dialog.open"), evaluate("formError.textContent")
            assert evaluate("(()=>{const p=physics.particles.get(selectedNode.dataset.entryId),e=entries.get(p.id);return p.x===e.x&&p.y===e.y;})()"), "Add must reveal/save the actual seeded position immediately"
            return evaluate("selectedNode.dataset.entryId")

        def edit(entry_id, name=None, parent=None):
            evaluate(f"selectEntry(entries.get({json.dumps(entry_id)}),nodes.get({json.dumps(entry_id)}));editEntryButton.click()")
            if name is not None:
                evaluate(f"fields[0].value={json.dumps(name)};fields[1].value='Updated description';fields[2].value='Updated label'")
            if parent is not None:
                evaluate(f"parentField.value={json.dumps(parent)};parentField.dispatchEvent(new Event('change'))")
            evaluate("form.requestSubmit()")

        def hierarchy_edge(parent, child):
            return evaluate(f"connections.some(c=>c.from==={json.dumps(parent)} && c.to==={json.dumps(child)} && c.kind==='hierarchy')")

        def select(entry_id):
            evaluate(f"selectEntry(entries.get({json.dumps(entry_id)}),nodes.get({json.dumps(entry_id)}))")

        def mouse(kind, x, y, **kwargs):
            cdp.call("Input.dispatchMouseEvent", type=kind, x=x, y=y, **kwargs)

        def drag_to(entry_id, world_x, world_y, settle_timeout=25):
            evaluate(f"focusEntry({json.dumps(entry_id)})")
            wait_camera()
            point = evaluate("(()=>{const r=selectedNode.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
            target = evaluate(f"(()=>{{const e=entries.get({json.dumps(entry_id)});return {{x:({point['x']})+({world_x}-e.x)*camera.view.scale,y:({point['y']})+({world_y}-e.y)*camera.view.scale}}}})()")
            mouse("mousePressed", **point, button="left", clickCount=1)
            mouse("mouseMoved", **target, button="left", buttons=1)
            time.sleep(0.2)
            mouse("mouseReleased", **target, button="left", clickCount=1)
            wait_for("physics.settled",timeout=settle_timeout)

        def aligned():
            return evaluate("""lines.every(({from,to,element})=>{
                const m=connectionsLayer.getScreenCTM();return [[from,'x1','y1'],[to,'x2','y2']].every(([id,x,y])=>{
                    const p=new DOMPoint(+element.getAttribute(x),+element.getAttribute(y)).matrixTransform(m);
                    const entry=entries.get(id),r=nodes.get(id).getBoundingClientRect();
                    const center=entry.depth===0?camera.worldToScreen(entry.x,entry.y):{x:r.x+r.width/2,y:r.y+r.height/2};
                    return Math.hypot(p.x-center.x,p.y-center.y)<0.2;
                });
            })""")

        def check_native_rendering(title):
            check(evaluate("nodesLayer.parentElement===graphViewport && getComputedStyle(nodesLayer).transform==='none' && [...nodes.values()].every(n=>{const b=new DOMMatrix(getComputedStyle(n).transform),t=new DOMMatrix(getComputedStyle(n.querySelector('.node-label')).transform);return b.a===1 && b.d===1 && t.a===1 && t.d===1;})"), title)

        def visible_guides():
            return evaluate("orbitGuides.filter(g=>getComputedStyle(g.element).display!=='none' && parseFloat(getComputedStyle(g.element).opacity)>0).length")

        def motion_metrics():
            # Browser paint/compositing is separate from our projection callback.
            # Keep baseline and synthetic DPR-switch stress measurements distinct.
            wait_for("camera.view.scale<.95 || [...nodes.values()].filter(n=>n.dataset.culled==='false' && n.dataset.semanticHidden!=='true' && !['galaxy','satellite'].includes(n.dataset.body)).every(n=>n.dataset.textureReady==='true')")
            return evaluate("""new Promise(resolve=>{const tick=physics.onTick,costs=[],frames=[];physics.onTick=p=>{const start=performance.now();tick(p);costs.push(performance.now()-start);};physics.reheat(.3);let last;
                const frame=t=>{if(last!==undefined)frames.push(t-last);last=t;if(frames.length<60)requestAnimationFrame(frame);else{physics.onTick=tick;costs.sort((a,b)=>a-b);frames.sort((a,b)=>a-b);resolve({renderP95:costs[Math.floor(costs.length*.95)]||0,frameMedian:frames[30],frameP95:frames[57]});}};requestAnimationFrame(frame);})""")

        cdp.call("Page.navigate", url=origin)
        load()
        check(evaluate("entries.size===6 && entries.get('old-star').role==='sun' && entries.get('old-moon').parentId==='migration-my-galaxy'"), "legacy records migrate intact into My Galaxy")
        check(evaluate("relationships.length===3"), "legacy semantic relationships remain separate")
        check(evaluate("localStorage.getItem('galaxy:user-data:pre-cosmic-tree')") == old_raw, "exact original snapshot retained before migration")
        check(evaluate("JSON.parse(localStorage.getItem('galaxy:user-data')).version===5 && JSON.parse(localStorage.getItem('galaxy:user-data')).entries.every(e=>!('role' in e) && !('depth' in e))"), "version 5 persists generic ancestry without hardcoded roles or depth")
        check(evaluate("!document.getElementById('release-position-button') && roleField.tagName==='OUTPUT' && [...entries.values()].every(e=>e.depth>=0)"), "normal UI derives roles and exposes only Flowing or Pinned")

        if options.visual_only:
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof physics!=='undefined' && sampleMode");load();wait_camera()
            wait_for("[...regions.values()].every(r=>r.dataset.cloudReady==='true')")
            evaluate("window.cloudImages=[...regions.values()].map(r=>[r.cloudKey,r.cloudDraws]);clearSelection();fitGalaxy(false)")
            def preview(label):
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                    (screenshot_dir/f'nebula-{label}.png').write_bytes(base64.b64decode(result['data']))
            def view_at(scale, entry_id='sample-galaxy-0'):
                evaluate(f"(()=>{{clearSelection();searchField.value='';refreshSearchResults();const e=entries.get({json.dumps(entry_id)});camera.setView({{x:(physics.bounds.left+physics.bounds.right)/2-e.x*{scale},y:(physics.bounds.top+physics.bounds.bottom)/2-e.y*{scale},scale:{scale}}},false);}})()")
                time.sleep(.25)
            check(evaluate("entries.size===183 && regions.size===4 && galaxyAppearance.cloudCache.size===4"), "large sample reuses four cached nebula images")
            check(evaluate("[...regions.values()].every(r=>r.tagName==='CANVAS' && r.width===512 && r.height===512 && r.cloudDraws===1)"), "nebula pixels use fixed cached canvases rather than full-resolution frame redraws")
            check(evaluate("[...entries.values()].filter(e=>e.depth>0).every(e=>nodes.get(e.id).dataset.semanticHidden==='true')"), "fitted Universe hides all routine lower bodies")
            check(evaluate("[...entries.values()].filter(e=>e.depth===0).every(e=>{const n=nodes.get(e.id),r=n.getBoundingClientRect();return parseFloat(getComputedStyle(n.querySelector('.node-label')).fontSize)>=15&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})"), "Universe Galaxy names are authoritative and fit in view")
            preview('whole-universe')
            for scale,tier,roles,target in [(.1,'universe',[],'sample-galaxy-0'),(.575,'galaxy',['sun'],'sample-galaxy-0'),(.68,'system',['sun','planet'],'sample-sun-0'),(.8,'close',['sun','planet','moon','satellite'],'sample-satellite-0-0-0-0')]:
                view_at(scale,target)
                check(evaluate('galaxy.dataset.detailLevel')==tier, 'separated semantic tier '+tier)
                check_rendered(f"[...entries.values()].filter(e=>e.depth>0).every(e=>{{const alpha=parseFloat(getComputedStyle(nodes.get(e.id)).opacity);return {json.dumps(roles)}.includes(e.role)?alpha>.99:alpha<.001;}})", tier+' shows the intended body levels')
                check_native_rendering(tier+' keeps native body and label rendering')
                check(visible_guides()==0,tier+' avoids blanket orbital guides')
                preview(tier)
                if tier=='system':
                    select('sample-planet-0-0');time.sleep(.2)
                    check(1<=visible_guides()<=3,'solar selection keeps contextual subtle guides');preview('system-selected')
            view_at(.1);select('sample-satellite-0-0-0-0');time.sleep(.2)
            check_rendered("[...entries.values()].filter(e=>e.depth>0).every(e=>nodes.get(e.id).dataset.semanticHidden==='true' && nodes.get(e.id).inert && getComputedStyle(nodes.get(e.id)).opacity==='0')", 'persistent deep selection obeys Universe hiding')
            check_rendered("['sample-satellite-0-0-0-1','sample-planet-0-1','sample-planet-1-0','sample-sun-1'].every(id=>nodes.get(id).dataset.semanticHidden==='true' && nodes.get(id).inert && getComputedStyle(nodes.get(id)).opacity==='0')", 'selection does not resurrect siblings or unrelated systems')
            check(visible_guides()==0,'Universe selection keeps hierarchy guides hidden')
            view_at(.1)
            evaluate("searchField.value='Slow simmer';searchField.dispatchEvent(new Event('input'))")
            check(evaluate("nodes.get('sample-deep-7').dataset.semanticHidden==='false' && galaxyModel.ancestors(entries,'sample-deep-7').every(e=>nodes.get(e.id).dataset.semanticHidden==='false')"), 'Universe search reveals the entire required deep ancestry')
            evaluate("searchResultList.querySelector('button').click()");wait_camera();time.sleep(.25)
            check(evaluate("selectedNode.dataset.entryId==='sample-deep-7' && camera.view.scale>=1.7 && !entryActions.hidden && panelAncestry.querySelectorAll('button').length===7"), 'deep search focuses and opens Details through depth seven');preview('deep-focus')
            check(evaluate("focusRevealIds.size===0 && ![...nodes.values()].some(n=>n.classList.contains('temporarily-revealed'))"), 'focus completion clears temporary ancestry reveal')

            def click_node(entry_id, label=False):
                selector=".querySelector('.node-label')" if label else ""
                point=evaluate(f"(()=>{{const n=nodes.get({json.dumps(entry_id)}),r=(n{selector}).getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}};}})()")
                mouse('mousePressed',**point,button='left',clickCount=1)
                mouse('mouseReleased',**point,button='left',clickCount=1)
                wait_camera()

            def wheel_to(scale):
                for _ in range(12):
                    current=evaluate('camera.target.scale')
                    if abs(current-scale)<.001:
                        break
                    import math
                    delta=max(-240,min(240,math.log(current/scale)/.0018))
                    mouse('mouseWheel',500,500,deltaX=0,deltaY=delta)
                    wait_camera()
                check(abs(evaluate('camera.view.scale')-scale)<.002,f'wheel reaches {round(scale*100)}% normally')

            for galaxy_id,name in [('sample-galaxy-1','Food'),('sample-galaxy-0','Work'),('sample-galaxy-2','Travel')]:
                evaluate('clearSelection();fitGalaxy(false)');time.sleep(.25)
                click_node(galaxy_id,label=True)
                check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(galaxy_id)} && panelName.textContent==={json.dumps(name)} && camera.view.scale<=.58 && !entryActions.hidden"),name+' name single-click frames and selects its Galaxy')
                check(evaluate(f"physics.galaxies.get({json.dumps(galaxy_id)}).systems.every(s=>{{const p=camera.worldToScreen(s.root.x,s.root.y);return p.x>physics.bounds.left&&p.x<physics.bounds.right&&p.y>physics.bounds.top&&p.y<physics.bounds.bottom;}})"),name+' focus includes its Suns within viewport padding')
                wheel_to(.8)
                check_rendered(f"[...entries.values()].filter(e=>e.depth>0&&physics.particles.get(e.id).galaxyId==={json.dumps(galaxy_id)}).every(e=>parseFloat(getComputedStyle(nodes.get(e.id)).opacity)>.99)",name+' complete hierarchy visible at 80%')
                preview(name.lower()+'-80-percent')
                wheel_to(.1)
                check_rendered(f"selectedNode.dataset.entryId==={json.dumps(galaxy_id)} && [...entries.values()].filter(e=>e.depth>0).every(e=>nodes.get(e.id).inert&&getComputedStyle(nodes.get(e.id)).opacity==='0')",name+' zoom-out hides descendants while preserving Galaxy selection')

            evaluate('clearSelection();fitGalaxy(false)');time.sleep(.25)
            cloud_point=evaluate("(()=>{const r=regions.get('sample-galaxy-1');for(const [dx,dy] of [[0,0],[.15,.1],[-.15,.1],[0,.2]]){const x=r.renderX+r.renderWidth*dx,y=r.renderY+r.renderHeight*dy;if(document.elementFromPoint(x,y)?.id==='graph-viewport')return {x,y};}return null;})()")
            check(cloud_point is not None,'Food cloud has a hittable visible region')
            mouse('mousePressed',**cloud_point,button='left',clickCount=1);mouse('mouseReleased',**cloud_point,button='left',clickCount=1);wait_camera()
            check(evaluate("selectedNode.dataset.entryId==='sample-galaxy-1' && camera.view.scale<=.58"),'Food cloud single-click smoothly frames Food')
            click_node('sample-sun-2',label=True)
            check(evaluate("selectedNode.dataset.entryId==='sample-sun-2' && camera.view.scale>.58 && camera.view.scale<=.82 && Math.hypot(camera.worldToScreen(entries.get('sample-sun-2').x,entries.get('sample-sun-2').y).x-(physics.bounds.left+physics.bounds.right)/2,camera.worldToScreen(entries.get('sample-sun-2').x,entries.get('sample-sun-2').y).y-(physics.bounds.top+physics.bounds.bottom)/2)<1"),'Food Sun name single-click centers its solar system at a useful scale')
            check(evaluate("physics.systems.get('sample-sun-2').members.every(n=>{const p=camera.worldToScreen(n.x,n.y),r=n.radius*camera.view.scale;return p.x-r>physics.bounds.left&&p.x+r<physics.bounds.right&&p.y-r>physics.bounds.top&&p.y+r<physics.bounds.bottom;})"),'Food Sun focus frames every local descendant with viewport padding')
            preview('food-solar-system')
            click_node('sample-sun-2')
            check(evaluate("selectedNode.dataset.entryId==='sample-sun-2' && !physics.dragging.size && !layout.has('sample-sun-2')"),'Sun body click focuses without recording a drag preference')
            wheel_to(.1)
            check_rendered("[...entries.values()].filter(e=>e.depth>0).every(e=>getComputedStyle(nodes.get(e.id)).opacity==='0')",'Sun focus leaves no sticky visibility on manual zoom-out')
            evaluate("searchField.value='Slow simmer';searchField.dispatchEvent(new Event('input'));focusEntry('sample-deep-7')")
            check(evaluate("focusRevealIds.has('sample-deep-7') && nodes.get('sample-deep-7').classList.contains('temporarily-revealed')"),'deep focus temporarily reveals target during navigation')
            # Interrupt the automatic transition, leaving the search text intact.
            mouse('mouseWheel',500,500,deltaX=0,deltaY=240);wait_camera();wheel_to(.1)
            check_rendered("selectedNode.dataset.entryId==='sample-deep-7' && focusRevealIds.size===0 && !searchOpen && [...entries.values()].filter(e=>e.depth>0).every(e=>nodes.get(e.id).inert&&getComputedStyle(nodes.get(e.id)).opacity==='0')",'manual zoom cancels deep search reveal without deselecting the Satellite')
            evaluate("focusEntry('sample-deep-7')");wait_camera()
            check(evaluate("!focusRevealIds.size && nodes.get('sample-deep-7').querySelector('.satellite-craft') && getComputedStyle(nodes.get('sample-deep-7').querySelector('.node-label')).opacity==='1'"),'completed deep focus reveals the Satellite and labels through normal close zoom')

            check(evaluate("[...entries.values()].filter(e=>e.role==='satellite').every(e=>{const n=nodes.get(e.id);return !!n.querySelector('.satellite-craft')&&getComputedStyle(n).backgroundImage==='none'&&getComputedStyle(n,'::before').content==='none'&&!n.textureSize;}) && new Set([...nodes.values()].filter(n=>n.dataset.body==='satellite').map(n=>n.dataset.archetype)).size===4"),'Satellites use all four artificial silhouettes without sphere textures')
            identities=evaluate("[...nodes].filter(([id,n])=>n.dataset.body==='satellite').map(([id,n])=>[id,n.dataset.archetype,n.querySelector('.satellite-craft').outerHTML])")

            for start,end,label in [(1.7,.1,'out'),(.1,1.7,'in')]:
                view_at(start,'sample-sun-0')
                trace=evaluate(f"""new Promise(resolve=>{{const original=camera.onChange,values=[],ids=['sample-sun-0','sample-planet-0-0','sample-moon-0-0-0','sample-satellite-0-0-0-0'];camera.onChange=v=>{{original(v);values.push(ids.map(id=>parseFloat(getComputedStyle(nodes.get(id)).opacity)));}};camera.setView({{...camera.view,scale:{end}}});const frame=()=>{{if(camera.frame!==null)requestAnimationFrame(frame);else{{camera.onChange=original;resolve(values);}}}};requestAnimationFrame(frame);}})""")
                check(all(any(0<row[i]<1 for row in trace) for i in range(4)), 'zooming '+label+' fades every lower body level continuously')
            view_at(.575)
            metrics=motion_metrics()
            check(metrics['renderP95']<20 and metrics['frameMedian']<55, f"Galaxy cloud motion responsive: projection p95 {metrics['renderP95']:.1f}ms, median frame {metrics['frameMedian']:.1f}ms")
            wait_for('physics.settled')
            before=evaluate("({...entries.get('sample-sun-1')})");drag_to('sample-sun-1',before['x']+350,before['y']+100,settle_timeout=60)
            check(evaluate("[...regions].every(([id,r])=>{const root=physics.particles.get(id),f=r.footprint;return [...physics.particles.values()].filter(p=>p.depth>0&&p.galaxyId===id).every(p=>Math.abs(p.x-root.x-f.offsetX)+p.radius<f.width/2 && Math.abs(p.y-root.y-f.offsetY)+p.radius<f.height/2);})"), 'cloud footprints contain actual systems after a Sun drag')
            check(evaluate("JSON.stringify(cloudImages)===JSON.stringify([...regions.values()].map(r=>[r.cloudKey,r.cloudDraws])) && galaxyAppearance.cloudCache.size===4"), 'moving contents reuses the existing nebula pixels')
            view_at(.575);preview('after-drag')
            before=evaluate("({...entries.get('sample-planet-2-0')})")
            drag_to('sample-planet-2-0',before['x']+1800,before['y'],settle_timeout=60)
            check(evaluate("(()=>{const p=physics.particles.get('sample-planet-2-0');return p.fx===null&&Math.hypot(p.x-p.parent.x,p.y-p.parent.y)<p.orbitRadius+100;})()"),'far Planet drag gently returns to its local Sun band')
            evaluate('window.cosmosReloadMarker=true')
            cdp.call('Page.navigate',url=origin+'/?sample=large')
            wait_for("typeof window.cosmosReloadMarker==='undefined' && document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode")
            load();wait_camera()
            check(evaluate("[...nodes].filter(([id,n])=>n.dataset.body==='satellite').map(([id,n])=>[id,n.dataset.archetype,n.querySelector('.satellite-craft').outerHTML])")==identities,'Satellite silhouettes remain identical after a sample reload')
            check(not cdp.errors,f"no visual browser exceptions: {cdp.errors}")
            print(f'{count} visual browser checks passed',flush=True)
            return

        if options.performance_only:
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof physics!=='undefined' && sampleMode");wait_for('physics.settled',timeout=25)
            evaluate("focusEntry('sample-satellite-0-0-0-0')");wait_camera()
            def measure_case(label, active=True):
                if active: evaluate('physics.resume();physics.reheat(.3)')
                else: evaluate('physics.pause()')
                metrics=evaluate("""new Promise(resolve=>{const original=physics.onTick,costs=[],frames=[];physics.onTick=p=>{const start=performance.now();original(p);costs.push(performance.now()-start);};let last;
                    const frame=t=>{if(last!==undefined)frames.push(t-last);last=t;if(frames.length<45)requestAnimationFrame(frame);else{physics.onTick=original;frames.sort((a,b)=>a-b);costs.sort((a,b)=>a-b);resolve({renderP95:costs[Math.floor(costs.length*.95)]||0,frameMedian:frames[22],frameP95:frames[42],scale:camera.view.scale,dpr:devicePixelRatio,culled:[...nodes.values()].filter(n=>n.dataset.culled==='true').length,visibleLayers:[...nodes.values()].filter(n=>getComputedStyle(n).visibility==='visible'&&getComputedStyle(n).willChange==='transform').length});}};requestAnimationFrame(frame);})""")
                print(label+': '+json.dumps(metrics),flush=True)
                evaluate('physics.pause()')
            wait_for("[...nodes.values()].filter(n=>n.dataset.culled==='false' && !['galaxy','satellite'].includes(n.dataset.body)).every(n=>n.dataset.textureReady==='true')")
            measure_case('pristine close')
            measure_case('idle close',False)
            cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=2,mobile=False)
            time.sleep(.2);measure_case('2x close')
            cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
            time.sleep(.2);measure_case('restored 1x close')
            evaluate("connectionsLayer.style.display='none'");measure_case('without SVG connections')
            evaluate("connectionsLayer.style.display='';nodesLayer.style.display='none'");measure_case('without bodies')
            evaluate("nodesLayer.style.display='';document.head.insertAdjacentHTML('beforeend','<style>.entry-node::before{background:none!important}</style>')");measure_case('without surface texture')
            check(not cdp.errors,f"no profiling browser exceptions: {cdp.errors}")
            return

        if options.migration_only:
            v4 = {"version": 4, "entries": [
                {"id": "github", "name": "Saved Sun", "description": "Edited built-in Sun", "category": "Keep label", "role": "category", "parentId": None, "x": 400, "y": 400},
                {"id": "saved-planet", "name": "Saved Planet", "description": "Saved category", "category": "Keep category", "role": "subcategory", "parentId": "github", "x": 600, "y": 430, "appearance": {"archetype": "desert", "rings": True}},
                {"id": "saved-moon", "name": "Saved Moon", "description": "Saved resource", "category": "", "role": "entry", "parentId": "saved-planet", "x": 670, "y": 490}],
                "connections": [{"from": "github", "to": "saved-moon"}],
                "layout": [{"id": "saved-moon", "x": 1050, "y": 680, "pinned": True}, {"id": "saved-planet", "x": 700, "y": 460, "pinned": False}]}
            v4_raw = json.dumps(v4, indent=2)
            evaluate(f"physics.pause();graphNeedsSave=false;localStorage.removeItem('galaxy:user-data:pre-cosmic-tree');localStorage.setItem('galaxy:user-data',{json.dumps(v4_raw)})")
            cdp.call('Page.reload');load()
            check(evaluate("entries.size===4 && entries.get('github').name==='Saved Sun' && entries.get('saved-planet').parentId==='github' && entries.get('saved-moon').parentId==='saved-planet' && entries.get('saved-moon').role==='moon'"), "v4 migration preserves the entire saved three-level tree and edited built-in")
            check(evaluate("localStorage.getItem('galaxy:user-data:pre-cosmic-tree')") == v4_raw, "v4 migration saves the exact original raw snapshot before replacement")
            check(evaluate("entries.get('github').parentId==='migration-my-galaxy' && entries.get('migration-my-galaxy').name==='My Galaxy'"), "v4 former Sun gains a neutral Galaxy parent")
            check(evaluate("entries.get('saved-moon').x===1050 && entries.get('saved-moon').y===680 && layout.get('saved-moon').pinned"), "v4 exact pin coordinates remain unchanged through migration")
            check(evaluate("!('x' in layout.get('saved-planet')) && layout.get('saved-planet').parentId==='github' && Number.isFinite(layout.get('saved-planet').angle) && physics.particles.get('saved-planet').fx===null"), "v4 old soft placement becomes an initial position and relative flowing influence")
            check(evaluate("relationships.length===1 && connections.filter(c=>c.kind==='hierarchy').length===3 && entries.get('github').category==='Keep label' && entries.get('saved-planet').description==='Saved category'"), "v4 labels, descriptions and semantic relationships survive")
            check(evaluate("nodes.get('saved-planet').dataset.archetype==='desert' && nodes.get('saved-planet').dataset.rings==='true'"), "migration preserves optional appearance metadata")
            identity = evaluate("JSON.stringify([...entries.values()].map(e=>[e.id,galaxyAppearance.resolve(e)]))")
            cdp.call('Page.reload');load()
            check(evaluate("entries.size===4 && entries.get('saved-moon').x===1050 && entries.get('saved-moon').y===680 && JSON.stringify([...entries.values()].map(e=>[e.id,galaxyAppearance.resolve(e)]))") == identity, "second refresh does not re-migrate or change styles and pins")
            select('saved-planet')
            check(evaluate("panelPlacement.textContent==='Position: Flowing' && !document.getElementById('release-position-button')"), "migrated soft body uses the simplified Flowing UI")

            corrupt = json.dumps({"version": 5, "entries": [{"id": "bad", "name": "Bad", "description": "", "parentId": None}], "connections": [], "layout": []})
            evaluate(f"physics.pause();graphNeedsSave=false;localStorage.setItem('galaxy:user-data',{json.dumps(corrupt)})")
            cdp.call('Page.reload');load()
            check(evaluate("!storageAvailable && !storageStatus.hidden"), "invalid saved record disables overwriting and reports the issue")
            add('Session only')
            check(evaluate("localStorage.getItem('galaxy:user-data')") == corrupt, "session edits cannot replace a snapshot containing invalid records")
            unsupported = json.dumps({"version": 99, "entries": [], "connections": [], "layout": []})
            evaluate(f"physics.pause();graphNeedsSave=false;localStorage.setItem('galaxy:user-data',{json.dumps(unsupported)})")
            cdp.call('Page.reload');load()
            check(evaluate("!storageAvailable && !storageStatus.hidden") and evaluate("localStorage.getItem('galaxy:user-data')") == unsupported, "unsupported future snapshot remains untouched")
            check(not cdp.errors, f"no migration browser exceptions: {cdp.errors}")
            print(f"{count} migration browser checks passed", flush=True)
            return

        g1=add('Food');s1=add('Recipes',g1);s2=add('Ingredients',g1)
        g2=add('Work');s3=add('Development',g2)
        p1=add('Italian',s1);p2=add('Japanese',s1)
        m1=add('Chicken',p1);m2=add('Pasta',p1)
        t1=add('Chicken Parmigiana',m1,['github','codex']);t2=add('Chicken Piccata',m1)
        d5=add('Preparation',t1);d6=add('Slow simmer notes',d5)
        wait_for("physics.settled")
        check(evaluate(f"entries.get({json.dumps(g1)}).depth===0 && entries.get({json.dumps(s1)}).depth===1 && entries.get({json.dumps(p1)}).depth===2 && entries.get({json.dumps(m1)}).depth===3 && entries.get({json.dumps(t1)}).depth===4 && entries.get({json.dumps(d6)}).depth===6"), "create multiple Galaxies and a hierarchy through depth six")
        check(hierarchy_edge(g1,s1) and hierarchy_edge(s1,p1) and hierarchy_edge(m1,t1) and hierarchy_edge(d5,d6), "all hierarchy links derive from parent IDs")
        check(evaluate(f"relationships.filter(c=>c.from==={json.dumps(t1)}).length===2"), "deep entries retain optional semantic relationships")
        for entry_id, expected in [(g1,'Sun'),(s1,'Planet'),(p1,'Moon'),(m1,'Satellite'),(t1,'Satellite')]:
            select(entry_id)
            check(evaluate('addEntryButton.textContent')=='Add '+expected, 'contextual Add '+expected)
            evaluate('addEntryButton.click()')
            check(evaluate('parentField.value')==entry_id, 'contextual Add preselects the current parent')
            evaluate('dialog.close()')
        select(g1);evaluate('editEntryButton.click()')
        check(evaluate(f"![...parentField.options].some(o=>[{json.dumps(g1)},{json.dumps(d6)}].includes(o.value))"), "Edit excludes self and all descendants from parent choices")
        check(evaluate(f"galaxyModel.validateChange({{...entries.get({json.dumps(g1)}),parentId:{json.dumps(d6)}}},entries).includes('ancestor')"), "defensive validation rejects cycles")
        evaluate('dialog.close()')

        styles=evaluate("JSON.stringify([...entries.values()].map(e=>[e.id,galaxyAppearance.resolve(e)]))")
        cdp.call('Page.reload');load()
        check(evaluate("JSON.stringify([...entries.values()].map(e=>[e.id,galaxyAppearance.resolve(e)]))")==styles, "all deterministic identities survive refresh")
        check(evaluate(f"entries.get({json.dumps(d6)}).depth===6 && entries.get({json.dumps(t1)}).parentId==={json.dumps(m1)}"), "deep ancestry persists after refresh")
        wait_for("[...regions.values()].every(r=>r.dataset.cloudReady==='true')")
        check(evaluate("[...regions.values()].every(r=>r.tagName==='CANVAS' && r.cloudDraws===1) && [...entries.values()].filter(e=>e.depth===0).every(e=>nodes.get(e.id).dataset.body==='galaxy')"), "Galaxies render as cached procedural regions rather than spherical bodies")

        evaluate("camera.setView({x:-900,y:-700,scale:.1},false);searchField.value='slow SIMMER';searchField.dispatchEvent(new Event('input'))")
        check(evaluate(f"nodes.get({json.dumps(d6)}).classList.contains('search-match') && galaxyModel.ancestors(entries,{json.dumps(d6)}).every(e=>nodes.get(e.id).classList.contains('search-ancestor'))"), "deep search reveals all intermediate ancestry before focus")
        evaluate('searchResultList.querySelector("button").click()');wait_camera()
        check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(d6)} && panelName.textContent==='Slow simmer notes' && panelAncestry.querySelectorAll('button').length===6 && camera.view.scale>=1.7"), "deep search selects, opens Details and smoothly focuses target with ancestry navigation")
        check(evaluate("[...nodes.values()].some(n=>n.dataset.culled==='true') && getComputedStyle(selectedNode).visibility==='visible'"), "close views cull offscreen bodies while the focused target paints normally")
        evaluate("camera.panTo(-100000,-100000)")
        check(evaluate("getComputedStyle(selectedNode).visibility==='hidden'"), "panning away skips offscreen paint")
        evaluate(f"focusEntry({json.dumps(d6)})");wait_camera()
        check(evaluate("getComputedStyle(selectedNode).visibility==='visible'"), "search/focus reveals culled entries again")
        evaluate("searchField.value='';refreshSearchResults()")
        for body,entry_id in [('Galaxy',g1),('Sun',s1),('Planet',p1),('Moon',m1),('Satellite',t1)]:
            before=evaluate(f"({{...entries.get({json.dumps(entry_id)})}})")
            drag_to(entry_id,before['x']+140,before['y']+70)
            check(evaluate(f"physics.particles.get({json.dumps(entry_id)}).fx===null && !layout.get({json.dumps(entry_id)})?.pinned && panelPlacement.textContent==='Position: Flowing'"),body+' remains unpinned and flowing after drag')
            if body!='Galaxy':
                check(evaluate(f"!('x' in layout.get({json.dumps(entry_id)})) && Number.isFinite(layout.get({json.dumps(entry_id)}).angle)"),body+' drag stores a relative influence rather than a coordinate spring')
            check(evaluate(f"entries.get({json.dumps(entry_id)}).parentId==={json.dumps(before['parentId'])}"),body+' drag preserves hierarchy')
        select(t1);evaluate('pinPositionButton.click()');wait_for('physics.settled')
        pin=evaluate(f"({{x:entries.get({json.dumps(t1)}).x,y:entries.get({json.dumps(t1)}).y}})")
        parent=evaluate(f"({{...entries.get({json.dumps(m1)})}})");drag_to(m1,parent['x']+100,parent['y']-50)
        check(evaluate(f"entries.get({json.dumps(t1)}).x===({pin['x']}) && entries.get({json.dumps(t1)}).y===({pin['y']})"), "exact Satellite pin resists ancestor dragging")
        cdp.call('Page.reload');load()
        check(evaluate(f"entries.get({json.dumps(t1)}).x===({pin['x']}) && entries.get({json.dumps(t1)}).y===({pin['y']}) && layout.get({json.dumps(t1)}).pinned"), "exact pin survives refresh")
        select(t1);evaluate('pinPositionButton.click()');wait_for('physics.settled')
        check(evaluate(f"physics.particles.get({json.dumps(t1)}).fx===null && panelPlacement.textContent==='Position: Flowing'"), "Unpin directly resumes flowing physics")

        for kind,a,b in [('Planet',p1,p2),('Moon',m1,m2),('Satellite',t1,t2)]:
            select(b);evaluate('pinPositionButton.click()');wait_for('physics.settled')
            point=evaluate(f"({{...entries.get({json.dumps(b)})}})");drag_to(a,point['x'],point['y'])
            check(evaluate(f"(()=>{{const a=physics.particles.get({json.dumps(a)}),b=physics.particles.get({json.dumps(b)});return Math.hypot(a.x-b.x,a.y-b.y)>=a.radius+b.radius+12 && b.x===({point['x']}) && b.y===({point['y']});}})()"),kind+' siblings separate after coincident drop beside a pin')
            select(b);evaluate('pinPositionButton.click()');wait_for('physics.settled')

        edit(p1,name='Italian recipes',parent=s3);wait_for('physics.settled')
        check(hierarchy_edge(s3,p1) and not hierarchy_edge(s1,p1), "reparenting replaces the derived hierarchy edge")
        check(evaluate(f"entries.get({json.dumps(d6)}).depth===6 && physics.particles.get({json.dumps(d6)}).galaxyId==={json.dumps(g2)}"), "entire reparented subtree joins the new Galaxy")
        edit(t1,parent=s1);wait_for('physics.settled')
        check(evaluate(f"entries.get({json.dumps(t1)}).role==='planet' && entries.get({json.dumps(d6)}).depth===4 && nodes.get({json.dumps(t1)}).dataset.body==='planet'"), "reparenting across depths recomputes descendant roles and appearance")
        edit(t1,parent=m1);wait_for('physics.settled')
        check(evaluate(f"entries.get({json.dumps(d6)}).depth===6 && relationships.filter(c=>c.from==={json.dumps(t1)}).length===2"), "deep nesting can be restored without losing semantic links")

        # The appearance UI is intentionally deferred; verify its model contract through Edit/save/refresh.
        evaluate(f"entries.get({json.dumps(p1)}).appearance={{archetype:'oceanic',rings:true,palette:'teal'}};syncPhysicsGraph();saveGalaxy()")
        edit(p1,name='Italian recipes');wait_for('physics.settled');cdp.call('Page.reload');load()
        check(evaluate(f"nodes.get({json.dumps(p1)}).dataset.archetype==='oceanic' && nodes.get({json.dumps(p1)}).dataset.rings==='true' && entries.get({json.dumps(p1)}).appearance.palette==='teal'"), "future appearance overrides survive ordinary Edit and refresh")
        select(g2);evaluate('deleteEntryButton.click()')
        check(evaluate('!deleteDialog.open && actionStatus.textContent.includes("child")'), "deleting a nonempty Galaxy is safely blocked")
        select(d6);evaluate('deleteEntryButton.click()')
        check(evaluate('deleteDialog.open && physics.paused'), "leaf deletion opens confirmation")
        evaluate('document.getElementById("cancel-delete-entry").click()');check(evaluate(f"entries.has({json.dumps(d6)})"), "cancel deletion preserves deep entry")
        evaluate('deleteEntryButton.click();document.getElementById("delete-entry-form").requestSubmit()');wait_for('physics.settled')
        check(evaluate(f"!entries.has({json.dumps(d6)}) && !nodes.has({json.dumps(d6)}) && !physics.particles.has({json.dumps(d6)})"), "confirmed deletion removes deep content and derived state")
        check(evaluate('selectedNode===null && entryActions.hidden'), "deletion clears Details safely")

        def capture_levels(prefix, galaxy_id, sun_id, planet_id, satellite_id):
            evaluate('clearSelection();searchField.value="";refreshSearchResults();fitGalaxy(false)')
            time.sleep(.3)
            if screenshot_dir:
                result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                (screenshot_dir/f'{prefix}-whole-universe.png').write_bytes(base64.b64decode(result['data']))
            check(evaluate("[...entries.values()].filter(e=>e.depth===0).every(e=>{const r=nodes.get(e.id).getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})"),prefix+' Universe fit includes every native Galaxy name')
            for scale,level,target in [(.10,'universe',galaxy_id),(.575,'galaxy',galaxy_id),(.68,'system',sun_id),(1.7,'close',satellite_id)]:
                evaluate('clearSelection();searchField.value="";refreshSearchResults()')
                center=evaluate(f"({{...entries.get({json.dumps(target)})}})")
                evaluate(f"camera.setView({{x:(physics.bounds.left+physics.bounds.right)/2-({center['x']})*{scale},y:(physics.bounds.top+physics.bounds.bottom)/2-({center['y']})*{scale},scale:{scale}}},false)")
                time.sleep(.25)
                if level == 'close':
                    wait_for("[...nodes.values()].filter(n=>n.dataset.culled==='false' && !['galaxy','satellite'].includes(n.dataset.body)).every(n=>n.dataset.textureReady==='true')")
                    check(evaluate("[...nodes.values()].filter(n=>n.dataset.culled==='false' && !['galaxy','satellite'].includes(n.dataset.body)).every(n=>getComputedStyle(n,'::before').mixBlendMode==='normal' && n.style.getPropertyValue('--surface-map').includes('blob:'))"),prefix+' close surface detail uses cached native overlays')
                check(evaluate('galaxy.dataset.detailLevel')==level,prefix+' semantic tier '+level)
                check_native_rendering(prefix+' native body and text dimensions at '+level)
                check(aligned(),prefix+' hierarchy and semantic endpoints align at '+level)
                check(visible_guides()==0,prefix+' has no blanket orbit rings at '+level)
                if level=='universe':
                    check(evaluate("[...entries.values()].filter(e=>e.depth>0).every(e=>getComputedStyle(nodes.get(e.id)).opacity==='0')"),prefix+' Universe hides lower detail')
                if level=='galaxy':
                    check(evaluate(f"parseFloat(getComputedStyle(nodes.get({json.dumps(sun_id)})).opacity)>.9 && getComputedStyle(nodes.get({json.dumps(satellite_id)})).opacity==='0'"),prefix+' Galaxy emphasizes Suns and simplifies deep detail')
                if level=='close':
                    check(evaluate(f"parseFloat(getComputedStyle(nodes.get({json.dumps(satellite_id)}).querySelector('.node-label')).opacity)>.9"),prefix+' close zoom reveals Satellite labels')
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                    (screenshot_dir/f'{prefix}-{level}.png').write_bytes(base64.b64decode(result['data']))
                if level in ['system','close']:
                    select(planet_id if level=='system' else satellite_id);time.sleep(.2)
                    check(1<=visible_guides()<=3,prefix+' selects only useful orbital bands at '+level)
                    if screenshot_dir:
                        result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                        (screenshot_dir/f'{prefix}-{level}-selected.png').write_bytes(base64.b64decode(result['data']))
            check(evaluate("orbitGuides.every(g=>g.element.tagName==='ellipse') && !connectionsLayer.querySelector('path.orbit-guide')"),prefix+' has no partial decorative orbit arcs')
            metrics=evaluate("""new Promise(resolve=>{const widths=[],native=[],label=selectedNode.querySelector('.node-label');const original=camera.onChange,costs=[];
                camera.onChange=v=>{const start=performance.now();original(v);costs.push(performance.now()-start);};
                camera.zoomAt(600,500,1.1);const frame=()=>{widths.push(label.getBoundingClientRect().width);const m=new DOMMatrix(getComputedStyle(label).transform);native.push(m.a===1&&m.d===1);
                    if(camera.frame!==null)requestAnimationFrame(frame);else{camera.onChange=original;costs.sort((a,b)=>a-b);resolve({native:native.every(Boolean),widthChange:Math.max(...widths)-Math.min(...widths),renderP95:costs[Math.floor(costs.length*.95)]||0});}};requestAnimationFrame(frame);})""")
            check(metrics['native'] and metrics['widthChange']<.2,prefix+' selected labels stay crisp through animated zoom')
            check(metrics['renderP95']<20,prefix+f" camera projection responsive ({metrics['renderP95']:.1f}ms p95)")

        capture_levels('normal',g2,s3,p1,t1)
        evaluate('clearSelection();fitGalaxy()');wait_camera()
        check(evaluate("(()=>{const b=galaxyBounds(),a=camera.worldToScreen(b.left,b.top),z=camera.worldToScreen(b.right,b.bottom);return a.x>=physics.bounds.left+31&&a.y>=physics.bounds.top+31&&z.x<=physics.bounds.right-31&&z.y<=physics.bounds.bottom-31;})()"), "Fit Galaxy includes regions and descendants beside the panel")
        evaluate('window.zoomBefore=camera.view.scale');mouse('mouseWheel',600,500,deltaX=0,deltaY=-120);wait_camera()
        check(evaluate('camera.view.scale>zoomBefore'), "wheel zoom works after deep focus")
        evaluate('window.panBefore={...camera.view}');mouse('mousePressed',1030,880,button='left',clickCount=1);mouse('mouseMoved',1060,900,button='left',buttons=1);mouse('mouseReleased',1060,900,button='left',clickCount=1)
        check(evaluate('Math.abs(camera.view.x-panBefore.x-30)<.5 && Math.abs(camera.view.y-panBefore.y-20)<.5'), "space panning works after deep focus")

        for width,height,label in [(430,932,'mobile'),(1440,1000,'desktop')]:
            cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=width<760);wait_for('physics.settled')
            select(t1)
            check(evaluate('document.documentElement.scrollWidth===innerWidth'),label+' has no horizontal overflow')
            check(evaluate("(()=>{const p=panel.getBoundingClientRect();return [entryActions,panelPlacement,pinPositionButton].every(el=>{const a=el.getBoundingClientRect();return a.top>=p.top&&a.bottom<=p.bottom;});})()"),label+' keeps Pin and actions visible')
            evaluate('editEntryButton.click()');check(evaluate('dialog.open && parentField.value===entries.get(editingId).parentId'),label+' Edit loads correct deep parent');evaluate('dialog.close()')
            if screenshot_dir:
                evaluate('fitGalaxy(false)');time.sleep(.2);result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                (screenshot_dir/f'normal-fit-{label}.png').write_bytes(base64.b64decode(result['data']))

        wait_for('physics.settled');evaluate('physics.pause();saveGalaxy()');real_snapshot=evaluate("localStorage.getItem('galaxy:user-data')")
        evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof physics!=='undefined' && sampleMode");wait_for('physics.settled',timeout=25);wait_camera()
        check(evaluate('entries.size===183 && physics.galaxies.size===4 && physics.systems.size===8'), "stress sample contains 183 entries across four Galaxies and eight Suns")
        check(evaluate("new Set([...entries.values()].filter(e=>e.depth===0).map(e=>galaxyAppearance.resolve(e).archetype)).size===4"), "sample shows four stable Galaxy archetypes")
        check(evaluate("new Set([...entries.values()].filter(e=>e.depth===2).map(e=>galaxyAppearance.resolve(e).archetype)).size===6 && [...nodes.values()].filter(n=>n.dataset.rings==='true').length>0 && [...nodes.values()].filter(n=>n.dataset.rings==='true').length<12"), "sample shows six Planet archetypes with occasional rings")
        check(evaluate("entries.get('sample-deep-7').depth===7 && connections.length===179"), "sample exercises depth seven and derives all hierarchy edges")
        check(evaluate("localStorage.getItem('galaxy:user-data')")==real_snapshot, "sample loading never modifies real saved data")
        check(evaluate("loadSampleButton.disabled && !removeSampleButton.disabled && !location.search.includes('sample')"), "sample activation is temporary and explicit")
        check(evaluate("(()=>{const g=[...physics.galaxies.values()];return g.every((a,i)=>g.slice(i+1).every(b=>Math.hypot(a.root.x-b.root.x,a.root.y-b.root.y)>(a.radius+b.radius)*.85));})()"), "Galaxy regions retain separate soft footprints")
        check(evaluate("[...physics.galaxies.values()].every(g=>g.systems.every(s=>Math.hypot(s.root.x-g.root.x,s.root.y-g.root.y)+s.radius<g.radius*1.2))"), "solar systems remain inside their Galaxy regions")
        capture_levels('sample','sample-galaxy-0','sample-sun-0','sample-planet-0-0','sample-satellite-0-0-0-0')
        evaluate("searchField.value='Slow simmer';searchField.dispatchEvent(new Event('input'));searchResultList.querySelector('button').click()");wait_camera()
        check(evaluate("selectedNode.dataset.entryId==='sample-deep-7' && panelAncestry.querySelectorAll('button').length===7 && galaxyModel.ancestors(entries,'sample-deep-7').every(e=>nodes.get(e.id).classList.contains('related'))"), "depth-seven sample search reveals Galaxy, Sun and every intermediate ancestor")
        baseline=motion_metrics()
        baseline_responsive=baseline['renderP95']<20 and baseline['frameMedian']<55 and baseline['frameP95']<120
        baseline_title=f"183-body baseline motion responsive: render p95 {baseline['renderP95']:.1f}ms, frame median/p95 {baseline['frameMedian']:.1f}/{baseline['frameP95']:.1f}ms"
        # Finish drag/sample-isolation checks before reporting a paint-budget
        # failure. Keep the same threshold and failing exit status.
        if not baseline_responsive: print('FAIL '+baseline_title+' (deferred until functional checks finish)',flush=True)
        cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=2,mobile=False);time.sleep(.2);check_native_rendering('native projection holds on a 2x display')
        if screenshot_dir:
            result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/'sample-deep-2x.png').write_bytes(base64.b64decode(result['data']))
        cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
        for body,entry_id in [('Galaxy','sample-galaxy-0'),('Sun','sample-sun-0'),('Planet','sample-planet-0-0'),('Moon','sample-moon-0-0-0'),('Satellite','sample-satellite-0-0-0-0')]:
            before=evaluate(f"({{...entries.get({json.dumps(entry_id)})}})");drag_to(entry_id,before['x']+100,before['y']+60,settle_timeout=60)
            check(evaluate('panelPlacement.textContent==="Position: Flowing"'), 'stress sample '+body+' dragging remains flowing')
        check(evaluate("localStorage.getItem('galaxy:user-data')")==real_snapshot, "sample search, drag and layout remain isolated")
        stress=motion_metrics()
        check(stress['renderP95']<20, f"183-body projection stays within budget after DPR switching ({stress['renderP95']:.1f}ms p95)")
        print(f"DPR-switch paint stress: frame median/p95 {stress['frameMedian']:.1f}/{stress['frameP95']:.1f}ms (reported separately; verify on a native display)",flush=True)
        wait_for('physics.settled',timeout=60);evaluate('removeSampleButton.click()');wait_for("document.readyState==='complete' && typeof physics!=='undefined' && !sampleMode");load()
        check(evaluate(f"entries.has({json.dumps(g1)}) && !entries.has('sample-galaxy-0') && !JSON.parse(localStorage.getItem('galaxy:user-data')).entries.some(e=>e.id.startsWith('sample-'))"), "Remove Sample returns to real data without mixing entries")
        evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof physics!=='undefined' && sampleMode");cdp.call('Page.reload');wait_for("document.readyState==='complete' && typeof physics!=='undefined' && !sampleMode");load()
        check(evaluate(f"entries.has({json.dumps(g2)}) && !entries.has('sample-galaxy-0')"), "refreshing Sample returns to real saved hierarchy")
        check(evaluate("localStorage.getItem('galaxy:user-data:pre-cosmic-tree')")==old_raw, "all subsequent saves retain original migration backup")
        check(not cdp.errors,f"no browser exceptions: {cdp.errors}")
        print(f"{count} functional browser checks passed",flush=True)
        check(baseline_responsive,baseline_title)
        print(f"{count} browser checks passed",flush=True)
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
