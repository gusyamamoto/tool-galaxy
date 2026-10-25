"""Real IndexedDB with injected WebKit Blob preparation failures; no device claim."""
import json
from pathlib import Path


def run_attachment_binary_checks(*, cdp, e, check, wait_for, add, select):
    q=json.dumps
    probe=Path(__file__).with_name('attachment_binary_probe.js').read_text(encoding='utf-8')
    cdp.call('Page.addScriptToEvaluateOnNewDocument',source=probe)
    e(probe)
    root=add('Binary compatibility');owner=add('Mixed attachments',root);destination=add('Copy destination',root)
    wait_for('physics.settled');e('physics.pause();graphNeedsSave=false')

    def reload():
        e('localRestoreInProgress=true;graphNeedsSave=false')
        cdp.call('Page.reload')
        wait_for("document.readyState==='complete'&&typeof cameraViewReady!=='undefined'&&cameraViewReady",timeout=30)
        e('physics.pause();applicationCommandTail');e('universeRepository.whenIdle()');e('graphNeedsSave=false')

    def selected(item=owner):
        select(item);e('setInspectorOpen(true)')

    def upload(name,item=owner):
        selected(item)
        e(f"contentInspector.upload([new File(['bytes: '+{q(name)}],{q(name)},{{type:'text/plain'}})])")
        wait_for('contentInspector.jobs.size===0')
        return e(f'entries.get({q(item)}).content.attachments.at(-1)?.storageKey')

    def hashes():
        return e("""(async()=>{const result={};for(const r of await attachmentStore.readAll()){
            if(!(r.blob instanceof Blob))continue;
            const hash=async b=>b?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join(''):null;
            result[r.key]={entryId:r.entryId,type:r.blob.type,size:r.blob.size,hash:await hash(r.blob),thumbnail:await hash(r.thumbnail)};
        }return result;})()""")

    def keys():
        return e('(async()=>(await binaryRawState()).files.map(r=>r.key).sort())()')

    e("binarySetMode('off')")
    legacy=upload('normal.txt')
    check(e(f"(async()=>{{const r=(await binaryRawState()).files.find(r=>r.key==={q(legacy)});return r.blob instanceof Blob&&r.blob.type==='text/plain'&&binaryWrites.filter(w=>w.key===r.key).length===1;}})()"),'working Blob storage remains the primary path with one write')
    e("(async()=>{binarySetMode('sync');await attachmentStore.save({key:'binary-file-metadata',entryId:'fixture',blob:new File(['named bytes'],'name.HEIC',{type:'image/heic',lastModified:1700000000000}),thumbnail:new Blob(['small'],{type:'image/webp'})});})()")
    check(e("(async()=>{const r=await attachmentStore.get('binary-file-metadata');return r.blob instanceof File&&r.blob.name==='name.HEIC'&&r.blob.lastModified===1700000000000&&r.blob.type==='image/heic'&&r.blob.size===11&&await r.blob.text()==='named bytes'&&r.thumbnail.type==='image/webp'&&await r.thumbnail.text()==='small';})()"),'File-backed adapter input reconstructs its original name, MIME, size, lastModified and thumbnail')
    e("attachmentStore.delete('binary-file-metadata')")

    cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=True)
    cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=1)
    wait_for('hierarchySidebar.narrow');selected()
    e("""(async()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;canvas.getContext('2d').fillRect(0,0,64,48);
        window.binaryImage=await new Promise(r=>canvas.toBlob(r,'image/png'));
        window.binaryImageHash=await binaryHash(binaryImage);
        window.binaryPickers=[];
        [contentInspector.files,contentInspector.photoFiles,contentInspector.cameraFiles].forEach(input=>input.click=function(){binaryPickers.push({capture:this.getAttribute('capture'),accept:this.getAttribute('accept')});});})()""")
    # FileList/change is genuine; only the native chooser and storage error are injected.
    for surface in ['Preview Contents','Contents']:
        for source in ['camera','photo','capture-files']:
            name=f'{surface}-{source}'+('.txt' if source=='capture-files' else '.png')
            e("binarySetMode('async')" if source=='photo' else "binarySetMode('sync')")
            selected();e('closeInspector()' if surface=='Preview Contents' else 'setInspectorOpen(true)')
            trigger='mobile-body-add' if surface=='Preview Contents' else 'entry-add-button'
            e(f"document.getElementById({q(trigger)}).click();addMenu.querySelector('[data-add={source}]').click()")
            e(f"""(()=>{{const file=new File([{ '"document bytes"' if source=='capture-files' else 'binaryImage'}],{q(name)},{{type:{q('text/plain' if source=='capture-files' else 'image/png')}}});
                const dt=new DataTransfer();dt.items.add(file);const input=contentInspector.fileSelection.input;input.files=dt.files;input.dispatchEvent(new Event('change'));}})()""")
            wait_for('contentInspector.jobs.size===0')
            check(e(f"contentInspector.content().attachments.at(-1)?.filename==={q(name)}&&contentInspector.status.hidden"),f'{surface} {source}: injected WebKit failure saves through existing picker pipeline')
            check(e(f"""(async()=>{{const f=contentInspector.content().attachments.at(-1),r=await attachmentStore.get(f.storageKey),raw=(await binaryRawState()).files.find(x=>x.key===f.storageKey);
                return r.blob instanceof Blob&&r.entryId==={q(owner)}&&r.blob.type===f.mimeType&&r.blob.size===f.size&&raw.blob.format==='cosmifold-bytes-v1'&&raw.blob.bytes instanceof ArrayBuffer&&raw.blob.size===f.size&&
                binaryWrites.filter(w=>w.key===f.storageKey).map(w=>w.encoding).join(',')==='blob,bytes'&&
                ({q(source)}==='capture-files'?await r.blob.text()==='document bytes':f.width===64&&f.height===48&&await binaryHash(r.blob)===binaryImageHash&&r.thumbnail instanceof Blob&&raw.thumbnail.bytes instanceof ArrayBuffer&&await binaryHash(r.thumbnail)===await binaryHash(binaryOriginals.get(f.storageKey).thumbnail));}})()"""),f'{surface} {source}: fresh-transaction fallback preserves bytes, MIME, size, ownership and thumbnail')
    check(e("[0,3].every(i=>binaryPickers[i].capture==='environment'&&binaryPickers[i].accept==='image/*'&&binaryPickers[i+1].capture===null&&binaryPickers[i+1].accept==='image/*'&&binaryPickers[i+2].capture===null&&binaryPickers[i+2].accept===null)"),'both surfaces retain distinct camera, gallery and file input intents')

    before=hashes();reload()
    check(hashes()==before,'mixed legacy Blob and byte-backed originals/thumbnails survive reload with exact SHA-256 hashes')
    selected();wait_for("document.querySelector('#content-media img')?.naturalWidth>0")
    check(e("[...document.querySelectorAll('#content-media img')].some(i=>i.complete&&i.naturalWidth)"),'decoded thumbnails render through the unchanged object URL preview path')

    # Copy is exercised without changing clipboard or destination behavior.
    e(f"binarySetMode('sync');copyHierarchyItems([{q(owner)}]);openHierarchyPaste({q(destination)});confirmHierarchyPaste('copy')")
    check(e('!pasteDialog.open'),'existing copy transaction accepts decoded originals and thumbnails')
    copied=e(f'[...entries.values()].find(x=>x.parentId==={q(destination)})?.id')
    check(bool(copied),'copy creates its existing independent destination owner')
    check(e(f"""(async()=>{{const source=entries.get({q(owner)}).content.attachments,target=entries.get({q(copied)}).content.attachments,raw=(await binaryRawState()).files;
        for(let i=0;i<source.length;i++){{const a=await attachmentStore.get(source[i].storageKey),b=await attachmentStore.get(target[i].storageKey);
        if(source[i].storageKey===target[i].storageKey||b.entryId!=={q(copied)}||raw.find(r=>r.key===target[i].storageKey).blob.format!=='cosmifold-bytes-v1'||await binaryHash(a.blob)!==await binaryHash(b.blob)||a.thumbnail?.size!==b.thumbnail?.size||(a.thumbnail&&await binaryHash(a.thumbnail)!==await binaryHash(b.thumbnail)))return false;}}return source.length===target.length;}})()"""),'copy retains independent keys, owner, exact original bytes and thumbnails in byte storage')
    selected(copied)
    removed=e('contentInspector.content().attachments[0].storageKey')
    e(f"contentInspector.job({q(copied)},()=>removeEntryAttachment({q(copied)},{q(removed)}),{{operation:'remove'}})")
    check(removed not in keys() and e(f'!entries.get({q(copied)}).content.attachments.some(f=>f.storageKey==={q(removed)})'),'normal attachment removal deletes byte-backed data and canonical reference')
    e(f"requestEntryDelete({q(copied)});document.getElementById('delete-entry-form').requestSubmit()")
    wait_for('!deletionBusy')
    check(e(f"!entries.has({q(copied)})&&(async()=>!(await binaryRawState()).files.some(r=>r.entryId==={q(copied)}))()"),'subtree removal deletes the remaining fallback records through the existing ownership index')

    before=hashes()
    e('(async()=>{window.binaryBackup=await cosmifoldBackup.create(universeRepository);})()')
    check(e("!JSON.stringify(binaryBackup.manifest).includes('cosmifold-bytes-v1')"),'Backup exports the established payload format without the storage descriptor')
    e("(async()=>{window.binaryRestoreHandle=await cosmifoldRestore.inspect(binaryBackup.blob);await cosmifoldRestore.restore(binaryRestoreHandle,universeRepository);})()")
    reload()
    check(hashes()==before,'F5 Backup/Restore round-trip preserves every original/thumbnail hash and owner')
    check(e("(async()=>(await binaryRawState()).files.every(r=>r.blob.format==='cosmifold-bytes-v1'))()"),'Restore replacement retries byte storage after the raw transaction aborts')
    e('(async()=>{window.binaryBackup=await cosmifoldBackup.create(universeRepository);})()')
    canonical=e("localStorage.getItem('galaxy:user-data')");previous_keys=keys()
    check(e("""(async()=>{binarySetMode('both-fail');try{await cosmifoldRestore.restore(await cosmifoldRestore.inspect(binaryBackup.blob),universeRepository);return false;}catch(e){return e.name==='QuotaExceededError';}finally{binarySetMode('sync');}})()"""),'F5 rejects Restore if the raw write and byte fallback both fail')
    check(hashes()==before and keys()==previous_keys and e("localStorage.getItem('galaxy:user-data')")==canonical,'failed Restore retains the complete old dataset and canonical metadata')

    # F8 inspects raw row descriptors, including malformed unreferenced data.
    e("""(async()=>{const good=await cosmifoldAttachmentBinary.encode({key:'binary-orphan',entryId:'gone',blob:new Blob(['orphan']),thumbnail:new Blob(['thumb'])});
        const bad={key:'binary-unknown',entryId:'gone',blob:{format:'cosmifold-bytes-v1',bytes:new ArrayBuffer(1),size:2,type:''}};
        const db=await new Promise(r=>{const x=indexedDB.open('galaxy-attachments');x.onsuccess=()=>r(x.result);});
        try{await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.objectStore('files').add(good);tx.objectStore('files').add(bad);});}finally{db.close();}})()""")
    check(e("(async()=>{const a=await universeRepository.auditAttachmentStorage();return a.orphaned.some(r=>r.key==='binary-orphan')&&a.orphanedBytes===11&&a.unknown.some(r=>r.key==='binary-unknown');})()"),'F8 classifies valid bytes as ORPHAN with original plus thumbnail sizes; malformed bytes remain UNKNOWN')
    e("universeRepository.removeOrphanedAttachments(['binary-orphan'])")
    check('binary-orphan' not in keys() and 'binary-unknown' in keys(),'F8 removes only the explicitly selected compatible orphan')
    check(e("(async()=>!!(await cosmifoldBackup.create(universeRepository)).blob.size)()"),'Backup ignores unreferenced malformed byte rows without losing live files')

    # Hold exactly at the existing F4 boundary, then discard the tab execution.
    selected()
    e("window.binaryCrash=null;attachmentStore.setOperationStageHook(({operation})=>{binaryCrash=operation;return new Promise(()=>{});});void contentInspector.upload([new File(['crash'],'uncommitted.txt',{type:'text/plain'})]);")
    wait_for('!!window.binaryCrash')
    staged=e('binaryCrash.files[0].key')
    check(staged in keys() and e(f"!entries.get({q(owner)}).content.attachments.some(f=>f.storageKey==={q(staged)})"),'F4 staged fallback bytes are durable before any canonical metadata commit')
    reload()
    check(staged not in keys() and e('(async()=>!(await attachmentStore.listOperations()).length)()'),'F4 startup removes only the unreferenced staged byte record and clears its journal')
    check(all(hashes().get(k)==v for k,v in before.items()),'F4 rollback preserves all previously committed original and thumbnail hashes')
    selected()
    e("attachmentStore.setOperationStageHook(()=>{window.binaryFailJournalFinish=true;});")
    committed=upload('committed-recovery.txt')
    e('attachmentStore.setOperationStageHook(null)')
    check(e('(async()=>(await attachmentStore.listOperations()).length===1)()'),'F4 committed byte attachment retains its journal if final cleanup is interrupted')
    reload()
    check(committed in keys() and e(f"entries.get({q(owner)}).content.attachments.some(f=>f.storageKey==={q(committed)})&&(async()=>!(await attachmentStore.listOperations()).length)()"),'F4 startup keeps the referenced fallback file and clears the leftover journal')

    # F1 must still reject a stale metadata commit after fallback bytes are durable.
    selected();previous_keys=keys()
    e("""binarySetMode('sync');attachmentStore.setOperationStageHook(()=>{const data=JSON.parse(localStorage.getItem('galaxy:user-data'));
        data.entries[0].description='Simulated other-tab edit';localStorage.setItem('galaxy:user-data',JSON.stringify(data));});""")
    upload('stale-fallback.txt')
    e('attachmentStore.setOperationStageHook(null)')
    check(keys()==previous_keys and e('localSessionStale'),'F1 rejects a stale canonical commit after fallback persistence and compensates the new byte record')
    check(e("JSON.parse(localStorage.getItem('galaxy:user-data')).entries[0].description==='Simulated other-tab edit'"),'F1 preserves the other tab edit instead of publishing stale attachment metadata')
    reload()

    selected();canonical=e("localStorage.getItem('galaxy:user-data')");previous_keys=keys()
    e("binarySetMode('both-fail')")
    upload('failed.txt')
    check(e("!contentInspector.status.hidden&&contentInspector.status.dataset.error==='true'&&contentInspector.status.textContent.includes('enough local browser storage')"),'F2 displays the authoritative byte fallback storage failure through the existing visible error')
    check(keys()==previous_keys and e("localStorage.getItem('galaxy:user-data')")==canonical and e('(async()=>!(await attachmentStore.listOperations()).length)()'),'both failures leave no published metadata, partial byte records or stale operation journal')
    check(not cdp.errors,f'no unhandled browser exceptions: {cdp.errors}')
