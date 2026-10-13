# Reversible Supabase SQL Editor validation

Run manually from the real Supabase SQL Editor only after reviewing this file
and the SQL. Codex has **not connected or executed the validation**. At the SQL
validation checkpoint, the approved migration, database suite, Auth and
application code were unchanged. Subsequent gateway work is linked below.

Use [cloud-metadata-sql-editor.sql](../tests/database/cloud-metadata-sql-editor.sql).
It is generated from the approved migration/test suite by
`node scripts/build-cloud-validation.js`; do not paste the template or original
psql test file into SQL Editor. The generated file includes everything it needs.

## Real Supabase runtime checkpoint

**Subsequent installed checkpoint:** the user has now permanently installed the
unchanged migration and verified all six private tables, all five public RPCs,
forced RLS, private-schema exclusion, zero exposed private tables, disabled
automatic table exposure and Data API extra search path `public, extensions`.
Codex did not perform that installation. The rollback-only result below remains
the evidence for the earlier SQL validation run. The subsequent live Step 4
JWT/HTTP checkpoint and cleanup are recorded below and in
[the gateway documentation](cloud-metadata-gateway.md).

**Live Step 4 checkpoint, recorded October 12, 2026:** the user reports that
anonymous list/read were rejected; authenticated list succeeded and initially
returned 0 Universes; explicit empty-Universe creation succeeded; authenticated
list then included it; and authenticated read returned revision `0`. No local
Cosmos metadata was uploaded. The generated guarded cleanup SQL returned
exactly **1 row**, confirming the disposable Universe was removed. Codex did
not connect to Supabase or execute these requests or the cleanup SQL.

This proves the tested public RPC list/create/read HTTP boundary for that
account, including anonymous denial. It does not prove direct private-table or
GraphQL HTTP exclusion, another authenticated owner's isolation over HTTP or
independent-session locking. The later Step 5 checkpoint below closes bounded
commit/receipt HTTP behavior, but not those remaining isolation/exposure/race gaps.

**Live Step 5 checkpoint:** the user reports an empty disposable Universe at
revision `0`, one semantic commit reaching `1`, real receipt reconciliation of
its deliberately withheld successful reply, exact committed-data read at `1`,
and a receipt matching the original operation/revision. Repeated reconciliation
returned the same acknowledgement without a second semantic mutation. A fresh
operation with stale base `0` was rejected, leaving metadata and revision `1`
unchanged. No local Cosmos data was uploaded. The generated guarded cleanup
returned **`test_universe_removed = true`** in SQL Editor.

Codex did not connect or execute these requests/cleanup. This is user-reported
live evidence for the bounded commit/read/receipt/stale-write path and cleanup,
not proof of actual network loss, delayed original requests or multiple-session
locking. See [the repository checkpoint](cloud-metadata-repository.md).

The user reports that the generated validation ran successfully in the real
Supabase SQL Editor. This is user-supplied runtime evidence; Codex did not connect
to the project or execute SQL.

Reported result:

```text
PASSED: migration and single-session assertions; scratch objects removed
```

The user then independently verified cleanup:

| Check | Reported result |
| --- | --- |
| `private_schema_exists` | `false` |
| `cosmifold_rpc_count` | `0` |
| `scratch_auth_user_count` | `0` |

This closes the actual PostgreSQL compilation and single-session database/security
gate for the validated artifact: INVOKER calls/grants, role/claim simulation,
A/B/anonymous isolation, constraints, serial revision/retry behavior, compound
rollback and scratch cleanup passed. **At that validation checkpoint** the
migration was not permanently applied; schema/RPCs and scratch users were absent
after rollback. The subsequent authorized installation is recorded above.

Still unverified: genuine transport-loss/delayed-request reconciliation cases,
second-owner HTTP isolation, direct private-table/GraphQL HTTP
exclusion, independent-session locking/races, broader rich/compound commands
over real HTTP, historical parser edge cases and
realistic database performance. JWT/HTTP list/create/read and anonymous denial
and bounded commit/receipt/stale-write checks have passed as recorded above;
those successes do not close the remaining gates.

**Readiness:** the SQL runtime gate passed, the unchanged migration was
subsequently installed by the user with the intended API configuration, and
Steps 4/5's bounded live RPC and cleanup gates have passed. **Step 5 is ready
to commit as an inactive repository foundation.** Remaining HTTP/concurrency,
durable pending-work recovery and Step 6 scoped cache/bootstrap are separate
gates before production cloud use. This documentation update does not authorize or perform
database changes, cloud activation or deployment.

## Runtime review

