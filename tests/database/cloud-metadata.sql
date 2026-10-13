-- Run ONLY against a disposable Supabase-compatible test database, after the
-- reviewed migration. No pgTAP/extension is needed. Fixtures roll back entirely.
\set ON_ERROR_STOP on
-- These literals are derived from the existing Step-2 projector.
\set cloud_command '{"scope":{"ownerUserId":"00000000-0000-4000-8000-000000000001","universeId":"00000000-0000-4000-8000-000000000011"},"operationId":"00000000-0000-4000-8000-000000000101","baseRevision":"0","type":"items.created","payload":{"upsert":{"entries":[{"universe_id":"00000000-0000-4000-8000-000000000011","id":"galaxy","parent_id":null,"parent_id_present":true,"name":"Japan","ordinal":0,"attributes_json":{"appearance":{"seed":7}}},{"universe_id":"00000000-0000-4000-8000-000000000011","id":"tokyo","parent_id":"galaxy","parent_id_present":true,"name":"Tokyo","ordinal":1,"attributes_json":{"description":"Travel","category":"Places","content":{"version":1,"notes":{"format":"plain","text":"Saved trip note"},"links":[{"id":"bookmark","url":"https://example.com","title":""}],"attachments":[]},"location":{"text":"Tokyo Station"},"createdAt":"2026-10-12T00:00:00.000Z","updatedAt":"2026-10-12T00:00:00.000Z"}},{"universe_id":"00000000-0000-4000-8000-000000000011","id":"archived-root","parent_id":null,"parent_id_present":true,"name":"Old trip","ordinal":2,"attributes_json":{"appearance":{"seed":0}},"archive_json":{"ordinal":0,"archivedAt":"2026-10-12T00:00:00.000Z","expandedIds":["archived-root","archived-note"]}},{"universe_id":"00000000-0000-4000-8000-000000000011","id":"archived-note","parent_id":"archived-root","parent_id_present":true,"name":"Old notes","ordinal":3,"attributes_json":{"content":{"version":1,"notes":{"format":"plain","text":"Archived note"},"links":[],"attachments":[]}}}],"constellations":[{"universe_id":"00000000-0000-4000-8000-000000000011","id":"favorites","name":"Favorites","ordinal":0,"created_at":"2026-10-12T00:00:00.000Z","updated_at":"2026-10-12T00:00:00.000Z"}],"constellation_members":[{"universe_id":"00000000-0000-4000-8000-000000000011","constellation_id":"favorites","entry_id":"tokyo","ordinal":0},{"universe_id":"00000000-0000-4000-8000-000000000011","constellation_id":"favorites","entry_id":"archived-note","ordinal":1}],"linked_placements":[{"universe_id":"00000000-0000-4000-8000-000000000011","id":"portal:link","ordinal":0,"target_entry_id":"tokyo","parent_entry_id":"archived-root","created_at":"2026-10-12T00:00:00.000Z"}]},"snapshot_fields":{"connections":true,"portals":true,"constellations":true,"archivedGalaxies":true}}}'
\set expected_projection '{"format":"cosmifold-cloud-metadata","projectionVersion":1,"storageVersion":5,"universe":{"id":"00000000-0000-4000-8000-000000000011","owner_id":"00000000-0000-4000-8000-000000000001","revision":"1"},"snapshot_fields":{"connections":true,"portals":true,"constellations":true,"archivedGalaxies":true},"entries":[{"universe_id":"00000000-0000-4000-8000-000000000011","id":"galaxy","parent_id":null,"parent_id_present":true,"name":"Japan","ordinal":0,"attributes_json":{"appearance":{"seed":7}}},{"universe_id":"00000000-0000-4000-8000-000000000011","id":"tokyo","parent_id":"galaxy","parent_id_present":true,"name":"Tokyo","ordinal":1,"attributes_json":{"description":"Travel","category":"Places","content":{"version":1,"notes":{"format":"plain","text":"Saved trip note"},"links":[{"id":"bookmark","url":"https://example.com","title":""}],"attachments":[]},"location":{"text":"Tokyo Station"},"createdAt":"2026-10-12T00:00:00.000Z","updatedAt":"2026-10-12T00:00:00.000Z"}},{"universe_id":"00000000-0000-4000-8000-000000000011","id":"archived-root","parent_id":null,"parent_id_present":true,"name":"Old trip","ordinal":2,"attributes_json":{"appearance":{"seed":0}},"archive_json":{"ordinal":0,"archivedAt":"2026-10-12T00:00:00.000Z","expandedIds":["archived-root","archived-note"]}},{"universe_id":"00000000-0000-4000-8000-000000000011","id":"archived-note","parent_id":"archived-root","parent_id_present":true,"name":"Old notes","ordinal":3,"attributes_json":{"content":{"version":1,"notes":{"format":"plain","text":"Archived note"},"links":[],"attachments":[]}}}],"constellations":[{"universe_id":"00000000-0000-4000-8000-000000000011","id":"favorites","name":"Favorites","ordinal":0,"created_at":"2026-10-12T00:00:00.000Z","updated_at":"2026-10-12T00:00:00.000Z"}],"constellation_members":[{"universe_id":"00000000-0000-4000-8000-000000000011","constellation_id":"favorites","entry_id":"tokyo","ordinal":0},{"universe_id":"00000000-0000-4000-8000-000000000011","constellation_id":"favorites","entry_id":"archived-note","ordinal":1}],"linked_placements":[{"universe_id":"00000000-0000-4000-8000-000000000011","id":"portal:link","ordinal":0,"target_entry_id":"tokyo","parent_entry_id":"archived-root","created_at":"2026-10-12T00:00:00.000Z"}]}'
\set source_snapshot '{"version":5,"connections":[],"layout":[],"entries":[{"id":"galaxy","name":"Japan","parentId":null,"appearance":{"seed":7}},{"id":"tokyo","name":"Tokyo","parentId":"galaxy","description":"Travel","category":"Places","location":{"text":"Tokyo Station"},"createdAt":"2026-10-12T00:00:00.000Z","updatedAt":"2026-10-12T00:00:00.000Z","content":{"version":1,"notes":{"format":"plain","text":"Saved trip note"},"links":[{"id":"bookmark","url":"https://example.com","title":""}],"attachments":[]}},{"id":"archived-root","name":"Old trip","parentId":null,"appearance":{"seed":0}},{"id":"archived-note","name":"Old notes","parentId":"archived-root","content":{"version":1,"notes":{"format":"plain","text":"Archived note"},"links":[],"attachments":[]}}],"constellations":[{"id":"favorites","name":"Favorites","createdAt":"2026-10-12T00:00:00.000Z","updatedAt":"2026-10-12T00:00:00.000Z","memberEntryIds":["tokyo","archived-note"]}],"portals":[{"id":"portal:link","targetEntryId":"tokyo","parentEntryId":"archived-root","createdAt":"2026-10-12T00:00:00.000Z"}],"archivedGalaxies":[{"galaxyId":"archived-root","archivedAt":"2026-10-12T00:00:00.000Z","expandedIds":["archived-root","archived-note"]}]}'

