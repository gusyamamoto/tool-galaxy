"""Hierarchical local-world regression, deterministic stress metrics and screenshots.

Uses the existing stdlib CDP helper in an isolated temporary browser profile.
Run --baseline against the original tree to collect comparable pre-change data.
Run --capture-baseline before editing to copy app assets to an OS temp directory.
No regular browser profile, user data, network fixture or dependency is used.
"""
import argparse
import base64
import functools
import http.server
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
FOREGROUND_FLAGS = ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
PROTOCOL = {'version':2,'browser':'isolated headless Chrome/Edge','foregroundFlags':FOREGROUND_FLAGS,
    'desktopViewport':{'width':1440,'height':1000},'startupPhysicsTicks':260,
    'forceTiming':'90 single force ticks in a separate batch before each camera sample',
    'settling':'sync physics.onTick, mark settled, then physics.onSettle before camera sampling',
    'cameraTiming':'90 requestAnimationFrame callbacks / 89 intervals; paused physical simulation',
    'cameraMotion':'x +32*sin(index*.13), y +20*cos(index*.13), scale *(1+.08*sin(index*.09))',
    'warmup':'all Galaxy cloudReady, visible legacy textures complete, eligible active close sphere ready',
    'ambient':'destroyed in every test page before sampling','labelTiming':'existing total LabelDensity.cost when its throttled batch runs',
    'heapTiming':'performance.memory.usedJSHeapSize without forced collection; native raster/GPU memory excluded'}
