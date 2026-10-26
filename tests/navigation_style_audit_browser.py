"""Effective styles in one frozen scene: baseline, original Phase 1 and refinement."""
import json


def run_navigation_style_audit(*,cdp,e,check,wait_for,baseline_css,phase1_css,current_css):
    q=json.dumps
    e('loadSampleButton.click()')
    wait_for("document.readyState==='complete'&&typeof sampleMode!=='undefined'&&sampleMode&&typeof cameraViewReady!=='undefined'&&cameraViewReady")
    wait_for('physics.settled',timeout=30)
    cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'reduce'}])
    e('physics.pause();camera.stopAnimation();closeInspector()')
    e("""window.navAuditSheet=document.createElement('style');document.head.append(navAuditSheet);
        window.navAuditLink=document.querySelector('link[rel=stylesheet]');navAuditLink.disabled=true;
        window.navAuditSources={};
        window.navAuditCapture=css=>{navAuditSheet.textContent=css;
            const properties=['color','background-color','background-image','box-shadow','text-shadow','filter','backdrop-filter',
                'opacity','mix-blend-mode','fill','stroke','stroke-width','fill-opacity','stroke-opacity','visibility','display',
                'width','height','transform','font-size','font-weight','letter-spacing','content','border-color','outline-color','outline-style','outline-width'];
            const elements=[...document.querySelectorAll('.entry-node,.entry-node *,#hierarchy-paths,#hierarchy-paths *,#constellation-overlay,#constellation-overlay *,#motion-overlay,#motion-overlay *,#regions-layer,#regions-layer *,#graph-world,#nodes-layer,#graph-viewport,#galaxy,.universe-background,.universe-background *')];
            const rows=elements.flatMap((node,index)=>[null,'::before','::after'].map(pseudo=>{
                const style=getComputedStyle(node,pseudo);return {index,pseudo,tag:node.tagName,values:properties.map(p=>style.getPropertyValue(p))};}));
            return {rows,elements:elements.length,properties,sidebar:getComputedStyle(document.getElementById('hierarchy-sidebar')).backgroundImage};};
        window.navAuditCompare=(a,b)=>{const differences=[];if(a.rows.length!==b.rows.length)return ['Different element count'];
            for(let i=0;i<a.rows.length;i++)for(let j=0;j<a.properties.length;j++)if(a.rows[i].values[j]!==b.rows[i].values[j]){
                if(differences.length<10)differences.push({index:a.rows[i].index,tag:a.rows[i].tag,pseudo:a.rows[i].pseudo,property:a.properties[j],before:a.rows[i].values[j],after:b.rows[i].values[j]});}
            return differences;};""")
    try:
        def source(name,css):
            # Keep each message below the existing CDP helper's 16-bit frame
            # limit, and retain the large snapshot inside the test page.
            e("window.navAuditInput=''")
            for offset in range(0,len(css),12000):
                e(f'navAuditInput+={q(css[offset:offset+12000])};void 0')
            e(f'navAuditSources.{name}=navAuditInput;void 0')
        source('baseline',baseline_css);source('phase1',phase1_css);source('current',current_css)
        for scale,selected in [(.1,None),(.65,'sample-sun-0'),(1.1,'sample-planet-0-0'),(2.2,'sample-deep-7')]:
            if selected:e(f"selectEntry(entries.get({q(selected)}),nodes.get({q(selected)}),{{reframe:false,openInspector:false}})")
            e(f'physics.pause();camera.stopAnimation();camera.setView({{x:40,y:70,scale:{scale}}},false)')
            e("""(()=>{for(const animation of document.getAnimations())animation.pause();
                window.navAuditBase=navAuditCapture(navAuditSources.baseline);
                window.navAuditPhase1=navAuditCapture(navAuditSources.phase1);
                window.navAuditCurrent=navAuditCapture(navAuditSources.current);})()""")
            for label,value in [('original Phase 1','navAuditPhase1'),('refinement','navAuditCurrent')]:
                differences=e(f'navAuditCompare(navAuditBase,{value})')
                check(not differences,f'{scale}: {label} changes no effective body, label, pseudo-element, world or SVG visual style: {differences}')
            check(e('navAuditBase.elements>282&&navAuditBase.sidebar!==navAuditCurrent.sidebar'),f'{scale}: audit includes descendants and confirms sidebar backgrounds actually differ')
        metrics=e('({elements:navAuditBase.elements,properties:navAuditBase.properties.length,pseudos:3})')
        print('Frozen visual-style audit coverage: '+json.dumps(metrics),flush=True)
    finally:
        e('navAuditLink.disabled=false;navAuditSheet.remove()')
    check(not cdp.errors,'no celestial-style audit browser exceptions')
