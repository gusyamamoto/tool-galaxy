// Separate cloud cache only; never reads/writes local Cosmos or SDK Auth keys.
const cosmifoldCloudCacheFormat=(()=>{
    const contract=cosmifoldCloudContract,projection=cosmifoldCloudProjection,changes=cosmifoldCloudChanges;
    const format='cosmifold-cloud-cache',cacheVersion=1,maxCharacters=8*1024*1024;
    function error(code,reason=code){return Object.assign(new Error(`Cloud cache: ${code} (${reason}).`),
        {name:'CloudCacheError',code,reason,outcome:'not-committed',requiresReconciliation:false});}
    function scope(value){const checked=contract.scope(value);return contract.scope({ownerUserId:checked.ownerUserId.toLowerCase(),universeId:checked.universeId.toLowerCase()});}
    function keys(value,allowed,required=allowed){
        if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!allowed.includes(key)))throw error('INVALID_CACHE','SHAPE');
    }
    function metadata(snapshot,identity,revision){
        const rows=projection.toRelational(snapshot,{...identity,revision}).metadata;
        if(!changes.equal(projection.toStorageV5(rows),snapshot))throw error('INVALID_CACHE','SEMANTIC_SNAPSHOT_CONTAINS_PRESENTATION');
        return rows;
    }
    function presentation(value,rows){if(value!==null)projection.toStorageV5(rows,value);return value;}
    function validate(value,identity){
        try{
            const data=contract.json(value);keys(data,['format','cacheVersion','storageVersion','scope','writer','sequence','acknowledged','presentation','pending']);
            if(data.format!==format||data.cacheVersion!==cacheVersion||data.storageVersion!==5)throw error('INCOMPATIBLE_CACHE','VERSION');
            if(!changes.equal(data.scope,scope(identity)))throw error('INVALID_CACHE','SCOPE');
            keys(data.writer,['contextId','generation']);
            if(typeof data.writer.contextId!=='string'||!data.writer.contextId||data.writer.contextId.length>100||
                !Number.isSafeInteger(data.writer.generation)||data.writer.generation<1||!Number.isSafeInteger(data.sequence)||data.sequence<1)throw error('INVALID_CACHE','CONTROL');
            let rows=null;
            if(data.acknowledged!==null){keys(data.acknowledged,['revision','snapshot']);rows=metadata(data.acknowledged.snapshot,data.scope,contract.revision(data.acknowledged.revision));}
            if(rows)presentation(data.presentation,rows);else if(data.presentation!==null||data.pending!==null)throw error('INVALID_CACHE','MISSING_ACKNOWLEDGED_BASE');
            if(data.pending!==null){
                keys(data.pending,['pendingVersion','command','intendedSnapshot','presentation','intent']);
                if(data.pending.pendingVersion!==1)throw error('INCOMPATIBLE_CACHE','PENDING_VERSION');
                const command=contract.command(data.pending.command);
                if(!changes.equal(command.scope,data.scope)||command.baseRevision!==data.acknowledged.revision)throw error('INVALID_CACHE','PENDING_BASE');
                const intended=metadata(data.pending.intendedSnapshot,data.scope,command.baseRevision);
                if(!changes.equal(command.payload,changes.between(rows,intended)))throw error('INVALID_CACHE','PENDING_PAYLOAD');
                presentation(data.pending.presentation,intended);keys(data.pending.intent,['type','ids'],['type']);
                if(data.pending.intent.type!==command.type||Object.hasOwn(data.pending.intent,'ids')&&
                    (!Array.isArray(data.pending.intent.ids)||data.pending.intent.ids.some(id=>typeof id!=='string'||!id.trim()||id.length>150)))throw error('INVALID_CACHE','PENDING_INTENT');
            }
            return data;
        }catch(cause){if(cause.name==='CloudCacheError')throw cause;throw error('INVALID_CACHE',cause.code||'VALIDATION');}
    }
    return Object.freeze({format,cacheVersion,maxCharacters,scope,validate,error});
})();

