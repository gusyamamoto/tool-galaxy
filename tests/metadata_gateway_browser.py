"""Dev diagnostic browser smoke checks. Fake SDK/HTTP only, never live Supabase."""
import base64
import json


def run_metadata_gateway_checks(*, cdp, evaluate, check, wait_for, origin, root, screenshot_dir):
    baseline = evaluate("localStorage.getItem('galaxy:user-data')")
    preferences = evaluate("localStorage.getItem('galaxy:navigation-ui')")
    source = """
    if(location.pathname==='/dev/cloud-metadata-diagnostic.html'){
        window.gatewayFixture={clients:0,calls:[],anonymous:[],created:false};
        const owner='00000000-0000-4000-8000-000000000001';
        const nativeFetch=window.fetch;
        window.fetch=async(url,options)=>{
            if(!url.includes('/rest/v1/rpc/'))return nativeFetch(url,options);
            gatewayFixture.anonymous.push({url,authorization:options.headers.Authorization||options.headers.authorization||null,credentials:options.credentials});
            return {status:401,json:async()=>({code:'42501'})};
        };
        document.addEventListener('load',event=>{
            if(event.target.src?.endsWith('/services/supabase-client.js')){
                loadSupabaseAuthSDK=async()=>({createClient(){
                    gatewayFixture.clients++;
                    return {auth:{getSession:async()=>({data:{session:{user:{id:owner},access_token:'PRIVATE_TEST_TOKEN'}},error:null}),
                        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
                        schema(schema){return {rpc(name,params){gatewayFixture.calls.push({schema,name,params});
                            return {retry:async value=>{
                                gatewayFixture.calls.at(-1).retry=value;
                                await new Promise(resolve=>setTimeout(resolve,20));
                                const universe={id:gatewayFixture.universeId,owner_id:owner,revision:'0'};
                                let data;
                                if(name==='cosmifold_list_universes')data=gatewayFixture.created?[universe]:[];
                                else{
                                    if(name==='cosmifold_create_universe'){
                                        gatewayFixture.created=true;gatewayFixture.universeId=params.p_universe_id;
                                        universe.id=params.p_universe_id;
                                    }
                                    const metadata={format:'cosmifold-cloud-metadata',projectionVersion:1,storageVersion:5,universe,
                                        snapshot_fields:{connections:true,portals:true,constellations:true,archivedGalaxies:true},
                                        entries:[],constellations:[],constellation_members:[],linked_placements:[]};
                                    data=name==='cosmifold_read_universe'?{status:'found',metadata}:metadata;
                                }
                                return {data,error:null,status:200};
                            }};
                        }}}};
                }});
            }
        },true);
    }
    """
    cdp.call('Page.addScriptToEvaluateOnNewDocument', source=source)
    cdp.call('Page.navigate', url=origin+'/dev/cloud-metadata-diagnostic.html')
    wait_for("document.readyState==='complete'&&typeof diagnostic!=='undefined'")
    check(evaluate("!runButton.disabled&&gatewayFixture.clients===0&&gatewayFixture.calls.length===0&&gatewayFixture.anonymous.length===0"), 'dev diagnostic starts without SDK/session/RPC activity')
    evaluate('runButton.click()')
    check(evaluate('runButton.disabled'), 'dev diagnostic prevents duplicate submissions while running')
    wait_for("!runButton.disabled&&output.textContent.includes('COMPLETE:')")
    check(evaluate("gatewayFixture.clients===1&&gatewayFixture.calls.map(c=>c.name).join(',')==='cosmifold_list_universes,cosmifold_create_universe,cosmifold_list_universes,cosmifold_read_universe'"), 'dev diagnostic completes list/create/read through one shared SDK client')
    check(evaluate("gatewayFixture.calls.every(c=>c.schema==='public'&&c.retry===false)&&gatewayFixture.anonymous.length===2&&gatewayFixture.anonymous.every(c=>!c.authorization&&c.credentials==='omit')"), 'dev diagnostic separates anonymous HTTP probes and disables authenticated RPC retries')
    check(evaluate("!document.body.textContent.includes('PRIVATE_TEST_TOKEN')&&!document.getElementById('cleanup-section').hidden&&cleanup.textContent.includes(gatewayFixture.universeId)&&cleanup.textContent.includes('u.revision = 0')"), 'dev diagnostic displays safe results and guarded exact-UUID cleanup')
    check(evaluate("localStorage.getItem('galaxy:user-data')")==baseline and evaluate("localStorage.getItem('galaxy:navigation-ui')")==preferences, 'dev diagnostic leaves local metadata and preferences untouched')
    for width, height, mobile, name in [(1440,1000,False,'desktop'), (600,850,False,'narrow'), (390,844,True,'mobile')]:
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=mobile)
        check(evaluate("document.documentElement.scrollWidth<=innerWidth&&runButton.getBoundingClientRect().height>=44"), 'dev diagnostic '+name+' fits and has a comfortable Run button')
        if screenshot_dir:
            result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
            (screenshot_dir/f'metadata-diagnostic-{name}.png').write_bytes(base64.b64decode(result['data']))
    evaluate('runButton.click()');wait_for("!runButton.disabled&&output.textContent.includes('COMPLETE:')")
    check(evaluate("(()=>{const calls=gatewayFixture.calls.filter(c=>c.name==='cosmifold_create_universe');return calls.length===2&&calls[0].params.p_universe_id===calls[1].params.p_universe_id})()"), 'dev diagnostic deliberate rerun reuses its test UUID')
    check(not any('.supabase.co' in request['url'] or 'cdn.jsdelivr.net' in request['url'] for request in cdp.requests), 'dev diagnostic browser smoke uses mocks with no real project or CDN requests')
    check(not cdp.errors, f'no dev diagnostic browser exceptions: {cdp.errors}')
