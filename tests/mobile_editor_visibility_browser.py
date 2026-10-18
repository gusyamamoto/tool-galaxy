"""Populated editors and persistent Constellation actions in disposable fixtures."""
import json


def run_editor_visibility_checks(*, cdp, e, check, wait_for, frame, viewport, inspect, leaf, collection, shot):
    q=json.dumps

    def tap(selector):
        frame()
        p=e(f"(()=>{{const b=document.querySelector({q(selector)}),r=b.getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}}}})()")
        check(p.pop('hit'), 'exposed native target: '+selector)
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
        cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])

    def swipe(selector,dy=85):
        p=e(f"(()=>{{const r=document.querySelector({q(selector)}).getBoundingClientRect();return {{x:r.x+r.width/2,y:r.top+Math.min(12,r.height/2)}}}})()")
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
        for step in range(1,7):
            cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[dict(x=p['x'],y=p['y']+dy*step/6)])
        cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
        frame()

    def keyboard(width,height):
        e(f'Object.defineProperty(window,"visualViewport",{{configurable:true,value:{{offsetLeft:0,offsetTop:12,width:{width},height:{height}}}}});mobileViewportChanged()')
        frame()

    def restore():
        e('Object.defineProperty(window,"visualViewport",{configurable:true,value:readinessViewport});mobileViewportChanged()')
        frame()

    def visible(form,field,label,focused=True):
        bounds=e(f"""(()=>{{const f=document.querySelector({q(form)}),i=document.querySelector({q(field)}),r=i.getBoundingClientRect(),s=f.querySelector('.inline-editor-fields').getBoundingClientRect(),a=f.querySelector('.inline-editor-actions').getBoundingClientRect(),v=cosmosVisibleViewport();return {{inputVisible:Math.min(r.bottom,s.bottom,v.top+v.height)-Math.max(r.top,s.top,v.top),focused:document.activeElement===i,actions:a.top>=v.top&&a.bottom<=v.top+v.height,hit:[...f.querySelectorAll('.inline-editor-actions button')].every(b=>{{const r=b.getBoundingClientRect();return r.height>=44&&b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})}}}})()""")
        if not bounds['hit']:
            print('Editor clipping '+q(e(f"[panel,mobileContents.root,document.querySelector({q(form)}).closest('section'),document.querySelector({q(form)}),document.querySelector({q(form)}).querySelector('.inline-editor-fields'),document.querySelector({q(form)}).querySelector('.inline-editor-actions'),document.getElementById('content-links')].map(n=>({{id:n.id,rect:n.getBoundingClientRect().toJSON(),flex:getComputedStyle(n).flex,min:getComputedStyle(n).minHeight,scroll:n.scrollTop,overflow:getComputedStyle(n).overflowY}}))")),flush=True)
        check(bounds['inputVisible']>=32 and (not focused or bounds['focused']) and bounds['actions'] and bounds['hit'],label+': input and both actions remain visible: '+q(bounds))

    e(f'(async()=>{{for(const id of entries.keys())await constellationWorkspace.setMember({q(collection)},id,true)}})()')
    for width,height in [(360,800),(390,844),(430,932),(844,390),(1440,1000)]:
        viewport(width,height)
        e(f'activeConstellationId==={q(collection)}?showConstellationOverview():activateConstellation({q(collection)})')
        wait_for('camera.frame===null');frame()
        before=e('document.getElementById("entry-add-button").getBoundingClientRect().top')
        check(e("(()=>{const rs=['panel-name','entry-add-button','entry-more-button'].map(id=>document.getElementById(id).getBoundingClientRect());return rs.every(r=>Math.abs(r.top+r.height/2-rs[0].top-rs[0].height/2)<1)})()"),f'{width}: Constellation name, + and management share vertical alignment')
        e('(()=>{const c=document.getElementById("constellation-content");c.scrollTop=c.scrollHeight;panel.scrollTop=panel.scrollHeight})()');frame()
        check(e(f"(()=>{{const b=document.getElementById('entry-add-button'),r=b.getBoundingClientRect(),p=panel.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom&&r.top==={before}&&r.height>={(44 if width<1000 else 28)}&&b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()"),f'{width}: Constellation header + stays exposed after list scroll')
        check(e("!document.getElementById('panel-add-member')&&!document.querySelector('#constellation-content > button')"),f'{width}: no redundant bottom Add row')
        if width<1000:tap('#entry-add-button')
        else:e('document.getElementById("entry-add-button").click()')
        check(e(f'constellationWorkspace.picker.open&&constellationWorkspace.pickerId==={q(collection)}'),f'{width}: header + opens same-Constellation picker')
        e('document.getElementById("close-constellation-picker").click();moreButton.click()')
        check(e("[...entryActions.querySelectorAll('button:not([hidden])')].map(b=>b.textContent).join('|')==='Rename|Delete Constellation'"),f'{width}: header management remains Rename/Delete')
        e('closeContentMenus()');shot('readiness-header-add-'+str(width))

    for width,layout_height,height in [(360,800,320),(390,844,350),(430,932,380),(844,390,190)]:
        viewport(width,layout_height)
        for count in [0,1,8]:
            e(f'(async()=>{{await saveEntryContent({q(leaf)},c=>({{...c,links:Array.from({{length:{count}}},(_,i)=>({{id:"existing-"+i,url:"https://example.com/"+i,title:"Saved link "+i}}))}}))}})()')
            inspect(leaf,'links');e(f'contentInspector.select(entries.get({q(leaf)}),true);mobileContents.root.scrollTop=mobileContents.root.scrollHeight')
            check(e(f'document.querySelectorAll("#content-links > li").length==={count}'),f'{width}: fixture renders all {count} saved Links')
            if count:e('contentInspector.message("Link saved.")')
            e('document.getElementById("content-add-bookmark").click()');frame()
            label=f'{width}/{count} saved Links'
            visible('#content-bookmarks-empty','#content-quick-bookmark-url',label+' before keyboard')
            keyboard(width,height)
            visible('#content-bookmarks-empty','#content-quick-bookmark-url',label)
            if count==8:
                list_bounds=e("(()=>{const l=document.getElementById('content-links');return {overflow:getComputedStyle(l).overflowY,scroll:l.scrollHeight,client:l.clientHeight,form:contentInspector.quickBookmark.getBoundingClientRect().height,fields:contentInspector.quickBookmark.querySelector('.inline-editor-fields').getBoundingClientRect().height,section:l.parentElement.getBoundingClientRect().height}})()")
                check(list_bounds['overflow']=='auto' and list_bounds['scroll']>list_bounds['client'] and (height<240 or list_bounds['client']>20),label+': saved list owns remaining scrollable space: '+q(list_bounds))
                e('document.getElementById("content-links").scrollTop=0')
                swipe('#content-links')
                check(e('!panel.hidden&&mobileContents.state==="browse"&&!contentInspector.quickBookmark.hidden'),label+': list-origin swipe cannot collapse active editing')
                swipe('#content-bookmarks-empty .inline-editor-actions')
                check(e('!panel.hidden&&mobileContents.state==="browse"'),label+': editor-origin swipe cannot collapse')
                visible('#content-bookmarks-empty','#content-quick-bookmark-url',label+' after scrolling')
                shot('readiness-populated-link-composer-'+str(width))
                cdp.call('Input.insertText',text='javascript:alert(1)');tap('#content-quick-bookmark-save')
                wait_for("contentInspector.quickUrl.getAttribute('aria-invalid')==='true'")
                frame();visible('#content-bookmarks-empty','#content-quick-bookmark-url',label+' invalid URL',focused=False)
                check(e(f'contentInspector.content().links.length==={count}&&contentInspector.status.dataset.error==="true"'),label+': validation rejects unsafe URL without displacing input/actions')
                e("contentInspector.quickUrl.value='';contentInspector.quickUrl.dispatchEvent(new Event('input',{bubbles:true}))")
                tap('#content-quick-bookmark-url')
            cdp.call('Input.insertText',text=f'https://example.org/new-{width}-{count}')
            tap('#content-quick-bookmark-save')
            wait_for('contentInspector.quickBookmark.hidden&&contentInspector.jobs.size===0')
            check(e(f'contentInspector.content().links.length==={count+1}&&mobileContents.page==="links"&&contentInspector.content().links.slice(0,{count}).every((l,i)=>l.id==="existing-"+i)'),label+': Save appends once and preserves existing IDs/page')
            e('contentInspector.editLink(contentInspector.content().links[0])');frame()
            visible('#content-link-form','#content-link-url',label+' Edit')
            tap('#content-cancel-link')
            check(e(f'contentInspector.linkForm.hidden&&contentInspector.content().links.length==={count+1}&&mobileContents.page==="links"'),label+': Edit Cancel preserves saved data and page')
            e('contentInspector.addBookmark()');frame();tap('#content-cancel-quick-bookmark')
            check(e('contentInspector.quickBookmark.hidden&&mobileContents.page==="links"'),label+': Add Cancel restores read state')
            e("contentInspector.addBookmark();mobileContents.setPage('files')");frame()
            check(e("getComputedStyle(document.getElementById('content-links-section')).display==='none'&&getComputedStyle(mobileContents.root).overflowY==='auto'"),label+': inactive Link draft leaves Files visible and scrollable')
            e("mobileContents.setPage('links');contentInspector.cancelQuickBookmark()")
            restore()

        for page,activate,form,field,cancel in [
            ('notes','contentInspector.editNotes()','#content-notes-form','#content-notes','#content-cancel-notes'),
            ('location','contentInspector.editLocation()','#content-location-form','#content-location-input','#content-cancel-location')]:
            inspect(leaf,page);e(activate)
            if page=='notes':e("contentInspector.notes.value='Long note line. '.repeat(400)")
            else:e(f'contentInspector.locationInput.value={q("Library "+str(width))}')
            keyboard(width,height);visible(form,field,f'{width}/{page}')
            swipe(form+' .inline-editor-fields')
            check(e('!panel.hidden&&mobileContents.state==="browse"'),f'{width}/{page}: field area owns its gesture')
            if page=='notes':check(e('contentInspector.notes.scrollHeight>contentInspector.notes.clientHeight'),f'{width}: long note remains internally scrollable')
            tap(form+' button[type=submit]');wait_for(f'document.querySelector({q(form)}).hidden&&contentInspector.jobs.size===0')
            check(e('contentInspector.content().notes.text==="Long note line. ".repeat(400)') if page=='notes' else e(f'entries.get({q(leaf)}).location.text==={q("Library "+str(width))}'),f'{width}/{page}: native Save retains exact content')
            e(activate);frame();visible(form,field,f'{width}/{page} reopened')
            tap(cancel);check(e(f'document.querySelector({q(form)}).hidden&&mobileContents.page==={q(page)}'),f'{width}/{page}: Cancel retains page')
            restore()
        inspect(leaf,'links');e('contentInspector.addBookmark()');keyboard(width,height)
        swipe('#close-inspector-button')
        wait_for('panel.hidden')
        check(e('mobileContents.state==="compact"'),f'{width}: intentional handle swipe still collapses during editing')
        restore()

