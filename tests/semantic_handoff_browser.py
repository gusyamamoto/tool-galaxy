"""User zoom ownership and hierarchy labels, using only disposable local data."""
import json
from real_body_overview_browser import overview_fixture


def run_semantic_handoff_checks(*, cdp, evaluate, check, wait_for, shot, size=150):
    e=evaluate
    # Keep native touch input isolated per fixture. Chrome can drop touch events
    # across renderer/device-emulation reuse even when the page has no touches.
    # Run --semantic-handoff-size 150 and 325 in separate browser invocations.
    for count in [size]:
        origin=e('location.origin')
        cdp.call('Page.navigate',url=origin+'/404.html')
        wait_for('location.pathname==="/404.html"&&document.readyState==="complete"&&typeof physics==="undefined"')
        raw=json.dumps(overview_fixture(count));e('window.handoffSeed=""')
        for i in range(0,len(raw),12000):e('handoffSeed+='+json.dumps(raw[i:i+12000]))
        e('localStorage.setItem("galaxy:user-data",handoffSeed)')
        cdp.call('Page.navigate',url=origin+'/index.html')
        wait_for(f'typeof physics!=="undefined"&&entries.size==={count}&&physics.particles.size==={count}')
        e('autoFitPending=false;physics.pause();physics.setGraph([],new Map(),{reheat:0});entries.forEach(e=>e.seedLayout=true);syncPhysicsGraph({reheat:.55});physics.simulation.tick(350);physics.onTick(physics.particles);camera.stopAnimation();hierarchySidebar.setCollapsed(true);closeInspector();clearSelection();physics.pause()')
        e('window.handoffPositions=JSON.stringify([...entries].map(([id,e])=>[id,e.x,e.y,e.parentId]));window.handoffLayout=JSON.stringify([...layout])')
        for width,height in [(360,800),(390,844),(430,932),(740,360),(1440,1000)]:
            tag=f'{count}-{width}'
            mobile=width<1000
            cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=3 if mobile else 1,mobile=mobile)
            cdp.call('Emulation.setTouchEmulationEnabled',enabled=mobile,maxTouchPoints=2)
            e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
            wait_for('camera.frame===null')
            e('physics.pause();hierarchySidebar.setCollapsed(true);closeInspector();clearSelection();document.activeElement.blur()')

            def frame(scale):
                e(f"camera.setView({{x:180-entries.get('s0-p0').x*{scale},y:350-entries.get('s0-p0').y*{scale},scale:{scale}}},false)")

            def select():
                e("selectEntry(entries.get('s0-p0'),nodes.get('s0-p0'),{openInspector:false,scroll:false});physics.pause()")

            def wheel(delta,point=None):
                # CDP scales wheel deltas on a DPR-3 mobile viewport. Exercise
                # a real multi-event zoom gesture, waiting on each camera target.
                for _ in range(3 if mobile else 1):
                    before=e('camera.target.scale')
                    cdp.call('Input.dispatchMouseEvent',type='mouseWheel',x=point['x'] if point else min(width-30,400),y=point['y'] if point else 60 if height<500 else 130,deltaX=0,deltaY=delta)
                    wait_for(f'camera.target.scale!=={before}')
                    wait_for('camera.frame===null')

            frame(.65);select()
            e("keyboardNavigation=false;nodes.get('s0-p0').focus({preventScroll:true});hoveredEntryId='s0-p0';renderGraph()")
            check(e("selectedNode?.dataset.entryId==='s0-p0'&&nodes.get('s0-p0').labelOpacity===1&&!document.getElementById('mobile-body-actions').hidden"),'explicit selected target and compact card before wheel: '+tag)
            wheel(180)
            check(e("camera.view.scale<.45&&selectedNode===null&&document.getElementById('mobile-body-actions').hidden"),'native outward wheel releases selection/card in overview: '+tag+' '+json.dumps(e('({view:camera.view,source:camera.changeSource,panelHidden:panel.hidden,crudActive,selected:selectedNode?.dataset.entryId,cardHidden:document.getElementById(\"mobile-body-actions\").hidden,errors:window.onerror})')))
            check(e("(()=>{const n=nodes.get('s0-p0');return !n.matches('.selected,.related,.label-priority,.temporarily-revealed,.selected-ancestor')&&n.getAttribute('aria-pressed')==='false'&&document.activeElement!==n&&hoveredEntryId!=='s0-p0'&&searchFocusId!=='s0-p0'&&!focusRevealIds.size&&!galaxy.classList.contains('has-selection')&&n.labelOpacity===cosmosView.labelDisclosure('planet',camera.view.scale,'s0-p0',semanticDetail,terminalLabelIds.has('s0-p0'))&&Math.abs(n.renderDiameter-cosmosView.renderedDiameter('planet',getNodeRadius(entries.get('s0-p0'))*2,camera.view.scale,semanticDetail.planet))<.001})()"),'former object loses focus/reveal/priority and returns to normal size: '+tag)
            check(e("(()=>{const n=nodes.get('s0-p0');return parseFloat(getComputedStyle(n.querySelector('.node-label')).opacity)<=n.labelOpacity+.02&&getComputedStyle(n).outlineStyle==='none'})()"),'former target has no CSS-only label dominance or selected outline: '+tag)
            wheel(-180)
            check(e('selectedNode===null'),'zoom-in never reselects old target: '+tag)
            for scale in [.449,.451,.448,.452,.44]:
                e(f"camera.setView({{...camera.view,scale:{scale}}},false,{{source:'user-zoom'}})")
            check(e("selectedNode===null&&document.getElementById('mobile-body-actions').hidden"),'boundary oscillation stays deselected: '+tag)

            # Explicitly selected bodies at an already-wide scale also yield to
            # the next outward user gesture; a programmatic zoom never does.
            frame(.2);select();wheel(80)
            check(e("selectedNode===null&&nodes.get('s0-p0').renderDiameter<10"),'wide explicit selection loses enlargement on further manual zoom-out: '+tag)
            frame(.65);select()
            e("camera.setView({...camera.view,scale:.2},false,{source:'user-zoom'})")
            check(e("selectedNode===null&&!motion.byElement.has(nodes.get('s0-p0'))&&getComputedStyle(nodes.get('s0-p0')).outlineStyle==='none'"),'fast release cancels the former selection accent immediately: '+tag)
            frame(.65);select();frame(.05)
            check(e("selectedNode?.dataset.entryId==='s0-p0'&&nodes.get('s0-p0').labelOpacity===1"),'programmatic overview retains intentional target: '+tag)
            e("focusEntry('s0-p0',{openInspector:false});camera.setView(camera.target,false);physics.pause()")
            check(e("selectedNode?.dataset.entryId==='s0-p0'&&nodes.get('s0-p0').labelOpacity===1"),'search-style explicit focus retains/reveals its canonical target: '+tag)
            frame(.65)
            e("selectEntry(entries.get('s0-p0'),nodes.get('s0-p0'),{openInspector:true,scroll:false})")
            wheel(180)
            check(e("!panel.hidden&&selectedNode?.dataset.entryId==='s0-p0'"),'expanded Contents keeps its selection during canvas zoom: '+tag)
            e('closeInspector();clearSelection();document.activeElement.blur();hoveredEntryId=null;searchFocusId=null;focusRevealIds.clear()')

            if width==390 or not mobile:
                frame(.65);select()
                point=e("({x:nodes.get('s0-p0').renderX,y:nodes.get('s0-p0').renderY})")
                if not mobile:cdp.call('Input.dispatchMouseEvent',type='mouseMoved',**point)
                wheel(180,point)
                check(e("(()=>{const n=nodes.get('s0-p0');return selectedNode===null&&!n.matches('.temporarily-revealed,.label-priority')&&parseFloat(getComputedStyle(n.querySelector('.node-label')).opacity)<=n.labelOpacity+.02})()"),'wheel anchored on the former body leaves no sticky CSS hover emphasis: '+tag)
            # Real touch sequence exercises the actual canvas pinch handler.
            if width==390:
                frame(.65);select()
                cdp.call('Page.bringToFront')
                points=e("(()=>{for(const y of [110,170,210])for(const x of [50,70,90]){const p=[{x,y},{x:innerWidth-x,y}];if(p.every(({x,y})=>{const n=document.elementFromPoint(x,y);return n?.closest('#graph-viewport')&&!n.closest('.entry-node,button')}))return p}throw new Error('No empty canvas pinch pair')})()")
                e("window.handoffTouches=[];window.handoffTouchLog=event=>handoffTouches.push({type:event.type,x:event.clientX,y:event.clientY,target:event.target.id||event.target.className,pointerType:event.pointerType});document.addEventListener('pointerdown',handoffTouchLog,true)")
                cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[points[0]])
                try:
                    wait_for('canvasTouches.size===1')
                except AssertionError as failure:
                    raise AssertionError(json.dumps(dict(points=points,state=e('({view:camera.view,touches:[...canvasTouches],pinch,pan,events:handoffTouches,width:innerWidth,height:innerHeight,viewport:{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale,offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop}})')))) from failure
                cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=points)
                wait_for('pinch!==null')
                middle=(points[0]['x']+points[1]['x'])/2
                cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[dict(p,x=middle+(p['x']-middle)*.56) for p in points])
                wait_for('camera.view.scale<.45')
                cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
                wait_for('pinch===null')
                e("document.removeEventListener('pointerdown',handoffTouchLog,true)")
                check(e('camera.view.scale<.45&&selectedNode===null&&!pinch'),'native pinch-out also releases ordinary canvas selection: '+tag)
                e('physics.pause()')

            for scale,dominant in [(.02,'galaxy'),(.24,'galaxy'),(.6,'sun'),(1.3,'planet'),(2.4,'moon'),(4,'satellite'),(9,'astronaut')]:
                # Center each layer on the same branch to inspect every depth.
                identity={'galaxy':'g0','sun':'s0','planet':'s0-p0','moon':'s0-p0-m0','satellite':'s0-p0-m0-sat','astronaut':'s0-p0-m0-sat-a'}[dominant]
                e(f"camera.minScale=Math.min(camera.minScale,{scale});camera.maxScale=12;camera.setView({{x:180-entries.get('{identity}').x*{scale},y:240-entries.get('{identity}').y*{scale},scale:{scale}}},false);requestLabelLayout(true)")
                wait_for(f"labelDensity.frame===null&&labelDensity.timer===null&&labelDensity.trailingTimer===null&&(()=>{{const n=nodes.get('{identity}'),l=n.querySelector('.node-label');return Math.abs(parseFloat(getComputedStyle(l).opacity)-(l.dataset.densityHidden==='true'?0:n.labelOpacity))<.03}})()")
                check(e(f"(()=>{{const d=semanticDetail.labels;return Math.abs(camera.view.scale-{scale})<1e-10&&Object.keys(d).sort((a,b)=>d[b].opacity-d[a].opacity)[0]==='{dominant}'&&!['galaxy','sun','planet'].every(r=>d[r].opacity>.9)}})()"),f'hierarchy layer {dominant} leads at {scale}: '+tag)
                check(e(f"(()=>{{const n=nodes.get('{identity}'),l=n.querySelector('.node-label'),s=getComputedStyle(l),expected=l.dataset.densityHidden==='true'?0:n.labelOpacity;return Math.abs(parseFloat(s.opacity)-expected)<.03&&parseFloat(s.fontSize)<=16}})()"),'actual CSS follows the hierarchy opacity without billboard-sized text: '+tag+' '+json.dumps(e(f"(()=>{{const n=nodes.get('{identity}'),l=n.querySelector('.node-label'),s=getComputedStyle(l);return {{role:n.dataset.body,classes:n.className,logical:n.labelOpacity,opacity:s.opacity,font:s.fontSize,hidden:l.dataset.densityHidden}}}})()")))
                check(e("[...nodes].every(([id,n])=>n.dataset.culled==='true'||n.dataset.semanticHidden==='true'||n.labelOpacity<=1&&n.labelOpacity>=0&&(!n.matches('.temporarily-revealed,.label-priority')||n.labelOpacity===1))"),'no stale classes/opacities after layer change: '+tag)
                check(e("(()=>{const n=nodes.get('g0'),l=n.querySelector('.node-label'),r=l.getBoundingClientRect();return n.dataset.renderSkipped==='true'||(!l.edgeOffset||l.edgeOffset.x===0&&l.edgeOffset.y===0)&&Math.abs(r.left+r.width/2-n.renderX)<.5&&Math.abs(r.top-n.renderY-n.renderDiameter/2-4)<.5})()"),'Galaxy name stays centered below its actual root across tiers: '+tag)
                if width==390:print('LABEL_COUNTS '+json.dumps(dict(fixture=count,scale=scale,counts=label_counts(e))),flush=True)
                shot(f'handoff-{dominant}-{scale}-'+tag)
            if width==390:
                # Forward/reverse bands share exactly the same latest view, not
                # remembered phase/classes. The CSS may ease density changes.
                scales=[.24,.26,.33,.40,.42,.64,.78,.84,.95,1.12,1.6,1.85,2.1,2.7,3.15,3.6,5,6,7]
                seen={}
                for scale in scales+scales[::-1]:
                    e(f"camera.setView({{x:180-entries.get('s0').x*{scale},y:260-entries.get('s0').y*{scale},scale:{scale}}},false);requestLabelLayout(true)")
                    settle_labels(wait_for)
                    state=e('JSON.stringify([...nodes].map(([id,n])=>[id,n.labelOpacity,n.classList.contains("label-priority"),n.classList.contains("temporarily-revealed")]))')
                    check(scale not in seen or seen[scale]==state,f'reverse envelope has no remembered state at {scale}: '+tag)
                    seen[scale]=state
                    if scale in [.26,.33,.40,.78,.84,.95,1.85,3.15,6]:
                        check(e("Object.values(semanticDetail.labels).filter(l=>l.opacity>0).length===2"),'only adjacent layers emerge during each bounded handoff: '+tag)
                        if scale==.26:
                            check(e("(()=>{const n=nodes.get('s0'),l=n.querySelector('.node-label');return n.labelOpacity>0&&n.labelOpacity<.18&&labelDensity.states.has('s0')&&Math.abs(parseFloat(getComputedStyle(l).opacity)-(l.dataset.densityHidden==='true'?0:n.labelOpacity))<.025})()"),'faint emergence participates in ordinary collision resolution below the old 18% cutoff: '+tag)
                        print('LABEL_COUNTS '+json.dumps(dict(fixture=count,scale=scale,counts=label_counts(e))),flush=True)
                        shot(f'handoff-transition-{scale}-'+tag)
            # Colliding ordinary names use the same density engine, with the
            # per-scale hierarchy priority; explicit targets still win.
            check(e("(()=>{const rect={left:100,right:200,top:100,bottom:120};return [[.02,'galaxy','sun'],[.6,'sun','galaxy'],[1.3,'planet','sun'],[2.4,'moon','planet']].every(([s,winner,loser])=>{const d=cosmosView.detail(s),l=new LabelDensity();return l.resolve([winner,loser].map(id=>({id,rect,priority:d.labels[id].priority})),0).hidden.has(loser)})})()"),'existing density resolver respects changing parent/child hierarchy: '+tag)
            e("camera.setView({x:180-entries.get('s0-p0').x*.05,y:240-entries.get('s0-p0').y*.05,scale:.05},false);searchFocusId='s0-p0';renderGraph();requestLabelLayout(true)")
            wait_for("nodes.get('s0-p0').querySelector('.node-label').dataset.densityHidden==='false'")
            check(e("nodes.get('s0-p0').labelOpacity===1&&nodes.get('s0-p0').classList.contains('label-priority')"),'search override survives ordinary handoff hiding: '+tag)
            e('searchFocusId=null;document.activeElement.blur();hoveredEntryId=null')
            e("[.1,2,.2,1.5,.03,.6,.24].forEach(scale=>camera.setView({...camera.view,scale},false));requestLabelLayout(true)")
            settle_labels(wait_for)
            check(e("[...nodes].every(([id,n])=>!n.matches('.temporarily-revealed,.label-priority')&&n.labelOpacity===cosmosView.labelDisclosure(entries.get(id).role,camera.view.scale,id,semanticDetail,terminalLabelIds.has(id)))"),'rapid in/out finishes with the latest shared policy and no reveal priority: '+tag)
        check(e('JSON.stringify([...entries].map(([id,e])=>[id,e.x,e.y,e.parentId]))===handoffPositions&&JSON.stringify([...layout])===handoffLayout'),f'camera/label changes preserve all {count} world positions and saved placements')
    if size==150:run_sample_label_checks(cdp=cdp,evaluate=e,check=check,wait_for=wait_for,shot=shot)
    check(not cdp.errors,f'no semantic-handoff browser exceptions: {cdp.errors}')


