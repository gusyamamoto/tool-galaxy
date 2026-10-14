# Cloud identity/privacy integration — Phase A

This is an inactive, manual development diagnostic. It tests identity, Universe
isolation and the HTTP privacy boundary. It does not activate account data in the
normal app or read/upload the existing device Cosmos. **Phase A is complete and
cleaned up, according to the user's live validation report.** Node/browser tests
use fake SDK/HTTP and remain distinct from that live evidence.

## Completed live Phase A checkpoint

The user reports the final diagnostic reached
`COMPLETE: identity/Universe phase checks passed.` Codex did not connect to
Supabase, run live requests/SQL or perform cleanup.

| Live boundary | Reported outcome |
| --- | --- |
| A1/A2, same owner | Independent state/revisions/cache namespaces and identical textual entry IDs; switching and fencing passed |
| Account B against A1/A2 | Could not access either Universe |
| Account A against B1 | Could not access B's Universe |
| Delayed A response | Could not publish into B's context |
| Return to A | Reopened only after validation |
| Private REST tables / public aliases | Browser roles could not access the six private tables; no aliases exposed them |
| Public RPC surface | Exactly five approved RPCs verified; authenticated boundary passed and anonymous execution rejected for all five |
| GraphQL | Disabled and independently verified for anonymous/authenticated callers using the reviewed catalogs/helper bodies plus HTTP probes |
| Guarded database cleanup | `test_universes_removed = 3` |
| Exact diagnostic cloud-cache verification | `[]` |
| Session marker verification | `sessionStorage.getItem('cosmifold:dev:cloud-boundary:v1')` returned `null` |

This closes the tested identity/privacy gate under the current configuration;
it does not prove concurrent-writer locking, real transport-loss recovery,
cloud files or normal-app activation. GraphQL evidence concerns the reviewed
**disabled** surface, not a future enabled engine. Grant/exposure/extension
changes require renewed boundary checks.

A1/A2/B1 are removed; do not resume their old identities or rerun their cleanup.
No additional Auth-account deletion was reported or required by this checkpoint.
The next proposed bounded phase is
[Phase B: revision concurrency and idempotency](cloud-activation-gates.md).
This documentation checkpoint passed 200 focused local cloud/gateway tests and
`git diff --check`; those checks made no live requests and did not rerun cleanup.

## Before running

**Resolved RPC-grant checkpoint:** the real follow-up audit confirmed direct EXECUTE
grants to anon on all five RPCs. The
[targeted correction](cloud-rpc-grants.md) records the resolution and setup precautions.
The user subsequently corrected and verified the grants; Codex did not apply
the correction. Do not use the
dashboard function-exposure toggle to make authenticated-only grants fully
granted; that action grants anonymous execution again. Existing A1/A2 identities,
strict inventory validation and guarded cleanup were preserved through validation.
The Phase A fixture/cache/marker cleanup is now complete as recorded above.

Use the already configured project and local origin, for example
`http://127.0.0.1:5500/`. Serve the existing repository root. Open the normal app
and `/dev/cloud-boundary-diagnostic.html` in separate tabs at that exact origin.
The diagnostic refuses non-loopback origins and makes no requests on page load.
Do not deploy this page or connect any new services for this test.

You need **two distinct real authenticated users**. Account A can be your existing
test account. If no separate suitable account B exists, manually create a
disposable B through the normal Create account flow, confirm its email if
required, then sign out B and sign in A before testing. Keep passwords in your
normal browser/password manager; do not paste credentials or tokens into the
diagnostic, code, SQL, tools or chat. Do not use a server/service-role key.

Review the installed schema and expected API configuration: only the five public
Cosmifold RPCs, no exposed `cosmifold_private`, no public aliases for its six
tables. This branch changes none of those settings. Do not change configuration
to get a green diagnostic. The diagnostic inspects the actual REST/GraphQL HTTP
responses; unexpected exposure or ambiguous failures stop the check.

## Exact live order

### Recover after accidentally repeating completed Step 1

The user reports `SESSION_CHANGED` after clicking preparation again with A1 at
stage/revision 2 and A2 at 1. That code comes from the metadata gateway's
**post-response identity fence**, not marker validation. It means a read's session
could not be revalidated, or its user/context generation changed. A same-user
sign-out/sign-in cycle also changes generation; ordinary same-user token refresh
alone does not. The old code discards the underlying identity-check failure, so
the report cannot establish which event actually occurred. Do not bypass it.

