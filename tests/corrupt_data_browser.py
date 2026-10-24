"""Startup recovery using synthetic metadata, real localStorage/IDB and isolated tabs."""
import base64
import copy
import json
from pathlib import Path
import tempfile
import time


def run_corrupt_data_checks(*,cdp,cdp_class,e,check,wait_for,origin):
    q=json.dumps
    key='galaxy:user-data'
    base={'version':5,'entries':[{'id':'recovery-root','name':'Travel','parentId':None},
          {'id':'recovery-child','name':'Packing','parentId':'recovery-root','content':{
              'version':1,'notes':{'format':'plain','text':'Keep my original notes'},'links':[],'attachments':[]}}],'layout':[]}

    def ready():
        wait_for("document.readyState==='complete'&&typeof cameraViewReady!=='undefined'&&cameraViewReady")
        e('physics.pause();applicationCommandTail')

    def seed(raw):
        e(f'localRestoreInProgress=true;localStorage.setItem({q(key)},{q(raw)})')
        cdp.call('Page.reload');ready()

    def preserved(raw):
        return e(f'localStorage.getItem({q(key)})==={q(raw)}')

    def recovery():
        return e("localDataRecovery&&!storageAvailable&&!localSessionStale&&!document.getElementById('local-data-recovery').hidden&&galaxy.inert&&entries.size===0&&nodes.size===0&&firstUse.root.hidden&&document.getElementById('file-failure').hidden")

    # Keep a known-good portable Backup for the explicit recovery route.
    seed(q(base))
    e("addEntryAttachment('recovery-child',{key:'recovery-bytes',entryId:'recovery-child',blob:new Blob(['preserved original bytes'],{type:'text/plain'})},{id:'recovery-bytes',kind:'upload',entryId:'recovery-child',storageKey:'recovery-bytes',filename:'original.txt',mimeType:'text/plain',size:24,createdAt:'2026-01-01T00:00:00Z'})")
    encoded=e("(async()=>{const b=await cosmifoldBackup.create(universeRepository);return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(b.blob);});})()")
    check(bool(base64.b64decode(encoded)), 'known-good Backup created through the existing service')

    cases={'A invalid JSON':'{truncated original snapshot'}
    orphan=copy.deepcopy(base);orphan['entries'][1]['parentId']='missing';cases['B orphan']=q(orphan)
    duplicate=copy.deepcopy(base);duplicate['entries'].append({'id':'recovery-root','name':'Second original'});cases['C duplicate ID']=q(duplicate)
    cycle=copy.deepcopy(base);cycle['entries'][0]['parentId']='recovery-child';cases['D cycle']=q(cycle)
    tasks=copy.deepcopy(base);tasks['entries'][0]['taskList']=True;tasks['entries'].append({'id':'forbidden','name':'Task child','parentId':'recovery-child'});cases['E task children']=q(tasks)
    nested=copy.deepcopy(base);nested['entries'][0]['taskList']=True;nested['entries'][1]['taskList']=True;cases['E nested lists']=q(nested)
    collection=copy.deepcopy(base);collection['constellations']=[{'id':'c','name':'Keep membership','memberEntryIds':['missing'],'createdAt':'2026-01-01T00:00:00Z'}];cases['F Constellation membership']=q(collection)
    attachment=copy.deepcopy(base);attachment['entries'][1]['content']['attachments']=[{'id':'bad attachment'}];cases['invalid attachment metadata']=q(attachment)
    archive=copy.deepcopy(base);archive['archivedGalaxies']=[{'galaxyId':'recovery-child','archivedAt':'2026-01-01T00:00:00Z'}];cases['invalid archived root']=q(archive)
    for label,raw in cases.items():
        seed(raw)
        check(recovery(),label+': controlled recovery, no partial graph/onboarding or F1/F2 warning')
        check(preserved(raw),label+': exact original persisted text survives startup')
        e('graphNeedsSave=true;saveGalaxy();checkpointGalaxy()')
        outcome=e("(async()=>{try{await universeRepository.save({entries:[],layout:[]});return 'saved';}catch(error){return error.code;}})()")
        check(outcome==('LOCAL_DATA_SYNTAX' if label.startswith('A ') else 'LOCAL_DATA_STRUCTURE') and preserved(raw),label+': layout/checkpoints and ordinary repository writes cannot overwrite it')

    raw=cases['B orphan']
    seed(raw)
    with tempfile.TemporaryDirectory(prefix='galaxy-recovery-downloads-') as directory:
        cdp.call('Browser.setDownloadBehavior',behavior='allow',downloadPath=directory)
        e("localStorage.setItem('synthetic-auth-secret','DO NOT EXPORT');document.getElementById('download-recovery-data').click()")
        deadline=time.monotonic()+10
        files=[]
        while not files:
            files=list(Path(directory).glob('cosmifold-recovery-*.json'))
            assert time.monotonic()<deadline,'Recovery download did not complete'
            time.sleep(.05)
        check(files[0].read_bytes()==raw.encode('utf-8'), 'raw recovery download contains exact original text, with no auth/session keys')
        check(preserved(raw), 'raw recovery download never mutates canonical metadata')
        e("localStorage.removeItem('synthetic-auth-secret')")
    e("graphNeedsSave=true;window.dispatchEvent(new Event('pagehide'));checkpointGalaxy()")
    check(preserved(raw), 'L: pagehide cannot checkpoint empty recovery runtime over the original')
    cdp.call('Page.reload');ready()
    check(recovery() and preserved(raw), 'I: Reload returns to recovery with the identical corrupt snapshot')
    for width in (390,320):
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=844,deviceScaleFactor=1,mobile=True)
        check(e("(()=>{const root=document.getElementById('local-data-recovery');return root.scrollWidth<=innerWidth&&[...root.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth;});})()"),f'recovery actions fit mobile {width}px with touch-safe targets')
    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)

    # Two actual tabs independently enter recovery, retaining F1/Restore locks.
    target=cdp.call('Target.createTarget',url='about:blank')['targetId']
    endpoint=cdp.sock.getpeername()
    peer=cdp_class(f'ws://127.0.0.1:{endpoint[1]}/devtools/page/{target}')
    try:
        peer.call('Page.enable');peer.call('Runtime.enable')
        peer.call('Page.addScriptToEvaluateOnNewDocument',source="""document.addEventListener('load',event=>{
            if(event.target.tagName==='SCRIPT'&&event.target.src.endsWith('/services/supabase-auth.js'))
                createSupabaseAuthAdapter=()=>({available:false,async initialize(){return {user:null}},dispose(){}});
        },true);""")
        peer.call('Page.navigate',url=origin)
        deadline=time.monotonic()+20
        while not peer.evaluate("typeof localDataRecovery!=='undefined'&&localDataRecovery&&typeof cameraViewReady!=='undefined'&&cameraViewReady"):
            assert time.monotonic()<deadline,'Second recovery tab did not initialize'
            time.sleep(.05)
        check(peer.evaluate("!localSessionStale&&!storageAvailable&&firstUse.root.hidden"), 'M: second tab enters corruption recovery without a false stale conflict')
        outcome=peer.evaluate("(async()=>{try{await persistence.metadata.withWrite(()=>persistence.metadata.save({entries:[],layout:[]}));return 'saved';}catch(error){return error.code;}})()")
        check(outcome=='LOCAL_DATA_STRUCTURE' and preserved(raw), 'M: neither recovery tab can perform a normal canonical save')
        check(not peer.errors, 'second recovery tab has no unhandled exceptions')
    finally:
        cdp.call('Target.closeTarget',targetId=target);peer.sock.close()

    e("document.getElementById('restore-recovery-backup').click()")
    check(e('backupUI.dialog.open&&!backupUI.choose.disabled&&backupUI.download.hidden'), 'recovery exposes normal validated Restore without offering an invalid normal Backup')
    e("backupUI.checkBackup(new File(['invalid backup'],'invalid.cosmifold'))")
    check(e('!backupUI.handle') and preserved(raw) and recovery(), 'K: invalid Restore is rejected while corrupt original and recovery state remain intact')

    def inspect_good():
        e("backupUI.checkBackup(new File([Uint8Array.from(atob("+q(encoded)+"),c=>c.charCodeAt(0))],'good.cosmifold'))")
        check(e('!!backupUI.handle&&!backupUI.busy'), 'known-good Backup passes existing Restore validation')

    inspect_good()
    e("""window.originalRecoveryPreferences=persistence.preferences.replaceRaw;
        window.rejectRecoveryPreferences=true;
        persistence.preferences.replaceRaw=function(text){if(rejectRecoveryPreferences){rejectRecoveryPreferences=false;throw new Error('forced recovery Restore failure');}return originalRecoveryPreferences.call(this,text);};
        backupUI.restore()""")
    check(preserved(raw) and recovery(), 'failed Restore after metadata replacement compensates back to the exact corrupt original')
    check(e("(async()=>await (await persistence.files.get('recovery-bytes')).blob.text()==='preserved original bytes')()"), 'failed recovery Restore preserves existing IndexedDB bytes')
    check(e("(()=>{try{persistence.metadata.save({entries:[],layout:[]});return false;}catch(error){return error.code==='LOCAL_DATA_STRUCTURE';}})()"), 'failed Restore reinstates the corruption write guard')
    e('persistence.preferences.replaceRaw=originalRecoveryPreferences')
    before=e('performance.timeOrigin')
    e('void backupUI.restore()')
    wait_for(f'performance.timeOrigin!=={before}&&typeof cameraViewReady!=="undefined"&&cameraViewReady')
    check(e("!localDataRecovery&&storageAvailable&&document.getElementById('local-data-recovery').hidden&&entries.get('recovery-child').content.notes.text==='Keep my original notes'"), 'J: explicitly confirmed Restore replaces corruption and starts the normal app')
    check(e("(async()=>await (await persistence.files.get('recovery-bytes')).blob.text()==='preserved original bytes')()"), 'J: successful Restore retains exact attachment bytes')

    # Supported v1-v4 compatibility, including partial built-in position records.
    for version in (1,2,3,4):
        snapshot=copy.deepcopy(base);snapshot['version']=version
        snapshot['entries'][0]['role']='category';snapshot['entries'][1]['role']='subcategory'
        if version<3:
            snapshot['builtInPositions']=[{'id':'github','x':42,'y':24}]
            if version==1:
                snapshot['tools']=snapshot.pop('entries')
        original=q(snapshot)
        e("['pre-hierarchy','pre-layout','pre-cosmic-tree'].forEach(suffix=>localStorage.removeItem('galaxy:user-data:'+suffix))")
        seed(original)
        check(e("!localDataRecovery&&storageAvailable&&entries.get('recovery-child').content.notes.text==='Keep my original notes'"),f'G: supported v{version} migrates without false recovery or content loss')
        e('saveGalaxy()')
        check(e('localStorage.getItem("galaxy:user-data:pre-cosmic-tree")')==original and e("JSON.parse(localStorage.getItem('galaxy:user-data')).version===5"),f'G: v{version} migration retains exact backup and saves canonical v5')

    seed(q({'version':5,'entries':[],'layout':[]}))
    wait_for('!firstUse.root.hidden')
    check(e("!localDataRecovery&&storageAvailable&&document.getElementById('local-data-recovery').hidden"), 'H: valid genuinely empty Universe shows normal onboarding')
    archived=copy.deepcopy(base);archived['archivedGalaxies']=[{'galaxyId':'recovery-root','archivedAt':'2026-01-01T00:00:00Z'}]
    seed(q(archived))
    check(e("!localDataRecovery&&entries.size===0&&archivedEntries.size===2&&firstUse.root.hidden"), 'valid archived-only Universe retains all Items and never appears first-use empty')

    missing=copy.deepcopy(base)
    missing['entries'][1]['content']['attachments']=[{'id':'missing-file','kind':'upload','entryId':'recovery-child','storageKey':'missing-file','filename':'missing.pdf','mimeType':'application/pdf','size':12,'createdAt':'2026-01-01T00:00:00Z'}]
    seed(q(missing))
    check(e("!localDataRecovery&&entries.get('recovery-child').content.attachments[0].storageKey==='missing-file'"), 'missing blob preserves well-formed metadata without failing all startup')
    e("selectEntry(entries.get('recovery-child'),nodes.get('recovery-child'));contentInspector.openFile(contentInspector.content().attachments[0])")
    wait_for("imageViewer.dialog.open&&!imageViewer.status.hidden&&imageViewer.status.textContent.includes('could not be opened')")
    check(e("entries.get('recovery-child').content.attachments.length===1"), 'opening a missing file shows the existing unavailable state without deleting its reference')
    check(not cdp.errors,f'no unhandled recovery browser exceptions: {cdp.errors}')
