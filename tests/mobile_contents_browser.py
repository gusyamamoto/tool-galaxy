"""Native touch delivery to the existing card/panel in an isolated local profile."""
import json
import time


def run_contents_swipe_checks(*, cdp, evaluate, check, wait_for, add, shot):
    root=add('Work');parent=add('GitHub',root);owner=add('Selected body',parent)
    wait_for('physics.settled');evaluate('physics.pause()')

    def position(selector, fy=.5):
        evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        return evaluate(f"(()=>{{const r=document.querySelector({json.dumps(selector)}).getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height*{fy}}};}})()")

    def tap(selector):
        p=position(selector)
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
        cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])

    def swipe(p, dy, dx=0, cancel=False):
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
        # Small initial moves exercise direction ownership before Chrome scrolls.
        for fraction in (.12,.3,.6,1):
            cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[{'x':p['x']+dx*fraction,'y':p['y']+dy*fraction}])
            time.sleep(.025)
        cdp.call('Input.dispatchTouchEvent',type='touchCancel' if cancel else 'touchEnd',touchPoints=[])

    def settled():
        wait_for("panel.getAnimations().every(a=>a.playState==='finished')")

    def closed():
        wait_for('panel.hidden');check(evaluate(f"selectedNode.dataset.entryId==={json.dumps(owner)}&&document.getElementById('mobile-body-actions').getClientRects().length>0"),'collapse retains the same selected body and compact card')

    def open_card():
        evaluate('closeInspector();closeContentMenus()')
        swipe(position('#mobile-body-contents'),-95)
        wait_for('!panel.hidden');settled()

    for width,height in [(360,800),(390,844),(430,932),(740,360)]:
        label=f'{width}x{height}'
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=2,mobile=True)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=5)
        wait_for('hierarchySidebar.narrow');evaluate('hierarchySidebar.setCollapsed(true)')
        evaluate(f'focusEntry({json.dumps(owner)},{{closeFocus:true,openInspector:false}})')
        wait_for('camera.frame===null');evaluate('physics.pause();closeInspector()')
        check(evaluate("document.querySelector('#mobile-body-contents .contents-chevron').getBoundingClientRect().width>0"),'compact card exposes subtle up chevron: '+label)
        check(evaluate("(()=>{const p=document.querySelector('#mobile-body-contents path').getBoundingClientRect(),c=document.getElementById('mobile-body-actions').getBoundingClientRect();window.compactChevronInset=p.top-c.top;return compactChevronInset>=11&&compactChevronInset<=13;})()"),'visible compact chevron has about 12px breathing room inside the card: '+label)
        check(evaluate("(()=>{const b=document.getElementById('mobile-body-contents'),r=b.getBoundingClientRect(),c=document.getElementById('mobile-body-actions').getBoundingClientRect(),a=document.getElementById('mobile-body-add').getBoundingClientRect(),m=document.getElementById('mobile-body-more').getBoundingClientRect();return b.ariaLabel==='Expand contents'&&!document.getElementById('mobile-body-actions').textContent.includes('View contents')&&c.height<=58&&r.width===44&&r.height===44&&Math.abs((r.left+r.right)/2-(c.left+c.right)/2)<1&&r.right<=a.left&&r.right<=m.left&&a.width>=44&&a.height>=44&&m.width>=44&&m.height>=44&&getComputedStyle(b.querySelector('svg')).width==='18px'&&c.bottom<=innerHeight-14;})()"),'single-line card keeps centered 44px expand target separate from right-side controls and bottom spacing: '+label)
        shot('contents-compact-'+label)
        evaluate("document.getElementById('mobile-body-name').textContent='A very long celestial body name that should truncate without colliding with the chevron or action buttons'")
        check(evaluate("(()=>{const n=document.getElementById('mobile-body-name'),r=n.getBoundingClientRect(),i=document.querySelector('#mobile-body-contents path').getBoundingClientRect(),a=document.getElementById('mobile-body-add').getBoundingClientRect(),text=document.createRange();text.selectNodeContents(n);return n.scrollWidth>n.clientWidth&&getComputedStyle(n).textOverflow==='ellipsis'&&r.right<=a.left&&i.bottom<text.getBoundingClientRect().top;})()"),'long body name ellipsizes below the chevron without colliding with controls: '+label)
        shot('contents-compact-long-name-'+label)
        evaluate(f'document.getElementById("mobile-body-name").textContent=entries.get({json.dumps(owner)}).name')
        swipe(position('#mobile-body-contents'),-95)
        wait_for('!panel.hidden');settled()
        check(evaluate(f'contentInspector.entryId==={json.dumps(owner)}&&document.getElementById("mobile-body-contents").ariaExpanded==="true"'),'up swipe opens the same selected body via existing inspector: '+label)
        check(evaluate("document.querySelector('#close-inspector-button .contents-collapse-chevron').getBoundingClientRect().width>0"),'expanded mobile panel exposes down chevron: '+label)
        check(evaluate("(()=>{const c=document.querySelector('#close-inspector-button path').getBoundingClientRect(),p=panel.getBoundingClientRect();return Math.abs(c.top-p.top-compactChevronInset)<.5&&Math.abs((c.left+c.right)/2-(p.left+p.right)/2)<1;})()"),'expanded and compact chevrons have matching visible top insets and horizontal centering: '+label)
        check(evaluate("(()=>{const c=document.getElementById('close-inspector-button').getBoundingClientRect(),p=panel.getBoundingClientRect(),h=document.getElementById('panel-ancestry').getBoundingClientRect();return c.width>=44&&c.height>=44&&Math.abs((c.left+c.right)/2-(p.left+p.right)/2)<1&&c.top>=p.top&&c.bottom<=h.top;})()"),'collapse target is centered above the hierarchy with a separate 44px touch area: '+label)
        check(evaluate("""(()=>{
            const textLeft=e=>{const r=document.createRange();r.selectNodeContents(e);return r.getBoundingClientRect().left;};
            const first=panelAncestry.firstElementChild,title=textLeft(panelName),section=textLeft(document.getElementById('files-heading'));
            return first.textContent==='Work'&&panelAncestry.children.length===2
                &&Math.abs(textLeft(first)-title)<.5&&Math.abs(section-title)<.5
                &&Math.abs(panelAncestry.getBoundingClientRect().left-title)<.5
                &&first.getBoundingClientRect().width>=44&&first.getBoundingClientRect().height===32;
        })()"""),'breadcrumb text, CB title and section labels share the left content grid without shrinking breadcrumb targets: '+label)
        shot('contents-swipe-open-'+label)
        print('Expanded sheet layout '+label+': '+json.dumps(evaluate("""(()=>{
            const top=panel.getBoundingClientRect().top;
            const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top-top,height:r.height,bottom:r.bottom-top};};
            return {panelHeight:panel.clientHeight,handle:box('#close-inspector-button'),breadcrumb:box('#panel-ancestry'),title:box('#panel-name'),actions:box('.content-header-actions'),content:box('#panel-rich-content'),firstHeading:box('#panel-rich-content > section:not([hidden]) .content-heading')};
        })()""")),flush=True)
        check(evaluate("""(()=>{
            const p=panel.getBoundingClientRect(),crumb=document.getElementById('panel-ancestry').getBoundingClientRect(),
                title=document.getElementById('panel-name').getBoundingClientRect(),
                a=document.getElementById('entry-add-button').getBoundingClientRect(),m=document.getElementById('entry-more-button').getBoundingClientRect(),
                first=document.querySelector('#panel-rich-content > section:not([hidden]) .content-heading').getBoundingClientRect();
            return first.top-p.top<=122&&crumb.bottom<=title.top&&title.right<=a.left&&a.right<=m.left
                &&a.width>=44&&a.height>=44&&m.width>=44&&m.height>=44
                &&getComputedStyle(panel).paddingBottom==='16px'&&p.bottom<=innerHeight;
        })()"""),'compact expanded header brings first section within 122px without overlapping controls or losing bottom padding: '+label)
        # The name is a non-interactive header surface, away from + / actions.
        swipe(position('#panel-name'),95)
        closed()
        open_card()
        # Start on the SVG itself, rather than the surrounding header/button box.
        swipe(position('#close-inspector-button path'),95)
        closed()
        check(evaluate('panel.hidden'),'down swipe directly on collapse chevron closes Contents: '+label)
        open_card()
        p=position('#close-inspector-button');p['x']+=55
        swipe(p,95);closed()
        check(evaluate('panel.hidden'),'down swipe beside collapse chevron still closes Contents: '+label)
        tap('#mobile-body-contents');wait_for('!panel.hidden');settled()
        tap('#close-inspector-button');closed()
        check(evaluate('panel.hidden'),'explicit expand and collapse taps still work: '+label)
        open_card()
        for selector in ['#entry-add-button','#entry-more-button','#content-add-files','#panel-ancestry button']:
            swipe(position(selector),95)
            check(evaluate('!panel.hidden'),'expanded control blocks sheet gesture '+selector+': '+label)
        evaluate('closeInspector();closeContentMenus();closeContextMenu()')
        # + / ... are excluded at gesture start and still own ordinary taps.
        tap('#mobile-body-add')
        wait_for('!addMenu.hidden')
        check(evaluate('!addMenu.hidden&&panel.hidden'),'independent + action still opens its existing menu: '+label)
        evaluate('closeContentMenus()');tap('#mobile-body-more')
        check(evaluate('!contextMenu.hidden&&panel.hidden'),'independent actions button still opens its own menu: '+label)
        evaluate('closeContextMenu()')
        swipe(position('#mobile-body-add'),-95)
        check(evaluate('panel.hidden'),'swiping on + does not expand Contents: '+label)
        evaluate('closeContentMenus()')
        swipe(position('#mobile-body-contents'),-30)
        check(evaluate('panel.hidden'),'short vertical movement does not expand: '+label)
        swipe(position('#mobile-body-contents'),-20,dx=80)
        check(evaluate('panel.hidden'),'horizontal gesture does not expand: '+label)
        swipe(position('#mobile-body-contents'),-95,cancel=True)
        check(evaluate('panel.hidden'),'cancelled card gesture does not expand: '+label)
        p=position('#mobile-body-contents')
        other={'x':width*.2,'y':height*.4}
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p,other])
        cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[{'x':p['x'],'y':p['y']-90},other])
        cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
        check(evaluate('panel.hidden'),'second finger outside the card cancels sheet gesture: '+label)
        # Main canvas swipe is owned by panning, not the sheet.
        swipe({'x':width*.2,'y':height*.4},-90)
        check(evaluate('panel.hidden&&activeNodeDrags===0'),'canvas swipe never opens Contents: '+label)

    # Long, real Contents text makes the aside itself scrollable.
    cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=2,mobile=True)
    open_card()
    evaluate("(async()=>{await contentInspector.save(contentInspector.entryId,current=>({...current,notes:{format:'plain',text:Array.from({length:80},(_,i)=>'Line '+i+' of scrollable notes').join('\\n')}}));contentInspector.renderNotes();})()")
    check(evaluate('panel.scrollHeight>panel.clientHeight+150'),'fixture has actual scrollable Contents')
    # Scroll upward normally; do not swipe a field or button.
    p=position('#content-notes-view',.1)
    p['y']=evaluate('panel.getBoundingClientRect().bottom-80')
    swipe(p,-110)
    wait_for('panel.scrollTop>10')
    check(evaluate('!panel.hidden'),'upward panel swipe scrolls Contents without dismissal')
    evaluate('panel.scrollTop=60')
    swipe(position('#close-inspector-button'),110)
    check(evaluate('!panel.hidden'),'collapse handle cannot bypass the scroll-top requirement')
    evaluate('panel.scrollTop=60')
    swipe(position('#panel-name'),110)
    check(evaluate('!panel.hidden'),'downward gesture begun below scroll top never dismisses, even after reaching top')
    evaluate('panel.scrollTop=0')
    for dy,dx,cancel in [(35,0,False),(20,80,False),(100,0,True)]:
        swipe(position('#close-inspector-button path'),dy,dx=dx,cancel=cancel)
        check(evaluate('!panel.hidden'),'collapse handle preserves short/horizontal/cancel guards: '+str((dy,dx,cancel)))
    # Both fingers stay on the sheet: a canvas touch independently clears selection.
    p=position('#close-inspector-button path');other={'x':p['x']+60,'y':p['y']+10}
    cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
    cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p,other])
    cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[{'x':p['x'],'y':p['y']+95},other])
    cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
    check(evaluate('!panel.hidden'),'collapse handle preserves multi-touch cancellation')
    swipe(position('#panel-name'),35)
    check(evaluate('!panel.hidden'),'short downward panel movement does not dismiss')
    swipe(position('#panel-name'),100,cancel=True)
    check(evaluate('!panel.hidden'),'cancelled downward panel gesture does not dismiss')
    evaluate("window.nestedSheet=document.createElement('div');nestedSheet.style.cssText='height:90px;overflow:auto';nestedSheet.innerHTML='<div style=\"height:350px\">Nested scroller</div>';document.getElementById('panel-rich-content').prepend(nestedSheet);nestedSheet.scrollTop=50;panel.scrollTop=0")
    swipe(position('#panel-rich-content > div'),95)
    check(evaluate('!panel.hidden'),'a nested scroller begun below its top cannot dismiss the panel')
    evaluate('nestedSheet.remove();panel.scrollTop=0')
    # Exercise the shared control guard at scroll top, independent of scroller guards.
    for html in ['<input aria-label="Gesture probe">','<a href="#">Gesture link</a>',
                 '<button type="button">Other button</button>','<span role="button">Custom button</span>',
                 '<span contenteditable="true">Editable text</span>']:
        evaluate(f"document.getElementById('panel-name').innerHTML={json.dumps(html)}")
        swipe(position('#panel-name > *'),95)
        check(evaluate('!panel.hidden'),'unrelated interactive element retains its gesture: '+html)
    evaluate(f"document.getElementById('panel-name').textContent=entries.get({json.dumps(owner)}).name")
    # Form controls and nested scroll areas keep their own interactions.
    evaluate('contentInspector.editNotes()')
    swipe(position('#content-notes'),95)
    check(evaluate('!panel.hidden'),'textarea gesture is excluded from dismissal')
    evaluate("document.getElementById('content-cancel-notes').click();panel.scrollTop=0")
    swipe(position('#panel-name'),95)
    closed()

    # Reduced motion keeps transitions immediate; desktop cannot use sheet swipes.
    cdp.call('Emulation.setEmulatedMedia',features=[{'name':'prefers-reduced-motion','value':'reduce'}])
    open_card()
    check(evaluate('panel.getAnimations().length===0'),'reduced motion disables sheet opening animation')
    swipe(position('#panel-name'),95);closed()
    cdp.call('Emulation.setEmulatedMedia',features=[])
    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
    wait_for('!hierarchySidebar.narrow')
    evaluate('setInspectorOpen(true)')
    check(evaluate("getComputedStyle(panelAncestry.firstElementChild).textAlign==='center'&&getComputedStyle(panelAncestry.firstElementChild).paddingInlineStart==='1px'"),'desktop breadcrumb button alignment and padding remain unchanged')
    check(evaluate("""(()=>{
        const p=getComputedStyle(panel),h=getComputedStyle(document.querySelector('.content-panel-header')),
            s=getComputedStyle(document.querySelector('#panel-rich-content > section:not([hidden])'));
        return p.paddingTop==='16px'&&p.paddingBottom==='16px'&&h.paddingTop==='12px'
            &&h.paddingBottom==='10px'&&s.paddingTop==='15px';
    })()"""),'desktop retains its original inspector/header/section spacing')
    swipe(position('#panel-name'),95)
    check(evaluate("!panel.hidden&&getComputedStyle(document.querySelector('.contents-close-mark')).display!=='none'&&getComputedStyle(document.querySelector('.contents-collapse-chevron')).display==='none'"),'desktop keeps its close mark and ignores touch dismissal')
    check(not cdp.errors,f'no Contents gesture browser exceptions: {cdp.errors}')
