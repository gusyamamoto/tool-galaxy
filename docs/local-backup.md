# Local backup

**Backup downloads one portable copy of your saved Cosmifold data and files.**
It stays on your device. Nothing is uploaded, and it is not cloud sync.
The file is **not encrypted**; store it somewhere you trust.

Optional accounts are independent of Backup/Restore. Cosmifold does not add Auth
sessions, access/refresh tokens, passwords or PKCE verifiers to its backup data.
Restore replaces the local Cosmos without changing the browser's Auth session.
See [Auth foundation](auth-foundation.md); signing in still does not sync data.

## Create a backup

1. Save any Notes, Bookmarks or Locations you want included. Unsaved text is not
   part of a backup.
2. Choose **Backup** near Help at the bottom of the sidebar.
3. Choose **Download backup**. The dialog shows preparing/file progress and
   prevents duplicate clicks. Cancel or Escape stops preparation before download.
4. Keep the downloaded file somewhere safe. Its name is
   `cosmifold-backup-YYYY-MM-DD.cosmifold`, using your local calendar date.
   Your browser handles repeated filenames normally.

The success message means the file was sent to the browser's download mechanism;
check the browser's downloads for its destination. Export does not clear your
Cosmos. Sample mode disables Backup: leave Sample to back up your saved data.

## Restore a backup

1. Close other Cosmifold tabs for the same workspace, including older versions.
2. Choose **Backup** beside Help, then **Restore backup?** and select a
   backup file. The picker hints `.cosmifold`, but selected filenames, extensions
   and MIME types do not determine compatibility. A valid renamed file such as
   `completely-unrelated-name.anything` is accepted; a fake `.cosmifold` is not.
   The internal `cosmifold-backup` identifier and supported versions/integrity
   remain the contract even after future product branding changes.
3. Wait for **Checking backup?** / file checking to finish. The preview shows
   the backup date, Galaxies, total items (including Galaxy roots/archived items),
   Constellations, distinct files and complete backup size.
4. Read the replacement message. **Download current backup** remains available to keep
   the current Cosmos first; doing so is optional and does not change the preview.
5. Choose **Restore** only when ready. Cancel/Escape before this step changes
   nothing. During replacement, controls are disabled and Cancel is unavailable.
6. After **Cosmifold restored. Reloading?**, the page reloads from the restored
   local data. Selection, multi-selection, clipboard, Search, drafts and open
   panels are reset; persisted sidebar preferences are restored.

**Restore replaces this browser's current local Cosmos. It does not merge.**
All backed-up IDs, hierarchy, content, links, Constellations, archive data,
appearance/layout and referenced original/thumbnail bytes are preserved. Old
unrelated files and orphan rows disappear only with a successful replacement.
Existing historical migration/recovery snapshots are neither imported, erased
nor manufactured. They remain internal; they are not part of this backup.

Restore supports **backupVersion 1 / storageVersion 5** only. Unsupported
versions, malformed hierarchy/references, corrupt/truncated data and inconsistent
counts are rejected before confirmation, without storage writes. Executable/script
attachment metadata rejected by the current file policy is not restored. The fixed header,
manifest SHA-256, raw/parsed metadata consistency, sequential offsets, byte lengths,
all original/thumbnail hashes and ownership relationships are checked. No content
is executed, and preview text never becomes HTML. SHA-256 detects corruption,
not trustworthiness or encryption. Some malformed snapshots which Export could
capture without normalization are deliberately rejected rather than repaired.

Restore validates raw metadata with `galaxyModel.validateStoredSnapshot`, the
same canonical validator used by local startup (F3). This happens before file
payload validation, confirmation, journals or staging. Item IDs, parents, cycles,
content, Locations, linked placements, Constellations, archives and global
attachment identities share those rules. Nested Task Lists and children below
a task are rejected; `taskList` and `completed`, when present and non-null, must
be booleans. A normal Item moved outside a Task List may retain completion.
Depth and celestial roles remain derived; they do not dictate hierarchy.
No invalid references, fields or records are repaired or silently discarded.

