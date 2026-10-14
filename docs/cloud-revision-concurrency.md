# Phase B: cloud revision concurrency

Branch: `test/cloud-revision-concurrency`. The diagnostic is implemented but
**has not been run by Codex against Supabase**. Normal cloud mode is inactive.
Phase A's validated Auth/RPC/private-schema/GraphQL/account boundaries are not
changed. No migration, credentials, dependencies, cloud files or deployment.

Open `/dev/cloud-concurrency-diagnostic.html` on loopback only. It makes no RPC
requests on page load. Explicit preparation creates one NEW disposable Universe,
then seeds one canonical root `phase-b-<new-universe-uuid>` with the fixed name
`Phase B disposable`. It never reads/uploads the device Cosmos. IDs come from
fresh UUIDs, not Phase A identities. Copying a fixture/ticket/observation copies
only these test identities and fixed metadata, never Auth tokens/passwords.

## Architecture and expected revisions

```text
Two distinct loopback origins / separate Auth sessions and browser storage
    -> same-owner fixture + fixed operation identities
    -> existing Supabase metadata gateway (five public RPCs only, retry(false))
    -> existing cloud repository planners / acknowledgement validation
    -> existing scoped cloud cache (server-acknowledged state only)
```

Use **distinct origins**, for example `http://127.0.0.1:5500` for LEFT and
`http://localhost:5500` for RIGHT. Same-origin tabs share a cache and Web Locks,
which may serialize the writes before they reach PostgreSQL. The diagnostic
rejects same-origin fixture setup/join. Both origins use the same account, signed
in normally at each origin. This does not require any provider configuration
change; email/password signin is used, not an OAuth callback. Browser-local data
at the two origins remains separate, as it is today.

| Stage | Revision / expected state | Receipts expected |
| --- | --- | --- |
| Explicit create, then seed | `0 -> 1`, `Phase B disposable` | seed |
| Distinct-operation race | `1 -> 2`, `Phase B Left` OR `Phase B Right` | seed + winner, never loser |
| Identical-operation race | `2 -> 3`, `Phase B Identical` | seed + winner + identical |
| Changed-content reuse | stays `3`, same metadata/receipt | same three |
| Explicit newer write | `3 -> 4`, `Phase B Newer` | seed + winner + identical + newer |

The same immutable fixture operation IDs survive reload in
`cosmifold:dev:cloud-concurrency:v1` sessionStorage. Scoped caches retain the
existing `cosmifold:cloud-cache:v1:<owner>:<universe>` namespace at each origin.
No unscoped local Cosmos/Backup/Restore/attachment/Phase A marker is accessed.
Repeated preparation, joining or dispatch is refused; reload never resumes a
mutation automatically. A nonempty marker after a stopped mutation must be
retained for read-only inspection/review, not reset to retry.

Both clients open/validate the same base and populate their acknowledged caches
**before** waiting for the ticket deadline. Tickets start 45 seconds ahead in the
page. Actual dispatch must fall within two seconds of that deadline; background
throttling/late arming is UNVERIFIED, not a concurrency pass. Each client submits
one fixed command. HTTP overlap is not inferred from a browser timer; server
revision/receipt outcomes and actual SQL locking are tested separately.

RPC waits are bounded to 15 seconds. A write timeout is uncertain, not proof of
noncommit. The existing repository may reconcile its original operation via a
receipt read; it never resubmits that mutation. An unresolved result leaves the
original identity/pending cache blocked. Late requests are consumed and fenced;
no newly generated operation replaces an uncertain one. Genuine network-loss/
reload recovery remains Phase C, not a live claim by this test.

## Live manual procedure: one stage at a time

Do not run any SQL or mutations automatically from tools. These are steps for
the user after reviewing the branch. Keep both contexts open during scheduled
races. Any STOPPED result means retain identities and review rather than retry.

### 1. Prepare and join only

1. Serve the existing repository root with the usual local static server on port
   5500 (another available port is fine). Both 127.0.0.1 and localhost must reach
   that server. No install/build/deploy is needed.
2. Sign in as the same test account in the **normal app** at both origins. Signin
   changes identity only; it does not upload either origin's local Cosmos.
3. Open the Phase B diagnostic at both origins. In LEFT, confirm Other context
   origin is the exact RIGHT origin. Click **Create and seed ONE disposable
   Universe** once. Expect revision 1. Retain the fixture JSON/identities.
4. Copy LEFT's fixture JSON into RIGHT's join field and click **Join existing
   fixture read-only**. Expect the SAME Universe/revision with independent cache.
   Do not press preparation in RIGHT and never use a Phase A fixture.

### 2. Competing writes, then identical operation

1. Select **Competing writes** in BOTH contexts. LEFT creates a start ticket.
   Copy the complete ticket JSON to RIGHT. Click **Arm ONE scheduled semantic
   mutation** in BOTH contexts before the deadline. Do not refresh/close/re-arm.
2. Wait for each local result. There must be one committed mutation and one
   definite stale rejection. Copy each observation JSON into the other context's
   peer field; click **Verify both observations** in BOTH. Expect exact winning
   metadata at revision 2, no losing receipt/cache advance, then server refresh.
3. Confirm the competing-race status says VERIFIED in BOTH contexts. Select
   **Identical operation** in BOTH. RIGHT generates its read-only readiness JSON
   at revision 2 and copies it into LEFT's readiness field. LEFT cannot create
   the ticket without the matching RIGHT verification proof; RIGHT cannot arm
   while its own previous verification is missing. Repeat ticket creation, copying and
   arming, then exchange/verify observations. Both exact commands have the SAME
   original operation ID. Expect one original and one replay acknowledgement,
   authoritative revision 3 and one logical identical-operation receipt. The
   SQL cleanup later checks the complete expected receipt count too; browser
   RPCs do not enumerate private receipt tables.

