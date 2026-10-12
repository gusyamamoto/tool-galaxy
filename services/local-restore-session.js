// One shared Web Lock per open workspace; Restore needs exclusive access.
// This avoids replacing persisted data beneath another tab's runtime graph.
function createRestoreSession(scope=null,locks=globalThis.navigator?.locks){
    const name=`cosmifold-workspace:${JSON.stringify(scope)}`;let release,held;
    const supported=!!locks;
    async function hold(){
        if(!supported)return;
        await new Promise((ready,reject)=>{
            held=locks.request(name,{mode:'shared'},()=>new Promise(resolve=>{release=resolve;ready();}));held.catch(reject);
        });
    }
    async function exclusive(action,{readRevision}={}){
        if(!supported)throw new Error('Safe Restore requires a browser with Web Locks on HTTPS or localhost.');
        const previous=readRevision?await readRevision():null;
        release?.();await held;
        let failure,result;
        try{result=await locks.request(name,{mode:'exclusive',ifAvailable:true},lock=>{
            if(!lock)throw new Error('Close other Cosmifold tabs for this workspace, then try Restore again.');return action();
        });}catch(error){failure=error;}
        await hold();
        // Two tabs can both release their shared locks to request Restore. The
        // losing tab must not resume its obsolete graph if the winner committed.
        if(failure&&readRevision&&!failure.recoveryRequired){
            try{
                if(await readRevision()!==previous){const error=new Error('Another Cosmifold tab restored data. Reload before continuing.');error.reinitializationRequired=true;throw error;}
            }catch(error){error.reinitializationRequired=true;throw error;}
        }
        if(failure)throw failure;return result;
    }
    return {supported,hold,exclusive,release:()=>release?.()};
}
