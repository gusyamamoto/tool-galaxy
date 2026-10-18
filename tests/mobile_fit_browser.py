"""Mobile family framing over disposable positions; never a live data/profile test."""
import json
import math


def fit_fixture():
    rows=[]
    def add(identity,parent,x,y,name=None):
        rows.append(dict(id=identity,parentId=parent,name=name or identity,description='',category='',x=x,y=y,seedLayout=False))
    add('g0',None,-800,-500,'Galaxy');add('s0','g0',0,0,'Whole system')
    for i in range(12):
        angle=i*math.tau/12;x=360*math.cos(angle);y=260*math.sin(angle)
        planet=f'p{i}';add(planet,'s0',x,y,'Planet '+str(i))
        for j in range(3):
            moon=f'{planet}m{j}';add(moon,planet,x+(j-1)*70,y+65,'Moon '+str(j))
            sat=moon+'s';add(sat,moon,x+(j-1)*70+20,y+90)
            child=sat
            for depth in range(2):
                other=child+'d';add(other,child,x+(j-1)*70+25+depth*8,y+105+depth*12);child=other
    add('s1','g0',1600,200,'Sparse system');add('one','s1',1720,220,'One Planet')
    add('single','g0',2100,200,'Sun alone')
    add('g1',None,50000,-30000,'Unrelated Galaxy');add('unrelated','g1',51000,-30000)
    return dict(version=5,entries=rows,layout=[],portals=[],constellations=[],archivedGalaxies=[])


