"""Two actual tabs, localStorage, Web Locks and IndexedDB; synthetic local data only."""
import json
import time


def run_local_stale_checks(*, cdp, cdp_class, e, check, origin):
    def ready(client):
        deadline=time.monotonic()+20
        while not client.evaluate("document.readyState==='complete'&&typeof physics!=='undefined'"):
            assert time.monotonic()<deadline, 'Local tab did not initialize'
            time.sleep(.05)
        client.evaluate('physics.pause();applicationCommandTail')
        client.evaluate('universeRepository.whenIdle()')
        client.evaluate('graphNeedsSave=false')

    e('physics.pause();applicationCommandTail');e('universeRepository.whenIdle()');e('graphNeedsSave=false')
    target=cdp.call('Target.createTarget',url='about:blank')['targetId']
    endpoint=cdp.sock.getpeername()
    peer=cdp_class(f'ws://127.0.0.1:{endpoint[1]}/devtools/page/{target}')
    try:
        peer.call('Page.enable');peer.call('Runtime.enable')
        peer.call('Page.addScriptToEvaluateOnNewDocument',source="""
            document.addEventListener('load',event=>{
                if(event.target.tagName==='SCRIPT'&&event.target.src.endsWith('/services/supabase-auth.js'))
                    createSupabaseAuthAdapter=()=>({available:false,async initialize(){return {user:null}},dispose(){}});
                if(event.target.tagName==='SCRIPT'&&event.target.src.endsWith('/script.js')){physics.pause();graphNeedsSave=false;}
            },true);
        """)
        peer.call('Page.navigate',url=origin);ready(peer)
        check(e('!!navigator.locks'), 'real browser Web Locks available')
        check(peer.evaluate("entries.has('old-star')&&!localSessionStale"), 'second tab loads the same local dataset')
        before=peer.evaluate("JSON.stringify(entries.get('old-star'))")
        e("saveEntryLocation('old-star',{text:'Saved in Tab A'})")
        saved=e("localStorage.getItem('galaxy:user-data')")
        outcome=peer.evaluate("(async()=>{try{await saveEntryContent('old-star',{...galaxyModel.emptyContent(),notes:{format:'plain',text:'Stale note'}});return 'saved';}catch(error){return error.code;}})()")
        check(outcome=='LOCAL_SNAPSHOT_STALE', 'stale Notes mutation is rejected')
        check(e("localStorage.getItem('galaxy:user-data')")==saved, 'winning Location survives the stale write byte-for-byte')
        check(peer.evaluate("JSON.stringify(entries.get('old-star'))")==before, 'failed mutation never publishes into stale runtime')
        check(peer.evaluate("localSessionStale&&!storageAvailable&&!storageStatus.hidden&&storageStatus.textContent==='Cosmifold changed in another tab. Reload this tab to continue safely.'"), 'stale warning is visible and stable')
        check(peer.evaluate("!document.getElementById('reload-local-data').hidden&&document.getElementById('entry-panel').inert&&document.getElementById('universe-section').inert"), 'stale editors are inert and Reload is available')
        peer.evaluate('graphNeedsSave=true;checkpointGalaxy()')
        check(e("localStorage.getItem('galaxy:user-data')")==saved, 'stale closing checkpoint cannot overwrite winner')
        check(peer.evaluate("(async()=>{const b=await cosmifoldBackup.create(universeRepository);return b.manifest.metadata.entries.find(x=>x.id==='old-star').location.text;})()")=='Saved in Tab A', 'stale tab Backup reads current canonical disk')
        peer.evaluate("document.getElementById('backup-button').click()")
        check(peer.evaluate('backupUI.dialog.open'), 'Backup UI remains available while stale')
        peer.evaluate('backupUI.dialog.close()')
        peer.evaluate("document.getElementById('reload-local-data').click()")
        ready(peer)
        check(peer.evaluate("!localSessionStale&&storageAvailable&&entries.get('old-star').location.text==='Saved in Tab A'"), 'Reload accepts current canonical state')
        peer.evaluate("saveEntryContent('old-star',{...galaxyModel.emptyContent(),notes:{format:'plain',text:'Saved after Reload'}})")
        check(peer.evaluate("JSON.parse(localStorage.getItem('galaxy:user-data')).entries.find(x=>x.id==='old-star').content.notes.text==='Saved after Reload'"), 'fresh tab can save again')

        cdp.call('Page.reload');ready(cdp)
        peer.call('Page.reload');ready(peer)
        e("window.raceHeld=false;window.raceGate=navigator.locks.request('cosmifold-workspace-write:null',{mode:'exclusive'},()=>{raceHeld=true;return new Promise(resolve=>window.releaseRace=resolve);});void 0")
        deadline=time.monotonic()+5
        while not e('raceHeld'):
            assert time.monotonic()<deadline, 'Race barrier did not acquire write lock'
            time.sleep(.01)
        e("window.raceA=saveEntryLocation('old-star',{text:'Serialized winner'}).then(()=> 'saved',error=>error.code);void 0")
        peer.evaluate("window.raceB=saveEntryContent('old-star',{...entries.get('old-star').content,notes:{format:'plain',text:'Queued stale note'}}).then(()=> 'saved',error=>error.code);void 0")
        e('releaseRace();void 0')
        outcomes=[e('raceA'),peer.evaluate('raceB')]
        check(outcomes.count('saved')==1 and outcomes.count('LOCAL_SNAPSHOT_STALE')==1, 'real queued Web Lock writers produce one winner and one stale rejection')
        canonical=e("JSON.parse(localStorage.getItem('galaxy:user-data')).entries.find(x=>x.id==='old-star')")
        check((canonical.get('location',{}).get('text')=='Serialized winner') == (outcomes[0]=='saved'), 'serialized successor matches the actual winning tab')
        check(not (canonical.get('location',{}).get('text')=='Serialized winner' and canonical['content']['notes']['text']=='Queued stale note'), 'both competing snapshots cannot publish')
        # Reload the winner/loser alike before starting the independent file case.
        cdp.call('Page.reload');ready(cdp)
        e("window.staleFixtureFile={id:cosmifoldIds.uuid(),kind:'upload',entryId:'old-star',filename:'fixture.txt',mimeType:'text/plain',size:4,createdAt:new Date().toISOString()};staleFixtureFile.storageKey=staleFixtureFile.id")
        e("addEntryAttachment('old-star',{key:staleFixtureFile.id,entryId:'old-star',blob:new Blob(['data'],{type:'text/plain'})},staleFixtureFile)")
        file_id=e('staleFixtureFile.id')
        peer.call('Page.reload');ready(peer)
        check(peer.evaluate("entries.get('old-star').content.attachments.length===1"), 'both tabs know the same persisted attachment')
        e('removeEntryAttachment("old-star",'+json.dumps(file_id)+')')
        saved=e("localStorage.getItem('galaxy:user-data')")
        outcome=peer.evaluate("(async()=>{try{await saveEntryLocation('old-star',{text:'Stale file reference'});return 'saved';}catch(error){return error.code;}})()")
        check(outcome=='LOCAL_SNAPSHOT_STALE', 'stale metadata containing a deleted attachment is refused')
        check(e("localStorage.getItem('galaxy:user-data')")==saved, 'deleted attachment reference stays deleted')
        check(e('(async()=>await persistence.files.get('+json.dumps(file_id)+')===null)()'), 'actual IndexedDB blob stays deleted')
        check(not cdp.errors and not peer.errors, 'two-tab check has no unhandled browser exceptions')
    finally:
        cdp.call('Target.closeTarget',targetId=target)
        peer.sock.close()
