# Local backup

**Backup downloads one portable copy of your saved Cosmifold data and files.**
It stays on your device. Nothing is uploaded, and it is not cloud sync.
The file is **not encrypted**; store it somewhere you trust.

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

**Restore is not available in this branch.** The next planned branch is
`feature/local-backup-restore`. Keep your original browser data until that feature
has been implemented and verified.

## What is included

- The complete saved storage-v5 snapshot, including unknown persisted fields:
  every Galaxy/item, names, IDs, parent relationships, Notes, Bookmarks, Locations,
  Constellations/memberships, linked placements, archived data, appearance,
  timestamps, saved world coordinates and parent-relative layout preferences.
- Every file record referenced by current canonical item attachment metadata,
  including archived items: exact original bytes, storage key/owner, original
  filename/MIME/size metadata, and every persisted thumbnail for those records.
  Independent copied files remain independently identified.
- Genuinely persisted sidebar preferences, kept separately so future Restore can
  make applying device-specific settings optional.

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
as well as parsed metadata/preferences. It is uncompressed and requires a future
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
the embedded persistence format. They are independent. A future reader must
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
detection, not signatures, encryption or proof of who created a file. Future
Restore must also validate lengths/offsets/counts, raw-text/parsed consistency,
hierarchy/IDs/references and ownership before writing anything. It should not
execute content or trust a user-supplied backup merely because its hashes match.
Hashes detect package damage after creation; without an earlier source digest,
they cannot prove that already-stored bytes had never been damaged beforehand.
No production parser, file picker, import, merge or restore operation is added.

## Code paths and checks

```text
Backup dialog (backup-ui.js)
  -> cosmifoldBackup.create() (services/local-backup.js)
  -> universeRepository.readBackup()
       metadata.readForBackup() / preferences.readForBackup()
       files.readAll() in a read-only IndexedDB transaction
  -> one Blob with manifest + original/thumbnail payloads
  -> one browser download
```

No arbitrary runtime Maps are serialized. The new metadata read method returns
the original persisted representation without `load()` migration/projection
flags or the runtime snapshot allowlist discarding future fields.

```powershell
node --test tests/backup.test.js
python tests/browser-check.py --backup-only --screenshots
```

The unit tests parse and hash exported packages independently of the writer.
Browser checks inspect actual downloads in temporary profiles, verify original
and copied binary bytes/thumbnails, run export with networking disabled, check
progress/repeat/failure/cancel, preserve data/drafts/selection, and exercise narrow
controls and Sample isolation. They do not claim that Restore is proven yet.