With these completed marker stages, the old preparation path skips Universe
creation and semantic commits. It can still read metadata/receipts, bootstrap
scoped caches and stage/remove its never-dispatched synthetic pending marker.
Therefore unchanged displayed IDs/revisions are evidence of preserved marker
identities, not proof of unchanged live metadata or clean caches. They remain
reusable candidates; verify them read-only before resuming.

The new completed-preparation guard returns `A_FIXTURES_ALREADY_PREPARED` before
any RPC/cache/marker write. It does not retry, recreate, change IDs or bypass
session checks. The new **Verify existing A1/A2 (read-only)** action requires the
original account A, exactly the two completed fixture markers and no held account
switch. It reads both exact server projections and all three original receipts;
it checks the acknowledged scoped caches with no pending state. It never calls
create/commit, bootstraps a workspace, writes storage, clears a pending marker or
reconciles an uncertain operation. Any mismatch remains blocked.

Safest manual recovery:

1. Confirm the normal app is signed in as the original A. Refresh this **same
   diagnostic tab/origin**. Do not clear storage, edit the marker, rerun preparation
   or run cleanup. Refresh disposes the old in-memory context; it preserves IDs,
   revisions, operation identities, cache records and cleanup guards.
2. Click **Verify existing A1/A2 (read-only)**. Require the explicit PASS for A1
   revision 2, A2 revision 1, exact metadata/receipts and acknowledged caches.
   No extra SQL is needed before this read-only check. If session/pending/cache/
   server state verification fails, stop and share that code; do not repair or
   clear anything to continue.
3. Only after PASS, reapply all three fresh read-only audit JSONs as described in
   [the stock GraphQL proof](cloud-graphql-disabled-proof.md). Inputs are cleared
   by refresh and the GraphQL proofs expire after 20 minutes, so rerun their
   catalog SELECTs manually if needed. Click **button 2 only**. Do not start Step
   3 until Step 2 finishes.

Local validation: 193 focused cloud/gateway Node tests and 37 mocked Phase A
browser checks passed, including no-RPC repeat protection, fresh-controller
read-only recovery, same-user generation-change rejection, wrong-account denial
and unchanged pending markers. No live requests, SQL, fixture mutations or
cleanup were performed by Codex. Normal Auth/gateway/local-app behavior remains
unchanged.

### First preparation and full live sequence

1. Sign in as A in the normal app. Open the diagnostic and press **Prepare/check
   A1 and A2**. It creates two disposable Universes, each with the same textual
   entry ID `boundary-shared-entry`. A1 ends at revision 2 and A2 at revision 1,
   with distinct fixed names. It checks scoped caches, switching back, an ignored
   late A1 read, and that a synthetic A1 pending marker cannot block A2. Keep the
   printed identities and guarded cleanup SQL.
2. Press **Check current account API privacy**. It checks anonymous and
   authenticated GET/POST/PATCH/DELETE against all six tables with the explicit
   private profile; each must return HTTP 406 / `PGRST106`. Default-public table
   aliases must return HTTP 404 / `PGRST205`. Constraint errors, empty RLS-filtered
   arrays, generic 404s, network errors and 5xx do not count as exclusion.
