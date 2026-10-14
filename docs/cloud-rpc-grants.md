# Authenticated-only cloud RPC grants

## Reported blocker and cause

On October 13, 2026, the user reported direct `anon` EXECUTE ACL entries on all
five public Cosmifold RPCs. Effective anonymous and authenticated execution were
both true; the membership audit ruled out inherited access as the cause.
The original applied metadata migration explicitly revoked PUBLIC/anon access.
The strict Phase A inventory therefore correctly rejected the live grants.

The current Supabase dashboard **Exposed functions** control changes PostgreSQL
ACLs, rather than maintaining a separate role-neutral API allowlist. Its
[mutation](https://github.com/supabase/supabase/blob/master/apps/studio/data/privileges/update-exposed-entities-mutation.ts)
calls a [SQL builder](https://github.com/supabase/supabase/blob/master/packages/pg-meta/src/sql/studio/database/privileges.ts)
that grants EXECUTE to `anon, authenticated, service_role` for every overload of
the selected function name. Turning exposure off revokes those roles together.
This confirms the mechanism can produce the observed grants and reintroduce
them; the exact past dashboard action cannot be established from ACLs alone.

## Correction, prepared by Codex and subsequently verified by the user

The user subsequently corrected the live RPC grants and completed Phase A.
Anonymous execution was rejected for all five RPCs and authenticated execution
passed. Full identity/privacy validation and guarded cleanup are recorded in
[the Phase A checkpoint](cloud-boundary-integration.md). Codex applied no SQL.
The procedure below remains the setup reference, not a request to rerun a fix.

Review and manually apply
[202610130001_cloud_metadata_rpc_grants.sql](../supabase/migrations/202610130001_cloud_metadata_rpc_grants.sql).
It is an idempotent transaction targeting only the five approved signatures:
revoke EXECUTE from PUBLIC and anon; grant EXECUTE to authenticated; notify
PostgREST to reload its schema cache at commit. A missing signature fails the
transaction rather than skipping it. No function bodies, private permissions,
RLS, schemas, tables, metadata or fixture identities change. The historical
migration remains untouched.

Existing explicit `service_role` and owner privileges remain untouched. Retain
those existing administrative rights; no additional service-role grant is needed
for this correction. Removing PUBLIC access necessarily removes rights that
were available solely through PUBLIC, for every role. No browser receives a
service-role key. EXECUTE alone does not bypass these INVOKER functions' caller
checks or grant missing private-helper/table permissions; this is not a new
service-role data-management API. Ordinary database administration remains with
the function owner/privileged SQL Editor role.

**Do not use the Exposed functions grant/revoke toggles or bulk exposure actions
on these RPCs afterward.** The authenticated-only configuration can appear as
`custom`, rather than fully `granted`; that is intentional. Authenticated RPC
reachability comes from its EXECUTE grant in exposed `public`, not from making
the dashboard indicator fully granted. Read-only dashboard inspection is fine.
Keep automatic exposure disabled and `cosmifold_private` outside exposed schemas.
Do not toggle exposure to resolve a stale cache or cosmetic dashboard status.

Manage future grants through reviewed, signature-specific migrations and rerun
the audits after administrative exposure changes or function recreation. A later
dashboard grant can override any SQL correction; this migration does not install
an event trigger or alter project-wide default privileges to prevent that.

## Exact manual fix and resume sequence

1. Keep the diagnostic tab, A1/A2 fixtures and session storage intact. Do not run
   preparation, Step 3 or cleanup. Stay signed in as account A.
2. In the same project's Supabase SQL Editor, using the ordinary administrative
   SQL Editor role, paste and run the entire **new corrective migration** linked
   above. This is the only write step; it changes grants, not Cosmos data.
3. Run [cloud-rpc-grants-postfix.sql](../tests/database/cloud-rpc-grants-postfix.sql).
   Require exactly five rows, each with `function_exists`, `security_invoker`,
   `authenticated_execute`, `function_checks_passed` and `all_checks_passed` true;
   `anonymous_execute`, `anonymous_direct_execute` and `public_execute` false.
   `service_role_execute` is informational, not a reason to broaden grants.
   If anything fails, stop and retain the fixtures; do not edit audit results.
4. Run the existing read-only
   [cloud-api-surface-audit.sql](../tests/database/cloud-api-surface-audit.sql)
   afresh. This additionally checks all public browser-accessible signatures,
   tables/aliases and the six private tables' forced RLS state. Every approved
   function must report `anonymous: false`, `authenticated: true` and
   `securityDefiner: false`. No unexpected overload/helper/relation is acceptable.
5. Refresh the diagnostic in the **same tab and origin** if needed. Refresh keeps
   `cosmifold:dev:cloud-boundary:v1` and its A1/A2 identities; it clears only the
   in-memory inventory. Paste the fresh complete surface-audit JSON into
   **Read-only API inventory**, then press **Use read-only inventory**.
6. Press **Check current account API privacy** (button 2). Do not press
   **Prepare/check A1 and A2**. It uses the existing verified operations and
   fixtures, proves authenticated RPC reachability/anonymous rejection over HTTP,
   then checks GraphQL. Proceed to button 3 only after button 2 completes.

The read-only grant audit is not an HTTP test. GraphQL/privacy and account B
remain live gates, and the guarded fixture cleanup procedure is unchanged.
Codex did not connect, apply SQL, execute either audit or change the live project.

## Local validation

On October 13, 2026, 175 focused cloud/gateway Node tests passed, including four
new grant-correction checks. These check exact signature/role scope, modeled
idempotence, anonymous/PUBLIC denial, authenticated access, preservation of
explicit administrative/unrelated grants and the read-only audit's fail-closed
structure. They are static/ACL-model tests, not PostgreSQL execution. The existing
Phase A mocked diagnostic tests passed unchanged. `git diff --check` also passed.
The corrective migration and post-fix audit still require the manual live steps
above; no new browser behavior was introduced or browser suite rerun for this
SQL/documentation-only correction.
