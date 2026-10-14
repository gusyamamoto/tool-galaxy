// Generate manual, owner/UUID/state guarded SQL only. Never executes SQL.
function cloudConcurrencyCleanup(fixture,stage,winner){
    const p=cloudConcurrencyPlan,f=p.fixture(fixture);p.assert([0,1,2,3,4].includes(stage),'INVALID_CLEANUP_STAGE');
    if(stage>=2)p.assert(['left','right'].includes(winner),'WINNER_REQUIRED');
    const kinds=['seed',winner,'identical','newer'].slice(0,stage),data={scope:f.scope,metadata:p.metadata(f,stage,winner),
        receipts:kinds.map(kind=>({command:p.command(f,kind,winner),ack:p.acknowledgement(f,kind,winner)}))};
    return cloudConcurrencyCleanupSQL(data);
}
function cloudConcurrentRecoveryCleanup(input,stage){
    const q=cloudConcurrentRecoveryPlan,r=q.validate(input),p=cloudConcurrencyPlan;
    p.assert([3,4].includes(stage),'INVALID_RECOVERY_CLEANUP_STAGE');
    if(stage===3)return cloudConcurrencyCleanup(r.fixture,3,r.winner);
    return cloudConcurrencyCleanupSQL({scope:r.fixture.scope,metadata:q.metadata(r),receipts:[
        ...['seed',r.winner,'identical'].map(kind=>({command:p.command(r.fixture,kind,r.winner),ack:p.acknowledgement(r.fixture,kind,r.winner)})),
        {command:q.command(r),ack:q.ack(r)}]});
}
function cloudConcurrencyCleanupSQL(data){
    const literal=JSON.stringify(data).replace(/'/g,"''"),id=data.scope.universeId;
    return `-- MANUAL PHASE-B CLEANUP. Close both diagnostics first. Run ENTIRE transaction.
-- Refuses absent/changed fixtures and unexpected receipts. Never remove guards.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
do $$
declare f jsonb := '${literal}'::jsonb; u cosmifold_private.universes%rowtype; r jsonb;
begin
 select * into u from cosmifold_private.universes where id='${id}'::uuid for update;
 if not found or u.owner_id<>(f->'scope'->>'ownerUserId')::uuid or u.revision<>(f->'metadata'->'universe'->>'revision')::bigint
   or u.snapshot_fields<>f->'metadata'->'snapshot_fields' then raise exception 'Fixture absent/changed/owner mismatch; nothing deleted'; end if;
 if exists(select 1 from cosmifold_private.constellations where universe_id=u.id)
   or exists(select 1 from cosmifold_private.constellation_members where universe_id=u.id)
   or exists(select 1 from cosmifold_private.linked_placements where universe_id=u.id)
   then raise exception 'Unexpected related data; nothing deleted'; end if;
 if (select coalesce(jsonb_agg(to_jsonb(e) order by e.ordinal),'[]'::jsonb) from cosmifold_private.entries e where universe_id=u.id)
   <> (select coalesce(jsonb_agg(value || '{"archive_json":null}'::jsonb),'[]'::jsonb) from jsonb_array_elements(f->'metadata'->'entries'))
   then raise exception 'Exact entry state changed; nothing deleted'; end if;
 if (select count(*) from cosmifold_private.operation_receipts where universe_id=u.id)<>jsonb_array_length(f->'receipts')
   then raise exception 'Receipt count changed; nothing deleted'; end if;
 for r in select value from jsonb_array_elements(f->'receipts') loop
   if not exists(select 1 from cosmifold_private.operation_receipts actual where actual.universe_id=u.id
     and actual.operation_id=(r->'command'->>'operationId')::uuid
     and actual.base_revision=(r->'command'->>'baseRevision')::bigint
     and actual.resulting_revision=(r->'ack'->>'revision')::bigint
     and actual.request_digest=encode(sha256(convert_to((r->'command')::text,'UTF8')),'hex')
     and actual.acknowledgement=r->'ack') then raise exception 'Exact receipt/digest changed; nothing deleted'; end if;
 end loop;
 delete from cosmifold_private.operation_receipts where universe_id=u.id;
 delete from cosmifold_private.entries where universe_id=u.id;
 delete from cosmifold_private.universes where id=u.id;
end;
$$;
select count(*) as test_universes_removed from (values ('${id}'::uuid)) expected(id)
where not exists(select 1 from cosmifold_private.universes u where u.id=expected.id);
commit;`;
}
function cloudStartBarrierCleanup(input,stage){
    const b=cloudStartBarrierPlan,r=b.validate(input),q=cloudConcurrentRecoveryPlan,p=cloudConcurrencyPlan;
    p.assert([4,5].includes(stage),'INVALID_BARRIER_CLEANUP_STAGE');
    if(stage===4)return cloudConcurrentRecoveryCleanup(r.prior,4);
    return cloudConcurrencyCleanupSQL({scope:r.prior.fixture.scope,metadata:b.metadata(r),receipts:[
        ...['seed',r.prior.winner,'identical'].map(kind=>({command:p.command(r.prior.fixture,kind,r.prior.winner),ack:p.acknowledgement(r.prior.fixture,kind,r.prior.winner)})),
        {command:q.command(r.prior),ack:q.ack(r.prior)},{command:b.command(r),ack:b.ack(r)}]});
}
function cloudConcurrencyLockScripts(fixture,winner){
    const p=cloudConcurrencyPlan,f=p.fixture(fixture);
    return cloudUniverseLockScripts(f.scope,p.metadata(f,4,winner));
}
function cloudStartBarrierLockScripts(input){
    const b=cloudStartBarrierPlan,r=b.validate(input),tags={format:'cosmifold-phase-b-sql-lock',evidenceVersion:1,planId:r.planId,operationId:r.operationId,revision:'5'};
    return cloudUniverseLockScripts(r.prior.fixture.scope,b.metadata(r),{holdSeconds:20,tags});
}
function cloudUniverseLockScripts(identity,expected,{holdSeconds=8,tags=null}={}){
    const p=cloudConcurrencyPlan,f={scope:cosmifoldCloudContract.scope(identity)},m=cosmifoldCloudProjection.validateRelational(expected);
    p.assert(m.universe.id===f.scope.universeId&&m.universe.owner_id===f.scope.ownerUserId&&['4','5'].includes(m.universe.revision)&&[8,20].includes(holdSeconds),'INVALID_SQL_LOCK_TARGET');
    const revision=m.universe.revision,scope=JSON.stringify(f.scope).replace(/'/g,"''"),metadata=JSON.stringify(m).replace(/'/g,"''");
    const tagSQL=tags===null?'':` || '${JSON.stringify(tags).replace(/'/g,"''")}'::jsonb`;
    const tagOpen=tags===null?'':'(',tagClose=tags===null?'':')';
    const prefix=`begin;
set local statement_timeout='${holdSeconds===20?30:15}s';
set local lock_timeout='2s';
set local role authenticated;
select set_config('request.jwt.claim.sub','${f.scope.ownerUserId}',true);
select set_config('request.jwt.claims','{"sub":"${f.scope.ownerUserId}","role":"authenticated"}',true);`;
    const ownerGuard=tags===null?`if auth.uid()<>'${f.scope.ownerUserId}'::uuid or current_user<>'authenticated' then raise exception 'Wrong test identity'; end if;`:
        `if auth.uid() is distinct from '${f.scope.ownerUserId}'::uuid or current_user is distinct from 'authenticated' then raise exception 'Wrong test identity'; end if;`;
    const metadataComparison=tags===null?'<>':' is distinct from ';
    const holder=`-- MANUAL HOLDER. Exact revision-${revision} disposable fixture only; holds ${holdSeconds} seconds, then ROLLBACK.
${prefix}
do $$
declare acquired numeric; completed numeric; state jsonb;
begin
 ${ownerGuard}
 select public.cosmifold_read_universe('${scope}'::jsonb) into state;
 if state${metadataComparison}jsonb_build_object('status','found','metadata','${metadata}'::jsonb) then raise exception 'Fixture differs'; end if;
 perform 1 from cosmifold_private.universes where id='${f.scope.universeId}'::uuid and owner_id=auth.uid() and revision=${revision} for update;
 if not found then raise exception 'Fixture changed before lock'; end if;
 acquired := extract(epoch from clock_timestamp())*1000;
 perform pg_sleep(${holdSeconds});
 completed := extract(epoch from clock_timestamp())*1000;
 perform set_config('cosmifold.phase_b_lock_evidence',${tagOpen}jsonb_build_object('kind','holder','scope','${scope}'::jsonb,
   'role',current_user,'backendPid',pg_backend_pid(),'acquiredAt',acquired,'holdCompletedAt',completed)${tagSQL}${tagClose}::text,true);
end;
$$;
select current_setting('cosmifold.phase_b_lock_evidence')::jsonb as phase_b_lock_evidence;
rollback;`;
    const waiter=`-- MANUAL WAITER. Run while HOLDER is sleeping. NO mutations; ROLLBACK.
-- A 55P03 lock timeout is an observation, not sufficient proof alone. Pair both JSON outputs.
${prefix}
do $$
declare started numeric; finished numeric; outcome text := 'unverified-no-lock-wait';
begin
 ${ownerGuard}
 started := extract(epoch from clock_timestamp())*1000;
 begin
   perform public.cosmifold_read_universe('${scope}'::jsonb);
 exception when lock_not_available then outcome := 'lock-timeout-observed'; end;
 finished := extract(epoch from clock_timestamp())*1000;
 perform set_config('cosmifold.phase_b_lock_evidence',${tagOpen}jsonb_build_object('kind','waiter','scope','${scope}'::jsonb,
   'role',current_user,'backendPid',pg_backend_pid(),'startedAt',started,'finishedAt',finished,'outcome',outcome)${tagSQL}${tagClose}::text,true);
end;
$$;
select current_setting('cosmifold.phase_b_lock_evidence')::jsonb as phase_b_lock_evidence;
rollback;`;
    return {holder,waiter};
}
function cloudConcurrencyLockEvidence(input,fixture,holdSeconds=8){
    const p=cloudConcurrencyPlan,f=p.fixture(fixture),value=cosmifoldCloudContract.json(input),pair=Array.isArray(value)?value:null;
    if(!pair||pair.length!==2)return {state:'UNVERIFIED',reason:'Two unedited SQL evidence objects required.'};
    const rows=pair.map(row=>row?.phase_b_lock_evidence||row),a=rows.find(r=>r?.kind==='holder'),b=rows.find(r=>r?.kind==='waiter');
    if(!a||!b||![a,b].every(r=>cosmifoldCloudChanges.equal(r.scope,f.scope)&&r.role==='authenticated'&&Number.isSafeInteger(r.backendPid)&&r.backendPid>0))
        return {state:'UNVERIFIED',reason:'Scope/role/backend identity mismatch.'};
    if(a.backendPid===b.backendPid)return {state:'UNVERIFIED',reason:'Same backend PID; independent sessions not proved.'};
    if(![a.acquiredAt,a.holdCompletedAt,b.startedAt,b.finishedAt].every(Number.isFinite)||b.outcome!=='lock-timeout-observed'||
        b.startedAt<a.acquiredAt||b.finishedAt>a.holdCompletedAt||b.finishedAt-b.startedAt<1500||b.finishedAt-b.startedAt>5000||
        a.holdCompletedAt-a.acquiredAt<holdSeconds*1000-500||a.holdCompletedAt-a.acquiredAt>holdSeconds*1000+6000)
        return {state:'UNVERIFIED',reason:'Bounded lock timeout and overlapping held interval not proved.'};
    return {state:'PASS',reason:'Different backend PIDs; waiter lock timeout occurred wholly inside the holder lock interval.'};
}
function cloudStartBarrierLockEvidence(input,plan){
    const b=cloudStartBarrierPlan,r=b.validate(plan),value=cosmifoldCloudContract.json(input);
    if(!Array.isArray(value)||value.length!==2)return {state:'UNVERIFIED',reason:'Two complete revision-5 SQL evidence objects required.'};
    const rows=value.map(row=>row?.phase_b_lock_evidence||row);
    if(!rows.every(row=>row?.format==='cosmifold-phase-b-sql-lock'&&row.evidenceVersion===1&&row.planId===r.planId&&
        row.operationId===r.operationId&&row.revision==='5'))return {state:'UNVERIFIED',reason:'Exact barrier plan/operation/revision tags mismatch; old or unrelated evidence rejected.'};
    return cloudConcurrencyLockEvidence(rows,r.prior.fixture,20);
}
