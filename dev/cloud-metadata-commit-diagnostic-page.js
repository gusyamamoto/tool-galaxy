const runButton=document.getElementById('run'),output=document.getElementById('output'),cleanup=document.getElementById('cleanup');
const local=['http:','https:'].includes(location.protocol)&&['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const diagnostic=local?createCloudMetadataCommitDiagnostic({
    report(message){output.textContent+=message+'\n';},
    onTestIdentity(identity){cleanup.textContent=cloudMetadataCommitDiagnosticCleanup(identity);document.getElementById('cleanup-section').hidden=false;}
}):null;
if(!local){runButton.disabled=true;output.textContent='Development/test only. Open on a loopback HTTP server. No requests were made.';}
runButton.addEventListener('click',async()=>{
    runButton.disabled=true;output.textContent='Checking commit and receipts…\n';
    try{await diagnostic.run();}
    catch(error){
        const safe=/^[A-Z][A-Z0-9_]{0,64}$/.test(error.code||'')?error.code:'DIAGNOSTIC_FAILED';
        output.textContent+=`STOPPED: ${safe}.\nKeep this page and its test UUID. A test Universe may already exist; review the result before cleanup or starting a new test. No automatic retry was made.\n`;
    }
    // One run per page avoids accidentally creating or reusing successful data.
});
window.addEventListener('pagehide',()=>diagnostic?.dispose());
