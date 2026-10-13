# Cloud metadata repository — Step 5

This step adds an explicitly constructed, revision-checked **file-free** cloud
repository. It is not loaded by normal startup. No existing local Cosmos is
read, uploaded, associated with an account or moved. Auth, local persistence v5,
Backup/Restore, UI, hierarchy, navigation and physics are unchanged. The SQL
migration and five installed public RPCs are unchanged.

## Live Step 5 checkpoint

The user reports that the real Supabase commit/receipt diagnostic passed and
the generated guarded cleanup returned `test_universe_removed = true`.
This is user-supplied integration evidence; Codex did not connect to Supabase,
execute the diagnostic or run cleanup SQL.

| Live check | Reported result |
| --- | --- |
| Disposable empty Universe | Started at revision `0` |
| One semantic metadata commit | Succeeded and advanced to revision `1` |
| Deliberately withheld successful reply | Reconciled through the real operation-receipt RPC |
| Coherent read | Returned exactly the committed test metadata at revision `1` |
| Receipt | Matched the original operation and resulting revision |
| Repeated reconciliation | Returned the same acknowledgement without a second semantic mutation |
| Fresh operation with deliberately stale base `0` | Rejected; metadata and revision `1` stayed unchanged |
| Existing local Cosmos upload | None |
| Guarded SQL Editor cleanup | `test_universe_removed = true` |

**Step 5 is ready to commit as an inactive repository foundation.** This closes
the bounded real commit/read/receipt/stale-write and fixture-cleanup gate. The
reply was withheld deliberately after success, so this does not prove every
genuine transport-loss/delayed-request scenario or independent-session race.
Cloud mode and normal startup remain unchanged.

For this documentation checkpoint, **117 focused local tests passed** across
the repository, commit diagnostic, gateway, projection, schema static checks
and validation generator, with a 30-second process limit. `git diff --check`
passed. These local checks are separate from the user-reported live results.

```text
Explicit caller with authenticated owner + Universe scope
    -> cloud repository FIFO command boundary
        -> existing file-free local repository/model/copy planners
        -> validate complete intended v5 result
        -> approved relational projection -> deterministic row patch
        -> metadata gateway -> installed public RPC transaction
        -> validate acknowledgement / reconcile original receipt
        -> publish one server-confirmed state and revision

Normal Cosmifold UI -> existing local repository -> browser storage
```

## API and supported behavior

Load `services/cloud-metadata-changes.js` and
`services/cloud-universe-repository.js` after the existing contract, projection,
model/copy helpers and local repository. Construct explicitly:

```js
const repository = createCloudUniverseRepository({
    scope: {ownerUserId, universeId}, gateway,
    isCurrent: () => accountAndUniverseContextStillMatches
});
await repository.open();
```

The gateway must supply `readUniverse`, `commitMetadata` and
`getOperationReceipt`. Scope never changes: dispose and construct a new instance
for another account/Universe. Future integration must supply a context-generation
fence through `isCurrent` and dispose on context changes. The gateway separately
checks the SDK session/owner. This branch does not wire Auth into cloud mode.

| API | Behavior |
| --- | --- |
| `open()` | Explicit coherent read: `found` with semantic snapshot/revision, or distinct `absent`. No creation/seeding. Explicit reread after conflict. |
| `load()` | Independent copy of confirmed semantic v5, without automatic positions/device layout. Rejects before a found read. |
| `snapshot(runtime)` | Existing allowlisted runtime serializer, with only its known optional undefined slots removed; all nested metadata is strictly validated. |
| `save(snapshotOrCallback, intent)` | Complete intended v5 result; atomic semantic patch for create/edit/delete/reorder, names, appearance and compound changes. |
| `updateContent`, `updateLocation` | Existing file-free content/location planning; validate before normalization can drop unknown/unsupported fields. Null removes the optional field. |
| `replaceConstellations`, `replacePlacements` | Collection names, explicit memberships/order and canonical linked placements. |
| `moveEntries` | Existing effective-root/group move planner and tree/destination checks. |
| `copyEntries`, `duplicateStructure` | Existing file-free planners, allocation/content/link semantics and return shapes. Original canonical text IDs are preserved; new copies use the explicit allocator. |
| `archive`, `restore` | Archive/restoration metadata; not local backup Restore. |
| `deleteSubtree` | Existing ID-set deletion planner; updates memberships, placements, root archives and deletes removed IDs from archived expansion preferences. Caller supplies the intended full deletion set; dangling children reject. |
| `saveLayout`, `checkpointLayout`, `presentation()` | Validated **in-memory** sidecar only. Semantic edits under a layout-only call reject; checkpoints skip queued/pending commands. |
| `revision`, `getState`, `pendingCommand` | Confirmed decimal-string revision, explicit phase and independent copy of the original pending command. |
| `reconcile()` | Receipt lookup for unresolved original operation. Once resolved, returns cached acknowledgement without another write/publication. |
| `subscribe`, `whenIdle`, `dispose` | Acknowledged events, FIFO completion and lifetime fence. Does not dispose borrowed gateway/client. |