spec = importlib.util.spec_from_file_location('cosmifold_browser_helpers', ROOT / 'tests/browser-check.py')
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-root', type=Path, default=ROOT)
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--capture-baseline', action='store_true')
    parser.add_argument('--screenshots', action='store_true')
    parser.add_argument('--skip-metrics', action='store_true', help='Run interaction checks quickly while diagnosing a failure')
    parser.add_argument('--semantic-only', action='store_true', help='Camera-only inward gestures, explicit world entry and visual review A–K')
    parser.add_argument('--stability-only', action='store_true', help='Ten full world cycles, continuous presence and camera zoom torture')
    parser.add_argument('--mobile-only', action='store_true', help='Native touch entry, camera-only pinch and detail inspection in both orientations')
    parser.add_argument('--transitions-only', action='store_true', help='Capture controlled-clock entry/Parent transition frames for visual review')
    parser.add_argument('--usability-only', action='store_true', help='Invariant camera geometry, equivalent Universe actions, retained drags and detail hierarchy')
    parser.add_argument('--usability-mobile-only', action='store_true', help='Native detail dragging and equivalent home actions in both phone orientations')
    parser.add_argument('--camera-review-only', action='store_true', help='Compare camera-only inspection with deliberate Planet entry and capture transitions')
    parser.add_argument('--output', type=Path, help='Output directory; defaults to OS temp')
    parser.add_argument('--cases', default='recipes50,recipes100,siblings100,broad300,pathological100')
    options = parser.parse_args()
    if options.capture_baseline:
        snapshot = Path(tempfile.mkdtemp(prefix='cosmifold-focus-baseline-'))
        for source in options.site_root.rglob('*'):
            relative = source.relative_to(options.site_root)
            if any(part in {'.git', '.codex', '.agents', 'node_modules', 'tests', '.aws'} for part in relative.parts):
                continue
            if source.is_file() and source.suffix.lower() in {'.js', '.css', '.html', '.json', '.svg', '.woff', '.woff2', '.png', '.jpg', '.webp'}:
                destination = snapshot / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
        options.site_root = snapshot
        options.baseline = True
        print(f'BASELINE_SITE_ROOT {snapshot}', flush=True)
    output = options.output or Path(tempfile.mkdtemp(prefix='cosmifold-focus-review-'))
    output.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(helpers.QuietHandler, directory=str(options.site_root)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    with socket.socket() as port_socket:
        port_socket.bind(('127.0.0.1', 0))
        debug_port = port_socket.getsockname()[1]
    profile = Path(tempfile.mkdtemp(prefix='cosmifold-focus-profile-'))
    popen_options = {}
    if os.name == 'nt':
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = subprocess.SW_HIDE
        popen_options['startupinfo'] = startup
    process = subprocess.Popen([helpers.find_browser(), '--headless=new', '--no-first-run', '--no-default-browser-check', *FOREGROUND_FLAGS,
        f'--user-data-dir={profile}', f'--remote-debugging-port={debug_port}', 'about:blank'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **popen_options)
    cdp = None
    count, metrics, completed, review_shots = 0, {}, False, []
    try:
        deadline = time.monotonic() + 20
        while True:
            try:
                pages = json.load(urllib.request.urlopen(f'http://127.0.0.1:{debug_port}/json', timeout=1))
                page = next(page for page in pages if page['type'] == 'page')
                break
            except (OSError, StopIteration):
                assert time.monotonic() < deadline, 'Browser did not start'
                time.sleep(.1)
        cdp = helpers.CDP(page['webSocketDebuggerUrl'])
        cdp.call('Page.enable')
        cdp.call('Runtime.enable')
        cdp.call('Emulation.setDeviceMetricsOverride', width=1440, height=1000, deviceScaleFactor=1, mobile=False)
        origin = f'http://127.0.0.1:{server.server_port}'
        fixture_source = (ROOT / 'tests/focus-fixtures.js').read_text(encoding='utf-8')
        cdp.call('Page.addScriptToEvaluateOnNewDocument', source=fixture_source + f"""
            if(location.origin==={json.dumps(origin)}) {{
                const kind = new URL(location.href).searchParams.get('stress') || 'recipes100';
                window.focusFixture = focusFixtures.make(kind);
                if(!sessionStorage.getItem('focus-seeded-' + kind)) {{
                    localStorage.setItem('galaxy:user-data', JSON.stringify(focusFixture.snapshot));
                    sessionStorage.setItem('focus-seeded-' + kind, 'yes');
                }}
            }}
        """)

        def evaluate(code):
            return cdp.evaluate(code)

        def wait(code, timeout=35):
            deadline = time.monotonic() + timeout
            while not evaluate(code):
                assert time.monotonic() < deadline, f'Timed out: {code}; browser errors: {json.dumps(cdp.errors[-3:])}'
                time.sleep(.06)

        def check(condition, title):
            nonlocal count
            assert condition, title
            count += 1
            print(f'PASS {title}', flush=True)

        def ready_surface():
            started = time.monotonic()
            if not options.baseline:
                eligible = evaluate("typeof semanticFocus!=='undefined'&&!!semanticFocus.anchorId&&(()=>{const n=nodes.get(semanticFocus.anchorId);return n&&['sun','planet','moon'].includes(n.dataset.body)&&n.renderDiameter>=120&&n.dataset.semanticHidden!=='true'&&n.dataset.culled!=='true'&&semanticFocus.progress>=.28})()")
                if eligible:
                    wait("(()=>{const n=nodes.get(semanticFocus.anchorId);return n.dataset.closeDetail==='true'&&!!galaxyAppearance.closeTextureCache.get(n.closeDetailKey)?.url})()", timeout=12)
                state = evaluate("typeof semanticFocus==='undefined'||!semanticFocus.anchorId?null:(()=>{const n=nodes.get(semanticFocus.anchorId);return {id:semanticFocus.anchorId,role:n.dataset.body,ready:n.dataset.closeDetail||null,resolution:+n.dataset.closeResolution||null,beforeContent:getComputedStyle(n,'::before').content,cacheCount:galaxyAppearance.closeTextureCache.size}})()")
            else:
                if evaluate("!!selectedNode&&selectedNode.dataset.textureReady==='pending'"):
                    wait("selectedNode.dataset.textureReady==='true'", timeout=12)
                state = evaluate("selectedNode?{id:selectedNode.dataset.entryId,ready:selectedNode.dataset.textureReady||null}:null")
            evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
            return {'waitMs':round((time.monotonic()-started)*1000,2),'surface':state}

        def shot(name):
            if options.screenshots:
                wait("!camera.frame&&(typeof semanticFocus==='undefined'||!semanticFocus.animating)")
                ready=ready_surface()
                time.sleep(.15)
                raw = cdp.call('Page.captureScreenshot', format='png')['data']
                (output / f'{name}.png').write_bytes(base64.b64decode(raw))
                scene=evaluate("""(()=>{const focus=typeof semanticFocus==='undefined'?null:semanticFocus,children=focus?.children.get(focus.anchorId)||[],b=physics.bounds;
                    const captions=children.map(e=>{const n=nodes.get(e.id),l=n.querySelector('.node-label');return {id:e.id,hidden:l.dataset.densityHidden==='true',opacity:+getComputedStyle(l).opacity,protected:n.classList.contains('label-priority'),width:n.labelMetrics?.width,height:n.labelMetrics?.height,x:n.renderX,y:n.renderY};});
                    return {viewport:{width:innerWidth,height:innerHeight},scale:camera.view.scale,anchor:focus?.anchorId||null,activeConstellation:activeConstellationId||null,
                        childrenOnScreen:captions.filter(n=>n.x>=b.left&&n.x<=b.right&&n.y>=b.top&&n.y<=b.bottom).length,captionDensity:{total:captions.length,hidden:captions.filter(n=>n.hidden).length,visible:captions.filter(n=>n.opacity>.05).length,protected:captions.filter(n=>n.protected).length,lastRunAgeMs:performance.now()-labelDensity.lastRun,pendingFrame:labelDensity.frame!==null,pendingTimer:labelDensity.trailingTimer!==null},captions};})()""")
                review_shots.append({'name':name,'file':name+'.png',**scene,'surfaceReadiness':ready})
                if name.startswith('mobile-pathological'):
                    scene['exactLabelDiagnostics']=evaluate("""(()=>{const focus=semanticFocus,children=focus.children.get(focus.anchorId)||[],ids=new Set(children.map(e=>e.id));
                        const actual=children.map(e=>{const n=nodes.get(e.id),l=n.querySelector('.node-label'),r=l.getBoundingClientRect(),s=getComputedStyle(l);return {id:e.id,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},cached:{...n.labelMetrics},edge:l.edgeOffset?{...l.edgeOffset}:null,hidden:l.dataset.densityHidden==='true',protected:n.classList.contains('label-priority'),opacity:+s.opacity,font:s.fontSize,weight:s.fontWeight,transform:s.transform};});
                        const read=labelDensity.read(),candidates=read.candidates.filter(c=>ids.has(c.id));
                        const overlaps=list=>{const pairs=[];for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i],b=list[j],r=a.rect,t=b.rect,area=Math.max(0,Math.min(r.right,t.right)-Math.max(r.left,t.left))*Math.max(0,Math.min(r.bottom,t.bottom)-Math.max(r.top,t.top)),ratio=area/Math.max(1,Math.min((r.right-r.left)*(r.bottom-r.top),(t.right-t.left)*(t.bottom-t.top)));if(ratio>.24)pairs.push({a:a.id,b:b.id,ratio});}return pairs.sort((a,b)=>b.ratio-a.ratio);};
                        const visible=actual.filter(n=>n.opacity>.05),visibleIds=new Set(visible.map(n=>n.id));const anchor=nodes.get(focus.anchorId),a=anchor.querySelector('.node-label'),s=getComputedStyle(a),r=a.getBoundingClientRect();
                        return {actual,candidates,actualStrongOverlaps:overlaps(visible),candidateStrongOverlaps:overlaps(candidates.filter(c=>visibleIds.has(c.id))),excludedVisibleIds:visible.filter(n=>!candidates.some(c=>c.id===n.id)).map(n=>n.id),anchor:{name:entries.get(focus.anchorId).name,diameter:anchor.renderDiameter,font:s.fontSize,maxWidth:s.maxWidth,rect:{width:r.width,height:r.height,left:r.left,top:r.top}},density:{states:labelDensity.states.size,hidden:labelDensity.hiddenIds.size,lastRun:labelDensity.lastRun,now:performance.now()}};})()""")
                    review_shots[-1]['exactLabelDiagnostics']=scene['exactLabelDiagnostics']
                (output / 'screenshots.json').write_text(json.dumps(review_shots,indent=2),encoding='utf-8')

        def load(case):
            evaluate(f"if(typeof focusFixture!=='undefined')sessionStorage.removeItem('focus-seeded-'+{json.dumps(case)})")
            cdp.call('Page.navigate', url=f'{origin}/?stress={case}')
            wait("typeof camera!=='undefined' && typeof entries!=='undefined' && entries.size===focusFixture.expectedTotal && typeof cameraViewReady!=='undefined' && cameraViewReady")
            # Same deterministic physics settling for pre/post runs, avoiding wall-time differences.
            evaluate('ambient.destroy();physics.pause();physics.simulation.tick(260);physics.onTick(physics.particles);physics.settled=true;physics.onSettle();camera.stopAnimation();')
            wait('!camera.frame')
            check(evaluate('storageAvailable && storageStatus.hidden'), f'{case}: legitimate v5 stress data loads')

        def focus(which, close=False):
            evaluate(f'focusEntry(focusFixture.ids[{json.dumps(which)}],{{closeFocus:{str(close).lower()}}});')
            wait("!camera.frame && (typeof semanticFocus==='undefined' || !semanticFocus.animating)")
            evaluate('requestLabelLayout(true);new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')

        def anchor():
            return evaluate("typeof semanticFocus==='undefined' ? null : semanticFocus.anchorId")

        def visibility():
            return evaluate("""(()=>{const ids=focusFixture.ids;const result={};for(const [key,id] of Object.entries(ids)){if(Array.isArray(id))continue;const n=nodes.get(id);result[key]={id,hidden:n.dataset.semanticHidden==='true',culled:n.dataset.culled==='true',diameter:n.renderDiameter,label:n.labelOpacity,x:n.renderX,y:n.renderY};}return result;})()""")

        def performance_sample():
            # Real DOM projection/label layout and deterministic force steps. rAF includes browser paint/compositing.
            if options.skip_metrics:
                return {'skipped':True}
            # Force cost is measured separately, then synchronize the canonical
            # coordinates and settle the paint mode. Leaving is-settling after
            # manual onTick would change compositor promotion in later scenes.
            evaluate("""(()=>{physics.pause();window.focusForceCosts=[];for(let i=0;i<90;i++){const start=performance.now();physics.simulation.tick(1);focusForceCosts.push(performance.now()-start);}physics.onTick(physics.particles);physics.settled=true;physics.onSettle();})()""")
            wait("!camera.frame&&(typeof semanticFocus==='undefined'||!semanticFocus.animating)")
            warm_started=time.monotonic()
            wait("[...regions.values()].every(n=>n.dataset.cloudReady==='true')&&[...nodes.values()].filter(n=>n.dataset.semanticHidden!=='true'&&n.dataset.culled!=='true').every(n=>n.dataset.textureReady!=='pending')",timeout=15)
            ready = ready_surface()
            warm_ms=round((time.monotonic()-warm_started)*1000,2)
            result = evaluate("""new Promise(resolve=>{
                const projection=[],labels=[],physicsCosts=focusForceCosts.slice(),frames=[],originalProjection=camera.onChange;
                camera.onChange=function(...args){const start=performance.now();const value=originalProjection.apply(this,args);projection.push(performance.now()-start);return value;};
                const startView={...camera.view};let last,index=0,lastLabelRun=labelDensity.lastRun;
                const quantile=(data,q)=>{const values=data.slice().sort((a,b)=>a-b);return values.length?values[Math.min(values.length-1,Math.floor(values.length*q))]:0;};
                const frame=time=>{if(last!==undefined)frames.push(time-last);last=time;
                    if(labelDensity.lastRun!==lastLabelRun){labels.push(labelDensity.cost);lastLabelRun=labelDensity.lastRun;}
                    camera.setView({x:startView.x+Math.sin(index*.13)*32,y:startView.y+Math.cos(index*.13)*20,scale:startView.scale*(1+Math.sin(index*.09)*.08)},false);
                    index++;if(index<90)requestAnimationFrame(frame);else{camera.onChange=originalProjection;camera.setView(startView,false);
                        resolve({frames:frames.length,projectionSamples:projection.length,labelSamples:labels.length,frameMedianMs:quantile(frames,.5),frameP95Ms:quantile(frames,.95),projectionMedianMs:quantile(projection,.5),projectionP95Ms:quantile(projection,.95),labelMedianMs:quantile(labels,.5),labelP95Ms:quantile(labels,.95),physicsMedianMs:quantile(physicsCosts,.5),physicsP95Ms:quantile(physicsCosts,.95),settlingClass:galaxy.classList.contains('is-settling'),domNodes:document.querySelectorAll('*').length,hintOwners:document.querySelectorAll('.depth-hint').length,renderedBodies:[...nodes.values()].filter(n=>n.dataset.semanticHidden!=='true'&&n.dataset.culled!=='true').length,heapUsedBytes:performance.memory?.usedJSHeapSize||null});}
                };requestAnimationFrame(frame);
            })""")
            result['surfaceReadiness'] = ready
            result['warmupWaitMs'] = warm_ms
            return result

        def settled():
            wait('!camera.frame&&!semanticFocus.animating')

        def wheel(which=None, delta=-60, times=1):
            for _ in range(times):
                p=evaluate(f"""(()=>{{const b=physics.bounds,n=nodes.get(focusFixture.ids[{json.dumps(which)}]);return {{x:Math.max(b.left+24,Math.min(b.right-24,n?.renderX??(b.left+b.right)/2)),y:Math.max(b.top+48,Math.min(b.bottom-48,n?.renderY??(b.top+b.bottom)/2))}};}})()""")
                cdp.call('Input.dispatchMouseEvent',type='mouseWheel',x=p['x'],y=p['y'],deltaX=0,deltaY=delta)
                settled()

        def whole(which,proportion=None):
            return evaluate(f"""(()=>{{const n=nodes.get(focusFixture.ids[{json.dumps(which)}]),b=physics.bounds,r=n.renderDiameter/2;return n.renderX-r>=b.left-1&&n.renderX+r<=b.right+1&&n.renderY-r>=b.top-1&&n.renderY+r<=b.bottom+1;}})()""")

        def native_enter(which):
            p=evaluate(f"(()=>{{const n=nodes.get(focusFixture.ids[{json.dumps(which)}]);return {{x:n.renderX,y:n.renderY}}}})()")
            for clicks in [1,2]:
                cdp.call('Input.dispatchMouseEvent',type='mousePressed',x=p['x'],y=p['y'],button='left',clickCount=clicks)
                cdp.call('Input.dispatchMouseEvent',type='mouseReleased',x=p['x'],y=p['y'],button='left',clickCount=clicks)
                time.sleep(.06)
            settled()

        def identity(which):
            return evaluate(f"""(()=>{{const e=entries.get(focusFixture.ids[{json.dumps(which)}]),n=nodes.get(e.id),r=n.querySelector('.planet-rings'),s=r?getComputedStyle(r):null;
                return {{identity:galaxyAppearance.resolve(e),role:e.role,hue:n.style.getPropertyValue('--body-hue'),rings:n.dataset.rings,
                ringStyle:s?{{border:s.border,transform:s.transform,borderTopColor:s.borderTopColor}}:null}};}})()""")

        def capture_transitions():
            focus('sun')
            evaluate('window.reviewNow=semanticFocus.now;window.reviewRequest=camera.requestFrame;window.reviewTime=performance.now();semanticFocus.now=()=>reviewTime;camera.requestFrame=()=>-1')
            frames=[]
            try:
                for current,target,label in [('sun','planetA','sun-planet'),('planetA','firstChild','planet-moon'),('firstChild',None,'moon-parent'),('planetA',None,'planet-parent')]:
                    if target:evaluate(f'focusEntry(focusFixture.ids[{json.dumps(target)}])')
                    else:evaluate('document.getElementById("world-up").click()')
                    evaluate('window.reviewStart=reviewTime')
                    for fraction in [.05,.3,.65,.95]:
                        # Freeze both clocks for each screenshot. Screenshot
                        # latency must not skip the middle of a short transition.
                        evaluate(f'(()=>{{const end=reviewStart+semanticFocus.duration*{fraction};while(reviewTime<end){{reviewTime=Math.min(end,reviewTime+16);if(camera.frame!==null)camera.tick(reviewTime);else renderGraph();}}}})()')
                        evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
                        state=evaluate('({progress:semanticFocus.progress,view:{...camera.view},world:semanticFocus.anchorId,body:["sun","planetA","firstChild"].map(key=>{const n=nodes.get(focusFixture.ids[key]);return {key,x:n.renderX,y:n.renderY,size:n.renderDiameter,opacity:n.style.opacity,map:n.style.getPropertyValue("--body-map")}})})')
                        filename=f'transition-{label}-{int(fraction*100)}.png'
                        raw=cdp.call('Page.captureScreenshot',format='png')['data'];(output/filename).write_bytes(base64.b64decode(raw))
                        frames.append({'transition':label,'elapsedFraction':fraction,'file':filename,**state})
                    evaluate('(()=>{for(let i=0;i<100&&(camera.frame!==null||semanticFocus.animating);i++){reviewTime+=16;if(camera.frame!==null)camera.tick(reviewTime);else renderGraph();}})()')
                    settled()
            finally:
                evaluate('semanticFocus.now=reviewNow;camera.requestFrame=reviewRequest;delete window.reviewNow;delete window.reviewRequest;delete window.reviewTime;delete window.reviewStart')
            (output/'transitions.json').write_text(json.dumps(frames,indent=2),encoding='utf-8')
            check(all(0<frame['progress']<1 for frame in frames),'transition captures contain actual intermediate frames rather than settled scenes')

        if options.transitions_only:
            load('moonfamilies')
            evaluate("Object.assign(entries.get(focusFixture.ids.planetA),{appearance:{archetype:'oceanic',palette:'blue',rings:true}});updateEntryNode(entries.get(focusFixture.ids.planetA),nodes.get(focusFixture.ids.planetA));renderGraph()")
            capture_transitions()
            check(not cdp.errors,'controlled transition captures finish without browser exceptions')
            completed=True;print(f'PASS {count} transition review checks',flush=True);print(f'METRICS_AND_SCREENSHOTS {output}',flush=True);return

        if options.camera_review_only:
            load('moonfamilies');focus('sun');shot('camera-parent-planet')
            before=evaluate('JSON.stringify([...semanticFocus.world.points])');wheel('planetA',-35,8)
            check(anchor()==evaluate('focusFixture.ids.sun') and evaluate('JSON.stringify([...semanticFocus.world.points])')==before,'camera magnifies the unchanged Sun composition before entry');shot('camera-close-planet')
            native_enter('planetA');check(anchor()==evaluate('focusFixture.ids.planetA'),'double-click deliberately enters the Planet composition');shot('entered-planet-after-camera')
            capture_transitions();check(not cdp.errors,'camera comparison and intermediate transition review have no browser exceptions')
            completed=True;print(f'PASS {count} camera review checks',flush=True);print(f'METRICS_AND_SCREENSHOTS {output}',flush=True);return

        if options.usability_only or options.usability_mobile_only:
            load('moonfamilies')
            def geometry():
                return evaluate('JSON.stringify({world:semanticFocus.anchorId,layout:semanticFocus.layout.signature,points:[...semanticFocus.world.points].map(([id,p])=>[id,Math.round(p.dx*10000)/10000,Math.round(p.dy*10000)/10000])})')
            def arrangement():
                return evaluate('Object.fromEntries([...semanticFocus.world.points].map(([id,p])=>[id,{x:p.dx,y:p.dy}]))')
            def overview():
                return evaluate('JSON.stringify({world:semanticFocus.anchorId,path:semanticFocus.path,view:camera.view,galaxies:[...regions].map(([id,r])=>({id,opacity:r.style.opacity,hidden:r.dataset.semanticHidden,label:nodes.get(id).labelOpacity})),strong:[...nodes].filter(([id,n])=>n.matches(".is-focus-anchor,.is-focus-child,.is-inspected-detail,.label-priority")).map(([id])=>id)})')
            def native_drag(which,dx=58,dy=22):
                point=evaluate(f'(()=>{{const n=nodes.get(focusFixture.ids[{json.dumps(which)}]),x=n.renderX,y=n.renderY;return {{x,y,hit:document.elementFromPoint(x,y)?.closest(".entry-node")?.dataset.entryId}}}})()')
                check(point['hit']==evaluate(f'focusFixture.ids[{json.dumps(which)}]'),'native drag starts on the intended '+which)
                cdp.call('Input.dispatchMouseEvent',type='mousePressed',x=point['x'],y=point['y'],button='left',clickCount=1)
                cdp.call('Input.dispatchMouseEvent',type='mouseMoved',x=point['x']+dx,y=point['y']+dy,button='left',buttons=1)
                held=evaluate(f'({{x:nodes.get(focusFixture.ids[{json.dumps(which)}]).renderX,y:nodes.get(focusFixture.ids[{json.dumps(which)}]).renderY}})')
                cdp.call('Input.dispatchMouseEvent',type='mouseReleased',x=point['x']+dx,y=point['y']+dy,button='left',clickCount=1)
                settled()
                final=evaluate(f'({{x:nodes.get(focusFixture.ids[{json.dumps(which)}]).renderX,y:nodes.get(focusFixture.ids[{json.dumps(which)}]).renderY}})')
                check(abs(final['x']-held['x'])+abs(final['y']-held['y'])<48,'release retains a meaningful '+which+' placement with soft containment')
                check(evaluate(f'layout.has(focusFixture.ids[{json.dumps(which)}])&&["angle","parentId","radius"].every(k=>k in layout.get(focusFixture.ids[{json.dumps(which)}]))'),'drag reuses v5 parent-relative placement for '+which)
                return final
            restored={}
            if not options.usability_mobile_only:
                for which in ['sun','planetA','firstChild']:
                    focus(which);before=geometry()
                    evaluate('window.cameraAudit={build:0,reheat:0};window.auditBuild=cosmosLocalLayout.build;window.auditReheat=physics.reheat;cosmosLocalLayout.build=function(...args){cameraAudit.build++;return auditBuild.apply(this,args)};physics.reheat=function(...args){cameraAudit.reheat++;return auditReheat.apply(this,args)}')
                    wheel(None,-35,20);wheel(None,35,20)
                    evaluate('document.getElementById("canvas-fit").click()');settled()
                    evaluate('camera.panTo(camera.view.x+31,camera.view.y-18)');wheel(None,-35,3)
                    check(geometry()==before,which+': 20 in/20 out, Fit, pan and more zoom preserve identical world-space geometry')
                    check(evaluate('cameraAudit.build===0&&cameraAudit.reheat===0'),which+': camera operations perform no local solve, radial-band regeneration or force reset')
                    evaluate('cosmosLocalLayout.build=auditBuild;physics.reheat=auditReheat;delete window.auditBuild;delete window.auditReheat;delete window.cameraAudit')
                    shot('geometry-'+which)
                focus('sun');before=geometry();wheel('planetA',-35,8)
                check(geometry()==before,'close wheel inspection never partially enters the Planet layout')
                shot('camera-close-planet')
                native_enter('planetA');check(anchor()==evaluate('focusFixture.ids.planetA') and geometry()!=before,'only intentional double-click changes to the Planet composition')
                shot('entered-planet-after-camera')
                evaluate('focusFixture.ids.satelliteB="focus-satellite-b"')
                for which,targets in [('sun',['planetA','planetB']),('planetA',['firstChild','offscreenChild']),('firstChild',['satellite','satelliteB'])]:
                    focus(which);evaluate('document.getElementById("canvas-fit").click()');settled();before=arrangement()
                    for target in targets:native_drag(target,42,18)
                    after=arrangement()
                    check(all(abs(after[evaluate(f'focusFixture.ids[{json.dumps(target)}]')]['x']-before[evaluate(f'focusFixture.ids[{json.dumps(target)}]')]['x'])+abs(after[evaluate(f'focusFixture.ids[{json.dumps(target)}]')]['y']-before[evaluate(f'focusFixture.ids[{json.dumps(target)}]')]['y'])>15 for target in targets),which+': several intentional local rearrangements survive release')
                    focus('sun' if which!='sun' else 'galaxy');focus(which)
                    check(arrangement()==after,which+': re-entry retains the manual arrangement')
                focus('firstChild');evaluate('document.getElementById("canvas-fit").click()');settled()
                # The AST target is a real child of Satellite A, not another world.
                evaluate('focusFixture.ids.astronaut="focus-deep-0"')
                before=geometry();native_drag('astronaut',-24,34);after=geometry()
                check(after!=before and anchor()==evaluate('focusFixture.ids.firstChild'),'Astronaut dragging remains meaningful inside the Moon world')
                pairs=evaluate('(()=>{const s=nodes.get(focusFixture.ids.satellite),a=nodes.get(focusFixture.ids.astronaut);return {ratio:s.renderDiameter/a.renderDiameter,parent:entries.get(focusFixture.ids.astronaut).parentId,expected:focusFixture.ids.satellite}})()')
                check(1.5<=pairs['ratio']<=2.1 and pairs['parent']==pairs['expected'],'Satellite is distinctly larger and its Astronaut retains actual parentage')
                shot('manual-moon-families')
                stored=evaluate('JSON.stringify([...layout])');expected=arrangement()
                evaluate('saveGalaxy()');cdp.call('Page.reload');wait('typeof cameraViewReady!=="undefined"&&cameraViewReady');evaluate('ambient.destroy();physics.pause();physics.simulation.tick(260);physics.onTick(physics.particles);physics.settled=true;physics.onSettle()')
                focus('firstChild')
                check(evaluate('JSON.stringify([...layout])')==stored,'refresh preserves existing v5 placement records')
                restored=arrangement()
                check(all(abs(restored[id]['x']-p['x'])+abs(restored[id]['y']-p['y'])<.01 for id,p in expected.items()),'refresh reproduces the bounded Moon arrangement')
                focus('deepTarget');evaluate('contentInspector.editNotes();contentInspector.notes.value="Keep the selected detail draft"')
                selected=evaluate('selectedNode.dataset.entryId')
                evaluate('document.getElementById("world-home").click()');settled();top=overview();shot('overview-top')
                check(anchor() is None and evaluate('semanticFocus.layout===null&&[...nodes].every(([id,n])=>!n.matches(".is-focus-anchor,.is-focus-child,.is-inspected-detail"))'),'top Universe clears every local-world emphasis')
                check(evaluate('[...entries.values()].filter(e=>e.depth===0).every(e=>nodes.get(e.id).labelOpacity===1&&parseFloat(getComputedStyle(nodes.get(e.id).querySelector(".node-label")).fontSize)>=14)&&selectedNode.labelOpacity===0&&!selectedNode.classList.contains("label-priority")'),'Universe restores full-size Galaxy names and suppresses deep canvas dominance while retaining Content selection')
                check(evaluate('selectedNode.dataset.entryId')==selected and evaluate('!contentInspector.notesForm.hidden&&contentInspector.notes.value==="Keep the selected detail draft"'),'Universe preserves selected Content and its draft')
                focus('deepTarget');evaluate('document.getElementById("universe-home").click()');settled()
                if overview()!=top:print('OVERVIEW_DIFFERENCE '+json.dumps({'top':json.loads(top),'sidebar':json.loads(overview())}),flush=True)
                check(overview()==top,'sidebar Universe and top Universe produce the identical canonical overview');shot('overview-sidebar')
                evaluate('document.getElementById("universe-toggle").click()')
                check(anchor() is None and evaluate('hierarchySidebar.universeSection.collapsed'),'the separate chevron only collapses the tree')
                evaluate('document.getElementById("universe-toggle").click()')
                expected={}
                for cycle in range(10):
                    for which in ['sun','planetA','firstChild']:
                        focus(which);before=geometry()
                        if which in expected:check(before==expected[which],f'manual cycle {cycle+1}: {which} restores its intentional arrangement')
                        wheel(None,-30,2);wheel(None,30,2)
                        check(geometry()==before,f'manual cycle {cycle+1}: {which} camera zoom causes no geometry drift')
                        if which=='sun':native_drag('planetB',10 if cycle%2==0 else -10,0)
                        expected[which]=geometry()
                    for parent in ['planetA','sun']:
                        evaluate('document.getElementById("world-up").click()');settled()
                        check(geometry()==expected[parent],f'manual cycle {cycle+1}: Parent restores {parent} including retained drags')
                    evaluate('document.getElementById("world-home").click()');settled()
                    check(anchor() is None,f'manual cycle {cycle+1}: Universe clears focus after combined camera and drag operations')
                load('moonorbit');focus('firstChild');evaluate('document.getElementById("canvas-fit").click()');settled()
                check(evaluate('(()=>{const points=semanticFocus.world.points,dist=(a,b)=>Math.hypot(points.get(a).dx-points.get(b).dx,points.get(a).dy-points.get(b).dy);return ["focus-a1","focus-a2","focus-a3"].every(id=>entries.get(id).parentId==="focus-satellite-a"&&dist(id,"focus-satellite-a")<dist(id,"focus-satellite-b")*.5)&&entries.get("focus-b1").parentId==="focus-satellite-b"&&dist("focus-b1","focus-satellite-b")<dist("focus-b1","focus-satellite-a")*.5})()'),'three Astronauts mini-orbit Satellite A and one belongs to Satellite B')
                check(evaluate('(()=>{const s=nodes.get("focus-satellite-a").renderDiameter,a=nodes.get("focus-a1").renderDiameter;return s/a>=1.5&&s/a<=2.1&&lines.filter(l=>["focus-a1","focus-a2","focus-a3","focus-b1"].includes(l.to)).every(l=>+l.element.style.opacity>0)})()'),'both compact families have clear size hierarchy and readable parent tethers')
                shot('satellite-mini-orbits')
            for width,height,name in [(390,844,'portrait'),(844,390,'landscape')]:
                cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=True)
                cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=5)
                load('moonorbit');focus('satellite');before=arrangement()
                for which in ['satellite','deepWorld']:
                    focus(which);p=evaluate(f'({{x:nodes.get(focusFixture.ids[{json.dumps(which)}]).renderX,y:nodes.get(focusFixture.ids[{json.dumps(which)}]).renderY}})')
                    original=arrangement();id=evaluate(f'focusFixture.ids[{json.dumps(which)}]')
                    cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[{'x':p['x'],'y':p['y'],'id':1}])
                    cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[{'x':p['x']+26,'y':p['y']-18,'id':1}])
                    cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[]);settled()
                    moved=arrangement()
                    check(abs(moved[id]['x']-original[id]['x'])+abs(moved[id]['y']-original[id]['y'])>8,f'mobile {name}: {which} touch drag retains user intent')
                    check(evaluate('canvasTouches.size===0&&pinch===null&&activeNodeDrags===0'),f'mobile {name}: drag releases every capture')
                shot('mobile-manual-'+name)
                if name=='landscape':check(evaluate('panel.hidden&&physics.bounds.bottom-physics.bounds.top>180'),'landscape drag keeps its released body visible instead of covering it with the idle sheet')
                focus('deepTarget');evaluate('setInspectorOpen(true);contentInspector.editNotes();contentInspector.notes.value="Mobile overview draft"')
                evaluate('document.getElementById("world-home").click()');settled();top=overview()
                focus('deepTarget');evaluate('hierarchySidebar.setCollapsed(false);document.getElementById("universe-home").click()');settled()
                if overview()!=top:print('MOBILE_OVERVIEW_DIFFERENCE '+json.dumps({'top':json.loads(top),'sidebar':json.loads(overview()),'content':evaluate('({panel:panel.hidden,draft:contentInspector.notes.value,editing:contentInspector.notesForm.hidden,beforeDrawer:inspectorBeforeDrawer})')}),flush=True)
                check(overview()==top and evaluate('hierarchySidebar.collapsed'),f'mobile {name}: sidebar and top Universe restore the same usable overview')
                check(evaluate('!contentInspector.notesForm.hidden&&contentInspector.notes.value==="Mobile overview draft"'),f'mobile {name}: either home action preserves the Content draft')
                if name=='landscape':
                    check(evaluate('panel.hidden&&physics.bounds.bottom-physics.bounds.top>180'),f'mobile {name}: home reclaims usable overview space from a tall sheet')
                    evaluate('setInspectorOpen(true)')
                    check(evaluate('!panel.hidden&&!contentInspector.notesForm.hidden&&contentInspector.notes.value==="Mobile overview draft"'),'reopening the same Content item restores the landscape draft')
                cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'reduce'}]);focus('firstChild');before=geometry();wheel(None,-35,3);wheel(None,35,3)
                check(geometry()==before,f'mobile {name}: reduced motion keeps the camera-only geometry contract')
                cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'no-preference'}])
            cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
            cdp.call('Emulation.setTouchEmulationEnabled',enabled=False)
            check(not cdp.errors,'camera geometry, playful dragging and Universe checks have no browser exceptions')
            (output/'usability.json').write_text(json.dumps({'checks':count,'arrangement':restored},indent=2),encoding='utf-8')
            completed=True;print(f'PASS {count} usability browser checks',flush=True);print(f'METRICS_AND_SCREENSHOTS {output}',flush=True);return

        if options.stability_only:
            load('moonfamilies')
            evaluate("Object.assign(entries.get(focusFixture.ids.planetA),{appearance:{archetype:'oceanic',palette:'blue',rings:true}});updateEntryNode(entries.get(focusFixture.ids.planetA),nodes.get(focusFixture.ids.planetA));renderGraph()")
            original=evaluate('JSON.stringify([...entries.values()].map(e=>[e.id,e.parentId,e.x,e.y,galaxyAppearance.resolve(e)]))')
            # Suppressed Galaxy text follows a separately eased cloud footprint;
            # compare its world point, and actual screen geometry when visible.
            evaluate("window.stabilitySnapshot=()=>({world:semanticFocus.anchorId,path:semanticFocus.path.slice(),layout:semanticFocus.layout?.signature||null,bodies:[...nodes].map(([id,n])=>{const point=n.dataset.body==='galaxy'&&n.labelOpacity<.01?semanticFocus.point(entries.get(id)):{x:n.renderX,y:n.renderY};return {id,x:Math.round(point.x*1000)/1000,y:Math.round(point.y*1000)/1000,size:Math.round(n.renderDiameter*1000)/1000,hidden:n.dataset.semanticHidden,relation:n.dataset.focusRelation,identity:galaxyAppearance.resolve(entries.get(id))}}),count:nodes.size});")
            evaluate("""window.startPresence=(id)=>{const node=nodes.get(id),identity=JSON.stringify(galaxyAppearance.resolve(entries.get(id))),samples=[];window.presence={id,samples,done:false};
                const sample=()=>{const n=nodes.get(id),b=physics.bounds,inside=n.renderX>=b.left&&n.renderX<=b.right&&n.renderY>=b.top&&n.renderY<=b.bottom,s=getComputedStyle(n),p=getComputedStyle(n,'::before'),resource=galaxyAppearance.rasterResources?.get(n.style.getPropertyValue('--body-map'));
                    const missingShape=n.dataset.body==='galaxy'?!regions.get(id)?.isConnected:s.backgroundImage==='none'&&(p.content==='none'||p.backgroundImage==='none');
                    const bad=n!==node||!n.isConnected||JSON.stringify(galaxyAppearance.resolve(entries.get(id)))!==identity||inside&&(n.dataset.culled==='true'||n.dataset.semanticHidden==='true'||+s.opacity<.01||s.visibility==='hidden'||missingShape);
                    samples.push({time:performance.now(),x:n.renderX,y:n.renderY,size:n.renderDiameter,inside,bad,paint:n.dataset.bodyPaint||null,live:!resource||resource.refs>0});
                    if(!presence.done)requestAnimationFrame(sample);};requestAnimationFrame(sample);};""")

            def presence_start(which):evaluate(f'startPresence(focusFixture.ids[{json.dumps(which)}])')
            def presence_end(label):
                evaluate('presence.done=true');state=evaluate('({samples:presence.samples.length,bad:presence.samples.filter(s=>s.bad||!s.live)})')
                check(state['samples']>0 and not state['bad'],label+': body identity and continuous in-place presence '+json.dumps({'samples':state['samples'],'bad':state['bad'][:3]}))
                return state

            states=[]
            for cycle in range(10):
                evaluate('leaveLocalWorld();clearSelection();setInspectorOpen(false)');settled()
                snapshots=[]
                for which in ['galaxy','sun','planetA','firstChild']:
                    presence_start(which);native_enter(which);ready_surface();presence_end(f'cycle {cycle+1} enter {which}')
                    snapshots.append(evaluate('stabilitySnapshot()'))
                for current,parent in [('firstChild','planetA'),('planetA','sun'),('sun','galaxy')]:
                    presence_start(current)
                    evaluate('document.getElementById("world-up").click()');settled();ready_surface();presence_end(f'cycle {cycle+1} Parent {current}')
                    check(anchor()==evaluate(f'focusFixture.ids[{json.dumps(parent)}]'),'Parent leaves exactly one world')
                    snapshots.append(evaluate('stabilitySnapshot()'))
                presence_start('galaxy');evaluate('document.getElementById("world-home").click()');settled();presence_end(f'cycle {cycle+1} Universe')
                snapshots.append(evaluate('stabilitySnapshot()'));states.append(snapshots)
                (output/'repeatability.json').write_text(json.dumps(states,indent=2),encoding='utf-8')
                if cycle and snapshots!=states[0]:
                    changes=[]
                    for stage,(a,b) in enumerate(zip(states[0],snapshots)):
                        if a!=b:
                            changes.append({'stage':stage,'world':b['world'],'changedBodies':[{'before':x,'after':y} for x,y in zip(a['bodies'],b['bodies']) if x!=y][:5]})
                    print('REPEATABILITY_DIFFERENCES '+json.dumps(changes),flush=True)
                if cycle:check(snapshots==states[0],f'cycle {cycle+1}: no size/ratio/geometry accumulation or missing/duplicated identities')
                check(evaluate('semanticFocus.world.id===null&&semanticFocus.world.layout===null&&semanticFocus.path.length===0&&[...nodes.values()].every(n=>!n.classList.contains("is-focus-anchor")&&!n.classList.contains("is-focus-child")&&!n.classList.contains("is-inspected-detail"))'),'Universe resets authoritative world and every strong focus class')
            metrics['repeatability']={'cycles':10,'snapshots':states}

            for which in ['galaxy','sun','planetA','firstChild']:
                focus(which);evaluate('setInspectorOpen(false)');settled();before=anchor();layout=evaluate('semanticFocus.layout.signature')
                presence_start(which)
                evaluate("""new Promise(resolve=>{const view={...camera.view},b=physics.bounds,center={x:(b.left+b.right)/2,y:(b.top+b.bottom)/2},world=camera.screenToWorld(center.x,center.y);let i=0;
                    const frame=()=>{const ratio=[1.1,.1,2.2,.025,3,.2,1.8,.3,1.05,.95][i%10],scale=Math.max(camera.minScale,Math.min(camera.maxScale,view.scale*ratio));
                        zoomSemanticAt(center.x,center.y,scale/camera.view.scale,false);camera.panTo(center.x-world.x*scale+Math.sin(i*.7)*18,center.y-world.y*scale+Math.cos(i*.7)*12);
                        if(++i<80)requestAnimationFrame(frame);else{camera.setView(view,false);resolve();}};requestAnimationFrame(frame);})""")
                settled();presence_end('zoom torture '+which)
                check(anchor()==before and evaluate('semanticFocus.layout.signature')==layout,'rapid in/out zoom and pan never change '+which+' world/path/layout')
                wheel(None,70,8);wheel(None,-70,8)
                check(anchor()==before,'slow in/out wheel never changes '+which+' world')
                evaluate('document.getElementById("canvas-fit").click()');settled()
                check(anchor()==before,'Fit retains '+which+' world')
            focus('firstChild');shot('stability-moon-families')
            check(evaluate("(()=>{const p=semanticFocus.layout.positions,dist=(a,b)=>Math.hypot(p.get(a).dx-p.get(b).dx,p.get(a).dy-p.get(b).dy);return ['focus-b-astronaut-0','focus-b-astronaut-1'].every(id=>p.get(id).parentId==='focus-satellite-b'&&dist(id,'focus-satellite-b')<dist(id,focusFixture.ids.satellite)*.5)})()"),'Moon retains actual Satellite-owned Astronaut clusters')
            check(evaluate("lines.filter(l=>l.from==='focus-satellite-b').length===4&&lines.filter(l=>l.from==='focus-satellite-b').every(l=>l.element.classList.contains('astronaut-tether')&&+l.element.style.opacity>0&&entries.get(l.to).parentId===l.from)"),'Moon detail families retain visible tethers to their actual Satellite parent')
            check(evaluate('JSON.stringify([...entries.values()].map(e=>[e.id,e.parentId,e.x,e.y,galaxyAppearance.resolve(e)]))')==original,'cycles and zoom torture never rewrite canonical data or visual identity')
            evaluate('leaveLocalWorld()');settled()

            if options.screenshots:
                capture_transitions()

            check(not cdp.errors,'repeatability, continuous presence and zoom torture finish without browser exceptions')
            (output/'metrics.json').write_text(json.dumps({'checks':count,'stability':metrics},indent=2),encoding='utf-8')
            completed=True;print(f'PASS {count} stability browser checks',flush=True);print(f'METRICS_AND_SCREENSHOTS {output}',flush=True);return

        if options.semantic_only or options.mobile_only:
            for case in ([] if options.mobile_only else ['sun3','sun14','recipes50','moonmany','siblings100']):
                load(case);metrics[case]={}
                evaluate('leaveLocalWorld();clearSelection();setInspectorOpen(false)');settled()
                if case=='recipes50':
                    sun_identity=identity('sun');shot('J-sun-parent')
                    native_enter('sun')
                    check(anchor()==evaluate('focusFixture.ids.sun') and whole('sun'),'Sun entry works directly from overview without preliminary zoom')
                    shot('J-sun-entered');wheel('sun',-40,6);shot('J-sun-close')
                    check(identity('sun')==sun_identity and whole('sun'),'Sun parent/entry/close identity stays fixed and its normal focus remains whole')
                    evaluate('leaveLocalWorld();clearSelection();setInspectorOpen(false)');settled()
                evaluate("(()=>{const p=physics.particles.get(focusFixture.ids.sun),b=physics.bounds;camera.setView({x:(b.left+b.right)/2-p.x*.45,y:(b.top+b.bottom)/2-p.y*.45,scale:.45},false)})()")
                evaluate('selectEntry(entries.get(focusFixture.ids.deepTarget),nodes.get(focusFixture.ids.deepTarget),{openInspector:false});window.broadBefore=camera.view.scale')
                wheel('sun',-40,6)
                check(anchor() is None and evaluate('camera.view.scale>broadBefore'),f'A {case}: inward wheel magnifies overview without inferring an anchor, even with a deep selected target')
                shot(f'A-{case}-camera-overview')
                evaluate('clearSelection();window.sunIdentity=galaxyAppearance.resolve(entries.get(focusFixture.ids.sun))')
                native_enter('sun')
                check(anchor()==evaluate('focusFixture.ids.sun') and whole('sun'),f'B {case}: native double-click intentionally enters the whole Sun')
                check(evaluate('JSON.stringify(sunIdentity)===JSON.stringify(galaxyAppearance.resolve(entries.get(focusFixture.ids.sun)))'),f'B {case}: Sun identity is unchanged')
                if case=='sun14':
                    check(evaluate('semanticFocus.layout.rings.length>=2'),'B: fourteen Planets retain stable multiple rings')
                shot(f'B-{case}-sun-world')
                if case=='recipes50':
                    evaluate("Object.assign(entries.get(focusFixture.ids.planetA),{appearance:{archetype:'oceanic',palette:'blue',rings:true}});updateEntryNode(entries.get(focusFixture.ids.planetA),nodes.get(focusFixture.ids.planetA));renderGraph()")
                wait("nodes.get(focusFixture.ids.planetA).dataset.textureReady==='true'")
                planet_identity=identity('planetA')
                shot(f'J-{case}-planet-parent')
                evaluate('window.clickedPoint={...semanticFocus.point(entries.get(focusFixture.ids.planetA))}')
                native_enter('planetA')
                check(anchor()==evaluate('focusFixture.ids.planetA') and whole('planetA'),f'C {case}: double-click enters a whole Planet')
                check(evaluate('(()=>{const p=semanticFocus.anchorPoint(),a=clickedPoint;return Math.hypot(p.x-a.x,p.y-a.y)<8})()'),f'C {case}: clicked Planet retains its projected identity position instead of teleporting to canonical coordinates')
                check(identity('planetA')==planet_identity,f'J {case}: Planet palette, archetype, seed and ring style survive entry')
                shot(f'C-{case}-planet-entry')
                evaluate('contentInspector.editNotes();contentInspector.notes.value="Keep my draft during camera zoom";window.localLayout=semanticFocus.layout.signature;window.localPoints=JSON.stringify([...semanticFocus.layout.positions])')
                wheel('firstChild',-40,4)
                check(anchor()==evaluate('focusFixture.ids.planetA') and evaluate('semanticFocus.layout.signature===localLayout&&JSON.stringify([...semanticFocus.layout.positions])===localPoints'),f'D {case}: wheel toward a child only zooms the existing Planet layout')
                check(evaluate('!contentInspector.notesForm.hidden&&contentInspector.notes.value==="Keep my draft during camera zoom"'),f'D {case}: camera zoom keeps Content draft intact')
                evaluate('document.getElementById("content-cancel-notes").click()')
                focus('planetA')
                if case=='recipes50':
                    sizes=[]
                    for step in range(11):
                        sizes.append(evaluate('nodes.get(focusFixture.ids.planetA).renderDiameter'))
                        if step in [0,4,10]:shot(['D-planet-whole','D-planet-large','D-planet-natural-crop'][[0,4,10].index(step)])
                        if step<10:wheel('planetA',-40)
                    check(all(b>=a for a,b in zip(sizes,sizes[1:])),'D: slow camera zoom grows the same Planet continuously')
                    check(anchor()==evaluate('focusFixture.ids.planetA') and evaluate('nodes.get(focusFixture.ids.planetA).renderDiameter>Math.min(physics.bounds.right-physics.bounds.left,physics.bounds.bottom-physics.bounds.top)'),'D: cropping is caused by a genuinely oversized body, without entering a child')
                    check(evaluate('(()=>{const n=nodes.get(focusFixture.ids.planetA),b=physics.bounds;return Math.abs(n.renderX-(b.left+b.right)/2)<2&&Math.abs(n.renderY-(b.top+b.bottom)/2)<2})()'),'D: close zoom applies no cinematic or child-inference offset')
                    check(identity('planetA')==planet_identity,'J: close camera zoom keeps the same blue oceanic ringed Planet')
                    shot('J-planet-close')
                    wheel('planetA',40,10);check(whole('planetA'),'D: outward camera reversal restores whole Planet');shot('D-planet-reversed')
                    metrics[case]['planetDiameters']=sizes
                focus('planetA')
                moon_identity=identity('firstChild')
                shot(f'J-{case}-moon-parent')
                native_enter('firstChild')
                check(anchor()==evaluate('focusFixture.ids.firstChild') and whole('firstChild'),f'E {case}: native double-click enters a whole Moon')
                check(identity('firstChild')==moon_identity,f'J {case}: Moon identity remains the same at local entry')
                shot(f'E-{case}-moon-world')
                if case=='recipes50':
                    wheel('firstChild',-40,4)
                    check(whole('firstChild'),'E: medium camera proximity keeps the entire Moon visible')
                    shot('E-moon-medium')
                    wheel('firstChild',-40,6)
                    check(anchor()==evaluate('focusFixture.ids.firstChild') and evaluate('nodes.get(focusFixture.ids.firstChild).renderDiameter>Math.min(physics.bounds.right-physics.bounds.left,physics.bounds.bottom-physics.bounds.top)'), 'E: Moon crops only at genuinely oversized camera scale in the same world')
                    check(identity('firstChild')==moon_identity,'J: close Moon preserves its parent-view material, palette and identity')
                    shot('J-moon-close')
                    focus('firstChild')
                    check(whole('firstChild'),'E: explicit Moon focus restores its whole-body composition')
                moon_layout=evaluate('semanticFocus.layout.signature')
                focus('satellite')
                check(anchor()==evaluate('focusFixture.ids.firstChild') and evaluate('semanticFocus.inspectionId===focusFixture.ids.satellite') and whole('satellite'),f'F {case}: Satellite navigation only inspects inside Moon context')
                check(evaluate('nodes.get(focusFixture.ids.satellite).renderDiameter<=120'),f'F {case}: Satellite inspection stays modest')
                check(evaluate('semanticFocus.layout.signature')==moon_layout,f'F {case}: Satellite inspection never rearranges the Moon layout')
                native_enter('satellite')
                check(anchor()==evaluate('focusFixture.ids.firstChild'),f'F {case}: Satellite double-click creates no semantic level')
                shot(f'F-{case}-satellite-inspection')
                focus('deepWorld')
                check(anchor()==evaluate('focusFixture.ids.firstChild') and whole('deepWorld') and evaluate('nodes.get(focusFixture.ids.deepWorld).renderDiameter<=84'),f'G {case}: deep Astronaut is small and whole in its Moon context')
                native_enter('deepWorld')
                check(anchor()==evaluate('focusFixture.ids.firstChild'),f'G {case}: Astronaut double-click creates no semantic world')
                shot(f'G-{case}-astronaut-inspection')
                evaluate('window.beforeDeep=camera.view.scale')
                wheel('deepWorld',-40,4)
                check(anchor()==evaluate('focusFixture.ids.firstChild') and evaluate('camera.view.scale>beforeDeep&&semanticFocus.path.every(id=>entries.get(id).depth<=3)'),f'H {case}: continued inward camera zoom stays at maximum Moon depth')
                check(identity('firstChild')==moon_identity,f'J {case}: inspecting details and close zoom cannot alter Moon appearance')
                shot(f'H-{case}-moon-detail-close')
                focus('firstChild')
                evaluate('contentInspector.editNotes();contentInspector.notes.value="Preserve content during explicit exit";window.selectedBefore=selectedNode.dataset.entryId')
                visited=[anchor()]
                wheel(None,170,6)
                check(anchor()==visited[0],f'I {case}: outward wheel stays in Moon even far below the old threshold')
                for _ in range(4):
                    evaluate('document.getElementById("world-up").click()');settled();visited.append(anchor())
                expected=evaluate('[focusFixture.ids.firstChild,focusFixture.ids.planetA,focusFixture.ids.sun,focusFixture.ids.galaxy,null]')
                check(visited==expected,f'I {case}: explicit Parent follows Moon, Planet, Sun, Galaxy, Universe')
                check(evaluate('selectedNode.dataset.entryId===selectedBefore&&!contentInspector.notesForm.hidden&&contentInspector.notes.value==="Preserve content during explicit exit"'),f'I {case}: explicit exit preserves Content independently of world emphasis')
                check(evaluate('[...nodes.values()].every(n=>!n.classList.contains("is-focus-anchor"))&&semanticFocus.path.length===0'),f'I {case}: no former selected world remains semantically dominant')
                evaluate('document.getElementById("content-cancel-notes").click()');shot(f'I-{case}-universe')
                metrics[case]['outwardPath']=visited
                focus('deepTarget')
                check(anchor()==evaluate('focusFixture.ids.firstChild') and evaluate('selectedNode.dataset.entryId===focusFixture.ids.deepTarget'),f'{case}: sidebar/Search focus entry resolves deepest item to Moon and selects actual target')
                evaluate('activateConstellation("focus-constellation");openPortal("focus-linked")');settled()
                check(anchor()==evaluate('focusFixture.ids.firstChild') and evaluate('activeConstellationId==="focus-constellation"&&selectedNode.dataset.entryId===focusFixture.ids.deepTarget'),f'{case}: linked deep travel retains canonical target, Moon context and lens')
                evaluate('document.getElementById("world-up").click()');settled()
                check(anchor()==evaluate('focusFixture.ids.planetA') and evaluate('activeConstellationId==="focus-constellation"'),f'{case}: Parent ascends one semantic level and keeps lens')
                evaluate('document.getElementById("world-home").click()');settled()
                check(anchor() is None and evaluate('activeConstellationId==="focus-constellation"'),f'{case}: Universe clears local context without dropping lens')
                evaluate('exitConstellation()')
            for width,height,name in [(390,844,'portrait'),(844,390,'landscape')]:
                cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=True)
                cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=5)
                load('recipes50')
                evaluate('leaveLocalWorld();clearSelection();setInspectorOpen(false)');settled()
                evaluate('(()=>{const r=regions.get(focusFixture.ids.galaxy);camera.panTo(camera.view.x+innerWidth/2-r.renderX,camera.view.y+innerHeight*.25-r.renderY)})()');settled()
                cloud_point=evaluate('(()=>{const r=regions.get(focusFixture.ids.galaxy);for(let y=r.renderY-40;y<=r.renderY+40;y+=10)for(let x=r.renderX-60;x<=r.renderX+60;x+=10)if(y>80&&y<innerHeight*.4&&document.elementFromPoint(x,y)?.id==="graph-viewport"&&galaxyAtScreen({x,y})===focusFixture.ids.galaxy)return {x,y};return null})()')
                check(cloud_point is not None,f'mobile {name}: visible Galaxy cloud has an unobscured touch point')
                for tap in range(2):
                    cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[{'x':cloud_point['x'],'y':cloud_point['y'],'id':1}])
                    cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
                    if tap==0:check(anchor() is None,f'mobile {name}: a cloud single tap selects Content without entering')
                    time.sleep(.06)
                settled()
                if anchor()!=evaluate('focusFixture.ids.galaxy'):
                    print('CLOUD_TOUCH_STATE '+json.dumps(evaluate('({tap:lastBodyTap,selected:selectedNode?.dataset.entryId,world:semanticFocus.anchorId,pan,pinch,activeNodeDrags,suppressTouchClick})')),flush=True)
                check(anchor()==evaluate('focusFixture.ids.galaxy'),f'mobile {name}: Galaxy cloud double-tap intentionally enters its world')
                evaluate('leaveLocalWorld();clearSelection();setInspectorOpen(false)');settled()
                for which in ['sun','planetA','firstChild']:
                    # Keep the native double-tap point above the Content sheet
                    # opened by its first tap; neither tap changes hierarchy alone.
                    evaluate(f"(()=>{{const e=entries.get(focusFixture.ids[{json.dumps(which)}]),p=semanticFocus.point(e),scale={'.55' if which=='sun' else 'camera.view.scale'};camera.setView({{x:innerWidth/2-p.x*scale,y:innerHeight*.25-p.y*scale,scale}},false)}})()")
                    settled()
                    p=evaluate(f"(()=>{{const n=nodes.get(focusFixture.ids[{json.dumps(which)}]);return {{x:n.renderX,y:n.renderY}}}})()")
                    for _ in range(2):
                        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[{'x':p['x'],'y':p['y'],'id':1}])
                        cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
                        time.sleep(.06)
                    settled()
                    check(anchor()==evaluate(f'focusFixture.ids[{json.dumps(which)}]') and whole(which),f'mobile {name}: native double-tap enters the whole {which} world')
                    evaluate('setInspectorOpen(false)');settled()
                focus('firstChild');evaluate('setInspectorOpen(false)');settled()
                b=evaluate('({...physics.bounds})');x=(b['left']+b['right'])/2;y=(b['top']+b['bottom'])/2
                def pinch_gesture(start,end):
                    cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[{'x':x-start,'y':y},{'x':x+start,'y':y}])
                    cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[{'x':x-end,'y':y},{'x':x+end,'y':y}])
                    cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[]);settled()
                before=evaluate('camera.view.scale')
                pinch_gesture(28,55)
                check(anchor()==evaluate('focusFixture.ids.firstChild') and evaluate('camera.view.scale')>before,f'mobile {name}: inward pinch only magnifies the same Moon')
                pinch_gesture(55,28);pinch_gesture(55,28)
                check(anchor()==evaluate('focusFixture.ids.firstChild'),f'mobile {name}: outward pinch stays in the same Moon world')
                evaluate('document.getElementById("world-up").click()');settled()
                check(anchor()==evaluate('focusFixture.ids.planetA'),f'mobile {name}: Parent explicitly leaves Moon')
                focus('firstChild');evaluate('setInspectorOpen(false)');settled()
                # Pan a currently visible detail into an unobscured touch area.
                # Do not change scale or world to make double-tap work.
                evaluate('(()=>{const n=nodes.get(focusFixture.ids.satellite);camera.panTo(camera.view.x+innerWidth/2-n.renderX,camera.view.y+innerHeight*.25-n.renderY)})()')
                settled()
                p=evaluate('(()=>{const n=nodes.get(focusFixture.ids.satellite);return {x:n.renderX,y:n.renderY}})()')
                # First tap selects; second intentional tap inspects, never enters a world.
                for _ in range(2):
                    cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[{'x':p['x'],'y':p['y'],'id':1}])
                    cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
                    time.sleep(.06)
                settled()
                detail_state=evaluate('({world:semanticFocus.anchorId,selected:selectedNode?.dataset.entryId,inspection:semanticFocus.inspectionId,tap:lastBodyTap,view:camera.view,bounds:physics.bounds,satellite:{x:nodes.get(focusFixture.ids.satellite).renderX,y:nodes.get(focusFixture.ids.satellite).renderY,size:nodes.get(focusFixture.ids.satellite).renderDiameter},hit:document.elementFromPoint('+str(p['x'])+','+str(p['y'])+')?.outerHTML.slice(0,300)})')
                if not (anchor()==evaluate('focusFixture.ids.firstChild') and evaluate('selectedNode.dataset.entryId===focusFixture.ids.satellite&&semanticFocus.inspectionId===focusFixture.ids.satellite') and whole('satellite')):
                    print('MOBILE_DETAIL_STATE '+json.dumps(detail_state),flush=True)
                check(anchor()==evaluate('focusFixture.ids.firstChild') and evaluate('selectedNode.dataset.entryId===focusFixture.ids.satellite&&semanticFocus.inspectionId===focusFixture.ids.satellite') and whole('satellite'),f'mobile {name}: native detail double-tap selects/inspects a whole object without another world')
                focus('satellite');evaluate('setInspectorOpen(false)');settled()
                check(anchor()==evaluate('focusFixture.ids.firstChild') and whole('satellite'),f'mobile {name}: small Satellite inspection keeps Moon context')
                shot(f'mobile-{name}-detail')
                cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'reduce'}])
                focus('deepTarget')
                check(anchor()==evaluate('focusFixture.ids.firstChild') and evaluate('semanticFocus.progress===1&&camera.frame===null'),f'mobile {name}: reduced motion retains Moon maximum and explicit detail inspection')
                cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'no-preference'}])
                check(evaluate('document.documentElement.scrollWidth<=innerWidth'),f'mobile {name}: no page overflow')
            cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
            cdp.call('Emulation.setTouchEmulationEnabled',enabled=False)

        for case in ([] if options.semantic_only or options.mobile_only else options.cases.split(',')):
            load(case)
            metrics[case] = {'total': evaluate('entries.size'), 'far': performance_sample()}
            shot(f'{case}-far')
            evaluate('window.reviewFarView={...camera.view};(()=>{const p=entries.get(focusFixture.ids.galaxy),b=physics.bounds;camera.setView({scale:.2,x:(b.left+b.right)/2-p.x*.2,y:(b.top+b.bottom)/2-p.y*.2},false)})()')
            shot(f'{case}-galaxy-far')
            if not options.baseline:
                check(evaluate("[...entries.values()].filter(e=>e.depth===0).every(e=>nodes.get(e.id).dataset.semanticHidden!=='true'&&nodes.get(e.id).labelOpacity>.9)"), f'{case}: far view retains readable Galaxy identity')
                check(evaluate("[...entries.values()].filter(e=>e.depth>=2).every(e=>nodes.get(e.id).dataset.semanticHidden==='true')"), f'{case}: far view suppresses deep graph noise')
            evaluate('camera.setView(reviewFarView,false)')
            focus('sun')
            sun_view = visibility()
            metrics[case]['sun'] = performance_sample()
            metrics[case]['sunVisibility'] = sun_view
            shot(f'{case}-sun')
            if not options.baseline:
                check(anchor() == evaluate('focusFixture.ids.sun'), f'{case}: Sun establishes semantic anchor')
                check(not sun_view['planetA']['hidden'] and not sun_view['planetB']['hidden'], f'{case}: Sun exposes immediate children')
                check(sun_view['firstChild']['hidden'] and sun_view['deepTarget']['hidden'], f'{case}: Sun suppresses full deep bodies')
                check(evaluate("[...nodes.values()].filter(n=>n.dataset.focusRelation==='descendant').every(n=>n.labelOpacity<.02 && n.querySelector('.node-label').dataset.densityHidden==='true')"), f'{case}: deep hints have no normal full labels')
                check(evaluate("document.querySelectorAll('.depth-hint').length<=16&&[...document.querySelectorAll('.depth-hint')].every(n=>+n.dataset.beads<=3&&(+n.dataset.count<100||+n.dataset.beads<=1))"), f'{case}: deep hints are aggregated and capped')
            focus('planetA', close=True)
            planet_view = visibility()
            metrics[case]['planet'] = performance_sample()
            metrics[case]['planetVisibility'] = planet_view
            metrics[case]['hintState'] = evaluate("""[...document.querySelectorAll('.depth-hint')].map(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return {owner:n.parentElement.dataset.entryId,count:+n.dataset.count,beads:+n.dataset.beads,mode:n.dataset.mode,connected:n.isConnected,text:n.textContent,opacity:s.opacity,visibility:s.visibility,display:s.display,background:s.backgroundImage,width:r.width,height:r.height,x:r.x,y:r.y}})""")
            shot(f'{case}-planet-many' if case == 'pathological100' else f'{case}-planet')
            if options.baseline:
                continue
            check(anchor() == evaluate('focusFixture.ids.planetA'), f'{case}: Planet establishes semantic anchor')
            check(not planet_view['firstChild']['hidden'], f'{case}: Planet exposes its own children')
            check(planet_view['planetA']['diameter'] > sun_view['planetA']['diameter'] * 2, f'{case}: entering Planet enlarges body substantially')
            check(evaluate("[...entries.values()].filter(e=>e.depth>2 && !galaxyModel.subtreeIds(entries,focusFixture.ids.planetA).has(e.id)).every(e=>nodes.get(e.id).dataset.semanticHidden==='true')"), f'{case}: unrelated sibling descendants stay suppressed')
            check(evaluate("semanticFocus.layout.radius>semanticFocus.layout.innerRadius && semanticFocus.layout.positions.size===semanticFocus.children.get(focusFixture.ids.planetA).length"), f'{case}: local territory gives every immediate child owned space')
            check(evaluate("galaxyAppearance.closeTextureCache.size<=6&&[...nodes.values()].filter(n=>n.dataset.closeDetail==='true').every(n=>n.dataset.entryId===semanticFocus.anchorId)"), f'{case}: rich surfaces are limited to the active world and a bounded cache')
            evaluate('window.focusOriginalPositions=JSON.stringify([...entries.values()].map(e=>[e.id,e.parentId,e.x,e.y]));window.focusOriginalSaved=localStorage.getItem("galaxy:user-data")')
            stable_anchor = anchor()
            evaluate("camera.zoomAt(600,400,.77);camera.panTo(camera.target.x+110,camera.target.y-75)")
            wait('!camera.frame')
            check(anchor() == stable_anchor, f'{case}: ordinary zoom and pan preserve anchor')
            evaluate('document.getElementById("canvas-fit").click()')
            wait('!camera.frame')
            check(anchor() == stable_anchor, f'{case}: Fit preserves local anchor')
            check(evaluate("(()=>{const b=physics.bounds;return semanticFocus.children.get(focusFixture.ids.planetA).every(e=>{const n=nodes.get(e.id);return n.renderX>=b.left&&n.renderX<=b.right&&n.renderY>=b.top&&n.renderY<=b.bottom})})()"), f'{case}: Fit recovers all immediate child positions')
            check(evaluate('JSON.stringify([...entries.values()].map(e=>[e.id,e.parentId,e.x,e.y]))===focusOriginalPositions && localStorage.getItem("galaxy:user-data")===focusOriginalSaved'), f'{case}: focus, zoom, pan and Fit do not persist projected offsets')
            shot(f'{case}-fit')
            evaluate('hierarchySidebar.onNavigate(focusFixture.ids.offscreenChild)')
            wait('!camera.frame')
            check(anchor() == evaluate('focusFixture.ids.offscreenChild'), f'{case}: sidebar reaches an off-screen child')
            check(evaluate("(()=>{const n=nodes.get(focusFixture.ids.offscreenChild),b=physics.bounds;return n.renderX>=b.left-1&&n.renderX<=b.right+1&&n.renderY>=b.top-1&&n.renderY<=b.bottom+1})()"), f'{case}: navigation brings target into usable viewport')
            if case != 'pathological100':
                focus('deepWorld', close=True)
                check(evaluate("semanticFocus.children.get(focusFixture.ids.deepWorld).every(e=>nodes.get(e.id).dataset.focusRelation==='child'&&nodes.get(e.id).dataset.semanticHidden!=='true')"), f'{case}: deepest reused visual role still exposes immediate children')
                check(evaluate("(()=>{const b=physics.bounds;return semanticFocus.children.get(focusFixture.ids.deepWorld).some(e=>{const n=nodes.get(e.id);return n.renderX>=b.left&&n.renderX<=b.right&&n.renderY>=b.top&&n.renderY<=b.bottom})})()"), f'{case}: Moon context includes the inspected detail and its children')
                shot(f'{case}-deep-world')
                focus('deepTarget', close=True)
                check(anchor() == evaluate('semanticFocus.contextId(focusFixture.ids.deepTarget)'), f'{case}: arbitrary-depth detail targets retain maximum Moon context')
                shot(f'{case}-deep')
            focus('planetB', close=True)
            check(anchor() == evaluate('focusFixture.ids.planetB'), f'{case}: sibling focus changes local ownership deterministically')
            check(evaluate('JSON.stringify([...entries.values()].map(e=>[e.id,e.parentId,e.x,e.y]))===focusOriginalPositions && localStorage.getItem("galaxy:user-data")===focusOriginalSaved'), f'{case}: sidebar and detail inspection never save local projections')
            shot(f'{case}-sibling')
            # Lens is independent of focus; canonical linked travel reuses existing source/target IDs.
            evaluate('activateConstellation("focus-constellation")')
            wait('!camera.frame')
            focus('planetA', close=True)
            check(evaluate('activeConstellationId==="focus-constellation"&&activeConstellationMembers.size===constellations.get("focus-constellation").memberEntryIds.length'), f'{case}: Constellation survives local focus')
            shot(f'{case}-constellation')
            evaluate('openPortal("focus-linked")')
            wait('!camera.frame')
            check(anchor() == evaluate('semanticFocus.contextId(focusFixture.ids.deepTarget)') and evaluate('selectedNode.dataset.entryId===focusFixture.ids.deepTarget'), f'{case}: linked travel selects canonical detail inside Moon context')
            evaluate('exitConstellation();focusEntry(focusFixture.ids.planetA,{closeFocus:true})')
            wait('!camera.frame')
            if case == 'recipes50':
                shot('planet-few-children')
                evaluate('camera.panTo(camera.target.x+nodes.get(focusFixture.ids.planetA).renderDiameter*.4,camera.target.y+nodes.get(focusFixture.ids.planetA).renderDiameter*.4)')
                wait('!camera.frame')
                shot('planet-partially-cropped')
                check(anchor() == evaluate('focusFixture.ids.planetA'), 'partially cropped body keeps the same local world during pan')
                evaluate('camera.panTo(camera.target.x+innerWidth,camera.target.y)')
                wait('!camera.frame')
                check(evaluate('!document.getElementById("world-outside-count").hidden&&document.getElementById("world-outside-count").textContent.match(/\\d+/)'), 'local world quietly indicates children beyond the viewport')
                focus('firstChild', close=True)
                check(evaluate("(()=>{const b=physics.bounds;return semanticFocus.children.get(focusFixture.ids.firstChild).some(e=>{const n=nodes.get(e.id);return n.renderX>=b.left&&n.renderX<=b.right&&n.renderY>=b.top&&n.renderY<=b.bottom})})()"), 'Moon with one child opens with that child inside the usable viewport')
                shot('moon-close')
                focus('satellite', close=True)
                shot('satellite-close')
            if case == 'siblings100':
                # Native canvas zoom/pan and body drag input rather than only programmatic camera calls.
                focus('planetA', close=True)
                cdp.call('Input.dispatchMouseEvent', type='mouseWheel', x=620, y=400, deltaX=0, deltaY=-130)
                wait('!camera.frame')
                check(anchor() == evaluate('focusFixture.ids.planetA'), 'wheel input does not switch sibling anchor')
                cdp.call('Emulation.setEmulatedMedia', features=[{'name':'prefers-reduced-motion','value':'reduce'}])
                focus('planetB', close=True)
                check(evaluate('camera.reducedMotion') and anchor() == evaluate('focusFixture.ids.planetB'), 'reduced motion preserves semantic hierarchy')
                cdp.call('Emulation.setEmulatedMedia', features=[{'name':'prefers-reduced-motion','value':'no-preference'}])
                # Search uses the same explicit semantic navigation entry point as sidebar precision navigation.
                evaluate('searchField.value=entries.get(focusFixture.ids.deepWorld).name;searchOpen=true;refreshSearchResults();requestLabelLayout(true)')
                wait("nodes.get(focusFixture.ids.deepWorld).dataset.semanticHidden!=='true'&&!nodes.get(focusFixture.ids.deepWorld).inert")
                check(evaluate("(()=>{const target=nodes.get(focusFixture.ids.deepWorld),family=galaxyModel.subtreeIds(entries,focusFixture.ids.planetA);return target.labelOpacity===1&&galaxyModel.ancestors(entries,focusFixture.ids.deepWorld).every(e=>nodes.get(e.id).dataset.semanticHidden!=='true')&&[...entries.values()].filter(e=>e.depth>=3&&!family.has(e.id)&&e.parentId!==semanticFocus.anchorId).every(e=>nodes.get(e.id).dataset.semanticHidden==='true')})()"), 'open Search protects the deep match and required ancestors while retaining the current immediate family and suppressing other deep systems')
                evaluate('searchResultList.querySelector("button").click()')
                wait("!camera.frame && !semanticFocus.animating")
                check(anchor() == evaluate('semanticFocus.contextId(focusFixture.ids.deepWorld)') and evaluate('selectedNode.dataset.entryId===focusFixture.ids.deepWorld'), 'Search retrieval locates the actual detail in its Moon context')
                check(evaluate('selectedNode.labelOpacity===1&&selectedNode.querySelector(".node-label").dataset.densityHidden!=="true"'), 'direct navigation keeps its selected label protected')
                # Keep the actual child centred for native pointer dragging while its parent stays the semantic anchor.
                focus('planetA', close=True)
                evaluate('(()=>{const n=nodes.get(focusFixture.ids.firstChild),b=physics.bounds;camera.panTo(camera.view.x+(b.left+b.right)/2-n.renderX,camera.view.y+(b.top+b.bottom)/2-n.renderY)})()')
                wait('!camera.frame')
                evaluate('physics.pause()')
                drag_start=evaluate('(()=>{const n=nodes.get(focusFixture.ids.firstChild),e=entries.get(focusFixture.ids.firstChild);return {x:n.renderX,y:n.renderY,worldX:e.x,worldY:e.y,view:{...camera.view},paused:physics.paused}})()')
                cdp.call('Input.dispatchMouseEvent',type='mousePressed',x=drag_start['x'],y=drag_start['y'],button='left',clickCount=1)
                cdp.call('Input.dispatchMouseEvent',type='mouseMoved',x=drag_start['x']+52,y=drag_start['y']-24,button='left',buttons=1)
                drag_moved=evaluate('(()=>{const n=nodes.get(focusFixture.ids.firstChild),e=entries.get(focusFixture.ids.firstChild),p=semanticFocus.point(e);return {x:n.renderX,y:n.renderY,worldX:e.x,worldY:e.y,projectedX:p.x,projectedY:p.y,captures:activeNodeDrags}})()')
                check(drag_moved['captures']==1 and abs(drag_moved['x']-drag_start['x']-52)<1 and abs(drag_moved['y']-drag_start['y']+24)<1,
                    'projected child follows held pointer exactly: '+json.dumps({'start':drag_start,'moved':drag_moved}))
                cdp.call('Input.dispatchMouseEvent',type='mouseReleased',x=drag_start['x']+52,y=drag_start['y']-24,button='left',clickCount=1)
                evaluate('physics.pause()')
                check(anchor() == evaluate('focusFixture.ids.planetA') and evaluate('activeNodeDrags===0'), 'dragging a projected child preserves anchor and releases capture')
                check(evaluate(f'(()=>{{const e=entries.get(focusFixture.ids.firstChild),release=semanticFocus.releases.get(e.id);return !!release&&Math.hypot(release.point.x-{drag_moved["projectedX"]},release.point.y-{drag_moved["projectedY"]})<1 && Math.hypot(e.x-{drag_start["worldX"]},e.y-{drag_start["worldY"]})>1}})()'), 'projected drag maps canonical placement and begins settling at the held point')
                for width, height, name in [(390,844,'portrait'),(844,390,'landscape')]:
                    cdp.call('Emulation.setDeviceMetricsOverride', width=width,height=height,deviceScaleFactor=1,mobile=True)
                    cdp.call('Emulation.setTouchEmulationEnabled', enabled=True,maxTouchPoints=2)
                    time.sleep(.15)
                    focus('planetA',close=True)
                    shot(f'mobile-{name}')
                    metrics[case]['mobile'+name.title()] = performance_sample()
                    check(evaluate('document.documentElement.scrollWidth<=innerWidth'), f'mobile {name}: no horizontal page overflow')
                    check(evaluate('nodes.get(focusFixture.ids.planetA).renderDiameter<Math.min(innerWidth,innerHeight)*1.5'), f'mobile {name}: viewport-relative focused body cap')
                    touch_anchor = anchor()
                    pinch_before=evaluate('({scale:camera.view.scale,bounds:{...physics.bounds}})')
                    # Both fingers remain in usable canvas space, outside the
                    # Content sheet and navigation dock. Body handoff is allowed.
                    b=pinch_before['bounds']
                    x,y=b['left']+(b['right']-b['left'])*.6,b['top']+(b['bottom']-b['top'])*.55
                    cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[{'x':x-25,'y':y,'id':1},{'x':x+25,'y':y,'id':2}])
                    cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[{'x':x-45,'y':y,'id':1},{'x':x+45,'y':y,'id':2}])
                    cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
                    wait('!pinch')
                    pinch_after=evaluate('camera.view.scale')
                    metrics[case]['mobile'+name.title()+'Pinch']={'beforeScale':pinch_before['scale'],'afterScale':pinch_after,'bounds':b,'center':{'x':x,'y':y}}
                    check(pinch_after>pinch_before['scale']*1.1,f'mobile {name}: native outward pinch actually increases camera scale')
                    check(anchor() == touch_anchor, f'mobile {name}: pinch preserves semantic anchor')
                    evaluate('document.getElementById("canvas-fit").click()')
                    wait('!camera.frame')
                    check(anchor() == touch_anchor, f'mobile {name}: Fit retains local focus')
                    check(evaluate("(()=>{const b=physics.bounds;return semanticFocus.children.get(semanticFocus.anchorId).every(e=>{const n=nodes.get(e.id);return n.renderX>=b.left&&n.renderX<=b.right&&n.renderY>=b.top&&n.renderY<=b.bottom})})()"), f'mobile {name}: Fit restores children to usable phone canvas')
                    # Keep the same target exposed after first-tap Content opens. Dense
                    # neighbouring labels can cover a body's center, so find its actual
                    # hit area rather than assuming renderX/renderY is clickable.
                    target_y=88 if name=='portrait' else 28
                    evaluate(f'setInspectorOpen(false);(()=>{{const n=nodes.get(focusFixture.ids.firstChild),b=physics.bounds;camera.panTo(camera.view.x+b.right-24-n.renderX,camera.view.y+b.top+{target_y}-n.renderY)}})()')
                    wait("!camera.frame&&!semanticFocus.animating")
                    point=evaluate("""(()=>{const n=nodes.get(focusFixture.ids.firstChild),b=physics.bounds;
                        for(const dy of [0,-4,-8,-12,4,8,12])for(const dx of [0,-4,4,-8,8,-12,12]){const x=n.renderX+dx,y=n.renderY+dy;
                            if(x<b.left||x>b.right||y<b.top||y>b.bottom)continue;
                            if(document.elementFromPoint(x,y)?.closest('.entry-node')===n)return {x,y};}
                        return null;})()""")
                    check(point is not None,f'mobile {name}: double-tap begins on the intended exposed body hit area')
                    tap_diagnostics=[]
                    def tap_state(label):
                        state=evaluate(f"""(()=>{{const p={json.dumps(point)},hit=document.elementFromPoint(p.x,p.y),n=nodes.get(focusFixture.ids.firstChild),r=panel.getBoundingClientRect();return {{phase:{json.dumps(label)},point:p,hit:hit?.tagName,hitClass:String(hit?.className||''),hitEntry:hit?.closest('.entry-node')?.dataset.entryId||null,nodePoint:{{x:n.renderX,y:n.renderY}},lastBodyTap:lastBodyTap?{{...lastBodyTap}}:null,selected:selectedNode?.dataset.entryId,anchor:semanticFocus.anchorId,panel:{{hidden:panel.hidden,x:r.x,y:r.y,width:r.width,height:r.height}},bounds:{{...physics.bounds}},activeNodeDrags,canvasTouches:canvasTouches.size,pinch:!!pinch}}}})()""")
                        tap_diagnostics.append(state)
                        return state
                    tap_state('before first tap')
                    for _ in range(2):
                        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point])
                        cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
                        tap_state('after tap '+str(len(tap_diagnostics)))
                    wait('!camera.frame')
                    metrics[case]['mobile'+name.title()+'TapDiagnostics']=tap_diagnostics
                    tap_result=anchor() == evaluate('focusFixture.ids.firstChild') and evaluate('activeNodeDrags===0&&canvasTouches.size===0&&!pinch')
                    tap_title=f'mobile {name}: double-tap establishes child local world without stale gestures'
                    check(tap_result,tap_title if tap_result else tap_title+': '+json.dumps(tap_diagnostics))
                cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
                cdp.call('Emulation.setTouchEmulationEnabled',enabled=False)
            if case == 'pathological100':
                for width, height, name in [(390,844,'portrait'),(844,390,'landscape')]:
                    cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=True)
                    cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=2)
                    time.sleep(.15)
                    focus('planetA',close=True)
                    evaluate('document.getElementById("canvas-fit").click()')
                    wait("!camera.frame&&!semanticFocus.animating")
                    check(anchor()==evaluate('focusFixture.ids.planetA') and evaluate('selectedNode.dataset.entryId===focusFixture.ids.planetA'),f'100 immediate children on {name}: Fit preserves selection and local anchor')
                    check(evaluate("(()=>{const b=physics.bounds;return semanticFocus.children.get(semanticFocus.anchorId).every(e=>{const n=nodes.get(e.id);return n.renderX>=b.left&&n.renderX<=b.right&&n.renderY>=b.top&&n.renderY<=b.bottom})})()"),f'100 immediate children on {name}: Fit recovers every child position')
                    check(evaluate('document.documentElement.scrollWidth<=innerWidth'),f'100 immediate children on {name}: no horizontal page overflow')
                    evaluate('requestLabelLayout(true)')
                    wait('labelDensity.frame===null&&labelDensity.trailingTimer===null&&labelDensity.timer===null')
                    evaluate('new Promise(resolve=>setTimeout(resolve,250))')
                    check(evaluate("(()=>{const l=nodes.get(semanticFocus.anchorId).querySelector('.node-label');return l.scrollWidth<=l.clientWidth+1&&l.getBoundingClientRect().width>40&&getComputedStyle(l).opacity>.9})()"),f'100 immediate children on {name}: compact parent caption remains readable in full')
                    check(evaluate("semanticFocus.children.get(semanticFocus.anchorId).filter(e=>getComputedStyle(nodes.get(e.id).querySelector('.node-label')).opacity>.05).length<=24"),f'100 immediate children on {name}: dense ordinary captions remain bounded')
                    check(evaluate("(()=>{const labels=semanticFocus.children.get(semanticFocus.anchorId).map(e=>{const n=nodes.get(e.id),l=n.querySelector('.node-label');return {protected:n.classList.contains('label-priority'),opacity:+getComputedStyle(l).opacity,rect:l.getBoundingClientRect()}}).filter(l=>l.opacity>.05&&!l.protected);for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i].rect,b=labels[j].rect,overlap=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));if(overlap/Math.max(1,Math.min(a.width*a.height,b.width*b.height))>.24)return false;}return true})()"),f'100 immediate children on {name}: visible ordinary captions avoid strong overlaps')
                    shot(f'mobile-pathological-{name}-fit')
                    if name=='landscape':
                        check(evaluate('panel.hidden&&physics.bounds.bottom-physics.bounds.top>=180'), 'landscape local Fit reclaims usable canvas from the idle Content sheet')
                        evaluate('setInspectorOpen(true);contentInspector.editNotes();contentInspector.notes.value="Keep my unfinished local-world note"')
                        evaluate('document.getElementById("canvas-fit").click()')
                        wait('!camera.frame')
                        check(evaluate('!panel.hidden&&!contentInspector.notesForm.hidden&&contentInspector.notes.value==="Keep my unfinished local-world note"'), 'landscape Fit preserves an active Notes draft and keeps Content open')
                        evaluate('document.getElementById("content-cancel-notes").click()')
                cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
                cdp.call('Emulation.setTouchEmulationEnabled',enabled=False)
        # Profiling/dragging legitimately changes canonical normal-mode physics.
        # Flush that state before measuring Sample isolation, so normal pagehide
        # persistence is not mistaken for a write made by the Sample session.
        evaluate('physics.pause();saveGalaxy()')
        saved=evaluate('localStorage.getItem("galaxy:user-data")')
        sample_url=evaluate('(()=>{const url=new URL(location.href);url.searchParams.set("sample",galaxySample.queryValue);return url.href})()')
        cdp.call('Page.navigate',url=sample_url)
        wait("typeof cameraViewReady!=='undefined'&&cameraViewReady&&typeof sampleMode!=='undefined'&&sampleMode")
        evaluate('ambient.destroy();physics.pause();physics.simulation.tick(260);physics.onTick(physics.particles);physics.settled=true;physics.onSettle();window.sampleFocus=physics.ordered.find(n=>n.depth===2&&physics.children.get(n.id).length>0).id;camera.stopAnimation()')
        metrics['sample']={'total':evaluate('entries.size'),'far':performance_sample()}
        evaluate('focusEntry(sampleFocus,{closeFocus:true})')
        wait("!camera.frame && (typeof semanticFocus==='undefined' || !semanticFocus.animating)")
        metrics['sample']['planet']=performance_sample()
        if not options.baseline:
            evaluate('document.getElementById("canvas-fit").click()')
            wait('!camera.frame')
            check(evaluate('localStorage.getItem("galaxy:user-data")')==saved, 'Sample focus, local layout and Fit preserve normal persisted v5 data')
            shot('sample-local-world')
        check(not cdp.errors, 'stress cases complete without uncaught browser errors')
        (output / 'metrics.json').write_text(json.dumps({'baseline':options.baseline,'protocol':PROTOCOL,'checks':count,'cases':metrics},indent=2), encoding='utf-8')
        completed = True
        print(f'PASS {count} hierarchical focus browser checks',flush=True)
        print(f'METRICS_AND_SCREENSHOTS {output}',flush=True)
    finally:
        if metrics and not completed:
            (output / 'metrics-partial.json').write_text(json.dumps({'baseline':options.baseline,'protocol':PROTOCOL,'checks':count,'cases':metrics},indent=2),encoding='utf-8')
        if cdp:
            cdp.sock.close()
        process.terminate()
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=8)
        server.shutdown()
        assert profile.resolve().is_relative_to(Path(tempfile.gettempdir()).resolve()), 'Only the isolated temporary profile may be removed'
        for _ in range(20):
            try:
                shutil.rmtree(profile)
                break
            except PermissionError:
                time.sleep(.1)


if __name__ == '__main__':
    main()
