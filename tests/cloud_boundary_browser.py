"""Phase A page smoke: fake SDK/Auth/HTTP; no real Supabase or CDN requests."""
import base64
import json


def run_cloud_boundary_checks(*, cdp, evaluate, check, wait_for, origin, root, screenshot_dir):
    baseline = evaluate("localStorage.getItem('galaxy:user-data')")
    preferences = evaluate("localStorage.getItem('galaxy:navigation-ui')")
    fixture = (root / 'tests/cloud-boundary-fixture.js').read_text(encoding='utf-8')
    source = """
    if(location.pathname==='/dev/cloud-boundary-diagnostic.html'){
        FIXTURE_SOURCE
        document.addEventListener('load',event=>{
            if(event.target.src?.endsWith('/services/supabase-client.js'))installCloudBoundaryFixture();
        },true);
    }
    """.replace('FIXTURE_SOURCE', fixture)
    cdp.call('Page.addScriptToEvaluateOnNewDocument', source=source)
    cdp.call('Page.navigate', url=origin+'/dev/cloud-boundary-diagnostic.html')
    wait_for("document.readyState==='complete'&&typeof diagnostic!=='undefined'")
    check(evaluate('boundaryFixture.clients===0&&boundaryFixture.calls.length===0'), 'Phase A page starts without SDK/session/HTTP requests')
    evaluate("document.getElementById('surface-audit').value=JSON.stringify({...boundaryFixture.audit(),privateSchemaExists:false});document.getElementById('apply-audit').click()")
    check(evaluate("document.getElementById('audit-status').textContent.includes('privateSchemaExists')&&document.getElementById('audit-status').textContent.includes('received false')"), 'inventory rejection identifies exact field and expected/actual value without requests')
    evaluate("document.getElementById('surface-audit').value=JSON.stringify([{cloud_api_surface_audit:boundaryFixture.audit()}]);document.getElementById('apply-audit').click()")
    check(evaluate("document.getElementById('audit-status').textContent.includes('inventory accepted')"), 'read-only inventory accepted without HTTP requests')

    def click(button, marker):
        evaluate(f"document.getElementById('{button}').click()")
        wait_for(f"!controls[0].disabled&&(output.textContent.includes('{marker}')||output.textContent.includes('STOPPED:'))")
        passed=evaluate("!output.textContent.includes('STOPPED:')")
        if not passed:
            raise AssertionError('Phase A '+button+': '+evaluate('output.textContent'))
        check(passed, 'Phase A '+button+' completes without a stopped check')

    click('prepare-a', 'PASS: A1/A2')
    evaluate("globalThis.recoveryMarker=sessionStorage.getItem('cosmifold:dev:cloud-boundary:v1');globalThis.recoveryCallCount=boundaryFixture.calls.length;document.getElementById('prepare-a').click()")
    wait_for("!controls[0].disabled&&output.textContent.includes('A_FIXTURES_ALREADY_PREPARED')")
    check(evaluate("boundaryFixture.calls.length===recoveryCallCount&&sessionStorage.getItem('cosmifold:dev:cloud-boundary:v1')===recoveryMarker"), 'accidental completed preparation sends no RPC and preserves marker')
    evaluate("output.textContent='';")
    click('verify-existing-a', 'verified read-only')
    check(evaluate("sessionStorage.getItem('cosmifold:dev:cloud-boundary:v1')===recoveryMarker"), 'read-only recovery verifies existing fixtures without changing marker')
    check(evaluate("[...boundaryFixture.rows.values()].map(r=>r.universe.revision).sort().join(',')==='1,2'"), 'A1/A2 have independent revisions')
    check(evaluate("new Set([...boundaryFixture.rows.values()].map(r=>r.entries[0].id)).size===1&&new Set([...boundaryFixture.rows.values()].map(r=>r.entries[0].name)).size===2"), 'same textual entry ID remains distinct by Universe')
    evaluate("globalThis.graphqlMarkerBefore=sessionStorage.getItem('cosmifold:dev:cloud-boundary:v1');boundaryFixture.graphqlState='blocked-introspection';document.getElementById('privacy').click()")
    wait_for("!controls[0].disabled&&output.textContent.includes('GRAPHQL_INTROSPECTION_BLOCKED')")
    check(evaluate("output.textContent.includes('endpoint-reachable-introspection-blocked')&&output.textContent.includes('rejected errors')&&output.textContent.includes('__schema')"), 'blocked GraphQL displays reachability and specific rejected field/error')
    check(evaluate("sessionStorage.getItem('cosmifold:dev:cloud-boundary:v1')===graphqlMarkerBefore&&boundaryFixture.rows.size===2"), 'GraphQL stop preserves A1/A2 marker and fixtures')
    evaluate("document.getElementById('graphql-audit').value=JSON.stringify([{cloud_graphql_surface_audit:boundaryFixture.graphqlAudit()}]);document.getElementById('apply-graphql-audit').click()")
    check(evaluate("document.getElementById('graphql-audit-status').textContent.includes('GraphQL catalog accepted')"), 'read-only GraphQL catalog cell/row accepted without storing credentials')
    evaluate("boundaryFixture.graphqlState='disabled-engine';output.textContent='';")
    click('privacy','disabled-independently-verified')
    check(evaluate("output.textContent.includes('GraphQL disabled, independently verified')&&sessionStorage.getItem('cosmifold:dev:cloud-boundary:v1')===graphqlMarkerBefore"), 'disabled engine proof completes only after catalog plus HTTP and preserves marker')
    live_body = json.dumps((root / 'tests/cloud-graphql-grant-body.txt').read_text(encoding='utf-8'))
    live_set_body = json.dumps((root / 'tests/cloud-graphql-set-body.txt').read_text(encoding='utf-8'))
    evaluate("document.getElementById('graphql-audit').value=JSON.stringify(boundaryFixture.stockSurfaceAudit());document.getElementById('apply-graphql-audit').click();" +
             "(()=>{const inspection=boundaryFixture.stockInspection(),body=" + live_body + ",setBody=" + live_set_body + ";inspection.exactTarget.body=body;inspection.allRelatedFunctions[0].body=body;inspection.browserGrantQualifiedFunctions[0].body=body;inspection.allRelatedFunctions[1].body=setBody;inspection.browserGrantQualifiedFunctions[1].body=setBody;document.getElementById('graphql-helper-audit').value=JSON.stringify([{cloud_graphql_helper_inspection:inspection}]);document.getElementById('apply-graphql-helper-audit').click();})();")
    check(evaluate("document.getElementById('graphql-helper-audit-status').textContent.includes('Exact stock helper inspection accepted')"), 'exact stock trigger/placeholder proof accepted through development-only input')
    check(evaluate("document.getElementById('graphql-helper-audit-status').textContent.includes('catalog-qualified-ddl-helper')"), 'pasted live qualification variant explicitly identified without a generic safety exception')
    check(evaluate("document.getElementById('graphql-helper-audit-status').textContent.includes('fixed-empty-placeholder-path')"), 'pasted live set-helper hardening variant explicitly identified with complete-body proof')
    evaluate("output.textContent='';")
    click('privacy','disabled-independently-verified')
    check(evaluate("output.textContent.includes('GraphQL disabled, independently verified')&&sessionStorage.getItem('cosmifold:dev:cloud-boundary:v1')===graphqlMarkerBefore"), 'realistic stock placeholder proof preserves current A1/A2 marker')
    evaluate("boundaryFixture.graphqlState='enabled';output.textContent='';")
    click('privacy', 'schema-inspected-private-excluded')
    check(evaluate("boundaryFixture.calls.filter(c=>c.profile==='cosmifold_private').length===192"), 'private table reads and all three write methods tested as anonymous and authenticated on all four runs')
    click('arm', 'ARMED:')
    evaluate('boundaryFixture.switchUser(boundaryFixture.B)')
    click('check-b', 'PASS: B cannot access A1/A2')
    check(evaluate('boundaryFixture.rows.size===3'), 'B gets a separate disposable Universe without A cache or pending state')
    evaluate("document.getElementById('identity-state').textContent='checking B privacy';document.getElementById('privacy').click()")
    wait_for("!controls[0].disabled&&document.getElementById('identity-state').textContent.includes('Completed privacy')")
    check(evaluate("!output.textContent.includes('STOPPED:')"), 'B HTTP privacy check succeeds independently')
    evaluate('boundaryFixture.switchUser(boundaryFixture.A)')
    click('finish-a', 'COMPLETE: identity/Universe')
    check(evaluate("document.getElementById('cleanup').textContent.includes('test_universes_removed')&&document.getElementById('cleanup').textContent.includes('r.request_digest=encode(sha256')"), 'guarded cleanup includes exact request digests and explicit confirmation')
    check(evaluate("!document.body.textContent.includes('FIXTURE_PRIVATE_TOKEN')"), 'no session token appears in diagnostic or cleanup output')
    check(evaluate("localStorage.getItem('galaxy:user-data')")==baseline and evaluate("localStorage.getItem('galaxy:navigation-ui')")==preferences, 'identity/privacy diagnostics leave the local Cosmos and preferences unchanged')
    for width,height,mobile,name in [(1440,1000,False,'desktop'),(600,850,False,'narrow'),(390,844,True,'mobile')]:
        cdp.call('Emulation.setDeviceMetricsOverride', width=width,height=height,deviceScaleFactor=1,mobile=mobile)
        check(evaluate("document.documentElement.scrollWidth<=innerWidth&&controls.every(b=>b.getBoundingClientRect().height>=44)"), 'Phase A '+name+' has no overflow and comfortable controls')
        if screenshot_dir:
            result=cdp.call('Page.captureScreenshot',format='png',captureBeyondViewport=False)
            (screenshot_dir/f'cloud-boundary-{name}.png').write_bytes(base64.b64decode(result['data']))
    check(not any('.supabase.co' in r['url'] or 'cdn.jsdelivr.net' in r['url'] for r in cdp.requests), 'Phase A browser test made no real project/CDN requests')
    check(not cdp.errors, f'no Phase A browser exceptions: {cdp.errors}')
