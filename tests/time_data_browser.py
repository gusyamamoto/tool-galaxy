"""Time editors and coordinated canonical writes in disposable real browser storage."""
import json
import time


def run_time_data_checks(*,cdp,cdp_class,e,check,wait_for,add,click,shot,origin):
    q=json.dumps
    galaxy=add('Time foundation')
    item=add('Japan Trip',galaxy)
    destination=add('Other system',galaxy)

    def select(id):
        e(f'closeContextMenu();selectEntry(entries.get({q(id)}),nodes.get({q(id)}),{{reframe:false,openInspector:true}});physics.pause();graphNeedsSave=false')

    def ready(client=cdp):
        deadline=time.monotonic()+30
        while not client.evaluate("document.readyState==='complete'&&typeof cameraViewReady!=='undefined'&&cameraViewReady"):
            assert time.monotonic()<deadline,'Workspace did not initialize'
            time.sleep(.05)
        client.evaluate('physics.pause();applicationCommandTail');client.evaluate('universeRepository.whenIdle()');client.evaluate('graphNeedsSave=false')

    def stored(id,key):
        return e(f'JSON.parse(localStorage.getItem("galaxy:user-data")).entries.find(x=>x.id==={q(id)})[{q(key)}]??null')

    def open_editor():
        e("document.getElementById('content-time-value').scrollIntoView({block:'nearest'})")
        click('#content-time-value')
        check(e('timeEditor.dialog.open&&document.activeElement===timeEditor.start'),'metadata value opens shared editor with native date focused')

    def values(date,clock='',end=None):
        e(f'timeEditor.form.elements.dateMode.value={q("range" if end is not None else "single")};timeEditor.mode();timeEditor.start.value={q(date)};timeEditor.clock.value={q(clock)};timeEditor.end.value={q(end or "")}')

    def save():
        e('timeEditor.form.requestSubmit();applicationCommandTail');wait_for('!timeEditor.pending')
        check(e('!timeEditor.dialog.open'),'Save closes only after acknowledged canonical write')

    def remove():
        click('#content-time-remove');e('applicationCommandTail');wait_for('!timeEditor.removing')

    select(galaxy)
    check(e("!timeEditor.row.hidden&&document.getElementById('content-time-label').textContent==='WHEN'"),'Galaxy supports optional When; Universe receives no new record')
    select(item)
    check(e("document.getElementById('content-time-value').textContent==='Add date…'"),'older Item has lightweight Add date placeholder')
    open_editor();values('2026-10-28');save()
    check(stored(item,'when')=={'startDate':'2026-10-28','endDate':None,'time':None},'single date stored literally')
    check(e("document.getElementById('content-time-value').textContent.includes('2026')&&!document.getElementById('content-time-edit').hidden&&!document.getElementById('content-time-remove').hidden"),'friendly value exposes compact edit/remove')
    open_editor();values('2026-10-28','14:30');save()
    check(stored(item,'when')=={'startDate':'2026-10-28','endDate':None,'time':'14:30'},'single date optional local clock stored literally')
    shot('time-desktop-when-row')
    open_editor();values('2026-11-12','14:30','2026-11-25')
    check(e("timeEditor.clock.disabled&&document.getElementById('time-clock-field').hidden&&timeEditor.end.required"),'range disables clock and requires an end date')
    shot('time-desktop-range-editor');save()
    range_value={'startDate':'2026-11-12','endDate':'2026-11-25','time':None}
    check(stored(item,'when')==range_value,'range stores no clock even after switching from timed single mode')
    open_editor();values('2026-11-25',end='2026-11-12');e('timeEditor.form.requestSubmit()')
    check(e('timeEditor.dialog.open&&!timeEditor.error.hidden'),'backward range stays editable with visible validation')
    check(stored(item,'when')==range_value,'invalid range does not touch canonical dates')
    click('#time-editor-cancel')
    check(e("document.activeElement===document.getElementById('content-time-value')"),'Cancel returns focus to originating metadata control')
    open_editor();values('2026-12-01');click('#time-editor-cancel')
    check(stored(item,'when')==range_value,'Cancel discards draft')
    open_editor();values('2026-12-02')
    cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
    cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Escape',code='Escape',windowsVirtualKeyCode=27)
    check(e('!timeEditor.dialog.open') and stored(item,'when')==range_value,'Escape cancels without changing canonical dates')
    remove();check(stored(item,'when') is None,'remove When omits optional field')
    check(e("document.getElementById('content-time-value').textContent==='Add date…'"),'remove restores placeholder')
    open_editor();values('2026-11-12',end='2026-11-25');save()
    cdp.call('Page.reload');ready();select(item)
    check(stored(item,'when')==range_value and e('entries.get('+q(item)+').when.endDate')=='2026-11-25','range survives reload and normalizer')

    e(f'createChildEntry({q(galaxy)},true);fields[0].value="Checklist";form.requestSubmit();applicationCommandTail');wait_for('!formSaveBusy')
    task_list=e('selectedNode.dataset.entryId')
    check(e('timeEditor.row.hidden'),'Task List has no When/Due control')
    e(f'createChildEntry({q(task_list)})');click('#entry-due-value');values('2027-01-01');save()
    before_cancel=e("localStorage.getItem('galaxy:user-data')");click('#cancel-add-entry')
    check(e("localStorage.getItem('galaxy:user-data')")==before_cancel,'Cancel Task creation discards its unsaved Due draft without writing')
    e(f'createChildEntry({q(task_list)});fields[0].value="No date required";form.requestSubmit();applicationCommandTail');wait_for('!formSaveBusy')
    check(e("!dialog.open&&!entries.get(selectedNode.dataset.entryId).due"),'Task creation remains optional with no date selected')
    e(f'createChildEntry({q(task_list)})')
    check(e("!document.getElementById('entry-due-draft').hidden&&document.getElementById('entry-due-value').textContent==='Add due date…'"),'Task creation offers optional Due without requiring it')
    click('#entry-due-value');values('2026-10-29','23:59');save()
    check(e("dialog.open&&taskDueDraft.date==='2026-10-29'"),'Due editor returns to unsaved Task creation')
    check(e("!JSON.parse(localStorage.getItem('galaxy:user-data')).entries.some(x=>x.due?.date==='2026-10-29')"),'Task date draft has no independent canonical record')
    e('fields[0].value="Finish report";form.requestSubmit();applicationCommandTail');wait_for('!formSaveBusy')
    task=e('selectedNode.dataset.entryId');select(task)
    check(stored(task,'due')=={'date':'2026-10-29','time':'23:59'},'Task creation atomically saves optional Due')
    check(e("document.getElementById('content-time-label').textContent==='DUE'"),'individual Task shows Due instead of When')
    open_editor()
    check(e("document.getElementById('time-editor-mode').hidden&&document.getElementById('time-editor-title').textContent==='Due'"),'Due editor has no range selector')
    values('2026-10-30');save();check(stored(task,'due')=={'date':'2026-10-30','time':None},'Task Due date can be edited without time')
    open_editor();values('2026-10-30','00:00');save();check(stored(task,'due')['time']=='00:00','Task midnight clock retained')
    shot('time-desktop-due-row')
    cdp.call('Page.reload');ready();select(task)
    check(e('entries.get('+q(task)+').due.time')=='00:00','Task Due survives reload')
    remove();check(stored(task,'due') is None,'remove Due omits optional field')
    open_editor();values('2026-10-29','23:59');save()

    # The shared dialog must remain usable on narrow screens and short visible viewports.
    for width,height,title in [(1024,768,'tablet'),(390,844,'phone'),(320,568,'narrow-phone'),(844,390,'landscape'),(390,300,'keyboard-height')]:
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=width<=760)
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        for id,kind in [(item,'when'),(task,'due')]:
            select(id);open_editor()
            if kind=='when':values('2026-11-12',end='2026-11-25')
            bounds=e("(()=>{const d=timeEditor.dialog,r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:d.scrollWidth-d.clientWidth,native:timeEditor.start.type==='date'&&timeEditor.clock.type==='time'}})()")
            check(bounds['left']>=-1 and bounds['right']<=width+1 and bounds['top']>=-1 and bounds['bottom']<=height+1 and bounds['overflow']<=1,f'{title} {kind}: editor fits visible viewport without horizontal overflow')
            check(bounds['native'],f'{title} {kind}: browser-native date/time controls retained')
            e("timeEditor.end.scrollIntoView({block:'nearest'})" if kind=='when' else "timeEditor.clock.scrollIntoView({block:'nearest'})")
            check(e("(()=>{const field=timeEditor.editingKind==='when'?timeEditor.end:timeEditor.clock,r=field.getBoundingClientRect(),d=timeEditor.dialog.getBoundingClientRect();return r.top>=d.top&&r.bottom<=d.bottom})()"),f'{title} {kind}: last field reachable through editor scrolling')
            e("document.getElementById('time-editor-save').scrollIntoView({block:'nearest'});new Promise(r=>requestAnimationFrame(r))")
            check(e("(()=>{const r=document.getElementById('time-editor-save').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.width>=44&&r.height>=32})()"),f'{title} {kind}: Save reachable through editor scrolling')
            e("document.getElementById('time-editor-cancel').scrollIntoView({block:'nearest'})")
            if title in ['tablet','phone','keyboard-height']:shot(f'time-{title}-{kind}-editor')
            click('#time-editor-cancel')
            check(e('!timeEditor.dialog.open'),f'{title} {kind}: Cancel reachable')
    cdp.call('Emulation.clearDeviceMetricsOverride');select(item)

    # Failure publication and the existing persistent stale-tab Reload contract.
    before=stored(item,'when')
    e("window.timeOriginalCommit=persistence.metadata.commit;persistence.metadata.commit=async()=>{throw new Error('Synthetic quota failure')}")
    open_editor();values('2027-01-01');e('timeEditor.form.requestSubmit();applicationCommandTail');wait_for('!timeEditor.pending')
    check(e("timeEditor.dialog.open&&!timeEditor.error.hidden&&timeEditor.error.textContent.includes('Synthetic quota')"),'failed write keeps draft and visible error')
    check(stored(item,'when')==before,'failed date save leaves canonical metadata unchanged')
    e('persistence.metadata.commit=timeOriginalCommit');click('#time-editor-cancel')

    target=cdp.call('Target.createTarget',url='about:blank')['targetId'];endpoint=cdp.sock.getpeername()
    peer=cdp_class(f'ws://127.0.0.1:{endpoint[1]}/devtools/page/{target}')
    try:
        peer.call('Page.enable');peer.call('Runtime.enable')
        peer.call('Page.addScriptToEvaluateOnNewDocument',source="document.addEventListener('load',event=>{if(event.target.tagName==='SCRIPT'&&event.target.src.endsWith('/script.js')){physics.pause();graphNeedsSave=false}},true)")
        peer.call('Page.navigate',url=origin);ready(peer)
        e(f"saveEntryTime({q(item)},'when',{{startDate:'2026-12-25',endDate:null,time:'14:30'}})")
        raw=e("localStorage.getItem('galaxy:user-data')")
        outcome=peer.evaluate(f"(async()=>{{try{{await saveEntryTime({q(task)},'due',{{date:'2026-12-26',time:null}});return 'saved'}}catch(error){{return error.code}}}})()")
        check(outcome=='LOCAL_SNAPSHOT_STALE','real second tab cannot overwrite newer canonical time')
        check(e("localStorage.getItem('galaxy:user-data')")==raw,'winning date survives stale save byte-for-byte')
        check(peer.evaluate("localSessionStale&&!storageStatus.hidden&&!document.getElementById('reload-local-data').hidden"),'existing stale-tab Reload banner remains authoritative')
        peer.evaluate("document.getElementById('reload-local-data').click()");ready(peer)
        check(peer.evaluate(f"entries.get({q(item)}).when.startDate==='2026-12-25'&&entries.get({q(task)}).due.time==='23:59'"),'reload accepts latest When while retaining Task Due')
    finally:
        peer.sock.close();cdp.call('Target.closeTarget',targetId=target)
