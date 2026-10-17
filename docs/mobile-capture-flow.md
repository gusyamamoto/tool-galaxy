# Mobile content capture

On phone layouts, tapping a body selects it; double-tapping focuses it. Neither
opens Contents automatically. The selected-item bar offers an expand chevron, a
separate `+` for adding content and `…` for the existing item actions. Navigation
rows also expose separate 44px Add and actions buttons without long-press. The
touch drawer leaves room for these controls without changing saved desktop width.
In mobile CB View (sidebar closed), finishing a body drag also leaves Contents
closed, including cancellation/lost capture after movement. Crossing the existing
8px touch drag threshold changes placement, never the Contents-opening policy.
The expand chevron uses the existing explicit preview button; the preview group itself
has no open handler. Closing Contents retains the selection and restores the
preview. Desktop drag completion and sidebar navigation retain their behavior.

The compact card has a centered upward chevron, without a View contents label. An upward
swipe starting on the compact card also calls the same inspector opener; `+`
and actions remain independent controls. The expanded mobile close button shows
a downward chevron (desktop retains its close mark). A downward swipe on a
non-interactive part of Contents or directly on its centered collapse handle
collapses through the existing close logic only
if the panel and any nested scroll area were at the top when the gesture began
and remain at the top. A gesture begun lower down stays a scroll even if it
reaches the top. Fields, links, buttons, media controls and editable content keep
their own gestures; only the collapse handle is exempt from the button guard.
Short/horizontal gestures, cancellation and multiple fingers
do not trigger expansion/collapse. Canvas gestures never enter these handlers.

Sheet swipes require at least 64 CSS pixels of travel, with vertical movement
at least 1.5 times horizontal movement. Native scrolling is prevented only after
a clear gesture in the expansion/dismissal direction is recognized. Opening
uses a 180ms ease-out slide/fade; swipe collapse uses 160ms ease-in before calling
the existing close function. Reduced-motion mode skips these animations.
Expanded mobile Contents removes surplus top/header gutters while keeping the
handle and title actions at 44px, breadcrumb targets at 32px, form spacing and
safe-area padding intact. The first mobile breadcrumb label aligns with the CB
title and section text, including short ancestor names within their existing
touch targets. The compact card and desktop spacing are unchanged.
In short phone landscape, the drawer scrolls and reserves a usable tree height
so expanded collections/utilities cannot squeeze capture rows out of view.

Mobile CB View (sidebar closed) offers Take Photo, Photo Library / Gallery,
Quick note and More…. Quick note opens the existing note editor. More… expands
the same menu for the same destination, without opening the sidebar or changing
selection. Reopening `+` returns to the quick menu.

Mobile Menu View (sidebar open) offers the full menu: Take Photo, Photo Library /
Gallery, Files; Add item, Add existing item, Paste; Note, Bookmark. Separators group
capture, organization and writing actions. The full menu is also available via
More… in CB View. Both use the existing item-actions menu surface, typography,
single-column rows and touch spacing. Desktop retains its existing Add actions
and drag/drop paths, with Paste relocated into the full Add menu.

## Body management menus

`+` adds into the destination body; `…` manages the body itself. CB View exposes
exactly Rename, Add to Constellation and More…. More expands the full menu for
the retained body: Rename, Move to…, Add to Constellation, Copy, Duplicate
structure, Delete item. Galaxies also retain Archive Galaxy before Delete item.
Menu View opens the full menu directly. Preview, Contents-header, sidebar and
canvas actions share the same canonical body menu; desktop uses its full version.
Linked-item and Constellation overview actions retain their separate meanings.
The two full-menu dividers use the existing Add-menu separator treatment.

Add item and Add files were removed from body management. Paste now appears in
the full Add menu (disabled when no valid internal clipboard source exists).
It opens the same copy/link confirmation dialog bound to the Add destination;
quick Add choices, existing keyboard shortcuts and copy/link semantics are
unchanged. This does not introduce any new linking mechanism.

Move to… reuses the existing Save/Cancel parent selector. Options include Universe
and full destination ancestry paths, excluding the body and all descendants.
Selection changes nothing before Save. Existing model validation runs before
and again inside the staged repository save; self/descendant moves cannot bypass
the guard by injecting a selector option. Confirming changes the actual parent
and carries descendants with the branch; it does not create a linked item.
Cancel leaves the hierarchy untouched. Rename and membership actions also retain
their original implementations, validation and persistence.

