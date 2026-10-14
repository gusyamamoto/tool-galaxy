# Remaining gates before cloud activation

Normal Cosmifold still uses the browser-local Cosmos, IndexedDB files and local
Backup/Restore. Signing in does not claim/upload data. Storage v5 and Backup v1
are unchanged. Phase A, Phase B and the initial Phase C checkpoint are merged,
operator-run live-validated and cleaned up. The browser Offline/reconnect
checkpoint and server-committed/native-response interruption checkpoint have
also passed live and been cleaned up. The controlled missing-then-visible
ORIGINAL receipt checkpoint has now passed live and been cleaned up as well:
receipt visibility was withheld AFTER an independently verified real commit.
The next open transport timing gate is a server-admitted operation whose receipt
is genuinely absent on the server at lookup and created later; it remains
UNVERIFIED, as does interruption/cancellation midway through SQL execution. The Offline
checkpoint proves transport failure before server execution/dispatch completion,
not arbitrary interruption while the server executes. No live request or SQL is
run by Codex.

## Closed identity/privacy gate

The [Phase A checkpoint](cloud-boundary-integration.md) records same-owner A1/A2
and real-user A/B isolation, delayed-response fencing, validated returning-account
bootstrap, private REST exclusion, exactly five approved authenticated-only RPCs
and independently verified disabled GraphQL. Cleanup returned
`test_universes_removed = 3`; exact diagnostic cache verification was `[]`; the
session marker was `null`. This is user-reported real-project evidence, not a
claim that Codex executed it or proof of a future enabled GraphQL configuration.

## Closed Phase B: revision concurrency and idempotency (retained test scope)

Recommended branch: **`test/cloud-revision-concurrency`**.

Goal: prove competing clients cannot silently overwrite acknowledged metadata,
apply one operation twice or expose a mixed revision. Keep normal cloud mode
inactive. Use **one new disposable file-free Universe** under one signed-in
test owner; never read/upload the local Cosmos or reuse the cleaned Phase A IDs.

Scope:

1. Two independent browser contexts open the same Universe/revision, then release
   distinct semantic commands with different operation IDs and the same base
   revision together. Exactly one wins/increments once; the stale loser has no
   receipt/partial changes or cache revision advance.
2. Race identical content with the **same original operation ID**. Verify one
   application/revision increment, one receipt and matching original/replayed
   acknowledgements. Reuse that ID with changed content and prove atomic rejection.
3. Verify coherent reads during/after writes and both clients refreshing the
   authoritative winning projection/revision. Presentation remains device-local;
   a cache write is never proof of a server commit.
4. Establish actual locking with two independent PostgreSQL sessions using
   reviewed, bounded scripts scoped to the exact disposable owner/Universe. A
   holder temporarily locks that Universe; the waiter invokes an ownership-checked
   RPC with a short lock timeout. Record different backend PIDs and timing/outcome.
   No new RPC, grant/schema changes, secret browser keys or automatic connections.

Browser races prove the tested revision outcome, not that a particular backend
lock actually waited: requests may arrive sequentially. SQL Editor tabs also do
not inherently guarantee independent overlapping sessions. If independence and
overlap cannot be established, record locking as **unverified**, not passed.
Do not install tools or connect automatically; review a different manual session
method separately if needed. Use short bounded timeouts and transaction release.

Author development-only diagnostics, deterministic mocks and manual lock/cleanup
artifacts. Likely files are new `dev/cloud-concurrency-*`, focused
`tests/cloud-concurrency*`, browser checks and `tests/database/cloud-concurrency-*`
scripts. Existing gateway/repository/cache/workspace modules remain the source
of truth; change them only for a reproduced issue, explained before fixing.

Do not simulate genuine transport loss here, build merge/outbox, implement cloud
files/migration/chooser, activate startup, change production configuration or
deploy. Unexpected outcomes stop the diagnostic while preserving correlation
identities; no blind mutation retry. A failed compound/stale command must leave
no partial metadata or receipt state.

