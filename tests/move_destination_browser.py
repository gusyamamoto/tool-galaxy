"""Move browsing/search through the existing form in an isolated local browser."""
import json


def run_move_destination_checks(*, cdp, evaluate, check, wait_for, add, shot):
    q=json.dumps
    root=add('My Galaxy');food=add('Food',root);owner=add('Chicken',food);child=add('Roast',owner)
    a=add('Recipes',food);work=add('Work',root);client=add('Client A',work);b=add('Recipes',client)
    deep=client
    for i in range(6):deep=add(('Long destination ancestry '+str(i)+' ')*2,deep)
    needle=add('Deep Needle destination',deep)
    wait_for('physics.settled');evaluate('physics.pause();saveGalaxy()');evaluate('applicationCommandTail')
    mobile=False

    def tap(selector):
        evaluate(f"document.querySelector({q(selector)}).scrollIntoView({{block:'nearest'}});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
        p=evaluate(f"(()=>{{const n=document.querySelector({q(selector)}),r=n.getBoundingClientRect();const p={{x:r.x+r.width/2,y:r.y+r.height/2}};if(!n.contains(document.elementFromPoint(p.x,p.y)))throw Error('Move control is obscured: '+{q(selector)});return p;}})()")
        if mobile:
            cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
        else:
            cdp.call('Input.dispatchMouseEvent',type='mousePressed',button='left',clickCount=1,**p)
            cdp.call('Input.dispatchMouseEvent',type='mouseReleased',button='left',clickCount=1,**p)

    def search(value):
        evaluate(f"moveDestinationSearch.value={q(value)};moveDestinationSearch.dispatchEvent(new Event('input',{{bubbles:true}}))")

    def choice(entry_id):return '#move-destination-results [data-entry-id='+q(entry_id)+']'
    def expand(entry_id):return '#move-destination-results [data-expand-id='+q(entry_id)+']'

    def open_move():
        evaluate(f"closeContentMenus();closeContextMenu();openContextMenu({q(owner)},200,150)")
        if evaluate("contextMenu.dataset.view==='quick'"):evaluate("contextMenu.querySelector('[data-action=more]').click()")
        evaluate("contextMenu.querySelector('[data-action=move]').click()")
        wait_for('dialog.open')

    for width,height in [(360,800),(390,844),(430,932),(740,360),(1440,1000)]:
        mobile=width<1000;tag=f'{width}x{height}'
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=mobile)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=mobile,maxTouchPoints=1)
        evaluate('window.dispatchEvent(new Event("resize"))')
        wait_for('hierarchySidebar.narrow' if mobile else '!hierarchySidebar.narrow')
        evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        wait_for('camera.frame===null')
        open_move()
        check(evaluate(f"editingId==={q(owner)}&&document.getElementById('add-entry-title').textContent==='Move “Chicken” to…'&&document.activeElement===moveDestinationSearch"),'same Move form names the source and focuses search: '+tag)
        check(evaluate("document.getElementById('parent-select-controls').hidden&&submitButton.disabled&&moveDestinationPicker.destinationId===undefined"),'flat dropdown is replaced and confirmation requires a destination: '+tag)
        check(evaluate("document.querySelector('.move-selection').hidden&&document.querySelector('.move-selection').getBoundingClientRect().height===0&&document.getElementById('move-destination-selection').textContent===''"),'unselected summary is absent without placeholder text or reserved height: '+tag)
        check(evaluate("document.getElementById('move-current-location').textContent==='My Galaxy › Food'"),'current parent/path is clearly identified: '+tag)
        check(evaluate(f"moveDestinationPicker.choices.expanded.has({q(root)})&&moveDestinationPicker.choices.expanded.has({q(food)})&&!moveDestinationPicker.choices.expanded.has({q(work)})"),'only the current-parent path starts expanded: '+tag)
        check(evaluate(f"!moveDestinationPicker.index.entries.has({q(owner)})&&!moveDestinationPicker.index.entries.has({q(child)})&&moveDestinationPicker.index.entries.has({q(b)})"),'legal destinations exclude self and descendants: '+tag)
        check(evaluate(f"document.querySelector({q(choice(food))}).ariaDisabled==='true'&&document.querySelector({q(choice(food))}).textContent.includes('Current location')"),'current parent cannot be mistaken for a new choice: '+tag)
        layout=evaluate("""(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
            return {dialog:box(dialog),search:box(moveDestinationSearch),scroll:box(document.getElementById('move-destination-scroll')),summary:box(document.getElementById('move-destination-selection')),cancel:box(document.getElementById('cancel-add-entry')),confirm:box(submitButton),viewport:{width:innerWidth,height:innerHeight}}})()""")
        print('Move layout '+tag+': '+json.dumps(layout),flush=True)
        check(layout['dialog']['x']>=0 and layout['dialog']['right']<=width and layout['dialog']['y']>=0 and layout['dialog']['bottom']<=height,'picker fits the viewport: '+tag)
        check(layout['search']['height']>=44 and layout['scroll']['height']>=44 and layout['cancel']['height']>=44 and layout['confirm']['height']>=44 and layout['confirm']['bottom']<=layout['dialog']['bottom'] and layout['scroll']['bottom']<=layout['cancel']['y'],'search, scrolling choices and confirmation remain reachable without overlap: '+tag)
        check(evaluate("[...document.querySelectorAll('#move-destination-results .picker-choice,#move-destination-results .picker-expand:not([hidden])')].every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44})"),'rows and disclosure controls retain 44px targets: '+tag)
        shot('move-browse-'+tag)
        before=evaluate("JSON.stringify([...entries].map(([id,e])=>[id,e.parentId]))")
        tap(expand(work));check(evaluate(f"document.querySelector({q(choice(client))})!==null"),'expanding a branch reveals children: '+tag)
        tap(expand(work));check(evaluate(f"document.querySelector({q(choice(client))})===null"),'collapsing a branch hides descendants: '+tag)
        search('rEcIpEs')
        check(evaluate(f"JSON.stringify([...document.querySelectorAll('#move-destination-results [data-entry-id]')].map(e=>e.dataset.entryId))===JSON.stringify({q([a,b])})"),'case-insensitive search finds both duplicate names: '+tag)
        check(evaluate(f"document.querySelector({q(choice(a))}).textContent.includes('My Galaxy › Food')&&document.querySelector({q(choice(b))}).textContent.includes('My Galaxy › Work › Client A')"),'duplicate results carry distinguishing canonical paths: '+tag)
        check(evaluate("[...document.querySelectorAll('#move-destination-results .picker-choice')].every(row=>{const info=row.querySelector('.picker-entry-info'),name=row.querySelector('.picker-entry-name'),path=row.querySelector('small');return row.getBoundingClientRect().width>=moveDestinationSearch.getBoundingClientRect().width-2&&info.getBoundingClientRect().width>180&&name.clientWidth>=name.scrollWidth&&path.clientWidth>=path.scrollWidth})"),'duplicate result names and paths use the available width and remain readable: '+tag)
        tap(choice(b))
        check(evaluate(f"moveDestinationPicker.destinationId==={q(b)}&&parentField.value==={q(b)}&&!submitButton.disabled&&document.getElementById('move-destination-selection').textContent.includes('Recipes')&&document.getElementById('move-destination-selection').textContent.includes('Client A')"),'result selection stages the exact canonical destination and its path: '+tag)
        check(evaluate("JSON.stringify([...entries].map(([id,e])=>[id,e.parentId]))")==before,'selection alone never moves the body: '+tag)
        shot('move-search-'+tag)
        check(evaluate("(()=>{const s=document.getElementById('move-destination-selection');return !s.parentElement.hidden&&s.querySelector('strong').textContent==='Move to: Recipes'&&!s.querySelector('small').hidden&&s.querySelector('small').textContent==='My Galaxy › Work › Client A › Recipes'&&s.getBoundingClientRect().bottom<=document.getElementById('cancel-add-entry').getBoundingClientRect().top})()"),'duplicate selection shows a compact Move to summary and full path above buttons: '+tag)
        if width in [360,390,430]:
            evaluate(f"window.moveViewportDescriptor=Object.getOwnPropertyDescriptor(window,'visualViewport');Object.defineProperty(window,'visualViewport',{{configurable:true,value:{{width:{width},height:{height}*.55,offsetTop:0,offsetLeft:0}}}});mobileViewportChanged()")
            search('')
            keyboard=evaluate("(()=>{const r=dialog.getBoundingClientRect(),s=moveDestinationSearch.getBoundingClientRect(),c=submitButton.getBoundingClientRect(),list=document.getElementById('move-destination-scroll');return {top:r.top,bottom:r.bottom,visible:visualViewport.height,searchTop:s.top,confirmBottom:c.bottom,listHeight:list.clientHeight,scrollable:list.scrollHeight>list.clientHeight}})()")
            print('Move keyboard layout '+tag+': '+json.dumps(keyboard),flush=True)
            check(keyboard['top']>=0 and keyboard['bottom']<=keyboard['visible'] and keyboard['searchTop']>=0 and keyboard['confirmBottom']<=keyboard['visible'] and keyboard['listHeight']>=44 and keyboard['scrollable'],'keyboard-like visual viewport keeps search, scrolling choices and confirmation visible: '+tag)
            shot('move-keyboard-'+tag)
            evaluate("Object.defineProperty(window,'visualViewport',moveViewportDescriptor);delete window.moveViewportDescriptor;mobileViewportChanged()")
            search('rEcIpEs')
        tap(choice(b))
        check(evaluate("document.querySelector('.move-selection').hidden&&submitButton.disabled"),'deselecting hides the summary and disables confirmation: '+tag)
        search('NEEDLE');tap(choice(needle))
        check(evaluate("(()=>{const s=document.getElementById('move-destination-selection');return !s.parentElement.hidden&&s.querySelector('strong').textContent==='Move to: Deep Needle destination'&&s.querySelector('small').hidden&&s.parentElement.getBoundingClientRect().height===16})()"),'unique selection uses a single compact confirmation line: '+tag)
        check(evaluate(f"moveDestinationPicker.destinationId==={q(needle)}&&document.getElementById('move-destination-selection').title.endsWith('Deep Needle destination')&&document.querySelector({q(choice(needle))}).title.includes('Long destination ancestry 5')"),'deep search selects directly without manual branch expansion and preserves long paths: '+tag)
        search('Long destination ancestry 5')
        tap(choice(deep))
        check(evaluate("(()=>{const s=document.getElementById('move-destination-selection'),name=s.querySelector('strong');return !s.parentElement.hidden&&name.textContent.startsWith('Move to: Long destination ancestry 5')&&getComputedStyle(name).textOverflow==='ellipsis'&&name.getBoundingClientRect().right<=dialog.getBoundingClientRect().right&&getComputedStyle(name).overflowX==='hidden'&&s.parentElement.scrollWidth<=s.parentElement.clientWidth&&s.querySelector('small').hidden})()"),'long selected names truncate within the compact confirmation: '+tag)
        check(evaluate(f"(()=>{{const row=document.querySelector({q(choice(deep))}),name=row.querySelector('.picker-entry-name'),path=row.querySelector('small'),r=row.getBoundingClientRect(),s=document.getElementById('move-destination-scroll').getBoundingClientRect();return getComputedStyle(name).textOverflow==='ellipsis'&&getComputedStyle(path).display==='block'&&r.right<=s.right&&row.scrollWidth<=row.clientWidth}})()"),'long names and ancestry stay within their row without horizontal overflow: '+tag)
        shot('move-long-path-'+tag)
        search('Chicken');check(evaluate("document.querySelectorAll('#move-destination-results [data-entry-id]').length===0"),'self stays unavailable in search: '+tag)
        search('Roast');check(evaluate("document.querySelectorAll('#move-destination-results [data-entry-id]').length===0"),'descendants stay unavailable in search: '+tag)
        tap('#cancel-add-entry')
        check(evaluate('!dialog.open') and evaluate("JSON.stringify([...entries].map(([id,e])=>[id,e.parentId]))")==before,'Cancel preserves the complete hierarchy: '+tag)

    open_move();search('Recipes')
    cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Enter',code='Enter',windowsVirtualKeyCode=13)
    cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Enter',code='Enter',windowsVirtualKeyCode=13)
    check(evaluate(f"dialog.open&&document.activeElement.dataset.entryId==={q(a)}&&submitButton.disabled"),'Enter from search focuses results without confirming a move')
    cdp.call('Input.dispatchKeyEvent',type='keyDown',key=' ',code='Space',windowsVirtualKeyCode=32)
    cdp.call('Input.dispatchKeyEvent',type='keyUp',key=' ',code='Space',windowsVirtualKeyCode=32)
    check(evaluate(f"moveDestinationPicker.destinationId==={q(a)}&&entries.get({q(owner)}).parentId==={q(food)}"),'keyboard selection stages a destination without moving')
    cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
    cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Escape',code='Escape',windowsVirtualKeyCode=27)
    check(evaluate(f"!dialog.open&&entries.get({q(owner)}).parentId==={q(food)}"),'Escape cancels the staged destination without a move')
    open_move();search('Recipes');tap(choice(b))
    original=evaluate("localStorage.getItem('galaxy:user-data')")
    for invalid in [owner,child,'missing-destination']:
        evaluate(f"parentField.replaceChildren(new Option('Injected destination',{q(invalid)}));form.requestSubmit()")
        check(evaluate(f"dialog.open&&!formError.hidden&&entries.get({q(owner)}).parentId==={q(food)}") and evaluate("localStorage.getItem('galaxy:user-data')")==original,'confirmation independently rejects an invalid/tampered parent: '+invalid)
        evaluate(f'moveDestinationPicker.select({q(b)})')
    evaluate(f"entries.get({q(b)}).parentId={q(child)};form.requestSubmit()")
    check(evaluate(f"dialog.open&&!formError.hidden&&entries.get({q(owner)}).parentId==={q(food)}") and evaluate("localStorage.getItem('galaxy:user-data')")==original,'a destination moved into the source subtree after selection is rejected at confirmation')
    evaluate(f"entries.get({q(b)}).parentId={q(client)};moveDestinationPicker.select({q(b)})")
    evaluate(f"window.staleMoveTarget=entries.get({q(b)});entries.delete({q(b)});form.requestSubmit()")
    check(evaluate(f"dialog.open&&!formError.hidden&&entries.get({q(owner)}).parentId==={q(food)}"),'a destination removed after selection is rejected at confirmation')
    evaluate(f"entries.set({q(b)},staleMoveTarget);moveDestinationPicker.select({q(b)});window.moveRetainedEntry=entries.get({q(owner)})")
    evaluate("window.moveOriginalSave=universeRepository.save;universeRepository.save=async()=>{throw Error('Simulated save failure')}")
    tap('#entry-submit');wait_for('!formSaveBusy')
    check(evaluate(f"dialog.open&&!formError.hidden&&moveDestinationPicker.destinationId==={q(b)}&&!submitButton.disabled&&entries.get({q(owner)}).parentId==={q(food)}") and evaluate("localStorage.getItem('galaxy:user-data')")==original,'failed persistence retains the destination for retry and leaves model/storage unchanged')
    evaluate('universeRepository.save=moveOriginalSave')
    tap('#entry-submit');wait_for('!dialog.open&&!formSaveBusy');evaluate('applicationCommandTail')
    check(evaluate(f"entries.get({q(owner)})===moveRetainedEntry&&entries.get({q(owner)}).parentId==={q(b)}&&entries.get({q(child)}).parentId==={q(owner)}"),'Move here reparents once through the existing publisher while retaining canonical record/descendant identity')
    check(evaluate(f"JSON.parse(localStorage.getItem('galaxy:user-data')).entries.find(e=>e.id==={q(owner)}).parentId==={q(b)}"),'confirmed parent is persisted through the existing repository')
    open_move();tap('#move-to-universe');tap('#entry-submit');wait_for('!dialog.open&&!formSaveBusy')
    check(evaluate(f"entries.get({q(owner)}).parentId===null"),'Universe remains a supported explicit top-level destination')
    open_move();check(evaluate("document.getElementById('move-to-universe').disabled&&submitButton.disabled"),'a current top-level location cannot be confirmed as a new destination')
    tap('#cancel-add-entry')

    long_name='A long celestial body name for the Move destination heading'
    evaluate(f'renameEntry({q(owner)},{q(long_name)})')
    cdp.call('Emulation.setDeviceMetricsOverride',width=360,height=800,deviceScaleFactor=1,mobile=True)
    cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=1);mobile=True
    evaluate('window.dispatchEvent(new Event("resize"));new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    open_move()
    check(evaluate(f"document.getElementById('add-entry-title').textContent.includes({q(long_name)})&&dialog.scrollWidth<=dialog.clientWidth&&submitButton.getBoundingClientRect().bottom<=innerHeight"),'a long source name wraps without hiding confirmation or overflowing on a phone')
    shot('move-long-source-mobile');tap('#cancel-add-entry')
    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
    cdp.call('Emulation.setTouchEmulationEnabled',enabled=False,maxTouchPoints=1);mobile=False
    evaluate('window.dispatchEvent(new Event("resize"));new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    # Complete synthetic graph/UI state in this fresh test profile. No live data.
    evaluate(f"""window.syntheticMoveIds=[];for(let g=0;g<60;g++){{const id='move-group-'+g;syntheticMoveIds.push(id);entries.set(id,{{id,name:'Folder '+g,parentId:{q(work)}}});for(let i=0;i<20;i++){{const key=id+'-'+i;syntheticMoveIds.push(key);entries.set(key,{{id:key,name:'Destination ['+g+'] '+i,parentId:id}});}}}}syncPhysicsGraph({{updateUI:false,reheat:0}});syntheticMoveIds.forEach(id=>createEntryNode(entries.get(id)));syncPhysicsGraph({{reheat:0}});physics.pause();""")
    opened=evaluate(f"(()=>{{const start=performance.now();openEntryForm(entries.get({q(owner)}),null,false,'move');return performance.now()-start}})()")
    check(evaluate("document.querySelectorAll('#move-destination-results [data-entry-id]').length<10&&moveDestinationPicker.index.entries.size>1200"),'large hierarchy opens as compact roots rather than a fully expanded list')
    timings=evaluate("""(()=>{const timings=[];for(let i=0;i<20;i++){const start=performance.now();moveDestinationSearch.value='destination ['+i+']';moveDestinationSearch.dispatchEvent(new Event('input',{bubbles:true}));timings.push(performance.now()-start)}return timings})()""")
    print('Large Move hierarchy: '+json.dumps({'entries':evaluate('entries.size'),'openMs':opened,'searchRenderMaxMs':max(timings),'searchRenderMeanMs':sum(timings)/len(timings)}),flush=True)
    check(max(timings)<500 and evaluate("document.querySelectorAll('#move-destination-results [data-entry-id]').length===20"),'large-tree searches render only matching destinations within a bounded interaction budget')
    broad=evaluate("(()=>{const start=performance.now();moveDestinationSearch.value='Destination [';moveDestinationSearch.dispatchEvent(new Event('input',{bubbles:true}));return performance.now()-start})()")
    print('Broad query with 1200 results: '+str(broad)+'ms',flush=True)
    check(broad<500 and evaluate("document.querySelectorAll('#move-destination-results [data-entry-id]').length===1200"),'broad queries remain usable without hiding matching destinations')
    search('destination [59]')
    shot('move-large-desktop');tap('#cancel-add-entry')
    evaluate('syntheticMoveIds.forEach(id=>{entries.delete(id);nodes.get(id)?.remove();nodes.delete(id)});syncPhysicsGraph({reheat:0});physics.pause()')
    check(not cdp.errors,f'no Move destination browser exceptions: {cdp.errors}')
