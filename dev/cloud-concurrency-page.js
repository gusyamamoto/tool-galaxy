const phaseBOutput=document.getElementById('output'),phaseBControls=[...document.querySelectorAll('button')];
const phaseBLocal=['http:','https:'].includes(location.protocol)&&['127.0.0.1','localhost','[::1]'].includes(location.hostname);
let phaseBBusy=false,phaseBMarker=null;
function phaseBEnableControls(){
    phaseBControls.forEach(b=>b.disabled=!phaseBLocal||phaseBBusy);
    document.getElementById('concurrent-ticket').disabled=true;
    document.getElementById('concurrent-arm').disabled=true;
    if(!phaseBLocal||phaseBBusy||!phaseBMarker)return;
    const m=phaseBMarker,kind=document.getElementById('case').value;
    document.getElementById('prepare').disabled=true;document.getElementById('join').disabled=true;
    document.getElementById('ticket').disabled=m.role!=='left'||!!m.attempts[kind]||kind==='identical'&&(!m.verified.race||!document.getElementById('readiness-json').value.trim());
    document.getElementById('arm').disabled=!!m.attempts[kind]||kind==='identical'&&!m.verified.race;
    document.getElementById('readiness').disabled=kind!=='identical'||!m.verified.race||!!m.attempts.identical;
    document.getElementById('verify').disabled=!m.attempts[kind]?.observation;
    document.getElementById('recover-identical').disabled=!m.verified.race||!!m.verified.identical;
    document.getElementById('replay-identical').disabled=m.role!=='right'||!m.verified.identicalCommitted||!!m.attempts.identical||!!m.attempts.identicalReplay;
    const r=m.attempts.concurrentRecovery,eligible=m.verified.race&&m.verified.identicalCommitted&&!m.attempts.identicalReplay;
    document.getElementById('concurrent-prepare').disabled=m.role!=='left'||!eligible||!!r;
    document.getElementById('concurrent-join').disabled=m.role!=='right'||!eligible||!!r;
    document.getElementById('concurrent-ready').disabled=!r||!!r.dispatch;
    // Retired: manual-copy deadlines can strand one client after the other commits.
    // Historical methods remain solely for inspection/reproduction tests.
    document.getElementById('concurrent-ticket').disabled=true;
    document.getElementById('concurrent-arm').disabled=true;
    document.getElementById('concurrent-audit').disabled=!r||!!m.verified.concurrentRecovery;
    document.getElementById('concurrent-verify').disabled=!r?.dispatch?.observation;
    document.getElementById('concurrent-cleanup').disabled=!r;
    if(r)for(const id of ['ticket','arm','verify','readiness','recover-identical','replay-identical','reuse','hold','advance','refresh','release','lock-scripts','verify-lock','complete','cleanup'])document.getElementById(id).disabled=true;
    const b=m.attempts.startBarrier;
    document.getElementById('barrier-prepare').disabled=m.role!=='left'||!m.verified.concurrentRecoveryCommitted||!!b;
    document.getElementById('barrier-join').disabled=m.role!=='right'||!m.verified.concurrentRecoveryCommitted||!!b;
    document.getElementById('barrier-park').disabled=!b||!!b.dispatch;
    document.getElementById('barrier-verify').disabled=!b?.dispatch?.observation;
    document.getElementById('barrier-reuse').disabled=!m.verified.startBarrier||!!b?.reuse;
    for(const id of ['barrier-lock-scripts','barrier-verify-lock'])document.getElementById(id).disabled=m.role!=='left'||!m.verified.startBarrier||!m.verified.barrierReuse;
    document.getElementById('barrier-cleanup').disabled=!b;
    const fencing=b?.fencing;
    document.getElementById('barrier-hold').disabled=m.role!=='left'||!m.verified.barrierLocking||!!fencing;
    document.getElementById('barrier-refresh').disabled=m.role!=='left'||fencing?.phase!=='held';
    document.getElementById('barrier-release').disabled=m.role!=='left'||fencing?.phase!=='refreshed';
    document.getElementById('barrier-complete').disabled=m.role!=='left'||!m.verified.barrierFencing||!m.verified.barrierLocking;
    if(b)for(const id of ['concurrent-prepare','concurrent-join','concurrent-ready','concurrent-verify','concurrent-audit','concurrent-cleanup'])document.getElementById(id).disabled=true;
    if(['held','refreshed'].includes(fencing?.phase)){
        const allowed=fencing.phase==='held'?'barrier-refresh':'barrier-release';
        phaseBControls.forEach(button=>{if(button.id!==allowed)button.disabled=true;});
    }
}
const phaseB=phaseBLocal?createCloudConcurrencyDiagnostic({report:text=>phaseBOutput.textContent+=text+'\n',onState:m=>{
    phaseBMarker=m;
    document.getElementById('fixture').value=JSON.stringify(m.fixture,null,2);
    const kind=document.getElementById('case').value,o=m.attempts[kind]?.observation;
    document.getElementById('observation').value=o?JSON.stringify(o,null,2):'';
    document.getElementById('case-status').textContent=`This ${m.role.toUpperCase()} context: competing race ${m.verified.race?'VERIFIED':'NOT VERIFIED'}; identical concurrency ${m.verified.identical?'VERIFIED':'UNVERIFIED'}.`;
    const r=m.attempts.concurrentRecovery;
    if(r){document.getElementById('concurrent-plan').value=JSON.stringify(r.plan,null,2);
        document.getElementById('concurrent-observation').value=r.dispatch?.observation?JSON.stringify(r.dispatch.observation,null,2):'';
        document.getElementById('case-status').textContent+=` Fresh recovery concurrency ${m.verified.concurrentRecovery?'VERIFIED':'NOT VERIFIED'}.`;
        if(m.verified.concurrentRecoveryCommitted)document.getElementById('case-status').textContent+=' Existing LEFT commit/receipt VERIFIED read-only at revision 4.';}
    const b=m.attempts.startBarrier;
    if(b){document.getElementById('barrier-plan').value=JSON.stringify(b.plan,null,2);
        document.getElementById('barrier-observation').value=b.dispatch?.observation?JSON.stringify(b.dispatch.observation,null,2):'';
        document.getElementById('case-status').textContent+=` Coordinated barrier test ${m.verified.startBarrier?'VERIFIED':'NOT VERIFIED'}.`;
        if(m.verified.barrierReuse)document.getElementById('case-status').textContent+=' Changed-content barrier ID reuse VERIFIED (rejected).';}
    if(m.verified.barrierLocking)document.getElementById('case-status').textContent+=' Independent SQL locking VERIFIED at revision 5.';
    if(m.verified.barrierFencing)document.getElementById('case-status').textContent+=' Delayed receipt fencing VERIFIED at revision 5.';
    phaseBEnableControls();
}}):null;
if(!phaseBLocal){phaseBControls.forEach(b=>b.disabled=true);phaseBOutput.textContent='STOPPED: loopback development only. No requests made.';}
else{const other=new URL(location.origin);other.hostname=location.hostname==='localhost'?'127.0.0.1':'localhost';document.getElementById('right-origin').value=other.origin;
    try{phaseB.fixtures();}catch{phaseBControls.forEach(b=>b.disabled=true);phaseBOutput.textContent='STOPPED: invalid Phase B marker. Keep identities/storage unchanged for review.';}}
