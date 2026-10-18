"""Real body gestures in a fresh local browser profile; no live application data."""
import json


def run_mobile_body_checks(*, cdp, evaluate, check, wait_for, add, click_selector, shot):
    root=add('Body gestures');parent=add('Travel',root)
    first=add('Photos',parent);second=add('Packing',parent)
    wait_for('physics.settled');evaluate('physics.pause()')

    def point(selector):
        return evaluate(f"(()=>{{const s={json.dumps(selector)},n=document.querySelector(s),r=n.getBoundingClientRect();for(const fy of [.5,.25,.75,.1,.9])for(const fx of [.5,.25,.75,.1,.9]){{const x=r.x+r.width*fx,y=r.y+r.height*fy;if(document.elementFromPoint(x,y)?.closest(s)===n)return {{x,y}};}}throw Error('No exposed target: '+s);}})()")

    def body(entry_id):
        return f'.entry-node[data-entry-id="{entry_id}"]'

    def tap(selector):
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[point(selector)])
        cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])

    def frame(entry_id):
        evaluate(f'closeInspector();focusEntry({json.dumps(entry_id)},{{closeFocus:true,openInspector:false}})')
        wait_for('camera.frame===null');evaluate('physics.pause();lastBodyTap=null')

    def gesture(entry_id, distance, cancel=False):
        p=point(body(entry_id))
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
        cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[{'x':p['x']+distance,'y':p['y']}])
        cdp.call('Input.dispatchTouchEvent',type='touchCancel' if cancel else 'touchEnd',touchPoints=[])
        evaluate('physics.pause()')

    def selected(entry_id):
        return evaluate(f"selectedNode?.dataset.entryId==={json.dumps(entry_id)}&&document.getElementById('mobile-body-name').textContent===entries.get({json.dumps(entry_id)}).name")

    for width,height in [(360,800),(390,844),(430,932),(740,360)]:
        label=f'{width}x{height}'
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=2,mobile=True)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=5)
        wait_for('hierarchySidebar.narrow')
        evaluate('hierarchySidebar.setCollapsed(true)')
        frame(first);evaluate('clearSelection()')
        tap(body(first))
        check(selected(first) and evaluate('panel.hidden'), 'first body tap selects and updates preview without Contents: '+label)
        tap(body(first));wait_for('camera.frame===null')
        check(selected(first) and evaluate('panel.hidden'), 'repeated/double body tap can focus but never opens Contents: '+label)
        before=evaluate(f'({{x:entries.get({json.dumps(first)}).x,y:entries.get({json.dumps(first)}).y}})')
        gesture(first,4)
        check(evaluate(f'panel.hidden&&entries.get({json.dumps(first)}).x==={before["x"]}&&entries.get({json.dumps(first)}).y==={before["y"]}'), 'below-threshold finger jitter neither drags nor opens Contents: '+label)
        # This is the regression: crossing the unchanged 8px threshold previously
        # reached endDrag's unconditional inspector opener.
        for distance in (9,32):
            before=evaluate(f'({{x:entries.get({json.dumps(first)}).x,y:entries.get({json.dumps(first)}).y}})')
            gesture(first,distance)
            check(selected(first) and evaluate(f'panel.hidden&&Math.hypot(entries.get({json.dumps(first)}).x-({before["x"]}),entries.get({json.dumps(first)}).y-({before["y"]}))>0&&activeNodeDrags===0&&physics.dragging.size===0'), f'{distance}px body drag moves the body and keeps Contents closed: '+label)
        gesture(first,16,cancel=True)
        check(evaluate('panel.hidden&&activeNodeDrags===0&&physics.dragging.size===0'), 'cancelled body drag releases capture without opening Contents: '+label)
        frame(second);evaluate('clearSelection()');tap(body(second))
        check(selected(second) and evaluate('panel.hidden'), 'another body updates the preview identity with Contents closed: '+label)
        evaluate("document.getElementById('mobile-body-actions').click()")
        check(evaluate('panel.hidden'), 'preview group itself has no implicit Contents action: '+label)
        tap('#mobile-body-contents')
        check(selected(second) and evaluate(f'!panel.hidden&&contentInspector.entryId==={json.dumps(second)}'), 'explicit expand chevron opens exactly the selected body: '+label)
        wait_for("panel.getAnimations().every(a=>a.playState==='finished')")
        tap('#close-inspector-button')
        wait_for('panel.hidden')
        check(selected(second) and evaluate("panel.hidden&&document.getElementById('mobile-body-actions').getClientRects().length>0"), 'closing Contents restores preview and retains selected body: '+label)
        shot('mobile-body-'+label)

    # Preserve the current mobile row behavior: select/focus and close the drawer,
    # with the explicit preview action still available.
    evaluate('hierarchySidebar.setCollapsed(false)')
    tap(f'.hierarchy-row[data-entry-id="{first}"] .tree-name')
    wait_for('camera.frame===null')
    check(selected(first) and evaluate('panel.hidden&&hierarchySidebar.collapsed'), 'mobile Menu View row selection retains its existing focus/preview behavior')

    cdp.call('Emulation.setTouchEmulationEnabled',enabled=False,maxTouchPoints=1)
    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
    wait_for('!hierarchySidebar.narrow');evaluate('hierarchySidebar.setCollapsed(false)')
    frame(first);click_selector(body(first))
    check(evaluate(f'!panel.hidden&&contentInspector.entryId==={json.dumps(first)}'), 'desktop body click retains its existing Contents behavior')
    frame(first);p=point(body(first))
    cdp.call('Input.dispatchMouseEvent',type='mousePressed',**p,button='left',clickCount=1)
    cdp.call('Input.dispatchMouseEvent',type='mouseMoved',x=p['x']+32,y=p['y'],button='left',buttons=1)
    cdp.call('Input.dispatchMouseEvent',type='mouseReleased',x=p['x']+32,y=p['y'],button='left',clickCount=1)
    check(evaluate('!panel.hidden&&activeNodeDrags===0'), 'desktop drag completion retains its existing Contents behavior')
    check(not cdp.errors,f'no body gesture browser exceptions: {cdp.errors}')
