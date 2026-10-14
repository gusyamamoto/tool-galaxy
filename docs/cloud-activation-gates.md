# Remaining gates before cloud activation

Normal Cosmifold still uses the browser-local Cosmos, IndexedDB files and local
Backup/Restore. Signing in does not claim/upload data. Storage v5 and Backup v1
are unchanged. Phase A passed live and was cleaned up; this document plans the
next tests. Phase B is now authored as an inactive diagnostic with guarded manual
SQL generation; [its procedure](cloud-revision-concurrency.md) is ready for review.
No live Phase B result or SQL execution is claimed.

## Closed identity/privacy gate

The [Phase A checkpoint](cloud-boundary-integration.md) records same-owner A1/A2
and real-user A/B isolation, delayed-response fencing, validated returning-account
bootstrap, private REST exclusion, exactly five approved authenticated-only RPCs
and independently verified disabled GraphQL. Cleanup returned
`test_universes_removed = 3`; exact diagnostic cache verification was `[]`; the
session marker was `null`. This is user-reported real-project evidence, not a
claim that Codex executed it or proof of a future enabled GraphQL configuration.

## Next bounded phase: revision concurrency and idempotency

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
stopping gate is closed; its development artifacts remain inactive and
unstaged/uncommitted. These results are operator-reported, not remote execution
by Codex. No second account, token copying or new credentials were needed.

## Gates still open

| Gate | Urgency / next boundary |
| --- | --- |
| Durable uncertain operation across reload; real lost/delayed requests/replies; missing/later receipts | Separate Phase C; close before activation. Preserve original operation identity, block dependent writes and never treat a missing receipt as proof of noncommit. |
| Multi-tab pending-operation ownership, session changes during commits/recovery, reload/lock races | Phase B covers ordinary competing clients; Phase C covers pending/recovery races. Close before activation. Phase A is not blanket race coverage. |
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

Phase A is complete and committed. Phase B is complete, live-validated and
cleaned up; its changes remain inactive and unstaged/uncommitted, ready for a
separate review/commit decision. Neither phase authorizes cloud activation.

## Recommended next bounded branch: Phase C

Recommended name: `test/cloud-uncertain-recovery`. First checkpoint and commit
the reviewed Phase B work when explicitly authorized, so the new branch has a
clear baseline; do not carry its disposable fixture forward or recreate it.

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

No Phase C implementation or live test is authorized by documenting this scope.
Realistic metadata compatibility, private cloud files and reversible migration
remain subsequent gates; normal cloud activation is still blocked.

Phase B local verification: 450 non-physics Node regression tests and 58 physics
tests passed. Mocked browser checks passed: Phase B 35, Phase A 39, and existing
Auth/cloud foundation 83. These are local/mock results, not Supabase or
PostgreSQL validation. Normal application code, migrations, Auth configuration,
headers and runtime persistence are unchanged; no dependencies or connections
were added.
