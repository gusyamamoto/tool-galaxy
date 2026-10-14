-- READ-ONLY INSPECTION. Run manually in the same project's SQL Editor.
-- Does NOT call the helper, graphql.resolve, or any application function.
-- No grants, DDL, extension changes, Auth/domain rows or fixture identities.
-- Review definitions locally before sharing: custom SQL bodies can contain secrets.
-- Catalog dependencies are incomplete for dynamic SQL / PLpgSQL textual references.
with exact_target as (
  select to_regprocedure('extensions.grant_pg_graphql_access()')::oid as oid
), relevant as (
  select p.*, n.nspname, l.lanname, l.lanplcallfoid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_language l on l.oid=p.prolang
  where p.oid=(select oid from exact_target)
    or n.nspname ~ '^graphql($|_)' or p.proname ~* 'graphql'
    or exists (select 1 from pg_depend d join pg_extension e on e.oid=d.refobjid
      where d.classid='pg_proc'::regclass and d.objid=p.oid
        and d.refclassid='pg_extension'::regclass and e.extname='pg_graphql')
    or exists (select 1 from pg_depend d join pg_depend membership
      on membership.classid=d.refclassid and membership.objid=d.refobjid
      join pg_extension e on membership.refclassid='pg_extension'::regclass and e.oid=membership.refobjid
      where d.classid='pg_proc'::regclass and d.objid=p.oid and membership.deptype='e' and e.extname='pg_graphql')
), facts as (
  select p.*, jsonb_build_object(
    'schema',p.nspname,'name',p.proname,'signature',p.oid::regprocedure::text,
    'identityArguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),
    'owner',pg_get_userbyid(p.proowner),'language',p.lanname,
    'languageHandler',case when p.lanplcallfoid<>0 then p.lanplcallfoid::regprocedure::text else null end,
    'routineKind',p.prokind::text,'securityDefiner',p.prosecdef,
    'volatility',case p.provolatile when 'v' then 'volatile' when 's' then 'stable' when 'i' then 'immutable' end,
    'returnType',p.prorettype::regtype::text,'argumentCount',p.pronargs,
    'triggerContextOnly',p.prokind='f' and p.lanname='plpgsql'
      and p.prorettype in ('pg_catalog.trigger'::regtype,'pg_catalog.event_trigger'::regtype),
    'publicExecute',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE'),
    'rolePrivileges',coalesce((select jsonb_agg(jsonb_build_object(
      'role',r.rolname,'effectiveExecute',has_function_privilege(r.oid,p.oid,'EXECUTE'),
      'schemaUsage',has_schema_privilege(r.oid,p.pronamespace,'USAGE'),
      'executeAndUsage',has_function_privilege(r.oid,p.oid,'EXECUTE') and has_schema_privilege(r.oid,p.pronamespace,'USAGE'),
      'superuser',r.rolsuper,'bypassRls',r.rolbypassrls) order by r.rolname)
      from pg_roles r where r.rolname in ('anon','authenticated','service_role')),'[]'::jsonb),
    'aclSource',case when p.proacl is null then 'PostgreSQL default ACL' else 'stored ACL' end,
    'explicitAcl',coalesce((select jsonb_agg(jsonb_build_object(
      'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
      order by a.grantee,a.grantor,a.privilege_type) from aclexplode(p.proacl) a),'[]'::jsonb),
    'proconfig',to_jsonb(p.proconfig),
    'fixedSearchPath',(select setting from unnest(p.proconfig) setting where setting like 'search_path=%' limit 1),
    'definition',case when p.prokind<>'a' then pg_get_functiondef(p.oid) else null end,
    'body',p.prosrc,
    'stateChangingTextIndicators',jsonb_build_object(
      'grants',p.prosrc ~* '\m(grant|revoke)\M',
      'schemaDDL',p.prosrc ~* '\m(create|alter|drop)\s+schema\M',
      'extensionDDL',p.prosrc ~* '\m(create|alter|drop)\s+extension\M',
      'functionDDL',p.prosrc ~* '\m(create|alter|drop)\s+(or\s+replace\s+)?function\M',
      'dataWrites',p.prosrc ~* '\m(insert|update|delete|truncate)\M',
      'dynamicSQL',p.prosrc ~* '\mexecute\M'),
    'eventTriggers',coalesce((select jsonb_agg(jsonb_build_object(
      'name',t.evtname,'owner',pg_get_userbyid(t.evtowner),'event',t.evtevent,
      'enabled',t.evtenabled::text,'tags',to_jsonb(t.evttags)) order by t.evtname)
      from pg_event_trigger t where t.evtfoid=p.oid),'[]'::jsonb),
    'dependencies',coalesce((select jsonb_agg(jsonb_build_object(
      'type',d.deptype::text,'referencedObject',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid))
      order by d.refclassid,d.refobjid,d.refobjsubid,d.deptype)
      from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid),'[]'::jsonb)
  ) as inspection
  from relevant p
)
select jsonb_build_object(
  'format','cosmifold-graphql-helper-inspection','auditVersion',1,
  'checkedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'extensionInstalled',exists(select 1 from pg_extension where extname='pg_graphql'),
  'extensionVersion',(select extversion from pg_extension where extname='pg_graphql'),
  'targetExists',(select oid is not null from exact_target),
  'exactTarget',(select inspection from facts where oid=(select oid from exact_target)),
  'allRelatedFunctions',coalesce((select jsonb_agg(inspection order by nspname,proname,oid) from facts),'[]'::jsonb),
  'browserGrantQualifiedFunctions',coalesce((select jsonb_agg(inspection order by nspname,proname,oid)
    from facts p where exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated')
      and has_function_privilege(r.oid,p.oid,'EXECUTE') and has_schema_privilege(r.oid,p.pronamespace,'USAGE'))),'[]'::jsonb),
  'limitations','EXECUTE/USAGE is not ordinary SQL callability for trigger pseudo-types. State-changing text matches are review hints, not an effect proof. Dependencies omit dynamic references. No helper was executed.'
) as cloud_graphql_helper_inspection;