Existing backup checks additionally require exact saved Bookmark/Location/name
values, consistent layout/archive disclosure references, allowed file types,
matching raw/parsed text and counts, and complete verified payloads.
Every attachment reference requires its original bytes, including archived
Items. A thumbnail may be absent when declared absent. A missing original,
duplicate file identity/key, wrong owner or extra unreferenced payload rejects
the entire candidate. Export excludes unrelated orphan rows; this exclusion
does not permit importing unknown bytes in a Restore candidate.

Portable Backup started at **v1 with storage-v5**, which is also the oldest
supported portable schema. No portable backup migration exists. Local saved
storage v1-v4 still migrates through normal startup before export; these local
snapshots are not older portable backups. Restore preserves supported optional
defaults without inventing migrations. A newer header, manifest backup version
or storage version is rejected with a clear newer-version message.

The complete order is bounded header/integrity checks, manifest parse and version
checks, raw/parsed envelope consistency, shared raw canonical validation,
backup-specific saved-value checks, file manifest/ownership/completeness,
payload hashes and counts, then an opaque validated preview handle. Only explicit
confirmation starts the existing exclusive Restore transaction. Validation never
opens a storage write transaction or consumes F4 attachment journals. A failed
replacement rolls those journals back with the old files; successful replacement
clears obsolete journals atomically with the file set/Restore marker. F1 workspace
ownership and stale-write protection remain unchanged. Invalid candidates also
leave an existing F3 corruption snapshot and its recovery actions available;
valid explicit Restore can replace it. Errors stay in the Restore dialog.

### Deterministic invalid-model check

Use a disposable local browser profile and synthetic data only.

Reload the app before testing changed validation code. An already-open tab keeps
the JavaScript it loaded earlier; rebuilding source does not update that tab.
For local testing, use the current repository at `http://localhost:8000`, then
hard reload (Ctrl+Shift+R). An older generated `staging-site/` is a separate
artifact and does not reflect source edits automatically.

1. Create a normal Item with a Note and Location, plus a Task List with one
   checked and one unchecked task. Optionally attach a small text file.
2. Download a backup and save it as `BackupA.cosmifold` in a temporary folder.
3. From the repository root, run the following, substituting that folder:

   ```powershell
   python -B tests/restore_model_fixture.py C:\Temp\BackupA.cosmifold C:\Temp\InvalidA.cosmifold
   ```

   The helper makes a nested Task List, updates the exact metadata text, counts
   if needed and manifest checksum, and preserves the original payload bytes.
   It refuses to overwrite an existing output. Keep Backup A unchanged.
4. Choose Restore and select `InvalidA.cosmifold`. Expect “This backup can't be
   restored because its saved structure is invalid.” No replacement confirmation
   appears. Verify the current Item, Note, Location, tasks and file are unchanged.
5. Close the dialog and reload. The existing workspace should load normally
   without recovery or first-use onboarding.
6. Select the original `BackupA.cosmifold`, confirm Restore and let it reload.
   Verify both task completion states and the saved content/file.

The automated equivalent runs in an isolated temporary profile:
`python -B tests/browser-check.py --restore-model-only`. It also compares exact
canonical text, file/thumbnail bytes, Restore marker and F4 journal across
rejections, checks rollback after a forced commit error, and restores from F3
recovery followed by an immediate startup validation.
All candidates use the actual Restore button, native file input and change
handler. A valid candidate must preview and cancel safely; the helper-generated
candidate must show an error without preview. To repeat with specific local
files, add `--restore-valid-backup "path\BackupA.cosmifold"` and
`--restore-invalid-backup "path\InvalidC.cosmifold"`. These files are selected
for validation only; the suite's confirmed replacement uses synthetic data in
its disposable profile. Run `python -B tests/restore_model_fixture_test.py` for
independent checksum, parent/flag, payload preservation and overwrite checks.

