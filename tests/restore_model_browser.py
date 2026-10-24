"""F5: raw model validation before Restore, using disposable real localStorage/IDB."""
import base64
import json
from pathlib import Path
import tempfile
from restore_model_fixture import nested_task_list, rewrite_manifest


def run_restore_model_checks(*, cdp, e, check, wait_for, valid_backup=None, invalid_backup=None):
    # Keep selected files alive through the later confirmed Restore. File/Blob
    # slices may still depend on their disk source until IDB commits them.
    with tempfile.TemporaryDirectory(prefix='cosmifold-f5-picker-') as directory:
        _run_restore_model_checks(cdp=cdp,e=e,check=check,wait_for=wait_for,
                                  fixtures=Path(directory),valid_backup=valid_backup,invalid_backup=invalid_backup)


def _run_restore_model_checks(*, cdp, e, check, wait_for, fixtures, valid_backup, invalid_backup):
    q = json.dumps
    date = '2026-10-11T00:00:00Z'
    key = 'galaxy:user-data'
    content = {'version': 1, 'notes': {'format': 'plain', 'text': 'Keep these notes'},
               'links': [{'id': 'bookmark', 'url': 'https://example.com/', 'title': 'Saved link'}], 'attachments': []}
    data = {'version': 5, 'connections': [], 'layout': [], 'entries': [
        {'id': 'root', 'name': 'Travel', 'parentId': None},
        {'id': 'normal', 'name': 'Tokyo', 'parentId': 'root', 'content': content, 'location': {'text': 'Tokyo Station'}},
        {'id': 'deep', 'name': 'Details', 'parentId': 'normal'},
        {'id': 'list', 'name': 'Packing', 'parentId': 'root', 'taskList': True},
        {'id': 'done', 'name': 'Passport', 'parentId': 'list', 'completed': True},
        {'id': 'todo', 'name': 'Tickets', 'parentId': 'list', 'completed': False},
        {'id': 'archived', 'name': 'Old trip', 'parentId': None}],
        'constellations': [{'id': 'collection', 'name': 'Trip', 'memberEntryIds': ['normal', 'done'], 'createdAt': date}],
        'archivedGalaxies': [{'galaxyId': 'archived', 'archivedAt': date, 'expandedIds': ['archived']}]}

    def ready():
        wait_for("document.readyState==='complete'&&typeof cameraViewReady!=='undefined'&&cameraViewReady")
        e('physics.pause();applicationCommandTail')

    def seed(raw):
        e(f'localRestoreInProgress=true;localStorage.setItem({q(key)},{q(raw)})')
        cdp.call('Page.reload'); ready()

    seed(q(data))
    e("addEntryAttachment('normal',{key:'f5-file',entryId:'normal',blob:new Blob(['exact original bytes'],{type:'text/plain'}),thumbnail:new Blob(['thumb'],{type:'image/webp'})},{id:'f5-file-id',kind:'upload',entryId:'normal',storageKey:'f5-file',filename:'original.txt',mimeType:'text/plain',size:20,createdAt:"+q(date)+"})")
    encoded = e("(async()=>{const b=await cosmifoldBackup.create(universeRepository);return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(b.blob)});})()")
    good = base64.b64decode(encoded)
    check(len(good) > 57, 'A: rich current backup exported with hierarchy, content, tasks, archive, Constellation and file')

    # Keep an ordinary journal pending while candidates are inspected. Validation
    # must not even open a write transaction or consume this recovery evidence.
    journal = {'version': 1, 'id': e('cosmifoldIds.uuid()'), 'type': 'add', 'stage': 'files-written',
               'files': [{'key': 'f5-file', 'entryId': 'normal'}]}
    def seed_journal():
        e("""(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('galaxy-attachments');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
            try{await new Promise((resolve,reject)=>{const tx=db.transaction('fileOperations','readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.objectStore('fileOperations').put("""+q(journal)+");});}finally{db.close();}})()")

    seed_journal()

    def state():
        return e("""(async()=>({raw:localStorage.getItem('galaxy:user-data'),preferences:persistence.preferences.readForBackup(),
            restore:localStorage.getItem('galaxy:user-data:restore-pending'),marker:await persistence.files.restoreMarker(),journals:await persistence.files.listOperations(),
            files:await Promise.all((await persistence.files.readAll()).map(async r=>({key:r.key,owner:r.entryId,type:r.blob.type,bytes:Array.from(new Uint8Array(await r.blob.arrayBuffer())),thumbnail:r.thumbnail?Array.from(new Uint8Array(await r.thumbnail.arrayBuffer())):null})))}))()""")

    def quiet():
        return e("!localDataRecovery&&storageAvailable&&!localSessionStale&&firstUse.root.hidden&&document.getElementById('file-failure').hidden")

    # Exercise the real button -> file picker -> input/change handler. No test
    # calls checkBackup/inspect directly, including the exact operator fixtures.
    cdp.call('Page.setInterceptFileChooserDialog',enabled=True)
    e("window.f5PickerChanges=0;backupUI.file.addEventListener('change',()=>f5PickerChanges++)")
    def choose(path):
        changes=e('f5PickerChanges')
        e("backupUI.file.value='';backupUI.choose.click()")
        document=cdp.call('DOM.getDocument')['root']['nodeId']
        node=cdp.call('DOM.querySelector',nodeId=document,selector='#restore-backup-file')['nodeId']
        cdp.call('DOM.setFileInputFiles',nodeId=node,files=[str(path.resolve())])
        wait_for(f'f5PickerChanges>{changes}&&!backupUI.busy')
        assert e('backupUI.file.files[0].name')==path.name, 'Native picker did not select the requested file'

    candidate_number=0
    def inspect(blob):
        nonlocal candidate_number
        candidate_number+=1
        path=fixtures/f'candidate-{candidate_number}.cosmifold'
        path.write_bytes(blob)
        choose(path)

    def changed(mutate):
        def apply(manifest):
            mutate(manifest)
            manifest['metadataText'] = q(manifest['metadata'])
        return rewrite_manifest(good, apply)

    def at(m):
        entries = {entry['id']: entry for entry in m['metadata']['entries']}
        return [entries[identifier] for identifier in ['root', 'normal', 'deep', 'list', 'done', 'todo', 'archived']]

    cases = [
        ('B nested Task Lists', nested_task_list(good)),
        ('C task with child', changed(lambda m: at(m)[2].update(parentId='done'))),
        ('D malformed completion', changed(lambda m: at(m)[4].update(completed='true'))),
        ('D malformed Task List flag', changed(lambda m: at(m)[3].update(taskList='yes'))),
        ('D parent semantics cannot be overridden', changed(lambda m: (at(m)[4].update(taskList=False), at(m)[2].update(parentId='done')))),
        ('E orphan', changed(lambda m: at(m)[2].update(parentId='missing'))),
        ('F duplicate ID', changed(lambda m: at(m)[2].update(id='root'))),
        ('G cycle', changed(lambda m: at(m)[0].update(parentId='deep'))),
        ('G self parent', changed(lambda m: at(m)[2].update(parentId='deep'))),
        ('H missing Constellation member', changed(lambda m: m['metadata']['constellations'][0]['memberEntryIds'].append('missing'))),
        ('normalization timestamp hole', changed(lambda m: m['metadata']['constellations'][0].update(updatedAt='invalid date'))),
        ('I attachment owner', changed(lambda m: at(m)[1]['content']['attachments'][0].update(entryId='done'))),
        ('I malformed file key', changed(lambda m: at(m)[1]['content']['attachments'][0].update(storageKey=' '))),
        ('J missing required original', changed(lambda m: m['attachments'].clear())),
        ('K extra unreferenced file', changed(lambda m: at(m)[1]['content']['attachments'].clear())),
        ('M future version', changed(lambda m: m.update(backupVersion=2))),
        ('N missing section', changed(lambda m: m['metadata'].pop('entries'))),
        ('N malformed/truncated file', good[:70]),
    ]
    before = state()
    e("document.getElementById('backup-button').click()")
    inspect(good)
    check(e("!!backupUI.handle&&!backupUI.preview.hidden&&backupUI.confirm.getClientRects().length>0&&document.activeElement===backupUI.confirm"),
          'real picker: valid backup reaches normal validated preview and confirmation')
    e('backupUI.cancel.click()');wait_for('!backupUI.dialog.open')
    check(state()==before, 'real picker: cancelling valid preview preserves canonical text, files and F4 journal')
    e("document.getElementById('backup-button').click()")
    if valid_backup is not None:
        choose(valid_backup)
        check(e('!!backupUI.handle&&!backupUI.preview.hidden'), 'operator Backup A: actual disk file reaches normal preview')
        e('backupUI.cancel.click()');wait_for('!backupUI.dialog.open')
        e("document.getElementById('backup-button').click()")
        choose(invalid_backup)
        check(e("!backupUI.handle&&backupUI.preview.hidden&&backupUI.confirm.getClientRects().length===0&&backupUI.status.textContent.includes('saved structure is invalid')"),
              'operator InvalidB/C: actual helper-generated disk file is rejected before preview')
        check(state()==before and quiet(), 'operator fixture selection preserves the current synthetic Universe, file bytes and F4 journal')
    for label, blob in cases:
        inspect(blob)
        check(e('!backupUI.busy&&!backupUI.handle&&backupUI.preview.hidden'), label+': rejected before confirmation')
        e('backupUI.restore()')
        check(state() == before and quiet(), label+': exact canonical text/files/F4 journal/commit marker survive; app stays usable')
    check(e("backupUI.status.textContent.length>0&&document.getElementById('file-failure').hidden"),
          'validation errors stay in Restore; no F2 banner')
    inspect(cases[15][1])
    check(e("backupUI.status.textContent.includes('created by a newer version of Cosmifold')"), 'M: understandable newer-version message')
    inspect(cases[0][1])
    check(e("backupUI.status.textContent.includes('saved structure is invalid')"), 'B: understandable saved-structure message')
    e('backupUI.dialog.close()')
    # A real ordinary edit still works after all rejected candidates.
    e("saveEntryLocation('normal',{text:'Updated station'})")
    check(e("JSON.parse(localStorage.getItem('galaxy:user-data')).entries.find(e=>e.id==='normal').location.text==='Updated station'"), 'invalid attempts leave ordinary writes usable')
    cdp.call('Page.reload'); ready()
    check(quiet() and e("entries.get('done').completed&&!entries.get('todo').completed"), 'invalid candidate never installs a model that fails F3 reload')

    # O: inspect a valid candidate, fail inside the existing real IDB commit.
    e("window.f5PickerChanges=0;backupUI.file.addEventListener('change',()=>f5PickerChanges++)")
    e("document.getElementById('backup-button').click()")
    seed_journal()
    inspect(good); before = state()
    e("window.realF5Replace=persistence.preferences.replaceRaw;window.failF5Once=true;persistence.preferences.replaceRaw=function(text){if(failF5Once){failF5Once=false;throw new Error('forced F5 commit failure')}return realF5Replace.call(this,text)};backupUI.restore()")
    check(state() == before and quiet(), 'O: failure after metadata replacement restores exact previous canonical text, file bytes and F4 journal')
    e('persistence.preferences.replaceRaw=realF5Replace;backupUI.dialog.close()')

    # P: corruption recovery must preserve its original when model validation fails.
    raw = ' {"version":5,"entries":[{"id":"lost","name":"Keep","parentId":"missing"}],"layout":[]} '
    seed(raw)
    e("window.f5PickerChanges=0;backupUI.file.addEventListener('change',()=>f5PickerChanges++)")
    e("document.getElementById('restore-recovery-backup').click()")
    before = state(); inspect(cases[0][1])
    check(state() == before and e('localDataRecovery&&!storageAvailable&&!backupUI.handle'), 'P: invalid model candidate preserves corrupt original and recovery actions')
    inspect(good)
    check(e('!!backupUI.handle&&!backupUI.confirm.disabled'), 'A/L: oldest supported portable v1/storage-v5 backup validates unchanged')
    time_origin = e('performance.timeOrigin')
    e('void backupUI.restore()')
    wait_for(f'performance.timeOrigin!=={time_origin}&&typeof cameraViewReady!=="undefined"&&cameraViewReady')
    ready()
    check(quiet(), 'P/Q: successful recovery Restore reloads normally with no recovery/onboarding')
    check(e("entries.get('list').taskList&&entries.get('done').completed&&!entries.get('todo').completed&&entries.get('deep').parentId==='normal'"), 'A/Q: hierarchy and both completion states survive')
    check(e("entries.get('normal').content.notes.text==='Keep these notes'&&entries.get('normal').content.links[0].url==='https://example.com/'&&entries.get('normal').location.text==='Tokyo Station'&&constellations.get('collection').memberEntryIds.includes('done')&&archivedEntries.has('archived')"), 'A/Q: Notes, Link, Location, Constellation and archive survive')
    check(e("(async()=>await (await persistence.files.get('f5-file')).blob.text()==='exact original bytes'&&await (await persistence.files.get('f5-file')).thumbnail.text()==='thumb')()"), 'A/Q: original and thumbnail bytes survive successful Restore')
    check(e("(async()=>!(await persistence.files.listOperations()).length&&!persistence.metadata.readRestoreJournal())()"), 'F4: successful replacement leaves no obsolete ordinary or Restore journals')
    check(e("(()=>{galaxyModel.validateStoredSnapshot(JSON.parse(localStorage.getItem('galaxy:user-data')));return true})()"), 'Q: restored canonical data passes the exact F3 validator')
