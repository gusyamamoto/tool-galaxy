# WebKit attachment persistence compatibility

Branch: `ux/prerelease-refinement`. Local changes only; no commit, push or deployment.

## Failure analysis

Take a photo, Add photo and Add files converge on `galaxyAttachmentFiles.prepare()` and the same IndexedDB file adapter. Preparation retains the original bytes and creates an optional thumbnail. Previously the adapter could persist only native Blob/File values. A browser that rejected that representation rejected every picker source.

The reported text, `Error preparing Blob/File data to be stored in object store`, comes from [WebKit's IDBTransaction Blob preparation path](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/indexeddb/IDBTransaction.cpp). WebKit stages Blob-backed structured-clone values before handing them to the database; failure there produces this UnknownError. This identifies the failure boundary, rather than proving the underlying device filesystem condition. No physical iPhone reproduction was available here.

The regression harness injects that exact error synchronously and asynchronously against real Chromium IndexedDB transactions. Its asynchronous case deliberately aborts a real transaction and rolls back a queued write. It is a compatibility fault test, not a claim that Chromium reproduces WebKit internals.

## Storage representation and transaction behavior

Normal writes still store native Blob/File values. Only the matching preparation error triggers one retry. Generic quota, abort, key collision and unrelated clone errors do not switch representation.

On retry, the existing `blob` and optional `thumbnail` fields contain descriptors:

```js
{
    format: 'cosmifold-bytes-v1',
    bytes: ArrayBuffer,
    size: originalBlob.size,
    type: originalBlob.type,
    // Only when the input was a File:
    name: originalFile.name,
    lastModified: originalFile.lastModified
}
```

The decoder also supports Uint8Array views with their exact byte offsets. Writes use ArrayBuffer, with no base64 expansion. Encoding reads both originals and thumbnails only after the first transaction has aborted, and before opening the retry transaction. Materializing the bytes temporarily consumes memory; unreadable data or a failed byte write rejects the operation through existing error handling.

Outer record fields and canonical attachment metadata remain unchanged: ownership, IDs, filename, MIME, size, dimensions, duration, timestamps and any existing metadata are retained. Hashes are computed from the same original/thumbnail bytes by Backup; no alternate payload or checksum algorithm is introduced.

`get()` and `readAll()` reconstruct ordinary Blob/File values for existing consumers. Native Blob-backed records remain readable alongside byte-backed records. No database version change, destructive migration, user-agent detection or permanent fallback flag is used. Unknown/malformed unreferenced rows remain available to conservative audit classification and are filtered out by Backup's existing canonical-reference check. A malformed referenced payload still fails validation.

The F4 prepared journal is retained across both attempts. Successful bytes and the files-written stage remain atomic; canonical metadata is committed only after durable file completion. Restore retries its entire replacement transaction, preserving the old dataset until success. Restore cannot retry after its metadata callback has been attempted. Request-level errors are retained so an abort does not hide the preparation failure.

## F1–F9 contracts

| Contract | Result |
| --- | --- |
| F1 stale writes | Existing lock and canonical comparison retained. A stale commit after successful fallback removes the staged bytes and preserves the winning snapshot. |
| F2 visible failures | A failed fallback remains authoritative. No metadata is published; the existing visible quota/storage error remains. |
| F3 corrupt local data | Startup validation and preservation are unchanged; no migration or repair runs on existing rows. |
| F4 journals/recovery | Both formats use the same keys, owners, stages and recovery rules. Restart removes unreferenced staged bytes and retains referenced committed bytes. |
| F5 Backup/Restore | Consumers see Blobs; existing portable format, model checks, ownership, sizes and SHA-256 validation remain. Failed replacement preserves old metadata and bytes. |
| F6 object URLs | No lifecycle code changed. Decoded Blobs use the existing preview/viewer/download owners. |
| F7 capacity | Correct original/thumbnail sizes are retained. Existing advisory checks and actual-write failure authority remain. |
| F8 orphan audit | Valid descriptors expose original/thumbnail byte lengths without constructing Blobs. Unknown extensions/malformed descriptors remain UNKNOWN; explicit orphan deletion is unchanged. |
| F9 integration | Existing combined persistence/recovery checks are rerun alongside fallback-specific integration. |

No changes to mobile menus, capture selection, Introduction assets, Tasks/sidebar, clipboard, Duplicate Structure or cloud/auth.

## Validation results

All final runs passed:

| Check | Passed |
| --- | ---: |
| Full Node suite | 836 |
| New binary compatibility browser suite | 40 |
| Mobile attachment | 48 |
| Mobile capture | 104 |
| Attachment transaction recovery | 32 |
| Combined persistence/recovery | 33 |
| Orphan audit | 39 |
| Background file failure/F2 | 35 |
| Restore model validation | 53 |
| Restore | 70 |
| Backup | 40 |
| Object URL lifecycle | 26 |
| Storage capacity | 29 |
| Local stale writes | 20 |
| General files | 48 |
| Media | 57 |
| Attachment viewer | 30 |
| Persistence adapters | 20 |
| Corrupt local data | 58 |
| Fresh local staging package browser smoke | 265 |
| Packaging tests | 5 |

Browser total: **1,047 checks across 19 suites**, including the 265 checks on the fresh 61-file package at `staging-site/webkit-attachments-20261025`. This directory is a local ignored validation artifact; no existing device-test build or staging package was replaced.

Node increased from the earlier 815-test UX baseline by 21 focused tests. Browser totals cover attachment/storage/recovery suites plus staging, rather than every earlier Batch 1 UX suite. Only the final successful suite run is counted, not failed attempts or reruns.

The broad run exposed two older harness issues, both corrected in `tests/browser-check.py`: its persistence fixture attempted to abort a completed transaction from the metadata callback, predating F4's durable-before-metadata contract; its PDF reopen pointer target needed scrolling back into view after reader focus. The persistence check now aborts the live file transaction on request success and verifies no metadata publication or leftover journal. The viewer check retains real pointer interaction with an exposed target. No runtime behavior was changed for either test correction.

Syntax: 150 JavaScript files and the two changed Python files passed. Explicit whitespace checks for this pass and `git diff --check` passed.

## Physical-device retest

Use the current build at the same test origin used previously, with JavaScript refreshed. Keep the same origin for reload/reopen checks because browser storage is origin-specific. Use a disposable Item and small recognizable files initially.

**iPhone Safari**

1. Select the test Item. Open full Contents, then `+` → **Take a photo**. Take and accept a photo. Wait for it to appear; verify no storage error and open the preview.
2. From the same menu choose **Add photo**, select a library photo, and verify its preview. Include HEIC/HEIF if available; unsupported preview must still retain the original and Save a copy.
3. Choose **Add files**, select a small text/PDF document from Files, then open or Save a copy. Verify filename and content.
4. Close full Contents and repeat all three actions from **Preview Contents**. Cancel each picker once, then select again; cancellation must add nothing and reselection must work.
5. Reload the same URL. Reopen the Item and all six attachments. Confirm photos/thumbnails, original documents, filenames and Save a copy still work. Close and reopen the tab at the same URL and check again.
6. Remove one test attachment, reload, and verify only that attachment is gone. Optionally create a Backup, Restore it into a disposable workspace, reload and reopen each attachment.

**iPhone Chrome**

Repeat steps 1–5 in Chrome using its own test Item/data. Start with the same camera/library/Files sources that failed in Safari; verify camera permission, cancellation, reload and reopening. Browser storage is separate, so Safari attachments are not expected to appear there.

**Android**

Repeat the three actions from both Contents surfaces, then reload and reopen the original images/document. Verify cancellation, image previews, HEIC fallback where applicable, Save a copy and one attachment deletion. Existing working native Blob persistence should continue normally.

**Desktop**

Add an image and a document using existing controls (and drag/drop if normally used). Open previews/downloads, reload and reopen them. Copy an Item with attachments and delete the copy; originals must remain. Check a Backup/Restore round-trip in disposable data.

Automated tests cannot confirm native iPhone picker/provider behavior or success on the affected physical device. Device retest remains required to close that part of validation.
