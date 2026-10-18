"""Compact/Contents and native gesture ownership, in disposable local data."""
import json
import time


def run_contents_swipe_checks(*,cdp,evaluate,check,wait_for,add,shot):
    e=evaluate;q=json.dumps
    root=add('Browse fixture');sun=add('System',root)
    bodies=[add(name,sun) for name in ['CB A','CB B','CB C','CB D']]
    wait_for('physics.settled');e('physics.pause();autoFitPending=false;camera.stopAnimation()')
    e(f"window.browseIds={q(bodies)}")
    e(r"""(async()=>{for(const [i,id] of browseIds.entries())await saveEntryContent(id,c=>({...c,notes:{format:'plain',text:'Note '+i+'\n'+(i?'':'A long note. '.repeat(220))}}));
        selectEntry(entries.get(browseIds[0]),nodes.get(browseIds[0]),{openInspector:false});
        const c=document.createElement('canvas');c.width=40;c.height=30;c.getContext('2d').fillRect(0,0,40,30);
        const image=new File([await new Promise(r=>c.toBlob(r,'image/png'))],'browse-original.png',{type:'image/png'});
        await contentInspector.upload([image,new File(['Original file bytes'],'browse.txt',{type:'text/plain'})]);})()""")
    wait_for('contentInspector.jobs.size===0')
    e("window.browseEvents=[];['click','focusin','submit'].forEach(type=>document.addEventListener(type,event=>{browseEvents.push({type,target:event.target.id,state:mobileContents.state,forms:[...mobileContents.root.querySelectorAll('form:not([hidden])')].map(f=>f.id)});if(browseEvents.length>40)browseEvents.shift()}))")
    def point(selector,fx=.5,fy=.5):
        return e(f"(()=>{{const n=document.querySelector({q(selector)}),r=n.getBoundingClientRect();return {{x:r.left+r.width*{fx},y:r.top+r.height*{fy}}};}})()")
    def tap(selector,scroll=False,fx=.5,fy=.5):
        if scroll:e(f"document.querySelector({q(selector)}).scrollIntoView({{block:'nearest'}})")
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        p=point(selector,fx=fx,fy=fy)
        check(e(f"document.elementFromPoint({p['x']},{p['y']})?.closest({q(selector)})===document.querySelector({q(selector)})"),'native touch target is exposed: '+selector+' '+json.dumps(e("({state:mobileContents.state,page:mobileContents.page,panelScroll:panel.scrollTop,contentScroll:mobileContents.root.scrollTop})")))
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
    def swipe(p,dx=0,dy=0,cancel=False):
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
        for f in [.12,.3,.6,1]:
            cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[dict(x=p['x']+dx*f,y=p['y']+dy*f)]);time.sleep(.02)
        cdp.call('Input.dispatchTouchEvent',type='touchCancel' if cancel else 'touchEnd',touchPoints=[])
    def settle():wait_for("panel.getAnimations().every(a=>a.playState==='finished')")
    def state(name):
        try:wait_for(f"mobileContents.state==={q(name)}&&panel.hidden==={str(name=='compact').lower()}");settle()
        except AssertionError:
            print('SHEET_FAILURE '+json.dumps(e("({state:mobileContents.state,page:mobileContents.page,forms:[...mobileContents.root.querySelectorAll('form:not([hidden])')].map(f=>f.id),events:browseEvents,active:document.activeElement.id})")),flush=True)
            raise
    def place():
        e("""physics.pause();camera.stopAnimation();entries.forEach((entry,id)=>{const i=browseIds.indexOf(id),p=physics.particles.get(id);entry.x=p.x=i<0?-20000:80+i*72;entry.y=p.y=i<0?-20000:110;});camera.setView({x:0,y:0,scale:1},false);renderGraph();physics.pause()""")
    def choose(index):tap(f'.entry-node[data-entry-id="{bodies[index]}"]')
    def button_metrics(ids):
        return e(q(ids)+""".map(id=>{
            const b=document.getElementById(id),r=b.getBoundingClientRect(),s=getComputedStyle(b,'::before'),icon=b.querySelector('.cb-action-icon'),i=icon.getBoundingClientRect(),box=icon.getBBox(),center=new DOMPoint(box.x+box.width/2,box.y+box.height/2).matrixTransform(icon.getScreenCTM());
            return {width:r.width,height:r.height,left:r.left,top:r.top,visual:[s.width,s.height,s.border,s.borderRadius,s.backgroundColor,getComputedStyle(icon).color],icon:icon.innerHTML,centerX:center.x-(r.left+r.width/2),centerY:center.y-(r.top+r.height/2),iconWidth:i.width,iconHeight:i.height};
        })""")
    def check_action_taps(add,more,tag):
        # The invisible margin outside the 36px surface must remain tappable.
        tap(add,fx=.04)
        check(e("!addMenu.hidden&&addMenuTargetId===selectedNode.dataset.entryId"),'outer hit target opens same-CB Add: '+tag)
        e('closeContentMenus()')
        tap(more,fx=.04)
        check(e("!contextMenu.hidden&&contextEntryId===selectedNode.dataset.entryId"),'outer hit target opens same-CB actions: '+tag)
        e('closeContextMenu()')
    def review_page_rhythm(tag):
        # Both fixtures use the real content model in this disposable profile.
        e("(async()=>{await saveEntryContent(browseIds[1],c=>({...c,notes:{format:'plain',text:''},links:[]}));await saveEntryLocation(browseIds[1],null);await saveEntryContent(browseIds[0],c=>({...c,links:[1,2,3].map(i=>({id:cosmifoldIds.uuid(),url:'https://example.com/reading/'+i,title:'Reading reference '+i}))}));await saveEntryLocation(browseIds[0],{text:'Library, quiet reading room'});})()")
        empty_metrics=[];page_heights={}
        for populated,index in [(False,1),(True,0)]:
            choose(index)
            for page in ['files','notes','links','location']:
                # Tap the full target above the smaller visible active surface.
                tap('#contents-tab-'+page,fy=.04)
                check(e(f"mobileContents.page==={q(page)}&&document.getElementById('contents-tab-'+{q(page)}).getAttribute('aria-selected')==='true'"),'tab outer target selects '+page+': '+tag)
                e('contentInspector.status.hidden=true;mobileContents.root.scrollTop=0')
                e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
                metrics=e("""(()=>{const r=mobileContents.root.getBoundingClientRect(),p=panel.getBoundingClientRect(),d=mobileContents.dock.getBoundingClientRect(),sections=[...mobileContents.root.querySelectorAll(':scope > [data-contents-page]')].filter(s=>s.getClientRects().length),a=sections[0].getBoundingClientRect(),z=sections.at(-1).getBoundingClientRect(),h=sections[0].querySelector('h3').getBoundingClientRect(),active=mobileContents.dock.querySelector('[aria-selected=true]'),s=getComputedStyle(active,'::before');return {panelTop:p.top,panelHeight:p.height,dockTop:d.top,dockHeight:d.height,rootBottom:r.bottom,overflow:mobileContents.root.scrollHeight>mobileContents.root.clientHeight+1,above:a.top-r.top,below:r.bottom-z.bottom,titleTop:h.top-r.top,tabHeights:[...mobileContents.tabs].map(t=>t.getBoundingClientRect().height),fontSize:parseFloat(getComputedStyle(active).fontSize),activeSurface:active.getBoundingClientRect().height-parseFloat(s.top)-parseFloat(s.bottom),differentActiveColor:getComputedStyle(active).color!==getComputedStyle(mobileContents.tabs.find(t=>t!==active)).color};})()""")
                label=('populated' if populated else 'empty')+' '+page+' '+tag
                cap=e('Math.min(Math.max(280,cosmosVisibleViewport().height*.38),cosmosVisibleViewport().height*.60)')
                check(metrics['panelHeight']<=cap+1 and abs(e('usableCanvasBounds.bottom')-metrics['panelTop'])<1,'adaptive height respects Browse cap and refreshes shared canvas: '+label)
                page_heights[populated,page]=metrics['panelHeight']
                check(metrics['rootBottom']<=metrics['dockTop']+1 and metrics['dockHeight']==45 and all(h>=44 for h in metrics['tabHeights']) and metrics['fontSize']>=12 and metrics['activeSurface']==32 and metrics['differentActiveColor'],'light dock preserves 44px targets, readable labels and content clearance: '+label)
                if not populated:
                    check(not metrics['overflow'] and metrics['above']>=-1 and metrics['below']<=12 and metrics['panelHeight']<=min(200,cap)+1,'empty page shrinks without a large blank area: '+label+' '+json.dumps(metrics))
                    empty_metrics.append(metrics)
                elif page in ['files','notes','links']:
                    check(metrics['overflow'] and metrics['above']>=-1,'overflow starts at the top without clipping first content: '+label)
                    e('mobileContents.root.scrollTop=mobileContents.root.scrollHeight')
                    check(e("(()=>{const r=mobileContents.root.getBoundingClientRect(),s=[...mobileContents.root.querySelectorAll(':scope > [data-contents-page]')].filter(s=>s.getClientRects().length).at(-1).getBoundingClientRect();return mobileContents.root.scrollTop>0&&s.bottom<=r.bottom+1})()"),'populated content scrolls fully above the dock: '+label)
                    e('mobileContents.root.scrollTop=0')
                shot('contents-rhythm-'+('populated-' if populated else 'empty-')+page+'-'+tag)
        check(all(abs(m['titleTop']-empty_metrics[0]['titleTop'])<1 for m in empty_metrics),'all empty page headings share the same header distance: '+tag)
        check(all(page_heights[True,page]>page_heights[False,page]+5 for page in ['files','notes','links']),'populated pages grow from their actual content: '+tag)
        # Content changes on the same CB/page shrink and grow without navigation.
        e("mobileContents.setPage('notes');contentInspector.status.hidden=true")
        before=e('panel.offsetHeight')
        e("(async()=>{window.adaptiveSavedNote=contentInspector.content().notes.text;await saveEntryContent(browseIds[0],c=>({...c,notes:{format:'plain',text:''}}));contentInspector.renderNotes();contentInspector.onLayout()})()")
        wait_for(f'panel.offsetHeight<{before}-5&&Math.abs(usableCanvasBounds.bottom-panel.getBoundingClientRect().top)<1')
        e("(async()=>{await saveEntryContent(browseIds[0],c=>({...c,notes:{format:'plain',text:adaptiveSavedNote}}));contentInspector.renderNotes();contentInspector.onLayout()})()")
        wait_for(f'panel.offsetHeight>={before}-1')
        # No resize-driven auto-framing or continuous geometry loop at rest.
        e('window.adaptiveResizeCount=0;window.adaptiveResizeOriginal=mobileContents.onResize;mobileContents.onResize=()=>{adaptiveResizeCount++;adaptiveResizeOriginal()}')
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');stable=e('JSON.stringify(camera.view)')
        e('new Promise(r=>setTimeout(r,150))')
        check(e('adaptiveResizeCount<=2') and e('JSON.stringify(camera.view)')==stable,'intrinsic resizing settles without camera refits or observer loops: '+tag)
        e('mobileContents.onResize=adaptiveResizeOriginal')
        print('Empty page rhythm '+tag+': '+json.dumps(empty_metrics),flush=True)
        e('saveEntryLocation(browseIds[0],null)')
    def review_inline_forms(tag):
        choose(1);tap('#contents-tab-links');tap('#content-add-bookmark',scroll=True)
        def check_text_buttons(selector,label):
            metrics=e("""[...document.querySelectorAll("""+q(selector)+""")].filter(b=>b.getClientRects().length).map(b=>{
                const s=getComputedStyle(b),r=b.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(b);const t=range.getBoundingClientRect();
                return {text:b.textContent,height:r.height,width:r.width,align:s.alignItems,justify:s.justifyContent,textAlign:s.textAlign,display:s.display,border:s.borderTopWidth,shadow:s.boxShadow,surface:s.backgroundImage,
                    dx:(t.left+t.right-r.left-r.right)/2,dy:(t.top+t.bottom-r.top-r.bottom)/2,contained:t.left>=r.left&&t.right<=r.right&&t.top>=r.top&&t.bottom<=r.bottom};})""")
            # Grid/flex parents blockify an inline-flex child's computed display.
            check(bool(metrics) and all(m['height']>=44 and m['display'] in ['flex','inline-flex'] and m['align']==m['justify']==m['textAlign']=='center' and abs(m['dx'])<=.75 and abs(m['dy'])<=1.5 and m['contained'] for m in metrics),'text is centered and contained in '+label+': '+tag+' '+json.dumps(metrics))
            check(all(m['border']=='1px' and m['shadow']!='none' and 'linear-gradient' in m['surface'] for m in metrics),'contained surfaces retain subtle depth in '+label+': '+tag)
        def form_metrics(form,input_selector):
            return e("""(()=>{const f=document.querySelector("""+q(form)+"""),i=document.querySelector("""+q(input_selector)+"""),r=i.getBoundingClientRect(),p=panel.getBoundingClientRect(),buttons=[...f.querySelectorAll('button')].filter(b=>b.getClientRects().length);return {fits:r.left>=p.left+12&&r.right<=p.right-12&&f.scrollWidth<=f.clientWidth+1,font:parseFloat(getComputedStyle(i).fontSize),stacked:buttons.every(b=>b.getBoundingClientRect().top>=r.bottom+7),actions:buttons.map(b=>{const s=getComputedStyle(b);return {text:b.textContent,height:b.getBoundingClientRect().height,border:s.borderTopWidth,radius:s.borderRadius,padding:s.padding,font:s.fontSize,bg:s.backgroundColor}})};})()""")
        e("contentInspector.quickUrl.value='https://example.com/adaptive/'+innerWidth;contentInspector.quickUrl.dispatchEvent(new Event('input',{bubbles:true}))")
        quick=form_metrics('#content-bookmarks-empty','#content-quick-bookmark-url')
        check(quick['fits'] and quick['font']>=16 and quick['stacked'] and [b['text'] for b in quick['actions']]==['Save','Cancel'],'Link field fills its own row above Save/Cancel: '+tag+' '+json.dumps(quick))
        check_text_buttons('#content-bookmarks-empty button','Link add actions')
        shot('contents-link-form-'+tag)
        # Save with the native Enter convention, then edit/remove through existing handlers.
        cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Enter',code='Enter',windowsVirtualKeyCode=13,text='\r',unmodifiedText='\r')
        cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Enter',code='Enter',windowsVirtualKeyCode=13)
        wait_for('contentInspector.quickBookmark.hidden&&contentInspector.jobs.size===0&&contentInspector.content().links.length===1')
        check(e("!!document.querySelector('#content-links a')&&!document.getElementById('content-bookmarks-placeholder').hidden"),'Enter saves Link and restores lightweight add row: '+tag)
        e('contentInspector.editLink(contentInspector.content().links[0])')
        full=form_metrics('#content-link-form','#content-link-title')
        check(full['fits'] and full['font']>=16 and full['stacked'] and [b['text'] for b in full['actions']]==['Save','Cancel'],'saved Link editing uses full-width fields and generic actions: '+tag)
        check_text_buttons('#content-link-form button','Link edit actions')
        tap('#content-cancel-link',scroll=True)
        tap('#content-links summary',scroll=True)
        check_text_buttons('#content-links .content-row-actions button','populated Link actions')
        shot('contents-links-actions-'+tag)
        tap('#content-links summary',scroll=True);tap('#content-add-bookmark',scroll=True)
        e("contentInspector.quickUrl.value='javascript:alert(1)';contentInspector.quickUrl.dispatchEvent(new Event('input',{bubbles:true}));contentInspector.quickBookmark.requestSubmit()")
        wait_for("contentInspector.quickUrl.getAttribute('aria-invalid')==='true'")
        check(e('contentInspector.content().links.length===1&&!contentInspector.quickBookmark.hidden'),'invalid Link keeps existing validation and does not save: '+tag)
        e("contentInspector.quickBookmark.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));contentInspector.status.hidden=true")
        check(e('contentInspector.quickBookmark.hidden'),'Escape returns Link entry to compact state: '+tag)
        tap('#contents-tab-location');tap('#content-add-location',scroll=True)
        location=form_metrics('#content-location-form','#content-location-input')
        check(location['fits'] and location['font']>=16 and location['stacked'] and [b['text'] for b in location['actions']]==['Save','Cancel'],'Location follows the same full-width field/action layout: '+tag)
        check_text_buttons('#content-location-form button','Location add actions')
        shot('contents-location-form-'+tag)
        e("contentInspector.locationInput.value='Library, reading room';contentInspector.locationForm.requestSubmit()")
        wait_for('contentInspector.locationForm.hidden&&contentInspector.jobs.size===0')
        check(e("entries.get(browseIds[1]).location?.text==='Library, reading room'"),'Location save preserves existing persistence: '+tag)
        shot('contents-location-populated-'+tag)
        check_text_buttons('.location-actions button','populated Location actions')
        check(e("(()=>{const a=document.getElementById('content-location-maps'),s=getComputedStyle(a);return a.tagName==='A'&&!!a.href&&s.backgroundImage==='none'&&s.boxShadow==='none'&&s.textDecorationLine.includes('underline')})()"),'Google Maps remains a plain link action: '+tag)
        saved=e("['content-edit-location','content-remove-location'].map(id=>{const b=document.getElementById(id),s=getComputedStyle(b);return {text:b.textContent,height:b.getBoundingClientRect().height,border:s.borderTopWidth,radius:s.borderRadius,padding:s.padding,font:s.fontSize,bg:s.backgroundColor}})")
        check(all(all(b[k]==quick['actions'][1][k] for k in ['height','border','radius','padding','font','bg']) for b in saved),'saved Edit/Remove share the neutral Cancel treatment: '+tag+' '+json.dumps(saved))
        tap('#content-edit-location',scroll=True)
        check_text_buttons('#content-location-form button','Location edit actions')
        tap('#content-cancel-location',scroll=True)
        check(e("contentInspector.locationForm.hidden&&entries.get(browseIds[1]).location.text==='Library, reading room'"),'Location Cancel preserves saved data: '+tag)
        tap('#content-remove-location',scroll=True);wait_for('!entries.get(browseIds[1]).location')
        tap('#contents-tab-notes');tap('#content-browse-add-note',scroll=True)
        notes=form_metrics('#content-notes-form','#content-notes')
        check(notes['fits'] and notes['font']>=16 and notes['stacked'] and [b['text'] for b in notes['actions']]==['Save','Cancel'],'Notes editor fits and uses the shared generic actions: '+tag)
        check_text_buttons('#content-notes-form button','shared Notes actions')
        check(all(all(b[k]==quick['actions'][i][k] for k in ['height','border','radius','padding','font','bg']) for actions in [location['actions'],notes['actions'],full['actions']] for i,b in enumerate(actions)),'Save/Cancel geometry and styling match across editors: '+tag)
        tap('#content-cancel-notes',scroll=True)
        check(e("contentInspector.notesForm.hidden&&!contentInspector.content().notes.text"),'Notes Cancel leaves empty persisted content unchanged: '+tag)
        # All visible text actions stay inside the sheet at each supported width.
        check(e("mobileContents.root.scrollWidth<=mobileContents.root.clientWidth+1&&panel.scrollWidth<=panel.clientWidth+1"),'forms and actions never create horizontal overflow: '+tag)
    for width,height in [(360,800),(390,844),(430,932),(740,360)]:
        tag=f'{width}x{height}'
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=2,mobile=True)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=2)
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');wait_for('camera.frame===null')
        e('hierarchySidebar.setCollapsed(true);closeInspector();mobileContents.setPage("files");document.activeElement.blur()')
        e("(async()=>{await saveEntryLocation(browseIds[3],null);await saveEntryContent(browseIds[3],c=>({...c,notes:{format:'plain',text:'Note 3'},links:[]}))})()")
        place()
        choose(0)
        check(e('panel.hidden&&selectedNode.dataset.entryId===browseIds[0]'),'CB tap keeps the existing compact state: '+tag)
        check(e("document.getElementById('mobile-body-actions').getBoundingClientRect().height<=58"),'compact card is unchanged: '+tag)
        e("window.browseName=entries.get(browseIds[0]).name;entries.get(browseIds[0]).name='A very long celestial body name that must truncate safely '.repeat(3);selectEntry(entries.get(browseIds[0]),nodes.get(browseIds[0]),{openInspector:false})")
        check(e("(()=>{const n=document.getElementById('mobile-body-name'),a=document.getElementById('mobile-body-add'),m=document.getElementById('mobile-body-more'),r=n.getBoundingClientRect();return n.scrollWidth>n.clientWidth&&getComputedStyle(n).textOverflow==='ellipsis'&&r.right<=a.getBoundingClientRect().left&&a.getBoundingClientRect().right<=m.getBoundingClientRect().left})()"),'long compact name truncates clear of independent action buttons: '+tag)
        window_buttons=button_metrics(['mobile-body-add','mobile-body-more'])
        shot('contents-compact-'+tag)
        check_action_taps('#mobile-body-add','#mobile-body-more','Compact '+tag)
        tap('#mobile-body-contents');state('browse')
        header_buttons=button_metrics(['entry-add-button','entry-more-button'])
        buttons=window_buttons+header_buttons
        check(all(b['width']==44 and b['height']==44 and b['visual']==window_buttons[0]['visual'] and b['visual'][:2]==['36px','36px'] for b in buttons),'Compact and Contents share 36px surfaces inside 44px targets: '+tag)
        check(all(abs(b['centerX'])<.1 and abs(b['centerY'])<.1 and b['iconWidth']==18 and b['iconHeight']==18 for b in buttons),'all four mobile icons are geometrically centered: '+tag)
        check(window_buttons[0]['icon']==header_buttons[0]['icon'] and window_buttons[1]['icon']==header_buttons[1]['icon'],'plus and three-dot icon geometry is identical in both states: '+tag)
        check(all(pair[0]['top']==pair[1]['top'] and abs(pair[1]['left']-pair[0]['left']-pair[0]['width']-6)<.1 for pair in [window_buttons,header_buttons]),'both button pairs have equal vertical alignment and 6px spacing: '+tag)
        check_action_taps('#entry-add-button','#entry-more-button','Contents '+tag)
        check(e("panelName.scrollWidth>panelName.clientWidth&&panelName.getBoundingClientRect().right<=document.getElementById('entry-add-button').getBoundingClientRect().left"),'long Contents title truncates clear of action controls: '+tag)
        e("entries.get(browseIds[0]).name=browseName;selectEntry(entries.get(browseIds[0]),nodes.get(browseIds[0]),{openInspector:true})")
        check(e("(()=>{const r=panel.getBoundingClientRect(),h=visualViewport.height;return r.height>=h*.30&&r.height<=h*.61&&r.top>=h*.39&&Math.abs(usableCanvasBounds.bottom-r.top)<1})()"),'Browse leaves substantial measured canvas with bounded height: '+tag+' '+json.dumps(e("({state:mobileContents.state,v:cosmosVisibleViewport(),rect:(()=>{const r=panel.getBoundingClientRect();return {height:r.height,top:r.top,bottom:r.bottom}})(),bounds:usableCanvasBounds,css:{height:getComputedStyle(panel).height,max:getComputedStyle(panel).maxHeight},header:panel.querySelector('.content-panel-header').offsetHeight})")))
        check(e("[...document.querySelectorAll('#contents-dock button')].map(b=>b.textContent).join('|')==='Files|Notes|Links|Location'&&document.querySelector('#contents-tab-files').getAttribute('aria-selected')==='true'"),'labeled dock starts on Files: '+tag)
        check(e("document.querySelector('#content-media img')?.naturalWidth>0&&document.querySelector('#content-attachments').textContent.includes('browse.txt')&&document.querySelector('#content-media-section').dataset.pageHidden==='false'&&document.querySelector('#content-files-section').dataset.pageHidden==='false'"),'Files page presents original Media and general Files together: '+tag)
        row_metrics=[]
        for page,selector,title,action in [('files','#content-browse-add-file','FILES','Add file…'),('notes','#content-browse-add-note','NOTES','Add note…'),('links','#content-add-bookmark','LINKS','Add link…'),('location','#content-add-location','LOCATION','Add location…')]:
            e(f"mobileContents.setPage({q(page)})")
            row_metrics.append(e("(()=>{const a=document.querySelector("+q(selector)+"),s=a.closest('section'),h=s.querySelector('h3'),r=a.getBoundingClientRect(),hr=h.getBoundingClientRect(),st=getComputedStyle(a);return {label:h.textContent.toUpperCase(),action:a.textContent,left:r.left,height:r.height,gap:r.top-hr.bottom,font:[st.fontSize,st.fontWeight,st.color]};})()"))
            check(row_metrics[-1]['label']==title and row_metrics[-1]['action']==action,'page uses consistent title and add wording: '+page+' '+tag)
        first=row_metrics[0]
        check(all(all(abs(row[key]-first[key])<.6 for key in ['left','height','gap']) and row['font']==first['font'] for row in row_metrics),'all pages align heading, 44px add row and typography: '+tag+' '+json.dumps(row_metrics))
        e("mobileContents.setPage('files');window.browsePickerClick=contentInspector.files.click;window.browsePickerCount=0;contentInspector.files.click=()=>browsePickerCount++")
        # A form left on another page must not promote or redirect later file layouts.
        e("window.adaptiveFilesHeight=panel.offsetHeight;mobileContents.setPage('notes');document.getElementById('content-browse-add-note').click();mobileContents.setPage('files')")
        check(e('panel.offsetHeight===adaptiveFilesHeight'),'an editor on an inactive page does not inflate Files: '+tag)
        tap('#content-browse-add-file')
        check(e('browsePickerCount===1&&contentInspector.fileSelection.entryId===browseIds[0]'),'Files add row routes through the existing picker for the same CB: '+tag)
        e("contentInspector.files.click=browsePickerClick;contentInspector.files.dispatchEvent(new Event('cancel'));contentInspector.upload([new File(['saved from Contents'],'added.txt',{type:'text/plain'})])")
        wait_for('contentInspector.jobs.size===0')
        check(e("mobileContents.state==='browse'&&mobileContents.page==='files'&&contentInspector.entryId===browseIds[0]&&document.getElementById('content-attachments').textContent.includes('added.txt')"),'file save stays on same CB, Files and Contents: '+tag)
        check(e("!contentInspector.notesForm.hidden&&mobileContents.state==='browse'&&mobileContents.page==='files'"),'inactive note draft survives Files save without changing the inspected page: '+tag)
        e("document.getElementById('content-cancel-notes').click()")
        shot('browse-files-'+tag)
        e("contentInspector.message('This file could not be read. Choose a saved copy on this device.',true)")
        wait_for("(()=>{const r=mobileContents.root.getBoundingClientRect(),s=contentInspector.status.getBoundingClientRect();return s.top>=r.top&&s.bottom<=r.bottom+1})()")
        check(True,'Browse error message remains reachable inside the content scroller: '+tag)
        e('contentInspector.status.hidden=true;mobileContents.root.scrollTop=0')
        for index in [1,2]:
            choose(index)
            check(e(f"!panel.hidden&&mobileContents.state==='browse'&&contentInspector.entryId===browseIds[{index}]&&panelName.textContent===entries.get(browseIds[{index}]).name&&mobileContents.page==='files'"),'canvas tap switches body without reopening or resetting Files: '+tag)
        tap('#contents-tab-notes')
        check(e("mobileContents.page==='notes'&&document.getElementById('content-notes-view').textContent.includes('Note 2')&&getComputedStyle(document.getElementById('content-files-section')).display==='none'"),'Notes tab shows existing notes only: '+tag)
        choose(3)
        check(e("contentInspector.entryId===browseIds[3]&&mobileContents.page==='notes'&&document.getElementById('content-notes-view').textContent.includes('Note 3')"),'CB switch preserves Notes and refreshes its content: '+tag)
        swipe(point('#content-notes-section .content-heading'),dx=-100)
        check(e("mobileContents.page==='links'&&mobileContents.state==='browse'"),'horizontal native swipe changes page within the same Contents state: '+tag)
        tap('#contents-tab-location')
        check(e("getComputedStyle(document.getElementById('content-add-location')).display!=='none'&&document.getElementById('content-location-form').hidden"),'Location keeps lightweight direct-entry row: '+tag)
        # Controls own their gestures and taps.
        for selector in ['#entry-add-button','#entry-more-button','#contents-tab-location','#content-add-location']:
            old=e('mobileContents.page');swipe(point(selector),dx=-80,dy=5)
            check(e(f"mobileContents.page==={q(old)}&&mobileContents.state==='browse'"),'interactive control blocks page swipe '+selector+': '+tag)
        swipe(point('#content-location-section .content-heading'),dx=40,dy=40)
        check(e("mobileContents.page==='location'&&mobileContents.state==='browse'"),'ambiguous gesture changes neither page nor state: '+tag)
        swipe(point('#content-location-section .content-heading'),dx=30)
        check(e("mobileContents.page==='location'"),'short horizontal motion does not change page: '+tag)
        # There is no Full state: upward motion on the open handle is inert.
        e('mobileContents.root.scrollTop=0')
        sheet_height=e('panel.getBoundingClientRect().height')
        swipe(point('#close-inspector-button path'),dy=-90)
        check(e("mobileContents.state==='browse'&&mobileContents.page==='location'&&panel.dataset.contentsState==='browse'&&usableCanvasBounds.contentsState==='browse'"),'upward sheet swipe cannot enter a third state: '+tag)
        check(e("!document.getElementById('expand-contents-button')&&!document.getElementById('browse-close-button')"),'obsolete Full controls are removed: '+tag)
        e("mobileContents.transition('full')")
        check(e("mobileContents.state==='browse'"),'obsolete Full transition is rejected: '+tag)
        swipe(point('#close-inspector-button path'),dy=90);state('compact')
        check(e("selectedNode.dataset.entryId===browseIds[3]&&mobileContents.page==='location'"),'Contents down-swipe returns to compact without changing identity/page: '+tag)
        swipe(point('#mobile-body-contents'),dy=-90);state('browse')
        check(e("mobileContents.page==='location'"),'compact swipe-up reopens the same Contents page: '+tag)
        # All ordinary editors stay in the same bounded sheet.
        tap('#content-add-location',scroll=True)
        check(e("mobileContents.state==='browse'&&document.activeElement.id==='content-location-input'"),'Location activates its existing inline editor in Contents: '+tag)
        e(f"contentInspector.locationInput.value={q('Location '+tag)};contentInspector.locationForm.requestSubmit()")
        wait_for(f"entries.get(browseIds[3]).location?.text==={q('Location '+tag)}&&contentInspector.locationForm.hidden")
        check(e("mobileContents.state==='browse'&&mobileContents.page==='location'&&contentInspector.entryId===browseIds[3]"),'Location save retains CB, page and Contents state: '+tag)
        tap('#contents-tab-links');tap('#content-add-bookmark',scroll=True)
        check(e("mobileContents.state==='browse'&&document.activeElement===contentInspector.quickUrl"),'Links keeps in-place entry and focus in Contents: '+tag)
        p=point('#content-quick-bookmark-url')
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
        check(e('mobileContents.gesture===null'),'input never starts a page or sheet gesture: '+tag)
        cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[dict(x=p['x']-90,y=p['y'])])
        cdp.call('Input.dispatchTouchEvent',type='touchCancel',touchPoints=[])
        check(e("mobileContents.page==='links'"),'URL field owns its horizontal gesture: '+tag)
        e("contentInspector.quickUrl.value='https://example.com/'+innerWidth;contentInspector.quickUrl.dispatchEvent(new Event('input',{bubbles:true}));contentInspector.quickBookmark.requestSubmit()")
        wait_for('contentInspector.content().links.length>0&&contentInspector.quickBookmark.hidden')
        check(e("mobileContents.state==='browse'&&mobileContents.page==='links'&&contentInspector.entryId===browseIds[3]&&!!document.querySelector('#content-links a')"),'link save retains CB, page, Contents and the saved link: '+tag)
        tap('#contents-tab-notes');tap('#content-browse-add-note',scroll=True)
        check(e("mobileContents.state==='browse'&&document.activeElement===contentInspector.notes"),'Notes reuses its inline edit form in Contents: '+tag)
        e(f"contentInspector.notes.value={q('Saved '+tag)};contentInspector.notesForm.requestSubmit()")
        wait_for(f"entries.get(browseIds[3]).content.notes.text==={q('Saved '+tag)}&&contentInspector.notesForm.hidden")
        check(e("mobileContents.state==='browse'&&mobileContents.page==='notes'&&contentInspector.entryId===browseIds[3]&&panel.offsetHeight<=parseFloat(getComputedStyle(panel).maxHeight)+1"),'note save retains CB/page in an adaptive bounded sheet: '+tag)
        # Drag another CB while the current inspection stays owned by D.
        place();p=point(f'.entry-node[data-entry-id="{bodies[1]}"]');before=e('({x:entries.get(browseIds[1]).x,y:entries.get(browseIds[1]).y})')
        swipe(p,dx=30)
        e('physics.pause()')
        check(e(f"contentInspector.entryId===browseIds[3]&&selectedNode.dataset.entryId===browseIds[3]&&Math.hypot(entries.get(browseIds[1]).x-{before['x']},entries.get(browseIds[1]).y-{before['y']})>0&&activeNodeDrags===0"),'drag moves another body without treating it as an inspection tap: '+tag)
        # Empty visible canvas remains a native pan/pinch surface, with no overlay.
        place();p=dict(x=width-40,y=180 if height>500 else 140);before=e('({...camera.view})')
        swipe(p,dx=-30,dy=10);e('physics.pause()')
        check(e(f"camera.view.x!=={before['x']}&&mobileContents.state==='browse'&&contentInspector.entryId===browseIds[3]"),'native canvas pan works above Browse: '+tag)
        place();p=[dict(x=width-150,y=60),dict(x=width-40,y=60)];before=e('camera.view.scale')
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p[0]]);cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=p)
        cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[dict(x=p[0]['x']-20,y=60),dict(x=p[1]['x']+10,y=60)])
        wait_for(f'camera.view.scale>{before}');cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
        check(e("mobileContents.state==='browse'&&contentInspector.entryId===browseIds[3]&&!pinch"),'native pinch remains independent of Contents pages: '+tag)
        e('physics.pause()');place()
        tap('#contents-tab-notes');choose(0)
        e('document.getElementById("panel-rich-content").scrollTop=60')
        swipe(point('#close-inspector-button path'),dy=90)
        check(e("mobileContents.state==='browse'&&mobileContents.page==='notes'"),'sheet handle cannot bypass nested content scroll-top guard: '+tag)
        e('document.getElementById("panel-rich-content").scrollTop=0')
        for dy,dx,cancel in [(30,0,False),(20,80,False),(95,0,True)]:
            swipe(point('#close-inspector-button path'),dy=dy,dx=dx,cancel=cancel)
            check(e("mobileContents.state==='browse'&&mobileContents.page==='notes'"),'handle preserves short/horizontal/cancel guards: '+tag)
        # Scrolling a note upward does not accidentally expand the sheet.
        p=point('#panel-rich-content',fy=.6);swipe(p,dy=-90)
        wait_for('document.getElementById("panel-rich-content").scrollTop>1')
        check(e("mobileContents.state==='browse'"),'vertical content scroll stays inside Browse: '+tag)
        e('document.getElementById("panel-rich-content").scrollTop=0')
        # All unrelated controls retain downward gestures too.
        for selector in ['#entry-add-button','#entry-more-button','#contents-tab-notes']:
            swipe(point(selector),dy=90);check(e("mobileContents.state==='browse'"),'control blocks vertical sheet gesture '+selector+': '+tag)
        e('document.getElementById("panel-rich-content").scrollTop=0')
        p=point('#close-inspector-button path');other=dict(x=p['x']+55,y=p['y']+5)
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p,other])
        check(e('mobileContents.gesture===null'),'second finger cancels page/sheet ownership: '+tag)
        cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[dict(x=p['x'],y=p['y']+90),other])
        cdp.call('Input.dispatchTouchEvent',type='touchCancel',touchPoints=[])
        check(e("mobileContents.state==='browse'&&mobileContents.page==='notes'"),'multitouch changes neither sheet nor page: '+tag)
        shot('browse-notes-'+tag)
        review_page_rhythm(tag)
        review_inline_forms(tag)
        tap('#close-inspector-button');state('compact')
    # Keyboard geometry uses the existing visual-viewport callback; no live browser.
    cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=2,mobile=True)
    e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');wait_for('camera.frame===null')
    e("openMobileContents();mobileContents.setPage('links')");state('browse');tap('#content-add-bookmark',scroll=True);state('browse')
    e("window.browseViewportDescriptor=Object.getOwnPropertyDescriptor(window,'visualViewport');Object.defineProperty(window,'visualViewport',{configurable:true,value:{width:390,height:400,offsetTop:0,offsetLeft:0}});mobileViewportChanged()")
    check(e("(()=>{const p=panel.getBoundingClientRect(),r=contentInspector.quickUrl.getBoundingClientRect();return galaxy.classList.contains('mobile-keyboard-open')&&p.bottom<=401&&p.top>=0&&r.top>=p.top&&r.bottom<=p.bottom&&usableCanvasBounds.bottom<=p.top+1})()"),'keyboard viewport keeps editor and canvas bounds inside visible screen: '+json.dumps(e("({keyboard:galaxy.classList.contains('mobile-keyboard-open'),panel:panel.getBoundingClientRect().toJSON(),input:contentInspector.quickUrl.getBoundingClientRect().toJSON(),bounds:usableCanvasBounds,css:{height:getComputedStyle(panel).height,max:getComputedStyle(panel).maxHeight,bottom:getComputedStyle(panel).bottom}})")))
    e('contentInspector.cancelQuickBookmark()')
    for page,activate,field,cancel in [('links','contentInspector.addBookmark()','#content-quick-bookmark-url','#content-cancel-quick-bookmark'),('location','contentInspector.editLocation()','#content-location-input','#content-cancel-location'),('notes','contentInspector.editNotes()','#content-notes','#content-cancel-notes')]:
        e(f'mobileContents.setPage({q(page)});'+activate)
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        e(f'document.querySelector({q(field)}).scrollIntoView({{block:"nearest"}})')
        check(e("(()=>{const i=document.querySelector("+q(field)+"),r=i.getBoundingClientRect(),p=panel.getBoundingClientRect(),c=mobileContents.root.getBoundingClientRect();return document.activeElement===i&&parseFloat(getComputedStyle(i).fontSize)>=16&&r.left>=p.left+12&&r.right<=p.right-12&&Math.min(r.bottom,c.bottom)-Math.max(r.top,c.top)>=30&&panel.scrollWidth<=panel.clientWidth+1})()"),'keyboard keeps '+page+' field focused, readable and horizontally contained')
        e(f'document.querySelector({q(cancel)}).scrollIntoView({{block:"nearest"}})')
        check(e("(()=>{const b=document.querySelector("+q(cancel)+"),r=b.getBoundingClientRect(),c=mobileContents.root.getBoundingClientRect(),d=mobileContents.dock.getBoundingClientRect(),p=panel.getBoundingClientRect();return r.top>=c.top-1&&r.bottom<=c.bottom+1&&c.bottom<=d.top+1&&d.bottom<=p.bottom&&p.bottom<=400})()"),'keyboard allows scrolling to '+page+' actions above the stable dock')
        shot('contents-keyboard-'+page)
        e(f'document.querySelector({q(cancel)}).click()')
    e("Object.defineProperty(window,'visualViewport',browseViewportDescriptor);contentInspector.cancelQuickBookmark();mobileViewportChanged();panel.scrollTop=0")
    cdp.call('Emulation.setEmulatedMedia',features=[dict(name='prefers-reduced-motion',value='reduce')])
    tap('#close-inspector-button');state('compact');tap('#mobile-body-contents');state('browse')
    check(e('panel.getAnimations().length===0'),'reduced motion skips state transition animation')
    # Chrome exposes CSS safe-area emulation separately from viewport geometry.
    try:
        cdp.call('Emulation.setSafeAreaInsets',insets=dict(top=20,left=12,right=12,bottom=24))
    except AssertionError as error:
        print('Native safe-area emulation unavailable; testing the existing CSS with synthetic 24px inset values: '+str(error),flush=True)
        e("(async()=>{const css=await(await fetch('style.css')).text();window.browseInsetStyle=document.createElement('style');browseInsetStyle.textContent=css.replace(/env\\(safe-area-inset-(bottom|left|right)\\)/g,'24px');document.head.append(browseInsetStyle)})()")
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');e('updateGraphViewport()')
        check(e("(()=>{const p=panel.getBoundingClientRect(),d=mobileContents.dock.getBoundingClientRect(),s=getComputedStyle(panel);return parseFloat(s.paddingBottom)>=24&&parseFloat(s.paddingLeft)>=24&&parseFloat(s.paddingRight)>=24&&d.bottom<=p.bottom-24&&d.left>=p.left+24&&d.right<=p.right-24&&Math.abs(usableCanvasBounds.bottom-p.top)<1})()"),'synthetic safe-area CSS values preserve dock clearance and available canvas')
        shot('contents-rhythm-safe-area')
        e('browseInsetStyle.remove();updateGraphViewport()')
    else:
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');e('updateGraphViewport()')
        check(e("(()=>{const p=panel.getBoundingClientRect(),d=mobileContents.dock.getBoundingClientRect(),s=getComputedStyle(panel);return parseFloat(s.paddingBottom)>=24&&parseFloat(s.paddingLeft)>=12&&d.bottom<=p.bottom-24&&Math.abs(usableCanvasBounds.bottom-p.top)<1})()"),'safe-area padding protects dock and matches available canvas')
        cdp.call('Emulation.setSafeAreaInsets',insets=dict(top=0,left=0,right=0,bottom=0))
    tap('#close-inspector-button');state('compact')
    cdp.call('Emulation.setEmulatedMedia',features=[])
    # Desktop keeps the existing full inspector and section stack.
    cdp.call('Emulation.setTouchEmulationEnabled',enabled=False,maxTouchPoints=1)
    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
    e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');wait_for('camera.frame===null')
    e('setInspectorOpen(true);physics.pause()')
    check(e("mobileContents.mobile===false&&document.getElementById('contents-dock').hidden&&getComputedStyle(document.querySelector('.contents-close-mark')).display!=='none'&&getComputedStyle(document.querySelector('.contents-collapse-chevron')).display==='none'"),'desktop keeps close mark and no mobile dock')
    check(e("[...document.querySelectorAll('#panel-rich-content > [data-contents-page]')].every(s=>s.dataset.pageHidden==='false')&&getComputedStyle(panel).paddingTop==='16px'&&getComputedStyle(panel).paddingBottom==='16px'"),'desktop retains full section stack and original inspector spacing')
    check(e("mobileContents.root.querySelector('[data-contents-page]').id==='content-media-section'&&document.getElementById('bookmarks-heading').textContent==='Bookmarks'&&document.getElementById('content-add-bookmark').textContent==='Paste a link…'&&document.getElementById('content-browse-add-file').hidden&&document.getElementById('content-browse-add-note').hidden&&getComputedStyle(document.getElementById('content-add-files')).display!=='none'"),'desktop restores Media-first order, bookmark wording and original Add controls')
    check(e("document.querySelector('#content-notes-form button[type=submit]').textContent==='Save note'&&document.querySelector('#content-link-form button[type=submit]').textContent==='Save bookmark'&&document.getElementById('content-quick-bookmark-save').textContent==='Save bookmark'&&document.querySelector('#content-location-form button[type=submit]').textContent==='Save location'&&getComputedStyle(contentInspector.quickBookmark).display==='none'&&getComputedStyle(contentInspector.notes).fontSize==='12px'"),'desktop restores contextual save wording and original field typography')
    check(e("[...document.querySelectorAll('.cb-action-icon')].every(i=>getComputedStyle(i).display==='none')&&getComputedStyle(document.querySelector('#entry-more-button .cb-action-legacy')).display!=='none'&&document.getElementById('entry-more-button').getBoundingClientRect().width===28&&getComputedStyle(document.getElementById('entry-more-button')).letterSpacing==='1px'"),'desktop retains its existing glyph, spacing and 28px action button')
    shot('contents-desktop')
    swipe(point('#panel-name'),dy=90)
    check(e('!panel.hidden'),'desktop ignores mobile sheet gestures')
    e('document.getElementById("close-inspector-button").click()')
    check(e('panel.hidden'),'desktop close behavior remains direct')
    check(not cdp.errors,f'no Browse Contents browser exceptions: {cdp.errors}')