### Recovery of a one-sided identical-operation commit

This path is limited to the original diagnostic sequencing failure: LEFT's
identical operation is `done`/committed at revision 3, RIGHT has **no identical
attempt**, and the competing race was verified only on LEFT. It never recreates
the fixture, changes IDs, resets storage or automatically dispatches a command.

1. Refresh the SAME two tabs after updating the diagnostic. Session markers keep
   all existing fixture/operation IDs and observations. Do not prepare or join
   again. Changing the Case selector retrieves that context's saved observation;
   an absent observation is now displayed as blank rather than stale prior text.
2. Select **Competing writes** on LEFT and RIGHT. Copy LEFT's saved race
   observation into RIGHT's peer field and click **Verify both observations** on
   RIGHT. The read-only RPC checks may verify this historical race at current
   revision 3: both race observations/receipts must still match, LEFT's later
   identical receipt and full current metadata must match too. It refreshes only
   acknowledged cache from the current server read; never rolls back to revision 2.
3. Select **Identical operation** on LEFT, copy its saved committed observation
   into the sequencing-recovery field in BOTH contexts, and click **Verify
   existing LEFT commit read-only** in BOTH. This proves the existing commit,
   operation identity and receipt with no resubmission or cache changes. Any
   dispatched/uncertain RIGHT identical attempt blocks this specific recovery.
4. STOP and review the read-only results first. Expected state is revision 3,
   with the original three receipts. Concurrent identical submission remains
   **UNVERIFIED**: only LEFT submitted before the commit.
5. If deliberately chosen after that review, RIGHT's separately labelled
   **Explicitly replay exact committed command ONCE** sends the complete original
   command/base revision/operation ID. It must return `replayed:true`, with exact
   unchanged metadata/revision/receipt, and then may refresh acknowledged cache.
   It creates no new operation or revision transition. It is a bounded sequential
   idempotency test, NOT a recovered concurrency pass. The marker prevents a
   second replay; timeout/error preserves its dispatched identity for review.

The remaining reuse, delayed-response and manual-locking checks can use this
same recovered fixture and unchanged revision/cleanup plan. Even if those pass,
the final gate remains UNVERIFIED when concurrent identical submission was
missed. A genuine overlapping identical-operation test needs a separately
reviewed fresh uncommitted operation pair/transition later; do not repurpose the
committed operation, manufacture a peer observation or rewrite cleanup guards.

### Fresh concurrent recovery on the SAME Universe (historical; countdown retired)

**Do not follow the countdown dispatch procedure below again.** After LEFT
committed and RIGHT missed the deadline, its ticket/dispatch UI was retired.
Historical methods remain for deterministic reproduction tests and inspection,
not as a recommended live recovery path. Use the read-only revision-4 check next.

User-reported live checkpoint: read-only recovery succeeded on BOTH contexts;
RIGHT also completed historical race verification. Existing fixture is revision
3 and RIGHT did not click sequential replay. The new concurrent transition below
is prepared locally but has NOT been run against Supabase by Codex.

This separate plan is for the live state where BOTH contexts have completed the
read-only sequencing recovery at revision 3 and RIGHT has NOT used the sequential
replay. Original fixture JSON, all five original operation IDs/definitions,
three existing receipts, cache keys and marker keys are preserved. A fresh plan
and fresh operation ID are stored under `attempts.concurrentRecovery`; no new
Universe is created. Allocation/join/readiness are read-only RPCs plus marker
writes. The only semantic mutation is a fixed rename from `Phase B Identical`
to `Phase B concurrent recovery`, using base revision 3 and resulting revision 4.

Perform one action at a time, accepting a PASS before advancing:

1. Refresh the SAME LEFT and RIGHT tabs. Do not prepare/join the original fixture,
   clear storage, use the old sequential replay, or use the old revision-4 steps.
2. LEFT: click **Allocate fresh recovery plan locally (no mutation)** once.
3. Copy its **Recovery plan** JSON into RIGHT's matching field.
4. RIGHT: click **Join recovery plan read-only** once.
5. LEFT: click **Check recovery readiness read-only at revision 3**.
6. RIGHT: click **Check recovery readiness read-only at revision 3**.
7. Copy RIGHT's **RIGHT readiness** JSON into LEFT's matching field. The ticket
   button enables only for a matching RIGHT readiness proof; LEFT's own proof
   remains stored separately. Readiness requires the fresh receipt to be absent.
8. LEFT: click **Create fresh recovery start ticket, 45 seconds ahead**.
9. Copy the complete **Recovery start ticket** into RIGHT's matching field.
10. LEFT: click **Arm ONE fresh identical recovery command (mutation)**.
11. RIGHT: click the same Arm button BEFORE the shared deadline. Both clients
    open/validate base revision 3 before waiting for the deadline. Keep BOTH tabs
    open. Each sends the same exact fresh command once; there is no mutation retry.
12. When both results appear, copy RIGHT's **recovery observation** into LEFT's
    **Other context's recovery observation**, then click **Verify concurrent
    recovery and exact server state** on LEFT.
13. Copy LEFT's **recovery observation** into RIGHT's matching peer field, then
    click **Verify concurrent recovery and exact server state** on RIGHT.
14. STOP and report both outputs. Do not execute cleanup, SQL, or other mutations.

Acceptance requires two matching fresh-ID commands, same ticket/base revision,
one original and one replay acknowledgement, exact revision-4 state and fresh
receipt, and preservation of all prior receipts. Client RPC request intervals
must demonstrably overlap; matching outcomes from nonoverlapping requests are
**UNVERIFIED_RECOVERY_REQUEST_OVERLAP**, never a concurrency PASS. Both origins
use the same browser/device clock. These client intervals do not prove an actual
PostgreSQL lock wait; independent-session locking remains a separate gate.

