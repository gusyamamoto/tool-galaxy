"""Pass-local viewport reads and unchanged projection in an isolated browser."""
import json


def run_render_viewport_checks(*, cdp, evaluate, check, wait_for, add, shot):
    q=json.dumps
    root=add('Viewport checks');sun=add('System',root)
    first=add('First',sun);second=add('Second',sun);add('Moon',first)
    add('Another Galaxy')
    wait_for('physics.settled')
    evaluate('physics.pause();camera.stopAnimation();autoFitPending=false;graphNeedsSave=false')
    evaluate("""window.sampleRenderReads=(run,changing=false)=>{
        const descriptors=['innerWidth','innerHeight'].map(key=>[key,Object.getOwnPropertyDescriptor(window,key)]);
        const actual={innerWidth,innerHeight},reads={innerWidth:0,innerHeight:0},values={},late=[];
        const observer=new MutationObserver(()=>{});
        observer.observe(document.documentElement,{attributes:true,childList:true,subtree:true,characterData:true});
        try{
            descriptors.forEach(([key,descriptor])=>Object.defineProperty(window,key,{configurable:true,get(){
                reads[key]++;if(observer.takeRecords().length)late.push(key);
                const value=changing?(reads[key]===1?(key==='innerWidth'?350:500):10000):descriptor.get.call(window);
                values[key]=value;return value;
            }}));
            run();return {reads,values,actual,late};
        }finally{observer.disconnect();descriptors.forEach(([key,descriptor])=>Object.defineProperty(window,key,descriptor));}
    };""")

    def sample(code,label):
        result=evaluate('sampleRenderReads(()=>{'+code+'})')
        check(result['reads']=={'innerWidth':1,'innerHeight':1},label+' samples each dimension exactly once')
        check(not result['late'],label+' samples before DOM/style writes')
        check(result['values']==result['actual'],label+' uses fresh layout-viewport dimensions')
        return result

    evaluate('camera.setView({x:0,y:0,scale:.25},false)')
    sample('renderGraph()','whole graph with real Galaxy roots')
    sample(f'renderNode(entries.get({q(first)}),nodes.get({q(first)}))','standalone body pass')
    sample('physics.onTick(physics.particles)','simulation tick including settling class')
    sample('graphNeedsSave=false;physics.onSettle()','settlement pass')
    sample('updateHierarchyEmphasis()','selection emphasis pass')
    sample("searchField.value='First';refreshSearchResults()",'search-highlight pass')
    sample('camera.onChange({...camera.view})','camera update before inherited zoom writes')

    # A getter that changes after its first read detects resampling in either loop.
    evaluate(f"camera.setView({{x:0,y:0,scale:1}},false);for(const id of {q([first,second])}){{Object.assign(entries.get(id),{{x:600,y:200}});Object.assign(physics.particles.get(id),{{x:600,y:200}})}};void 0")
    result=evaluate('sampleRenderReads(()=>renderGraph(),true)')
    check(result['reads']=={'innerWidth':1,'innerHeight':1} and not result['late'],'all body/region loops share one snapshot even if later reads would change')
    check(evaluate(f"{q([first,second])}.every(id=>nodes.get(id).dataset.culled==='true')"),'both bodies use the first snapshot rather than different per-body dimensions')
    sample('renderGraph()','following render after a different viewport sample')
    check(evaluate(f"{q([first,second])}.every(id=>nodes.get(id).dataset.culled==='false')"),'a later pass does not retain the earlier small viewport')

    for width,height in [(360,800),(390,844),(430,932),(740,360),(390,844),(1440,1000)]:
        mobile=width<1000;tag=f'{width}x{height}'
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=2,mobile=mobile)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=mobile,maxTouchPoints=2)
        evaluate('window.dispatchEvent(new Event("resize"));new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        wait_for('camera.frame===null')
        evaluate('physics.pause();hierarchySidebar.setCollapsed(true);closeInspector()')
        wait_for('camera.frame===null')
        result=sample('renderGraph()','resized/oriented '+tag)
        check(result['values']=={'innerWidth':width,'innerHeight':height},'resize/orientation dimensions match '+tag)
        positions=evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.x,e.y,e.parentId,e.role]))')
        for scale in [.25,.50,.65,.82,1.15,2.4]:
            evaluate(f'camera.setView({{x:40,y:70,scale:{scale}}},false)')
            check(evaluate("(()=>{const view=camera.view;return galaxy.dataset.detailLevel===cosmosView.detail(view.scale).tier&&graphWorld.style.transform===`translate(${view.x}px, ${view.y}px) scale(${view.scale})`&&[...nodes].every(([id,node])=>{const entry=entries.get(id);if(entry.depth===0)return true;const p=camera.worldToScreen(entry.x,entry.y),margin=Math.max(100,node.renderDiameter+64),x=Math.round(p.x*4)/4,y=Math.round(p.y*4)/4;const culled=x+margin<0||y+margin<0||x-margin>innerWidth||y-margin>innerHeight;return node.dataset.culled===String(culled)&&(node.dataset.renderSkipped==='true'?culled&&getComputedStyle(node).display==='none':node.renderX===x&&node.renderY===y)})})()"),'projection, existing visibility bounds and semantic tier remain correct at '+str(scale)+': '+tag)
        check(evaluate('JSON.stringify([...entries].map(([id,e])=>[id,e.x,e.y,e.parentId,e.role]))')==positions,'zoom/rendering leaves world positions and hierarchy unchanged: '+tag)
        hierarchy_before=evaluate('JSON.stringify([...layout])')
        evaluate('hierarchySidebar.setCollapsed(false)');wait_for('camera.frame===null')
        sample('renderGraph()','sidebar open '+tag)
        evaluate('hierarchySidebar.setCollapsed(true)');wait_for('camera.frame===null')
        sample('renderGraph()','sidebar closed '+tag)
        evaluate(f'selectEntry(entries.get({q(first)}),nodes.get({q(first)}),{{reframe:false,openInspector:false}});setInspectorOpen(true)')
        evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        wait_for('camera.frame===null')
        check(evaluate('!panel.hidden'),'Contents opens normally: '+tag)
        sample('renderGraph()','Contents open '+tag)
        shot('viewport-contents-'+tag)
        evaluate('closeInspector()');wait_for('camera.frame===null')
        sample('renderGraph()','Contents closed '+tag)
        check(evaluate('JSON.stringify([...layout])')==hierarchy_before,'UI transitions preserve manual placement: '+tag)
        if mobile and height>500:
            evaluate(f"window.renderViewportDescriptor=Object.getOwnPropertyDescriptor(window,'visualViewport');Object.defineProperty(window,'visualViewport',{{configurable:true,value:{{width:{width},height:{height}*.6,offsetTop:20,offsetLeft:0}}}});mobileViewportChanged()")
            sample('renderGraph()','browser-bar/keyboard visual viewport '+tag)
            check(evaluate(f"Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--mobile-visible-height'))-{height}*.6)<.01"),'usable viewport updates independently of unchanged layout viewport: '+tag)
            result=evaluate('sampleRenderReads(()=>syncMobileViewport())')
            check(result['reads']['innerHeight']==1 and not result['late'],'mobile viewport sync samples layout height before CSS writes: '+tag)
            evaluate("Object.defineProperty(window,'visualViewport',renderViewportDescriptor);delete window.renderViewportDescriptor;mobileViewportChanged()")
    check(not cdp.errors,f'no viewport-render browser exceptions: {cdp.errors}')
