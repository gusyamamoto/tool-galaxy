# Exact stock disabled GraphQL proof

**Live checkpoint complete:** the user reports this exact reviewed catalog/helper
and HTTP proof passed for anonymous and authenticated callers during completed
Phase A. Guarded cleanup returned `test_universes_removed = 3`, exact diagnostic
cache verification `[]` and the Phase A marker `null`. See
[the full identity/privacy checkpoint](cloud-boundary-integration.md).
Codex executed no live requests/SQL. This is proof of the current disabled
configuration, not a future enabled engine; no further Phase A resume is needed.
The procedure/variant investigations below remain the reference for future tests.

The user has reviewed the live helper inspection: no `pg_graphql` extension;
two Supabase-owned PL/pgSQL INVOKER event-trigger helpers; only the ordinary
`graphql_public.graphql(text,text,jsonb,jsonb)` disabled placeholder. The HTTP
endpoint reports the disabled-engine error. This checkpoint authorizes verifying
that **exact stock configuration**, not accepting arbitrary executable helpers.

## Acceptance contract

All of the following are required in the development diagnostic:

1. Fresh read-only GraphQL surface catalog: extension absent/version null and no
   browser-accessible GraphQL-schema relations. The ordinary REST catalog still
   verifies only the five approved Cosmifold RPCs.
2. Fresh complete helper inspection: exactly three related routines, with no
   extra overload/function, and the same identities/grants/security modes/results
   as the surface catalog. Both inputs expire after 20 minutes; a replacement
   that fails validation clears that input's accepted proof.
3. `extensions.grant_pg_graphql_access()` and
   `extensions.set_graphql_placeholder()` must be zero-argument, volatile,
   Supabase-admin-owned PL/pgSQL INVOKER functions returning `event_trigger`.
   They must have exactly the reviewed enabled Supabase-owned event registrations:
   `issue_pg_graphql_access` / `ddl_command_end` / `CREATE EXTENSION`, and
   `issue_graphql_placeholder` / `sql_drop` / `DROP EXTENSION`. The grant helper
   requires fixed empty search_path; other routines allow only stock absent or
   fixed-empty path settings. Browser roles must remain non-superuser/no-RLS-bypass.