Stopped/late/uncertain dispatch retains its marker and original fresh operation
identity. Do not re-arm, reset the plan, or generate a replacement operation.
Normal Phase B completion is intentionally not enabled by this bounded step.
The remaining negative-reuse, delayed-publication and SQL-locking procedures
need a separate review for this recovery path. Original revision-4 commands are
disabled so they cannot be mistaken for this new transition.

Recovery-specific cleanup can be generated read-only with **Inspect recovery
state and generate separately guarded cleanup**. At revision 3 it emits the
unchanged original three-receipt cleanup. At revision 4 it uses the SAME complete
guard body, but pins the new exact metadata and four exact receipts (seed,
original race winner, original LEFT identical, fresh recovery operation). It
requires original `newer` receipt to be absent and never reuses that ID. Old
revision-3/original revision-4 cleanup intentionally refuses this new state;
never edit old SQL to force deletion. Cleanup success is still exactly one
Universe removed, followed by removal of only the same printed scoped cache
and diagnostic marker at both origins. No SQL has been executed by Codex.

### Current recovery: LEFT committed revision 4, RIGHT's ticket expired

User-reported live checkpoint: LEFT reported a committed fresh recovery command;
RIGHT stopped with `TICKET_EXPIRED_OR_TOO_FAR`, with no dispatch. That guard is
before recording `dispatch` or issuing the mutation RPC. Revision 4 is expected,
but must be confirmed by read/receipt validation, not assumed from the UI result.

1. Refresh the SAME two tabs; session markers restore the original fixture,
   fresh plan and LEFT observation. Do not prepare/join again or clear storage.
2. LEFT: click **Check existing LEFT recovery commit read-only at revision 4**.
   The empty audit field automatically uses its preserved local observation.
3. Copy LEFT's **This context's recovery observation** into RIGHT's **Preserved
   LEFT recovery observation for read-only revision-4 check** field.
4. RIGHT: click the same read-only check button. STOP and report both outputs.

This validates exact current metadata, the fresh operation acknowledgement and
digest, all prior expected receipts and absence of the unused original `newer`
receipt. RIGHT must have NO dispatch; uncertain/stopped/dispatched RIGHT attempts
are rejected. The check writes only an additional diagnostic proof/flag into
the existing session marker. It does not write cloud metadata, resubmit/replay,
advance or refresh caches, delete storage, change IDs or alter cleanup guards.
It explicitly leaves concurrent-identical proof UNVERIFIED. Existing guarded
recovery cleanup is still exact for revision 4 and four expected receipts.

Another genuine concurrent test requires a new uncommitted operation at a new
bounded transition (expected 4 -> 5), preserving this committed operation and
all prior receipts. It is NOT allocated or dispatched by this read-only patch.
Before implementing that next transition, replace manual-copy deadlines with
a two-party start barrier: both independent contexts must have opened the same
base, parked without dispatch and exchanged authenticated-context/plan-bound
ARMED confirmations; a coordinator then releases BOTH without human copying
against a running deadline. Abort-before-dispatch if either context is absent,
disposed, unready or changed. Simply extending 45 seconds is insufficient, and
replaying this committed ID cannot prove concurrency. The barrier transport and
new transition/cleanup extension require a separately reviewed bounded step;
no ordinary app/cloud service or production schema change is implied.

### Current next step: coordinated local start barrier, revision 4 -> 5

User-reported checkpoint: BOTH revision-4 read-only checks passed. RIGHT never
dispatched the prior recovery operation; no replay/SQL/cleanup followed. This
step creates one fresh operation and plan ID under the SAME Universe. Prior
fixture/operation IDs, receipts, proof markers and cleanup guards are preserved.
The fixed semantic change is a rename to `Phase B coordinated identical`.

The relay is `scripts/serve-cloud-barrier.py`, a standard-library, loopback-only
development static server plus `/__phase_b_barrier__`. It is NOT an application
backend and must not be deployed. It never contacts Supabase, reads Auth storage,
receives passwords/access tokens or writes domain data. The browser still uses
the existing authenticated public metadata gateway for all cloud operations.
The relay receives only fixed test-plan IDs and context nonces via same-origin
credential-free JSON. It checks exact Host/Origin, role/plan/context binding,
fresh IDs, request-size limits, one-use runs and a maximum of eight runs per
process. It uses no CORS allowances. Existing `_headers` are served unchanged;
CSP `connect-src 'self'` covers the relay, so no policy change is needed.

Use the SAME port as the existing tabs: changing it changes the origin and loses
access to these session markers/caches. Temporarily stop the current local
static server (for example VS Code Live Server), then start this server instead.
That does not clear browser storage, sign out or change Cloudflare settings.
No package installation/build/API keys are needed. If Python is unavailable,
stop and review; do not install tools or move the fixture to another origin.

Perform one action at a time:

1. Keep the same two tabs. Stop the current local static server on their port.
2. In a terminal at the repository root, run `python scripts/serve-cloud-barrier.py
   --port 5500` (use the EXACT existing port if different). Leave it running.
3. Refresh LEFT, then RIGHT in their SAME tabs/URLs. Move them into separate
   visible windows so background-tab timer throttling cannot hide a parked peer.
4. LEFT: click **Allocate fresh revision-4 barrier plan (no mutation)** once.
5. Copy LEFT's **Barrier plan** JSON into RIGHT's matching field. No clock or
   mutation deadline is running during copying.
