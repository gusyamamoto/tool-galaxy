# Historical local attachment audit (F8)

## Authority and classification

The pre-F8 reproduction inserted a normal referenced attachment and one recognizable IndexedDB file with no canonical reference or F4 journal. Normal F4 recovery preserved the historical record and canonical metadata byte-for-byte. F4 deliberately addresses only journal-enumerated operations, not unknown history.

The active raw local snapshot is validated through `metadata.load()` (F3) before files are scanned. Its canonical `entries` include archived branches. Every `content.attachments[].storageKey` references the `files` row with that key. An original Blob and optional thumbnail Blob share the same row; there are no separate durable thumbnail or generated preview keys in the current schema. Copy creates new keys/rows; structure duplication creates no files. Deletion uses F4's existing journals. Constellations, linked placements, task views, and layout do not own independent files.

The metadata adapter selects the current snapshot, falling back to the legacy key only when current data is absent. Pre-migration preservation copies are historical backups, not active file ownership. They are never rewritten or deleted by F8. Valid premigration/absent snapshots and unrecognized root, Item, content or attachment extensions cannot authorize historical deletion.

| Category | Meaning | Cleanup |
| --- | --- | --- |
| LIVE | Key referenced by valid canonical metadata, including archived content | Preserve, even when a legacy row lacks modern ownership fields |
| RECOVERY-OWNED | Unreferenced key enumerated by a valid pending F4 operation | Preserve; all historical cleanup waits for recovery |
| HISTORICAL ORPHAN | Unreferenced, no recovery state, recognizable current file row | Eligible only after explicit confirmation and final revalidation |
| UNKNOWN | Missing ownership, unexpected fields/binary formats, malformed keys/values or unrecognized authoritative state | Preserve |

A recognizable unreferenced row has a matching nonempty string primary key/`key`, a bounded nonempty Item `entryId`, an original Blob, an optional Blob thumbnail, and no fields beyond those four. No filename/key-prefix heuristic grants deletion. A known canonical reference always protects its key; F8 never repairs missing files or ownership mismatches. Duplicate canonical file references are rejected by F3 before scanning.

## Recovery and locking

Startup already settles Restore first and runs normal F4 recovery second. F8 adds no startup scan or automatic deletion. Pending journals seen later block cleanup until normal recovery finishes, usually after reload. Unsupported F4 versions, unresolved ownership/recovery failures, pending/unreadable Restore journals and unknown Restore marker state preserve candidates. A stable `committed` Restore marker is normal persisted history and does not itself block maintenance. A candidate Restore preview hides maintenance and never supplies its data to classification.

`auditAttachmentStorage()` is read-only. It uses the existing repository queue and exclusive F1 workspace write lock for a coherent snapshot. It reads raw metadata, validates it, then scans file records with a cursor in a read-only transaction covering files, F4 journals and Restore markers. Only descriptors (keys, ownership, shape and Blob sizes) are retained. Payload bytes are never decoded or copied into buffers; the browser still materializes each stored row's Blob handles briefly. Cost is linear in record count, not Blob byte length. No `getAll(files)` is used.

`removeOrphanedAttachments(selectedKeys)` reacquires that same F1 lock, loads/validates current canonical data again, and reads only the selected rows plus all recovery state inside one read/write transaction. Its synchronous callback checks that raw metadata/Restore state did not change, classifies fresh row descriptors and deletes only keys still eligible. Newly referenced or unknown rows are skipped. A different tab's winning metadata write causes F1's normal stale-session rejection before deletion. No independent lock, metadata rebase or override is introduced.

Deletion uses one strict-durability IndexedDB transaction. Any request/validation failure aborts the entire selected batch; earlier deletes roll back. A crash leaves either the pre-delete or committed file state. No metadata bridge or new journal is needed because every deleted record is already unreferenced. Canonical metadata, preferences, existing journals and markers are never rewritten by F8.

These guarantees assume cooperating Cosmifold writers using F1, as existing attachment operations do. Arbitrary DevTools writes or old clients bypassing locks cannot be serialized by F8.

## Product behavior

