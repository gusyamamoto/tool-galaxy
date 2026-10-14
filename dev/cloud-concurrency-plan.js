// Phase B fixed disposable data only. No local Cosmos, storage or networking.
const cloudConcurrencyPlan=(()=>{
    const contract=cosmifoldCloudContract,projection=cosmifoldCloudProjection,changes=cosmifoldCloudChanges;
    function assert(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
    function origin(value){let url;try{url=new URL(value);}catch{assert(false,'INVALID_TEST_ORIGIN');}
        assert(['http:','https:'].includes(url.protocol)&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.origin===value,'LOOPBACK_ORIGIN_REQUIRED');return value;}
    function fixture(input){const f=contract.json(input);assert(f&&f.format==='cosmifold-phase-b'&&f.fixtureVersion===1&&
        Object.keys(f).sort().join(',')==='fixtureVersion,format,leftOrigin,operations,rightOrigin,scope','INVALID_PHASE_B_FIXTURE');
        contract.scope(f.scope);assert(Object.keys(f.scope).sort().join(',')==='ownerUserId,universeId','INVALID_PHASE_B_SCOPE');
        origin(f.leftOrigin);origin(f.rightOrigin);assert(f.leftOrigin!==f.rightOrigin,'INDEPENDENT_ORIGINS_REQUIRED');
        assert(f.operations&&Object.keys(f.operations).sort().join(',')==='identical,left,newer,right,seed','INVALID_PHASE_B_OPERATIONS');
        const ids=[f.scope.universeId,...Object.values(f.operations)];for(const id of ids)contract.scope({ownerUserId:id,universeId:id});
        assert(new Set(ids).size===ids.length,'DUPLICATE_PHASE_B_ID');return f;}
    function snapshot(f,stage,winner){fixture(f);assert([0,1,2,3,4].includes(stage),'INVALID_PHASE_B_STAGE');
        if(stage===2)assert(['left','right'].includes(winner),'WINNER_REQUIRED');
        const names=['','Phase B disposable',winner==='left'?'Phase B Left':'Phase B Right','Phase B Identical','Phase B Newer'];
        return {version:5,entries:stage?[{id:'phase-b-'+f.scope.universeId,name:names[stage],parentId:null}]:[],layout:[],connections:[],portals:[],constellations:[],archivedGalaxies:[]};}
    const metadata=(f,stage,winner)=>projection.toRelational(snapshot(f,stage,winner),{...f.scope,revision:String(stage)}).metadata;
    function command(f,kind,winner){fixture(f);assert(['seed','left','right','identical','newer'].includes(kind),'INVALID_PHASE_B_CASE');
        const base=kind==='seed'?0:['left','right'].includes(kind)?1:kind==='identical'?2:3,stage=base+1;
        const intended=metadata(f,stage,['left','right'].includes(kind)?kind:winner);intended.universe.revision=String(base);
        return contract.command({scope:f.scope,operationId:f.operations[kind],baseRevision:String(base),type:kind==='seed'?'items.created':'items.renamed',
            payload:changes.between(metadata(f,base,winner),intended)});}
    function acknowledgement(f,kind,winner,replayed=false){const c=command(f,kind,winner);return {scope:c.scope,operationId:c.operationId,
        baseRevision:c.baseRevision,revision:String(Number(c.baseRevision)+1),status:'committed',replayed,result:null};}
    function reused(f,winner){const c=command(f,'identical',winner);c.payload.upsert.entries[0].name='Phase B rejected changed content';return contract.command(c);}
    function ticket(f,kind,startAt,nonce){fixture(f);assert(['race','identical'].includes(kind)&&Number.isSafeInteger(startAt),'INVALID_RACE_TICKET');
        contract.scope({ownerUserId:nonce,universeId:nonce});return {format:'cosmifold-phase-b-ticket',ticketVersion:1,fixture:f,kind,startAt,nonce};}
    function validateTicket(input,f){const t=contract.json(input);assert(t&&Object.keys(t).sort().join(',')==='fixture,format,kind,nonce,startAt,ticketVersion'&&
        t.format==='cosmifold-phase-b-ticket'&&t.ticketVersion===1&&changes.equal(t.fixture,f),'WRONG_RACE_TICKET');return ticket(f,t.kind,t.startAt,t.nonce);}
    return Object.freeze({assert,origin,fixture,snapshot,metadata,command,acknowledgement,reused,ticket,validateTicket});
})();
