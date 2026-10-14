# Account-scoped cloud cache and bootstrap — Step 6

This is an **inactive foundation**, not a switch to cloud mode. Normal Cosmifold
still uses its existing unscoped local metadata, local preferences, IndexedDB
files and local Backup/Restore. Signing in does not claim, move or upload that
Cosmos. `index.html`, normal startup, Auth behavior, storage v5, Backup v1,
hierarchy, physics, navigation and UI are unchanged.

## Live Step 6 checkpoint — October 13, 2026

The user reports that the real Supabase cloud-cache/bootstrap diagnostic passed.
Codex did not connect to Supabase, execute the diagnostic or perform cleanup.

| Live check | Reported result |
| --- | --- |
| First run | Created one disposable empty Universe at revision `0` |
| Fresh bootstrap | Wrote acknowledged cache under the exact user/Universe namespace |
| Existing local Cosmos | Not read or uploaded |
| Page reload and Run/reopen | Reopened the same scoped acknowledged cache |
| Server refresh | Confirmed revision `0` |
| Sign-out | Closed the context; neither current nor prior repository exposed the cached Universe |
| Sign-in and reopen | Reopened the same owned scoped cache |
| Deliberately withheld real read | Disposing the development context ignored the late response and wrote no cache changes |
| Guarded SQL cleanup | Returned exactly **1 row**, confirming the disposable Universe was removed |
| Browser cleanup | Exact cloud cache key removed from localStorage; `cosmifold:dev:cloud-cache-diagnostic:v1` removed from sessionStorage |

**Step 6 is ready to commit as an inactive foundation.** This closes the bounded
live cache/bootstrap/reload/sign-out/disposal and fixture-cleanup gate. At that
checkpoint it did not claim live second-account/A1-A2 switching, durable pending-mutation
recovery across reload, genuine transport failures, quota failures or multi-tab/
multi-session races. Those paths have deterministic coverage but remain separate
live integration gates before production cloud activation.

**Subsequent Phase A checkpoint:** the user now reports real A1/A2 and account
A/B isolation, delayed A-to-B response fencing, validated returning-account
bootstrap and the REST/RPC/disabled-GraphQL privacy boundary passed. Guarded
cleanup returned `test_universes_removed = 3`; diagnostic cache verification was
`[]`; the Phase A marker was `null`. See [the live record](cloud-boundary-integration.md).
This closes those identity/privacy gaps, not durable uncertain-operation reload,
genuine transport failures or concurrent multi-tab writers/locking. The next
proposed phase is [revision concurrency/idempotency](cloud-activation-gates.md).

Documentation-checkpoint verification: **141 focused local tests passed** for
cache/diagnostic, repository, gateway, projection, schema static checks and the
validation generator, within a 30-second process limit. `git diff --check`
passed. This update changes documentation only; implementation and migration
SQL are unchanged. These local checks do not execute live Supabase requests.

```text
Existing local Cosmos -> existing local repository/storage keys + IndexedDB
Existing Auth         -> existing shared SDK/session storage

Explicit development/future cloud caller
  -> Auth-bound cloud workspace/context generation
    -> authenticated discovery or explicit Universe bootstrap
    -> Step 5 cloud repository + Step 4 public RPC gateway
    -> separate account/Universe cache and durable pending record
```

## Cache namespace and format

`createCloudCacheStore` in `persistence/cloud-cache-store.js` reads/writes only:

```text
cosmifold:cloud-cache:v1:<authenticated-user-UUID>:<universe-UUID>
```

Scope UUIDs use canonical lowercase spelling; canonical entry/Constellation/
placement **text IDs are never rewritten**. No local Cosmos key, Auth session
key, IndexedDB database or file adapter is accessed. Backup/Restore's explicitly
scoped local dataset does not include this separate cache.

One atomic localStorage value holds:

