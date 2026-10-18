"""Visibility-aware rendering against a real DOM, retained particles and camera."""
import json


def run_render_visibility_checks(*, cdp, evaluate, check, wait_for, add, shot):
    q = json.dumps
    root = add('Visibility Galaxy')
    sun = add('Visibility Sun', root)
    planet = add('Visibility Planet', sun)
    moon = add('Visibility Moon', planet)
    satellite = add('Visibility Satellite', moon)
    item = add('Visibility Item', satellite)
    other = add('Unrelated offscreen', sun)
    wait_for('physics.settled')
    evaluate('physics.pause();camera.stopAnimation();autoFitPending=false;closeInspector();hierarchySidebar.setCollapsed(true);clearSelection();document.activeElement.blur();searchOpen=false;searchFocusId=null;focusRevealIds.clear()')
    evaluate(f"window.V={{root:{q(root)},sun:{q(sun)},planet:{q(planet)},moon:{q(moon)},satellite:{q(satellite)},item:{q(item)},other:{q(other)}}}")
    evaluate("""
        V.move=(id,x,y)=>{Object.assign(entries.get(id),{x,y});Object.assign(physics.particles.get(id),{x,y});};
        V.origin=()=>{physics.pause();camera.stopAnimation();camera.setView({x:0,y:0,scale:1.15},false);};
        V.projected=id=>{const n=nodes.get(id),e=entries.get(id),p=camera.worldToScreen(e.x,e.y);
            return n.renderX===Math.round(p.x*4)/4&&n.renderY===Math.round(p.y*4)/4;};
        V.skipped=id=>nodes.get(id).dataset.renderSkipped==='true';
        V.mutations=(element,run)=>{const o=new MutationObserver(()=>{});o.observe(element,{attributes:true,subtree:true});run();const r=o.takeRecords();o.disconnect();return r.map(x=>x.attributeName);};
        V.identities=[...entries].map(([id,e])=>[id,e,nodes.get(id),physics.particles.get(id)]);
        V.layout=JSON.stringify([...layout]);
        V.far=()=>{entries.forEach(e=>V.move(e.id,10000+e.depth*100,10000));renderGraph();};
        V.origin();V.far();
    """)
    check(evaluate('V.skipped(V.other)&&getComputedStyle(nodes.get(V.other)).display==="none"'), 'offscreen ordinary subtree is excluded from layout/paint')
    check(evaluate('V.mutations(nodes.get(V.other),()=>{V.move(V.other,11000,10500);renderGraph()}).length===0'), 'continuing offscreen motion produces no body DOM/style mutations')
    check(evaluate('physics.particles.size===entries.size&&V.identities.every(([id,e,n,p])=>entries.get(id)===e&&nodes.get(id)===n&&physics.particles.get(id)===p)'), 'culling retains every canonical entry, DOM node and physics particle')

    # Each exception is exercised while the body is genuinely offscreen.
    exceptions = [
        ('selection', 'selectedNode=nodes.get(V.other)', 'selectedNode=null'),
        ('hover', 'hoveredEntryId=V.other', 'hoveredEntryId=null'),
        ('drag class', 'nodes.get(V.other).classList.add("dragging")', 'nodes.get(V.other).classList.remove("dragging")'),
        ('physics drag', 'physics.dragging.add(V.other)', 'physics.dragging.delete(V.other)'),
        ('search focus', 'searchFocusId=V.other', 'searchFocusId=null'),
        ('navigation reveal', 'focusRevealIds.add(V.other)', 'focusRevealIds.clear()'),
        ('search match', 'searchOpen=true;nodes.get(V.other).classList.add("search-match")', 'searchOpen=false;nodes.get(V.other).classList.remove("search-match")'),
        ('search ancestor', 'searchOpen=true;nodes.get(V.other).classList.add("search-ancestor")', 'searchOpen=false;nodes.get(V.other).classList.remove("search-ancestor")'),
        ('selected ancestry', 'nodes.get(V.other).classList.add("selected-ancestor")', 'nodes.get(V.other).classList.remove("selected-ancestor")'),
        ('Constellation member', 'activeConstellationMembers.add(V.other)', 'activeConstellationMembers.clear()'),
    ]
    for label, start, end in exceptions:
        evaluate(start + ';V.move(V.other,entries.get(V.other).x+10,10500);renderGraph()')
        check(evaluate('!V.skipped(V.other)&&V.projected(V.other)&&nodes.get(V.other).dataset.culled==="true"'), label + ' retains current rendering without changing offscreen visibility rules')
        evaluate(end + ';renderGraph()')
        check(evaluate('V.skipped(V.other)'), label + ' removal restores skipping')
    evaluate('activeConstellationGalaxyIds.add(V.root);renderGraph()')
    check(evaluate('!V.skipped(V.root)'), 'Constellation Galaxy context is protected')
    evaluate('activeConstellationGalaxyIds.clear();renderGraph()')

    # Real keyboard focus can only start on an on-screen non-inert body.
    evaluate('V.move(V.other,170,200);renderGraph();nodes.get(V.other).focus({preventScroll:true});V.move(V.other,10000,10000);renderGraph()')
    check(evaluate('document.activeElement===nodes.get(V.other)&&!V.skipped(V.other)&&V.projected(V.other)'), 'focused body remains updated after moving offscreen')
    evaluate('nodes.get(V.other).blur();renderGraph()')
    check(evaluate('V.skipped(V.other)'), 'blurred ordinary offscreen body can skip again')

    evaluate('V.far();V.move(V.moon,50000,50000);camera.setView({x:0,y:0,scale:.1},false)')
    check(evaluate('V.skipped(V.moon)&&nodes.get(V.moon).inert&&nodes.get(V.moon).dataset.semanticHidden==="true"&&nodes.get(V.moon).labelOpacity===cosmosView.labelDisclosure("moon",.1,V.moon)'), 'offscreen semantic/inert/label state updates even while visual writes are suspended')
    evaluate('camera.setView({x:0,y:0,scale:1.15},false)')
    check(evaluate('V.skipped(V.moon)&&!nodes.get(V.moon).inert&&nodes.get(V.moon).dataset.semanticHidden==="false"'), 'zoom restores offscreen semantic eligibility without requiring re-entry')
    evaluate('activeConstellationMembers.add(V.other);activeConstellationGalaxyIds.add(V.root);renderGraph()')
    check(evaluate('nodes.get(V.root).classList.contains("constellation-galaxy-context")&&!V.skipped(V.root)'), 'entering a lens applies offscreen Galaxy context immediately')
    evaluate('activeConstellationMembers.clear();activeConstellationGalaxyIds.clear();renderGraph()')
    check(evaluate('V.skipped(V.root)&&!nodes.get(V.root).classList.contains("constellation-galaxy-context")&&nodes.get(V.root).labelOpacity===cosmosView.labelDisclosure("galaxy",camera.view.scale,V.root)'), 'exiting a lens clears offscreen context and restores normal label eligibility immediately')

    for width, height in [(360,800), (390,844), (430,932), (740,360), (1440,1000)]:
        mobile = width < 1000
        cdp.call('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=2, mobile=mobile)
        cdp.call('Emulation.setTouchEmulationEnabled', enabled=mobile, maxTouchPoints=2)
        evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        wait_for('camera.frame===null')
        evaluate('V.origin();V.far()')
        tag = f'{width}x{height}'
        # Continuously cross the old conservative overscan boundary in both directions.
        for x in [-500,-180,-80,0,100,width-20,width+80,width+180,width+500,100]:
            evaluate(f'V.move(V.other,{x}/camera.view.scale,200/camera.view.scale);renderGraph()')
            check(evaluate('V.skipped(V.other)?nodes.get(V.other).dataset.culled==="true":V.projected(V.other)'), f'pan/motion boundary has current transform whenever renderable: {tag}, x={x}')
            if 0 <= x <= width:
                check(evaluate('!V.skipped(V.other)&&getComputedStyle(nodes.get(V.other)).display!=="none"'), 'no visible hole on entry: ' + tag)
        for scale in [.25,.45,.58,.68,.78,1.15,2.4,.25,1.15]:
            evaluate(f'V.move(V.other,500,200);camera.setView({{x:0,y:0,scale:{scale}}},false)')
            check(evaluate('V.skipped(V.other)||V.projected(V.other)'), f'zoom re-entry is synchronous: {tag}, scale={scale}')
            check(evaluate('V.skipped(V.other)||((nodes.get(V.other).dataset.semanticHidden==="true")===(cosmosView.detail(camera.view.scale).planet<.02)&&nodes.get(V.other).labelOpacity===cosmosView.labelDisclosure("planet",camera.view.scale,V.other))'), 'existing semantic/label thresholds preserved: ' + tag)
        # Camera-only pan must use current coordinates, not the last rendered transform.
        evaluate('V.origin();V.move(V.other,10000,10000);renderGraph();V.move(V.other,10100,10200);camera.setView({x:180-10100*1.15,y:220-10200*1.15,scale:1.15},false)')
        check(evaluate('!V.skipped(V.other)&&V.projected(V.other)&&nodes.get(V.other).renderX===180&&nodes.get(V.other).renderY===220'), 'camera pan immediately catches up offscreen motion: ' + tag)
        shot('visibility-reentry-' + tag)

    # Offscreen relationships skip geometry; crossing segments are conservatively kept.
    evaluate('V.origin();V.far();window.tether=lines.find(l=>l.to===V.item);window.inactive=lines.find(l=>l.to===V.other)')
    check(evaluate('tether.element.dataset.renderSkipped==="true"&&inactive.element.dataset.renderSkipped==="true"'), 'offscreen tether and inactive hierarchy geometry are skipped')
    check(evaluate('V.mutations(tether.element,()=>{V.move(V.item,12000,11000);renderGraph()}).length===0'), 'offscreen tether motion writes no SVG geometry/style')
    evaluate('V.move(V.satellite,-1000,200);V.move(V.item,1000,200);renderGraph()')
    check(evaluate('tether.element.dataset.renderSkipped==="false"&&Number(tether.element.getAttribute("x1"))===-1000&&Number(tether.element.getAttribute("x2"))===1000'), 'crossing tether retained even with both endpoints offscreen')
    evaluate('focusRevealIds.add(V.item);V.move(V.item,10000,10000);V.move(V.satellite,11000,10000);renderGraph()')
    check(evaluate('tether.element.dataset.renderSkipped==="false"&&Number(tether.element.getAttribute("x2"))===10000'), 'protected relationship endpoint retains exact geometry')
    evaluate('focusRevealIds.clear();V.move(V.satellite,120,180);V.move(V.item,160,190);renderGraph()')
    check(evaluate('tether.element.dataset.renderSkipped==="false"&&Number(tether.element.getAttribute("x1"))===120&&Number(tether.element.getAttribute("x2"))===160'), 'tether re-entry immediately restores current geometry')
    evaluate('V.far();window.guide=orbitGuides.find(g=>g.id===V.sun);hoveredSystemId=physics.particles.get(V.sun).systemId;renderGraph()')
    check(evaluate('guide.element.dataset.active==="true"&&guide.element.dataset.renderSkipped==="true"'), 'offscreen active orbit skips geometry without changing active semantics')
    check(evaluate('V.mutations(guide.element,()=>{V.move(V.sun,12500,12000);renderGraph()}).length===0'), 'offscreen orbit motion writes no SVG geometry')
    evaluate('V.move(V.sun,170,220);renderGraph()')
    check(evaluate('guide.element.dataset.renderSkipped==="false"&&Number(guide.element.getAttribute("cx"))===170'), 'orbit re-entry restores current geometry')
    evaluate('hoveredSystemId=null;renderGraph()')

    # Actual solver runs retain offscreen nodes and their forces; rendering never
    # mutates placement, simulation constraints or hierarchy membership.
    evaluate('V.far();window.solverNodes=physics.simulation.nodes().slice();window.farBefore=physics.particles.get(V.other).x;physics.simulation.alpha(.22).tick(5);physics.onTick(physics.particles);physics.pause()')
    check(evaluate('physics.simulation.nodes().length===entries.size&&solverNodes.every(p=>physics.particles.get(p.id)===p)&&physics.particles.get(V.other).x!==farBefore'), 'all offscreen particles still participate in the real solver')
    check(evaluate('JSON.stringify([...layout])===V.layout'), 'visibility rendering never changes saved/manual placement')
    cdp.call('Emulation.setEmulatedMedia', features=[dict(name='prefers-reduced-motion',value='reduce')])
    wait_for('camera.reducedMotion')
    evaluate('V.origin();V.far();V.move(V.other,150,200);renderGraph()')
    check(evaluate('!V.skipped(V.other)&&V.projected(V.other)&&camera.frame===null'), 'reduced-motion re-entry remains immediate without animation')
    check(not cdp.errors, f'no visibility-render browser exceptions: {cdp.errors}')
