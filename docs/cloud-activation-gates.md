# Remaining gates before cloud activation

Normal Cosmifold still uses the browser-local Cosmos, IndexedDB files and local
Backup/Restore. Signing in does not claim/upload data. Storage v5 and Backup v1
are unchanged. Phase A passed live and was cleaned up; this document plans the
next tests only. No Phase B diagnostic or SQL has been implemented here.

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

## Planned manual steps after Phase B is authored and reviewed

**There is no new page or SQL script to run now.** The next branch should supply:

1. Serve the repository on the current loopback origin. Sign in as the test owner
   normally and open the new diagnostic in two independent tabs/contexts. No
   second account, password/token copying or new credentials are needed.
2. Explicitly prepare one new disposable Universe in the first context; retain
   its owner/UUID/operation IDs and generated guarded cleanup SQL. Join that exact
   fixture in the second context; do not create another Universe.
3. Run the distinct-operation race, checking one winner/one stale rejection and
   unchanged losing cache. Refresh both test contexts to confirm the winner.
4. Run identical-operation concurrency, changed-digest rejection and coherent
   reads/reopen. Failed checks must stop without recreating/retrying fixtures.
5. Review generated lock-test SQL. Run holder/waiter in genuinely independent SQL
   sessions with short bounded waits, different PIDs and automatic rollback/release.
   If SQL Editor cannot provide provable overlap, stop that assertion as unverified
   rather than weakening it or installing/connecting tooling automatically.
6. After final verification, run generated guarded cleanup manually. Require
   explicit confirmation for the exact expected Universe. Unexpected metadata,
   revisions or receipts must abort cleanup. Remove only printed Phase B
   cache/marker keys and verify absence; never clear all browser data.
7. Report live results for the documentation checkpoint. Do not enable cloud mode
   or use real local/cloud Cosmos data as a test fixture.

## Gates still open

| Gate | Urgency / next boundary |
| --- | --- |
| Concurrent writers, identical retries, coherent reads and actual locking | Phase B; close before normal activation |
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

Phase A is ready for review/commit when the user chooses. This documentation
checkpoint does not commit it or implement Phase B.

Documentation-checkpoint verification: 200 focused cloud/gateway Node tests
passed and `git diff --check` passed. Existing browser/live evidence is recorded
separately; no browser suite rerun was needed for these documentation-only edits.
No application, diagnostic implementation, migration, Auth configuration or
runtime persistence was changed, and no dependencies or connections were added.
