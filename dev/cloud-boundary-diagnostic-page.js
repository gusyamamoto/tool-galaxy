const output=document.getElementById('output'),controls=[...document.querySelectorAll('button')];
const local=['http:','https:'].includes(location.protocol)&&['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const diagnostic=local?createCloudBoundaryDiagnostic({report:message=>{output.textContent+=message+'\n';},onFixtures:records=>{
    if(!records.length){document.getElementById('cleanup-section').hidden=true;return;}
    const keys=records.map(record=>`${record.label}: owner ${record.ownerUserId}, Universe ${record.universeId}, expected revision ${record.stage}\nCache: ${record.cacheKey}`);
    const a=records.find(r=>r.label==='A1'),b=records.find(r=>r.label==='B1');
    if(a&&b)keys.push(`Foreign-scope absence probe cache: cosmifold:cloud-cache:v1:${b.ownerUserId}:${a.universeId}`);
    document.getElementById('identities').textContent=keys.join('\n\n');
    document.getElementById('cleanup').textContent=cloudBoundaryCleanup(records.map(({cacheKey,...record})=>record));document.getElementById('cleanup-section').hidden=records.length===0;
}}):null;
if(!local){controls.forEach(button=>button.disabled=true);output.textContent='Development only: open this page on localhost or 127.0.0.1. No requests were made.';}
if(local){try{diagnostic.fixtures();}catch{output.textContent+='\nSTOPPED: INVALID_BOUNDARY_MARKER. Keep storage unchanged and review.';controls.forEach(b=>b.disabled=true);}}
async function run(action){
    controls.forEach(button=>button.disabled=true);
    try{await diagnostic[action]();document.getElementById('identity-state').textContent='Completed '+action+' for the current authenticated context.';}
    catch(error){const safe=/^[A-Z][A-Z0-9_]{0,64}$/.test(error.code||'')?error.code:'DIAGNOSTIC_FAILED';
        const status=Number.isInteger(error.httpStatus)?` OpenAPI HTTP ${error.httpStatus}.`:'';
        output.textContent+=`STOPPED: ${safe}.${status} No mutation was retried. Retain fixture identities and review before continuing or cleanup.\n`;
        if(error.graphqlFailure)output.textContent+=cloudBoundaryGraphqlRejection(error)+'\n';
        if(safe==='SESSION_CHANGED'||safe==='A_FIXTURES_ALREADY_PREPARED')output.textContent+='Keep A1/A2 and storage intact. Sign in as the original A in the normal app, refresh this same diagnostic tab/origin, then use Verify existing A1/A2 (read-only). Do not rerun preparation. Stop if verification reports pending/cache/state mismatches.\n';
        if(safe==='API_SURFACE_AUDIT_REQUIRED')output.textContent+='OpenAPI discovery is restricted. Run the read-only catalog audit in this project, paste its JSON into the inventory section, then rerun button 2. Do not use a secret key.\n';}
    finally{controls.forEach(button=>button.disabled=false);}
}
document.getElementById('apply-audit').addEventListener('click',()=>{
    if(!local)return;
    try{const result=diagnostic.acceptSurfaceAudit(document.getElementById('surface-audit').value);
        document.getElementById('audit-status').textContent=`Read-only catalog inventory accepted (${result.checkedAt}; ${result.source}). HTTP checks are still required. Nothing was stored or sent.`;
    }catch(error){document.getElementById('audit-status').textContent=cloudBoundaryAuditRejection(error);}
});
for(const [id,action] of [['prepare-a','prepareA'],['verify-existing-a','verifyExistingA'],['privacy','privacy'],['arm','armAccountSwitch'],['check-b','checkB'],['finish-a','finishA']])
    document.getElementById(id).addEventListener('click',()=>run(action));
document.getElementById('apply-graphql-audit').addEventListener('click',()=>{
    if(!local)return;
    try{const result=diagnostic.acceptGraphqlAudit(document.getElementById('graphql-audit').value);
        document.getElementById('graphql-audit-status').textContent=`GraphQL catalog accepted (${result.checkedAt}); extension installed: ${result.extensionInstalled}. HTTP checks and callable-surface checks are still required. Nothing was sent or stored.`;
    }catch(error){document.getElementById('graphql-audit-status').textContent=cloudBoundaryAuditRejection(error);}
});
window.addEventListener('pagehide',()=>diagnostic?.dispose());
document.getElementById('apply-graphql-helper-audit').addEventListener('click',()=>{
    if(!local)return;
    try{const result=diagnostic.acceptGraphqlHelperAudit(document.getElementById('graphql-helper-audit').value);
        document.getElementById('graphql-helper-audit-status').textContent=`Exact stock helper inspection accepted (${result.checkedAt}; ${result.grantBodyVariant}; ${result.setBodyVariant}). Surface catalog and both HTTP caller classes still required. Nothing stored or sent.`;
    }catch(error){document.getElementById('graphql-helper-audit-status').textContent=cloudBoundaryAuditRejection(error);}
});
