"""Real DOM/camera checks using disposable dense hierarchies, never live data."""
import json


def overview_fixture(count):
    entries = []

    def add(identity, parent, name):
        entries.append(dict(id=identity, parentId=parent, name=name,
                            description='', category='', x=0, y=0, seedLayout=True))

    system = 0
    while len(entries) < count:
        if system % 4 == 0:
            add('g' + str(system // 4), None, 'Galaxy ' + str(system // 4))
        if len(entries) >= count:
            break
        sun = 's' + str(system)
        add(sun, 'g' + str(system // 4), 'System ' + str(system))
        for planet_index in range(4):
            planet = f'{sun}-p{planet_index}'
            if len(entries) >= count:
                break
            add(planet, sun, f'Planet {system}/{planet_index}')
            for moon_index in range(2):
                moon = f'{planet}-m{moon_index}'
                if len(entries) >= count:
                    break
                add(moon, planet, f'Moon {system}/{planet_index}/{moon_index}')
                if len(entries) >= count:
                    break
                satellite = moon + '-sat'
                add(satellite, moon, 'Satellite ' + satellite)
                if moon_index == 0 and len(entries) < count:
                    add(satellite + '-a', satellite, 'Item ' + satellite)
        system += 1
    return dict(version=5, entries=entries, layout=[], portals=[], constellations=[], archivedGalaxies=[])


def run_real_body_overview_checks(*, cdp, evaluate, check, wait_for, shot):
    for count in [150, 325]:
        origin=evaluate('location.origin')
        # Leave the application before replacing disposable test data, so its
        # normal unload/save lifecycle cannot overwrite the next fixture.
        cdp.call('Page.navigate',url=origin+'/404.html')
        wait_for('location.pathname==="/404.html"&&document.readyState==="complete"&&typeof physics==="undefined"')
        raw=json.dumps(overview_fixture(count))
        evaluate('window.overviewSeed=""')
        for offset in range(0,len(raw),12000):
            evaluate('window.overviewSeed+='+json.dumps(raw[offset:offset+12000]))
        evaluate('localStorage.setItem("galaxy:user-data",overviewSeed)')
        cdp.call('Page.navigate',url=origin+'/index.html')
        wait_for(f'document.readyState==="complete"&&typeof physics!=="undefined"&&entries.size==={count}&&physics.particles.size==={count}')
        evaluate('autoFitPending=false;physics.pause();physics.setGraph([],new Map(),{reheat:0});entries.forEach(e=>e.seedLayout=true);syncPhysicsGraph({reheat:.55});physics.simulation.tick(350);physics.onTick(physics.particles);camera.stopAnimation();hierarchySidebar.setCollapsed(true);closeInspector();clearSelection();document.activeElement.blur();physics.pause()')
        evaluate('window.overviewState=JSON.stringify([...entries].map(([id,e])=>[id,e.x,e.y,e.parentId]));window.overviewLayout=JSON.stringify([...layout])')
        check(evaluate('regions.size===0&&regionsLayer.childElementCount===0&&galaxyAppearance.cloudCache.size===0'), f'no cloud canvases or baking in normal {count}-body presentation')
        # Legacy cloud geometry must have no influence on root projection or Fit.
        evaluate("window.legacyBounds=galaxyBounds();regions.set('g0',{footprint:{offsetX:1e9,offsetY:1e9,width:1e9,height:1e9}});focusRevealIds.add('g0');renderNode(entries.get('g0'),nodes.get('g0'))")
        check(evaluate("JSON.stringify(galaxyBounds())===JSON.stringify(legacyBounds)&&nodes.get('g0').renderX===Math.round(camera.worldToScreen(entries.get('g0').x,entries.get('g0').y).x*4)/4"), 'legacy cloud footprint cannot offset labels/root or inflate Fit')
        evaluate("regions.delete('g0');focusRevealIds.clear()")
        check(evaluate('(()=>{const b=galaxyBounds();return [...entries.values()].every(e=>e.x>=b.left&&e.x<=b.right&&e.y>=b.top&&e.y<=b.bottom)&&[b.left,b.right,b.top,b.bottom].every(Number.isFinite)})()'), 'actual-body Fit bounds include every root and descendant')

        for width, height in [(360,800), (390,844), (430,932), (740,360), (1440,1000)]:
            mobile = width < 1000
            cdp.call('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=3 if mobile else 1, mobile=mobile)
            cdp.call('Emulation.setTouchEmulationEnabled', enabled=mobile, maxTouchPoints=2)
            evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
            wait_for('camera.frame===null')
            evaluate('physics.pause();hierarchySidebar.setCollapsed(true);clearSelection();document.activeElement.blur();fitGalaxy(false)')
            evaluate('new Promise(r=>setTimeout(r,400))')
            tag = f'{count}-{width}'
            check(evaluate("[...entries].filter(([,e])=>['sun','planet'].includes(e.role)).every(([id])=>nodes.get(id).dataset.semanticHidden==='false'&&!nodes.get(id).inert)"), 'Fit retains real Sun/Planet eligibility: ' + tag)
            check(evaluate("[...nodes].filter(([id,n])=>n.dataset.culled!=='true'&&n.dataset.semanticHidden!=='true'&&n.labelOpacity>.18&&n.querySelector('.node-label').dataset.densityHidden==='false').length<=12"), 'dense Fit overview avoids a wall of labels: ' + tag)
            check(evaluate("[...entries].filter(([,e])=>e.depth===0).every(([id,e])=>{const n=nodes.get(id),p=camera.worldToScreen(e.x,e.y);return n.renderX===Math.round(p.x*4)/4&&n.renderY===Math.round(p.y*4)/4&&n.renderDiameter>=14})"), 'Galaxy markers are anchored to actual roots at wide Fit: ' + tag)
            shot('real-overview-fit-' + tag)
            evaluate("focusEntry('s0',{openInspector:false});camera.setView(camera.target,false)")
            wait_for('camera.frame===null')
            evaluate('physics.pause();new Promise(r=>setTimeout(r,400))')
            check(evaluate("nodes.get('s0').dataset.semanticHidden==='false'&&parseFloat(getComputedStyle(nodes.get('s0')).opacity)>.8&&nodes.get('s0-p0').dataset.semanticHidden==='false'"), 'unchanged whole-system focus shows real system structure: ' + tag)
            shot('real-overview-system-' + tag)
            for scale in [.02,.08,.15,.24,.28,.35,.58,.8,1.15,2.4]:
                evaluate(f"clearSelection();document.activeElement.blur();camera.setView({{x:180-entries.get('s0').x*{scale},y:260-entries.get('s0').y*{scale},scale:{scale}}},false)")
                check(evaluate("['s0','s0-p0'].every(id=>{const n=nodes.get(id);return n.dataset.semanticHidden==='false'&&!n.inert&&n.renderDiameter>=(id==='s0'?6:2.5)})"), f'continuous Sun/Planet silhouettes at {scale}: ' + tag)
                mismatch=evaluate("[...nodes].filter(([id,n])=>n.dataset.renderSkipped!=='true'&&n.dataset.semanticHidden!=='true'&&Math.abs(n.getBoundingClientRect().width-n.renderDiameter)>.1).map(([id,n])=>({id,role:n.dataset.role,actual:n.getBoundingClientRect().width,expected:n.renderDiameter}))")
                check(not mismatch, 'perceptible body arithmetic and CSS bounds agree: ' + tag + '; '+json.dumps(mismatch))
            evaluate("clearSelection();document.activeElement.blur();camera.setView({x:180-entries.get('g0').x*.08,y:260-entries.get('g0').y*.08,scale:.08},false)")
            check(evaluate("(()=>{const n=nodes.get('g0'),p={x:n.renderX,y:n.renderY};return galaxyAtScreen(p)==='g0'&&galaxyAtScreen({x:p.x+80,y:p.y+80})!=='g0'&&nodes.get('s0-p0-m0').inert&&nodes.get('s0-p0-m0-sat').inert})()"), 'root hit area follows marker, with no cloud territory and selective deeper bodies: ' + tag)
            # Place a nearby Sun where the former below-root label collided.
            # Only this disposable fixture is changed, and all positions are restored.
            evaluate("window.anchorSaved=[...entries].map(([id,e])=>[id,e.x,e.y]);entries.forEach(e=>{e.x=-30000;e.y=-30000});Object.assign(entries.get('g0'),{x:0,y:0});Object.assign(entries.get('s0'),{x:0,y:75});camera.setView({x:180,y:240,scale:.4},false);renderGraph();requestLabelLayout(true)")
            evaluate('new Promise(r=>setTimeout(r,400))')
            check(evaluate("(()=>{const n=nodes.get('g0'),s=nodes.get('s0'),r=n.querySelector('.node-label').getBoundingClientRect();return Math.abs(r.left+r.width/2-n.renderX)<.5&&r.bottom<=Math.min(n.renderY-n.renderDiameter/2,s.renderY-s.renderDiameter/2)-11&&n.querySelector('.node-label').dataset.densityHidden==='false'})()"), 'Galaxy group heading clears the core and nearby Sun instead of attaching to it: ' + tag)
            check(evaluate("(()=>{const n=nodes.get('g0'),c=n.querySelector('.galaxy-core'),hit=n.querySelector('.node-hit-area').getBoundingClientRect();const r=n.querySelector('.node-label').getBoundingClientRect();return c.tagName==='SPAN'&&!c.children.length&&getComputedStyle(n).boxShadow==='none'&&getComputedStyle(n).borderTopWidth==='0px'&&getComputedStyle(c).filter==='none'&&getComputedStyle(c).animationName==='none'&&hit.width===20&&document.elementFromPoint(n.renderX,n.renderY)?.closest('.entry-node')===n})()"), 'bounded gradient core remains a native target without filters/spiral: ' + tag)
            check(evaluate("(()=>{const n=nodes.get('s0');return document.elementFromPoint(n.renderX,n.renderY)?.closest('.entry-node')===n})()"), 'nearby Sun is independently targetable, outside compact core target: ' + tag)
            # Even inside the core's modest expansion, the real Sun paints/hits
            # above the Galaxy anchor rather than losing its native target.
            evaluate("Object.assign(entries.get('s0'),{x:100,y:0});renderGraph();requestLabelLayout(true)")
            check(evaluate("(()=>{const n=nodes.get('s0');return document.elementFromPoint(n.renderX,n.renderY)?.closest('.entry-node')===n})()"), 'overlapping Galaxy touch expansion never steals the Sun center: ' + tag)
            evaluate("Object.assign(entries.get('s0'),{x:500,y:0});renderGraph();requestLabelLayout(true)")
            wait_for("labelDensity.timer===null&&labelDensity.frame===null&&labelDensity.trailingTimer===null&&nodes.get('g0').querySelector('.node-label').dataset.densityHidden==='false'")
            check(evaluate("(()=>{const n=nodes.get('g0'),r=n.querySelector('.node-label').getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.entry-node')===n})()"),'unobscured Galaxy group heading remains a native target: '+tag)
            shot('galaxy-anchor-near-sun-' + tag)
            if width==390:
                evaluate("Object.assign(entries.get('s0'),{x:0,y:0});camera.setView({x:180,y:240,scale:.8},false);focusRevealIds.add('g0');renderGraph();requestLabelLayout(true)")
                evaluate('new Promise(r=>setTimeout(r,400))')
                check(evaluate("(()=>{const n=nodes.get('g0'),s=nodes.get('s0'),r=n.querySelector('.node-label').getBoundingClientRect();return Math.abs(r.left+r.width/2-s.renderX)<.5&&r.bottom<=Math.min(n.renderY-n.renderDiameter/2,s.renderY-s.renderDiameter/2)-11&&n.querySelector('.node-label').dataset.densityHidden==='false'})()"), 'explicit Galaxy reveal keeps its group heading above a coincident Sun: ' + tag)
                shot('galaxy-anchor-close-sun-' + tag)
                evaluate("selectedNode=nodes.get('s0');renderGraph();requestLabelLayout(true)")
                evaluate('new Promise(r=>setTimeout(r,400))')
                check(evaluate("(()=>{const a=nodes.get('g0').querySelector('.node-label'),b=nodes.get('s0').querySelector('.node-label'),r=a.getBoundingClientRect(),s=b.getBoundingClientRect();return a.dataset.densityHidden==='false'&&b.dataset.densityHidden==='false'&&nodes.get('g0').labelOpacity===1&&nodes.get('s0').labelOpacity===1&&r.bottom<s.top})()"), 'coincident explicit Galaxy and selected-Sun names both retain protected reveal: ' + tag)
                evaluate('selectedNode=null;renderGraph()')
            evaluate("focusRevealIds.clear();anchorSaved.forEach(([id,x,y])=>Object.assign(entries.get(id),{x,y}));renderGraph()")
            if width==390:
                for root_scale in [.35,.8,1.15]:
                    evaluate(f"camera.setView({{x:180-entries.get('g0').x*{root_scale},y:240-entries.get('g0').y*{root_scale},scale:{root_scale}}},false);requestLabelLayout(true)")
                    evaluate('new Promise(r=>setTimeout(r,300))')
                    check(evaluate("(()=>{const n=nodes.get('g0');return n.renderDiameter>=14&&n.renderDiameter<=22&&getComputedStyle(n).opacity==='1'&&!!n.querySelector('.galaxy-core')})()"), f'core stays compact and present at {root_scale}: ' + tag)
                    shot(f'galaxy-anchor-root-{root_scale}-' + tag)
            # Native hit-testing at an exposed root, independently of nearby dense systems.
            evaluate("window.savedRoot={x:entries.get('g0').x,y:entries.get('g0').y};Object.assign(entries.get('g0'),{x:-10000,y:-10000});camera.setView({x:180+800,y:240+800,scale:.08},false)")
            point=evaluate("({x:nodes.get('g0').renderX,y:nodes.get('g0').renderY})")
            if mobile:
                cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point])
                cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
            else:
                cdp.call('Input.dispatchMouseEvent',type='mousePressed',**point,button='left',clickCount=1)
                cdp.call('Input.dispatchMouseEvent',type='mouseReleased',**point,button='left',clickCount=1)
            check(evaluate("selectedNode?.dataset.entryId==='g0'"), 'native Galaxy marker tap/click selects the canonical root: ' + tag)
            check(evaluate("(()=>{const root=nodes.get('g0'),echo=archiveMotion.capture(null,[root],{x:root.renderX,y:root.renderY});return !!echo?.querySelector('.galaxy-core')&&echo.querySelector('.entry-node').style.getPropertyValue('--overview-decoration')===getComputedStyle(root).getPropertyValue('--overview-decoration')})()"), 'an empty Galaxy supplies its own archive visual and detail level without a cloud: ' + tag)
            evaluate("cancelPendingBodyFocus();lastBodyTap=null;Object.assign(entries.get('g0'),savedRoot);closeInspector();clearSelection();document.activeElement.blur();camera.stopAnimation();physics.pause()")
            for mode, start, end in [
                ('selected',"selectedNode=nodes.get('s0-p0')",'selectedNode=null'),
                ('searched',"searchFocusId='s0-p0'",'searchFocusId=null'),
                ('focused ancestry',"focusRevealIds.add('s0-p0')",'focusRevealIds.clear()')]:
                # Navigation reveal is transient and camera.onRest clears it;
                # exercise the active reveal after framing, before dismissal.
                evaluate("camera.setView({x:180-entries.get('s0-p0').x*.08,y:260-entries.get('s0-p0').y*.08,scale:.08},false);" + start + ';renderGraph();requestLabelLayout(true)')
                try:
                    wait_for("nodes.get('s0-p0').querySelector('.node-label').dataset.densityHidden==='false'",timeout=5)
                except AssertionError as failure:
                    state=evaluate("(()=>{const n=nodes.get('s0-p0');return {view:camera.view,bounds:physics.bounds,classes:n.className,x:n.renderX,y:n.renderY,culled:n.dataset.culled,inert:n.inert,label:n.labelOpacity,metrics:n.labelMetrics,focus:[...focusRevealIds]}})()")
                    raise AssertionError(mode+': '+json.dumps(state)) from failure
                check(evaluate("nodes.get('s0-p0').labelOpacity===1&&nodes.get('s0-p0').classList.contains('label-priority')||nodes.get('s0-p0').classList.contains('temporarily-revealed')&&nodes.get('s0-p0').labelOpacity===1"), mode + ' label wins at overview: ' + tag)
                evaluate(end + ';renderGraph()')
            evaluate("camera.setView({x:180-entries.get('s0').x*.08,y:260-entries.get('s0').y*.08,scale:.08},false)")
            check(evaluate("getComputedStyle(nodes.get('s0'),'::before').display==='none'&&getComputedStyle(nodes.get('s0')).boxShadow==='none'"), 'wide view excludes expensive surface/decorative layers: ' + tag)
            evaluate("camera.setView({...camera.view,scale:1.15},false)")
            check(evaluate("getComputedStyle(nodes.get('s0'),'::before').display!=='none'&&getComputedStyle(nodes.get('s0')).boxShadow!=='none'&&cosmosView.detail(1.15).sun===1&&cosmosView.detail(1.15).planet===1"), 'close view restores original body paint: ' + tag)
        check(evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.x,e.y,e.parentId]))===overviewState&&JSON.stringify([...layout])===overviewLayout'), f'overview/navigation never changes {count}-body world positions or saved layout')
    check(not cdp.errors, f'no overview browser exceptions: {cdp.errors}')
