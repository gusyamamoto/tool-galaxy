# Attachment transaction recovery (F4)

## Original ordering and crash windows

Before F4, add/copy wrote new rows inside one IndexedDB transaction and ran the
synchronous localStorage metadata callback from the last request's success event,
before the transaction completed. Remove/subtree deletion queued file deletions
inside a transaction, then ran the metadata callback before completion too.
Ordinary abort handlers compensated metadata while JavaScript remained alive.

An interruption after metadata publication but before IndexedDB completion could
leave an attachment reference without its new blob, or leave deleted metadata with
old blobs when the delete transaction aborted. An interrupted copy could leave
canonical copied references without committed bytes. Interrupted subtree deletion
could leave storage leaks. No durable ordinary-operation record explained the work
after restart. Structure-only duplication has no file side effects.

## Journal and new ordering

The existing scoped `galaxy-attachments` database upgrades from version 2 to 3.
The additive `fileOperations` store contains only:

```js
{
  version: 1,
  id: "collision-resistant UUID",
  type: "add | copy | remove | deleteEntries",
  stage: "prepared | files-written",
  files: [{key: "blob key", entryId: "owner Item ID"}]
}
```

It contains no file bytes, previews, full Universe snapshots, or Auth/session data.
Existing files and Restore markers survive the database upgrade. Ordinary IDB
writes request strict durability, and multi-file writes/deletions remain atomic.

**Add/copy:** prepare/read originals → durable prepared journal → one durable
transaction creates all NEW file keys and marks the journal `files-written` →
synchronous canonical metadata commit → remove journal. Existing keys cannot be
overwritten. A runtime metadata rejection compensates staged files immediately;
if metadata actually changed, its existing rollback callback restores it first.

**Remove/subtree deletion:** enumerate affected keys/owners → durable prepared
journal → synchronous canonical metadata removal → one durable transaction deletes
the known files and journal. A failed file transaction aborts all its deletions
and compensates metadata. Empty file sets need no journal.

A journal-creation failure precedes risky writes. A successful add whose final
journal cleanup fails remains successful; restart reconciles the leftover record.
If compensation itself cannot finish, durable intent remains available for retry.

## Recovery policy and startup order

Startup holds the existing shared workspace/Restore session, resolves any pending
Restore under its stronger exclusion, then obtains F1's exclusive workspace-write
lock for ordinary recovery. Under that lock it loads and validates canonical
metadata before inspecting ordinary journals. The normal UI initializes afterward.

F3 invalid JSON/structure takes precedence: no ordinary attachment cleanup runs.
F1 comparison and ownership still protect previously loaded tabs from stale writes.
Two simultaneous startup attempts serialize on that same write lock.

All journal records validate before any destructive work. Recovery uses one atomic
transaction over `files` and `fileOperations`:

- A canonical reference preserves its blob, irrespective of a journal's stage.
- Missing bytes never cause automatic metadata/reference deletion. The existing
  missing-file UI remains available; recovery does not reconstruct lost bytes.
- An unreferenced add/copy key is eligible only when `files-written` proves its
  creation was committed atomically with that marker. A prepared add cannot claim
  an older collision or an unknown orphan.
- An unreferenced remove/delete key is eligible because the journal enumerated
  that operation's affected keys before metadata removal.
- Deletion verifies the actual row owner against the journal. Referenced rows
  must match canonical ownership. Unknown versions, malformed journals, ownership
  mismatches, or storage failures preserve state and show controlled recovery.
- Successfully reconciled records are removed atomically with cleanup. Repeating
  recovery is safe, including already-missing keys and transactions aborted during
  cleanup. There is no global orphan-deletion sweep.

Successful recovery is quiet. Runtime failures continue through F2. Unresolved
startup file recovery uses the existing recovery screen/actions with file-specific
wording; it does not use the F2 banner or call valid metadata corrupt.

Restore retains its own metadata journal and file commit marker. Its replacement
transaction atomically replaces files, updates that marker, and clears obsolete
ordinary journals. An aborted Restore preserves both old files and old ordinary
journals. Ordinary recovery never runs inside Restore staging.

## Safe deterministic manual check

Use a **disposable browser profile**, not your normal profile. Serve the repository
locally (`python -m http.server 8000 --bind 127.0.0.1`) and open
`http://127.0.0.1:8000`. Create/select a disposable Item and open Contents.

1. Install the explicit DevTools/test stage hook:

   ```js
   persistence.files.setOperationStageHook(({operation}) => {
     localStorage.setItem('f4-paused-file', operation.files[0].key);
     return new Promise(resolve => { window.resumeF4File = resolve; });
   });
   ```

2. Add one small disposable text file through Contents. The UI remains busy
   because the operation is held after durable blob/journal persistence and
   before canonical metadata commit. Verify these expressions return `true`:

   ```js
   !!localStorage.getItem('f4-paused-file')
   !!await persistence.files.get(localStorage.getItem('f4-paused-file'))
   (await persistence.files.listOperations()).length === 1
   ```

3. **Reload the tab while the operation is held.** The hook is in memory only and
   does not survive reload. This discards the unresolved operation continuation;
   it is not a normal exception/rollback simulation.
4. After restart, verify:

   ```js
   await persistence.files.get(localStorage.getItem('f4-paused-file')) // null
   await persistence.files.listOperations() // []
   ```

   The Item still exists, contains no phantom attachment, and recovery is quiet.
5. Add the file again normally. It should save with no success notice and leave
   `listOperations()` empty. Remove the test key:

   ```js
   localStorage.removeItem('f4-paused-file');
   ```

If continuing without Reload, clear the hook with
`persistence.files.setOperationStageHook(null)` and call `resumeF4File()` instead.
Never install this hook while working with real data.

## Validation scope and limits

Run `python -B tests/browser-check.py --attachment-recovery-only` for real IDB and
localStorage tests. The suite reloads an actual held add, constructs explicit
durable intermediate states for other windows, injects a mid-recovery transaction
abort, and starts two actual tabs behind a write-lock barrier. It also checks
runtime failures, collision/owner safety, unknown journal versions, scoped database
upgrade, F3 preservation, and Restore journal/marker priority.

These are deterministic interruption/restart tests, not browser-process kills or
physical power-loss tests. Browser/OS storage durability still bounds guarantees.
Unjournaled historical orphans are preserved. Missing bytes are not repaired.
An unresolved/unknown journal blocks ordinary work until safe recovery or explicit
Restore; it is never guessed away.