6. RIGHT: click **Join barrier plan read-only**. Require PASS before proceeding.
7. LEFT: click **Park this context; dispatch ONCE only after BOTH are confirmed**.
   Wait for `PARKED: left`. It has opened/validated revision 4 and cached only
   acknowledged revision 4; no fresh mutation is sent yet.
8. RIGHT: click the same Park button. No ticket/release JSON is copied. Both
   clients finish their preflight independently before registering with the
   local relay. It automatically checks/receives BOTH confirmations, holds both
   local HTTP waits through a short release interval, then delivers the SAME
   release to BOTH. Each client sends the same fresh command once.
9. Wait for BOTH results; do not refresh/close either window or stop the relay.
10. Copy RIGHT's **barrier observation** into LEFT's **Other context's barrier
    observation** field. LEFT: click **Verify coordinated identical operation
    and revision 5**.
11. Copy LEFT's **barrier observation** into RIGHT's matching peer field. RIGHT:
    click the same Verify button.
12. STOP and report both outputs. Do not run SQL/cleanup, replay or allocate
    another operation. Keep identities/markers. Normal cloud mode stays inactive.

Parking is bounded to 120 seconds; a missing peer causes an abort WITHOUT a
fresh mutation. The relay also aborts on a peer heartbeat gap over two seconds,
explicit cancellation, changed context or expired run. Each local HTTP wait is
bounded to three seconds. The browser checks account/context again before
dispatch; close/sign-out/disposal fences late releases. A stopped/uncertain run
cannot be re-parked, replaced or silently retried: preserve the original fresh
operation identity and request review. Do not restart the relay during a run.
Restart loses relay memory but browser dispatch markers still forbid re-parking.

The relay is a test start coordinator, NOT a distributed atomic commit across
clients. A crash/network failure immediately after release can still leave one
submission committed. It cannot promise two submissions under every failure.
The strict verification consequently requires two matching original/replay
acknowledgements, one semantic revision increment, exact projection/receipts,
distinct context nonces and genuinely overlapping client-call intervals. Late
release or nonoverlap is UNVERIFIED, never a manufactured PASS. Actual PostgreSQL
lock waiting still requires the separate independent-session test; this does
not solve Phase C network-loss/recovery or complete the other Phase B gates.

New control metadata lives only in `attempts.startBarrier`; original fixture
and `attempts.concurrentRecovery` records are not rewritten. Both caches remain
scoped to the SAME user/Universe, advance to 5 only after validated acknowledgement
or original-ID receipt reconciliation, and never touch unscoped local Cosmos or
IndexedDB attachments. No automatic mutation retry exists.

**Inspect barrier state and generate exact guarded cleanup** remains read-only.
At revision 4 it emits the unchanged prior four-receipt cleanup. At revision 5
it uses the unchanged guard body with the exact new metadata and FIVE expected
receipts: seed, original race winner, original LEFT identical, prior recovery,
and fresh barrier operation. Original unused `newer` receipt must remain absent.
Old revision-4 SQL deliberately refuses revision 5. After later review, successful
cleanup must return exactly `test_universes_removed = 1`, followed by removal of
only the same printed scoped cache/marker keys at BOTH origins. Do not execute
cleanup now. Stop the temporary relay with Ctrl+C only after the run is finished;
return to the usual static server on the SAME port when appropriate.

### Next bounded step after live barrier PASS: changed-content operation-ID reuse

User-reported live checkpoint: BOTH coordinated barrier verifications passed at
authoritative revision 5, with one original/replay acknowledgement, overlapping
client calls, exact state/receipt and all prior receipts intact. The loopback
relay remains running; no replay, new operation, SQL or cleanup followed. This
closes the tested concurrent-identical client boundary, not independent SQL
locking or the other remaining gates.

The next step is ONE negative RPC per context using the newly committed barrier
operation ID. It preserves the exact owner/Universe, operation ID, base revision
4 and command type; only the entry name in the payload is changed to the fixed
`Phase B rejected barrier reuse`. This is an intentional invalid reuse, not a new
semantic operation. It must return the definite `OPERATION_ID_REUSED` rejection,
not a stale-write/auth/network error or a replay acknowledgement. The server
must keep revision 5, all five receipts and exact metadata unchanged.

1. Leave the relay running as the static server. Refresh the SAME LEFT tab.
2. Refresh the SAME RIGHT tab. Existing verified flags/observations are restored
   from their unchanged marker identities; no re-parking is required.
3. LEFT: click **Test changed-content barrier ID reuse ONCE (must reject)**.
   Wait for PASS. If STOPPED, retain everything and report it before doing RIGHT.
4. RIGHT: click the same button once. Wait for PASS.
5. STOP and report both outputs. Do not allocate/park/replay, run SQL or clean up.

Preflight validates revision 5, all known receipts and the acknowledged cache.
The action records only a new `attempts.startBarrier.reuse` subrecord/verification
flag in the existing diagnostic marker. It does not rewrite original dispatches,
IDs, plans or observations. After rejection it compares complete before/after
metadata and the original receipt (including request digest), validates all prior
receipts and verifies unchanged cache contents. No cache refresh/write occurs.
The button/API prevents a second dispatch even after failure or reload. Unknown
network outcomes remain STOPPED, never treated as a successful rejection.

Expected stopping state: revision **5**, **five unchanged receipts**, unchanged
original operation IDs and cache/cleanup identities. Current guarded cleanup
remains valid without any adjustment. No SQL is executed in this step. The local
relay is not used for coordinating this negative test; it can keep serving the
existing origins. Delayed old-acknowledgement fencing and independent-session
SQL locking are the next separate bounded gates, not implemented by this check.

### Next bounded step after live reuse PASS: independent SQL locking at revision 5

