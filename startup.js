// Recover an interrupted replacement before script.js can read or write the Cosmos.
(async()=>{
    let session;
    try{
        const sample=galaxySample.isRequested(location.search);
        const persistence=createPersistence({sample,sampleSnapshot:sample?galaxySample.build():null});
        session=createRestoreSession(persistence.scope);await session.hold();
        if(!sample&&persistence.metadata.readRestoreJournal())await session.exclusive(()=>createUniverseRepository({persistence}).recoverPendingRestore());
        globalThis.cosmifoldStartupPersistence=persistence;globalThis.cosmifoldRestoreSession=session;
        window.addEventListener('pageshow',event=>{if(event.persisted){
            if(typeof localRestoreInProgress!=='undefined')localRestoreInProgress=true;
            document.documentElement.inert=true;location.reload();
        }});
        const script=document.createElement('script');script.src='script.js';
        // Release after script.js's final pagehide save, not before it.
        script.onload=()=>window.addEventListener('pagehide',()=>session.release());document.body.append(script);
    }catch(error){
        session?.release();
        console.error('Cosmifold startup recovery failed:',error);
        const status=document.getElementById('storage-status');status.hidden=false;
        status.textContent='Cosmifold could not initialize local storage safely. Close other Cosmifold tabs and reload before continuing.';
        document.querySelectorAll('button,input').forEach(control=>control.disabled=true);
    }
})();