Known usability limitation: Move to… uses a flat destination list with ancestry
paths. Finding a destination becomes cumbersome in a large hierarchy. This is
a non-blocking follow-up for a focused destination-picker task; the current
parent validation, confirmation and hierarchy integrity remain in place.

After an acknowledged Move, publication updates the existing canonical body
record in place, as Rename already does. The retained DOM handlers, rendering and
simulation tick publication must share that record. Replacing it with the staged
clone leaves handlers reading pre-move coordinates while the live particle and
rendered model settle under the new parent. Particle identity, normal layout
response and existing parent-relative placement invalidation are unchanged.
The native drag regression checks settled screen/world coordinates, repeated
Move/drag, manual placement, descendants and desktop mouse input.

Mobile full Contents exposes a body-level `+` beside the existing `…` in its
title row. Preview and Contents-header `+` share the same Add menu and context
rules: sidebar closed gives the four quick choices; sidebar open gives the full
menu; More… expands it without changing the destination. The Contents button
targets the canonical body currently shown by the inspector, not a section.
It is absent from Constellation overview and desktop title rows.

Files and Media retain explicitly labelled section actions. Bookmarks and
Location use lightweight inline entry rows, never a bare `+` that can be
mistaken for the primary body-level Add button.

All three capture choices synchronously open the existing file input from the
user gesture, with the exact destination ID retained until selection/cancellation:

| Choice | Input configuration |
| --- | --- |
| Photo Library / Gallery | `accept="image/*,.heic,.heif"`, multiple, no capture attribute |
| Take Photo | `accept="image/*"`, `capture="environment"`, single file |
| Files | No accept/capture filter, multiple |

Every opening resets the previous input configuration. Cancellation clears the
picker destination without opening Contents or changing metadata. Selection opens
the destination's existing Contents and uses the normal attachment preparation,
repository/IndexedDB transaction, validation, errors and preview/lightbox flow.
Executable/script restrictions and existing file/video byte limits are retained.
The 20-megapixel budget limits preview work; larger accepted originals are stored
without attempting a thumbnail. Preview decoding/encoding failure also retains
the original and uses the existing fallback.

HEIC/HEIF files retain their original filename, MIME and bytes as supplied by the
system picker. Native `createImageBitmap` decoding is best-effort and bounded;
when available, it creates a separate small WebP thumbnail within the existing
preview pixel limit. The original is never converted or replaced. Without native
decoding, the original is still stored, with a Media fallback and Save a copy.
A stored friendly thumbnail can display in a browser without a HEIF decoder;
viewer downloads always point to original bytes, independently of preview URLs.

Contents image previews use a separate 768-pixel longest-edge cap, retaining the
source aspect ratio and never enlarging smaller originals. Native resizing and
canvas downscaling request high quality; the separate WebP preview uses quality
0.85. This replaces 240-pixel, low-quality native resizing and WebP quality 0.8
for images. It supplies sufficient pixels for the existing compact Contents tiles
at typical phone DPR 2–3 without loading full originals into every tile. Images
are constrained to their existing viewport: their intrinsic grid size must not
overflow its fixed height and clip the image before `object-fit` can contain it.
Tile dimensions and contain/cover policies are unchanged. Video thumbnails remain
at 240 pixels. Existing saved thumbnails
are not migrated or rewritten; the improved policy applies to newly generated
previews. Full-image viewing still uses original JPEG/PNG/WebP bytes, and HEIF
native-preview/original-only fallback behavior is retained.

The maximum image preview canvas is 768 × 768 (about 2.25 MiB of RGBA pixels),
compared with 240 × 240 (about 0.22 MiB). Typical 4:3 previews are 768 × 576.
Compressed preview size depends on image detail; no second preview variant is
stored. The existing original-file and preview source-pixel limits are unchanged.

Browser/OS behavior still determines whether Gallery opens a photo library and
whether camera capture is honored. A desktop may show an ordinary picker for
Take Photo. The web page cannot recover a pre-conversion camera original if the
OS supplies a different file. No HEIF decoder dependency or camera-stream UI is
introduced. Validate actual camera/library behavior on iOS Safari and Android
Chrome before treating device capture as manually verified.