Restore requires an up-to-date browser with **Web Locks** on HTTPS or localhost.
The application still runs and exports where safe Restore is unavailable. Tabs
running this app hold shared workspace locks; replacement requires an exclusive
lock. Older app versions cannot participate, so close those tabs explicitly.
If simultaneous Restore attempts race, the losing tab checks the durable commit
revision before resuming. A changed revision blocks stale writes and asks for a
reload. Returning from the browser's back/forward cache reloads the page to avoid writing
an obsolete runtime graph after another tab restored data.

### Moving between origins

Export from your original `127.0.0.1` browser address. Open the hosted HTTPS site,
choose Backup ? Restore backup, and explicitly confirm replacement there. The
file carries portable IDs/bytes, not an origin, database name or filesystem path.
These browser origins stay independent: restoring on the hosted site does not
modify the development site's storage. Keep the source and backup until you have
checked the restored Cosmos. This is a local file transfer, not an upload or sync.

### Replacement and recovery

The repository captures exact current metadata, legacy fallback and preferences
for rollback, then writes a small local write-ahead Restore journal. Only after
confirmation does one IndexedDB read/write transaction stage the entire restored
file set and an internal commit marker. Old rows remain recoverable by transaction
abort until completion. After all staged writes succeed, the same transaction's
callback synchronously writes restored metadata/preferences. It does not use
normal save/copy helpers, normalize data or regenerate IDs.

- A staging failure aborts the transaction: old file rows remain.
- A metadata/preference error or late transaction abort restores the exact old
  local strings and verifies rollback before reporting that data was unchanged.
- If the page/process closes in the cross-store commit window, startup checks the
  durable IndexedDB marker **before loading the application**. A matching marker
  completes the new metadata/preferences; no matching marker restores the old
  strings. The files and marker commit atomically together, so startup chooses
  the matching complete dataset rather than exposing a mixed graph.
- Successful replacement removes the journal. If final journal cleanup fails,
  the complete new dataset remains committed; startup finishes cleanup. If
  rollback/recovery itself cannot write storage, the journal is preserved and
  editing is blocked. The UI asks for a reload without claiming old data was
  unchanged. Persistent storage/device failure is not something software can
  guarantee away; keep the downloaded backup and original origin available.

The attachment database has an additive internal IndexedDB version 2
`restoreState` store for the commit marker; existing `files` rows are untouched
by that upgrade. **Cosmifold metadata storage remains v5.** The Restore journal
and marker are internal machinery and are excluded from Export. The ordinary
historical migration recovery mechanism is unchanged.

Replacement needs temporary space for old and new file sets plus the journal,
and localStorage quota must fit the new metadata and rollback strings. Insufficient
quota fails safely instead of omitting files. Validation retains Blob slices and
hashes one payload at a time; it does not allocate a full-file byte array. The
same 512 MiB complete-file / 32 MiB manifest caps apply. Large individual files
still need an ArrayBuffer for native SHA-256; smaller backups suit mobile memory.

## What is included

- The complete saved storage-v5 snapshot, including unknown persisted fields:
  every Galaxy/item, names, IDs, parent relationships, Notes, Bookmarks, Locations,
  Constellations/memberships, linked placements, archived data, appearance,
  timestamps, saved world coordinates and parent-relative layout preferences.
- Every file record referenced by current canonical item attachment metadata,
  including archived items: exact original bytes, storage key/owner, original
  filename/MIME/size metadata, and every persisted thumbnail for those records.
  Independent copied files remain independently identified.
- Genuinely persisted sidebar preferences, restored with the Cosmos; normal responsive width limits still apply.

**Excluded:** orphan/unreferenced IndexedDB records and internal recovery snapshots.
An orphan has no storage-key reference in current canonical item content, even
if its `entryId` names an existing item. Interrupted older writes can leave these
records behind; there is no separate user-facing recovered-file collection.
Archive is different: archived entries retain their content references and files
are included. Linked placements use their canonical item's files.

Recovery keys (`:pre-hierarchy`, `:pre-layout`, `:pre-cosmic-tree`) retain older
snapshots before schema transitions, rather than current user state. A stale
`tool-galaxy:user-data` fallback is also excluded when the current key exists.
If that fallback is the active saved snapshot instead, it is read as current
metadata (and must meet the existing v5 export requirement). Export neither
reads the internal recovery keys nor deletes or alters any recovery/orphan data.