```text
format: "cosmifold-cloud-cache"
cacheVersion: 1
storageVersion: 5
scope: {ownerUserId, universeId}
writer: {contextId, generation}
sequence: local control counter
acknowledged: null | {revision: decimal string, snapshot: semantic storage v5}
presentation: null | {version: 1, universe_id, positions, layout}
pending: null | {
  pendingVersion: 1,
  command: original Step 1/3 command envelope,
  intendedSnapshot: fully validated semantic storage v5,
  presentation: planned device sidecar,
  intent: {type, ids?}
}
```

Cache/pending versions are independent of storage v5. No timestamps or local
sequence counter resolve server conflicts: **only the server revision does**.
The acknowledged snapshot contains no automatic x/y/layout data. The device
sidecar is separate and scoped to the same account/Universe. Camera, selection,
clipboard and sidebar preferences are not cached by this implementation.

Every cache read validates strict JSON, exact format/fields/scope, revisions,
hierarchy/content/relationships and sidecar through the existing projection.
Pending recovery also verifies that the original command's scope/base revision
and patch match the acknowledged base and intended snapshot exactly. Unsafe
keys, files, altered patches, invalid relationships and incompatible versions
reject; no repair/migration or silent field dropping occurs. Invalid records
are preserved, not overwritten by a refresh that might discard an unreadable
pending operation.

The record has an 8 Mi-character limit and existing projection depth/node
limits. Browser quota may be smaller. Pending metadata repeats the base,
intended result and patch, so metadata-heavy Universes can hit quota before
that cap. There are no binary payloads. Prepare failure blocks dispatch; no
other user's cache or local Cosmos is evicted to make space.

## Bootstrap API and outcomes

`createCloudWorkspace({auth, gateway, cache, contextId?, newOperationId?,
requestTimeoutMs?})` consumes the existing Auth service and metadata gateway.
The default per-request timeout is 15 seconds. Construction makes no remote
requests and creates no Universe. Normal startup does not import this module.

| API | Behavior |
| --- | --- |
| `discover()` or `bootstrap()` without an ID | Authenticated Universe listing only; no automatic selection, creation or import |
| `bootstrap(universeId)` | Explicit asynchronous owned-scope read/cache validation/pending recovery/server refresh |
| `getState()`, `subscribe()` | Safe status/revision/scope/generation/source/error summaries, never SDK sessions |
| `load()` | A copied validated semantic snapshot, only in a live context with available acknowledged data |
| `repository()` | Fenced facade over Step 5 reads, semantic commands, presentation, subscriptions, pending/revision and FIFO completion |
| `reconcile()` | Recover original pending operation and refresh; never resubmit it |
| `close()`, `dispose()` | Invalidate the selected generation, close old repositories/observers; disposal unsubscribes from Auth |

Explicit status results include:

| Status | Meaning / editing |
| --- | --- |
| `unauthenticated` | No authenticated identity; no cached dataset exposed |
| `universe-not-selected`, `discovering`, `universes-available` | Selection/discovery control states; no automatic starter data |
| `no-cloud-universe` | A successful authenticated list returned zero Universes |
| `opening` | Bootstrap in progress, not an empty account |
| `loaded`, `source: server` | Valid coherent server read. `canMutate: true` only with successful safe cache persistence |
| `universe-absent` | Selected UUID absent under the authenticated scope; distinct from account-wide discovery/failure |
| `cached-degraded`, `source: cache` | Last acknowledged cache is usable after refresh failure; **read-only** |
| `lookup-failed` | Existence/latest state could not be determined and no valid acknowledged fallback is available |
| `invalid-cache` | Invalid or incompatible record, explicitly rejected/preserved; no snapshot exposed |
| `cache-unavailable` / `cacheStatus: unavailable` | Storage unavailable; a successful remote read may still be exposed as `loaded` **read-only** |
| `pending-reconciliation` | Original operation unresolved or another live context owns its journal; dependent writes blocked |
| `disposed` | Response belongs to a closed/replaced context and must be ignored |

A cache write failure after a valid server read returns `loaded` with
`cacheStatus: write-failed` and `canMutate: false`. It is server-confirmed data,
but not a safe durable editing base. Failed lookup never becomes zero Universes,
never calls starter initialization, and never falls back to the unrelated local
Cosmos. A historical cached absence is not proof of a fresh empty account.

