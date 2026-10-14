-- READ-ONLY: run manually in this project's SQL Editor, copy the JSON cell.
-- No extension/configuration changes, function execution, user/fixture rows or secrets.
-- An installed extension OR any browser-callable GraphQL function blocks the
-- disabled-engine proof, even if the HTTP gateway currently reports disabled.
with graphql_schemas as (
  select n.* from pg_namespace n where n.nspname ~ '^graphql($|_)'
), graphql_functions as (
  select p.*, n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname ~ '^graphql($|_)' or p.proname ~* 'graphql'
), graphql_relations as (
  select c.*, n.nspname from pg_class c join graphql_schemas n on n.oid=c.relnamespace
  where c.relkind in ('r','p','v','m','f')
)
select jsonb_build_object(
  'format','cosmifold-graphql-surface-audit','auditVersion',1,
  'checkedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'extensionInstalled',exists(select 1 from pg_extension where extname='pg_graphql'),
  'extensionVersion',(select extversion from pg_extension where extname='pg_graphql'),
  'schemas',coalesce((select jsonb_agg(jsonb_build_object(
    'name',nspname,'anonymousUsage',has_schema_privilege('anon',oid,'USAGE'),
    'authenticatedUsage',has_schema_privilege('authenticated',oid,'USAGE')) order by nspname)
    from graphql_schemas),'[]'::jsonb),
  'functions',coalesce((select jsonb_agg(jsonb_build_object(
    'schema',nspname,'name',proname,'arguments',pg_get_function_identity_arguments(oid),
    'result',pg_get_function_result(oid),'securityDefiner',prosecdef,
    'anonymousExecute',has_function_privilege('anon',oid,'EXECUTE'),
    'authenticatedExecute',has_function_privilege('authenticated',oid,'EXECUTE'),
    'anonymousUsage',has_schema_privilege('anon',pronamespace,'USAGE'),
    'authenticatedUsage',has_schema_privilege('authenticated',pronamespace,'USAGE'),
    'publicExecute',exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE')) order by nspname,proname,oid)
    from graphql_functions),'[]'::jsonb),
  'browserAccessibleRelations',coalesce((select jsonb_agg(jsonb_build_object('schema',nspname,'name',relname)
    order by nspname,relname) from graphql_relations c where exists(
      select 1 from pg_roles r where r.rolname in ('anon','authenticated')
      and has_schema_privilege(r.oid,c.relnamespace,'USAGE') and (
        has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE') or
        has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE')))),'[]'::jsonb)
) as cloud_graphql_surface_audit;
