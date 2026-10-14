-- READ-ONLY MANUAL AUDIT. Run in the SAME Supabase project as the diagnostic.
-- A single SELECT over catalogs: no domain rows, Auth records, keys, DDL or cleanup.
-- Copy only cloud_api_surface_audit JSON into the development diagnostic.
-- Run fresh, and do not change grants/schema/API configuration during the test.
with browser_functions as (
  select p.proname as name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result,
    p.prosecdef as security_definer,
    has_schema_privilege('authenticated', n.oid, 'USAGE')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
    has_schema_privilege('anon', n.oid, 'USAGE')
      and has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
), browser_relations as (
  select c.relname as name
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p','v','m','f')
    and ((has_schema_privilege('authenticated', n.oid, 'USAGE')
      and (has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
        or has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE')))
      or (has_schema_privilege('anon', n.oid, 'USAGE')
      and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
        or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE'))))
)
select jsonb_build_object(
  'format','cosmifold-api-surface-audit',
  'auditVersion',1,
  'checkedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'publicFunctions',coalesce((select jsonb_agg(jsonb_build_object(
    'name',name,'arguments',arguments,'result',result,'securityDefiner',security_definer,
    'authenticated',authenticated,'anonymous',anonymous) order by name,arguments)
    from browser_functions where authenticated or anonymous),'[]'::jsonb),
  'publicRelations',coalesce((select jsonb_agg(name order by name) from browser_relations),'[]'::jsonb),
  'privateSchemaExists',exists(select 1 from pg_namespace where nspname='cosmifold_private'),
  'privateTables',coalesce((select jsonb_agg(jsonb_build_object(
    'name',c.relname,'rlsEnabled',c.relrowsecurity,'rlsForced',c.relforcerowsecurity) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='cosmifold_private' and c.relkind in ('r','p')),'[]'::jsonb)
) as cloud_api_surface_audit;
