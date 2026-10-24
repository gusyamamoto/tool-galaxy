# Temporary object URL ownership (F6)

This change only manages temporary browser URLs and decoder resources. It does
not sweep stored files, change metadata, rewrite backups, or change F1–F5 data
validation/transaction rules.

## Runtime audit

The initial audit found **11 createObjectURL calls**. Declared runtime assets,
including local vendor scripts, were searched; test fixtures, development tools
and the separate generated staging directory are not application runtime.

| Initial creation site | Owner and final lifecycle |
| --- | --- |
| `appearance.js`: `bakeField` | Procedural CSS texture URL cache. Live CSS, including archive/deletion animation copies, pins URLs. Keep at most 32 unused entries; evict/revoke older unused entries. Page teardown and successful Restore detach maps and clear them. |
| `attachment-store.js`: `videoPreview` | One frame-extraction job. Clear handlers, pause, detach source, load/reset and revoke in `finally`, including unsupported codecs or native teardown failure. |
| `rich-content.js`: `preview` | One rendered Contents thumbnail. Detach handlers/source/element before release; remove failed allocations immediately. Clear the whole rendered scope on rerender, hide or Item switch. |
| `rich-content.js`: `downloadFile` | Transferred to the common temporary-download owner in `object-urls.js`. |
| `rich-content.js`: `openFile` | Now `openNativeFile`: one native text/PDF tab, with one URL and close/navigation poll. Release on close, navigation away, missing owner/attachment, page teardown or successful Restore. |
| `image-viewer.js`: `buildFilmstrip` | One viewer session owns its filmstrip URLs. Detach before releasing on rebuild/close; failed thumbnail decode or installation releases that URL immediately. |
| `image-viewer.js`: `show`, original | One currently displayed image/video/PDF. Detach image/embed; stop and reset video before revocation on replacement or close. |
| `image-viewer.js`: `show`, friendly HEIF preview | A separate preview URL; the original URL belongs to the original-file links. Both close with the session. Failed preview URLs are released without removing the durable original. |
| `image-viewer.js`: `show`, video poster | Current video session. Remove poster/source and reset decoder before releasing it. |
| `backup-ui.js`: `export` | Transferred to the common temporary-download owner. |
| `script.js`: preserved-data download | Transferred to the common temporary-download owner. |

There is one additional explicit allocation for a failed full-media preview:
`image-viewer.js` `fallbackOriginal` releases decoder URLs and keeps an inert
original-file URL solely for visible Save a copy/Info links until close.
Viewer Save a copy clicks create an independently owned temporary download;
closing the viewer cannot revoke that active download's URL. PDF Open externally
likewise opens a separately owned URL, so closing the internal viewer does not
break the native PDF tab.

The common download owner removes anchors in `finally`, releases immediately on
anchor construction/append/click failure, and otherwise retains the existing
60-second download grace. Expiry or pagehide removes both URL and timer. This
grace is intentional: panel teardown must not interrupt a browser download.

HEIC/HEIF conversion uses native `createImageBitmap`, closes bitmaps (including
late timeout results), and persists optional friendly preview Blobs separately
from originals. No decoder dependency was added. Audio files remain general
files; there is no separate audio-element preview path. `blob:` checks are also
used by hosting/CSP and tests; these are not URL allocations.

## Reproduced retention and race protection

Before the fix, a thumbnail decode failure removed the image but retained its
URL in Contents: 1 created, 0 revoked, 1 retained with no image. Fifty procedural
texture requests with no DOM users retained all 50 URLs with zero revocations.
Native text tabs also installed a new pagehide closure per open; closed tabs
released URLs but retained those closures until the page ended. Native PDF tabs
shared an internal-viewer URL whose lifetime could end before the native reader.

Contents generation/visibility/connected-element checks run after asynchronous
reads and before allocation. Viewer version/session checks prevent stale reads
and decoder completions from overwriting a newer view. Filmstrip sessions have
their own check. Native-tab records exist before reads start; close or teardown
invalidates the record before a late result can allocate. Procedural generation
uses an epoch check before work, encoding completion and final installation.

Canonical content publication reconciles open viewers/native tabs after a
successful change. Removing an attachment closes its current viewer; Contents
rerender releases old thumbnails. Item/branch deletion and navigation use the
same teardown. Nothing scans unrelated IndexedDB records.

Successful Restore resets old Contents, viewer/native tabs and texture URLs only
after replacement has committed; failed Restore leaves current previews usable.
Independent browser downloads keep their bounded grace. F2 file-job failures
still use their existing inline/global reporting; missing bytes keep metadata
and unavailable-file feedback. F3 preservation, F4 recovery/journals and F5
preflight validation are unchanged.

## Verification

```powershell
node --test tests/object-urls.test.js
python -B tests/browser-check.py --object-urls-only
```

The focused browser suite counts actual allocations and releases while decoding
images, opening/closing 30 viewers and replacing images 30 times. With two image
attachments it retains two Contents URLs while closed and peaks at five with
one full image and two filmstrip thumbnails open. It also checks late reads,
decode failures, missing bytes, real video replay/teardown, original downloads,
attachment deletion, mobile display, native PDF ownership, texture eviction and
failed/successful Restore. Node tests cover 50 native-tab cycles, download failure
paths, late canvas encoding and teardown failures.

These checks establish URL ownership and source teardown, not an exact browser
heap/GPU-memory reclamation time. Active media/fallback links, native tabs,
download grace and the 32-entry unused texture cache intentionally retain URLs.

## Safe manual check

Use disposable local data. Hard reload the current app first (Ctrl+Shift+R);
an already-open tab keeps its previously loaded JavaScript.

1. Create/select an Item and add two small images.
2. Open and close its image viewer repeatedly, including Escape and backdrop.
3. Use next/previous to switch between the two images several times.
4. Close Contents, reopen it, navigate to another Item, then return.
5. Delete one image through its normal confirmation control.
6. Reopen the remaining image and verify it still renders with no visible error.
7. Optionally add a short supported video, play it, close the viewer, then reopen
   it. Playback should stop on close and work on reopening.

Optional URL counters require no heap snapshots. Copy the contents of
`tests/object_url_probe.js` into DevTools before opening Contents/previews. It
wraps only create/revoke, records URL strings (not file bytes), and exposes:

```javascript
cosmifoldUrlProbe.snapshot();
// {created, revoked, active, duplicateRevocations}
```

After each close, the count should return to current Contents usage; repeating
the cycle should not grow it. Other active surfaces and downloads are included
if created after instrumentation. Existing URLs from before instrumentation are
not counted. Remove the instrumentation exactly with:

```javascript
cosmifoldUrlProbe.uninstall();
```

Uninstall restores both original functions and removes the debug global. It
does not revoke application-owned URLs or change stored data. The probe lives
under `tests/`, is not loaded by the app and is excluded from packaging.
