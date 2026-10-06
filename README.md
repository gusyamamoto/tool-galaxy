# Galaxy

A 2.5D universe for organizing ideas, resources, places and other entries. No
install/build step: serve this directory with `python -m http.server 8000` and
open `http://localhost:8000`. Use the same browser, address and port for saved data.

## Creating and navigating

- **Add:** each hierarchy row has a small **+**, shown on hover/focus on desktop
  and on the selected/focused row in the mobile drawer. It opens Add child, Add files, Add note and Add
  bookmark for that row without selecting or navigating first. Add Galaxy remains
  under More; Search has no global contextual +.
- **Add child:** use **+ → Add child** or the body's right-click menu. Both use
  the same parent context: Galaxy
  → Sun → Planet → Moon → Satellite → Astronaut, then **Add Astronaut** at any deeper level.
  The quick-create dialog asks only for **Name**, then **Create Planet** (or the
  appropriate role). The parent is implicit. Enrich or move the item afterward.
- **Hierarchy:** the left tree derives directly from `parentId`, with no depth
  limit. Galaxies start expanded and other branches closed. Disclosure arrows
  only change the tree. Selecting a body expands its ancestor path, highlights
  its row and scrolls it into view; selecting a row focuses the corresponding
  Galaxy/system/body and updates Contents. Arrow keys navigate/expand/collapse,
  Home/End reach the first/last visible row, and Enter/Space activate it. Files,
  notes and bookmarks live in the Content panel rather than cluttering the tree.
- **Sidebar:** Search sits above the compact tree. Consistent
  32px rows align SVG chevrons and celestial icons, with subtle hover/selection
  states and ellipsis for long names; deep desktop paths still scroll horizontally.
  Mobile rows use 44px height, compressed depth indentation and no horizontal
  scrolling; the selected name can wrap to two lines.
  The small Galaxy title stays in the sidebar above separate Hierarchy and
  Constellations sections. **More** at the bottom holds Add Galaxy, Fit Galaxy, zoom/count information, navigation
  hints and temporary Sample controls. A small Sample label identifies that mode.
  Toggle navigation beside the title to reclaim canvas space; a small reopen
  control remains when it is closed. Drag its
  right edge to resize, or focus the separator and use Left/Right/Home/End.
  Width stays within 180–360px and 30% of a desktop viewport. On narrow screens
  it becomes a drawer that closes after navigation. Camera fitting and focus
  use the space remaining beside the sidebar and any open Content panel; resizing changes
  screen bounds and camera translation without moving world coordinates.
- **Contents:** selecting a tree item, body or search result opens a narrow right
  drawer. It starts hidden and can be closed with its ×, Escape or an empty-canvas
  click. Closing preserves selection and tree state; selecting again reopens it.
  A sticky header shows the name, **•••** beside the title, and a clickable
  ancestor-only breadcrumb below. Files, read-first Notes and Bookmarks follow in
  that order. Metadata is
  available under **••• → Edit info**, **Move / change parent**, and **Delete entry**.
  On mobile it becomes a bottom sheet; opening navigation closes it, and selecting
  from navigation switches back to Contents. Right-click updates selection and
  opens its menu without opening a closed drawer or shifting the camera. Opening
  Contents measures available space without changing the camera;
  it waits for drag release before opening if a pointer is held.
- **Body actions:** right-click a body, Galaxy name, cloud or sidebar row for Add child,
  Add files, Add to Constellation, Create Portal..., Edit info and Delete entry.
  Subtree confirmation remains. The menu stays inside the viewport, closes on outside clicks/Escape,
  and does not start dragging or camera focus. Shift+F10 opens it from a focused
  body; arrows/Home/End navigate its actions.
- **Edit / Move:** Edit info retains name, description and category/label. Move
  reuses the existing single-parent selector. Quick creation only shows Name.
  IDs and existing Portal references stay stable.
  Moving a branch changes its descendants' computed depths/roles together.
  Self/descendant parent choices are excluded, with model
  validation also rejecting cycles. Appearance overrides survive ordinary edits.
- **Delete:** leaves use a simple confirmation. Parents offer an explicit
  **Delete N entries** confirmation naming the entry, child entries and content.
  Cancel makes no graph/storage changes. All descendants and affected Portal
  references are removed together; children are never promoted. All visible entries,
  including starters and migrated examples, are user-owned and deletable. Legacy
  ownership flags are discarded during normalization; storage stays at version 5.
- **Search:** in the sidebar, names at every depth, case insensitive. Matching
  visible tree rows are highlighted; choosing a result opens its ancestor path.
  Each result shows an ancestor path beneath its name to distinguish duplicates;
  Portals and Constellations do not add extra results.
  While results are open,
  matches and their ancestry reveal even at Universe zoom. Choose a result to select it, open Contents and
  smoothly focus. Contents includes clickable ancestor names. Arrow Down reaches
  results, Enter selects the first match, Escape dismisses results.
- **Explore:** wheel zoom toward the cursor, drag space to pan, Fit Galaxy to
  include all regions and content beside the panel. Galaxy/Sun search frames its
  region/system; deeper search focuses the body at a useful close scale.
  Single-click a Galaxy name or cloud to frame its systems, then a Sun or its
  name to frame that system. Focus uses eased camera motion and viewport padding;
  Sun framing centers the Sun. Dragging suppresses the following focus click.
- **Drag:** celestial bodies flow naturally. Dragging influences a preferred
  parent-relative angle and gently bounded orbital region. An extreme drop
  returns gradually toward its parent; release preserves inertia. There are no
  fixed-position controls or physics-status messages.

## Mobile interaction polish

The existing drawer and Content/Constellation bottom sheets remain. Outside taps
and Escape dismiss an open mobile drawer; the dismissal tap never starts a canvas
gesture. Add is visible on selected/focused rows, with the normal desktop hover
route unchanged. Primary icon controls use 44px touch targets; chevrons stay
compact at 32px wide by 44px high. Portal and Constellation actions remain visible.

Portrait sheets have a bounded 58dvh height; short touch landscape retains the
same drawer/sheet model with up to 72dvh. Sheets scroll independently from the
canvas. Menus clamp/flip inside the actual visual viewport and can scroll if
needed. `visualViewport` resize/scroll events update presentation bounds without
camera navigation or physics reheating. A reduced editing header and larger
usable sheet keep inputs reachable when the keyboard leaves little space;
normal read mode restores breadcrumbs and management controls. Native keyboard
behavior should still be checked on iOS/Android.