## Attachment delivery and UUID compatibility

The Android Chrome LAN-HTTP failure was confirmed as
`crypto.randomUUID is not a function` after the picker returned. Attachment
preparation called a secure-context-only API before storing anything; this was
not failed camera permission or HEIC recognition. There was no existing shared
UUID helper; entry creation alone had a sequential-ID fallback.

`ids.js` now centralizes local UUID generation. It uses native `randomUUID` when
present, otherwise 16 bytes from `crypto.getRandomValues` with the v4 version and
variant bits. Without secure randomness it fails explicitly; there is no
`Math.random` fallback or Crypto monkey-patch. Existing UUID formats and entry,
copy, structure, linked-item and Constellation prefixes are retained. Saved IDs
are never rewritten. Attachments, bookmarks, these local item actions and local
Restore journal IDs use the helper. Cloud services/diagnostics still have their
existing native UUID defaults and remain unchanged/inactive; HTTPS/Web Locks and
other platform requirements are not bypassed by this local ID fix.

The picker path still snapshots its FileList before resetting the input, validates
filename/MIME/security/byte limits, prepares original bytes, and uses the existing
repository/file-store transaction before publishing metadata and refreshing UI.
An empty MIME with a known extension is supported already; conflicting metadata
retains its conservative generic-file handling. No content-provider URI access,
new storage path, filename rewriting or speculative MIME sniffing is added.
Read/provider, blocked-storage and quota errors have friendly reasons in Contents.

Local regressions reproduce missing native UUID, JPEG/PNG preview failure and
oversized preview dimensions. Browser tests deliver genuine JPEG/PNG FileLists
through camera/gallery/Files routes with UUID/decoder APIs disabled, verify
original bytes in IndexedDB, reuse the input, and inject provider/storage errors.
They do not emulate actual Android providers or claim real-device retest success.

Mobile Menu View keeps Help, Backup and Sign in/Account directly accessible in
one 44px utility row. The adjacent development overflow reuses the existing
Sample data disclosure, opening its controls above the footer without reserving
another navigation row. Desktop keeps the stacked utilities and Sample data
label. The floating mobile disclosure starts closed even in Sample mode and
closes when entering the mobile layout, so it cannot obscure navigation on
startup. Desktop Sample mode keeps its expanded disclosure. Account, Backup and
Sample data handlers are unchanged.

Bookmarks and Location share lightweight inline rows: Paste a link… and Add
location…. Neither has a header Add action or a permanent empty bordered field.
Tapping a row reveals and focuses its existing editor. Save/Enter uses the same
validation and persistence; Cancel/Escape returns to the compact view. Leaving
an empty entry or submitting it empty also collapses without a write; nonempty
drafts remain open. Saved bookmarks keep the Paste a link… row for adding more,
and saved Location retains its text, Maps link and existing Edit/Remove actions.
Bookmark URL/title editing and desktop use the existing shared paths.

Local checks:

```powershell
node --test tests/mobile-capture.test.js tests/content.test.js tests/file-policy.test.js
node --test tests/ids.test.js tests/mobile-attachment.test.js
python -B tests/browser-check.py --mobile-attachment-only
python -B tests/browser-check.py --image-preview-only --screenshots
python -B tests/browser-check.py --mobile-body-only --screenshots
python -B tests/browser-check.py --contents-swipe-only --screenshots
python -B tests/browser-check.py --mobile-footer-only --screenshots
python -B tests/browser-check.py --bookmark-entry-only --screenshots
python -B tests/browser-check.py --body-actions-only --screenshots
python -B tests/browser-check.py --reparent-drag-only
python -B tests/browser-check.py --mobile-capture-only --screenshots
python -B tests/browser-check.py --media-only
python -B tests/browser-check.py --general-files-only
python -B tests/browser-check.py --content-shortcuts-only
python -B tests/browser-check.py --row-actions-only
python -B tests/browser-check.py --mobile-polish-only
```

Browser checks use fresh isolated local profiles. Capture tests intercept the
system-picker opening and inject files to exercise real local storage; they do
not claim actual camera hardware or native HEIF codec validation.

This branch does not redesign Contents, change Galaxy/Universe visuals, add cloud
activation/files/migration, or change storage v5/Backup v1. Desktop body menus
share the management model, and Paste moves from body actions into Add.
