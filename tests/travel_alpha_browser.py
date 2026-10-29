"""Alpha/beta isolation in a disposable browser; cloud checks use a fake SDK only."""
import functools
import http.server
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
from urllib.parse import urlsplit


def run_travel_alpha_checks(*, cdp, e, check, wait_for, load, origin, root, shot, handler):
    q = json.dumps
    e('physics.pause();saveGalaxy();applicationCommandTail')
    # Keep a byte-backed local file as well as metadata/preferences/Auth sentinels.
    e("""(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('galaxy-attachments',3);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
        await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put({key:'alpha-beta-sentinel',entryId:'old-star',blob:new Blob(['BETA ORIGINAL BYTES'],{type:'text/plain'})});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
        localStorage.setItem('sb-project-auth-token','BETA AUTH SENTINEL');localStorage.setItem('galaxy:navigation-ui',localStorage.getItem('galaxy:navigation-ui')||'{}');})()""")
    baseline = e('Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))')
    e('localRestoreInProgress=true;graphNeedsSave=false')
    tracker = cdp.call('Page.addScriptToEvaluateOnNewDocument', source="""
        window.alphaAccesses=[];
        const originalGet=Storage.prototype.getItem,originalSet=Storage.prototype.setItem,originalRemove=Storage.prototype.removeItem,originalOpen=indexedDB.open;
        window.alphaOriginalGet=(key)=>originalGet.call(localStorage,key);
        Storage.prototype.getItem=function(key){alphaAccesses.push(['get',key]);return originalGet.call(this,key)};
        Storage.prototype.setItem=function(key,value){alphaAccesses.push(['set',key]);return originalSet.call(this,key,value)};
        Storage.prototype.removeItem=function(key){alphaAccesses.push(['remove',key]);return originalRemove.call(this,key)};
        indexedDB.open=function(...args){alphaAccesses.push(['idb',args[0]]);return originalOpen.apply(this,args)};
        window.alphaBetaFile=async()=>{const db=await new Promise((resolve,reject)=>{const r=originalOpen.call(indexedDB,'galaxy-attachments',3);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
            const record=await new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').get('alpha-beta-sentinel');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});db.close();return record.blob.text()};
    """)['identifier']
    cdp.call('Network.setBlockedURLs', urls=['https://*'])
    cdp.requests.clear()
    cdp.call('Page.navigate', url=origin+'/alpha.html?cloudEnabled=true&mode=cloud-alpha')
    wait_for('document.readyState==="complete"&&typeof travelAlpha!=="undefined"&&alphaAuth.getState().ready')
    check(e('cosmifoldAlphaConfig.applicationMode==="cloud-alpha"&&!travelAlpha.getState().cloudEnabled&&travelAlpha.getState().status==="disabled"'), 'source Alpha ignores URL activation and stays disabled')
    check(e('travelAlpha.getState().dataset.kind==="preview"&&travelAlpha.getState().dataset.snapshot.entries.length===0&&document.getElementById("alpha-count").textContent==="0 Items"'), 'Alpha starts with a new empty preview, without loading beta Items')
    check(e('["alpha-sign-in-button","alpha-create","alpha-refresh"].every(id=>document.getElementById(id).disabled)'), 'disabled Alpha offers no active sign-in or creation')
    check(e('typeof physics==="undefined"&&typeof universeRepository==="undefined"&&typeof attachmentStore==="undefined"&&typeof localRestoreInProgress==="undefined"'), 'Alpha loads no beta editor, repository, file or Restore bootstrap')
    check(e('alphaAccesses.length===0'), 'default Alpha performs no storage or IndexedDB access')
    check(e('Object.fromEntries(Object.keys(localStorage).map(k=>[k,alphaOriginalGet(k)]))') == baseline, 'all existing beta metadata, preferences and Auth bytes remain unchanged')
    check(e('alphaBetaFile()') == 'BETA ORIGINAL BYTES', 'existing local file bytes remain readable and unchanged')
    for width, height in [(1440, 900), (390, 844), (320, 568)]:
        cdp.call('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=1, mobile=width<500)
        check(e('document.documentElement.scrollWidth<=innerWidth&&document.getElementById("alpha-create").getBoundingClientRect().height>=44'), f'{width}px Alpha shell fits without horizontal overflow')
        shot('travel-alpha-'+str(width))
    cdp.call('Page.reload', ignoreCache=True)
    wait_for('document.readyState==="complete"&&typeof travelAlpha!=="undefined"&&alphaAuth.getState().ready')
    check(e('travelAlpha.getState().status==="disabled"&&alphaAccesses.length===0&&document.getElementById("alpha-count").textContent==="0 Items"'), 'reload stays disabled and empty without reading or migrating beta data')
    check(not [r for r in cdp.requests if urlsplit(r['url']).scheme in ('http', 'https') and not r['url'].startswith(origin+'/')], 'source Alpha attempted no external SDK/Auth/cloud request')
    cdp.call('Page.removeScriptToEvaluateOnNewDocument', identifier=tracker)
    capture = cdp.call('Page.addScriptToEvaluateOnNewDocument', source="window.betaRawBeforeStartup=localStorage.getItem('galaxy:user-data');")['identifier']
    cdp.call('Page.navigate', url=origin+'/')
    load()
    e('physics.pause();localRestoreInProgress=true;graphNeedsSave=false')
    check(e('cosmosConfig.applicationMode==="local-beta"&&cosmosConfig.persistenceMode==="local"&&entries.has("old-star")'), 'returning to beta restores its original local Universe and mode')
    check(e('betaRawBeforeStartup') == baseline['galaxy:user-data'], 'beta receives byte-identical metadata before its normal layout startup saves')
    cdp.call('Page.removeScriptToEvaluateOnNewDocument', identifier=capture)

    spec = importlib.util.spec_from_file_location('travel_alpha_package', root/'scripts/prepare-alpha.py')
    package = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(package)
    with tempfile.TemporaryDirectory(prefix='cosmifold-alpha-browser-') as directory:
        output = Path(directory)/'alpha'
        files = package.prepare(output)
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(handler, directory=str(output)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        alpha_origin = f'http://127.0.0.1:{server.server_port}'
        fixture = None
        try:
            cdp.requests.clear()
            cdp.call('Page.navigate', url=alpha_origin+'/')
            wait_for('document.readyState==="complete"&&typeof travelAlpha!=="undefined"&&alphaAuth.getState().ready')
            check(e('travelAlpha.getState().status==="disabled"&&travelAlpha.getState().dataset.kind==="preview"&&alphaAuth.getState().available===false'), 'separately packaged Alpha runs with actual disabled Auth and an empty preview')
            check(e('localStorage.length===0&&document.querySelectorAll("script[src=\\"startup.js\\"],script[src=\\"script.js\\"]").length===0'), 'independent Alpha origin starts without beta storage or bootstrap')
            runtime_paths = {'/'} | {'/'+name for name in files}
            failed_assets = [{'url':r['url'],'status':r['status']} for r in cdp.responses
                             if r['url'].startswith(alpha_origin+'/') and urlsplit(r['url']).path in runtime_paths and r['status']>=400]
            check(not failed_assets, 'packaged Alpha has no failed runtime asset requests: '+q(failed_assets))

            # Enable ONLY a throwaway artifact against a synthetic SDK. No change
            # to shipped config, real Supabase, or any deployment destination.
            (output/'alpha/config.js').write_text("const cosmifoldAlphaConfig=Object.freeze({applicationMode:'cloud-alpha',cloudEnabled:true,allowedOrigin:"+q(alpha_origin)+",localBetaOrigin:"+q(origin)+",authStorageKey:'cosmifold:travel-alpha:auth:v1'});", encoding='utf-8')
            (output/'alpha/auth-config.js').write_text("const cosmifoldAuthConfig=Object.freeze({SUPABASE_URL:'https://alpha-fixture.invalid/',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_TEST_ONLY'});", encoding='utf-8')
            fixture_source = (root/'tests/travel-alpha-browser-fixture.js').read_text(encoding='utf-8')
            fixture = cdp.call('Page.addScriptToEvaluateOnNewDocument', source="if(location.origin==="+q(alpha_origin)+"){"+fixture_source+"\ndocument.addEventListener('load',event=>{if(event.target.src?.endsWith('/services/supabase-client.js'))installTravelAlphaBrowserFixture()},true);}")['identifier']
            cdp.call('Page.reload', ignoreCache=True)
            wait_for('document.readyState==="complete"&&typeof alphaFixture!=="undefined"&&alphaAuth.getState().ready')
            check(e('alphaFixture.clients===1&&alphaFixture.calls.length===0&&alphaFixture.authKey==="cosmifold:travel-alpha:auth:v1"&&travelAlpha.getState().dataset.kind==="preview"'), 'mock enabled startup uses one isolated SDK client and does not auto-discover or create')
            e('document.getElementById("alpha-email").value="a@example.invalid";document.getElementById("alpha-password").value="TEST_ONLY";document.getElementById("alpha-sign-in").requestSubmit()')
            wait_for('travelAlpha.getState().status==="no-cloud-universe"')
            check(e('travelAlpha.getState().dataset.kind==="preview"&&alphaFixture.calls.map(c=>c.name).join(",")==="cosmifold_list_universes"&&document.getElementById("alpha-password").value===""'), 'sign-in discovers owned datasets without migration, creation or automatic selection')
            e('document.getElementById("alpha-create").click()')
            wait_for('travelAlpha.getState().status==="loaded"&&!travelAlpha.getState().creating')
            check(e('travelAlpha.getState().dataset.kind==="cloud"&&travelAlpha.getState().dataset.scope.ownerUserId===alphaFixture.A&&travelAlpha.getState().dataset.revision==="0"&&travelAlpha.getState().dataset.snapshot.entries.length===0&&!travelAlpha.getState().readOnly'), 'explicit create confirms a fresh empty owned dataset through the existing gateway/workspace')
            e('window.alphaCreatedId=travelAlpha.getState().dataset.scope.universeId;document.getElementById("alpha-refresh").click()')
            wait_for('travelAlpha.getState().status==="universes-available"')
            check(e('travelAlpha.getState().dataset.kind==="preview"&&document.querySelectorAll("#alpha-datasets button").length===1'), 'refresh lists the owned Universe without silently selecting it')
            e('document.querySelector("#alpha-datasets button").click()')
            wait_for('travelAlpha.getState().status==="loaded"')
            check(e('travelAlpha.getState().dataset.scope.universeId===alphaCreatedId&&alphaFixture.calls.filter(c=>c.name==="cosmifold_create_universe").length===1'), 'explicit selection reopens the same dataset without recreating it')
            from travel_alpha_editor_browser import run_alpha_editor_checks
            run_alpha_editor_checks(cdp=cdp,e=e,check=check,wait_for=wait_for,shot=shot)
            e('document.getElementById("alpha-sign-out").click()')
            wait_for('!travelAlpha.getState().user&&!alphaAuth.getState().busy')
            check(e('travelAlpha.getState().dataset.kind==="preview"&&document.getElementById("alpha-count").textContent==="0 Items"&&document.querySelectorAll("#alpha-datasets button").length===0'), 'sign-out clears the selected dataset and controls')
            e('document.getElementById("alpha-email").value="b@example.invalid";document.getElementById("alpha-password").value="TEST_ONLY";document.getElementById("alpha-sign-in").requestSubmit()')
            wait_for('travelAlpha.getState().status==="universes-available"')
            check(e('travelAlpha.getState().user.id===alphaFixture.B&&travelAlpha.getState().dataset.kind==="preview"&&travelAlpha.getState().universes.length===1&&travelAlpha.getState().universes.every(r=>r.owner_id===alphaFixture.B)'), 'second account lists only its own Universe without displaying the first account\'s data')
            check(e('Object.keys(localStorage).every(k=>k.startsWith("cosmifold:travel-alpha:"))&&typeof travelAlpha.save==="undefined"&&!document.body.textContent.includes("TEST_ONLY_TOKEN")'), 'Alpha writes only its own namespace and exposes only allowlisted edits, without session tokens')
            check(not [r for r in cdp.requests if urlsplit(r['url']).scheme in ('http','https') and not r['url'].startswith(alpha_origin+'/')], 'packaged and mocked Alpha flows attempted no external requests')
            check(not cdp.errors, 'no Alpha runtime exceptions: '+q(cdp.errors))
        finally:
            if fixture:
                cdp.call('Page.removeScriptToEvaluateOnNewDocument', identifier=fixture)
            cdp.call('Page.navigate', url='about:blank')
            server.shutdown()
            server.server_close()