Semantic-zoom thresholds and label collision/hysteresis remain unchanged. Mobile
ordinary labels that are mostly outside usable bounds are suppressed; interaction
labels get a bounded inward offset. No new gesture architecture, schema or storage
fields were added. Run `python tests/browser-check.py --mobile-polish-only --screenshots`
for 390×844, 430×932 and 844×390 workflows plus 1440px desktop restoration.

## Visual density and restrained motion

Body sizes stay unchanged at 100% zoom: Sun 45.5px, Planet 26px, Moon 16.9px,
Satellite 15.1px and Astronaut 13px visual boxes. Deep bodies have transparent
24px pointer areas (30px on coarse pointers), independent of their visual size.
Body fades retain their existing hierarchy thresholds. Label fades are separate:
Sun .44–.58, Planet .66–.82, Moon .90–1.12, Satellite 1.02–1.30 and Astronaut
1.20–1.52. Selected, hovered, keyboard-focused, current Search and navigation
targets reveal labels; active Constellation bodies retain priority while their
labels still respect readability. Represented Galaxy names remain context labels.

`LabelDensity` batches projected label rectangles at most about every 120ms.
A spatial grid and stable ID/role priorities suppress substantial overlap, with
overlap tolerance and a 240ms clear window before restoring a label. Interaction
targets and represented Galaxy labels are protected. Generic repeated names use
the same rules; there are no word exceptions. Measurements and writes are batched,
and the pass uses existing camera/physics ticks plus one-shot interaction requests,
not a permanent label animation loop. A dense Astronaut family receives a sibling
boost of `min(14, 5*sqrt(max(0, count-3)))` world pixels, adaptive collision padding
and a bounded cluster allowance. Sparse groups/deep chains retain their old bands;
drag preferences still take the released radius/angle directly within soft bounds.

`CosmosMotion` is presentation-only: a 240ms Portal ring cue starts alongside
existing travel; completed travel adds a brief arrival outline. The existing
quintic departure/middle/arrival easing and interruption remain unchanged.
Constellation bodies illuminate over a capped 150ms stagger and 240ms fade,
with a brief restrained outline; existing sparse lines draw over 260ms with at
most 125ms stagger and temporarily stronger stroke opacity. Persistent styling
returns unchanged within 400ms. Large sets cap
individual animation work to 96 bodies/128 edges; the whole line layer also fades
in. Deactivation changes logical state immediately and fades a noninteractive
echo for 140ms. Only newly created bodies materialize (220ms). Newly added Files
settle (180ms), and successful removal can leave a 150ms filename echo outside
the authoritative list; animations never delay file transactions or failures.
Astronaut figures use a tiny drag/release orientation response. Galaxy focus may
produce a relative opacity breath of at most 8% for 260ms when its cloud is visible.

Successful canonical deletion captures one inert rendered-body snapshot, then
commits the existing deletion and cleanup immediately. The snapshot alone
collapses/fades over 240ms; subtree descendants disappear normally. No animation
callback controls data, attachment, Portal or Constellation cleanup. Reduced
motion skips the snapshot. This does not apply to other removal actions.

Comets/UFOs belong only to the far-background DOM. Independent one-shot timeouts
use random delays of 12–35 seconds for comets and 45–120 seconds for UFOs. Each
type schedules its next delay after its pass completes; blocked attempts defer
with a fresh delay. Only one event (including debug previews) can run at a time.
There is no polling/RAF loop for ambient life. Comets have a brighter head and
108px fading tail, with a shallow diagonal arc over 0.9–1.4 seconds. UFOs have an
18px saucer silhouette, three tiny lights and a gentle wobble over 2.8–4 seconds,
with no tail. Events never receive pointer events and remove themselves.
Production passes randomize direction, off-screen start/end offsets, starting
height, trajectory and bounded duration. Comets have steeper vertical travel;
UFOs stay mostly horizontal. Console preview paths and durations stay fixed.
Hidden/unfocused pages, dialogs, visible
Notes/Bookmark editors, file jobs, camera/drag motion and primary cue animations
block new passes. Timers/animations clean up on teardown and resume after a cached
page restore. Reduced motion cancels these effects and preserves static state.
Use `window.debugComet()` or `window.debugUfo()` in the browser console to preview
one immediately visible, deterministic pass. Both return `true` on success,
bypass DevTools focus and busy-state guards, and replace an unfinished debug
preview. Reduced motion, a hidden page or an unavailable renderer return an
explanatory string. They share production rendering/cleanup but use a separate
preview slot, consume no random draws and do not directly change production
timers or counters. If a production event is active, helpers return an explanatory
string; an event due during a debug preview defers under the same single-pass rule.
No domain fields, preferences or schema migration were added; storage stays at 5.

Run `python tests/browser-check.py --density-only --screenshots` and
`python tests/browser-check.py --motion-only --screenshots` in isolated profiles.
Inspect the recipe family at .55/.95/1.3/1.7 zoom, hover/select deep entries,
interrupt a Portal, switch/exit Constellations, add/remove a file, and toggle OS
reduced motion. Ambient test captures can force decorative passes for inspection;
the production scheduler remains rare and random.

## Generic hierarchy and persistence

CRUD operations freeze pending camera animation and cancel deferred startup/Fit
work. Inspector/tree updates during a mutation measure viewport space without
reframing. Add selects its normal seeded placement, expands its ancestor path and
opens Contents without changing zoom. A completely offscreen new/reparented item
gets only the nearest practical same-scale pan; partially visible items keep the
view exactly. Hidden new roles may temporarily reveal their ancestry using the
existing reveal state. Metadata edits preserve physics and camera state without
rebuilding/reheating. Reparent/Add/Delete reuse retained particle identities and
positions with restrained 0.12 reheating instead of the initialization 0.55.

The synchronous mutation pipeline updates model/derived particles, saves, then
publishes nodes, lines, tree, selection and inspector. Subtree IDs are collected
iteratively with a visited set, so arbitrary depth/cycles cannot overflow the
stack. Portal targets and placement parents are checked against the deleted set. Confirmation
is revalidated before mutation; a changed subtree displays its new impact and
requires another explicit click. Unrelated Portals retain their stable reference IDs.
Deleted selection falls back to the nearest surviving ancestor; an unrelated
selection stays selected and a deleted root clears Contents. Recovery never
focuses the camera. Surviving expansions and practical tree scroll are retained.
Normal sidebar/search/Portal navigation and explicit Fit keep their existing
camera behavior. Storage remains version 5, with Sample edits isolated.

