// Same-origin loopback relay ONLY. No Auth tokens/credentials sent to the relay.
function createCloudStartBarrierClient({fetch=globalThis.fetch,now=()=>Date.now(),pause=ms=>new Promise(r=>setTimeout(r,ms)),timeoutMs=120000}={}){
    const p=cloudConcurrencyPlan;
    async function request(binding,action){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
        try{const response=await fetch('/__phase_b_barrier__',{method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal,
            headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:binding.plan,role:binding.role,contextId:binding.contextId,action})});
            p.assert(response.ok,'LOCAL_BARRIER_UNAVAILABLE');const value=await response.json();
            p.assert(value&&['waiting','confirm','scheduled','released','aborted'].includes(value.status)&&value.planId===binding.plan.planId,'LOCAL_BARRIER_RESPONSE_INVALID');return value;
        }catch(error){if(typeof error.code==='string')throw error;
            throw Object.assign(new Error('Local loopback barrier request failed'),{code:'LOCAL_BARRIER_UNAVAILABLE'});
        }finally{clearTimeout(timer);}}
    return Object.freeze({async wait(binding,onState=()=>{}){
        cloudStartBarrierPlan.validate(binding.plan);const start=now();let previous=null;
        try{p.assert(binding.isCurrent(),'CONTEXT_CHANGED');let value=await request(binding,'park');
            for(;;){p.assert(binding.isCurrent(),'CONTEXT_CHANGED');p.assert(now()-start<timeoutMs,'START_BARRIER_WAIT_EXPIRED');
                p.assert(value.status!=='aborted','START_BARRIER_ABORTED');
                if(value.status!==previous){onState(value.status);previous=value.status;}
                if(value.status==='released'){p.assert(Number.isSafeInteger(value.releasedAt)&&now()-value.releasedAt>=-250&&now()-value.releasedAt<=1500,'UNVERIFIED_START_BARRIER_LATE_RELEASE');return value;}
                await pause(100);p.assert(binding.isCurrent(),'CONTEXT_CHANGED');value=await request(binding,value.status==='confirm'?'confirm':'poll');
            }
        }catch(error){try{await request(binding,'abort');}catch{}throw error;}
    }});
}