## Durable mutation/recovery ordering

Step 5 accepts optional synchronous durability hooks; its original behavior
remains available when no cache is injected. The workspace facade uses them:

1. Validate/plan the complete intended file-free semantic result.
2. Under the scoped lock, persist the original command ID/base/payload and
   intended snapshot alongside the **unchanged acknowledged base**.
3. Only after that atomic write succeeds, call the existing commit RPC once.
4. Validate acknowledgement or the original operation's receipt.
5. Atomically write the new acknowledged revision/snapshot and clear pending,
   then publish acknowledged state. Device presentation remains separate.

After reload, bootstrap validates the pending record, hydrates the repository
from its last acknowledged base, retains the original operation ID and queries
its receipt **before** allowing dependent writes. A valid receipt accepts the
prepared state exactly once, clears pending atomically and then attempts a
coherent server refresh. Other devices may have advanced the Universe since
that receipt; the refreshed revision is authoritative for further edits.

Missing/absent/invalid/unavailable receipts retain pending and block writes.
The server's receipt lock cannot fence a request still in transit; missing is
not proof of non-commit. No fresh operation ID, resubmission, merge or offline
outbox is created. Definite server rejection clears only its matching journal
without advancing acknowledged data. If journal clearing/ack persistence fails,
the prior acknowledged snapshot plus pending remain for safe later recovery.

Timed-out mutations remain uncertain. Timing out does not cancel the underlying
server transaction. Late SDK replies are consumed and ignored; receipt recovery
uses the recorded original ID. A valid receipt followed by failed refresh yields
an updated acknowledged cache in explicit degraded/read-only mode.

## Account, Universe, generation and tab fences

The workspace observes the existing Auth service. Sign-out/account change closes
the selected context. Every selection/bootstrap also advances a monotonic
generation. Reads, timeout continuations, cache sessions, reconciliation,
subscriptions and returned repository objects require the exact authenticated
owner + Universe + context object/generation. A1→A2→A1 or A→B→A cannot revive
an old response. Disposed facades cannot load old data or publish to new contexts.

Each key has an exclusive Web Lock, acquired with `ifAvailable`; conflicting
tabs get an explicit busy/degraded/pending state rather than waiting indefinitely
or overwriting a live journal. Same-context facade commands retain a FIFO queue;
lazy snapshot callbacks read the latest acknowledgement. Captured snapshots are
revision-fenced. The store additionally compares the exact previous raw value,
uses monotonic cache revisions and refuses an unexpected pending/base change.
It cannot overwrite a newer acknowledged cache with an older remote revision.

If Web Locks are unavailable, remote reads may work but editing stays disabled.
No unlocked durable writes are offered. A late A request may still commit in
Supabase after sign-out; its pre-dispatch A journal remains in A's namespace for
A's next bootstrap. It cannot write into B or block B/A2. Sign-out does not
delete the existing local Cosmos or discard A's recovery journal.

Local cache is not encrypted: same-origin scripts/browser tools can inspect
browser storage. This boundary isolates application contexts; server security
still depends on the existing JWT/RLS/RPC/private-schema configuration.

`saveLayout` persists a validated sidecar under the same lock, without a server
mutation or semantic revision advance. `checkpointLayout` is in-memory only;
it does not try to acquire an asynchronous lock during page closing. Refresh
retains valid sidecar records and removes device positions/layout references
whose canonical items/parents no longer exist in the fresh graph.

## Development-only live diagnostic — passed, available for deliberate reruns

`dev/cloud-cache-diagnostic.html` is separate from the normal app and guarded to
loopback HTTP/HTTPS. Auth uses the existing shared client; no tokens are copied,
displayed or logged. No request is made until a diagnostic button is pressed.

1. Serve the repository root, e.g. `python -m http.server 5500 --bind 127.0.0.1`.
2. Sign in normally at `http://127.0.0.1:5500/`.
3. Open `http://127.0.0.1:5500/dev/cloud-cache-diagnostic.html` at the same origin.
4. Press **Run/reopen scoped cache checks**. First run explicitly creates one
   disposable empty Universe, reads revision `0` and writes its acknowledged
   scoped cache. Record the printed UUID/key/guarded cleanup SQL.