Version 5 stores entries with `id`, `parentId`, `name`, `description`, `category`,
`x`, `y`, and optional `appearance`. Role and depth are computed, never stored:

| Computed depth | Visual role | Body scale |
| --- | --- | --- |
| 0 | Galaxy region | Spatial envelope, not a sphere |
| 1 | Sun | 1.75 |
| 2 | Planet | 1 |
| 3 | Moon | 0.65 |
| 4 | Satellite | 0.58 |
| 5+ | Astronaut | 0.50 |

The tree can continue beyond these visual levels. Iterative normalization,
ancestry traversal and layout traversal avoid a fixed maximum depth. Missing
parents/cycles in stored trees are repaired into roots without dropping valid
records. Invalid records disable saving for that session so the original snapshot
is preserved. `category` is only an optional text label, separate from ancestry.

Legacy pairwise Connection records are ignored at the storage boundary and never
enter the active model. A normal save clears those records. Storage stays at
version 5: saves retain only `connections: []` as a compatibility slot for older
readers; this is not application state. Existing exact raw migration backups are
left untouched. Hierarchy, Portals, layout, notes, bookmarks and attachment metadata
remain intact. IndexedDB storage is unchanged.

## Constellations v1

Hierarchy says where an entity lives. A Portal is another doorway to that same
canonical entity. A Constellation is a named collection of entities that matter
together, across any branches, depths or Galaxies. It owns no content and changes
no parent, role or position. An entity can belong to several collections.

The separate **Constellations** sidebar section shares the hierarchy's small
hover/focus/touch `+` language: heading `+` creates an empty, Name-only collection;
row `+` opens a compact canonical hierarchy picker. The same picker is
available in the collection panel. It reuses the sidebar's iterative hierarchy
projection, initially showing Galaxies and their Suns with deeper branches collapsed.
Search temporarily switches to matching entries with ancestor paths; clearing it
restores the expanded hierarchy. Portal placements are excluded.

Picker choices live in one temporary Set. Click, Space or Enter selects/deselects;
expanding branches and searching retain choices. **Add entry / Add N entries**
commits all selected canonical IDs through one existing reference transaction.
Cancel/Escape discards choices. Existing entries are checked, marked **Added** and
cannot be re-added through this picker. Arrow keys browse/expand/collapse; Add is
disabled with no pending choices. Rows are cached, selection updates only the
changed row/count, and Search reveals at most 100 matches per page. No temporary
selection or tree state enters persistence.

Right-click an entity → **Add to Constellation**
to toggle checked memberships or create a new empty collection. Portal IDs never
become memberships. Search results exclude Portal duplicates.
The section always remains present, including when empty. Its separate chevron
collapses only the list; the heading `+` stays available. First creation expands
the list once, while later creation respects manual collapse. Section state and
the first-creation marker share `galaxy:navigation-ui` with sidebar preferences,
outside domain storage; Sample mode neither reads nor writes these preferences.
Collapsing/expanding preserves the lens, active-row styling and camera.

Right-click a Constellation sidebar row (or use Shift+F10 / its quiet `•••` button)
to open a local **Rename / Delete Constellation** menu. This never activates the
collection or switches the right panel. Touch layouts keep the 44px overflow
target visible. The shared context-menu renderer clamps to the visible viewport;
Escape returns focus to the originating row control. Sidebar and right-panel
management invoke the same `openName()` / `openDelete()` workflows and the same
native confirmation dialog. Only deleting the active collection clears its lens.

Click a collection to gently frame its entries using the generic panel-aware
camera and activate a persistent visual lens with restrained outlines and
temporary star-map lines. Inspection, hierarchy navigation, Portal travel, content
editing, panning, zooming and dragging all retain the active lens. Physics and
hierarchy stay intact. At far zoom only collection entries and the selected entry
stand out; unrelated bodies follow normal semantic zoom with extra suppression
(smoothly increasing context between scales .34 and .84, capped at .78 opacity).
Collection bodies retain visibility priority, but labels follow their normal
role readability thresholds; hover/focus/selection reveals a label on demand.
Galaxy names represented by the active collection retain a restrained context
label at far zoom, using existing Galaxy typography. Their IDs derive freshly
from canonical ancestry on activation, switching, membership/parent changes and
deletion. Deactivation clears the set. Unrelated Galaxies keep the existing zoom
and lens behavior; hover/selection never determines which Galaxies are represented.
Only the active collection has geometry: a minimum-spanning tree for up to 128
members, or a bounded spatial candidate tree for larger collections. Both have
exactly n−1 edges. Topology is generated on activation/membership change; endpoints
follow live positions every render/zoom/drag. No edges or pairwise relationships
are stored. Reduced motion uses immediate generic framing.

The right panel has independent overview and entry-inspection modes. The overview
shows the name, entry count, **In this Constellation**, **Add entry**, and entry
overflow actions. An entry click opens its canonical Contents while the lens stays
active. A compact “✦ name active” indicator with its own × remains above Contents;
click its name to reopen the overview without reframing. More in the overview
offers Rename/Delete Constellation. Delete opens a compact native confirmation
dialog outside the Content panel, with Cancel initially focused and explicit
wording that entries are not deleted. Cancel restores header More focus; confirmed
deletion clears an active lens while leaving canonical content, Portals and camera
position intact. Rename retains its existing workflow. Escape, clicking the active row again, the
overview × or indicator × deactivates the lens. Empty-canvas clicks and closing
ordinary Contents may close the panel but keep the lens. Activating another
collection replaces the overlay and frames that collection once. Membership, rename and delete
operations never reframe or reheat physics; only activation intentionally frames.

Persistence remains **version 5**, with an optional `constellations` array of
`{id, name, memberEntryIds, createdAt}`. Old snapshots without it load as empty.
Normalization drops duplicate/dangling/Portal member IDs, retains valid canonical
members and keeps empty collections. Subtree deletion filters all deleted IDs
from every collection in the same snapshot/attachment transaction. Deleting a
collection never deletes entries, Portals or content. Attachments and Rich Content
schemas/backends are unchanged. Active mode and generated lines are session-only.

