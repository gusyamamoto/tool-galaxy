"""Prepared staging artifact only: real offline Auth, local synthetic data."""
import json
import re
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit


def run_staging_checks(*,cdp,evaluate,check,wait_for,add,load,origin,site_root,asset_files,cdp_class,debug_port):
    e=evaluate;q=json.dumps
    for name in asset_files(site_root):
        with urllib.request.urlopen(origin+'/'+name) as response:
            check(response.status==200,'declared staging asset resolves: '+name)
            if name.endswith('.js'):check(response.headers.get_content_type() in ['text/javascript','application/javascript'],'JavaScript MIME: '+name)
            if name.endswith('.css'):check(response.headers.get_content_type()=='text/css','CSS MIME')
            check(response.headers.get('Cache-Control')=='no-cache','revalidation header: '+name)
        if name.endswith(('.js','.html','.css')):
            source=(site_root/name).read_text(encoding='utf-8')
            check(not re.search(r'file://|https?://(?:localhost|127\.0\.0\.1|10\.\d+\.)|[A-Za-z]:\\',source),'no local-machine dependency: '+name)
    for path in ['/missing-page','/dev/cloud-recovery-diagnostic.html','/supabase/migrations/','/.git/config']:
        try:urllib.request.urlopen(origin+path)
        except urllib.error.HTTPError as error:check(error.code==404,'unpublished/unknown path is a genuine 404: '+path)
        else:check(False,'unexpected public source/SPA fallback: '+path)
    check(e('isSecureContext&&!!crypto.subtle&&typeof crypto.randomUUID==="function"&&!!navigator.locks&&storageAvailable'),'trusted local origin exercises secure-context APIs and local storage')
    wait_for('cosmifoldAuth.getState().ready')
    check(e('Object.keys(cosmifoldAuthConfig).length===0&&!cosmifoldAuth.getState().available&&document.getElementById("account-button").textContent==="Account"&&cosmosConfig.persistenceMode==="local"&&cosmosConfig.sync==="none"'),'actual staging Auth configuration is unavailable, labeled Account, and persistence remains local')
    e("document.getElementById('account-button').click()")
    check(e('document.getElementById("account-dialog").open&&cosmifoldAccountUI.mode==="unavailable"&&document.getElementById("account-email").disabled&&document.getElementById("account-submit").hidden'),'Account explains unavailable accounts without an active login form')
    e("document.getElementById('account-close').click()")
    check(e('!sampleMode&&entries.size===0&&document.getElementById("sample-utility").getClientRects().length===0'),'fresh staging has no Sample data or visible developer utility')
    root=add('Staging Galaxy');parent=add('Staging system',root);body=add('Staging item',parent);destination=add('Move destination',root)
    e(f"(async()=>{{await saveEntryContent({q(body)},c=>({{...c,notes:{{format:'plain',text:'Saved staging note'}},links:[{{id:'staging-link',url:'https://example.com/',title:'Saved link'}}]}}));await saveEntryLocation({q(body)},{{text:'Library'}});selectEntry(entries.get({q(body)}),nodes.get({q(body)}),{{openInspector:true,reframe:false}});await contentInspector.upload([new File(['Original staging bytes'],'staging.txt',{{type:'text/plain'}})]);const c=document.createElement('canvas');c.width=80;c.height=60;const blob=await new Promise(r=>c.toBlob(r,'image/png'));await contentInspector.upload([new File([blob],'staging.png',{{type:'image/png'}})]);}})()")
    wait_for('contentInspector.jobs.size===0')
    check(e('contentInspector.content().attachments.length===2&&contentInspector.status.hidden'),'Files appear immediately and saves remain silent')
    wait_for('document.querySelector("#content-media img")?.naturalWidth>0')
    check(e('document.querySelector("#content-media img").src.startsWith("blob:")'),'stored thumbnail renders through an object URL under staging CSP')
    e(f"commitConstellations(new Map([['staging-favorites',{{id:'staging-favorites',name:'Favorites',memberEntryIds:[{q(body)}],createdAt:new Date().toISOString()}}]]));renameEntry({q(body)},'Renamed staging item')")
    check(e(f'moveSidebarEntries({{ids:[{q(body)}],activeId:{q(body)}}},{q(destination)})'),'actual Move succeeds on staging storage')
    doomed=add('Delete me',root)
    e(f"requestEntryDelete({q(doomed)});document.getElementById('delete-entry-form').requestSubmit()")
    wait_for(f'!entries.has({q(doomed)})&&!deletionBusy')
    e('saveGalaxy();physics.pause()')
    persisted=e('localStorage.getItem("galaxy:user-data")')

    def retained(evaluator):
        return evaluator(f"(async()=>{{const n=entries.get({q(body)});if(!n||n.name!=='Renamed staging item'||n.parentId!=={q(destination)}||n.content.notes.text!=='Saved staging note'||n.content.links[0].title!=='Saved link'||n.location.text!=='Library'||n.content.attachments.length!==2||entries.has({q(doomed)})||!constellations.get('staging-favorites').memberEntryIds.includes(n.id))return false;for(const file of n.content.attachments){{const r=await attachmentStore.get(file.storageKey);if(!r||r.blob.size!==file.size||r.entryId!==n.id)return false;if(file.filename==='staging.txt'&&await r.blob.text()!=='Original staging bytes')return false;if(file.filename==='staging.png'&&!r.thumbnail)return false;}}return true}})()")

    for hard in [False,True]:
        cdp.call('Page.reload',ignoreCache=hard);load();e('physics.pause()')
        check(retained(e),('hard' if hard else 'ordinary')+' refresh retains hierarchy, rename, Move, deletion, Notes, Links, Location, Files and Constellations')
    # Reopen the page in another tab of the same isolated persistent profile.
    cdp.call('Page.navigate',url='about:blank')
    target=cdp.call('Target.createTarget',url='about:blank')['targetId']
    pages=json.load(urllib.request.urlopen(f'http://127.0.0.1:{debug_port}/json'))
    reopened=cdp_class(next(p['webSocketDebuggerUrl'] for p in pages if p['id']==target))
    reopened.call('Page.enable');reopened.call('Network.enable');reopened.call('Network.setBlockedURLs',urls=['https://*','http://*.supabase.co/*'])
    reopened.call('Page.navigate',url=origin)
    until=time.monotonic()+30
    while not reopened.evaluate('document.readyState==="complete"&&typeof physics!=="undefined"'):
        assert time.monotonic()<until,'reopened page did not initialize';time.sleep(.1)
    check(retained(reopened.evaluate),'reopened tab preserves local metadata and original IndexedDB bytes')
    check(not [r for r in reopened.requests if urlsplit(r['url']).scheme in ['http','https'] and not r['url'].startswith(origin+'/')],'reopened real offline Auth makes no external requests')
    reopened.sock.close();cdp.call('Target.closeTarget',targetId=target)
    cdp.call('Page.navigate',url=origin);load();e('physics.pause()')
    for width,height in [(360,800),(390,844),(430,932),(740,360),(1440,1000)]:
        mobile=width<1000
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=mobile)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=mobile,maxTouchPoints=2)
        e(f"hierarchySidebar.setCollapsed(true);selectEntry(entries.get({q(body)}),nodes.get({q(body)}),{{openInspector:true,reframe:false}});physics.pause()")
        check(e('panel.dataset.contentsState')==('browse' if mobile else 'desktop'),f'{width}: existing mobile/desktop Contents model preserved')
        check(e("document.getElementById('sample-utility').getClientRects().length===0"),f'{width}: Sample data stays out of normal UI')
    check(e('hostingViolations.length===0'),'no staging CSP violations')
    check(not [r for r in cdp.requests if urlsplit(r['url']).scheme in ['http','https'] and not r['url'].startswith(origin+'/')],'no external SDK/Auth/cloud request attempted; no Auth stub was used')
    check(not cdp.errors and not [r for r in cdp.console_errors if not r.get('url','').endswith('/favicon.ico')],'no unexpected console/runtime errors')
    check(not e('"serviceWorker" in navigator&&navigator.serviceWorker.controller!==null'),'no service worker controls this staging origin')
    # Expected failure injection is separate from the clean success/network audit.
    e('physics.pause();saveGalaxy()');persisted=e('localStorage.getItem("galaxy:user-data")')
    cdp.call('Network.setBlockedURLs',urls=['*/script.js','https://*'])
    cdp.call('Page.reload',ignoreCache=True)
    wait_for('document.readyState==="complete"&&!document.getElementById("storage-status").hidden')
    check(e('typeof physics==="undefined"&&document.getElementById("storage-status").textContent.includes("could not load")&&document.getElementById("sidebar-toggle").disabled'),'missing main script gives a useful startup failure instead of an interactive blank screen')
    check(e('localStorage.getItem("galaxy:user-data")')==persisted,'missing-script startup does not modify saved metadata')
    cdp.call('Network.setBlockedURLs',urls=['https://*']);cdp.call('Page.reload',ignoreCache=True);load()
    token=cdp.call('Page.addScriptToEvaluateOnNewDocument',source="Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError')}})")['identifier']
    cdp.call('Page.reload',ignoreCache=True)
    wait_for('document.readyState==="complete"&&!document.getElementById("storage-status").hidden')
    check(e('typeof physics==="undefined"&&document.getElementById("storage-status").textContent.includes("initialize local storage safely")'),'storage initialization failure remains explicit and safely blocks editing')
    cdp.call('Page.removeScriptToEvaluateOnNewDocument',identifier=token);cdp.call('Page.reload');load()
    check(retained(e),'saved metadata and attachments survive both injected startup failures')
