const recoveryOutput=document.getElementById('output'),recoveryButtons=[...document.querySelectorAll('button')];
const recoveryLocal=['http:','https:'].includes(location.protocol)&&['127.0.0.1','localhost','[::1]'].includes(location.hostname);
let recoveryBusy=false,recoveryDisposed=false;
const recoveryDiagnostic=recoveryLocal?createCloudRecoveryDiagnostic({report:text=>recoveryOutput.textContent+=text+'\n'}):null;
function recoveryIdentity(){const value=recoveryDiagnostic.identity();document.getElementById('identity').textContent=value?JSON.stringify({...value,markerKey:recoveryDiagnostic.markerKey},null,2):'No Phase C fixture.';return value;}
function recoveryControls(){recoveryButtons.forEach(button=>button.disabled=!recoveryLocal||recoveryBusy||recoveryDisposed);
    if(!recoveryLocal||recoveryBusy||recoveryDisposed)return;
    const m=recoveryIdentity();document.getElementById('prepare').disabled=!!m;
    const network=m?.case==='browser-offline';
    document.getElementById('dispatch').disabled=m?.phase!==(network?'network-ready':'prepared');
    for(const id of ['reopen','blocked','recover','again','stale','acknowledged'])document.getElementById(id).disabled=!m||!['dispatched','uncertain'].includes(m.phase);
    for(const id of ['reopen','recover','again','stale','acknowledged'])if(network)document.getElementById(id).disabled=true;
    document.getElementById('network-arm').disabled=!network||m.phase!=='prepared';
    document.getElementById('network-blocked').disabled=!network||m.phase!=='uncertain';
    document.getElementById('network-reopen').disabled=!network||m.phase!=='uncertain';
    document.getElementById('cleanup').disabled=!m;
}
async function recoveryAction(action){recoveryBusy=true;recoveryControls();try{await action();}
    catch(error){const code=/^[A-Z][A-Z0-9_]{0,80}$/.test(error.code||'')?error.code:'DIAGNOSTIC_FAILED';
        recoveryOutput.textContent+='STOPPED: '+code+'. Retain original fixture/journal; no mutation retried.\n';}
    finally{recoveryBusy=false;recoveryControls();}}
function recoveryClick(id,action){document.getElementById(id).addEventListener('click',()=>recoveryAction(action));}
if(recoveryLocal){
    recoveryClick('prepare',()=>recoveryDiagnostic.prepare(document.getElementById('test-case').value));
    recoveryClick('dispatch',()=>recoveryDiagnostic.dispatchOnce());recoveryClick('reopen',()=>recoveryDiagnostic.reopenBlocked());
    recoveryClick('network-arm',()=>recoveryDiagnostic.armBrowserOffline());recoveryClick('network-blocked',()=>recoveryDiagnostic.checkBrowserOffline());
    recoveryClick('network-reopen',()=>recoveryDiagnostic.reopenBrowserNetwork());
    recoveryClick('blocked',()=>recoveryDiagnostic.checkBlocked());recoveryClick('recover',()=>recoveryDiagnostic.recoverRealReceipt());
    recoveryClick('again',()=>recoveryDiagnostic.verifyAgain());recoveryClick('stale',()=>recoveryDiagnostic.checkStalePeer());
    recoveryClick('acknowledged',()=>recoveryDiagnostic.reopenAcknowledged());
    recoveryClick('cleanup',async()=>{document.getElementById('cleanup-sql').textContent=await recoveryDiagnostic.cleanupSQL();});
    recoveryClick('dispose',()=>{recoveryDiagnostic.dispose();recoveryDisposed=true;recoveryOutput.textContent+='DISPOSED: context closed; storage retained.\n';});
    try{recoveryControls();}catch{recoveryDisposed=true;recoveryButtons.forEach(button=>button.disabled=true);recoveryOutput.textContent='STOPPED: invalid Phase C marker; preserve storage for review.';}
}else{recoveryButtons.forEach(button=>button.disabled=true);recoveryOutput.textContent='STOPPED: loopback development only; no requests made.';}
window.addEventListener('pagehide',()=>recoveryDiagnostic?.dispose());
