// Future cloud interfaces only. This module performs no persistence or networking.
const cosmifoldCloudContract = (()=>{
    const outcomes=Object.freeze({INVALID_METADATA:'not-committed',UNSUPPORTED_VERSION:'not-committed',
        UNSUPPORTED_ATTACHMENTS:'not-committed',UNSUPPORTED_CAPABILITY:'not-committed',INVALID_COMMAND:'not-committed',
        UNAUTHENTICATED:'not-committed',FORBIDDEN:'not-committed',REVISION_CONFLICT:'not-committed',
        OUTCOME_UNKNOWN:'unknown',INVALID_ACKNOWLEDGEMENT:'unknown'});
    class CloudMetadataError extends Error {
        constructor(code,path=''){
            if(!Object.hasOwn(outcomes,code))throw new TypeError('Unknown cloud error code.');
            super(`Cloud metadata: ${code}${path?' at '+path:''}.`);
            this.name='CloudMetadataError';this.code=code;this.path=path;
            this.outcome=outcomes[code];this.requiresReconciliation=this.outcome==='unknown';
        }
    }
    const fail=(code,path)=>{throw new CloudMetadataError(code,path);};
    const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    function revision(value){
        if(typeof value!=='string'||! /^(0|[1-9][0-9]{0,18})$/.test(value)||BigInt(value)>9223372036854775807n)fail('INVALID_COMMAND','revision');
        return value;
    }
    function scope(value){
        if(!value||!uuid(value.ownerUserId)||!uuid(value.universeId))fail('INVALID_COMMAND','scope');
        // An owner may have any number of Universes. Scope always needs both IDs.
        return Object.freeze({ownerUserId:value.ownerUserId,universeId:value.universeId});
    }
    // Shared strict JSON check: no getters, executable values, cycles, unsafe keys,
    // nonfinite numbers or silent JSON.stringify omissions. Ordinary aliases are OK.
    function json(value,path='metadata'){
        const active=new WeakSet();let nodes=0;
        function visit(node,at,depth){
            if(++nodes>1000000||depth>100)fail('INVALID_METADATA',at);
            if(node===null||typeof node==='string'||typeof node==='boolean')return node;
            if(typeof node==='number'){if(!Number.isFinite(node))fail('INVALID_METADATA',at);return node;}
            if(typeof node!=='object'||active.has(node))fail('INVALID_METADATA',at);
            const prototype=Object.getPrototypeOf(node);
            if(!Array.isArray(node)&&prototype!==null&&Object.getPrototypeOf(prototype)!==null)fail('INVALID_METADATA',at);
            if(Object.getOwnPropertySymbols(node).length)fail('INVALID_METADATA',at);
            active.add(node);
            const copy=Array.isArray(node)?[]:{};
            const keys=Object.getOwnPropertyNames(node);
            if(Array.isArray(node)&&keys.length!==node.length+1)fail('INVALID_METADATA',at);
            for(const key of keys){
                if(Array.isArray(node)&&key==='length')continue;
                if(Array.isArray(node)&&(! /^(0|[1-9][0-9]*)$/.test(key)||!Number.isSafeInteger(Number(key))||Number(key)>=node.length))fail('INVALID_METADATA',at);
                const descriptor=Object.getOwnPropertyDescriptor(node,key);
                if(['__proto__','prototype','constructor'].includes(key)||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('INVALID_METADATA',at);
                copy[key]=visit(descriptor.value,at+'.'+key,depth+1);
            }
            active.delete(node);
            return copy;
        }
        return visit(value,path,0);
    }
    const capabilities=Object.freeze({metadataRead:true,metadataWrite:true,presentationCache:true,
        attachments:false,localReplacementRestore:false,automaticLayoutWrite:false,offlineReplay:false,realtime:false});
    const commandTypes=Object.freeze(['items.changed','items.created','items.renamed','items.moved','items.copied','items.structure-duplicated',
        'items.deleted','content.changed','location.changed','constellations.changed','placements.changed','galaxy.archived','galaxy.restored']);
    function command(value){
        const copy=json(value,'command');
        if(!commandTypes.includes(copy.type)||!uuid(copy.operationId))fail('INVALID_COMMAND','command');
        const checkedScope=scope(copy.scope);revision(copy.baseRevision);
        if(!copy.payload||typeof copy.payload!=='object'||Array.isArray(copy.payload))fail('INVALID_COMMAND','payload');
        if(Object.keys(copy).some(key=>!['scope','operationId','baseRevision','type','payload'].includes(key)))fail('INVALID_COMMAND','command');
        return {...copy,scope:checkedScope};
    }
    function acknowledgement(value,request){
        const expected=command(request);let result;
        try{result=json(value,'acknowledgement');scope(result.scope);revision(result.baseRevision);revision(result.revision);}
        catch{fail('INVALID_ACKNOWLEDGEMENT','acknowledgement');}
        if(result.scope.ownerUserId!==expected.scope.ownerUserId||result.scope.universeId!==expected.scope.universeId||
            result.operationId!==expected.operationId||result.baseRevision!==expected.baseRevision||
            !['committed','unchanged'].includes(result.status)||typeof result.replayed!=='boolean'||!Object.hasOwn(result,'result')||
            BigInt(result.revision)!==BigInt(expected.baseRevision)+(result.status==='committed'?1n:0n)||
            Object.keys(result).some(key=>!['scope','operationId','baseRevision','revision','status','replayed','result'].includes(key)))
            fail('INVALID_ACKNOWLEDGEMENT','acknowledgement');
        return result;
    }
    /**
     * Future gateway (all Promise-returning):
     * listOwnedUniverses() -> owned Universe summaries; primary selection is an
     * application preference, never a uniqueness constraint on owner_id.
     * readUniverse(scope) -> coherent relational projection + revision
     * commitMetadata(command) -> validated acknowledgement
     * getOperationReceipt(scope, operationId) -> acknowledgement | null
     *
     * Future repository: open(scope) bootstraps before synchronous load(); public
     * semantic methods retain UniverseRepository's acknowledged result shapes,
     * subscribe() and whenIdle(). saveLayout/checkpointLayout remain cache-only.
     * No gateway, repository, retry queue or mode switch is implemented here.
     */
    return Object.freeze({version:1,capabilities,commandTypes,CloudMetadataError,fail,json,scope,revision,command,acknowledgement,
        repositoryInterface:Object.freeze({
            bootstrap:Object.freeze(['open']),
            synchronousReads:Object.freeze(['load','snapshot']),
            semanticCommands:Object.freeze(['save','updateContent','updateLocation','replaceConstellations','replacePlacements',
                'moveEntries','duplicateStructure','archive','restore','copyEntries','deleteSubtree']),
            presentationOnly:Object.freeze(['saveLayout','checkpointLayout']),
            orderingAndEvents:Object.freeze(['whenIdle','subscribe'])
        }),
        requireCapability(name){if(capabilities[name]!==true)fail('UNSUPPORTED_CAPABILITY','capability');}});
})();
