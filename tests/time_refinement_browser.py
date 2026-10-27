"""Native pointer/touch checks for Time close, quiet chrome and transient Contents."""
import json
import time


def run_time_refinement_checks(*, cdp, e, check, wait_for, wait_camera, add, click, shot):
    q = json.dumps
    root = add('Time refinement')
    branch = add('Current context', root)
    first = add('First appointment', branch)
    second = add('Second appointment', branch)
    later = add('Later appointment', branch)
    e(f'window.refineIds={q([first,second,later])};window.refineToday=cosmosTime.key(new Date())')
    e("(async()=>{for(const [index,id] of refineIds.entries())await saveEntryTime(id,'when',{startDate:index<2?refineToday:cosmosTime.addDays(refineToday,1),endDate:null,time:index===0?'09:00':index===1?'10:00':null});})()")
    e(f"saveEntryContent({q(second)},c=>({{...c,notes:{{format:'plain',text:'Readable note content. '.repeat(500)}}}}))")
    e('physics.pause();camera.stopAnimation();graphNeedsSave=false;setInspectorOpen(true);timeWorkspace.open();timeWorkspace.selectDay(refineToday)')

    def frame():
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')

    def point(selector):
        return e("(()=>{const n=document.querySelector(" + q(selector) + "),r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")

    def tap_point(p):
        cdp.call('Input.dispatchTouchEvent', type='touchStart', touchPoints=[p])
        cdp.call('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[])
        frame()

    def tap(selector):
        p = point(selector)
        check(e(f'document.elementFromPoint({p["x"]},{p["y"]})?.closest({q(selector)})===document.querySelector({q(selector)})'), 'native target exposed: ' + selector)
        tap_point(p)

    def swipe(p, dy):
        cdp.call('Input.dispatchTouchEvent', type='touchStart', touchPoints=[p])
        for fraction in [.1, .25, .5, .75, 1]:
            cdp.call('Input.dispatchTouchEvent', type='touchMove', touchPoints=[dict(x=p['x'], y=p['y'] + dy * fraction)])
            time.sleep(.035)
        cdp.call('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[])
        frame()

    # The close action must use existing canonical focus, never event-click navigation.
    e(f'document.querySelector(\'#time-day-entries [data-time-entry-id="{second}"]\').click()')
    check(e(f'timeWorkspace.active&&selectedNode.dataset.entryId==={q(second)}&&contentInspector.entryId==={q(second)}&&hierarchySidebar.selectedId==={q(second)}'), 'event click stays in Time and updates canonical Contents/sidebar selection')
    click('#time-close')
    wait_camera()
    check(e(f'!timeWorkspace.active&&selectedNode.dataset.entryId==={q(second)}&&contentInspector.entryId==={q(second)}'), 'X closes Time without clearing the selected canonical event')
    check(e(f'(()=>{{const n=nodes.get({q(second)}),p=camera.worldToScreen(entries.get({q(second)}).x,entries.get({q(second)}).y),b=physics.bounds;return !n.inert&&n.dataset.culled!=="true"&&p.x>=b.left&&p.x<=b.right&&p.y>=b.top&&p.y<=b.bottom}})()'), 'X uses existing Universe focus to reveal the corresponding CB')
    check(e('!timeWorkspace.root.contains(document.activeElement)'), 'X returns keyboard focus out of hidden Time')
    e('clearSelection();timeWorkspace.open();window.refineCamera={...camera.view}')
    click('#time-close')
    check(e('!timeWorkspace.active&&!selectedNode&&JSON.stringify(camera.view)===JSON.stringify(refineCamera)'), 'X with no selection returns to Universe without reframing or selecting anything')
    e(f'selectEntry(entries.get({q(first)}),nodes.get({q(first)}),{{openInspector:true,reframe:false}});timeWorkspace.open();timeWorkspace.selectDay(refineToday)')
    click('#entry-more-button')
    check(e('!contextMenu.hidden&&contextEntryId===selectedNode.dataset.entryId'), 'compact ellipsis opens the unchanged canonical action menu')
    e('closeContextMenu()')
    check(e("(()=>{const b=document.getElementById('entry-more-button'),s=getComputedStyle(b,'::after');return b.ariaLabel==='More actions'&&s.width==='14px'&&s.height==='4px'&&s.backgroundImage.split('radial-gradient').length===4})()"), 'ellipsis uses three fixed compact CSS circles and retains its label')
    e("timeWorkspace.root.style.height='500px';timeWorkspace.root.style.bottom='auto';timeWorkspace.root.scrollTop=0")
    check(e('timeWorkspace.root.scrollHeight>timeWorkspace.root.clientHeight'), 'Time overflow remains a native scroll container')
    check(e("getComputedStyle(timeWorkspace.root,'::-webkit-scrollbar').backgroundColor==='rgb(10, 18, 32)'&&getComputedStyle(timeWorkspace.root,'::-webkit-scrollbar-thumb').backgroundColor==='rgb(52, 67, 89)'"), 'Time native scrollbar uses the dark track and muted thumb')
    shot('time-refined-desktop-top')
    p = point('.time-header')
    cdp.call('Input.dispatchMouseEvent', type='mouseWheel', x=p['x'], y=p['y'], deltaX=0, deltaY=120)
    wait_for('timeWorkspace.root.scrollTop>0')
    check(True, 'native wheel still scrolls Time with the muted scrollbar')
    shot('time-refined-desktop')
    e("timeWorkspace.root.style.height='';timeWorkspace.root.style.bottom='';timeWorkspace.root.scrollTop=0")

    # Record whether switching entries closes the sheet: no production instrumentation needed.
    e('window.refineSetInspector=setInspectorOpen;window.refineOpenCalls=[];setInspectorOpen=(open,...args)=>{refineOpenCalls.push(open);return refineSetInspector(open,...args)}')
    cdp.call('Emulation.setTouchEmulationEnabled', enabled=True, maxTouchPoints=2)
    for width, height in [(390, 844), (320, 568), (740, 390)]:
        name = f'{width}x{height}'
        cdp.call('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=1, mobile=True)
        frame()
        e('setInspectorOpen(false);timeWorkspace.open();timeWorkspace.selectDay(refineToday);timeWorkspace.root.scrollTop=0')
        check(e("(()=>{const b=document.getElementById('time-close'),r=b.getBoundingClientRect();return getComputedStyle(b).display==='grid'&&r.width===44&&r.height===44&&b.ariaLabel==='Close Time view'})()"), name + ': shared Time close has a labeled 44px mobile target')
        first_selector = f'#time-day-entries [data-time-entry-id="{first}"]'
        second_selector = f'#time-day-entries [data-time-entry-id="{second}"]'

        def expose_entries():
            e('timeWorkspace.selectDay(refineToday)')
            e("(()=>{const b=document.querySelector(" + q(first_selector) + ");timeWorkspace.root.scrollTop+=b.getBoundingClientRect().top-72;})()")
            frame()

        def open_first():
            e('setInspectorOpen(false)')
            expose_entries()
            tap(first_selector)
            wait_for(f'!panel.hidden&&contentInspector.entryId==={q(first)}')
            check(e('timeWorkspace.active&&!timeWorkspace.root.inert&&mobileContents.state==="browse"'), name + ': event opens the existing sheet without making exposed Time inert')

        open_first()
        # Both selected-day rows have exposed centers above the small sheet.
        e('refineOpenCalls=[]')
        tap(second_selector)
        check(e(f'!panel.hidden&&selectedNode.dataset.entryId==={q(second)}&&contentInspector.entryId==={q(second)}&&!refineOpenCalls.includes(false)'), name + ': another native event tap updates the open sheet without closing/reopening')
        tap('#contents-dock [data-page="notes"]')
        check(e(f'!panel.hidden&&mobileContents.page==="notes"&&selectedNode.dataset.entryId==={q(second)}'), name + ': tapping inside Notes keeps Contents open and never selects Time behind it')
        check(e('mobileContents.root.scrollHeight>mobileContents.root.clientHeight'), name + ': populated Notes retains its internal scroll container over Time')
        e('window.refineBehindScroll=timeWorkspace.root.scrollTop;window.refineNotesScrollEnded=false;mobileContents.root.addEventListener("scrollend",()=>{refineNotesScrollEnded=true},{once:true})')
        note_point = e('(()=>{const r=mobileContents.root.getBoundingClientRect();return {x:r.left+r.width/2,y:r.bottom-8}})()')
        swipe(note_point, -40)
        wait_for('mobileContents.root.scrollTop>0')
        check(e(f'!panel.hidden&&selectedNode.dataset.entryId==={q(second)}&&timeWorkspace.root.scrollTop===refineBehindScroll&&document.getElementById("content-notes-form").hidden'), name + ': native Notes scrolling stays inside Contents without dismissing, editing or scrolling/selecting Time behind it')
        wait_for('refineNotesScrollEnded')
        e('mobileContents.root.scrollTop=0')
        tap('#contents-dock [data-page="links"]')
        check(e('!panel.hidden&&mobileContents.page==="links"'), name + ': tapping inside Links keeps Contents open')
        tap('#contents-dock [data-page="location"]')
        check(e('!panel.hidden&&mobileContents.page==="location"'), name + ': tapping inside Location keeps Contents open')
        tap('#entry-more-button')
        check(e(f'!panel.hidden&&!contextMenu.hidden&&contextEntryId==={q(second)}'), name + ': tighter ellipsis keeps its 44px menu target and does not dismiss the sheet')
        check(e("document.getElementById('entry-more-button').getBoundingClientRect().width===44&&document.getElementById('entry-more-button').getBoundingClientRect().height===44"), name + ': ellipsis touch target remains 44x44')
        e('closeContextMenu();mobileContents.setPage("files")')
        tap_point(dict(x=width / 2, y=40))
        check(e('panel.hidden&&timeWorkspace.active'), name + ': exposed empty-space tap dismisses only Contents')

        # Date input must stay the original native hit; no click replay or two-tap close.
        open_first()
        e("(()=>{const b=timeWorkspace.calendar.querySelector('[data-time-day]');timeWorkspace.root.scrollTop+=b.getBoundingClientRect().top-80;})()")
        frame()
        day = e("[...timeWorkspace.calendar.querySelectorAll('[data-time-day]')].find(b=>{const r=b.getBoundingClientRect(),h=document.querySelector('.time-header').getBoundingClientRect(),p=panel.getBoundingClientRect();return b.dataset.timeDay!==timeWorkspace.selectedDay&&r.top+r.height/2>h.bottom&&r.top+r.height/2<p.top})?.dataset.timeDay")
        assert day, 'No exposed date for native one-tap test: ' + name
        tap(f'[data-time-day="{day}"]')
        check(e(f'panel.hidden&&timeWorkspace.selectedDay==={q(day)}&&document.activeElement.dataset.timeDay==={q(day)}'), name + ': one native tap dismisses Contents and selects that date with focus')

        # Drag starts on an event, so dismissal waits for real movement, not pointerdown.
        open_first()
        e('window.refineScrollBefore=timeWorkspace.root.scrollTop;refineOpenCalls=[]')
        # Tall portrait may already be at the bottom of this short fixture.
        dy = 60 if e('timeWorkspace.root.scrollHeight-timeWorkspace.root.clientHeight-refineScrollBefore<70') else -60
        swipe(point(first_selector), dy)
        wait_for('panel.hidden&&Math.abs(timeWorkspace.root.scrollTop-refineScrollBefore)>5')
        check(e('timeWorkspace.active&&!refineOpenCalls.includes(true)'), name + ': outside event drag dismisses the sheet and continues native Time scrolling without an accidental event click')
        expose_entries()
        tap(second_selector)
        check(e(f'!panel.hidden&&contentInspector.entryId==={q(second)}'), name + ': the next intentional tap is never consumed after a drag')

        # Explicit chevron and native header swipe keep their original implementation.
        tap('#close-inspector-button')
        check(e('panel.hidden&&timeWorkspace.active'), name + ': explicit close still returns to Time')
        open_first()
        p = e('(()=>{const r=panel.querySelector(".content-panel-header").getBoundingClientRect();return {x:r.left+4,y:r.top+6}})()')
        swipe(p, 85)
        wait_for('panel.hidden')
        check(e('timeWorkspace.active&&!mobileContents.closing'), name + ': existing swipe-down still dismisses Contents')
        e('timeWorkspace.root.scrollTop=0')
        shot('time-refined-' + name)
    e('setInspectorOpen=refineSetInspector')
    check(not cdp.errors, 'no runtime errors in native Time refinement interactions')
