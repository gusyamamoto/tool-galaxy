"""Synthetic deferred files in an isolated browser profile; no real quota exhaustion."""
import json


def run_background_file_checks(*, cdp, e, check, wait_for, add):
    q=json.dumps
    root=add('File failure fixture')
    a=add('Travel',root)
    b=add('Work',root)
    wait_for('physics.settled')
    e('physics.pause();graphNeedsSave=false')
    e("""window.realPrepare=galaxyAttachmentFiles.prepare;
        window.realFilePut=IDBObjectStore.prototype.put;
        window.realMetadataSave=persistence.metadata.save;
        window.realBitmap=window.createImageBitmap;
        window.failureOwner="""+q(a))

    def select(item=None, visible=True):
        if item is None:
            item=a
        e(f'selectEntry(entries.get({q(item)}),nodes.get({q(item)}),{{openInspector:true,reframe:false}});physics.pause()')
        if not visible:
            e('setInspectorOpen(false)')
        wait_for('camera.frame===null')

    def reset():
        e("""galaxyAttachmentFiles.prepare=realPrepare;IDBObjectStore.prototype.put=realFilePut;
            persistence.metadata.save=realMetadataSave;window.createImageBitmap=realBitmap;
            document.getElementById('dismiss-file-failure').click();contentInspector.clearMessage();
            window.preparedKeys=[];window.completedFileWrites=0;window.filePutTransaction=null;""")

    def start(names=('deferred.txt',), extra=''):
        select()
        e("""window.fileGate=new Promise(resolve=>window.releaseFileGate=resolve);
            galaxyAttachmentFiles.prepare=async function(file,id){await fileGate;
            """+extra+"""
            const result=await realPrepare.call(this,file,id);preparedKeys.push(result.record.key);return result;};
            window.backgroundJob=contentInspector.upload("""+q(list(names))+""".map(name=>new File(['fixture'],name,{type:name.endsWith('.pdf')?'application/pdf':name.endsWith('.heic')?'image/heic':'text/plain'})),failureOwner);void 0""")

    def finish():
        e('releaseFileGate();backgroundJob')
        wait_for('contentInspector.jobs.size===0')

    def text():
        return e("document.getElementById('file-failure-message').textContent")

    def shown():
        return e("(()=>{const n=document.getElementById('file-failure'),r=n.getBoundingClientRect();return !n.hidden&&r.width>0&&r.top>=0&&r.bottom<=innerHeight;})()")

    def files(item=a):
        return e(f'entries.get({q(item)})?.content?.attachments.map(f=>f.filename)||[]')

    def absent_from_disk():
        return e("(async()=>{const disk=JSON.parse(localStorage.getItem('galaxy:user-data'));return preparedKeys.every(key=>!disk.entries.some(x=>x.content?.attachments.some(f=>f.storageKey===key)))&&(await Promise.all(preparedKeys.map(key=>persistence.files.get(key)))).every(x=>x===null);})()")

    reset()
    # Actual preparation validation rejects a PDF after selection has changed.
    start(('invalid.pdf',))
    select(b)
    before=e('JSON.stringify(camera.view)')
    finish()
    check(shown() and 'invalid.pdf' in text() and 'Travel' in text(), 'A: preparation failure survives navigation with captured Item and file')
    check(files()==[] and files(b)==[], 'A: failed preparation publishes no attachment on either Item')
    check(e(f'selectedNode.dataset.entryId==={q(b)}&&JSON.stringify(camera.view)==={q(before)}&&!panel.hidden'), 'A: notification preserves selection, panel state and camera')
    check(e("document.getElementById('file-failure-message').getAttribute('role')==='alert'"), 'global failure has an accessible live announcement')

    reset()
    start(('full.txt',))
    select(b,False)
    e("IDBObjectStore.prototype.put=function(record,...args){if(record.entryId===failureOwner)throw new DOMException('raw technical quota detail','QuotaExceededError');return realFilePut.call(this,record,...args);}")
    finish()
    check(shown() and 'Browser storage is full' in text() and 'full.txt' in text() and 'raw technical' not in text(), 'B: real IndexedDB write rejection produces a friendly quota banner')
    check(absent_from_disk(), 'B: failed file and metadata are absent from actual local storage and IndexedDB')

    reset()
    start(('metadata.txt',))
    select(b)
    e("""IDBObjectStore.prototype.put=function(record,...args){const request=realFilePut.call(this,record,...args);if(record.entryId===failureOwner)request.addEventListener('success',()=>completedFileWrites++);return request;};
        persistence.metadata.save=function(){throw new Error('forced metadata failure');};""")
    finish()
    check(shown() and 'metadata.txt' in text() and e('completedFileWrites===1'), 'metadata persistence failure after blob write is reported globally')
    check(absent_from_disk(), 'metadata failure aborts the real blob transaction without publishing a reference')

    reset()
    start(('abort.txt',))
    select(b)
    e("""IDBObjectStore.prototype.put=function(record,...args){if(record.entryId===failureOwner)filePutTransaction=this.transaction;return realFilePut.call(this,record,...args);};
        window.abortAfterMetadata=true;
        persistence.metadata.save=function(...args){const result=realMetadataSave.apply(this,args);if(abortAfterMetadata){abortAfterMetadata=false;filePutTransaction.abort();}return result;};""")
    finish()
    check(shown() and 'abort.txt' in text() and e('!abortAfterMetadata'), 'late transaction abort after metadata commit is reported')
    check(absent_from_disk(), 'late abort preserves existing metadata compensation and removes failed blob')

    reset()
    start(('inline.pdf',))
    finish()
    check(e("!contentInspector.status.hidden&&contentInspector.status.textContent.includes('inline.pdf')&&document.getElementById('file-failure').hidden"), 'C: same visible Item keeps useful inline feedback without a duplicate banner')
    e('setInspectorOpen(false)')
    check(shown() and 'inline.pdf' in text(), 'closing Contents promotes an existing inline failure to the persistent banner')
    select(b)
    e('hierarchySidebar.setCollapsed(false);hierarchySidebar.setCollapsed(true)')
    check(shown(), 'failure survives further selection, sidebar and Contents changes')
    e("document.getElementById('dismiss-file-failure').click()")
    check(not shown(), 'failure stays until explicitly dismissed')

    reset()
    start(('success.txt',))
    select(b)
    finish()
    check(files()==['success.txt'] and files(b)==[], 'D: successful background attachment belongs to original Item')
    check(e(f"selectedNode.dataset.entryId==={q(b)}&&document.getElementById('file-failure').hidden&&contentInspector.status.hidden"), 'D: success stays quiet without navigation')
    check(e("(async()=>{const file=entries.get(failureOwner).content.attachments[0];return (await persistence.files.get(file.storageKey)).blob.size===7;})()"), 'D: original file is durably stored in real IndexedDB')

    reset()
    start(('first.txt','second.txt','third.txt'), "if(file.name==='second.txt')throw new Error('forced second file rejection');")
    select(b)
    finish()
    check(files()==['success.txt','first.txt'] and 'second.txt' in text() and 'first.txt' not in text(), 'E: earlier file remains and notification identifies only the failed second file')
    check(e('preparedKeys.length===1') and 'third.txt' not in files(), 'E: sequential batch stops at first rejection without notification spam')

    reset()
    start(('critical.heic',), "if(file.name.endsWith('.heic')){const preview=this.imagePreview;this.imagePreview=async()=>{throw new Error('critical preview rejection');};try{return await realPrepare.call(this,file,id);}finally{this.imagePreview=preview;}}")
    select(b)
    finish()
    check(shown() and 'critical.heic' in text() and 'critical.heic' not in files(), 'critical preview rejection reaches the same background failure path')

    reset()
    select()
    e("window.createImageBitmap=async()=>{throw new Error('optional decoder unavailable');};contentInspector.upload([new File(['original HEIC bytes'],'fallback.heic',{type:'image/heic'})])")
    check('fallback.heic' in files() and e("document.getElementById('file-failure').hidden&&contentInspector.status.hidden"), 'optional preview degradation saves original quietly')
    check(e("(async()=>{const f=entries.get(failureOwner).content.attachments.find(f=>f.filename==='fallback.heic');const r=await persistence.files.get(f.storageKey);return !r.thumbnail&&await r.blob.text()==='original HEIC bytes';})()"), 'optional preview failure retains exact original bytes')

    reset()
    start(('preview.pdf',))
    e("imageViewer.open(entries.get(failureOwner).content.attachments.find(f=>f.filename==='fallback.heic'))")
    wait_for('imageViewer.dialog.open')
    finish()
    check(shown() and 'preview.pdf' in text() and e("document.getElementById('file-failure').parentElement===imageViewer.dialog&&contentInspector.status.hidden"), 'failure during native Preview appears above it without duplicate inline feedback')
    e('imageViewer.dialog.close()')
    wait_for("document.getElementById('file-failure').parentElement===document.body")
    check(shown(), 'failure survives closing native Preview')

    reset()
    start(('inline-preview.pdf',))
    finish()
    e("imageViewer.open(entries.get(failureOwner).content.attachments.find(f=>f.filename==='fallback.heic'))")
    wait_for("document.getElementById('file-failure').parentElement===imageViewer.dialog")
    check(shown() and 'inline-preview.pdf' in text(), 'opening native Preview promotes existing inline failure instead of covering it')
    e('imageViewer.dialog.close()')
    wait_for("document.getElementById('file-failure').parentElement===document.body")

    # Mobile closed/compact Contents, other body selection and both drawer states.
    for sidebar_open in (False,True):
        reset()
        cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=True)
        start(('mobile.txt',), "throw new DOMException('fixture','QuotaExceededError');")
        e('setInspectorOpen(false)')
        select(b,False)
        e(f'hierarchySidebar.setCollapsed({str(not sidebar_open).lower()})')
        finish()
        check(shown() and 'mobile.txt' in text(), f'mobile failure is visible with Compact Preview/Contents closed and drawer open={sidebar_open}')
        check(e("(()=>{const b=document.getElementById('dismiss-file-failure'),r=b.getBoundingClientRect();return r.width>=44&&r.height>=44&&b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))&&document.documentElement.scrollWidth===innerWidth;})()"), 'mobile banner fits viewport with an exposed touch dismissal target')
    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)

    reset()
    start(('deleted.txt',))
    e(f"requestEntryDelete({q(a)});document.getElementById('delete-entry-form').requestSubmit()")
    wait_for('!deleteDialog.open&&!deletionBusy')
    select(b)
    finish()
    check(shown() and 'Travel' in text() and 'deleted.txt' in text(), 'F: deleted original Item uses captured safe context')
    check(e(f"!entries.has({q(a)})&&!JSON.parse(localStorage.getItem('galaxy:user-data')).entries.some(x=>x.id==={q(a)})"), 'F: background failure never resurrects deleted Item')
    check(absent_from_disk(), 'F: rejected add after deletion leaves no blob or metadata')

    # A real F1 fingerprint mismatch while preparation is pending.
    reset()
    a=b
    e('failureOwner='+q(b))
    start(('stale.txt',))
    e("notifyFileFailure('Earlier file failure')")
    e("const snapshot=JSON.parse(localStorage.getItem('galaxy:user-data'));snapshot.entries.find(x=>x.id===failureOwner).name='Other tab winner';localStorage.setItem('galaxy:user-data',JSON.stringify(snapshot));")
    finish()
    check(e("localSessionStale&&!document.getElementById('reload-local-data').hidden&&document.getElementById('file-failure').hidden&&storageStatus.textContent===staleSessionMessage"), 'F1: actual stale attachment rejection retains authoritative Reload state without generic error')
    check(absent_from_disk(), 'F1: stale rejection publishes no attachment or blob')
    check(not cdp.errors, f'no unhandled browser exceptions: {cdp.errors}')
    reset()
