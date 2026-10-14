// Generate only. Never connects to PostgreSQL or performs browser storage cleanup.
function cloudBoundaryCleanup(records){
    cloudBoundaryAssert(Array.isArray(records)&&records.length>0&&records.length<=3,'INVALID_CLEANUP_FIXTURES');
    const expected=records.map(record=>{
        cloudBoundaryFixtures.validate(record);
        return {owner:record.ownerUserId,id:record.universeId,revision:record.stage,
            metadata:cloudBoundaryFixtures.metadata(record),receipts:Array.from({length:record.stage},(_,index)=>{
                const stage=index+1;return {command:cloudBoundaryFixtures.command(record,stage),ack:cloudBoundaryFixtures.acknowledgement(record,stage)};
            })};
    });
    cloudBoundaryAssert(new Set(expected.map(r=>r.id)).size===expected.length,'DUPLICATE_CLEANUP_UNIVERSE');
    // UUIDs and fixed labels/fixture fields only; arbitrary account content is never interpolated.
    const literal=JSON.stringify(expected).replace(/'/g,"''"),ids=expected.map(r=>`'${r.id}'::uuid`).join(',');
    return `-- MANUAL PHASE-A CLEANUP ONLY. Run the whole transaction. Never remove guards.
begin;
do $$
declare fixtures jsonb := '${literal}'::jsonb;
        fixture jsonb; expected_receipt jsonb; actual cosmifold_private.universes%rowtype;
begin
  -- Lock every target before checking/deleting; a changed fixture aborts the whole cleanup.
  perform 1 from cosmifold_private.universes where id in (${ids}) order by id for update;
  for fixture in select value from jsonb_array_elements(fixtures) loop
    select * into actual from cosmifold_private.universes where id=(fixture->>'id')::uuid;
    if not found or actual.owner_id<>(fixture->>'owner')::uuid or actual.revision<>(fixture->>'revision')::bigint
       or actual.snapshot_fields<>fixture->'metadata'->'snapshot_fields'
    then raise exception 'Universe absent, changed, or owner mismatch; nothing deleted'; end if;
    if exists(select 1 from cosmifold_private.constellations where universe_id=actual.id)
       or exists(select 1 from cosmifold_private.constellation_members where universe_id=actual.id)
       or exists(select 1 from cosmifold_private.linked_placements where universe_id=actual.id)
    then raise exception 'Unexpected related data; nothing deleted'; end if;
    if (select coalesce(jsonb_agg(to_jsonb(e) order by e.ordinal),'[]'::jsonb) from cosmifold_private.entries e where e.universe_id=actual.id)
       <> (select coalesce(jsonb_agg(value || '{"archive_json":null}'::jsonb),'[]'::jsonb) from jsonb_array_elements(fixture->'metadata'->'entries'))
    then raise exception 'Entry state differs from exact fixture; nothing deleted'; end if;
    if (select count(*) from cosmifold_private.operation_receipts where universe_id=actual.id) <> jsonb_array_length(fixture->'receipts')
    then raise exception 'Unexpected receipt count; nothing deleted'; end if;
    for expected_receipt in select value from jsonb_array_elements(fixture->'receipts') loop
      if not exists(select 1 from cosmifold_private.operation_receipts r where r.universe_id=actual.id
        and r.operation_id=(expected_receipt->'command'->>'operationId')::uuid
        and r.base_revision=(expected_receipt->'command'->>'baseRevision')::bigint
        and r.resulting_revision=(expected_receipt->'ack'->>'revision')::bigint
        and r.request_digest=encode(sha256(convert_to((expected_receipt->'command')::text,'UTF8')),'hex')
        and r.acknowledgement=expected_receipt->'ack')
      then raise exception 'Receipt differs from exact fixture; nothing deleted'; end if;
    end loop;
  end loop;
  delete from cosmifold_private.operation_receipts where universe_id in (${ids});
  delete from cosmifold_private.entries where universe_id in (${ids});
  delete from cosmifold_private.universes where id in (${ids});
end;
$$;
select count(*) as test_universes_removed from unnest(array[${ids}]) expected(id)
where not exists(select 1 from cosmifold_private.universes u where u.id=expected.id);
commit;`;
}
