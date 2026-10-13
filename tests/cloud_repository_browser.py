"""Step-5 manual-page smoke checks with a fake SDK. No project connections."""
import base64


def run_cloud_repository_checks(*, cdp, evaluate, check, wait_for, origin, screenshot_dir):
    baseline=evaluate("localStorage.getItem('galaxy:user-data')")
    preferences=evaluate("localStorage.getItem('galaxy:navigation-ui')")
    source="""
    if(location.pathname==='/dev/cloud-metadata-commit-diagnostic.html'){
        window.commitFixture={clients:0,calls:[],metadata:null,receipts:new Map()};
        const owner='00000000-0000-4000-8000-000000000001';
        document.addEventListener('load',event=>{
            if(event.target.src?.endsWith('/services/supabase-client.js')){
                loadSupabaseAuthSDK=async()=>({createClient(){
                    commitFixture.clients++;
                    return {auth:{getSession:async()=>({data:{session:{user:{id:owner},access_token:'PRIVATE_TEST_TOKEN'}},error:null}),
                        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
                        schema(schema){return {rpc(name,params){commitFixture.calls.push({schema,name,params});
                            return {retry:async retry=>{
                                commitFixture.calls.at(-1).retry=retry;
                                await new Promise(resolve=>setTimeout(resolve,15));let data;
                                if(name==='cosmifold_create_universe'){
                                    commitFixture.metadata={format:'cosmifold-cloud-metadata',projectionVersion:1,storageVersion:5,
                                        universe:{id:params.p_universe_id,owner_id:owner,revision:'0'},
                                        snapshot_fields:{connections:true,portals:true,constellations:true,archivedGalaxies:true},
                                        entries:[],constellations:[],constellation_members:[],linked_placements:[]};data=commitFixture.metadata;
                                }else if(name==='cosmifold_read_universe')data={status:'found',metadata:commitFixture.metadata};
                                else if(name==='cosmifold_commit_metadata'){
                                    const command=params.p_command;
                                    if(command.baseRevision!==commitFixture.metadata.universe.revision)return {data:null,status:400,error:{code:'CM003'}};
                                    commitFixture.metadata.entries=structuredClone(command.payload.upsert.entries);
                                    commitFixture.metadata.universe.revision='1';
                                    data={scope:command.scope,operationId:command.operationId,baseRevision:'0',revision:'1',status:'committed',replayed:false,result:null};
                                    commitFixture.receipts.set(command.operationId,data);
                                }else if(name==='cosmifold_operation_receipt')data={status:'found',request_digest:'a'.repeat(64),
                                    acknowledgement:{...commitFixture.receipts.get(params.p_operation_id),replayed:true}};
                                else throw Error('Unapproved RPC');
                                return {data:structuredClone(data),error:null,status:200};
                            }};
                        }}}};
                }});
            }
        },true);
    }
    """
    cdp.call('Page.addScriptToEvaluateOnNewDocument',source=source)
    cdp.call('Page.navigate',url=origin+'/dev/cloud-metadata-commit-diagnostic.html')
    wait_for("document.readyState==='complete'&&typeof diagnostic!=='undefined'")
    check(evaluate('!runButton.disabled&&commitFixture.clients===0&&commitFixture.calls.length===0'), 'commit diagnostic is inert until explicit Run')
    evaluate('runButton.click()');check(evaluate('runButton.disabled'), 'commit diagnostic prevents duplicate submission')
    wait_for("output.textContent.includes('COMPLETE:')")
    check(evaluate("commitFixture.clients===1&&commitFixture.metadata.universe.revision==='1'&&commitFixture.metadata.entries[0].id==='diagnostic-entry'"), 'commit diagnostic reaches revision 1 with exactly the fixed test entry through shared client')
    check(evaluate("commitFixture.calls.filter(c=>c.name==='cosmifold_commit_metadata').length===2&&commitFixture.receipts.size===1"), 'commit diagnostic issues one successful commit and one rejected stale write, with one receipt')
    check(evaluate("commitFixture.calls.filter(c=>c.name==='cosmifold_operation_receipt').length===2&&commitFixture.calls.every(c=>c.schema==='public'&&c.retry===false)"), 'commit diagnostic reconciles/checks the same receipt without mutation retries')
    check(evaluate("cleanup.textContent.includes('expected_operation')&&cleanup.textContent.includes('current_revision = 1')&&!document.body.textContent.includes('PRIVATE_TEST_TOKEN')"), 'commit diagnostic produces guarded populated-fixture cleanup without session tokens')
    check(evaluate("localStorage.getItem('galaxy:user-data')")==baseline and evaluate("localStorage.getItem('galaxy:navigation-ui')")==preferences, 'commit diagnostic does not read/alter local Cosmos metadata or preferences')
    for width,height,mobile,name in [(1440,1000,False,'desktop'),(600,850,False,'narrow'),(390,844,True,'mobile')]:
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=mobile)
        check(evaluate("document.documentElement.scrollWidth<=innerWidth&&runButton.getBoundingClientRect().height>=44"), 'commit diagnostic '+name+' fits with comfortable button')
        if screenshot_dir:
            result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
            (screenshot_dir/f'cloud-commit-{name}.png').write_bytes(base64.b64decode(result['data']))
    check(not any('.supabase.co' in r['url'] or 'cdn.jsdelivr.net' in r['url'] for r in cdp.requests), 'commit diagnostic browser smoke makes no live Supabase/CDN requests')
    check(not cdp.errors,f'no commit diagnostic browser exceptions: {cdp.errors}')