The isolated Sample includes **Weeknight Meals** (same Galaxy), **Trip & Prep**
(cross-Galaxy) and **Recipe Experiments** (deep Astronauts). Run
`python tests/browser-check.py --constellations-only --screenshots` for isolated
browser checks. `python tests/browser-check.py --constellation-ux-only --screenshots`
checks staged hierarchy/Search selection, touch/keyboard, failed-save recovery,
compact confirmation and refresh persistence against the 187-entry Sample and real
isolated test data. Before committing, inspect these three views at desktop/mobile
sizes; create two collections with a shared entity; drag a highlighted body;
remove a member; delete a collection/subtree; and refresh your own saved data.

## Portals v1

A Portal is a sidebar reference to one canonical entry, stored separately in the
version-5 snapshot's optional `portals` collection:

```json
{ "id": "portal:uuid", "targetEntryId": "original-id", "parentEntryId": "place-id", "createdAt": "2026-01-01T00:00:00.000Z" }
```

Right-click a canonical body/tree row and choose **Create Portal...**. The compact
picker asks where it should appear; search spans canonical entries at every depth,
with ancestor paths for duplicate names and Show more entries for additional results.
Portals can point across Galaxies or back into their own branch. The placement
must be a real entry; duplicate target/parent pairs are rejected. There are no
Portal chains, custom names, Portal-owned content, or expandable target subtrees.
Global search remains canonical-only to avoid duplicate results.

Portal rows use a small accretion-ring icon, the original's current name, and a
tooltip with its real location. They have no celestial role, expand chevron or
entry +. Click/Enter opens the original via the existing animated `focusEntry`
travel path, including cross-Galaxy context zoom and reduced-motion behavior.
Selection, ancestor expansion, Content panel and breadcrumbs all resolve to the
original. Rename/reparent updates labels and locations through stable entry IDs.
No additional Cosmos node or physics particle is created.

Right-click a Portal, or use its row action button on touch/keyboard, for **Go to
original** and **Remove Portal**. Removal changes only that reference. Creation and
removal save metadata before publishing the sidebar, preserve the camera, and do
not rebuild/reheat physics. A canonical subtree deletion removes every reference
whose target **or placement parent** is in the deleted set, in the existing
attachment/metadata transaction; rollback keeps references with the original data.
Dangling, colliding or duplicate references in imported snapshots normalize away
without changing valid canonical content. Old snapshots without Portals still
load; the schema container stays at version 5 and IndexedDB is unchanged.

The temporary Sample includes Chicken Parmigiana and Codex Portals under Food,
and a deep Slow simmer notes Portal under Travel. Sample references never write
real saved entries, references or file bytes. Before committing, create same- and
cross-Galaxy references, follow them, rename/move the original, refresh, remove one
reference, and delete a target/placement branch. Check touch menus and keyboard
navigation, and confirm unrelated content/references remain.

`python tests/browser-check.py --portals-only --screenshots` checks the picker,
leaf/reference rendering, canonical travel/content, rename/reparent, duplicate
handling, persistence and write/deletion rollback, subtree cleanup, keyboard/
reduced-motion/touch navigation and Sample isolation.

## Rich Content v1

Every canonical entry, at every depth, can hold an optional `content` object:

```json
{
  "version": 1,
  "notes": { "format": "plain", "text": "First line\nSecond line" },
  "links": [{ "id": "stable-link-id", "url": "https://example.com/", "title": "Optional title" }],
  "attachments": [{
    "id": "stable-file-id", "kind": "upload", "entryId": "entry-id",
    "filename": "itinerary.pdf", "mimeType": "application/pdf", "size": 1234,
    "storageKey": "opaque-file-key", "createdAt": "2026-01-01T00:00:00.000Z"
  }]
}
```

The contextual **Content panel** shows Files first, Notes second and Bookmarks
third. Empty sections say No files / No notes / No bookmarks. Sidebar + retains
the universal contextual Add menu. Files and Bookmarks also have a quiet heading
`+` shortcut; clicking **No notes** opens the single existing note editor. These
reuse `chooseFiles()`, `editNotes()` and `editLink()`, targeting the selected
canonical entry even after Portal navigation. Heading shortcuts appear on desktop
section hover/focus and use small icons with padded 44px targets on mobile.
They preserve the active Constellation, camera, physics heat and memberships;
storage remains unchanged. Existing Notes have a small edit icon, and files/bookmarks have overflow actions
instead of permanent management buttons. These actions remain visible on touch
layouts and keyboard accessible. Notes display saved plain text; requested editing
opens a temporary textarea with Save and Cancel. Empty text and line breaks are
preserved. Bookmarks show an icon, title and concise destination, retaining the
internal `links` model, stable IDs, optional titles and Add/Edit/Remove handlers.
Their compact editor accepts ordinary domains such as `google.com`, normalizing
them to HTTPS, and permits only valid HTTP/HTTPS destinations. Text and URLs
are never interpreted as HTML. No remote metadata, thumbnails or favicons are
fetched, and bookmarks remain ordinary entry content.

`python tests/browser-check.py --content-shortcuts-only --screenshots` checks the
direct shortcuts, native file-input upload/IndexedDB bytes, canonical ownership,
the retained sidebar Add menu, active-lens/camera stability and touch controls.
Sidebar/context-menu content actions also switch from a Constellation overview
to canonical Contents when that entry was already selected, without reframing or
clearing the lens. Same-entry context menus preserve an unfinished note. File,
bookmark and collection-entry overflow menus share keyboard focus/Escape behavior
and adaptive placement above the trigger near a mobile sheet edge. Opening the
mobile navigation drawer releases hidden Content previews.
`python tests/browser-check.py --consolidation-only --screenshots` covers these
state fixes, consistent copy/menus, duplicate-name Search paths and Sample isolation.

Entry/content metadata uses the existing version-5 localStorage snapshot. Older
entries without `content` still load unchanged; no destructive migration or
container-version change is required. The nested content version, note format,
attachment kind and opaque storage key allow future note formats, external-file
references and another storage provider. No Drive/OAuth/cloud integration is
implemented. Renaming/reparenting preserves content because ownership uses entry
ID, never hierarchy path or celestial role.

`createGalaxyAttachmentStore` provides asynchronous `save`, `get`, `delete` and
`deleteEntries` methods. The local adapter uses IndexedDB database
`galaxy-attachments`, version 1, with a `files` store keyed by opaque file key and
an `entryId` index. Original Blob bytes and small thumbnail Blobs live there,
never in localStorage. The UI receives the adapter by dependency injection and
does not call IndexedDB directly. A startup scan reads only owner/key metadata,
not blobs/previews, so cleanup also finds unreferenced files belonging to an entry.