function createCloudCacheStore({storage=()=>globalThis.localStorage,locks=globalThis.navigator?.locks}={}){
    const schema=cosmifoldCloudCacheFormat,contract=cosmifoldCloudContract,changes=cosmifoldCloudChanges;
    const key=scope=>{const s=schema.scope(scope);return `cosmifold:cloud-cache:v1:${s.ownerUserId}:${s.universeId}`;};
    function bind({scope,contextId,generation,isCurrent}){
        const identity=schema.scope(scope),cacheKey=key(identity);let expected,leased=false;
        const guard=()=>{if(!isCurrent())throw schema.error('CACHE_CONTEXT_CHANGED');};
        function read(){
            guard();let raw;
            try{raw=storage().getItem(cacheKey);}catch{guard();return {status:'unavailable',error:{code:'CACHE_READ_FAILED'}};}
            guard();expected=raw;
            if(raw===null)return {status:'missing',record:null};
            try{
                if(typeof raw!=='string'||raw.length>schema.maxCharacters)throw schema.error('INVALID_CACHE','SIZE');
                return {status:'valid',record:schema.validate(JSON.parse(raw),identity)};
            }catch(error){return {status:error.code==='INCOMPATIBLE_CACHE'?'incompatible':'invalid',error:{code:error.code||'INVALID_CACHE',reason:error.reason||'JSON'}};}
        }
        function update(transform){
            guard();if(!leased)throw schema.error('CACHE_LOCK_REQUIRED');
            let raw;try{raw=storage().getItem(cacheKey);}catch{throw schema.error('CACHE_READ_FAILED');}
            guard();if(raw!==expected)throw schema.error('CACHE_CONCURRENT_CHANGE');
            let old=null;
            if(raw!==null){try{old=schema.validate(JSON.parse(raw),identity);}catch{throw schema.error('INVALID_CACHE','PRESERVE_UNREADABLE_RECORD');}}
            const body=transform(old),next=schema.validate({format:schema.format,cacheVersion:schema.cacheVersion,storageVersion:5,scope:identity,
                writer:{contextId,generation},sequence:(old?.sequence||0)+1,...body},identity);
            const text=JSON.stringify(next);if(text.length>schema.maxCharacters)throw schema.error('CACHE_WRITE_FAILED','SIZE');
            guard();try{storage().setItem(cacheKey,text);}catch{throw schema.error('CACHE_WRITE_FAILED');}
            guard();expected=text;return next;
        }
        function ack(value){return {revision:value.universe.revision,snapshot:cosmifoldCloudProjection.toStorageV5(value)};}
        return Object.freeze({key:cacheKey,scope:identity,read,
            async exclusive(action){
                guard();if(!locks?.request)throw schema.error('CACHE_LOCK_UNAVAILABLE');
                return locks.request(cacheKey,{mode:'exclusive',ifAvailable:true},async lock=>{
                    guard();if(!lock)throw schema.error('CACHE_BUSY');leased=true;
                    try{return await action();}finally{leased=false;}
                });
            },
            refresh(metadata,presentation=null){return update(old=>{
                if(old?.pending)throw schema.error('PENDING_RECONCILIATION_REQUIRED');
                if(metadata&&old?.acknowledged&&BigInt(metadata.universe.revision)<BigInt(old.acknowledged.revision))throw schema.error('CACHE_REVISION_REGRESSION');
                return {acknowledged:metadata?ack(metadata):null,presentation:metadata?presentation:null,pending:null};
            });},
            prepare(operation){return update(old=>{
                if(!old?.acknowledged||old.pending||!changes.equal(old.acknowledged,ack(operation.base)))throw schema.error(old?.pending?'PENDING_RECONCILIATION_REQUIRED':'CACHE_BASE_CHANGED');
                return {acknowledged:old.acknowledged,presentation:old.presentation,pending:{pendingVersion:1,command:operation.command,
                    intendedSnapshot:cosmifoldCloudProjection.toStorageV5(operation.prepared.metadata),presentation:operation.prepared.presentation,intent:operation.intent}};
            });},
            accept(operation){return update(old=>{
                if(!old?.pending||!changes.equal(old.pending.command,operation.command))throw schema.error('CACHE_PENDING_CHANGED');
                return {acknowledged:ack(operation.metadata),presentation:operation.presentation,pending:null};
            });},
            reject(command){return update(old=>{
                if(!old?.pending||!changes.equal(old.pending.command,command))throw schema.error('CACHE_PENDING_CHANGED');
                return {acknowledged:old.acknowledged,presentation:old.presentation,pending:null};
            });},
            savePresentation({metadata,presentation}){return update(old=>{
                if(!old?.acknowledged||old.pending||!changes.equal(old.acknowledged,ack(metadata)))throw schema.error('CACHE_BASE_CHANGED');
                return {acknowledged:old.acknowledged,presentation,pending:null};
            });}
        });
    }
    return Object.freeze({key,bind});
}