async function phaseBRun(action){phaseBBusy=true;phaseBEnableControls();try{await action();}
    catch(error){const code=/^[A-Z][A-Z0-9_]{0,80}$/.test(error.code||'')?error.code:'DIAGNOSTIC_FAILED';
        phaseBOutput.textContent+=(code.startsWith('UNVERIFIED')?'UNVERIFIED: ':'STOPPED: ')+code+'. No mutation retried. Retain fixture/operation identities; do not reset storage.\n';}
    finally{phaseBBusy=false;phaseBEnableControls();}}
function phaseBClick(id,action){document.getElementById(id).addEventListener('click',()=>phaseBRun(action));}
phaseBClick('prepare',()=>phaseB.prepare(document.getElementById('right-origin').value.trim()));
phaseBClick('join',()=>phaseB.join(document.getElementById('join-fixture').value));
phaseBClick('readiness',async()=>{document.getElementById('readiness-json').value=JSON.stringify(await phaseB.readiness('identical'),null,2);});
phaseBClick('ticket',async()=>{const t=await phaseB.makeTicket(document.getElementById('case').value,45000,document.getElementById('readiness-json').value||null);document.getElementById('ticket-json').value=JSON.stringify(t,null,2);});
phaseBClick('arm',async()=>{const o=await phaseB.arm(document.getElementById('ticket-json').value);document.getElementById('observation').value=JSON.stringify(o,null,2);});
phaseBClick('verify',()=>phaseB.verify(document.getElementById('case').value,document.getElementById('peer').value));
phaseBClick('recover-identical',()=>phaseB.recoverIdentical(document.getElementById('recovery-json').value));
phaseBClick('replay-identical',()=>phaseB.replayCommittedIdentical());
phaseBClick('concurrent-prepare',async()=>{document.getElementById('concurrent-plan').value=JSON.stringify(await phaseB.prepareConcurrent(),null,2);});
phaseBClick('concurrent-join',()=>phaseB.joinConcurrent(document.getElementById('concurrent-plan').value));
phaseBClick('concurrent-ready',async()=>{document.getElementById('concurrent-ready-json').value=JSON.stringify(await phaseB.concurrentReady(),null,2);});
phaseBClick('concurrent-verify',()=>phaseB.verifyConcurrent(document.getElementById('concurrent-peer').value));
phaseBClick('concurrent-audit',()=>phaseB.auditConcurrentCommit(document.getElementById('concurrent-audit-observation').value||null));
phaseBClick('concurrent-cleanup',async()=>{const s=await phaseB.inspectConcurrentFixture();
    document.getElementById('cleanup-sql').textContent=cloudConcurrentRecoveryCleanup(s.plan,s.stage);
    document.getElementById('cleanup-identities').textContent=`Recovery owner ${s.fixture.scope.ownerUserId}\nSame Universe ${s.fixture.scope.universeId}\nExpected revision ${s.stage}\nFresh operation ${s.plan.operationId}\nExact cache key ${s.cacheKey} at BOTH origins\nExact session marker ${s.markerKey}\nClose BOTH diagnostics before manual cleanup. Require test_universes_removed = 1; only then remove these exact keys.`;});
