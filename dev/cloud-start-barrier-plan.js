// Separate revision 4 -> 5 plan; all original and recovery IDs remain unchanged.
const cloudStartBarrierPlan=(()=>{
    const p=cloudConcurrencyPlan,q=cloudConcurrentRecoveryPlan,c=cosmifoldCloudContract,projection=cosmifoldCloudProjection;
    function validate(input){const r=c.json(input);p.assert(r&&Object.keys(r).sort().join(',')==='barrierVersion,format,operationId,planId,prior'&&
        r.format==='cosmifold-phase-b-barrier'&&r.barrierVersion===1,'INVALID_START_BARRIER_PLAN');
        q.validate(r.prior);const f=r.prior.fixture,ids=[f.scope.universeId,...Object.values(f.operations),r.prior.planId,r.prior.operationId,r.planId,r.operationId];
        for(const id of ids)c.scope({ownerUserId:id,universeId:id});p.assert(new Set(ids).size===ids.length,'BARRIER_REQUIRES_FRESH_IDS');return r;}
    function metadata(input){const r=validate(input),m=q.metadata(r.prior);m.universe.revision='5';m.entries[0].name='Phase B coordinated identical';return projection.validateRelational(m);}
    function command(input){const r=validate(input),next=metadata(r);next.universe.revision='4';return c.command({scope:r.prior.fixture.scope,
        operationId:r.operationId,baseRevision:'4',type:'items.renamed',payload:cosmifoldCloudChanges.between(q.metadata(r.prior),next)});}
    function ack(input,replayed=false){const r=validate(input);return {scope:r.prior.fixture.scope,operationId:r.operationId,baseRevision:'4',revision:'5',status:'committed',replayed,result:null};}
    return Object.freeze({validate,metadata,command,ack});
})();
