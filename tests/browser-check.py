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
    args.add_argument("--navigation-only", action="store_true", help="Check hierarchy navigation, contextual creation and right-click menus")
    args.add_argument("--interface-only", action="store_true", help="Check sidebar controls, contextual inspector and responsive camera space")
    args.add_argument("--arrangement-only", action="store_true", help="Measure native sizes and test moderate/extreme Planet and Moon drags")
    args.add_argument("--cloud-fade-only", action="store_true", help="Check early responsive cloud fading, identity, smooth zoom and stability on desktop/laptop/narrow canvas")
    args.add_argument("--astronaut-only", action="store_true", help="Check deep Astronaut creation, tethers, compact clusters, persistence, search and Portal references")
    args.add_argument("--crud-only", action="store_true", help="Check camera-stable CRUD, blank descriptions, safe subtree deletion and selection/storage recovery")
    args.add_argument("--ownership-only", action="store_true", help="Check starter/migrated deletion, legacy flag loading, subtree file/link cleanup, persistence and Sample isolation")
    args.add_argument("--portals-only", action="store_true", help="Check Portal creation, reference-only sidebar, canonical travel/content, persistence, cleanup, rollback and touch/Sample isolation")
    args.add_argument("--constellations-only", action="store_true", help="Check collection membership, active overlay/framing, canonical identity, persistence, cleanup, touch and Sample isolation")
    args.add_argument("--content-shortcuts-only", action="store_true", help="Check direct Files/Notes/Bookmarks actions, canonical ownership, lens/camera stability and touch access")
    args.add_argument("--consolidation-only", action="store_true", help="Check copy/menus, overview-to-content actions, search paths, panel overflow, focus and mobile preview lifecycle")
    args.add_argument("--density-only", action="store_true", help="Check late deep labels, stable screen-space overlap suppression, interaction overrides and adaptive deep spacing")
    args.add_argument("--motion-only", action="store_true", help="Check bounded Portal/Constellation cues, one-shot creation/content effects, ambient guards/lifecycle and reduced motion")
    args.add_argument("--mobile-polish-only", action="store_true", help="Check touch drawer density, sheets/menus, short landscape, creation and gesture isolation")
    args.add_argument("--no-connections-only", action="store_true", help="Check legacy record disposal, no Connection UI/lines, preserved hierarchy/tethers, Portal travel and cleanup")
    args.add_argument("--content-only", action="store_true", help="Check notes/links, binary IndexedDB files, previews, failure atomicity, deletion and Sample isolation")
    args.add_argument("--organizer-only", action="store_true", help="Check contextual Add, read-first contents, item menus, breadcrumbs and the full Rich Content backend")
    args.add_argument("--workspace-only", action="store_true", help="Check polished tree/modal, quiet content, overflow management and item management alongside Rich Content storage")
    args.add_argument("--row-actions-only", action="store_true", help="Check row-specific Add targeting, hover/focus/touch access and header More alignment")
    args.add_argument("--capture-baseline", action="store_true", help="Capture sizes before tuning without running new arrangement assertions")
    args.add_argument("--sizes-only", action="store_true", help="Check desktop/mobile native sizes without repeating drag cases")
    args.add_argument("--extremes-only", action="store_true", help="Check only extreme Planet/Moon recovery in the arrangement suite")
    options = args.parse_args()
    browser = find_browser()
    temp_root = Path(tempfile.gettempdir()).resolve()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    with socket.socket() as port_socket:
        port_socket.bind(("127.0.0.1", 0))
        debug_port = port_socket.getsockname()[1]
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
            window.openSelectedRowAdd=()=>hierarchySidebar.rows.get(selectedNode.dataset.entryId).querySelector('.tree-add').click();
        """)

        def evaluate(code):
            return cdp.evaluate(code)

        def check(condition, title):
            nonlocal count
            assert condition, title
            count += 1
            print(f"PASS {title}", flush=True)

        def wait_for(code, timeout=30):
            # Large headless textures and returning Flowing outliers can delay
            # cooling after edits; keep the assertion, allow actual settling.
            if code == 'physics.settled':
                timeout = max(timeout, 60)
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

        def add(name, parent=None):
            evaluate(f"""openEntryForm(null,{json.dumps(parent or '')},true);fields[0].value={json.dumps(name)};fields[1].value='Description of '+fields[0].value;
                fields[2].value='Test';parentField.value={json.dumps(parent or '')};parentField.dispatchEvent(new Event('change'));
                form.requestSubmit();""")
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
            return evaluate(f"galaxyModel.buildHierarchyEdges(entries).some(c=>c.from==={json.dumps(parent)} && c.to==={json.dumps(child)} && c.kind==='hierarchy')")

        def select(entry_id):
            evaluate(f"selectEntry(entries.get({json.dumps(entry_id)}),nodes.get({json.dumps(entry_id)}))")

        def mouse(kind, x, y, **kwargs):
            cdp.call("Input.dispatchMouseEvent", type=kind, x=x, y=y, **kwargs)

        def click_selector(selector, button='left'):
            # Labels can overlap the centers of nearby bodies. Use a point that
            # actually hits the requested element, rather than its neighbour.
            point=evaluate(f"(()=>{{const selector={json.dumps(selector)},element=document.querySelector(selector),r=element.getBoundingClientRect();for(const fy of [.5,.25,.75,.1,.9])for(const fx of [.5,.25,.75,.1,.9]){{const x=r.x+r.width*fx,y=r.y+r.height*fy;if(document.elementFromPoint(x,y)?.closest(selector)===element)return {{x,y}};}}return {{x:r.x+r.width/2,y:r.y+r.height/2}};}})()")
            if '.tree-add' in selector:
                mouse('mouseMoved',**point)
            mouse('mousePressed',**point,button=button,clickCount=1)
            mouse('mouseReleased',**point,button=button,clickCount=1)

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
                const m=hierarchyLayer.getScreenCTM();return [[from,'x1','y1'],[to,'x2','y2']].every(([id,x,y])=>{
                    const p=new DOMPoint(+element.getAttribute(x),+element.getAttribute(y)).matrixTransform(m);
                    const entry=entries.get(id),r=nodes.get(id).getBoundingClientRect();
                    const center=entry.depth===0&&element.dataset.kind==='hierarchy'?camera.worldToScreen(entry.x,entry.y):{x:r.x+r.width/2,y:r.y+r.height/2};
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
            wait_for("camera.view.scale<.95 || [...nodes.values()].filter(n=>n.dataset.culled==='false' && n.dataset.semanticHidden!=='true' && !['galaxy','satellite','astronaut'].includes(n.dataset.body)).every(n=>n.dataset.textureReady==='true')")
            return evaluate("""new Promise(resolve=>{const tick=physics.onTick,costs=[],frames=[];physics.onTick=p=>{const start=performance.now();tick(p);costs.push(performance.now()-start);};physics.reheat(.3);let last;
                const frame=t=>{if(last!==undefined)frames.push(t-last);last=t;if(frames.length<60)requestAnimationFrame(frame);else{physics.onTick=tick;costs.sort((a,b)=>a-b);frames.sort((a,b)=>a-b);resolve({renderP95:costs[Math.floor(costs.length*.95)]||0,frameMedian:frames[30],frameP95:frames[57]});}};requestAnimationFrame(frame);})""")

        cdp.call("Page.navigate", url=origin)
        load()
        check(evaluate("entries.size===6 && entries.get('old-star').role==='sun' && entries.get('old-moon').parentId==='migration-my-galaxy'"), "legacy records migrate intact into My Galaxy")
        check(evaluate("typeof relationships==='undefined' && JSON.parse(localStorage.getItem('galaxy:user-data')).connections.length===0"), 'legacy pairwise records no longer enter application state')
        check(evaluate("localStorage.getItem('galaxy:user-data:pre-cosmic-tree')") == old_raw, "exact original snapshot retained before migration")
        check(evaluate("JSON.parse(localStorage.getItem('galaxy:user-data')).version===5 && JSON.parse(localStorage.getItem('galaxy:user-data')).entries.every(e=>!('role' in e) && !('depth' in e))"), "version 5 persists generic ancestry without hardcoded roles or depth")
        check(evaluate("!document.querySelector('#pin-position-button,[data-action=pin],#panel-placement,#panel-role,#connection-options') && !panel.textContent.includes('Moves naturally') && !dialog.textContent.includes('Other connections') && roleField.tagName==='OUTPUT' && [...entries.values()].every(e=>e.depth>=0)"), "normal UI derives roles without pin, physics status or relationship controls")

        if options.mobile_polish_only:
            evaluate('saveGalaxy()');raw=evaluate("localStorage.getItem('galaxy:user-data')")
            evaluate('loadSampleButton.click()');wait_for("typeof sampleMode!=='undefined'&&sampleMode&&document.readyState==='complete'");load();wait_camera()
            cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=1)
            def tap(selector):
                point=evaluate(f"(()=>{{const n=document.querySelector({json.dumps(selector)});n.scrollIntoView({{block:'nearest'}});const r=n.getBoundingClientRect();return{{x:r.x+r.width/2,y:r.y+r.height/2}}}})()")
                cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
            def fits(selector):
                code=f"(()=>{{const r=document.querySelector({json.dumps(selector)}).getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1}})()"
                wait_for(code);return evaluate(code)
            def shot(name):
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/(name+'.png')).write_bytes(base64.b64decode(result['data']))
            for width,height in [(390,844),(430,932),(844,390)]:
                label=f'{width}x{height}'
                cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=False)
                time.sleep(.2);wait_camera();evaluate("focusEntry('sample-deep-7')");wait_camera();evaluate('physics.pause();hierarchySidebar.setCollapsed(false)');wait_camera()
                check(evaluate("hierarchySidebar.narrow&&!hierarchySidebar.collapsed&&hierarchySidebar.tree.scrollWidth<=hierarchySidebar.tree.clientWidth&&hierarchySidebar.tree.scrollLeft===0"),'deep mobile tree has no horizontal scrolling: '+label)
                check(evaluate("[...hierarchySidebar.tree.querySelectorAll('.tree-add')].filter(n=>getComputedStyle(n).visibility==='visible').length<=2&&getComputedStyle(hierarchySidebar.rows.get('sample-deep-7').querySelector('.tree-add')).visibility==='visible'"),'only selected/focused rows expose touch Add: '+label)
                check(evaluate("(()=>{const a=hierarchySidebar.rows.get('sample-deep-7').querySelector('.tree-add').getBoundingClientRect(),t=hierarchySidebar.toggle.getBoundingClientRect();return a.width>=44&&a.height>=44&&t.width>=44&&t.height>=44})()"),'row action and drawer toggle have comfortable targets: '+label)
                shot('mobile-tree-'+label)
                view=evaluate('JSON.stringify(camera.view)');tap('.hierarchy-row[data-entry-id="sample-deep-7"] .tree-add')
                check(evaluate("!addMenu.hidden&&addMenuTargetId==='sample-deep-7'") and evaluate('JSON.stringify(camera.view)')==view and fits('#add-menu'),'touch Add opens the correct bounded menu without navigation: '+label)
                tap('#add-child-button')
                check(evaluate("dialog.open&&document.activeElement===fields[0]&&document.getElementById('entry-info-fields').hidden&&document.getElementById('parent-field').hidden") and fits('#add-entry-dialog'),'compact Name-only create dialog fits and autofocuses: '+label)
                shot('mobile-create-'+label)
                evaluate(f"fields[0].value='Touch child {label}';form.requestSubmit();physics.pause()")
                child=evaluate('selectedNode.dataset.entryId')
                check(evaluate(f"entries.get({json.dumps(child)}).parentId==='sample-deep-7'&&entries.get({json.dumps(child)}).role==='astronaut'&&!dialog.open"),'touch creation preserves deep hierarchy: '+label)
                evaluate('hierarchySidebar.setCollapsed(true);setInspectorOpen(true)');wait_camera();evaluate('physics.pause()')
                check(fits('#entry-panel') and evaluate('panel.getBoundingClientRect().height<innerHeight-40'),'Content remains an internally scrolling bottom sheet: '+label)
                check(evaluate("['close-inspector-button','entry-more-button','content-add-files','content-add-bookmark'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>=44&&r.height>=44})"),'sheet close, More, Files and Bookmarks have 44px targets: '+label)
                view=evaluate('JSON.stringify(camera.view)')
                tap('#content-notes-empty');evaluate("contentInspector.notes.value='Touch note';contentInspector.notesForm.requestSubmit()")
                tap('#content-add-bookmark');evaluate("document.getElementById('content-link-url').value='google.com';document.getElementById('content-link-title').value='Touch bookmark';contentInspector.linkForm.requestSubmit()")
                evaluate("window.mobilePickerHits=0;contentInspector.files.click=()=>mobilePickerHits++")
                tap('#content-add-files');evaluate("contentInspector.upload([new File(['Touch file'],'touch.txt',{type:'text/plain'})]);void 0");wait_for('contentInspector.jobs.size===0')
                check(evaluate("mobilePickerHits===1&&contentInspector.content().notes.text==='Touch note'&&contentInspector.content().links[0].url==='https://google.com/'&&contentInspector.content().attachments.length===1") and evaluate('JSON.stringify(camera.view)')==view,'touch content shortcuts persist through existing handlers without camera movement: '+label)
                evaluate("contentInspector.editNotes();window.mobileViewportDescriptor=Object.getOwnPropertyDescriptor(window,'visualViewport')")
                evaluate(f"Object.defineProperty(window,'visualViewport',{{configurable:true,value:{{width:{width},height:{height}*.65,offsetTop:0,offsetLeft:0}}}});mobileViewportChanged()")
                keyboard=evaluate("(()=>{const p=panel.getBoundingClientRect(),r=contentInspector.notes.getBoundingClientRect();return {bottom:p.bottom,height:p.height,inputTop:r.top,inputBottom:r.bottom,visible:visualViewport.height,view:JSON.stringify(camera.view)}})()")
                keyboard_ok=keyboard['bottom']<=keyboard['visible']+1 and keyboard['inputBottom']<=keyboard['visible']+1 and keyboard['inputTop']>=0 and keyboard['view']==view
                check(keyboard_ok,'keyboard-sized visible viewport keeps sheet/input visible without moving camera: '+label+(' '+str(keyboard) if not keyboard_ok else ''))
                evaluate("Object.defineProperty(window,'visualViewport',mobileViewportDescriptor);delete window.mobileViewportDescriptor;mobileViewportChanged();contentInspector.notes.value=('Touch note\\n').repeat(30);contentInspector.notesForm.requestSubmit();panel.scrollTop=0")
                before_scroll=evaluate('({top:panel.scrollTop,view:JSON.stringify(camera.view)})')
                point=evaluate("(()=>{const r=panel.getBoundingClientRect();return{x:r.width*.55,y:r.bottom-35}})()")
                cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point])
                for distance in [25,50,75]:
                    cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[{'x':point['x'],'y':point['y']-distance}]);time.sleep(.04)
                cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[]);time.sleep(.15)
                check(evaluate(f"panel.scrollTop>{before_scroll['top']}&&pan===null&&activeNodeDrags===0") and evaluate('JSON.stringify(camera.view)')==before_scroll['view'],'touch sheet scrolling stays isolated from Cosmos gestures: '+label)
                evaluate("contentInspector.editNotes();contentInspector.notes.value='Touch note';contentInspector.notesForm.requestSubmit()")
                evaluate("document.querySelector('#content-links summary').scrollIntoView({block:'end'})")
                tap('#content-links summary');wait_for("document.querySelector('#content-links details').open")
                check(fits('#content-links .content-row-actions'),'bookmark overflow remains inside screen edges: '+label)
                evaluate("document.querySelector('#content-links details').open=false")
                tap('#entry-more-button');check(fits('#entry-actions'),'entry management menu remains on-screen: '+label)
                evaluate('closeContentMenus();panel.scrollTop=panel.scrollHeight');shot('mobile-content-'+label)
                evaluate(f"openContextMenu({json.dumps(child)},innerWidth-1,innerHeight-1)")
                check(fits('#entry-context-menu'),'edge-triggered context menu is clamped and scrollable: '+label)
                evaluate('closeContextMenu();hierarchySidebar.setCollapsed(false)');wait_camera()
                point={'x':width-15,'y':30};cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
                check(evaluate('hierarchySidebar.collapsed&&pan===null&&activeNodeDrags===0'),'outside tap dismisses drawer without starting a canvas gesture: '+label)
                tap('#sidebar-toggle');check(evaluate('!hierarchySidebar.collapsed'),'drawer opens through its visible touch toggle: '+label)
                cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
                check(evaluate('hierarchySidebar.collapsed'),'Escape closes the drawer without starting another interaction: '+label)
                tap('#sidebar-toggle');tap('[data-constellation-id="sample-constellation-techniques"] .constellation-open');wait_camera();evaluate('physics.pause()')
                check(evaluate("activeConstellationId==='sample-constellation-techniques'&&!document.getElementById('constellation-content').hidden") and fits('#entry-panel'),'Constellation overview uses the same bottom sheet: '+label)
                tap('#panel-add-member');check(evaluate("constellationWorkspace.picker.open") and fits('#constellation-picker-dialog'),'touch Add entry uses the existing bounded picker: '+label)
                tap('#close-constellation-picker');evaluate('physics.pause()')
                tap('#constellation-member-list .constellation-member-name');wait_camera();evaluate('physics.pause()')
                check(evaluate("activeConstellationId==='sample-constellation-techniques'&&!document.getElementById('active-constellation-indicator').hidden&&!contentInspector.root.hidden"),'touch entry inspection preserves the persistent lens: '+label)
                tap('#deactivate-constellation-button');check(evaluate('activeConstellationId===null'),'touch deactivation remains reachable: '+label)
                evaluate("openPortal('sample-portal-codex')");wait_camera();evaluate('physics.pause()')
                check(evaluate("selectedNode.dataset.entryId==='sample-moon-0-1-0'&&!panel.hidden&&hierarchySidebar.collapsed"),'Portal arrival opens canonical Contents with drawer closed: '+label)
                # Real touch drag and canvas pan remain separate from panel scrolling.
                evaluate("focusEntry('sample-deep-7')");wait_camera();evaluate('physics.pause()')
                evaluate("(()=>{window.mobileEdgeView={...camera.view};const edgeEntry=entries.get('sample-deep-7');camera.setView({...camera.view,x:physics.bounds.right+20-edgeEntry.x*camera.view.scale,y:(physics.bounds.top+physics.bounds.bottom)/2-edgeEntry.y*camera.view.scale},false);requestLabelLayout(true)})()")
                wait_camera()
                check_rendered("(()=>{const r=nodes.get('sample-deep-7').querySelector('.node-label').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth-8&&r.bottom<=panel.getBoundingClientRect().top})()",'selected edge label stays readable above the sheet: '+label)
                evaluate('camera.setView(mobileEdgeView,false);delete window.mobileEdgeView');wait_camera()
                point=evaluate("(()=>{const r=nodes.get('sample-deep-7').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
                before=evaluate("({x:entries.get('sample-deep-7').x,y:entries.get('sample-deep-7').y,view:JSON.stringify(camera.view)})")
                cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point]);cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[{'x':point['x']+20,'y':point['y']-10}]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[]);evaluate('physics.pause()')
                check(evaluate(f"Math.hypot(entries.get('sample-deep-7').x-({before['x']}),entries.get('sample-deep-7').y-({before['y']}))>1&&activeNodeDrags===0&&pan===null") and evaluate('JSON.stringify(camera.view)')==before['view'],'touch body drag moves the body and retains camera state: '+label)
                evaluate('setInspectorOpen(false);clearSelection()')
                point=evaluate("(()=>{for(let y=60;y<innerHeight-30;y+=30)for(let x=60;x<innerWidth-40;x+=30){if(document.elementFromPoint(x,y)?.id==='graph-viewport')return{x,y}}return{x:innerWidth-60,y:60}})()")
                before=evaluate('JSON.stringify(camera.view)')
                cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point]);cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[{'x':point['x']+18,'y':point['y']+12}]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
                check(evaluate('JSON.stringify(camera.view)')!=before and evaluate('pan===null&&activeNodeDrags===0'),'touch empty-space drag pans without moving a body: '+label)
                scale=evaluate('camera.view.scale');cdp.call('Input.dispatchMouseEvent',type='mouseWheel',x=width/2,y=height/3,deltaY=-30,deltaX=0);wait_camera()
                check(evaluate('camera.view.scale')>scale,'existing camera zoom remains available: '+label)
                evaluate(f"selectEntry(entries.get({json.dumps(child)}),nodes.get({json.dumps(child)}));requestEntryDelete({json.dumps(child)});document.getElementById('delete-entry-form').requestSubmit()")
                wait_for(f"!entries.has({json.dumps(child)})");check(evaluate(f"!nodes.has({json.dumps(child)})"),'mobile canonical deletion keeps the existing cleanup flow: '+label)
            cdp.call('Emulation.setTouchEmulationEnabled',enabled=False,maxTouchPoints=1)
            cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False);time.sleep(.2);wait_camera()
            evaluate("hierarchySidebar.setCollapsed(false);hierarchySidebar.select('sample-deep-7')")
            check(evaluate("!hierarchySidebar.narrow&&hierarchySidebar.rows.get('sample-deep-7').getBoundingClientRect().height===32"),'desktop tree restores its original row sizing')
            check(evaluate("localStorage.getItem('galaxy:user-data')")==raw,'mobile Sample workflows remain isolated from saved data')
            check(not cdp.errors,f'no mobile-polish browser exceptions: {cdp.errors}')
            print(f'{count} mobile-polish browser checks passed',flush=True);return

        if options.motion_only:
            evaluate('saveGalaxy()');raw=evaluate("localStorage.getItem('galaxy:user-data')")
            evaluate('loadSampleButton.click()');wait_for("typeof sampleMode!=='undefined'&&sampleMode&&document.readyState==='complete'");load();wait_camera();evaluate('physics.pause()')
            check(evaluate('motion.stats.materialize===0&&constellationOverlay.edges.length===0&&ambient.layer.children.length===0'),'loaded entries and inactive collections have no materialization or permanent decorative geometry')
            owner='sample-satellite-2-0-0-0';select(owner)
            view=evaluate('JSON.stringify(camera.view)');alpha=evaluate('physics.simulation.alpha()')
            before=evaluate('motion.stats.fileAdd');evaluate("contentInspector.upload([new File(['Motion bytes'],'motion.txt',{type:'text/plain'})]);void 0");wait_for('contentInspector.jobs.size===0')
            check(evaluate('motion.stats.fileAdd')==before+1,'new file settles once after the existing authoritative upload succeeds')
            file_count=evaluate('motion.stats.fileAdd');evaluate('contentInspector.renderLists()')
            check(evaluate('motion.stats.fileAdd')==file_count,'ordinary content rerenders do not replay file arrival')
            metadata=evaluate('contentInspector.content().attachments.at(-1)');key=metadata['storageKey']
            evaluate(f"document.querySelector('[data-attachment-id=\"{metadata['id']}\"] .content-row-actions button').click();document.querySelector('[data-attachment-id=\"{metadata['id']}\"] .content-row-actions button').click()")
            wait_for('contentInspector.jobs.size===0')
            check(evaluate(f"(async()=>motion.stats.fileRemove===1&&await attachmentStore.get({json.dumps(key)})===null&&!contentInspector.content().attachments.some(a=>a.id==={json.dumps(metadata['id'])}))()"),'file departure follows metadata/binary removal without delaying storage authority')
            check(evaluate('JSON.stringify(camera.view)')==view and evaluate('physics.simulation.alpha()')==alpha,'file animation leaves camera and physics unchanged')
            wait_for('motion.animations.size===0')
            material_count=evaluate('motion.stats.materialize');fresh=add('Materialize once','sample-sun-2');evaluate('physics.pause()')
            check(evaluate('motion.stats.materialize')==material_count+1,'only a newly created canonical body materializes')
            evaluate(f"openEntryForm(entries.get({json.dumps(fresh)}));fields[0].value='Renamed material';form.requestSubmit();physics.pause()")
            check(evaluate('motion.stats.materialize')==material_count+1,'rename and graph rerender do not rematerialize existing bodies')
            wait_for('motion.animations.size===0');evaluate('physics.pause()')
            evaluate("focusEntry('sample-moon-4-2-1')");wait_camera();wait_for('motion.animations.size===0');evaluate('physics.pause()')
            geometry=evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.parentId,e.x,e.y]))');arrival=evaluate('motion.stats.arrival')
            evaluate("openPortal('sample-portal-recipe')")
            check(evaluate('motion.stats.portal>0&&!!camera.travel&&[...motion.animations].some(r=>r.animation.effect.getTiming().duration===240)'),'Portal ring cue starts immediately with existing travel and stays brief')
            cdp.call('Input.dispatchMouseEvent',type='mouseWheel',x=650,y=350,deltaY=-30,deltaX=0)
            check(evaluate('!camera.travel'),'wheel still interrupts travel during the activation cue')
            wait_camera();wait_for('motion.animations.size===0')
            check(evaluate('motion.stats.arrival')==arrival,'interrupted Portal travel does not emit a false arrival cue')
            evaluate("focusEntry('sample-moon-4-2-1')");wait_camera();evaluate("openPortal('sample-portal-recipe')");wait_camera()
            check(evaluate('motion.stats.arrival')==arrival+1 and evaluate(f"selectedNode.dataset.entryId==={json.dumps(owner)}"),'completed Portal travel gives one subtle canonical-target arrival cue')
            check(evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.parentId,e.x,e.y]))')==geometry,'Portal cues change neither hierarchy nor preferred/world positions')
            wait_for('motion.animations.size===0')
            evaluate("activateConstellation('sample-constellation-trip')")
            check(evaluate("motion.constellationAnimating&&constellationOverlay.edges.length===3&&[...motion.animations].some(r=>r.element.tagName==='line'&&r.animation.effect.getTiming().duration+r.animation.effect.getTiming().delay<=400)"),'Constellation illumination and sparse line drawing start together with bounded timing')
            evaluate("constellationOverlay.edges.forEach(({line})=>{const r=[...motion.animations].find(a=>a.element===line);if(r)r.animation.pause()})")
            if screenshot_dir:
                result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/'constellation-drawing.png').write_bytes(base64.b64decode(result['data']))
            evaluate("constellationOverlay.edges.forEach(({line})=>{const r=[...motion.animations].find(a=>a.element===line);r?.animation.play()})")
            wait_camera();wait_for('motion.animations.size===0')
            check(evaluate("activeConstellationId==='sample-constellation-trip'&&constellationOverlay.edges.length===3&&constellationOverlay.edges.every(e=>getComputedStyle(e.line).strokeDasharray==='none')"),'completed drawing returns to the normal persistent lens and undashed sparse lines')
            evaluate("activateConstellation('sample-constellation-meals');activateConstellation('sample-constellation-techniques');activateConstellation('sample-constellation-trip')")
            check(evaluate("[...motion.animations].every(r=>r.element.isConnected)&&activeConstellationId==='sample-constellation-trip'"),'rapid collection switches cancel stale cues and keep only connected geometry')
            wait_camera();wait_for('motion.animations.size===0')
            evaluate(f"selectEntry(entries.get({json.dumps(owner)}),nodes.get({json.dumps(owner)}))")
            check(evaluate("activeConstellationId==='sample-constellation-trip'&&!document.getElementById('active-constellation-indicator').hidden"),'inspection during/after signature motion preserves the lens and Content panel')
            evaluate('exitConstellation()')
            check(evaluate('activeConstellationId===null&&constellationOverlay.edges.length===0&&document.getElementById("motion-overlay").children.length===1'),'deactivation clears logical state immediately while a short noninteractive echo fades')
            wait_for('motion.animations.size===0&&motion.ghosts.size===0')
            check(evaluate('document.getElementById("motion-overlay").children.length===0'),'deactivation echo fully cleans up without permanent inactive geometry')
            evaluate("focusEntry('sample-deep-7')");wait_camera();wait_for('motion.animations.size===0');evaluate('physics.pause()')
            point=evaluate("(()=>{const r=nodes.get('sample-deep-7').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
            mouse('mousePressed',**point,button='left',clickCount=1);mouse('mouseMoved',x=point['x']+25,y=point['y']+12,button='left',buttons=1)
            check(evaluate("activeNodeDrags===1&&nodes.get('sample-deep-7').querySelector('.astronaut-figure')&&getComputedStyle(nodes.get('sample-deep-7').querySelector('.astronaut-figure')).transform!=='none'"),'Astronaut drag uses a restrained figure reaction with normal pointer capture')
            before=evaluate('motion.stats.astronaut');mouse('mouseReleased',x=point['x']+25,y=point['y']+12,button='left',clickCount=1);evaluate('physics.pause()')
            check(evaluate('motion.stats.astronaut')==before+1 and evaluate("physics.particles.get('sample-deep-7').fx===null&&layout.get('sample-deep-7').parentId==='sample-deep-6'"),'release settles the figure cue while preserving flowing drag ownership and hierarchy')
            wait_for('motion.animations.size===0')
            evaluate("fitGalaxy(false);focusEntry('sample-galaxy-1')");wait_camera();evaluate('physics.pause()')
            check(evaluate('motion.stats.cloud>0&&motion.clouds.size===0'),'Galaxy focus adds only a transient relative-opacity breath and releases its timer')
            cdp.call('Page.bringToFront');wait_for('document.hasFocus()');wait_for('motion.animations.size===0&&!camera.frame')
            evaluate("openEntryForm()")
            check(evaluate("ambient.trigger('comet')===false&&ambient.active===null"),'ambient scheduler skips modal workflows')
            evaluate('dialog.close()');wait_for('!crudActive');evaluate('physics.pause()')
            select(owner);evaluate('contentInspector.editNotes()')
            check(evaluate("ambient.trigger('comet')===false"),'ambient scheduler skips intentional Notes editing')
            evaluate("document.getElementById('content-cancel-notes').click();contentInspector.editLink()")
            check(evaluate("ambient.trigger('ufo')===false"),'ambient scheduler skips Bookmark editing')
            evaluate("document.getElementById('content-cancel-link').click();motion.constellationUntil=performance.now()+100")
            check(evaluate("ambient.trigger('comet')===false"),'ambient scheduler skips Constellation activation/deactivation motion')
            evaluate('motion.constellationUntil=0;camera.setView({...camera.view,x:camera.view.x+30})')
            check(evaluate("ambient.trigger('comet')===false"),'ambient scheduler skips other major camera movement')
            wait_camera();wait_for('motion.animations.size===0');evaluate('physics.pause()')
            domain=evaluate('JSON.stringify(getGalaxySnapshot())');view=evaluate('JSON.stringify(camera.view)')
            wait_for('ambient.active===null');evaluate('ambient.schedule()')
            production=evaluate('JSON.stringify({timers:ambient.timers,delays:ambient.delays})')
            evaluate('window.debugRandomDraws=0;window.ambientRandom=ambient.random;window.ambientVisible=ambient.visible;window.ambientBusy=ambient.busy;ambient.random=()=>{debugRandomDraws++;return ambientRandom()};ambient.visible=()=>false;ambient.busy=()=>true')
            check(evaluate("ambient.delays.comet>=12000&&ambient.delays.comet<=35000&&ambient.delays.ufo>=45000&&ambient.delays.ufo<=120000&&window.debugComet()===true&&ambient.layer.closest('.universe-background')&&getComputedStyle(ambient.layer).pointerEvents==='none'"),'ambient timers use separate randomized 12–35s comet and 45–120s UFO windows')
            check(evaluate("ambient.debugActive.animation.effect.getKeyframes()[0].opacity==='0.72'&&ambient.active===null&&ambient.layer.children.length===1&&ambient.debugActive.animation.effect.getTiming().duration===1100"),'brighter comet starts visible with a fast pass even while focus and workflow guards block production')
            check(evaluate("ambient.debugActive.object.querySelector('linearGradient').getAttribute('gradientUnits')==='userSpaceOnUse'&&ambient.debugActive.object.querySelector('circle').nextElementSibling.getAttribute('r')==='1.7'"),'comet has a brighter head and an explicit-coordinate gradient that renders its horizontal fading tail')
            if screenshot_dir:
                evaluate('ambient.debugActive.animation.pause();ambient.debugActive.animation.currentTime=ambient.debugActive.animation.effect.getTiming().duration*.5')
                result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/'comet.png').write_bytes(base64.b64decode(result['data']))
                evaluate('ambient.debugActive.animation.play()')
            check(evaluate("window.debugUfo()===true&&ambient.debugActive.object.getAttribute('width')==='28'&&ambient.layer.children.length===1&&ambient.debugActive.animation.effect.getTiming().duration===3200&&!ambient.debugActive.object.querySelector('linearGradient')&&ambient.debugActive.object.querySelector('ellipse')&&ambient.debugActive.object.querySelectorAll('circle').length===3"),'slower UFO has a saucer and three tiny lights, no comet tail, and replaces the previous preview')
            if screenshot_dir:
                evaluate('ambient.debugActive.animation.pause();ambient.debugActive.animation.currentTime=ambient.debugActive.animation.effect.getTiming().duration*.5')
                result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/'ufo.png').write_bytes(base64.b64decode(result['data']))
                evaluate('ambient.debugActive.animation.play()')
            wait_for('ambient.debugActive===null')
            check(evaluate('debugRandomDraws===0'),'debug previews consume no production random draws')
            evaluate('ambient.random=ambientRandom;ambient.visible=ambientVisible;ambient.busy=ambientBusy;delete window.ambientRandom;delete window.ambientVisible;delete window.ambientBusy;delete window.debugRandomDraws')
            check(evaluate('JSON.stringify({timers:ambient.timers,delays:ambient.delays})')==production,'debug calls do not change pending production timers')
            check(evaluate('JSON.stringify(getGalaxySnapshot())')==domain and evaluate('JSON.stringify(camera.view)')==view and evaluate('ambient.layer.children.length===0'),'ambient objects fully remove themselves and never change domain state or camera')
            for doomed in [fresh,'sample-deep-7',owner]:
                evaluate(f"focusEntry({json.dumps(doomed)})");wait_camera();wait_for('motion.animations.size===0');evaluate('physics.pause()')
                before=evaluate('motion.stats.deletion');view=evaluate('JSON.stringify(camera.view)')
                result=evaluate(f"(async()=>{{requestEntryDelete({json.dumps(doomed)});document.getElementById('delete-entry-form').requestSubmit();await new Promise(resolve=>setTimeout(resolve,0));physics.pause();const echo=document.querySelector('.node-deletion-ghost');const r=[...motion.animations].find(r=>r.group==='deletion');r?.animation.pause();if(r)r.animation.currentTime=90;return {{deleted:!entries.has({json.dumps(doomed)}),echo:!!echo,ghosts:document.querySelectorAll('.node-deletion-ghost').length,canonical:!!echo?.dataset.entryId,figure:!!echo?.querySelector('.astronaut-figure'),pointer:echo&&getComputedStyle(echo).pointerEvents}};}})()")
                check(result['deleted'] and result['echo'] and result['ghosts']==1 and not result['canonical'] and result['pointer']=='none' and evaluate('motion.stats.deletion')==before+1,'canonical deletion immediately removes state and leaves exactly one noninteractive implosion: '+doomed)
                if doomed=='sample-deep-7':check(result['figure'],'deep Astronaut ghost preserves its rendered figure')
                check(evaluate('JSON.stringify(camera.view)')==view,'deletion echo preserves camera: '+doomed)
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/('implosion-'+doomed+'.png')).write_bytes(base64.b64decode(result['data']))
                evaluate("[...motion.animations].filter(r=>r.group==='deletion').forEach(r=>r.animation.play())")
                wait_for("!document.querySelector('.node-deletion-ghost')&&motion.ghosts.size===0")
            cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'reduce'}]);wait_for('motion.reduced&&ambient.reduced')
            check(evaluate("motion.animations.size===0&&Object.values(ambient.timers).every(t=>t===null)&&ambient.active===null&&ambient.trigger('comet')===false"),'reduced motion cancels cues/timers and prevents ambient travel')
            check(evaluate("typeof window.debugComet()==='string'&&window.debugUfo().includes('reduced motion')&&ambient.debugActive===null"),'reduced-motion debug helpers explain why a preview cannot run instead of returning false')
            calm_count=evaluate('motion.stats.materialize');new=add('Calm creation','sample-sun-2');evaluate('physics.pause()')
            check(evaluate('motion.stats.materialize')==calm_count and evaluate(f"entries.has({json.dumps(new)})&&nodes.has({json.dumps(new)})"),'reduced-motion creation remains functional without materialization')
            before=evaluate('motion.stats.deletion');evaluate(f"requestEntryDelete({json.dumps(new)});document.getElementById('delete-entry-form').requestSubmit();physics.pause()")
            check(evaluate(f"!entries.has({json.dumps(new)})&&!document.querySelector('.node-deletion-ghost')&&motion.stats.deletion==={before}"),'reduced-motion deletion remains immediate without an implosion')
            evaluate("activateConstellation('sample-constellation-trip');openPortal('sample-portal-codex')")
            check(evaluate("activeConstellationId==='sample-constellation-trip'&&selectedNode.dataset.entryId==='sample-moon-0-1-0'&&camera.frame===null&&motion.animations.size===0"),'reduced-motion Portal/Constellation behavior has a calm static equivalent')
            check(evaluate("localStorage.getItem('galaxy:user-data')")==raw,'all Sample density/motion interactions remain isolated from real saved data')
            check(not cdp.errors,f'no motion browser exceptions: {cdp.errors}')
            print(f'{count} motion browser checks passed',flush=True);return

        if options.density_only:
            evaluate('loadSampleButton.click()');wait_for("typeof sampleMode!=='undefined'&&sampleMode&&document.readyState==='complete'");load();wait_camera();evaluate('physics.pause()')
            owner='sample-satellite-2-0-0-0'
            for name in ['Sauce preparation','Texture observation','Resting time','Slow simmer','Crust notes','Seasoning balance']:add(name,owner)
            wait_for('physics.settled');evaluate('physics.pause();clearSelection()')
            def view(scale):
                evaluate(f"(()=>{{const p=entries.get({json.dumps(owner)}),b=physics.bounds;camera.setView({{scale:{scale},x:(b.left+b.right)/2-p.x*{scale},y:(b.top+b.bottom)/2-p.y*{scale}}},false);requestLabelLayout(true)}})()")
                wait_for('labelDensity.frame===null');time.sleep(.3)
            def visible_labels():return evaluate("[...nodes.values()].filter(n=>n.dataset.culled!=='true'&&n.dataset.semanticHidden!=='true'&&parseFloat(getComputedStyle(n.querySelector('.node-label')).opacity)>.18).length")
            view(.95)
            check(evaluate("[...nodes].filter(([id,n])=>entries.get(id).role==='astronaut'&&n.dataset.culled==='false').some(([id,n])=>!n.inert&&getComputedStyle(n.querySelector('.node-label')).opacity==='0')"),'deep bodies remain visible while their labels wait for closer zoom')
            medium=visible_labels();view(1.7);close=visible_labels()
            check(close>medium,'close zoom reveals more detail than medium zoom')
            evaluate(f"(()=>{{const [a,b]=galaxyModel.childrenOf(entries,{json.dumps(owner)});window.densityMoved=b.id;window.densityPosition={{x:b.x,y:b.y}};const p=physics.particles.get(b.id);b.x=p.x=a.x+8;b.y=p.y=a.y;document.getElementById('entry-search').focus();renderGraph();requestLabelLayout(true)}})()")
            wait_for('labelDensity.frame===null');time.sleep(.3)
            check(evaluate('labelDensity.hiddenIds.size>0'),'screen-space density suppresses overlapping lower-priority labels')
            check(evaluate("(()=>{const list=[...nodes.values()].filter(n=>n.dataset.culled==='false'&&n.dataset.semanticHidden==='false'&&parseFloat(getComputedStyle(n.querySelector('.node-label')).opacity)>.8&&!n.classList.contains('selected'));return list.every((a,i)=>list.slice(i+1).every(b=>{const x=a.querySelector('.node-label').getBoundingClientRect(),y=b.querySelector('.node-label').getBoundingClientRect(),area=Math.max(0,Math.min(x.right,y.right)-Math.max(x.left,y.left)-2)*Math.max(0,Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)-2);return area<=Math.min(x.width*x.height,y.width*y.height)*.26;}));})()"),'visible ordinary labels avoid substantial rectangle overlap')
            hidden=evaluate('JSON.stringify([...labelDensity.hiddenIds].sort())');evaluate('requestLabelLayout(true)');wait_for('labelDensity.frame===null')
            check(evaluate('JSON.stringify([...labelDensity.hiddenIds].sort())')==hidden,'stationary density decisions are deterministic')
            evaluate("Object.assign(entries.get(densityMoved),densityPosition);Object.assign(physics.particles.get(densityMoved),densityPosition);renderGraph();requestLabelLayout(true)")
            deep=evaluate(f"galaxyModel.childrenOf(entries,{json.dumps(owner)}).at(-1).id")
            evaluate(f"selectEntry(entries.get({json.dumps(deep)}),nodes.get({json.dumps(deep)}));requestLabelLayout(true)")
            check_rendered(f"parseFloat(getComputedStyle(nodes.get({json.dumps(deep)}).querySelector('.node-label')).opacity)>.98",'selected deep label always reveals through density suppression')
            view(.95);evaluate('clearSelection()')
            point=evaluate(f"(()=>{{const r=nodes.get({json.dumps(deep)}).getBoundingClientRect();return{{x:r.x+r.width/2,y:r.y+r.height/2}}}})()")
            mouse('mouseMoved',**point)
            check_rendered(f"hoveredEntryId==={json.dumps(deep)}&&parseFloat(getComputedStyle(nodes.get({json.dumps(deep)}).querySelector('.node-label')).opacity)>.98",'hover reveals a deep label even before its normal label zoom threshold')
            mouse('mouseMoved',x=10,y=10)
            evaluate(f"keyboardNavigation=true;nodes.get({json.dumps(deep)}).focus({{preventScroll:true}})");wait_camera()
            check_rendered(f"selectedNode.dataset.entryId==={json.dumps(deep)}&&getComputedStyle(nodes.get({json.dumps(deep)}).querySelector('.node-label')).opacity==='1'",'keyboard focus navigates and reveals the entry label')
            evaluate(f"searchField.value=entries.get({json.dumps(deep)}).name;searchField.dispatchEvent(new Event('input'));searchResultList.querySelector('[data-entry-id=\"{deep}\"]').focus({{preventScroll:true}})")
            check(evaluate(f"searchFocusId==={json.dumps(deep)}"),'current Search focus receives a protected density priority')
            evaluate('dismissTemporaryReveal();searchFocusId=null')
            check(evaluate(f"physics.deepSiblingBoost({json.dumps(owner)})>=10&&physics.deepSiblingBoost('sample-deep-7')===0&&physics.particles.get('sample-deep-7').clusterAnchor.clusterRadius<145"),'dense direct siblings gain local clearance while sparse chains and cluster footprint stay bounded')
            check(evaluate(f"nodes.get({json.dumps(deep)}).querySelector('.node-hit-area').getBoundingClientRect().width>=24&&galaxyModel.roles.sun.scale===1.75&&galaxyModel.roles.planet.scale===1"),'deep bodies keep accessible hit areas without shrinking Suns or Planets')
            if screenshot_dir:
                for scale in [.55,.95,1.3,1.7]:
                    evaluate('keyboardNavigation=false;document.getElementById("entry-search").blur();clearSelection()');view(scale)
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/f'density-{scale}.png').write_bytes(base64.b64decode(result['data']))
            check(not cdp.errors,f'no density browser exceptions: {cdp.errors}')
            print(f'{count} density browser checks passed',flush=True);return

        if options.consolidation_only:
            def shot(name):
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/(name+'.png')).write_bytes(base64.b64decode(result['data']))
            g1=add('Work');sun=add('Projects',g1);chain=[sun]
            for name in ['Research','Preparation','Outline','Duplicate Name']:chain.append(add(name,chain[-1]))
            owner=chain[-1];g2=add('Travel');other_sun=add('Projects',g2);other=add('Duplicate Name',other_sun)
            wait_for('physics.settled');wait_camera();evaluate('physics.pause()');select(owner)
            evaluate("constellationWorkspace.openName();document.getElementById('constellation-name').value='Launch';document.getElementById('constellation-name-form').requestSubmit()")
            wait_for('!crudActive');evaluate('physics.pause()');lens=evaluate('[...constellations.keys()].at(-1)')
            evaluate(f"constellationWorkspace.setMember({json.dumps(lens)},{json.dumps(owner)},true);constellationWorkspace.setMember({json.dumps(lens)},{json.dumps(other)},true);activateConstellation({json.dumps(lens)})");wait_camera()
            refs=evaluate('JSON.stringify([...constellations.values()])');view=evaluate('JSON.stringify(camera.view)');alpha=evaluate('physics.simulation.alpha()')
            evaluate("window.consolidationPickerClicks=0;contentInspector.files.addEventListener('click',event=>{event.preventDefault();consolidationPickerClicks++})")
            for action in ['note','bookmark','files']:
                evaluate("showConstellationOverview();openSelectedRowAdd();addMenu.querySelector('[data-add="+action+"]').click()")
                check(evaluate(f"activeConstellationId==={json.dumps(lens)}&&!constellationOverview&&!document.getElementById('panel-rich-content').hidden&&contentInspector.entryId==={json.dumps(owner)}"),f'left Add {action} leaves an already-selected entry overview and opens canonical Contents without dropping the lens')
                if action=='note':
                    check(evaluate("!contentInspector.notesForm.hidden&&document.activeElement===contentInspector.notes"),'overview-to-Notes exposes the existing editor rather than a hidden form')
                    evaluate("document.getElementById('content-cancel-notes').click()")
                elif action=='bookmark':
                    check(evaluate("!contentInspector.linkForm.hidden&&document.activeElement.id==='content-link-url'"),'overview-to-Bookmarks exposes the existing add form')
                    evaluate("document.getElementById('content-cancel-link').click()")
                else:check(evaluate('consolidationPickerClicks===1'),'overview-to-Files invokes the existing picker once')
            check(evaluate('JSON.stringify(camera.view)')==view and evaluate('JSON.stringify([...constellations.values()])')==refs and evaluate('physics.simulation.alpha()')==alpha,'overview content shortcuts preserve camera, collection references and physics temperature')
            evaluate(f"contentInspector.editNotes();contentInspector.notes.value='Unfinished note';openContextMenu({json.dumps(owner)},500,300)")
            check(evaluate("!contentInspector.notesForm.hidden&&contentInspector.notes.value==='Unfinished note'"),'opening a same-entry context menu preserves its unfinished note')
            check(evaluate("[...contextMenu.querySelectorAll(':scope > button:not([hidden])')].map(b=>b.textContent).join('|')==='Add Astronaut|Add files|Add to Constellation|Create Portal...|Edit info|Delete entry'"),'canonical context menu has coherent contextual creation, collection/access and management actions')
            evaluate("contextMenu.querySelector('[data-action=files]').click()")
            check(evaluate('consolidationPickerClicks===2') and evaluate('JSON.stringify(camera.view)')==view,'canonical right-click Add files uses the same stable content handler')
            evaluate("document.getElementById('content-cancel-notes').click();contentInspector.files.dispatchEvent(new Event('cancel'));contentInspector.upload([new File(['Consolidation bytes'],'record.txt',{type:'text/plain'})]);void 0");wait_for('contentInspector.jobs.size===0')
            evaluate(f"openPortalDialog({json.dumps(owner)});portalParentId={json.dumps(g2)};document.getElementById('portal-form').requestSubmit()")
            wait_for('!crudActive');evaluate('physics.pause()');portal=evaluate('[...portals.keys()].at(-1)')
            check(evaluate(f"hierarchySidebar.rows.get({json.dumps(portal)}).title.includes('Portal to Duplicate Name')&&hierarchySidebar.rows.get({json.dumps(portal)}).title.includes('Work')&&hierarchySidebar.rows.get({json.dumps(portal)}).querySelector('.tree-portal-icon')&&nodes.size===entries.size&&physics.particles.size===entries.size"),'Portal leaf conveys original location with its own icon and creates no Cosmos particle')
            evaluate(f"const p=hierarchySidebar.rows.get({json.dumps(portal)}).querySelector('.tree-portal-actions');p.focus({{preventScroll:true}});p.click()")
            check(evaluate("[...contextMenu.querySelectorAll(':scope > button:not([hidden])')].map(b=>b.textContent).join('|')==='Go to original|Remove Portal'"),'Portal menu clearly separates original navigation from reference removal')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
            check(evaluate(f"contextMenu.hidden&&document.activeElement===hierarchySidebar.rows.get({json.dumps(portal)}).querySelector('.tree-portal-actions')&&document.activeElement.getAttribute('aria-expanded')==='false'"),'Portal menu Escape restores its own action-button focus and expanded state')
            evaluate("searchField.value='Duplicate Name';searchField.dispatchEvent(new Event('input'))")
            check(evaluate("searchResultList.querySelectorAll('button').length===2&&[...searchResultList.querySelectorAll('small')].some(n=>n.textContent.includes('Work'))&&[...searchResultList.querySelectorAll('small')].some(n=>n.textContent.includes('Travel'))"),'canonical Search disambiguates duplicate names with full ancestry and omits Portal duplicates')
            evaluate(f"focusEntry({json.dumps(other)})");wait_camera()
            evaluate(f"openPortalContextMenu({json.dumps(portal)},500,250);contextMenu.querySelector('[data-action=open-portal]').click()");wait_camera()
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(owner)}&&activeConstellationId==={json.dumps(lens)}&&contentInspector.entryId==={json.dumps(owner)}&&panelAncestry.children.length===galaxyModel.ancestors(entries,{json.dumps(owner)}).length&&panelAncestry.textContent.includes('Work')&&!panelAncestry.textContent.includes('Duplicate Name')"),'Go to original retains cross-Galaxy travel, active lens, canonical contents and ancestor-only breadcrumbs')
            content=evaluate(f"JSON.stringify(entries.get({json.dumps(owner)}).content)");view=evaluate('JSON.stringify(camera.view)')
            evaluate(f"openPortalContextMenu({json.dumps(portal)},500,250);contextMenu.querySelector('[data-action=remove-portal]').click()")
            check(evaluate(f"!portals.has({json.dumps(portal)})&&entries.has({json.dumps(owner)})") and evaluate(f"JSON.stringify(entries.get({json.dumps(owner)}).content)")==content and evaluate('JSON.stringify(camera.view)')==view,'Remove Portal preserves the original content and camera')
            evaluate(f"document.querySelector('[data-constellation-id=\"{lens}\"] .constellation-open').focus({{preventScroll:true}})")
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='F10',code='F10',modifiers=8,windowsVirtualKeyCode=121)
            check(evaluate("constellationOverview&&!entryActions.hidden&&[...entryActions.querySelectorAll('button:not([hidden])')].map(b=>b.textContent).join('|')==='Rename|Delete Constellation'"),'Constellation keyboard context menu opens collection management without pretending to be an entry')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
            evaluate("document.querySelector('#constellation-member-list summary').focus({preventScroll:true})")
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='ArrowDown',code='ArrowDown',windowsVirtualKeyCode=40)
            check(evaluate("document.activeElement.textContent==='Remove from Constellation'&&document.activeElement.getAttribute('role')==='menuitem'"),'collection entry overflow shares keyboard navigation and clear membership-only removal')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
            check(evaluate(f"activeConstellationId==={json.dumps(lens)}&&document.activeElement.tagName==='SUMMARY'&&!document.activeElement.parentElement.open"),'overflow Escape closes its menu and returns focus without deactivating the lens')
            shot('consolidated-desktop-overview')
            evaluate(f"selectEntry(entries.get({json.dumps(owner)}),nodes.get({json.dumps(owner)}));hierarchySidebar.rows.get({json.dumps(owner)}).querySelector('.tree-add').focus({{preventScroll:true}});hierarchySidebar.render()")
            check(evaluate("document.activeElement.classList.contains('tree-add')"),'hierarchy rerenders preserve contextual action focus')
            shot('consolidated-desktop-contents')
            for entry_id in evaluate('[...entries.keys()]'):evaluate(f"constellationWorkspace.setMember({json.dumps(lens)},{json.dumps(entry_id)},true)")
            cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=False)
            cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=1);time.sleep(.2);wait_camera()
            evaluate('showConstellationOverview();document.querySelector("#constellation-member-list li:last-child summary").scrollIntoView({block:"end"})')
            click_selector('#constellation-member-list li:last-child summary');wait_for('document.querySelector("#constellation-member-list li:last-child details").open')
            check_rendered("(()=>{const r=document.querySelector('#constellation-member-list li:last-child .content-row-actions').getBoundingClientRect(),p=panel.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom&&r.left>=0&&r.right<=innerWidth})()",'collection entry overflow fits the mobile bottom sheet using the same adaptive placement as files/bookmarks')
            shot('consolidated-mobile-overflow')
            evaluate(f"selectEntry(entries.get({json.dumps(owner)}),nodes.get({json.dumps(owner)}));hierarchySidebar.setCollapsed(false)")
            check(evaluate(f"panel.hidden&&!contentInspector.visible&&contentInspector.urls.size===0&&activeConstellationId==={json.dumps(lens)}"),'opening the mobile hierarchy drawer stops hidden Contents previews while preserving the lens')
            shot('consolidated-mobile-sidebar')
            evaluate('physics.resume()');wait_for('physics.settled');evaluate('physics.pause();saveGalaxy()');raw=evaluate("localStorage.getItem('galaxy:user-data')")
            evaluate('loadSampleButton.click()');wait_for("typeof sampleMode!=='undefined'&&sampleMode&&document.readyState==='complete'");load();wait_camera();evaluate('physics.pause()')
            check(evaluate("entries.size===187&&physics.particles.size===187&&portals.size===3&&constellations.size===3&&constellationOverlay.edges.length===0&&contentInspector.previewLoads===0"),'Sample stays bounded: canonical particles only, no inactive collection geometry or preloaded file previews')
            check(evaluate("!document.querySelector('#connection-picker,#panel-connections,[data-action=connect],[data-action=pin]')&&[...document.querySelectorAll('button,[aria-label]')].filter(n=>n.getClientRects().length).every(n=>!(/\\bMembers?\\b|Semantic Connections|Tool Galaxy|\\bUnpin\\b/i.test(n.textContent+' '+(n.ariaLabel||''))))&&JSON.parse(localStorage.getItem('galaxy:user-data')).version===5"),'visible product copy is consolidated without returning obsolete Connections/Pin UI or changing schema')
            check(evaluate("localStorage.getItem('galaxy:user-data')")==raw,'Sample inspection preserves real data after consolidation')
            check(not cdp.errors,f'no consolidation browser exceptions: {cdp.errors}')
            print(f'{count} consolidation browser checks passed',flush=True)
            return

        if options.content_shortcuts_only:
            home=add('Shortcut Galaxy');first=add('First content entry',home);second=add('Second content entry',home);place=add('Portal location')
            wait_for('physics.settled');evaluate('physics.pause()')
            evaluate(f"constellationWorkspace.openName();document.getElementById('constellation-name').value='Content lens';document.getElementById('constellation-name-form').requestSubmit();physics.pause()")
            lens=evaluate('[...constellations.keys()].at(-1)')
            evaluate(f"constellationWorkspace.setMember({json.dumps(lens)},{json.dumps(first)},true);constellationWorkspace.setMember({json.dumps(lens)},{json.dumps(second)},true);activateConstellation({json.dumps(lens)})");wait_camera();select(first)
            evaluate("physics.pause();window.shortcutPickerClicks=0;window.shortcutPickerOwner=null;contentInspector.files.addEventListener('click',event=>{event.preventDefault();shortcutPickerClicks++;shortcutPickerOwner=contentInspector.entryId})")
            view=evaluate('JSON.stringify(camera.view)');refs=evaluate('JSON.stringify([...constellations.values()])');alpha=evaluate('physics.simulation.alpha()')
            mouse('mouseMoved',x=15,y=15)
            check(evaluate("['content-add-files','content-add-bookmark'].every(id=>getComputedStyle(document.getElementById(id)).opacity==='0')"),'desktop section + actions remain quiet before hover/focus')
            evaluate("document.getElementById('content-add-files').focus({preventScroll:true})")
            check(evaluate("getComputedStyle(document.getElementById('content-add-files')).opacity==='1'&&document.activeElement.ariaLabel==='Add files'"),'Files + is keyboard reachable and becomes visible on focus')
            click_selector('#content-add-files')
            check(evaluate(f"shortcutPickerClicks===1&&shortcutPickerOwner==={json.dumps(first)}&&!document.getElementById('content-file-limit').hidden"),'Files + invokes the existing canonical-entry file picker')
            upload=profile/'shortcut.txt';upload.write_text('Direct shortcut file',encoding='utf-8')
            root=cdp.call('DOM.getDocument')['root']['nodeId'];file_node=cdp.call('DOM.querySelector',nodeId=root,selector='#content-files')['nodeId']
            cdp.call('DOM.setFileInputFiles',nodeId=file_node,files=[str(upload)]);wait_for('contentInspector.jobs.size===0&&contentInspector.content().attachments.length===1')
            key=evaluate('contentInspector.content().attachments[0].storageKey')
            check(evaluate(f"(async()=>document.querySelector('#content-attachments .content-file-name').textContent==='shortcut.txt'&&contentInspector.content().attachments[0].entryId==={json.dumps(first)}&&(await attachmentStore.get({json.dumps(key)})).blob.size===20)()"),'picker change uses existing upload/IndexedDB flow and shows the file normally')
            click_selector('#content-notes-empty')
            check(evaluate("!contentInspector.notesForm.hidden&&document.activeElement===contentInspector.notes&&document.getElementById('content-notes-empty').hidden"),'No notes directly enters the existing note editor')
            evaluate("contentInspector.notes.value='Direct note';contentInspector.notesForm.requestSubmit()")
            check(evaluate("contentInspector.notesForm.hidden&&!contentInspector.notesView.hidden&&contentInspector.notesView.textContent==='Direct note'&&!document.getElementById('content-edit-notes').hidden"),'saved Notes remain read-first with the existing subtle Edit action')
            click_selector('#content-edit-notes');evaluate("document.getElementById('content-cancel-notes').click()")
            check(evaluate("contentInspector.notesForm.hidden&&contentInspector.content().notes.text==='Direct note'"),'existing note Edit and Cancel preserve saved content')
            click_selector('#content-add-bookmark')
            check(evaluate("!contentInspector.linkForm.hidden&&document.activeElement.id==='content-link-url'&&contentInspector.editingLinkId===null"),'Bookmarks + opens the existing temporary add form')
            evaluate("document.getElementById('content-link-url').value='google.com';document.getElementById('content-link-title').value='Direct bookmark';contentInspector.linkForm.requestSubmit()")
            check(evaluate("contentInspector.linkForm.hidden&&contentInspector.content().links[0].url==='https://google.com/'&&document.querySelector('#content-links a').textContent==='Direct bookmark'"),'bookmark shortcut retains URL normalization and read-first display')
            evaluate('openSelectedRowAdd();addMenu.querySelector("[data-add=note]").click()')
            check(evaluate("!contentInspector.notesForm.hidden&&contentInspector.notes.value==='Direct note'&&[...addMenu.querySelectorAll('button')].map(b=>b.dataset.add||'child').join(',')==='child,files,note,bookmark'"),'left row + continues to provide all existing contextual Add actions')
            evaluate("document.getElementById('content-cancel-notes').click()")
            check(evaluate(f"activeConstellationId==={json.dumps(lens)}&&!document.getElementById('active-constellation-indicator').hidden") and evaluate('JSON.stringify([...constellations.values()])')==refs and evaluate('JSON.stringify(camera.view)')==view and evaluate('physics.simulation.alpha()')==alpha,'direct and sidebar content actions preserve lens, memberships, camera and physics heat')
            evaluate(f"openPortalDialog({json.dumps(second)});portalParentId={json.dumps(place)};document.getElementById('portal-form').requestSubmit();physics.pause()")
            portal=evaluate('[...portals.keys()].at(-1)');evaluate(f"openPortal({json.dumps(portal)})");wait_camera();evaluate('physics.pause()')
            view=evaluate('JSON.stringify(camera.view)')
            click_selector('#content-add-bookmark');evaluate("document.getElementById('content-link-url').value='www.example.com';contentInspector.linkForm.requestSubmit()")
            check(evaluate(f"contentInspector.entryId==={json.dumps(second)}&&entries.get({json.dumps(second)}).content.links[0].url==='https://www.example.com/'&&entries.get({json.dumps(first)}).content.links[0].title==='Direct bookmark'&&[...portals.values()].every(p=>!p.content)&&[...constellations.values()].every(c=>!c.content)"),'shortcut after Portal navigation targets the new canonical owner, never a Portal or collection record')
            cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=False)
            cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=1);time.sleep(.2);wait_camera()
            evaluate('setInspectorOpen(true);panel.scrollTop=0');view=evaluate('JSON.stringify(camera.view)');alpha=evaluate('physics.simulation.alpha()')
            check(evaluate("['content-add-files','content-add-bookmark'].every(id=>{const n=document.getElementById(id),r=n.getBoundingClientRect();return getComputedStyle(n).opacity==='1'&&r.width>=32&&r.height>=32})&&document.getElementById('content-notes-empty').getBoundingClientRect().height>=32"),'touch actions use padded targets while their icons stay small')
            def tap(selector):
                evaluate(f"document.querySelector({json.dumps(selector)}).scrollIntoView({{block:'nearest'}})")
                point=evaluate(f"(()=>{{const r=document.querySelector({json.dumps(selector)}).getBoundingClientRect();return{{x:r.x+r.width/2,y:r.y+r.height/2}}}})()")
                cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
            tap('#content-add-files');check(evaluate(f"shortcutPickerClicks===2&&shortcutPickerOwner==={json.dumps(second)}"),'touch Files + invokes the same picker for the selected canonical entry')
            evaluate("contentInspector.files.dispatchEvent(new Event('cancel'))")
            tap('#content-notes-empty');check(evaluate('!contentInspector.notesForm.hidden'),'touch No notes enters note editing')
            evaluate("document.getElementById('content-cancel-notes').click()")
            tap('#content-add-bookmark');check(evaluate('!contentInspector.linkForm.hidden'),'touch Bookmarks + opens the same add form')
            evaluate("document.getElementById('content-cancel-link').click()")
            check(evaluate(f"activeConstellationId==={json.dumps(lens)}&&!document.getElementById('active-constellation-indicator').hidden") and evaluate('JSON.stringify(camera.view)')==view and evaluate('physics.simulation.alpha()')==alpha and evaluate('JSON.stringify([...constellations.values()])')==refs,'touch shortcuts preserve lens, camera, physics and collection references')
            if screenshot_dir:
                result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/'content-shortcuts-mobile.png').write_bytes(base64.b64decode(result['data']))
            check(not cdp.errors,f'no content-shortcut browser exceptions: {cdp.errors}')
            print(f'{count} content-shortcut browser checks passed',flush=True)
            return

        if options.constellations_only:
            def shot(name):
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                    (screenshot_dir/(name+'.png')).write_bytes(base64.b64decode(result['data']))
            def create_collection(name):
                evaluate(f"document.getElementById('new-constellation-button').click();document.getElementById('constellation-name').value={json.dumps(name)};document.getElementById('constellation-name-form').requestSubmit();physics.pause()")
                return evaluate('[...constellations.keys()].at(-1)')
            def member(collection,entry):
                evaluate(f"constellationWorkspace.setMember({json.dumps(collection)},{json.dumps(entry)},true)")
            def overlay_aligned():
                return evaluate("constellationOverlay.edges.every(({from,to,line})=>{const a=nodes.get(from),b=nodes.get(to);return Math.abs(+line.getAttribute('x1')-a.renderX)<.01&&Math.abs(+line.getAttribute('y1')-a.renderY)<.01&&Math.abs(+line.getAttribute('x2')-b.renderX)<.01&&Math.abs(+line.getAttribute('y2')-b.renderY)<.01})")
            check(evaluate("constellations.size===0&&document.getElementById('constellations-section').parentElement===hierarchySidebar.tree.parentElement&&!hierarchySidebar.tree.contains(document.getElementById('constellation-list'))"),'old saved hierarchy loads with a separate empty Constellations section')
            check(evaluate("!document.getElementById('constellations-section').hidden&&constellationWorkspace.list.hidden&&document.getElementById('constellations-toggle').getAttribute('aria-expanded')==='false'"),'empty Constellations section remains visible and compact with an independent chevron and +')
            g1=add('Collection home');sun=add('Plans',g1);planet=add('Hotel',sun);moon=add('Packing',planet);satellite=add('Checklist',moon);deep=add('Deep detail',satellite)
            g2=add('Other Galaxy');other=add('Hotel',g2);unrelated=add('Unrelated',other)
            wait_for('physics.settled');wait_camera();evaluate('physics.pause()')
            select(deep)
            check(evaluate("!document.querySelector('.sidebar-actions .collection-add')&&getComputedStyle(document.getElementById('new-constellation-button')).opacity==='0'"),'heading + is quiet by default and no global + is added beside Search')
            evaluate("document.getElementById('new-constellation-button').focus()")
            check(evaluate("getComputedStyle(document.getElementById('new-constellation-button')).opacity==='1'"),'heading + is reachable and visible with keyboard focus')
            click_selector('#new-constellation-button')
            check(evaluate("constellationWorkspace.nameDialog.open&&document.activeElement.id==='constellation-name'&&document.querySelectorAll('#constellation-name-form input').length===1"),'Create Constellation is a compact autofocused Name-only modal')
            evaluate("document.getElementById('constellation-name').value='Favorites'")
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Enter',code='Enter',windowsVirtualKeyCode=13,text='\r')
            cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Enter',code='Enter',windowsVirtualKeyCode=13)
            check(evaluate("!constellationWorkspace.nameDialog.open"), 'Enter submits collection creation')
            wait_for('!constellationWorkspace.nameDialog.open');evaluate('physics.pause()')
            check(evaluate("!constellationWorkspace.list.hidden&&document.getElementById('constellations-toggle').getAttribute('aria-expanded')==='true'"),'first collection creation automatically expands the section')
            c1=evaluate('[...constellations.keys()].at(-1)');c2=create_collection('Project Launch');empty=create_collection('Empty group')
            check(evaluate(f"constellations.get({json.dumps(c1)}).memberEntryIds.length===0&&constellations.size===3"),'creation makes an empty independent collection before adding members')
            view=evaluate('JSON.stringify(camera.view)');evaluate("document.getElementById('constellations-toggle').click()")
            check(evaluate("constellationWorkspace.list.hidden&&!constellationWorkspace.nameDialog.open"),'section chevron collapses without opening creation')
            later=create_collection('Later collection')
            check(evaluate("constellationWorkspace.list.hidden&&JSON.parse(localStorage.getItem('galaxy:navigation-ui')).constellationsCollapsed") and evaluate('JSON.stringify(camera.view)')==view,'later creation respects manual collapse and saves UI state without camera movement')
            evaluate("document.getElementById('constellations-toggle').click()")
            topology=evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.parentId,e.role,e.depth,e.content]))')
            view=evaluate('JSON.stringify(camera.view)');alpha=evaluate('physics.simulation.alpha()');positions=evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.x,e.y]))')
            evaluate(f"document.querySelector('[data-constellation-id=\"{c1}\"] .collection-add').focus()")
            click_selector(f'[data-constellation-id="{c1}"] .collection-add')
            check(evaluate(f"constellationWorkspace.picker.open&&constellationWorkspace.pickerId==={json.dumps(c1)}&&activeConstellationId===null"),'row + targets its collection without activating or navigating')
            evaluate("document.getElementById('constellation-member-search').value='Hotel';document.getElementById('constellation-member-search').dispatchEvent(new Event('input'))")
            check(evaluate("document.querySelectorAll('#constellation-picker-results button[data-entry-id]').length===2&&[...document.querySelectorAll('#constellation-picker-results small')].some(n=>n.textContent.includes('Collection home'))&&[...document.querySelectorAll('#constellation-picker-results small')].some(n=>n.textContent.includes('Other Galaxy'))"),'member search spans Galaxies and disambiguates duplicate names with ancestry')
            click_selector(f'#constellation-picker-results [data-entry-id="{planet}"]');click_selector(f'#constellation-picker-results [data-entry-id="{planet}"]')
            check(evaluate(f"constellations.get({json.dumps(c1)}).memberEntryIds.length===1&&document.querySelector('#constellation-picker-results [data-entry-id=\"{planet}\"]').getAttribute('aria-pressed')==='true'"),'checked picker results prevent duplicate membership')
            evaluate("document.getElementById('close-constellation-picker').click();physics.pause()")
            check(evaluate(f"document.activeElement.dataset.collectionAction==='add'&&document.activeElement.closest('[data-constellation-id]').dataset.constellationId==={json.dumps(c1)}"),'picker returns focus to its row + even after membership refresh replaces the row')
            member(c1,deep);member(c1,other);member(c2,planet)
            check(evaluate(f"constellations.get({json.dumps(c1)}).memberEntryIds.includes({json.dumps(planet)})&&constellations.get({json.dumps(c2)}).memberEntryIds.includes({json.dumps(planet)})"),'one canonical entity belongs to multiple independent collections')
            check(evaluate('JSON.stringify(camera.view)')==view and evaluate('physics.simulation.alpha()')==alpha and evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.x,e.y]))')==positions,'membership changes preserve camera, positions and physics temperature')
            evaluate(f"openContextMenu({json.dumps(moon)},550,260);contextMenu.querySelector('[data-action=constellation]').click()")
            check(evaluate("!document.getElementById('constellation-memberships').hidden&&contextMenu.getAttribute('aria-label').includes('Packing')"),'canonical context menu reuses the existing menu for Add to Constellation')
            click_selector(f'#constellation-memberships [data-collection-id="{c1}"]');click_selector(f'#constellation-memberships [data-collection-id="{c2}"]')
            check(evaluate(f"[...document.querySelectorAll('#constellation-memberships [data-collection-id]')].filter(b=>b.getAttribute('aria-checked')==='true').length===2&&constellations.get({json.dumps(c1)}).memberEntryIds.includes({json.dumps(moon)})"),'context membership menu indicates checked state and permits overlapping membership')
            click_selector(f'#constellation-memberships [data-collection-id="{c2}"]')
            check(evaluate(f"!constellations.get({json.dumps(c2)}).memberEntryIds.includes({json.dumps(moon)})&&entries.has({json.dumps(moon)})"),'context membership toggle removes only the reference')
            evaluate("closeContextMenu()")
            evaluate(f"openContextMenu({json.dumps(deep)},550,260);contextMenu.querySelector('[data-action=constellation]').click();document.querySelector('#constellation-memberships button:last-child').click();document.getElementById('constellation-name').value='Context-created';document.getElementById('constellation-name-form').requestSubmit();physics.pause()")
            from_context=evaluate('[...constellations.keys()].at(-1)')
            check(evaluate(f"constellations.get({json.dumps(from_context)}).memberEntryIds.length===0&&!contextMenu.hidden&&contextEntryId==={json.dumps(deep)}"),'context New creates an empty collection and returns to the same checked membership menu')
            click_selector(f'#constellation-memberships [data-collection-id="{from_context}"]')
            check(evaluate(f"constellations.get({json.dumps(from_context)}).memberEntryIds[0]==={json.dumps(deep)}"),'context-created collection receives its first member through an explicit membership action')
            evaluate("closeContextMenu();constellationWorkspace.openName()")
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
            wait_for('!constellationWorkspace.nameDialog.open');evaluate('physics.pause()')
            check(evaluate("document.activeElement.id==='new-constellation-button'"),'modal Escape restores an accessible sidebar action without creating a collection')
            evaluate(f"openPortalDialog({json.dumps(planet)});portalParentId={json.dumps(g2)};document.getElementById('create-portal').disabled=false;document.getElementById('portal-form').requestSubmit();physics.pause()")
            portal=evaluate('[...portals.keys()].at(-1)');member(c2,portal)
            check(evaluate(f"constellations.get({json.dumps(c2)}).memberEntryIds.includes({json.dumps(planet)})&&!constellations.get({json.dumps(c2)}).memberEntryIds.includes({json.dumps(portal)})"),'Portal-origin membership resolves to canonical ID and stays deduplicated')
            evaluate(f"constellationWorkspace.openPicker({json.dumps(c2)});document.getElementById('constellation-member-search').value='Hotel';constellationWorkspace.renderPicker()")
            check(evaluate("document.querySelectorAll('#constellation-picker-results button[data-entry-id]').length===2&&[...document.querySelectorAll('#constellation-picker-results button[data-entry-id]')].every(b=>entries.has(b.dataset.entryId))"),'member picker omits duplicate Portal rows')
            evaluate("document.getElementById('close-constellation-picker').click();physics.pause()")
            before=evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.x,e.y]))')
            click_selector(f'[data-constellation-id="{c1}"] .constellation-open');wait_camera();evaluate('physics.pause()')
            check(evaluate(f"activeConstellationId==={json.dumps(c1)}&&document.querySelector('[data-constellation-id=\"{c1}\"]').classList.contains('is-active')&&!panel.hidden&&document.getElementById('panel-rich-content').hidden&&!document.getElementById('constellation-content').hidden"),'activation selects the collection and switches to its member panel')
            view=evaluate('JSON.stringify(camera.view)');evaluate("document.getElementById('constellations-toggle').click()")
            check(evaluate(f"activeConstellationId==={json.dumps(c1)}&&constellationWorkspace.list.hidden") and evaluate('JSON.stringify(camera.view)')==view,'collapsing the section keeps the active lens and camera')
            evaluate("document.getElementById('constellations-toggle').click()")
            check(evaluate(f"document.querySelector('[data-constellation-id=\"{c1}\"]').classList.contains('is-active')") and evaluate('JSON.stringify(camera.view)')==view,'expanding restores active styling without reframing')
            check(evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.x,e.y]))')==before and evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.parentId,e.role,e.depth,e.content]))')==topology,'activation never relocates, reparents or changes celestial roles/content')
            evaluate(f"openEntryForm(entries.get({json.dumps(other)}),null,false,'move');parentField.value={json.dumps(sun)};form.requestSubmit();physics.pause()")
            check(evaluate(f"activeConstellationId==={json.dumps(c1)}&&[...activeConstellationGalaxyIds].join(',')==={json.dumps(g1)}"),'reparenting an active collection entry immediately recomputes represented Galaxy IDs')
            evaluate(f"openEntryForm(entries.get({json.dumps(other)}),null,false,'move');parentField.value={json.dumps(g2)};form.requestSubmit();physics.pause();showConstellationOverview()")
            check(evaluate(f"activeConstellationGalaxyIds.has({json.dumps(g1)})&&activeConstellationGalaxyIds.has({json.dumps(g2)})"),'restoring canonical ancestry restores its Galaxy context without sticky reveal state')
            check(evaluate("[...activeConstellationMembers].every(id=>{const n=nodes.get(id),b=physics.bounds;return n.renderX>=b.left&&n.renderX<=b.right&&n.renderY>=b.top&&n.renderY<=b.bottom})"),'cross-Galaxy framing fits all live member locations in the panel-aware viewport')
            check_rendered("[...activeConstellationMembers].every(id=>nodes.get(id).dataset.semanticHidden==='false'&&parseFloat(getComputedStyle(nodes.get(id)).opacity)>.95)",'Constellation entries retain visibility priority')
            check(evaluate("constellationOverlay.edges.length===activeConstellationMembers.size-1&&document.querySelectorAll('.constellation-line').length===activeConstellationMembers.size-1") and overlay_aligned(),'active-only sparse n-1 overlay joins actual member locations')
            shot('constellation-cross-galaxy-desktop')
            evaluate('camera.panTo(camera.view.x+25,camera.view.y-10);camera.zoomAt(650,350,1.15)');wait_camera()
            check(overlay_aligned(),'overlay follows camera pan and zoom')
            evaluate(f"physics.beginDrag({json.dumps(planet)});physics.moveDrag({json.dumps(planet)},entries.get({json.dumps(planet)}).x+12,entries.get({json.dumps(planet)}).y+8);renderGraph()")
            check(overlay_aligned() and evaluate(f"activeConstellationId==={json.dumps(c1)}"),'overlay follows live dragged positions without leaving collection mode')
            evaluate(f"physics.endDrag({json.dumps(planet)},true);physics.pause()")
            click_selector('#panel-add-member')
            check(evaluate(f"constellationWorkspace.pickerId==={json.dumps(c1)}"),'right-panel Add member reuses the same picker')
            evaluate("document.getElementById('close-constellation-picker').click();physics.pause()")
            view=evaluate('JSON.stringify(camera.view)');member(c1,unrelated)
            evaluate(f"document.querySelector('#constellation-member-list [data-entry-id=\"{unrelated}\"] summary').click();document.querySelector('#constellation-member-list [data-entry-id=\"{unrelated}\"] details button').click()")
            check(evaluate(f"!constellations.get({json.dumps(c1)}).memberEntryIds.includes({json.dumps(unrelated)})&&entries.has({json.dumps(unrelated)})") and evaluate('JSON.stringify(camera.view)')==view,'member overflow removes only membership with no camera jump')
            evaluate("document.getElementById('entry-more-button').click()")
            check(evaluate("[...entryActions.querySelectorAll('button:not([hidden])')].map(b=>b.textContent).join('|')==='Rename|Delete Constellation'"),'collection More contains only Rename and Delete Constellation')
            click_selector('#rename-constellation-button');evaluate("document.getElementById('constellation-name').value='Shared Favorites';document.getElementById('constellation-name-form').requestSubmit();physics.pause()")
            check(evaluate(f"constellations.get({json.dumps(c1)}).name==='Shared Favorites'&&panelName.textContent==='Shared Favorites'") and evaluate('JSON.stringify(camera.view)')==view,'rename updates sidebar and panel without reframing')
            evaluate(f"document.querySelector('#constellation-member-list [data-entry-id=\"{deep}\"] .constellation-member-name').click()");wait_camera();evaluate('physics.pause()')
            check(evaluate(f"activeConstellationId==={json.dumps(c1)}&&!constellationOverview&&selectedNode.dataset.entryId==={json.dumps(deep)}&&contentInspector.entryId==={json.dumps(deep)}&&!document.getElementById('panel-rich-content').hidden&&constellationOverlay.edges.length===3&&!document.getElementById('active-constellation-indicator').hidden"),'overview entry click opens canonical Contents while keeping the active lens and its compact indicator')
            view=evaluate('JSON.stringify(camera.view)');refs=evaluate('JSON.stringify([...constellations.values()])')
            evaluate("contentInspector.editNotes();contentInspector.notes.value='Notes while lens is active';contentInspector.notesForm.requestSubmit();contentInspector.editLink();document.getElementById('content-link-url').value='google.com';document.getElementById('content-link-title').value='Lens bookmark';contentInspector.linkForm.requestSubmit()")
            evaluate("contentInspector.upload([new File(['Lens content'],'lens.txt',{type:'text/plain'})]);void 0");wait_for('contentInspector.jobs.size===0')
            check(evaluate(f"activeConstellationId==={json.dumps(c1)}&&contentInspector.content().notes.text==='Notes while lens is active'&&contentInspector.content().links[0].url==='https://google.com/'&&contentInspector.content().attachments.length===1") and evaluate('JSON.stringify(camera.view)')==view and evaluate('JSON.stringify([...constellations.values()])')==refs,'Files/Notes/Bookmarks work in Contents without changing the lens, camera or collection references')
            shot('constellation-entry-inspection-desktop')
            click_selector('#active-constellation-name')
            check(evaluate(f"constellationOverview&&activeConstellationId==={json.dumps(c1)}&&!document.getElementById('constellation-content').hidden&&document.getElementById('active-constellation-indicator').hidden") and evaluate('JSON.stringify(camera.view)')==view,'indicator reopens the collection overview without refitting')
            evaluate(f"hierarchySidebar.rows.get({json.dumps(unrelated)}).querySelector('.tree-name').click()");wait_camera();evaluate('physics.pause()')
            check(evaluate(f"activeConstellationId==={json.dumps(c1)}&&!constellationOverview&&selectedNode.dataset.entryId==={json.dumps(unrelated)}&&!activeConstellationMembers.has({json.dumps(unrelated)})&&panelName.textContent==='Unrelated'"),'sidebar non-entry inspection coexists with the lens without adding it to the collection')
            evaluate(f"activateConstellation({json.dumps(c2)});");wait_camera()
            click_selector(f'.entry-node[data-entry-id="{planet}"]');wait_camera();evaluate('physics.pause()')
            check(evaluate(f"activeConstellationId==={json.dumps(c2)}&&!constellationOverview&&selectedNode.dataset.entryId==={json.dumps(planet)}"),'canvas Constellation entry click keeps the lens while focusing normal Contents')
            evaluate(f"activateConstellation({json.dumps(c1)})");wait_camera()
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
            check(evaluate('activeConstellationId===null&&constellationOverlay.edges.length===0'),'Escape exits collection mode and removes the temporary overlay')
            evaluate(f"activateConstellation({json.dumps(c1)})");wait_camera()
            point=evaluate("(()=>{const b=physics.bounds;for(let y=b.top+20;y<b.bottom;y+=50)for(let x=b.left+20;x<b.right;x+=50)if(!galaxyAtScreen({x,y})&&!document.elementFromPoint(x,y)?.closest('.entry-node'))return{x,y};})()")
            mouse('mousePressed',**point,button='left',clickCount=1);mouse('mouseReleased',**point,button='left',clickCount=1)
            check(evaluate(f"activeConstellationId==={json.dumps(c1)}&&panel.hidden&&constellationOverlay.edges.length===3"),'empty Cosmos click can close the panel while retaining the active lens')
            evaluate(f"activateConstellation({json.dumps(c1)});activateConstellation({json.dumps(c2)})");wait_camera()
            check(evaluate(f"activeConstellationId==={json.dumps(c2)}&&constellationOverlay.edges.length===0"),'activating another collection replaces the active overlay')
            evaluate(f"activateConstellation({json.dumps(c2)})")
            check(evaluate('activeConstellationId===null'),'clicking the active collection again exits mode')
            view=evaluate('JSON.stringify(camera.view)');evaluate(f"activateConstellation({json.dumps(empty)})")
            check(evaluate('JSON.stringify(camera.view)')==view and evaluate("!document.getElementById('constellation-members-empty').hidden&&!galaxy.classList.contains('constellation-has-members')"),'empty collection opens quietly without moving the camera or dimming the Cosmos')
            evaluate("exitConstellation();window.beforeCollectionSave=galaxyStorage.save;galaxyStorage.save=()=>{throw new Error('quota')}")
            evaluate(f"constellationWorkspace.openPicker({json.dumps(c2)});document.getElementById('constellation-member-search').value='Unrelated';constellationWorkspace.renderPicker();document.querySelector('#constellation-picker-results button[data-entry-id]').click()")
            check(evaluate(f"!constellations.get({json.dumps(c2)}).memberEntryIds.includes({json.dumps(unrelated)})&&!document.getElementById('constellation-picker-status').hidden"),'failed metadata save leaves membership unchanged and reports the error')
            evaluate("galaxyStorage.save=beforeCollectionSave;document.getElementById('close-constellation-picker').click();physics.pause();saveGalaxy()")
            evaluate("document.getElementById('constellations-toggle').click();hierarchySidebar.savePreference()")
            check(evaluate("JSON.parse(localStorage.getItem('galaxy:navigation-ui')).constellationsCollapsed===true&&JSON.parse(localStorage.getItem('galaxy:navigation-ui')).width===hierarchySidebar.width"),'sidebar preference writes preserve the section state alongside existing width/collapse preferences')
            saved=evaluate('JSON.stringify([...constellations.values()])');cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate("constellationWorkspace.list.hidden&&document.getElementById('constellations-toggle').getAttribute('aria-expanded')==='false'"),'section collapse preference survives refresh separately from domain data')
            evaluate("document.getElementById('constellations-toggle').click()")
            check(evaluate('JSON.stringify([...constellations.values()])')==saved and evaluate('JSON.parse(localStorage.getItem("galaxy:user-data")).version===5'),'Constellations refresh intact with additive version-5 storage')
            evaluate(f"(()=>{{const data=JSON.parse(localStorage.getItem('galaxy:user-data'));data.constellations[0].memberEntryIds.push('missing',{json.dumps(portal)},data.constellations[0].memberEntryIds[0]);localStorage.setItem('galaxy:user-data',JSON.stringify(data));}})()")
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate('JSON.stringify([...constellations.values()])')==saved,'invalid, Portal and duplicate persisted member IDs normalize without losing valid memberships')
            evaluate(f"activateConstellation({json.dumps(c2)})");wait_camera();view=evaluate('JSON.stringify(camera.view)')
            evaluate("document.getElementById('entry-more-button').click();document.getElementById('delete-constellation-button').click()")
            check(evaluate("constellationWorkspace.deleteDialog.textContent.includes('entries, Portals and files stay intact')"),'collection deletion confirmation clearly preserves canonical contents')
            evaluate("document.getElementById('delete-constellation-form').requestSubmit();physics.pause()")
            check(evaluate(f"!constellations.has({json.dumps(c2)})&&entries.has({json.dumps(planet)})&&portals.has({json.dumps(portal)})") and evaluate('JSON.stringify(camera.view)')==view,'deleting a collection leaves entities and Portals intact without camera movement')
            select(planet);evaluate("contentInspector.upload([new File(['Keep file transaction'],'member.txt',{type:'text/plain'})]);void 0");wait_for('contentInspector.jobs.size===0')
            key=evaluate('contentInspector.content().attachments[0].storageKey')
            evaluate(f"window.beforeDeleteSave=galaxyStorage.save;galaxyStorage.save=()=>{{throw new Error('quota')}};requestEntryDelete({json.dumps(planet)});document.getElementById('delete-entry-form').requestSubmit()")
            wait_for('!deletionBusy')
            check(evaluate(f"constellations.get({json.dumps(c1)}).memberEntryIds.includes({json.dumps(planet)})&&entries.has({json.dumps(planet)})") and evaluate(f"(async()=>!!await attachmentStore.get({json.dumps(key)}))()"),'failed attachment transaction preserves collection references, canonical entries and bytes')
            evaluate("galaxyStorage.save=beforeDeleteSave;deleteDialog.close();physics.pause()")
            member(empty,planet);member(empty,deep)
            evaluate(f"activateConstellation({json.dumps(empty)})");wait_camera();evaluate('physics.pause()')
            view=evaluate('JSON.stringify(camera.view)');evaluate(f"requestEntryDelete({json.dumps(planet)});document.getElementById('delete-entry-form').requestSubmit()")
            wait_for('!deleteDialog.open');evaluate('physics.pause()')
            check(evaluate(f"!entries.has({json.dumps(planet)})&&!entries.has({json.dumps(deep)})&&constellations.get({json.dumps(c1)}).memberEntryIds.length===1&&constellations.get({json.dumps(c1)}).memberEntryIds[0]==={json.dumps(other)}&&constellations.has({json.dumps(empty)})&&constellations.get({json.dumps(empty)}).memberEntryIds.length===0"),'subtree deletion cleans all descendant memberships while preserving unrelated members and empty collections')
            check(evaluate('activeConstellationGalaxyIds.size===0&&![...nodes.values()].some(n=>n.classList.contains("constellation-galaxy-context"))'),'deleting the final referenced branch clears all forced Galaxy labels')
            check(evaluate(f"(async()=>await attachmentStore.get({json.dumps(key)})===null)()") and evaluate(f"!portals.has({json.dumps(portal)})&&entries.has({json.dumps(unrelated)})") and evaluate('JSON.stringify(camera.view)')==view,'existing subtree attachment/Portal cleanup and camera stability remain intact')
            evaluate('physics.resume()');wait_for('physics.settled');evaluate('physics.pause();saveGalaxy()');raw=evaluate("localStorage.getItem('galaxy:user-data')")
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate(f"!entries.has({json.dumps(planet)})&&constellations.get({json.dumps(empty)}).memberEntryIds.length===0"),'subtree deletion and empty collection persistence survive refresh')
            evaluate('saveGalaxy()');raw=evaluate("localStorage.getItem('galaxy:user-data')")
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete'&&typeof sampleMode!=='undefined'&&sampleMode");load();wait_camera();evaluate('physics.pause()')
            check(evaluate("entries.size===187&&portals.size===3&&constellations.size===3&&!constellations.has("+json.dumps(c1)+")"),'Sample has three isolated local/cross-Galaxy/deep collections and unchanged canonical bodies/Portals')
            for group in ['sample-constellation-meals','sample-constellation-trip','sample-constellation-techniques']:
                evaluate(f"activateConstellation({json.dumps(group)})");wait_camera();evaluate('physics.pause()')
                check(overlay_aligned() and evaluate("constellationOverlay.edges.length===activeConstellationMembers.size-1"),f'Sample {group} frames and renders live sparse geometry')
                if group=='sample-constellation-meals':
                    evaluate("window.mealFrame={...camera.view};camera.zoomAt((physics.bounds.left+physics.bounds.right)/2,(physics.bounds.top+physics.bounds.bottom)/2,Math.min(.2,camera.view.scale*.8)/camera.view.scale)");wait_camera()
                    check_rendered("[...activeConstellationGalaxyIds].join(',')==='sample-galaxy-1'&&nodes.get('sample-galaxy-1').classList.contains('constellation-galaxy-context')&&!nodes.get('sample-galaxy-1').inert&&parseFloat(getComputedStyle(nodes.get('sample-galaxy-1').querySelector('.node-label')).opacity)===1",'same-Galaxy collection keeps its Galaxy name visible at far zoom')
                    evaluate("camera.setView(mealFrame,false)")
                if group=='sample-constellation-trip':
                    evaluate("window.tripFramedView={...camera.view};camera.zoomAt((physics.bounds.left+physics.bounds.right)/2,(physics.bounds.top+physics.bounds.bottom)/2,Math.min(.2,camera.view.scale*.8)/camera.view.scale)");wait_camera()
                    mouse('mouseMoved',x=15,y=15)
                    check_rendered("[...nodes].filter(([id])=>!activeConstellationMembers.has(id)&&!activeConstellationGalaxyIds.has(id)).every(([id,n])=>n.inert&&parseFloat(getComputedStyle(n).opacity)<.02)",'far zoom suppresses unrelated bodies while retaining represented Galaxy context')
                    check_rendered("[...activeConstellationGalaxyIds].sort().join(',')==='sample-galaxy-0,sample-galaxy-1,sample-galaxy-2'&&[...activeConstellationGalaxyIds].every(id=>!nodes.get(id).inert&&parseFloat(getComputedStyle(nodes.get(id)).opacity)>.6&&parseFloat(getComputedStyle(nodes.get(id).querySelector('.node-label')).opacity)===1)",'cross-Galaxy lens deterministically keeps every represented Galaxy name readable')
                    evaluate("constellationWorkspace.setMember('sample-constellation-trip','sample-moon-0-1-0',true)")
                    check(evaluate("activeConstellationGalaxyIds.size===3"),'adding another entry in an already represented Galaxy does not create extra label state')
                    evaluate("constellationWorkspace.setMember('sample-constellation-trip','sample-galaxy-3',true)")
                    check_rendered("activeConstellationGalaxyIds.size===4&&nodes.get('sample-galaxy-3').classList.contains('constellation-galaxy-context')",'adding an entry from another Galaxy updates that Galaxy label immediately')
                    evaluate("constellationWorkspace.setMember('sample-constellation-trip','sample-galaxy-3',false);constellationWorkspace.setMember('sample-constellation-trip','sample-moon-0-1-0',false)")
                    check_rendered("activeConstellationGalaxyIds.size===3&&!nodes.get('sample-galaxy-3').classList.contains('constellation-galaxy-context')&&nodes.get('sample-galaxy-3').inert",'removing its last reference clears the unrelated Galaxy override immediately')
                    check_rendered("[...activeConstellationMembers].every(id=>!nodes.get(id).inert&&parseFloat(getComputedStyle(nodes.get(id)).opacity)>.98&&parseFloat(getComputedStyle(nodes.get(id).querySelector('.node-label')).opacity)<.02)",'far zoom keeps original collection bodies and outlines visible without forcing full labels')
                    check(overlay_aligned() and evaluate("constellationOverlay.edges.length===3&&parseFloat(getComputedStyle(constellationOverlay.edges[0].line).strokeOpacity)>.4"),'sparse constellation lines remain visible at far zoom')
                    shot('constellation-far-quiet-desktop')
                    point=evaluate("(()=>{const r=nodes.get('sample-moon-4-2-1').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
                    mouse('mouseMoved',**point)
                    check_rendered("parseFloat(getComputedStyle(nodes.get('sample-moon-4-2-1').querySelector('.node-label')).opacity)>.98",'hover reveals a collection entry label at far zoom')
                    mouse('mouseMoved',x=15,y=15)
                    check_rendered("parseFloat(getComputedStyle(nodes.get('sample-moon-4-2-1').querySelector('.node-label')).opacity)<.02",'hover label recedes when exploration moves away')
                    evaluate("selectEntry(entries.get('sample-moon-4-2-1'),nodes.get('sample-moon-4-2-1'))")
                    check_rendered("parseFloat(getComputedStyle(nodes.get('sample-moon-4-2-1').querySelector('.node-label')).opacity)>.98",'selected Constellation entry reveals its label without changing the lens')
                    refs=evaluate('JSON.stringify([...constellations.values()])');view=evaluate('JSON.stringify(camera.view)')
                    evaluate("selectEntry(entries.get('sample-moon-0-1-0'),nodes.get('sample-moon-0-1-0'))")
                    check_rendered("activeConstellationId==='sample-constellation-trip'&&!activeConstellationMembers.has('sample-moon-0-1-0')&&!nodes.get('sample-moon-0-1-0').inert&&parseFloat(getComputedStyle(nodes.get('sample-moon-0-1-0')).opacity)>.98&&parseFloat(getComputedStyle(nodes.get('sample-moon-0-1-0').querySelector('.node-label')).opacity)>.98",'selected unrelated entry can stand out with normal content without becoming a collection entry')
                    check(evaluate('JSON.stringify(camera.view)')==view and evaluate('JSON.stringify([...constellations.values()])')==refs,'inspection changes neither collection references nor the current camera')
                    visible=evaluate("(()=>{const result=[];for(const scale of [.2,.58,.68,.8,1]){camera.setView({...camera.view,scale},false);result.push(Object.fromEntries(['sun','planet','moon','satellite','astronaut'].map(role=>[role,[...nodes].filter(([id,n])=>!activeConstellationMembers.has(id)&&!n.classList.contains('constellation-inspected')&&n.dataset.role===role&&n.dataset.semanticHidden==='false').length])));}return result;})()")
                    check(visible[0]['sun']==0 and visible[1]['sun']>0 and visible[1]['planet']==0 and visible[2]['planet']>0 and visible[2]['moon']==0 and visible[3]['moon']>0 and visible[4]['astronaut']>0,'zooming inward progressively restores Suns, Planets, Moons and deeper entries at existing role thresholds')
                    evaluate("focusEntry('sample-moon-0-1-0')");wait_camera()
                    click_selector('.entry-node[data-entry-id="sample-moon-0-1-0"]');wait_camera()
                    check(evaluate("activeConstellationId==='sample-constellation-trip'&&selectedNode.dataset.entryId==='sample-moon-0-1-0'") and evaluate('JSON.stringify([...constellations.values()])')==refs,'canvas non-Constellation entry clicks inspect normally without deactivating or joining the collection')
                    evaluate("focusEntry('sample-moon-4-2-1')");wait_camera()
                    evaluate("openPortal('sample-portal-codex')");wait_camera()
                    check(evaluate("activeConstellationId==='sample-constellation-trip'&&selectedNode.dataset.entryId==='sample-moon-0-1-0'&&contentInspector.entryId==='sample-moon-0-1-0'") and overlay_aligned(),'cross-Galaxy Portal travel retains the lens and live constellation overlay')
                    click_selector('#close-inspector-button')
                    check(evaluate("panel.hidden&&activeConstellationId==='sample-constellation-trip'"),'closing ordinary Contents leaves the lens active')
                    evaluate("selectEntry(entries.get('sample-moon-0-1-0'),nodes.get('sample-moon-0-1-0'))")
                    evaluate("contentInspector.editNotes();contentInspector.notes.value='Unsaved lens draft'")
                    draft_view=evaluate('JSON.stringify(camera.view)')
                    click_selector('#deactivate-constellation-button')
                    check(evaluate("activeConstellationId===null&&!panel.hidden&&contentInspector.entryId==='sample-moon-0-1-0'&&constellationOverlay.edges.length===0&&!contentInspector.notesForm.hidden&&contentInspector.notes.value==='Unsaved lens draft'") and evaluate('JSON.stringify(camera.view)')==draft_view,'compact active-indicator × preserves selected Contents, its note draft and the camera while deactivating')
                    check_rendered("activeConstellationGalaxyIds.size===0&&[...nodes.values()].every(n=>!n.classList.contains('constellation-galaxy-context'))&&[...entries.values()].filter(e=>e.depth===0).every(e=>nodes.get(e.id).labelOpacity===1)",'deactivation clears Galaxy overrides and restores normal eligibility under the density layer')
                    evaluate("activateConstellation('sample-constellation-trip')");wait_camera()
                    click_selector('#close-inspector-button')
                    check(evaluate('activeConstellationId===null&&panel.hidden'),'overview header × explicitly deactivates and closes the overview')
                    evaluate("activateConstellation('sample-constellation-trip');camera.setView(tripFramedView,false)");wait_camera()
                    check(evaluate("!document.getElementById('constellation-count').textContent.includes('member')&&document.getElementById('constellation-count').textContent==='4 entries'&&document.querySelector('#constellation-content h3').textContent==='In this Constellation'&&document.getElementById('panel-add-member').textContent==='+ Add entry'&&document.getElementById('constellation-members-empty').textContent==='No entries yet'&&[...document.querySelectorAll('[aria-label],[title]')].every(n=>!(/\\bmembers?\\b/i.test((n.getAttribute('aria-label')||'')+' '+(n.title||''))))"),'visible and accessible Constellation wording uses Entries, Add entry and In this Constellation')
                shot(group+'-desktop')
            point=evaluate("(()=>{const n=nodes.get('sample-satellite-2-0-0-0'),r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
            mouse('mousePressed',**point,button='left',clickCount=1)
            mouse('mouseMoved',x=point['x']+20,y=point['y']+10,button='left',buttons=1);time.sleep(.1)
            check(evaluate("activeConstellationId==='sample-constellation-techniques'&&activeNodeDrags===1") and overlay_aligned(),'real pointer drag keeps collection mode and updates live constellation endpoints')
            mouse('mouseReleased',x=point['x']+20,y=point['y']+10,button='left',clickCount=1);evaluate('physics.pause()')
            check(evaluate("activeConstellationId==='sample-constellation-techniques'&&activeNodeDrags===0"),'drag release stays in collection mode without accidental member-click navigation')
            evaluate('physics.resume()');time.sleep(.35)
            check(overlay_aligned(),'sparse endpoints remain aligned while Sample physics ticks')
            evaluate('physics.pause();exitConstellation();hierarchySidebar.setCollapsed(false)')
            cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=False)
            cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=1)
            evaluate('hierarchySidebar.setCollapsed(false)');wait_camera()
            point=evaluate("(()=>{const r=document.getElementById('constellations-toggle').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
            cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
            check(evaluate('constellationWorkspace.list.hidden&&!constellationWorkspace.nameDialog.open'),'touch chevron collapses independently from the creation +')
            point=evaluate("(()=>{const r=document.getElementById('constellations-toggle').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
            cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
            check(evaluate('!constellationWorkspace.list.hidden'),'touch chevron expands the section without navigation')
            check(evaluate("getComputedStyle(document.getElementById('new-constellation-button')).opacity==='1'&&[...document.querySelectorAll('.collection-add')].every(b=>getComputedStyle(b).pointerEvents==='auto')"),'heading and row + actions remain visible and reachable on mobile/touch')
            point=evaluate("(()=>{const r=document.querySelector('[data-constellation-id=\"sample-constellation-trip\"] .collection-add').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
            cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
            wait_for("constellationWorkspace.picker.open")
            check(evaluate("constellationWorkspace.pickerId==='sample-constellation-trip'&&constellationWorkspace.picker.getBoundingClientRect().width<=innerWidth-16"),'touch row + opens a bounded responsive member picker for that collection')
            shot('constellation-mobile-picker');evaluate("document.getElementById('close-constellation-picker').click();physics.pause()")
            evaluate("activateConstellation('sample-constellation-trip')");wait_camera()
            check(evaluate("hierarchySidebar.collapsed&&!panel.hidden&&!document.getElementById('constellation-content').hidden&&panel.getBoundingClientRect().height<=innerHeight*.55&&document.documentElement.scrollWidth<=innerWidth"),'collection panel preserves the existing mobile bottom sheet and panel-aware framing')
            shot('constellation-mobile-active')
            evaluate("document.querySelector('#constellation-member-list .constellation-member-name').click()");wait_camera();evaluate('physics.pause()')
            check(evaluate("activeConstellationId==='sample-constellation-trip'&&!constellationOverview&&contentInspector.entryId===selectedNode.dataset.entryId&&!document.getElementById('panel-rich-content').hidden&&!document.getElementById('active-constellation-indicator').hidden"),'touch collection entry navigation keeps the lens and shows Contents with the active indicator')
            shot('constellation-entry-inspection-mobile')
            point=evaluate("(()=>{const r=document.getElementById('deactivate-constellation-button').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
            cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
            check(evaluate('activeConstellationId===null&&!panel.hidden'),'touch indicator × deactivates the lens without closing selected Contents')
            cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'reduce'}]);wait_for('camera.reducedMotion')
            evaluate("activateConstellation('sample-constellation-techniques')")
            check(evaluate('camera.frame===null&&!camera.travel'),'reduced-motion collection framing uses the generic immediate camera path')
            member('sample-constellation-techniques','sample-galaxy-3')
            evaluate("constellationWorkspace.setMember('sample-constellation-techniques','sample-galaxy-3',false);constellationWorkspace.openName('sample-constellation-techniques');document.getElementById('constellation-name').value='Sample-only edit';document.getElementById('constellation-name-form').requestSubmit();constellationWorkspace.openDelete('sample-constellation-trip');document.getElementById('delete-constellation-form').requestSubmit()")
            check(evaluate("localStorage.getItem('galaxy:user-data')")==raw,'Sample membership, rename and deletion never modify real saved data')
            check(evaluate("!document.querySelector('#panel-connections,#connection-picker')&&typeof connections==='undefined'&&[...lines].every(l=>l.kind==='hierarchy')"),'semantic Connection architecture and UI remain removed')
            check(not cdp.errors,f'no Constellation browser exceptions: {cdp.errors}')
            print(f'{count} Constellation browser checks passed',flush=True)
            return

        if options.no_connections_only:
            root=add('Kept Galaxy');parent=add('Kept Sun',root);chain=[parent]
            for name in ['Planet','Moon','Satellite','Astronaut']:chain.append(add(name,chain[-1]))
            target=chain[-1];other=add('Other Galaxy')
            wait_for('physics.settled');evaluate('physics.pause()');select(target)
            evaluate("contentInspector.upload([new File(['Saved original bytes'],'kept.txt',{type:'text/plain'})]);void 0");wait_for('contentInspector.jobs.size===0')
            evaluate(f"saveEntryContent({json.dumps(target)},{{...contentInspector.content(),notes:{{format:'plain',text:'Kept notes'}},links:[{{id:'bookmark-kept',url:'https://example.com/',title:'Kept bookmark'}}]}});openPortalDialog({json.dumps(target)});portalParentId={json.dumps(other)};document.getElementById('portal-form').requestSubmit();physics.pause()")
            ref=evaluate('[...portals.keys()][0]');key=evaluate(f"entries.get({json.dumps(target)}).content.attachments[0].storageKey")
            expected=evaluate(f"JSON.stringify(entries.get({json.dumps(target)}).content)");ancestry=evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.parentId,e.role,e.depth]))')
            evaluate(f"(()=>{{const data=JSON.parse(localStorage.getItem('galaxy:user-data'));data.connections=[{{id:'old:pair',from:{json.dumps(parent)},to:{json.dumps(other)},type:'related',label:'Legacy pair'}}];localStorage.setItem('galaxy:user-data',JSON.stringify(data));}})()")
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.parentId,e.role,e.depth]))')==ancestry,'legacy records load without changing canonical parents, roles or depth')
            check(evaluate(f"JSON.stringify(entries.get({json.dumps(target)}).content)")==expected and evaluate(f"(async()=>await(await attachmentStore.get({json.dumps(key)})).blob.text()==='Saved original bytes')()"),'legacy cleanup preserves notes/bookmark IDs, file metadata and IndexedDB bytes')
            check(evaluate(f"portals.get({json.dumps(ref)}).targetEntryId==={json.dumps(target)}"),'legacy cleanup retains valid Portal references')
            check(evaluate("JSON.parse(localStorage.getItem('galaxy:user-data')).version===5&&JSON.parse(localStorage.getItem('galaxy:user-data')).connections.length===0&&!('connections' in getGalaxySnapshot())"),'canonical save clears pairwise records in version 5 and exposes no active collection')
            check(evaluate("typeof relationships==='undefined'&&typeof startConnectionMode==='undefined'&&typeof hitConnection==='undefined'&&typeof connectionView==='undefined'&&typeof galaxyModel.normalizeConnections==='undefined'&&typeof galaxyModel.validateConnection==='undefined'"),'removed feature has no active state, validators or hit-testing orchestration')
            check(evaluate("!document.querySelector('#connect-entry-button,#connection-picker,#panel-connections,#connection-hint,[data-action=connect],.connection-line,[data-kind=relationship]')&&!document.querySelector('script[src*=connection-view]')"),'no Connection controls, picker, tooltip, semantic strokes or script remain')
            check(evaluate("lines.every(l=>l.kind==='hierarchy'&&entries.get(l.to).parentId===l.from&&l.element.getAttribute('aria-hidden')==='true')&&physics.simulation.force('relationships')===undefined"),'all paths derive from structural parents and the pairwise physics hook is gone')
            evaluate(f"focusEntry({json.dumps(target)})");wait_camera();evaluate('physics.pause()')
            check(evaluate("(()=>{const line=lines.find(l=>l.element.classList.contains('astronaut-tether'));return line.element.tagName==='path'&&line.element.getAttribute('d').includes('Q')&&getComputedStyle(line.element).strokeDasharray==='none'&&+line.element.style.opacity>0})()"),'Astronaut curved solid tethers still render in detailed hierarchy views')
            check(evaluate("(()=>{const h=panelName.getBoundingClientRect(),m=moreButton.getBoundingClientRect(),b=panelAncestry.getBoundingClientRect();return Math.abs(h.top-m.top)<.1&&m.left>h.right&&b.top>=h.bottom&&!document.querySelector('.content-header-actions #connect-entry-button')})()"),'Content title, More and breadcrumbs have no empty Connection row')
            if screenshot_dir:
                result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/'no-connections-desktop.png').write_bytes(base64.b64decode(result['data']))
            evaluate(f"focusEntry({json.dumps(other)})");wait_camera();evaluate('physics.pause()')
            evaluate(f"hierarchySidebar.rows.get({json.dumps(ref)}).querySelector('.tree-name').click()")
            check(evaluate('!!camera.travel&&camera.travel.duration>=1200'),'cross-Galaxy Portal still starts generic context/travel/arrival motion')
            time.sleep(.12)
            point=evaluate('({x:(physics.bounds.left+physics.bounds.right)/2,y:(physics.bounds.top+physics.bounds.bottom)/2})')
            mouse('mouseWheel',**point,deltaY=80,deltaX=0)
            check(evaluate('!camera.travel'),'wheel interrupts Portal travel without any Connection layer')
            wait_camera();evaluate(f"focusEntry({json.dumps(other)})");wait_camera();evaluate(f"openPortal({json.dumps(ref)})")
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
            check(evaluate('!camera.travel&&!panel.hidden'),'Escape interrupts generic Portal travel while keeping canonical Contents')
            evaluate(f"openPortal({json.dumps(ref)})");wait_camera();evaluate('physics.pause()')
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(target)}&&contentInspector.entryId==={json.dumps(target)}&&panelAncestry.textContent.includes('Kept Sun')&&!panelAncestry.textContent.includes('Other Galaxy')"),'Portal arrival still selects original content and true-location breadcrumbs')
            before=evaluate('JSON.stringify(camera.view)')
            evaluate("contentInspector.editNotes();contentInspector.notes.value='Edited notes';contentInspector.notesForm.requestSubmit();contentInspector.editLink();document.getElementById('content-link-url').value='google.com';contentInspector.linkForm.requestSubmit()")
            check(evaluate('JSON.stringify(camera.view)')==before,'notes and bookmark operations remain camera-stable')
            evaluate(f"requestEntryDelete({json.dumps(parent)});document.getElementById('delete-entry-form').requestSubmit()")
            wait_for('!deleteDialog.open');evaluate('physics.pause()')
            check(evaluate(f"(async()=>!entries.has({json.dumps(target)})&&!portals.has({json.dumps(ref)})&&await attachmentStore.get({json.dumps(key)})===null&&entries.has({json.dumps(other)}))()"),'subtree deletion still cleans Portal targets and file bytes, preserving unrelated entries')
            check(evaluate('JSON.stringify(camera.view)')==before,'subtree deletion preserves the visible camera')
            evaluate("(()=>{const data=JSON.parse(localStorage.getItem('galaxy:user-data'));data.connections={obsolete:true};localStorage.setItem('galaxy:user-data',JSON.stringify(data))})()")
            cdp.call('Page.reload');load()
            check(evaluate("storageAvailable&&JSON.parse(localStorage.getItem('galaxy:user-data')).connections.length===0"),'malformed obsolete collections are ignored without blocking valid saved hierarchy')
            evaluate('physics.pause();if(graphNeedsSave)saveGalaxy()');raw=evaluate("localStorage.getItem('galaxy:user-data')")
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete'&&typeof sampleMode!=='undefined'&&sampleMode");load();wait_camera()
            check(evaluate("entries.size===187&&portals.size===3&&lines.length===183&&!('connections' in galaxySample.build())&&lines.every(l=>l.kind==='hierarchy')"),'Sample keeps hierarchy/Portals/content with no semantic data or lines')
            cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=False);time.sleep(.2)
            evaluate("openPortal('sample-portal-recipe')");wait_camera()
            check(evaluate("!panel.hidden&&contentInspector.entryId==='sample-satellite-2-0-0-0'&&document.documentElement.scrollWidth<=innerWidth&&!document.querySelector('#panel-connections,#connection-picker')"),'mobile Portal and Content sheet remain usable with the simplified header')
            if screenshot_dir:
                result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/'no-connections-mobile.png').write_bytes(base64.b64decode(result['data']))
            check(evaluate("localStorage.getItem('galaxy:user-data')")==raw,'Sample navigation leaves real saved data isolated')
            check(not cdp.errors,f'no cleanup browser exceptions: {cdp.errors}')
            print(f'{count} removal regression browser checks passed',flush=True)
            return

        if options.portals_only:
            g1=add('Portal home Galaxy');sun=add('Coding',g1);chain=[sun]
            for name in ['Projects','Tools','Editors','Canonical target']:chain.append(add(name,chain[-1]))
            target=chain[-1];child=add('Original child',target)
            local=add('Favorites',g1);g2=add('Other Portal Galaxy');remote=add('Favorites',g2)
            outside=add('Unrelated original',remote)
            wait_for('physics.settled');evaluate('physics.pause()')
            select(target)
            evaluate("contentInspector.upload([new File(['Canonical bytes'],'original.txt',{type:'text/plain'})]);void 0");wait_for('contentInspector.jobs.size===0')
            evaluate(f"saveEntryContent({json.dumps(target)},{{...entries.get({json.dumps(target)}).content,notes:{{format:'plain',text:'Canonical notes'}},links:[{{id:'original-bookmark',url:'https://example.com/',title:'Canonical bookmark'}}]}});physics.pause()")
            key=evaluate('contentInspector.content().attachments[0].storageKey')
            canonical=evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.parentId,e.depth,e.role,e.content]))')
            size=evaluate('entries.size')
            def shot(name):
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/(name+'.png')).write_bytes(base64.b64decode(result['data']))
            def picker(target_id,parent_id):
                evaluate(f"openContextMenu({json.dumps(target_id)},500,250);contextMenu.querySelector('[data-action=portal]').click();document.getElementById('portal-parent-search').value=entries.get({json.dumps(parent_id)}).name;document.getElementById('portal-parent-search').dispatchEvent(new Event('input'))")
                evaluate(f"document.querySelector('#portal-parent-results button[data-entry-id=\"{parent_id}\"]').click()")
            def create_ref(target_id,parent_id):
                picker(target_id,parent_id);before=evaluate('JSON.stringify(camera.view)')
                evaluate("document.getElementById('portal-form').requestSubmit();physics.pause()")
                check(evaluate('!portalDialog.open'),'Portal creation saves through the destination picker')
                check(evaluate('JSON.stringify(camera.view)')==before,'creating a Portal leaves camera unchanged')
                return evaluate('[...portals.keys()].at(-1)')
            evaluate(f"focusEntry({json.dumps(target)})");wait_camera();evaluate('physics.pause()')
            click_selector(f'.entry-node[data-entry-id="{target}"]',button='right')
            check(evaluate("!contextMenu.hidden&&!contextMenu.querySelector('[data-action=portal]').hidden"),'right-click canonical body offers Create Portal')
            click_selector('#entry-context-menu [data-action=portal]')
            check(evaluate("portalDialog.open&&document.activeElement.id==='portal-parent-search'&&document.getElementById('portal-target-name').textContent==='Canonical target'"),'compact picker knows the original and autofocuses placement search')
            evaluate("document.getElementById('portal-parent-search').value='Favorites';document.getElementById('portal-parent-search').dispatchEvent(new Event('input'))")
            check(evaluate("document.querySelectorAll('#portal-parent-results button[data-entry-id]').length===2&&document.getElementById('portal-parent-results').textContent.includes('Portal home Galaxy')&&document.getElementById('portal-parent-results').textContent.includes('Other Portal Galaxy')"),'placement search reaches all Galaxies and disambiguates duplicate names by ancestry')
            shot('portal-picker-desktop')
            evaluate(f"document.querySelector('#portal-parent-results button[data-entry-id=\"{remote}\"]').click()")
            before=evaluate('JSON.stringify(camera.view)');alpha=evaluate('physics.simulation.alpha()')
            evaluate('window.originalPortalSave=galaxyStorage.save;galaxyStorage.save=()=>{throw new DOMException("Full","QuotaExceededError")};document.getElementById("portal-form").requestSubmit()')
            check(evaluate("portalDialog.open&&portals.size===0&&document.getElementById('portal-form-error').textContent.includes('could not be saved')"),'failed Portal persistence publishes no reference row or data mutation')
            evaluate('galaxyStorage.save=originalPortalSave;document.getElementById("portal-form").requestSubmit();physics.pause()')
            p1=evaluate('[...portals.keys()][0]')
            check(evaluate('JSON.stringify(camera.view)')==before and evaluate('physics.simulation.alpha()')==alpha,'Portal creation leaves camera and physics heat unchanged')
            check(evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.parentId,e.depth,e.role,e.content]))')==canonical,'Portal placement changes no canonical hierarchy, role, content or canonical content')
            check(evaluate(f"entries.size==={size}&&nodes.size==={size}&&physics.particles.size==={size}&&!nodes.has({json.dumps(p1)})&&!physics.particles.has({json.dumps(p1)})"),'Portal creates no extra celestial body or physics particle')
            check(evaluate(f"(()=>{{const row=hierarchySidebar.rows.get({json.dumps(p1)});return row.dataset.portalId==={json.dumps(p1)}&&!row.dataset.role&&!row.dataset.entryId&&!row.hasAttribute('aria-expanded')&&!row.querySelector('.tree-add,.tree-disclosure')&&row.querySelector('.tree-portal-icon svg')&&row.getBoundingClientRect().height===32&&row.getAttribute('aria-level')==='3'&&row.title.includes('Portal to Canonical target');}})()"),'Portal is a distinct aligned leaf under its chosen parent, with no inherited celestial role, + or chevron')
            check(evaluate(f"hierarchySidebar.index.children.get({json.dumps(remote)}).includes({json.dumps(p1)})&&!hierarchySidebar.index.children.has({json.dumps(p1)})"),'target subtree is never expanded beneath the Portal')
            p2=create_ref(target,local)
            check(evaluate('portals.size===2'),'multiple alternate places can reference one original')
            evaluate("searchField.value='Canonical target';searchField.dispatchEvent(new Event('input'))")
            check(evaluate("searchResultList.querySelectorAll('button').length===1"),'normal Search remains canonical-only without duplicate Portal results')
            evaluate("searchField.value='';searchOpen=false;refreshSearchResults()")
            picker(target,remote)
            check(evaluate("document.getElementById('create-portal').disabled&&document.getElementById('portal-form-error').textContent.includes('already exists')&&portals.size===2"),'exact duplicate Portal placement is rejected clearly')
            evaluate('document.getElementById("cancel-portal").click();physics.pause()')
            evaluate(f"focusEntry({json.dumps(remote)})");wait_camera();evaluate('physics.pause();window.portalTravelCalls=0;window.originalPortalTravel=camera.travelTo;camera.travelTo=function(...args){portalTravelCalls++;window.portalTravelOptions=args[2];return originalPortalTravel.apply(this,args)}')
            evaluate(f"hierarchySidebar.rows.get({json.dumps(p1)}).querySelector('.tree-name').click()")
            check(evaluate(f"portalTravelCalls===1&&portalTravelOptions.crossGalaxy&&camera.travel.duration>=1200&&selectedNode.dataset.entryId==={json.dumps(target)}"),'cross-Galaxy Portal opening reuses existing slow context/travel/arrival navigation')
            wait_camera();evaluate('physics.pause()')
            check(evaluate(f"hierarchySidebar.selectedId==={json.dumps(target)}&&galaxyModel.ancestors(entries,{json.dumps(target)}).every(e=>hierarchySidebar.expanded.has(e.id))&&contentInspector.entryId==={json.dumps(target)}&&contentInspector.content().notes.text==='Canonical notes'&&contentInspector.content().links[0].id==='original-bookmark'"),'Portal resolves real selection, ancestor expansion, notes/bookmarks and file owner')
            check(evaluate(f"panelAncestry.textContent.includes('Coding')&&!panelAncestry.textContent.includes('Favorites')&&panelAncestry.children.length===galaxyModel.ancestors(entries,{json.dumps(target)}).length"),'right-panel breadcrumb shows only the real canonical ancestor location')
            shot('portal-arrival-desktop')
            evaluate("contentInspector.editNotes();contentInspector.notes.value='Edited through Portal';contentInspector.notesForm.requestSubmit()")
            check(evaluate(f"entries.get({json.dumps(target)}).content.notes.text==='Edited through Portal'&&[...portals.values()].every(p=>!p.content&&!p.name&&!p.parentId)"),'editing after Portal navigation edits only canonical content')
            evaluate(f"openEntryForm(entries.get({json.dumps(target)}));fields[0].value='Renamed original';form.requestSubmit();physics.pause()")
            check(evaluate(f"[{json.dumps(p1)},{json.dumps(p2)}].every(id=>hierarchySidebar.rows.get(id).querySelector('.tree-name').textContent==='Renamed original')"),'rename immediately updates every Portal label without stored names')
            evaluate(f"openEntryForm(entries.get({json.dumps(target)}),null,false,'move');parentField.value={json.dumps(remote)};form.requestSubmit();physics.pause()")
            check(evaluate(f"portals.get({json.dumps(p1)}).targetEntryId==={json.dumps(target)}&&hierarchySidebar.rows.get({json.dumps(p2)}).title.includes('Other Portal Galaxy')&&hierarchySidebar.rows.get({json.dumps(p2)}).title.includes('Favorites')"),'reparent preserves reference IDs and updates true-location tooltips')
            evaluate("camera.travelTo=originalPortalTravel;saveGalaxy()")
            saved_refs=evaluate('JSON.stringify([...portals.values()])')
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate('JSON.stringify([...portals.values()])')==saved_refs and evaluate("JSON.parse(localStorage.getItem('galaxy:user-data')).version===5"),'Portal references refresh intact with additive version-5 storage')
            evaluate("(()=>{const data=JSON.parse(localStorage.getItem('galaxy:user-data'));data.portals.push({...data.portals[0],id:'portal:broken',targetEntryId:'missing-original'},{...data.portals[0],id:'portal:orphan',parentEntryId:'missing-place'});localStorage.setItem('galaxy:user-data',JSON.stringify(data))})()")
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate('JSON.stringify([...portals.values()])')==saved_refs and evaluate("JSON.parse(localStorage.getItem('galaxy:user-data')).portals.length===2&&storageAvailable"),'dangling imported references normalize away without losing valid Portals or canonical data')
            evaluate(f"hierarchySidebar.expanded.add({json.dumps(local)});hierarchySidebar.render();hierarchySidebar.rows.get({json.dumps(p2)}).focus({{preventScroll:true}})")
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Enter',code='Enter',windowsVirtualKeyCode=13)
            wait_camera();evaluate('physics.pause()')
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(target)}&&document.activeElement===hierarchySidebar.rows.get({json.dumps(target)})"),'keyboard Portal activation selects and focuses the original hierarchy row')
            cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'reduce'}]);wait_for('camera.reducedMotion')
            evaluate(f"hierarchySidebar.rows.get({json.dumps(p2)}).click()")
            check(evaluate(f"camera.frame===null&&!camera.travel&&selectedNode.dataset.entryId==={json.dumps(target)}"),'reduced-motion Portal opening reuses immediate canonical focus without animation')
            cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'no-preference'}]);wait_for('!camera.reducedMotion')
            evaluate(f"focusEntry({json.dumps(local)})");wait_camera();evaluate('physics.pause()')
            evaluate(f"hierarchySidebar.expanded.add({json.dumps(remote)});hierarchySidebar.render();hierarchySidebar.scrollRow({json.dumps(p1)});hierarchySidebar.rows.get({json.dumps(p1)}).focus({{preventScroll:true}})")
            click_selector(f'.portal-row[data-portal-id="{p1}"] .tree-portal-actions')
            check(evaluate("[...contextMenu.querySelectorAll('button:not([hidden])')].map(b=>b.textContent).join('|')==='Go to original|Remove Portal'"),'Portal-specific menu exposes reference actions, never Delete original')
            content_before=evaluate(f"JSON.stringify(entries.get({json.dumps(target)}).content)");before=evaluate('JSON.stringify(camera.view)')
            evaluate("window.originalPortalSave=galaxyStorage.save;galaxyStorage.save=()=>{throw new Error('quota')};contextMenu.querySelector('[data-action=remove-portal]').click()")
            check(evaluate(f"portals.has({json.dumps(p1)})&&hierarchySidebar.rows.has({json.dumps(p1)})"),'failed Portal removal keeps its existing reference and sidebar row')
            evaluate(f"galaxyStorage.save=originalPortalSave;removePortal({json.dumps(p1)})")
            check(evaluate(f"!portals.has({json.dumps(p1)})&&portals.has({json.dumps(p2)})&&entries.has({json.dumps(target)})") and evaluate('JSON.stringify(camera.view)')==before,'Remove Portal removes only that reference with no camera movement')
            check(evaluate(f"JSON.stringify(entries.get({json.dumps(target)}).content)")==content_before,'Portal removal preserves original files, notes, bookmarks and canonical content')
            p_place=create_ref(target,sun)
            p_desc=create_ref(child,remote)
            p_unrelated=create_ref(outside,g2)
            evaluate(f"requestEntryDelete({json.dumps(sun)});document.getElementById('delete-entry-form').requestSubmit()")
            wait_for('!deleteDialog.open');evaluate('physics.pause()')
            check(evaluate(f"!portals.has({json.dumps(p_place)})&&portals.has({json.dumps(p2)})&&portals.has({json.dumps(p_unrelated)})&&entries.has({json.dumps(target)})"),'deleting a Portal placement parent removes its rows while preserving remote originals and unrelated references')
            before_refs=evaluate('JSON.stringify([...portals.values()])')
            evaluate(f"window.beforePortalCleanupSave=galaxyStorage.save;galaxyStorage.save=()=>{{throw new DOMException('Full','QuotaExceededError')}};requestEntryDelete({json.dumps(target)});document.getElementById('delete-entry-form').requestSubmit()")
            wait_for('!deletionBusy')
            check(evaluate('JSON.stringify([...portals.values()])')==before_refs and evaluate(f"(async()=>entries.has({json.dumps(target)})&&!!await attachmentStore.get({json.dumps(key)}))()"),'failed attachment/metadata deletion rolls back binaries and leaves original/Portal references intact')
            evaluate('deleteDialog.close();galaxyStorage.save=beforePortalCleanupSave;physics.pause()')
            evaluate(f"requestEntryDelete({json.dumps(target)});document.getElementById('delete-entry-form').requestSubmit()")
            wait_for('!deleteDialog.open');evaluate('physics.pause()')
            check(evaluate(f"!entries.has({json.dumps(target)})&&!entries.has({json.dumps(child)})&&!portals.has({json.dumps(p2)})&&!portals.has({json.dumps(p_desc)})&&portals.has({json.dumps(p_unrelated)})"),'canonical subtree deletion cleans Portals targeting the original or any descendant and preserves unrelated references')
            check(evaluate(f"(async()=>await attachmentStore.get({json.dumps(key)})===null)()"),'canonical subtree deletion still cleans IndexedDB attachment bytes')
            keep=create_ref(outside,local)
            evaluate('physics.resume()');wait_for('physics.settled');evaluate('physics.pause();if(graphNeedsSave)saveGalaxy()')
            raw=evaluate("localStorage.getItem('galaxy:user-data')")
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete'&&typeof sampleMode!=='undefined'&&sampleMode");load();wait_camera();evaluate('physics.pause()')
            check(evaluate('entries.size===187&&nodes.size===187&&portals.size===3&&hierarchySidebar.tree.querySelectorAll(".portal-row").length===3'),'Sample adds three useful references without adding Cosmos bodies')
            check(evaluate("portals.get('sample-portal-deep').targetEntryId==='sample-deep-7'&&entries.get('sample-deep-7').role==='astronaut'"),'Sample includes a deep Astronaut Portal independent of its placement role')
            evaluate("hierarchySidebar.setCollapsed(false)")
            shot('portals-sample-desktop')
            cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=False);time.sleep(.2)
            evaluate("hierarchySidebar.setCollapsed(false);hierarchySidebar.scrollRow('sample-portal-deep')");wait_camera()
            check(evaluate("getComputedStyle(hierarchySidebar.rows.get('sample-portal-deep').querySelector('.tree-portal-actions')).opacity==='1'"),'Portal reference menu stays discoverable on touch/mobile')
            point=evaluate("(()=>{const r=hierarchySidebar.rows.get('sample-portal-deep').querySelector('.tree-portal-actions').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
            cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
            wait_for("contextPortalId==='sample-portal-deep'")
            shot('portals-mobile-menu')
            evaluate("contextMenu.querySelector('[data-action=open-portal]').click()");wait_camera()
            check(evaluate("selectedNode.dataset.entryId==='sample-deep-7'&&!panel.hidden&&hierarchySidebar.collapsed&&contentInspector.entryId==='sample-deep-7'"),'touch Portal opening navigates to canonical content through the existing mobile drawer/sheet behavior')
            evaluate("clearSelection();fitGalaxy(false);openPortal('sample-portal-deep')")
            check(evaluate("camera.travel.duration>=1200"),'opening a cross-Galaxy Portal without prior selection derives route context from its real placement parent')
            wait_camera()
            evaluate("removePortal('sample-portal-recipe')")
            new_sample=create_ref('sample-moon-0-1-0','sample-galaxy-2')
            check(evaluate("localStorage.getItem('galaxy:user-data')")==raw,'Sample Portal creation/removal never writes real saved references or entries')
            evaluate('removeSampleButton.click()');wait_for("document.readyState==='complete'&&typeof sampleMode!=='undefined'&&!sampleMode");load();wait_camera()
            check(evaluate(f"portals.has({json.dumps(keep)})&&!portals.has({json.dumps(new_sample)})&&entries.has({json.dumps(outside)})"),'leaving Sample restores real Portal references without mixing datasets')
            check(not cdp.errors,f'no Portal browser exceptions: {cdp.errors}')
            print(f'{count} Portal browser checks passed',flush=True)
            return

        if options.ownership_only:
            coding='migration-my-galaxy'
            work=add('Work');remote=add('Unrelated entry')
            edit(coding,name='Coding',parent=work)
            fresh=add('Fresh child',coding)
            wait_for('physics.settled');evaluate('physics.pause()')
            check(evaluate("(()=>{openContextMenu('vs-code',500,200);const available=!contextMenu.querySelector('[data-action=delete]').disabled;closeContextMenu();selectEntry(entries.get('vs-code'),nodes.get('vs-code'));return available&&!deleteEntryButton.hidden;})()"),'ordinary starter Delete is available in both existing UI routes')
            for owner,name in [('vs-code','starter.txt'),(coding,'parent.txt'),(remote,'unrelated.txt')]:
                select(owner);evaluate(f"contentInspector.upload([new File(['Keep these bytes'],{json.dumps(name)},{{type:'text/plain'}})]);void 0")
                wait_for('contentInspector.jobs.size===0')
            starter_file=evaluate("entries.get('vs-code').content.attachments[0].storageKey")
            parent_file=evaluate(f"entries.get({json.dumps(coding)}).content.attachments[0].storageKey")
            unrelated_file=evaluate(f"entries.get({json.dumps(remote)}).content.attachments[0].storageKey")
            evaluate("saveEntryContent('vs-code',{...entries.get('vs-code').content,notes:{format:'plain',text:'Keep starter notes'},links:[{id:'kept-bookmark',url:'https://example.com/',title:'Keep this'}]})")
            evaluate(f"physics.pause();saveGalaxy()")
            saved_content=evaluate("JSON.stringify(entries.get('vs-code').content)")
            ancestry=evaluate('JSON.stringify([...entries.values()].map(e=>[e.id,e.parentId,e.name]))')
            evaluate("(()=>{const data=JSON.parse(localStorage.getItem('galaxy:user-data'));data.entries.forEach(entry=>{entry.protected=true;entry.isProtected=true;entry.builtIn=true;entry.isBuiltIn=true});localStorage.setItem('galaxy:user-data',JSON.stringify(data))})()")
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate("[...entries.values()].every(e=>!['protected','isProtected','builtIn','isBuiltIn'].some(key=>key in e)) && JSON.parse(localStorage.getItem('galaxy:user-data')).entries.every(e=>!['protected','isProtected','builtIn','isBuiltIn'].some(key=>key in e))"),'legacy flags normalize away in memory and the existing saved snapshot')
            check(evaluate('JSON.stringify([...entries.values()].map(e=>[e.id,e.parentId,e.name]))')==ancestry and evaluate("JSON.stringify(entries.get('vs-code').content)")==saved_content,'normalization preserves IDs, hierarchy, names, notes, bookmark IDs and file metadata')
            check(evaluate("galaxyStorage.load().version===5 && storageAvailable"),'ownership cleanup needs no storage schema change')
            select('vs-code');evaluate('physics.pause()')
            before=evaluate('JSON.stringify(camera.view)');expanded=evaluate('[...hierarchySidebar.expanded]')
            removed=evaluate(f"[...galaxyModel.subtreeIds(entries,{json.dumps(coding)})]")
            check('vs-code' in removed and 'github' in removed and 'codex' in removed and fresh in removed,'migrated parent owns starter IDs and newly created descendants through the same tree')
            evaluate(f"requestEntryDelete({json.dumps(coding)})")
            check(evaluate(f"deleteDialog.open && deleteConfirmationIds.size==={len(removed)} && document.getElementById('confirm-delete-entry').textContent==='Delete {len(removed)} entries'"),'starter/migrated parent requests the correct subtree confirmation count')
            evaluate('document.getElementById("cancel-delete-entry").click()')
            check(evaluate(f"entries.has({json.dumps(coding)}) && entries.has('vs-code')") and evaluate('JSON.stringify(camera.view)')==before,'cancel leaves the starter branch and camera intact')
            evaluate(f"requestEntryDelete({json.dumps(coding)});document.getElementById('delete-entry-form').requestSubmit()")
            wait_for('!deleteDialog.open');evaluate('physics.pause()')
            check(evaluate(f"{json.dumps(removed)}.every(id=>!entries.has(id)&&!nodes.has(id)&&!hierarchySidebar.rows.has(id)&&!physics.particles.has(id))"),'confirmed deletion removes the complete branch without promoting descendants')
            check(evaluate(f"(async()=>await attachmentStore.get({json.dumps(starter_file)})===null&&await attachmentStore.get({json.dumps(parent_file)})===null&&!!await attachmentStore.get({json.dumps(unrelated_file)}))()"),'subtree cleanup deletes starter and parent bytes while retaining unrelated files')
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(work)}&&hierarchySidebar.selectedId==={json.dumps(work)}&&panelName.textContent==='Work'"),'deleted selection falls back to the nearest surviving ancestor')
            check(evaluate('JSON.stringify(camera.view)')==before,'starter subtree deletion preserves the exact camera')
            check(evaluate(f"{json.dumps(expanded)}.filter(id=>entries.has(id)).every(id=>hierarchySidebar.expanded.has(id))"),'surviving sidebar expansions remain stable')
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate(f"{json.dumps(removed)}.every(id=>!entries.has(id))&&entries.has({json.dumps(work)})&&entries.has({json.dumps(remote)})"),'refresh persists deletion and never resurrects starter defaults')
            evaluate('physics.resume()');wait_for('physics.settled');evaluate('physics.pause();if(graphNeedsSave)saveGalaxy()')
            real_raw=evaluate("localStorage.getItem('galaxy:user-data')")
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete'&&typeof sampleMode!=='undefined'&&sampleMode");load();wait_camera()
            evaluate("requestEntryDelete('sample-satellite-2-0-0-0');document.getElementById('delete-entry-form').requestSubmit()")
            wait_for('!deleteDialog.open')
            check(evaluate("(async()=>await attachmentStore.get('sample-recipe-file')===null)()") and evaluate("localStorage.getItem('galaxy:user-data')")==real_raw,'Sample subtree/file deletion remains isolated from real metadata')
            check(evaluate(f"(async()=>!!await createGalaxyAttachmentStore().get({json.dumps(unrelated_file)}))()"),'Sample operations leave real IndexedDB bytes intact')
            evaluate('removeSampleButton.click()');wait_for("document.readyState==='complete'&&typeof sampleMode!=='undefined'&&!sampleMode");load();wait_camera()
            check(evaluate(f"!entries.has('vs-code')&&entries.has({json.dumps(work)})&&entries.has({json.dumps(remote)})"),'leaving Sample restores only the remaining user-owned data')
            evaluate(f"requestEntryDelete({json.dumps(work)});document.getElementById('delete-entry-form').requestSubmit()")
            wait_for('!deleteDialog.open')
            evaluate(f"requestEntryDelete({json.dumps(remote)});document.getElementById('delete-entry-form').requestSubmit()")
            wait_for('!deleteDialog.open')
            check(evaluate("entries.size===0&&nodes.size===0&&selectedNode===null&&panel.hidden"),'all visible entries can be removed; app infrastructure is separate from the hierarchy')
            cdp.call('Page.reload');load()
            check(evaluate('entries.size===0&&storageAvailable'),'an empty user snapshot remains empty after refresh')
            new_owner=add('New user Galaxy')
            check(evaluate(f"entries.has({json.dumps(new_owner)})&&entries.get({json.dumps(new_owner)}).parentId===null"),'the app still creates ordinary entries after deleting all starters')
            evaluate(f"requestEntryDelete({json.dumps(new_owner)});document.getElementById('delete-entry-form').requestSubmit()")
            wait_for('!deleteDialog.open')
            check(evaluate('entries.size===0'),'newly created entries use the same normal deletion flow')
            check(not cdp.errors,f'no ownership browser exceptions: {cdp.errors}')
            print(f'{count} ownership browser checks passed',flush=True)
            return

        if options.row_actions_only:
            first=add('Selected Galaxy');target=add('Other Galaxy')
            chain=[target]
            for depth in range(1,10): chain.append(add('Deep '+str(depth)+' '+('long name ' * 4),chain[-1]))
            wait_for('physics.settled');evaluate('physics.pause()')
            evaluate(f"focusEntry({json.dumps(first)})");wait_camera();evaluate('physics.pause()')
            check(evaluate("!document.querySelector('.sidebar-controls button') && addEntryButton.closest('#sidebar-tools') && addEntryButton.textContent==='Add Galaxy'"),'Search has no global +; Add Galaxy remains in More tools')
            check(evaluate("[...hierarchySidebar.tree.children].every(row=>row.querySelector('.tree-add') && row.getBoundingClientRect().height===32)"),'every visible hierarchy row has a small + without changing row height')
            selector=f'.hierarchy-row[data-entry-id="{target}"] .tree-add'
            evaluate('hierarchySidebar.toggle.focus({preventScroll:true})');mouse('mouseMoved',x=700,y=950)
            check(evaluate(f"getComputedStyle(document.querySelector({json.dumps(selector)})).opacity==='0'"),'desktop row + is hidden at rest')
            point=evaluate(f"(()=>{{const r=document.querySelector({json.dumps(selector)}).getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}}}})()")
            mouse('mouseMoved',**point)
            check(evaluate(f"getComputedStyle(document.querySelector({json.dumps(selector)})).opacity==='1'"),'row hover reveals the right-aligned +')
            before=evaluate('JSON.stringify({id:selectedNode.dataset.entryId,tree:hierarchySidebar.selectedId,view:camera.view,panel:panel.hidden})')
            click_selector(selector)
            check(evaluate(f"addMenuTargetId==={json.dumps(target)} && [...addMenu.children].map(b=>b.textContent).join('|')==='Add child|Add files|Add note|Add bookmark'"),'row + opens four actions for its own row, even with a different selection')
            check(evaluate('JSON.stringify({id:selectedNode.dataset.entryId,tree:hierarchySidebar.selectedId,view:camera.view,panel:panel.hidden})')==before,'opening row + does not select, focus-navigate or reframe the body')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
            check(evaluate(f"addMenu.hidden && document.activeElement===document.querySelector({json.dumps(selector)}) && getComputedStyle(document.activeElement).opacity==='1'"),'Escape restores visible keyboard focus to the originating row +')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Enter',code='Enter',windowsVirtualKeyCode=13,text='\r',unmodifiedText='\r')
            cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Enter',code='Enter',windowsVirtualKeyCode=13)
            check(evaluate(f"!addMenu.hidden && addMenuTargetId==={json.dumps(target)}"),'keyboard activation opens the correct row menu')
            evaluate('closeContentMenus()')
            for role,parent in zip(['sun','planet','moon','satellite','astronaut','astronaut'],chain[:6]):
                select(first);evaluate('physics.pause()')
                evaluate(f"hierarchySidebar.rows.get({json.dumps(parent)}).querySelector('.tree-add').click();addChildButton.click()")
                check(evaluate(f"dialog.open && parentField.value==={json.dumps(parent)} && roleField.dataset.role==={json.dumps(role)}"),'row creation derives '+role+' from its own parent')
                evaluate('document.getElementById("cancel-add-entry").click();physics.pause()')
            select(first);evaluate('physics.pause()');view=evaluate('JSON.stringify(camera.view)')
            evaluate(f"hierarchySidebar.rows.get({json.dumps(target)}).querySelector('.tree-add').click();addMenu.querySelector('[data-add=note]').click();contentInspector.notes.value='Target note';contentInspector.notesForm.requestSubmit()")
            check(evaluate(f"entries.get({json.dumps(target)}).content.notes.text==='Target note' && !entries.get({json.dumps(first)}).content"),'Add note edits the row target rather than the previously selected body')
            check(evaluate('JSON.stringify(camera.view)')==view,'opening another row\'s content editor preserves camera state')
            evaluate(f"window.pickedOwner=null;contentInspector.files.addEventListener('click',event=>{{pickedOwner=contentInspector.entryId;event.preventDefault()}});hierarchySidebar.rows.get({json.dumps(first)}).querySelector('.tree-add').click();addMenu.querySelector('[data-add=files]').click()")
            check(evaluate('pickedOwner')==first,'Add files invokes the existing picker for the clicked row')
            evaluate('contentInspector.files.dispatchEvent(new Event("cancel"))')
            evaluate(f"hierarchySidebar.rows.get({json.dumps(target)}).querySelector('.tree-add').click();addMenu.querySelector('[data-add=bookmark]').click();document.getElementById('content-link-url').value='google.com';contentInspector.linkForm.requestSubmit()")
            check(evaluate(f"entries.get({json.dumps(target)}).content.links[0].url==='https://google.com/' && !entries.get({json.dumps(first)}).content"),'Add bookmark saves to the clicked row through the existing handler')
            check(evaluate("(()=>{const h=panelName.getBoundingClientRect(),m=moreButton.getBoundingClientRect();return Math.abs(h.top-m.top)<.1&&m.width===28&&m.height===28&&m.left>h.right&&moreButton.ariaLabel==='More actions'&&moreButton.title==='More actions'})()"),'More actions remains compact and associated with the selected-item title')
            for action,condition in [('edit-entry-button',"dialog.open && !document.getElementById('entry-info-fields').hidden"),('move-entry-button',"dialog.open && !document.getElementById('parent-field').hidden"),('delete-entry-button','deleteDialog.open')]:
                click_selector('#entry-more-button');click_selector('#'+action)
                check(evaluate(condition),'header More reuses '+action)
                evaluate('if(dialog.open)document.getElementById("cancel-add-entry").click();if(deleteDialog.open)deleteDialog.close();physics.pause()')
            if screenshot_dir:
                result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/'row-actions-desktop.png').write_bytes(base64.b64decode(result['data']))
            cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=False);time.sleep(.2)
            evaluate('hierarchySidebar.setCollapsed(false)');wait_camera();evaluate(f"physics.pause();hierarchySidebar.scrollRow({json.dumps(chain[-1])})")
            evaluate(f"hierarchySidebar.rows.get({json.dumps(chain[-1])}).focus({{preventScroll:true}})")
            mobile_selector=f'.hierarchy-row[data-entry-id="{chain[-1]}"] .tree-add'
            check(evaluate(f"(()=>{{const a=document.querySelector({json.dumps(mobile_selector)}),r=a.getBoundingClientRect(),s=hierarchySidebar.sidebar.getBoundingClientRect();return getComputedStyle(a).opacity==='1'&&r.left>=s.left&&r.right<=s.right&&a.ariaLabel.includes('Deep 9');}})()"),'deep Astronaut row + stays visible and reachable on mobile with truncation/scrolling intact')
            before=evaluate('JSON.stringify({id:selectedNode.dataset.entryId,view:camera.view,collapsed:hierarchySidebar.collapsed})')
            point=evaluate(f"(()=>{{const r=document.querySelector({json.dumps(mobile_selector)}).getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}}}})()")
            cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
            wait_for('!addMenu.hidden')
            check(evaluate('addMenuTargetId')==chain[-1] and evaluate('JSON.stringify({id:selectedNode.dataset.entryId,view:camera.view,collapsed:hierarchySidebar.collapsed})')==before,'touch opens the deep row menu without navigating or closing the drawer')
            if screenshot_dir:
                result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/'row-actions-mobile.png').write_bytes(base64.b64decode(result['data']))
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
            check(evaluate(f"document.activeElement===document.querySelector({json.dumps(mobile_selector)})"),'mobile menu dismissal returns focus to its row action')
            check(not cdp.errors,f'no row-action browser exceptions: {cdp.errors}')
            print(f'{count} row-action browser checks passed',flush=True)
            return

        if options.content_only or options.organizer_only or options.workspace_only:
            owner=add('Rich content Galaxy');child=add('Rich content child',owner);other=add('Unrelated files')
            wait_for('physics.settled');evaluate('physics.pause()')
            if options.organizer_only or options.workspace_only:
                chain=[owner,child]
                for role in ['Planet','Moon','Satellite','Astronaut','Astronaut']:
                    parent=chain[-1]
                    evaluate(f"selectEntry(entries.get({json.dumps(parent)}),nodes.get({json.dumps(parent)}));openSelectedRowAdd()")
                    check(evaluate("[...addMenu.querySelectorAll('button:not([hidden])')].map(b=>b.textContent).join('|')==='Add child|Add files|Add note|Add bookmark' && addMenuTargetId===selectedNode.dataset.entryId"),'row + offers hierarchy and content actions for its own item')
                    click_selector('#add-child-button')
                    check(evaluate(f"document.getElementById('add-entry-title').textContent==='Add {role}' && submitButton.textContent==='Create {role}' && document.getElementById('entry-info-fields').hidden && document.getElementById('parent-field').hidden && creationContext.hidden && roleField.hidden"),f'quick Add {role} only shows Name')
                    evaluate(f"fields[0].value='Organizer {role}';form.requestSubmit();physics.pause()")
                    chain.append(evaluate('selectedNode.dataset.entryId'))
                    check(evaluate(f"entries.get(selectedNode.dataset.entryId).role==={json.dumps(role.lower())} && entries.get(selectedNode.dataset.entryId).parentId==={json.dumps(parent)}"),f'contextual creation derives {role} and one parent')
                deepest=chain[-1]
                evaluate(f"focusEntry({json.dumps(deepest)})");wait_camera();evaluate('physics.pause()')
                check(evaluate(f"panelName.textContent===entries.get({json.dumps(deepest)}).name && [...panelAncestry.children].map(b=>b.textContent).join('|')===[...galaxyModel.ancestors(entries,{json.dumps(deepest)})].reverse().map(e=>e.name).join('|')"),'content title and clickable breadcrumb contain ancestors only')
                evaluate('panelAncestry.children[1].click()');wait_camera();evaluate('physics.pause()')
                check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(child)} && hierarchySidebar.selectedId==={json.dumps(child)}"),'breadcrumb uses existing ancestor focus and synchronizes selection')
                evaluate(f"hierarchySidebar.rows.get({json.dumps(deepest)}).querySelector('.tree-name').click()");wait_camera();evaluate('physics.pause()')
                check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(deepest)} && contentInspector.entryId==={json.dumps(deepest)}"),'sidebar name selects the body and displays its contents')
                evaluate(f"focusEntry({json.dumps(owner)})");wait_camera();evaluate('physics.pause();closeInspector()')
                before=evaluate('JSON.stringify(camera.view)')
                click_selector(f'.entry-node[data-entry-id="{owner}"]')
                check(evaluate(f"!panel.hidden && contentInspector.entryId==={json.dumps(owner)} && hierarchySidebar.selectedId==={json.dumps(owner)}"),'Cosmos selection opens matching contents and sidebar selection')
                check(evaluate('JSON.stringify(camera.view)')==before,'reopening contents through body selection does not move camera')
                click_selector('#entry-more-button')
                check(evaluate("!entryActions.hidden && [...entryActions.children].filter(b=>!b.hidden).map(b=>b.textContent).join('|')==='Edit info|Move / change parent|Delete entry'"),'More contains management actions without permanent metadata')
                check(evaluate('JSON.stringify(camera.view)')==before,'opening More leaves camera unchanged')
                cdp.call('Input.dispatchKeyEvent',type='keyDown',key='ArrowDown',code='ArrowDown',windowsVirtualKeyCode=40)
                check(evaluate("document.activeElement.id==='move-entry-button'"),'More supports arrow-key navigation')
                cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
                check(evaluate('entryActions.hidden && !panel.hidden && document.activeElement===moreButton'),'More Escape returns focus and leaves Contents open')
                click_selector('#entry-more-button')
                click_selector('#edit-entry-button')
                check(evaluate("dialog.open && !document.getElementById('entry-info-fields').hidden && document.getElementById('parent-field').hidden"),'Edit info reuses the metadata editor')
                evaluate("fields[1].value='Preserved description';fields[2].value='Preserved label';form.requestSubmit();physics.pause()")
                evaluate('moreButton.click();document.getElementById("move-entry-button").click()')
                check(evaluate("dialog.open && !document.getElementById('parent-field').hidden && document.getElementById('entry-info-fields').hidden"),'Move exposes the existing parent selector without duplicate CRUD')
                evaluate("form.requestSubmit();physics.pause()")
                check(evaluate("entries.get(selectedNode.dataset.entryId).description==='Preserved description' && entries.get(selectedNode.dataset.entryId).category==='Preserved label'"),'Move preserves metadata and contents')
                select(owner);evaluate('physics.pause()');before=evaluate('JSON.stringify(camera.view)')
                evaluate('openSelectedRowAdd();addMenu.querySelector("[data-add=note]").click()')
                check(evaluate("!contentInspector.notesForm.hidden && document.activeElement===contentInspector.notes"),'sidebar Add note activates one on-demand Notes editor')
                evaluate("contentInspector.notes.value='Organizer note';contentInspector.notesForm.requestSubmit()")
                check(evaluate("contentInspector.notesForm.hidden && contentInspector.notesView.textContent==='Organizer note' && document.getElementById('content-edit-notes').ariaLabel==='Edit note'"),'Notes save returns to content with a small accessible edit icon')
                evaluate('openSelectedRowAdd();addMenu.querySelector("[data-add=note]").click();document.getElementById("content-cancel-notes").click()')
                check(evaluate("contentInspector.content().notes.text==='Organizer note' && contentInspector.notesForm.hidden"),'Add note edits the same notes field and Cancel preserves saved text')
                evaluate('openSelectedRowAdd();addMenu.querySelector("[data-add=bookmark]").click()')
                check(evaluate('!contentInspector.linkForm.hidden'),'sidebar Add bookmark opens lightweight temporary form')
                for domain in ['google.com','www.google.com']:
                    evaluate(f"contentInspector.editLink();document.getElementById('content-link-url').value={json.dumps(domain)};contentInspector.linkForm.requestSubmit()")
                    check(evaluate(f"contentInspector.linkForm.hidden && contentInspector.content().links.at(-1).url==={json.dumps('https://'+domain+'/')}"),f'{domain} normalizes to HTTPS without protocol input')
                evaluate('window.filePickerClicks=0;contentInspector.files.addEventListener("click",event=>{filePickerClicks++;event.preventDefault()});openSelectedRowAdd();addMenu.querySelector("[data-add=files]").click()')
                check(evaluate('filePickerClicks===1 && !panel.hidden'),'sidebar Add files invokes the supported picker for the selected entry')
                evaluate('contentInspector.files.dispatchEvent(new Event("cancel"))')
                check(evaluate('document.getElementById("content-file-limit").hidden'),'canceling file selection restores the quiet view without upload information')
                evaluate('contentInspector.editNotes();contentInspector.notes.value="Unsaved note draft";openSelectedRowAdd();addMenu.querySelector("[data-add=files]").click()')
                check(evaluate('!contentInspector.notesForm.hidden && contentInspector.notes.value==="Unsaved note draft"'),'adding files preserves the selected body\'s in-progress note draft')
                evaluate('document.getElementById("content-cancel-notes").click()')
                evaluate('contentInspector.files.dispatchEvent(new Event("cancel"))')
                check(evaluate('JSON.stringify(camera.view)')==before,'all contextual content actions preserve the exact camera')
                evaluate('closeInspector();setInspectorOpen(true)')
                check(evaluate('!panel.hidden && contentInspector.notesForm.hidden && contentInspector.linkForm.hidden'),'Contents can close and reopen with read-first state')
                check(evaluate('JSON.stringify(camera.view)')==before,'closing and reopening the Content panel leaves camera unchanged')
                evaluate('saveEntryContent(contentInspector.entryId,galaxyModel.emptyContent());contentInspector.select(entries.get(contentInspector.entryId),true)')
            if options.workspace_only:
                def shot(name):
                    if screenshot_dir:
                        result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/(name+'.png')).write_bytes(base64.b64decode(result['data']))
                check(evaluate("document.querySelectorAll('.content-section-add').length===2&&document.getElementById('content-notes-empty').tagName==='BUTTON'&&document.getElementById('content-edit-notes').hidden&&contentInspector.notesForm.hidden&&contentInspector.linkForm.hidden&&document.getElementById('content-file-limit').hidden"),'read state has only compact section shortcuts, without permanent editing forms or technical upload information')
                check(evaluate("['content-files-empty','content-notes-empty','content-bookmarks-empty'].map(id=>document.getElementById(id).textContent).join('|')==='No files|No notes|No bookmarks'"),'empty content sections remain quiet and explicit')
                check(evaluate("!document.querySelector('.sidebar-controls .tree-add,.sidebar-controls #add-entry-button') && [...hierarchySidebar.tree.children].every(row=>row.querySelector('.tree-add'))"),'contextual + lives on tree rows rather than beside Search')
                check(evaluate("!!document.getElementById('reset-view-button').closest('#sidebar-tools') && !!addEntryButton.closest('#sidebar-tools')"),'Fit and top-level Add Galaxy remain in More tools')
                before=evaluate('JSON.stringify(camera.view)');alpha=evaluate('physics.simulation.alpha()')
                evaluate('openSelectedRowAdd()')
                cdp.call('Input.dispatchKeyEvent',type='keyDown',key='ArrowDown',code='ArrowDown',windowsVirtualKeyCode=40)
                check(evaluate('document.activeElement.dataset.add==="files"'),'contextual + menu supports keyboard navigation to content actions')
                cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
                check(evaluate('addMenu.hidden && document.activeElement===hierarchySidebar.rows.get(selectedNode.dataset.entryId).querySelector(".tree-add") && !panel.hidden'),'Add menu Escape returns focus to the row action without closing Contents')
                chain_test=[owner]
                for role in ['Sun','Planet','Moon','Satellite','Astronaut','Astronaut']:
                    evaluate(f"selectEntry(entries.get({json.dumps(chain_test[-1])}),nodes.get({json.dumps(chain_test[-1])}));openSelectedRowAdd();addChildButton.click()")
                    check(evaluate("document.activeElement===fields[0]"),f'Add {role} autofocuses Name')
                    check(evaluate("(()=>{const l=document.querySelector('#entry-name-field label').getBoundingClientRect(),i=fields[0].getBoundingClientRect(),d=dialog.getBoundingClientRect();return i.top-l.bottom>=7&&i.bottom<d.bottom&&d.width<=360&&Math.abs((d.left+d.right)/2-innerWidth/2)<1&&Math.abs((d.top+d.bottom)/2-innerHeight/2)<1&&getComputedStyle(fields[0]).outlineStyle==='none';})()"),f'Add {role} has a spaced label, compact centered dialog and restrained input focus')
                    check(evaluate("!fields[1].required && document.getElementById('entry-info-fields').hidden && document.getElementById('parent-field').hidden"),f'Add {role} stays Name-only')
                    if role=='Planet':shot('workspace-add-planet')
                    evaluate(f"fields[0].value={json.dumps('Workspace '+role)}")
                    cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Enter',code='Enter',windowsVirtualKeyCode=13,text='\r',unmodifiedText='\r')
                    cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Enter',code='Enter',windowsVirtualKeyCode=13)
                    wait_for('!dialog.open');evaluate('physics.pause()')
                    check(evaluate(f"entries.get(selectedNode.dataset.entryId).role==={json.dumps(role.lower())} && entries.get(selectedNode.dataset.entryId).parentId==={json.dumps(chain_test[-1])}"),f'Enter creates the contextual {role} with one parent')
                    chain_test.append(evaluate('selectedNode.dataset.entryId'))
                evaluate('openSelectedRowAdd();addChildButton.click()')
                cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
                cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Escape',code='Escape',windowsVirtualKeyCode=27)
                wait_for('!dialog.open')
                check(evaluate("document.activeElement!==document.body && document.activeElement.isConnected"),'modal Escape returns accessible focus')
                evaluate('openSelectedRowAdd();addChildButton.click();document.getElementById("cancel-add-entry").click()')
                check(evaluate('!dialog.open'),'modal Cancel closes without creation')
                evaluate(f"openEntryForm(entries.get({json.dumps(chain_test[-1])}));fields[0].value='A long celestial name '+('x'.repeat(38));form.requestSubmit();physics.pause();hierarchySidebar.select({json.dumps(chain_test[-1])})")
                check(evaluate("(()=>{const rows=[...hierarchySidebar.tree.querySelectorAll('.hierarchy-row')];return rows.every(row=>{const r=row.getBoundingClientRect(),c=row.querySelector('.tree-disclosure').getBoundingClientRect(),i=row.querySelector('.tree-role-icon').getBoundingClientRect(),n=row.querySelector('.tree-name').getBoundingClientRect();return r.height===32&&Math.abs(c.top+c.height/2-r.top-r.height/2)<.1&&Math.abs(i.top+i.height/2-r.top-r.height/2)<.1&&n.left>i.right&&getComputedStyle(row.querySelector('.tree-name')).textOverflow==='ellipsis';});})()"),'tree rows keep chevrons, celestial icons and long names aligned at every visible depth')
                check(evaluate("getComputedStyle(hierarchySidebar.rows.get(selectedNode.dataset.entryId)).backgroundColor!==getComputedStyle([...hierarchySidebar.rows.values()].find(row=>row.dataset.entryId!==selectedNode.dataset.entryId)).backgroundColor"),'selected row has its own restrained background')
                evaluate(f"focusEntry({json.dumps(owner)})");wait_camera();evaluate('physics.pause()');shot('workspace-empty-desktop')
            def inspect(id):
                evaluate(f"focusEntry({json.dumps(id)})");wait_camera();evaluate('physics.pause();contentInspector.render()')
            def stable(before,title):
                check(evaluate('JSON.stringify(camera.view)')==before,title)
            def preview(name):
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/(name+'.png')).write_bytes(base64.b64decode(result['data']))
            inspect(owner);before=evaluate('JSON.stringify(camera.view)');alpha=evaluate('physics.simulation.alpha()')
            note='First line\nSecond line\n<script>window.contentXss=true</script>\n'
            evaluate(f"contentInspector.notes.value={json.dumps(note)};document.getElementById('content-notes-form').requestSubmit()")
            check(evaluate(f"entries.get({json.dumps(owner)}).content.notes.text==={json.dumps(note)} && !window.contentXss"),'plain multiline notes preserve line breaks without executing markup')
            stable(before,'saving notes leaves the camera unchanged');check(evaluate('physics.simulation.alpha()')==alpha,'content saves do not reheat physics')
            evaluate("contentInspector.notes.value='';document.getElementById('content-notes-form').requestSubmit()")
            check(evaluate(f"entries.get({json.dumps(owner)}).content.notes.text===''") ,'existing notes can be cleared completely')
            evaluate(f"contentInspector.notes.value={json.dumps(note)};document.getElementById('content-notes-form').requestSubmit()")
            def link(url,title=''):
                evaluate(f"contentInspector.editLink();document.getElementById('content-link-url').value={json.dumps(url)};document.getElementById('content-link-title').value={json.dumps(title)};contentInspector.linkForm.requestSubmit()")
            link('https://example.com/recipe','Recipe');link('https://example.org/reference')
            check(evaluate(f"entries.get({json.dumps(owner)}).content.links.length===2 && [...document.querySelectorAll('#content-links a')].every(a=>a.target==='_blank'&&a.rel.includes('noopener'))"),'multiple readable links have stable IDs and safe new-tab actions')
            link_id=evaluate(f"entries.get({json.dumps(owner)}).content.links[0].id")
            evaluate("contentInspector.editLink(contentInspector.content().links[0]);document.getElementById('content-link-title').value='Updated recipe';contentInspector.linkForm.requestSubmit()")
            check(evaluate(f"entries.get({json.dumps(owner)}).content.links[0].id==={json.dumps(link_id)} && contentInspector.content().links[0].title==='Updated recipe'"),'link editing retains its canonical ID')
            link('javascript:alert(1)')
            check(evaluate("contentInspector.content().links.length===2 && contentInspector.status.dataset.error==='true'"),'unsafe URL schemes are rejected before saving')
            evaluate("contentInspector.linkForm.hidden=true;document.querySelectorAll('#content-links .content-row-actions')[1].lastElementChild.click()")
            check(evaluate('contentInspector.content().links.length===1'),'link removal removes only its own content record')
            stable(before,'link add/edit/remove leave camera state unchanged')
            fixtures=profile/'attachment-fixtures';fixtures.mkdir()
            for ext,mime in [('png','image/png'),('jpg','image/jpeg'),('jpeg','image/jpeg'),('webp','image/webp')]:
                encoded=evaluate(f"new Promise(resolve=>{{const c=document.createElement('canvas');c.width=640;c.height=320;const x=c.getContext('2d');x.fillStyle='#386978';x.fillRect(0,0,640,320);x.fillStyle='#dfca91';x.fillRect(180,70,280,180);c.toBlob(b=>{{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(b);}},'{mime}',.8);}})")
                (fixtures/f'image.{ext}').write_bytes(base64.b64decode(encoded))
            objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>']
            pdf=b'%PDF-1.4\n';offsets=[]
            for i,obj in enumerate(objects,1):offsets.append(len(pdf));pdf+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
            xref=len(pdf);pdf+=b'xref\n0 4\n0000000000 65535 f \n'+b''.join(f'{pos:010d} 00000 n \n'.encode() for pos in offsets)+f'trailer\n<< /Root 1 0 R /Size 4 >>\nstartxref\n{xref}\n%%EOF\n'.encode()
            (fixtures/'plan.pdf').write_bytes(pdf);(fixtures/'notes.txt').write_text('Preview\n'+('Text line\n'*1000),encoding='utf-8');(fixtures/'readme.md').write_text('# Markdown\n<script>window.fileXss=true</script>',encoding='utf-8')
            (fixtures/'unsupported.zip').write_bytes(b'not supported');(fixtures/'large.txt').write_bytes(b'x'*(10*1024*1024+1))
            def pick(names):
                node=cdp.call('DOM.getDocument')['root']['nodeId'];file_node=cdp.call('DOM.querySelector',nodeId=node,selector='#content-files')['nodeId']
                cdp.call('DOM.setFileInputFiles',nodeId=file_node,files=[str(fixtures/name) for name in names]);wait_for('contentInspector.jobs.size===0')
            pick(['image.png','image.jpg','image.jpeg','image.webp','plan.pdf','notes.txt','readme.md'])
            check(evaluate('contentInspector.content().attachments.length===7'),'picker accepts PNG/JPG/JPEG/WebP/PDF/TXT/MD files')
            files=evaluate('contentInspector.content().attachments');image=files[0];pdf_meta=files[4]
            if options.workspace_only:
                check(evaluate("[...document.querySelectorAll('.content-item-menu')].every(menu=>!menu.open && menu.querySelector('.content-row-actions').getBoundingClientRect().height===0)"),'normal Files and Bookmarks show contents with closed overflow management')
                check(evaluate("[...document.querySelectorAll('.bookmark-info small')].every(meta=>meta.textContent&&!meta.textContent.startsWith('http')&&getComputedStyle(meta).display!=='none')"),'bookmark rows show readable titles and concise destinations')
                check(evaluate("!document.getElementById('content-edit-notes').hidden && document.getElementById('content-edit-notes').getBoundingClientRect().width===26 && contentInspector.notesForm.hidden"),'existing Notes use a small accessible edit icon while remaining read-first')
                before_menu=evaluate('JSON.stringify(camera.view)');alpha_menu=evaluate('physics.simulation.alpha()')
                evaluate("window.bookmarkMenu=document.querySelector('#content-links .content-item-menu');bookmarkMenu.querySelector('summary').scrollIntoView({block:'center'})")
                click_selector('#content-links .content-item-menu summary')
                check(evaluate('bookmarkMenu.open && [...bookmarkMenu.querySelectorAll("button")].map(b=>b.textContent).join("|")==="Edit|Remove"'),'bookmark overflow reveals Edit and Remove only when requested')
                cdp.call('Input.dispatchKeyEvent',type='keyDown',key='ArrowDown',code='ArrowDown',windowsVirtualKeyCode=40)
                check(evaluate('document.activeElement===bookmarkMenu.querySelector("button")'),'bookmark management is keyboard accessible')
                cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
                check(evaluate('!bookmarkMenu.open && !panel.hidden && document.activeElement===bookmarkMenu.querySelector("summary")'),'bookmark menu Escape preserves the Content panel and returns focus')
                click_selector('#content-links .content-item-menu summary');click_selector('#content-links .content-item-menu button')
                check(evaluate('!contentInspector.linkForm.hidden && !bookmarkMenu.open'),'requested bookmark edit opens the existing lightweight editor')
                evaluate('document.getElementById("content-cancel-link").click()')
                evaluate(f"document.querySelector('[data-attachment-id=\"{image['id']}\"] summary').scrollIntoView({{block:'center'}})")
                click_selector(f'[data-attachment-id="{image["id"]}"] summary')
                check(evaluate(f"document.querySelector('[data-attachment-id=\"{image['id']}\"] details').open"),'file overflow exposes the existing confirmed removal action')
                cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
                check(evaluate('JSON.stringify(camera.view)')==before_menu and evaluate('physics.simulation.alpha()')==alpha_menu,'opening/closing content overflow and editing bookmark UI do not move camera or reheat physics')
                evaluate('panel.scrollTop=0')
            pick([]);check(evaluate('contentInspector.content().attachments.length===7 && contentInspector.jobs.size===0'),'canceled/empty file selection makes no content or storage change')
            wait_for("document.querySelector('#content-attachments img')?.naturalWidth>0")
            check(evaluate("document.querySelector('#content-attachments img').naturalWidth<=240 && [...document.querySelectorAll('#content-attachments pre')].every(p=>p.textContent.length<=2048) && !window.fileXss"),'small image thumbnails and bounded plain-text previews render safely')
            check(evaluate(f"(async()=>{{const r=await attachmentStore.get({json.dumps(image['storageKey'])}),b=await createImageBitmap(r.thumbnail);const ok=r.blob.size==={image['size']}&&b.width===240&&b.height===120;b.close();return ok;}})()"),'IndexedDB retains original bytes plus an aspect-preserving bounded thumbnail')
            check(evaluate("panelName.getBoundingClientRect().height>0 && panelName.closest('.panel-content').clientHeight>0"),'many attachments do not collapse the existing entry name/description area')
            check(evaluate(f"(async()=>{{const r=await attachmentStore.get({json.dumps(files[1]['storageKey'])}),original=new Uint8Array(await r.blob.arrayBuffer()),exif=new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);const prepared=await galaxyAttachmentFiles.prepare(new File([original.slice(0,2),exif,original.slice(2)],'portrait.jpg',{{type:'image/jpeg'}}),contentInspector.entryId),b=await createImageBitmap(prepared.record.thumbnail);const ok=prepared.metadata.width===320&&prepared.metadata.height===640&&b.width===120&&b.height===240;b.close();return ok;}})()"),'JPEG orientation is preserved while generating bounded portrait thumbnails')
            check(evaluate("(()=>{const data=JSON.parse(localStorage.getItem('galaxy:user-data'));return data.version===5 && !JSON.stringify(data).includes('blob:') && !JSON.stringify(data).includes('data:image') && data.entries.find(e=>e.id===contentInspector.entryId).content.attachments.every(a=>!('blob' in a)&&a.storageKey);})()"),'localStorage contains metadata/references only and stays at schema 5')
            preview('rich-content-desktop')
            stable(before,'file uploads and previews preserve camera state')
            pick(['unsupported.zip']);check(evaluate("contentInspector.status.textContent.includes('Unsupported') && contentInspector.content().attachments.length===7"),'unsupported files fail without creating metadata')
            pick(['large.txt']);check(evaluate("contentInspector.status.textContent.includes('too large') && contentInspector.content().attachments.length===7"),'oversized files fail before binary storage')
            evaluate("window.originalBinarySave=attachmentStore.save;attachmentStore.save=async()=>{throw new DOMException('Full','QuotaExceededError')}")
            pick(['plan.pdf']);check(evaluate("contentInspector.status.textContent.includes('full') && contentInspector.content().attachments.length===7"),'binary quota failure preserves entry content')
            evaluate("attachmentStore.save=originalBinarySave;window.originalMetadataSave=galaxyStorage.save;attachmentStore.save=function(r,...args){window.failedKey=r.key;return originalBinarySave.call(this,r,...args)};galaxyStorage.save=()=>{throw new DOMException('Full','QuotaExceededError')}")
            pick(['plan.pdf'])
            check(evaluate("(async()=>contentInspector.content().attachments.length===7 && await attachmentStore.get(failedKey)===null)()"),'metadata failure aborts the real IndexedDB upload without leaving an orphan blob')
            evaluate('galaxyStorage.save=originalMetadataSave;attachmentStore.save=originalBinarySave')
            # Actual new-tab file opening, then return to the original page.
            evaluate(f"document.querySelector('[data-attachment-id=\"{pdf_meta['id']}\"] button').scrollIntoView({{block:'center'}})")
            old_targets={t['targetId'] for t in cdp.call('Target.getTargets')['targetInfos']}
            click_selector(f'[data-attachment-id="{pdf_meta["id"]}"] button')
            wait_for("!contentInspector.status.textContent.includes('unavailable')")
            targets=[]
            for _ in range(30):
                targets=[t for t in cdp.call('Target.getTargets')['targetInfos'] if t['targetId'] not in old_targets and t['url'].startswith('blob:')]
                if targets:break
                time.sleep(.1)
            check(bool(targets),'PDF Open launches a native browser blob preview in a new tab')
            for target in targets:cdp.call('Target.closeTarget',targetId=target['targetId'])
            cdp.call('Page.bringToFront');evaluate('physics.pause()');stable(before,'opening a file does not pan or zoom the Cosmos')
            cdp.call('Page.reload');load();wait_camera();inspect(owner)
            evaluate('window.originalMetadataSave=galaxyStorage.save;window.originalBinarySave=attachmentStore.save')
            check(evaluate(f"contentInspector.content().notes.text==={json.dumps(note)} && contentInspector.content().links[0].id==={json.dumps(link_id)} && contentInspector.content().attachments.length===7"),'notes, edited links and attachment references survive refresh')
            check(evaluate(f"(async()=>{{const r=await attachmentStore.get({json.dumps(pdf_meta['storageKey'])});return r.blob.type==='application/pdf' && (await r.blob.slice(0,5).text())==='%PDF-';}})()"),'attachment file bytes survive refresh and remain available to open')
            entry_content=evaluate('JSON.stringify(contentInspector.content())')
            evaluate(f"openEntryForm(entries.get({json.dumps(owner)}));fields[0].value='Renamed content owner';form.requestSubmit();physics.pause()")
            check(evaluate('JSON.stringify(contentInspector.content())')==entry_content,'entry rename preserves all rich content and attachment IDs')
            evaluate(f"openEntryForm(entries.get({json.dumps(child)}));parentField.value={json.dumps(other)};form.requestSubmit();physics.pause()")
            inspect(owner);check(evaluate('JSON.stringify(contentInspector.content())')==entry_content,'hierarchy mutations elsewhere leave canonical content unchanged')
            # Attach and reparent the same entry to exercise entry-owned bytes.
            inspect(child);pick(['plan.pdf']);child_file=evaluate('contentInspector.content().attachments[0]')
            evaluate(f"openEntryForm(entries.get({json.dumps(child)}));parentField.value={json.dumps(owner)};form.requestSubmit();physics.pause()")
            check(evaluate(f"entries.get({json.dumps(child)}).content.attachments[0].id==={json.dumps(child_file['id'])}"),'reparenting the attached entry preserves ownership and IDs')
            inspect(other);pick(['plan.pdf']);other_file=evaluate('contentInspector.content().attachments[0]')
            drop_before=evaluate('JSON.stringify(camera.view)')
            evaluate("window.dropFiles=new DataTransfer();dropFiles.items.add(new File(['Scoped drop notes'],'dropped.txt',{type:'text/plain'}));graphViewport.dispatchEvent(new DragEvent('drop',{dataTransfer:dropFiles,bubbles:true,cancelable:true}))")
            check(evaluate('contentInspector.content().attachments.length===1'),'the Cosmos canvas is not an attachment drop target')
            evaluate("contentInspector.root.dispatchEvent(new DragEvent('drop',{dataTransfer:dropFiles,bubbles:true,cancelable:true}));hierarchySidebar.tree.dispatchEvent(new DragEvent('drop',{dataTransfer:dropFiles,bubbles:true,cancelable:true}))")
            check(evaluate("contentInspector.content().attachments.length===1 && !document.getElementById('content-drop')"),'content panel and sidebar do not accept file drag/drop')
            stable(drop_before,'ignored file drop does not move the camera')
            inspect(owner)
            evaluate("contentInspector.notes.value='';document.getElementById('content-notes-form').requestSubmit()")
            cdp.call('Page.reload');load();wait_camera();inspect(owner)
            evaluate('window.originalMetadataSave=galaxyStorage.save;window.originalBinarySave=attachmentStore.save')
            check(evaluate("contentInspector.content().notes.text==='' && contentInspector.content().attachments.length===7"),'cleared notes survive refresh while file references remain intact')
            # Explicit two-click removal, including a metadata failure rollback.
            evaluate(f"document.querySelector('[data-attachment-id=\"{image['id']}\"] .content-row-actions').lastElementChild.click()")
            check(evaluate('contentInspector.content().attachments.length===7'),'first Remove click requests explicit attachment confirmation')
            evaluate("galaxyStorage.save=()=>{throw new DOMException('Full','QuotaExceededError')}")
            evaluate(f"document.querySelector('[data-attachment-id=\"{image['id']}\"] .content-row-actions').lastElementChild.click()");wait_for('contentInspector.jobs.size===0')
            check(evaluate(f"(async()=>contentInspector.content().attachments.length===7 && !!await attachmentStore.get({json.dumps(image['storageKey'])}))()"),'failed removal preserves both metadata and original blob')
            evaluate('galaxyStorage.save=originalMetadataSave')
            evaluate(f"const removeImage=()=>document.querySelector('[data-attachment-id=\"{image['id']}\"] .content-row-actions').lastElementChild.click();removeImage();removeImage()");wait_for('contentInspector.jobs.size===0')
            check(evaluate(f"(async()=>contentInspector.content().attachments.length===6 && await attachmentStore.get({json.dumps(image['storageKey'])})===null)()"),'confirmed attachment removal deletes its IndexedDB bytes')
            evaluate("window.originalDeleteEntries=attachmentStore.deleteEntries;attachmentStore.deleteEntries=async()=>{throw new Error('File storage failed')}")
            evaluate(f"requestEntryDelete({json.dumps(owner)});document.getElementById('delete-entry-form').requestSubmit()");wait_for('!deletionBusy')
            check(evaluate(f"entries.has({json.dumps(owner)}) && deleteDialog.open && document.getElementById('delete-entry-message').textContent.includes('unchanged')"),'file cleanup failure leaves a subtree intact and reports the error')
            evaluate('deleteDialog.close();attachmentStore.deleteEntries=originalDeleteEntries;galaxyStorage.save=()=>{throw new DOMException("Full","QuotaExceededError")}')
            evaluate(f"requestEntryDelete({json.dumps(owner)});document.getElementById('delete-entry-form').requestSubmit()");wait_for('!deletionBusy')
            check(evaluate(f"(async()=>entries.has({json.dumps(owner)}) && !!await attachmentStore.get({json.dumps(pdf_meta['storageKey'])}) && !!await attachmentStore.get({json.dumps(child_file['storageKey'])}))()"),'metadata failure rolls back IndexedDB subtree cleanup for every descendant')
            evaluate('deleteDialog.close();galaxyStorage.save=originalMetadataSave')
            before=evaluate('JSON.stringify(camera.view)')
            evaluate(f"requestEntryDelete({json.dumps(owner)});document.getElementById('delete-entry-form').requestSubmit()");wait_for('!deleteDialog.open');evaluate('physics.pause()')
            check(evaluate(f"(async()=>!entries.has({json.dumps(owner)}) && !entries.has({json.dumps(child)}) && await attachmentStore.get({json.dumps(pdf_meta['storageKey'])})===null && await attachmentStore.get({json.dumps(child_file['storageKey'])})===null && !!await attachmentStore.get({json.dumps(other_file['storageKey'])}))()"),'subtree deletion removes all owned binaries while preserving unrelated attachments')
            stable(before,'attachment-aware subtree deletion preserves camera state')
            # A selection change during upload cannot change the file owner.
            one=add('Async upload owner');two=add('Async other entry');inspect(one)
            evaluate(f"attachmentStore.save=async function(r,...args){{window.uploadKey=r.key;await new Promise(resolve=>window.resumeUpload=resolve);return originalBinarySave.call(this,r,...args)}};contentInspector.upload([new File([atob({json.dumps(base64.b64encode(pdf).decode())})],'waiting.pdf',{{type:'application/pdf'}})]);void 0")
            wait_for('typeof resumeUpload===\'function\'');inspect(two);evaluate('resumeUpload()');wait_for('contentInspector.jobs.size===0');evaluate('attachmentStore.save=originalBinarySave')
            check(evaluate(f"entries.get({json.dumps(one)}).content.attachments.length===1 && !entries.get({json.dumps(two)}).content"),'an in-flight upload remains owned by the entry selected when it started')
            inspect(one);key=evaluate('contentInspector.content().attachments[0].storageKey')
            evaluate(f"requestEntryDelete({json.dumps(one)});document.getElementById('delete-entry-form').requestSubmit()");wait_for('!deleteDialog.open')
            check(evaluate(f"(async()=>await attachmentStore.get({json.dumps(key)})===null)()"),'single-entry deletion also removes its attachment store records')
            evaluate(f"attachmentStore.save({{key:'unreferenced-file',entryId:{json.dumps(two)},blob:new Blob(['Unreferenced'])}})")
            evaluate(f"requestEntryDelete({json.dumps(two)});document.getElementById('delete-entry-form').requestSubmit()");wait_for('!deleteDialog.open')
            check(evaluate("(async()=>await attachmentStore.get('unreferenced-file')===null)()"),'deletion cleans entry-owned binary records even if metadata no longer references them')
            racing=add('Upload deletion race');inspect(racing)
            evaluate("attachmentStore.save=async function(r,...args){window.raceKey=r.key;await new Promise(resolve=>window.resumeRace=resolve);return originalBinarySave.call(this,r,...args)};contentInspector.upload([new File(['Race notes'],'race.txt',{type:'text/plain'})]);void 0")
            wait_for("typeof resumeRace==='function'")
            evaluate(f"requestEntryDelete({json.dumps(racing)});document.getElementById('delete-entry-form').requestSubmit()");wait_for('!deleteDialog.open')
            evaluate('resumeRace()');wait_for('contentInspector.jobs.size===0');evaluate('attachmentStore.save=originalBinarySave')
            check(evaluate("(async()=>await attachmentStore.get(raceKey)===null)()"),'deleting an entry during upload cannot create late orphaned file bytes or metadata')
            # Let queued dialog-close/resume events and the final real-data
            # position save complete before taking the Sample isolation baseline.
            evaluate('physics.resume()');wait_for('physics.settled')
            evaluate('physics.pause();if(graphNeedsSave)saveGalaxy()');raw=evaluate("localStorage.getItem('galaxy:user-data')")
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode");load();wait_camera()
            check(evaluate('contentInspector.previewLoads===0 && attachmentStore.temporary'),'large Sample starts without preloading any attachment previews and uses a temporary store')
            inspect('sample-satellite-2-0-0-0');wait_for("document.querySelector('#content-attachments pre')?.textContent.includes('Parmigiana')")
            check(evaluate("contentInspector.content().notes.text.includes('Prep ahead') && contentInspector.content().links.length===1"),'Sample shows realistic notes/link and a lightweight text attachment')
            preview('rich-content-sample')
            cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=False);time.sleep(.2)
            inspect('sample-satellite-2-0-0-0');evaluate('panel.scrollTop=0');preview('rich-content-mobile')
            check(evaluate('document.documentElement.scrollWidth<=innerWidth && !panel.hidden'),'Content fits the existing mobile inspector without page overflow')
            if options.organizer_only or options.workspace_only:
                evaluate('panel.scrollTop=panel.scrollHeight')
                check(evaluate("[panelName,moreButton,document.getElementById('close-inspector-button')].every(e=>{const r=e.getBoundingClientRect(),p=panel.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom&&r.width>0})"),'mobile Content header remains reachable while scrolling files')
                if options.workspace_only:
                    touch_before=evaluate('JSON.stringify(camera.view)')
                    check(evaluate("getComputedStyle(document.querySelector('#content-links summary')).opacity==='1' && getComputedStyle(document.getElementById('content-edit-notes')).opacity==='1' && document.getElementById('content-edit-notes').getBoundingClientRect().width>=44"),'mobile edit and overflow affordances stay discoverable with comfortable touch targets')
                    point=evaluate("(()=>{const r=document.querySelector('#content-links summary').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
                    cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
                    wait_for("document.querySelector('#content-links details').open")
                    check_rendered("(()=>{const r=document.querySelector('#content-links .content-row-actions').getBoundingClientRect(),p=panel.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom})()",'touch opens bookmark management inside the bottom sheet, including near its lower edge')
                    evaluate("document.querySelector('#content-links .content-row-actions button').click()")
                    check(evaluate('!contentInspector.linkForm.hidden'),'mobile bookmark editing uses the existing temporary form')
                    evaluate('document.getElementById("content-cancel-link").click()')
                    check(evaluate('JSON.stringify(camera.view)')==touch_before,'mobile bookmark management preserves camera state')
                evaluate('hierarchySidebar.setCollapsed(false)');wait_camera();evaluate('physics.pause()')
                mobile_view=evaluate('JSON.stringify(camera.view)')
                click_selector('.hierarchy-row.is-selected .tree-add');click_selector('#add-menu [data-add=note]')
                check(evaluate('hierarchySidebar.collapsed && !panel.hidden && !contentInspector.notesForm.hidden'),'mobile + switches from hierarchy drawer to on-demand Notes editor')
                check(evaluate('JSON.stringify(camera.view)')==mobile_view,'mobile contextual content creation preserves camera while switching drawers')
                evaluate('document.getElementById("content-cancel-notes").click()')
                cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
                check(evaluate('panel.hidden'),'mobile Escape closes the Content sheet')
                mobile_view=evaluate('JSON.stringify(camera.view)');evaluate('setInspectorOpen(true)')
                check(evaluate('JSON.stringify(camera.view)')==mobile_view,'mobile Content sheet reopening does not pan or zoom')
            evaluate("requestEntryDelete('sample-satellite-2-0-0-0');document.getElementById('delete-entry-form').requestSubmit()");wait_for('!deleteDialog.open')
            check(evaluate("(async()=>await attachmentStore.get('sample-recipe-file')===null)()"),'temporary Sample deletion removes its in-memory file')
            check(evaluate("localStorage.getItem('galaxy:user-data')")==raw,'temporary Sample file deletion leaves real metadata intact: '+str(evaluate("({sample:sampleMode,temporary:attachmentStore.temporary,remaining:entries.has('sample-satellite-2-0-0-0')})")))
            check(evaluate(f"(async()=>!!await createGalaxyAttachmentStore().get({json.dumps(other_file['storageKey'])}))()"),'real attachment bytes also remain intact after temporary Sample actions')
            check(not cdp.errors,f'no Rich Content browser exceptions: {cdp.errors}')
            print(f'{count} Rich Content browser checks passed',flush=True)
            return

        if options.crud_only:
            ids=[add('CRUD Galaxy')]
            for depth in range(1,7):
                parent=ids[-1]
                evaluate(f"createChildEntry({json.dumps(parent)});fields[0].value={json.dumps('CRUD depth '+str(depth))};fields[1].value='';fields[2].value='';form.requestSubmit()")
                check(evaluate(f"!dialog.open && entries.get(selectedNode.dataset.entryId).description==='' && entries.get(selectedNode.dataset.entryId).depth==={depth}"),f'name-only creation persists at depth {depth}')
                ids.append(evaluate('selectedNode.dataset.entryId'))
            evaluate(f"openEntryForm(entries.get({json.dumps(ids[0])}));fields[1].value='';form.requestSubmit()")
            check(evaluate(f"entries.get({json.dumps(ids[0])}).description===''") ,'Galaxy description can also be empty')
            wait_for('physics.settled');evaluate('physics.pause()')
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate(f"{json.dumps(ids)}.every(id=>entries.get(id)?.description==='') && storageAvailable"),'every role and deeper Astronaut reload with empty Description')
            parent=ids[1]
            def equal_view(a,b):
                return all(abs(a[k]-b[k])<1e-8 for k in ['x','y','scale'])
            for scale in [.2,.55,1.2]:
                for collapsed in [False,True]:
                    for inspector in [False,True]:
                        evaluate(f"physics.pause();hierarchySidebar.setCollapsed({str(collapsed).lower()});selectEntry(entries.get({json.dumps(parent)}),nodes.get({json.dumps(parent)}),{{openInspector:{str(inspector).lower()},reframe:false}});setInspectorOpen({str(inspector).lower()},{{reframe:false}});updateGraphViewport();camera.setView({{x:(physics.bounds.left+physics.bounds.right)/2-entries.get({json.dumps(parent)}).x*{scale},y:(physics.bounds.top+physics.bounds.bottom)/2-entries.get({json.dumps(parent)}).y*{scale},scale:{scale}}},false);autoFitPending=true")
                        before=evaluate('({...camera.view})')
                        state=evaluate(f"(()=>{{const positions=[...physics.particles].map(([id,n])=>[id,n.x,n.y]);createChildEntry({json.dumps(parent)});fields[0].value='Camera child';fields[1].value='';form.requestSubmit();physics.pause();return {{view:{{...camera.view}},id:selectedNode.dataset.entryId,preserved:positions.every(([id,x,y])=>physics.particles.get(id).x===x&&physics.particles.get(id).y===y),pending:autoFitPending}};}})()")
                        child=state['id'];label=f'{round(scale*100)}% sidebar '+('closed' if collapsed else 'open')+' inspector '+('open' if inspector else 'closed')
                        check(equal_view(before,state['view']) and state['preserved'] and not state['pending'],'Add preserves view/unrelated world positions: '+label)
                        evaluate(f"setInspectorOpen({str(inspector).lower()},{{reframe:false}})")
                        edited=evaluate(f"(()=>{{const alpha=physics.simulation.alpha(),positions=[...physics.particles].map(([id,n])=>[id,n.x,n.y]);openEntryForm(entries.get({json.dumps(child)}));fields[0].value='Renamed child';fields[1].value='Description to remove';fields[2].value='Label';form.requestSubmit();physics.pause();return {{view:{{...camera.view}},quiet:physics.simulation.alpha()===alpha,inspector:!panel.hidden,preserved:positions.every(([id,x,y])=>physics.particles.get(id).x===x&&physics.particles.get(id).y===y)}};}})()")
                        check(equal_view(before,edited['view']) and edited['quiet'] and edited['preserved'] and edited['inspector']==inspector,'Edit preserves view/positions/inspector and adds no physics heat: '+label)
                        evaluate(f"openEntryForm(entries.get({json.dumps(child)}));fields[1].value='';form.requestSubmit();physics.pause()")
                        check(evaluate(f"entries.get({json.dumps(child)}).description===''") ,'Edit clears Description: '+label)
                        deleted=evaluate(f"(()=>{{requestEntryDelete({json.dumps(child)});document.getElementById('delete-entry-form').requestSubmit();physics.pause();return {{view:{{...camera.view}},parent:selectedNode?.dataset.entryId,inspector:!panel.hidden,focusVisible:document.activeElement.getBoundingClientRect().width>0,valid:!entries.has({json.dumps(child)})&&!nodes.has({json.dumps(child)})&&!physics.particles.has({json.dumps(child)})}};}})()")
                        check(equal_view(before,deleted['view']) and deleted['parent']==parent and deleted['valid'] and deleted['inspector']==inspector and deleted['focusVisible'],'Delete preserves view/inspector and selects surviving parent with usable focus: '+label)
                        evaluate('physics.onSettle()')
                        check(equal_view(before,evaluate('({...camera.view})')),'settling after CRUD cannot trigger deferred Fit: '+label)
            # Truly offscreen creation gets the nearest-edge pan, never a Fit or zoom.
            evaluate(f"physics.pause();camera.setView({{x:-100000,y:-100000,scale:.55}},false);createChildEntry({json.dumps(parent)});fields[0].value='Offscreen child';form.requestSubmit();physics.pause()")
            offscreen=evaluate('selectedNode.dataset.entryId')
            check(evaluate("camera.view.scale===.55 && camera.frame===null && (()=>{const r=selectedNode.getBoundingClientRect();return r.right>=physics.bounds.left&&r.left<=physics.bounds.right&&r.bottom>=physics.bounds.top&&r.top<=physics.bounds.bottom;})()"),'offscreen Add uses a same-scale minimal pan into usable space')
            evaluate(f"requestEntryDelete({json.dumps(offscreen)});document.getElementById('delete-entry-form').requestSubmit();physics.pause()")
            # Storage must see the complete mutation before the new row appears.
            evaluate(f"window.saveOriginal=galaxyStorage.save;window.saveOrdering=[];galaxyStorage.save=function(snapshot){{saveOrdering.push({{model:snapshot.entries.some(e=>e.name==='Ordered child'),tree:[...hierarchySidebar.rows.values()].some(r=>r.querySelector('.tree-name').textContent==='Ordered child')}});return saveOriginal.call(this,snapshot);}};createChildEntry({json.dumps(parent)});fields[0].value='Ordered child';form.requestSubmit();physics.pause();galaxyStorage.save=saveOriginal")
            ordered=evaluate('selectedNode.dataset.entryId')
            check(evaluate('saveOrdering.some(s=>s.model&&!s.tree)') and evaluate(f"hierarchySidebar.rows.has({json.dumps(ordered)}) && entries.has({json.dumps(ordered)})"),'mutation saves complete model before publishing the new sidebar row')
            evaluate(f"requestEntryDelete({json.dumps(ordered)});document.getElementById('delete-entry-form').requestSubmit();physics.pause()")

            outside=add('Outside system',ids[0]);remote=add('Outside Galaxy')
            for i in range(2):add('Branch sibling '+str(i),ids[2])
            wait_for('physics.settled');evaluate('physics.pause()')
            branch=ids[2];deep=ids[6]
            evaluate(f"openEntryForm(entries.get({json.dumps(deep)}));parentField.value={json.dumps(ids[4])};form.requestSubmit();physics.pause()")
            evaluate(f"openEntryForm(entries.get({json.dumps(deep)}));parentField.value={json.dumps(ids[5])};form.requestSubmit();physics.pause()")
            evaluate(f"focusEntry({json.dumps(deep)})");wait_camera();wait_for('physics.settled');evaluate('physics.pause();saveGalaxy()')
            evaluate("hierarchySidebar.setCollapsed(false);hierarchySidebar.tree.style.maxHeight='180px';hierarchySidebar.tree.scrollTop=120")
            subtree_count=evaluate(f"galaxyModel.subtreeIds(entries,{json.dumps(branch)}).size")
            raw=evaluate("localStorage.getItem('galaxy:user-data')");model_before=evaluate('JSON.stringify(getGalaxySnapshot())')
            expanded=evaluate('[...hierarchySidebar.expanded]');scroll=evaluate('hierarchySidebar.tree.scrollTop');before=evaluate('({...camera.view})')
            evaluate(f"requestEntryDelete({json.dumps(branch)})")
            check(evaluate(f"deleteDialog.open && document.getElementById('delete-entry-title').textContent.includes('child entries') && document.getElementById('delete-entry-message').textContent.includes('{subtree_count} entries and their content') && document.getElementById('confirm-delete-entry').textContent==='Delete {subtree_count} entries'"),'parent confirmation names the entire subtree, content and exact destructive count')
            if screenshot_dir:
                result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/'crud-subtree-confirmation.png').write_bytes(base64.b64decode(result['data']))
            click_selector('#cancel-delete-entry');evaluate('physics.pause()')
            check(evaluate('JSON.stringify(getGalaxySnapshot())')==model_before and evaluate("localStorage.getItem('galaxy:user-data')")==raw and equal_view(before,evaluate('({...camera.view})')),'Cancel leaves model, storage and camera untouched')
            check(evaluate('[...hierarchySidebar.expanded]')==expanded and evaluate('hierarchySidebar.tree.scrollTop')==scroll,'Cancel preserves sidebar expansion and scroll')
            deleted_ids=evaluate(f"[...galaxyModel.subtreeIds(entries,{json.dumps(branch)})]")
            result=evaluate(f"(()=>{{const positions=[...physics.particles].filter(([id])=>!{json.dumps(deleted_ids)}.includes(id)).map(([id,n])=>[id,n.x,n.y]);requestEntryDelete({json.dumps(branch)});document.getElementById('delete-entry-form').requestSubmit();physics.pause();return {{view:{{...camera.view}},positions:positions.every(([id,x,y])=>physics.particles.get(id).x===x&&physics.particles.get(id).y===y)}};}})()")
            check(equal_view(before,result['view']) and result['positions'],'subtree deletion preserves camera and surviving world coordinates')
            check(evaluate(f"{json.dumps(deleted_ids)}.every(id=>!entries.has(id)&&!nodes.has(id)&&!layout.has(id)&&!physics.particles.has(id)&&!hierarchySidebar.rows.has(id))"),'one confirmation removes the entire deep branch from every derived index')
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(parent)} && hierarchySidebar.selectedId==={json.dumps(parent)} && panelName.textContent===entries.get({json.dumps(parent)}).name && !panelAncestry.textContent.includes('CRUD depth 6')"),'deleted selection recovers to its surviving ancestor without stale inspector data')
            check(evaluate(f"{json.dumps(expanded)}.filter(id=>!{json.dumps(deleted_ids)}.includes(id)).every(id=>hierarchySidebar.expanded.has(id)) && Math.abs(hierarchySidebar.tree.scrollTop-Math.min({scroll},hierarchySidebar.tree.scrollHeight-hierarchySidebar.tree.clientHeight))<1"),'unaffected branch expansion and practical scroll position survive deletion')
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate(f"{json.dumps(deleted_ids)}.every(id=>!entries.has(id)) && entries.has({json.dumps(outside)}) && entries.has({json.dumps(remote)})"),'refresh persists subtree removal and unrelated hierarchy')
            # A new member added after confirmation cannot be silently included.
            evaluate(f"requestEntryDelete({json.dumps(ids[0])});window.confirmedSize=deleteConfirmationIds.size;const late={{id:'late-child',name:'Late child',description:'',category:'',parentId:{json.dumps(parent)},x:400,y:350}};entries.set(late.id,late);document.getElementById('delete-entry-form').requestSubmit()")
            check(evaluate(f"deleteDialog.open && entries.has({json.dumps(ids[0])}) && deleteConfirmationIds.size===confirmedSize+1"),'changed subtree impact is refreshed and requires another explicit confirmation')
            evaluate(f"window.deleteName=entries.get({json.dumps(ids[0])}).name;entries.get({json.dumps(ids[0])}).name='X'.repeat(60);showDeleteConfirmation(entries.get({json.dumps(ids[0])}),deleteConfirmationIds)")
            check(evaluate("(()=>{const h=document.getElementById('delete-entry-title');return h.scrollWidth<=h.clientWidth && document.documentElement.scrollWidth<=innerWidth;})()"),'maximum-length unbroken names keep destructive confirmation readable inside the dialog')
            evaluate(f"entries.get({json.dumps(ids[0])}).name=deleteName")
            evaluate('deleteDialog.close();entries.delete("late-child")')
            evaluate("requestEntryDelete('migration-my-galaxy')")
            check(evaluate("deleteDialog.open && deleteConfirmationIds.has('github') && deleteConfirmationIds.has('vs-code') && deleteConfirmationIds.has('codex')"),'migrated starter branches use ordinary subtree confirmation')
            evaluate('deleteDialog.close()')
            evaluate(f"focusEntry({json.dumps(remote)})");wait_camera();before=evaluate('({...camera.view})')
            evaluate(f"requestEntryDelete({json.dumps(remote)});document.getElementById('delete-entry-form').requestSubmit();physics.pause()")
            check(equal_view(before,evaluate('({...camera.view})')) and evaluate("selectedNode===null && panel.hidden && panelAncestry.children.length===0"),'root deletion clears selection/inspector safely without reframing')
            evaluate(f"focusEntry({json.dumps(parent)})");wait_camera();selected=evaluate('selectedNode.dataset.entryId')
            evaluate(f"requestEntryDelete({json.dumps(outside)});document.getElementById('delete-entry-form').requestSubmit();physics.pause()")
            check(evaluate('selectedNode.dataset.entryId')==selected,'deleting an unselected item retains the current selection')
            evaluate('resetViewButton = document.getElementById("reset-view-button");resetViewButton.click()');wait_camera()
            check(evaluate('camera.view.scale>0 && camera.frame===null'),'explicit Fit remains available after CRUD')
            evaluate('physics.pause();if(graphNeedsSave)saveGalaxy()')
            raw=evaluate("localStorage.getItem('galaxy:user-data')")
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode");load();wait_camera()
            evaluate("requestEntryDelete('sample-planet-0-0');document.getElementById('delete-entry-form').requestSubmit()")
            check(evaluate("sampleMode && !entries.has('sample-planet-0-0')") and evaluate("localStorage.getItem('galaxy:user-data')")==raw,'temporary Sample subtree deletion never changes real saved data')
            check(not cdp.errors,f'no CRUD browser exceptions: {cdp.errors}')
            print(f'{count} CRUD browser checks passed',flush=True)
            return

        if options.astronaut_only:
            ids=[add('EVA Galaxy')];wait_camera()
            for depth in range(1,9):
                parent=ids[-1];role=['Galaxy','Sun','Planet','Moon','Satellite','Astronaut'][min(depth,5)]
                evaluate(f"focusEntry({json.dumps(parent)})");wait_camera()
                if depth%3==0:
                    click_selector('.hierarchy-row.is-selected .tree-add');click_selector('#add-child-button')
                elif depth%3==1:
                    click_selector('.hierarchy-row.is-selected .tree-add')
                    click_selector('#add-child-button')
                else:
                    click_selector(f'.entry-node[data-entry-id="{parent}"]',button='right')
                    check(evaluate(f"contextMenu.querySelector('[data-action=create]').textContent==='Add {role}'"),'context menu derives Add '+role)
                    click_selector('#entry-context-menu [data-action=create]')
                check(evaluate(f"dialog.open && document.getElementById('add-entry-title').textContent==='Add {role}' && contextualParentId==={json.dumps(parent)} && roleField.tagName==='OUTPUT' && !fields[1].required"),f'depth {depth} contextual Add {role} keeps parent and optional Description')
                evaluate(f"fields[0].value={json.dumps('EVA '+role+' '+str(depth))};fields[1].value='';form.requestSubmit()")
                check(evaluate(f"!dialog.open && entries.get(selectedNode.dataset.entryId).role==={json.dumps(role.lower())} && entries.get(selectedNode.dataset.entryId).depth==={depth}"),f'depth {depth} creates the correct visual role without limiting nesting')
                ids.append(evaluate('selectedNode.dataset.entryId'));wait_camera()
            for i in range(3):
                evaluate(f"createChildEntry({json.dumps(ids[5])});fields[0].value={json.dumps('EVA sibling '+str(i+1))};form.requestSubmit()")
                wait_camera()
            wait_for('physics.settled');evaluate('physics.pause()')
            deep=ids[8]
            evaluate(f"focusEntry({json.dumps(deep)})");wait_camera()
            check(evaluate(f"hierarchySidebar.selectedId==={json.dumps(deep)} && hierarchySidebar.rows.get({json.dumps(deep)}).dataset.role==='astronaut' && galaxyModel.ancestors(entries,{json.dumps(deep)}).every(e=>hierarchySidebar.expanded.has(e.id))"),'deep Astronaut selection and indicator synchronize with the expanded sidebar')
            check(evaluate("[...entries.values()].filter(e=>e.role==='astronaut').every(e=>nodes.get(e.id).querySelector('.astronaut-figure') && !nodes.get(e.id).querySelector('.satellite-craft') && !nodes.get(e.id).textureSize)"),'Astronauts use lightweight distinct SVG figures without textures')
            check(evaluate(f"getNodeRadius(entries.get({json.dumps(ids[5])}))<getNodeRadius(entries.get({json.dumps(ids[4])})) && getNodeRadius(entries.get({json.dumps(ids[4])}))<getNodeRadius(entries.get({json.dumps(ids[3])}))"),'Astronaut bodies remain smaller than Satellites and Moons')
            check(evaluate("(()=>{const siblings=galaxyModel.childrenOf(entries,"+json.dumps(ids[5])+").map(e=>physics.particles.get(e.id));return siblings.every((a,i)=>siblings.slice(i+1).every(b=>Math.hypot(a.x-b.x,a.y-b.y)>a.radius+b.radius+8));})()"),'Astronaut siblings keep local collision clearance')
            check(evaluate("[...physics.particles.values()].filter(n=>n.role==='astronaut').every(n=>n.childOrbit===0 && Math.hypot(n.x-n.clusterAnchor.x,n.y-n.clusterAnchor.y)<n.clusterAnchor.clusterRadius+30)"),'deep chains remain compact and add no orbit bands')
            def tethers_aligned():
                return evaluate("""lines.filter(l=>l.element.classList.contains('astronaut-tether')).every(l=>{const e=l.element,m=e.getScreenCTM(),a=e.getPointAtLength(0),z=e.getPointAtLength(e.getTotalLength());return [[l.from,a],[l.to,z]].every(([id,p])=>{const projected=new DOMPoint(p.x,p.y).matrixTransform(m),entry=entries.get(id),actual=camera.worldToScreen(entry.x,entry.y);return Math.hypot(projected.x-actual.x,projected.y-actual.y)<.7;});})""")
            def preview(name):
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                    (screenshot_dir/(name+'.png')).write_bytes(base64.b64decode(result['data']))
            preview('astronaut-deep-cluster')
            evaluate(f"(()=>{{const p=physics.particles.get({json.dumps(deep)});physics.beginDrag(p.id);physics.moveDrag(p.id,p.x+25,p.y-10);}})()")
            check(tethers_aligned(),'tethers follow an Astronaut drag using actual live endpoints')
            evaluate(f"physics.endDrag({json.dumps(deep)},true);physics.pause();saveGalaxy();camera.zoomAt(600,400,.9)");wait_camera()
            check(tethers_aligned(),'tethers stay aligned through zoom/pan projection')
            identities=evaluate("[...nodes].filter(([id,n])=>n.dataset.body==='astronaut').map(([id,n])=>[id,n.dataset.archetype,n.querySelector('.astronaut-figure').outerHTML])")
            parents=evaluate('JSON.stringify([...entries.values()].map(e=>[e.id,e.parentId,e.name]))')
            # Simulate a current saved deep Satellite with a role-incompatible
            # historical appearance override. No storage migration is needed.
            evaluate(f"(()=>{{const data=JSON.parse(localStorage.getItem('galaxy:user-data')),e=data.entries.find(e=>e.id==={json.dumps(ids[5])});e.role='satellite';e.appearance={{archetype:'station',future:'preserve'}};localStorage.setItem('galaxy:user-data',JSON.stringify(data));}})()")
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate("[...nodes].filter(([id,n])=>n.dataset.body==='astronaut').map(([id,n])=>[id,n.dataset.archetype,n.querySelector('.astronaut-figure').outerHTML])")==identities,'Astronaut silhouette and deterministic pose survive refresh and old Satellite metadata')
            check(evaluate('JSON.stringify([...entries.values()].map(e=>[e.id,e.parentId,e.name]))')==parents and evaluate(f"entries.get({json.dumps(ids[5])}).appearance.future==='preserve' && storageAvailable && JSON.parse(localStorage.getItem('galaxy:user-data')).version===5"),'existing deep records preserve IDs, parents, content and future appearance metadata without schema migration')
            evaluate(f"focusEntry({json.dumps(deep)});saveGalaxy()");wait_camera()
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            evaluate(f"clearSelection();camera.setView({{...camera.view,scale:.2}},false);searchField.value='EVA Astronaut 8';searchField.dispatchEvent(new Event('input'))")
            check(evaluate(f"nodes.get({json.dumps(deep)}).classList.contains('temporarily-revealed') && lines.some(l=>l.to==={json.dumps(deep)}&&l.element.classList.contains('astronaut-tether')&&+l.element.style.opacity>0)"),'search reveals a deep Astronaut and its tether ancestry at far zoom')
            evaluate('searchResultList.querySelector("button").click()');wait_camera()
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(deep)} && panelName.textContent==='EVA Astronaut 8' && !nodes.get({json.dumps(deep)}).inert && camera.view.scale>=1.7"),'deep search focuses, selects, expands and opens the inspector normally')
            evaluate('fitGalaxy(false)');wait_camera()
            check_rendered("[...nodes.values()].filter(n=>n.dataset.body==='astronaut'&&!n.classList.contains('label-priority')).every(n=>n.inert&&getComputedStyle(n).opacity==='0')&&getComputedStyle(selectedNode.querySelector('.node-label')).opacity==='1'&&lines.filter(l=>l.element.classList.contains('astronaut-tether')).every(l=>getComputedStyle(l.element).display==='none')",'Universe zoom suppresses ordinary Astronaut context while preserving the selected-label exception')
            evaluate(f"focusEntry({json.dumps(deep)})");wait_camera();preview('astronaut-tethers-close')
            raw=evaluate("localStorage.getItem('galaxy:user-data')")
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode");load();wait_camera()
            evaluate("focusEntry('sample-deep-8')");wait_camera()
            check(evaluate("entries.size===187 && [...entries.values()].filter(e=>e.role==='astronaut').length===7 && entries.get('sample-deep-8').depth===8 && galaxyModel.childrenOf(entries,'sample-deep-5').length===4"),'restrained Sample demonstrates deep chains and several Astronaut siblings')
            preview('astronaut-sample-close')
            metrics=motion_metrics();print('Astronaut sample motion: '+json.dumps(metrics),flush=True)
            check(metrics['renderP95']<16,'Astronaut figures and tethers keep projection within the frame budget')
            cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=False);time.sleep(.2)
            evaluate("focusEntry('sample-deep-8')");wait_camera();preview('astronaut-mobile')
            check(evaluate("panelName.textContent==='Texture observations' && !nodes.get('sample-deep-8').inert && lines.some(l=>l.to==='sample-deep-8'&&+l.element.style.opacity>0)"),'mobile deep focus retains the Astronaut, hierarchy tether and inspector')
            check(evaluate("localStorage.getItem('galaxy:user-data')")==raw,'temporary Astronaut Sample interactions preserve real saved data')
            check(not cdp.errors,f'no Astronaut browser exceptions: {cdp.errors}')
            print(f'{count} Astronaut browser checks passed',flush=True)
            return

        if options.cloud_fade_only:
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode");load();wait_camera()
            evaluate('physics.pause()')
            raw=evaluate("localStorage.getItem('galaxy:user-data')")
            def preview(name):
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                    (screenshot_dir/(name+'.png')).write_bytes(base64.b64decode(result['data']))
            def view_at(scale):
                evaluate(f"(()=>{{const e=entries.get('sample-sun-0'),b=physics.bounds;camera.setView({{x:(b.left+b.right)/2-e.x*{scale},y:(b.top+b.bottom)/2-e.y*{scale},scale:{scale}}},false);}})()")
            def opacity():
                return evaluate("parseFloat(getComputedStyle(regions.get('sample-galaxy-0')).opacity)")
            results={}
            for label,width,height in [('desktop',1920,1080),('laptop',1280,800),('narrow',1024,768)]:
                cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=False);time.sleep(.2)
                evaluate("focusEntry('sample-sun-0')");wait_camera()
                check(evaluate('!panel.hidden && !hierarchySidebar.collapsed'),label+' measures canvas beside the sidebar and inspector')
                values=[]
                for scale in [.2,.38,.45,.52,.58,.62,.68,.78]:
                    view_at(scale);values.append(opacity())
                    if scale in [.2,.52,.68]: preview(f'cloud-{label}-{round(scale*100)}')
                results[label]=values
                check(values[0]>.9 and all(b<=a+.00001 for a,b in zip(values,values[1:])),label+' keeps Universe clouds strong and fades monotonically into detail')
                check(values[4]<.15 and values[6]<.005 and values[7]==0,label+' makes clouds faint at system zoom and invisible at close zoom')
                check(evaluate("panelAncestry.textContent.includes('Work') && hierarchySidebar.selectedId==='sample-sun-0' && getComputedStyle(nodes.get('sample-galaxy-0').querySelector('.node-label')).opacity==='1'"),label+' preserves Galaxy identity through breadcrumb/sidebar and independent label opacity')
                view_at(.52);before=opacity();evaluate('camera.panTo(camera.view.x+30,camera.view.y+20)')
                check(abs(opacity()-before)<1e-9,label+' cloud opacity is unaffected by translation/panning')
                evaluate("window.cloudDrawsBefore=[...regions.values()].map(r=>r.cloudDraws)")
                view_at(.38)
                def fade_trace(end):
                    return evaluate(f"""new Promise(resolve=>{{const original=camera.onChange,values=[];camera.onChange=v=>{{original(v);values.push(parseFloat(getComputedStyle(regions.get('sample-galaxy-0')).opacity));}};const b=physics.bounds;camera.zoomAt((b.left+b.right)/2,(b.top+b.bottom)/2,{end}/camera.view.scale);const frame=()=>{{if(camera.frame!==null)requestAnimationFrame(frame);else{{camera.onChange=original;resolve(values);}}}};requestAnimationFrame(frame);}})""")
                inward=fade_trace(.78)
                check(len(inward)>3 and all(b<=a+.00001 for a,b in zip(inward,inward[1:])) and inward[-1]==0,label+' actual camera zoom fades smoothly down to zero')
                outward=fade_trace(.2)
                check(len(outward)>3 and all(b>=a-.00001 for a,b in zip(outward,outward[1:])) and outward[-1]>.9,label+' zooming out restores the cloud smoothly')
                check(evaluate('JSON.stringify(cloudDrawsBefore)===JSON.stringify([...regions.values()].map(r=>r.cloudDraws))'),label+' fading reuses cached nebula pixels')
                view_at(.68)
                check_rendered("parseFloat(getComputedStyle(nodes.get('sample-sun-0')).opacity)>.99 && parseFloat(getComputedStyle(nodes.get('sample-planet-0-0')).opacity)>.99 && parseFloat(getComputedStyle(regions.get('sample-galaxy-0')).opacity)<.005",label+' Suns and Planets dominate with the cloud nearly invisible')
            check(results['laptop'][3]<results['desktop'][3] and results['narrow'][3]<=results['laptop'][3],'less available canvas starts de-emphasizing the same projected cloud earlier')
            if screenshot_dir:
                (screenshot_dir/'cloud-fade-values.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
            check(evaluate("localStorage.getItem('galaxy:user-data')")==raw,'cloud presentation preserves saved real data and Sample isolation')
            check(not cdp.errors,f'no responsive cloud-fade browser exceptions: {cdp.errors}')
            print(f'{count} responsive-cloud browser checks passed',flush=True)
            return





        if options.arrangement_only:
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode");load();wait_camera()
            evaluate('physics.pause();clearSelection()')
            report={'bands':evaluate("({planet:physics.particles.get('sample-sun-0').childOrbit,moon:physics.particles.get('sample-planet-0-0').childOrbit,satellite:physics.particles.get('sample-moon-0-0-0').childOrbit,foodRadius:physics.galaxies.get('sample-galaxy-1').radius})")}
            ids=['sample-sun-0','sample-planet-0-0','sample-moon-0-0-0','sample-satellite-0-0-0-0','sample-planet-0-2']
            evaluate(f"window.sizeIds={json.dumps(ids)};window.sizePositions=[...physics.particles].map(([id,n])=>[id,n.x,n.y]);sizeIds.forEach((id,i)=>{{const n=physics.particles.get(id);n.x=400+i*165;n.y=420;}});[...nodes].forEach(([id,n])=>n.hidden=!sizeIds.includes(id));[...regions.values()].forEach(r=>r.style.visibility='hidden');hierarchyLayer.style.visibility='hidden';physics.onTick(physics.particles);camera.setView({{x:0,y:0,scale:1}},false)")
            wait_for("sizeIds.every(id=>nodes.get(id).dataset.body==='satellite'||nodes.get(id).dataset.textureReady==='true')")
            time.sleep(.2)
            report['sizes']=evaluate("sizeIds.map(id=>{const n=nodes.get(id),s=getComputedStyle(n),p=physics.particles.get(id),r=n.getBoundingClientRect(),craft=n.querySelector('.satellite-craft');return {id,role:p.role,width:r.width,height:r.height,collisionBodyRadius:p.radius,craftWidth:craft?.getBoundingClientRect().width||null,font:parseFloat(getComputedStyle(n.querySelector('.node-label')).fontSize)};})")
            evaluate("selectEntry(entries.get('sample-planet-0-0'),nodes.get('sample-planet-0-0'),{openInspector:false})")
            report['selected']=evaluate("(()=>{const n=selectedNode,s=getComputedStyle(n);return {width:n.getBoundingClientRect().width,outlineWidth:parseFloat(s.outlineWidth),outlineOffset:parseFloat(s.outlineOffset)};})()")
            if screenshot_dir:
                result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                (screenshot_dir/'arrangement-native-100-percent.png').write_bytes(base64.b64decode(result['data']))
            cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=False)
            time.sleep(.2);evaluate('camera.setView({x:0,y:0,scale:1},false)')
            report['mobileSizes']=evaluate("sizeIds.slice(0,4).map(id=>nodes.get(id).getBoundingClientRect().width)")
            cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
            time.sleep(.2);evaluate('camera.setView({x:0,y:0,scale:1},false)')
            if screenshot_dir:
                (screenshot_dir/'arrangement-report.json').write_text(json.dumps(report,indent=2))
            print('Arrangement report: '+json.dumps(report),flush=True)
            if options.capture_baseline:
                return
            # Restore the sample before exercising real pointer drags.
            evaluate("sizePositions.forEach(([id,x,y])=>Object.assign(physics.particles.get(id),{x,y,lastX:x,lastY:y,vx:0,vy:0}));[...nodes.values()].forEach(n=>n.hidden=false);[...regions.values()].forEach(r=>r.style.visibility='');hierarchyLayer.style.visibility='';clearSelection();physics.onTick(physics.particles)")
            sizes={s['role']:s['width'] for s in report['sizes']}
            check(42<=sizes['sun']<=48 and 24<=sizes['planet']<=30 and 15<=sizes['moon']<=20 and 14<=sizes['satellite']<=18,'100% native body diameters meet the visual targets')
            check(sizes['planet']<=38*.7 and sizes['moon']<=25.078125*.7,'Planet and Moon diameters are materially smaller than the captured baseline')
            check(report['selected']['outlineOffset']<=2 and report['selected']['width']==sizes['planet'],'selection halo stays close to the smaller body without changing its dimensions')
            check(all(abs(actual-expected)<.03 for actual,expected in zip(report['mobileSizes'],[42,24,15.6,13.92])),'mobile native diameters retain the same hierarchy with readable body silhouettes')
            if options.sizes_only:
                check(not cdp.errors,f"no sizing browser exceptions: {cdp.errors}")
                print(f'{count} sizing browser checks passed',flush=True)
                return
            report['drags']=[]
            for kind,entry_id in [('Planet','sample-planet-0-0'),('Moon','sample-moon-0-0-0')]:
                for factor in (['extreme'] if options.extremes_only else [1.5,2,'extreme']):
                    # Reset this family to its untouched arrangement for each comparison.
                    evaluate("physics.pause();sizePositions.forEach(([id,x,y])=>Object.assign(physics.particles.get(id),{x,y,lastX:x,lastY:y,vx:0,vy:0,placement:null}));layout.clear();physics.onTick(physics.particles)")
                    evaluate(f"focusEntry({json.dumps(entry_id)})");wait_camera()
                    before=evaluate("(()=>{const n=physics.particles.get(selectedNode.dataset.entryId);return {radius:Math.hypot(n.x-n.parent.x,n.y-n.parent.y),angle:Math.atan2(n.y-n.parent.y,n.x-n.parent.x)+.3,px:n.parent.x,py:n.parent.y,range:physics.orbitalRange(n),band:n.orbitRadius};})()")
                    requested=2000 if factor=='extreme' else before['radius']*factor
                    import math
                    wx=before['px']+math.cos(before['angle'])*requested;wy=before['py']+math.sin(before['angle'])*requested
                    point=evaluate("(()=>{const r=selectedNode.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
                    target=evaluate(f"(()=>{{const e=entries.get({json.dumps(entry_id)});return {{x:{point['x']}+({wx}-e.x)*camera.view.scale,y:{point['y']}+({wy}-e.y)*camera.view.scale}};}})()")
                    mouse('mousePressed',**point,button='left',clickCount=1);mouse('mouseMoved',**target,button='left',buttons=1)
                    mouse('mouseReleased',**target,button='left',clickCount=1)
                    release=evaluate("(()=>{const n=physics.particles.get(selectedNode.dataset.entryId);return {radius:Math.hypot(n.x-n.parent.x,n.y-n.parent.y),preferred:n.placement.radius,angle:n.placement.angle,fx:n.fx};})()")
                    check(abs(release['radius']-requested)<max(2,requested*.02) and release['fx'] is None,kind+' release preserves the chosen coordinates without snapping')
                    evaluate('physics.resume()');wait_for('physics.settled',timeout=60);wait_camera()
                    settled=evaluate("(()=>{const n=physics.particles.get(selectedNode.dataset.entryId);return {radius:Math.hypot(n.x-n.parent.x,n.y-n.parent.y),angle:Math.atan2(n.y-n.parent.y,n.x-n.parent.x),fx:n.fx,range:physics.orbitalRange(n)};})()")
                    result={'body':kind,'factor':factor,'original':before['radius'],'requested':requested,'release':release,'settled':settled,'default':before['band']}
                    report['drags'].append(result);print('Drag measurement: '+json.dumps(result),flush=True)
                    if factor=='extreme':
                        check(abs(release['preferred']-before['range']['max'])<.01 and settled['radius']<=before['range']['max']*1.12+16,kind+' absurd drop returns only to the soft adaptive safety boundary')
                        check(settled['radius']>before['band']*1.7,kind+' extreme recovery does not spring back to the default band')
                    else:
                        check(abs(release['preferred']-release['radius'])<.01 and release['radius']*.85<=settled['radius']<=release['radius']*1.15,kind+' '+str(factor)+'x reposition remains near the released orbital region')
                        delta=math.atan2(math.sin(settled['angle']-release['angle']),math.cos(settled['angle']-release['angle']))
                        check(abs(delta)<.4,kind+' preserves the released preferred angle while floating')
                    if screenshot_dir:
                        # The camera remains at the release location during return.
                        # Reframe only the test screenshot to show the settled family.
                        evaluate(f"focusEntry({json.dumps(entry_id)})");wait_camera()
                        result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                        (screenshot_dir/f'arrangement-{kind.lower()}-{factor}.png').write_bytes(base64.b64decode(result['data']))
            if screenshot_dir:
                (screenshot_dir/'arrangement-report.json').write_text(json.dumps(report,indent=2))
            check(not cdp.errors,f"no arrangement browser exceptions: {cdp.errors}")
            print(f'{count} arrangement browser checks passed',flush=True)
            return

        if options.interface_only:
            def preview(label):
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                    (screenshot_dir/f'interface-{label}.png').write_bytes(base64.b64decode(result['data']))

            check(evaluate("!document.querySelector('.hierarchy-header') && !document.querySelector('#galaxy > h1')"),'sidebar has no Hierarchy heading or large canvas branding')
            check(evaluate("[addEntryButton,document.getElementById('reset-view-button'),searchField,document.querySelector('.view-controls'),sampleControls,storageStatus].every(e=>hierarchySidebar.sidebar.contains(e))"),'creation, Fit, search, zoom and extra tools live inside the sidebar')
            check(evaluate("panel.hidden && !selectedNode && physics.bounds.right>innerWidth-60 && physics.bounds.top<60"),'empty selection leaves the right side and canvas top available')
            evaluate('physics.pause();if(graphNeedsSave)saveGalaxy()')
            real_snapshot=evaluate("localStorage.getItem('galaxy:user-data')")
            preference=evaluate("localStorage.getItem('galaxy:navigation-ui')")
            evaluate("document.getElementById('sidebar-tools').open=true")
            click_selector('#load-sample-button')
            wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode");load();wait_camera()
            evaluate('physics.pause()')
            check(evaluate('panel.hidden && entries.size===187'),'Sample opens into a clean canvas without a permanent inspector')
            preview('desktop-clean')
            evaluate("focusEntry('sample-deep-7')");wait_camera()
            check(evaluate("!panel.hidden && panelName.textContent==='Slow simmer notes' && hierarchySidebar.selectedId==='sample-deep-7'"),'selecting a deep item opens matching Details and keeps the tree synchronized')
            check(evaluate("entryActions.hidden && !document.querySelector('#panel-description,#panel-category,#panel-parent,#panel-placement,#panel-role') && panelAncestry.children.length>0"),'Contents hides management actions and permanent metadata; breadcrumbs supply location')
            evaluate('window.interfacePositions=[...physics.particles].map(([id,n])=>[id,n.x,n.y]);window.inspectedBounds={...physics.bounds};window.inspectedScale=camera.view.scale;window.interfaceExpansion=[...hierarchySidebar.expanded]')
            preview('desktop-inspector')
            click_selector('#close-inspector-button');wait_camera()
            check(evaluate('panel.hidden && physics.bounds.right>inspectedBounds.right+200 && camera.view.scale===inspectedScale'),'closing Details reclaims the right side without changing zoom')
            check(evaluate("selectedNode.dataset.entryId==='sample-deep-7' && hierarchySidebar.selectedId==='sample-deep-7' && JSON.stringify([...hierarchySidebar.expanded])===JSON.stringify(interfaceExpansion)"),'closing the inspector preserves selection and tree expansion')
            click_selector('.entry-node[data-entry-id="sample-deep-7"]');wait_camera()
            check(evaluate('!panel.hidden'),'clicking the selected body reopens its inspector')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27);wait_camera()
            check(evaluate('panel.hidden'),'Escape closes Details without clearing selection')

            # Put the body near the old right edge before physically selecting it.
            evaluate("(()=>{const e=entries.get('sample-deep-7'),s=camera.view.scale;camera.setView({x:innerWidth-70-e.x*s,y:innerHeight/2-e.y*s,scale:s},false);})()")
            edge_view=evaluate('JSON.stringify(camera.view)')
            click_selector('.entry-node[data-entry-id="sample-deep-7"]');wait_camera()
            check(evaluate('!panel.hidden && JSON.stringify(camera.view)')==edge_view,'opening Contents at an edge preserves exact camera state')
            evaluate("focusEntry('sample-deep-7')");wait_camera()
            evaluate("window.interfaceEmptyPoint=(()=>{for(let y=80;y<innerHeight-50;y+=60)for(let x=hierarchySidebar.width+40;x<physics.bounds.right;x+=60)if(document.elementFromPoint(x,y)?.id==='graph-viewport'&&!galaxyAtScreen({x,y}))return {x,y};return null;})()")
            empty=evaluate('interfaceEmptyPoint');check(empty is not None,'empty canvas remains reachable')
            mouse('mousePressed',**empty,button='left',clickCount=1);mouse('mouseReleased',**empty,button='left',clickCount=1);wait_camera()
            check(evaluate('panel.hidden'),'an empty-canvas click closes the inspector')
            before=evaluate('({...camera.target})')
            click_selector('.entry-node[data-entry-id="sample-deep-7"]',button='right')
            check(evaluate("!contextMenu.hidden && panel.hidden && contextMenu.querySelector('[data-action=create]').textContent==='Add Astronaut'") and evaluate('({...camera.target})')==before,'right-click keeps the clean canvas and opens actions without reframing')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
            check(evaluate('contextMenu.hidden && panel.hidden'),'menu Escape dismisses only the context menu')

            evaluate('window.interfaceLeft=physics.bounds.left')
            click_selector('#sidebar-toggle');wait_camera()
            check(evaluate('hierarchySidebar.collapsed && physics.bounds.left<interfaceLeft && hierarchySidebar.toggle.getBoundingClientRect().left===16'),'collapsed navigation leaves only a small reopen control')
            preview('immersive')
            click_selector('#sidebar-toggle');wait_camera()
            check(evaluate('JSON.stringify([...hierarchySidebar.expanded])===JSON.stringify(interfaceExpansion)'),'sidebar reopening preserves its branch state')
            evaluate('hierarchySidebar.setWidth(180,false)');wait_camera()
            check(evaluate("[addEntryButton,document.getElementById('reset-view-button'),searchField].every(e=>{const r=e.getBoundingClientRect(),s=hierarchySidebar.sidebar.getBoundingClientRect();return r.left>=s.left&&r.right<=s.right;})"),'minimum sidebar width keeps Add, Fit and search usable')
            evaluate('hierarchySidebar.setWidth(260,false)');wait_camera()
            check(evaluate('JSON.stringify([...physics.particles].map(([id,n])=>[id,n.x,n.y]))===JSON.stringify(interfacePositions)'),'inspector and sidebar transitions never change world coordinates')

            for path in ['sidebar','keyboard','menu']:
                evaluate("focusEntry('sample-deep-7')");wait_camera()
                if path=='sidebar':
                    click_selector('.hierarchy-row.is-selected .tree-add');click_selector('#add-child-button')
                elif path=='keyboard':
                    evaluate('openSelectedRowAdd()')
                    click_selector('#add-child-button')
                else:
                    click_selector('.entry-node[data-entry-id="sample-deep-7"]',button='right')
                    click_selector('#entry-context-menu [data-action=create]')
                check(evaluate("dialog.open && contextualParentId==='sample-deep-7' && document.getElementById('parent-field').hidden"),path+' keeps the shared contextual creation path')
                evaluate(f"fields[0].value='Cleanup {path} child';fields[1].value='Contextual cleanup check';form.requestSubmit();physics.pause()")
                check(evaluate("!dialog.open && entries.get(selectedNode.dataset.entryId).parentId==='sample-deep-7' && !panel.hidden"),path+' creation updates the hierarchy and inspector')

            evaluate("focusEntry('sample-deep-7')");wait_camera()
            click_selector('#close-inspector-button');wait_camera()
            point=evaluate("(()=>{const r=nodes.get('sample-deep-7').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
            before=evaluate('({...camera.target})')
            mouse('mousePressed',**point,button='left',clickCount=1)
            check(evaluate('panel.hidden && activeNodeDrags===1 && camera.frame===null') and evaluate('({...camera.target})')==before,'pressing a body with Details closed keeps the camera still for dragging')
            mouse('mouseMoved',x=point['x']+24,y=point['y']+12,button='left',buttons=1)
            check(evaluate('panel.hidden && activeNodeDrags===1') and evaluate('({...camera.target})')==before,'dragging keeps inspector layout out of the held pointer gesture')
            mouse('mouseReleased',x=point['x']+24,y=point['y']+12,button='left',clickCount=1);wait_camera()
            check(evaluate("!panel.hidden && !activeNodeDrags && selectedNode.dataset.entryId==='sample-deep-7' && !layout.get('sample-deep-7')?.pinned"),'drag release opens Details and preserves Flowing behavior')
            check(evaluate("!document.querySelector('#pin-position-button,[data-action=pin]') && !panel.textContent.includes('Moves naturally')"),'inspector and context menu expose no positioning actions or status')
            evaluate("selectEntry({...entries.get('sample-deep-7'),category:''},nodes.get('sample-deep-7'))")
            check(evaluate("entryActions.hidden && !document.querySelector('#panel-category')"),'optional labels occupy no permanent Content panel space')
            evaluate("selectEntry(entries.get('sample-deep-7'),nodes.get('sample-deep-7'))")

            for width,height,label in [(1024,768,'laptop'),(820,740,'small-laptop'),(390,844,'mobile'),(320,700,'small-mobile')]:
                cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=False)
                time.sleep(.2);evaluate("focusEntry('sample-deep-7')");wait_camera()
                check(evaluate('document.documentElement.scrollWidth<=innerWidth'),label+' has no page overflow')
                check(evaluate("[panelName,moreButton].every(e=>{const r=e.getBoundingClientRect(),p=panel.getBoundingClientRect();return r.width>0&&r.top>=p.top&&r.bottom<=p.bottom;})"),label+' keeps name and More reachable')
                if width<760:
                    check(evaluate('hierarchySidebar.collapsed && panel.getBoundingClientRect().bottom===innerHeight && physics.bounds.bottom<panel.getBoundingClientRect().top'),'mobile uses a contextual bottom sheet and its remaining canvas')
                    evaluate("moreButton.click()")
                    wait_for("physics.bounds.bottom<panel.getBoundingClientRect().top");wait_camera()
                    check(evaluate("!entryActions.hidden && editEntryButton.getBoundingClientRect().width>0 && !document.querySelector('#panel-role,#panel-placement')"),'More reveals infrequent item actions on mobile')
                    evaluate("closeContentMenus()")
                    click_selector('#sidebar-toggle');wait_camera()
                    check(evaluate('!hierarchySidebar.collapsed && panel.hidden'),'mobile navigation drawer gets the space without a competing inspector')
                    check(evaluate("[addEntryButton,document.getElementById('reset-view-button'),searchField].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})"),'mobile sidebar controls remain within the drawer')
                    evaluate("hierarchySidebar.select('sample-deep-7')")
                    click_selector('.hierarchy-row[data-entry-id="sample-deep-7"] .tree-name');wait_camera()
                    check(evaluate('hierarchySidebar.collapsed && !panel.hidden'),'mobile tree selection closes navigation and opens Details')
                    evaluate("(()=>{const e=entries.get('sample-sun-2'),s=camera.view.scale;camera.setView({x:innerWidth/2-e.x*s,y:(physics.bounds.top+physics.bounds.bottom)/2-e.y*s,scale:s},false);})()")
                    menu_view=evaluate('({...camera.target})')
                    click_selector('.entry-node[data-entry-id="sample-sun-2"]',button='right')
                    check(evaluate("!contextMenu.hidden && panelName.textContent==='Recipes' && Math.abs(physics.bounds.bottom-(panel.getBoundingClientRect().top-getNodeRadius()-24))<.1") and evaluate('({...camera.target})')==menu_view,'mobile context selection measures changed sheet content without moving the camera')
                    cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
                    evaluate("focusEntry('sample-deep-7')");wait_camera()
                evaluate('fitGalaxy(false)')
                check(evaluate("(()=>{const b=galaxyBounds(),a=camera.worldToScreen(b.left,b.top),z=camera.worldToScreen(b.right,b.bottom);return a.x>=physics.bounds.left+31&&a.y>=physics.bounds.top+31&&z.x<=physics.bounds.right-31&&z.y<=physics.bounds.bottom-31;})()"),label+' Fit uses only available canvas space')
                preview(label)
                click_selector('#close-inspector-button');wait_camera()
                check(evaluate('panel.hidden && physics.bounds.bottom>innerHeight-60 && physics.bounds.right>innerWidth-60'),label+' inspector close restores the full height or width')
            check(evaluate("localStorage.getItem('galaxy:user-data')")==real_snapshot and evaluate("localStorage.getItem('galaxy:navigation-ui')")==preference,'Sample cleanup interactions leave real data and UI preferences untouched')
            check(not cdp.errors,f'no interface browser exceptions: {cdp.errors}')
            print(f'{count} interface browser checks passed',flush=True)
            return

        if options.navigation_only:
            def preview(label):
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                    (screenshot_dir/f'navigation-{label}.png').write_bytes(base64.b64decode(result['data']))

            def menu_for(entry_id):
                evaluate(f"focusEntry({json.dumps(entry_id)})");wait_camera()
                evaluate('physics.pause()')
                before=evaluate(f"({{view:{{...camera.target}},x:entries.get({json.dumps(entry_id)}).x,y:entries.get({json.dumps(entry_id)}).y,placement:layout.get({json.dumps(entry_id)})||null}})")
                click_selector(f'.entry-node[data-entry-id="{entry_id}"]',button='right')
                wait_for('!contextMenu.hidden')
                after=evaluate(f"({{view:{{...camera.target}},x:entries.get({json.dumps(entry_id)}).x,y:entries.get({json.dumps(entry_id)}).y,placement:layout.get({json.dumps(entry_id)})||null}})")
                check(before==after and evaluate('!activeNodeDrags && !physics.dragging.size && !pan'),'right-click opens actions without focus, dragging or a placement change')
                evaluate('physics.resume()')

            def submit_context(name):
                parent=evaluate('parentField.value')
                check(evaluate("dialog.open && document.getElementById('parent-field').hidden && creationContext.hidden && document.getElementById('entry-info-fields').hidden"),'contextual form only asks for the name of the child')
                evaluate(f"fields[0].value={json.dumps(name)};fields[1].value='Navigation test';form.requestSubmit()")
                check(evaluate('!dialog.open'),'contextual child saves through the shared form')
                child=evaluate('selectedNode.dataset.entryId')
                check(evaluate(f"entries.get({json.dumps(child)}).parentId==={json.dumps(parent)} && entries.get({json.dumps(child)}).depth===entries.get({json.dumps(parent)}).depth+1 && hierarchySidebar.selectedId==={json.dumps(child)}"),'created entry has the correct parent, depth and synchronized selection')
                return child

            check(evaluate("!hierarchySidebar.collapsed && searchField.closest('#hierarchy-sidebar') && addEntryButton.textContent==='Add Galaxy' && !!addEntryButton.closest('#sidebar-tools')"),'desktop sidebar contains Search, row actions and top-level creation in More tools')
            g=add('Navigation Galaxy')
            chain=[g]
            for depth in range(1,7):
                parent=chain[-1]
                evaluate(f"selectEntry(entries.get({json.dumps(parent)}),nodes.get({json.dumps(parent)}));openSelectedRowAdd();addChildButton.click()")
                check(evaluate('parentField.value')==parent,'sidebar + preselects its exact parent')
                chain.append(submit_context(f'Navigation depth {depth}'))
            check(evaluate(f"entries.get({json.dumps(chain[-1])}).role==='astronaut' && entries.get({json.dumps(chain[-1])}).depth===6"),'sidebar creation supports arbitrary nesting beyond Satellite')
            evaluate('addEntryButton.click()')
            check(evaluate("parentField.value==='' && contextualParentId===null && roleField.dataset.role==='galaxy'"),'top-level Add defaults to a new Galaxy even with a deep body selected')
            evaluate('dialog.close()')
            preview('created-tree')

            for parent in chain[:-1]:
                menu_for(parent)
                expected=evaluate(f"cosmosHierarchy.childContext(entries,{json.dumps(parent)}).action")
                check(evaluate("contextMenu.querySelector('[data-action=create]').textContent")==expected,'context menu offers '+expected+' for '+parent+' (actual '+str(evaluate('contextEntryId'))+')')
                click_selector('#entry-context-menu [data-action=create]')
                check(evaluate('parentField.value')==parent,'right-click Add uses the same parent context')
                submit_context('Menu child')
            for parent in chain[:-1]:
                select(parent)
                evaluate('openSelectedRowAdd();addChildButton.click()')
                check(evaluate('parentField.value')==parent,'Entry Details Add uses the same parent context')
                submit_context('Details child')
            snapshot=evaluate('JSON.parse(localStorage.getItem("galaxy:user-data")).entries.map(e=>({id:e.id,parentId:e.parentId,name:e.name}))')
            evaluate('window.navigationReloadMarker=true');cdp.call('Page.reload')
            wait_for("typeof window.navigationReloadMarker==='undefined' && document.readyState==='complete' && typeof entries!=='undefined'");load()
            check(evaluate('JSON.parse(localStorage.getItem("galaxy:user-data")).entries.map(e=>({id:e.id,parentId:e.parentId,name:e.name}))')==snapshot,'all three contextual creation paths persist through refresh')
            check(evaluate("JSON.parse(localStorage.getItem('galaxy:user-data')).version===5 && localStorage.getItem('galaxy:user-data:pre-cosmic-tree')!==null"),'navigation requires no graph-schema change and preserves migration backups')

            for entry_id in [chain[0],chain[1],chain[2],chain[-1]]:
                evaluate(f"hierarchySidebar.select({json.dumps(entry_id)})")
                click_selector(f'.hierarchy-row[data-entry-id="{entry_id}"] .tree-name');wait_camera()
                check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(entry_id)} && hierarchySidebar.selectedId==={json.dumps(entry_id)} && hierarchySidebar.rows.get({json.dumps(entry_id)}).getAttribute('aria-selected')==='true' && panelName.textContent===entries.get({json.dumps(entry_id)}).name"),'tree click selects, focuses and opens matching Details')
            check(evaluate(f"camera.view.scale>=1.7 && !nodes.get({json.dumps(chain[-1])}).inert"),'deep tree navigation reaches a close semantic zoom')
            evaluate(f"hierarchySidebar.toggleBranch({json.dumps(g)})")
            check(evaluate(f"!hierarchySidebar.expanded.has({json.dumps(g)}) && !hierarchySidebar.tree.contains(hierarchySidebar.rows.get({json.dumps(chain[-1])})) && entries.has({json.dumps(chain[-1])})"),'Galaxy collapse hides its complete tree subtree while preserving Cosmos entries')
            click_selector(f'.entry-node[data-entry-id="{chain[-1]}"]')
            check(evaluate(f"hierarchySidebar.selectedId==={json.dumps(chain[-1])} && galaxyModel.ancestors(entries,{json.dumps(chain[-1])}).every(e=>hierarchySidebar.expanded.has(e.id)) && hierarchySidebar.tree.contains(hierarchySidebar.rows.get({json.dumps(chain[-1])}))"),'Cosmos click expands the ancestor path and highlights the deep tree item')
            evaluate(f"searchField.value='Navigation depth 6';searchField.dispatchEvent(new Event('input'));searchResultList.querySelector('button').click()");wait_camera()
            check(evaluate(f"hierarchySidebar.selectedId==={json.dumps(chain[-1])} && hierarchySidebar.rows.get({json.dumps(chain[-1])}).classList.contains('is-search-match')"),'deep search identifies the entry in both Cosmos and tree')

            evaluate('physics.pause()')
            before=evaluate('({left:physics.bounds.left,expanded:[...hierarchySidebar.expanded],positions:[...physics.particles].map(([id,n])=>[id,n.x,n.y])})')
            evaluate('hierarchySidebar.toggle.click()');wait_camera()
            check(evaluate('hierarchySidebar.collapsed && hierarchySidebar.sidebar.hidden') and evaluate('physics.bounds.left')<before['left'],'collapsing sidebar frees usable camera space')
            check(evaluate('[...physics.particles].map(([id,n])=>[id,n.x,n.y])')==before['positions'],'sidebar collapse does not alter world layout')
            evaluate('hierarchySidebar.toggle.click()');wait_camera()
            check(evaluate('[...hierarchySidebar.expanded]')==before['expanded'],'sidebar reopen preserves expansion state')
            evaluate("hierarchySidebar.resize.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))");wait_camera()
            check(evaluate('hierarchySidebar.width<=360 && hierarchySidebar.width<=innerWidth*.3 && physics.bounds.left>hierarchySidebar.sidebar.getBoundingClientRect().right'),'sidebar resize respects width limits and updates camera padding')
            point=evaluate('(()=>{const r=hierarchySidebar.resize.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()')
            mouse('mousePressed',**point,button='left',clickCount=1)
            mouse('mouseMoved',x=point['x']-64,y=point['y'],button='left',buttons=1)
            mouse('mouseReleased',x=point['x']-64,y=point['y'],button='left',clickCount=1)
            check(evaluate('hierarchySidebar.width===296 && !galaxy.classList.contains("sidebar-resizing")'),'pointer resizing updates width and releases its capture')
            check(evaluate('[...physics.particles].map(([id,n])=>[id,n.x,n.y])')==before['positions'],'pointer resizing preserves world positions')
            evaluate("hierarchySidebar.resize.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))");wait_camera()
            evaluate('fitGalaxy(false)')
            check(evaluate("[...entries.values()].filter(e=>e.depth>0).every(e=>{const p=camera.worldToScreen(e.x,e.y);return p.x>physics.bounds.left&&p.x<physics.bounds.right&&p.y>physics.bounds.top&&p.y<physics.bounds.bottom;})"),'Fit uses the remaining canvas beside sidebar and Details')
            preview('resized-sidebar')
            evaluate('hierarchySidebar.setCollapsed(true);window.navigationReloadMarker=true');cdp.call('Page.reload')
            wait_for("typeof window.navigationReloadMarker==='undefined' && document.readyState==='complete' && typeof hierarchySidebar!=='undefined'");load()
            check(evaluate('hierarchySidebar.collapsed && hierarchySidebar.width===360'),'sidebar width and collapse preference survive refresh separately from graph data')
            evaluate('hierarchySidebar.setCollapsed(false)');wait_camera()

            leaf=chain[-1]
            menu_for(leaf)
            check(evaluate("[...contextMenu.querySelectorAll('button:not([hidden])')].filter(b=>b.getClientRects().length).map(b=>b.dataset.action).join(',')==='create,files,constellation,portal,edit,delete'"),'context menu groups creation/content, collection/access and entry management')
            evaluate('closeContextMenu()')
            menu_for(leaf);evaluate("contextMenu.querySelector('[data-action=edit]').click()")
            check(evaluate(f"dialog.open && editingId==={json.dumps(leaf)} && fields[0].value===entries.get({json.dumps(leaf)}).name"),'context menu Edit opens the existing editor')
            evaluate('dialog.close()')
            menu_for(leaf);evaluate("contextMenu.querySelector('[data-action=delete]').click()")
            check(evaluate(f"deleteDialog.open && deletingId==={json.dumps(leaf)}"),'context menu Delete uses existing confirmation')
            evaluate('deleteDialog.close()')
            menu_for(g);evaluate("contextMenu.querySelector('[data-action=delete]').click()")
            check(evaluate('deleteDialog.open && deleteConfirmationIds.size>1'),'context menu requires counted confirmation for a nonempty parent')
            evaluate('deleteDialog.close()')
            menu_for(leaf)
            evaluate(f"openContextMenu({json.dumps(leaf)},innerWidth-1,innerHeight-1)")
            check(evaluate('(()=>{const r=contextMenu.getBoundingClientRect();return r.right<=innerWidth-7&&r.bottom<=innerHeight-7&&r.left>=8&&r.top>=8;})()'),'menu stays inside the viewport near its edges')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
            check(evaluate('contextMenu.hidden'),'Escape dismisses the menu')
            check(evaluate(f'document.activeElement===nodes.get({json.dumps(leaf)})'),'Escape returns keyboard focus to the body without moving the camera')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='F10',code='F10',modifiers=8,windowsVirtualKeyCode=121)
            check(evaluate('!contextMenu.hidden'),'Shift+F10 opens celestial actions from the keyboard')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='ArrowDown',code='ArrowDown',windowsVirtualKeyCode=40)
            check(evaluate("document.activeElement.dataset.action==='files'"),'menu arrow keys reach Add files')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='ArrowDown',code='ArrowDown',windowsVirtualKeyCode=40)
            check(evaluate("document.activeElement.dataset.action==='constellation'"),'menu arrow keys reach Add to Constellation')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='ArrowDown',code='ArrowDown',windowsVirtualKeyCode=40)
            check(evaluate("document.activeElement.dataset.action==='portal'"),'menu arrow keys reach Create Portal')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='ArrowDown',code='ArrowDown',windowsVirtualKeyCode=40)
            check(evaluate("document.activeElement.dataset.action==='edit'"),'menu arrow keys continue to Edit')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
            menu_for(leaf);click_selector('#sidebar-toggle')
            check(evaluate('contextMenu.hidden'),'clicking elsewhere dismisses the menu')

            # Start a fresh temporary sample; real graph and UI preferences stay intact.
            evaluate('physics.pause();if(graphNeedsSave)saveGalaxy()')
            real_snapshot=evaluate("localStorage.getItem('galaxy:user-data')")
            preference=evaluate("localStorage.getItem('galaxy:navigation-ui')")
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode");load();wait_camera()
            check(evaluate('entries.size===187 && hierarchySidebar.tree.querySelectorAll(".hierarchy-row[data-entry-id]").length===12 && hierarchySidebar.tree.querySelectorAll(".portal-row").length===3'),'large sample starts with Galaxy roots/Suns and three lightweight Portal leaves')
            evaluate("hierarchySidebar.select('sample-deep-7')")
            check(evaluate("hierarchySidebar.tree.querySelectorAll('.hierarchy-row').length<50 && galaxyModel.ancestors(entries,'sample-deep-7').every(e=>hierarchySidebar.expanded.has(e.id))"),'deep sample selection opens its path while keeping other branches compact')
            evaluate("focusEntry('sample-deep-7')");wait_camera()
            check(evaluate("(()=>{const r=hierarchySidebar.rows.get('sample-deep-7').getBoundingClientRect(),t=hierarchySidebar.tree.getBoundingClientRect();return r.top>=t.top&&r.bottom<=t.bottom;})()"),'selected deep row scrolls into the visible tree')
            evaluate("entries.get('sample-deep-7').name='Long hierarchy name '.repeat(4).slice(0,60);hierarchySidebar.setEntries(entries)")
            check(evaluate("document.documentElement.scrollWidth<=innerWidth && hierarchySidebar.tree.scrollWidth<=hierarchySidebar.width"),'long names truncate without breaking the sidebar layout')
            evaluate("window.sidebarProbe=new Map([...entries].map(([id,e])=>[id,{...e}]));for(let i=0;i<30;i++)sidebarProbe.set('sidebar-probe-'+i,{id:'sidebar-probe-'+i,name:'Deep tree item '+i,parentId:i?'sidebar-probe-'+(i-1):'sample-deep-7'});galaxyModel.normalizeHierarchy(sidebarProbe);hierarchySidebar.setEntries(sidebarProbe);hierarchySidebar.select('sidebar-probe-29')")
            check(evaluate("(()=>{const r=hierarchySidebar.rows.get('sidebar-probe-29').querySelector('.tree-name').getBoundingClientRect(),t=hierarchySidebar.tree.getBoundingClientRect();return hierarchySidebar.tree.scrollLeft>0&&r.left>=t.left&&r.right<=t.right&&document.documentElement.scrollWidth<=innerWidth;})()"),'arbitrary deep indentation scrolls its name into view without page overflow')
            evaluate("hierarchySidebar.setEntries(entries);hierarchySidebar.select('sample-deep-7');delete window.sidebarProbe")
            evaluate("hierarchySidebar.expanded.delete('sample-galaxy-0');hierarchySidebar.render();hierarchySidebar.rows.get('sample-galaxy-0').focus();hierarchySidebar.rows.get('sample-galaxy-0').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))")
            evaluate("hierarchySidebar.rows.get('sample-galaxy-0').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");wait_camera()
            check(evaluate("selectedNode.dataset.entryId==='sample-galaxy-0' && hierarchySidebar.expanded.has('sample-galaxy-0') && hierarchySidebar.rows.get('sample-galaxy-0').tabIndex===0"),'keyboard tree navigation activates matching Cosmos entries')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='End',code='End',windowsVirtualKeyCode=35)
            check(evaluate('(()=>{const r=document.activeElement.getBoundingClientRect(),t=hierarchySidebar.tree.getBoundingClientRect();return r.top>=t.top&&r.bottom<=t.bottom;})()'),'keyboard traversal scrolls the active tree row into view')
            preview('large-sample')
            cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=False);time.sleep(.3)
            check(evaluate('hierarchySidebar.collapsed && document.documentElement.scrollWidth<=innerWidth'),'narrow screens keep the canvas available and avoid page overflow')
            evaluate("hierarchySidebar.setCollapsed(false);hierarchySidebar.select('sample-deep-7')")
            click_selector('.hierarchy-row[data-entry-id="sample-deep-7"] .tree-name');wait_camera()
            check(evaluate("hierarchySidebar.collapsed && selectedNode.dataset.entryId==='sample-deep-7' && camera.view.scale>=1.7"),'mobile tree navigation closes its drawer before focusing the deep body')
            check(evaluate("[panelName,moreButton].every(e=>{const r=e.getBoundingClientRect(),p=panel.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom&&r.width>0;})"),'mobile Contents keeps the selected name and More visible')
            evaluate("hierarchySidebar.setCollapsed(false);searchField.value='Long hierarchy name';searchField.dispatchEvent(new Event('input'))")
            click_selector('#search-result-list button');wait_camera()
            check(evaluate("hierarchySidebar.collapsed && selectedNode.dataset.entryId==='sample-deep-7'"),'mobile search closes the drawer and synchronizes its focused result')
            preview('mobile-focus')
            check(evaluate("localStorage.getItem('galaxy:user-data')")==real_snapshot and evaluate("localStorage.getItem('galaxy:navigation-ui')")==preference,'sample tree, navigation and sidebar interactions leave real data and preferences untouched')
            check(not cdp.errors,f'no navigation browser exceptions: {cdp.errors}')
            print(f'{count} navigation browser checks passed',flush=True)
            return

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
            check(evaluate("entries.size===187 && regions.size===4 && galaxyAppearance.cloudCache.size===4"), "large sample reuses four cached nebula images")
            check(evaluate("[...regions.values()].every(r=>r.tagName==='CANVAS' && r.width===512 && r.height===512 && r.cloudDraws===1)"), "nebula pixels use fixed cached canvases rather than full-resolution frame redraws")
            check(evaluate("[...entries.values()].filter(e=>e.depth>0).every(e=>nodes.get(e.id).dataset.semanticHidden==='true')"), "fitted Universe hides all routine lower bodies")
            check(evaluate("[...entries.values()].filter(e=>e.depth===0).every(e=>{const n=nodes.get(e.id),r=n.getBoundingClientRect();return parseFloat(getComputedStyle(n.querySelector('.node-label')).fontSize)>=15&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})"), "Universe Galaxy names are authoritative and fit in view")
            preview('whole-universe')
            for scale,tier,roles,target in [(.1,'universe',[],'sample-galaxy-0'),(.575,'galaxy',['sun'],'sample-galaxy-0'),(.68,'system',['sun','planet'],'sample-sun-0'),(.96,'close',['sun','planet','moon','satellite','astronaut'],'sample-satellite-0-0-0-0')]:
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
            check(evaluate("!focusRevealIds.size && nodes.get('sample-deep-7').querySelector('.astronaut-figure') && getComputedStyle(nodes.get('sample-deep-7').querySelector('.node-label')).opacity==='1'"),'completed deep focus reveals the Satellite and labels through normal close zoom')

            check(evaluate("[...entries.values()].filter(e=>e.role==='satellite').every(e=>{const n=nodes.get(e.id);return !!n.querySelector('.satellite-craft')&&getComputedStyle(n).backgroundImage==='none'&&getComputedStyle(n,'::before').content==='none'&&!n.textureSize;}) && new Set([...nodes.values()].filter(n=>n.dataset.body==='satellite').map(n=>n.dataset.archetype)).size===4"),'Satellites use all four artificial silhouettes without sphere textures')
            identities=evaluate("[...nodes].filter(([id,n])=>n.dataset.body==='satellite').map(([id,n])=>[id,n.dataset.archetype,n.querySelector('.satellite-craft').outerHTML])")

            for start,end,label in [(1.7,.1,'out'),(.1,1.7,'in')]:
                view_at(start,'sample-sun-0')
                trace=evaluate(f"""new Promise(resolve=>{{const original=camera.onChange,values=[],ids=['sample-sun-0','sample-planet-0-0','sample-moon-0-0-0','sample-satellite-0-0-0-0'];camera.onChange=v=>{{original(v);values.push(ids.map(id=>parseFloat(getComputedStyle(nodes.get(id)).opacity)));}};camera.setView({{...camera.view,scale:{end}}});const frame=()=>{{if(camera.frame!==null)requestAnimationFrame(frame);else{{camera.onChange=original;resolve(values);}}}};requestAnimationFrame(frame);}})""")
                check(all(any(0<row[i]<1 for row in trace) for i in range(4)), 'zooming '+label+' fades every lower body level continuously')
            view_at(.575)
            metrics=motion_metrics()
            cloud_responsive=metrics['renderP95']<20 and metrics['frameMedian']<55
            cloud_motion_title=f"Galaxy cloud motion responsive: projection p95 {metrics['renderP95']:.1f}ms, median frame {metrics['frameMedian']:.1f}ms"
            # Preserve the budget failure while completing visual/drag checks.
            if not cloud_responsive: print('FAIL '+cloud_motion_title+' (deferred until visual checks finish)',flush=True)
            wait_for('physics.settled')
            before=evaluate("({...entries.get('sample-sun-1')})");drag_to('sample-sun-1',before['x']+350,before['y']+100,settle_timeout=60)
            check(evaluate("[...regions].every(([id,r])=>{const root=physics.particles.get(id),f=r.footprint;return [...physics.particles.values()].filter(p=>p.depth>0&&p.galaxyId===id).every(p=>Math.abs(p.x-root.x-f.offsetX)+p.radius<f.width/2 && Math.abs(p.y-root.y-f.offsetY)+p.radius<f.height/2);})"), 'cloud footprints contain actual systems after a Sun drag')
            check(evaluate("JSON.stringify(cloudImages)===JSON.stringify([...regions.values()].map(r=>[r.cloudKey,r.cloudDraws])) && galaxyAppearance.cloudCache.size===4"), 'moving contents reuses the existing nebula pixels')
            view_at(.575);preview('after-drag')
            before=evaluate("({...entries.get('sample-planet-2-0')})")
            drag_to('sample-planet-2-0',before['x']+1800,before['y'],settle_timeout=60)
            check(evaluate("(()=>{const p=physics.particles.get('sample-planet-2-0');return p.fx===null&&Math.hypot(p.x-p.parent.x,p.y-p.parent.y)<physics.orbitalRange(p).max*1.12+16;})()"),'far Planet drag gently returns to its soft local safety boundary')
            evaluate('window.cosmosReloadMarker=true')
            cdp.call('Page.navigate',url=origin+'/?sample=large')
            wait_for("typeof window.cosmosReloadMarker==='undefined' && document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode")
            load();wait_camera()
            check(evaluate("[...nodes].filter(([id,n])=>n.dataset.body==='satellite').map(([id,n])=>[id,n.dataset.archetype,n.querySelector('.satellite-craft').outerHTML])")==identities,'Satellite silhouettes remain identical after a sample reload')
            view_at(1,'sample-planet-0-0')
            check(evaluate("(()=>{const ids=['sample-sun-0','sample-planet-0-0','sample-moon-0-0-0','sample-satellite-0-0-0-0'],widths=ids.map(id=>nodes.get(id).getBoundingClientRect().width);return widths.every((w,i)=>w>0&&(!i||w<widths[i-1]))&&widths[1]<40&&ids.every(id=>parseFloat(getComputedStyle(nodes.get(id).querySelector('.node-label')).fontSize)>=9);})()"),'smaller native bodies retain Sun, Planet, Moon and artificial Satellite dominance with readable labels')
            check(evaluate("(()=>{const p=physics.particles.get('sample-planet-0-0'),m=physics.particles.get('sample-moon-0-0-0'),t=physics.particles.get('sample-satellite-0-0-0-0');return [p,m,t].every(n=>Math.hypot(n.x-n.parent.x,n.y-n.parent.y)-n.radius-n.parent.radius>28);})()"),'Planet, Moon and Satellite families have visible resting clearance')
            check(evaluate("(()=>{const f=physics.galaxies.get('sample-galaxy-1');return Math.hypot(f.systems[0].root.x-f.systems[1].root.x,f.systems[0].root.y-f.systems[1].root.y)<1200;})()"),'Food retains the branch compactness limit after the spacing refinement')
            preview('refined-local-hierarchy')
            sparse=add('Two Planet system','sample-galaxy-0');sparse_planet=add('Inner Planet',sparse);add('Outer Planet',sparse)
            moon=add('Local Moon',sparse_planet);add('Local Satellite',moon)
            wide=add('Eight Planet system','sample-galaxy-0')
            wide_planets=[add('Planet '+str(i+1),wide) for i in range(8)]
            wide_moon=add('Local Moon',wide_planets[0]);add('Local Satellite',wide_moon)
            wait_for('physics.settled');wait_camera()
            check(evaluate(f"physics.particles.get({json.dumps(sparse)}).childOrbit<140 && physics.particles.get({json.dumps(wide)}).childOrbit>physics.particles.get({json.dumps(sparse)}).childOrbit*1.5 && physics.particles.get({json.dumps(wide)}).childOrbit<260"),'two Planets stay compact while eight Planets with the same Moon branch expand adaptively within a bounded footprint')
            for entry_id,label in [(sparse,'two-planets'),(wide,'eight-planets')]:
                view_at(.95,entry_id);select(entry_id);wait_camera();preview(label)
                check(evaluate(f"(()=>{{const c=physics.children.get({json.dumps(entry_id)});return c.every((a,i)=>c.slice(i+1).every(b=>Math.hypot(a.x-b.x,a.y-b.y)>a.radius+b.radius+12));}})()"),label+' preserves sibling separation')
            before=evaluate(f"({{...entries.get({json.dumps(sparse_planet)})}})")
            drag_to(sparse_planet,before['x']+600,before['y'],settle_timeout=60)
            check(evaluate(f"(()=>{{const p=physics.particles.get({json.dumps(sparse_planet)}),d=Math.hypot(p.x-p.parent.x,p.y-p.parent.y);return p.fx===null&&d>p.orbitRadius*1.7&&d<physics.orbitalRange(p).max*1.12+16;}})()"),'outward Planet release settles near the allowed outer region rather than returning to the default')
            view_at(.95,sparse);select(sparse);wait_camera();preview('two-planets-after-release')
            check(not cdp.errors,f"no visual browser exceptions: {cdp.errors}")
            check(cloud_responsive,cloud_motion_title)
            print(f'{count} visual browser checks passed',flush=True)
            return

        if options.performance_only:
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof physics!=='undefined' && sampleMode");wait_for('physics.settled',timeout=25)
            evaluate("focusEntry('sample-satellite-0-0-0-0')");wait_camera()
            def measure_case(label, active=True):
                if active: evaluate('physics.resume();physics.reheat(.3)')
                else: evaluate('physics.pause()')
                metrics=evaluate("""new Promise(resolve=>{const original=physics.onTick,costs=[],labelCosts=[],frames=[];physics.onTick=p=>{const start=performance.now();original(p);costs.push(performance.now()-start);};let last,labelRun;
                    const frame=t=>{if(last!==undefined)frames.push(t-last);last=t;if(typeof labelDensity!=='undefined'&&labelDensity.lastRun!==labelRun){labelRun=labelDensity.lastRun;labelCosts.push(labelDensity.cost);}if(frames.length<45)requestAnimationFrame(frame);else{physics.onTick=original;frames.sort((a,b)=>a-b);costs.sort((a,b)=>a-b);labelCosts.sort((a,b)=>a-b);resolve({renderP95:costs[Math.floor(costs.length*.95)]||0,labelLayoutP95:labelCosts[Math.floor(labelCosts.length*.95)]||0,frameMedian:frames[22],frameP95:frames[42],scale:camera.view.scale,dpr:devicePixelRatio,culled:[...nodes.values()].filter(n=>n.dataset.culled==='true').length,visibleLayers:[...nodes.values()].filter(n=>getComputedStyle(n).visibility==='visible'&&getComputedStyle(n).willChange==='transform').length});}};requestAnimationFrame(frame);})""")
                print(label+': '+json.dumps(metrics),flush=True)
                evaluate('physics.pause()')
            wait_for("[...nodes.values()].filter(n=>n.dataset.culled==='false' && !['galaxy','satellite','astronaut'].includes(n.dataset.body)).every(n=>n.dataset.textureReady==='true')")
            measure_case('pristine close')
            measure_case('idle close',False)
            cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=2,mobile=False)
            time.sleep(.2);measure_case('2x close')
            cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
            time.sleep(.2);measure_case('restored 1x close')
            evaluate("hierarchyLayer.style.display='none'");measure_case('without structural SVG paths')
            evaluate("hierarchyLayer.style.display='';nodesLayer.style.display='none'");measure_case('without bodies')
            evaluate("nodesLayer.style.display='';document.head.insertAdjacentHTML('beforeend','<style>.entry-node::before{background:none!important}</style>')");measure_case('without surface texture')
            check(not cdp.errors,f"no profiling browser exceptions: {cdp.errors}")
            return

        if options.migration_only:
            # Freeze startup animation frames in this load-time fixture so the
            # assertions inspect restoration, not subsequent flowing motion.
            cdp.call('Page.addScriptToEvaluateOnNewDocument',source="window.requestAnimationFrame=()=>0;document.addEventListener('DOMContentLoaded',()=>{physics.pause();physics.resume=()=>{}},{once:true})")
            def load_storage_fixture():
                wait_for("typeof window.storageReloadMarker==='undefined' && document.readyState==='complete' && typeof physics!=='undefined'")
                # Pause the flowing fixture while checking its exact initial data.
                evaluate('physics.pause();saveGalaxy()')

            def reload_storage_fixture():
                evaluate('window.storageReloadMarker=true')
                cdp.call('Page.reload');load_storage_fixture()

            v4 = {"version": 4, "entries": [
                {"id": "github", "name": "Saved Sun", "description": "Edited built-in Sun", "category": "Keep label", "role": "category", "parentId": None, "x": 400, "y": 400},
                {"id": "saved-planet", "name": "Saved Planet", "description": "Saved category", "category": "Keep category", "role": "subcategory", "parentId": "github", "x": 600, "y": 430, "appearance": {"archetype": "desert", "rings": True}},
                {"id": "saved-moon", "name": "Saved Moon", "description": "Saved resource", "category": "", "role": "entry", "parentId": "saved-planet", "x": 670, "y": 490}],
                "connections": [{"from": "github", "to": "saved-moon"}],
                "layout": [{"id": "saved-moon", "x": 1050, "y": 680, "pinned": True}, {"id": "saved-planet", "x": 700, "y": 460, "pinned": False}]}
            v4_raw = json.dumps(v4, indent=2)
            evaluate(f"physics.pause();graphNeedsSave=false;localStorage.removeItem('galaxy:user-data:pre-cosmic-tree');localStorage.setItem('galaxy:user-data',{json.dumps(v4_raw)})")
            reload_storage_fixture()
            check(evaluate("entries.size===4 && entries.get('github').name==='Saved Sun' && entries.get('saved-planet').parentId==='github' && entries.get('saved-moon').parentId==='saved-planet' && entries.get('saved-moon').role==='moon'"), "v4 migration preserves the entire saved three-level tree and edited built-in")
            check(evaluate("localStorage.getItem('galaxy:user-data:pre-cosmic-tree')") == v4_raw, "v4 migration saves the exact original raw snapshot before replacement")
            check(evaluate("entries.get('github').parentId==='migration-my-galaxy' && entries.get('migration-my-galaxy').name==='My Galaxy'"), "v4 former Sun gains a neutral Galaxy parent")
            check(evaluate("entries.get('saved-moon').x===1050 && entries.get('saved-moon').y===680 && !layout.get('saved-moon').pinned && layout.get('saved-moon').parentId==='saved-planet' && physics.particles.get('saved-moon').fx===null"), "v4 legacy pin keeps its initial coordinates while becoming a flowing relative influence")
            check(evaluate("!('x' in layout.get('saved-planet')) && layout.get('saved-planet').parentId==='github' && Number.isFinite(layout.get('saved-planet').angle) && physics.particles.get('saved-planet').fx===null"), "v4 old soft placement becomes an initial position and relative flowing influence")
            check(evaluate("nodes.get('saved-planet').dataset.archetype==='desert' && nodes.get('saved-planet').dataset.rings==='true'"), "migration preserves optional appearance metadata")
            identity = evaluate("JSON.stringify([...entries.values()].map(e=>[e.id,galaxyAppearance.resolve(e)]))")
            reload_storage_fixture()
            check(evaluate("entries.size===4 && entries.get('saved-moon').x===1050 && entries.get('saved-moon').y===680 && JSON.stringify([...entries.values()].map(e=>[e.id,galaxyAppearance.resolve(e)]))") == identity, "second refresh preserves normalized positions, styles and content")
            select('saved-planet')
            check(evaluate("!document.querySelector('#panel-placement,#pin-position-button') && !panel.textContent.includes('Moves naturally')"), "migrated body has no position controls or physics status")

            # The current schema also contains historical pins, including roots.
            evaluate("(()=>{const data=JSON.parse(localStorage.getItem('galaxy:user-data'));data.layout.push({id:'migration-my-galaxy',x:420,y:360,pinned:true},{id:'saved-moon',x:1050,y:680,pinned:true});localStorage.setItem('galaxy:user-data',JSON.stringify(data));})()")
            reload_storage_fixture()
            check(evaluate("entries.get('migration-my-galaxy').x===420 && entries.get('migration-my-galaxy').y===360 && !layout.has('migration-my-galaxy') && entries.get('saved-moon').x===1050 && physics.particles.get('saved-moon').fx===null"),'v5 root and child pins retain initial coordinates without permanent constraints')
            check(evaluate("JSON.parse(localStorage.getItem('galaxy:user-data')).layout.every(p=>!('pinned' in p)&&!('x' in p))"),'normal save replaces historical pins with relative influences in schema 5')
            edit('saved-moon',name='Updated saved Moon');evaluate('physics.pause()')
            edit('saved-moon',parent='github');evaluate('physics.pause()')
            edit('saved-moon',parent='saved-planet');evaluate('physics.pause();saveGalaxy()')
            reload_storage_fixture()

            corrupt = json.dumps({"version": 5, "entries": [{"id": "bad", "name": "", "description": "", "parentId": None}], "connections": [], "layout": []})
            evaluate(f"physics.pause();graphNeedsSave=false;localStorage.setItem('galaxy:user-data',{json.dumps(corrupt)})")
            reload_storage_fixture()
            check(evaluate("!storageAvailable && !storageStatus.hidden"), "invalid saved record disables overwriting and reports the issue")
            add('Session only')
            check(evaluate("localStorage.getItem('galaxy:user-data')") == corrupt, "session edits cannot replace a snapshot containing invalid records")
            unsupported = json.dumps({"version": 99, "entries": [], "connections": [], "layout": []})
            evaluate(f"physics.pause();graphNeedsSave=false;localStorage.setItem('galaxy:user-data',{json.dumps(unsupported)})")
            reload_storage_fixture()
            check(evaluate("!storageAvailable && !storageStatus.hidden") and evaluate("localStorage.getItem('galaxy:user-data')") == unsupported, "unsupported future snapshot remains untouched")
            check(not cdp.errors, f"no migration browser exceptions: {cdp.errors}")
            print(f"{count} migration browser checks passed", flush=True)
            return

        g1=add('Food');s1=add('Recipes',g1);s2=add('Ingredients',g1)
        g2=add('Work');s3=add('Development',g2)
        p1=add('Italian',s1);p2=add('Japanese',s1)
        m1=add('Chicken',p1);m2=add('Pasta',p1)
        t1=add('Chicken Parmigiana',m1);t2=add('Chicken Piccata',m1)
        # Seed historical Portal references internally; the creation UI cannot configure them.
        d5=add('Preparation',t1);d6=add('Slow simmer notes',d5)
        wait_for("physics.settled")
        check(evaluate(f"entries.get({json.dumps(g1)}).depth===0 && entries.get({json.dumps(s1)}).depth===1 && entries.get({json.dumps(p1)}).depth===2 && entries.get({json.dumps(m1)}).depth===3 && entries.get({json.dumps(t1)}).depth===4 && entries.get({json.dumps(d6)}).depth===6"), "create multiple Galaxies and a hierarchy through depth six")
        check(hierarchy_edge(g1,s1) and hierarchy_edge(s1,p1) and hierarchy_edge(m1,t1) and hierarchy_edge(d5,d6), "all hierarchy links derive from parent IDs")
        for entry_id, expected in [(g1,'Sun'),(s1,'Planet'),(p1,'Moon'),(m1,'Satellite'),(t1,'Astronaut')]:
            select(entry_id)
            evaluate('openSelectedRowAdd()')
            check(evaluate('addChildButton.textContent')=='Add child', 'contextual Add '+expected)
            evaluate('addChildButton.click()')
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
            check(evaluate(f"physics.particles.get({json.dumps(entry_id)}).fx===null && !layout.get({json.dumps(entry_id)})?.pinned"),body+' remains unpinned and flowing after drag')
            if body!='Galaxy':
                check(evaluate(f"!('x' in layout.get({json.dumps(entry_id)})) && Number.isFinite(layout.get({json.dumps(entry_id)}).angle)"),body+' drag stores a relative influence rather than a coordinate spring')
            check(evaluate(f"entries.get({json.dumps(entry_id)}).parentId==={json.dumps(before['parentId'])}"),body+' drag preserves hierarchy')
        before=evaluate(f"({{...entries.get({json.dumps(t1)})}})")
        parent=evaluate(f"({{...entries.get({json.dumps(m1)})}})");drag_to(m1,parent['x']+100,parent['y']-50)
        check(evaluate(f"Math.hypot(entries.get({json.dumps(t1)}).x-({before['x']}),entries.get({json.dumps(t1)}).y-({before['y']}))>20 && physics.particles.get({json.dumps(t1)}).fx===null"), "Satellite follows its ancestor and remains movable")
        cdp.call('Page.reload');load()
        check(evaluate("[...layout.values()].every(p=>!('pinned' in p)) && [...physics.particles.values()].every(p=>p.fx===null)"), "flowing placement survives refresh without fixed positions")

        for kind,a,b in [('Planet',p1,p2),('Moon',m1,m2),('Satellite',t1,t2)]:
            point=evaluate(f"({{...entries.get({json.dumps(b)})}})");drag_to(a,point['x'],point['y'])
            check(evaluate(f"(()=>{{const a=physics.particles.get({json.dumps(a)}),b=physics.particles.get({json.dumps(b)});return Math.hypot(a.x-b.x,a.y-b.y)>=a.radius+b.radius+12 && a.fx===null && b.fx===null;}})()"),kind+' siblings separate after coincident drops while remaining movable')

        edit(p1,name='Italian recipes',parent=s3);wait_for('physics.settled')
        check(hierarchy_edge(s3,p1) and not hierarchy_edge(s1,p1), "reparenting replaces the derived hierarchy edge")
        check(evaluate(f"entries.get({json.dumps(d6)}).depth===6 && physics.particles.get({json.dumps(d6)}).galaxyId==={json.dumps(g2)}"), "entire reparented subtree joins the new Galaxy")
        edit(t1,parent=s1);wait_for('physics.settled')
        check(evaluate(f"entries.get({json.dumps(t1)}).role==='planet' && entries.get({json.dumps(d6)}).depth===4 && nodes.get({json.dumps(t1)}).dataset.body==='planet'"), "reparenting across depths recomputes descendant roles and appearance")
        edit(t1,parent=m1);wait_for('physics.settled')

        # The appearance UI is intentionally deferred; verify its model contract through Edit/save/refresh.
        evaluate(f"entries.get({json.dumps(p1)}).appearance={{archetype:'oceanic',rings:true,palette:'teal'}};syncPhysicsGraph();saveGalaxy()")
        edit(p1,name='Italian recipes');wait_for('physics.settled');cdp.call('Page.reload');load()
        check(evaluate(f"nodes.get({json.dumps(p1)}).dataset.archetype==='oceanic' && nodes.get({json.dumps(p1)}).dataset.rings==='true' && entries.get({json.dumps(p1)}).appearance.palette==='teal'"), "future appearance overrides survive ordinary Edit and refresh")
        select(g2);evaluate('deleteEntryButton.click()')
        check(evaluate('deleteDialog.open && deleteConfirmationIds.size>1'), "deleting a nonempty Galaxy requires explicit subtree confirmation")
        evaluate('deleteDialog.close()')
        leaf_parent=evaluate(f"entries.get({json.dumps(d6)}).parentId")
        select(d6);evaluate('deleteEntryButton.click()')
        check(evaluate('deleteDialog.open && physics.paused'), "leaf deletion opens confirmation")
        evaluate('document.getElementById("cancel-delete-entry").click()');check(evaluate(f"entries.has({json.dumps(d6)})"), "cancel deletion preserves deep entry")
        evaluate('deleteEntryButton.click();document.getElementById("delete-entry-form").requestSubmit()');wait_for('physics.settled')
        check(evaluate(f"!entries.has({json.dumps(d6)}) && !nodes.has({json.dumps(d6)}) && !physics.particles.has({json.dumps(d6)})"), "confirmed deletion removes deep content and derived state")
        check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(leaf_parent)} && panelName.textContent===entries.get({json.dumps(leaf_parent)}).name"), "deletion safely shows the surviving parent in Details")

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
                    wait_for("[...nodes.values()].filter(n=>n.dataset.culled==='false' && !['galaxy','satellite','astronaut'].includes(n.dataset.body)).every(n=>n.dataset.textureReady==='true')")
                    check(evaluate("[...nodes.values()].filter(n=>n.dataset.culled==='false' && !['galaxy','satellite','astronaut'].includes(n.dataset.body)).every(n=>getComputedStyle(n,'::before').mixBlendMode==='normal' && n.style.getPropertyValue('--surface-map').includes('blob:'))"),prefix+' close surface detail uses cached native overlays')
                check(evaluate('galaxy.dataset.detailLevel')==level,prefix+' semantic tier '+level)
                check_native_rendering(prefix+' native body and text dimensions at '+level)
                check(aligned(),prefix+' hierarchy endpoints align at '+level)
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
            check(evaluate("orbitGuides.every(g=>g.element.tagName==='ellipse') && !hierarchyLayer.querySelector('path.orbit-guide')"),prefix+' has no partial decorative orbit arcs')
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
            check(evaluate("(()=>{const p=panel.getBoundingClientRect();return [entryActions,addChildButton].every(el=>{const a=el.getBoundingClientRect();return a.top>=p.top&&a.bottom<=p.bottom;});})()"),label+' keeps contextual actions visible')
            evaluate('editEntryButton.click()');check(evaluate('dialog.open && parentField.value===entries.get(editingId).parentId'),label+' Edit loads correct deep parent');evaluate('dialog.close()')
            if screenshot_dir:
                evaluate('fitGalaxy(false)');time.sleep(.2);result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                (screenshot_dir/f'normal-fit-{label}.png').write_bytes(base64.b64decode(result['data']))

        wait_for('physics.settled');evaluate('physics.pause();saveGalaxy()');real_snapshot=evaluate("localStorage.getItem('galaxy:user-data')")
        evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof physics!=='undefined' && sampleMode");wait_for('physics.settled',timeout=25);wait_camera()
        check(evaluate('entries.size===187 && physics.galaxies.size===4 && physics.systems.size===8'), "stress sample contains 187 entries across four Galaxies and eight Suns")
        check(evaluate("new Set([...entries.values()].filter(e=>e.depth===0).map(e=>galaxyAppearance.resolve(e).archetype)).size===4"), "sample shows four stable Galaxy archetypes")
        check(evaluate("new Set([...entries.values()].filter(e=>e.depth===2).map(e=>galaxyAppearance.resolve(e).archetype)).size===6 && [...nodes.values()].filter(n=>n.dataset.rings==='true').length>0 && [...nodes.values()].filter(n=>n.dataset.rings==='true').length<12"), "sample shows six Planet archetypes with occasional rings")
        check(evaluate("localStorage.getItem('galaxy:user-data')")==real_snapshot, "sample loading never modifies real saved data")
        check(evaluate("loadSampleButton.disabled && !removeSampleButton.disabled && !location.search.includes('sample')"), "sample activation is temporary and explicit")
        check(evaluate("(()=>{const g=[...physics.galaxies.values()];return g.every((a,i)=>g.slice(i+1).every(b=>Math.hypot(a.root.x-b.root.x,a.root.y-b.root.y)>(a.radius+b.radius)*.85));})()"), "Galaxy regions retain separate soft footprints")
        check(evaluate("[...physics.galaxies.values()].every(g=>g.systems.every(s=>Math.hypot(s.root.x-g.root.x,s.root.y-g.root.y)+s.radius<g.radius*1.2))"), "solar systems remain inside their Galaxy regions")
        capture_levels('sample','sample-galaxy-0','sample-sun-0','sample-planet-0-0','sample-satellite-0-0-0-0')
        evaluate("searchField.value='Slow simmer';searchField.dispatchEvent(new Event('input'));searchResultList.querySelector('button').click()");wait_camera()
        check(evaluate("selectedNode.dataset.entryId==='sample-deep-7' && panelAncestry.querySelectorAll('button').length===7 && galaxyModel.ancestors(entries,'sample-deep-7').every(e=>nodes.get(e.id).classList.contains('related'))"), "depth-seven sample search reveals Galaxy, Sun and every intermediate ancestor")
        baseline=motion_metrics()
        baseline_responsive=baseline['renderP95']<20 and baseline['frameMedian']<55 and baseline['frameP95']<120
        baseline_title=f"187-body baseline motion responsive: render p95 {baseline['renderP95']:.1f}ms, frame median/p95 {baseline['frameMedian']:.1f}/{baseline['frameP95']:.1f}ms"
        # Finish drag/sample-isolation checks before reporting a paint-budget
        # failure. Keep the same threshold and failing exit status.
        if not baseline_responsive: print('FAIL '+baseline_title+' (deferred until functional checks finish)',flush=True)
        cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=2,mobile=False);time.sleep(.2);check_native_rendering('native projection holds on a 2x display')
        if screenshot_dir:
            result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/'sample-deep-2x.png').write_bytes(base64.b64decode(result['data']))
        cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
        for body,entry_id in [('Galaxy','sample-galaxy-0'),('Sun','sample-sun-0'),('Planet','sample-planet-0-0'),('Moon','sample-moon-0-0-0'),('Satellite','sample-satellite-0-0-0-0')]:
            before=evaluate(f"({{...entries.get({json.dumps(entry_id)})}})");drag_to(entry_id,before['x']+100,before['y']+60,settle_timeout=60)
            check(evaluate("physics.particles.get(selectedNode.dataset.entryId).fx===null && !document.getElementById('panel-placement')"), 'stress sample '+body+' dragging remains flowing')
        check(evaluate("localStorage.getItem('galaxy:user-data')")==real_snapshot, "sample search, drag and layout remain isolated")
        stress=motion_metrics()
        check(stress['renderP95']<20, f"187-body projection stays within budget after DPR switching ({stress['renderP95']:.1f}ms p95)")
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
