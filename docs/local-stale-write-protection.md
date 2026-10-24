# Local stale-write protection

The local v5 adapter previously read the current stored snapshot only to check its
format, then replaced it with the caller's full in-memory snapshot. Two open tabs
could therefore erase one another's acknowledged edits. A stale snapshot could
also recreate a reference to an attachment already deleted by another tab.

## Compare and serialization

Each adapter remembers the exact persisted metadata text from its first successful
load, including the empty/legacy-key cases. That text is a durable snapshot
identity. No timestamp, new storage version, revision field, or backup migration
is needed. Equal bytes represent the same persisted metadata; this is state
comparison rather than an operation counter. Ordinary reads and Backup do not
rebase an existing tab's expected state.

Every local repository mutation obtains the exclusive browser Web Lock
`cosmifold-workspace-write:${JSON.stringify(scope)}`. Inside the lock the adapter
compares disk against its acknowledged text before starting the operation. Its
synchronous metadata writer checks again before replacement, and acknowledges
the new text only after `localStorage.setItem` succeeds. Failure never acknowledges
an unwritten snapshot. A mismatch permanently marks that adapter stale until
reload/reinitialization. There is no automatic retry or merge.

The lock includes file reads/writes, synchronous metadata callbacks, transaction
completion and any abort compensation. Another tab cannot write between a file
operation's metadata publication and its rollback. Stale add/remove/copy/subtree
operations fail before touching file storage. Existing IndexedDB compensation
and UI-after-acknowledgement ordering remain in place. This does not add ordinary
file crash journaling.

The existing long-lived shared workspace lock and exclusive Restore lock retain
their roles. The write mutex has a separate name so it cannot deadlock against
the current tab's lifetime shared lock. Restore/recovery also serialize through
the write mutex but deliberately replace the dataset under their existing
stronger exclusion. Their raw strings, journal and file commit marker are
preserved; other expected metadata states are invalidated by replacement.

## User behavior and compatibility

On the first conflict the app displays:

> Cosmifold changed in another tab. Reload this tab to continue safely.

Graph/editor interactions stop and a Reload button appears in the sidebar.
Backup and Help remain available. Backup reads current persisted data without
acknowledging that data for a stale runtime. Preferences remain independent.

Current Chrome/Edge and browsers providing Web Locks in a secure context use the
browser-managed mutex. Closing or terminating the owning tab releases it; no
persistent lease or cleanup record is created. Without Web Locks canonical saves
fail with an HTTPS/current-browser instruction. There is no unsafe localStorage
lease fallback. Sample memory stores remain independent.

Synchronous pagehide checkpoints cannot request and await a new Web Lock. They
skip an unowned write and retain the dirty-layout flag. Regular asynchronous
layout saves continue through the mutex. Layout and coordinates share the full
metadata snapshot, so their writes also require protection and can conservatively
invalidate another tab. The final unsaved layout movement may be lost on closing;
acknowledged canonical edits are never bypassed by an unload write.

This protects updated cooperating tabs. An already-open older build does not
participate in the write mutex and must be closed/reloaded when adopting this
change. No realtime synchronization, automatic merge, or recovery of unsaved
drafts across reload is introduced.

## Validation

```powershell
node --test tests/local-stale-write.test.js tests/storage.test.js tests/persistence.test.js tests/awaitable-persistence.test.js tests/restore.test.js tests/backup.test.js tests/content.test.js tests/task-lists.test.js
python -B tests/browser-check.py --local-stale-only
python -B tests/browser-check.py --restore-only
python -B tests/browser-check.py --awaitable-only
python -B tests/staging_package_test.py
```

The deterministic lock fixture models shared/exclusive arbitration without
sleeps. Tests cover Location/Notes lost updates, deleted attachment resurrection,
queued simultaneous writers, reload, Restore exclusion/replacement, sequential
saves, quota failure/retry, lock release, attachment compensation, checkpoints,
Backup, separate scopes and unsupported lock capability. The isolated two-tab
browser suite uses actual Web Locks, localStorage and IndexedDB, with Auth disabled
and synthetic data in a temporary browser profile.

## Manual two-tab check

1. Serve this checkout at one stable HTTPS or loopback URL. Use disposable local
   data and the same browser profile and exact URL in both tabs. Close older-build
   tabs first. Create an item if needed.
2. Open A and B, allowing initial layout work to settle. Both must initially show
   the item. A layout save can already make another tab stale; if A needs it,
   reload A before making the winning edit.
3. In A, add/change the item's Location and save. Confirm it appears saved.
4. In B, try saving Notes from its older view. Require the stale-tab message,
   inactive editors and Reload button. B must not publish the note as saved.
5. Backup remains available in B and captures current persisted data, including
   A's Location. No stale in-memory state is exported.
6. Click Reload in B. Verify A's Location is present, then save Notes again.
   This save must succeed and preserve the Location.

For attachments, first attach a small file and reload both tabs so both know it.
Remove the file in A and wait for completion. Try an unrelated edit in B. Require
the stale warning; reload B and verify the attachment remains absent. The automated
browser test additionally verifies its IndexedDB blob remains deleted.
