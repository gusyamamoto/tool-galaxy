"""Branch-local label handoff with disposable local scenes; no live data."""
import json
from real_body_overview_browser import overview_fixture
from semantic_handoff_browser import settle_labels


def run_terminal_label_checks(*,cdp,evaluate,check,wait_for,add,shot):
    e=evaluate;q=json.dumps
    seed=overview_fixture(325)
    scene=[('root',None),('sun','root'),('planet','sun'),('moon','planet'),('satellite','moon'),('astronaut','satellite'),('deep','astronaut'),
           ('shallowSun','root'),('shallowPlanet','shallowSun'),('terminalSun','root'),('terminalMoon','planet'),('terminalSatellite','moon'),('terminalGalaxy',None),('twinPlanet','shallowSun')]
    seed['entries'] += [dict(id=id,parentId=parent,name=id,description='',category='',x=0,y=0) for id,parent in scene]
    origin=e('location.origin');cdp.call('Page.navigate',url=origin+'/404.html')
    wait_for('location.pathname==="/404.html"&&document.readyState==="complete"&&typeof physics==="undefined"')
    raw=q(seed);e('window.terminalSeed=""')
    for start in range(0,len(raw),12000):e('terminalSeed+='+q(raw[start:start+12000]))
    e('localStorage.setItem("galaxy:user-data",terminalSeed)');cdp.call('Page.navigate',url=origin+'/index.html')
    wait_for('typeof physics!=="undefined"&&entries.size===339&&physics.particles.size===339')
    e('autoFitPending=false;physics.pause();camera.stopAnimation();hierarchySidebar.setCollapsed(true);closeInspector();clearSelection();document.activeElement.blur()')
    # Deterministic visual spacing in a disposable scene; production layout is untouched.
    e("""[...entries.values()].forEach((entry,i)=>{entry.x=10000+i*500;entry.y=10000;const p=physics.particles.get(entry.id);p.x=entry.x;p.y=entry.y;});
    ['root','sun','planet','moon','satellite','astronaut','deep','shallowSun','shallowPlanet','terminalSun','terminalMoon','terminalSatellite','terminalGalaxy','twinPlanet'].forEach((id,i)=>{const n=entries.get(id),p=physics.particles.get(id);n.x=p.x=i*35;n.y=p.y=0;});
    physics.onTick(physics.particles);window.terminalPositions=JSON.stringify([...entries].map(([id,n])=>[id,n.x,n.y,n.parentId]));window.terminalLayout=JSON.stringify([...layout]);
    window.terminalBuild=cosmosView.terminalLabelIds;window.terminalBuilds=0;cosmosView.terminalLabelIds=function(...args){terminalBuilds++;return terminalBuild.apply(this,args)};""")

    def frame(id,scale=9):
        e(f"camera.maxScale=12;camera.minScale=.02;camera.setView({{x:innerWidth/2-entries.get({q(id)}).x*{scale},y:Math.min(200,innerHeight/2)-entries.get({q(id)}).y*{scale},scale:{scale}}},false);requestLabelLayout(true)")
        settle_labels(wait_for)

    for width,height in [(360,800),(390,844),(430,932),(740,360),(1440,1000)]:
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=width<1000)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=width<1000,maxTouchPoints=2)
        wait_for('camera.frame===null');e('physics.pause();closeInspector();clearSelection();document.activeElement.blur();hoveredEntryId=null;searchFocusId=null;focusRevealIds.clear()')
        frame('astronaut');scale=e('camera.view.scale')
        check(e("nodes.get('astronaut').labelOpacity===1&&nodes.get('planet').labelOpacity===0&&nodes.get('moon').labelOpacity===0&&nodes.get('satellite').labelOpacity===0"),f'{width}: deep branch retains normal intermediate handoff')
        shot('terminal-deep-'+str(width))
        frame('shallowPlanet',scale)
        check(e('camera.view.scale')==scale and e("nodes.get('shallowPlanet').labelOpacity===1&&nodes.get('shallowPlanet').querySelector('.node-label').dataset.densityHidden==='false'&&parseFloat(getComputedStyle(nodes.get('shallowPlanet').querySelector('.node-label')).opacity)>.99"),f'{width}: pan without zoom reaches a visible terminal Planet')
        shot('terminal-shallow-'+str(width))
        for id in ['terminalGalaxy','terminalSun','terminalMoon','terminalSatellite','deep']:
            frame(id)
            check(e(f"nodes.get({q(id)}).labelOpacity===1&&terminalLabelIds.has({q(id)})&&nodes.get({q(id)}).querySelector('.node-label').dataset.densityHidden==='false'"),f'{width}: terminal {id} remains labelable at deep zoom')
        for id in ['planet','shallowPlanet']:
            frame(id,1.3)
            check(e(f'nodes.get({q(id)}).labelOpacity===1'),f'{width}: original Planet dominant range unchanged for {id}')
        # A dense overlap uses the real resolver. No terminal is protected merely for being terminal.
        e("window.oldShallow=entries.get('shallowPlanet').x;entries.get('shallowPlanet').x=entries.get('twinPlanet').x;physics.particles.get('shallowPlanet').x=entries.get('twinPlanet').x")
        frame('twinPlanet')
        check(e("['shallowPlanet','twinPlanet'].filter(id=>nodes.get(id).querySelector('.node-label').dataset.densityHidden==='false').length===1"),f'{width}: colliding terminal labels are suppressed, not forced visible')
        e("entries.get('shallowPlanet').x=physics.particles.get('shallowPlanet').x=oldShallow")
        frame('shallowPlanet')
        for override in ["searchFocusId='shallowPlanet'","hoveredEntryId='shallowPlanet'","selectEntry(entries.get('shallowPlanet'),nodes.get('shallowPlanet'),{openInspector:false,reframe:false})"]:
            e(override+';physics.pause();renderGraph();requestLabelLayout(true)');settle_labels(wait_for)
            check(e("nodes.get('shallowPlanet').labelOpacity===1&&nodes.get('shallowPlanet').classList.contains('label-priority')&&nodes.get('shallowPlanet').querySelector('.node-label').dataset.densityHidden==='false'"),f'{width}: explicit label priority preserved: {override.split("=")[0]}')
            e('clearSelection();document.activeElement.blur();hoveredEntryId=null;searchFocusId=null;focusRevealIds.clear();renderGraph()')
        check(e('terminalBuilds===0'),f'{width}: zoom/pan does not traverse the hierarchy again')
        check(e('JSON.stringify([...entries].map(([id,n])=>[id,n.x,n.y,n.parentId]))===terminalPositions&&JSON.stringify([...layout])===terminalLayout'),f'{width}: label rendering preserves coordinates and saved placement')

    # Real production CRUD publication routes, rather than manually rebuilding the cache.
    child=add('New child','shallowPlanet');e('physics.pause()')
    check(e("!terminalLabelIds.has('shallowPlanet')&&terminalLabelIds.has("+q(child)+')'), 'creating a child invalidates terminal parent status')
    e('closeInspector();clearSelection();document.activeElement.blur();focusRevealIds.clear()');frame('shallowPlanet')
    check(e("nodes.get('shallowPlanet').labelOpacity===0&&!nodes.get('shallowPlanet').style.getPropertyValue('--terminal-label-opacity')&&parseFloat(getComputedStyle(nodes.get('shallowPlanet').querySelector('.node-label')).opacity)<.03"),'new deeper branch removes stale terminal CSS and resumes normal handoff')
    e(f"requestEntryDelete({q(child)});document.getElementById('delete-entry-form').requestSubmit()")
    wait_for(f'!entries.has({q(child)})');e('physics.pause()')
    check(e("terminalLabelIds.has('shallowPlanet')"),'deleting the child restores terminal parent status')
    e('closeInspector();clearSelection();document.activeElement.blur();focusRevealIds.clear()');frame('shallowPlanet')
    check(e("nodes.get('shallowPlanet').labelOpacity===1&&parseFloat(getComputedStyle(nodes.get('shallowPlanet').querySelector('.node-label')).opacity)>.99"),'deleting deeper content restores the actual terminal label')
    check(e("moveSidebarEntries({ids:['terminalMoon'],activeId:'terminalMoon'},'shallowPlanet')"),'real Move succeeds')
    e('physics.pause()')
    check(e("!terminalLabelIds.has('shallowPlanet')&&terminalLabelIds.has('terminalMoon')"),'Move recalculates both branches')
    e('closeInspector();clearSelection();document.activeElement.blur();focusRevealIds.clear()');frame('shallowPlanet')
    check(e("nodes.get('shallowPlanet').labelOpacity===0"),'Move resumes parent handoff without stale terminal opacity')
    e("openDuplicateStructure('shallowSun');structureName.value='Duplicated terminal branch';structureForm.requestSubmit()")
    wait_for('!structureDialog.open');e('physics.pause()')
    check(e("(()=>{const root=[...entries.values()].find(n=>n.name==='Duplicated terminal branch'),ids=[...galaxyModel.subtreeIds(entries,root.id)];return ids.length===4&&ids.filter(id=>terminalLabelIds.has(id)).length===2})()"),'Duplicate structure refreshes terminal metadata for its independent branch')
    e('saveGalaxy()');cdp.call('Page.reload');wait_for('typeof physics!=="undefined"&&[...entries.values()].some(n=>n.name==="Duplicated terminal branch")')
    check(e("!terminalLabelIds.has('shallowPlanet')&&terminalLabelIds.has('terminalMoon')&&terminalLabelIds.has('terminalGalaxy')"),'restored persisted hierarchy reconstructs terminal metadata on load')
    check(not cdp.errors,'no terminal-label browser exceptions: '+q(cdp.errors))