The unchanged local `createUniverseRepository` supplies a private planner with
a command sink instead of a local persistence adapter. Its file, Backup/Restore
and synchronous persistence methods are neither exposed nor invoked. File-free
copies can use neutral coordinates to satisfy existing helpers; these remain
presentation-only. No canonical textual ID is converted to a database UUID.

Use snapshot **callbacks** for dependent queued edits: they read the latest
acknowledged state when executed. Captured snapshot arguments are revision-fenced
across the queue and rejected if an earlier write advanced the revision.
Specialized planners require their semantic base to match confirmed data.
`save` accepts a whole intended result, so an external long-lived draft needs
future UI originating-revision/context tracking. No draft/migration UX or merge
is added here.

`whenIdle()` means queued work has settled, not that an uncertain operation was
resolved; inspect `getState()` before treating it as ready. Successful explicit
reads reset cached acknowledgements and presentation, without touching external
drafts or any browser-local Cosmos.

## Revision, patch and publication

Read an explicit owned Universe; distinguish absent, failed and successful empty
reads. Resolve/validate the complete intended result before any mutation. Project
with Step 2, compute changes, allocate a fresh operation UUID and send **one**
command with the latest acknowledged base revision. Accept only a command-bound
acknowledgement with the correct revision/status, then replace confirmed state
and publish once. Timestamps remain ordinary metadata, never conflict resolution.

`cloud-metadata-changes.js` emits the installed `{upsert?, delete?,
snapshot_fields?}` payload over entries, Constellations, members and placements.
Member keys are collection/entry pairs; other keys are text IDs. Explicit
ordinals and optional-array presence survive. Object-key order is ignored for
equality; array order is retained. This equality serialization is **not** the
PostgreSQL request digest. There is no second cloud schema.

Actual no-op receipts use `unchanged` and retain the base revision. Effective
no-op moves use the existing planner's no-write path. Compound commands send
one patch; the installed RPC owns the database transaction. Validation/server
failure publishes no partial result.

Server stale revision surfaces `REVISION_CONFLICT`, preserves confirmed state
and the caller's draft, and blocks semantic writes until an **explicit** `open()`.
No automatic read, repair, merge or retry. Definite argument/permission/metadata
rejection preserves prior data and can permit a later deliberate valid command.

## Uncertain outcomes and receipt limits

After an uncertain mutation or invalid acknowledgement, attempt **one receipt
lookup for the original operation ID**. Never resubmit the mutation or allocate
a replacement ID. A found receipt must match original scope/operation/base and
resulting revisions, status and replay invariants. The server digest is validated
by the gateway; browser serialization does not pretend to reproduce JSONB text.
A valid committed/unchanged receipt accepts the prepared state once. Its revision
belongs to that operation; if another writer has advanced the Universe, the
next CAS can safely reject.

Failed, invalid, `missing` or `absent` receipts leave phase `uncertain`. Dependent
mutations and replacement reads are blocked. A later explicit `reconcile()` uses
the same retained command/ID. Caller edits are not discarded and success is not
published until proof arrives. A definite RPC rejection already proves
non-commit, so no receipt query is needed.

**Missing is not definitive:** SQL's `FOR SHARE` waits for a writer already
holding the Universe lock, but cannot fence the original HTTP request still in
transit or waiting to begin. Declaring failure could let it commit after a
dependent command. The installed protocol has no cancellation/tombstone RPC;
missing cannot safely unblock writes without later evidence. No SQL change is
made to work around this limitation.

Pending operations exist **only in this instance's memory**. Durable recovery
across page termination, scoped cache/bootstrap and draft UX belong to later
steps. Disposal/context fencing prevents late read/commit/receipt publication;
it cannot cancel a transaction already dispatched. Do not activate production
cloud mode before these decisions and real concurrency validation.

That is the original Step 5 behavior without a durability adapter. The approved
[Step 6 cache/workspace foundation](cloud-cache-foundation.md) now supplies
optional synchronous prepare/accept/reject/presentation hooks and a validated
read-only cache hydration API. Pending recovery becomes durable only through
that explicit scoped workspace; default normal-app/local behavior is unchanged.

The user subsequently reported successful live Step 6 scoped bootstrap/cache,
reload/refresh, sign-out and ignored disposed-context read checks, followed by
one-row server cleanup and exact cache/marker removal on October 13, 2026.
[The cache checkpoint](cloud-cache-foundation.md) distinguishes these passed
checks from still-unverified live pending-mutation recovery and account/Universe
switching races. Step 6 is ready to commit without activating cloud mode.

## Files and presentation

Nonempty attachment metadata in input or planned result rejects with
`UNSUPPORTED_ATTACHMENTS` before mutation, including archived content and
structure-copy sources that would normally omit content. No attachment is
silently stripped. No IndexedDB/file store is opened or local-only storage key
written remotely. Attachment methods reject; Backup/Restore methods reject as
unsupported local-only capabilities. Backup v1 and local storage v5 are untouched.

