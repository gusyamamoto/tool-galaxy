const recoveryOutput=document.getElementById('output'),recoveryButtons=[...document.querySelectorAll('button')];
const recoveryLocal=['http:','https:'].includes(location.protocol)&&['127.0.0.1','localhost','[::1]'].includes(location.hostname);
let recoveryBusy=false,recoveryDisposed=false;
const recoveryDiagnostic=recoveryLocal?createCloudRecoveryDiagnostic({report:text=>recoveryOutput.textContent+=text+'\n'}):null;
function recoveryIdentity(){const value=recoveryDiagnostic.identity();document.getElementById('identity').textContent=value?JSON.stringify({...value,markerKey:recoveryDiagnostic.markerKey},null,2):'No Phase C fixture.';return value;}
function recoveryControls(){recoveryButtons.forEach(button=>button.disabled=!recoveryLocal||recoveryBusy||recoveryDisposed);
    if(!recoveryLocal||recoveryBusy||recoveryDisposed)return;
    if(['cosmifold-inflight-writer','cosmifold-inflight-observer'].includes(window.name))document.getElementById('native-role').textContent='Native harness role: '+window.name.split('-').at(-1).toUpperCase()+'.';
    const m=recoveryIdentity();document.getElementById('prepare').disabled=!!m;
    const network=m?.case==='browser-offline',native=m&&cloudRecoveryPlan.nativeCase(m),late=m?.case==='late-receipt';
    document.getElementById('dispatch').disabled=m?.phase!==(native?'native-ready':network?'network-ready':'prepared');
    for(const id of ['reopen','blocked','recover','again','stale','acknowledged'])document.getElementById(id).disabled=!m||!['dispatched','uncertain'].includes(m.phase);
    for(const id of ['reopen','recover','stale','acknowledged'])if(network||native)document.getElementById(id).disabled=true;
    if(network)document.getElementById('again').disabled=true;
    document.getElementById('network-arm').disabled=!network||m.phase!=='prepared';
    document.getElementById('network-blocked').disabled=!network||m.phase!=='uncertain';
    document.getElementById('network-reopen').disabled=late||!(network||native)||m.phase!=='uncertain';
    document.getElementById('late-reopen').disabled=!late||m.phase!=='uncertain';
    document.getElementById('late-release').disabled=!late||m.visibility.state!=='observed-missing';
    document.getElementById('cleanup').disabled=!m;
}
async function recoveryAction(action){recoveryBusy=true;recoveryControls();try{await action();}
    catch(error){const code=/^[A-Z][A-Z0-9_]{0,80}$/.test(error.code||'')?error.code:'DIAGNOSTIC_FAILED';
        recoveryOutput.textContent+='STOPPED: '+code+'. Retain original fixture/journal; no mutation retried.\n';}
    finally{recoveryBusy=false;recoveryControls();}}
function recoveryClick(id,action){document.getElementById(id).addEventListener('click',()=>recoveryAction(action));}
if(recoveryLocal){
    for(const role of ['writer','observer'])recoveryClick('native-'+role,()=>{window.name='cosmifold-inflight-'+role;
        document.getElementById('native-role').textContent='Native harness role: '+role.toUpperCase()+'.';});
    recoveryClick('prepare',()=>recoveryDiagnostic.prepare(document.getElementById('test-case').value));
    recoveryClick('dispatch',()=>recoveryDiagnostic.dispatchOnce());recoveryClick('reopen',()=>recoveryDiagnostic.reopenBlocked());
    recoveryClick('network-arm',()=>recoveryDiagnostic.armBrowserOffline());recoveryClick('network-blocked',()=>recoveryDiagnostic.checkBrowserOffline());
    recoveryClick('network-reopen',()=>recoveryDiagnostic.reopenBrowserNetwork());
    recoveryClick('late-reopen',()=>recoveryDiagnostic.reopenLateReceipt());
    recoveryClick('late-release',()=>recoveryDiagnostic.releaseLateReceipt());
    recoveryClick('blocked',()=>recoveryDiagnostic.checkBlocked());recoveryClick('recover',()=>recoveryDiagnostic.recoverRealReceipt());
    recoveryClick('again',()=>recoveryDiagnostic.verifyAgain());recoveryClick('stale',()=>recoveryDiagnostic.checkStalePeer());
    recoveryClick('acknowledged',()=>recoveryDiagnostic.reopenAcknowledged());
    recoveryClick('cleanup',async()=>{document.getElementById('cleanup-sql').textContent=await recoveryDiagnostic.cleanupSQL();});
    recoveryClick('dispose',()=>{recoveryDiagnostic.dispose();recoveryDisposed=true;recoveryOutput.textContent+='DISPOSED: context closed; storage retained.\n';});
    try{recoveryControls();}catch{recoveryDisposed=true;recoveryButtons.forEach(button=>button.disabled=true);recoveryOutput.textContent='STOPPED: invalid Phase C marker; preserve storage for review.';}
}else{recoveryButtons.forEach(button=>button.disabled=true);recoveryOutput.textContent='STOPPED: loopback development only; no requests made.';}
window.addEventListener('pagehide',()=>recoveryDiagnostic?.dispose());
