// Advisory origin-storage estimates only. Actual writes remain authoritative.
const cosmifoldStorageCapacity = (() => {
    const MiB=1024*1024;
    const policy=Object.freeze({lowRatio:.9,lowAvailable:100*MiB,byteMultiplier:1.25,
        perFileBytes:256*1024,batchBytes:MiB,timeoutMs:1000,repeatMs:5*60*1000});
    const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
    const unknown=()=>({supported:false,usageBytes:null,quotaBytes:null,availableBytes:null,usageRatio:null});
    function normalize(value){
        if(!value||!valid(value.usage)||!valid(value.quota)||value.quota===0||value.usage>value.quota)return unknown();
        return {supported:true,usageBytes:value.usage,quotaBytes:value.quota,
            availableBytes:Math.max(0,value.quota-value.usage),usageRatio:value.usage/value.quota};
    }
    function incoming(files,{copies=false}={}){
        let bytes=0,count=0;
        for(const file of files){
            const size=copies?file?.blob?.size:file?.size;
            const thumbnail=copies?(file?.thumbnail?.size??0):0;
            if(!valid(size)||!valid(thumbnail))return null;
            bytes+=size+thumbnail;count++;
            if(!valid(bytes))return null;
        }
        if(!count)return null;
        const requiredBytes=bytes*policy.byteMultiplier+count*policy.perFileBytes+policy.batchBytes;
        return valid(requiredBytes)?{bytes,count,requiredBytes}:null;
    }
    function warning(estimate,operation){
        if(!estimate.supported)return null;
        if(operation&&operation.requiredBytes>estimate.availableBytes)return 'operation';
        return estimate.usageRatio>=policy.lowRatio&&estimate.availableBytes<=policy.lowAvailable?'low':null;
    }
    async function estimate(){
        let timer;
        try{
            const storage=globalThis.navigator?.storage;
            if(typeof storage?.estimate!=='function')return unknown();
            return normalize(await Promise.race([Promise.resolve().then(()=>storage.estimate()),
                new Promise(resolve=>{timer=setTimeout(()=>resolve(null),policy.timeoutMs);})]));
        }catch{return unknown();}finally{clearTimeout(timer);}
    }
    function create({notify=()=>{},hide=()=>{},canShow=()=>true,now=()=>Date.now()}={}){
        let version=0,last=null;
        return {
            invalidate(){version++;},
            cancel(){version++;hide();},
            dismiss(){hide();},
            failure(){version++;hide();},
            async check(files,{copies=false,isCurrent=()=>true}={}){
                const request=++version,operation=incoming(files,{copies});
                const result=await estimate();
                if(request!==version||!isCurrent()||!canShow())return;
                const kind=warning(result,operation);
                if(!kind){hide();last=null;return;}
                const time=now();
                // Re-warn later, at half the prior headroom, or for twice the incoming bytes.
                const deteriorated=last&&last.available>0&&result.availableBytes<=last.available/2;
                const larger=last&&kind==='operation'&&(operation?.requiredBytes||0)>=last.required*2;
                if(last&&time-last.time<policy.repeatMs&&!deteriorated&&!larger&&
                    (kind===last.kind||last.kind==='operation'))return;
                last={time,kind,available:result.availableBytes,required:operation?.requiredBytes||1};
                notify(kind==='operation'
                    ?`${copies?'These copies':'These selected files'} may exceed the browser storage available for Cosmifold. Saving will still be attempted. Consider downloading a backup or removing files you no longer need.`
                    :'Browser storage is getting low. Large files may not save successfully. Consider downloading a backup or removing files you no longer need.');
            }
        };
    }
    return {policy,normalize,incoming,warning,estimate,create};
})();
