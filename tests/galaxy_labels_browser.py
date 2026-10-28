"""Galaxy headings and Sun-name ownership in a disposable local scene."""
import json


def run_galaxy_label_checks(*,cdp,e,check,wait_for,shot):
    q=json.dumps
    origin=e('location.origin')
    cdp.call('Page.navigate',url=origin+'/404.html')
    wait_for('location.pathname==="/404.html"&&document.readyState==="complete"&&typeof physics==="undefined"')
    scene=[('travel',None,'Travel',0,0),('mexico','travel','Mexico',-200,-140),
           ('philippines','travel','Philippines',200,100),('planet','philippines','Manila',500,-600),
           ('other',None,'Other Galaxy',20000,20000),('other-sun','other','Unrelated Sun',20000,20000),
           ('empty',None,'Empty Galaxy',20000,20000)]
    raw=q(dict(version=5,entries=[dict(id=id,parentId=parent,name=name,x=x,y=y,description='',category='')
                                for id,parent,name,x,y in scene],layout=[],portals=[],constellations=[],archivedGalaxies=[]))
    e('localStorage.setItem("galaxy:user-data",'+q(raw)+')')
    cdp.call('Page.navigate',url=origin+'/index.html')
    wait_for('typeof physics!=="undefined"&&entries.size===7&&physics.particles.size===7')
    e('autoFitPending=false;physics.pause();camera.stopAnimation();hierarchySidebar.setCollapsed(true);closeInspector();clearSelection();document.activeElement.blur()')
    for id,parent,name,x,y in scene:
        e(f'Object.assign(entries.get({q(id)}),{{x:{x},y:{y}}});Object.assign(physics.particles.get({q(id)}),{{x:{x},y:{y}}});void 0')
    e('graphNeedsSave=false;window.labelPositions=JSON.stringify([...entries].map(([id,n])=>[id,n.x,n.y,n.parentId]));window.labelSaved=localStorage.getItem("galaxy:user-data")')

    def settle():
        wait_for('labelDensity.frame===null&&labelDensity.timer===null&&labelDensity.trailingTimer===null')

    def frame(scale=.3):
        e(f'camera.minScale=.02;camera.maxScale=12;camera.setView({{x:innerWidth/2,y:Math.max(innerHeight*.43,Math.min(250,innerHeight*.64)),scale:{scale}}},false);renderGraph();requestLabelLayout(true)')
        settle()

    def geometry():
        return e("""(()=>{const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
            return {title:rect(nodes.get('travel').querySelector('.node-label')),suns:['mexico','philippines'].map(id=>({id,body:rect(nodes.get(id)),name:rect(nodes.get(id).querySelector('.node-label'))})),
                hidden:nodes.get('travel').querySelector('.node-label').dataset.densityHidden,bounds:{...physics.bounds}}})()""")

    def above_group(g):
        title=g['title'];suns=g['suns']
        return title['bottom']<=min(s['body']['top'] for s in suns)-11 and g['hidden']=='false'

    for width,height in [(320,568),(390,844),(430,932),(740,390),(1280,800),(1440,900)]:
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=width<1000)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=width<1000,maxTouchPoints=2)
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        e('clearSelection();document.activeElement.blur();focusRevealIds.clear();hoveredEntryId=null;searchFocusId=null')
        for scale in [.08,.24,.3,.4,.6,1.15]:
            frame(scale)
            g=geometry();tag=f'{width}x{height}/{scale}'
            eligible=e("nodes.get('travel').labelOpacity>0")
            check(above_group(g) if eligible else g['hidden']=='true','Galaxy heading clears child Suns when its semantic layer is visible: '+tag+' '+q(g))
            title=g['title']
            check(not eligible or title['left']>=g['bounds']['left']+7 and title['right']<=g['bounds']['right']-7,'visible Galaxy heading fits usable viewport: '+tag)
            check(e("['travel','mexico','philippines'].every(id=>{const n=nodes.get(id);return n.labelOpacity===cosmosView.labelDisclosure(entries.get(id).role,camera.view.scale,id,semanticDetail,terminalLabelIds.has(id))})"),'semantic opacity remains canonical at every layer: '+tag)
            check(all(abs((s['name']['left']+s['name']['right'])/2-(s['body']['left']+s['body']['right'])/2)<.5 and s['name']['top']>=s['body']['bottom']+3 for s in g['suns']),'Sun names remain attached below their own Suns: '+tag)
        frame(.3);before=geometry()
        shot(f'galaxy-heading-{width}')
        e("Object.assign(entries.get('philippines'),{x:200.5,y:100.5});renderGraph();requestLabelLayout(true)")
        settle();after=geometry()
        check(abs(after['title']['left']-before['title']['left'])<=1 and abs(after['title']['top']-before['title']['top'])<=1,'small body drift cannot flip or jump the group heading: '+str(width))
        e("Object.assign(entries.get('philippines'),{x:200,y:100});renderGraph();requestLabelLayout(true)");settle()
        e("entries.get('mexico').x=(physics.bounds.left-nodes.get('mexico').renderDiameter/2+.5-camera.view.x)/camera.view.scale;renderGraph();requestLabelLayout(true)");settle()
        edge=geometry()['title'];edge_positions=[]
        for delta in [-1,1,-1,1]:
            e(f"entries.get('mexico').x+={delta}/camera.view.scale;renderGraph();requestLabelLayout(true)");settle()
            edge_positions.append(geometry()['title']['left'])
        check(all(abs(x-edge['left'])<=1 for x in edge_positions),'subpixel drift across the viewport edge cannot alternate the group heading: '+str(width)+' '+q(edge_positions))
        e("Object.assign(entries.get('mexico'),{x:-200,y:-140});renderGraph();requestLabelLayout(true)");settle()
        for mode,activate,clear in [('selected',"selectedNode=nodes.get('travel')",'selectedNode=null'),
                                   ('search',"searchFocusId='travel'",'searchFocusId=null'),
                                   ('revealed',"focusRevealIds.add('travel')",'focusRevealIds.clear()')]:
            frame(.6);e(activate+';renderGraph();requestLabelLayout(true)');settle()
            check(above_group(geometry()) and e("nodes.get('travel').labelOpacity===1"),mode+' Galaxy uses the same group heading without changing reveal: '+str(width))
            e(clear+';renderGraph();requestLabelLayout(true)');settle()
        # Unrelated Galaxies, deep descendants and offscreen Suns must not drag
        # this heading. The existing root anchor is retained with no visible Suns.
        frame(.3);before=geometry()
        e("Object.assign(entries.get('planet'),{x:-10000,y:-10000});Object.assign(entries.get('other-sun'),{x:5000,y:-5000});renderGraph();requestLabelLayout(true)");settle()
        check(geometry()['title']==before['title'],'other families and deeper descendants cannot move the Travel heading: '+str(width))
        e("Object.assign(entries.get('planet'),{x:500,y:-600});Object.assign(entries.get('other-sun'),{x:20000,y:20000});Object.assign(entries.get('mexico'),{x:-20000,y:-20000});renderGraph();requestLabelLayout(true)");settle()
        check(e("(()=>{const a=nodes.get('travel').querySelector('.node-label').getBoundingClientRect(),s=nodes.get('philippines');return Math.abs(a.left+a.width/2-s.renderX)<.5&&a.bottom<s.renderY-s.renderDiameter/2})()"),'only the remaining visible Sun determines its group heading: '+str(width))
        e("Object.assign(entries.get('philippines'),{x:20000,y:20000});renderGraph();requestLabelLayout(true)");settle()
        check(e("(()=>{const n=nodes.get('travel'),r=n.querySelector('.node-label').getBoundingClientRect();return Math.abs(r.left+r.width/2-n.renderX)<.5&&Math.abs(r.top-n.renderY-n.renderDiameter/2-4)<.5})()"),'no visible Suns restores the original root-label anchor: '+str(width))
        e("Object.assign(entries.get('mexico'),{x:-200,y:-140});Object.assign(entries.get('philippines'),{x:200,y:100})")
        frame(.3)
        check(e('JSON.stringify([...entries].map(([id,n])=>[id,n.x,n.y,n.parentId]))===labelPositions&&localStorage.getItem("galaxy:user-data")===labelSaved'),'label positioning preserves hierarchy, world positions and stored data: '+str(width))
    check(not cdp.errors,'no Galaxy label browser exceptions: '+q(cdp.errors))
