"""F6 URL ownership checks with real image/video decoding and disposable storage."""
import json
from pathlib import Path
import tempfile
import time


def run_object_url_checks(*, cdp, e, check, wait_for, add):
    q=json.dumps
    owner=add('URL owner');other=add('Other Item')
    wait_for('physics.settled');e('physics.pause()')
    e(f"selectEntry(entries.get({q(owner)}),nodes.get({q(owner)}),{{openInspector:true,reframe:false}})")
    e("""(async()=>{window.f6photos=[];for(const [name,color] of [['one.png','red'],['two.png','blue']]){
        const c=document.createElement('canvas');c.width=80;c.height=60;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,80,60);
        const b=await new Promise(r=>c.toBlob(r,'image/png'));f6photos.push(new File([b],name,{type:'image/png'}));}
        await contentInspector.upload(f6photos);})()""")
    wait_for("document.querySelectorAll('#content-media img').length===2&&[...document.querySelectorAll('#content-media img')].every(i=>i.naturalWidth>0)")
    e('Promise.all([...galaxyAppearance.textureCache.values()])')
    e(Path(__file__).with_name('object_url_probe.js').read_text(encoding='utf-8'))
    e('contentInspector.renderLists()')
    wait_for("[...document.querySelectorAll('#content-media img')].every(i=>i.naturalWidth>0)")
    photos=e('contentInspector.content().attachments')

    def count():return e('cosmifoldUrlProbe.active.size')
    def close():
        e('imageViewer.dialog.close()');wait_for('!imageViewer.dialog.open&&imageViewer.url===null&&imageViewer.thumbnailUrls.size===0')
    def open_photo(index=0):
        e(f'contentInspector.openFile(contentInspector.content().attachments[{index}])')
        wait_for('imageViewer.dialog.open&&!imageViewer.image.hidden&&imageViewer.image.naturalWidth>0')
        wait_for('imageViewer.thumbnailUrls.size>=2')

    baseline=count();check(baseline==2,'Contents owns exactly the two visible thumbnail URLs')
    peak=baseline
    for _ in range(30):
        open_photo();peak=max(peak,count());close()
        assert count()==baseline, 'Repeated viewer close retained an old URL'
    check(peak==5 and count()==baseline,'A/D: 30 decoded image open/close cycles stay bounded at 2 thumbnails + 1 image + 2 filmstrip URLs')
    open_photo()
    for _ in range(30):
        e('imageViewer.show(1-imageViewer.index)')
        wait_for('!imageViewer.image.hidden&&imageViewer.image.naturalWidth>0')
        assert count()==5,'Replacement retained the previous full image URL'
    check(True,'E: 30 image replacements release the previous URL while the new image renders')
    e(f"selectEntry(entries.get({q(other)}),nodes.get({q(other)}),{{openInspector:true,reframe:false}})")
    wait_for('!imageViewer.dialog.open&&imageViewer.url===null')
    check(count()==0,'B: switching Items closes the old viewer and releases all A-only URLs')
    e(f"selectEntry(entries.get({q(owner)}),nodes.get({q(owner)}),{{openInspector:true,reframe:false}})")
    wait_for("document.querySelectorAll('#content-media img').length===2")
    e('setInspectorOpen(false)')
    check(count()==0 and e("![...document.querySelectorAll('#content-media img')].some(i=>i.hasAttribute('src'))"),'C: closing Contents detaches sources before releasing URLs')
    e('setInspectorOpen(true,{reframe:false})')
    wait_for("document.querySelectorAll('#content-media img').length===2&&[...document.querySelectorAll('#content-media img')].every(i=>i.naturalWidth>0)")
    check(count()==2,'C: reopening Contents renders valid newly owned thumbnails')

    # One already-open viewer isolates the delayed full-image read from filmstrip reads.
    open_photo(1)
    e('window.f6get=attachmentStore.get;window.f6late=[]')
    e(f"attachmentStore.get=key=>key==={q(photos[0]['storageKey'])}?new Promise(resolve=>f6late.push(resolve)):f6get.call(attachmentStore,key);void imageViewer.show(0)")
    wait_for('f6late.length===1')
    e('imageViewer.show(1)');wait_for('!imageViewer.image.hidden&&imageViewer.index===1')
    created=e('cosmifoldUrlProbe.created')
    e(f"(async()=>{{const record=await f6get.call(attachmentStore,{q(photos[0]['storageKey'])});f6late.splice(0).forEach(resolve=>resolve(record));}})()")
    check(e('imageViewer.index===1&&!imageViewer.image.hidden') and e('cosmifoldUrlProbe.created')==created,'I: late A read cannot allocate a URL or overwrite B')
    e('void imageViewer.show(0)');wait_for('f6late.length===1');close();created=e('cosmifoldUrlProbe.created')
    e(f"(async()=>{{const record=await f6get.call(attachmentStore,{q(photos[0]['storageKey'])});f6late.splice(0).forEach(resolve=>resolve(record));}})()")
    check(e('cosmifoldUrlProbe.created')==created and count()==2,'I: closing before a blob read completes prevents unused late URLs')
    e('attachmentStore.get=f6get')

    # Failed thumbnails are removed immediately; durable originals are untouched.
    e("attachmentStore.get=async key=>{const r=await f6get.call(attachmentStore,key);return r?{...r,thumbnail:new Blob(['invalid thumbnail'],{type:'image/webp'})}:r};contentInspector.renderLists()")
    wait_for("contentInspector.urls.size===0&&document.querySelectorAll('#content-media .content-media-placeholder').length===2&&[...document.querySelectorAll('#content-media .content-media-placeholder')].every(p=>p.textContent.includes('unavailable'))")
    check(count()==0 and e('contentInspector.content().attachments.length===2'),'H: failed thumbnail decodes release every URL and preserve both attachment references')
    e('attachmentStore.get=f6get;contentInspector.renderLists()')
    wait_for("document.querySelectorAll('#content-media img').length===2&&[...document.querySelectorAll('#content-media img')].every(i=>i.naturalWidth>0)")
    e('window.f6decode=imageViewer.image.decode;imageViewer.image.decode=async()=>{throw new Error("forced decode failure")};contentInspector.openFile(contentInspector.content().attachments[0])')
    wait_for('imageViewer.dialog.open&&imageViewer.url===null&&!!imageViewer.originalUrl')
    check(e("!imageViewer.image.hasAttribute('src')&&imageViewer.saveCopy.href===imageViewer.originalUrl"),'H: failed full-image decoder source is detached/revoked; only the explicit original-download fallback remains')
    close();e('imageViewer.image.decode=f6decode')
    check(count()==2,'H: closing failed-preview fallback releases its original-download URL too')

    # Missing bytes keep metadata and existing unavailable feedback.
    e('attachmentStore.get=async()=>null;contentInspector.renderLists()')
    wait_for("[...document.querySelectorAll('.content-media-viewport')].length===2&&[...document.querySelectorAll('.content-media-viewport')].every(p=>p.textContent.includes('unavailable'))")
    check(count()==0 and e('contentInspector.content().attachments.length===2'),'missing blob allocates no URL and never deletes metadata')
    e('attachmentStore.get=f6get;contentInspector.renderLists()')
    wait_for("document.querySelectorAll('#content-media img').length===2")

    # Actual video decoder and detached playback element.
    cdp.call('Page.bringToFront')
    e("""(async()=>{const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='green';ctx.fillRect(0,0,96,64);
        const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0],r=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];
        const result=new Promise(resolve=>{r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};r.onstop=()=>resolve(new File(chunks,'clip.webm',{type:'video/webm'}))});
        const started=new Promise(resolve=>r.onstart=resolve);r.start();track.requestFrame();await started;
        for(let frame=0;frame<20;frame++){ctx.fillStyle=frame%2?'green':'blue';ctx.fillRect(0,0,96,64);track.requestFrame();await new Promise(resolve=>setTimeout(resolve,60));}
        r.stop();const file=await result;stream.getTracks().forEach(t=>t.stop());if(file.size<=200)throw Error('Synthetic video contains no encoded frames');await contentInspector.upload([file]);})()""")
    video=e("contentInspector.content().attachments.find(f=>f.filename==='clip.webm')")
    e("window.f6videoUnavailable=imageViewer.videoUnavailable;imageViewer.videoUnavailable=function(v){window.f6videoFailure={error:this.video.error?.code,message:this.video.error?.message,ready:this.video.readyState,source:this.video.currentSrc,metadata:this.images[this.index]};return f6videoUnavailable.call(this,v)}")
    e(f'contentInspector.openFile({q(video)})')
    try:wait_for('!imageViewer.video.hidden&&imageViewer.video.readyState>=2')
    except AssertionError as error:raise AssertionError(str(error)+' video failure: '+q(e('window.f6videoFailure'))) from error
    cdp.call('Runtime.evaluate',expression='imageViewer.video.play()',userGesture=True,awaitPromise=True)
    wait_for('!imageViewer.video.paused||imageViewer.video.ended')
    close()
    check(e("imageViewer.video.paused&&!imageViewer.video.hasAttribute('src')&&!imageViewer.video.hasAttribute('poster')&&imageViewer.video.readyState===0"),'F: video playback stops and decoder sources/poster are detached before URL revocation')
    e(f'contentInspector.openFile({q(video)})');wait_for('!imageViewer.video.hidden&&imageViewer.video.readyState>=2');close()
    check(True,'F: reopening the same video loads and plays through the native player normally')

    # Real download reaches disk before its bounded grace expires.
    with tempfile.TemporaryDirectory(prefix='cosmifold-f6-download-') as directory:
        cdp.call('Browser.setDownloadBehavior',behavior='allow',downloadPath=directory)
        e(f'contentInspector.downloadFile({q(photos[0])})')
        deadline=time.monotonic()+10;path=Path(directory)/photos[0]['filename']
        while not path.exists() or path.stat().st_size!=photos[0]['size']:
            assert time.monotonic()<deadline,'Original download did not complete';time.sleep(.03)
        check(path.stat().st_size==photos[0]['size'] and e('contentInspector.downloadUrls.size===1'),'J: original download completes while its URL is owned by the download grace')
        # Trigger expiry after completion without spending a minute in this suite.
        e("cosmifoldObjectUrls.clearDownloads()")
        check(e('contentInspector.downloadUrls.size===0'),'J: completed download releases its URL and timer through the common owner')

    open_photo()
    e(f'contentInspector.job({q(owner)},()=>removeEntryAttachment({q(owner)},{q(photos[0]["storageKey"])}),{{operation:"remove"}})')
    wait_for('!imageViewer.dialog.open&&imageViewer.url===null')
    check(e(f"(async()=>!contentInspector.content().attachments.some(f=>f.id==={q(photos[0]['id'])})&&!(await attachmentStore.get({q(photos[0]['storageKey'])})))()"),'G: deleting a previewed attachment closes its viewer and preserves F4 deletion semantics')
    cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=2,mobile=True)
    e('contentInspector.openFile(contentInspector.content().attachments[0])');wait_for('!imageViewer.image.hidden');close()
    check(True,'mobile image preview still opens and releases normally')
    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)

    e("contentInspector.upload([new File(['%PDF-1.4\\n%%EOF'],'external.pdf',{type:'application/pdf'})])")
    e("window.f6pdfSupport=imageViewer.supportsPdf;imageViewer.supportsPdf=()=>false;contentInspector.openFile(contentInspector.content().attachments.find(f=>f.filename==='external.pdf'))")
    wait_for('imageViewer.dialog.open&&!!imageViewer.url')
    cdp.call('Runtime.evaluate',expression='imageViewer.external.click()',userGesture=True)
    wait_for('contentInspector.nativePreviews.size===1&&!![...contentInspector.nativePreviews.values()][0].url')
    external_url=e('[...contentInspector.nativePreviews.values()][0].url')
    cdp.call('Page.bringToFront')
    close()
    check(e(f"(async()=>(await(await fetch({q(external_url)})).text()).startsWith('%PDF-1.4'))()"),'native PDF tab owns a separate URL that survives closing the internal PDF viewer')
    e('for(const tab of contentInspector.nativePreviews.keys())tab.close()')
    wait_for('contentInspector.nativePreviews.size===0')
    check(not e(f'cosmifoldUrlProbe.active.has({q(external_url)})'),'closing the native PDF tab releases its URL and polling owner')
    e('imageViewer.supportsPdf=f6pdfSupport')

    # Delete a different Item while its native reader is open. The currently
    # selected Item's thumbnails must survive the committed branch publication.
    e(f"contentInspector.upload([new File(['%PDF-1.4\\n%%EOF'],'branch.pdf',{{type:'application/pdf'}})],{q(other)})")
    branch_file=e(f'entries.get({q(other)}).content.attachments[0]')
    e(f'imageViewer.supportsPdf=()=>false;contentInspector.openFile({q(branch_file)})')
    wait_for('imageViewer.dialog.open&&!!imageViewer.url')
    cdp.call('Runtime.evaluate',expression='imageViewer.external.click()',userGesture=True)
    wait_for('contentInspector.nativePreviews.size===1&&!![...contentInspector.nativePreviews.values()][0].url')
    cdp.call('Page.bringToFront');close()
    kept=e('[...contentInspector.urls]')
    e(f"requestEntryDelete({q(other)});document.getElementById('delete-entry-form').requestSubmit()")
    wait_for('!deletionBusy&&contentInspector.nativePreviews.size===0')
    check(e(f"(async()=>!entries.has({q(other)})&&!(await attachmentStore.get({q(branch_file['storageKey'])}))&&{q(kept)}.every(u=>contentInspector.urls.has(u)&&cosmifoldUrlProbe.active.has(u)))()"),
          'branch deletion releases its native preview while preserving unrelated visible thumbnail URLs')
    e('imageViewer.supportsPdf=f6pdfSupport;physics.pause()')

    e('Promise.all(Array.from({length:50},(_,i)=>galaxyAppearance.bakeField(900000+i,8)))')
    e('galaxyAppearance.trimTextures()')
    check(e("(()=>{const used=new Set([...document.querySelectorAll('[style*=\"blob:\"]')].map(n=>n.style.getPropertyValue('--surface-map')));return [...galaxyAppearance.textureUrls.values()].filter(u=>!used.has('url(\"'+u+'\")')).length<=32})()"),'50 generated textures retain at most 32 unused URLs plus fields painted by current surfaces')

    # Failed Restore preserves previews; successful Restore resets old UI before reload.
    e(f"selectEntry(entries.get({q(owner)}),nodes.get({q(owner)}),{{openInspector:true,reframe:false}})")
    wait_for("contentInspector.visible&&document.querySelectorAll('#content-media img').length===2&&[...document.querySelectorAll('#content-media img')].every(i=>i.naturalWidth>0)")
    e("""(async()=>{window.f6backup=await cosmifoldBackup.create({async readBackup(){return {metadataText:JSON.stringify({version:5,entries:[{id:'new-workspace',name:'Restored',parentId:null}],layout:[]}),preferencesText:null,records:[]}}});
        backupUI.trigger.click();await backupUI.checkBackup(new File([f6backup.blob],'valid.cosmifold'));})()""")
    before=e('[...contentInspector.urls]')
    e("window.f6prefs=persistence.preferences.replaceRaw;window.f6fail=true;persistence.preferences.replaceRaw=function(text){if(f6fail){f6fail=false;throw Error('forced F6 Restore failure')}return f6prefs.call(this,text)};backupUI.restore()")
    check(e(f'{q(before)}.every(url=>cosmifoldUrlProbe.active.has(url)&&contentInspector.urls.has(url))&&contentInspector.visible'),'K: failed Restore preserves current valid preview URLs')
    e('persistence.preferences.replaceRaw=f6prefs;backupUI.reload=()=>{window.f6reloaded=true};backupUI.restore()')
    wait_for('window.f6reloaded===true')
    check(count()==0 and e('!contentInspector.visible&&!imageViewer.dialog.open&&contentInspector.nativePreviews.size===0'),'K: successful Restore releases old-workspace previews before the reload callback')
    check(e('cosmifoldUrlProbe.duplicateRevocations===0'),'all tracked URLs have predictable ownership with no duplicate revocation')
    check(not cdp.errors, 'no unhandled object URL lifecycle browser exceptions')