Supported uploads: JPG/JPEG, PNG, WebP, PDF, TXT and MD. Central limits live in
`galaxyModel.contentLimits`: **10 MiB per file**, **20 megapixels per image**,
**240px thumbnail edge**, **2048-byte text previews**, and **100,000 note characters**.
Image headers provide dimensions cheaply; JPEG orientation is respected.
Only the visible selected Content panel requests previews.
Images display bounded, aspect-preserving thumbnails; explicit Open uses original
bytes. PDFs use the native browser viewer in a new tab. TXT/MD previews are bounded
plain text, and MD opens as text rather than executable HTML or rendered Markdown.
Preview object URLs are revoked on selection/close, and full-file URLs on tab close
or page exit. Choose files through sidebar + → Add files; supported-format/size
information appears only during selection or validation. There are no file drop
targets. File overflow → Remove requires a second
**Confirm remove** click.

Upload/removal coordinates a synchronous metadata write with an abortable binary
transaction. Failed validation, quota or metadata writes leave no broken reference
or orphaned new blob. Subtree confirmation cleans every owner's binary records
through the index, then publishes the existing CRUD mutation; metadata failures
abort file deletion, and failed cleanup leaves entries unchanged. Pending uploads
keep their original owner across selection changes and cannot attach to a deleted
entry. All content actions preserve camera state and add no physics heat.

The Sample has two small notes/link examples and one generated temporary TXT
attachment. Its separate in-memory adapter never opens or changes the real
attachment database. Refresh discards Sample file changes. Image/PDF previews are
covered by real test uploads instead of bundled binary Sample assets.

Browser storage is local to this browser/profile and origin; another port/origin
has a separate store. Quota, private browsing, site-data clearing and browser
eviction can affect availability. Current JSON/localStorage backups contain file
references, **not file bytes**; there is no attachment backup/export or cloud sync
yet. Keep original files for this prototype. Missing files produce a readable
unavailable message rather than silently changing the entry's metadata.

`python tests/browser-check.py --content-only --screenshots` checks notes/links,
all file types, portrait/bounded previews, real native PDF opening, refresh,
metadata/binary quota failure and rollback, rename/reparent, explicit removal,
subtree/unreferenced cleanup, upload ownership/deletion races, ignored file drops,
camera stability, mobile layout, and real metadata/binary Sample isolation.
`python tests/browser-check.py --organizer-only --screenshots` adds contextual +,
name-only creation through deep Astronauts, breadcrumbs and item management,
read-first Notes/Bookmarks, domain normalization and camera-stable content actions.
`python tests/browser-check.py --workspace-only --screenshots` also checks the
Search and row + actions, aligned deep tree, Name label spacing and keyboard submission,
quiet content sections, file/bookmark overflow actions and responsive presentation.
`python tests/browser-check.py --row-actions-only --screenshots` checks row-specific
Add targeting without navigation, hover/focus/touch access, deep indentation and
the title/More header alignment and existing management handlers.

## Navigation travel

Portals use the generic `focusEntry(..., {travel:true})` and `GraphCamera.travelTo`
path. Nearby routes take about 450–650ms, different systems about 800–1100ms,
and cross-Galaxy routes about 1200–1500ms, capped and distance-aware. Longer routes
depart, zoom out for context, travel, then approach and zoom into the canonical
target. Quintic smootherstep provides slow–fast–slow movement and logarithmic
zoom interpolation keeps phases continuous. Wheel, pan, body drag and Escape
interrupt at the visible view. Reduced motion uses immediate focus. Ordinary
hierarchy navigation retains its existing focus behavior.

Descriptions may be empty at every hierarchy depth. Add/Edit trim to an empty
string, persisted-record normalization accepts empty/missing/null descriptions
(missing/null become empty strings), and the existing 1000-character limit and
text validation remain. Only the name is required; storage stays at version 5.

`galaxyStorage` loads versions 1–5 and the old `tool-galaxy:user-data` key.
For pre-v5 data, valid Sun→Planet→Moon parent links and all stable IDs/content are
preserved. A collision-safe **My Galaxy** root contains former Suns and unassigned
entries. Unassigned records become its direct children; no intermediate topics
are invented and free-form labels/links are not used to guess parents. Historical
pins and soft placements restore their saved coordinates first, then normalize to
flowing relative angle/radius influences. A pinned root retains its initial location
without a relative influence. No persistent fixed coordinates enter physics. The
next normal save removes pin metadata; oversized old influences are softly bounded.
This also applies to historical pins in existing version 5 snapshots.

Before replacing an old snapshot, save its exact raw text under
`galaxy:user-data:pre-cosmic-tree`. Existing pre-hierarchy/pre-layout backups and
the legacy key remain untouched. Backup failure prevents replacing the original.
Future/unsupported versions and corrupt snapshots disable saving. The new format
is not readable by older app versions; restoring an older app requires restoring
the appropriate backup too.

`layout` now stores only `{id,parentId,angle,radius}`. Legacy coordinate/pin
records remain readable by compatibility normalization. Relative influences are
independent of camera and travel with a parent naturally. Reparenting clears that
entry's obsolete influence while preserving descendants' valid local influences.
Content, ancestry, appearance and Portals are unaffected by normalization.

The entry/storage schema remains version 5. Navigation adds only the optional
`galaxy:navigation-ui` preference key containing sidebar width and collapse state.
Branch expansion lasts for the open session and never changes the graph. Sample
mode neither reads nor writes this preference, just as it isolates saved entries.

## Layout and forces

One cooling D3 simulation maintains three local levels:

- Galaxies pack in a filled sunflower arrangement, using envelope proxies with
  collision strength **0.65**, 60px clearance, three iterations and gentle home
  attraction **0.018 × alpha**. Existing homes survive graph edits; Galaxy drag
  moves its home to the released location.
- Each Galaxy packs Sun/system footprints locally: collision strength **0.7**,
  24px clearance, three iterations. Suns prefer a filled region around their
  Galaxy, rather than a rigid orbital rail. Sun radial/angular strengths are
  **0.025 / 0.012**. Galaxy regions don't body-collide with their own contents.
- Planets, Moons and Satellites use their parent's preferred orbital band.
  Bottom-up branch envelopes account for descendants. Planet radial/angular
  strengths are **0.10 / 0.025**; Moon/Satellite strengths **0.14 / 0.04**. Radial
  force has a dead zone of `max(12px, 12% of target radius)` and is capped at
  **5 × alpha** per tick. Angular force is tangential and caps its radius factor
  at 80px. This reduces sharp restorative acceleration without extra damping.