def label_counts(evaluate):
    # Perceptible, actually unsuppressed names whose rectangles enter the usable
    # canvas. This is a measured report, not all logically nonzero offscreen names.
    return evaluate("""(()=>{const counts=Object.fromEntries(cosmosView.labelOrder.map(r=>[r,0])),b=physics.bounds;
        nodes.forEach(n=>{if(n.dataset.culled==='true'||n.dataset.semanticHidden==='true')return;
            const l=n.querySelector('.node-label'),r=l.getBoundingClientRect();
            if(parseFloat(getComputedStyle(l).opacity)>=.18&&l.dataset.densityHidden==='false'&&r.right>b.left&&r.left<b.right&&r.bottom>b.top&&r.top<b.bottom)counts[n.dataset.body]++;});return counts})()""")


def settle_labels(wait_for):
    wait_for("""labelDensity.frame===null&&labelDensity.timer===null&&labelDensity.trailingTimer===null&&[...nodes.values()].every(n=>{
        if(n.dataset.renderSkipped==='true'||n.dataset.semanticHidden==='true')return true;
        const l=n.querySelector('.node-label'),expected=l.dataset.densityHidden==='true'?0:n.labelOpacity;
        return Math.abs(parseFloat(getComputedStyle(l).opacity)-expected)<.025})""")