begin;
create temporary table cosmifold_test_fixture(command jsonb,expected jsonb);
insert into cosmifold_test_fixture values(:'cloud_command'::jsonb,:'expected_projection'::jsonb);
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000001','owner-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000002','owner-b@example.invalid');

do $$
declare cmd jsonb; expected jsonb; response jsonb; before_data jsonb; before_receipts bigint; row_data jsonb;
  a uuid:='00000000-0000-4000-8000-000000000001'; b uuid:='00000000-0000-4000-8000-000000000002';
  ua uuid:='00000000-0000-4000-8000-000000000011'; ua2 uuid:='00000000-0000-4000-8000-000000000012'; ub uuid:='00000000-0000-4000-8000-000000000013';
  sa jsonb; sb jsonb; sa2 jsonb; modified jsonb; empty_command jsonb; ack jsonb;
begin
  select command,cosmifold_test_fixture.expected into cmd,expected from cosmifold_test_fixture;
  sa:=jsonb_build_object('ownerUserId',a,'universeId',ua); sa2:=jsonb_build_object('ownerUserId',a,'universeId',ua2); sb:=jsonb_build_object('ownerUserId',b,'universeId',ub);
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if current_user<>'authenticated' then raise exception 'tests must exercise the non-owner authenticated role'; end if;
  perform public.cosmifold_create_universe(ua); perform public.cosmifold_create_universe(ua2);
  if jsonb_array_length(public.cosmifold_list_universes())<>2 then raise exception 'multiple Universes per owner failed'; end if;
  response:=public.cosmifold_read_universe(sa2);
  if response->>'status'<>'found' or response#>'{metadata,entries}'<>'[]'::jsonb then raise exception 'empty Universe is not a found result'; end if;
  response:=public.cosmifold_read_universe(jsonb_build_object('ownerUserId',a,'universeId','00000000-0000-4000-8000-000000000099'));
  if response->>'status'<>'absent' then raise exception 'genuine absence not distinguished'; end if;
  ack:=public.cosmifold_commit_metadata(cmd);
  if ack->>'revision'<>'1' or ack->>'status'<>'committed' then raise exception 'valid revision did not increment once'; end if;
  response:=public.cosmifold_read_universe(sa);
  if response->'metadata' is distinct from expected then raise exception 'SQL projection differs from Step-2 fixture'; end if;
  response:=public.cosmifold_commit_metadata(cmd);
  if response->>'revision'<>'1' or response->'replayed'<>'true'::jsonb then raise exception 'identical retry failed'; end if;
  if (public.cosmifold_read_universe(sa)#>>'{metadata,universe,revision}')<>'1' then raise exception 'retry advanced revision'; end if;
  modified:=jsonb_set(cmd,'{type}','"items.changed"');
  begin
    perform public.cosmifold_commit_metadata(modified); raise exception 'changed digest was accepted';
  exception when sqlstate 'CM004' then null; end;
  response:=public.cosmifold_operation_receipt(sa,(cmd->>'operationId')::uuid);
  if response->>'status'<>'found' or response#>'{acknowledgement,replayed}'<>'true'::jsonb then raise exception 'receipt reconciliation failed'; end if;
  if public.cosmifold_operation_receipt(sa,'00000000-0000-4000-8000-000000000999')->>'status'<>'missing' then raise exception 'missing receipt not explicit'; end if;
  row_data:=jsonb_set(cmd#>'{payload,upsert,entries,0}','{name}','"Renamed Galaxy"');
  modified:=jsonb_build_object('scope',sa,'operationId','00000000-0000-4000-8000-000000000102','baseRevision','1','type','items.renamed',
    'payload',jsonb_build_object('upsert',jsonb_build_object('entries',jsonb_build_array(row_data))));
  response:=public.cosmifold_commit_metadata(modified);
  if response->>'revision'<>'2' then raise exception 'second mutation failed'; end if;
  response:=public.cosmifold_commit_metadata(cmd);
  if response->>'revision'<>'1' or response->'replayed'<>'true'::jsonb or public.cosmifold_read_universe(sa)#>>'{metadata,universe,revision}'<>'2' then
    raise exception 'old receipt retry was not checked before stale revision'; end if;
  before_data:=public.cosmifold_read_universe(sa); select count(*) into before_receipts from cosmifold_private.operation_receipts where universe_id=ua;
  begin
    perform public.cosmifold_commit_metadata(jsonb_set(cmd,'{operationId}','"00000000-0000-4000-8000-000000000103"')); raise exception 'stale write succeeded';
  exception when sqlstate 'CM003' then null; end;
  if public.cosmifold_read_universe(sa) is distinct from before_data or
    (select count(*) from cosmifold_private.operation_receipts where universe_id=ua)<>before_receipts then raise exception 'stale write changed data/receipts'; end if;
  -- First row update succeeds; missing-parent second row fails FINAL validation.
  modified:=jsonb_build_object('scope',sa,'operationId','00000000-0000-4000-8000-000000000104','baseRevision','2','type','items.changed',
    'payload',jsonb_build_object('upsert',jsonb_build_object('entries',jsonb_build_array(jsonb_set(row_data,'{name}','"Must roll back"'),
      jsonb_build_object('universe_id',ua,'id','bad-child','parent_id','missing','parent_id_present',true,'name','Bad','ordinal',4,'attributes_json','{}'::jsonb)))));
  begin perform public.cosmifold_commit_metadata(modified); raise exception 'compound invalid parent succeeded'; exception when sqlstate 'CM005' then null; end;
  if public.cosmifold_read_universe(sa) is distinct from before_data or
    (select count(*) from cosmifold_private.operation_receipts where universe_id=ua)<>before_receipts then raise exception 'compound rollback changed data/revision/receipt'; end if;
  modified:=jsonb_set(modified,'{payload,upsert,entries}',jsonb_build_array(jsonb_set(row_data,'{parent_id}','"tokyo"')));
  begin perform public.cosmifold_commit_metadata(modified); raise exception 'cycle succeeded'; exception when sqlstate 'CM005' then null; end;
  modified:=jsonb_set(modified,'{payload,upsert,entries}',jsonb_build_array(jsonb_set(row_data,'{universe_id}',to_jsonb(ua2))));
  begin perform public.cosmifold_commit_metadata(modified); raise exception 'cross-Universe row succeeded'; exception when sqlstate 'CM005' then null; end;
  modified:=jsonb_set(modified,'{payload,upsert,entries}',jsonb_build_array(jsonb_set(row_data,'{attributes_json}',
    '{"content":{"version":1,"notes":{"format":"plain","text":""},"links":[],"attachments":[{"id":"file"}]}}')));
  begin perform public.cosmifold_commit_metadata(modified); raise exception 'attachment metadata succeeded'; exception when sqlstate 'CM006' then null; end;
  -- Composite FK enforcement independently of RPC validation. No private-schema
  -- Data API access exists; raw SQL is used here solely to exercise constraints.
  begin
    insert into cosmifold_private.entries(universe_id,id,parent_id,parent_id_present,name,ordinal) values(ua2,'foreign-child','tokyo',true,'Bad',0);
    set constraints cosmifold_private.entries_parent_fk immediate; raise exception 'cross-Universe parent FK succeeded';
  exception when foreign_key_violation then null; end;
  begin
    insert into cosmifold_private.constellation_members values(ua2,'favorites','tokyo',0);
    set constraints cosmifold_private.members_collection_fk,cosmifold_private.members_entry_fk immediate; raise exception 'cross-Universe membership FK succeeded';
  exception when foreign_key_violation then null; end;
  begin
    insert into cosmifold_private.linked_placements values(ua2,'foreign-link','tokyo','galaxy','2026-10-12T00:00:00.000Z',0);
    set constraints cosmifold_private.placements_target_fk,cosmifold_private.placements_parent_fk immediate; raise exception 'cross-Universe placement FK succeeded';
  exception when foreign_key_violation then null; end;
  begin
    update cosmifold_private.universes set owner_id=b where id=ua; raise exception 'ownership reassignment succeeded';
  exception when insufficient_privilege then null; end;
  -- Removing an entry without its memberships/placements does not cascade.
  modified:=jsonb_build_object('scope',sa,'operationId','00000000-0000-4000-8000-000000000105','baseRevision','2','type','items.deleted',
    'payload',jsonb_build_object('delete',jsonb_build_object('entries',jsonb_build_array('tokyo')),
      'upsert',jsonb_build_object('entries',jsonb_build_array(jsonb_set(cmd#>'{payload,upsert,entries,2}','{ordinal}','1'),jsonb_set(cmd#>'{payload,upsert,entries,3}','{ordinal}','2')))));
  begin perform public.cosmifold_commit_metadata(modified); raise exception 'dangling references silently cascaded'; exception when sqlstate 'CM005' then null; end;
  if public.cosmifold_read_universe(sa) is distinct from before_data then raise exception 'failed delete changed data'; end if;
  -- No-op receipts are durable without advancing revision.
  empty_command:=jsonb_build_object('scope',sa,'operationId','00000000-0000-4000-8000-000000000106','baseRevision','2','type','items.changed','payload','{}'::jsonb);
  response:=public.cosmifold_commit_metadata(empty_command);
  if response->>'revision'<>'2' or response->>'status'<>'unchanged' then raise exception 'no-op revision changed'; end if;
  -- Swap global ordinals: deferred uniqueness allows valid reordering atomically.
  modified:=jsonb_build_object('scope',sa,'operationId','00000000-0000-4000-8000-000000000107','baseRevision','2','type','items.changed',
    'payload',jsonb_build_object('upsert',jsonb_build_object('entries',jsonb_build_array(jsonb_set(row_data,'{ordinal}','1'),jsonb_set(cmd#>'{payload,upsert,entries,1}','{ordinal}','0')))));
  response:=public.cosmifold_commit_metadata(modified);
  if response->>'revision'<>'3' then raise exception 'ordinal swap failed'; end if;
  -- Successful deletion supplies ALL reference removal and ordinal adjustments.
  modified:=jsonb_build_object('scope',sa,'operationId','00000000-0000-4000-8000-000000000108','baseRevision','3','type','items.deleted',
    'payload',jsonb_build_object('delete',jsonb_build_object('entries',jsonb_build_array('tokyo'),'linked_placements',jsonb_build_array('portal:link'),
      'constellation_members',jsonb_build_array(jsonb_build_object('constellation_id','favorites','entry_id','tokyo'))),
      'upsert',jsonb_build_object('entries',jsonb_build_array(jsonb_set(row_data,'{ordinal}','0'),jsonb_set(cmd#>'{payload,upsert,entries,2}','{ordinal}','1'),
        jsonb_set(cmd#>'{payload,upsert,entries,3}','{ordinal}','2')),
        'constellation_members',jsonb_build_array(jsonb_set(cmd#>'{payload,upsert,constellation_members,1}','{ordinal}','0')))));
  response:=public.cosmifold_commit_metadata(modified);
  if response->>'revision'<>'4' or jsonb_array_length(public.cosmifold_read_universe(sa)#>'{metadata,entries}')<>3 or
    jsonb_array_length(public.cosmifold_read_universe(sa)#>'{metadata,linked_placements}')<>0 then raise exception 'explicit deletion failed'; end if;
  -- Null session must not work even if a caller is assigned authenticated role.
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  begin perform public.cosmifold_read_universe(sa); raise exception 'missing subject read succeeded'; exception when invalid_authorization_specification then null; end;
  -- B cannot read or mutate A; raw table RLS is tested as well as the RPC guard.
  perform set_config('request.jwt.claim.sub',b::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  perform public.cosmifold_create_universe(ub);
  if jsonb_array_length(public.cosmifold_list_universes())<>1 then raise exception 'list leaked owner A'; end if;
  begin perform public.cosmifold_read_universe(sa); raise exception 'B read A'; exception when insufficient_privilege then null; end;
  begin perform public.cosmifold_commit_metadata(empty_command); raise exception 'B mutated A'; exception when insufficient_privilege then null; end;
  begin perform public.cosmifold_operation_receipt(sa,(cmd->>'operationId')::uuid); raise exception 'B reconciled A'; exception when insufficient_privilege then null; end;
  if exists(select 1 from cosmifold_private.universes where id=ua) or exists(select 1 from cosmifold_private.entries where universe_id=ua) then raise exception 'RLS leaked A'; end if;
  begin
    insert into cosmifold_private.entries(universe_id,id,parent_id_present,name,ordinal) values(ua,'b-in-a',false,'Bad',4);
    raise exception 'B inserted into A';
  exception when insufficient_privilege then null; end;
  -- Foreign IDs queried under B's claimed scope stay indistinguishable from
  -- absence, without disclosing whether A's Universe exists.
  if public.cosmifold_read_universe(jsonb_build_object('ownerUserId',b,'universeId',ua))->>'status'<>'absent' then raise exception 'foreign existence leaked'; end if;
  execute 'reset role'; execute 'set local role anon';
  begin perform public.cosmifold_read_universe(sa); raise exception 'anonymous read succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.cosmifold_commit_metadata(cmd); raise exception 'anonymous mutation succeeded'; exception when insufficient_privilege then null; end;
  begin perform 1 from cosmifold_private.entries; raise exception 'anonymous table read succeeded'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    (n.nspname='cosmifold_private' or n.nspname='public' and p.proname like 'cosmifold_%') and p.prosecdef) then raise exception 'DEFINER function found'; end if;
  if has_function_privilege('anon','public.cosmifold_commit_metadata(jsonb)','EXECUTE') or
    has_table_privilege('anon','cosmifold_private.entries','SELECT') or
    has_column_privilege('authenticated','cosmifold_private.universes','owner_id','UPDATE') then raise exception 'unsafe grant'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='cosmifold_private' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)) then raise exception 'missing RLS'; end if;
  if cosmifold_private.utf16_length(chr(128640))<>2 then raise exception 'UTF16 length compatibility failed'; end if;
  raise notice 'cloud metadata database/security assertions passed (fixtures roll back)';
end;
$$;
rollback;
