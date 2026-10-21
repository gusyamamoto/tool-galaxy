"""Dismiss canonical completed lists, preserve content, consume UI state on new work."""
import json
import urllib.request


def run_task_dismissal_checks(*,cdp,e,check,wait_for,add,shot):
    q=json.dumps
    frame='new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'
    travel=add('Travel');japan=add('Japan',travel);add('Photos',japan);add('Places',japan)
    def create(name,names):
        e(f'createChildEntry({q(japan)},true);fields[0].value={q(name)};document.getElementById("task-list-tasks").value={q(chr(10).join(names))};form.requestSubmit();applicationCommandTail')
        wait_for('!dialog.open&&!formSaveBusy');return e('selectedNode.dataset.entryId')
    trip=create('Before the trip',['Buy flight','Book hotel','Rent car','Buy eSIM'])
    shopping=create('Shopping',['Bread','Milk','Coffee','Tea'])
    other=create('Other completed list',['Finished'])
    tasks=e(f'galaxyModel.childrenOf(entries,{q(trip)}).map(x=>x.id)');flight=tasks[0]
    e(f'(async()=>{{selectEntry(entries.get({q(trip)}),nodes.get({q(trip)}),{{reframe:false,openInspector:true}});await contentInspector.upload([new File(["Keep the original file"],"itinerary.txt",{{type:"text/plain"}})]);for(const id of [{q(trip)},{q(flight)}]){{await saveEntryContent(id,c=>({{...c,notes:{{format:"plain",text:"Booking details"}},links:[{{id:"trip-link",url:"https://example.com/"}}]}}));await saveEntryLocation(id,{{text:"Tokyo Station"}});}}}})()')
    file_key=e(f'entries.get({q(trip)}).content.attachments[0].storageKey')
    for task in tasks+e(f'[galaxyModel.childrenOf(entries,{q(other)})[0].id,...galaxyModel.childrenOf(entries,{q(shopping)}).slice(0,2).map(x=>x.id)]'):
        e(f'changeTask({q(task)},"completed",true)');wait_for('camera.frame===null')
    def row(id):return f'#tasks-view [data-task-list-id="{id}"]'
    def shown(id):return e(f'!!document.querySelector({q(row(id))})')
    def click(selector,touch=False):
        e(f'document.querySelector({q(selector)}).scrollIntoView({{block:"nearest"}});{frame}')
        point=e(f'(()=>{{const r=document.querySelector({q(selector)}).getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}}}})()')
        if touch:
            cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point]);cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
        else:
            cdp.call('Input.dispatchMouseEvent',type='mouseMoved',**point)
            cdp.call('Input.dispatchMouseEvent',type='mousePressed',button='left',clickCount=1,**point)
            cdp.call('Input.dispatchMouseEvent',type='mouseReleased',button='left',clickCount=1,**point)
        e('applicationCommandTail');e(frame)
    def hide(id,touch=False):
        click(row(id)+' .tasks-list-more',touch)
        check(e(f'!contextMenu.hidden&&contextMenu.dataset.tasksListId==={q(id)}&&[...contextMenu.querySelectorAll("button:not([hidden])")].map(x=>x.textContent).join("|")==="Hide from Tasks"'),'completed row offers one view-management action')
        click('#entry-context-menu [data-action="hide-from-tasks"]',touch)
    def reload():
        cdp.call('Page.reload',ignoreCache=True)
        wait_for('document.readyState==="complete"&&typeof tasksView!=="undefined"&&entries.size>0')
        wait_for('physics.settled',timeout=25);e('applicationCommandTail');e('physics.pause();camera.stopAnimation();hierarchySidebar.setCollapsed(false)');e(frame)
    e(f'physics.pause();camera.stopAnimation();hierarchySidebar.expanded=new Set([{q(travel)},{q(japan)},{q(trip)}]);hierarchySidebar.render();hierarchySidebar.setCollapsed(false);tasksView.completedSection.setCollapsed(false);selectEntry(entries.get({q(japan)}),nodes.get({q(japan)}),{{reframe:false,openInspector:false}});saveGalaxy()');e(frame)
    check(e(f'document.querySelector({q(row(shopping)+" .tasks-list-more")}).hidden&&!document.querySelector({q(row(trip)+" .tasks-list-more")}).hidden'),'only completed rows expose the More action')
    e(f'openContextMenu({q(shopping)},100,200)')
    check(e('contextMenu.querySelector("[data-action=hide-from-tasks]").hidden'),'active Universe management menu does not offer Hide from Tasks')
    e(f'closeContextMenu();selectEntry(entries.get({q(japan)}),nodes.get({q(japan)}),{{reframe:false,openInspector:false}})');e(frame)

    click(row(trip)+' .tasks-list-more')
    check(e('document.activeElement===contextMenu.querySelector("[data-action=hide-from-tasks]")'),'completed More focuses the accessible Hide menu item')
    cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
    cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Escape',code='Escape',windowsVirtualKeyCode=27)
    check(e(f'contextMenu.hidden&&document.activeElement===tasksView.rows.get({q(trip)}).more&&tasksView.rows.get({q(trip)}).more.ariaExpanded==="false"'),'Escape closes dismissal menu and restores More focus')
    before=e('JSON.stringify({raw:localStorage.getItem("galaxy:user-data"),entries:[...entries],view:camera.view,selected:selectedNode?.dataset.entryId})')
    hide(trip)
    check(not shown(trip) and shown(other),'Hide removes only the chosen completed list from Tasks')
    check(e('JSON.stringify({raw:localStorage.getItem("galaxy:user-data"),entries:[...entries],view:camera.view,selected:selectedNode?.dataset.entryId})')==before,'hiding changes no Universe metadata, canonical entries, hierarchy, selection or camera')
    check(e(f'hierarchySidebar.rows.get({q(trip)}).isConnected&&galaxyModel.search(entries,"Before the trip").some(x=>x.id==={q(trip)})'),'hidden completed list remains in Universe and searchable')
    check(e(f'taskStates.get({q(trip)}).complete&&nodes.get({q(trip)}).style.getPropertyValue("--task-ratio")==="1"&&galaxyModel.childrenOf(entries,{q(trip)}).every(x=>x.completed===true)'),'hidden completed list and all tasks retain alive/completed state')
    check(e(f'(async()=>await(await attachmentStore.get({q(file_key)})).blob.text())()')=='Keep the original file','Hide preserves original attachment bytes')
    check(e(f'entries.get({q(trip)}).content.notes.text==="Booking details"&&entries.get({q(flight)}).location.text==="Tokyo Station"'),'Hide preserves list/task Notes Links Location and files')
    check(e(f'persistence.preferences.load().hiddenCompletedTaskListIds.includes({q(trip)})&&!tasksView.activeSection.collapsed&&!tasksView.completedSection.collapsed'),'dismissed ID persists separately without changing group disclosures')
    check(e('document.activeElement===tasksView.completedToggle'),'Hide returns keyboard focus to the Completed group')
    reload()
    check(not shown(trip) and shown(other),'hidden state survives browser refresh while ordinary completed lists remain')
    # A fresh app tab has no injected fixture scripts and reads only persisted data.
    url=e('location.href');target=cdp.call('Target.createTarget',url=url)['targetId']
    host,port=cdp.sock.getpeername()[:2]
    pages=json.load(urllib.request.urlopen(f'http://{host}:{port}/json'))
    fresh=cdp.__class__(next(page['webSocketDebuggerUrl'] for page in pages if page['id']==target))
    try:
        fresh.call('Runtime.enable')
        import time
        until=time.monotonic()+30
        while not fresh.evaluate('typeof tasksView!=="undefined"&&typeof entries!=="undefined"&&entries.size>0'):
            assert time.monotonic()<until;time.sleep(.1)
        check(fresh.evaluate(f'entries.has({q(trip)})&&tasksView.dismissals.ids.has({q(trip)})&&!document.querySelector({q(row(trip))})'),'fresh app tab restores dismissal from local preferences')
    finally:
        fresh.sock.close();cdp.call('Target.closeTarget',targetId=target);cdp.call('Page.bringToFront')
    e(f'selectEntry(entries.get({q(flight)}),nodes.get({q(flight)}),{{reframe:false,openInspector:true}})')
    click('#content-task-done')
    check(shown(trip) and e(f'tasksView.rows.get({q(trip)}).item.parentElement===tasksView.active&&tasksView.rows.get({q(trip)}).summary.textContent==="3/4"'),'Contents uncheck returns hidden list to Active with correct progress')
    check(e(f'!tasksView.dismissals.ids.has({q(trip)})&&!persistence.preferences.load().hiddenCompletedTaskListIds.includes({q(trip)})'),'becoming active consumes persisted dismissal')
    click('#content-task-done');wait_for('camera.frame===null')
    check(shown(trip) and e(f'tasksView.rows.get({q(trip)}).item.parentElement===tasksView.completed'),'re-completion appears normally in Completed')
    hide(trip)
    extra=add('Check passport',trip)
    check(shown(trip) and e(f'tasksView.rows.get({q(trip)}).summary.textContent==="4/5"&&!tasksView.dismissals.ids.has({q(trip)})'),'new incomplete task restores hidden list and clears dismissal')
    e(f'changeTask({q(extra)},"completed",true)');wait_for('camera.frame===null')
    check(e(f'tasksView.rows.get({q(trip)}).item.parentElement===tasksView.completed'),'completion after adding work remains visible in Completed')
    e('hierarchySidebar.setCollapsed(false)');hide(trip);hide(other)
    check(e('tasksView.completed.children.length===0&&tasksView.completed.clientHeight===0&&!tasksView.completedGroup.hidden&&!tasksView.completedSection.collapsed'),'empty Completed group remains compact and respects its saved disclosure')
    check(shown(shopping) and e('!tasksView.activeSection.collapsed'),'hiding all completed lists leaves Active unchanged')
    e(f'(async()=>{{const backup=await cosmifoldBackup.create(universeRepository);await cosmifoldRestore.restore(await cosmifoldRestore.inspect(backup.blob),universeRepository)}})()');reload()
    check(not shown(trip) and e(f'taskStates.get({q(trip)}).complete&&entries.get({q(trip)}).content.attachments.length===1'),'Backup/Restore retains dismissal plus canonical completed content')
    check(e(f'!tasksView.hideCompleted({q(shopping)})&&!tasksView.dismissals.ids.has({q(shopping)})'),'dismissal handler rejects active lists even when invoked directly')
    # Native touch More -> Hide at all requested phone widths.
    cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=5)
    for width in [360,390,430]:
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=844,deviceScaleFactor=1,mobile=True)
        e(f'changeTask({q(flight)},"completed",false)');wait_for('camera.frame===null')
        e(f'changeTask({q(flight)},"completed",true)');wait_for('camera.frame===null')
        e('hierarchySidebar.setCollapsed(false)');e(frame)
        check(shown(trip) and e('sidebarPaneSplit.handle.hidden'),'mobile re-completed list returns with no splitter: '+str(width))
        check(e(f'(()=>{{const r=tasksView.rows.get({q(trip)}).more.getBoundingClientRect();return r.width===44&&r.height===44}})()'),'mobile More keeps a 44px touch target: '+str(width))
        click(row(trip)+' .tasks-list-more',True)
        check(e('(()=>{const r=contextMenu.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()'),'Hide menu fits mobile viewport: '+str(width))
        shot('hide-from-tasks-'+str(width))
        click('#entry-context-menu [data-action="hide-from-tasks"]',True)
        check(not shown(trip) and e(f'entries.get({q(trip)}).taskList&&taskStates.get({q(trip)}).complete'),'native touch hides only secondary row: '+str(width))
    check(not cdp.errors,'no dismissal browser exceptions')
