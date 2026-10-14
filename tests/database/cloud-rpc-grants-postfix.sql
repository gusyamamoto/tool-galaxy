-- READ-ONLY POST-FIX CHECK. Run manually in the same project's SQL Editor.
-- No fixture data, Auth users, credentials, grants or cleanup are accessed.
-- Require all five rows plus all_checks_passed=true before resuming Phase A.
-- service_role execution is informational: this fix preserves its existing ACL.
with expected(signature) as (
  values ('public.cosmifold_list_universes()'),
    ('public.cosmifold_create_universe(uuid)'),
    ('public.cosmifold_read_universe(jsonb)'),
    ('public.cosmifold_commit_metadata(jsonb)'),
    ('public.cosmifold_operation_receipt(jsonb,uuid)')
), facts as (
  select e.signature, p.oid is not null as function_exists,
    p.prokind='f' and not p.prosecdef as security_invoker,
    coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anonymous_execute,
    coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false)
      and has_schema_privilege('authenticated','public','USAGE') as authenticated_execute,
    exists (select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute,
    exists (select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      join pg_roles r on r.oid=a.grantee
      where r.rolname='anon' and a.privilege_type='EXECUTE') as anonymous_direct_execute,
    coalesce(has_function_privilege('service_role',p.oid,'EXECUTE'),false) as service_role_execute
  from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
), checked as (
  select *, coalesce(function_exists and security_invoker and authenticated_execute
    and not anonymous_execute and not anonymous_direct_execute and not public_execute,false)
    as function_checks_passed from facts
)
select *, count(*) over ()=5 and bool_and(function_checks_passed) over () as all_checks_passed
from checked order by signature;
