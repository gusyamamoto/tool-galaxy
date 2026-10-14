// A separate revision-3 -> 4 plan. Original fixture/operation definitions never change.
const cloudConcurrentRecoveryPlan=(()=>{
    const p=cloudConcurrencyPlan,c=cosmifoldCloudContract,changes=cosmifoldCloudChanges,projection=cosmifoldCloudProjection;
    function validate(input){const r=c.json(input);p.assert(r&&Object.keys(r).sort().join(',')==='fixture,format,operationId,planId,recoveryVersion,winner'&&
        r.format==='cosmifold-phase-b-concurrent-recovery'&&r.recoveryVersion===1,'INVALID_CONCURRENT_RECOVERY_PLAN');
        const f=p.fixture(r.fixture);p.assert(['left','right'].includes(r.winner),'WINNER_REQUIRED');
        const ids=[f.scope.universeId,...Object.values(f.operations),r.operationId,r.planId];
        for(const id of ids)c.scope({ownerUserId:id,universeId:id});p.assert(new Set(ids).size===ids.length,'RECOVERY_REQUIRES_FRESH_IDS');return r;}
    function metadata(input){const r=validate(input),m=p.metadata(r.fixture,4,r.winner);m.entries[0].name='Phase B concurrent recovery';return projection.validateRelational(m);}
    function command(input){const r=validate(input),next=metadata(r);next.universe.revision='3';return c.command({scope:r.fixture.scope,
        operationId:r.operationId,baseRevision:'3',type:'items.renamed',payload:changes.between(p.metadata(r.fixture,3,r.winner),next)});}
    function ack(input,replayed=false){const r=validate(input);return {scope:r.fixture.scope,operationId:r.operationId,baseRevision:'3',revision:'4',status:'committed',replayed,result:null};}
    function ready(input,role){const r=validate(input);p.assert(['left','right'].includes(role),'WRONG_RECOVERY_ROLE');return {
        format:'cosmifold-phase-b-concurrent-ready',readyVersion:1,plan:r,role,origin:role==='left'?r.fixture.leftOrigin:r.fixture.rightOrigin,revision:'3'};}
    return Object.freeze({validate,metadata,command,ack,ready});
})();
