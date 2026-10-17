"""Real Move-to publication/layout followed by native touch and mouse dragging."""
import json
import math


def run_reparent_drag_checks(*, cdp, evaluate, check, wait_for, add):
    q=json.dumps
    root=add('Drag continuity');first=add('Parent 1',root);second=add('Parent 2',root)
    owner=add('Moved body',first);child=add('Child moves with body',owner)
    wait_for('physics.settled');evaluate('physics.pause()')
    evaluate(f"window.dragMoveEvents=0;window.enterProjectionError=null;const subject=nodes.get({q(owner)});subject.addEventListener('pointermove',()=>dragMoveEvents++);subject.addEventListener('pointerenter',()=>{{const e=entries.get({q(owner)}),p=camera.worldToScreen(e.x,e.y);enterProjectionError=Math.hypot(subject.renderX-p.x,subject.renderY-p.y);}})")
    cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=2,mobile=True)
    cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=5)
    wait_for('hierarchySidebar.narrow');evaluate('hierarchySidebar.setCollapsed(true)')

    def state():
        return evaluate(f"(()=>{{const e=entries.get({q(owner)}),p=physics.particles.get(e.id),n=nodes.get(e.id),c=entries.get({q(child)});return {{x:e.x,y:e.y,px:p.x,py:p.y,fx:p.fx,fy:p.fy,parentId:e.parentId,systemId:p.systemId,screenX:n.renderX,screenY:n.renderY,scale:camera.view.scale,childX:c.x,childY:c.y,oldX:retainedEntry.x,oldY:retainedEntry.y,sameEntry:e===retainedEntry,sameDOM:n===retainedDOM,sameParticle:p===retainedParticle,placement:layout.get(e.id)||null}};}})()")

    def move_to(parent_id):
        evaluate(f"closeInspector();closeContentMenus();closeContextMenu();window.retainedEntry=entries.get({q(owner)});window.retainedDOM=nodes.get({q(owner)});window.retainedParticle=physics.particles.get({q(owner)});window.moveStart={{x:retainedEntry.x,y:retainedEntry.y}};openContextMenu({q(owner)},200,180)")
        if evaluate("contextMenu.dataset.view==='quick'"):
            evaluate("contextMenu.querySelector('[data-action=more]').click()")
        evaluate("contextMenu.querySelector('[data-action=move]').click()")
        check(evaluate(f'dialog.open&&editingId==={q(owner)}'),'Move starts through the existing management/form path')
        evaluate(f'parentField.value={q(parent_id)};parentField.dispatchEvent(new Event("change"));form.requestSubmit()')
        wait_for('!dialog.open&&!formSaveBusy&&physics.settled')
        evaluate('applicationCommandTail')
        check(evaluate(f'entries.get({q(owner)}).parentId==={q(parent_id)}&&physics.particles.get({q(owner)}).parentId==={q(parent_id)}'),'confirmed move updates model and particle ancestry')
        # Reframe only the camera so the settled body has an exposed native target.
        evaluate(f'focusEntry({q(owner)},{{closeFocus:true,openInspector:false}})')
        wait_for('camera.frame===null&&physics.settled');evaluate('physics.pause()')
        wait_for("document.querySelectorAll('.entry-node.dragging').length===0")
        result=state()
        print('Post-Move coordinates/identity: '+json.dumps(result),flush=True)
        check(result['sameDOM'] and result['sameParticle'],'Move retains the existing DOM button and D3 particle')
        check(result['placement'] is None and result['fx'] is None and result['fy'] is None,'Move clears old parent-relative placement and leaves no fixed constraint')
        check(evaluate(f'Math.hypot(entries.get({q(owner)}).x-moveStart.x,entries.get({q(owner)}).y-moveStart.y)>10'),'new-parent layout is allowed to establish a different position')

    def point():
        evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        return evaluate(f"(()=>{{const n=nodes.get({q(owner)}),r=n.getBoundingClientRect();for(const fy of [.5,.25,.75])for(const fx of [.5,.25,.75]){{const x=r.x+r.width*fx,y=r.y+r.height*fy;if(document.elementFromPoint(x,y)?.closest('.entry-node')===n)return {{x,y}};}}throw Error('Moved body has no exposed hit target');}})()")

    def drag(kind):
        before=state();p=point()
        if kind=='touch':
            cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
        else:
            cdp.call('Input.dispatchMouseEvent',type='mousePressed',**p,button='left',clickCount=1)
        wait_for('activeNodeDrags===1')
        check(evaluate('enterProjectionError!==null&&enterProjectionError<.3'),kind+': pointer entry renders from the same live coordinates as the visible body')
        down=state()
        check(down['fx'] is not None and down['fy'] is not None and math.hypot(down['x']-before['x'],down['y']-before['y'])<1e-6 and abs(down['fx']-before['px'])<1e-6 and abs(down['fy']-before['py'])<1e-6,kind+': pointerdown fixes the current particle without moving it; '+json.dumps(down))
        for dx,dy in [(12,-10),(28,-18)]:
            count=evaluate('dragMoveEvents')
            if kind=='touch':
                cdp.call('Input.dispatchTouchEvent',type='touchMove',touchPoints=[{'x':p['x']+dx,'y':p['y']+dy}])
            else:
                cdp.call('Input.dispatchMouseEvent',type='mouseMoved',x=p['x']+dx,y=p['y']+dy,button='left',buttons=1)
            wait_for(f'dragMoveEvents>{count}')
            after=state();expected_x=before['x']+dx/before['scale'];expected_y=before['y']+dy/before['scale']
            error=math.hypot(after['x']-expected_x,after['y']-expected_y)
            check(error<.01,kind+f': drag follows the current position plus pointer delta without a jump ({error:.3f} world pixels)'+('' if error<.01 else '; '+json.dumps({'before':before,'after':after})))
            check(abs(after['screenX']-before['screenX']-dx)<=.5 and abs(after['screenY']-before['screenY']-dy)<=.5,kind+': rendered body follows the same screen-space delta')
            check(abs((after['childX']-before['childX'])-(after['x']-before['x']))<.01 and abs((after['childY']-before['childY'])-(after['y']-before['y']))<.01,kind+': descendant moves with the dragged body without its own discontinuity')
        if kind=='touch':
            cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])
        else:
            cdp.call('Input.dispatchMouseEvent',type='mouseReleased',x=p['x']+28,y=p['y']-18,button='left',clickCount=1)
        evaluate('applicationCommandTail')
        released=state()
        check(released['fx'] is None and released['fy'] is None and released['placement']['parentId']==released['parentId'],kind+': release has no fixed coordinates and stores only the new-parent influence')

    check(evaluate(f'!layout.has({q(owner)})&&physics.particles.get({q(owner)}).fx==null'),'initial body has no manual placement or fixed/pinned coordinates')
    move_to(second)
    drag('touch')
    check(state()['sameEntry'],'published Move retains the canonical record referenced by existing interaction handlers')
    # A real manual placement now exists. A second Move must discard only the
    # obsolete parent influence, and must not change subsequent drag subjects.
    move_to(first);drag('touch')
    evaluate(f'physics.resume();focusEntry({q(owner)},{{closeFocus:true,openInspector:false}})')
    wait_for('camera.frame===null&&physics.settled');evaluate('physics.pause()')
    drag('touch')
    cdp.call('Emulation.setTouchEmulationEnabled',enabled=False,maxTouchPoints=1)
    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
    wait_for('!hierarchySidebar.narrow')
    move_to(second);drag('mouse')
    check(not cdp.errors,f'no post-reparent drag browser exceptions: {cdp.errors}')
