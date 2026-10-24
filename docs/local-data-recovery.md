# Local data recovery (F3)

Local metadata is parsed and structurally validated before the application can
normalize Entries, repair ancestry, deduplicate IDs, filter references, or schedule
a canonical save. Invalid JSON is classified as `LOCAL_DATA_SYNTAX`; invalid
structure or an unsupported format is `LOCAL_DATA_STRUCTURE`. The persistence
boundary retains those codes and their technical causes for diagnostics.

## Canonical data and derived state

Recovery is required for invalid/duplicate Item IDs or fields, missing parents,
self-parenting, cycles, invalid Notes/Bookmarks/Locations/attachment metadata,
duplicate attachment IDs/storage keys, invalid Task List relationships, malformed
linked placements or Constellations, missing Constellation members, and invalid
archived root declarations. All Items are validated before active/archived splitting.
Completed state may remain on a normal Item after moving out of a Task List; this
is supported product behavior, not corruption.

Constellation membership is canonical user intent. A missing member therefore
requires recovery instead of silently deleting that membership. Linked placements
receive the same preservation policy. Duplicate membership/placement records and
cross-type Item/placement/Constellation ID collisions are rejected too.

Current celestial roles/depth and world/layout coordinates are derived. Existing
layout regeneration, stale disclosure-ID cleanup, and separate optional navigation
preferences remain recoverable. Preview dimensions are optional derived metadata.
Invalid canonical field types, including Task completion and Location data, cannot
be silently defaulted away. In legacy formats the old role is migration input, so
unknown roles and parent relationships that migration would discard are rejected.

Well-formed attachment metadata does not require reading every blob at startup.
A missing blob retains its reference and the existing file/preview UI reports that
it cannot open the file. This change adds no attachment repair or crash journal.

## Compatibility

Supported versions 1 through 4 retain the established migrations: v1 `tools`,
v1/v2 partial built-in edits/positions merged with the three original defaults,
legacy `group` as `category`, the neutral My Galaxy wrapper, and historical flowing
layout conversion. Missing optional content/category/description/position fields
use their existing defaults. Optional current role/depth caches are regenerated.
The obsolete pairwise `connections` field remains an intentional compatibility
discard. Existing exact `pre-hierarchy`, `pre-layout`, and `pre-cosmic-tree` backups
are retained without overwriting earlier backups.

These compatibility transformations run only after raw canonical invariants pass.
An orphan or cycle is not a compatibility migration. No corruption repair is
automatically saved.

## Preservation and recovery

Failed loads leave the exact current (or fallback legacy) stored text in place,
without allocating a second localStorage copy. The store remembers the failed
load and rejects ordinary saves, write actions, and checkpoints. The app displays
a separate recovery screen, hides the normal workspace from interaction, and
suppresses first-use onboarding. It offers:

- Download preserved data: the exact raw metadata text, including invalid JSON,
  named `cosmifold-recovery-YYYY-MM-DD.json`. No other storage/session/Auth keys
  are collected. This is metadata only, not attachment bytes or a normal Backup.
- Restore from Backup: normal Backup validation and the existing exclusive
  Restore transaction. Failed replacement compensates back to the corrupt text
  and restores the write guard. Successful replacement reloads the app.
- Reload: retries loading without erasing anything.

There is no Start fresh action. No implicit destructive reset is introduced.
The raw metadata and existing IndexedDB files remain untouched until explicit
Restore replaces them. If storage cannot be read at all, the recovery screen
disables raw download and explains how to retry access.

F1's Web Locks and exact-text comparison remain in place. A previously valid tab
sees a changed snapshot as stale and cannot overwrite it. A tab that loads corrupt
data enters corruption recovery instead of claiming a stale-tab conflict. F2's
file-error banner is separate and is not used for startup recovery.

## Safe manual check

Use a **disposable browser profile**, never your primary profile. Serve this
repository locally (`python -m http.server 8000 --bind 127.0.0.1`) and open
`http://127.0.0.1:8000`. These instructions assume the default local workspace.

1. Create a named Item with a Note. Use Backup to download a valid normal Backup.
2. In DevTools Console, inject one orphan and reload:

   ```js
   const corrupt = JSON.stringify({
     version: 5,
     entries: [{id: 'f3-orphan', name: 'Recovery test', parentId: 'missing'}],
     layout: []
   }, null, 2);
   sessionStorage.setItem('f3-expected', corrupt);
   localRestoreInProgress = true; // Pause this old page's closing save only.
   localStorage.setItem('galaxy:user-data', corrupt);
   location.reload();
   ```

3. Expect the recovery screen, no Item graph, and no first-use onboarding. Verify:

   ```js
   localStorage.getItem('galaxy:user-data') === sessionStorage.getItem('f3-expected')
   ```

4. Download preserved data; its contents must match the injected text exactly.
   Reload again and repeat the equality check; it must still be `true`.
5. Select Restore from Backup, choose the known-good Backup from step 1, and
   explicitly confirm Restore. The normal app must reload with the original Item
   and Note. Selecting an invalid Backup instead must leave recovery and the
   corrupt text intact.

Automated isolated-profile checks: `python -B tests/browser-check.py --corrupt-data-only`.