| Area | Finding / validation |
| --- | --- |
| DDL/grants | CREATE SCHEMA, tables, functions, policies and grants are transactional. The original migration ends in COMMIT; wrapping it verbatim would be unsafe. The runner removes only its outer transaction wrapper and copies its body exactly. |
| SQL Editor role | Use the normal administrative role, usually `postgres`. It needs DDL, Auth fixture insertion and SET ROLE permission. Tests switch to real `authenticated`/`anon` roles; administrative reads alone would not prove RLS. |
| FORCE RLS | Forced RLS does not constrain superuser/BYPASSRLS roles. The runner rejects privileged application roles and the suite exercises the non-owner authenticated role. Internal FK checks intentionally bypass RLS; composite keys still constrain scope. |
| `auth.uid()` | The suite supplies transaction-local synthetic claims, switches database role and checks the resulting UUID. This tests SQL behavior, not JWT issuance/signature verification or the HTTP role mapping. Missing subject and wrong-owner scope are tested. |
| INVOKER permissions | Authenticated callers need private schema USAGE, helper EXECUTE and the granted table/column privileges. Reads use row locks requiring UPDATE privilege on the Universe; revision/flags UPDATE supplies that permission. Ordinary owner/ID reassignment is not granted. Effective privileges are checked. |
| Fixed search path | Authored functions are INVOKER with `search_path = ''`; domain/Auth names are qualified, built-ins resolve through `pg_catalog`. No DEFINER is required or introduced. SQL compilation/calls must verify these assumptions in the actual engine. |
| Default EXECUTE | Supabase's default function grants may include PUBLIC/anon. Migration revocations are tested through effective privilege checks and anonymous calls, including inherited grants. Unexpected role inheritance is a failure, not a reason to broaden grants. |
| Deferred constraints | Composite FKs and order/pair constraints need to defer during batches; PK arbiters used by ON CONFLICT are nondeferrable. Tests exercise valid ordinal swaps, explicit deletes and forced FK checks. Named constraints are checked before acknowledgement. |
| Tree recursion | Root reachability must count every canonical row, including archived data; cycles/missing parents are rejected. Archive expansion and reference checks must not filter/repair data. The suite exercises these paths and compound rollback. |
| JSONB/digest | SHA-256 is computed by PostgreSQL over JSONB text. Object formatting/order is normalized; array order and some numeric spellings can affect the digest. Reuse must retry an immutable original command. Identical/different-content retries are tested. |
| Revision/receipts | One Universe row lock encloses validation, changes, revision and receipt. Receipt lookup precedes CAS. No-op and replay behavior are tested serially; actual waiting/races require independent sessions. |
| Result states | Owned empty results differ from absent results. Owner-scope mismatch is forbidden. A foreign UUID queried under the caller's own claimed scope is deliberately indistinguishable from absence, preserving RLS privacy. |
| Strings/parsers | PostgreSQL JSONB cannot represent NUL/unpaired surrogates that JS may accept. Its date/HTTP URL validation differs from JS parsing on edge cases. No silent repair occurs; historical ingestion needs parity tests before use. |

The user-reported real runtime validation passed without a migration edit.
**No migration change was made to obtain a passing test.** If later
compilation/permission/assertion errors appear, identify the statement and cause
before proposing a migration edit. Do not add DEFINER, broad grants or schema
exposure just to make an INVOKER call succeed.

## The private API boundary is a configuration dependency

`USAGE` plus SQL table permissions do **not** automatically expose a schema in
PostgREST. Its exposed-schema list selects the available browser table API.
However, adding `cosmifold_private` to that list would make owner-authorized direct
writes possible, bypassing the RPC revision/integrity protocol. RLS still
protecting A from B would not make that configuration acceptable.