Stopping gate: bounded browser revision/idempotency/read/cache checks pass live;
actual independent-session lock evidence is recorded or explicitly left open;
local regressions pass; guarded cleanup confirms removal of only the expected
test Universe/state/receipts and its printed cache/marker keys. This does not
authorize normal-app cloud activation.

## Phase B manual validation

Phase B now supplies `/dev/cloud-concurrency-diagnostic.html` and generated
scoped SQL. Use [the exact stage-by-stage procedure](cloud-revision-concurrency.md).
The implementation requires TWO distinct
loopback origins to avoid same-origin cache/Web Lock serialization; preparation
seeds revision 1; the current recovered fixture is revision 5 with five receipts.
The operator has verified independent SQL locking at revision 5 using two
dashboard browser contexts, distinct backend PIDs and overlapping lock/timeout
intervals. The final read-only historical-receipt reconciliation and fresh-context
fencing check also passed live, producing COMPLETE at revision 5 with all five
receipts and cache unchanged. Guarded cleanup then returned
`test_universes_removed = 1`; the exact cache and marker keys returned null at
BOTH origins, both diagnostic tabs were closed and the relay was stopped.
The operator also removed accidental blank Local/Session Storage keys left by
Chrome Application-panel editing and rechecked the original keys. No Auth
session, real local Cosmos or unrelated storage was removed. Phase B's live
stopping gate is closed; its merged development artifacts remain inactive.
These results are operator-reported, not remote execution
by Codex. No second account, token copying or new credentials were needed.

## Gates still open

| Gate | Urgency / next boundary |
| --- | --- |
| Server-admitted operation with genuinely absent server receipt created later; interruption/cancellation during SQL execution | UNVERIFIED: controlled missing-then-visible receipt observation after an independently proved commit has PASSED live and been cleaned up. That bounded checkpoint does not prove natural database replication/visibility delay, actual later receipt creation or mid-SQL interruption. Independently establish admission/overlap and the relevant server outcome in a separately reviewed timing test. |
| Multi-tab recovery contention and session changes during delayed recovery | Phase C live-validated stale-peer/base protection; account changes and simultaneous recovery contention are automated-tested but broader live timing races remain open before activation. |
| Rich/compound semantic HTTP round trips, archive/link/Constellation/order parity and parser/history compatibility | Subsequent bounded metadata compatibility phase; before activation/import of real data |
| Private cloud files, originals/thumbnails, copies/deletion, upload recovery and portable export | Before normal activation/migration of file-bearing Cosmos. Strict attachment rejection remains until complete support; never imply local-only binaries are synced. |
| Reversible local-to-account copy/verify and explicit dataset choice/activation | Separately reviewed branches after persistence/files gates; retain local original, IDs and Backup/Restore; no automatic claim/merge/overwrite |
| Ordinary save/reconnect/refresh UX, quota/cache failures and realistic performance | Establish correctness and practical limits before public launch; no unrestricted offline editing claim |
| Cloud-aware export/recovery and restore/import boundaries | Review alongside files/migration before destructive replacement; local Restore must not silently target cloud data |
| PWA/native wrappers, unrestricted offline outbox/merge, realtime collaboration and sharing | Defer; not prerequisites for this inactive test phase |

Recommended order: Phase B concurrency -> Phase C durable/transport-failure
recovery -> rich metadata compatibility -> private cloud files/lifecycle ->
reversible migration engine -> dataset chooser/controlled activation and
cross-device refresh -> cloud portability/launch checks. Portability design must
accompany files/migration; implementation must not leave users unable to preserve
or restore data before any destructive action. Keep each branch independently
reviewable rather than combining them into an activation rewrite.

Phase A/B and the initial Phase C checkpoint are merged, live-validated and
cleaned up. Their development code stays inactive. None authorizes cloud activation.

## Phase C checkpoint and remaining transport tests

The `test/cloud-uncertain-recovery` checkpoint is merged. Do not carry its
cleaned-up disposable fixture forward or recreate it. At that checkpoint the
recommended follow-up was `test/cloud-network-interruption`, extending the same
recovery diagnostic; the completed transport subgates are recorded below.