A local orbital band uses direct child radii and sibling count, with a bounded
allowance for child branches (28px inside a Sun, 14px deeper). Descendant
envelopes still inform system collision, but do not recursively inflate every
parent's orbital radius. Sibling spacing uses the same 1.35/1.15 clearance
factors as sibling separation; wide families expand while sparse ones stay small.
The base diameter is 26px desktop / 24px mobile. At 100% zoom the desktop body
diameters are Sun 45.5px, Planet 26px, Moon 16.9px and Satellite 15.08px (previously
51.3 / 38 / 25.08 / 16.34px). Planet and Moon diameters are over 30% smaller.
CSS uses base diameter × role scale × native render scale; there is no body-size
floor at 100%. Labels retain their fonts and width budgets. Planet rings and
Satellite SVGs use proportional dimensions. Selection outline offset is 2px,
previously 5px, so a selected small body does not acquire a disproportionate halo.
Collision body radii are half the new diameters, plus the existing 12px clearance.
Normal local clearance is 66px for Planet families, 56px for Moon families and
38px deeper; the sibling-count term uses `(local + 26px) × clearanceFactor /
sin(π / siblingCount)`. The larger of minimum and count-based bands wins.
The sample Sun→Planet band increases from 118.65px to 129.75px, Planet→Moon from
83.54px to 91.45px; Food's nominal region radius grows only about 2.2%.
A leaf-only two-Planet band is 104.27px; eight Planets use 146.47px.
Descendant allowances remain capped at 28px/14px, preventing recursive inflation.

A drag chooses a relative angle **and radius**: `clamp(releasedRadius, min, max)`.
The former 65% default / 35% released blend is removed. The same clamped preference
is used directly by the force after release and reload. For Planets and Moons,
the maximum is 2.4 × their adaptive default band; Satellites use 1.9 × their band.
The minimum is parent body radius + child body radius + 24px collision clearance;
the maximum is at least minimum + 24px. Suns retain their existing Galaxy packing
range, maximum default band + max(60px, 25% of system envelope), minimum zero.
For the sample family, Planet range is 59.75–311.4px, Moon 45.45–219.48px,
Satellite 39.99–107.369px. These are soft preferred limits, with a free-floating
dead zone of max(12px, 12% of preferred radius), not rigid coordinate constraints.
Saved oversized preferences are bounded by the force; new preferences are bounded
before saving. A reasonable outward drag remains in its new region; only extreme
drops return toward the outer boundary. Bodies drift and yield to collisions.
Parent translation carries
descendants at any depth; only an independently held drag stays under its pointer.
Beyond the soft limit and radial dead zone, a local return force adds 0.008 times
the excess distance, capped at 4px per tick. It keeps alpha at least 0.06 only
while a Flowing outlier needs to return (over 12px excess), then normal cooling
resumes. Active drags skip attraction. Release preserves inertia and
does not directly add heat. These are local forces; global repulsion is unchanged.

Sibling separation remains parent-local and tangential: radius sums +24px,
multiplier 1.35 for Planets or 1.15 for deeper bodies, strength 0.06 capped at
`2 × alpha` per pair. All released siblings are movable; held drags have zero mobility.
Local system repulsion remains `-radius × 1.1`. Body collision remains strength 1,
12px clearance, four iterations. Semantic links have zero force strength everywhere;
they cannot alter local systems or pull remote Galaxies together.

Normal velocity decay stays **0.42**, alpha decay **0.032**, alpha minimum
**0.002**. Moving a drag reheats to at least **0.22**, active alpha target **0.10**;
release preserves velocities/alpha and sets the last target to zero. Structural
changes reheat to 0.55; resize to 0.3. Reduced motion uses alpha
decay 0.12 and velocity decay 0.6. Settled/hidden/dialog states stop or pause work.

## Native rendering, semantic zoom and appearance

Bodies and names are projected into unscaled screen layers. Dimensions and fonts
are repainted at native resolution during zoom. Only SVG hierarchy paths/orbit guides
use the scaled world transform. Existing defined spherical shading/seeded texture
and restrained Sun glow remain. Procedural Galaxy SVG regions are built once per
identity; their names stay in the native text layer.
Galaxy clouds use filled radial-gradient concentrations with soft dust, luminous
cores and organic silhouettes. There are no outlined spiral/S strokes. Each
deterministic visual is smoothed once into a cached 512px canvas and reused;
cloud opacity uses a squared smooth fade, normally from 0.38 to 0.72 (previously
0.58–0.95). Universe opacity stays 0.92; by system view clouds are very faint and
close detail hides them completely. Each cloud adapts to usable `physics.bounds`
after the sidebar/inspector, plus its projected width/height relative to that
canvas. A short canvas side of 420–900px smoothly advances fade onset by up to
0.03 and completion by up to 0.04. Projected coverage from 0.8–2.2 canvas lengths
advances completion by another 0.04. This uses size, never position or overlap:
panning/floating cannot pulse opacity. Existing footprint dead bands/easing
stabilize size changes. Galaxy names, breadcrumbs and sidebar identity remain
independent of cloud opacity. No body fade ranges or tier boundaries change.
`cosmos-view.js` derives visual footprints from normal parent-relative positions
of contained Suns and descendants, including the Galaxy anchor. For presentation
only, distant offsets are limited to 1.4 times the preferred band plus local
clearance (40% of the system envelope +60px for Suns; body radius +32px deeper).
This bounds a temporary outlier without changing physics or saved coordinates;
its movable subtree keeps its normal local shape. Universe Fit includes actual
coordinates of distant dragged bodies while they gradually return.
Bounds have 35%
soft margin plus 144px; empty regions have a 320×280px minimum. Measurements run
at most four times per second while floating. Root translation carries the cloud
immediately; local footprint changes ease over 650ms, with small-change dead
zones (1.5% center / 4% size, at least 16 world pixels). Projected sizes round to
4px and translations to half-pixels to avoid paint churn. Fixed-size canvas
surfaces are projected with transforms; their backing pixels never resize or
redraw during motion/zoom. Visible clouds may reuse a compositor layer during
motion; hidden clouds receive no hint. A 160×140px screen minimum keeps small Galaxies legible
at fitted Universe zoom. Galaxy and Sun focus frame normal member positions
with 36px viewport padding, capped at 58% and 82% respectively. Sun bounds are
symmetric around the Sun. Very large systems or narrow viewports can require a
lower fitted scale. Galaxy names remain native,
14–16px, high contrast and anchored over their cloud.
Offscreen bodies/clouds are hidden from paint and compositor hints; their world
positions and physics continue normally. Invisible hierarchy lines use
`display:none` while retaining their derived hierarchy edges and coordinates.
Surface noise fields use seeded procedural textures, generated lazily in idle
time for visible natural bodies from 68% zoom. Reusable 64–1024px tiers match physical display
pixels; grain, terrain and stable orientation share one overlay. This avoids filter rasterization
and oversized texture sampling during motion/display-scale changes. Translucent
highlights/shadows avoid a live blend group, and short blob URLs keep large image
data out of mutable inline styles. Spherical lighting, edges, rings and labels
remain native.

