"""Step-6 diagnostic browser smoke. Fake Auth/SDK/remote rows; never live."""
import base64


def run_cloud_cache_checks(*,cdp,evaluate,check,wait_for,origin,screenshot_dir):
    baseline=evaluate("localStorage.getItem('galaxy:user-data')")
    preferences=evaluate("localStorage.getItem('galaxy:navigation-ui')")
    fixture="""
    if(location.pathname==='/dev/cloud-cache-diagnostic.html'){
        window.cacheFixture={clients:0,calls:[],events:[]};
        const owner='00000000-0000-4000-8000-000000000001';
        const user=()=>sessionStorage.getItem('fixture-cache-signed-out')?null:{id:owner,email:'fixture@example.invalid'};
        document.addEventListener('load',event=>{
            if(event.target.src?.endsWith('/services/supabase-auth.js')){
                createSupabaseAuthAdapter=()=>({available:true,async initialize(fn){cacheFixture.authChange=fn;return {user:user()};},
                    async signOut(){sessionStorage.setItem('fixture-cache-signed-out','yes');cacheFixture.authChange({event:'SIGNED_OUT',user:null});
                        cacheFixture.events.forEach(fn=>fn('SIGNED_OUT',null));return {user:null};},dispose(){}});
            }
            if(event.target.src?.endsWith('/services/supabase-client.js')){
                loadSupabaseAuthSDK=async()=>({createClient(){cacheFixture.clients++;
                    return {auth:{async getSession(){return {data:{session:user()?{user:user(),access_token:'PRIVATE_TEST_TOKEN'}:null},error:null};},
                        onAuthStateChange(fn){cacheFixture.events.push(fn);return {data:{subscription:{unsubscribe(){}}}};}},
                        schema(schema){return {rpc(name,params){cacheFixture.calls.push({schema,name,params});return {retry:async value=>{
                            cacheFixture.calls.at(-1).retry=value;await new Promise(resolve=>setTimeout(resolve,10));let metadata,data;
                            if(name==='cosmifold_create_universe'){
                                metadata={format:'cosmifold-cloud-metadata',projectionVersion:1,storageVersion:5,universe:{id:params.p_universe_id,owner_id:owner,revision:'0'},
                                    snapshot_fields:{connections:true,portals:true,constellations:true,archivedGalaxies:true},entries:[],constellations:[],constellation_members:[],linked_placements:[]};
                                sessionStorage.setItem('fixture-cache-server',JSON.stringify(metadata));data=metadata;
                            }else if(name==='cosmifold_read_universe'){metadata=JSON.parse(sessionStorage.getItem('fixture-cache-server'));data={status:'found',metadata};}
                            else throw Error('Unexpected RPC in cache diagnostic');
                            return {data,error:null,status:200};
                        }};}}}};
                }});
            }
        },true);
    }
    """
    cdp.call('Page.addScriptToEvaluateOnNewDocument',source=fixture)
    cdp.call('Page.navigate',url=origin+'/dev/cloud-cache-diagnostic.html')
    wait_for("document.readyState==='complete'&&typeof diagnostic!=='undefined'")
    check(evaluate('cacheFixture.clients===0&&cacheFixture.calls.length===0'), 'cache diagnostic starts without Auth SDK/session/RPC activity')
    evaluate("document.getElementById('run').click()")
    wait_for("!document.getElementById('run').disabled&&output.textContent.includes('fresh server bootstrap')")
    check(evaluate("cacheFixture.clients===1&&cacheFixture.calls.map(c=>c.name).join(',')==='cosmifold_create_universe,cosmifold_read_universe'"), 'cache diagnostic explicitly creates then reads one empty Universe through shared SDK')
    check(evaluate("(()=>{const m=JSON.parse(sessionStorage.getItem('cosmifold:dev:cloud-cache-diagnostic:v1'));const key=`cosmifold:cloud-cache:v1:${m.ownerUserId}:${m.universeId}`;const c=JSON.parse(localStorage.getItem(key));return c.cacheVersion===1&&c.acknowledged.revision==='0'&&c.pending===null})()"), 'first bootstrap writes acknowledged scoped cache and independent control version')
    cdp.call('Page.reload');wait_for("document.readyState==='complete'&&typeof diagnostic!=='undefined'")
    evaluate("document.getElementById('run').click()")
    wait_for("!document.getElementById('run').disabled&&output.textContent.includes('reopened the same scoped')")
    check(evaluate("cacheFixture.calls.length===1&&cacheFixture.calls[0].name==='cosmifold_read_universe'"), 'reload reuses same test Universe/cache and refreshes revision without recreation')
    evaluate("document.getElementById('delayed').click()")
    wait_for("!document.getElementById('run').disabled&&output.textContent.includes('ignored its late response')")
    check(evaluate("output.textContent.includes('wrote no cache changes')"), 'delayed response after closing development context is ignored and cannot cache')
    for width,height,mobile,name in [(1440,1000,False,'desktop'),(600,850,False,'narrow'),(390,844,True,'mobile')]:
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=mobile)
        check(evaluate("document.documentElement.scrollWidth<=innerWidth&&controls.every(b=>b.getBoundingClientRect().height>=44)"), 'cache diagnostic '+name+' fits and keeps comfortable buttons')
        if screenshot_dir:
            result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
            (screenshot_dir/f'cloud-cache-{name}.png').write_bytes(base64.b64decode(result['data']))
    evaluate("document.getElementById('sign-out').click()")
    wait_for("!document.getElementById('run').disabled&&output.textContent.includes('sign-out closed')")
    check(evaluate("output.textContent.includes('neither current nor prior repository')"), 'sign-out fences current and retained cached readers')
    check(evaluate("localStorage.getItem('galaxy:user-data')")==baseline and evaluate("localStorage.getItem('galaxy:navigation-ui')")==preferences, 'scoped cache/bootstrap/sign-out leaves existing local Cosmos and preferences untouched')
    check(evaluate("!document.body.textContent.includes('PRIVATE_TEST_TOKEN')"), 'cache diagnostic never displays credentials')
    check(not any('.supabase.co' in r['url'] or 'cdn.jsdelivr.net' in r['url'] for r in cdp.requests), 'cache browser smoke uses mocks with no real SDK/project requests')
    check(not cdp.errors,f'no scoped cache diagnostic browser exceptions: {cdp.errors}')
