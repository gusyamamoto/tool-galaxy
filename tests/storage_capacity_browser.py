"""F7 synthetic estimates and actual write rejection in a disposable profile."""
import json


def run_storage_capacity_checks(*, cdp, e, check, wait_for, add):
    q=json.dumps
    owner=add('Capacity owner');other=add('Other capacity Item');destination=add('Copy destination')
    wait_for('physics.settled');e('physics.pause()')
    e("""window.f7storage=navigator.storage;window.f7estimate=Object.getOwnPropertyDescriptor(f7storage,'estimate');
        window.f7add=IDBObjectStore.prototype.add;window.f7calls=0;
        window.f7result={usage:100*1024**2,quota:10000*1024**2};
        window.f7mock=()=>{Object.defineProperty(f7storage,'estimate',{configurable:true,value:async()=>{f7calls++;return f7result;}})};
        f7mock();window.f7owner="""+q(owner))

    def select(item=owner):
        e(f'selectEntry(entries.get({q(item)}),nodes.get({q(item)}),{{openInspector:true,reframe:false}});physics.pause()')

    def reset(usage=100,quota=10000):
        e(f"f7result={{usage:{usage}*1024**2,quota:{quota}*1024**2}};f7mock();storageCapacity.failure();fileFailure.hidden=true;contentInspector.clearMessage()")
        # A healthy relevant operation resets warning deduplication without a debug hook.
        e('storageCapacity.check([{size:0}])')

    def upload(names,sizes=None):
        if sizes is None:sizes=[7]*len(names)
        e('contentInspector.upload('+q([{'name':n,'size':s} for n,s in zip(names,sizes)])+".map(f=>new File([new Uint8Array(f.size)],f.name,{type:'text/plain'})))")
        wait_for('contentInspector.jobs.size===0')

    def filenames(item=owner):return e(f'entries.get({q(item)})?.content?.attachments.map(f=>f.filename)||[]')
    def shown():return e('!capacityWarning.hidden')

    select();before=e('f7calls');upload(['healthy.txt'])
    check(not shown() and 'healthy.txt' in filenames(),'healthy estimate remains silent and attachment saves')
    check(e('f7calls')==before+1,'one estimate per upload batch')
    reset();e('f7result={usage:950*1024**2,quota:1000*1024**2}')
    before=filenames();upload(['low.txt'])
    check(shown() and e("document.getElementById('storage-capacity-message').textContent.includes('getting low')"),'high utilization and small remaining capacity show calm general warning')
    check(all(n in filenames() for n in before) and 'low.txt' in filenames(),'advisory does not reject writes or remove existing content')
    e("document.getElementById('dismiss-storage-capacity').click()")
    upload(['deduplicated.txt']);check(not shown(),'dismissed warning stays quiet for similar operations')
    e('f7result={usage:980*1024**2,quota:1000*1024**2}')
    upload(['deteriorated.txt']);check(shown(),'materially deteriorating capacity warns again')

    reset();e('f7result={usage:0,quota:4*1024**2}');before=e('f7calls')
    upload(['batch-one.txt','batch-two.txt'],[1400000,1400000])
    check(shown() and e("document.getElementById('storage-capacity-message').textContent.includes('selected files')"),'combined batch plus margin warns even at low utilization')
    check(e('f7calls')==before+1 and all(n in filenames() for n in ['batch-one.txt','batch-two.txt']),'batch gets one check and both files still save')

    # Browser-unavailable, throwing, rejecting and incomplete estimates all fail open.
    for label,expression in [
        ('missing storage',"Object.defineProperty(navigator,'storage',{configurable:true,value:undefined})"),
        ('missing method',"Object.defineProperty(f7storage,'estimate',{configurable:true,value:undefined})"),
        ('throwing',"Object.defineProperty(f7storage,'estimate',{configurable:true,value:()=>{throw Error('synthetic');}})"),
        ('rejecting',"Object.defineProperty(f7storage,'estimate',{configurable:true,value:async()=>{throw Error('synthetic');}})"),
        ('incomplete',"f7result={usage:0}"),
        ('nonsensical',"f7result={usage:Infinity,quota:-1}")]:
        reset();e(expression);name=label.replace(' ','-')+'.txt';upload([name])
        check(not shown() and name in filenames(),label+' estimate does not warn or break attachment flow')
        e("delete navigator.storage")

    # The delayed A upload may still finish on its captured owner, but no stale warning follows navigation.
    reset();select();e("window.f7gate=[];Object.defineProperty(f7storage,'estimate',{configurable:true,value:()=>new Promise(resolve=>f7gate.push(resolve))});window.f7job=contentInspector.upload([new File(['a'],'late-a.txt',{type:'text/plain'})]);void 0")
    wait_for('f7gate.length===1');select(other)
    e('f7mock();f7result={usage:0,quota:10000*1024**2}')
    upload(['newer-b.txt'])
    e('f7gate[0]({usage:950*1024**2,quota:1000*1024**2});f7job')
    check(not shown() and 'late-a.txt' in filenames() and 'newer-b.txt' in filenames(other),'older estimate cannot warn on newer operation or change captured attachment owner')
    select();reset();e("window.f7gate=[];Object.defineProperty(f7storage,'estimate',{configurable:true,value:()=>new Promise(resolve=>f7gate.push(resolve))});window.f7job=contentInspector.upload([new File(['a'],'closed-flow.txt',{type:'text/plain'})]);void 0")
    wait_for('f7gate.length===1');e('setInspectorOpen(false);f7gate[0]({usage:950*1024**2,quota:1000*1024**2});f7job')
    check(not shown() and 'closed-flow.txt' in filenames(),'closing Contents invalidates pending advisory without losing the selected upload')

    # Reject real IndexedDB adds: no quota estimate is an authorization or a guarantee.
    for low in [False,True]:
        select();reset()
        if low:e('f7result={usage:950*1024**2,quota:1000*1024**2}')
        e("window.f7attempted=[];IDBObjectStore.prototype.add=function(record,...args){if(this.name==='files'){f7attempted.push(record.key);throw new DOMException('synthetic','QuotaExceededError');}return f7add.call(this,record,...args);}")
        name='quota-low.txt' if low else 'quota-healthy.txt';upload([name])
        check(not shown() and e("!contentInspector.status.hidden&&contentInspector.status.dataset.error==='true'&&contentInspector.status.textContent.includes('storage')"),'F2 takes priority after '+('low' if low else 'healthy')+' estimate')
        check(name not in filenames() and e('(async()=>f7attempted.length===1&&!(await attachmentStore.get(f7attempted[0]))&&(await attachmentStore.listOperations()).length===0)()'),'actual quota rejection leaves no phantom reference, blob or journal')
        e('IDBObjectStore.prototype.add=f7add')

    # Partial batches retain earlier success and identify the failing file alone.
    reset();e("window.f7writes=0;IDBObjectStore.prototype.add=function(record,...args){if(this.name==='files'&&++f7writes===2)throw new DOMException('synthetic','QuotaExceededError');return f7add.call(this,record,...args);}")
    upload(['partial-first.txt','partial-second.txt','partial-third.txt'])
    check('partial-first.txt' in filenames() and 'partial-second.txt' not in filenames() and 'partial-third.txt' not in filenames() and e("contentInspector.status.textContent.includes('partial-second.txt')"),'partial batch preserves earlier success and identifies only failed file')
    e('IDBObjectStore.prototype.add=f7add')

    # Copy warning uses already loaded original + thumbnail blobs before saveBatch.
    reset();e('f7result={usage:0,quota:2*1024**2}');before=e('f7calls')
    e(f'copyHierarchyItems([{q(owner)}]);openHierarchyPaste({q(destination)});confirmHierarchyPaste("copy")')
    wait_for('!pasteBusy&&!pasteDialog.open')
    check(e('f7calls')==before+1 and shown() and e("document.getElementById('storage-capacity-message').textContent.includes('copies')"),'copy estimates one batch of existing durable bytes and still succeeds')
    check(e(f'[...entries.values()].some(x=>x.parentId==={q(destination)}&&x.content?.attachments.length>0)'),'independent copied attachments are published normally')
    reset();before=e('f7calls')
    e(f'copyHierarchyItems([{q(owner)}]);openHierarchyPaste({q(destination)});confirmHierarchyPaste("link")')
    check(e('f7calls')==before and not shown(),'linked metadata-only placement does not estimate storage')

    # Actual mobile picker routing feeds the same advisory check.
    cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=True)
    select();reset();e('f7result={usage:950*1024**2,quota:1000*1024**2};window.f7clicks=[contentInspector.files,contentInspector.photoFiles,contentInspector.cameraFiles].map(input=>{const click=input.click;input.click=()=>{};return [input,click]})')
    for source in ['camera','gallery','files']:
        e(f'contentInspector.chooseFiles({{source:{q(source)}}})')
        e("(()=>{const dt=new DataTransfer();dt.items.add(new File(['mobile'],'mobile-"+source+".txt',{type:'text/plain'}));contentInspector.fileSelection.input.files=dt.files;contentInspector.fileSelection.input.dispatchEvent(new Event('change'));})()")
        wait_for('contentInspector.jobs.size===0')
        check('mobile-'+source+'.txt' in filenames(),'mobile '+source+' selection uses shared upload and continues despite advisory')
    check(shown() and e("(()=>{const r=capacityWarning.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"),'visible capacity notice fits mobile viewport')
    e("f7clicks.forEach(([input,click])=>input.click=click);if(f7estimate)Object.defineProperty(f7storage,'estimate',f7estimate);else delete f7storage.estimate;storageCapacity.cancel()")
    check(not cdp.errors,'no unhandled exceptions from estimate failure or stale results')