| Scale | Priority |
| --- | --- |
| Below 0.45 | Universe: Galaxy clouds/names; Suns begin a soft fade at 0.43 |
| 0.45–0.58 | Galaxy: Suns and Sun names; deeper levels hidden |
| 0.58–0.78 | Solar system: Planets, then Moons and Satellites appear |
| 0.78+ | Close: complete hierarchy bodies by 0.79; labels finish slightly later |

Visibility uses smoothstep windows across tier boundaries, plus native size
interpolation from 72% to 100% and a short opacity transition. Body fade ranges:
Sun **0.43–0.58**, Planet **0.58–0.68**, Moon **0.68–0.76**, Satellite
**0.70–0.79**. Label fades: Planet **0.62–0.72**, Moon **0.73–0.83**, Satellite
**0.76–0.88**. No body has a residual opacity floor. Invisible bodies become
inert so they cannot intercept dragging, clicks or keyboard focus; their physics
continues normally. Context dimming multiplies visibility instead of overriding
semantic hiding. Hidden clouds/bodies receive no compositor hint or texture work.

Selection and ancestry highlighting never override scale-based hiding. Open
search results temporarily reveal matches/ancestry; focus reveals only its target
and ancestors during camera navigation. This explicit reveal ends when the
transition settles, including reduced motion, and is cleared immediately by
manual wheel zoom, panning, dragging, Fit, or search dismissal. Search text and
selection are preserved. Reopening search or focusing again can reveal a deep
entry again. Ordinary
hierarchy lines are invisible. Deep selected ancestry, stretched selected
branches and dragging may show very subtle context lines.

`appearance.js` hashes stable IDs (FNV-1a) and resolves optional overrides:

- Galaxy: **spiral, barred spiral, elliptical, irregular**, with stable
  orientation, flattening, density and muted blue/violet/teal/rose palettes.
  These are spiral-like cloud, elongated/barred cloud, elliptical cloud and
  irregular nebula distributions; variation is filled silhouette/core/dust,
  never line-art arms.
- Planet: **rocky, gas giant, icy, oceanic, ringed, desert**. Only the ringed
  default archetype has rings; approximately one in six automatic Planets.
- Sun: warm/golden. Moon: rocky/icy/earthy.
- Satellite (depth 4): **twin-panel, dish, probe, station**. Small
  native SVG silhouettes use metallic bodies, muted panels and restrained antenna
  strokes. They fit inside the existing Satellite size, smaller than a Moon, with
  stable ID-based archetype/orientation and optional archetype/palette overrides.
  They use no spherical surface, procedural textures, filters, or per-frame redraw.
- Astronaut (depth 5 and deeper): **floating, angled, extended-arm, compact-eva**.
  Neutral white/grey EVA figures have a dark visor, small backpack and restrained
  limbs. Stable ID hashing chooses the pose and tilt; compatible appearance
  overrides remain supported. A 24px SVG viewBox scales into a 13px body at 100%
  zoom, smaller than Satellite (15.08px) and Moon (16.9px). No raster/filter work.

Astronaut branches use compact local placement rather than additional orbital
bands. Default parent clearance is about 35px under another Astronaut and 40px
under a Satellite, with small golden-angle sibling offsets. Local radial/angular
strengths are 0.045/0.012, with a wider resting slack, subdued drift and weaker
repulsion. Cartesian sibling separation and small collision margins prevent
stacking. Drag release preserves the chosen angle and an adaptive clamped radius
using the existing layout record. Each Satellite branch has a soft outer cluster
boundary sized as 54 + 18 × sqrt(Astronaut count), never recursive depth; the
envelope stops accumulating new orbital layers. Reasonable placement floats
freely; only excessive extension sustains local return motion until it can cool.

Astronaut parent-child edges render as low-contrast, solid quadratic SVG tethers
with deterministic slack (one path per existing hierarchy edge). They update
from live world endpoints on physics, drag and camera changes, with a 0.65px
screen-space stroke. They are noninteractive and remain hierarchy edges, separate
from ordinary hierarchy context cues. Astronaut bodies fade in at 0.74–0.86,
labels at 0.82–0.96 and tethers at 0.78–0.96. Search/focus can temporarily reveal
the required ancestry and tethers at far zoom; ordinary zoom-out hides it again.
Existing tiers and other body fades remain unchanged. Stored depth-5+ entries
automatically derive Astronaut roles; schema 5, IDs, parents, Portals, content
and appearance metadata stay intact without a new migration.

The model already preserves `appearance` for a future small Edit Appearance UI:
`{mode:"manual",archetype:"oceanic",rings:true,palette:"teal"}`. Allowed palettes
are amber, blue, teal, violet and rose. `{mode:"auto"}` returns to deterministic
defaults. Invalid/role-incompatible choices fall back safely. Appearance is
independent of subscription/features. No customization UI is added yet.

## Development sample and tests

**Load Sample** opens 187 temporary entries: four Galaxies (Work, Food,
Travel, Personal), eight Suns, 24 Planets, 48 Moons, 96 Satellites and seven
Astronauts, including a depth-eight recipe branch with several Astronaut siblings
and three useful Portal references. Normal interactions use the same model/renderer/
physics. Sample mode neither reads nor writes real saved data. Leave Sample or
refresh returns to it; the activation query is removed immediately.

Run unit tests in PowerShell: `node --test (rg --files tests -g '*.test.js')`.
Run isolated real-browser regression/visual checks:

`python tests/browser-check.py --crud-only --screenshots` checks blank Description
at every role and deeper Astronaut, reload/clearing, Add/Edit/Delete camera state
at Universe/Galaxy/close zoom with sidebar and inspector open/closed, deferred Fit
cancellation, same-scale offscreen reveal, metadata edit physics stability,
save-before-sidebar order, reparented hierarchy, counted subtree confirmation/
Cancel, Portal/attachment cleanup, selection/tree/inspector recovery, stale
confirmation, starter/migrated branches, persistence, explicit Fit and Sample isolation.