5. Reload this diagnostic tab and press **Run/reopen** again. Its sessionStorage
   test marker reuses the same owner/Universe; the cache reopens and the server
   refresh must confirm revision `0`, without a second creation.
6. Optionally press **Check ignored delayed response**. A real read is held
   back, its development context closes, and the late response must return
   disposed with **no cache change**. This does not change Auth or metadata.
7. Press **Check sign-out fencing**. This signs out the real Supabase session
   in this browser and verifies that current/prior readers expose no cached
   Universe. The existing local Cosmos is unaffected.
8. Optionally sign in as another user in the normal app and press Run/reopen.
   The old test marker must be rejected as another account, before any A-cache
   read or RPC. To resume that test, sign back in as its original owner.

The marker `cosmifold:dev:cloud-cache-diagnostic:v1` holds only format/owner/
Universe/revision identifiers in sessionStorage. It is not an Auth credential or
an application pending outbox. Creation uncertainty preserves that UUID and
does not blindly retry/recreate. No semantic commit or file upload is needed.

After review run the generated guarded empty-Universe SQL in SQL Editor; one
returned row confirms deletion. Do not force deletion of a changed Universe.
Then optionally remove **only** the printed scoped localStorage test key and
sessionStorage diagnostic marker in DevTools; do not clear all browser storage.
The cache contains only this empty test fixture. Remove the three diagnostic
files/dedicated checks later; normal startup has no dependency on them.

Before running live: review this branch, confirm the already working Auth/RPC
configuration and exact local origin, use a browser supporting Web Locks, and
note that sign-out affects your current browser session. No new credentials,
SQL migration, bucket, backend settings or deployment are required. Codex has
not run the live diagnostic or connected to Supabase.

## Verification and stopping point

Deterministic mocks cover namespace isolation, discovery/failure distinctions,
fresh/degraded/invalid/absent/unavailable cache, acknowledgement timing, durable
pending reload, same-ID receipt recovery, missing receipt blocking, quota failure,
late account/Universe responses, disposal, locks, FIFO, sidecars, bounded timeout
and diagnostic reload/sign-out/delayed-read guards. Browser checks use fake Auth,
SDK and server state in isolated profiles, not the real project.

```powershell
node --test --test-timeout=20000 tests/cloud-cache.test.js tests/cloud-cache-diagnostic.test.js
python tests/browser-check.py --auth-only --screenshots
```

Branch verification: **450 Node tests passed**, including **30 focused cache/
diagnostic tests**; **83 mocked Auth/cloud browser checks** and **18 existing
local persistence-order browser checks** passed. The full Node run had a
120-second process cap and completed in about 68 seconds. Cache-specific tests
also proved local Backup/Restore excludes and preserves the scoped cache/journal
while local metadata/preferences and original file bytes remain unchanged.
Desktop/narrow/mobile diagnostic screenshots were reviewed. An initial browser
run stopped on a syntax error in its new fake SDK fixture; correcting the
fixture produced the passing run above. The new backup-isolation test initially
needed `removeItem` added to its storage mock; no Backup/Restore implementation
change was made. `git diff --check` passed. No live RPC/cleanup diagnostic was
run and no real Supabase connection was made by Codex.

Stop after Step 6. Normal-app activation, explicit local-to-cloud migration,
cloud files, unrestricted offline edits, realtime, collaboration and PWA work
are separate approvals. The user-reported scoped-cache/reload/fencing validation
and exact server/browser cleanup passed as recorded above. Remaining gates:
durable pending reload/receipt recovery, genuine network-loss/quota failure cases,
real multi-tab/multi-session locking, broader rich-command HTTP/parser/
performance cases, and a separately reviewed activation/migration strategy that
preserves the existing local Cosmos and rejects unsupported file-bearing data.
Live identity/Universe isolation and the private REST/RPC/disabled-GraphQL gate
are now closed by Phase A; they must be rechecked if exposure/grants change.