User-reported live checkpoint: changed-content barrier ID reuse passed on BOTH
contexts with definite OPERATION_ID_REUSED, unchanged metadata/receipts/cache.
Authoritative revision remains 5 with five receipts. No park/replay/allocation,
SQL or cleanup followed. We choose SQL locking next because it needs no new
operation, revision transition, metadata mutation or cache refresh. Delayed
acknowledgement fencing remains a separate open gate after this.

The prior revision-4 lock scripts do NOT fit this fixture. A new generator binds
the holder to the exact current projection and tags BOTH SQL evidence objects
with the current barrier plan ID, committed operation ID and revision `5`.
Holder uses the authenticated role/owner claims, checks the full projection,
locks only the exact owner/Universe/revision row FOR UPDATE, records its backend
PID/lock interval and sleeps for 20 seconds. Waiter invokes the installed public
`cosmifold_read_universe` RPC (whose installed body uses FOR SHARE) with a
two-second lock timeout and records outcome/PID/server times. Thirty-second
statement timeouts bound both scripts. Neither creates/changes schema, grants,
functions, metadata, receipts or Auth users. Both use BEGIN and final ROLLBACK;
role/claim/evidence settings are transaction-local. Generation never executes SQL.

Perform one action at a time:

1. Keep the relay running for static serving. Refresh the SAME LEFT diagnostic
   tab. RIGHT may remain open/idle; no coordination buttons are involved here.
2. LEFT: click **Generate revision-5 holder/waiter SQL (no execution)**. Expect
   PREPARED/UNVERIFIED, not a locking PASS. Do not use the old revision-4 scripts
   or any cleanup SQL. This preflight validates current state/receipts read-only.
3. Open TWO independent Supabase dashboard browser contexts in the SAME project:
   for example regular Chrome for HOLDER and an Edge or incognito window for
   WAITER. Sign into the dashboard separately and open SQL Editor in each.
   Internal query tabs in one dashboard page are NOT separate execution contexts.
   Keep the existing Cosmifold LEFT/RIGHT diagnostic tabs untouched. Use the
   normal administrative SQL Editor role used for previous reviewed validation;
   the scripts themselves SET LOCAL ROLE authenticated to test those privileges.
   No passwords, service-role keys or access tokens are required.
4. Copy the ENTIRE generated **Revision-5 HOLDER SQL** into SQL session A.
5. Copy the ENTIRE generated **Revision-5 WAITER SQL** into SQL session B.
6. Review BOTH scripts before running either: exact owner/Universe, revision 5,
   fixed test metadata, plan/operation tags, short timeouts and final ROLLBACK.
   Keep both sessions visible/prepared. Do not alter grants, RLS or timeouts.
7. Run the ENTIRE HOLDER script in A. It will be busy during its 20-second lock.
8. Immediately run the ENTIRE WAITER script in B WHILE A is still running. There
   is no copying after starting the holder. SQL Editor tabs alone do not prove
   independence/overlap; different returned backend PIDs and timing do.
   If B's Run button is already busy before you click it, STOP this attempt:
   let A finish and retain its output. Do not run B afterward as overlap proof.
9. Wait for BOTH complete outputs and their final ROLLBACK. If either errors,
   explicitly run `ROLLBACK;` in that affected session, STOP and report the error.
   Do not weaken grants or force cleanup. The generated scripts have not been
   compiled/executed by Codex, so runtime failures must be reviewed honestly.
10. From A and B, copy the two complete `phase_b_lock_evidence` JSON VALUES into
    an array `[holderObject, waiterObject]` in LEFT's **array of TWO complete
    revision-5 SQL JSON evidence objects** field. Named-column wrappers are also
    accepted. Do not fabricate/edit times, PIDs, outcome or binding tags.
11. LEFT: click **Verify revision-5 independent-session lock evidence**.
12. STOP and report both SQL JSON outputs and the diagnostic result. Do not run
    cleanup, allocate/park/replay, advance revision or declare Phase B COMPLETE.

PASS requires exact plan/operation/revision/owner/Universe tags, authenticated
role, distinct positive backend PIDs, a roughly two-second `55P03` timeout, and
the waiter's whole interval inside the holder's roughly twenty-second interval.
The diagnostic also rechecks current metadata and all known receipts and leaves
cache bytes unchanged. Only a new `attempts.startBarrier.locking` evidence
subrecord/verification flag is added to the existing LEFT marker. All previous
IDs, barrier observations, receipts, caches and cleanup guard definitions remain.

If the waiter ran after the holder, did not wait, used the same backend PID,
or returned old/mismatched evidence, report UNVERIFIED. If the SQL Editor
serializes requests or cannot provide independent sessions, this gate remains
open pending a separately reviewed connection method. Do not install tooling
or ask for/copy secret credentials here. Rerunning these rollback-only scripts
after BOTH transactions end is safe if deliberately chosen; it is not mutation
retry, but no rerun should be used to hide a failure. Operator-provided SQL output
is trusted evidence, not cryptographic attestation. The relay does not execute
or certify these SQL queries.

Expected stopping state is still revision 5/five unchanged receipts, with no
new operation IDs or cache refresh. Current cleanup SQL remains valid unchanged.

#### Sequential SQL Editor run: recovery without changing the fixture

The operator reported that both revision-5 scripts executed successfully,
returned one evidence object each and ended with ROLLBACK. However, the SQL
Editor's internal query tabs shared a busy Run control: WAITER could only be
started after HOLDER completed. SQL runtime execution is therefore confirmed
for these scripts, but independent-session lock overlap remains UNVERIFIED.
Retain those outputs as sequential evidence; do not submit them as locking proof.

