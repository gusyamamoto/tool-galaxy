# Review the remaining GraphQL administration helper

**Final live checkpoint:** the user completed Phase A, including both caller
classes' exact stock disabled-GraphQL proof and account/Universe isolation.
Guarded cleanup returned `test_universes_removed = 3`, diagnostic cache check
`[]` and marker `null`. No helper permission fix or function change was needed.
The following investigation is retained as history/reference; the live blocker
is closed. See [the completed checkpoint](cloud-boundary-integration.md).

**Review completed by the user:** the live audit confirms the stock INVOKER
event-trigger helpers and disabled ordinary placeholder. The next diagnostic
implements [an exact stock configuration proof](cloud-graphql-disabled-proof.md).
The investigation and conditional permission proposal below describe the earlier
checkpoint; no permission change is required or recommended for this verified
stock configuration. No migration was authored or applied for the helpers.

The user reports the disabled-engine proof stopped at
`extensions.grant_pg_graphql_access()`. Existing REST/RPC boundaries passed;
A1/A2 remain intact, Step 3 has not started and cleanup has not run.

## What the platform source establishes

Supabase's [published PostgreSQL schema](https://github.com/supabase/postgres/blob/develop/migrations/schema-17.sql)
defines this zero-argument PL/pgSQL function as **RETURNS event_trigger**. The
`issue_pg_graphql_access` event trigger invokes it on extension creation. In that
version it checks the DDL event for `pg_graphql`, then recreates
`graphql_public.graphql`, adds that wrapper to the extension and grants schema
USAGE / `graphql.resolve` EXECUTE to platform/browser roles. Older platform
versions also changed GraphQL default privileges. It is administrative machinery,
not a Cosmos read or ordinary user command. It does change database state when
run in its legitimate administrative event-trigger context.

This is upstream source evidence, **not a claim about this project's exact body,
owner, security mode or grants**. Those require the audit below.

The preceding catalog audit reports effective EXECUTE plus schema USAGE. That is
a privilege prerequisite, not proof of successful function invocation. PostgreSQL
rejects ordinary PL/pgSQL calls to `trigger` / `event_trigger` return types before
the body executes; see the [PostgreSQL compiler check](https://github.com/postgres/postgres/blob/master/src/pl/plpgsql/src/pl_comp.c)
and [event-trigger documentation](https://www.postgresql.org/docs/current/plpgsql-trigger.html#PLPGSQL-EVENT-TRIGGER).
Creating an event trigger requires [superuser authority](https://www.postgresql.org/docs/current/sql-createeventtrigger.html).
An EXECUTE ACL entry does not confer that authority, extension-install privileges,
or the ability to fabricate the backend event-trigger call context through JSON
or RPC parameters. Legitimate DDL could still fire registered event triggers:
the role and DDL privileges matter, and unrelated privileged SQL-execution or
SECURITY DEFINER wrappers would require separate review.

## Exact read-only inspection

Run [cloud-graphql-helper-audit.sql](../tests/database/cloud-graphql-helper-audit.sql)
manually in the same project's SQL Editor, under its administrative SQL role.
It calls catalog inspection functions only, never the target/helper/GraphQL
resolver. It reports exact zero-argument target existence and all related
functions/overloads, including GraphQL schemas and extension dependencies.

For each it reports owner, language/handler, return type/routine kind, volatility,
security mode, raw `proconfig`/fixed search path, PUBLIC execution and effective
anon/authenticated/service-role EXECUTE and schema USAGE, explicit ACL entries,
definition/body, registered event triggers and catalog dependencies. PUBLIC is
not a login role: its EXECUTE entry is read directly from the effective ACL,
including PostgreSQL's default PUBLIC EXECUTE when `proacl` is null. Definitions
are inspected, not executed. Text indicators flag grant/DDL/data-write/dynamic
SQL statements for human review; they do not prove a body is free of side effects.
PL/pgSQL/dynamic references may be absent from `pg_depend` even when the body
mentions `pg_graphql`. A null fixed search path is reported rather than assumed
safe. Review any custom definitions locally before sharing, because custom
function bodies can themselves embed credentials.

## Decision before changing anything

The diagnostic gate remains unchanged and blocked. No corrective migration is
authored/applied without the live type/body/ACL facts.

If the exact target is the documented PL/pgSQL event-trigger function, its grant
qualification is **not ordinary RPC callability**. Do not revoke platform helper
privileges blindly. A possible precise diagnostic correction, after live review,
would distinguish trigger-only routines from ordinarily callable functions using
exact catalog type/language evidence. That is not an exception based on a name
or disabled extension. It must still inventory other functions and reject any
ordinarily callable GraphQL resolver, wrapper or administrative routine until
its implementation/exposure is independently proved safe. The absent-extension
catalog and all existing HTTP negative probes remain necessary.

If this project's helper instead has an ordinarily callable return type (such
as void/jsonb), and its body changes grants/DDL for browser callers, a permission
fix is warranted. The smallest proposed correction would be a new idempotent
transaction revoking EXECUTE on its **confirmed exact signature** from PUBLIC,
anon and authenticated, preserving existing explicit owner/service-role rights.
Do not grant authenticated back, change its body or alter platform event triggers.
Apply nothing until the body, ownership and legitimate platform usage have been
reviewed. No such conditional proposal is an approved/applied SQL correction.

The proposed SQL, **only if that ordinary-callable administrative exposure is
confirmed**, would be a new migration containing:

```sql
begin;
revoke execute on function extensions.grant_pg_graphql_access()
  from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
```

This deliberately grants nothing new and preserves explicit service-role/owner
rights. It is not recommended for the stock trigger-only function solely because
its ACL includes PUBLIC execution; inspect the live facts first. The snippet is
a review proposal, not a runnable audit or a migration file to apply now.

## Next manual action

Keep this diagnostic tab, A1/A2 session marker and cleanup SQL. Run only the new
read-only inspection and review `exactTarget` plus
`browserGrantQualifiedFunctions` (including any `graphql_public.graphql` stub).
Share the relevant catalog/type/grant/body result after checking it contains no
custom embedded secrets. Do not call the helper, enable GraphQL, revoke grants,
rerun preparation, start Step 3 or clean up.

Refreshing the same tab/origin preserves the existing fixture identities; audit
inputs are in-memory and need reapplying later. Step 2 remains blocked until this
inspection is reviewed and the precise permission-vs-callability distinction is
resolved. The known HTTP disabled error alone never satisfies that review.

Local validation: 184 focused cloud/gateway Node tests passed, including two
new read-only audit/gate-preservation checks; `git diff --check` passed. SQL was
authored and statically checked only, not compiled/executed against PostgreSQL.
No diagnostic implementation, browser behavior, migration or live grants were
changed for this inspection task. No browser suite rerun was needed.