The ephemeral sidecar contains positions/layout only. It is separate from
semantic reads and RPC patches. Camera, selection, physics and sidebar
preferences have no cloud path. This is not Step 6's persistent cache/bootstrap.

## Manual live commit/receipt diagnostic — passed, available for reruns

Use `dev/cloud-metadata-commit-diagnostic.html`, separate from the passed Step 4
list/create/read page. Both are loopback HTTP/HTTPS only, absent from normal
chrome and inert until Run. No tokens are displayed, logged or pasted.

1. Serve the repository root, e.g. `python -m http.server 5500 --bind 127.0.0.1`.
2. Sign in normally at `http://127.0.0.1:5500/`.
3. Open `http://127.0.0.1:5500/dev/cloud-metadata-commit-diagnostic.html` at the
   exact same origin.
4. Review and press **Run commit/receipt checks (creates test data)** once.

It creates a disposable empty Universe and reads revision `0`. Only a fixed
test Galaxy (`diagnostic-entry`) is saved. The diagnostic wrapper deliberately
withholds the **one real successful commit reply** to exercise repository receipt
reconciliation. The real receipt resolves revision `1`; read must see the exact
fixture; an explicit receipt check must match; repeated reconciliation must
return the same acknowledgement without another mutation/publication. A **new
operation ID** with stale base `0` then attempts a changed name: it must reject
with `REVISION_CONFLICT`, and a read must still show the fixture at revision `1`.

Two commit RPC requests occur: one success and one intentional stale rejection.
Only the former creates a receipt. The original operation is never sent twice.
The stale request uses the gateway directly to test the installed server guard;
deterministic tests separately cover repository conflict/blocking behavior.
Withholding a reply is a controlled fixture, not all real transport/race cases.

The page records Universe/operation UUIDs before requests and runs once per
page. Reload allocates a new diagnostic session; keep the previous report.
If uncertain, stop and review before cleanup/reload.

### Preflight and cleanup

Review this branch and the generated cleanup SQL before running live. Confirm
the signed-in origin, installed public RPCs and private-schema configuration
already used in the passed Step 4 test. No new credentials, schema migration,
Auth settings, bucket or deployment should be needed. Codex has not connected
or run the real diagnostic. The user has now passed the bounded live test and
cleanup, as recorded above; these instructions remain for deliberate reruns.

The page generates an administrative SQL Editor cleanup transaction. It locks
the exact owner/Universe and permits only an empty revision-zero fixture or
the exact single-entry revision-one fixture with its one receipt and no
collections/members/placements. It explicitly deletes receipt/entry before the
Universe, without cascades. Require `test_universe_removed = true`. On error run
`ROLLBACK`, inspect and do not remove guards. This cleanup SQL is newly authored
and static-checked; the user has now run it successfully against PostgreSQL.
It has **not** been run by Codex. Remove the
three `dev/cloud-metadata-commit-diagnostic*` files and dedicated checks when no
longer useful; normal startup has no dependency on them.

## Tests and stopping gate

Deterministic tests use a mocked gateway and fixed clock/UUIDs: read parity,
exact revisions/order, no-ops, stale/captured snapshots, compound success/failure,
lost/missing/later receipts, blocked dependent commands, no retry/ID regeneration,
attachments, model/copy/archive behavior, presentation separation, scope and
late disposal. Browser checks use fake SDK/RPC responses in isolated profiles,
including both diagnostics and Auth/local-data/Backup/Restore workflows. No live
RPC or cleanup SQL is executed by those browser checks.

```powershell
node --test tests/cloud-repository.test.js tests/cloud-commit-diagnostic.test.js
node --test (rg --no-ignore --files tests -g '*.test.js')
python tests/browser-check.py --auth-only --screenshots
python tests/browser-check.py --awaitable-only
```

Verification results: the full Node regression run completed with **418 passing
tests** in about 58 seconds. Its `Select-Object -Last 12` output pipeline hid
intermediate progress; it was not a test failure or an indefinitely running
suite. Two final context-switch observer cases were added afterward. The latest
implementation passed **40 focused repository/diagnostic tests**, reconfirmed
after interruption in under one second with a 30-second process timeout and
20-second Node test-file timeout. No old Node test runner remained running.
Earlier isolated browser checks passed **70 Auth/gateway/repository checks**
and **18 local persistence-order checks**. Those browser checks used mocks;
the separate subsequent user-reported live diagnostic and cleanup passed as
recorded above. No runtime implementation change was needed during the
interruption review or this live-checkpoint documentation update.

Stop at Step 5; this inactive foundation is ready to commit. Second-owner HTTP
isolation, private-table/GraphQL HTTP probes, concurrent locking, genuine
transport-loss/delayed-request cases, broader rich/compound commands over real
HTTP, realistic performance/parser parity and
live durable pending-work recovery remain open. Step 6's scoped cache/bootstrap
and pending persistence/context fencing are now implemented; its bounded live
cache/reload/sign-out/disposal test passed. Normal-app activation still requires
the remaining integration gates and an explicit migration/activation strategy.
Migration/import UX, cloud files, sync and PWA require later approval. Cloud mode
is inactive.
