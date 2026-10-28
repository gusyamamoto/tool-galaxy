"""Synthetic historical files only, in the harness's disposable browser profile."""
import json
import time


def run_attachment_orphan_checks(*,cdp,cdp_class,e,check,wait_for,add,origin):
    owner=add('Orphan audit owner');q=json.dumps
    wait_for('physics.settled');e('physics.pause();graphNeedsSave=false')
    e(f"selectEntry(entries.get({q(owner)}),nodes.get({q(owner)}),{{openInspector:true,reframe:false}});contentInspector.upload([new File(['live bytes'],'live.txt',{{type:'text/plain'}})])")
    e("""(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('galaxy-attachments');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
        try{await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
        tx.objectStore('files').add({key:'f8-synthetic-historical',entryId:"""+q(owner)+""",blob:new Blob(['old bytes']),thumbnail:new Blob(['thumb'])});});}finally{db.close();}})()""")
    before=e("localStorage.getItem('galaxy:user-data')")
    e('universeRepository.recoverAttachmentOperations()')
    check(e("(async()=>!!await attachmentStore.get('f8-synthetic-historical'))()"),'reproduced: F4 leaves a historical unreferenced blob without a journal intact')
    check(e("localStorage.getItem('galaxy:user-data')")==before,'reproduction leaves canonical metadata byte-for-byte unchanged')

    def audit():
        return e('universeRepository.auditAttachmentStorage()')

    def exists(key):return e('(async()=>!!await attachmentStore.get('+q(key)+'))()')

    def seed(records=(),operations=(),remove_operations=()):
        e("""(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('galaxy-attachments');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
            try{await new Promise((resolve,reject)=>{const tx=db.transaction(['files','fileOperations'],'readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
            """+q(list(records))+""".forEach(r=>tx.objectStore('files').add({key:r.key,...(r.owner===null?{}:{entryId:r.owner}),blob:new Blob([r.data||'bytes']),...(r.thumb?{thumbnail:new Blob([r.thumb])}:{})}));
            """+q(list(operations))+""".forEach(op=>tx.objectStore('fileOperations').add(op));
            """+q(list(remove_operations))+""".forEach(id=>tx.objectStore('fileOperations').delete(id));});}finally{db.close();}})()""")

    def open_ui():
        e("if(!backupUI.dialog.open)backupUI.trigger.click();backupUI.storageSection.open=true;backupUI.auditButton.click()")
        wait_for('!backupUI.busy')

    def close_ui():
        e('backupUI.dialog.close()');wait_for('!backupUI.dialog.open')

    def unused_keys(result):return [r['key'] for r in result['orphaned']]

    # Read-only detection does not materialize payload bytes or all file records.
    e("""window.f8all=IDBObjectStore.prototype.getAll;window.f8array=Blob.prototype.arrayBuffer;
        IDBObjectStore.prototype.getAll=function(...args){if(this.name==='files')throw Error('Do not read all blobs');return f8all.apply(this,args)};
        Blob.prototype.arrayBuffer=function(){throw Error('Do not read payload bytes')};""")
    result=audit()
    e('IDBObjectStore.prototype.getAll=f8all;Blob.prototype.arrayBuffer=f8array')
    check(len(result['live'])==1 and unused_keys(result)==['f8-synthetic-historical'] and result['orphanedBytes']==14,'audit identifies exactly one historical orphan and counts original plus thumbnail bytes')
    check(e("localStorage.getItem('galaxy:user-data')")==before and exists('f8-synthetic-historical'),'audit is read-only and never reads Blob payloads or getAll(files)')
    open_ui()
    check(e("!backupUI.removeUnused.hidden&&backupUI.unusedConfirmation.hidden&&backupUI.unusedStatus.textContent.includes('1 unused')"),'Backup storage disclosure offers removal only after finding unused data')
    e('backupUI.removeUnused.click()')
    check(exists('f8-synthetic-historical') and e("!backupUI.unusedConfirmation.hidden&&document.getElementById('unused-files-confirmation-text').textContent.includes('cannot be undone')&&document.activeElement===backupUI.keepUnused"),'removal requires a second explicit action and defaults focus to Keep files')
    e('backupUI.keepUnused.click()')
    check(exists('f8-synthetic-historical'),'canceling confirmation preserves the candidate')
    e('backupUI.removeUnused.click();backupUI.confirmUnused.click()');wait_for('!backupUI.busy')
    check(not exists('f8-synthetic-historical') and e("backupUI.unusedStatus.textContent==='Unused local files removed.'"),'confirmed cleanup removes the orphan and reports success')
    check(e("localStorage.getItem('galaxy:user-data')")==before and e("(async()=>{const f=contentInspector.content().attachments[0];return (await attachmentStore.get(f.storageKey)).blob.text()})()")=='live bytes','cleanup preserves exact canonical text and live original bytes')
    e('backupUI.auditButton.click()');wait_for('!backupUI.busy')
    check(e("backupUI.removeUnused.hidden&&backupUI.unusedStatus.textContent==='No unused local files found.'"),'no-orphan state has a subtle message and no cleanup action')
    close_ui()

    seed([{'key':'f8-unknown','owner':None},{'key':'f8-one','owner':owner,'data':'123','thumb':'45'},{'key':'f8-two','owner':owner,'data':'12345678'}])
    result=audit()
    check(len(result['unknown'])==1 and set(unused_keys(result))=={'f8-one','f8-two'} and result['orphanedBytes']==13,'multiple orphans sum safely while ownerless legacy data stays UNKNOWN')

    # Real archive removes its branch from the active runtime tree, not saved authority.
    archived=add('Archived files')
    e(f"selectEntry(entries.get({q(archived)}),nodes.get({q(archived)}),{{openInspector:true,reframe:false}});contentInspector.upload([new File(['archive bytes'],'archive.txt',{{type:'text/plain'}})])")
    archived_key=e('contentInspector.content().attachments[0].storageKey')
    e(f'requestGalaxyArchive({q(archived)});document.getElementById("archive-galaxy-form").requestSubmit()')
    wait_for('!archiveBusy&&!archiveDialog.open')
    result=audit()
    check(archived_key in [r['key'] for r in result['live']] and e(f'!entries.has({q(archived)})&&archivedEntries.has({q(archived)})'),'archived attachment remains LIVE after its actual branch leaves the active tree')
    e('(async()=>{window.f8restoreCandidate=(await cosmifoldBackup.create(universeRepository)).blob;})()')

    # Missing originals remain referenced; never repair or rewrite their metadata.
    e(f"selectEntry(entries.get({q(owner)}),nodes.get({q(owner)}),{{openInspector:true,reframe:false}});contentInspector.upload([new File(['missing'],'missing.txt',{{type:'text/plain'}})])")
    missing=e('contentInspector.content().attachments.at(-1).storageKey')
    e(f"(async()=>{{const db=await new Promise(r=>{{const q=indexedDB.open('galaxy-attachments');q.onsuccess=()=>r(q.result)}});try{{await new Promise((r,j)=>{{const tx=db.transaction('files','readwrite');tx.oncomplete=r;tx.onabort=()=>j(tx.error);tx.objectStore('files').delete({q(missing)});}})}}finally{{db.close()}}}})()")
    before=e("localStorage.getItem('galaxy:user-data')");result=audit()
    check(missing not in unused_keys(result) and e("localStorage.getItem('galaxy:user-data')")==before and e(f'contentInspector.content().attachments.some(f=>f.storageKey==={q(missing)})'),'missing blob is not an orphan and its metadata remains untouched')

    # Current references are rebuilt after confirmation, under the same lock.
    e(f"saveEntryContent({q(owner)},current=>({{...current,attachments:[...current.attachments,{{id:'f8-now-live',kind:'upload',entryId:{q(owner)},filename:'now-live.txt',mimeType:'text/plain',size:3,storageKey:'f8-one',createdAt:new Date().toISOString()}}]}}))")
    result=e("universeRepository.removeOrphanedAttachments(['f8-one','f8-two'])")
    check(result=={'removed':1,'skipped':1} and exists('f8-one') and not exists('f8-two'),'revalidation skips newly referenced key and deletes only the still-unreferenced selected key')

    # One transaction: a later request failure rolls back all earlier deletes.
    seed([{'key':k,'owner':owner} for k in ['f8-failure-a','f8-failure-b']])
    open_ui();before=e("localStorage.getItem('galaxy:user-data')")
    e("window.f8delete=IDBObjectStore.prototype.delete;IDBObjectStore.prototype.delete=function(key){if(this.name==='files'&&key==='f8-failure-b')throw Error('synthetic deletion failure');return f8delete.call(this,key)};backupUI.removeUnused.click();backupUI.confirmUnused.click()")
    wait_for('!backupUI.busy');e('IDBObjectStore.prototype.delete=f8delete')
    check(exists('f8-failure-a') and exists('f8-failure-b') and e("backupUI.unusedStatus.dataset.error==='true'&&backupUI.unusedStatus.textContent.includes('saved items were not changed')"),'failed second deletion aborts the entire transaction with accurate maintenance feedback')
    check(e("localStorage.getItem('galaxy:user-data')")==before,'delete failure never rewrites canonical metadata')
    close_ui()

    # Active/unknown F4 operations always win over historical cleanup.
    operation={'version':1,'id':'f8-operation','type':'add','stage':'files-written','files':[{'key':'f8-staged','entryId':owner}]}
    seed([{'key':'f8-staged','owner':owner}],[operation]);result=audit()
    check(result['blocked'] and 'f8-staged' in [r['key'] for r in result['recoveryOwned']] and not result['orphaned'],'F4 staged record is RECOVERY-OWNED and blocks all historical deletion')
    check(e("universeRepository.removeOrphanedAttachments(['f8-staged','f8-failure-a']).then(()=>false,()=>true)") and exists('f8-staged') and exists('f8-failure-a'),'cleanup cannot delete staged or unrelated records until F4 settles')
    e('universeRepository.recoverAttachmentOperations()');result=audit()
    check(not exists('f8-staged') and not result['blocked'] and 'f8-failure-a' in unused_keys(result),'normal F4 recovery runs first; later audit reflects the final recovered state')
    operation={**operation,'version':999,'id':'f8-unknown-operation','files':[{'key':'f8-failure-a','entryId':owner}]}
    seed(operations=[operation]);result=audit()
    check(result['blocked'] and not result['orphaned'] and exists('f8-failure-a'),'unsupported journal version preserves every candidate')
    seed(remove_operations=['f8-unknown-operation']);e('universeRepository.recoverAttachmentOperations()')
    mismatch={**operation,'version':1,'id':'f8-mismatched-operation','files':[{'key':'f8-failure-a','entryId':'wrong-owner'}]}
    seed(operations=[mismatch])
    check(e('universeRepository.recoverAttachmentOperations().then(()=>false,()=>true)') and audit()['blocked'] and exists('f8-failure-a'),'F4 ownership mismatch leaves its journal and bytes intact and blocks F8')
    seed(remove_operations=['f8-mismatched-operation']);e('universeRepository.recoverAttachmentOperations()')

    # Pending Restore state blocks before file analysis; stable committed markers do not.
    e("persistence.metadata.beginRestore({version:1,id:'f8-pending'})")
    check(e('universeRepository.auditAttachmentStorage().then(()=>false,()=>true)') and e("universeRepository.removeOrphanedAttachments(['f8-failure-a']).then(()=>false,()=>true)") and exists('f8-failure-a'),'pending Restore journal blocks audit and deletion')
    e('persistence.metadata.endRestore()')
    e("(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('galaxy-attachments');q.onsuccess=()=>r(q.result)});try{await new Promise((r,j)=>{const tx=db.transaction('restoreState','readwrite');tx.oncomplete=r;tx.onabort=()=>j(tx.error);tx.objectStore('restoreState').put('ambiguous','pending');})}finally{db.close()}})()")
    check(audit()['blocked'] and e("universeRepository.removeOrphanedAttachments(['f8-failure-a']).then(()=>false,()=>true)") and exists('f8-failure-a'),'ambiguous Restore marker state preserves all candidates')
    e("(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('galaxy-attachments');q.onsuccess=()=>r(q.result)});try{await new Promise((r,j)=>{const tx=db.transaction('restoreState','readwrite');tx.oncomplete=r;tx.onabort=()=>j(tx.error);tx.objectStore('restoreState').delete('pending');})}finally{db.close()}})()")
    open_ui();e('backupUI.checkBackup(f8restoreCandidate)')
    check(e('!!backupUI.handle&&backupUI.storageSection.hidden'),'actual validated Restore preview hides maintenance')
    e('window.f8auditApi=universeRepository.auditAttachmentStorage;window.f8previewScans=0;universeRepository.auditAttachmentStorage=async()=>{f8previewScans++;return f8auditApi()};backupUI.auditUnusedFiles()')
    check(e('f8previewScans===0') and exists('f8-failure-a'),'Restore candidate never becomes an orphan audit source')
    e('universeRepository.auditAttachmentStorage=f8auditApi');close_ui()

    # Capacity estimates and F2 notices are independent of maintenance.
    e("window.f8estimate=Object.getOwnPropertyDescriptor(navigator.storage,'estimate');window.f8estimates=0;Object.defineProperty(navigator.storage,'estimate',{configurable:true,value:async()=>{f8estimates++;return {usage:0,quota:1000000000}}});notifyFileFailure('Existing file failure')")
    before=e("localStorage.getItem('galaxy:user-data')");result=e("universeRepository.removeOrphanedAttachments(['f8-failure-a','f8-failure-b'])")
    check(result['removed']==2 and e('f8estimates===0&&!fileFailure.hidden') and e("document.getElementById('file-failure-message').textContent==='Existing file failure'"),'maintenance neither fakes F7 capacity nor replaces F2 authoritative feedback')
    e("if(f8estimate)Object.defineProperty(navigator.storage,'estimate',f8estimate);else delete navigator.storage.estimate;fileFailure.hidden=true")

    # Hundreds/thousands of descriptors do not load or decode payload bytes.
    # Keep each CDP message below the harness's 64 KiB websocket frame limit.
    for start in range(0,1000,200):
        seed([{'key':f'f8-bulk-{i:04d}','owner':owner,'data':'x'} for i in range(start,start+200)])
    result=audit();bulk=[k for k in unused_keys(result) if k.startswith('f8-bulk-')]
    check(len(bulk)==1000,'cursor audit handles 1,000 historical records without decoding media')
    result=e('universeRepository.removeOrphanedAttachments('+q(bulk)+')')
    check(result['removed']==1000 and exists('f8-unknown') and exists(archived_key),'bounded-key transaction removes 1,000 proven orphans and preserves unknown/archive data')

    # Expanded maintenance and confirmation remain reachable on small viewports.
    seed([{'key':'f8-mobile','owner':owner}])
    for width,height in [(320,568),(390,844),(844,390)]:
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=True)
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        open_ui();e('backupUI.removeUnused.click();backupUI.confirmUnused.scrollIntoView({block:"nearest",behavior:"instant"})')
        geometry="(()=>{const d=backupUI.dialog.getBoundingClientRect(),b=backupUI.confirmUnused.getBoundingClientRect();return d.left>=0&&d.right<=innerWidth&&d.top>=0&&d.bottom<=innerHeight&&backupUI.dialog.scrollWidth<=backupUI.dialog.clientWidth&&b.height>=44&&b.top>=d.top&&b.bottom<=d.bottom})()"
        wait_for(geometry)
        check(e(geometry),f'{width}x{height}: maintenance confirmation fits and its touch action is reachable')
        close_ui()
    e("universeRepository.removeOrphanedAttachments(['f8-mobile'])")
    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)

    # Execute the exact documented import/helper path, not a production debug hook.
    e("import('/tests/attachment_orphan_probe.js').then(()=>true)")
    created=e('cosmifoldOrphanTest.create()');state=e('cosmifoldOrphanTest.verify()')
    check(state['syntheticPresent'] and state['livePresent'] and created['syntheticKey'].startswith('f8-synthetic-orphan:'),'documented helper creates a normal Item/photo and one uniquely named synthetic historical file')
    e('cosmifoldOrphanTest.removeSynthetic()');state=e('cosmifoldOrphanTest.verify()')
    e('cosmifoldOrphanTest.openLive()');wait_for('imageViewer.dialog.open&&imageViewer.image.naturalWidth>0')
    check(not state['syntheticPresent'] and state['livePresent'],'documented cleanup removes only the synthetic key and the normal photo still opens')
    e('imageViewer.dialog.close();cosmifoldOrphanTest.uninstall()')
    check(e("!window.cosmifoldOrphanTest"),'manual helper uninstalls without a permanent production hook')
    e('physics.pause();saveGalaxy()');e('applicationCommandTail');e('universeRepository.whenIdle()');e('graphNeedsSave=false')

    # Two real tabs queue against the SAME existing write lock.
    seed([{'key':'f8-race','owner':owner}]);audit()
    target=cdp.call('Target.createTarget',url='about:blank')['targetId'];endpoint=cdp.sock.getpeername()
    peer=cdp_class(f'ws://127.0.0.1:{endpoint[1]}/devtools/page/{target}')
    try:
        peer.call('Page.enable');peer.call('Runtime.enable')
        peer.call('Page.addScriptToEvaluateOnNewDocument',source="document.addEventListener('load',event=>{if(event.target.tagName==='SCRIPT'&&event.target.src.endsWith('/services/supabase-auth.js'))createSupabaseAuthAdapter=()=>({available:false,async initialize(){return {user:null}},dispose(){}})},true)")
        peer.call('Page.navigate',url=origin)
        deadline=time.monotonic()+25
        while not peer.evaluate("typeof cameraViewReady!=='undefined'&&cameraViewReady"):
            assert time.monotonic()<deadline,'Peer did not initialize';time.sleep(.05)
        peer.evaluate('physics.pause();applicationCommandTail');peer.evaluate('graphNeedsSave=false')
        e("window.f8held=false;window.f8barrier=navigator.locks.request('cosmifold-workspace-write:null',{mode:'exclusive'},()=>{f8held=true;return new Promise(r=>window.f8release=r)});void 0")
        wait_for('f8held')
        peer.evaluate(f"window.f8reference=saveEntryContent({q(owner)},c=>({{...c,attachments:[...c.attachments,{{id:'f8-race-reference',kind:'upload',entryId:{q(owner)},filename:'race.txt',mimeType:'text/plain',size:5,storageKey:'f8-race',createdAt:new Date().toISOString()}}]}})).then(()=>({{saved:true,raw:localStorage.getItem('galaxy:user-data')}}),()=>({{saved:false}}));void 0")
        # Observe B's request queued before A's deletion request.
        wait_for("navigator.locks.query().then(s=>s.pending.some(l=>l.name==='cosmifold-workspace-write:null'))")
        e("window.f8cleanup=universeRepository.removeOrphanedAttachments(['f8-race']).then(()=>({saved:true}),error=>({code:error.code||null,name:error.name,message:error.message,cause:error.cause?.message}));void 0")
        wait_for("navigator.locks.query().then(s=>s.pending.filter(l=>l.name==='cosmifold-workspace-write:null').length===2)")
        e('f8release();void 0')
        reference=peer.evaluate('f8reference');cleanup=e('f8cleanup')
        # Either independent stale-snapshot guard may reject first. Both must
        # detect the concurrent change and prevent unsafe deletion.
        protected = cleanup.get('code')=='LOCAL_SNAPSHOT_STALE' or cleanup.get('message')=='Saved data changed. Check unused files again.'
        check(reference.get('saved') and not cleanup.get('saved') and protected and exists('f8-race'),f'real cross-tab write serializes before cleanup and stale deletion is refused (cleanup={cleanup})')
        check(e("localStorage.getItem('galaxy:user-data')")==reference['raw'],'rejected cleanup preserves the winning canonical snapshot byte-for-byte')
        check(e("JSON.parse(localStorage.getItem('galaxy:user-data')).entries.some(x=>x.content?.attachments.some(f=>f.storageKey==='f8-race'))") and e("(async()=>(await attachmentStore.get('f8-race')).blob.text())()")=='bytes','winning tab reference and exact original bytes both survive')
    finally:
        cdp.call('Target.closeTarget',targetId=target);peer.sock.close()

    # Fresh startup corruption must keep F3 authoritative and hide maintenance.
    e("localRestoreInProgress=true;graphNeedsSave=false;localStorage.setItem('galaxy:user-data','{synthetic corrupt metadata')")
    cdp.call('Page.reload');wait_for("typeof localDataRecovery!=='undefined'&&localDataRecovery&&typeof backupUI!=='undefined'")
    e('backupUI.trigger.click()')
    check(e('backupUI.dialog.open&&backupUI.storageSection.hidden') and exists('f8-unknown') and exists('f8-race'),'F3 recovery hides maintenance and preserves all file data')
    check(e('universeRepository.auditAttachmentStorage().then(()=>false,()=>true)') and e("localStorage.getItem('galaxy:user-data')==='{synthetic corrupt metadata'"),'corrupt canonical data prevents analysis and is preserved exactly')
    check(not cdp.errors,'no unhandled exceptions across audit, abort, recovery and cross-tab cases')