Selection, multi-selection, hover, drag, camera animation, clipboard, Search,
open dialogs, Help topics and unsaved drafts are excluded because they are not
persisted user data. A completely empty metadata store is represented explicitly
as `metadata:null`, not populated with guessed runtime items.

Export reads the saved state rather than flushing unsaved runtime state. It does
not save, migrate, normalize the hierarchy, rewrite IDs/timestamps, regenerate
thumbnails, repair corrupt data or clean up orphans. Normal app activity can
continue separately; a consistent saved snapshot is captured before packaging.

## Failure and completeness

No download occurs if metadata references a missing original, unreadable bytes,
wrong owner or incorrect byte size. A referenced record's corrupt thumbnail also fails the
export. An absent thumbnail is allowed because some supported files/videos never
had one; absence is explicitly recorded and no thumbnail is fabricated.

Unreadable metadata/preferences, invalid referenced file records, unsupported storage
versions, size-limit failures and read/hash errors keep the dialog usable and
leave data unchanged. Finish any current file action before retrying. If saved
metadata/preferences change during the file-record capture, retry after the
change finishes; incomplete cross-store data is not presented as successful.

The IndexedDB records are captured in one read-only transaction. Metadata and
preferences are compared immediately before/after that capture. This catches
normal app writes during reading; it is not a claim of a cross-localStorage/IDB
ACID transaction or protection against arbitrary developer-console modification.
Captured immutable Blob bytes remain valid if the live Cosmos changes later.

## Format and size choice