def run_sample_label_checks(*,cdp,evaluate,check,wait_for,shot):
    e=evaluate
    e('loadSampleButton.click()')
    wait_for("typeof physics!=='undefined'&&typeof sampleMode!=='undefined'&&sampleMode&&entries.size===282")
    e('autoFitPending=false;physics.pause();physics.simulation.tick(350);physics.onTick(physics.particles);camera.stopAnimation();hierarchySidebar.setCollapsed(true);closeInspector();clearSelection();document.activeElement.blur();physics.pause()')
    for width,height in [(360,800),(390,844),(430,932),(740,360),(1440,1000)]:
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=3 if width<1000 else 1,mobile=width<1000)
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        wait_for('camera.frame===null')
        e('physics.pause();fitGalaxy(false);requestLabelLayout(true)')
        settle_labels(wait_for)
        counts=label_counts(e)
        check(counts['galaxy']>0 and not any(n for r,n in counts.items() if r!='galaxy'),f'dense Sample whole-Universe Fit uses Galaxy orientation at {width}: {counts}')
        if width==390:print('LABEL_COUNTS '+json.dumps(dict(fixture='Sample282',scale=e('camera.view.scale'),view='Fit',counts=counts)),flush=True)
        shot(f'envelope-sample-fit-{width}')
        # Slow, continuous camera movement in both directions. Only diagnostic
        # state is sampled; existing rendering/collision scheduling stays intact.
        result=e("""new Promise(resolve=>{let start;const failures=[];function step(now){start??=now;
            const p=Math.min(1,(now-start)/4000),s=.2*Math.pow(1.3/.2,Math.sin(Math.PI*p));
            camera.setView({x:Math.min(innerWidth/2,400)-entries.get('sample-sun-0').x*s,y:Math.min(innerHeight/2,300)-entries.get('sample-sun-0').y*s,scale:s},false);
            const d=semanticDetail.labels,active=Object.values(d).filter(l=>l.opacity>0);
            if(active.length>2||s>=.42&&d.galaxy.opacity!==0||s<=.64&&d.planet.opacity!==0||s<.88&&d.planet.opacity>.5||d.moon.opacity!==0)failures.push(s);
            if(p<1)requestAnimationFrame(step);else resolve(failures)}requestAnimationFrame(step)})""")
        settle_labels(wait_for)
        check(not result,f'continuous inward/outward tuning preserves short ordered handoffs at {width}: {result}')
        for scale,role,identity in [(.03,'galaxy','sample-galaxy-0'),(.44,'sun','sample-sun-0'),(.6,'sun','sample-sun-0'),(.84,'sun','sample-sun-0'),(.95,'planet','sample-planet-0-0'),(1.3,'planet','sample-planet-0-0'),(2.4,'moon','sample-moon-0-0-0'),(4,'satellite','sample-satellite-0-0-0-0'),(9,'astronaut','sample-deep-7')]:
            e(f"camera.minScale=Math.min(camera.minScale,{scale});camera.maxScale=12;camera.setView({{x:{min(width/2,400)}-entries.get('{identity}').x*{scale},y:{min(height/2,300)}-entries.get('{identity}').y*{scale},scale:{scale}}},false);requestLabelLayout(true)")
            check(e(f' Math.abs(camera.view.scale-{scale})<1e-10'),f'Sample requested label scale {scale} is actually reached at {width}')
            settle_labels(wait_for)
            counts=label_counts(e)
            nonzero=[r for r,n in counts.items() if n]
            check(len(nonzero)<=2 and (len(nonzero)<2 or e('cosmosView.labelOrder').index(nonzero[1])-e('cosmosView.labelOrder').index(nonzero[0])==1),f'dense Sample only shows adjacent orientation layers at {scale}/{width}: {counts}')
            if scale not in [.84,.95]:check(nonzero==[role],f'dense Sample has a visible dominant {role} layer at {scale}/{width}')
            if width==390:print('LABEL_COUNTS '+json.dumps(dict(fixture='Sample282',scale=scale,counts=counts)),flush=True)
            shot(f'envelope-sample-{scale}-{width}')