Backup has a small collapsed **Local storage** disclosure. **Check unused files** is the only scan trigger. A healthy empty result shows a subtle message with removal hidden. Otherwise count and approximate original-plus-thumbnail bytes are shown (count only if safe summation is unavailable). Unknown rows are noted as preserved.

**Remove unused files…** shows an inline irreversible-action confirmation; initial focus goes to **Keep files**. Confirming removes only proven selected keys, reports success/skipped keys accurately, and allows a new check. A deletion failure reports that unused data could not be removed and saved Items were unchanged. Maintenance is hidden in Sample, F3/recovery, stale-session and Restore-preview states. A pending check's late UI result is discarded when the dialog closes.

F2 attachment errors retain their messages and compensation. Maintenance uses its own inline status and does not replace F2's failure notice. F5 validation and replacement semantics remain unchanged. No viewer/object URL changes were made (F6). F7 numbers and thresholds are untouched; later ordinary growth checks observe browser estimates naturally.

## Exact safe manual test

Use a new disposable browser profile or private window, open the local app, and keep this test workspace separate from real data. Do not use Sample. The helper creates one ordinary Item/photo through the product flow and inserts one explicitly synthetic historical row. The synthetic key is prefixed `f8-synthetic-orphan:` plus a strong random ID, checked for existing data and inserted using `add()` so collisions refuse overwrite. It uses the workspace's configured database and F1 lock.

1. In DevTools Console, install the test-only helper from this checkout (localhost must serve the updated repository):

   ```js
   await import('/tests/attachment_orphan_probe.js');
   await cosmifoldOrphanTest.create();
   await cosmifoldOrphanTest.verify();
   ```

   In a fresh workspace expect `syntheticPresent: true`, `livePresent: true`, one `unused` key, `unknown: 0`, and `blocked: null`. This creates normal saved test data; no existing Item or attachment is edited.

2. Close any Contents viewer, then open the existing maintenance UI:

   ```js
   backupUI.trigger.click();
   backupUI.storageSection.open = true;
   backupUI.auditButton.click();
   ```

   Expect exactly **1 unused local file**. Detection alone leaves it intact. Click **Remove unused files…**, then **Keep files** once to verify canceling does nothing. Click **Remove unused files…** again and confirm **Remove unused files**.

3. Verify and open the real photo:

   ```js
   await cosmifoldOrphanTest.verify();
   backupUI.dialog.close();
   cosmifoldOrphanTest.openLive();
   ```

   Expect `syntheticPresent: false`, `livePresent: true`, `unused: []`, and a working image viewer. Close the viewer, reopen Backup → Local storage → Check unused files. Expect **No unused local files found.**

4. If stopping before UI cleanup, remove **only the synthetic key** through the same revalidated maintenance API:

   ```js
   await cosmifoldOrphanTest.removeSynthetic();
   ```

   This never directly deletes a database or blindly removes an arbitrary record. If the key became referenced, unknown, or recovery-owned, the API preserves it/refuses cleanup.

5. Remove the normal **F8 disposable storage test** Item through the ordinary product delete confirmation when finished. Uninstall the helper:

   ```js
   cosmifoldOrphanTest.uninstall();
   ```

   Reload also removes its global object. The helper is not a runtime asset and is excluded from packaged sites. ES module import is cached per page; reload before reinstalling after uninstall. No quota filling, automatic sweep or manual database clearing is needed.

## Validation and limits

Focused Node tests cover classification, F3 validation, unknown fields, missing/legacy rows, archives, F4/Restore blocking, selected-key revalidation, safe totals and F1 locking. The isolated browser suite (`python -B tests/browser-check.py --attachment-orphans-only`) exercises actual IndexedDB scanning/deletion/abort, archive, missing files, recovery, 1,000 rows, and two-tab ownership races.

Legacy/extended records may remain unreclaimed by design. Checks scan on explicit request only and provide a snapshot, not continuous monitoring. The byte total is stored payload size, not guaranteed disk space reclaimed: browser transaction overhead and compaction are implementation-dependent. No historical backup/orphan recovery, file compression, deduplication, database compaction or cloud cleanup is provided.