phaseBClick('barrier-prepare',()=>phaseB.prepareBarrier());
phaseBClick('barrier-join',()=>phaseB.joinBarrier(document.getElementById('barrier-plan').value));
phaseBClick('barrier-park',()=>phaseB.parkBarrier());
phaseBClick('barrier-verify',()=>phaseB.verifyBarrier(document.getElementById('barrier-peer').value));
phaseBClick('barrier-reuse',()=>phaseB.rejectBarrierReuse());
phaseBClick('barrier-lock-scripts',async()=>{const sql=await phaseB.barrierLockScripts();document.getElementById('barrier-holder-sql').textContent=sql.holder;
    document.getElementById('barrier-waiter-sql').textContent=sql.waiter;});
phaseBClick('barrier-verify-lock',()=>phaseB.verifyBarrierLocking(document.getElementById('barrier-lock-evidence').value));
phaseBClick('barrier-hold',()=>phaseB.holdBarrierReceipt());
phaseBClick('barrier-refresh',()=>phaseB.refreshBarrierContext());
phaseBClick('barrier-release',()=>phaseB.releaseBarrierReceipt());
phaseBClick('barrier-complete',()=>phaseB.completeBarrier());
phaseBClick('barrier-cleanup',async()=>{const s=await phaseB.inspectBarrierFixture();document.getElementById('cleanup-sql').textContent=cloudStartBarrierCleanup(s.plan,s.stage);
    document.getElementById('cleanup-identities').textContent=`Same owner ${s.fixture.scope.ownerUserId}\nSame Universe ${s.fixture.scope.universeId}\nExpected revision ${s.stage}\nFresh barrier operation ${s.plan.operationId}\nExact scoped cache ${s.cacheKey} at BOTH origins\nExact session marker ${s.markerKey}\nClose BOTH diagnostics before manual cleanup. Require test_universes_removed = 1. Remove only these keys after confirmed SQL cleanup.`;});
phaseBClick('reuse',()=>phaseB.reusedOperation());phaseBClick('hold',()=>phaseB.holdOldReceipt());phaseBClick('advance',()=>phaseB.advance());
phaseBClick('refresh',()=>phaseB.refreshNewer());phaseBClick('release',()=>phaseB.releaseOld());
phaseBClick('lock-scripts',async()=>{const state=await phaseB.finalState(),sql=cloudConcurrencyLockScripts(state.fixture,state.winner);
    document.getElementById('holder-sql').textContent=sql.holder;document.getElementById('waiter-sql').textContent=sql.waiter;phaseBOutput.textContent+='UNVERIFIED: scripts generated only; no SQL was executed. Run manual independent-session checks.\n';});
phaseBClick('verify-lock',()=>phaseB.verifyLocking(document.getElementById('lock-evidence').value));phaseBClick('complete',()=>phaseB.complete());
phaseBClick('cleanup',async()=>{const state=await phaseB.inspectFixture();document.getElementById('cleanup-sql').textContent=cloudConcurrencyCleanup(state.fixture,state.stage,state.winner);
    document.getElementById('cleanup-identities').textContent=`Owner ${state.fixture.scope.ownerUserId}\nUniverse ${state.fixture.scope.universeId}\nExpected revision ${state.stage}\nAfter confirmed SQL cleanup, remove ONLY:\nAt ${state.fixture.leftOrigin} AND ${state.fixture.rightOrigin}:\nlocalStorage key ${state.cacheKey}\nsessionStorage key ${state.markerKey}\nRequire test_universes_removed = 1, both cache reads null and both marker reads null.`;});
document.getElementById('case').addEventListener('change',()=>{if(phaseBLocal)phaseB.fixtures();});
document.getElementById('readiness-json').addEventListener('input',phaseBEnableControls);
document.getElementById('concurrent-ready-json').addEventListener('input',phaseBEnableControls);
window.addEventListener('pagehide',()=>phaseB?.dispose());