4. Both trigger bodies must match the reviewed
   [Supabase stock implementation](https://github.com/supabase/postgres/blob/develop/migrations/schema-17.sql)
   retained in `dev/cloud-graphql-stock.js`. Nothing is executed. The classifier
   distinguishes trigger context from ordinary calls rather than ignoring ACLs.
5. The only ordinary routine is the exact four-argument `graphql_public.graphql`:
   Supabase-admin-owned, volatile, PL/pgSQL INVOKER, returning JSONB, with no event
   registrations. Its complete body must match the stock version-check + constant
   JSON error implementation. That permits only the documented disabled-engine
   message or legacy Postgres-version message; it does not read application data,
   write rows, run dynamic SQL or change grants/DDL. The audit's state-changing
   indicators must also be false. Keyword absence alone never establishes safety.
6. Body matching permits whitespace, SQL comments and unquoted SQL case only.
   Quoted identifier/string contents and every executable token are preserved.
   Added statements, renamed calls, changed constants and alternate bodies fail.
   This is a reviewed-template comparison, not a general SQL safety parser.
   PostgreSQL's qualified/unqualified `regprocedure` display forms are accepted
   only alongside the separately validated exact schema/name/argument identity.
7. For both anonymous and authenticated callers, all existing HTTP introspection,
   ordinary typename, private collection/mutation variants, helper fields and
   SQL-schema-qualified Universe/entry node probes must consistently return HTTP
   200 with only the disabled-engine error and no GraphQL data. No engine error,
   catalog fact or caller class proves this alone. The two callers must agree.

This results in `disabled-independently-verified`. An installed extension,
additional routine/relation, altered body/characteristic, grant inconsistency,
stale/missing proof or contradictory HTTP response remains blocked with a field
or probe-specific reason. Disabled/introspection-restricted/enabled states remain
distinct. Future platform template changes require review; they are not accepted
automatically by name, owner, return type or heuristic indicators.

Catalog evidence is operator supplied, not signed or automatically linked to the
browser project. Run all audits against this same project and keep administrative
configuration unchanged during the test. No Supabase/platform permissions or
functions are changed to satisfy this proof.

## Resume the existing A1/A2 run

1. Remain signed in as A. Refresh the **same diagnostic tab and origin**. Keep
   `cosmifold:dev:cloud-boundary:v1` and all fixture/cache/cleanup identities.
2. Run these read-only files manually in the same project's SQL Editor:
   - `tests/database/cloud-api-surface-audit.sql`
   - `tests/database/cloud-graphql-surface-audit.sql`
   - `tests/database/cloud-graphql-helper-audit.sql`
3. Paste each complete fresh JSON result into its corresponding diagnostic input:
   **Read-only API inventory**, **Read-only GraphQL catalog proof**, and
   **Stock disabled GraphQL helper inspection**. Press each input's accept button.
   Only catalog facts are retained in memory; nothing is uploaded or persisted.
4. Press **button 2 only**. Do not rerun Prepare/check A1/A2 or run cleanup.
   If both catalogs and both caller classes' probes pass, Step 2 reports GraphQL
   disabled and independently verified. Then follow the existing Step 3 flow.
   If any exact check fails, keep the fixtures and report the specific path;
   do not edit the audit JSON or alter grants/functions to force a pass.

Refreshing preserves the session marker; only accepted audit inputs are cleared.
No normal startup, local Cosmos, Backup/Restore, schema migration or cloud
activation behavior is changed by this development-only proof.

## Local validation

### Investigate a body mismatch without rerunning unrelated audits

**Resolved live set-helper mismatch:** the complete user-supplied
`extensions.set_graphql_placeholder()` body is retained in
`tests/cloud-graphql-set-body.txt`. After the existing formatting/comment/case
normalization, the only difference from its reviewed stock template is:

```diff
 returns jsonb
 language plpgsql
+set search_path to ''
 as $$
```

This clause belongs to the **CREATE FUNCTION definition for the regenerated
`graphql_public.graphql` placeholder**. It hardens that future function's name
resolution; it is not a global/session SET or a change to the event-trigger
helper's own configuration. The constant error-returning body, version branch,
signatures and DDL/drop handling are identical. This is a legitimate explicitly
reviewed stock-body hardening variant, not whitespace-only normalization or a
new data-access/mutation capability. No specific platform release is inferred
from the body alone, and no Supabase function/grant change is required.

The set-helper matcher now accepts exactly two complete templates:
`schema-17-default-placeholder-path` and `fixed-empty-placeholder-path`. The
second inserts only the fixed-empty-path clause at the reviewed CREATE FUNCTION
location; quoted `$$` delimiters are preserved literally. Other search paths,
new clauses/statements, altered calls/errors and metadata/ACL/trigger deviations
remain blocked. The grant-helper variants and ordinary placeholder validation
are unchanged. Both accepted helper variant names are shown in the status UI.

Refresh the **same diagnostic tab/origin** to load the matcher, retaining the
existing JSON inputs. Reapply the already accepted ordinary API inventory and
GraphQL catalog JSON rather than rerunning those SQL audits solely for this fix.
**The same helper JSON is reusable** if still within its existing 20-minute
freshness bound; only expired GraphQL evidence requires a new read-only SELECT.
Refresh preserves A1/A2, marker, cache/operation identities and cleanup guards;
it clears only in-memory audit acceptance. Run button 2 only after acceptance.
No audit or live fixture is invalidated by this diagnostic-only body correction.

Local validation: 200 focused cloud/gateway Node tests and 39 mocked Phase A
browser checks passed. These compare the
supplied set-helper body with the full stock template, accept both exact variants,
exercise both live helper bodies together through both HTTP caller classes and
prove unchanged fixture state/receipts/caches. Browser checks use both supplied
body fixtures. No live requests or SQL were executed by Codex.

**Resolved live grant-helper mismatch, October 13, 2026:** the user supplied the
complete body, retained verbatim as `tests/cloud-graphql-grant-body.txt`. Apart
from supported formatting/comments, the only executable difference is:

```diff
- from pg_event_trigger_ddl_commands() ev
+ from pg_catalog.pg_event_trigger_ddl_commands() ev
```

This is an explicitly reviewed catalog-qualified stock-body variant, not merely
whitespace normalization. With the verified fixed-empty search path, it selects
the same PostgreSQL built-in; [pg_catalog is implicitly searched](https://www.postgresql.org/docs/current/ddl-schemas.html#DDL-SCHEMAS-PATH).
No other token, statement, resolver call or grant differs. The body alone does
not identify a specific Supabase release. No platform function change is needed.

The matcher now accepts exactly two complete grant-body templates:
`schema-17-unqualified-ddl-helper` and `catalog-qualified-ddl-helper`. The second
is constructed from the first by this single fixed substitution. Normalization
still does **not** strip schema qualifiers generally; changing another schema,
call, statement or grant remains rejected. Other helper/placeholder templates,
metadata/ACL requirements and HTTP probes are unchanged. The accepted variant
is named in the development-only status message.

To load the updated matcher, refresh the same diagnostic tab/origin after keeping
copies of the existing three JSON inputs. Refresh preserves A1/A2 and cleanup
identities but clears accepted in-memory proofs. **Reapply the existing ordinary
API JSON; do not rerun that unrelated SQL audit solely for this correction.**
Reapply the GraphQL surface/helper JSONs if still within their existing 20-minute
freshness bounds. Only expired GraphQL evidence needs a new read-only SELECT;
no audit is invalidated by this code change or helper rejection. Run button 2
only after accepting the inputs. If the next helper has a different body, keep
that check blocked and inspect its exact difference separately.

Local validation: 197 focused cloud/gateway Node tests and 38 mocked Phase A
browser checks passed, including exact
comparison of the user-supplied body, both original/new variant acceptance,
material mutation rejection and unchanged A1/A2/receipts. Browser checks use the
supplied body fixture rather than generating it from the production template.

An error at `functions(extensions.grant_pg_graphql_access).body` identifies a
normalized body mismatch but does not classify it as an upstream stock variant
or material change. The live `body` value must be compared; the description
"stock helper" is not enough to register an exact variant. The resolved variant
above was accepted only after the complete live body was supplied and compared.

The rejection now includes the first differing normalized token index, token
counts and a short expected/received context. SQL string literals are withheld;
raw bodies are never copied to diagnostic output. Formatting-only differences
already supported by the matcher remain accepted, and an unknown difference
remains blocked. Review the existing helper-audit JSON/body before deciding on a
new explicitly sourced variant or a correction to normalization.

Retrying the helper input does not clear accepted API/GraphQL surface inventories
and requires no automatic query or audit rerun. A refresh clears in-memory inputs,
so reapply saved existing JSONs rather than unnecessarily rerunning SQL. Refresh
only expired GraphQL evidence (20-minute bound), or evidence invalidated by an
actual configuration change; the ordinary API inventory has not been invalidated
by this body error. Existing A1/A2 identities/cleanup guards remain untouched.
Local checks for this failure-detail adjustment passed 195 focused Node tests and
`git diff --check`; no live function body was obtained or SQL executed by Codex.

189 focused cloud/gateway Node tests and 34 mocked Phase A browser checks passed.
The focused cases include complete stock acceptance, a missing second catalog,
body/owner/language/security/signature/registration changes, extra routines,
mismatched role grants, the reviewed legacy message and fixture-marker/data
preservation. Mocked browser checks cover the new inspection input, both HTTP
caller classes, account switching, absence of real project/CDN requests and
desktop/narrow/mobile layout. `git diff --check` passed. No live diagnostic or
SQL was executed by Codex; the user still needs the manual Step 2 rerun above.
