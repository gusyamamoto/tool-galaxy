// Deterministic browser-managed shared/exclusive lock model; no timers or leases.
function createLockManager() {
    const names=new Map(),requests=[];
    function state(name){if(!names.has(name))names.set(name,{active:[],queue:[]});return names.get(name);}
    function drain(name){
        const s=state(name);
        while(s.queue.length){
            const next=s.queue[0];
            if(s.active.some(item=>item.mode==='exclusive')||(next.mode==='exclusive'&&s.active.length))return;
            s.queue.shift();s.active.push(next);
            const finish=()=>{s.active.splice(s.active.indexOf(next),1);drain(name);};
            Promise.resolve().then(()=>next.action({name,mode:next.mode})).then(value=>{finish();next.resolve(value);},error=>{finish();next.reject(error);});
            if(next.mode==='exclusive')return;
        }
    }
    return {requests,
        request(name,options,action){
            const mode=options.mode||'exclusive',s=state(name);requests.push({name,mode});
            if(options.ifAvailable&&(s.queue.length||s.active.some(item=>item.mode==='exclusive')||(mode==='exclusive'&&s.active.length)))
                return Promise.resolve().then(()=>action(null));
            return new Promise((resolve,reject)=>{s.queue.push({mode,action,resolve,reject});drain(name);});
        },
        held:()=>[...names.values()].reduce((total,s)=>total+s.active.length,0)
    };
}
module.exports={createLockManager};
