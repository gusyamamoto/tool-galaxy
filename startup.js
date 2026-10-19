// Recover an interrupted replacement before script.js can read or write the Cosmos.
(async()=>{
    let session;
    function stop(message){
        session?.release();
        const status=document.getElementById('storage-status');status.hidden=false;status.textContent=message;
        document.querySelectorAll('button,input').forEach(control=>control.disabled=true);
    }
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
        script.onerror=()=>stop('Cosmifold could not load. Check your connection and reload.');
        // Release after script.js's final pagehide save, not before it.
        script.onload=()=>window.addEventListener('pagehide',()=>session.release());document.body.append(script);
    }catch(error){
        console.error('Cosmifold startup recovery failed:',error);
        stop('Cosmifold could not initialize local storage safely. Close other Cosmifold tabs and reload before continuing.');
    }
})();
