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
    args.add_argument("--connections-only", action="store_true", help="Check semantic connection creation, persistence, cleanup and sample visibility")
    args.add_argument("--connection-lines-only", action="store_true", help="Check semantic line hover, hit-testing, navigation, synchronization and touch previews")
    args.add_argument("--travel-only", action="store_true", help="Check optional descriptions and distance-aware semantic travel, arrival and interruption")
    args.add_argument("--cloud-fade-only", action="store_true", help="Check early responsive cloud fading, identity, smooth zoom and stability on desktop/laptop/narrow canvas")
    args.add_argument("--astronaut-only", action="store_true", help="Check deep Astronaut creation, tethers, compact clusters, persistence, search and semantic links")
    args.add_argument("--crud-only", action="store_true", help="Check camera-stable CRUD, blank descriptions, safe subtree deletion and selection/storage recovery")
    args.add_argument("--ownership-only", action="store_true", help="Check starter/migrated deletion, legacy flag loading, subtree file/link cleanup, persistence and Sample isolation")
    args.add_argument("--content-only", action="store_true", help="Check notes/links, binary IndexedDB files, previews, failure atomicity, deletion and Sample isolation")
    args.add_argument("--organizer-only", action="store_true", help="Check contextual Add, read-first contents, item menus, breadcrumbs and the full Rich Content backend")
    args.add_argument("--workspace-only", action="store_true", help="Check polished tree/modal, quiet content, overflow management and header connections alongside Rich Content storage")
    args.add_argument("--row-actions-only", action="store_true", help="Check row-specific Add targeting, hover/focus/touch access and header More alignment")
    args.add_argument("--connections-performance-only", action="store_true", help="Measure the large sample's deep-focus motion with and without semantic line paint")
    args.add_argument("--baseline-head", action="store_true", help="Use a temporary read-only HEAD snapshot for the connection performance comparison")
    args.add_argument("--capture-baseline", action="store_true", help="Capture sizes before tuning without running new arrangement assertions")
    args.add_argument("--sizes-only", action="store_true", help="Check desktop/mobile native sizes without repeating drag cases")
    args.add_argument("--extremes-only", action="store_true", help="Check only extreme Planet/Moon recovery in the arrangement suite")
    options = args.parse_args()
    if options.baseline_head and not options.connections_performance_only:
        args.error('--baseline-head requires --connections-performance-only')
    browser = find_browser()
    temp_root = Path(tempfile.gettempdir()).resolve()
    baseline_root = None
    if options.baseline_head:
        baseline_root = Path(tempfile.mkdtemp(prefix='galaxy-baseline-')).resolve()
        assert baseline_root.is_relative_to(temp_root)
        for name in ['index.html','style.css','model.js','appearance.js','cosmos-view.js','sample-data.js','storage.js','vendor/d3-force.bundle.min.js','physics.js','background.js','camera.js','hierarchy.js','script.js']:
            target=baseline_root/name;target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(subprocess.run(['git','-c',f'safe.directory={ROOT.as_posix()}','show',f'HEAD:{name}'],cwd=ROOT,check=True,stdout=subprocess.PIPE).stdout)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(baseline_root or ROOT)))
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
            assert evaluate("!relationships.some(c=>c.from===selectedNode.dataset.entryId||c.to===selectedNode.dataset.entryId)"), "Creation must add no semantic relationships"
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
                const m=connectionsLayer.getScreenCTM();return [[from,'x1','y1'],[to,'x2','y2']].every(([id,x,y])=>{
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
        check(evaluate("relationships.length===3"), "legacy semantic relationships remain separate")
        check(evaluate("localStorage.getItem('galaxy:user-data:pre-cosmic-tree')") == old_raw, "exact original snapshot retained before migration")
        check(evaluate("JSON.parse(localStorage.getItem('galaxy:user-data')).version===5 && JSON.parse(localStorage.getItem('galaxy:user-data')).entries.every(e=>!('role' in e) && !('depth' in e))"), "version 5 persists generic ancestry without hardcoded roles or depth")
        check(evaluate("!document.querySelector('#pin-position-button,[data-action=pin],#panel-placement,#panel-role,#connection-options') && !panel.textContent.includes('Moves naturally') && !dialog.textContent.includes('Other connections') && roleField.tagName==='OUTPUT' && [...entries.values()].every(e=>e.depth>=0)"), "normal UI derives roles without pin, physics status or relationship controls")

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
            evaluate(f"startConnectionMode({json.dumps(work)});connectEntries({json.dumps(remote)});startConnectionMode('vs-code');connectEntries({json.dumps(remote)});physics.pause();saveGalaxy()")
            unrelated=evaluate(f"JSON.stringify(relationships.filter(link=>link.from==={json.dumps(work)}&&link.to==={json.dumps(remote)}))")
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
            check(evaluate('JSON.stringify(relationships)')==unrelated,'incident semantic links are removed and unrelated connection records remain intact')
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(work)}&&hierarchySidebar.selectedId==={json.dumps(work)}&&panelName.textContent==='Work'"),'deleted selection falls back to the nearest surviving ancestor')
            check(evaluate('JSON.stringify(camera.view)')==before,'starter subtree deletion preserves the exact camera')
            check(evaluate(f"{json.dumps(expanded)}.filter(id=>entries.has(id)).every(id=>hierarchySidebar.expanded.has(id))"),'surviving sidebar expansions remain stable')
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate(f"{json.dumps(removed)}.every(id=>!entries.has(id))&&entries.has({json.dumps(work)})&&entries.has({json.dumps(remote)})") and evaluate('JSON.stringify(relationships)')==unrelated,'refresh persists deletion and never resurrects starter defaults')
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
            evaluate(f"startConnectionMode({json.dumps(first)});connectEntries({json.dumps(target)})")
            check(evaluate("(()=>{const c=document.getElementById('connect-entry-button').getBoundingClientRect(),m=moreButton.getBoundingClientRect();return Math.abs(c.top+c.height/2-m.top-m.height/2)<.1&&m.width===28&&m.height===28&&m.left>c.right&&moreButton.ariaLabel==='More actions'&&moreButton.title==='More actions'})()"),'More actions has a compact footprint aligned with Connections and the requested accessible label')
            for action,condition in [('edit-entry-button',"dialog.open && !document.getElementById('entry-info-fields').hidden"),('move-entry-button',"dialog.open && !document.getElementById('parent-field').hidden"),('delete-entry-button','deleteDialog.open')]:
                click_selector('#entry-more-button');click_selector('#'+action)
                check(evaluate(condition),'header More reuses '+action)
                evaluate('if(dialog.open)document.getElementById("cancel-add-entry").click();if(deleteDialog.open)deleteDialog.close();physics.pause()')
            if screenshot_dir:
                result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/'row-actions-desktop.png').write_bytes(base64.b64decode(result['data']))
            cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=False);time.sleep(.2)
            evaluate('hierarchySidebar.setCollapsed(false)');wait_camera();evaluate(f"physics.pause();hierarchySidebar.scrollRow({json.dumps(chain[-1])})")
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
                check(evaluate("!entryActions.hidden && [...entryActions.children].filter(b=>!b.hidden).map(b=>b.textContent).join('|')==='Edit info|Move / change parent|Delete'"),'More contains management actions without permanent metadata')
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
                evaluate("document.getElementById('connect-entry-button').click()")
                check(evaluate("!connectionPicker.hidden && connectionSourceId===selectedNode.dataset.entryId"),'header Connect launches existing target selection')
                evaluate(f"connectEntries({json.dumps(other)})")
                check(evaluate(f"relationships.some(r=>r.from==={json.dumps(owner)}&&r.to==={json.dumps(other)}) && document.getElementById('connection-action-label').textContent==='Connections 1' && document.getElementById('panel-connections').hidden"),'existing connections appear as a compact header count')
                evaluate("document.getElementById('connect-entry-button').click()")
                check(evaluate("!document.getElementById('panel-connections').hidden && document.getElementById('new-connection-button').textContent.includes('Connect')"),'Connections reveals existing destinations and the existing Connect workflow together')
                evaluate("document.querySelector('#panel-connection-list .connection-name').click()");wait_camera();evaluate('physics.pause()')
                check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(other)} && contentInspector.entryId==={json.dumps(other)}"),'connected-item navigation updates contents through existing travel')
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
                check(evaluate("!document.querySelector('#content-add-files,#content-add-link') && document.getElementById('content-edit-notes').hidden && contentInspector.notesForm.hidden && contentInspector.linkForm.hidden && document.getElementById('content-file-limit').hidden"),'read state has no duplicate Add buttons, editing forms, or technical upload information')
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
            semantic=evaluate('JSON.stringify(relationships)')
            link('https://example.com/recipe','Recipe');link('https://example.org/reference')
            check(evaluate(f"entries.get({json.dumps(owner)}).content.links.length===2 && [...document.querySelectorAll('#content-links a')].every(a=>a.target==='_blank'&&a.rel.includes('noopener'))"),'multiple readable links have stable IDs and safe new-tab actions')
            link_id=evaluate(f"entries.get({json.dumps(owner)}).content.links[0].id")
            evaluate("contentInspector.editLink(contentInspector.content().links[0]);document.getElementById('content-link-title').value='Updated recipe';contentInspector.linkForm.requestSubmit()")
            check(evaluate(f"entries.get({json.dumps(owner)}).content.links[0].id==={json.dumps(link_id)} && contentInspector.content().links[0].title==='Updated recipe'"),'link editing retains its canonical ID')
            link('javascript:alert(1)')
            check(evaluate("contentInspector.content().links.length===2 && contentInspector.status.dataset.error==='true'"),'unsafe URL schemes are rejected before saving')
            evaluate("contentInspector.linkForm.hidden=true;document.querySelectorAll('#content-links .content-row-actions')[1].lastElementChild.click()")
            check(evaluate('contentInspector.content().links.length===1'),'link removal removes only its own content record')
            stable(before,'link add/edit/remove leave camera state unchanged');check(evaluate('JSON.stringify(relationships)')==semantic,'web links never create semantic connections')
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
                    check(evaluate("getComputedStyle(document.querySelector('#content-links summary')).opacity==='1' && getComputedStyle(document.getElementById('content-edit-notes')).opacity==='1' && document.getElementById('content-edit-notes').getBoundingClientRect().width===32"),'mobile edit and overflow affordances stay discoverable without hover')
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
            links=[{'id':'crud-local','from':ids[4],'to':ids[5],'type':'related'},
                {'id':'crud-system','from':deep,'to':outside,'type':'uses','label':'Research'},
                {'id':'crud-galaxy','from':'codex','to':ids[5],'type':'references'},
                {'id':'crud-unrelated','from':outside,'to':remote,'type':'uses','label':'Keep intact'}]
            evaluate(f"relationships.push(...galaxyModel.normalizeConnections({json.dumps(links)},entries));refreshConnectionViews();saveGalaxy();focusEntry({json.dumps(deep)})");wait_camera()
            old_links=evaluate('JSON.stringify(relationships)');before=evaluate('({...camera.view})')
            evaluate(f"openEntryForm(entries.get({json.dumps(deep)}));parentField.value={json.dumps(ids[4])};form.requestSubmit();physics.pause()")
            check(equal_view(before,evaluate('({...camera.view})')) and evaluate('JSON.stringify(relationships)')==old_links,'reparenting preserves camera and stable semantic records')
            evaluate(f"openEntryForm(entries.get({json.dumps(deep)}));parentField.value={json.dumps(ids[5])};form.requestSubmit();physics.pause()")
            evaluate(f"focusEntry({json.dumps(deep)})");wait_camera();wait_for('physics.settled');evaluate('physics.pause();saveGalaxy()')
            evaluate("hierarchySidebar.setCollapsed(false);hierarchySidebar.tree.style.maxHeight='180px';hierarchySidebar.tree.scrollTop=120")
            subtree_count=evaluate(f"galaxyModel.subtreeIds(entries,{json.dumps(branch)}).size")
            raw=evaluate("localStorage.getItem('galaxy:user-data')");model_before=evaluate('JSON.stringify(getGalaxySnapshot())')
            expanded=evaluate('[...hierarchySidebar.expanded]');scroll=evaluate('hierarchySidebar.tree.scrollTop');before=evaluate('({...camera.view})')
            evaluate(f"requestEntryDelete({json.dumps(branch)})")
            check(evaluate(f"deleteDialog.open && document.getElementById('delete-entry-title').textContent.includes('everything inside it') && document.getElementById('delete-entry-message').textContent.includes('{subtree_count} entries') && document.getElementById('confirm-delete-entry').textContent==='Delete {subtree_count} entries'"),'parent confirmation names the entire subtree and exact destructive count')
            if screenshot_dir:
                result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False);(screenshot_dir/'crud-subtree-confirmation.png').write_bytes(base64.b64decode(result['data']))
            click_selector('#cancel-delete-entry');evaluate('physics.pause()')
            check(evaluate('JSON.stringify(getGalaxySnapshot())')==model_before and evaluate("localStorage.getItem('galaxy:user-data')")==raw and equal_view(before,evaluate('({...camera.view})')),'Cancel leaves model, storage and camera untouched')
            check(evaluate('[...hierarchySidebar.expanded]')==expanded and evaluate('hierarchySidebar.tree.scrollTop')==scroll,'Cancel preserves sidebar expansion and scroll')
            deleted_ids=evaluate(f"[...galaxyModel.subtreeIds(entries,{json.dumps(branch)})]")
            unrelated=evaluate(f"JSON.stringify(relationships.filter(l=>!{json.dumps(deleted_ids)}.includes(l.from)&&!{json.dumps(deleted_ids)}.includes(l.to)))")
            result=evaluate(f"(()=>{{const positions=[...physics.particles].filter(([id])=>!{json.dumps(deleted_ids)}.includes(id)).map(([id,n])=>[id,n.x,n.y]);requestEntryDelete({json.dumps(branch)});document.getElementById('delete-entry-form').requestSubmit();physics.pause();return {{view:{{...camera.view}},positions:positions.every(([id,x,y])=>physics.particles.get(id).x===x&&physics.particles.get(id).y===y)}};}})()")
            check(equal_view(before,result['view']) and result['positions'],'subtree deletion preserves camera and surviving world coordinates')
            check(evaluate(f"{json.dumps(deleted_ids)}.every(id=>!entries.has(id)&&!nodes.has(id)&&!layout.has(id)&&!physics.particles.has(id)&&!hierarchySidebar.rows.has(id))"),'one confirmation removes the entire deep branch from every derived index')
            check(evaluate('JSON.stringify(relationships)')==unrelated and evaluate("relationships.every(l=>entries.has(l.from)&&entries.has(l.to)) && lines.every(l=>entries.has(l.from)&&entries.has(l.to))"),'local/system/Galaxy incident links disappear while unrelated metadata remains intact')
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(parent)} && hierarchySidebar.selectedId==={json.dumps(parent)} && panelName.textContent===entries.get({json.dumps(parent)}).name && !panelAncestry.textContent.includes('CRUD depth 6')"),'deleted selection recovers to its surviving ancestor without stale inspector data')
            check(evaluate(f"{json.dumps(expanded)}.filter(id=>!{json.dumps(deleted_ids)}.includes(id)).every(id=>hierarchySidebar.expanded.has(id)) && Math.abs(hierarchySidebar.tree.scrollTop-Math.min({scroll},hierarchySidebar.tree.scrollHeight-hierarchySidebar.tree.clientHeight))<1"),'unaffected branch expansion and practical scroll position survive deletion')
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate(f"{json.dumps(deleted_ids)}.every(id=>!entries.has(id)) && entries.has({json.dumps(outside)}) && entries.has({json.dumps(remote)})") and evaluate('JSON.stringify(relationships)')==unrelated,'refresh persists subtree removal and unrelated hierarchy/connections')
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
            check(equal_view(before,evaluate('({...camera.view})')) and evaluate("selectedNode===null && panel.hidden && panelAncestry.children.length===0 && document.getElementById('panel-connection-list').children.length===0"),'root deletion clears selection/inspector safely without reframing')
            evaluate(f"focusEntry({json.dumps(parent)})");wait_camera();selected=evaluate('selectedNode.dataset.entryId')
            evaluate(f"requestEntryDelete({json.dumps(outside)});document.getElementById('delete-entry-form').requestSubmit();physics.pause()")
            check(evaluate('selectedNode.dataset.entryId')==selected,'deleting an unselected item retains the current selection')
            evaluate('resetViewButton = document.getElementById("reset-view-button");resetViewButton.click()');wait_camera()
            check(evaluate('camera.view.scale>0 && camera.frame===null'),'explicit Fit remains available after CRUD')
            evaluate('physics.pause();if(graphNeedsSave)saveGalaxy()')
            raw=evaluate("localStorage.getItem('galaxy:user-data')")
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode");load();wait_camera()
            evaluate("requestEntryDelete('sample-planet-0-0');document.getElementById('delete-entry-form').requestSubmit()")
            check(evaluate("sampleMode && !entries.has('sample-planet-0-0') && relationships.every(l=>entries.has(l.from)&&entries.has(l.to))") and evaluate("localStorage.getItem('galaxy:user-data')")==raw,'temporary Sample subtree deletion never changes real saved data')
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
            check(evaluate("lines.filter(l=>l.element.classList.contains('astronaut-tether')).every(l=>l.kind==='hierarchy' && l.element.tagName==='path' && l.element.getAttribute('d').includes('Q') && l.element.getAttribute('aria-hidden')==='true' && !l.interactive && getComputedStyle(l.element).strokeDasharray==='none')") and tethers_aligned(),'curved solid hierarchy tethers remain separate from interactive relationships')
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
            evaluate(f"focusEntry({json.dumps(deep)})");wait_camera()
            evaluate(f"startConnectionMode({json.dumps(deep)});connectionSearch.value='Codex';connectionSearch.dispatchEvent(new Event('input'));connectionResults.querySelector('button:not(:disabled)').click()")
            check(evaluate(f"relationships.some(l=>l.from==={json.dumps(deep)}&&l.to==='codex') && entries.get({json.dumps(deep)}).parentId==={json.dumps(ids[7])}"),'Astronaut semantic connections preserve the single structural parent')
            evaluate('fitGalaxy(false)');wait_camera()
            point=evaluate(f"(()=>{{const l=lines.find(l=>l.kind==='relationship'&&l.from==={json.dumps(deep)}),{{start,end}}=connectionSegment(l);return {{x:(start.x+end.x)/2,y:(start.y+end.y)/2}};}})()")
            mouse('mouseMoved',**point)
            check(evaluate("!connectionHint.hidden && connectionHint.textContent.includes('EVA Astronaut 8') && connectionHint.textContent.includes('Codex') && lines.filter(l=>l.element.classList.contains('astronaut-tether')).every(l=>+l.element.style.opacity===0)"),'far zoom keeps interactive dashed semantic links distinct from hidden tethers')
            mouse('mousePressed',**point,button='left',clickCount=1);mouse('mouseReleased',**point,button='left',clickCount=1);wait_camera()
            check(evaluate("selectedNode.dataset.entryId==='codex' && panelName.textContent==='Codex'"),'Astronaut relationship line preserves opposite-endpoint semantic travel')
            evaluate(f"focusEntry({json.dumps(deep)});saveGalaxy()");wait_camera()
            cdp.call('Page.reload');load();wait_camera();evaluate('physics.pause()')
            check(evaluate(f"relationships.some(l=>l.from==={json.dumps(deep)}&&l.to==='codex') && entries.get({json.dumps(deep)}).description===''") ,'deep semantic links and optional descriptions survive refresh')
            evaluate(f"clearSelection();camera.setView({{...camera.view,scale:.2}},false);searchField.value='EVA Astronaut 8';searchField.dispatchEvent(new Event('input'))")
            check(evaluate(f"nodes.get({json.dumps(deep)}).classList.contains('temporarily-revealed') && lines.some(l=>l.to==={json.dumps(deep)}&&l.element.classList.contains('astronaut-tether')&&+l.element.style.opacity>0)"),'search reveals a deep Astronaut and its tether ancestry at far zoom')
            evaluate('searchResultList.querySelector("button").click()');wait_camera()
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(deep)} && panelName.textContent==='EVA Astronaut 8' && !nodes.get({json.dumps(deep)}).inert && camera.view.scale>=1.7"),'deep search focuses, selects, expands and opens the inspector normally')
            evaluate('fitGalaxy(false)');wait_camera()
            check_rendered("[...nodes.values()].filter(n=>n.dataset.body==='astronaut').every(n=>n.inert&&getComputedStyle(n).opacity==='0') && lines.filter(l=>l.element.classList.contains('astronaut-tether')).every(l=>getComputedStyle(l.element).display==='none')",'Universe zoom hides Astronauts and their tethers without sticky focus reveals')
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

        if options.travel_only:
            # Use actual submit clicks so both native and custom validation run.
            ids = []
            for depth, role in enumerate(['Galaxy', 'Sun', 'Planet', 'Moon', 'Satellite', 'Astronaut']):
                parent = ids[-1] if ids else None
                evaluate(f"{'createChildEntry('+json.dumps(parent)+')' if parent else 'openEntryForm()'};fields[0].value={json.dumps('Name only '+role)};fields[1].value='';fields[2].value=''")
                check(evaluate("form.checkValidity() && fields[0].required && !fields[1].required && !fields[2].required"), role+' accepts an empty Description in native validation')
                click_selector('#entry-submit')
                check(evaluate(f"!dialog.open && entries.get(selectedNode.dataset.entryId).description==='' && entries.get(selectedNode.dataset.entryId).depth==={depth} && entries.get(selectedNode.dataset.entryId).parentId==={json.dumps(parent)}"), 'name-only '+role+' saves with its contextual parent')
                ids.append(evaluate('selectedNode.dataset.entryId'))
                wait_camera()
            evaluate(f"openEntryForm(entries.get({json.dumps(ids[2])}));fields[1].value='Remove this description';form.requestSubmit()")
            evaluate(f"openEntryForm(entries.get({json.dumps(ids[2])}));fields[1].value='';form.requestSubmit()")
            check(evaluate(f"!dialog.open && entries.get({json.dumps(ids[2])}).description===''") ,'Edit can remove an existing Description completely')
            evaluate("openEntryForm();fields[0].value='';fields[1].value='';form.requestSubmit()")
            check(evaluate('dialog.open && fields[0].validity.valueMissing && !fields[1].validity.valueMissing'),'empty name remains required without requiring Description')
            evaluate('dialog.close()');wait_camera()
            cdp.call('Page.reload');load();wait_camera()
            check(evaluate(f"storageAvailable && {json.dumps(ids)}.every(id=>entries.get(id)?.description==='')"),'all hierarchy levels and cleared descriptions survive refresh')
            check(evaluate(f"JSON.parse(localStorage.getItem('galaxy:user-data')).entries.filter(e=>{json.dumps(ids)}.includes(e.id)).every(e=>e.description==='')"),'persistence stores empty descriptions as strings in schema 5')

            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode");load();wait_camera()
            evaluate('physics.pause();camera.setReducedMotion(false)')
            raw = evaluate("localStorage.getItem('galaxy:user-data')")
            def preview(name):
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                    (screenshot_dir/(name+'.png')).write_bytes(base64.b64decode(result['data']))
            def frame(entry_id):
                evaluate(f"focusEntry({json.dumps(entry_id)})");wait_camera()
            def record():
                evaluate("window.travelFrames=[];window.travelOriginal=camera.onChange;camera.onChange=v=>{travelOriginal(v);travelFrames.push({...v,time:performance.now()});}")
            def stop_record():
                evaluate('camera.onChange=travelOriginal')
                return evaluate('travelFrames')
            def row_click(target_id):
                evaluate(f"[...document.querySelectorAll('#panel-connection-list .connection-name')].find(b=>b.textContent===entries.get({json.dumps(target_id)}).name).click()")
            def line_click(id):
                point=evaluate(f"(()=>{{const {{start,end}}=connectionSegment(lines.find(l=>l.id==={json.dumps(id)}));return {{x:(start.x+end.x)/2,y:(start.y+end.y)/2}};}})()")
                mouse('mouseMoved',**point);mouse('mousePressed',**point,button='left',clickCount=1);mouse('mouseReleased',**point,button='left',clickCount=1)
            def arrived(target_id):
                return evaluate(f"(()=>{{const e=entries.get({json.dumps(target_id)}),p=camera.worldToScreen(e.x,e.y),r=nodes.get(e.id).getBoundingClientRect(),row=hierarchySidebar.rows.get(e.id),b=hierarchySidebar.tree.getBoundingClientRect();return selectedNode.dataset.entryId===e.id && panelName.textContent===e.name && hierarchySidebar.selectedId===e.id && row.classList.contains('is-selected') && row.getBoundingClientRect().top>=b.top-1 && row.getBoundingClientRect().bottom<=b.bottom+1 && galaxyModel.ancestors(entries,e.id).every(a=>hierarchySidebar.expanded.has(a.id)) && !nodes.get(e.id).inert && Math.abs(p.x-(physics.bounds.left+physics.bounds.right)/2)<1 && Math.abs(p.y-(physics.bounds.top+physics.bounds.bottom)/2)<1 && !camera.travel;}})()")
            codex='sample-moon-0-1-0';editor='sample-satellite-0-0-0-0'
            frame(codex);record();line_click('sample-connection-0')
            near_plan=evaluate('({duration:camera.travel?.duration,distant:camera.travel?.distant,startScale:camera.travel?.startScale})')
            check(near_plan['distant'] is False and 450<=near_plan['duration']<=650,'same-system line click starts a short eased local transition')
            wait_camera();near_frames=stop_record()
            check(min(v['scale'] for v in near_frames)>=near_plan['startScale']-.001,'nearby travel avoids unnecessary zoom-out')
            check(arrived(editor),'line travel selects and reveals the destination in the inspector and expanded visible sidebar')
            line_target=evaluate('({...camera.target})')
            frame(codex);record();row_click(editor)
            check(evaluate('camera.travel!==null'),'inspector connection row invokes semantic travel')
            wait_camera();stop_record()
            check(evaluate('({...camera.target})')==line_target and arrived(editor),'row and line travel share the exact focus destination')
            row_click(codex);wait_camera()
            check(arrived(codex),'opposite endpoint can travel back through its inspector row')

            recipe='sample-satellite-2-0-0-0';ingredient='sample-moon-3-2-0'
            frame(recipe);record();row_click(ingredient)
            system_plan=evaluate('({duration:camera.travel?.duration,distant:camera.travel?.distant,contextScale:camera.travel?.contextScale})')
            check(system_plan['distant'] and 800<=system_plan['duration']<=1100,'separate solar systems use distance-aware context travel')
            wait_camera();system_frames=stop_record()
            check(min(v['scale'] for v in system_frames)<=system_plan['contextScale']+.005 and arrived(ingredient),'cross-system travel zooms out and arrives at an identifiable local hierarchy')

            hiking='sample-moon-5-2-0';cardio='sample-moon-7-0-1'
            frame(hiking);preview('travel-depart');record();row_click(cardio)
            far_plan=evaluate('({duration:camera.travel?.duration,distant:camera.travel?.distant,startScale:camera.travel?.startScale,contextScale:camera.travel?.contextScale})')
            check(far_plan['distant'] and 1200<=far_plan['duration']<=1500 and far_plan['contextScale']<far_plan['startScale'],'cross-Galaxy route uses noticeable context and a capped duration')
            time.sleep(far_plan['duration']/2000);preview('travel-context')
            wait_camera();far_frames=stop_record();preview('travel-arrive')
            check(min(v['scale'] for v in far_frames)<=far_plan['contextScale']+.005 and far_frames[-1]['scale']>=1.2 and arrived(cardio),'cross-Galaxy travel departs, traverses context, and restores useful arrival zoom')
            check(len(far_frames)>=8 and far_frames[-1]['time']-far_frames[0]['time']<=far_plan['duration']+180,'travel presents multiple intermediate frames and completes promptly')
            if screenshot_dir:
                (screenshot_dir/'travel-traces.json').write_text(json.dumps({'near':near_frames,'system':system_frames,'crossGalaxy':far_frames,'plans':[near_plan,system_plan,far_plan]},indent=2),encoding='utf-8')
            row_click(hiking);wait_camera();check(arrived(hiking),'cross-Galaxy travel works in the reverse direction')

            # Interrupt the actual semantic row route through real pointer/key input.
            row_click(cardio);time.sleep(.12)
            point=evaluate('({x:(physics.bounds.left+physics.bounds.right)/2,y:(physics.bounds.top+physics.bounds.bottom)/2})')
            visible=evaluate('({...camera.view})')
            mouse('mouseWheel',**point,deltaY=90,deltaX=0)
            check(evaluate('!camera.travel'),'wheel immediately cancels the semantic route')
            wait_camera();check(evaluate('camera.view.scale')<visible['scale'],'wheel applies zoom from the visible view instead of the travel destination')
            frame(hiking);row_click(cardio);time.sleep(.12)
            before_pan=evaluate('({...camera.view})')
            mouse('mousePressed',x=1050,y=890,button='left',clickCount=1)
            frozen=evaluate('({...camera.view})')
            mouse('mouseMoved',x=1080,y=910,button='left',buttons=1);mouse('mouseReleased',x=1080,y=910,button='left',clickCount=1)
            check(evaluate('!camera.travel && camera.frame===null') and abs(evaluate('camera.view.x')-frozen['x']-30)<.1 and abs(evaluate('camera.view.y')-frozen['y']-20)<.1,'pan interrupts travel and immediately follows the pointer')
            frame(hiking);row_click(cardio);time.sleep(.12)
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
            stopped=evaluate('({...camera.view})');time.sleep(.15)
            check(evaluate('!camera.travel && camera.frame===null && !panel.hidden') and evaluate('({...camera.view})')==stopped,'Escape freezes the route without closing the inspector')
            frame(hiking);row_click(cardio)
            # The selected target may be off-screen; use the still-visible source body.
            point=evaluate(f"(()=>{{const r=nodes.get({json.dumps(hiking)}).getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}};}})()")
            mouse('mousePressed',**point,button='left',clickCount=1)
            check(evaluate('!camera.travel && activeNodeDrags===1 && camera.frame===null'),'starting a body drag stops travel before converting pointer coordinates')
            mouse('mouseReleased',**point,button='left',clickCount=1);evaluate('physics.pause()')
            cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'reduce'}]);wait_for('camera.reducedMotion')
            frame(hiking);row_click(cardio)
            check(evaluate('camera.frame===null && !camera.travel') and arrived(cardio),'reduced motion uses simple immediate focus with full selection and arrival state')
            check(evaluate("localStorage.getItem('galaxy:user-data')")==raw,'travel does not alter saved relationships or real data during Sample use')
            check(not cdp.errors,f'no optional-description/travel browser exceptions: {cdp.errors}')
            print(f'{count} optional-description/travel browser checks passed',flush=True)
            return

        if options.connection_lines_only:
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode");load();wait_camera()
            evaluate('physics.pause()')
            raw=evaluate("localStorage.getItem('galaxy:user-data')")
            codex='sample-moon-0-1-0';editor='sample-satellite-0-0-0-0';link_id='sample-connection-0'
            def frame(entry_id):
                evaluate(f"focusEntry({json.dumps(entry_id)})");wait_camera()
            def line_point(id,t=.5,offset=0):
                return evaluate(f"(()=>{{const link=lines.find(link=>link.id==={json.dumps(id)}),{{start,end}}=connectionSegment(link),dx=end.x-start.x,dy=end.y-start.y,d=Math.hypot(dx,dy);return {{x:start.x+dx*{t}-dy/d*{offset},y:start.y+dy*{t}+dx/d*{offset}}};}})()")
            def line_click(id,t=.5):
                point=line_point(id,t)
                mouse('mouseMoved',**point);mouse('mousePressed',**point,button='left',clickCount=1);mouse('mouseReleased',**point,button='left',clickCount=1)
                wait_camera()
            def preview(name):
                if screenshot_dir:
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                    (screenshot_dir/(name+'.png')).write_bytes(base64.b64decode(result['data']))
            frame(codex)
            target_outline=evaluate(f"parseFloat(getComputedStyle(nodes.get({json.dumps(editor)})).outlineColor.split(',').at(-1))")
            point=line_point(link_id,offset=4);mouse('mouseMoved',**point)
            check(evaluate(f"hoveredConnectionId==={json.dumps(link_id)} && !connectionHint.hidden && connectionHint.textContent.includes('Codex') && connectionHint.textContent.includes('VS Code')"),'hover within the invisible hit margin shows both endpoint names')
            check(evaluate("connectionHint.textContent.includes('Related')"),'generic relationship type appears in the tooltip')
            check(evaluate(f"Math.abs(parseFloat(lines.find(link=>link.id==={json.dumps(link_id)}).element.style.strokeWidth)*camera.view.scale-1)<.001 && !connectionsLayer.querySelector('.connection-hit')"),'hover hit area does not thicken or duplicate the visible stroke')
            check(evaluate(f"nodes.get({json.dumps(codex)}).classList.contains('connection-hover-endpoint') && nodes.get({json.dumps(editor)}).classList.contains('connection-hover-endpoint')"),'hover emphasizes both endpoints without dimming the scene')
            check(evaluate(f"parseFloat(getComputedStyle(nodes.get({json.dumps(editor)})).outlineColor.split(',').at(-1))>{target_outline}+.1"),'hover emphasis visibly overrides the target’s quieter selection-context outline')
            check(evaluate('(()=>{const r=connectionHint.getBoundingClientRect();return r.left>=8&&r.top>=8&&r.right<=innerWidth-7&&r.bottom<=innerHeight-7&&getComputedStyle(connectionHint).pointerEvents===\'none\'})()'),'desktop tooltip stays inside the viewport and does not intercept input')
            preview('semantic-line-hover')
            check(evaluate(f"hitConnection({json.dumps(line_point(link_id,offset=7))})?.link.id!=={json.dumps(link_id)}"),'desktop hit margin stops outside six screen pixels')
            evaluate("relationships.find(link=>link.id==='sample-connection-0').label='Research reference';refreshConnectionViews()")
            mouse('mouseMoved',**line_point(link_id))
            check(evaluate("connectionHint.textContent.includes('Research reference') && !connectionHint.textContent.includes('sample-connection')"),'custom relationship label replaces generic wording without exposing IDs')
            mouse('mouseMoved',x=1100,y=900)
            check(evaluate('connectionHint.hidden && !hoveredConnectionId && !document.querySelector(\'.connection-hover-endpoint\')'),'leaving the line immediately clears tooltip and endpoint emphasis')
            evaluate('positionConnectionHint({x:innerWidth-1,y:innerHeight-1});connectionHint.hidden=false;positionConnectionHint({x:innerWidth-1,y:innerHeight-1})')
            check(evaluate('(()=>{const r=connectionHint.getBoundingClientRect();return r.right<=innerWidth-7&&r.bottom<=innerHeight-7})()'),'long tooltip clamps against the lower-right viewport edge')
            evaluate('dismissConnectionHint()')
            before_pan=evaluate('({...camera.view})');point=line_point(link_id,offset=4)
            mouse('mousePressed',**point,button='left',clickCount=1);mouse('mouseMoved',x=point['x']+30,y=point['y']+20,button='left',buttons=1);mouse('mouseReleased',x=point['x']+30,y=point['y']+20,button='left',clickCount=1)
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(codex)} && connectionHint.hidden && Math.abs(camera.view.x-({before_pan['x']}+30))<.01 && Math.abs(camera.view.y-({before_pan['y']}+20))<.01"),'dragging from a line pans instead of navigating or dragging a body')
            frame(codex)
            line_click(link_id)
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(editor)} && panelName.textContent==='VS Code' && hierarchySidebar.selectedId==={json.dumps(editor)} && galaxyModel.ancestors(entries,{json.dumps(editor)}).every(parent=>hierarchySidebar.expanded.has(parent.id))"),'clicking the selected Codex link focuses VS Code and synchronizes inspector and expanded sidebar')
            line_click(link_id,.85)
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(codex)}"),'clicking from VS Code navigates back to Codex')
            expected=evaluate('({...camera.target})')
            frame(editor)
            evaluate("document.querySelector('#panel-connection-list .connection-name').click()");wait_camera()
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(codex)}") and evaluate('({...camera.target})')==expected,'connection row and line navigation use the same focus destination and camera target')
            # With no selected endpoint, a temporarily body-revealed link uses
            # nearest-endpoint navigation. Retain that context through its edge.
            frame(codex);evaluate('clearSelection()');wait_camera()
            point=evaluate("(()=>{const r=nodes.get('sample-moon-0-1-0').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
            mouse('mouseMoved',**point)
            for t in [.05,.1,.15,.2]:
                mouse('mouseMoved',**line_point(link_id,t))
            line_click(link_id,.25)
            check(evaluate(f"selectedNode?.dataset.entryId==={json.dumps(codex)}"),'when neither endpoint is selected the endpoint nearest the pointer wins')
            frame('sample-moon-5-2-0');evaluate('fitGalaxy(false)');wait_camera()
            point=line_point('sample-connection-7');mouse('mouseMoved',**point)
            check(evaluate("!connectionHint.hidden && connectionHint.textContent.includes('Hiking') && connectionHint.textContent.includes('Cardio')"),'a selected cross-Galaxy line reveals its endpoint names at far zoom')
            preview('semantic-line-cross-galaxy');line_click('sample-connection-7')
            check(evaluate("selectedNode.dataset.entryId==='sample-moon-7-0-1' && hierarchySidebar.selectedId==='sample-moon-7-0-1' && panelName.textContent==='Cardio'"),'cross-Galaxy line navigation selects and focuses its remote endpoint')
            point=evaluate('({x:(physics.bounds.left+physics.bounds.right)/2,y:(physics.bounds.top+physics.bounds.bottom)/2})')
            mouse('mouseWheel',**point,deltaY=90,deltaX=0);wait_camera()
            check(evaluate('camera.view.scale<1.2'),'wheel zoom resumes immediately after connection navigation')
            evaluate('clearSelection();hoveredEntryId=null;camera.setView({...camera.view,scale:.2},false)')
            check(evaluate("lines.filter(link=>link.kind==='relationship').every(link=>!link.interactive && link.element.tabIndex===-1 && link.element.getAttribute('aria-hidden')==='true') && !hitConnection({x:700,y:500})"),'hidden links leave no pointer or keyboard traps')
            evaluate('camera.setView({...camera.view,scale:1},false);renderGraph()')
            check(evaluate("lines.filter(link=>link.kind==='relationship'&&+link.element.style.opacity<=.055).every(link=>!link.interactive)"),'very faint background links do not intercept ordinary canvas gestures')
            frame(codex)
            evaluate("lines.find(link=>link.id==='sample-connection-0').element.focus()")
            check(evaluate("!connectionHint.hidden && document.activeElement.getAttribute('role')==='link' && document.activeElement.getAttribute('aria-label').includes('Codex')"),'visible semantic lines expose accessible names and keyboard focus')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Enter',code='Enter',windowsVirtualKeyCode=13);wait_camera()
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(editor)}"),'Enter on a focused semantic line navigates to the opposite endpoint')
            frame(codex)
            point=line_point(link_id);mouse('mouseMoved',**point)
            evaluate("const moving=physics.particles.get('sample-satellite-0-0-0-0');physics.beginDrag(moving.id);physics.moveDrag(moving.id,moving.x+30,moving.y+15);physics.onTick(physics.particles)")
            check(aligned(),'semantic geometry stays synchronized during parent/body motion')
            check(evaluate(f"hitConnection({json.dumps(line_point(link_id))})?.link.id==={json.dumps(link_id)}"),'interaction geometry follows a moving endpoint without stale hit coordinates')
            evaluate("physics.endDrag('sample-satellite-0-0-0-0',true);physics.pause();dismissConnectionHint()")
            frame(codex)
            point=line_point(link_id);mouse('mouseMoved',**point)
            evaluate('camera.panTo(camera.view.x+150,camera.view.y+100)')
            check(evaluate('connectionHint.hidden && !hoveredConnectionId'),'moving the line away from a stationary pointer clears stale hover')
            # Touch chooses a visible line first, then a compact action or repeat tap.
            cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=False);time.sleep(.2)
            frame('sample-moon-5-2-0');evaluate('fitGalaxy(false)');wait_camera()
            def tap(point):
                cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[{'x':point['x'],'y':point['y']}]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
            point=line_point('sample-connection-7');tap(point)
            check(evaluate("touchConnectionPreview?.id==='sample-connection-7' && selectedNode.dataset.entryId==='sample-moon-5-2-0' && !connectionHint.hidden && connectionHint.getAttribute('role')==='dialog'"),'first touch previews the relationship without navigating')
            check(evaluate("document.getElementById('connection-hint-go').textContent==='Go to Cardio'"),'touch preview provides a clear compact destination action')
            preview('semantic-line-touch');click_selector('#connection-hint-go');wait_camera()
            check(evaluate("selectedNode.dataset.entryId==='sample-moon-7-0-1' && connectionHint.hidden"),'touch preview action navigates and dismisses the preview')
            frame('sample-moon-5-2-0');evaluate('fitGalaxy(false)');wait_camera();point=line_point('sample-connection-7');tap(point);tap(point);wait_camera()
            check(evaluate("selectedNode.dataset.entryId==='sample-moon-7-0-1'"),'second tap on the same semantic line navigates to its opposite endpoint')
            frame('sample-moon-5-2-0');evaluate('fitGalaxy(false)');wait_camera();point=line_point('sample-connection-7');tap(point)
            click_selector('#connection-hint-close')
            check(evaluate("connectionHint.hidden && !touchConnectionPreview && selectedNode.dataset.entryId==='sample-moon-5-2-0'"),'touch preview can close without changing selection')
            check(evaluate("localStorage.getItem('galaxy:user-data')")==raw,'line interactions and Sample edits preserve real saved data')
            check(not cdp.errors,f"no interactive-line browser exceptions: {cdp.errors}")
            print(f'{count} interactive-line browser checks passed',flush=True)
            return

        if options.connections_performance_only:
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode");load();wait_camera()
            evaluate("focusEntry('sample-deep-7')");wait_camera()
            visible=evaluate("lines.filter(link=>link.element.dataset.kind==='relationship'&&getComputedStyle(link.element).display!=='none').length")
            baseline=motion_metrics()
            evaluate("document.head.insertAdjacentHTML('beforeend','<style id=semantic-paint-probe>.connection-line[data-kind=relationship]{display:none!important}</style>')")
            without=motion_metrics()
            evaluate("document.getElementById('semantic-paint-probe').remove()")
            print('Connection paint comparison: '+json.dumps({'revision':'HEAD' if options.baseline_head else 'working tree','visibleLinks':visible,'current':baseline,'withoutSemanticPaint':without}),flush=True)
            check(baseline['renderP95']<20,'large sample projection stays within the existing budget')
            check(baseline['frameMedian']<55 and baseline['frameP95']<120,'isolated large-sample frame timing stays within the existing budget')
            check(not cdp.errors,f"no connection performance exceptions: {cdp.errors}")
            return

        if options.connections_only:
            def preview(name):
                if screenshot_dir:
                    time.sleep(.25)
                    result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
                    (screenshot_dir/(name+'.png')).write_bytes(base64.b64decode(result['data']))

            def begin(entry_id):
                evaluate(f"focusEntry({json.dumps(entry_id)})");wait_camera()
                click_selector(f'.entry-node[data-entry-id="{entry_id}"]',button='right')
                check(evaluate("!contextMenu.hidden && !!contextMenu.querySelector('[data-action=connect]')"),'right-click offers Connect to...')
                click_selector('#entry-context-menu [data-action=connect]');wait_camera()
                check(evaluate(f"connectionSourceId==={json.dumps(entry_id)} && !connectionPicker.hidden && nodes.get(connectionSourceId).classList.contains('connection-source')"),'connection mode highlights its source and offers target search')

            g=add('Other domain');s=add('Remote system',g);target=add('Remote target',s)
            local=add('Local target','old-star');source=add('Connection source',local)
            wait_for('physics.settled');evaluate('physics.pause()')
            parents=evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.parentId]))')
            begin(source);preview('connection-picker')
            before=evaluate('relationships.length')
            click_selector(f'.entry-node[data-entry-id="{local}"]')
            check(evaluate(f"!connectionSourceId && relationships.some(link=>link.from==={json.dumps(source)}&&link.to==={json.dumps(local)})"),'visible-body click creates a semantic connection')
            check(evaluate('!physics.dragging.size && activeNodeDrags===0 && physics.settled'),'choosing a target neither drags nor reheats physics')
            check(evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.parentId]))')==parents,'connecting leaves every structural parent unchanged')
            check(evaluate(f"connections.some(link=>link.kind==='hierarchy'&&link.from==={json.dumps(local)}&&link.to==={json.dumps(source)}) && connections.some(link=>link.kind==='relationship'&&link.from==={json.dumps(source)}&&link.to==={json.dumps(local)})"),'semantic parent-child link coexists independently with its hierarchy edge')
            check(evaluate("document.querySelectorAll('#panel-connection-list li').length===1 && document.querySelector('#panel-connection-list .connection-name').textContent==='Local target'"),'inspector lists the connected entry without internal IDs')

            begin(source);click_selector(f'.entry-node[data-entry-id="{source}"]')
            check(evaluate('relationships.length')==before+1 and evaluate("connectionSourceId!==null && connectionStatus.textContent==='Choose a different entry.'"),'self-connection is rejected without leaving target mode')
            click_selector(f'.entry-node[data-entry-id="{local}"]')
            check(evaluate('relationships.length')==before+1 and evaluate("connectionStatus.textContent==='These entries are already connected.'"),'exact duplicate is rejected')
            cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
            check(evaluate('!connectionSourceId && !panel.hidden && !physics.dragging.size'),'Escape cancels only connection mode')
            begin(local);click_selector(f'.entry-node[data-entry-id="{source}"]')
            check(evaluate('relationships.length')==before+1,'reverse pair is also rejected as an undirected duplicate')
            evaluate("document.getElementById('cancel-connection').click()")

            begin(source)
            # Choose a genuinely empty visible point, outside every cloud and body.
            empty=evaluate("(()=>{for(let y=70;y<innerHeight-40;y+=45)for(let x=physics.bounds.left+30;x<physics.bounds.right-30;x+=45){if(!galaxyAtScreen({x,y})&&document.elementFromPoint(x,y)?.closest('#graph-viewport')&&!document.elementFromPoint(x,y).closest('.entry-node'))return {x,y};}return null;})()")
            assert empty,'Need an empty canvas point'
            mouse('mousePressed',**empty,button='left',clickCount=1);mouse('mouseReleased',**empty,button='left',clickCount=1)
            check(evaluate('!connectionSourceId'),'empty-space click cancels connection mode')

            begin(source)
            evaluate("connectionSearch.value='Remote target';connectionSearch.dispatchEvent(new Event('input'))")
            check(evaluate(f"connectionResults.querySelector('button').dataset.entryId==={json.dumps(target)} && connectionResults.textContent.includes('Other domain / Remote system')"),'target search reaches another Galaxy and shows its location')
            preview('connection-search');click_selector('#connection-results button')
            check(evaluate(f"relationships.some(link=>link.from==={json.dumps(source)}&&link.to==={json.dumps(target)}) && !connectionSourceId"),'search selection creates the same undirected connection across Galaxies')
            check(evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.parentId]))')==parents,'search connection also preserves hierarchy')
            check(evaluate('physics.settled'),'search-based connection does not start physics')
            saved_links=evaluate('JSON.stringify(relationships)')
            check(evaluate("JSON.parse(localStorage.getItem('galaxy:user-data')).connections.every(link=>link.id&&link.type&&typeof link.from==='string'&&typeof link.to==='string')"),'connections persist as normalized ID references and optional semantics')
            cdp.call('Page.reload');load();wait_camera()
            check(evaluate('JSON.stringify(relationships)')==saved_links,'connection IDs and endpoints survive refresh')
            evaluate(f"focusEntry({json.dumps(source)})");wait_camera()
            click_selector('#connect-entry-button')
            click_selector('#panel-connection-list .connection-name');wait_camera()
            check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(local)}"),'inspector connection row focuses and selects its endpoint')
            evaluate(f"focusEntry({json.dumps(source)});physics.pause()");wait_camera()
            relation=evaluate(f"relationships.find(link=>link.to==={json.dumps(target)}).id")
            baseline=evaluate('JSON.stringify([...physics.particles].map(([id,n])=>[id,n.x,n.y,n.orbitRadius]))')
            evaluate(f"document.querySelectorAll('#panel-connection-list .remove-connection')[1].click()")
            check(evaluate(f"!relationships.some(link=>link.id==={json.dumps(relation)}) && document.querySelectorAll('#panel-connection-list li').length===1"),'compact remove action removes only the chosen relationship')
            check(evaluate('JSON.stringify([...physics.particles].map(([id,n])=>[id,n.x,n.y,n.orbitRadius]))')==baseline,'removing a connection leaves physics positions and orbital bands untouched')
            cdp.call('Page.reload');load()
            check(evaluate(f"!relationships.some(link=>link.id==={json.dumps(relation)})"),'removed relationship stays removed after refresh')

            evaluate(f"startConnectionMode({json.dumps(source)});connectEntries({json.dumps(target)})")
            unrelated=evaluate(f"JSON.stringify(relationships.filter(link=>link.from!=={json.dumps(source)}&&link.to!=={json.dumps(source)}))")
            evaluate(f"requestEntryDelete({json.dumps(local)})")
            check(evaluate('deleteDialog.open && deleteConfirmationIds.size>1'),'parent deletion requires explicit subtree confirmation')
            evaluate('deleteDialog.close()')
            evaluate(f"requestEntryDelete({json.dumps(source)});document.getElementById('delete-entry-form').requestSubmit()")
            check(evaluate(f"!entries.has({json.dumps(source)}) && !relationships.some(link=>link.from==={json.dumps(source)}||link.to==={json.dumps(source)})"),'deleting an endpoint removes all of its relationships')
            check(evaluate('JSON.stringify(relationships)')==unrelated,'deletion preserves unrelated connections')
            check(evaluate("galaxyStorage.load().version===5"),'storage container version and migration strategy remain version 5')
            wait_for('physics.settled');evaluate('saveGalaxy()')
            real_snapshot=evaluate("localStorage.getItem('galaxy:user-data')")
            real_ui=evaluate("localStorage.getItem('galaxy:navigation-ui')")
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode");load();wait_camera()
            check(evaluate('entries.size===187 && relationships.length===8'),'large sample has eight realistic semantic connections')
            evaluate('physics.pause();clearSelection();hoveredEntryId=null;camera.setView({...camera.view,scale:.2},false);renderGraph()')
            check(evaluate("lines.filter(link=>link.element.dataset.kind==='relationship').every(link=>getComputedStyle(link.element).display==='none')"),'Universe view hides all unselected semantic links')
            preview('connections-universe')
            evaluate("focusEntry('sample-moon-0-1-0')");wait_camera();time.sleep(.25)
            check(evaluate("lines.filter(link=>link.element.dataset.kind==='relationship'&&link.element.classList.contains('selected')).length===2 && lines.filter(link=>link.element.dataset.kind==='relationship'&&link.element.classList.contains('selected')).every(link=>parseFloat(getComputedStyle(link.element).opacity)>=.49)"),'selecting Codex clearly reveals only its direct connections')
            check(evaluate("nodes.get('sample-satellite-0-0-0-0').classList.contains('semantic-connected') && document.querySelectorAll('#panel-connection-list li').length===2"),'direct targets receive restrained emphasis and inspector rows')
            check(evaluate("lines.filter(link=>link.element.dataset.kind==='relationship'&&!link.element.classList.contains('selected')).every(link=>parseFloat(getComputedStyle(link.element).opacity)<=.055)"),'unrelated close-zoom links remain very faint')
            check(evaluate("lines.filter(link=>link.element.dataset.kind==='relationship'&&!link.element.classList.contains('selected')&&!link.element.classList.contains('hovered')&&[link.from,link.to].some(id=>nodes.get(id).dataset.culled==='true')).every(link=>getComputedStyle(link.element).display==='none')"),'unrelated offscreen semantic links skip paint')
            preview('connections-codex')
            evaluate("clearSelection();hoveredEntryId=null;camera.setView({...camera.view,scale:.65},false)")
            check(evaluate("lines.filter(link=>link.element.dataset.kind==='relationship').every(link=>getComputedStyle(link.element).display==='none')"),'system view hides unselected semantic links')
            evaluate("nodes.get('sample-moon-0-1-0').dispatchEvent(new PointerEvent('pointerenter'))")
            check(evaluate("lines.filter(link=>link.element.dataset.kind==='relationship'&&link.element.classList.contains('hovered')).every(link=>parseFloat(getComputedStyle(link.element).opacity)===.3)"),'hover temporarily reveals incident connections')
            evaluate("nodes.get('sample-moon-0-1-0').dispatchEvent(new PointerEvent('pointerleave'))")

            # A real target-choice gesture must not become a drag, even with pointer motion.
            evaluate("focusEntry('sample-moon-0-1-0')");wait_camera();evaluate("startConnectionMode('sample-moon-0-1-0')");wait_camera()
            point=evaluate("(()=>{const r=nodes.get('sample-satellite-0-0-0-0').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
            # That remote body can be offscreen; use the visible source to test drag suppression.
            point=evaluate("(()=>{const r=nodes.get(connectionSourceId).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
            pos=evaluate("({x:entries.get(connectionSourceId).x,y:entries.get(connectionSourceId).y})")
            mouse('mousePressed',**point,button='left',clickCount=1);mouse('mouseMoved',x=point['x']+20,y=point['y']+10,button='left',buttons=1);mouse('mouseReleased',x=point['x']+20,y=point['y']+10,button='left',clickCount=1)
            check(evaluate('!physics.dragging.size && activeNodeDrags===0') and evaluate("({x:entries.get(connectionSourceId).x,y:entries.get(connectionSourceId).y})")==pos,'connection mode prevents accidental body dragging')
            evaluate('cancelConnectionMode()')
            # Sidebar context action supports any depth without a permanent row icon.
            evaluate("hierarchySidebar.setCollapsed(false);hierarchySidebar.select('sample-deep-7');hierarchySidebar.rows.get('sample-deep-7').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:140,clientY:320}))")
            check(evaluate("contextEntryId==='sample-deep-7' && !contextMenu.hidden && !hierarchySidebar.rows.get('sample-deep-7').querySelector('.tree-connect')"),'sidebar context menu offers Connect without adding row clutter')
            click_selector('#entry-context-menu [data-action=connect]');wait_camera()
            check(evaluate("connectionSourceId==='sample-deep-7'"),'arbitrary-depth entries can start connection mode')
            evaluate('cancelConnectionMode();clearSelection();fitGalaxy(false)');wait_camera()
            # Galaxies can be endpoints too, with line anchors at their visible names.
            for a,b in [('sample-galaxy-0','sample-galaxy-1'),('sample-sun-0','sample-sun-4')]:
                evaluate(f"openContextMenu({json.dumps(a)},600,200);contextMenu.querySelector('[data-action=connect]').click();connectionSearch.value=entries.get({json.dumps(b)}).name;connectionSearch.dispatchEvent(new Event('input'));connectionResults.querySelector('button').click()")
                check(evaluate(f"relationships.some(link=>link.from==={json.dumps(a)}&&link.to==={json.dumps(b)})"),'connection workflow supports '+a.split('-')[1]+' endpoints')
            evaluate("focusEntry('sample-moon-5-2-0')");wait_camera();evaluate('fitGalaxy(false)');wait_camera()
            check(evaluate("lines.some(link=>link.element.dataset.kind==='relationship'&&link.element.classList.contains('selected')&&parseFloat(getComputedStyle(link.element).opacity)>.2)"),'selected cross-Galaxy link remains readable at Universe zoom')
            check(evaluate("lines.filter(link=>link.element.dataset.kind==='relationship'&&link.element.classList.contains('selected')).every(link=>Math.abs(parseFloat(getComputedStyle(link.element).strokeWidth)*camera.view.scale-1)<.001)"),'selected semantic strokes stay one screen pixel at fitted Universe zoom')
            preview('connections-cross-galaxy')
            check(aligned(),'all hierarchy and semantic endpoints align with native bodies and Galaxy names')
            evaluate("focusEntry('sample-moon-0-1-0')");wait_camera();evaluate('physics.resume()')
            tracked=evaluate("new Promise(resolve=>{const tick=physics.onTick;let frames=0,okay=true;physics.onTick=p=>{tick(p);okay&&=lines.filter(link=>link.element.dataset.kind==='relationship'&&entries.get(link.from).depth>0&&entries.get(link.to).depth>0).every(link=>+link.element.getAttribute('x1')===entries.get(link.from).x&&+link.element.getAttribute('y2')===entries.get(link.to).y);if(++frames===20){physics.onTick=tick;resolve(okay)}};physics.reheat(.3)})")
            check(tracked,'semantic endpoints track every physics frame')
            wait_for('physics.settled')
            old=evaluate("({...entries.get('sample-moon-0-1-0')})")
            drag_to('sample-moon-0-1-0',old['x']+80,old['y']+35)
            check(aligned(),'semantic lines stay aligned through real pointer dragging and release')
            metrics=motion_metrics();print('Connection sample motion: '+json.dumps(metrics),flush=True)
            check(metrics['renderP95']<16,'187-entry connection sample projection stays within a frame budget')
            cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=False);time.sleep(.2)
            evaluate("focusEntry('sample-moon-0-1-0')");wait_camera();evaluate("startConnectionMode('sample-moon-0-1-0');connectionSearch.value='Chicken';connectionSearch.dispatchEvent(new Event('input'))")
            check(evaluate('(()=>{const r=panel.getBoundingClientRect();return !connectionPicker.hidden&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight+1&&connectionResults.children.length>0})()'),'connection search fits the mobile inspector sheet')
            preview('connections-mobile');evaluate("connectionResults.querySelector('button:not(:disabled)').click()")
            check(evaluate('!connectionSourceId'),'mobile target search completes a connection')
            check(evaluate("localStorage.getItem('galaxy:user-data')")==real_snapshot and evaluate("localStorage.getItem('galaxy:navigation-ui')")==real_ui,'sample connection edits leave real data and sidebar preferences untouched')
            evaluate('removeSampleButton.click()');wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && !sampleMode");load()
            restored=evaluate("JSON.parse(localStorage.getItem('galaxy:user-data'))")
            original=json.loads(real_snapshot)
            # Reload legitimately lets Flowing coordinates settle again; compare
            # saved content, ancestry, arrangements and connection records exactly.
            for snapshot in (restored,original):
                for entry in snapshot['entries']:
                    entry.pop('x',None);entry.pop('y',None)
            check(restored==original,'leaving Sample mode restores real saved content and connections')
            check(not cdp.errors,f"no connection browser exceptions: {cdp.errors}")
            print(f'{count} connection browser checks passed',flush=True)
            return

        if options.arrangement_only:
            evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete' && typeof sampleMode!=='undefined' && sampleMode");load();wait_camera()
            evaluate('physics.pause();clearSelection()')
            report={'bands':evaluate("({planet:physics.particles.get('sample-sun-0').childOrbit,moon:physics.particles.get('sample-planet-0-0').childOrbit,satellite:physics.particles.get('sample-moon-0-0-0').childOrbit,foodRadius:physics.galaxies.get('sample-galaxy-1').radius})")}
            ids=['sample-sun-0','sample-planet-0-0','sample-moon-0-0-0','sample-satellite-0-0-0-0','sample-planet-0-2']
            evaluate(f"window.sizeIds={json.dumps(ids)};window.sizePositions=[...physics.particles].map(([id,n])=>[id,n.x,n.y]);sizeIds.forEach((id,i)=>{{const n=physics.particles.get(id);n.x=400+i*165;n.y=420;}});[...nodes].forEach(([id,n])=>n.hidden=!sizeIds.includes(id));[...regions.values()].forEach(r=>r.style.visibility='hidden');connectionsLayer.style.visibility='hidden';physics.onTick(physics.particles);camera.setView({{x:0,y:0,scale:1}},false)")
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
            evaluate("sizePositions.forEach(([id,x,y])=>Object.assign(physics.particles.get(id),{x,y,lastX:x,lastY:y,vx:0,vy:0}));[...nodes.values()].forEach(n=>n.hidden=false);[...regions.values()].forEach(r=>r.style.visibility='');connectionsLayer.style.visibility='';clearSelection();physics.onTick(physics.particles)")
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
                check(evaluate("[panelName,moreButton,document.getElementById('connect-entry-button')].every(e=>{const r=e.getBoundingClientRect(),p=panel.getBoundingClientRect();return r.width>0&&r.top>=p.top&&r.bottom<=p.bottom;})"),label+' keeps name, Connect and More reachable')
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
            check(evaluate("[...contextMenu.querySelectorAll('button')].map(b=>b.dataset.action).join(',')==='create,connect,edit,delete'"),'context menus contain Add, Connect, Edit and Delete')
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
            check(evaluate("document.activeElement.dataset.action==='connect'"),'menu arrow keys reach the existing Connect action')
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
            check(evaluate('entries.size===187 && hierarchySidebar.tree.querySelectorAll(".hierarchy-row").length===12'),'large sample starts with only Galaxy roots and Suns visible in the tree')
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
            check(evaluate("[panelName,moreButton,document.getElementById('connect-entry-button')].every(e=>{const r=e.getBoundingClientRect(),p=panel.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom&&r.width>0;})"),'mobile Contents keeps the selected name, Connect and More visible')
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
                metrics=evaluate("""new Promise(resolve=>{const original=physics.onTick,costs=[],frames=[];physics.onTick=p=>{const start=performance.now();original(p);costs.push(performance.now()-start);};let last;
                    const frame=t=>{if(last!==undefined)frames.push(t-last);last=t;if(frames.length<45)requestAnimationFrame(frame);else{physics.onTick=original;frames.sort((a,b)=>a-b);costs.sort((a,b)=>a-b);resolve({renderP95:costs[Math.floor(costs.length*.95)]||0,frameMedian:frames[22],frameP95:frames[42],scale:camera.view.scale,dpr:devicePixelRatio,culled:[...nodes.values()].filter(n=>n.dataset.culled==='true').length,visibleLayers:[...nodes.values()].filter(n=>getComputedStyle(n).visibility==='visible'&&getComputedStyle(n).willChange==='transform').length});}};requestAnimationFrame(frame);})""")
                print(label+': '+json.dumps(metrics),flush=True)
                evaluate('physics.pause()')
            wait_for("[...nodes.values()].filter(n=>n.dataset.culled==='false' && !['galaxy','satellite','astronaut'].includes(n.dataset.body)).every(n=>n.dataset.textureReady==='true')")
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
            # Inspect restored coordinates before the first live physics frame.
            cdp.call('Page.addScriptToEvaluateOnNewDocument',source="document.addEventListener('DOMContentLoaded',()=>physics.pause(),{once:true})")
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
            check(evaluate("relationships.length===1 && connections.filter(c=>c.kind==='hierarchy').length===3 && entries.get('github').category==='Keep label' && entries.get('saved-planet').description==='Saved category'"), "v4 labels, descriptions and semantic relationships survive")
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
            semantic=evaluate("JSON.stringify(relationships)")
            edit('saved-moon',name='Updated saved Moon');evaluate('physics.pause()')
            check(evaluate("JSON.stringify(relationships)")==semantic and evaluate("!document.getElementById('connection-options')"),'editing content preserves existing semantic relationships without relationship fields')
            edit('saved-moon',parent='github');evaluate('physics.pause()')
            check(evaluate("JSON.stringify(relationships)")==semantic and evaluate("entries.get('saved-moon').parentId==='github'"),'changing the single structural parent preserves a semantic link to the same pair')
            edit('saved-moon',parent='saved-planet');evaluate('physics.pause();saveGalaxy()')
            reload_storage_fixture()
            check(evaluate("JSON.stringify(relationships)")==semantic and evaluate("connections.some(c=>c.kind==='relationship'&&c.to==='saved-moon') && entries.get('saved-moon').name==='Updated saved Moon'"),'semantic links survive reparenting, saving and reload')

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
        # Seed historical semantic links internally; the creation UI cannot configure them.
        evaluate(f"relationships.push({{from:{json.dumps(t1)},to:'github'}},{{from:{json.dumps(t1)},to:'codex'}});rebuildConnections();syncPhysicsGraph();saveGalaxy()")
        d5=add('Preparation',t1);d6=add('Slow simmer notes',d5)
        wait_for("physics.settled")
        check(evaluate(f"entries.get({json.dumps(g1)}).depth===0 && entries.get({json.dumps(s1)}).depth===1 && entries.get({json.dumps(p1)}).depth===2 && entries.get({json.dumps(m1)}).depth===3 && entries.get({json.dumps(t1)}).depth===4 && entries.get({json.dumps(d6)}).depth===6"), "create multiple Galaxies and a hierarchy through depth six")
        check(hierarchy_edge(g1,s1) and hierarchy_edge(s1,p1) and hierarchy_edge(m1,t1) and hierarchy_edge(d5,d6), "all hierarchy links derive from parent IDs")
        check(evaluate(f"relationships.filter(c=>c.from==={json.dumps(t1)}).length===2"), "deep entries retain optional semantic relationships")
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
        check(evaluate(f"entries.get({json.dumps(d6)}).depth===6 && relationships.filter(c=>c.from==={json.dumps(t1)}).length===2"), "deep nesting can be restored without losing semantic links")

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
        check(evaluate("entries.get('sample-deep-7').depth===7 && connections.filter(link=>link.kind==='hierarchy').length===183 && relationships.length===8"), "sample exercises depth seven, all hierarchy edges and eight semantic links")
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
        if baseline_root:
            assert baseline_root.is_relative_to(temp_root) and baseline_root.name.startswith('galaxy-baseline-')
            shutil.rmtree(baseline_root,ignore_errors=True)


if __name__ == "__main__":
    main()
