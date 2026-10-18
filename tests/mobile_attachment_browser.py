"""Real local FileList/change/storage checks; picker UI and failures are injected."""
import base64
import json
import tempfile
from pathlib import Path


def run_mobile_attachment_checks(*, cdp, evaluate, check, wait_for, add, select):
    root=add('Phone attachments');owner=add('Camera destination',root)
    wait_for('physics.settled');evaluate('physics.pause()');select(owner)
    cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=True)
    cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=1)
    wait_for('hierarchySidebar.narrow')
    evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    evaluate("hierarchySidebar.setCollapsed(true);setInspectorOpen(true);window.nativeUUID=crypto.randomUUID;window.nativeBitmap=createImageBitmap;window.pickerRequests=[];contentInspector.files.click=function(){pickerRequests.push({capture:this.getAttribute('capture'),accept:this.getAttribute('accept')});}")
    images=evaluate("""(async()=>{const result={};for(const type of ['image/jpeg','image/png']){const c=document.createElement('canvas');c.width=64;c.height=48;c.getContext('2d').fillRect(0,0,64,48);const b=await new Promise(r=>c.toBlob(r,type));result[type]=btoa(String.fromCharCode(...new Uint8Array(await b.arrayBuffer())));}return result;})()""")
    evaluate("Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});window.createImageBitmap=()=>Promise.reject(Error('decoder unavailable'))")
    node=cdp.call('DOM.getDocument')['root']['nodeId']
    input_node=cdp.call('DOM.querySelector',nodeId=node,selector='#content-files')['nodeId']
    count=0

    def completed():
        wait_for('contentInspector.jobs.size===0')

    def open_picker(source):
        evaluate(f"openEntryContentAction({json.dumps(owner)},{json.dumps(source)})")

    with tempfile.TemporaryDirectory(prefix='cosmifold-phone-files-') as directory:
        files=Path(directory)
        (files/'camera.jpg').write_bytes(base64.b64decode(images['image/jpeg']))
        (files/'gallery.PNG').write_bytes(base64.b64decode(images['image/png']))
        (files/'document.txt').write_text('Original phone document',encoding='utf-8')
        (files/'provider.jpg').write_bytes(base64.b64decode(images['image/jpeg']))
        for source,name in [('camera','camera.jpg'),('gallery','gallery.PNG'),('capture-files','document.txt')]:
            open_picker(source)
            cdp.call('DOM.setFileInputFiles',nodeId=input_node,files=[str(files/name)])
            completed();count+=1
            check(evaluate(f"mobileContents.state==='browse'&&mobileContents.page==='files'&&contentInspector.entryId==={json.dumps(owner)}&&panel.dataset.contentsState==='browse'"), f'{source}: real file-input save retains Contents, Files and its original CB')
            check(evaluate(f'contentInspector.content().attachments.length==={count}'), f'{source}: real input change reaches the model without randomUUID or an image decoder')
            check(evaluate(f"(async()=>{{const f=contentInspector.content().attachments.at(-1),r=await attachmentStore.get(f.storageKey);return f.filename==={json.dumps(name)}&&r.entryId==={json.dumps(owner)}&&r.blob.size===f.size&&btoa(String.fromCharCode(...new Uint8Array(await r.blob.arrayBuffer())))==={json.dumps(base64.b64encode((files/name).read_bytes()).decode())};}})()"), f'{source}: exact original bytes and filename reach real IndexedDB')
            check(evaluate("contentInspector.files.value===''&&document.querySelectorAll('#content-media > li,#content-attachments > li').length===contentInspector.content().attachments.length"), f'{source}: input resets for reuse and UI displays the committed attachment')
        check(evaluate("pickerRequests[0].capture==='environment'&&pickerRequests[1].capture===null&&pickerRequests[2].accept===null"), 'camera, gallery and Files retain their existing picker routing')
        open_picker('gallery')
        evaluate(f"window.emptyMimePhoto=new File([Uint8Array.from(atob({json.dumps(images['image/jpeg'])}),c=>c.charCodeAt(0))],'missing-type.jpg',{{type:''}});const transfer=new DataTransfer();transfer.items.add(emptyMimePhoto);contentInspector.files.files=transfer.files;contentInspector.files.dispatchEvent(new Event('change'))")
        completed();count+=1
        check(evaluate("contentInspector.content().attachments.at(-1).mimeType==='application/octet-stream'&&galaxyModel.filePolicy.classify(contentInspector.content().attachments.at(-1)).kind==='image'"), 'empty provider MIME still uses the JPEG extension without losing the original')
        # A second user selection of the same original must trigger change again.
        open_picker('camera');cdp.call('DOM.setFileInputFiles',nodeId=input_node,files=[str(files/'camera.jpg')]);completed();count+=1
        check(evaluate(f"contentInspector.content().attachments.length==={count}&&new Set(contentInspector.content().attachments.map(f=>f.id)).size==={count}"), 'same-file reselection works with independent strong fallback IDs')
        evaluate("contentInspector.saveBookmark('https://example.com/reference')")
        completed()
        check(evaluate("/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(contentInspector.content().links.at(-1).id)"), 'Bookmark creation uses the shared fallback without native randomUUID')
        child=add('Fallback child',root)
        check(child.startswith('entry-'), 'new entries retain their entry-UUID format without native randomUUID')
        evaluate("constellationWorkspace.openName();document.getElementById('constellation-name').value='Fallback collection';document.getElementById('constellation-name-form').requestSubmit()")
        wait_for('!constellationWorkspace.nameDialog.open')
        check(evaluate("[...constellations.values()].some(c=>c.name==='Fallback collection'&&c.id.startsWith('constellation:'))"), 'Constellation creation retains its prefix through the shared fallback')
        evaluate(f"openPortalDialog({json.dumps(child)});portalPicker.select({json.dumps(owner)});document.getElementById('portal-form').requestSubmit()")
        wait_for('!portalDialog.open')
        check(evaluate(f"[...portals.values()].some(p=>p.parentEntryId==={json.dumps(child)}&&p.targetEntryId==={json.dumps(owner)}&&p.id.startsWith('portal:'))"), 'linked-item creation uses the same fallback and preserves canonical identity')
        select(owner)
        evaluate("window.originalProviderRead=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){if(this.name==='provider.jpg')return Promise.reject(new DOMException('provider read denied','NotReadableError'));return originalProviderRead.call(this);}")
        open_picker('gallery');cdp.call('DOM.setFileInputFiles',nodeId=input_node,files=[str(files/'provider.jpg')]);completed()
        check(evaluate(f"contentInspector.content().attachments.length==={count}&&contentInspector.status.dataset.error==='true'&&contentInspector.status.textContent.includes('could not be read')&&contentInspector.status.textContent.includes('this device')"), 'provider read failure is explained and does not publish an attachment')
        wait_for("(()=>{const s=contentInspector.status.getBoundingClientRect(),p=panel.getBoundingClientRect();return !contentInspector.status.hidden&&s.top>=p.top&&s.bottom<=p.bottom+1;})()")
        check(True, 'the useful failure message is scrolled into view instead of hidden below Contents')
        evaluate('File.prototype.arrayBuffer=originalProviderRead;window.realAttachmentSave=attachmentStore.save;attachmentStore.save=async()=>{throw new DOMException("full","QuotaExceededError");}')
        open_picker('capture-files');cdp.call('DOM.setFileInputFiles',nodeId=input_node,files=[str(files/'document.txt')]);completed()
        check(evaluate(f"contentInspector.content().attachments.length==={count}&&contentInspector.status.textContent.includes('enough local browser storage')"), 'storage failure preserves the model and explains insufficient space')
        evaluate('attachmentStore.save=realAttachmentSave;Object.defineProperty(crypto,"randomUUID",{configurable:true,value:nativeUUID});window.createImageBitmap=nativeBitmap')
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=False,maxTouchPoints=1)
        cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
        evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        evaluate("setInspectorOpen(true);document.getElementById('content-add-files').click()")
        cdp.call('DOM.setFileInputFiles',nodeId=input_node,files=[str(files/'camera.jpg')]);completed();count+=1
        check(evaluate(f"contentInspector.content().attachments.length==={count}&&(async()=>!!(await attachmentStore.get(contentInspector.content().attachments.at(-1).storageKey)).thumbnail)()"), 'desktop file input still stores a normal JPEG and creates its native thumbnail')
    check(not cdp.errors,f'no attachment browser exceptions: {cdp.errors}')


