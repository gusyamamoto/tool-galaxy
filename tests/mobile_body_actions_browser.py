"""Canonical body management controls, reparenting and Paste in a local profile."""
import json


def run_body_actions_checks(*, cdp, evaluate, check, wait_for, add, shot):
    root=add('Management');source=add('Original parent',root);destination=add('Destination',root)
    owner=add('Managed body',source);child=add('Descendant',owner);other=add('Copied body',source)
    wait_for('physics.settled');evaluate('physics.pause()')
    q=json.dumps
    quick=['Rename','Add to Constellation','More…']
    full=['Rename','Move to…','Add to Constellation','Copy','Duplicate structure','Delete item']

    def labels():
        return evaluate("[...contextMenu.querySelectorAll(':scope > button:not([hidden])')].map(b=>b.textContent)")

    def tap(selector):
        evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        p=evaluate(f"(()=>{{const n=document.querySelector({q(selector)}),r=n.getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}};}})()")
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
        cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])

    def select(entry_id=owner):
        evaluate(f'closeContextMenu();closeContentMenus();selectEntry(entries.get({q(entry_id)}),nodes.get({q(entry_id)}),{{openInspector:false}})')

    def preview():
        evaluate('closeInspector();hierarchySidebar.setCollapsed(true)');select()
        tap('#mobile-body-more')

    def expand():
        tap('#entry-context-menu [data-action=more]')

    def key_escape():
        cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
        cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Escape',code='Escape',windowsVirtualKeyCode=27)

    for width,height in [(360,800),(390,844),(430,932),(844,390)]:
        tag=f'{width}x{height}'
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=2,mobile=True)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=5)
        wait_for('hierarchySidebar.narrow');preview()
        check(labels()==quick,'CB View quick actions are exactly Rename, membership and More: '+tag)
        check(evaluate("contextMenu.querySelector('[data-action=delete]').hidden&&!contextMenu.querySelector('[data-action=create]')&&!contextMenu.querySelector('[data-action=files]')&&!contextMenu.querySelector('[data-action=paste]')"),'quick menu hides Delete and management has no add/file/Paste duplicates: '+tag)
        check(evaluate(f'contextEntryId==={q(owner)}&&contextReturnFocus.id==="mobile-body-more"'),'preview management is bound to the selected body: '+tag)
        shot('body-actions-quick-'+tag)
        expand()
        check(labels()==full and evaluate(f'contextEntryId==={q(owner)}'),'More expands full management without replacing its body identity: '+tag)
        check(evaluate("contextMenu.querySelectorAll(':scope > [role=separator]:not([hidden])').length===2&&(()=>{const r=contextMenu.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})()"),'full management uses shared separators and stays within the viewport: '+tag)
        evaluate("window.managementSurface=['backgroundColor','borderRadius','padding','boxShadow','borderColor'].map(k=>getComputedStyle(contextMenu)[k]);window.managementRow=['fontSize','padding','minHeight','color'].map(k=>getComputedStyle(contextMenu.querySelector('[data-action=edit]'))[k])")
        shot('body-actions-full-'+tag)
        key_escape()
        check(evaluate("contextMenu.hidden&&document.activeElement.id==='mobile-body-more'&&document.activeElement.ariaExpanded==='false'"),'More/Escape returns to the same preview trigger: '+tag)
        evaluate('setInspectorOpen(true)')
        tap('#entry-more-button')
        check(labels()==quick and evaluate(f'contextEntryId==={q(owner)}&&contentInspector.entryId==={q(owner)}'),'Contents header uses the identical quick menu and body: '+tag)
        expand();check(labels()==full,'Contents More uses the identical full management menu: '+tag)
        check(evaluate("moreButton.ariaExpanded==='true'"),'Contents trigger remains expanded while its full menu is open: '+tag)
        key_escape()
        check(evaluate("document.activeElement.id==='entry-more-button'"),'Contents menu retains header focus ownership: '+tag)
        tap('#entry-more-button');tap('#entry-more-button')
        check(evaluate('contextMenu.hidden'),'a second header action tap toggles its menu closed: '+tag)
        evaluate('closeInspector();hierarchySidebar.setCollapsed(false)')
        evaluate(f"hierarchySidebar.rows.get({q(owner)}).scrollIntoView({{block:'nearest'}})")
        tap(f'.hierarchy-row[data-entry-id="{owner}"] .tree-more')
        check(labels()==full and evaluate(f'contextEntryId==={q(owner)}&&!hierarchySidebar.collapsed'),'Menu View directly shows full management for the row body: '+tag)
        # Selection can change independently while More retains its original identity.
        evaluate('closeContextMenu();hierarchySidebar.setCollapsed(true)');preview()
        evaluate(f'selectEntry(entries.get({q(other)}),nodes.get({q(other)}),{{openInspector:false}})')
        expand()
        check(evaluate(f'contextEntryId==={q(owner)}'),'More never substitutes another selected body for its retained target: '+tag)
        evaluate('closeContextMenu()')

    cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=2,mobile=True)
    preview();expand()
    tap('#entry-context-menu [data-action=move]')
    check(evaluate(f'dialog.open&&editingId==={q(owner)}&&document.getElementById("entry-name-field").hidden&&!document.getElementById("parent-field").hidden'),'Move to reuses the existing confirm-based parent form for the exact body')
    check(evaluate(f'![...parentField.options].some(o=>[{q(owner)},{q(child)}].includes(o.value))&&[...parentField.options].some(o=>o.value==={q(destination)}&&o.textContent.includes("Management / Destination"))'),'parent choices show full paths and exclude self and descendants')
    evaluate(f'parentField.value={q(destination)};parentField.dispatchEvent(new Event("change"))')
    check(evaluate(f'entries.get({q(owner)}).parentId==={q(source)}'),'choosing a destination alone does not mutate the hierarchy')
    tap('#cancel-add-entry')
    check(evaluate(f'!dialog.open&&entries.get({q(owner)}).parentId==={q(source)}'),'Move cancellation leaves the original parent intact')
    preview();expand();tap('#entry-context-menu [data-action=move]')
    for illegal in [owner,child]:
        evaluate(f'parentField.add(new Option("Injected illegal destination",{q(illegal)}));parentField.value={q(illegal)};form.requestSubmit()')
        check(evaluate(f'dialog.open&&!formError.hidden&&entries.get({q(owner)}).parentId==={q(source)}'),'save validation independently rejects an injected self/descendant destination: '+illegal)
    evaluate(f'parentField.value={q(destination)};form.requestSubmit()')
    wait_for('!dialog.open&&!formSaveBusy');evaluate('physics.pause()')
    check(evaluate(f'entries.get({q(owner)}).parentId==={q(destination)}&&entries.get({q(child)}).parentId==={q(owner)}&&portals.size===0'),'confirmed Move changes the actual parent, preserves descendants and creates no link')
    check(evaluate(f'JSON.parse(localStorage.getItem("galaxy:user-data")).entries.find(e=>e.id==={q(owner)}).parentId==={q(destination)}'),'confirmed reparenting persists through the existing repository')

    preview();tap('#entry-context-menu [data-action=constellation]')
    check(evaluate(f'!document.getElementById("constellation-memberships").hidden&&contextEntryId==={q(owner)}'),'quick Add to Constellation reuses existing membership management')
    key_escape();check(evaluate("document.activeElement.id==='mobile-body-more'"),'membership submenu retains the original body trigger')
    preview();tap('#entry-context-menu [data-action=edit]')
    check(evaluate(f'dialog.open&&editingId==={q(owner)}&&!document.getElementById("entry-name-field").hidden&&document.getElementById("parent-field").hidden'),'quick Rename opens the existing name-only form for its retained body')
    tap('#cancel-add-entry')

    evaluate(f'copyHierarchyItems([{q(other)}])')
    preview();evaluate('closeContextMenu()');tap('#mobile-body-add')
    check(evaluate("[...addMenu.querySelectorAll('button:not([hidden])')].map(b=>b.textContent).join('|')==='Take Photo|Photo Library / Gallery|Quick note|More…'"),'quick + menu is unchanged even with copied items')
    tap('#add-menu [data-add=more]')
    check(evaluate("JSON.stringify(managementSurface)===JSON.stringify(['backgroundColor','borderRadius','padding','boxShadow','borderColor'].map(k=>getComputedStyle(addMenu)[k]))&&JSON.stringify(managementRow)===JSON.stringify(['fontSize','padding','minHeight','color'].map(k=>getComputedStyle(addMenu.querySelector('[data-add=gallery]'))[k]))"),'management and Add use identical surface, typography and row treatment')
    check(evaluate("!addMenu.querySelector('[data-add=paste]').hidden&&!addMenu.querySelector('[data-add=paste]').disabled"),'Paste is available in the full Add menu')
    tap('#add-menu [data-add=paste]')
    check(evaluate(f'pasteDialog.open&&pasteDestination==={q(owner)}&&document.getElementById("hierarchy-paste-description").textContent.includes("Managed body")'),'relocated Paste opens the same existing confirmation for the exact destination')
    tap('#hierarchy-paste-cancel')
    check(evaluate('!pasteDialog.open'),'Paste still cancels without inserting anything')

    cdp.call('Emulation.setTouchEmulationEnabled',enabled=False,maxTouchPoints=1)
    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
    wait_for('!hierarchySidebar.narrow');select();evaluate('setInspectorOpen(true);moreButton.click()')
    check(labels()==full and evaluate(f'contextEntryId==={q(owner)}'),'desktop Contents exposes the full canonical management menu')
    evaluate(f'openContextMenu({q(root)},300,150)')
    check(labels()==full[:-1]+['Archive Galaxy','Delete item'],'full Galaxy management preserves Archive Galaxy')
    evaluate(f'closeContextMenu();toggleContentMenu(addMenu,moreButton,{q(owner)})')
    check(evaluate("[...addMenu.querySelectorAll('button:not([hidden])')].map(b=>b.textContent).join('|')==='Add item|Add existing item|Paste|Add files|Add note|Add bookmark'"),'desktop Add retains its previous capabilities with Paste relocated into it')
    check(not cdp.errors,f'no body-management browser exceptions: {cdp.errors}')