def run_mobile_fit_checks(*,cdp,evaluate,check,wait_for,shot):
    e=evaluate;q=json.dumps;seed=fit_fixture();origin=e('location.origin')
    cdp.call('Page.navigate',url='about:blank');wait_for('document.readyState==="complete"')
    cdp.call('Page.navigate',url=origin+'/404.html');wait_for('document.readyState==="complete"')
    e('localStorage.setItem("galaxy:user-data",'+q(json.dumps(seed))+')')
    cdp.call('Page.navigate',url=origin+'/index.html')
    wait_for('document.readyState==="complete"&&typeof physics!=="undefined"&&entries.size==='+str(len(seed['entries'])))
    e('autoFitPending=false;camera.stopAnimation();physics.pause()')
    e('window.fitSeed='+q(seed['entries']))
    e("fitSeed.forEach(s=>{const a=entries.get(s.id),p=physics.particles.get(s.id);a.x=p.x=s.x;a.y=p.y=s.y;p.vx=p.vy=0});renderGraph();physics.pause()")
    e("window.fitFamily=[...galaxyModel.subtreeIds(entries,'s0')];window.fitWorld=()=>JSON.stringify({entries:[...entries].map(([id,p])=>[id,p.x,p.y,p.parentId,p.role]),particles:[...physics.particles].map(([id,p])=>[id,p.x,p.y,p.fx,p.fy,p.vx,p.vy]),layout:[...layout]})")

    def settle():
        wait_for('camera.frame===null');e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')

    def focus(identity,close=False):
        before=e('fitWorld()')
        e(f'focusEntry({q(identity)},{{openInspector:false,closeFocus:{str(close).lower()}}})');settle()
        check(e('fitWorld()')==before,'focus changes camera only: '+identity)

    def family_inside(identity,label):
        # Real DOM silhouettes, not just model centers or the framing helper.
        result=e("""(()=>{const ids=[...galaxyModel.subtreeIds(entries,"""+q(identity)+""")],v=usableCanvasBounds,g=galaxy.getBoundingClientRect(),bad=[];for(const id of ids){const n=nodes.get(id),p=entries.get(id),point=camera.worldToScreen(p.x,p.y),r=n.getBoundingClientRect();if(point.x<v.left-1||point.x>v.right+1||point.y<v.top-1||point.y>v.bottom+1||r.left-g.left<v.left-1||r.right-g.left>v.right+1||r.top-g.top<v.top-1||r.bottom-g.top>v.bottom+1)bad.push({id,point,rect:r.toJSON()});}const n=nodes.get("""+q(identity)+"""),l=n.querySelector('.node-label'),r=l.getBoundingClientRect();return {bad,view:camera.view,usable:v,labelInside:r.left-g.left>=v.left-1&&r.right-g.left<=v.right+1&&r.top-g.top>=v.top-1&&r.bottom-g.top<=v.bottom+1,sunVisible:n.dataset.semanticHidden==='false'};})()""")
        check(not result['bad'],'whole actual family fits visible canvas: '+label+' '+json.dumps(result))
        check(result['labelInside'] and result['sunVisible'],'selected system and name stay visible: '+label)
        return result

    for width,height in [(360,800),(390,844),(430,932),(740,360),(390,844)]:
        tag=f'{width}x{height}'
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=2,mobile=True)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=2)
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');settle()
        e('physics.pause();hierarchySidebar.setCollapsed(true);closeInspector();clearSelection();document.activeElement.blur();updateGraphViewport()');settle()
        check(e('usableCanvasBounds.bottom===cosmosVisibleViewport().height'),'no-overlay bounds use the current full visible viewport: '+tag)
        focus('s0')
        check(e("panel.hidden&&usableCanvasBounds.contentsState==='compact'&&Math.abs(usableCanvasBounds.bottom-document.getElementById('mobile-body-actions').getBoundingClientRect().top)<1"),'Compact card is excluded from explicit framing: '+tag)
        dense=family_inside('s0','dense Compact '+tag);shot('fit-system-compact-'+tag)
        e("openMobileContents();mobileContents.setPage('notes')");settle()
        e("new Promise(r=>Promise.all(panel.getAnimations().map(a=>a.finished.catch(()=>{}))).then(r))")
        focus('s0');family_inside('s0','dense Contents '+tag)
        check(e("!panel.hidden&&mobileContents.page==='notes'&&usableCanvasBounds.contentsState==='browse'&&Math.abs(usableCanvasBounds.bottom-panel.getBoundingClientRect().top)<1"),'Contents page/state preserved and canvas stops above sheet: '+tag)
        shot('fit-system-contents-'+tag)
        # Native body selection preserves Browse/page and does not introduce auto-fit.
        # Use the sparse family for an unambiguous native target; browser touch
        # adjustment among overlapping dense targets is separate from framing.
        focus('s1');family_inside('s1','sparse native navigation '+tag)
        p=e("({x:nodes.get('one').renderX,y:nodes.get('one').renderY,id:'one'})")
        before=e('JSON.stringify(camera.view)')
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[dict(x=p['x'],y=p['y'])]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
        check(e(f"contentInspector.entryId==={q(p['id'])}&&!panel.hidden&&mobileContents.page==='notes'") and e('JSON.stringify(camera.view)')==before,'native CB switch preserves Contents/page without implicit camera navigation: '+tag+' '+json.dumps(e("({id:contentInspector.entryId,page:mobileContents.page,view:camera.view})")))
        focus('one')
        check(e("(()=>{const p=camera.worldToScreen(entries.get('one').x,entries.get('one').y),b=usableCanvasBounds;return Math.abs(p.x-(b.left+b.right)/2)<.1&&Math.abs(p.y-(b.top+b.bottom)/2)<.1})()"),'explicit item focus centers in canvas above Contents: '+tag)
        for identity in ['s1','single']:
            focus(identity);family_inside(identity,'sparse '+identity+' '+tag)
            check(e('camera.view.scale===.82'),'small systems retain the existing .82 focus ceiling: '+tag)
        shot('fit-sparse-contents-'+tag)
        # The existing explicit mobile Sun gesture reaches whole-system framing.
        focus('s1')
        p=e("({x:nodes.get('s1').renderX,y:nodes.get('s1').renderY})")
        for _ in range(2):
            cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
        settle();family_inside('s1','native Sun double-tap '+tag)
        check(e("camera.view.scale===.82&&!panel.hidden&&mobileContents.page==='notes'"),'Sun double-tap frames family and preserves Contents/page: '+tag)
        # Distant, pinned/manual descendants remain legitimate family members.
        e("(()=>{window.fitOutlier=entries.get('p11m2sdd');window.fitSavedOutlier={x:fitOutlier.x,y:fitOutlier.y};fitOutlier.x=9000;fitOutlier.y=-3200;const p=physics.particles.get(fitOutlier.id);p.x=p.fx=fitOutlier.x;p.y=p.fy=fitOutlier.y;const placement=physics.influenceFor(p);p.placement=placement;layout.set(p.id,placement);renderGraph()})()")
        focus('s0');outlier=family_inside('s0','distant manual/pinned descendant '+tag)
        check(outlier['view']['scale']<dense['view']['scale'],'distant descendant widens framing rather than being normalized away: '+tag)
        e("(()=>{Object.assign(fitOutlier,fitSavedOutlier);const p=physics.particles.get(fitOutlier.id);Object.assign(p,fitSavedOutlier);p.fx=p.fy=null;p.placement=null;layout.delete(p.id);renderGraph()})()")
        # Every canonical parent must frame its family, not just Galaxy/Sun.
        e("(()=>{window.fitDeep=entries.get('p0m0sdd');window.fitDeepSaved={x:fitDeep.x,y:fitDeep.y};const p=physics.particles.get(fitDeep.id);fitDeep.x=p.x=p.fx=9000;fitDeep.y=p.y=p.fy=-3200;layout.set(p.id,physics.influenceFor(p));renderGraph()})()")
        for identity in ['p0','p0m0','p0m0s']:
            for close in [False,True]:
                focus(identity,close=close)
                family_inside(identity,'parent at depth '+str(e(f'entries.get({q(identity)}).depth'))+' explicit close='+str(close)+' '+tag)
                check(e("!panel.hidden&&mobileContents.page==='notes'"),'parent framing retains Contents/page: '+identity+' '+tag)
                if close:shot('fit-parent-'+identity+'-'+tag)
        e("(()=>{Object.assign(fitDeep,fitDeepSaved);const p=physics.particles.get(fitDeep.id);Object.assign(p,fitDeepSaved);p.fx=p.fy=null;layout.delete(p.id);renderGraph()})()")
        focus('s0');system_scale=e('camera.view.scale');before=e('fitWorld()')
        e('fitGalaxy(false)');settle()
        check(e('camera.view.scale')<system_scale*.2 and e('fitWorld()')==before,'Fit button remains whole-Universe, distinct from system focus: '+tag)
        # All legitimate Universe centers remain represented, even far unrelated roots.
        check(e("[...entries.values()].every(p=>{const s=camera.worldToScreen(p.x,p.y),b=usableCanvasBounds;return s.x>=b.left&&s.x<=b.right&&s.y>=b.top&&s.y<=b.bottom})"),'Universe Fit includes unrelated Galaxies in the current canvas: '+tag)
        e('hierarchySidebar.setCollapsed(false)');settle();before=e('JSON.stringify(camera.view)')
        usable=e('mobileFitViewport()');e('fitGalaxy(false)');settle()
        if usable is None:
            check(e('JSON.stringify(camera.view)')==before,'sidebar sliver defers Fit without extreme camera motion: '+tag)
        else:
            check(e('usableCanvasBounds.left>0&&camera.worldToScreen(0,0).x>=usableCanvasBounds.left'),'sidebar Fit uses the remaining canvas: '+tag)
        focus('s0');family_inside('s0','fresh bounds after sidebar navigation '+tag)
        check(e('hierarchySidebar.collapsed'),'existing mobile navigation still closes Menu View: '+tag)
        # Layout reads are limited to the explicit viewport snapshot, not the solver.
        check(e("(()=>{const original=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=()=>{throw Error('layout read in framing solver')};try{return !!mobileFamilyView(fitFamily,usableCanvasBounds,.82)}finally{Element.prototype.getBoundingClientRect=original}})()"),'family framing iterations perform no DOM geometry reads: '+tag)

    # Visual viewport/browser bars and safe insets, without resizing the layout viewport.
    e("window.fitViewportDescriptor=Object.getOwnPropertyDescriptor(window,'visualViewport');Object.defineProperty(window,'visualViewport',{configurable:true,value:{width:390,height:680,offsetTop:12,offsetLeft:0}});galaxy.style.setProperty('--canvas-safe-left','24px');galaxy.style.setProperty('--canvas-safe-right','24px');galaxy.style.setProperty('--canvas-safe-top','20px');galaxy.style.setProperty('--canvas-safe-bottom','18px');mobileViewportChanged();openMobileContents()")
    e("new Promise(r=>Promise.all(panel.getAnimations().map(a=>a.finished.catch(()=>{}))).then(r))")
    focus('s0');family_inside('s0','changed browser height and synthetic safe insets')
    check(e('usableCanvasBounds.left===24&&usableCanvasBounds.right===366&&usableCanvasBounds.top===32'),'Fit honors safe/visible viewport insets from shared geometry')
    shot('fit-browser-bars-safe-area')
    e("Object.defineProperty(window,'visualViewport',fitViewportDescriptor);['left','right','top','bottom'].forEach(edge=>galaxy.style.removeProperty('--canvas-safe-'+edge));mobileViewportChanged()")
    focus('s0');family_inside('s0','restored browser height')
    # Desktop follows its original normalized/symmetric camera path.
    cdp.call('Emulation.setTouchEmulationEnabled',enabled=False,maxTouchPoints=1)
    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
    e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');settle()
    e("window.fitNativePath=mobileFamilyView;mobileFamilyView=()=>{throw Error('mobile framing used on desktop')}")
    focus('s0');e('fitGalaxy(false)');settle()
    check(e("!hierarchySidebar.narrow&&usableCanvasBounds.contentsState==='desktop'"),'desktop system focus and Universe Fit retain their original paths')
    e('mobileFamilyView=fitNativePath')
    shot('fit-desktop')
    # Exercise the actual temporary Sample hierarchy as well as controlled rows.
    cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=2,mobile=True)
    e('loadSampleButton.click()')
    wait_for("typeof sampleMode!=='undefined'&&sampleMode&&entries.size===282")
    e("physics.pause();physics.simulation.tick(350);physics.onTick(physics.particles);physics.pause();camera.stopAnimation();autoFitPending=false;hierarchySidebar.setCollapsed(true);closeInspector();window.fitWorld=()=>JSON.stringify({entries:[...entries].map(([id,p])=>[id,p.x,p.y,p.parentId,p.role]),particles:[...physics.particles].map(([id,p])=>[id,p.x,p.y,p.fx,p.fy,p.vx,p.vy]),layout:[...layout]})")
    identity=e("[...entries.values()].filter(p=>p.depth===1).sort((a,b)=>galaxyModel.subtreeIds(entries,b.id).size-galaxyModel.subtreeIds(entries,a.id).size)[0].id")
    focus(identity);family_inside(identity,'actual dense Sample Compact');shot('fit-sample-compact')
    e("openMobileContents();mobileContents.setPage('files')")
    e("new Promise(r=>Promise.all(panel.getAnimations().map(a=>a.finished.catch(()=>{}))).then(r))")
    focus(identity);family_inside(identity,'actual dense Sample Contents');shot('fit-sample-contents')
    stable=e('JSON.stringify(camera.view)')
    e('new Promise(r=>setTimeout(r,250))')
    check(e('JSON.stringify(camera.view)')==stable and e('camera.frame===null'),'settled focus does not start an automatic refit loop')
    check(not cdp.errors,f'no mobile framing browser exceptions: {cdp.errors}')
