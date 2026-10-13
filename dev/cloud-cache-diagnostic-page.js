const output=document.getElementById('output'),controls=['run','sign-out','delayed'].map(id=>document.getElementById(id));
const local=['http:','https:'].includes(location.protocol)&&['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const diagnostic=local?createCloudCacheDiagnostic({report:message=>{output.textContent+=message+'\n';},
    onIdentity:identity=>{document.getElementById('identity').textContent=`Universe: ${identity.universeId}\nCache key: ${identity.cacheKey}`;
        document.getElementById('cleanup').textContent=cloudMetadataDiagnosticCleanup(identity);document.getElementById('cleanup-section').hidden=false;}}):null;
if(!local){controls.forEach(button=>button.disabled=true);output.textContent='Development only. Open on a loopback HTTP server. No requests were made.';}
async function run(action){
    controls.forEach(button=>button.disabled=true);
    let checksAvailable=false;
    try{await diagnostic[action]();checksAvailable=action!=='signOutCheck';}
    catch(error){const safe=/^[A-Z][A-Z0-9_]{0,64}$/.test(error.code||'')?error.code:'DIAGNOSTIC_FAILED';
        output.textContent+=`STOPPED: ${safe}. Keep the test identity. Review before cleanup/reload; no mutation was retried.\n`;}
    finally{controls[0].disabled=false;controls.slice(1).forEach(button=>button.disabled=!checksAvailable);}
}
controls[0].addEventListener('click',()=>run('run'));
controls[1].addEventListener('click',()=>run('signOutCheck'));
controls[2].addEventListener('click',()=>run('delayedCheck'));
window.addEventListener('pagehide',()=>diagnostic?.dispose());