Check both Dashboard Data API settings and any `authenticator` role/database
`pgrst.db_schemas` override or `pgrst.db_pre_config` hook. Role overrides can differ
from the dashboard. The runner scans visible role/DB/session settings and refuses
explicit private exposure; missing visible settings are **unknown**, not proof of
safety. [Supabase schema configuration](https://supabase.com/docs/guides/api/using-custom-schemas),
[configuration override behavior](https://supabase.com/docs/guides/troubleshooting/pgrst106-the-schema-must-be-one-of-the-following-error-when-querying-an-exposed-schema).

Also keep `cosmifold_private` out of browser API extra/GraphQL search paths.
`pg_graphql` uses search path and permissions for visibility, so PostgREST
exclusion alone is not the complete review if GraphQL is enabled. Disabling
GraphQL **introspection** does not disable its operations. The runner examines
visible GraphQL function search-path settings but does not claim an HTTP test.
[GraphQL schema visibility](https://supabase.com/docs/guides/graphql),
[GraphQL security](https://supabase.com/docs/guides/graphql/security).

## Manual steps in Supabase

1. Open the intended project and confirm its identity yourself. Do not use a
   deployment preview or another project by accident. No password/secret key is
   needed for these dashboard steps.
2. In **Settings → Data API** (dashboard wording may vary), inspect **Exposed
   schemas**: keep `public` for the intended RPCs, and confirm
   `cosmifold_private` is absent. Inspect **Extra search path** as well; it must not
   include the private schema. Do not add it to make a request work. Review any
   GraphQL/search-path configuration and configuration override hooks.
3. Review database hooks before scratch Auth rows/DDL. The runner refuses any
   custom `auth.users` trigger. It reports enabled DDL event triggers, which
   should be inspected before running the full validation: external HTTP/service
   side effects are not undone by SQL rollback. A read-only inspection is:

   ```sql
   select tgname, tgfoid::regprocedure
   from pg_trigger
   where tgrelid = 'auth.users'::regclass and not tgisinternal;

   select evtname, evtenabled, evtfoid::regprocedure
   from pg_event_trigger where evtenabled <> 'D';
   ```

   If custom hooks are present, stop and review them; do not disable them or edit
   the runner just to pass. Supabase's normal transactional schema-cache hooks
   differ from project hooks that make immediate external calls.
4. Open a **new SQL Editor query**, using its normal administrative role (usually
   `postgres`), not authenticated impersonation. Paste the **entire generated
   `tests/database/cloud-metadata-sql-editor.sql`** and review its beginning,
   nested rollback wrapper and final `ROLLBACK`. Run the full file, never a
   highlighted DDL subsection. Do not run the original migration separately.
5. A complete run without errors means the authored SQL assertions passed. The
   script emits a success notice and, where the Editor displays it, a result row
   saying database validation passed and HTTP/concurrency were not tested. Some
   Editor versions show only the final ROLLBACK command; no-error completion is
   still distinct from the raised failures. This does not approve permanent use.
6. If an error appears, keep its SQLSTATE, stage and statement/context for review.
   Do not edit/apply the migration until the cause is explained. The inner
   exception block already rolls back scratch changes before rethrowing. If the
   Editor reports an aborted/open transaction, run `ROLLBACK;` as cleanup. On a
   manual cancellation/connection interruption, reconnect as needed and inspect
   the catalog before rerunning; transactional scratch DDL was never committed.
7. Afterward, independently confirm cleanup in a new read-only query:

   ```sql
   select to_regnamespace('cosmifold_private') as private_schema;
   select count(*) as scratch_rpcs
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (
     'cosmifold_read_universe', 'cosmifold_list_universes',
     'cosmifold_create_universe', 'cosmifold_operation_receipt',
     'cosmifold_commit_metadata'
   );
   select count(*) as scratch_auth_users from auth.users
   where id in ('00000000-0000-4000-8000-000000000001',
                '00000000-0000-4000-8000-000000000002');
   ```

   Expect NULL, 0 and 0. The runner refuses to start if these objects/fixture IDs
   already exist, so it never replaces or deletes a previous installation/user.
8. Share the result/errors. Do not permanently apply the migration, enable cloud
   mode, change Auth or deploy as part of this validation.

## Reversibility and scope

The generated runner removes the migration's top-level BEGIN/COMMIT and the
suite's psql directives/outer BEGIN/ROLLBACK. It preserves their actual SQL and
assertions and includes LF-normalized source hashes to detect drift.

One outer transaction contains an exception-protected inner subtransaction. The
inner block temporarily compiles the migration and runs the database suite and
supplemental checks. On success it deliberately raises a unique sentinel caught
by the wrapper, rolling back scratch objects **before** returning. Real failures
are rethrown; they cannot produce a fake passing result. Final outer ROLLBACK
clears local settings. Schema, public RPCs, grants, Auth fixtures and test data are
never committed. Rollback is checked before the final statement too.

Transactional rollback does not undo external trigger effects, sequence
increments or every possible provider side effect. No sequences/roles/extensions
are created here; Auth/DDL hook review is a prerequisite. The runner does not
change API schema settings, reload the provider cache or issue HTTP requests.

**One session can test:** real function compilation/calls, effective grants/RLS,
claims/role simulation, A/B/anonymous isolation, forbidden owner reassignment,
composite FKs, cycles, archives, exact projection, deferred swaps, atomic stale
and compound rejection, revision increments, identical/different-digest retry,
receipt lookup, no-ops and rollback cleanup.

**One session cannot prove:**

- Independent-session waiting, stale-writer races or lost-response concurrency.
- Actual PostgREST/GraphQL HTTP routing/schema-cache state or JWT verification.
  Uncommitted scratch objects are invisible to their separate connections; a
  concurrent HTTP 404 cannot prove schema exclusion.
- Historical string/parser parity and production-size/performance limits beyond
  the authored fixtures.

Later, in a separately approved disposable integration environment with committed
test schema, test two independent connections: hold A's write transaction open;
B's read/receipt lookup must wait; B's stale write must fail after A commits;
rolling A back must leave no changes/receipt. Test real signed-in A/B and anonymous
HTTP requests using browser-safe configuration and ordinary SDK sessions.
`Accept-Profile`/`Content-Profile: cosmifold_private` must be rejected as an
unexposed schema (`PGRST106`), not merely return empty rows or missing-table errors.
If GraphQL is enabled, verify private domain queries/mutations are unavailable.
No privileged key belongs in application code, and these later tests are not
executed or authorized automatically by this runner.

## Local checks performed

`node --test tests/cloud-validation.test.js tests/cloud-schema.test.js
tests/cloud-metadata.test.js` passed **35 tests**: deterministic generation/source
integrity, safe wrapper boundaries, rollback/failure controls, exposure/role guards,
existing SQL structural checks and projection tests. These are static/unit checks,
not execution of PostgreSQL by Codex. The separate real runtime result is recorded
above. No database tooling was installed or used by Codex.
