"""First-use product flow in a disposable browser profile, using real rendering/CRUD."""
import json


def run_first_use_checks(*, cdp, evaluate, check, wait_for, load, shot):
    e, q = evaluate, json.dumps
    def frame():e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    def viewport(width,height):
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=width<1000)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=width<1000,maxTouchPoints=5)
        frame()
    def reload():
        e('window.firstUseReload=true');cdp.call('Page.reload')
        wait_for("typeof firstUseReload==='undefined'&&document.readyState==='complete'&&typeof firstUse!=='undefined'")
        load();frame()
    def submit(name):
        e(f'fields[0].value={q(name)};form.requestSubmit();applicationCommandTail')
        wait_for('!formSaveBusy');wait_for('!dialog.open');frame()
        return e('selectedNode.dataset.entryId')
    e('localStorage.clear()');viewport(390,844);reload()
    check(e('entries.size===0&&nodes.size===0&&physics.particles.size===0&&!firstUse.root.hidden'), 'truly empty mobile Universe shows welcome without real bodies')
    check(e('!document.getElementById("first-use-cue")&&getComputedStyle(addEntryButton).visibility==="hidden"'), 'old Start here cue and competing empty sidebar + removed')
    check(e('firstUse.root.querySelector("h2").textContent==="Cosmifold"&&firstUse.root.textContent.includes("Organize anything")'), 'first screen identifies product and ordinary purpose')
    check(e('firstUse.preview.bodies.length===117&&firstUseScene.filter(e=>!e.parentId).length===30&&firstUseSceneIndex.get("onboarding-demo-japan").role==="sun"'), 'live example has thirty true Galaxy roots with an isolated deep Japan Trip system')
    check(e('firstUseScene.some(e=>e.role==="astronaut")&&firstUseSceneIndex.get("onboarding-demo-reservation").parentId==="onboarding-demo-hotel"&&firstUseSceneIndex.get("onboarding-demo-hotel").role==="satellite"'), 'example contains a full Sun to Astronaut branch')
    check(e('firstUse.preview.frame!==null'), 'camera starts on empty Universe')
    e('window.firstUseDiskBefore=JSON.stringify({...localStorage});window.firstUseNextId=nextEntryId')
    e('''window.previewPacing={draw:[],frames:[],last:null};
        window.previewOriginalDraw=firstUse.preview.draw;window.previewOriginalTick=firstUse.preview.tick;
        firstUse.preview.draw=function(...args){const start=performance.now();previewOriginalDraw.apply(this,args);previewPacing.draw.push(performance.now()-start);};
        firstUse.preview.tick=function(time){if(previewPacing.last!==null)previewPacing.frames.push(time-previewPacing.last);previewPacing.last=time;return previewOriginalTick.call(this,time);};''')
    # Watch one complete real-time loop, including return to the broad view.
    e('new Promise(r=>setTimeout(r,25300))')
    check(e('firstUse.preview.elapsed>24500'), 'scripted preview runs for a full 24.5-second loop')
    pacing=e('''(()=>{firstUse.preview.draw=previewOriginalDraw;firstUse.preview.tick=previewOriginalTick;
        const percentile=(values,p)=>values.toSorted((a,b)=>a-b)[Math.floor((values.length-1)*p)];
        return {drawP95:percentile(previewPacing.draw,.95),frameMedian:percentile(previewPacing.frames,.5),frameP95:percentile(previewPacing.frames,.95),samples:previewPacing.frames.length};})()''')
    check(pacing['samples']>300 and pacing['drawP95']<12 and pacing['frameP95']<=50.1,
          '390px live preview pacing stays responsive: '+q(pacing))
    check(e('JSON.stringify({...localStorage})===firstUseDiskBefore&&nextEntryId===firstUseNextId&&entries.size===0&&physics.particles.size===0'), 'full loop changes no storage, production IDs, model or physics')
    check(e('(async()=> (await persistence.files.readAll()).length===0)()'), 'preview creates no IndexedDB file records')
    check(e('hierarchySidebar.rows.size===0&&!document.getElementById("hierarchy-tree").textContent.includes("Japan Trip")'), 'demo content never enters real sidebar')
    e('searchField.value="Japan";searchField.dispatchEvent(new Event("input"))')
    check(e('searchResultList.children.length===0'), 'Search cannot discover demo items')
    e('searchField.value="";searchField.dispatchEvent(new Event("input"));searchField.blur()')
    check(e('cosmosTasks.lists(entries,taskStates).length===0&&constellations.size===0&&getGalaxySnapshot().entries.length===0'), 'Tasks, Constellations and canonical snapshot stay empty')
    check(e('(async()=>{const result=await cosmifoldBackup.create(universeRepository);const data=await result.blob.arrayBuffer(),magic=new TextEncoder().encode(cosmifoldBackup.magic).length,size=new DataView(data).getUint32(magic+4,true),manifest=JSON.parse(new TextDecoder().decode(new Uint8Array(data,magic+40,size)));return manifest.counts.entries===0&&manifest.attachments.length===0&&!JSON.stringify(manifest).includes("onboarding-demo-")})()'), 'actual exported Backup contains no demo content or files')
    # The real loop ran above. Freeze stage fixtures through the existing pause
    # callback so a late resize cannot overwrite a measured camera pose.
    e('window.previewStageObscured=firstUse.preview.obscured;firstUse.preview.obscured=()=>true;firstUse.preview.stop()')
    e('window.previewOutwardTime=scale=>{const p=firstUse.preview,compact=p.width<440||p.height<320;let a=10500,b=19750;for(let i=0;i<55;i++){const m=(a+b)/2;if(firstUseCamera(m,compact).scale>scale)a=m;else b=m;}return (a+b)/2}')
    e('window.previewBackgroundSignature=()=>JSON.stringify([...firstUse.preview.host.querySelectorAll(".universe-background,.universe-background *")].map(node=>{const s=getComputedStyle(node);return [node.outerHTML,s.opacity,s.boxShadow,s.backgroundImage,s.transform,s.filter,s.width,s.height]}))')
    for width,height in [(360,800),(390,844),(430,932),(1440,1000),(1024,768)]:
        viewport(width,height)
        e('firstUse.preview.stop();firstUse.preview.elapsed=0;firstUse.preview.draw(0)');frame()
        check(e('document.documentElement.scrollWidth===innerWidth&&firstUse.root.scrollWidth<=firstUse.root.clientWidth'),f'{width}: no horizontal overflow')
        check(e('(()=>{const r=document.getElementById("first-use-create").getBoundingClientRect(),p=document.getElementById("first-use-preview").getBoundingClientRect();return r.top>0&&r.bottom<=innerHeight&&r.height>=44&&p.width>=280&&p.height>=230})()'),f'{width}: CTA fits onscreen and preview remains meaningful')
        check(e('(()=>{const b=document.getElementById("first-use-create"),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()'),f'{width}: primary action is reachable')
        check(e('parseFloat(getComputedStyle(document.querySelector(".first-use-examples")).fontSize)>=13&&[...firstUse.root.querySelectorAll(".node-label")].filter(n=>getComputedStyle(n).visibility==="visible").length>=4'),f'{width}: readable copy and four clear wide-view labels')
        e('window.previewStarsBefore=previewBackgroundSignature();window.previewBackgroundNode=firstUse.preview.host.querySelector(".universe-background")')
        compact=e('firstUse.preview.width<440||firstUse.preview.height<320')
        stay_time=e('previewOutwardTime('+str(4.5 if compact else 5)+')')
        tokyo_time=e('previewOutwardTime('+str(1.9 if compact else 2.65)+')')
        japan_time=e('previewOutwardTime(.95)')
        macro_one=e('previewOutwardTime('+str(.105 if compact else .18)+')')
        macro_two=e('previewOutwardTime('+str(.06 if compact else .1)+')')
        e(f'window.previewMacroTimes=[{macro_one},{macro_two},19750]')
        stages=[('wide',0,['japan','tokyo','kyoto','osaka']),('tokyo',5000,['japan','tokyo','stay','tokyo-food','tokyo-places']),
                ('stay',7350,['stay','hotel','airbnb','tokyo']),('overlap',8500,['hotel','stay']),
                ('deep',9750,['hotel','reservation','check-in','stay']),('locked',10800,['hotel','reservation','check-in','stay']),
                ('return-stay',stay_time,['stay','hotel','airbnb']),
                ('return',tokyo_time,['tokyo','stay']),
                ('macro-reference',japan_time,['japan']),
                ('macro-neighbors',(macro_one+macro_two)/2,['travel']),
                ('universe',macro_one,['travel','home']),
                ('larger',macro_two,[]),
                ('dissolving',e('previewOutwardTime(.04)'),[]),('faint',e('previewOutwardTime(.025)'),[]),
                ('extreme',19750,[]),('turn-before',19500,[]),('turn-after',20000,[]),
                ('approach',24499,['japan','tokyo','kyoto','osaka'])]
        for stage,time,ids in stages:
            e(f'firstUse.preview.elapsed={time};firstUse.preview.draw({time})');frame()
            shot('first-use-'+stage+'-'+str(width))
            for id in ids:
                state=e(f'''(()=>{{const b=firstUse.preview.bodies.find(b=>b.entry.id==={q('onboarding-demo-'+id)}),r=b.node.getBoundingClientRect(),l=b.node.querySelector('.node-label'),lr=l.getBoundingClientRect(),p=firstUse.preview.host.getBoundingClientRect();return {{visible:getComputedStyle(l).visibility==='visible',opacity:parseFloat(getComputedStyle(l).opacity),body:r.left>=p.left&&r.right<=p.right&&r.top>=p.top,label:lr.bottom<=p.bottom,font:parseFloat(getComputedStyle(l).fontSize),rect:r.toJSON(),labelRect:lr.toJSON(),preview:p.toJSON()}}}})()''')
                check(state['visible'] and state['opacity']>.1 and state['body'] and state['label'] and state['font']>=12,f'{width}/{stage}: {id} body and native label visible in preview'+('' if all([state['visible'],state['body'],state['label']]) else ': '+q(state)))
        check(e('(()=>{const p=firstUse.preview,roots=t=>firstUseFrame(p.width,p.height,t).bodies.filter(b=>b.entry.depth===0&&!b.culled),counts=previewMacroTimes.map(t=>roots(t).length);window.scopeStageCounts=counts;return counts[0]>=6&&counts[0]<=10&&counts[1]>counts[0]&&counts[1]<=22&&counts[2]===30&&[0,5000,7350,9750,12550].every(t=>roots(t).length===0)&&roots(23000).length<30&&roots(24499).length===0})()'),f'{width}: spatial scope grows from six to more to thirty, then outer systems leave naturally')
        e(f'firstUse.preview.elapsed={macro_one};firstUse.preview.draw({macro_one})');frame()
        check(e('(()=>{const p=firstUse.preview,labels=p.bodies.filter(b=>getComputedStyle(b.node.querySelector(".node-label")).visibility==="visible"&&parseFloat(getComputedStyle(b.node.querySelector(".node-label")).opacity)>.1);return labels.length>=4&&labels.length<=6&&labels.every(b=>firstUsePrimaryGalaxyIds.has(b.entry.id))&&p.bodies.filter(b=>b.entry.depth===0&&!firstUsePrimaryGalaxyIds.has(b.entry.id)&&b.node.dataset.culled==="true").length>=20})()'),f'{width}: macro reference names remain primary while most outer roots stay outside')
        for time,maximum in [(macro_two,4),(19750,0)]:
            e(f'firstUse.preview.elapsed={time};firstUse.preview.draw({time})');frame()
            check(e(f'(()=>{{const p=firstUse.preview,labels=p.bodies.filter(b=>getComputedStyle(b.node.querySelector(".node-label")).visibility==="visible"&&parseFloat(getComputedStyle(b.node.querySelector(".node-label")).opacity)>.1),f=firstUseFrame(p.width,p.height,{time});return labels.length<={maximum}&&({maximum}===0?labels.length===0:labels.length>=1&&labels.some(b=>b.entry.id==="onboarding-demo-travel"))&&labels.every(b=>b.entry.depth===0&&parseFloat(getComputedStyle(b.node.querySelector(".node-label")).fontSize)>=12)&&f.bodies.filter(b=>b.entry.depth===0).every(b=>b.labelOpacity===cosmosView.labelDisclosure("galaxy",f.view.scale,b.entry.id,f.detail,false))}})()'),f'{width}/{time}: only important readable root names remain; semantic eligibility is unchanged')
        check(e('(()=>{const p=firstUse.preview,f=firstUseFrame(p.width,p.height,19750),visible=f.bodies.filter(b=>!b.culled&&!b.hidden),roots=visible.filter(b=>b.entry.depth===0),w=Math.max(...visible.map(b=>b.x+b.diameter/2))-Math.min(...visible.map(b=>b.x-b.diameter/2)),h=Math.max(...visible.map(b=>b.y+b.diameter/2))-Math.min(...visible.map(b=>b.y-b.diameter/2));return roots.length===30&&w<p.width*.85&&h<p.height*.78&&w*h/(p.width*p.height)<.5&&roots.every(b=>b.diameter===14&&b.opacity===1&&p.bodies.find(n=>n.entry.id===b.entry.id).node.querySelector(".galaxy-core")&&f.bodies.filter(child=>child.entry.parentId===b.entry.id&&child.entry.role==="sun").length>=1)})()'),f'{width}: ultra-wide is a bounded field of native Galaxy/Sun clusters in surrounding starfield')
        check(e('(()=>{const p=firstUse.preview,f=firstUseFrame(p.width,p.height,19750);return Object.values(f.cosmic).every(v=>v===0)&&p.host.querySelector(".first-use-orbits").style.opacity==="0"&&p.bodies.every(b=>parseFloat(b.node.style.opacity)===0&&getComputedStyle(b.node.querySelector(".node-label")).visibility==="hidden")&&getComputedStyle(p.host.querySelector(".universe-background")).opacity==="1"&&previewBackgroundSignature()===previewStarsBefore})()'),f'{width}: all demo artwork, labels and connectors vanish completely; starfield stays identical')
        check(e('(()=>{const p=firstUse.preview,compact=p.width<440||p.height<320,end=compact?.018108:.02012,out=previewOutwardTime(end);let a=19750,b=24500;for(let i=0;i<55;i++){const t=(a+b)/2;if(firstUseCamera(t,compact).scale<end)a=t;else b=t;}const enter=(a+b)/2;if(enter-out<500||enter-out>1000)return false;for(const t of [out+1,19350,19750,20000,enter-1]){p.elapsed=t;p.draw(t);if(p.bodies.some(b=>parseFloat(b.node.style.opacity)!==0)||p.host.querySelector("svg").style.opacity!=="0"||previewBackgroundSignature()!==previewStarsBefore||p.host.querySelector(".universe-background")!==previewBackgroundNode)return false;}return !firstUse.root.hidden&&getComputedStyle(p.host).opacity==="1"&&getComputedStyle(document.getElementById("first-use-create")).opacity==="1"})()'),f'{width}: 0.5?1 second of stars only preserves the same background, container and CTA')
        check(e('(()=>{const p=firstUse.preview,compact=p.width<440||p.height<320,end=compact?.018108:.02012;let last=0;for(const scale of [end,end+.00001,.025,.03,.04,.05,.065,.1]){let a=19750,b=24500;for(let i=0;i<55;i++){const t=(a+b)/2;if(firstUseCamera(t,compact).scale<scale)a=t;else b=t;}p.elapsed=(a+b)/2;p.draw(p.elapsed);const f=firstUseFrame(p.width,p.height,p.elapsed),node=p.bodies.find(b=>b.entry.id==="onboarding-demo-travel").node,opacity=parseFloat(node.style.opacity);if(opacity<last-1e-12||Math.abs(opacity-f.cosmic.bodyOpacity)>1e-6||Math.abs(parseFloat(p.host.querySelector("svg").style.opacity)-f.cosmic.connectorOpacity)>1e-6||previewBackgroundSignature()!==previewStarsBefore)return false;if(scale===.025&&!(opacity>0&&opacity<.2))return false;if(scale===.05&&f.cosmic.labelOpacity>1e-12)return false;if(scale===.065&&opacity!==1)return false;last=opacity;}return last===1})()'),f'{width}: systems emerge faintly from unchanged stars and regain full visibility before Japan')
        check(e('(()=>{const p=firstUse.preview,compact=p.width<440||p.height<320,anchor=firstUseCamera(9000,compact);let hotelX=null;for(const t of [9000,9250,9750,10250,10500,10650,10800]){p.elapsed=t;p.draw(t);const c=firstUseCamera(t,compact),hotel=p.bodies.find(b=>b.entry.id==="onboarding-demo-hotel").node.getBoundingClientRect(),x=hotel.x+hotel.width/2;if(c.x!==anchor.x||Math.abs(c.y-anchor.y)>.5)return false;if(hotelX===null)hotelX=x;if(Math.abs(x-hotelX)>.02)return false;for(const id of ["hotel","reservation","check-in"]){const b=p.bodies.find(b=>b.entry.id==="onboarding-demo-"+id),r=b.node.getBoundingClientRect(),l=b.node.querySelector(".node-label"),lr=l.getBoundingClientRect(),box=p.host.getBoundingClientRect();if(r.left<box.left||r.right>box.right||r.top<box.top||lr.bottom>box.bottom||getComputedStyle(l).visibility!=="visible"||parseFloat(getComputedStyle(l).opacity)<.99)return false;}if(p.relationships.filter(r=>["hotel","reservation","check-in"].some(id=>r.entry.id==="onboarding-demo-"+id)).some(r=>parseFloat(r.element.style.opacity)<.24))return false;}return firstUseCamera(8500,compact).scale<anchor.scale})()'),f'{width}: Hotel stays anchored through the deepest hold and retreat boundary; both Astronauts, labels and connectors remain framed')
        check(e('(()=>{const p=firstUse.preview,compact=p.width<440||p.height<320,start=firstUseCamera(10500,compact),locked=firstUseCamera(10800,compact);if(locked.scale/start.scale<=.99||firstUseCamera(10700,compact).x!==locked.x||locked.x!==start.x||Math.abs(locked.y-start.y-.5)>1e-10)return false;for(let t=10800;t<=19750;t+=50){const c=firstUseCamera(t,compact);if(c.x!==110||c.y!==-53)return false;}return true})()'),f'{width}: Hotel X stays locked while the existing half-unit Y adjustment settles, with zero later drift')
        check(e('(()=>{const p=firstUse.preview,compact=p.width<440||p.height<320,a=firstUseCamera(19750,compact),b=firstUseCamera(0,compact);let previous=a;for(let t=19750;t<24500;t+=50){const c=firstUseCamera(t,compact),cross=(c.x-a.x)*(b.y-a.y)-(c.y-a.y)*(b.x-a.x);if(Math.abs(cross)>1e-8||c.x>previous.x||c.y<previous.y||c.scale>b.scale)return false;previous=c;}return true})()'),f'{width}: loop approach is one straight trajectory ending at Japan, without entering Tokyo')
        check(e('(()=>{const p=firstUse.preview,compact=p.width<440||p.height<320,minimum=firstUseCamera(19750,compact),before=firstUseCamera(19749,compact),after=firstUseCamera(19751,compact);return before.scale>minimum.scale&&after.scale>minimum.scale&&[19500,20000].every(t=>{const s=firstUseCamera(t,compact).scale;return s>minimum.scale&&s/minimum.scale<1.01})&&JSON.stringify(firstUseFrame(p.width,p.height,24500))===JSON.stringify(firstUseFrame(p.width,p.height,0))})()'),f'{width}: brief near-still reversal has no held frame or loop reset')
        check(e('(()=>{const p=firstUse.preview,compact=p.width<440||p.height<320,scales=[compact?4.5:5,compact?2.2:2.65,.95,compact?.105:.18,compact?.06:.1];return scales.every(scale=>{const time=previewOutwardTime(scale);return firstUseCamera(time-1,compact).scale>firstUseCamera(time,compact).scale&&firstUseCamera(time,compact).scale>firstUseCamera(time+1,compact).scale})})()'),f'{width}: camera passes Stay, Tokyo, Japan and macro landmarks without stopping')
        check(e('(()=>{const p=firstUse.preview,compact=p.width<440||p.height<320,out=previewOutwardTime(.03);p.elapsed=out;p.draw(out);const node=p.bodies.find(b=>b.entry.id==="onboarding-demo-travel").node,opacity=parseFloat(node.style.opacity);let a=19750,b=24500;for(let i=0;i<55;i++){const t=(a+b)/2;if(firstUseCamera(t,compact).scale<.03)a=t;else b=t;}p.elapsed=(a+b)/2;p.draw(p.elapsed);return Math.abs(parseFloat(node.style.opacity)-opacity)<1e-10&&opacity>0&&opacity<1})()'),f'{width}: optical attenuation is identical at matching zoom on retreat and approach')
        check(e('firstUse.preview.host.dataset.simpleBodies==="true"&&firstUse.preview.bodies.filter(b=>b.entry.role==="sun"&&b.node.dataset.culled!=="true").every(b=>getComputedStyle(b.node).boxShadow==="none"&&getComputedStyle(b.node,"::before").display==="none")'),f'{width}: macro uses production inexpensive overview paint without changing hierarchy artwork')
        check(e('!firstUse.preview.host.querySelector(".first-use-bodies").style.transform&&!firstUse.preview.host.querySelector("svg").style.transform&&firstUse.preview.bodies.find(b=>b.entry.role==="satellite").node.querySelector(".satellite-craft")&&firstUse.preview.bodies.find(b=>b.entry.role==="astronaut").node.querySelector(".astronaut-figure")!==null'),f'{width}: native craft/astronaut artwork without whole-scene scaling')
        check(e('firstUse.preview.bodies.filter(b=>["satellite","astronaut"].includes(b.entry.role)).every(b=>getComputedStyle(b.node).backgroundImage==="none"&&getComputedStyle(b.node).borderTopWidth==="0px"&&getComputedStyle(b.node,"::before").content==="none"&&getComputedStyle(b.node,"::after").content==="none")'),f'{width}: native craft/people paint has no generic sphere underneath')
        e('firstUse.preview.elapsed=9500;firstUse.preview.draw(9500)');frame()
        check(e('firstUse.preview.bodies.filter(b=>b.entry.role==="astronaut").every(b=>parseFloat(b.node.style.width)>=13&&parseFloat(b.node.style.width)<=14)&&firstUseFrame(firstUse.preview.width,firstUse.preview.height,9500).bodies.find(b=>b.entry.id==="onboarding-demo-tokyo").diameter===32'),f'{width}: deepest figures reach inspection size while Planets remain capped')
        check(e('firstUse.preview.bodies.filter(b=>["onboarding-demo-japan","onboarding-demo-tokyo","onboarding-demo-kyoto","onboarding-demo-osaka"].includes(b.entry.id)).every(b=>parseFloat(getComputedStyle(b.node.querySelector(".node-label")).opacity)===0)'),f'{width}: distant ancestor/cousin labels yield at deepest level')
        check(e('(()=>{const get=id=>firstUse.preview.bodies.find(b=>b.entry.id==="onboarding-demo-"+id).node;return parseFloat(get("stay").style.opacity)>.45&&parseFloat(get("stay").style.opacity)<.55&&parseFloat(getComputedStyle(get("stay").querySelector(".node-label")).opacity)>.6&&get("hotel").style.opacity==="1"&&get("reservation").style.opacity==="1"&&get("check-in").style.opacity==="1"})()'),f'{width}: quiet immediate parent remains while Hotel family dominates')
        check(e('firstUse.preview.relationships.filter(r=>["hotel","reservation","check-in"].some(id=>r.entry.id==="onboarding-demo-"+id)).every(r=>parseFloat(r.element.style.opacity)>=.24)'),f'{width}: Stay-Hotel and Hotel-child relationships remain legible')
        check(e('(()=>{const f=firstUseFrame(firstUse.preview.width,firstUse.preview.height,9750),get=id=>f.bodies.find(b=>b.entry.id==="onboarding-demo-"+id);return get("hotel").priority<get("reservation").priority&&get("reservation").priority<get("stay").priority&&get("stay").priority<get("airbnb").priority})()'),f'{width}: labels prioritize focus, children, parent then siblings')
    e('firstUse.preview.obscured=previewStageObscured;firstUse.preview.update()')
    viewport(390,844)
    viewport(1440,1000);e('hierarchySidebar.setCollapsed(false)');frame()
    check(e('firstUse.root.getBoundingClientRect().left>=document.getElementById("hierarchy-sidebar").getBoundingClientRect().right&&document.getElementById("first-use-create").getBoundingClientRect().bottom<innerHeight'), 'desktop welcome respects expanded sidebar and leaves primary action visible')
    shot('first-use-desktop-navigation');viewport(390,844)
    # Real keyboard focus/activation, native Help close and return focus.
    e('document.getElementById("first-use-create").focus()')
    cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Tab',code='Tab',windowsVirtualKeyCode=9)
    cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Tab',code='Tab',windowsVirtualKeyCode=9)
    check(e('document.activeElement.id==="first-use-help"'), 'Tab goes from primary action to Help; decorative preview has no focus targets')
    cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Enter',code='Enter',windowsVirtualKeyCode=13,text='\r')
    cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Enter',code='Enter',windowsVirtualKeyCode=13)
    wait_for('document.getElementById("help-dialog").open');frame()
    check(e('firstUse.preview.frame===null&&!firstUse.root.hidden&&document.activeElement.id==="close-help-button"'), 'existing Help opens with native dialog focus and pauses preview')
    e('document.getElementById("close-help-button").click()');frame()
    check(e('!document.getElementById("help-dialog").open&&document.activeElement.id==="first-use-help"&&firstUse.preview.frame!==null'), 'Help closes to its welcome entry point and resumes same preview')
    cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'reduce'}]);frame()
    e('window.staticPreviewTransforms=firstUse.preview.bodies.map(b=>b.node.style.transform);window.staticPreviewElapsed=firstUse.preview.elapsed')
    e('new Promise(r=>setTimeout(r,200))')
    check(e('firstUse.preview.frame===null&&firstUse.preview.elapsed===staticPreviewElapsed&&JSON.stringify(staticPreviewTransforms)===JSON.stringify(firstUse.preview.bodies.map(b=>b.node.style.transform))'), 'reduced motion shows a stable populated frame with no camera work')
    for width,height in [(360,800),(390,844),(430,932)]:
        viewport(width,height)
        check(e('["japan","tokyo","stay","tokyo-food","tokyo-places"].every(id=>{const node=firstUse.preview.bodies.find(b=>b.entry.id==="onboarding-demo-"+id).node,l=node.querySelector(".node-label"),r=node.getBoundingClientRect(),lr=l.getBoundingClientRect(),p=firstUse.preview.host.getBoundingClientRect();return getComputedStyle(l).visibility==="visible"&&parseFloat(getComputedStyle(l).opacity)>.6&&r.top>=p.top&&r.left>=p.left&&r.right<=p.right&&lr.bottom<=p.bottom})'),f'{width}: reduced-motion frame fits Japan Trip, Tokyo and three child branches')
    viewport(390,844)
    shot('first-use-reduced-motion')
    cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'no-preference'}]);frame()
    e('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"))');frame()
    check(e('firstUse.preview.frame===null'), 'hidden tab cancels camera RAF')
    e('delete document.hidden;document.dispatchEvent(new Event("visibilitychange"))');frame()
    check(e('firstUse.preview.frame!==null'), 'visible tab resumes camera')
    e('window.dispatchEvent(new PageTransitionEvent("pagehide"))');frame()
    check(e('firstUse.preview.frame===null'), 'page lifecycle suspension stops preview')
    e('window.dispatchEvent(new PageTransitionEvent("pageshow"))');frame()
    check(e('firstUse.preview.frame!==null'), 'page lifecycle return resumes preview')
    e('hierarchySidebar.setCollapsed(false)');frame()
    check(e('firstUse.preview.frame===null&&getComputedStyle(firstUse.root).visibility==="hidden"'), 'mobile drawer obscures welcome and pauses camera')
    e('hierarchySidebar.setCollapsed(true)');frame()
    # Instrument all preview-owned subscriptions/RAFs across repeated real mounts.
    check(e('''(()=>{
        firstUse.preview.destroy();firstUse.preview=null;
        const names=['ResizeObserver','MutationObserver','IntersectionObserver'],originals={},active=new Set(),frames=new Set();let listenerBalance=0;
        const add=document.addEventListener,remove=document.removeEventListener,wa=window.addEventListener,wr=window.removeEventListener,raf=requestAnimationFrame,cancel=cancelAnimationFrame,media=window.matchMedia;
        for(const name of names){originals[name]=window[name];window[name]=class extends originals[name]{constructor(fn){super(fn);active.add(this);}disconnect(){super.disconnect();active.delete(this);}};}
        document.addEventListener=function(type,fn,...rest){listenerBalance++;return add.call(this,type,fn,...rest);};
        document.removeEventListener=function(type,fn,...rest){listenerBalance--;return remove.call(this,type,fn,...rest);};
        window.addEventListener=function(type,fn,...rest){listenerBalance++;return wa.call(this,type,fn,...rest);};
        window.removeEventListener=function(type,fn,...rest){listenerBalance--;return wr.call(this,type,fn,...rest);};
        window.matchMedia=function(query){const result=media(query),a=result.addEventListener.bind(result),r=result.removeEventListener.bind(result);result.addEventListener=(type,fn)=>{listenerBalance++;a(type,fn);};result.removeEventListener=(type,fn)=>{listenerBalance--;r(type,fn);};return result;};
        window.requestAnimationFrame=fn=>{const id=raf(time=>{frames.delete(id);fn(time);});frames.add(id);return id;};
        window.cancelAnimationFrame=id=>{frames.delete(id);cancel(id);};
        let clean=true;
        try{for(let i=0;i<20;i++){const p=new FirstUsePreview(document.getElementById('first-use-preview'));p.destroy();clean=clean&&p.destroyed&&p.frame===null&&p.bodies.length===0&&p.orbits.length===0&&p.relationships.length===0&&p.density.states.size===0&&p.density.frame===null&&p.density.timer===null&&active.size===0&&frames.size===0&&listenerBalance===0;}}
        finally{for(const name of names)window[name]=originals[name];document.addEventListener=add;document.removeEventListener=remove;window.addEventListener=wa;window.removeEventListener=wr;window.requestAnimationFrame=raf;window.cancelAnimationFrame=cancel;window.matchMedia=media;syncFirstUse();}
        return clean;
    })()'''), 'twenty mount/unmount cycles release every preview observer, listener, RAF and node')
    e('window.oldPreview=firstUse.preview;document.getElementById("first-use-create").click()');frame()
    check(e('dialog.open&&document.activeElement.id==="entry-name"&&firstUse.preview.frame===null'), 'primary CTA opens normal name form, focuses input and pauses preview')
    e('fields[0].value="";form.requestSubmit()');frame()
    check(e('dialog.open&&entries.size===0&&!firstUse.root.hidden&&firstUse.hint.hidden'), 'unsuccessful creation leaves welcome and hint state alone')
    root=submit('Travel')
    check(e('firstUse.root.hidden&&firstUse.preview===null&&oldPreview.destroyed&&oldPreview.frame===null&&document.getElementById("first-use-preview").childElementCount===0'), 'successful real creation completely removes example and preview work')
    check(e(f'entries.size===1&&selectedNode.dataset.entryId==={q(root)}&&document.activeElement===selectedNode'), 'new real Item is selected and focused through ordinary CRUD')
    check(e('!firstUse.hint.hidden&&firstUse.hint.textContent.includes("Now add something inside it with +")'), 'first temporary contextual hint points to normal +')
    shot('first-use-first-item')
    e('contentInspector.editNotes()');frame()
    check(e('getComputedStyle(firstUse.hint).visibility==="hidden"'), 'hint yields to Contents inline editing')
    e('document.getElementById("content-cancel-notes").click()');frame()
    e('document.getElementById("entry-add-button").click();document.getElementById("add-child-button").click()')
    child=submit('Japan')
    check(e(f'entries.get({q(child)}).parentId==={q(root)}&&selectedNode.dataset.entryId==={q(child)}'), 'first child uses normal Add item and normal selection')
    check(e('!firstUse.hint.hidden&&firstUse.hint.textContent.includes("That\'s a branch")&&!firstUse.hint.textContent.includes("Now add")&&persistence.preferences.load().firstUseHints.phase==="done"'), 'first child replaces child hint with final branch message and completes persisted hints')
    shot('first-use-first-branch')
    e('firstUse.hint.querySelector("button").click()')
    check(e('firstUse.hint.hidden&&firstUse.timer===null'), 'final hint is dismissible and clears its timer')
    e(f'createChildEntry({q(child)})');submit('Tokyo')
    check(e('firstUse.hint.hidden&&firstUse.root.hidden'), 'later creation never restarts hints or welcome')
    reload()
    check(e('entries.size===3&&firstUse.root.hidden&&firstUse.preview===null&&firstUse.hint.hidden'), 'non-empty existing profile remains ordinary after refresh')
    # Archived user content is real content too; use ordinary archive transaction.
    e(f'selectEntry(entries.get({q(root)}),nodes.get({q(root)}));requestGalaxyArchive({q(root)})')
    e('document.getElementById("archive-galaxy-form").requestSubmit();applicationCommandTail')
    wait_for('!archiveDialog.open');frame()
    check(e('entries.size===0&&archivedEntries.size===3&&firstUse.root.hidden'), 'archived user content prevents a false empty-Universe welcome')
    # An empty restored profile should welcome even with old/completed preferences.
    e('physics.pause();graphNeedsSave=false;localStorage.setItem("galaxy:user-data",JSON.stringify({version:5,entries:[],layout:[],connections:[],portals:[],constellations:[]}))')
    reload()
    check(e('entries.size===0&&archivedEntries.size===0&&!firstUse.root.hidden&&firstUse.hint.hidden'), 'empty restored/new profile welcomes independently of completed hint preference')
    check(not cdp.errors,'no first-use browser exceptions: '+q(cdp.errors))