3. The same action verifies the public RPC surface. Hosted Supabase restricts
   `/rest/v1/` OpenAPI discovery to administrative keys, even with a signed-in
   user. The previous diagnostic incorrectly expected browser access; see
   [Supabase's documented gateway change](https://github.com/supabase/supabase/pull/45462).
   Do **not** supply a secret key or change access settings. Instead run
   [cloud-api-surface-audit.sql](../tests/database/cloud-api-surface-audit.sql)
   manually in this same project's SQL Editor. It is a single read-only SELECT
   over catalogs/permissions, including column grants, without keys or domain
   rows. Copy the `cloud_api_surface_audit` JSON result into the diagnostic's
   **Read-only API inventory** section and press **Use read-only inventory**.
   It must contain exactly the five authenticated INVOKER signatures, no
   anonymous function grants, no browser-accessible public relations, and the
   six forced-RLS private tables. Extra functions/overloads/helpers or public
   relations fail validation. Run this fresh and keep schema/grants/API settings
   unchanged during the diagnostic. This is operator-supplied catalog evidence,
   not automatic HTTP enumeration or a cryptographically verified attestation.
   The browser independently calls all five approved RPCs and probes all sixteen
   private helper names as anonymous/authenticated callers. Create uses only the
   already verified fixture UUID; commit replays a receipt-checked original
   operation with identical content. No new fixture, operation, receipt or
   revision is created. Current state is checked before/after. Missing catalog
   evidence remains blocked; a 401/403 OpenAPI response alone is never a pass.
   Successful but malformed OpenAPI and other HTTP failures remain unverified.
   If legacy browser OpenAPI is available, its exact allowlist is still checked.
   All five anonymous RPC calls must still be rejected.
4. It also inspects GraphQL types/fields, probes ordinary and inflected private
   read/mutation names, and uses schema-qualified node IDs for the known private
   Universe/entry. Private exposure is a failure. A 404 on both GraphQL query and
   mutation is reported as **endpoint unavailable**, not as proof the extension
   is disabled. Verify the intended dashboard state separately in that case.
   Blocked introspection, invalid responses or other ambiguous failures remain
   unverified, not a pass. Read/mutation probes run only after introspection finds
   no private fields; unexpected exposure stops before mutation probing.
5. While still A, press **Hold A response for account switch**. It leaves a
   synthetic never-dispatched pending command in A2's test cache and holds a
   completed real A1 read outside its publication boundary, for at most three
   minutes. Keep this page open. In the normal app tab, sign out A and sign in B.
6. Within the hold window, press **Check account B**. B must not see A's cached
   state. A1 under B's scope must be absent. The diagnostic creates B1 at revision
   1 with the same textual entry ID, opens B1, then releases the old A response:
   no late publication/cache change is allowed. Raw HTTP attempts—not just the
   gateway's client-side guard—test list/read/receipt/commit/create against A1/A2.
   They test both A's actual scope and B's own owner ID paired with A's Universe.
7. Repeat **Check current account API privacy** while signed in as B.
8. In the normal app tab, sign out B and sign back into A. Press **Check returning
   account A**. Raw HTTP proves A cannot access B1. A1's cache must be unchanged;
   A2's original synthetic pending identity must remain scoped and block A2,
   rather than B. Because this fixture command is explicitly never dispatched,
   its absence is checked and only that synthetic marker is removed. Real
   uncertain operations must never be cleared this way. Owned bootstrap then
   validates A1/A2 before reopening; all server fixture states are checked.

No real network-loss or uncertain-commit recovery is simulated. Pending markers
are validated, device-only test fixtures, never sent to `commit_metadata`.
Universe/account transitions use the existing workspace generation fencing,
native scoped cache locks and shared Auth client. B's absence probe may create
an empty acknowledged cache record under B + A1, which is printed for cleanup.

If anything stops, retain fixture IDs/SQL and stop rather than force deletion,
retry mutation buttons or restart preparation blindly. A mutation timeout may
have committed. Stage-specific cleanup deliberately refuses a different server
state; review/reconcile the outcome before regenerating an appropriate guard.
If the three-minute hold expires, the late-response test did not complete:
review the fixture pending markers before a deliberate rerun. Reloading loses
the held response; the session marker retains identities, not a resumable test.

### Resume the reported Step 2 stop

Your Step 1 A1/A2 identities and session marker are unchanged. Since Step 3 was
not started, refresh this **same tab at the same origin**, stay signed in as A,
and do not press Prepare/check A1/A2 or clear storage. Run the read-only SQL audit
manually, paste only its JSON result into the inventory section, apply it, then
press button 2 again. This validates/replays only the existing fixed fixture
operations and proceeds to GraphQL after the surface checks pass. Continue to
button 3 only after button 2 finishes. Inventory input is held only in memory;
refresh clears it, not the fixture marker or cleanup identities.

Inventory parsing uses the same canonical seven-field object emitted by the SQL
audit. The JSONB cell itself, its JSON string, and SQL Editor's exact one-row
`[{"cloud_api_surface_audit": {...}}]` export are supported. The named-column
wrapper is unwrapped before security validation; extra rows/columns are rejected,
not discarded. Argument expectations are defined once in the diagnostic contract
and reused by mocks. The SQL query/security assertions are unchanged.

If inventory is rejected, the page now reports the exact path/condition and
expected/received catalog value. Missing, unexpected or duplicate RPC/table names
are distinguished. A signature/grant/RLS mismatch remains a failure; do not edit
the result to satisfy the validator. Refresh this same tab, paste the existing
complete result again and apply it. If rejected, share only the field-specific
message (no keys, tokens or headers).

The subsequently supplied live JSON is already canonical and has the correct
tables, RLS flags, signatures, INVOKER flags and schema existence. Its exact
rejection is `publicFunctions[0](cosmifold_commit_metadata).anonymous`: expected
`false`, received `true`. **All five public RPCs report anonymous effective
execution.** Neither the audit query nor that validator assertion is wrong.
The generic UI hid a real least-privilege mismatch. The approved migration
revokes PUBLIC/anon execution and grants only authenticated execution; no live
grants were changed by Codex. Successful private-table HTTP exclusion does not
prove public-function EXECUTE revocation, and this mismatch alone is not proof
of anonymous data access (Auth checks/private-schema privileges/RLS also apply).

Keep the supplied JSON unchanged and do not advance to Step 3. Refresh the same
tab if desired to see the field-specific message; the A1/A2 marker/cleanup IDs
remain unchanged. Manually run the read-only
[function grant audit](../tests/database/cloud-api-function-grant-audit.sql) in
the same project to distinguish direct grants, PUBLIC ACL entries, inherited
role privileges or unsafe role flags. That audit now confirms direct anonymous
grants; the separately authored [correction](cloud-rpc-grants.md) targets only
the unwanted execution privileges. After applying/verifying the correction, a
fresh surface audit can be accepted and button 2 rerun. Do not edit `anonymous` in
the JSON or weaken the validator to proceed. The export-wrapper normalization
is an independent input-format fix; it was not the cause of this live rejection.

The old `OPENAPI_SURFACE_UNVERIFIED` code discarded HTTP status/body, so the exact
status of that original response cannot be recovered from the reported message.
The provider's administrative-only OpenAPI policy explains why the browser
enumeration assumption is invalid. The updated missing-audit error reports the
observed HTTP status without exposing request headers, keys or sessions.

## Cleanup

### GraphQL introspection stop: preserve fixtures and collect exact evidence

The user reports that the corrected grants allowed Step 2 REST/private-helper
and all five authenticated/anonymous RPC checks to pass. The remaining stop was
`GRAPHQL_INTROSPECTION_UNVERIFIED`. That old assertion combined HTTP failures,
GraphQL errors, missing `data.__schema` and invalid nested arrays, without recording
which occurred. Its reported code alone cannot establish the live root cause.

[Current Supabase configuration](https://supabase.com/docs/guides/graphql/configuration#introspection)
disables introspection by default in pg_graphql 1.6+. A typical response is
`Unknown field "__schema" on type Query`. Introspection can also succeed while
filtering types belonging to other schemas. **Neither blocked introspection nor
absence from an introspection listing independently proves privacy.** Do not
enable introspection, change grants or expose a schema just to pass the test.

The diagnostic now reports caller class, endpoint/status, rejected JSON path and
bounded/redacted GraphQL error messages. On an unverifiable response it performs
an ordinary read-only `__typename` query to distinguish a reachable endpoint
with blocked introspection from an unverified endpoint/response. It still stops;
this control query is not a substitute privacy proof. Existing 404 query/mutation
checks distinguish endpoint unavailability, and successful introspection still
requires private field/mutation and schema-qualified Universe/entry node probes.
No fixture data or credentials are printed from GraphQL response data.

Refresh this same diagnostic tab/origin, remain A, reapply the fresh read-only
API inventory and rerun **button 2 only**. Do not rerun preparation, start button
3 or clean up. The A1/A2 session marker/identities remain unchanged. Share the
new `GraphQL ...` detail line if blocked; that is needed to establish the actual
project response before selecting a strict alternative verification method.
REST exclusion and RLS are not substitutes for that GraphQL verification.

Local checks for this diagnostic-only adjustment: 177 focused cloud/gateway
Node tests and 28 mocked Phase A browser checks passed. Tests cover the current
Supabase `Unknown field "__schema"` response, malformed nested fields, HTTP 503,
HTTP 404 unavailability, successful introspection/private node rejection,
credential redaction, page output and unchanged fixture/session identities.
The browser run used mocked SDK/Auth/fetch and made no project/CDN requests.
No live GraphQL result or private-schema exclusion is claimed by these tests.

### Disabled GraphQL: independent catalog + HTTP proof

**Latest live blocker:** the user reports EXECUTE/schema USAGE qualification for
`extensions.grant_pg_graphql_access()`. This may be a platform event-trigger
function, for which ACL qualification is not ordinary RPC callability. The gate
has not been relaxed. Follow [the exact helper review](cloud-graphql-helper-review.md)
and its read-only inspection before any privilege or diagnostic change. A1/A2,
their marker and cleanup identities remain unchanged.

**Subsequent reviewed checkpoint:** the live inspection confirms the two stock
event-trigger helpers and the ordinary disabled placeholder, with no installed
extension. The diagnostic now supports [the exact stock disabled proof](cloud-graphql-disabled-proof.md)
using both catalogs, full reviewed bodies and both HTTP caller classes. This
supersedes the blanket block for these three specifically verified routines;
other callable functions/deviations remain blocked. No grants/platform functions
were changed. Use that document's three-input resume procedure for current A1/A2.

The user's latest live evidence establishes `/graphql/v1` is reachable (HTTP
200), but neither introspection nor the ordinary typename query resolves:
the response is `pg_graphql extension is not enabled`. That error alone remains
insufficient. The new **Read-only GraphQL catalog proof** input supports a strict
disabled-engine path without enabling an extension or changing exposure/grants.

Run [cloud-graphql-surface-audit.sql](../tests/database/cloud-graphql-surface-audit.sql)
manually in the **same project's SQL Editor**. This is a single read-only catalog
SELECT; it does not call GraphQL functions, inspect fixture/Auth rows or change
configuration. It reports:

- Actual `pg_extension` installation/version for `pg_graphql` (not whether it is
  merely available for installation).
- GraphQL-named schemas, including `graphql_public`, and anonymous/authenticated
  schema USAGE.
- Every function in those schemas, plus GraphQL-named functions elsewhere:
  identity arguments, result, INVOKER/DEFINER flag, effective role EXECUTE, schema
  USAGE and PUBLIC EXECUTE. Effective privileges include inherited/PUBLIC rights.
- Browser-accessible relations in those schemas, including column-only access.

The versioned audit accepts its JSON cell or exact one-row named-column export,
checks exact structure/types/unique identities and requires a timestamp within
20 minutes (at most five minutes ahead for clock skew). It is held only in memory
and cleared on refresh or a rejected replacement. As with the REST catalog audit,
this is trusted operator-supplied evidence from the specified project, not a
cryptographically authenticated browser attestation. Keep project configuration
unchanged while auditing/probing; any administrator can invalidate a prior audit.

**Disabled proof requires all of these conditions together:** extension absent;
no GraphQL function executable with schema USAGE by either browser role; no
accessible GraphQL-schema relation; the exact disabled-engine HTTP error with no
data for introspection, ordinary typename, private collection/mutation variants,
private-helper fields and SQL-schema-qualified Universe/entry node IDs. Both
anonymous and authenticated probes must agree. Unknown/changed errors, a data
response or expired/missing catalog cannot pass. The diagnostic does not count
introspection restriction, RLS-filtered rows or REST rejection as GraphQL proof.

If the extension is installed, the disabled-engine path stops at
`catalog.extensionInstalled`. If a callable wrapper/helper exists—even one whose
body currently returns the disabled error—it stops with its exact schema/name/
signature. Review that callable implementation and API exposure separately;
do not revoke/enable anything to force this gate or assume it is harmless. An
otherwise inaccessible residual `graphql_public` schema/function is inventoried
and can coexist with an absent engine. Public function aliases still must satisfy
the earlier exact-five REST inventory. Arbitrary custom forwarding code is not
proved safe by a name-based catalog scan; unexpected API code must be reviewed.

Reported states:

| State | Meaning |
| --- | --- |
| `disabled-independently-verified` | Fresh catalog absence/non-callability plus both caller classes' negative HTTP probes. No GraphQL engine/data surface established under current configuration. |
| `endpoint-reachable-introspection-blocked` | Ordinary query reaches GraphQL but introspection is restricted; privacy gate remains blocked. |
| `schema-inspected-private-excluded` | Existing enabled-engine schema/field/node probe path succeeds; distinct from disabled proof. |
| `disabled-http-observed-catalog-unverified` | HTTP says disabled but catalog missing, expired or contradicts the claim; gate blocked with exact path. |
| `endpoint-state-unverified` / `endpoint-unavailable` | Unexpected HTTP/body or observed 404; no claim that the extension is absent. |

To resume A1/A2, **refresh this same tab/origin** while signed in as A. Run the
GraphQL audit above and paste its complete JSON into **Read-only GraphQL catalog
proof**, then click **Use read-only GraphQL audit**. Reapply a fresh ordinary
**Read-only API inventory** too, because refresh clears both inputs. Run
**button 2 only**. Do not rerun A1/A2 preparation, change/clear their marker or run
cleanup. If catalog + HTTP pass, continue the existing Step 3/account-switch
procedure. If blocked, share the reported catalog field/function identity; do
not advance. This audit and path have not been run by Codex against Supabase.

Local validation: 182 focused cloud/gateway Node tests and 31 mocked Phase A
browser checks passed. New tests cover absent/malformed/stale catalog, installed
extension, callable anon/authenticated wrappers, unexpected relations,
contradictory HTTP probes and unchanged fixture markers/data. These are static
and mock checks, not live SQL or GraphQL execution.

## Guarded cleanup procedure

After successful full testing, copy the **latest generated SQL** from the page
into Supabase SQL Editor and run the whole transaction manually. It locks all
three exact Universes, checks owners, revisions, snapshot flags, every entry
field, absence of other domain rows, and the exact operation receipt identities,
acknowledgements and server-computed request digests. Only then does it delete
the fixture receipts, entries and Universes. Expect one result row containing
`test_universes_removed = 3`. An A-only completed test has two targets instead.
An unexpected or changed fixture aborts the transaction; never remove guards.
Cleanup SQL is authored/generated and statically tested here, not run locally or
remotely. It is not an application delete API.

After server cleanup succeeds, close the diagnostic and remove only its printed
`cosmifold:cloud-cache:v1:<owner>:<universe>` keys, including B + A1, using browser
DevTools. Remove sessionStorage key `cosmifold:dev:cloud-boundary:v1`. Do not clear
all storage or remove `galaxy:user-data`, preferences, attachments or Auth keys.

If B was created solely for this test, separately verify its exact email and
user UUID in Supabase Authentication → Users and that it owns no remaining
Universes. Only then manually delete that disposable user through the dashboard.
Keep an existing real account. No Auth-user deletion SQL is generated.

## Coverage and limits

The diagnostic exercises fixed roots only; no account Cosmos is uploaded. If
privacy is broken, an unauthorized mutation probe can modify **only a known
disposable fixture**, causing immediate failure and cleanup refusal. It never
targets an unrelated user Universe or uses broad delete filters.

Live Phase A evidence has now passed and cleanup is complete as recorded above.
Concurrency/locking across sessions,
genuine network loss, durable uncertain-commit recovery, performance, files,
normal activation and migration remain separate phases. GraphQL endpoint
unavailability or disabled introspection must be recorded honestly as observed
configuration, without claiming an inspected schema.

Local checks:

```powershell
node --test tests/cloud-boundary.test.js
python tests/browser-check.py --cloud-boundary-only --screenshots
```

The browser check replaces Auth/SDK/fetch with a shared deterministic fixture;
it must make no real SDK CDN or Supabase requests.

Local validation on October 13, 2026: 10 focused Node tests passed; the full
Node regression set passed as 402 non-physics tests plus 58 unchanged physics
tests. The initial 30-second physics-file budget expired; its separate bounded
90-second run completed successfully. Browser runs passed 24 Phase A checks,
83 existing Auth/cloud foundation checks, 18 persistence-order checks and 204
static-hosting checks. Phase A desktop/narrow/mobile screenshots were captured
in temporary test output. Chrome required execution outside the filesystem
sandbox to start its local debugging endpoint. No live Supabase requests, SQL
execution, schema/config changes or deployment occurred.

The OpenAPI compatibility correction passed 168 focused cloud/gateway Node tests
(including 13 Phase A tests) and 25 mocked browser checks. The mock now returns
restricted root OpenAPI by default. It proves that missing inventory stays
blocked and that Step 2 can resume after refresh without changing the fixture
marker, server metadata/revisions or operation-receipt count. The new catalog
SELECT was authored/static-checked only; it has not been executed by Codex.

Field-specific inventory validation and the reported anonymous-grant mismatch
are covered by 16 Phase A Node tests. The SQL Editor wrapper/canonical-object
paths and error UI passed 26 mocked browser checks; the broader focused
cloud/gateway Node set passed 171 tests. The follow-up grant audit is a read-only
catalog SELECT, authored/static-checked only. No live queries or corrections
were executed, and fixture identities/cleanup SQL were unchanged.
