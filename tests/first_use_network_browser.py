"""Real cold-cache requests, canonical state, delayed startup and picture resizing."""
import json
from urllib.parse import urlsplit


ARTWORK = {
    'cosmifold-astronaut-desktop.webp', 'cosmifold-astronaut-mobile.webp',
    'introduction-example.png', 'introduction-example-compact.png',
}


def run_first_use_network_checks(*, cdp, e, check, wait_for):
    q = json.dumps
    url = e('location.href')
    archived = e('localStorage.getItem("galaxy:user-data")')
    e('document.getElementById("add-entry-button").click();fields[0].value="Network returning Item";form.requestSubmit();applicationCommandTail')
    wait_for('!formSaveBusy&&!dialog.open')
    returning = e('localStorage.getItem("galaxy:user-data")')
    cdp.call('Network.enable')
    cdp.call('Network.setCacheDisabled', cacheDisabled=True)
    cdp.call('Network.setBypassServiceWorker', bypass=True)
    script = cdp.call('Page.addScriptToEvaluateOnNewDocument', source="""
        window.introNetworkReveals=[];
        new MutationObserver(()=>{
            const root=document.getElementById('first-use');
            if(root&&!root.hidden)introNetworkReveals.push(performance.now());
        }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
        // Hold the existing startup lease only in explicitly marked test loads.
        // It resumes the real implementation; production startup is not edited.
        document.addEventListener('load',event=>{
            if(location.search.includes('intro-network-hold')&&event.target.tagName==='SCRIPT'&&event.target.src.endsWith('/services/local-restore-session.js')){
                const original=createRestoreSession;
                createRestoreSession=(...args)=>{const session=original(...args);return {...session,async hold(){
                    await new Promise(resolve=>window.resumeIntroNetworkStartup=resolve);return session.hold();
                }};};
            }
        },true);
    """)['identifier']

    def frame():
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')

    def requests():
        return [urlsplit(r['url']).path.rsplit('/',1)[-1] for r in cdp.requests
                if urlsplit(r['url']).path.rsplit('/',1)[-1] in ARTWORK]

    def expected(width):
        return {'cosmifold-astronaut-mobile.webp', 'introduction-example-compact.png'} if width<=1120 else {
            'cosmifold-astronaut-desktop.webp', 'introduction-example.png'}

    def viewport(width, height):
        cdp.call('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=1, mobile=width<=1120)
        cdp.call('Emulation.setTouchEmulationEnabled', enabled=width<=1120, maxTouchPoints=5)
        frame()

    def loaded(width):
        paths = expected(width)
        wait_for('(()=>{const images=[...firstUse.root.querySelectorAll("img")];return images.every(i=>i.complete&&i.naturalWidth>0&&'+q(list(paths))+'.some(p=>i.currentSrc.endsWith(p)))})()')
        e('Promise.all([...firstUse.root.querySelectorAll("img")].map(i=>i.decode()))')

    results = []

    def cold(kind, width, height, hold=False):
        raw = returning if kind=='returning' else archived if kind=='archived' else '{invalid preserved snapshot' if kind=='corrupt' else None
        e('localRestoreInProgress=true;graphNeedsSave=false;localStorage.clear();'+
          ('localStorage.setItem("galaxy:user-data",'+q(raw)+')' if raw else ''))
        cdp.call('Page.navigate', url='about:blank')
        wait_for('location.href==="about:blank"&&document.readyState==="complete"')
        viewport(width,height)
        cdp.call('Network.clearBrowserCache')
        cdp.requests.clear()
        cdp.responses.clear()
        target = url + ('&' if '?' in url else '?') + 'intro-network-hold=1' if hold else url
        cdp.call('Page.navigate', url=target)
        if hold:
            wait_for('typeof resumeIntroNetworkStartup==="function"&&document.readyState==="complete"')
            check(not requests(), f'{kind}/{width}: unresolved startup makes zero artwork requests on a cold cache')
            check(e('document.getElementById("first-use").hidden&&typeof firstUse==="undefined"&&!document.querySelector("#first-use img[src],#first-use source[srcset]")'), f'{kind}/{width}: unresolved startup keeps intro hidden and URLs inert')
            e('resumeIntroNetworkStartup()')
        wait_for('typeof firstUse!=="undefined"&&document.readyState==="complete"')
        if kind=='first':
            loaded(width)
        e('new Promise(r=>setTimeout(r,150))')
        frame()
        names = requests()
        resources = e('performance.getEntriesByType("resource").filter(r=>'+q(list(ARTWORK))+'.some(p=>r.name.endsWith(p))).map(r=>({name:r.name.split("/").pop(),transfer:r.transferSize,encoded:r.encodedBodySize}))')
        row = {'kind':kind,'width':width,'heldStartup':hold,'requests':names,'resources':resources,
               'transferBytes':sum(r['transfer'] for r in resources),'encodedBytes':sum(r['encoded'] for r in resources)}
        results.append(row)
        print('INTRO NETWORK '+q(row), flush=True)
        if kind=='first':
            check(len(names)==2 and set(names)==expected(width), f'first/{width}: only the matching astronaut and Example Universe are requested')
            check(len(resources)==2 and all(r['transfer']>300 and r['encoded']>0 for r in resources), f'first/{width}: positive transfer bytes prove a real cold-cache image load')
            responses = [r for r in cdp.responses if urlsplit(r['url']).path.rsplit('/',1)[-1] in ARTWORK]
            check(len(responses)==2 and all(r['status']==200 and not r.get('fromDiskCache') for r in responses), f'first/{width}: images are HTTP 200 responses rather than cached or 304 results')
            check(e('!firstUse.root.hidden&&!!document.getElementById("first-use-storage").getClientRects().length&&!document.querySelector("dialog[open]")'), f'first/{width}: confirmed new user gets the complete approved intro and disclosure')
        else:
            check(not names and not resources and row['transferBytes']==0, f'{kind}/{width}: zero cold-cache first-use artwork requests and bytes')
            check(e('firstUse.root.hidden&&introNetworkReveals.length===0&&!document.querySelector("#first-use img[src],#first-use source[srcset]")'), f'{kind}/{width}: no intro flash and no active image URLs')
            if kind=='returning':
                check(e('entries.size>0&&nodes.size>0&&!document.getElementById("graph-viewport").hidden'), f'returning/{width}: ordinary Universe initialization still completes')
            elif kind=='archived':
                check(e('entries.size===0&&archivedEntries.size>0'), 'archived-only workspace preserves canonical non-first-use determination')
            elif kind=='corrupt':
                check(e('localDataRecovery&&localStorage.getItem("galaxy:user-data")==='+q(raw)), 'recovery preserves the exact corrupt snapshot and does not activate artwork')

    def resize_first(width,height):
        before = len(requests())
        viewport(width,height)
        loaded(width)
        frame()
        check(len(requests())==before+2 and set(requests())==ARTWORK, f'first-use resize to {width}: only newly needed responsive variants are fetched')
        check(e('!firstUse.root.hidden&&[...firstUse.root.querySelectorAll("img")].every(i=>i.naturalWidth>0)'), f'first-use resize to {width}: both pictures remain loaded without broken placeholders')

    try:
        cold('returning',390,844)
        cold('returning',1440,900)
        viewport(390,844)
        check(not requests(), 'returning-user resize cannot activate hidden responsive artwork')
        cold('first',1440,900)
        resize_first(390,844)
        cold('first',390,844)
        resize_first(1440,900)
        cold('first',390,844)
        before = len(requests())
        e('document.getElementById("first-use-create").click();fields[0].value="Complete first use";form.requestSubmit();applicationCommandTail')
        wait_for('!formSaveBusy&&!dialog.open')
        viewport(1440,900)
        e('new Promise(r=>setTimeout(r,150))')
        check(len(requests())==before, 'creation followed by resize does not fetch the unused desktop artwork')
        check(e('firstUse.root.hidden&&!document.querySelector("#first-use img[src],#first-use source[srcset]")'), 'first-use completion disarms both responsive pictures without changing saved onboarding semantics')
        cold('first',390,844,hold=True)
        cold('returning',1440,900,hold=True)
        cold('archived',390,844)
        cold('corrupt',1440,900)
    finally:
        cdp.call('Page.removeScriptToEvaluateOnNewDocument', identifier=script)
