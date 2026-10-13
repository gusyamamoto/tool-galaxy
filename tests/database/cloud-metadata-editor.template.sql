-- TEMPLATE ONLY. Do not paste or run this file in Supabase SQL Editor.
-- Generate the runnable artifact with: node scripts/build-cloud-validation.js
-- Migration SHA256 (normalized LF): {{MIGRATION_SHA256}}
-- Database suite SHA256 (normalized LF): {{SUITE_SHA256}}
-- No COMMIT, schema exposure changes, HTTP requests or secrets are used.
-- A failed assertion is an ERROR, never a swallowed "success". The inner
-- subtransaction discards scratch DDL/data on success AND failure. Final ROLLBACK
-- clears the outer transaction. If execution aborts, issue ROLLBACK as cleanup.
begin;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
set local check_function_bodies = on;

do $cm_validation_runner$
declare
  stage text := 'preflight'; actor text := current_user;
  config_row record; config_value text; settings jsonb := '[]'::jsonb;
  failure_state text; failure_message text; failure_context text;
begin
  -- Refuse to overwrite any previously installed migration/checkpoint objects.
  if to_regnamespace('cosmifold_private') is not null or exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('cosmifold_read_universe','cosmifold_list_universes',
      'cosmifold_create_universe','cosmifold_operation_receipt','cosmifold_commit_metadata')
  ) then raise exception 'Refusing validation: Cosmifold schema/RPC objects already exist. Nothing was changed.'; end if;
  if current_setting('server_version_num')::integer<150000 or current_setting('server_encoding')<>'UTF8' then
    raise exception 'PostgreSQL 15+ / UTF8 required.';
  end if;
  if actor in ('authenticated','anon') or to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then
    raise exception 'Use the normal SQL Editor administrative role with Supabase Auth available.';
  end if;
  if (select count(*) from pg_roles where rolname in ('authenticated','anon'))<>2 or
    exists(select 1 from pg_roles where rolname in ('authenticated','anon') and (rolsuper or rolbypassrls)) then
    raise exception 'Missing/unsafe application roles: authenticated and anon must not be superuser/BYPASSRLS.';
  end if;
  if exists(select 1 from auth.users where id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')) then
    raise exception 'Fixture IDs already exist. Refusing to touch existing Auth users.';
  end if;
  -- Unknown Auth hooks could call external services, which ROLLBACK cannot undo.
  if exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal) then
    raise exception 'Custom auth.users triggers require review first. Validation refused; do not disable them just to pass.';
  end if;
  -- Settings visible in this connection/catalog are NOT an HTTP exposure proof.
  -- Abort on any explicit private exposure/search-path setting we can observe.
  for config_row in
    select r.rolname,d.datname,setting from pg_db_role_setting s
    left join pg_roles r on r.oid=s.setrole left join pg_database d on d.oid=s.setdatabase
    cross join lateral unnest(s.setconfig) as entries(setting)
    where s.setdatabase in (0,(select oid from pg_database where datname=current_database())) and
      (s.setrole=0 or r.rolname in ('authenticator','authenticated','anon')) and
      (setting like 'pgrst.db_schemas=%' or setting like 'pgrst.db_extra_search_path=%' or setting like 'search_path=%' or setting like 'pgrst.db_pre_config=%')
  loop
    settings:=settings||jsonb_build_array(jsonb_build_object('role',config_row.rolname,'database',config_row.datname,'setting',config_row.setting));
    if config_row.setting like '%cosmifold_private%' then
      raise exception 'Private schema is present in a visible API/role configuration. Review configuration before running validation.';
    end if;
  end loop;
  foreach config_value in array array[current_setting('pgrst.db_schemas',true),current_setting('pgrst.db_extra_search_path',true)] loop
    if config_value like '%cosmifold_private%' then raise exception 'Private schema present in visible PostgREST configuration.'; end if;
  end loop;
  for config_row in
    select p.oid::regprocedure::text as function_name,setting from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral unnest(p.proconfig) as entries(setting)
    where n.nspname in ('graphql','graphql_public') and setting like 'search_path=%'
  loop
    settings:=settings||jsonb_build_array(jsonb_build_object('function',config_row.function_name,'setting',config_row.setting));
    if config_row.setting like '%cosmifold_private%' then raise exception 'Private schema in GraphQL function search_path. Review API boundary first.'; end if;
  end loop;
  raise notice 'Visible API configuration (not HTTP proof): %',settings;
  raise notice 'Enabled DDL event triggers need prior manual review: %',
    (select coalesce(jsonb_agg(jsonb_build_object('name',evtname,'function',evtfoid::regprocedure::text)),'[]'::jsonb) from pg_event_trigger where evtenabled<>'D');

  begin
    stage := 'migration compilation';
    -- Exact migration body, with ONLY its outer BEGIN/COMMIT removed.
    execute $cm_migration_body$
{{MIGRATION_BODY}}
$cm_migration_body$;
    stage := 'authored database/security suite';
    -- Exact suite body; psql fixture parameters become literal JSON. Its outer
    -- BEGIN/ROLLBACK is removed, not its assertions or privilege switches.
    execute $cm_database_suite$
{{TEST_BODY}}
$cm_database_suite$;
    execute format('set local role %I',actor);
    stage := 'supplemental grant/role/RPC checks';
    execute $cm_supplemental$