Prepare an inactive, disposable-Universe diagnostic for durable uncertain writes
across reload and unavailable/missing/later receipts. Use the existing gateway,
repository, scoped cache and workspace recovery APIs. Begin with deterministic
tests, then a separately reviewed manual transport-failure procedure. A held
Promise alone is not genuine network-loss evidence: distinguish a harness-dropped
response after a real server commit from actual browser/network interruption.
Never claim which server outcome occurred until a receipt or authoritative read
proves it. Missing receipt remains unresolved; no blind resubmission/new operation
ID, offline outbox or automatic merge. Keep all failure injection confined to the
development diagnostic, never normal application startup or production settings.

Test the original operation surviving reload, receipt-proven commit advancing
cache exactly once, unresolved recovery blocking dependent commands, quota/cache
write failure after acknowledgement, and late responses after account/context
disposal. Follow with same-origin multi-tab pending ownership/recovery races in
one bounded substep, distinct from Phase B's two-origin writer test. Generate
guarded cleanup for each new fixture and retain real local data untouched.

The initial Phase C diagnostic and deterministic tests are now implemented on
`test/cloud-uncertain-recovery`; see [the bounded plan/procedure](cloud-uncertain-recovery.md).
The operator has live-validated lost-reply persistence across reload, blocked
dependent writes, original-ID receipt recovery without semantic resubmission,
repeat recovery without duplicate application, stale same-origin peer fencing
and authoritative revision-1 reopening. Guarded cleanup removed exactly one
test Universe and browser cleanup returned **No Phase C fixture**. This inactive
checkpoint is merged; interruption during SQL execution and the other live
subcases in the bounded plan remain separate gates. Future runs still require
procedure review. Realistic metadata compatibility, private cloud files and
reversible migration remain subsequent gates; cloud activation is still blocked.

### Closed bounded checkpoint: browser Offline and reconnect

The existing diagnostic now offers **Actual browser Offline transport / reconnect**.
Online preflight verifies the new empty fixture/cache/receipt before any mutation.
The operator then sets DevTools Offline and sends exactly one journalled command
through the actual gateway. This case neither suppresses a successful reply nor
fabricates receipt failure. Native transport failure must leave the same pending
ID/cache; real offline receipt failure must keep writes blocked. After restoring
network and reloading, receipt lookup must either preserve unresolved missing
state or accept the original receipt, without semantic resubmission. A missing
receipt never authorizes a retry or deletion of pending state.

