// Fixed disposable Phase C data. No runtime/local Cosmos reads or networking.
const cloudRecoveryPlan=(()=>{
    const c=cosmifoldCloudContract,p=cosmifoldCloudProjection,changes=cosmifoldCloudChanges;
    function assert(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
    function marker(input){const m=c.json(input);
        const fields=['case','fixtureVersion','format','operationId','phase','scope'];
        assert(m&&fields.every(key=>Object.hasOwn(m,key))&&Object.keys(m).every(key=>[...fields,'transport','admission','visibility'].includes(key))&&
            m.format==='cosmifold-phase-c'&&m.fixtureVersion===1&&['lost-reply','not-dispatched','browser-offline','response-interruption','late-receipt'].includes(m.case)&&
            ['allocated','prepared','network-ready','native-ready','dispatched','uncertain'].includes(m.phase),'INVALID_PHASE_C_MARKER');
        if(m.phase==='network-ready')assert(m.case==='browser-offline','INVALID_NETWORK_PHASE');
        if(m.phase==='native-ready')assert(nativeCase(m),'INVALID_NATIVE_PHASE');
        if(nativeCase(m)&&m.phase==='uncertain')assert(m.admission&&m.transport,'NATIVE_UNCERTAINTY_PROOF_REQUIRED');
        if(Object.hasOwn(m,'admission')){assert(nativeCase(m)&&['dispatched','uncertain'].includes(m.phase),'INVALID_ADMISSION_PHASE');admission(m,m.admission);}
        if(m.case==='late-receipt'){
            assert(m.visibility&&Object.keys(m.visibility).sort().join(',')==='state,visibilityVersion'&&m.visibility.visibilityVersion===1&&
                ['withheld','observed-missing','released'].includes(m.visibility.state),'INVALID_RECEIPT_VISIBILITY');
            if(m.visibility.state!=='withheld')assert(m.phase==='uncertain'&&m.admission&&m.transport,'UNPROVED_RECEIPT_VISIBILITY');
        }else assert(!Object.hasOwn(m,'visibility'),'UNEXPECTED_RECEIPT_VISIBILITY');
        if(Object.hasOwn(m,'transport'))assert(['browser-offline','response-interruption','late-receipt'].includes(m.case)&&m.phase==='uncertain'&&m.transport&&
            Object.keys(m.transport).sort().join(',')==='attempts,code,observedOffline,outcome,reason'&&m.transport.attempts===1&&
            m.transport.observedOffline===true&&m.transport.code==='OUTCOME_UNKNOWN'&&m.transport.outcome==='unknown'&&
            ['TRANSPORT_FAILURE','UNCLASSIFIED_RPC_FAILURE'].includes(m.transport.reason),'INVALID_TRANSPORT_EVIDENCE');
        c.scope(m.scope);assert(Object.keys(m.scope).sort().join(',')==='ownerUserId,universeId','INVALID_PHASE_C_SCOPE');
        c.scope({ownerUserId:m.operationId,universeId:m.operationId});assert(m.operationId!==m.scope.universeId,'PHASE_C_IDS_MUST_DIFFER');return m;}
    function nativeCase(m){return ['response-interruption','late-receipt'].includes(m.case);}
    function admission(m,input){const a=c.json(input);assert(a&&Object.keys(a).sort().join(',')==='admissionVersion,baseRevision,cacheRevision,operationId,pausedStatus,requestDigest,revision,scope,source'&&
        a.admissionVersion===1&&a.source==='independent-receipt-before-native-failure'&&a.baseRevision==='0'&&a.revision==='1'&&a.cacheRevision==='0'&&a.pausedStatus===200&&
        a.operationId===m.operationId&&changes.equal(a.scope,m.scope)&&/^[a-f0-9]{64}$/.test(a.requestDigest),'INVALID_NATIVE_ADMISSION');return a;}
    function snapshot(m,revision){marker(m);assert(['0','1'].includes(revision),'INVALID_PHASE_C_REVISION');
        return {version:5,entries:revision==='0'?[]:[{id:'phase-c-'+m.scope.universeId,parentId:null,name:'Phase C disposable recovery'}],
            layout:[],connections:[],portals:[],constellations:[],archivedGalaxies:[]};}
    function metadata(m,revision){return p.toRelational(snapshot(m,revision),{...m.scope,revision}).metadata;}
    function command(m){const next=metadata(m,'1');next.universe.revision='0';return c.command({scope:m.scope,operationId:m.operationId,baseRevision:'0',
        type:'items.created',payload:changes.between(metadata(m,'0'),next)});}
    function ack(m){return {scope:m.scope,operationId:m.operationId,baseRevision:'0',revision:'1',status:'committed',replayed:true,result:null};}
    return Object.freeze({assert,marker,snapshot,metadata,command,ack,admission,nativeCase});
})();
