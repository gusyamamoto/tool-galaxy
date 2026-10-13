// Local-only page controller. Render text, never raw SDK objects, tokens or errors.
const runButton=document.getElementById('run'),output=document.getElementById('output'),cleanup=document.getElementById('cleanup');
const local=['http:','https:'].includes(location.protocol)&&['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const diagnostic=local?createCloudMetadataDiagnostic({
    report(message){output.textContent+=message+'\n';},
    onTestIdentity(identity){cleanup.textContent=cloudMetadataDiagnosticCleanup(identity);document.getElementById('cleanup-section').hidden=false;}
}):null;
if(!local){runButton.disabled=true;output.textContent='Development/test only. Open this page on a loopback HTTP server. No requests were made.';}
runButton.addEventListener('click',async()=>{
    runButton.disabled=true;output.textContent='Checking the real RPC boundary…\n';
    try{await diagnostic.run();}
    catch(error){
        // Error codes come from this diagnostic/gateway, not arbitrary server text.
        const safe=/^[A-Z][A-Z0-9_]{0,64}$/.test(error.code||'')?error.code:'DIAGNOSTIC_FAILED';
        output.textContent+=`STOPPED: ${safe}.\n`;
        if(error.requiresReconciliation)output.textContent+='The create outcome is uncertain. Keep the test UUID below; inspect/read that same UUID before deciding to retry. No automatic retry was made.\n';
        else if(['UNAUTHENTICATED','SIGN_IN_LOCALLY_FIRST'].includes(safe))output.textContent+='Sign in in the normal Cosmifold tab at this same local origin, then run again.\n';
        else output.textContent+='Do not change grants, expose private tables or paste tokens to bypass a failure. Review this result first.\n';
    }finally{runButton.disabled=false;}
});
window.addEventListener('pagehide',()=>diagnostic?.dispose());