Version 1 is a small native-browser **binary container**, not a ZIP, and not a
base64 JSON dump. A fixed header and UTF-8 JSON manifest describe raw Blob
payloads placed after them. Blob concatenation uses standard browser APIs; no
dependency, custom ZIP compressor, framework or build step was added.
[Blob constructor](https://developer.mozilla.org/en-US/docs/Web/API/Blob/Blob).

This choice avoids base64's roughly one-third binary size expansion and large
encoded strings. Original/thumbnail bytes are never re-encoded or transformed.
The overhead is the header and JSON manifest, which includes exact source text
as well as parsed metadata/preferences. It is uncompressed and requires a
Cosmifold reader; ordinary ZIP tools do not open it.

The v1 exporter caps the **complete file at 512 MiB** and the manifest at 32 MiB.
These are guardrails, not a guarantee that every mobile browser can export that
much. Prefer smaller backups on memory-constrained devices. Multi-gigabyte
backups are outside this version's scope.

Blob handles are read once and payload hashes are computed sequentially, yielding
between records. Export does not turn the entire completed package into an
ArrayBuffer or load all originals into byte arrays simultaneously. Native
SHA-256 still needs one original/thumbnail's complete ArrayBuffer at a time;
memory use depends on the largest file, metadata and the browser's Blob/download
implementation. Cancellation is checked around reads/hashes; an in-progress
native digest is not itself interruptible.
[Web Crypto digest behavior](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest).

Test coverage includes forty small files, an 8 MiB PDF payload, a 4 MiB image
payload and a 32 MiB video payload in one package, plus browser-native photo/video,
a 3 MiB PDF, generic bytes, independent copies and persisted thumbnails. Larger
limits reject clearly; a base64 or custom ZIP implementation is not needed to
support these payloads.

## Developer format contract

`backupVersion` is the portable file format version; `storageVersion` identifies
the embedded persistence format. They are independent. A reader must
inspect/bound the fixed header before allocating or parsing the manifest.

```text
Offset / length                 Value
0 / 17 bytes                    UTF-8 "COSMIFOLD-BACKUP\n"
17 / 4 bytes                    backupVersion: uint32 little-endian (1)
21 / 4 bytes                    manifest byte length: uint32 little-endian
25 / 32 bytes                   SHA-256 of the exact manifest UTF-8 bytes
57 / manifest length            UTF-8 JSON manifest
57 + manifest length / remaining raw original/thumbnail payload bytes
```

The manifest contains:

```text
{
  format: "cosmifold-backup",
  backupVersion: 1,
  exportedAt: UTC ISO timestamp,
  storageVersion: 5,
  metadata: complete parsed v5 snapshot, or null,
  metadataText: exact original saved snapshot text, or null,
  preferences: saved sidebar preference object, or null,
  preferencesText: exact original preference text, or null,
  counts: {
    entries, galaxies, notes, bookmarks, locations,
    constellations, constellationMembers, linkedPlacements, archivedGalaxies,
    layoutPreferences, attachmentReferences, attachmentRecords, thumbnails
  },
  payloadBytes,
  attachments: [{
    record: saved key, entryId and all other JSON record metadata,
    thumbnailPresent: boolean,
    original: {offset, size, type, sha256},
    thumbnail: {offset, size, type, sha256}, or null
  }]
}
```

`attachmentReferences` counts all current canonical attachment metadata references;
`attachmentRecords` counts distinct referenced storage keys, and `thumbnails`
counts persisted non-null thumbnail payloads on those records. Archived items
participate in all applicable counts. No orphan/recovery count or payload is
included. The binary framing, extension and backupVersion remain unchanged.

Payload offsets are relative to the start of the binary payload region, not the
beginning of the file. Records are sorted by key for repeatability. For each
record the original precedes its thumbnail. `size` is bytes, `type` is the saved
Blob MIME type, and `sha256` is lowercase hex. Canonical attachment IDs, filenames
and metadata are retained unchanged in `metadata.entries[].content.attachments`.
The record key equals the referenced `storageKey`; no origin or absolute database
name is needed. Extra JSON record metadata is retained; unsupported extra binary
record fields fail rather than silently becoming empty JSON.

The fixed manifest digest and individual payload digests support corruption
detection, not signatures, encryption or proof of who created a file. Restore also validates lengths/offsets/counts, raw-text/parsed consistency,
hierarchy/IDs/references and ownership before writing anything. It should not
execute content or trust a user-supplied backup merely because its hashes match.
Hashes detect package damage after creation; without an earlier source digest,
they cannot prove that already-stored bytes had never been damaged beforehand.
The Restore reader validates this contract before any replacement. No merge,
append, partial import, new IDs or speculative storage-version migration exists.

## Code paths and checks

```text
Backup dialog (backup-ui.js)
  -> cosmifoldBackup.create() (services/local-backup.js)
  -> universeRepository.readBackup()
       metadata.readForBackup() / preferences.readForBackup()
       files.readAll() in a read-only IndexedDB transaction
  -> one Blob with manifest + original/thumbnail payloads
  -> one browser download

Restore file picker (backup-ui.js)
  -> cosmifoldRestore.inspect() (services/local-restore.js)
       bounded header/manifest, hashes, metadata/relationship/count validation
  -> immutable validated summary -> explicit user confirmation
  -> exclusive workspace session -> cosmifoldRestore.restore()
  -> universeRepository.replaceLocalBackup()
       metadata/preferences journal + files.replaceAll() / commit marker
  -> success message -> page reload
       startup.js recovers any pending journal before loading script.js
```

No arbitrary runtime Maps are serialized. The new metadata read method returns
the original persisted representation without `load()` migration/projection
flags or the runtime snapshot allowlist discarding future fields.

```powershell
node --test tests/backup.test.js tests/restore.test.js
python tests/browser-check.py --backup-only --screenshots
python tests/browser-check.py --restore-only --screenshots
```

The unit tests parse and hash exported packages independently of the writer.
Browser checks inspect actual downloads in temporary profiles, verify original
and copied binary bytes/thumbnails, run export with networking disabled, check
progress/repeat/failure/cancel, preserve data/drafts/selection, and exercise narrow
controls and Sample isolation. Restore tests cover rich Export ? Restore ? Export
parity, fresh/populated stores, malformed references/offsets, quota/commit/late-abort
failures and startup recovery. Browser checks exercise actual file selection,
confirmation, IndexedDB rollback, reload, multi-tab protection and independent
127.0.0.1 ? localhost origins using temporary profiles.
