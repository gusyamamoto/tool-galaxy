"""Overdue projection, shared Contents writes and both native Upcoming layouts."""
import json


def run_time_overdue_checks(*, cdp, e, check, wait_for, add, shot):
    q = json.dumps
    root = add('Overdue regression')
    e(f'createChildEntry({q(root)},true);fields[0].value="Assignments";form.requestSubmit();applicationCommandTail')
    wait_for('!formSaveBusy')
    owner = e('selectedNode.dataset.entryId')
    older, yesterday, today_task, future, completed = [add(name, owner) for name in
        ['Earlier assignment', 'Statistics assignment', 'Due today', 'Future assignment', 'Completed assignment']]
    past = add('Past dated normal Item', root)
    today = e('cosmosTime.key(new Date())')
    previous = e(f'cosmosTime.addDays({q(today)},-1)')
    earlier = e(f'cosmosTime.addDays({q(today)},-35)')
    tomorrow = e(f'cosmosTime.addDays({q(today)},1)')
    later = e(f'cosmosTime.addDays({q(today)},7)')

    def frame():
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')

    def event(item):
        return f'#time-upcoming-entries [data-time-entry-id="{item}"]'

    def activate(selector, mobile):
        e(f'document.querySelector({q(selector)}).scrollIntoView({{block:"center"}})')
        frame()
        p = e(f'(()=>{{const r=document.querySelector({q(selector)}).getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}}}})()')
        check(e(f'document.elementFromPoint({p["x"]},{p["y"]})?.closest({q(selector)})===document.querySelector({q(selector)})'), 'overdue: native action is exposed: '+selector)
        if mobile:
            cdp.call('Input.dispatchTouchEvent', type='touchStart', touchPoints=[p])
            cdp.call('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[])
        else:
            cdp.call('Input.dispatchMouseEvent', type='mousePressed', button='left', clickCount=1, **p)
            cdp.call('Input.dispatchMouseEvent', type='mouseReleased', button='left', clickCount=1, **p)
        e('applicationCommandTail')
        frame()

    e(f'saveEntryTime({q(past)},"when",{{startDate:{q(previous)},endDate:null,time:null}})')
    e(f'saveEntryTime({q(completed)},"due",{{date:{q(previous)},time:null}});applicationCommandTail')
    e(f'changeTask({q(completed)},"completed",true);applicationCommandTail')
    for width, height in [(1440,900),(1280,800),(1200,768),(390,844),(320,568)]:
        mobile = width <= 760
        cdp.call('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=1, mobile=mobile)
        cdp.call('Emulation.setTouchEmulationEnabled', enabled=mobile, maxTouchPoints=5)
        frame()
        e(f'setInspectorOpen(false);timeWorkspace.close();hierarchySidebar.setCollapsed({str(mobile).lower()})')
        for item, date in [(older,earlier),(yesterday,previous),(today_task,today),(future,tomorrow)]:
            e(f'changeTask({q(item)},"completed",false);applicationCommandTail')
            e(f'saveEntryTime({q(item)},"due",{{date:{q(date)},time:"00:01"}});applicationCommandTail')
        e('physics.pause();camera.stopAnimation();graphNeedsSave=false;timeWorkspace.open();timeWorkspace.root.scrollTop=0')
        prefix = f'{width}x{height}: '
        check(e(f'(()=>{{const g=timeWorkspace.upcomingList.firstElementChild;return g.dataset.timeGroup==="overdue"&&g.querySelector(".time-upcoming-date").textContent==="Overdue"&&[...g.querySelectorAll("[data-time-entry-id]")].map(b=>b.dataset.timeEntryId).join("|")==={q(older+"|"+yesterday)}}})()'), prefix+'one leading Overdue group retains oldest-first tasks across a month boundary')
        check(e(f'document.querySelector({q(event(today_task))}).closest("[data-time-group]").dataset.timeGroup==={q(today)}&&!document.querySelector({q(event(today_task))}).classList.contains("time-overdue")'), prefix+'Due today at 00:01 is not overdue')
        check(e(f'document.querySelector({q(event(future))}).closest("[data-time-group]").dataset.timeGroup==={q(tomorrow)}'), prefix+'future task retains normal Tomorrow grouping')
        check(e(f'!document.querySelector({q(event(completed))})&&!document.querySelector({q(event(past))})'), prefix+'completed overdue and generic past dates stay out of Upcoming')
        check(e(f'(()=>{{const b=document.querySelector({q(event(yesterday))});return b.classList.contains("time-overdue")&&b.querySelector(".time-clock").textContent.startsWith("Due ")&&b.querySelector(".time-clock").textContent.includes(cosmosTime.dateLabel({q(previous)}))&&b.ariaLabel.includes("Overdue")&&b.querySelector(".temporal-avatar").outerHTML===cosmosTemporalAvatars.render(entries,{q(yesterday)}).outerHTML}})()'), prefix+'original Due and accessible overdue cue preserve exact miniature identity')
        check(e('!document.querySelector("#time-calendar .time-overdue,#time-day-entries .time-overdue")'), prefix+'Calendar and selected-day paint receive no overdue marker')
        check(e('document.documentElement.scrollWidth<=innerWidth&&timeWorkspace.root.scrollWidth<=timeWorkspace.root.clientWidth+1&&timeWorkspace.strip.scrollHeight<=timeWorkspace.strip.clientHeight+1'), prefix+'no page overflow or clipped timeline content')
        check(e(f'getComputedStyle(timeWorkspace.upcomingList).flexDirection==={q("column" if mobile else "row")}&&[...timeWorkspace.upcomingList.querySelectorAll(".temporal-avatar")].every(a=>a.getBoundingClientRect().width===28)'), prefix+'approved rail direction and miniature dimensions remain')
        e('document.getElementById("time-upcoming-title").scrollIntoView({block:"start"})')
        shot(f'time-overdue-{width}x{height}')
        activate(event(yesterday), mobile)
        check(e(f'timeWorkspace.active&&!panel.hidden&&contentInspector.entryId==={q(yesterday)}&&document.querySelector({q(event(yesterday))}).dataset.selected==="true"'), prefix+'overdue click selects canonical Contents while staying in Time')
        check(e('timeWorkspace.root.scrollWidth<=timeWorkspace.root.clientWidth+1&&timeWorkspace.strip.scrollHeight<=timeWorkspace.strip.clientHeight+1'), prefix+'opening Contents preserves the constrained timeline and native scrolling')
        shot(f'time-overdue-contents-{width}x{height}')
        activate(event(older), mobile)
        check(e(f'contentInspector.entryId==={q(older)}&&!panel.hidden&&timeWorkspace.active'), prefix+'switching overdue events updates the existing Contents')
        activate(event(yesterday), mobile)
        activate('#content-task-done', mobile)
        check(e(f'entries.get({q(yesterday)}).completed===true&&!document.querySelector({q(event(yesterday))})&&cosmosTime.onDay(timeWorkspace.events,{q(previous)}).some(x=>x.id==={q(yesterday)}&&x.completed)'), prefix+'completion immediately removes overdue instance and retains original Calendar history')
        e('setInspectorOpen(false)')
        activate(event(older), mobile)
        activate('#content-time-value', mobile)
        e(f'timeEditor.start.value={q(later)};timeEditor.form.requestSubmit();applicationCommandTail')
        wait_for('!timeEditor.pending&&!timeEditor.dialog.open')
        check(e(f'!timeWorkspace.upcomingList.querySelector("[data-time-group=overdue]")&&document.querySelector({q(event(older))}).closest("[data-time-group]").dataset.timeGroup==={q(later)}&&!document.querySelector({q(event(older))}).classList.contains("time-overdue")'), prefix+'rescheduling through shared Due editor moves the last overdue item to future chronology')
        activate('#content-time-value', mobile)
        e(f'timeEditor.start.value={q(previous)};timeEditor.form.requestSubmit();applicationCommandTail')
        wait_for('!timeEditor.pending&&!timeEditor.dialog.open')
        check(e(f'!!document.querySelector({q(event(older))}).closest("[data-time-group=overdue]")'), prefix+'moving Due back into the past restores derived overdue grouping')
        activate('#content-time-remove', mobile)
        wait_for('!timeEditor.removing')
        check(e(f'!Object.hasOwn(entries.get({q(older)}),"due")&&!timeWorkspace.events.some(x=>x.id==={q(older)})&&!document.querySelector({q(event(older))})&&!timeWorkspace.upcomingList.querySelector("[data-time-group=overdue]")'), prefix+'removing Due removes the event and the now-empty Overdue group')
        check(e('JSON.parse(localStorage.getItem("galaxy:user-data")).entries.every(x=>!Object.hasOwn(x,"overdue"))'), prefix+'overdue state is never persisted')