The [current Supabase SQL Editor execution hook](https://github.com/supabase/supabase/blob/master/apps/studio/components/interfaces/SQLEditor/useSqlEditorExecution.ts)
guards execution with its pending mutation state. This supports the observed
dashboard UI restriction; it does not prove that PostgreSQL or every dashboard
connection is globally serialized. The deployed dashboard version was not
inspected. Separate browser contexts isolate the frontend state, but do not
guarantee backend independence: the existing strict evidence validator must
still establish distinct PIDs, a lock timeout and overlapping server intervals.

For the next bounded attempt, reuse the already-generated revision-5 SQL exactly.
No diagnostic refresh, fixture generation or new operation is needed. Prepare
both complete scripts in separate dashboard browser contexts before running
either, then follow steps 6–12 above. Both existing diagnostic tabs and the relay
remain open. Do not mix one old output with one new output. If the dashboard
still prevents simultaneous execution, or the resulting evidence lacks overlap,
STOP with UNVERIFIED rather than repeating indefinitely or changing timeouts.

To explicitly establish two independent database connections instead of relying
on dashboard behavior, use two separate already-installed PostgreSQL client
processes (for example two psql terminals), or two explicitly separate connections
in an existing database GUI. Two query tabs sharing one GUI connection do not
qualify. Use the project's **Connect → Direct connection** configuration, or
**Session pooler** if direct connectivity is unavailable; use SSL. Supabase's
[connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)
documents these connection modes. Do not use transaction pooling for this
session-identity procedure. Configure credentials privately in the client; do
not place passwords in scripts, shell history, source control or chat. No API
key or browser Auth token is involved, and no new role or grant is necessary.

Before running either generated script on those two connections, run this
read-only preflight in each and retain the outputs:

```sql
SELECT pg_backend_pid() AS backend_pid, current_database() AS database_name,
       current_user AS connected_role;
```

Require distinct PIDs on the intended project/database, using the same existing
administrative connection role used for reviewed SQL validation. Keep both
connections open, prepare the unmodified HOLDER and WAITER scripts, then run
HOLDER in A and immediately WAITER in B during the 20-second hold. The scripts
set the transaction-local authenticated role themselves. Final evidence must
still pass the existing interval/timeout/identity guards. If no suitable client
is already available, stop and review a separate tooling/setup step; do not
install tooling or alter production configuration as part of this diagnostic.

No SQL, project connection or fixture mutation was performed by Codex for this
procedure correction. Scripts, evidence validation and cleanup guards are
unchanged. The revision-5 fixture, five receipts, caches, markers and barrier
evidence remain the same; delayed-acknowledgement fencing remains open.

### Final bounded gate on the existing revision-5 fixture

Operator-reported live locking PASS: two separate dashboard browser contexts
produced different backend PIDs and a waiter timeout wholly inside the holder
interval. Exact metadata/receipt checks passed and the cache was unchanged.
Revision remains 5 with five receipts. No SQL rerun, cleanup, replay, park or
operation allocation followed. SQL evidence is retained in the LEFT marker.

The final path is read-only. It deliberately delays the real receipt response
for the existing revision-3→4 recovery operation (not the barrier operation).
An isolated **in-memory** repository hydrates a validated historical base and
pending command using the existing supported cache/recovery interface, then
calls the real receipt RPC. The pending record is a diagnostic reconstruction,
not a new uncertain network event and never written into browser storage.
No semantic command is dispatched and no operation ID is allocated or reused
for a mutation. This tests production reconciliation's late acknowledgement
handling rather than merely inspecting an old JSON value.

Before the historical receipt is delivered to that repository, LEFT disposes
it, advances the diagnostic generation and opens authoritative revision 5 in a
fresh production repository. It validates the full state and prior receipts
without rewriting cache bytes. Releasing the held receipt must produce
REPOSITORY_DISPOSED, zero observer publications and zero durability accepts.
An attempted revision-4 refresh through the old cache binding must separately
fail with CACHE_CONTEXT_CHANGED. Server state, receipts and acknowledged cache
must remain identical. Ordinary runtime behavior, SQL and cleanup guards do not
change. This is not proof of genuine packet loss/reload recovery (Phase C).

Perform one action at a time, in this order:

1. Keep the relay and both existing diagnostic tabs open. Refresh ONLY the
   same LEFT diagnostic tab once to load the new controls. Its session marker,
   SQL/barrier evidence and scoped cache remain. RIGHT stays idle; no JSON copy,
   SQL rerun or operation allocation is needed.
2. LEFT: click **Hold prior revision-4 receipt (read-only)**. Expect HELD.
3. LEFT: click **Open revision 5 and fence old context**. Expect PASS confirming
   authoritative revision 5 and retained cache bytes.
4. LEFT: click **Release held receipt and verify fencing**. Expect PASS with
   zero publication/durability calls and unchanged revision 5/five receipts/cache.
5. LEFT: click **Final read-only Phase B check at revision 5**. It revalidates
   prior flags, exact SQL evidence and current server/cache state. Expect
   COMPLETE only if all assertions pass.
6. STOP and report results. Cleanup remains a separate deliberate step using
   the existing exact revision-5 guards. Do not run SQL or remove storage yet.

Complete steps 2–4 within 120 seconds. There is no peer/manual-copy deadline.
After HELD, only the next fencing action is enabled. Do not reload, sign out or
switch accounts during the hold. Timeout, unexpected receipt/state, disposal or
account changes fail closed; retained markers prevent automatic restart and no
mutation is retried. If stopped, retain everything and report the precise error.
Refreshing before step 2 is safe; refreshing after HELD cannot resume the
in-memory hold and must not be mistaken for a successful fencing check.

Only a new `attempts.startBarrier.fencing` subrecord and verification flag are
saved; fixture IDs, receipts, operation IDs, barrier/SQL evidence and caches stay
unchanged. LEFT's final check verifies this recovered path rather than invoking
the retired revision-4 final check. No new revision is required.

### 3. Reuse rejection and delayed acknowledgement fencing (original revision-4 path only)

1. In BOTH contexts run the explicit **changed content with committed operation
   ID** negative test. It must receive definite `OPERATION_ID_REUSED` rejection;
   metadata, revision 3 and the original receipt must remain identical.
2. LEFT clicks **Hold an old real receipt acknowledgement**. This performs a real
   receipt read at revision 3 and holds its publication for at most 60 seconds.
3. RIGHT clicks **Commit the explicit NEWER test state**, reaching revision 4.
4. LEFT clicks **Refresh revision 4 and dispose prior context**, then **Release
   held acknowledgement**. The old cache binding must reject the late revision-3
   result; confirmed revision-4 cache/state cannot regress.
5. Do not reload during this hold. This is a deliberately delayed real receipt
   acknowledgement, not a network outage or an extra identical mutation retry.

### 4. Actual independent-session locking (manual SQL only)

1. Generate the holder/waiter scripts after revision 4. Review their exact owner,
   Universe UUID and expected metadata. They create no schema/function/table and
   write no domain data. They use transaction-local authenticated test claims,
   short timeouts, a row lock and final ROLLBACK. There are no secrets in them.
2. Use TWO genuinely independent SQL sessions, normally the Supabase SQL Editor
   if it permits simultaneous executions. Run the whole **holder** script in
   session A. While it is holding its eight-second lock, run the whole **waiter**
   script in session B. Do not run both sequentially in one tab.
3. Copy the two returned `phase_b_lock_evidence` JSON objects into an array
   `[holderObject, waiterObject]` in the diagnostic. Click the lock evidence check.
   A PASS requires different backend PIDs, the same exact owner/Universe,
   authenticated role, an observed 55P03 lock timeout lasting approximately two
   seconds, wholly inside the holder's recorded lock interval.
4. If the waiter did not wait, PIDs match or intervals do not overlap, report
   **UNVERIFIED**. Two SQL Editor tabs alone are not proof. A deliberate rerun of
   these rollback-only read/lock scripts is safe after both transactions end;
   it is not a mutation retry. If independent overlap cannot be demonstrated,
   stop this gate and review a separate manual connection method. Do not install
   tools, add RPCs/grants or invent locking evidence to continue.
5. The scripts themselves have not been compiled/executed by Codex. If a script
   errors before its final ROLLBACK, explicitly end that transaction with
   `ROLLBACK` in the affected session before doing anything else. Retain the
   fixture for review. SQL output is trusted operator evidence, not a signed
   browser attestation; use the generated unedited scripts from this project.
6. LEFT runs **Final Phase B check**. Without SQL proof it reports UNVERIFIED;
   with all browser and SQL assertions it reports COMPLETE.

### 5. Guarded cleanup

1. Use **Inspect exact fixture read-only and generate guarded cleanup**. It can
   inspect a known partial stage after a stop; it never seeds/repairs/retries.
   Unknown metadata, invalid acknowledgements or unexpected known receipts block
   generation. Retain the generated SQL and printed origin/cache/marker keys.
2. CLOSE BOTH diagnostic tabs to dispose their contexts and scheduled callbacks.
   Then run the entire generated cleanup transaction manually in SQL Editor
   under the ordinary administrative SQL role. Do not run it as authenticated.
3. Require **`test_universes_removed = 1`**. The SQL locks the exact Universe and
   checks owner, revision, full snapshot flags, every entry field, absence of
   related collection/member/placement rows, exact receipt COUNT, original
   commands' server-normalized SHA-256 digests and complete acknowledgements.
   Only then does it delete that fixture's receipts/entries/Universe. Extra,
   changed or absent data aborts the entire transaction; never remove guards.
4. Only after confirmed database cleanup, manually remove the one printed
   `localStorage` cache key and Phase B `sessionStorage` marker at EACH origin.
   Verify both reads return null. Do not clear all storage, Auth sessions, Phase A
   identities or the real local Cosmos. No Auth-user deletion is needed.

## Checks and limits

Run deterministic Node tests and a two-origin isolated browser suite:

```text
node --test --test-timeout=15000 tests/cloud-concurrency.test.js
python tests/browser-check.py --cloud-concurrency-only
```

The browser suite substitutes the SDK/Auth transport with a standard-library
local HTTP mock at each origin's `/__phase_b_mock_rpc__`. It is enabled only by
the test flag, never shipped as an application endpoint, and uses the unchanged
hosting headers. No Supabase/CDN requests or SQL occur. Node tests exercise the
real gateway, repository, projection and cache with two independent V8 clients.

Initial verification: all 13 focused Phase B Node tests passed within the broader
450-test non-physics regression run; the 58 physics regression tests also passed.
Initial mocked browser runs passed 35 Phase B checks, 39 Phase A checks and 83 existing
Auth/cloud-foundation checks. No live request or SQL execution was involved.
`git diff --check` also passed.

Sequencing-recovery adjustment verification: 15 focused Phase B Node tests
passed within 452 non-physics regression tests. The updated mocked two-origin
browser suite passed 37 checks, including one-sided verification blocking the
next ticket/RIGHT dispatch. Recovery tests reproduce LEFT-only revision 3,
historical race verification, read-only receipt recovery, one exact explicit
replay, unchanged server state/receipts and refusal to mark missed concurrency
COMPLETE even with locking evidence. No live request or SQL was run.

Fresh-operation recovery extension verification: 17 focused Node tests passed
within 454 non-physics regression tests. The updated mocked two-origin browser
suite passed 55 checks, including the new recovery controls. Tests cover both
original/replay orders, preservation of existing fixture/receipts/cache keys,
strict readiness, actual client-call overlap gating, exact cleanup guards and
failure on changed state/IDs/observations. SQL generation is tested statically;
no generated SQL or live Supabase request was executed.

Expired-ticket read-only adjustment: 18 focused Node tests passed within 455
non-physics regression tests; 60 mocked browser checks passed. They reproduce
LEFT-only revision 4 with RIGHT expiry before dispatch, verify unchanged cache
bytes/fixture IDs/prior receipts and original dispatch markers, reject changed
proofs or an actually dispatched RIGHT, and prove retired countdown controls
cannot be enabled by readiness input. Existing cleanup generation is unchanged.
`git diff --check` passed. No live request or SQL was executed.

Coordinated start-barrier verification: 21 focused Node tests passed within 458
non-physics regressions; seven pure/local-HTTP Python relay tests passed; 72
mocked two-origin browser checks passed using the actual local relay and mocked
Auth/Supabase transport. Tests verify parking before mutation, two-confirmation
release, missing/stale-peer abort, exact Origin/Host/plan/context binding,
credential rejection, one original/replay application, account-change fencing,
strict overlap gating and unchanged prior cleanup output. Browser checks can
report overlap UNVERIFIED for an exceptionally fast mock; they never fabricate
a pass. Generated SQL is only inspected, not executed. No live Supabase request
or SQL execution is claimed, and no dependency/config/header change was made.

Revision-5 negative reuse verification: 23 focused Node tests passed within
460 non-physics regression tests; 81 mocked browser checks passed. Tests cover
exact committed-ID reuse with changed content, definite CM004 mapping, unchanged
five-receipt/server metadata/cache state, preserved original identities/dispatch
proofs, duplicate-dispatch refusal, wrong-error refusal and changed-receipt
refusal. The browser mock adds 50ms transport latency only to successful
revision-4 commands to exercise strict overlap deterministically; live overlap
validation is unchanged. No live requests or SQL were executed.

Revision-5 independent-lock preparation verification: 25 focused Node tests
passed within 462 non-physics regressions; 85 mocked browser checks passed.
Tests inspect exact target/role/20-second hold/two-second timeout/ROLLBACK,
NULL-safe new holder guards, parenthesized JSONB evidence tags and absence of
domain/DDL writes. Evidence tests reject old plan/revision/operation tags,
matching PIDs, nonoverlap and missing timeout; accepted synthetic evidence
preserves metadata/receipts/cache and cannot mark Phase B COMPLETE. SQL was
generated/inspected only, not compiled or executed. `git diff --check` passed.

Operator-reported live validation includes the competing-write case, coordinated
revision-4→5 identical operation and changed-content reuse rejection. Both
revision-5 lock scripts first executed successfully with final ROLLBACK but
sequentially. The subsequent operator run in separate dashboard browser contexts
passed independent-session waiting with different PIDs and an overlapping waiter
timeout; metadata, receipts and cache remained unchanged. Delayed
acknowledgement fencing subsequently passed the bounded revision-5 read-only
diagnostic; see the completed checkpoint below. Model/static SQL tests are not a
PostgreSQL execution substitute. Genuine network-loss/reload recovery, broader
semantic compatibility/performance, cloud files, migration/activation, merge,
realtime and PWA remain separate gates. Phase A configuration is not altered.

Final revision-5 fencing preparation: 28 focused Node tests passed within 465
non-physics regression tests; 94 mocked two-origin browser checks passed. Tests
verify real repository receipt reconciliation, disposed-context rejection, zero
observer/durability calls, cache generation rejection, unchanged cache bytes,
all prior identity/evidence fields and cleanup SQL, and refusal before SQL proof,
after account switch/disposal, changed metadata/receipt or expired hold. Browser
tests use synthetic SQL evidence only to exercise controls; they do not execute
SQL or claim live locking. The sandbox browser launch failed to start; the
bounded isolated-browser run outside it passed with mocked transport only.
`git diff --check` passed. No live request, SQL or deployment was performed.

## Completed live Phase B checkpoint and cleanup

The operator reported the final diagnostic result:

```text
COMPLETE: Phase B competing writes, coordinated identical operation, changed-content rejection, independent SQL locking and delayed-acknowledgement fencing verified at revision 5. Stop; cleanup remains a separate deliberate action.
```

At completion the authoritative state was revision 5 with five intact receipts,
unchanged cache, verified SQL locking evidence and verified delayed-response
fencing. Independent locking used separate Supabase dashboard browser contexts
and different backend PIDs, with the waiter timeout wholly inside the holder
interval. Earlier sequential/missed-concurrency attempts did not count as proof;
the later bounded barrier and locking tests supplied that proof.

The operator then ran the unchanged guarded revision-5 cleanup and confirmed:

- `test_universes_removed = 1`.
- LEFT and RIGHT exact cloud-cache keys both returned null.
- LEFT and RIGHT `cosmifold:dev:cloud-concurrency:v1` markers both returned null.
- Both diagnostic tabs were closed; the loopback relay was stopped with Ctrl+C.

Chrome's Application panel initially renamed keys to a blank key during removal.
The operator explicitly removed the resulting blank Local Storage and Session
Storage keys on both origins and reverified the original exact keys returned
null. No Auth session, real local Cosmos or unrelated storage was removed. For
future cleanup, prefer exact-key `removeItem` calls after guarded database
success rather than editing the key-name cell; never clear whole stores.

This closes Phase B's live validation and cleanup gates for the tested fixture.
No production activation, migration, cloud files, deployment or commit follows
automatically. The development-only diagnostics and tests remain available for
review. Phase C durable uncertain-write/reload/transport-failure recovery remains
open; Phase B's in-memory historical-receipt fencing is not a substitute for it.
No live Supabase request or SQL was executed by Codex to record this result.
