// Fixed disposable Phase C data. No runtime/local Cosmos reads or networking.
const cloudRecoveryPlan=(()=>{
    const c=cosmifoldCloudContract,p=cosmifoldCloudProjection,changes=cosmifoldCloudChanges;
    function assert(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
    function marker(input){const m=c.json(input);
        assert(m&&Object.keys(m).sort().join(',')==='case,fixtureVersion,format,operationId,phase,scope'&&
            m.format==='cosmifold-phase-c'&&m.fixtureVersion===1&&['lost-reply','not-dispatched'].includes(m.case)&&
            ['allocated','prepared','dispatched','uncertain'].includes(m.phase),'INVALID_PHASE_C_MARKER');
        c.scope(m.scope);assert(Object.keys(m.scope).sort().join(',')==='ownerUserId,universeId','INVALID_PHASE_C_SCOPE');
        c.scope({ownerUserId:m.operationId,universeId:m.operationId});assert(m.operationId!==m.scope.universeId,'PHASE_C_IDS_MUST_DIFFER');return m;}
    function snapshot(m,revision){marker(m);assert(['0','1'].includes(revision),'INVALID_PHASE_C_REVISION');
        return {version:5,entries:revision==='0'?[]:[{id:'phase-c-'+m.scope.universeId,parentId:null,name:'Phase C disposable recovery'}],
            layout:[],connections:[],portals:[],constellations:[],archivedGalaxies:[]};}
    function metadata(m,revision){return p.toRelational(snapshot(m,revision),{...m.scope,revision}).metadata;}
    function command(m){const next=metadata(m,'1');next.universe.revision='0';return c.command({scope:m.scope,operationId:m.operationId,baseRevision:'0',
        type:'items.created',payload:changes.between(metadata(m,'0'),next)});}
    function ack(m){return {scope:m.scope,operationId:m.operationId,baseRevision:'0',revision:'1',status:'committed',replayed:true,result:null};}
    return Object.freeze({assert,marker,snapshot,metadata,command,ack});
})();