do $cm_supplemental_do$
declare r record; private_relation text; leaked boolean; response jsonb;
  a uuid := '00000000-0000-4000-8000-000000000001';
  b uuid := '00000000-0000-4000-8000-000000000002';
  ua uuid := '00000000-0000-4000-8000-000000000011';
begin
  -- Assert effective privileges, including any inherited/default PUBLIC grants.
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='cosmifold_private' or n.nspname='public' and p.proname in ('cosmifold_read_universe','cosmifold_list_universes',
      'cosmifold_create_universe','cosmifold_operation_receipt','cosmifold_commit_metadata')
  loop
    if has_function_privilege('anon',r.oid,'EXECUTE') or not has_function_privilege('authenticated',r.oid,'EXECUTE') then
      raise exception 'Incorrect effective function grant (including inherited/PUBLIC grants).';
    end if;
  end loop;
  if not has_schema_privilege('authenticated','cosmifold_private','USAGE') or has_schema_privilege('authenticated','cosmifold_private','CREATE') or
    has_schema_privilege('anon','cosmifold_private','USAGE') or
    has_column_privilege('authenticated','cosmifold_private.entries','id','UPDATE') or
    has_column_privilege('authenticated','cosmifold_private.entries','universe_id','UPDATE') or
    has_table_privilege('authenticated','cosmifold_private.operation_receipts','UPDATE') or
    has_table_privilege('authenticated','cosmifold_private.operation_receipts','DELETE') then raise exception 'Incorrect effective schema/column/receipt grants.'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if current_user<>'authenticated' or auth.uid() is distinct from a then raise exception 'User A simulation failed.'; end if;
  -- Ordinary RPCs cannot change Universe ownership; creation also cannot claim
  -- somebody else's pre-existing ID. No direct browser owner-update API exists.
  begin
    perform public.cosmifold_commit_metadata(jsonb_build_object('scope',jsonb_build_object('ownerUserId',a,'universeId',ua),
      'operationId','00000000-0000-4000-8000-000000000120','baseRevision','4','type','items.changed','payload',jsonb_build_object('owner_id',b)));
    raise exception 'RPC accepted ownership reassignment.';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  if auth.uid() is distinct from b then raise exception 'User B simulation failed.'; end if;
  begin perform public.cosmifold_create_universe(ua); raise exception 'B claimed A via creation RPC.'; exception when insufficient_privilege then null; end;
  foreach private_relation in array array['entries','constellations','constellation_members','linked_placements','operation_receipts'] loop
    execute format('select exists(select 1 from cosmifold_private.%I where universe_id=$1)',private_relation) into leaked using ua;
    if leaked then raise exception 'User B sees A in a private domain table.'; end if;
  end loop;
  execute 'reset role';
end;
$cm_supplemental_do$;
$cm_supplemental$;
    -- Intentional exception rolls back THIS subtransaction even on success:
    -- scratch schema, public RPCs, grants and Auth/test rows all disappear.
    stage := 'successful scratch rollback';
    raise exception using errcode='CV001',message='CM_VALIDATION_SUCCESS_ROLLBACK';
  exception
    when sqlstate 'CV001' then
      raise notice 'All migration/database/security assertions passed; scratch changes rolled back.';
    when others then
      get stacked diagnostics failure_state=returned_sqlstate,failure_message=message_text,failure_context=pg_exception_context;
      raise exception using errcode='P0001',message=format('Validation failed during %s: [%s] %s. Scratch changes rolled back; migration was not modified.',stage,failure_state,failure_message),detail=failure_context;
    when query_canceled then
      raise exception 'Validation canceled/timed out during %. Scratch subtransaction rolled back. Issue ROLLBACK if the Editor reports an aborted transaction.',stage;
  end;
  -- This verifies rollback before the final outer ROLLBACK too.
  if to_regnamespace('cosmifold_private') is not null or exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cosmifold_read_universe','cosmifold_list_universes',
      'cosmifold_create_universe','cosmifold_operation_receipt','cosmifold_commit_metadata')
  ) or exists(select 1 from auth.users where id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')) then
    raise exception 'Scratch rollback verification failed. Do not apply migration.';
  end if;
end;
$cm_validation_runner$;

-- Failure raises before this statement. SQL Editor may show only the final
-- command; green/no-error completion means assertions passed, not HTTP testing.
select 'PASSED: migration and single-session assertions; scratch objects removed' as database_validation,
       'NOT TESTED: actual PostgREST/GraphQL HTTP exposure and concurrent locking' as integration_validation;
rollback;