`python tests/browser-check.py --astronaut-only --screenshots` checks contextual
creation through depth eight, sidebar icons, sibling/cluster clearance, curved
tether geometry through drag/zoom, search reveal and focus, old deep Satellite
metadata on refresh, stable poses, Portal navigation and persistence,
Sample isolation, mobile presentation and projection cost.
`python tests/browser-check.py --screenshots`. The standard-library harness
launches headless Chrome/Edge with a temporary profile and local HTTP server;
it never accesses your normal browser profile. Screenshots are retained in the
printed OS temporary directory. `GALAXY_BROWSER` can select the executable.
`python tests/browser-check.py --arrangement-only --screenshots` measures actual
100% screen-space body sizes, collision radii and the selection halo. It tests
Planet and Moon pointer drags at 1.5× and 2× their original resting radii, then
2000px extremes, measuring released preferences and settled radii/angles. It
retains screenshots and `arrangement-report.json`. Add `--capture-baseline` before
tuning to capture only the reference sizes and matching fixed-position screenshot.
Use `--sizes-only` for the desktop/mobile dimension checks without repeating drags.
Use `--extremes-only` to isolate the two extreme-return cases and their recovery previews.
`python tests/browser-check.py --migration-only` additionally exercises a full
saved v4 family with soft positions/pins, invalid records and future-version
overwrite protection.
`python tests/browser-check.py --cloud-fade-only --screenshots` checks early fade
on desktop, laptop and narrow canvas with sidebar/inspector open, strong Universe
clouds, faint system clouds, independent Galaxy identity, smooth actual zoom in/
out, translation stability and cached pixel reuse. It retains comparison views
and measured opacity values.

`python tests/browser-check.py --navigation-only --screenshots` checks all three
contextual creation paths through depth six, synchronized tree/body/search
selection, branch/sidebar collapse, pointer/keyboard resizing, viewport Fit,
right-click actions and keyboard dismissal, mobile navigation and Sample isolation.
`python tests/browser-check.py --interface-only --screenshots` checks control placement,
hidden/contextual Contents, Escape and empty-click dismissal, camera-stable edge selection,
unchanged world coordinates through panel transitions, minimum sidebar width, all
contextual creation paths, drag camera stability, management More, desktop/laptop/mobile
layouts and panel-aware Fit. Its screenshots include the clean and immersive canvas.
The migration-only suite pauses fixtures before their first physics frame to
verify exact initial coordinates, then exercises normal save, v4/v5 pin normalization,
Portal references through content edits/reparenting/reload, and corrupt/future-data safeguards.
Motion/settling assertions remain in the physics and full browser regressions.
`python tests/browser-check.py --performance-only` profiles active/idle rendering,
display-scale changes and individual paint layers using the isolated sample.
Add `--software-rendering` to profile without GPU compositing separately.
`python tests/browser-check.py --visual-only --screenshots` checks the 187-entry
nebula sample, all zoom tiers, zooming both directions, deep selection/search,
Food/Work/Travel zoom-out without deselection, Galaxy cloud/name and Sun
body/name clicks, all four artificial Satellite silhouettes, interrupted focus,
an extreme Planet drop, stable appearances after an actual reload, cached images,
a dragged Sun's cloud containment and Galaxy-view motion cost. It also captures the
refined local hierarchy, two- and eight-Planet systems, and sparse-system drag recovery.
The full regression checks normal-view motion and projection budgets.
The refinement is checked by unit, interface, navigation, migration, full-browser
and focused visual suites. Interface checks cover panel behavior, gesture stability, control placement
and layouts from 320px mobile to large desktop.
The full regression measures baseline motion and reports display-scale stress
separately; the focused visual suite measures Galaxy-cloud motion. Headless
timings depend on the machine. Verify motion on a native high-DPI display too.

Tests cover generic/deep/cyclic trees, old schema backups including quota failures,
relative-position migration, deterministic/overridden appearance, local forces,
release inertia, overlapping siblings, legacy pin normalization, native zoom rendering, every body
drag, CRUD/reparenting, deep search, responsive controls and sample isolation.

Before committing, try the new Universe→Galaxy→Sun navigation with your own data,
check migrated My Galaxy organization, drag parents/children at several zoom
levels and refresh. Verify that formerly pinned bodies move naturally while their
content and hierarchy survive. Focus Food, Work and Travel, zoom to 80%, then back
to Universe without changing selection; every descendant should fade. Search a
deep Astronaut and repeat, including interrupting its focus transition. Check
name/cloud/Sun clicks, far-drop recovery, sparse/wide systems, and stable Satellite
variants after reload. Verify Galaxy region prominence and the quieter
orbital guides on your display. Compare two- and eight-Planet families, and
check Moon/Satellite clearance and label readability on mobile. Very deep/wide
trees have larger footprints, so Fit may zoom far out. Galaxy clouds are spatial
cues rather than hard containers or an astronomical simulation. Large production
datasets beyond this sample still need profiling. An appearance picker is deferred.
Before committing the interface changes, also check long names and deep branches
in your own hierarchy; create children through the contextual + and right-click;
collapse/reopen and resize the sidebar; close/reopen Contents and open More;
click empty space and press Escape; Fit with both panels open or closed; use keyboard tree
and menu navigation; and check the mobile drawer and refresh persistence. Load and
remove the temporary sample, then confirm your saved hierarchy and sidebar preference
are restored.
For the Content panel, upload an image, PDF and text file; open each, edit and
cancel a note, add `google.com` as a bookmark, then refresh. Check ancestor
breadcrumbs, Edit info and Move, camera stability during content edits,
and scrolling/closing the mobile sheet. Confirm file and subtree deletion cleanup.
At extreme fitted zoom on narrow screens, temporarily revealed search labels can
crowd together; focus and the ancestry breadcrumbs restore local reading.

`python tests/browser-check.py --no-connections-only --screenshots` verifies legacy
record disposal, no pairwise UI/lines, retained tethers and hierarchy zoom, Portal
travel/interruption, canonical content, subtree Portal/file cleanup, camera
stability and Sample isolation. Before committing, open existing saved data with
legacy records; follow a cross-Galaxy Portal, interrupt travel, edit content,
delete a subtree, refresh, and check the mobile header and Astronaut tethers.
Constellations use temporary collection overlays independently of Portal travel.
