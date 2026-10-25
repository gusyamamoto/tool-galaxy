"""F9 product paths and persisted boundary states in disposable browser profiles."""
import base64
import json
from pathlib import Path
import tempfile
import time
from restore_model_fixture import nested_task_list


def run_persistence_integration_checks(*,cdp,cdp_class,e,check,wait_for,add,origin):
    with tempfile.TemporaryDirectory(prefix='cosmifold-f9-') as directory:
        _run(cdp=cdp,cdp_class=cdp_class,e=e,check=check,wait_for=wait_for,add=add,origin=origin,files=Path(directory))


def _run(*,cdp,cdp_class,e,check,wait_for,add,origin,files):
    q=json.dumps
    pause="document.addEventListener('load',event=>{if(event.target.tagName==='SCRIPT'&&event.target.src.endsWith('/script.js')){physics.pause();graphNeedsSave=false}},true)"
    cdp.call('Page.addScriptToEvaluateOnNewDocument',source=pause)

    def ready(client=cdp):
        deadline=time.monotonic()+35
        while not client.evaluate("document.readyState==='complete'&&typeof cameraViewReady!=='undefined'&&cameraViewReady"):
            assert time.monotonic()<deadline,'Workspace did not initialize';time.sleep(.03)
        client.evaluate('physics.pause();applicationCommandTail');client.evaluate('universeRepository.whenIdle()');client.evaluate('graphNeedsSave=false')

    def reload():
        e('localRestoreInProgress=true;graphNeedsSave=false');cdp.call('Page.reload');ready()

    def select(item):e(f'selectEntry(entries.get({q(item)}),nodes.get({q(item)}),{{openInspector:true,reframe:false}});physics.pause()')

    def picker(selector,paths):
        root=cdp.call('DOM.getDocument')['root']['nodeId']
        node=cdp.call('DOM.querySelector',nodeId=root,selector=selector)['nodeId']
        cdp.call('DOM.setFileInputFiles',nodeId=node,files=[str(p) for p in paths])

    def inspect(path,recovery=False):
        if not e('backupUI.dialog.open'):
            e("document.getElementById('restore-recovery-backup').click()" if recovery else 'backupUI.trigger.click()')
        e("backupUI.file.value=''");picker('#restore-backup-file',[path]);wait_for('!backupUI.busy')

    def semantic():
        return e("(()=>{const d=JSON.parse(localStorage.getItem('galaxy:user-data'));return {entries:d.entries.map(({x,y,...r})=>r).sort((a,b)=>a.id.localeCompare(b.id)),portals:d.portals||[],constellations:d.constellations||[],archivedGalaxies:d.archivedGalaxies||[]}})()")

    def hashes():
        return e("(async()=>{const rows=await attachmentStore.readAll();const result={};for(const r of rows){result[r.key]={owner:r.entryId,original:await cosmifoldBackup.sha256(await r.blob.arrayBuffer()),thumbnail:r.thumbnail?await cosmifoldBackup.sha256(await r.thumbnail.arrayBuffer()):null}}return result})()")

    def seed(rows=(),operations=()):
        e("""(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('galaxy-attachments');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});
            try{await new Promise((r,j)=>{const tx=db.transaction(['files','fileOperations'],'readwrite');tx.oncomplete=r;tx.onabort=()=>j(tx.error);
            """+q(list(rows))+""".forEach(x=>tx.objectStore('files').add({key:x.key,...(x.owner?{entryId:x.owner}:{}),blob:new Blob([x.data||'fixture'])}));
            """+q(list(operations))+""".forEach(x=>tx.objectStore('fileOperations').add(x));});}finally{db.close()}})()""")

    def peer_tab():
        target=cdp.call('Target.createTarget',url='about:blank')['targetId'];endpoint=cdp.sock.getpeername()
        peer=cdp_class(f'ws://127.0.0.1:{endpoint[1]}/devtools/page/{target}')
        peer.call('Page.enable');peer.call('Runtime.enable')
        peer.call('Page.addScriptToEvaluateOnNewDocument',source=pause+";document.addEventListener('load',event=>{if(event.target.tagName==='SCRIPT'&&event.target.src.endsWith('/services/supabase-auth.js'))createSupabaseAuthAdapter=()=>({available:false,async initialize(){return {user:null}},dispose(){}})},true)")
        peer.call('Page.navigate',url=origin);ready(peer);return target,peer

    root=add('F9 trip');owner=add('F9 documents',root);destination=add('F9 copies',root);archived=add('F9 archive')
    e('physics.pause();applicationCommandTail')
    e(f"createChildEntry({q(root)},true);fields[0].value='F9 packing';document.getElementById('task-list-tasks').value={q('Passport'+chr(10)+'Tickets')};form.requestSubmit();applicationCommandTail")
    wait_for('!formSaveBusy');task_list=e('selectedNode.dataset.entryId')
    tasks=e(f'[...entries.values()].filter(x=>x.parentId==={q(task_list)}).map(x=>x.id)')
    select(tasks[0]);e("const c=document.getElementById('content-task-done');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));applicationCommandTail")
    select(owner)
    e("contentInspector.editNotes();contentInspector.notes.value='F9 saved note';contentInspector.notesForm.requestSubmit();applicationCommandTail")
    e("contentInspector.editLocation();contentInspector.locationInput.value='Library';contentInspector.locationForm.requestSubmit();applicationCommandTail")
    e("contentInspector.quickUrl.value='https://example.com/';contentInspector.quickBookmark.requestSubmit();applicationCommandTail")
    e(f"commitConstellations(new Map([['f9-collection',{{id:'f9-collection',name:'F9 favorites',memberEntryIds:[{q(owner)},{q(tasks[0])}],createdAt:new Date().toISOString()}}]]))")
    png=e("(async()=>{const c=document.createElement('canvas');c.width=64;c.height=48;c.getContext('2d').fillRect(0,0,64,48);const b=await new Promise(r=>c.toBlob(r,'image/png'));return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)})})()")
    photo=files/'f9-photo.png';photo.write_bytes(base64.b64decode(png));text=files/'f9-document.txt';text.write_text('F9 exact original document',encoding='utf-8')
    e("contentInspector.files.addEventListener('click',event=>event.preventDefault(),{once:true});document.getElementById('content-add-files').click()")
    picker('#content-files',[photo,text]);wait_for('contentInspector.jobs.size===0')
    check(e("contentInspector.content().attachments.length===2&&contentInspector.content().notes.text==='F9 saved note'&&contentInspector.content().links.length===1"),'real file input and forms commit image/document, Note, Bookmark and Location')
    e(f"contentInspector.upload([new File(['archived original'],'archived.txt',{{type:'text/plain'}})],{q(archived)})")
    e(f'requestGalaxyArchive({q(archived)});document.getElementById("archive-galaxy-form").requestSubmit()');wait_for('!archiveBusy&&!archiveDialog.open')
    e(f'copyHierarchyItems([{q(owner)}]);pasteHierarchy({q(destination)})');wait_for('!pasteBusy')
    copied=e(f'[...entries.values()].find(x=>x.parentId==={q(destination)}).id')
    check(e(f'entries.get({q(copied)}).content.attachments.length===2&&archivedEntries.has({q(archived)})&&entries.get({q(tasks[0])}).completed&&!entries.get({q(tasks[1])}).completed'),'golden workspace includes independent copies, archived bytes and mixed task completion')
    e(f'copyHierarchyItems([{q(task_list)}]);pasteHierarchy({q(destination)})');wait_for('!pasteBusy')
    check(e(f"(()=>{{const list=[...entries.values()].find(x=>x.parentId==={q(destination)}&&x.taskList),children=list&&[...entries.values()].filter(x=>x.parentId===list.id);return list&&children.length===2&&children.some(x=>x.completed===true)&&children.some(x=>x.completed===false)&&children.every(x=>!x.taskList&&![...entries.values()].some(y=>y.parentId===x.id))}})()"),'real Task List copy preserves direct task children and mixed completion without illegal nesting')
    seed([{'key':'f9-historical','owner':owner},{'key':'f9-unknown','owner':None}])
    e('backupUI.trigger.click();backupUI.storageSection.open=true;backupUI.auditButton.click()');wait_for('!backupUI.busy')
    check(e('backupUI.unusedAudit.orphaned.length===1&&backupUI.unusedAudit.unknown.length===1&&backupUI.unusedAudit.live.length===5'),'real maintenance classifies all original/copied/archived files LIVE and only one historical candidate')
    e("window.f9estimate=Object.getOwnPropertyDescriptor(navigator.storage,'estimate');window.f9estimates=0;window.f9capacity={usage:950*1024**2,quota:1000*1024**2};Object.defineProperty(navigator.storage,'estimate',{configurable:true,value:async()=>{f9estimates++;return f9capacity}});storageCapacity.check([{size:1}])")
    before=e("localStorage.getItem('galaxy:user-data')")
    e('backupUI.removeUnused.click();backupUI.confirmUnused.click()');wait_for('!backupUI.busy')
    check(e("(async()=>!(await attachmentStore.get('f9-historical'))&&!!await attachmentStore.get('f9-unknown'))()") and e("localStorage.getItem('galaxy:user-data')")==before,'real confirmed F8 cleanup preserves canonical bytes and ambiguous legacy data')
    check(e('f9estimates===1&&!capacityWarning.hidden'),'F8 cleanup does not fabricate a new F7 estimate or clear low-space advice by itself')
    e('backupUI.dialog.close()')
    select(owner)
    e("f9capacity={usage:100*1024**2,quota:10000*1024**2};const fresh=new DataTransfer();fresh.items.add(new File(['fresh capacity growth'],'f9-fresh.txt',{type:'text/plain'}));contentInspector.files.files=fresh.files;contentInspector.files.dispatchEvent(new Event('change'))")
    wait_for('contentInspector.jobs.size===0')
    check(e("f9estimates===2&&capacityWarning.hidden&&contentInspector.content().attachments.some(f=>f.filename==='f9-fresh.txt')"),'later real attachment growth gets a fresh healthy estimate and naturally clears prior advice')
    e("if(f9estimate)Object.defineProperty(navigator.storage,'estimate',f9estimate);else delete navigator.storage.estimate")

    target,peer=peer_tab()
    try:
        e(f"saveEntryLocation({q(owner)},{{text:'F9 winning location'}})")
        peer.evaluate(f"selectEntry(entries.get({q(owner)}),nodes.get({q(owner)}),{{openInspector:true,reframe:false}});window.f9prepare=galaxyAttachmentFiles.prepare;window.f9keys=[];galaxyAttachmentFiles.prepare=async function(...args){{const r=await f9prepare.apply(this,args);f9keys.push(r.record.key);return r}};const dt=new DataTransfer();dt.items.add(new File(['stale bytes'],'stale.txt',{{type:'text/plain'}}));contentInspector.files.files=dt.files;contentInspector.files.dispatchEvent(new Event('change'))")
        deadline=time.monotonic()+10
        while not peer.evaluate('contentInspector.jobs.size===0'):
            assert time.monotonic()<deadline;time.sleep(.03)
        failed_keys=peer.evaluate('f9keys')
        check(peer.evaluate("localSessionStale&&!document.getElementById('reload-local-data').hidden&&fileFailure.hidden"),'stale real file-input add shows F1 Reload instead of competing F2/F7 feedback')
        check(len(failed_keys)==1 and e('(async()=>!(await attachmentStore.get('+q(failed_keys[0])+'))&&(await attachmentStore.listOperations()).length===0)()'),'stale add creates neither durable blob nor F4 journal')

        e('physics.pause();saveGalaxy()');e('applicationCommandTail');e('graphNeedsSave=false')
        expected=semantic();expected_hashes=hashes();expected_hashes.pop('f9-unknown')
        # Download through the product, then feed that exact disk file to Restore.
        cdp.call('Browser.setDownloadBehavior',behavior='allow',downloadPath=str(files),eventsEnabled=True)
        e('backupUI.trigger.click();backupUI.download.click()');wait_for('!backupUI.busy')
        deadline=time.monotonic()+15;backups=[]
        while not backups:
            backups=list(files.glob('*.cosmifold'));assert time.monotonic()<deadline;time.sleep(.05)
        backup=backups[0];good=backup.read_bytes();invalid=files/'invalid-nested.cosmifold';invalid.write_bytes(nested_task_list(good))
        manifest=json.loads(good[57:57+int.from_bytes(good[21:25],'little')])
        check({a['record']['key'] for a in manifest['attachments']}==set(expected_hashes) and 'blob:' not in manifest['metadataText'],'Backup includes exactly the referenced originals/thumbnails and excludes orphan/runtime identity')
        e('backupUI.dialog.close()');later=add('F9 later change',root)
        select(owner)
        e("""(async()=>{const c=document.createElement('canvas');c.width=64;c.height=48;const x=c.getContext('2d');x.fillRect(0,0,64,48);
            const stream=c.captureStream(0),track=stream.getVideoTracks()[0],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];
            const encoded=new Promise(resolve=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=()=>resolve(new File(chunks,'f9-later.webm',{type:'video/webm'}))});
            const started=new Promise(resolve=>recorder.onstart=resolve);recorder.start();track.requestFrame();await started;
            for(let i=0;i<20;i++){x.fillStyle=i%2?'red':'blue';x.fillRect(0,0,64,48);track.requestFrame();await new Promise(r=>setTimeout(r,60))}
            recorder.stop();const video=await encoded;stream.getTracks().forEach(t=>t.stop());if(video.size<200)throw Error('No encoded frames');
            await contentInspector.upload([video,new File(['%PDF-1.4\\n%%EOF'],'f9-later.pdf',{type:'application/pdf'})]);})()""")
        e(Path(__file__).with_name('object_url_probe.js').read_text(encoding='utf-8'))
        e("contentInspector.renderLists();contentInspector.openFile(contentInspector.content().attachments.find(f=>f.filename==='f9-photo.png'))")
        wait_for('imageViewer.dialog.open&&imageViewer.image.naturalWidth>0')
        e('imageViewer.dialog.close()')
        e("imageViewer.supportsPdf=()=>false;contentInspector.openFile(contentInspector.content().attachments.find(f=>f.filename==='f9-later.pdf'))")
        wait_for('imageViewer.dialog.open&&!!imageViewer.url')
        cdp.call('Runtime.evaluate',expression='imageViewer.external.click()',userGesture=True)
        wait_for('contentInspector.nativePreviews.size===1&&!![...contentInspector.nativePreviews.values()][0].url')
        cdp.call('Page.bringToFront')
        e('imageViewer.dialog.close()')
        e("contentInspector.openFile(contentInspector.content().attachments.find(f=>f.filename==='f9-later.webm'))")
        wait_for('!imageViewer.video.hidden&&imageViewer.video.readyState>=2')
        cdp.call('Runtime.evaluate',expression='imageViewer.video.play()',userGesture=True,awaitPromise=True)
        e("""window.f9restoreEnd=backupUI.onRestoreEnd;backupUI.onRestoreEnd=(success,...args)=>{
            const owned=[...contentInspector.urls,...imageViewer.thumbnailUrls,imageViewer.url,imageViewer.originalUrl,imageViewer.posterUrl,...[...contentInspector.nativePreviews.values()].map(r=>r.url)].filter(Boolean);
            f9restoreEnd(success,...args);if(success)sessionStorage.setItem('f9-url-retirement',JSON.stringify({released:owned.every(u=>!cosmifoldUrlProbe.active.has(u)),
                stopped:imageViewer.video.paused&&!imageViewer.video.hasAttribute('src')&&!imageViewer.video.hasAttribute('poster'),native:contentInspector.nativePreviews.size,duplicates:cosmifoldUrlProbe.duplicateRevocations}));};""")
        inspect(invalid)
        check(e("!backupUI.handle&&!!imageViewer.url&&imageViewer.video.hasAttribute('src')&&contentInspector.nativePreviews.size===1"),'invalid real picker candidate preserves current video decoder and independently owned native PDF resources')
        peer.call('Page.reload');ready(peer)
        before=e("localStorage.getItem('galaxy:user-data')");inspect(backup)
        e('backupUI.confirm.click()');wait_for('!backupUI.busy')
        check(e("backupUI.dialog.open&&backupUI.status.dataset.error==='true'&&backupUI.status.textContent.includes('Close other')") and e("localStorage.getItem('galaxy:user-data')")==before,'real Restore refuses replacement while another live tab holds its workspace session')
        # Deliberately end B's session lease but retain its runtime solely to test
        # the F1 fence after replacement (normal UI requires closing that tab).
        peer.evaluate('cosmifoldRestoreSession.release()')
        e('backupUI.confirm.click()');wait_for("document.getElementById('backup-dialog')?.open===false&&typeof backupUI!=='undefined'&&!backupUI.committing");ready()
        check(semantic()==expected and hashes()==expected_hashes and e(f'!entries.has({q(later)})'),'real downloaded Backup / picker Restore / reload restores all canonical domains and original/thumbnail hashes')
        check(e("(()=>{const r=JSON.parse(sessionStorage.getItem('f9-url-retirement'));return r.released&&r.stopped&&r.native===0&&r.duplicates===0})()"),'successful actual Restore releases all old preview owners, stops video and closes native PDF without duplicate revocation')
        select(owner);e("contentInspector.openFile(contentInspector.content().attachments.find(f=>f.filename==='f9-photo.png'))");wait_for('imageViewer.image.naturalWidth>0&&!imageViewer.image.hidden')
        e('imageViewer.dialog.close()')
        check(True,'restored workspace image preview decodes normally after old resource teardown')
        restored=e("localStorage.getItem('galaxy:user-data')")
        result=peer.evaluate(f"saveEntryLocation({q(owner)},{{text:'stale post-Restore'}}).then(()=>false,error=>error.code)")
        check(result=='LOCAL_SNAPSHOT_STALE' and e("localStorage.getItem('galaxy:user-data')")==restored,'retained old runtime cannot overwrite a completed Restore after ending its session lease')
    finally:
        cdp.call('Target.closeTarget',targetId=target);peer.sock.close()
    for i in range(2):
        reload();check(semantic()==expected and hashes()==expected_hashes and e('(async()=>{const a=await universeRepository.auditAttachmentStorage();return !a.orphaned.length&&!a.unknown.length&&(await attachmentStore.listOperations()).length===0})()'),f'post-Restore reload {i+1} converges with no obsolete journals, phantom files or historical leftovers')

    # Actual copy pause at the shared F4 hook, with advisory low capacity.
    e("Object.defineProperty(navigator.storage,'estimate',{configurable:true,value:async()=>({usage:950*1024**2,quota:1000*1024**2})});attachmentStore.setOperationStageHook(({operation})=>{if(operation.type==='copy'){window.f9copyKeys=operation.files.map(f=>f.key);return new Promise(()=>{})}})")
    e(f'copyHierarchyItems([{q(owner)}]);void pasteHierarchy({q(destination)})');wait_for("Array.isArray(window.f9copyKeys)")
    interrupted=e('f9copyKeys');check(e('!capacityWarning.hidden&&pasteBusy'),'F7 low advice coexists with an actual F4 copy paused after durable bytes')
    check(e("(async()=>{const ops=await attachmentStore.listOperations(),queue=[...ops];while(queue.length){const v=queue.pop();if(v instanceof Blob||v instanceof ArrayBuffer||ArrayBuffer.isView(v))return false;if(v&&typeof v==='object')queue.push(...Object.values(v))}return ops.length===1&&ops[0].type==='copy'&&ops[0].files.length===f9copyKeys.length})()"),'actual interrupted copy journal contains ownership metadata and no duplicated file bytes')
    e('backupUI.trigger.click();backupUI.storageSection.open=true;backupUI.auditButton.click()')
    check(e("!backupUI.unusedAudit&&backupUI.unusedStatus.textContent.includes('Wait for the current file action')"),'maintenance blocks while the real attachment-copy transaction is in flight')
    reload();e('universeRepository.recoverAttachmentOperations()');e('universeRepository.recoverAttachmentOperations()')
    check(e('(async()=>(await Promise.all(('+q(interrupted)+').map(k=>attachmentStore.get(k)))).every(x=>x===null)&&(await attachmentStore.listOperations()).length===0)()') and hashes()==expected_hashes,'interrupted copy plus two recovery passes removes only staged copies and preserves every source hash')

    # Corrupt canonical state outranks pending F4 and historical orphan cleanup.
    target,peer=peer_tab()
    try:
        journal={'version':1,'id':'f9-held-journal','type':'add','stage':'files-written','files':[{'key':'f9-held-row','entryId':owner}]}
        seed([{'key':'f9-held-row','owner':owner},{'key':'f9-old-row','owner':owner}],[journal])
        bad_raw=e("(()=>{const d=JSON.parse(localStorage.getItem('galaxy:user-data'));d.entries[0].parentId='missing-f9-parent';return JSON.stringify(d)})()")
        e(f"localRestoreInProgress=true;graphNeedsSave=false;localStorage.setItem('galaxy:user-data',{q(bad_raw)})")
        code=peer.evaluate(f"saveEntryLocation({q(owner)},{{text:'overwrite corruption'}}).then(()=>false,error=>error.code)")
        check(code=='LOCAL_SNAPSHOT_STALE' and e("localStorage.getItem('galaxy:user-data')")==bad_raw,'older valid-looking tab cannot overwrite newly preserved corrupt storage')
    finally:
        cdp.call('Target.closeTarget',targetId=target);peer.sock.close()
    for i in range(3):
        reload();check(e("localDataRecovery&&firstUse.root.hidden&&galaxy.inert&&!storageAvailable") and e("localStorage.getItem('galaxy:user-data')")==bad_raw and e("(async()=>!!await attachmentStore.get('f9-held-row')&&!!await attachmentStore.get('f9-old-row')&&(await attachmentStore.listOperations()).length===1)()"),f'corrupt reload {i+1} preserves exact raw state, F4 evidence and historical bytes without onboarding')
    inspect(invalid,recovery=True)
    check(e('!backupUI.handle&&backupUI.preview.hidden&&backupUI.storageSection.hidden') and e("localStorage.getItem('galaxy:user-data')")==bad_raw,'real recovery picker rejects invalid Task List backup without F4/F8 cleanup')
    inspect(backup,recovery=True);e('backupUI.confirm.click()');wait_for("document.getElementById('backup-dialog')?.open===false&&typeof backupUI!=='undefined'&&!backupUI.committing");ready()
    check(not e('localDataRecovery') and semantic()==expected and hashes()==expected_hashes,'valid real picker Restore exits F3 and atomically retires obsolete F4 evidence')
    for i in range(2):
        reload();check(semantic()==expected and hashes()==expected_hashes and e('(async()=>{const a=await universeRepository.auditAttachmentStorage();return !a.blocked&&!a.orphaned.length&&(await attachmentStore.listOperations()).length===0})()'),f'post-recovery reload {i+1} remains stable and maintenance sees no phantom data')

    # Older valid databases and an incompatible future version are separate scopes.
    result=e("""(async()=>{const name='galaxy-attachments:f9-v1';const old=await new Promise((r,j)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('files',{keyPath:'key'}).createIndex('entryId','entryId');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});
        await new Promise((r,j)=>{const tx=old.transaction('files','readwrite');tx.oncomplete=r;tx.onabort=()=>j(tx.error);tx.objectStore('files').add({key:'legacy',entryId:'owner',blob:new Blob(['v1 original'])})});
        const store=createIndexedDbFileStore({scope:'f9-v1'});let blocked=false;try{await store.get('legacy')}catch(e){blocked=e.message.includes('Close other')}
        old.close();const record=await store.get('legacy');return {blocked,bytes:await record.blob.text(),operations:(await store.listOperations()).length,marker:await store.restoreMarker()}})()""")
    check(result=={'blocked':True,'bytes':'v1 original','operations':0,'marker':None},'blocked v1-to-v3 upgrade preserves bytes and succeeds after the older connection closes')
    result=e("""(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('galaxy-attachments:f9-future',4);q.onupgradeneeded=()=>q.result.createObjectStore('files',{keyPath:'key'}).createIndex('entryId','entryId');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});await new Promise((r,j)=>{const tx=db.transaction('files','readwrite');tx.oncomplete=r;tx.onabort=()=>j(tx.error);tx.objectStore('files').add({key:'future',entryId:'owner',blob:new Blob(['future original'])})});
        let rejected=false;try{await createIndexedDbFileStore({scope:'f9-future'}).get('future')}catch(e){rejected=e.name==='VersionError'}
        const bytes=await new Promise((r,j)=>{const tx=db.transaction('files','readonly'),q=tx.objectStore('files').get('future');q.onsuccess=()=>r(q.result.blob.text());q.onerror=()=>j(q.error)});db.close();return {rejected,bytes}})()""")
    check(result=={'rejected':True,'bytes':'future original'},'unsupported newer database is rejected without reset or deleting its file data')
    check(not cdp.errors,'no unhandled exceptions in combined persistence/recovery integration')
