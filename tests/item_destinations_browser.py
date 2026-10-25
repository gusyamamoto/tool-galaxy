"""Shared item action menus and destination selection in isolated real storage."""
import json
from pathlib import Path


def run_item_destination_checks(*, cdp, e, check, wait_for, add, click, shot):
    q=json.dumps
    a=add('Galaxy A');source=add('Reusable structure',a);child=add('Restaurants',source);leaf=add('Bookings',child)
    same=add('Library',a);b=add('Galaxy B');other=add('Library',b)
    e(f"createChildEntry({q(b)},true);fields[0].value='Destination tasks';document.getElementById('task-list-tasks').value='Existing task';form.requestSubmit();applicationCommandTail")
    wait_for('!formSaveBusy');task_list=e('selectedNode.dataset.entryId');task=e(f'[...entries.values()].find(x=>x.parentId==={q(task_list)}).id')
    wait_for('physics.settled');e('physics.pause();graphNeedsSave=false')

    def select(item):
        e(f"closeContextMenu();closeContentMenus();hierarchySidebar.restoreMovedSelection([{q(item)}],{q(item)});selectEntry(entries.get({q(item)}),nodes.get({q(item)}),{{reframe:false,openInspector:true}});physics.pause()")

    def menu(item,surface):
        select(item)
        if surface=='sidebar':
            e(f"galaxyModel.ancestors(entries,{q(item)}).forEach(p=>hierarchySidebar.expanded.add(p.id));hierarchySidebar.render();hierarchySidebar.rows.get({q(item)}).scrollIntoView({{block:'center'}})")
            click(f'.hierarchy-row[data-entry-id="{item}"]',button='right')
        else:click('#entry-more-button')
        check(e(f'!contextMenu.hidden&&contextEntryId==={q(item)}'),f'{surface}: real management menu targets the destination')

    def paste(item,surface):
        menu(item,surface)
        check(e("!contextMenu.querySelector('[data-action=paste]').hidden&&contextMenu.querySelector('[data-action=paste]').textContent==='Paste here'"),f'{surface}: valid internal copy exposes Paste here')
        click('#entry-context-menu [data-action=paste]')
        check(e("!document.querySelector('dialog[open]')"),f'{surface}: Paste here immediately executes without a confirmation or success modal')
        wait_for('!pasteBusy')
        check(e(f'entries.get(hierarchySidebar.activeEntryId).parentId==={q(item)}'),'single Paste here activation completes through the shared operation')
        return e('hierarchySidebar.activeEntryId')

    def open_duplicate(item):
        menu(item,'contents')
        e("contextMenu.querySelector('[data-action=duplicate-structure]').scrollIntoView({block:'nearest'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
        click('#entry-context-menu [data-action=duplicate-structure]')
        check(e('structureDialog.open&&document.activeElement===structureName'),'shared Duplicate Structure dialog opens with Name focused')

    def choose(destination,query='Library'):
        e(f"structureDestinationPicker.search.value={q(query)};structureDestinationPicker.search.dispatchEvent(new Event('input'))")
        e(f"document.querySelector('#structure-destination-results [data-entry-id={q(destination)}]').scrollIntoView({{block:'nearest'}})")
        click(f'#structure-destination-results [data-entry-id="{destination}"]')
        check(e(f'structureDestinationPicker.destinationId==={q(destination)}'),'Location selection uses the shared canonical picker')

    def confirm(name):
        e(f'structureName.value={q(name)};structureForm.requestSubmit();applicationCommandTail')
        wait_for('!structureBusy');check(e('!structureDialog.open'),'Duplicate confirms exactly once after durable metadata success')
        return e('hierarchySidebar.activeEntryId')

    def originals():
        return e(f"JSON.stringify([...galaxyModel.subtreeIds(entries,{q(source)})].map(id=>{{const {{x,y,role,depth,seedLayout,...entry}}=entries.get(id);return entry;}}))")

    def keys():return e('(async()=>(await binaryRawState()).files.map(r=>r.key).sort())()')

    for surface in ['sidebar','contents']:
        menu(other,surface);check(e("contextMenu.querySelector('[data-action=paste]').hidden"),f'{surface}: Paste here is absent without a Cosmifold clipboard')
    e('closeContextMenu()')
    check(e("!document.getElementById('hierarchy-paste-dialog')"),'obsolete Paste-only confirmation component is absent from the runtime DOM')
    # Reuse the test-only WebKit fault probe; no attachment implementation changes.
    probe=Path(__file__).with_name('attachment_binary_probe.js').read_text(encoding='utf-8')
    e(probe)
    select(source)
    e("binarySetMode('off');contentInspector.upload([new File(['raw original'],'raw.txt',{type:'text/plain'})])")
    wait_for('contentInspector.jobs.size===0')
    e("""(async()=>{binarySetMode('sync');const c=document.createElement('canvas');c.width=48;c.height=32;c.getContext('2d').fillRect(0,0,48,32);
        const blob=await new Promise(r=>c.toBlob(r,'image/png'));await contentInspector.upload([new File([blob],'fallback.png',{type:'image/png'})]);})()""")
    e(f"saveEntryContent({q(source)},{{...entries.get({q(source)}).content,notes:{{format:'plain',text:'Original notes'}},links:[{{id:'destination-link',url:'https://example.com/',title:'Reference'}}]}});applicationCommandTail")
    e(f"saveEntryLocation({q(source)},{{text:'Tokyo'}});applicationCommandTail")
    # Add a Task List within the copied/duplicated branch, including completed work.
    e(f"createChildEntry({q(source)},true);fields[0].value='Trip tasks';document.getElementById('task-list-tasks').value='Book restaurant';form.requestSubmit();applicationCommandTail")
    wait_for('!formSaveBusy');source_list=e('selectedNode.dataset.entryId');source_task=e(f'[...entries.values()].find(x=>x.parentId==={q(source_list)}).id')
    select(source_task)
    e("document.getElementById('content-task-done').checked=true;document.getElementById('content-task-done').dispatchEvent(new Event('change',{bubbles:true}));applicationCommandTail")
    check(e("(async()=>{const rows=(await binaryRawState()).files;return rows.some(r=>r.blob instanceof Blob)&&rows.some(r=>r.blob.format==='cosmifold-bytes-v1'&&r.thumbnail.format==='cosmifold-bytes-v1');})()"),'source contains both native Blob and WebKit byte-backed originals plus thumbnail')
    original=originals();source_count=e(f'galaxyModel.subtreeIds(entries,{q(source)}).size');source_keys=keys()

    # Default destination preserves existing behavior, including its default name.
    open_duplicate(source)
    check(e(f"structureName.value==='Reusable structure copy'&&structureDestinationPicker.destinationId==={q(a)}&&!structureLocation.hidden"),'Name default is preserved and Location defaults to the same current parent')
    check(e("!structureDialog.querySelector('.move-selection')&&!document.getElementById('structure-destination-selection')&&!structureDialog.textContent.includes('Create in:')&&structureLocation.nextElementSibling===structureError&&structureError.nextElementSibling.matches('.form-actions')"),'Location goes directly to the actions without a redundant destination summary')
    check(e(f"document.querySelector('#structure-destination-results [data-entry-id={q(a)}][aria-selected=true].is-selected .picker-check').textContent==='✓'"),'default parent remains visibly selected with a checkmark in the tree')
    shot('duplicate-location-default-desktop')
    default_copy=confirm('Reusable structure copy')
    check(e(f'entries.get({q(default_copy)}).parentId==={q(a)}'),'unchanged Location creates the same sibling structure as before')
    open_duplicate(source);choose(same)
    same_copy=confirm('Same Galaxy structure')
    check(e(f'entries.get({q(same_copy)}).parentId==={q(same)}'),'selected location in the current Galaxy receives the duplicate')
    open_duplicate(source)
    e("structureDestinationPicker.search.value='Library';structureDestinationPicker.search.dispatchEvent(new Event('input'))")
    check(e("[...document.querySelectorAll('#structure-destination-results .picker-entry-info small')].map(x=>x.textContent).sort().join('|')==='Galaxy A|Galaxy B'"),'same-name search results expose both Galaxy paths')
    choose(other)
    check(e(f"(()=>{{const row=document.querySelector('#structure-destination-results [data-entry-id={q(other)}][aria-selected=true].is-selected');return row?.querySelector('.picker-check').textContent==='✓'&&row.querySelector('.picker-entry-info small').textContent==='Galaxy B';}})()"),'selected Location retains its highlight, checkmark and cross-Galaxy ancestry in the picker')
    shot('duplicate-location-cross-galaxy-desktop')
    across=confirm('Cross Galaxy structure')
    check(e(f'entries.get({q(across)}).parentId==={q(other)}&&galaxyModel.subtreeIds(entries,{q(across)}).size==={source_count}'),'realistic Galaxy A to Galaxy B workflow duplicates the complete hierarchy at the selected destination')
    check(e(f"[...galaxyModel.subtreeIds(entries,{q(across)})].every(id=>{{const x=entries.get(id);return !x.content&&!x.location&&x.description===''&&x.category===''&&(!taskStates.get(id)?.task||!x.completed);}})&&[...galaxyModel.subtreeIds(entries,{q(across)})].some(id=>entries.get(id).taskList)"),'Duplicate stays structure-only, retains Task Lists, resets completion and copies no content or attachments')
    check(keys()==source_keys and originals()==original,'all three duplicates leave original content, ownership and attachment rows unchanged')

    open_duplicate(source)
    check(e(f'!structureDestinationPicker.index.entries.has({q(task_list)})&&!structureDestinationPicker.index.entries.has({q(task)})'),'invalid Task List/task destinations are excluded from the selector')
    before=e("localStorage.getItem('galaxy:user-data')")
    e(f'structureDestinationPicker.destinationId={q(task)};structureForm.requestSubmit();applicationCommandTail')
    wait_for('!structureBusy')
    check(e('structureDialog.open&&!structureError.hidden') and e("localStorage.getItem('galaxy:user-data')")==before,'confirmation revalidates a forged invalid destination without publishing a duplicate')
    e('structureDialog.close()')
    open_duplicate(a)
    check(e("structureDestinationPicker.destinationId===null&&document.getElementById('structure-location-choices').hidden&&!document.getElementById('structure-universe-location').hidden&&document.getElementById('structure-universe-location').textContent==='Universe'"),'Galaxy duplicate fixes Location to Universe and exposes no nesting choice')
    e('structureDialog.close()')

    select(source);menu(source,'sidebar');click('#entry-context-menu [data-action=copy]')
    copied=paste(other,'sidebar')
    check(e(f'entries.get({q(copied)}).parentId==={q(other)}&&galaxyModel.subtreeIds(entries,{q(copied)}).size==={source_count}'),'sidebar Paste here creates the full branch inside the chosen destination')
    check(e(f"entries.get({q(copied)}).name==='Reusable structure'&&entries.get({q(copied)}).content.notes.text==='Original notes'&&entries.get({q(copied)}).location.text==='Tokyo'&&entries.get({q(copied)}).content.links[0].id!=='destination-link'&&[...galaxyModel.subtreeIds(entries,{q(copied)})].some(id=>entries.get(id).completed===true)"),'Copy retains existing names, Notes, Links, Location and task completion semantics')
    check(e(f"""(async()=>{{const src=entries.get({q(source)}).content.attachments,dst=entries.get({q(copied)}).content.attachments;
        for(let i=0;i<src.length;i++){{const x=await attachmentStore.get(src[i].storageKey),y=await attachmentStore.get(dst[i].storageKey);
            if(src[i].storageKey===dst[i].storageKey||y.entryId!=={q(copied)}||await binaryHash(x.blob)!==await binaryHash(y.blob)||!!x.thumbnail!==!!y.thumbnail||(x.thumbnail&&await binaryHash(x.thumbnail)!==await binaryHash(y.thumbnail)))return false;}}
        return dst.length===2&&(await attachmentStore.listOperations()).length===0;}})()"""),'mixed Blob/byte-backed files copy through the existing adapter with independent IDs, exact hashes, thumbnails and F4 cleanup')
    again=paste(same,'contents')
    check(again!=copied and e(f'hierarchyClipboard.roots(entries).length===1&&hierarchyClipboard.roots(entries)[0]==={q(source)}&&entries.get({q(again)}).parentId==={q(same)}'),'Contents Paste here uses the same operation and reusable clipboard')
    check(originals()==original,'repeated paste preserves the original branch data and hierarchy')
    check(e("!document.querySelector('dialog[open]')&&fileFailure.hidden&&!/pasted|copy created/i.test(actionStatus.textContent)"),'successful Paste updates the hierarchy without a routine success modal or toast')
    for target in [task_list,task]:
        for surface in ['sidebar','contents']:
            menu(target,surface);check(e("contextMenu.querySelector('[data-action=paste]').hidden"),f'{surface}: invalid task destination hides Paste here')
    e('closeContextMenu()')
    check(e(f'canPasteHierarchy({q(source)})&&canPasteHierarchy({q(leaf)})'),'existing independent-copy semantics permit finite self/descendant destinations')

    # Invalidate the captured menu after rendering but before activating it.
    for kind in ['source','destination']:
        menu(other,'sidebar' if kind=='source' else 'contents')
        before=e("localStorage.getItem('galaxy:user-data')");before_keys=keys()
        if kind=='source':
            e("window.savedCopyRoots=hierarchyClipboard.copiedRootIds;hierarchyClipboard.copiedRootIds=['deleted-source']")
        else:
            # A paused rendering fixture removes the actual target from the live
            # model while leaving the already-open menu intact.
            e(f"window.savedPasteEntries=[...entries];window.savedPasteResume=physics.resume;physics.pause();physics.resume=()=>{{}};entries.delete({q(other)})")
        click('#entry-context-menu [data-action=paste]');wait_for('!pasteBusy')
        check(e("!fileFailure.hidden&&document.getElementById('file-failure-message').textContent.includes('Nothing was added')"),f'invalidated {kind}: immediate Paste reports a visible F2 error')
        check(keys()==before_keys and e("localStorage.getItem('galaxy:user-data')")==before and e('(async()=>!(await attachmentStore.listOperations()).length)()'),f'invalidated {kind}: no partial hierarchy, byte records or journal')
        if kind=='source':e('hierarchyClipboard.copiedRootIds=savedCopyRoots;delete window.savedCopyRoots')
        else:e('entries.clear();savedPasteEntries.forEach(([id,entry])=>entries.set(id,entry));physics.resume=savedPasteResume;delete window.savedPasteEntries;delete window.savedPasteResume')
        e("document.getElementById('dismiss-file-failure').click();physics.pause()")

    # The immediate operation retains its lifetime guard despite having no modal.
    menu(other,'contents');before_count=e('entries.size');before_keys=keys()
    e("window.copyHeld=false;attachmentStore.setOperationStageHook(()=>{copyHeld=true;return new Promise(resolve=>window.releaseCopy=resolve)});contextMenu.querySelector('[data-action=paste]').click();void pasteHierarchy('another-destination')")
    wait_for('copyHeld')
    check(e("pasteBusy&&crudActive&&!document.querySelector('dialog[open]')"),'a pending copy keeps CRUD guarded without a modal; a second activation cannot start another copy')
    e('releaseCopy();void 0');wait_for('!pasteBusy');e('attachmentStore.setOperationStageHook(null)')
    check(e('entries.size')==before_count+source_count and len(keys())==len(before_keys)+2,'repeated activation during a pending copy commits exactly one branch and attachment batch')

    menu(other,'contents')
    before=e("localStorage.getItem('galaxy:user-data')");before_keys=keys()
    e("binarySetMode('both-fail')");click('#entry-context-menu [data-action=paste]')
    wait_for('!pasteBusy')
    check(e("!fileFailure.hidden&&document.getElementById('file-failure-message').textContent.includes('enough local storage')"),'both native and fallback write failure retains the authoritative visible F2 copy storage error')
    check(keys()==before_keys and e("localStorage.getItem('galaxy:user-data')")==before and e('(async()=>!(await attachmentStore.listOperations()).length)()'),'failed copy publishes no partial branch, orphan bytes or operation journal')
    e("document.getElementById('dismiss-file-failure').click();binarySetMode('sync')")
    paste(other,'contents')
    check(e('fileFailure.hidden'),'retrying Paste here succeeds without a routine success notification')

    # Both dialog modes use the same tree/search/keyboard controller as Move.
    open_duplicate(source)
    e("structureDestinationPicker.search.value='Library';structureDestinationPicker.search.dispatchEvent(new Event('input'));structureDestinationPicker.search.focus()")
    cdp.call('Input.dispatchKeyEvent',type='keyDown',key='ArrowDown',code='ArrowDown',windowsVirtualKeyCode=40)
    cdp.call('Input.dispatchKeyEvent',type='keyUp',key='ArrowDown',code='ArrowDown',windowsVirtualKeyCode=40)
    check(e("document.activeElement.matches('#structure-destination-results [data-entry-id]')"),'Location search supports existing keyboard entry into canonical choices')
    e('structureDialog.close()')
    for width,height in [(390,844),(320,568),(740,360)]:
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=True)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=1)
        wait_for('hierarchySidebar.narrow');e('hierarchySidebar.setCollapsed(true)')
        open_duplicate(source)
        check(e("(()=>{const r=structureDialog.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&structureName.getBoundingClientRect().height>=44&&structureDestinationPicker.search.getBoundingClientRect().height>=44;})()"),f'{width}×{height}: shared Name/Location dialog fits with touch-sized fields')
        choose(other);shot(f'duplicate-location-{width}')
        check(e(f"!document.getElementById('structure-destination-selection')&&document.querySelector('#structure-destination-results [data-entry-id={q(other)}][aria-selected=true].is-selected .picker-check').textContent==='✓'"),f'{width}×{height}: selected Location remains clear without a bottom summary')
        e('structureForm.querySelector("button[type=submit]").scrollIntoView({block:"nearest"})')
        check(e("(()=>{const r=structureForm.querySelector('button[type=submit]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.height>=44;})()"),f'{width}×{height}: Duplicate remains reachable after location selection')
        e('structureDialog.close()')
        if width==390:
            before_count=e('entries.size');mobile_copy=paste(other,'contents')
            check(e(f'entries.size==={before_count+source_count}&&entries.get({q(mobile_copy)}).parentId==={q(other)}&&!document.querySelector("dialog[open]")'),'phone management menu performs the same immediate independent Paste')

    # Backup validation and F8 see ordinary canonical copies and normal Blobs.
    e("(async()=>{const backup=await cosmifoldBackup.create(universeRepository);await cosmifoldRestore.inspect(backup.blob);})()")
    check(True,'F5 validates the complete Universe including cross-Galaxy structures and copied fallback attachments')
    check(e('(async()=>{const a=await universeRepository.auditAttachmentStorage();return !a.orphaned.length&&!a.unknown.length&&!a.recoveryOwned.length;})()'),'F8 finds no copy-created orphans, unknown records or leftover recovery ownership')
    # Keep the normal lock/compare/compensation path authoritative after byte
    # staging, even if another tab changes canonical text before publication.
    menu(other,'contents')
    e("contextMenu.querySelector('[data-action=paste]').scrollIntoView({block:'nearest'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
    before_keys=keys()
    e("""window.destinationHookCalled=false;attachmentStore.setOperationStageHook(()=>{destinationHookCalled=true;const data=JSON.parse(localStorage.getItem('galaxy:user-data'));
        data.entries[0].description='Winning other-tab edit';localStorage.setItem('galaxy:user-data',JSON.stringify(data));});""")
    click('#entry-context-menu [data-action=paste]')
    check(e("!document.querySelector('dialog[open]')"),'short-landscape Paste here executes directly from the management menu')
    wait_for('!pasteBusy');e('attachmentStore.setOperationStageHook(null)')
    stale=e("({stale:localSessionStale,hook:destinationHookCalled,changed:JSON.parse(localStorage.getItem('galaxy:user-data')).entries[0].description})")
    check(stale['stale'] and stale['hook'] and keys()==before_keys and e("!document.getElementById('reload-local-data').hidden&&fileFailure.hidden"),f'F1 prioritizes Reload and removes all staged fallback copy records: {stale}')
    check(e("JSON.parse(localStorage.getItem('galaxy:user-data')).entries[0].description==='Winning other-tab edit'&&(async()=>!(await attachmentStore.listOperations()).length)()"),'F1 preserves winning metadata without leaving an F4 copy journal')
    e('localRestoreInProgress=true;graphNeedsSave=false');cdp.call('Page.reload')
    wait_for("typeof cameraViewReady!=='undefined'&&cameraViewReady",timeout=30)
    check(e(f'entries.has({q(across)})&&entries.get({q(across)}).parentId==={q(other)}&&entries.has({q(copied)})&&hierarchyClipboard.roots(entries).length===0'),'duplicate and content copies persist across reload while the page-local clipboard resets')
    check(not cdp.errors,f'no unhandled item destination exceptions: {cdp.errors}')