def run_image_preview_checks(*, cdp, evaluate, check, wait_for, add, select, shot):
    root=add('Preview quality');owner=add('Detailed photos',root)
    wait_for('physics.settled');evaluate('physics.pause()');select(owner)
    evaluate("""(async()=>{
        window.makeDetailedPhoto=async(w,h,name)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
            const sky=x.createLinearGradient(0,0,w,h);sky.addColorStop(0,'#487f97');sky.addColorStop(1,'#e5be78');x.fillStyle=sky;x.fillRect(0,0,w,h);
            for(let i=0;i<w;i+=12){x.strokeStyle=i%24?'#30465f':'#f5e2b5';x.beginPath();x.moveTo(i,0);x.lineTo(w-i,h);x.stroke();}
            x.fillStyle='#102d40';x.font='64px sans-serif';x.fillText('Detailed original photo',60,h/2);
            return new File([await new Promise(r=>c.toBlob(r,'image/png'))],name,{type:'image/png'});};
        window.previewLandscape=await makeDetailedPhoto(1600,1200,'landscape.png');
        window.previewPortrait=await makeDetailedPhoto(1200,1600,'portrait.png');
    })()""")
    cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=3,mobile=True)
    cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=1)
    wait_for('hierarchySidebar.narrow')
    evaluate('hierarchySidebar.setCollapsed(true);setInspectorOpen(true);contentInspector.upload([previewLandscape])')
    wait_for('contentInspector.jobs.size===0')
    wait_for("document.querySelector('#content-media img')?.naturalWidth===768")
    check(evaluate("(async()=>{const f=contentInspector.content().attachments[0],r=await attachmentStore.get(f.storageKey),a=new Uint8Array(await r.blob.arrayBuffer()),b=new Uint8Array(await previewLandscape.arrayBuffer());return f.width===1600&&f.height===1200&&a.length===b.length&&a.every((v,i)=>v===b[i]);})()"), '768px preview preserves original dimensions and exact original bytes')

    # object-fit can letterbox or crop; compare the actual painted image dimensions,
    # rather than the surrounding img element's box, against its source pixels.
    density_check="""[...document.querySelectorAll('#content-media img')].every(img=>{
        const r=img.getBoundingClientRect(),fit=getComputedStyle(img).objectFit;
        const viewport=img.parentElement.getBoundingClientRect();
        const scale=(fit==='cover'?Math.max:Math.min)(r.width/img.naturalWidth,r.height/img.naturalHeight);
        return scale*devicePixelRatio<=1.01&&r.height<=viewport.height&&r.width<=viewport.width;
    })"""
    for width in (360,390,430):
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=844,deviceScaleFactor=3,mobile=True)
        evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        check(evaluate(density_check),f'{width}px phone, DPR 3: single image has enough pixels without blurry upscaling; '+str(evaluate("[...document.querySelectorAll('#content-media img')].map(i=>({width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,fit:getComputedStyle(i).objectFit,dpr:devicePixelRatio}))")))
        shot(f'image-preview-single-{width}-dpr3')
    evaluate('contentInspector.upload([previewPortrait])')
    wait_for('contentInspector.jobs.size===0')
    wait_for("document.querySelectorAll('#content-media img').length===2&&[...document.querySelectorAll('#content-media img')].every(i=>i.complete&&i.naturalWidth)")
    check(evaluate("document.querySelectorAll('#content-media img')[1].naturalWidth===576&&document.querySelectorAll('#content-media img')[1].naturalHeight===768"), 'portrait preview respects aspect ratio and the same 768px longest-edge cap')
    for width in (360,390,430):
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=844,deviceScaleFactor=3,mobile=True)
        evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        check(evaluate(density_check),f'{width}px phone, DPR 3: landscape/portrait grid has enough pixels for cover cropping')
        shot(f'image-preview-grid-{width}-dpr3')
    evaluate("contentInspector.openFile(contentInspector.content().attachments[0],document.querySelector('.content-media-viewport'))")
    wait_for('imageViewer.dialog.open&&!imageViewer.image.hidden&&imageViewer.image.naturalWidth===1600')
    check(evaluate('imageViewer.image.naturalHeight===1200'), 'full-image viewer still loads the original 1600x1200 image rather than its thumbnail')
    evaluate('imageViewer.dialog.close()')
    cdp.call('Emulation.setTouchEmulationEnabled',enabled=False,maxTouchPoints=1)
    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=2,mobile=False)
    evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    check(evaluate(density_check), 'desktop DPR 2 previews retain sufficient resolution')
    shot('image-preview-desktop-dpr2')
    print('Preview dimensions/bytes: '+str(evaluate("(async()=>Promise.all(contentInspector.content().attachments.map(async f=>{const r=await attachmentStore.get(f.storageKey);return {name:f.filename,originalBytes:r.blob.size,previewBytes:r.thumbnail.size};})))()")),flush=True)
    check(not cdp.errors,f'no image preview browser exceptions: {cdp.errors}')
