"""Isolated real IDB: one held-operation reload plus durable crash-state fixtures.

These checks do not kill the browser process or simulate physical power failure.
"""
import json
import time


def run_attachment_recovery_checks(*,cdp,cdp_class,e,check,wait_for,origin,add):
    q=json.dumps
    owner=add('Attachment recovery owner')
    other=add('Unrelated owner')
    wait_for('physics.settled');e('physics.pause();graphNeedsSave=false')

    def ready(client=cdp):
        deadline=time.monotonic()+25
        while not client.evaluate("document.readyState==='complete'&&typeof cameraViewReady!=='undefined'&&cameraViewReady"):
            assert time.monotonic()<deadline,'Recovery tab did not initialize'
            time.sleep(.03)
        client.evaluate('physics.pause();applicationCommandTail')

    def reload():
        e('localRestoreInProgress=true;graphNeedsSave=false')
        cdp.call('Page.reload');ready()

    def peer_tab(navigate=True):
        target=cdp.call('Target.createTarget',url='about:blank')['targetId']
        endpoint=cdp.sock.getpeername()
        client=cdp_class(f'ws://127.0.0.1:{endpoint[1]}/devtools/page/{target}')
        client.call('Page.enable');client.call('Runtime.enable')
        client.call('Page.addScriptToEvaluateOnNewDocument',source="""document.addEventListener('load',event=>{
            if(event.target.tagName==='SCRIPT'&&event.target.src.endsWith('/services/supabase-auth.js'))
                createSupabaseAuthAdapter=()=>({available:false,async initialize(){return {user:null}},dispose(){}});
        },true);""")
        if navigate:
            client.call('Page.navigate',url=origin);ready(client)
        return target,client

    def close(target,client):
        cdp.call('Target.closeTarget',targetId=target);client.sock.close()

    def op(kind,keys,stage='files-written',version=1):
        return {'version':version,'id':e('cosmifoldIds.uuid()'),'type':kind,'stage':stage,
                'files':[{'key':key,'entryId':entry} for key,entry in keys]}

    def seed(records=(),operations=(),deleted=()):
        # Deliberately construct persisted intermediate states, not runtime errors.
        e("""(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('galaxy-attachments');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
            try{await new Promise((resolve,reject)=>{const tx=db.transaction(['files','fileOperations'],'readwrite',{durability:'strict'});
            tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
            """+q(list(records))+""".forEach(r=>tx.objectStore('files').put({key:r.key,entryId:r.entryId,blob:new Blob([r.data||'fixture'])}));
            """+q(list(operations))+""".forEach(r=>tx.objectStore('fileOperations').put(r));
            """+q(list(deleted))+""".forEach(key=>tx.objectStore('files').delete(key));});}finally{db.close();}})()""")

    def exists(key):
        return e('(async()=>!!await persistence.files.get('+q(key)+'))()')

    def operations():
        return e('persistence.files.listOperations()')

    def upload(name='normal.txt',item=owner):
        payload='%PDF-1.4 fixture' if name.endswith('.pdf') else 'original bytes'
        e(f"selectEntry(entries.get({q(item)}),nodes.get({q(item)}),{{openInspector:true,reframe:false}});contentInspector.upload([new File([{q(payload)}],{q(name)})],{q(item)})")
        return e(f'entries.get({q(item)}).content.attachments.at(-1).storageKey')

    def quiet():
        return e("!localDataRecovery&&!localSessionStale&&document.getElementById('file-failure').hidden")

    # A: hold the actual add AFTER its durable file transaction; Reload discards
    # the unresolved continuation before it can commit metadata or compensate.
    e("""persistence.files.setOperationStageHook(({operation})=>{window.interruptedFileKey=operation.files[0].key;return new Promise(()=>{});});
        void contentInspector.upload([new File(['paused original'],'interrupted.txt',{type:'text/plain'})],"""+q(owner)+')')
    wait_for("typeof interruptedFileKey==='string'")
    pending=operations();interrupted=e('interruptedFileKey')
    check(len(pending)==1 and pending[0]['stage']=='files-written' and exists(interrupted), 'A: actual add is held after durable journal/blob creation and before metadata commit')
    check(e(f"!entries.get({q(owner)}).content?.attachments.length"), 'A: canonical metadata has no phantom attachment')
    reload()
    check(not exists(interrupted) and not operations() and quiet(), 'A: restart quietly removes the journal-owned orphan and clears its journal')

    # J/B: journal cleanup failure after a real successful add is nonfatal.
    e("window.realJournalDelete=IDBObjectStore.prototype.delete;IDBObjectStore.prototype.delete=function(key){if(this.name==='fileOperations')throw new Error('forced journal cleanup failure');return realJournalDelete.call(this,key)}")
    committed=upload('committed.txt')
    e('IDBObjectStore.prototype.delete=realJournalDelete')
    check(exists(committed) and len(operations())==1 and quiet(), 'B: completed add stays successful and quiet when journal cleanup fails')
    reload()
    check(exists(committed) and not operations() and e(f'entries.get({q(owner)}).content.attachments.length===1'), 'B: startup preserves committed original and metadata without duplication')
    normal=upload()
    check(exists(normal) and not operations() and quiet(), 'J: normal add creates and clears its small journal without success notices')
    e(f'removeEntryAttachment({q(owner)},{q(normal)})')
    check(not exists(normal) and not operations(), 'J: normal remove commits metadata and clears blob/journal')
    file_count=e('(async()=>(await persistence.files.readAll()).length)()')
    e("window.realJournalAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(value,...args){if(this.name==='fileOperations')throw new DOMException('forced journal quota','QuotaExceededError');return realJournalAdd.call(this,value,...args)}")
    e(f"contentInspector.upload([new File(['fixture'],'journal-quota.txt')],{q(owner)})")
    e('IDBObjectStore.prototype.add=realJournalAdd')
    check(e('(async()=>(await persistence.files.readAll()).length)()')==file_count and not operations() and e("contentInspector.status.textContent.includes('local browser storage')"), 'K: journal creation failure reports quota before any risky blob or metadata write')
    e('contentInspector.clearMessage()')

    # C: metadata removal durable, blob cleanup did not happen.
    removed=upload('remove-me.txt')
    seed(operations=[op('remove',[(removed,owner)],'prepared')])
    e(f"localRestoreInProgress=true;const data=JSON.parse(localStorage.getItem('galaxy:user-data'));data.entries.find(x=>x.id==={q(owner)}).content.attachments=data.entries.find(x=>x.id==={q(owner)}).content.attachments.filter(f=>f.storageKey!=={q(removed)});localStorage.setItem('galaxy:user-data',JSON.stringify(data))")
    reload()
    check(not exists(removed) and exists(committed) and not operations(), 'C: interrupted remove cleans only its unreferenced blob without restoring metadata')

    # D: preserve metadata even if a removal journal accompanies missing bytes.
    missing=upload('missing.pdf')
    seed(operations=[op('remove',[(missing,owner)],'prepared')],deleted=[missing])
    reload()
    check(e(f'entries.get({q(owner)}).content.attachments.some(f=>f.storageKey==={q(missing)})') and not operations(), 'D: missing blob never causes silent attachment metadata deletion')
    e(f"contentInspector.openFile(entries.get({q(owner)}).content.attachments.find(f=>f.storageKey==={q(missing)}))")
    wait_for("imageViewer.dialog.open&&!imageViewer.status.hidden&&imageViewer.status.textContent.includes('could not be opened')")
    check(True,'D: existing missing-file preview remains available')
    e('imageViewer.dialog.close()')

    # E: copied keys are independent; unknown orphan keys are out of scope.
    copykeys=[('copy-one','new-owner'),('copy-two','new-child')]
    seed(records=[{'key':key,'entryId':entry} for key,entry in copykeys]+[{'key':'unknown-orphan','entryId':'unknown'}],operations=[op('copy',copykeys)])
    reload()
    check(all(not exists(key) for key,_ in copykeys) and exists(committed) and exists('unknown-orphan') and not operations(), 'E: interrupted copied blobs are cleaned while original and unknown orphan remain untouched')
    check(e("!entries.has('new-owner')&&!entries.has('new-child')"), 'E: recovery never creates a duplicate hierarchy')
    seed(operations=[op('add',[('unknown-orphan','new-owner')],'prepared')])
    reload()
    check(exists('unknown-orphan') and not operations(), 'prepared add cannot claim or delete a pre-existing collision/orphan')
    collision=e("(async()=>{try{await persistence.files.save({key:'unknown-orphan',entryId:'new-owner',blob:new Blob(['overwrite attempt'])});return false;}catch{return true;}})()")
    check(collision and exists('unknown-orphan') and not operations() and e("(async()=>(await persistence.files.get('unknown-orphan')).entryId==='unknown')()"), 'runtime key collision rejects without overwriting or compensating away another file')
    mismatch=op('add',[('wrong-owner','claimed')])
    seed(records=[{'key':'wrong-owner','entryId':'actual'}],operations=[mismatch])
    reload()
    check(exists('wrong-owner') and len(operations())==1 and e('localDataRecovery'), 'ownership mismatch preserves both row and journal instead of guessing')
    mismatch['files'][0]['entryId']='actual'
    seed(operations=[mismatch]);reload()

    # F: known branch-owned keys remain after canonical deletion.
    branch=add('Deleted branch fixture')
    branch_file=upload('branch.txt',branch)
    e("window.originalBranchMetadataSave=persistence.metadata.save;window.failBranchMetadata=true;persistence.metadata.save=function(snapshot,intent){originalBranchMetadataSave(snapshot,intent);if(failBranchMetadata&&intent?.type==='items.deleted'){failBranchMetadata=false;throw new Error('forced rejection after branch metadata commit')}}")
    e(f"requestEntryDelete({q(branch)});document.getElementById('delete-entry-form').requestSubmit()")
    wait_for('!deletionBusy')
    e('persistence.metadata.save=originalBranchMetadataSave')
    check(exists(branch_file) and not operations() and e(f"entries.has({q(branch)})&&JSON.parse(localStorage.getItem('galaxy:user-data')).entries.some(x=>x.id==={q(branch)})"), 'K: branch callback failure after metadata publication restores hierarchy and bytes immediately')
    e('deleteDialog.close()')
    seed(records=[{'key':'branch-orphan','entryId':branch}],operations=[op('deleteEntries',[(branch_file,branch),('branch-orphan',branch)],'prepared')])
    e(f"localRestoreInProgress=true;const data=JSON.parse(localStorage.getItem('galaxy:user-data'));data.entries=data.entries.filter(x=>x.id!=={q(branch)});localStorage.setItem('galaxy:user-data',JSON.stringify(data))")
    reload()
    check(not exists(branch_file) and not exists('branch-orphan') and exists(committed) and e(f'!entries.has({q(branch)})'), 'F: interrupted branch cleanup finishes without resurrection or unrelated deletion')

    # G: abort recovery after its first queued deletion; its whole IDB tx rolls
    # back. This is an injected interruption, not a browser-process kill.
    recovery_keys=[('retry-one','gone'),('retry-two','gone')]
    seed(records=[{'key':key,'entryId':entry} for key,entry in recovery_keys],operations=[op('copy',recovery_keys)])
    hook=cdp.call('Page.addScriptToEvaluateOnNewDocument',source="""window.fileRecoveryDelete=IDBObjectStore.prototype.delete;
        IDBObjectStore.prototype.delete=function(key){if(this.name==='files'&&key==='retry-two')throw new Error('injected mid-recovery interruption');return fileRecoveryDelete.call(this,key)};""")['identifier']
    reload()
    check(all(exists(key) for key,_ in recovery_keys) and len(operations())==1 and e('localDataRecovery'), 'G: failed recovery rolls back all deletions and preserves its retry journal')
    cdp.call('Page.removeScriptToEvaluateOnNewDocument',identifier=hook)
    reload()
    check(all(not exists(key) for key,_ in recovery_keys) and not operations() and quiet(), 'G: later restart completes idempotently after interrupted recovery')

    # H: both startup attempts queue behind exactly the existing F1 write lock.
    seed(records=[{'key':'two-tabs','entryId':'gone'}],operations=[op('add',[('two-tabs','gone')])])
    e("window.recoveryBarrierHeld=false;void navigator.locks.request('cosmifold-workspace-write:null',{mode:'exclusive'},()=>{recoveryBarrierHeld=true;return new Promise(resolve=>window.releaseRecoveryBarrier=resolve)});")
    wait_for('recoveryBarrierHeld')
    peers=[]
    try:
        for _ in range(2):
            target,client=peer_tab(False);peers.append((target,client))
            client.call('Page.addScriptToEvaluateOnNewDocument',source="""const deleteForRace=IDBObjectStore.prototype.delete;
                IDBObjectStore.prototype.delete=function(key){if(this.name==='files'&&key==='two-tabs')localStorage.setItem('f4-recovery-deletes',String(Number(localStorage.getItem('f4-recovery-deletes')||0)+1));return deleteForRace.call(this,key)};""")
            client.call('Page.navigate',url=origin)
        check(all(client.evaluate("typeof cameraViewReady==='undefined'") for _,client in peers), 'H: simultaneous startup recovery waits for exclusive F1 ownership')
        e('releaseRecoveryBarrier();void 0')
        for _,client in peers:
            ready(client)
        check(e("localStorage.getItem('f4-recovery-deletes')==='1'") and not exists('two-tabs') and not operations(), 'H: one startup performs cleanup; the second observes the consistent final state')
        check(all(client.evaluate('!localSessionStale&&!localDataRecovery') for _,client in peers), 'H: both recovered tabs initialize normally with F1 intact')
    finally:
        for target,client in peers:
            close(target,client)

    # K: ordinary runtime delete failure compensates immediately, not on restart.
    runtime=upload('runtime.txt')
    e("window.realRuntimeDelete=IDBObjectStore.prototype.delete;IDBObjectStore.prototype.delete=function(key){if(this.name==='files')throw new DOMException('forced file deletion failure','UnknownError');return realRuntimeDelete.call(this,key)}")
    e(f"contentInspector.job({q(owner)},()=>removeEntryAttachment({q(owner)},{q(runtime)}),{{operation:'remove',filename:'runtime.txt'}})")
    e('IDBObjectStore.prototype.delete=realRuntimeDelete')
    check(exists(runtime) and e(f'entries.get({q(owner)}).content.attachments.some(f=>f.storageKey==={q(runtime)})') and not operations(), 'K: runtime file-delete failure restores metadata and keeps bytes immediately')
    check(e('!contentInspector.status.hidden') or e("!document.getElementById('file-failure').hidden"), 'K: F2 still displays the ordinary runtime failure')
    e("contentInspector.clearMessage();document.getElementById('dismiss-file-failure').click()")

    # I: F3 prevents destructive journal recovery even when an orphan is known.
    saved=e("localStorage.getItem('galaxy:user-data')")
    seed(records=[{'key':'corrupt-preserve','entryId':'gone'}],operations=[op('add',[('corrupt-preserve','gone')])])
    e("localRestoreInProgress=true;localStorage.setItem('galaxy:user-data','{corrupt original')")
    reload()
    check(exists('corrupt-preserve') and len(operations())==1 and e("localDataRecovery&&localStorage.getItem('galaxy:user-data')==='{corrupt original'&&document.getElementById('local-data-recovery-title').textContent==='Your saved data needs attention'"), 'I: F3 preservation wins; neither blob nor journal is touched')
    e('localStorage.setItem("galaxy:user-data",'+q(saved)+')')
    reload()
    check(not exists('corrupt-preserve') and not operations(), 'I: cleanup can resume only after valid canonical metadata returns')

    # M/L: unknown future records are preserved. Restore abort preserves them;
    # successful replacement clears them atomically and its journal wins startup.
    seed(records=[{'key':'future-preserve','entryId':'gone'},{'key':'known-with-future','entryId':'gone'}],operations=[op('add',[('known-with-future','gone')]),op('add',[('future-preserve','gone')],version=99)])
    reload()
    check(exists('future-preserve') and exists('known-with-future') and len(operations())==2 and e("localDataRecovery&&document.getElementById('local-data-recovery-message').textContent.includes('file operation')&&firstUse.root.hidden"), 'M: unknown version prevents all journal cleanup and shows a controlled file-recovery warning')
    e("(async()=>{try{await persistence.files.replaceAll([],'failed-restore',()=>{throw new Error('forced Restore abort')},()=>{});}catch{} })()")
    check(exists('future-preserve') and len(operations())==2, 'L: failed Restore atomically preserves ordinary journals and old files')
    e("""(async()=>{const previous=persistence.metadata.captureRestoreState(),preferences=persistence.preferences.readForBackup();
        persistence.metadata.beginRestore({version:1,id:'committed-restore',metadataText:JSON.stringify({version:5,entries:[],layout:[]}),preferencesText:null,previous,previousPreferences:preferences});
        await persistence.files.replaceAll([],'committed-restore',()=>{},()=>{});})()""")
    reload()
    check(e("!localDataRecovery&&storageAvailable&&entries.size===0&&!persistence.metadata.readRestoreJournal()") and not operations() and not exists('future-preserve'), 'L: Restore commit-marker recovery runs first and obsolete ordinary journals cannot delete restored data')
    upgraded=e("""(async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('galaxy-attachments:upgrade-fixture',2);
        r.onupgradeneeded=()=>{r.result.createObjectStore('files',{keyPath:'key'}).createIndex('entryId','entryId');r.result.createObjectStore('restoreState');};
        r.onsuccess=()=>{const db=r.result,tx=db.transaction(['files','restoreState'],'readwrite');tx.objectStore('files').put({key:'legacy-file',entryId:'legacy-owner',blob:new Blob(['legacy bytes'])});tx.objectStore('restoreState').put('legacy-marker','committed');tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)};r.onerror=()=>reject(r.error)});
        const store=createIndexedDbFileStore({scope:'upgrade-fixture'});return await (await store.get('legacy-file')).blob.text()==='legacy bytes'&&await store.restoreMarker()==='legacy-marker'&&(await store.listOperations()).length===0;})()""")
    check(upgraded, 'v2 to v3 scoped database upgrade preserves old files and Restore markers without sweeping unknown orphans')
    check(not cdp.errors,f'no unhandled attachment recovery browser exceptions: {cdp.errors}')
