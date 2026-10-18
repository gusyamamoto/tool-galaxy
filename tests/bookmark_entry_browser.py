"""On-demand bookmark UI through native touch/key events in an isolated local profile."""
import json


def run_bookmark_entry_checks(*,cdp,evaluate,check,wait_for,add,shot,baseline=False):
    root=add('Bookmarks');owner=add('Reading',root)
    wait_for('physics.settled');evaluate('physics.pause()')

    def tap(selector):
        if mobile:
            selector={'#content-notes-empty':'#content-browse-add-note','#content-add-files':'#content-browse-add-file'}.get(selector,selector)
            page=evaluate(f"document.querySelector({json.dumps(selector)})?.closest('[data-contents-page]')?.dataset.contentsPage")
            if page:evaluate(f"mobileContents.setPage({json.dumps(page)})")
        evaluate(f"document.querySelector({json.dumps(selector)}).scrollIntoView({{block:'nearest'}});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")
        p=evaluate(f"(()=>{{const r=document.querySelector({json.dumps(selector)}).getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}};}})()")
        if mobile:
            cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
            cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
        else:
            cdp.call('Input.dispatchMouseEvent',type='mousePressed',button='left',clickCount=1,**p)
            cdp.call('Input.dispatchMouseEvent',type='mouseReleased',button='left',clickCount=1,**p)

    def key(name,code):
        cdp.call('Input.dispatchKeyEvent',type='keyDown',key=name,code=name,windowsVirtualKeyCode=code,**({'text':'\r','unmodifiedText':'\r'} if name=='Enter' else {}))
        cdp.call('Input.dispatchKeyEvent',type='keyUp',key=name,code=name,windowsVirtualKeyCode=code)

    def value(text):
        evaluate(f"contentInspector.quickUrl.value={json.dumps(text)};contentInspector.quickUrl.dispatchEvent(new Event('input',{{bubbles:true}}))")

    for width,height in [(360,800),(390,844),(430,932),(1440,1000)]:
        label=f'{width}x{height}';mobile=width<1000
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=mobile)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=mobile,maxTouchPoints=1)
        wait_for('hierarchySidebar.narrow' if mobile else '!hierarchySidebar.narrow')
        evaluate(f"hierarchySidebar.setCollapsed(true);focusEntry({json.dumps(owner)},{{openInspector:true}})")
        wait_for('camera.frame===null')
        evaluate(f"(async()=>{{await contentInspector.save({json.dumps(owner)},current=>({{...current,links:[]}}));await contentInspector.saveLocation({json.dumps(owner)},null);contentInspector.select(entries.get({json.dumps(owner)}),true);setInspectorOpen(true);physics.pause();panel.scrollTop=0;}})()")
        if mobile:
            evaluate("mobileContents.setPage('links')")
            check(evaluate("document.getElementById('bookmarks-heading').textContent==='Links'&&contentInspector.quickUrl.getAttribute('aria-label')==='Link address'"), 'mobile Links page and URL field use link terminology: '+label)
        evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        print('Inline entry layout '+label+': '+json.dumps(evaluate("(()=>{const s=document.querySelector('[aria-labelledby=bookmarks-heading]').getBoundingClientRect(),l=document.getElementById('content-location-section').getBoundingClientRect();return {bookmarks:s.height,location:l.height,panelHeight:panel.clientHeight};})()")),flush=True)
        shot('bookmarks-empty-'+label)
        if baseline:continue
        if mobile:
            rhythm=[]
            for page,selector in [('files','#content-browse-add-file'),('notes','#content-browse-add-note'),('links','#content-add-bookmark'),('location','#content-add-location')]:
                evaluate(f"mobileContents.setPage({json.dumps(page)})")
                rhythm.append(evaluate("(()=>{const row=document.querySelector("+json.dumps(selector)+"),r=row.getBoundingClientRect(),h=row.closest('section').querySelector('h3').getBoundingClientRect(),style=getComputedStyle(row);return {rowHeight:r.height,textLeft:r.left,labelToRow:r.top-h.bottom,font:[style.fontSize,style.fontWeight,style.lineHeight,style.color]};})()"))
            print('Empty Contents rhythm '+label+': '+json.dumps(rhythm),flush=True)
            first=rhythm[0]
            check(all(all(abs(row[key]-first[key])<.6 for key in ['labelToRow','rowHeight','textLeft']) and row['font']==first['font'] for row in rhythm),'all four pages share heading/add-row rhythm and typography: '+label)
            check(first['rowHeight']>=44,'shared add rows retain comfortable touch targets: '+label)
            evaluate("mobileContents.setPage('links')")
        expected='Add link…' if mobile else 'Paste a link…'
        check(evaluate(f"contentInspector.quickBookmark.hidden&&contentInspector.linkForm.hidden&&document.getElementById('content-add-bookmark').textContent==={json.dumps(expected)}&&!document.getElementById('content-bookmarks-placeholder').hidden&&contentInspector.quickUrl.getClientRects().length===0"),'collapsed link entry stays lightweight without an unused input: '+label)
        check(evaluate("document.querySelectorAll('.content-inline-section > header button').length===0&&document.getElementById('content-add-location').textContent==='Add location…'"),'inline entry has no separate header Add controls: '+label)
        tap('#content-add-bookmark')
        check(evaluate("!contentInspector.quickBookmark.hidden&&document.activeElement===contentInspector.quickUrl&&contentInspector.linkForm.hidden&&!document.querySelector('dialog[open]')"),'Paste a link immediately focuses inline URL entry: '+label)
        shot('bookmarks-entry-'+label)
        key('Escape',27)
        check(evaluate("contentInspector.quickBookmark.hidden&&!panel.hidden&&document.activeElement.id==='content-add-bookmark'&&!document.getElementById('content-bookmarks-placeholder').hidden"),'Escape cancels an empty entry, retains Contents and restores action focus: '+label)
        tap('#content-add-bookmark');tap('#content-cancel-quick-bookmark')
        check(evaluate('contentInspector.quickBookmark.hidden&&contentInspector.content().links.length===0'),'Cancel restores compact empty state: '+label)
        tap('#content-add-bookmark');key('Enter',13)
        check(evaluate('contentInspector.quickBookmark.hidden&&contentInspector.content().links.length===0'),'empty Enter collapses bookmark entry without a save: '+label)
        tap('#content-add-bookmark');tap('#content-add-location')
        check(evaluate('contentInspector.quickBookmark.hidden&&!contentInspector.locationForm.hidden&&document.activeElement===contentInspector.locationInput'),'leaving empty bookmark entry collapses without stealing Location focus: '+label)
        key('Escape',27)
        tap('#content-add-bookmark');value('javascript:alert(1)')
        evaluate('contentInspector.quickBookmark.requestSubmit()')
        wait_for("contentInspector.quickUrl.getAttribute('aria-invalid')==='true'")
        check(evaluate("contentInspector.content().links.length===0&&!contentInspector.quickBookmark.hidden&&contentInspector.status.dataset.error==='true'"),'unsafe URL retains existing validation and does not save: '+label)
        value('example.com');tap('#content-quick-bookmark-url');key('Enter',13)
        wait_for('contentInspector.content().links.length===1&&contentInspector.jobs.size===0&&contentInspector.quickBookmark.hidden')
        check(evaluate("contentInspector.content().links[0].url==='https://example.com/'&&document.querySelector('#content-links a').textContent==='example.com'&&contentInspector.quickUrl.getClientRects().length===0&&!document.getElementById('content-add-bookmark').hidden"),'Enter saves normalized URL and returns to read state: '+label)
        original=evaluate('contentInspector.content().links[0].id')
        tap('#content-add-bookmark');value('https://example.org/reading');tap('#content-quick-bookmark-save')
        wait_for('contentInspector.content().links.length===2&&contentInspector.jobs.size===0&&contentInspector.quickBookmark.hidden')
        check(evaluate('document.querySelectorAll("#content-links a").length===2'),'another bookmark is added inline without replacing existing links: '+label)
        tap('#content-links .content-item-menu summary');tap('#content-links button[aria-label^="Edit link"]')
        check(evaluate("!contentInspector.linkForm.hidden&&contentInspector.quickBookmark.hidden&&document.activeElement.id==='content-link-url'"),'existing bookmark Edit still opens its URL/title form: '+label)
        evaluate("document.getElementById('content-link-title').value='Reading list';contentInspector.linkForm.requestSubmit()")
        wait_for('contentInspector.linkForm.hidden&&contentInspector.jobs.size===0')
        check(evaluate(f"contentInspector.content().links[0].id==={json.dumps(original)}&&document.querySelector('#content-links a').textContent==='Reading list'"),'editing preserves the original bookmark ID and saves its title: '+label)
        tap('#content-links li:nth-child(2) summary');tap('#content-links li:nth-child(2) button[aria-label^="Remove link"]')
        wait_for('contentInspector.content().links.length===1&&contentInspector.jobs.size===0')
        check(evaluate('contentInspector.quickBookmark.hidden&&contentInspector.linkForm.hidden'),'removal leaves existing bookmarks and no permanent input: '+label)
        tap('#content-add-location')
        check(evaluate('!contentInspector.locationForm.hidden&&document.activeElement===contentInspector.locationInput'),'Add location row focuses the existing place/address input: '+label)
        shot('location-entry-'+label)
        tap('#content-cancel-location')
        check(evaluate("contentInspector.locationForm.hidden&&!document.getElementById('content-location-empty').hidden"),'Location Cancel returns to its lightweight row: '+label)
        tap('#content-add-location');tap('#content-notes-empty')
        check(evaluate('contentInspector.locationForm.hidden&&!contentInspector.notesForm.hidden'),'leaving empty Location preserves the next section action: '+label)
        tap('#content-cancel-notes')
        evaluate('window.inlinePickerClick=contentInspector.files.click;window.inlinePickerCount=0;contentInspector.files.click=()=>inlinePickerCount++')
        tap('#content-add-location');tap('#content-add-files')
        check(evaluate('contentInspector.locationForm.hidden&&inlinePickerCount===1'),'empty-entry collapse preserves the existing file-picker action: '+label)
        evaluate("contentInspector.files.click=inlinePickerClick;contentInspector.files.dispatchEvent(new Event('cancel'))")
        if mobile:
            tap('#content-add-location');tap('#entry-add-button')
            check(evaluate(f"contentInspector.locationForm.hidden&&!addMenu.hidden&&addMenuTargetId==={json.dumps(owner)}"),'empty-entry collapse preserves the same-CB Add menu: '+label)
            key('Escape',27)
        tap('#content-add-location');tap('#content-location-form button[type=submit]')
        check(evaluate(f"contentInspector.locationForm.hidden&&!entries.get({json.dumps(owner)}).location"),'empty Location Save collapses without modifying data: '+label)
        tap('#content-add-location');tap('#content-add-bookmark')
        check(evaluate('contentInspector.locationForm.hidden&&!contentInspector.quickBookmark.hidden&&document.activeElement===contentInspector.quickUrl'),'leaving empty Location collapses without stealing bookmark focus: '+label)
        key('Escape',27)
        tap('#content-add-location')
        evaluate("contentInspector.locationInput.value='Library'")
        key('Enter',13)
        wait_for('contentInspector.locationForm.hidden&&contentInspector.jobs.size===0')
        check(evaluate(f"entries.get({json.dumps(owner)}).location.text==='Library'&&document.getElementById('content-location-text').textContent==='Library'&&!document.getElementById('content-location-view').hidden&&document.getElementById('content-location-maps').href.includes('Library')"),'Location Enter saves through the existing model and maps link: '+label)
        tap('#content-edit-location');evaluate("contentInspector.locationInput.value='Discard this'");key('Escape',27)
        check(evaluate(f"entries.get({json.dumps(owner)}).location.text==='Library'&&contentInspector.locationForm.hidden"),'Location Escape preserves the saved value: '+label)
        shot('inline-entry-saved-'+label)
        if mobile:
            for page,selector in [('links','#content-add-bookmark'),('files','#content-browse-add-file'),('location','#content-edit-location')]:
                evaluate(f"mobileContents.setPage({json.dumps(page)})")
                check(evaluate(f"document.querySelector({json.dumps(selector)}).getBoundingClientRect().height>=44"),'entry and saved-location touch target '+page+': '+label)
    if not baseline:
        cdp.call('Page.reload');wait_for('document.readyState==="complete"&&typeof contentInspector!=="undefined"')
        check(evaluate(f"entries.get({json.dumps(owner)}).content.links.length===1&&entries.get({json.dumps(owner)}).content.links[0].title==='Reading list'"),'saved bookmark survives a real local reload')
        check(evaluate(f"entries.get({json.dumps(owner)}).location.text==='Library'"),'saved Location survives a real local reload')
        check(not cdp.errors,f'no bookmark browser exceptions: {cdp.errors}')