See [the completed checkpoint and repeatable procedure](cloud-uncertain-recovery.md#completed-bounded-checkpoint-browser-offline-transport-and-reconnect).
The extension uses the same marker/cache namespace, workspace, projection, RPC
gateway and unchanged guarded cleanup. Old Phase C cases remain compatible.
No new schema, SDK client, repository, outbox, service worker or production mode.
Local tests include native Chromium Offline against a mocked local backend.
The operator has now live-validated the real commit failure
`net::ERR_INTERNET_DISCONNECTED`, retained original pending ID/exact revision-0
cache, failed real offline receipt transport and blocked dependent writes.
Online reload/reconnect found a genuinely missing original receipt at revision
0; no semantic resend or replacement ID occurred. Guarded cleanup returned
`test_universes_removed = 1`; only the exact test cache/marker keys were removed,
and the diagnostic returned **No Phase C fixture** / **Ready; no requests made.**
Future new runs still require deliberate procedure review and fresh fixtures.
This case starts offline before dispatch: it does not prove arbitrary interruption
after PostgreSQL begins a mutation, long offline reload of app/SDK assets, or all
account/multi-tab/quota races. Keep those and rich metadata/files/migration gates.

### Next incomplete transport timing gate: genuinely absent server receipt created later

The next bounded diagnostic must establish server admission/overlap independently, not
infer it from a clicked button, client timer, Offline flag or locally held
Promise. Then interrupt transport/reload without resubmitting, preserve the
original pending command, and verify unresolved/missing receipt states stay
blocked until the original receipt proves an outcome. Where a late commit
occurs, accept it once, refresh authoritative state and fence abandoned contexts.
Use new disposable fixtures and unchanged ownership/revision/cleanup boundaries.
If actual admission/overlap or a later receipt cannot be established, mark that
case UNVERIFIED.

### Closed bounded checkpoint: controlled missing-then-visible ORIGINAL receipt

`feature/cloud-late-receipt-recovery` has PASSED operator-run live validation and
guarded cleanup (2026-10-14). In an isolated Chrome debug profile on port 9222,
same-origin OBSERVER independently verified the ORIGINAL receipt and exact
authoritative revision-1 state before native response failure, while WRITER's
original journal/cache remained at revision 0. Only WRITER prepared one disposable
Universe; the existing native interruption harness ran exactly once.

Transport-only `--reconnect` made no RPC, mutation or reload. WRITER-only reload
then reopened the SAME original operation. The diagnostic verified the real
underlying receipt/state and deliberately withheld receipt visibility from
recovery as controlled missing, explicitly NOT a server-missing result. The
original ID/journal and exact revision-0 cache survived another reload/check;
dependent writes stayed blocked. There was no resend, replacement ID, unresolved
journal deletion or speculative publication.

Explicit visibility restoration changed only control state, leaving journal/cache
at 0 with no mutation or acknowledgement. Reopening recovered the SAME ORIGINAL
validated receipt at revision 1 once. Two repeat checks preserved revision/state
without a second semantic application or mutation call. Both diagnostics were
disposed; full guarded Phase C cleanup returned `test_universes_removed = 1`.
Only exact temporary cache/marker keys were removed, restoring
**No Phase C fixture.** / **Ready; no requests made.**

See [the exact proof, live record and repeatable procedure](cloud-late-receipt-recovery.md).
This operator-reported evidence closes safe recovery across controlled receipt
unavailability AFTER a real original commit. It does not prove natural database
replication/visibility delay, a genuinely absent server receipt created later,
or interruption/cancellation midway through SQL execution. The deployed
metadata/revision/receipt transaction remains atomic. Production recovery behavior
is unchanged; cloud mode remains inactive and all remaining gates stay in force.

### Closed bounded checkpoint: server-committed / native response interruption

The bounded **server-committed / native response interruption** diagnostic was
live-validated on `feature/cloud-inflight-recovery` using the existing recovery
architecture. It pauses the exact commit response in Chromium before SDK
delivery, independently reads the real original receipt and revision-1 state
from another same-origin tab, then natively fails transport and preserves the
writer's original revision-0 journal. Reconnect/reload recovers that receipt
without resend. No SQL, RPC, schema/grant or production-client changes.
See [the exact admission proof, limits and reviewed manual procedure](cloud-inflight-recovery.md).
The operator independently observed the original receipt/exact revision-1 state
before native failure while WRITER's journal/cache remained at revision 0.
Transport-only reconnect and WRITER-only reload recovered the original receipt
once; two repeated recovery checks preserved the same state without resend,
replacement ID, stale publication or duplicate semantic application. Both
diagnostics were disposed; guarded cleanup returned `test_universes_removed = 1`;
only exact temporary cache/marker keys were removed, returning the diagnostic to
**No Phase C fixture.** / **Ready; no requests made.**
This is operator-reported live evidence, distinct from local/mock tests. It
covers committed-but-unreceived response loss, not cancellation during SQL
execution or a receipt created after an initially missing lookup. Those timing
cases remain separate open gates. No normal cloud mode was activated.

Phase B local verification: 450 non-physics Node regression tests and 58 physics
tests passed. Mocked browser checks passed: Phase B 35, Phase A 39, and existing
Auth/cloud foundation 83. These are local/mock results, not Supabase or
PostgreSQL validation. Normal application code, migrations, Auth configuration,
headers and runtime persistence are unchanged; no dependencies or connections
were added.
