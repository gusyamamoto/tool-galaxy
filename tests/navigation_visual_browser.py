"""Navigation-only visual contract, with disposable dense Sample data and timings."""
import json
import time


def run_navigation_visual_checks(*, cdp, e, check, wait_for, shot, drag, wait_camera, mouse, baseline=False):
    frame='new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'
    e('loadSampleButton.click()')
    wait_for("document.readyState==='complete'&&typeof sampleMode!=='undefined'&&sampleMode&&typeof cameraViewReady!=='undefined'&&cameraViewReady");wait_for('physics.settled',timeout=30)
    e('physics.pause();closeInspector();hierarchySidebar.setCollapsed(false)');e(frame)
    sections=['universe','tasks','constellations']
    roots="['universe-section','tasks-section','constellations-section'].map(id=>document.getElementById(id))"
    check(e(f'{roots}.every(s=>!s.hidden)'), 'all three major sections remain visible, including empty Tasks')
    check(e("!document.querySelector('#time-section,#time-toggle')"),'no unfinished Time control is exposed')
    check(e("!document.querySelector('#hierarchy-sidebar canvas,#hierarchy-sidebar video')"),'sidebar adds no animated surface')
    # Native canvas interactions run identically against HEAD's isolated snapshot
    # and the new sidebar. No production rendering or simulation code is patched.
    planet='sample-planet-0-0'
    position=e(f'({{x:entries.get("{planet}").x,y:entries.get("{planet}").y,parent:entries.get("{planet}").parentId}})')
    e('physics.resume()')
    started=time.monotonic();drag(planet,position['x']+80,position['y']+30)
    drag_ms=(time.monotonic()-started)*1000
    check(e(f'physics.particles.get("{planet}").fx===null&&!layout.get("{planet}")?.pinned&&entries.get("{planet}").parentId==={json.dumps(position["parent"])}'),'native body drag keeps flowing physics and hierarchy')
    e('closeInspector();physics.pause()');wait_camera()
    before=e('camera.view.scale');started=time.monotonic()
    mouse('mouseWheel',900,400,deltaX=0,deltaY=-100);wait_camera()
    wheel_ms=(time.monotonic()-started)*1000
    check(e('camera.view.scale')>before,'native wheel zoom remains functional with sidebar visible')
    blank=e("(()=>{for(let y=100;y<innerHeight-60;y+=60)for(let x=hierarchySidebar.width+60;x<innerWidth-60;x+=60)if(document.elementFromPoint(x,y)?.id==='graph-viewport'&&!galaxyAtScreen({x,y}))return {x,y};return null;})()")
    check(blank is not None,'empty canvas remains reachable for movement')
    before=e('JSON.stringify(camera.view)');started=time.monotonic()
    mouse('mousePressed',**blank,button='left',clickCount=1)
    mouse('mouseMoved',blank['x']+24,blank['y']+18,button='left',buttons=1)
    mouse('mouseReleased',blank['x']+24,blank['y']+18,button='left',clickCount=1);wait_camera()
    pan_ms=(time.monotonic()-started)*1000
    check(e('JSON.stringify(camera.view)')!=before and e('pan===null'),'native canvas movement releases its gesture normally')
    e("document.getElementById('canvas-fit').click()");wait_camera()
    check(e('camera.view.scale>=camera.minScale&&camera.view.scale<=camera.maxScale'),'existing Fit command stays within the same camera bounds')
    print(('BASELINE' if baseline else 'AFTER')+' native interactions (includes focus/settle/CDP): '+json.dumps(dict(dragMs=round(drag_ms,1),wheelMs=round(wheel_ms,1),panMs=round(pan_ms,1))),flush=True)
    # Sample rows exercise the existing dense hierarchy, not a parallel nav model.
    timings=e("""(()=>{const times=[],saved=new Set(hierarchySidebar.expanded);
        for(let i=0;i<12;i++){const start=performance.now();hierarchySidebar.expanded=i%2?new Set():new Set(entries.keys());hierarchySidebar.render();hierarchySidebar.tree.offsetHeight;times.push(performance.now()-start);}
        hierarchySidebar.expanded=saved;hierarchySidebar.render();times.sort((a,b)=>a-b);
        return {bodies:entries.size,largeHierarchyMedianMs:times[6],largeHierarchyP95Ms:times[11]};})()""")
    print(('BASELINE' if baseline else 'AFTER')+' navigation: '+json.dumps(timings),flush=True)
    check(timings['bodies']>=250,'large hierarchy timing uses the dense Sample')
    check(timings['largeHierarchyP95Ms']<500,'large hierarchy stays within a broad responsiveness budget')
    if not baseline:
        check(e("(()=>{const icons=[...document.querySelectorAll('#hierarchy-sidebar .nav-section-icon,#hierarchy-sidebar .brand-mark,#utility-more svg')];return icons.length===5&&new Set(icons.map(s=>s.innerHTML)).size===5&&icons.every(s=>s.getAttribute('aria-hidden')==='true'&&s.viewBox.baseVal.width===24&&getComputedStyle(s).strokeWidth==='1.5px'&&s.getBoundingClientRect().width>=16);})()"),'all five original vector icons render as one lightweight stroke family')
        check(e("[...document.querySelectorAll('#hierarchy-sidebar .nav-section-icon,#hierarchy-sidebar .brand-mark,#utility-more svg')].every(s=>{const b=s.getBBox(),r=s.getBoundingClientRect(),size=s.classList.contains('nav-section-icon')?16:20;return b.x>=1&&b.y>=1&&b.x+b.width<=23&&b.y+b.height<=23&&r.width===size&&r.height===size;})"),'icon silhouettes leave stroke clearance and preserve the existing 16px/20px boxes')
    for width,height,touch in [(1440,1000,False),(1100,800,False),(820,1000,True),(390,844,True),(320,568,True),(740,360,True)]:
        label=f'{width}x{height}'
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=touch)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=touch,maxTouchPoints=5)
        e('hierarchySidebar.setWidth(260);hierarchySidebar.setCollapsed(false)');e(frame)
        mobile=e('hierarchySidebar.narrow')
        for name in sections:
            e(f"document.getElementById('{name}-toggle').click()")
            # Ensure it is open regardless of the saved initial state.
            if e(f"document.getElementById('{name}-toggle').ariaExpanded==='false'"):
                e(f"document.getElementById('{name}-toggle').click()")
            e(frame)
            if mobile:
                check(e(f"{roots}.filter(s=>!s.classList.contains('section-collapsed')).length===1&&document.getElementById('{name}-toggle').ariaExpanded==='true'"),label+': '+name+' participates in the exclusive accordion')
            else:
                check(e(f"document.getElementById('{name}-toggle').ariaExpanded==='true'"),label+': '+name+' independently expands')
            if not baseline:
                check(e(f"(()=>{{const section=document.getElementById('{name}-section'),header=section.querySelector('header'),icon=header.querySelector('.nav-section-icon'),s=getComputedStyle(header),expected=document.createElement('span');expected.style.backgroundColor=s.getPropertyValue('--nav-section-open');return !section.classList.contains('section-collapsed')&&s.backgroundColor===expected.style.backgroundColor&&s.boxShadow!=='none'&&parseFloat(s.borderRadius)>=6&&getComputedStyle(icon).transform==='none'&&getComputedStyle(document.getElementById('{name}-toggle')).color==='rgb(224, 236, 252)';}})()"),label+': '+name+' has an open container, brighter label and stable section icon')
                if mobile:
                    e(f"document.getElementById('{name}-toggle').click()");e(frame)
                    check(e(f"{roots}.every(s=>s.classList.contains('section-collapsed')&&s.querySelector('[aria-expanded]').ariaExpanded==='false')"),label+': tapping open '+name+' collapses it and permits zero open sections')
                    check(e(f"(()=>{{const section=document.getElementById('{name}-section'),s=getComputedStyle(section.querySelector('header')),expected=document.createElement('span');expected.style.backgroundColor=s.getPropertyValue('--nav-section');return s.backgroundColor===expected.style.backgroundColor&&getComputedStyle(section.querySelector('.nav-section-icon')).color==='rgb(134, 159, 189)';}})()"),label+': collapsed '+name+' has the quiet surface and muted icon')
        if mobile and not baseline:
            shot('navigation-all-closed-'+label)
            e("document.getElementById('universe-home').click()");e(frame)
            check(e("document.getElementById('universe-toggle').ariaExpanded==='true'"),label+': Universe label opens the same mobile disclosure')
            e("document.getElementById('universe-home').click()");e(frame)
            check(e(f"{roots}.every(s=>s.classList.contains('section-collapsed'))"),label+': Universe label also closes its open section')
        if not mobile:
            check(e(f"{roots}.every(s=>!s.classList.contains('section-collapsed'))"),label+': desktop/tablet sections coexist')
        if width==1440 and not baseline:
            e("document.getElementById('constellations-toggle').click()");e(frame)
            check(e("getComputedStyle(document.getElementById('constellations-toggle')).color==='rgb(148, 167, 192)'&&document.getElementById('constellations-section').classList.contains('section-collapsed')"),'desktop collapsed section is quieter than its open peers')
            shot('navigation-desktop-mixed')
            cdp.call('Input.dispatchMouseEvent',type='mouseMoved',x=1000,y=20);e(frame)
            quiet=e("getComputedStyle(document.querySelector('#constellations-section header')).boxShadow")
            point=e("(()=>{const r=document.getElementById('constellations-toggle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
            cdp.call('Input.dispatchMouseEvent',type='mouseMoved',**point);e(frame)
            check(e("getComputedStyle(document.querySelector('#constellations-section header')).boxShadow")!=quiet,'native hover gives a collapsed section a restrained border/halo response')
            cdp.call('Input.dispatchMouseEvent',type='mouseMoved',x=1000,y=20)
            e("document.getElementById('constellations-toggle').click()");e(frame)
        # Universe remains two controls: disclosure and the accepted overview action.
        e("document.getElementById('universe-toggle').click()")
        if e("document.getElementById('universe-toggle').ariaExpanded==='false'"):
            e("document.getElementById('universe-toggle').click()")
        e(frame)
        for name in sections:
            check(e(f"(()=>{{const header=document.getElementById('{name}-section').querySelector('header'),label=header.querySelector('h2'),r=header.getBoundingClientRect(),s=document.getElementById('hierarchy-sidebar').getBoundingClientRect();return r.width>0&&r.left>=s.left&&r.right<=s.right&&label.scrollWidth<=label.clientWidth;}})()"),label+': '+name+' header stays within the sidebar without clipping')
        check(e("(()=>{const row=document.querySelector('.hierarchy-row');return !!row&&getComputedStyle(row.querySelector('.tree-add')).display"+ ("==='none'" if mobile else "!=='none'")+"&&getComputedStyle(row.querySelector('.tree-more')).display!=='none';})()"),label+': row + / More retain the device action model')
        check(e("(()=>{const b=document.getElementById('add-entry-button');return b.getBoundingClientRect().width>0&&!b.disabled;})()"),label+': Universe + remains available')
        e("document.getElementById('utility-more').scrollIntoView({block:'nearest'})");e(frame)
        more=e("(()=>{const r=document.getElementById('utility-more').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight};})()")
        check(more['top']>=-1 and more['bottom']<=more['height']+1,label+': More remains reachable: '+str(more))
        cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Tab',code='Tab',windowsVirtualKeyCode=9)
        cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Tab',code='Tab',windowsVirtualKeyCode=9)
        e("document.getElementById('tasks-toggle').focus()");e(frame)
        check(e("document.activeElement.id==='tasks-toggle'&&getComputedStyle(document.activeElement).outlineStyle!=='none'"),label+': section keyboard focus has a visible outline')
        e("document.getElementById('hierarchy-sidebar').scrollTop=0;document.getElementById('sidebar-secondary-views').scrollTop=0;document.getElementById('tasks-toggle').blur()");e(frame)
        shot('navigation-'+label)
        perf=e("""(()=>{const samples=[];for(let i=0;i<12;i++){const start=performance.now();
            for(const section of mobileSidebarSections.sections){section.toggle.click();document.getElementById('sidebar-panes').offsetHeight;}
            hierarchySidebar.setCollapsed(true);document.getElementById('hierarchy-sidebar').offsetHeight;
            hierarchySidebar.setCollapsed(false);document.getElementById('hierarchy-sidebar').offsetHeight;samples.push(performance.now()-start);}
            samples.sort((a,b)=>a-b);return {switchAndDrawerMedianMs:samples[6],switchAndDrawerP95Ms:samples[11]};})()""")
        print(('BASELINE' if baseline else 'AFTER')+' '+label+': '+json.dumps(perf),flush=True)
        check(perf['switchAndDrawerP95Ms']<250,label+': repeated section/drawer changes remain responsive')
    if not baseline:
        cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'reduce'}])
        check(e("getComputedStyle(document.querySelector('.nav-section-icon')).animationName==='none'"),'decoration stays static with reduced motion')
    check(not cdp.errors,'no unhandled navigation exceptions')
