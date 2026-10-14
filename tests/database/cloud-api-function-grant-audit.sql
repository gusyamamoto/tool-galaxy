-- READ-ONLY FOLLOW-UP: diagnose anonymous EXECUTE on the five installed RPCs.
-- No grants/revokes, domain rows, fixture IDs, Auth users, credentials or cleanup.
-- Run manually in the same project's SQL Editor. Review before any correction.
with targets as (
  select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'cosmifold_list_universes','cosmifold_create_universe','cosmifold_read_universe',
    'cosmifold_commit_metadata','cosmifold_operation_receipt')
), role_facts as (
  select rolname,rolsuper,rolinherit,rolbypassrls from pg_roles
  where rolname in ('anon','authenticated')
)
select jsonb_build_object(
  'functionGrants',coalesce((select jsonb_agg(jsonb_build_object(
    'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
    'ownerRole',pg_get_userbyid(p.proowner),
    'anonymousEffectiveExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticatedEffectiveExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'acl',coalesce((select jsonb_agg(jsonb_build_object(
      'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable,
      'availableToAnon',case when a.grantee=0 then true else pg_has_role('anon',a.grantee,'USAGE') end)
      order by a.grantee)
      from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'[]'::jsonb))
    order by p.proname,pg_get_function_identity_arguments(p.oid)) from targets p),'[]'::jsonb),
  'applicationRoles',coalesce((select jsonb_agg(jsonb_build_object(
    'name',rolname,'superuser',rolsuper,'inherit',rolinherit,'bypassRls',rolbypassrls)
    order by rolname) from role_facts),'[]'::jsonb),
  'directMembershipEdges',coalesce((select jsonb_agg(jsonb_build_object(
    'member',member_role.rolname,'grantedRole',granted_role.rolname)
    order by member_role.rolname,granted_role.rolname)
    from pg_auth_members m join pg_roles member_role on member_role.oid=m.member
    join pg_roles granted_role on granted_role.oid=m.roleid
    where member_role.rolname in ('anon','authenticated') or granted_role.rolname in ('anon','authenticated')),'[]'::jsonb)
) as cloud_rpc_grant_audit;
