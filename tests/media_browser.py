"""Real photo/video Media checks. Fixtures are produced locally by browser-native APIs."""
import json
from pathlib import Path
import tempfile
import time


def run_media_checks(*, cdp, evaluate, check, wait_for, load, add, select, click_selector, shot):
    def key(value, modifiers=0):
        vk={'Enter':13,'Escape':27,'Tab':9,'ArrowLeft':37,'ArrowRight':39}.get(value,0)
        cdp.call('Input.dispatchKeyEvent',type='keyDown',key=value,code=value,modifiers=modifiers,windowsVirtualKeyCode=vk,text='\r' if value=='Enter' else '')
        cdp.call('Input.dispatchKeyEvent',type='keyUp',key=value,code=value,modifiers=modifiers,windowsVirtualKeyCode=vk)

    def close():
        key('Escape');wait_for('!imageViewer.dialog.open&&imageViewer.url===null')

    def open_index(index):
        evaluate(f"contentInspector.openFile(contentInspector.content().attachments.filter(f=>galaxyModel.filePolicy.isMedia(f))[{index}],document.querySelectorAll('#content-media .content-media-viewport')[{index}])")
        wait_for('imageViewer.dialog.open')

    def upload(expression):
        evaluate(f'contentInspector.upload({expression})');wait_for('contentInspector.jobs.size===0')

    galaxy=add('Media');owner=add('Selected moments',galaxy);wait_for('physics.settled');evaluate('physics.pause()')
    check(evaluate("document.getElementById('content-media-section').hidden"),'Media is hidden for an empty item')
    upload("[new File(['Original document'],'plan.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),new File(['Budget'],'budget.xlsx'),new File(['Archive'],'resources.zip')]")
    check(evaluate("document.getElementById('content-media-section').hidden&&document.querySelectorAll('#content-attachments > li').length===3"),'file-only items keep Files and have no Media clutter')

    evaluate("""(async()=>{
        window.makeMediaPhoto=async(name,w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
            const sky=x.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#476780');sky.addColorStop(1,'#deb78c');x.fillStyle=sky;x.fillRect(0,0,w,h);
            x.fillStyle='#eccb9b';x.beginPath();x.arc(w*.7,h*.24,w*.075,0,Math.PI*2);x.fill();
            for(const [color,peak,base] of [['#536679',.4,.84],['#253f50',.56,1],['#162b35',.72,1.1]]){x.fillStyle=color;x.beginPath();x.moveTo(0,h*base);x.lineTo(w*.22,h*peak);x.lineTo(w*.48,h*(peak+.2));x.lineTo(w*.78,h*(peak-.08));x.lineTo(w,h*base);x.lineTo(w,h);x.lineTo(0,h);x.fill();}
            const b=await new Promise(r=>c.toBlob(r,'image/png'));return new File([b],name,{type:'image/png'});};
        window.mediaPhoto=await makeMediaPhoto('IMG_20261008_083421_automatic_'+('9'.repeat(70))+'.png',800,500);
        window.mediaPortrait=await makeMediaPhoto('selected-mountain.png',480,720);
    })()""")
    upload('[mediaPhoto]');wait_for("document.querySelector('#content-media img')?.naturalWidth>0")
    check(evaluate("document.querySelectorAll('#content-media > li').length===1&&document.querySelectorAll('#content-attachments > li').length===3&&!document.querySelector('.content-media-caption')&&!/Image \\d/.test(document.getElementById('content-media').innerText)"),'one photo leads visually without generated labels or filename rows')
    check(evaluate("(()=>{const n=document.querySelector('.content-media-viewport'),r=n.getBoundingClientRect();return r.width>200&&r.height<170&&getComputedStyle(n.querySelector('img')).objectFit==='contain'})()"),'one media item has a compact wide preview that preserves the image')
    evaluate("window.mediaPicked=null;contentInspector.files.addEventListener('click',e=>{e.preventDefault();mediaPicked={id:contentInspector.entryId,accept:contentInspector.files.accept}},{once:true});document.getElementById('content-add-media').click()")
    check(evaluate("mediaPicked.id===contentInspector.entryId&&['.jpg','.png','.webp','.mp4','.webm','.mov'].every(t=>mediaPicked.accept.includes(t))&&!mediaPicked.accept.includes('.pdf')"),'Media + selects photo/video formats through the existing picker')
    evaluate("contentInspector.files.dispatchEvent(new Event('cancel'));contentInspector.files.addEventListener('click',e=>e.preventDefault(),{once:true});document.getElementById('content-add-files').click()")
    check(evaluate("!contentInspector.files.hasAttribute('accept')"),'Files + retains broad general-file selection')
    evaluate("contentInspector.files.dispatchEvent(new Event('cancel'))")
    shot('media-single')
    evaluate("document.querySelector('.content-media-viewport').focus()");key('Enter');wait_for('!imageViewer.image.hidden')
    check(evaluate("imageViewer.navigation.hidden&&imageViewer.previous.hidden&&imageViewer.next.hidden&&imageViewer.filmstrip.children.length===0"),'single media viewer hides arrows, counter and filmstrip')
    check(evaluate("(()=>{const r=imageViewer.image.getBoundingClientRect(),a=imageViewer.area.getBoundingClientRect();return r.width>800&&Math.abs(r.width/r.height-1.6)<.01&&(Math.abs(r.width-a.width)<1||Math.abs(r.height-a.height)<1)})()"),'small original photo scales up to use the available viewport without cropping')
    click_selector('#image-viewer-info-button')
    check(evaluate("!imageViewer.info.hidden&&imageViewer.info.textContent.includes(mediaPhoto.name)&&imageViewer.info.textContent.includes('image/png')&&imageViewer.info.textContent.includes('800 × 500')&&imageViewer.info.textContent.includes('KiB')"),'image Info preserves original ugly filename, format, size and dimensions')
    close();check(evaluate("document.activeElement===document.querySelector('.content-media-viewport')"),'keyboard viewer closing restores thumbnail focus')

    # Real encoded videos; no network, fixture downloads, transcoding or app dependency.
    evaluate("""(async()=>{
        window.recordMediaVideo=async(name,mime)=>{const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');let frame=0;
            const draw=()=>{frame++;x.fillStyle='#274b60';x.fillRect(0,0,640,360);x.fillStyle='#b6aa85';x.beginPath();x.arc(300+Math.sin(frame*.08)*65,90,34,0,Math.PI*2);x.fill();x.fillStyle='#142c3b';x.beginPath();x.moveTo(0,360);x.lineTo(160,150);x.lineTo(340,300);x.lineTo(500,100);x.lineTo(640,360);x.fill();};draw();
            const stream=c.captureStream(15),recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:140000}),chunks=[];
            const result=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=()=>resolve(new File(chunks,name,{type:mime.split(';')[0]}));recorder.onerror=reject;});
            const timer=setInterval(draw,60);recorder.start();await new Promise(r=>setTimeout(r,1500));recorder.stop();clearInterval(timer);stream.getTracks().forEach(t=>t.stop());return result;};
        const mp4=['video/mp4;codecs=avc1.42001E','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
        if(!mp4)throw new Error('This test browser cannot encode the genuine MP4 fixture. Use a Chrome/Edge build with native MP4 MediaRecorder support.');
        window.mediaMp4=await recordMediaVideo('short-trip.mp4',mp4);
        window.mediaWebm=await recordMediaVideo('class-demo.webm','video/webm;codecs=vp8');
        window.mediaMov=new File(['Unsupported local MOV codec fixture'],'phone-original.MOV',{type:'video/quicktime'});
    })()""")
    upload('[mediaMp4,mediaPortrait,mediaWebm,mediaMov]');wait_for("document.querySelectorAll('#content-media > li').length===5")
    check(evaluate("document.querySelectorAll('#content-attachments > li').length===3&&['mp4','webm','mov'].every(ext=>contentInspector.content().attachments.some(f=>galaxyModel.filePolicy.extension(f.filename)===ext&&galaxyModel.filePolicy.classify(f).kind==='video'))"),'MP4, WebM and MOV all route into Media while documents stay in Files')
    check(evaluate("document.getElementById('content-media').classList.contains('has-multiple-media')&&getComputedStyle(document.getElementById('content-media')).gridTemplateColumns.split(' ').length===2&&!/Image \\d/.test(document.getElementById('content-media').innerText)"),'multiple photos/videos share an orderly two-column observation surface without labels')
    check(evaluate("(async()=>{const f=contentInspector.content().attachments.find(f=>f.filename==='short-trip.mp4'),r=await attachmentStore.get(f.storageKey);return !!r.thumbnail&&f.width===640&&f.height===360&&Number.isFinite(f.duration)&&document.querySelector('[data-attachment-id=\"'+f.id+'\"] .content-media-duration')?.textContent.length>0})()"),'video frame thumbnail, resolution and duration come from local native decoding: '+str(evaluate("(async()=>{const f=contentInspector.content().attachments.find(f=>f.filename==='short-trip.mp4'),r=await attachmentStore.get(f.storageKey);return {width:f.width,height:f.height,duration:f.duration,thumbnail:!!r.thumbnail}})()")))
    check(evaluate("(async()=>{const f=contentInspector.content().attachments.find(f=>f.filename==='phone-original.MOV'),r=await attachmentStore.get(f.storageKey),row=document.querySelector('[data-attachment-id=\"'+f.id+'\"]');return !!r.blob&&!r.thumbnail&&!!row.querySelector('.content-media-play')&&row.querySelector('.content-media-placeholder')?.textContent==='Video'})()"),'unsupported MOV keeps usable original bytes and a polished fallback video tile')
    shot('media-mixed-desktop')

    open_index(0);wait_for('!imageViewer.image.hidden');wait_for('imageViewer.filmstrip.querySelectorAll("img").length>=3')
    check(evaluate("imageViewer.images.map(f=>galaxyModel.filePolicy.classify(f).kind).join('|')==='image|video|image|video|video'&&imageViewer.filmstrip.children.length===5&&document.getElementById('image-viewer-position').textContent==='1 / 5'"),'photo/video sequence and filmstrip preserve attachment order')
    shot('media-viewer-photo-desktop')
    click_selector('#image-viewer-next');wait_for('imageViewer.index===1&&!imageViewer.video.hidden')
    check(evaluate("imageViewer.video.controls&&imageViewer.video.playsInline&&!imageViewer.video.autoplay&&imageViewer.video.paused&&imageViewer.video.readyState>=2"),'MP4 opens in the native internal player without autoplay')
    click_selector('#image-viewer-info-button')
    check(evaluate("imageViewer.info.textContent.includes('short-trip.mp4')&&imageViewer.info.textContent.includes('video/mp4')&&imageViewer.info.textContent.includes('640 × 360')&&/\\d+:\\d{2}/.test(imageViewer.info.textContent)&&imageViewer.info.textContent.includes('KiB')"),'video Info exposes name, format, size, resolution and duration')
    click_selector('#image-viewer-info-button')
    result=cdp.call('Runtime.evaluate',expression='imageViewer.video.play().then(()=>true)',awaitPromise=True,returnByValue=True,userGesture=True)
    check('exceptionDetails' not in result,'native MP4 playback starts after an explicit user action')
    wait_for('imageViewer.video.currentTime>0')
    evaluate("imageViewer.video.pause();imageViewer.video.volume=.4;imageViewer.video.currentTime=.4")
    check(evaluate("imageViewer.video.paused&&imageViewer.video.volume===.4&&Math.abs(imageViewer.video.currentTime-.4)<.1"),'native player supports pause, volume and seeking')
    if evaluate('document.fullscreenEnabled'):
        result=cdp.call('Runtime.evaluate',expression='imageViewer.video.requestFullscreen().then(()=>true)',awaitPromise=True,returnByValue=True,userGesture=True)
        check('exceptionDetails' not in result and evaluate('document.fullscreenElement===imageViewer.video'),'native player supports fullscreen after user activation')
        # Browser fullscreen owns its first Escape; explicit native exit is deterministic in headless mode.
        evaluate('document.exitFullscreen()');wait_for('!document.fullscreenElement')
        check(evaluate('imageViewer.dialog.open'),'leaving native fullscreen preserves the Media viewer')
    evaluate('imageViewer.video.focus()');key('ArrowRight')
    check(evaluate('imageViewer.index===1'),'arrow keys inside native video controls do not navigate to another attachment')
    for _ in range(14):
        key('Tab')
        assert evaluate('imageViewer.dialog.contains(document.activeElement)'), 'native video Tab escaped the modal focus scope'
    check(True,'native video controls retain keyboard access inside the modal focus scope')
    cdp.call('Runtime.evaluate',expression='imageViewer.video.currentTime=0;imageViewer.video.play()',awaitPromise=True,userGesture=True)
    click_selector('#image-viewer-next');wait_for('imageViewer.index===2&&!imageViewer.image.hidden')
    check(evaluate("imageViewer.video.paused&&!imageViewer.video.hasAttribute('src')"),'switching away from video pauses playback and releases its source')
    evaluate("document.getElementById('image-viewer-close').focus()");key('ArrowRight');wait_for('imageViewer.index===3&&!imageViewer.video.hidden')
    check(evaluate("imageViewer.video.readyState>=2&&imageViewer.video.src.startsWith('blob:')"),'WebM plays through the same native internal viewer')
    click_selector('#image-viewer-previous');wait_for('imageViewer.index===2&&!imageViewer.image.hidden')
    evaluate('imageViewer.filmstrip.children[4].click()');wait_for("imageViewer.index===4&&!imageViewer.saveCopy.hidden")
    check(evaluate("imageViewer.status.textContent.includes('cannot be played in this browser')&&imageViewer.video.hidden&&imageViewer.saveCopy.download==='phone-original.MOV'&&!!imageViewer.saveCopy.href"),'unsupported codec fallback explains browser limits and offers explicit Save a copy')
    downloads=Path(tempfile.mkdtemp(prefix='cosmifold-video-copy-'))
    cdp.call('Browser.setDownloadBehavior',behavior='allow',downloadPath=str(downloads),eventsEnabled=True)
    click_selector('#media-viewer-save-copy')
    until=time.monotonic()+10
    while not (downloads/'phone-original.MOV').exists():
        assert time.monotonic()<until,'video Save a copy did not finish';time.sleep(.1)
    check((downloads/'phone-original.MOV').read_bytes()==b'Unsupported local MOV codec fixture','fallback Save a copy retains exact original video bytes and filename')
    evaluate("document.getElementById('image-viewer-info-button').focus()");key('Tab',8)
    check(evaluate('document.activeElement===imageViewer.filmstrip.lastElementChild'),'unified viewer traps backward focus on its final filmstrip control')
    key('Tab');check(evaluate("document.activeElement.id==='image-viewer-info-button'"),'unified viewer traps forward focus back onto Info')
    close();check(evaluate('imageViewer.thumbnailUrls.size===0&&imageViewer.video.paused'),'closing releases filmstrip URLs and stops all video playback')

    saved=evaluate('JSON.stringify(contentInspector.content())')
    evaluate("window.mediaStoreSave=attachmentStore.save;attachmentStore.save=async()=>{throw new DOMException('Full','QuotaExceededError')}")
    upload('[mediaMp4]')
    check(evaluate('JSON.stringify(contentInspector.content())')==saved and evaluate("contentInspector.status.dataset.error==='true'&&contentInspector.status.textContent.includes('local browser storage')"),'video quota failure preserves item metadata and gives a friendly local-storage explanation')
    evaluate("attachmentStore.save=mediaStoreSave;window.mediaInspectorSave=contentInspector.save;window.mediaFailedKey=null;attachmentStore.save=(record,...args)=>{mediaFailedKey=record.key;return mediaStoreSave(record,...args)};contentInspector.save=()=>{throw new Error('Metadata write failed')}")
    upload('[mediaWebm]')
    check(evaluate('JSON.stringify(contentInspector.content())')==saved and evaluate("(async()=>await attachmentStore.get(mediaFailedKey)===null)()"),'failed video metadata commit aborts the real IndexedDB write without orphaned bytes')
    evaluate('attachmentStore.save=mediaStoreSave;contentInspector.save=mediaInspectorSave')
    upload("[Object.defineProperty(new File(['tiny'],'too-large.mp4',{type:'video/mp4'}),'size',{value:100*1024*1024+1})]")
    check(evaluate('JSON.stringify(contentInspector.content())')==saved and evaluate("contentInspector.status.textContent.includes('100 MiB')"),'oversized video rejects before storage without raising other file limits')

    for width,height in [(320,568),(390,844),(740,360)]:
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=True)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=True)
        evaluate('hierarchySidebar.setCollapsed(true)');select(owner);evaluate('physics.pause()');time.sleep(.2)
        check(evaluate("document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.content-media-viewport')].every(n=>{const r=n.getBoundingClientRect();return r.width>70&&r.right<=innerWidth})&&[...document.querySelectorAll('.content-media-item summary')].every(n=>n.getBoundingClientRect().height>=44)"),f'Media grid and 44px actions fit {width}×{height} without page overflow')
        if width==390:shot('media-mixed-mobile')
        open_index(0);wait_for('!imageViewer.image.hidden')
        check(evaluate("(()=>{const r=imageViewer.image.getBoundingClientRect(),a=imageViewer.area.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+.1&&r.top>=0&&r.bottom<=innerHeight+.1&&Math.abs(r.width/r.height-1.6)<.01&&(Math.abs(r.width-a.width)<1||Math.abs(r.height-a.height)<1)&&imageViewer.next.getBoundingClientRect().height>=44&&[...imageViewer.filmstrip.children].every(b=>b.getBoundingClientRect().height>=44)})()"),f'full photo uses available {width}×{height} viewport with side arrows and reachable filmstrip')
        if width==390:shot('media-viewer-photo-mobile')
        click_selector('#image-viewer-next');wait_for('!imageViewer.video.hidden&&imageViewer.index===1')
        check(evaluate("(()=>{const r=imageViewer.video.getBoundingClientRect();return imageViewer.video.controls&&r.width>200&&r.height>80&&r.right<=innerWidth+.1&&r.bottom<=innerHeight+.1&&document.documentElement.scrollWidth<=innerWidth})()"),f'native video controls and playback area fit {width}×{height}')
        if width==740:shot('media-viewer-video-landscape')
        close()

    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
    cdp.call('Emulation.setTouchEmulationEnabled',enabled=False)
    select(owner);evaluate('physics.pause()')
    media_ids=evaluate('contentInspector.content().attachments.filter(f=>galaxyModel.filePolicy.isMedia(f)).map(f=>f.id)')
    media_keys=evaluate('contentInspector.content().attachments.filter(f=>galaxyModel.filePolicy.isMedia(f)).map(f=>f.storageKey)')
    evaluate('saveGalaxy()');cdp.call('Page.reload',ignoreCache=True);load();select(owner);evaluate('physics.pause()')
    check(evaluate(f"{json.dumps(media_ids)}.every(id=>contentInspector.content().attachments.some(f=>f.id===id))&&document.querySelectorAll('#content-media > li').length===5&&JSON.parse(localStorage.getItem('galaxy:user-data')).version===5"),'all media references refresh with the same IDs and schema v5')
    check(evaluate(f"(async()=>{{for(const key of {json.dumps(media_keys)})if(!(await attachmentStore.get(key))?.blob)return false;return true}})()"),'photo and video original bytes survive refresh in the existing IndexedDB store')
    video=evaluate("contentInspector.content().attachments.find(f=>f.filename==='short-trip.mp4')")
    evaluate(f"document.querySelector('[data-attachment-id=\"{video['id']}\"] .content-row-actions button').click()")
    check(evaluate(f"contentInspector.content().attachments.some(f=>f.id==={json.dumps(video['id'])})"),'video deletion retains the existing second-click confirmation')
    evaluate(f"document.querySelector('[data-attachment-id=\"{video['id']}\"] .content-row-actions button').click()");wait_for('contentInspector.jobs.size===0')
    check(evaluate(f"(async()=>!contentInspector.content().attachments.some(f=>f.id==={json.dumps(video['id'])})&&await attachmentStore.get({json.dumps(video['storageKey'])})===null)()"),'confirmed video deletion removes metadata and owned bytes')

    single=add('One video',galaxy);wait_for('physics.settled');evaluate('physics.pause()')
    # Runtime fixtures are recreated after refresh without depending on lost globals.
    upload("[new File(['Unsupported MOV bytes'],'one.MOV',{type:'video/quicktime'})]")
    check(evaluate("!document.getElementById('content-media').classList.contains('has-multiple-media')&&document.querySelectorAll('#content-media > li').length===1"),'one video retains the compact wide single-media layout')
    open_index(0);wait_for('!imageViewer.saveCopy.hidden')
    check(evaluate('imageViewer.navigation.hidden&&imageViewer.filmstrip.children.length===0&&imageViewer.previous.hidden&&imageViewer.next.hidden'),'single-video fallback has no unnecessary navigation or filmstrip')
    close()
    evaluate("const row=document.querySelector('#content-media > li');const remove=row.querySelector('.content-row-actions button');remove.click();remove.click()");wait_for('contentInspector.jobs.size===0')
    check(evaluate("document.getElementById('content-media-section').hidden&&contentInspector.content().attachments.length===0"),'removing the only video hides Media without leaving an empty viewport')
    evaluate(f"(()=>{{const dt=new DataTransfer();dt.items.add(new File(['Video fallback'],'dropped.webm',{{type:'video/webm'}}));const node=nodes.get({json.dumps(owner)});node.dispatchEvent(new DragEvent('drop',{{bubbles:true,cancelable:true,dataTransfer:dt}}));}})()");wait_for('contentInspector.jobs.size===0')
    check(evaluate(f"contentInspector.entryId==={json.dumps(owner)}&&contentInspector.content().attachments.some(f=>f.filename==='dropped.webm')&&document.querySelectorAll('#content-media .content-video').length===3"),'general body drag/drop automatically routes videos into canonical Media')
    evaluate('saveGalaxy()');real=evaluate("localStorage.getItem('galaxy:user-data')")
    evaluate('loadSampleButton.click()');wait_for("document.readyState==='complete'&&typeof sampleMode!=='undefined'&&sampleMode");load()
    select('sample-satellite-2-0-0-0');evaluate('physics.pause()')
    upload("[new File(['Sample MOV bytes'],'sample.MOV',{type:'video/quicktime'})]")
    check(evaluate("attachmentStore.temporary&&contentInspector.content().attachments.some(f=>f.filename==='sample.MOV')") and evaluate("localStorage.getItem('galaxy:user-data')")==real,'video Sample uploads remain isolated from personal data')
    check(not cdp.errors,f'no media browser exceptions: {cdp.errors}')
