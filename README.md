# Galaxy

A 2.5D universe for organizing trips, recipes, photos, projects and other items. No
install/build step: serve this directory with `python -m http.server 8000` and
open `http://localhost:8000`. Use the same browser, address and port for saved data.

## Creating and navigating

**New Galaxy** offers Blank (default) and five small starters. The name stays
editable; changing the starter preserves a name you have already typed. A starter
creates ordinary canonical items in one existing CRUD operation, with no saved
template flag, protected content or new storage structure:

| Starter | Initial child items |
| --- | --- |
| Trip | Places, Accommodation, Transportation, Food, Packing, Documents |
| Home project | Ideas, Tasks, Materials, Budget, Photos |
| Class / course | Notes, Assignments, Resources, Exams |
| Recipes | Favorites, To Try, Weeknight, Baking |
| Photos / inspiration | Favorites, Ideas, Collections |

On desktop, supported files or web addresses can be dropped onto a body, Galaxy
cloud or canonical sidebar row. A quiet outline marks the target. Files reuse
the existing validation, IndexedDB/attachment-store transaction and cleanup;
addresses reuse bookmark normalization. Drops select/show the destination
without camera framing, changing physics, or altering an active Constellation.
The Files and Bookmarks actions remain the keyboard/mobile alternatives.
During an external file/link drag, holding over a collapsed canonical sidebar
row for 600ms spring-opens it without selecting it or moving the camera. Repeat
to browse deeper; branches remain open in the ordinary sidebar expansion state.
Leaving, dropping or cancelling clears the pending timer and highlight. Ordinary
hover, body dragging and internal UI drags cannot trigger expansion. The tree
also scrolls in 12px steps near its 28px edge zones, throttled to one step per
50ms drag-over event; there is no background scroll loop. Native wheel scrolling
remains available. `--spring-drop-only` checks deep navigation and cleanup.

Images show stored thumbnails: one image uses a larger compact preview, while
two or more share a two-column thumbnail layout. Documents retain normal rows.
Open and secondary Remove actions use the existing handlers; full images are
not decoded for thumbnails. Notes recognize `- [ ]` and `- [x]` lines in read
mode as clickable checkboxes. A toggle changes only that line's marker in the
same plain text. The regular editor, IDs, storage version 5, Portals and
Constellation references remain unchanged. No remote bookmark fetching is used.

Run `node --test tests/everyday.test.js` and
`python tests/browser-check.py --everyday-only --screenshots` to check starter
CRUD/persistence, canonical drops, gallery rendering and touch checklists.

- **Add:** each hierarchy row has a small **+**, shown on hover/focus on desktop
  and on the selected/focused row in the mobile drawer. It opens Add item, Add existing item, Add files, Add note and Add
  bookmark for that row without selecting or navigating first. New Galaxy remains
  under the Universe heading +; Search has no global contextual +.
- **Add item:** use **+ → Add item** or the body's right-click menu. The parent
  is implicit and creation asks only for **Name**. Depth derives the internal
  Galaxy → Sun → Planet → Moon → Satellite → Astronaut visual role automatically;
  users never choose those roles. Enrich or move the item afterward.
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
  scrolling and clean single-line truncation. Full names remain available through
  accessible labels, row titles and the selected entry's Content header.
  The small Galaxy title stays above Search and three independently collapsible
  sections: Universe, Constellations and Archived Galaxies. Each heading and its
  chevron toggle only that section. Universe + opens the existing New Galaxy /
  Starter flow; Constellations + creates a collection. Both reveal on hover/focus
  on desktop and remain visible with 44px targets on touch. Archive has no + and
  its section disappears when empty. The existing navigation preference object
  stores `universeCollapsed`, `constellationsCollapsed` and `archivedCollapsed`
  separately from overall sidebar collapse/width. Section collapse preserves
  selection, content/drafts, camera, lens, physics and internal branch expansion.
  The generic More container, sidebar Fit, permanent count/zoom diagnostics and
  pan/zoom instructions are removed. Canvas Fit uses the same existing handler;
  internal count/zoom elements remain hidden for debug/test access. A separate,
  quiet Sample data disclosure at the bottom exposes Load Sample when requested
  and opens automatically in Sample mode with Leave Sample. Sample changes never
  write real data or navigation preferences.
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
  that order. Item management is
  available under **••• → Rename**, **Move / change parent**, and **Delete item**.
  On mobile it becomes a bottom sheet; opening navigation closes it, and selecting
  from navigation switches back to Contents. Right-click updates selection and
  opens its menu without opening a closed drawer or shifting the camera. Opening
  Contents measures available space without changing the camera;
  it waits for drag release before opening if a pointer is held.
- **Body actions:** right-click a body, Galaxy name or cloud for Add item,
  Add to Constellation, Rename and Delete item. The sidebar row **+** keeps the
  complete organization/content shortcuts, including Add existing item. Item-level
  sidebar context menus also expose it; all canvas and Galaxy-level context menus
  omit this advanced placement action.
  Subtree confirmation remains. The menu stays inside the viewport, closes on outside clicks/Escape,
  and does not start dragging or camera focus. Shift+F10 opens it from a focused
  body; arrows/Home/End navigate its actions.
- **Rename / Move:** Rename is a compact Name-only dialog. Stored legacy
  description/category values remain intact and hidden; descriptive content can
  be written in Notes. Move reuses the existing single-parent selector. Quick
  creation only shows Name. IDs and linked placements stay stable.
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

## Archive and restore Galaxies

Whole Galaxies offer **Archive Galaxy** in their canvas/sidebar context menu and
Contents **More** menu, before Delete. A Cancel-first confirmation explains that
items leave the active Universe and can return later. Normal item deletion is
unchanged. **Archived Galaxies** below Constellations is initially collapsed; each row shows its
name and a keyboard/touch-accessible Restore button. Permanent deletion from this
section is deferred; restore a Galaxy to use its existing Delete action.

The version-5 snapshot keeps every canonical item, file descriptor, note, bookmark,
Portal and Constellation reference in the original fields. An optional
`archivedGalaxies` array stores `{galaxyId, archivedAt, expandedIds}`. There is no
migration, duplicate content, file-store change or deletion of IndexedDB bytes.
Older snapshots default to an empty archive. Active graph/sidebar/search/pickers
exclude archived subtrees and linked placements whose endpoints are archived.
References remain stored and return with their original IDs on restore.
Constellations retain archived memberships, show their archived count, and use
only active members for framing and overlays. Normal reference edits validate
against the combined canonical data, so they cannot silently prune archived IDs.

Archive and restore save metadata before publishing the active-view change. A
storage failure leaves the Galaxy in its previous state. In-flight owned file
actions and open owned note/bookmark editors must finish before archive. Unrelated
open drafts, active collection lenses and camera state are preserved. Positions,
relative layout preferences, appearance and branch expansion state are retained;
restored bodies start at saved positions, then use normal soft settling.

Archive takes a lightweight presentation snapshot of the visible cloud and bodies.
A 780ms gravitational collapse contracts and gently curves the cloud/body group
inward, with two thin curved energy arcs. Brightness concentrates into a 22px
luminous core, then compresses into a 10px dark point which disappears. Labels
and hit areas are excluded; there are no particles, flashes, shake or live blur
filters. Other Galaxies and saved coordinates do not participate. Restore takes
560ms: a point and expanding arcs precede an outward cloud materialization, then
Sun/Planet/Moon/Satellite/Astronaut groups emerge progressively into their saved
positions and crossfade to the normally settling live bodies. Reduced motion uses
a 110ms archive fade/scale-down and a 140ms restore fade/scale-up without energy
effects. Visual work never gates persistence. Ghosts/animations clean up on
completion, camera changes, resize, page hiding and motion-preference changes.

Run `node --test tests/archives.test.js tests/storage.test.js` and
`python tests/browser-check.py --archive-only --screenshots` for deep trees,
confirmation/Cancel, storage failures, files/notes/bookmarks, links, collections,
refresh/restore, empty-Universe/multiple archives, positions, mobile, reduced motion,
corrupt-data protection and Sample isolation. Inspect the disappearance on a native
display and with a large real Galaxy before committing.

## Mobile interaction polish

Navigation is labeled **Universe**; the canonical hierarchy is unchanged. On
touch layouts each Constellation row has one overflow button for Add entry,
Rename and Delete Constellation. The section-level creation + remains, and
desktop retains its faster row +. Empty Bookmarks accepts a URL directly in
“Paste a link…”: Enter saves, or use the small Save action shown for valid URLs.
Titles are optional; untitled bookmarks display their domain. Existing bookmarks
retain the read-first list and secondary edit/remove actions. Storage stays v5.
On mobile the empty bookmark field has a 38px visual height with 16px text, inside
a 44px padded tap area. Empty-section spacing is tighter, with no Save action
space until a valid URL is entered. Desktop field sizing remains unchanged.

Wheel zoom uses normalized pixel deltas with a 0.0024 response (previously
0.0018), a 1.15 multiplier for Ctrl-wheel trackpad pinch, and a capped 0.42
logarithmic step. Touch pinch uses a 1.18 distance-ratio exponent while preserving
its midpoint anchor and camera limits. Double-click/double-tap focuses an entity
at a readable scale through the existing interruptible camera helpers. Two touch
taps must hit the same entity within 320ms and 24px; drag/pinch clears that intent.
Single taps select immediately. Desktop landmark selection is immediate too,
with its single-click camera focus waiting 320ms to distinguish double-clicks.
Compact + / minus / Fit controls sit at the usable canvas's bottom-left on larger
layouts and are hidden on phones. Fit shares the existing Fit Galaxy handler.
Reduced motion makes focus navigation immediate.
The visual hierarchy refinement adds closer inspection targets: Moon 180%,
Satellite 220%, Astronaut/deeper 240%. The upper zoom limit is now 300% (previously
240%), leaving headroom after deep focus. Wheel/trackpad gain, pinch midpoint
anchoring, interruption and Fit remain unchanged. Galaxy cloud/label fading,
label collision suppression and Constellation visibility keep their existing rules.
`python tests/browser-check.py --body-hierarchy-only --screenshots` checks native
sizes and fixed-scale overview/system/deep desktop and phone views;
`--body-hierarchy-baseline` captures matching views before tuning.

The existing drawer and Content/Constellation bottom sheets remain. Outside taps
and Escape dismiss an open mobile drawer; the dismissal tap never starts a canvas
gesture. Add is visible on selected/focused rows, with the normal desktop hover
route unchanged. Primary icon controls use 44px touch targets; chevrons stay
compact at 32px wide by 44px high. Portal and Constellation actions remain visible.
Chevron glyphs rotate inside their hit areas so expanded branches do not overlap
neighboring icons/text. Closing navigation clears all floating menus.

Content sheets use their natural content height with compact mobile spacing:
empty/light entries occupy roughly 38–45% of the tested portrait viewports;
moderate content grows naturally and long content caps at 74% of the available
visual viewport. The sticky header and internal scrolling remain. The active
Constellation strip has less surrounding spacing while retaining 44px touch
targets. Constellation overviews retain their 58dvh portrait / 72dvh short
landscape limits. Sheets scroll independently from the
canvas. Menus clamp/flip inside the actual visual viewport and can scroll if
needed. `visualViewport` resize/scroll events update presentation bounds without
camera navigation or physics reheating. A reduced editing header and larger
usable sheet keep inputs reachable when the keyboard leaves little space;
normal read mode restores breadcrumbs and management controls. Native keyboard
behavior should still be checked on iOS/Android.

Semantic-zoom thresholds and label collision/hysteresis remain unchanged. Mobile
ordinary labels that are mostly outside usable bounds are suppressed; interaction
labels get a bounded inward offset. Semantic thresholds, body sizes, data/schema
and storage remain unchanged.

Two canvas touches pinch around their midpoint using the existing camera API and
zoom limits. Moves coalesce into at most one input-driven animation frame;
there is no polling or permanent gesture loop. Pinch hands off existing touch
captures, preserves a real drag already made, and suppresses trailing tap events.
A fresh touch is immediately usable. Single-finger touch drag/pan use an 8px
intent threshold (desktop remains 3px); taps select on release. Panels, menus and
modals stay outside the canvas gesture scope. Escape cancels a pinch before
deactivating a lens; blur, page hide, viewport changes and modal opening release
touch state. Production ambient events treat pinching as busy; their cadence and
visuals are unchanged. Reduced motion preserves functional pinch zoom.

Run `python tests/browser-check.py --mobile-polish-only --screenshots` for 360×800,
390×844, 430×932 and 844×390 workflows plus 1440px desktop restoration.
`--navigation-refinement-only --screenshots` checks the touch collection overflow,
direct URL bookmarks, double-tap/drag/pan handoff, desktop zoom controls and
interruptible focus navigation at the same viewport sizes.
`--sheet-sizing-only --screenshots` checks empty/light/moderate/long content,
sticky-header scrolling, active-lens inspection and keyboard viewport reduction.

## Visual density and restrained motion

At 100% desktop zoom the body boxes are Sun 52px, Planet 28.6px, Moon 13.52px,
Satellite 9.88px and Astronaut 7.28px. Planet diameter is over twice Moon diameter.
Planets have richer color, surface contrast and a restrained glow; Moons have
muted stony lighting and faint craters. Mechanical Satellites and human Astronaut
silhouettes stay distinct. Planet/deeper bodies have transparent pointer areas
of at least 24px (44px on coarse pointers), independent of their visual size.
Body fades retain their existing hierarchy thresholds. Label fades are separate:
Sun .44–.58, Planet .66–.82, Moon .90–1.12, Satellite 1.02–1.30 and Astronaut
1.20–1.52. Selected, hovered, keyboard-focused, current Search and navigation
targets reveal labels; active Constellation bodies retain priority while their
labels still respect readability. Represented Galaxy names remain context labels.

`LabelDensity` batches projected label rectangles at most about every 120ms.
A spatial grid and stable ID/role priorities suppress substantial overlap, with
overlap tolerance and a 240ms clear window before restoring a label. Interaction
targets and represented Galaxy labels are protected. Generic repeated names use
the same rules; there are no word exceptions. Measurements and writes are batched. Label dimensions are cached by name, role,
font, Constellation membership and viewport mode; moving labels project those
dimensions from native body centers instead of forcing layout every pass.
The pass uses existing camera/physics ticks plus one-shot interaction requests,
not a permanent label animation loop. A single deferred pass measures the final
camera view if it lands inside the throttle window after motion stops. Compact EVA
labels reserve an extra 2px of collision clearance; priorities, overlap tolerance
and restoration hysteresis remain intact. A dense Astronaut family receives a sibling
boost of `min(14, 5*sqrt(max(0, count-3)))` world pixels, adaptive collision padding
and a bounded cluster allowance. Sparse groups/deep chains retain their comfortable local spacing;
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
| 1 | Sun | 2 |
| 2 | Planet | 1.1 |
| 3 | Moon | 0.52 |
| 4 | Satellite | 0.38 |
| 5+ | Astronaut | 0.28 |

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

## Add existing item

Use a sidebar row's **+ ? Add existing item** to make an item you already have
available there too. The destination is known from the row; the compact picker
browses the canonical hierarchy and searches by name with ancestry context.
Select one item, then Add item. Selection can be reversed before confirmation
and survives searching/expanding. Existing linked placements and ordinary items
already under the destination are marked **Already here** and cannot be duplicated.
Only canonical items appear as choices. Keyboard arrows, Space/Enter, Escape and
comfortable touch targets follow the same pattern as the Constellation picker.

Linked rows retain the distinct accretion-ring icon and the original's current
name. Click/Enter navigates to the original Content panel through the existing
camera travel, including cross-Galaxy and reduced-motion behavior. The active
Constellation stays active. Row tooltips/accessibility labels say **Linked item**.
The row menu offers **Go to original** and **Remove from here**. Removal affects
only the extra appearance; original Files, Notes, Bookmarks and memberships stay.
Rename updates every appearance through the original stable ID. Move changes the
canonical item's structural location; Add existing item keeps it in place.
Sidebar item-dragging behavior remains unchanged; the explicit picker is the
linking route. External file/URL drop and spring-loaded expansion are preserved.

Internally these placements retain the existing Portal reference model in the
version-5 snapshot's optional `portals` collection:

```json
{ "id": "portal:uuid", "targetEntryId": "original-id", "parentEntryId": "place-id", "createdAt": "2026-01-01T00:00:00.000Z" }
```

No additional Cosmos body, structural parent or content owner is created.
Creation/removal publishes only after persistence succeeds and preserves camera
and physics state. Canonical subtree deletion cleans references whose target or
placement parent is deleted, along with memberships and attachment bytes; failed
transactions roll back. Existing saved references still load without migration.
Storage remains version 5 and IndexedDB is unchanged.

Run `python tests/browser-check.py --linked-items-only --screenshots` for plain
language, hierarchy/search picking, keyboard/touch confirmation, duplicate
prevention, exact legacy metadata preservation and refresh/removal checks.
`--portals-only` checks the retained underlying navigation, storage/rollback and
subtree-cleanup behavior. Before committing, add a cross-Galaxy item from the
sidebar, follow it, rename the original, remove its extra appearance, and check
mobile search and keyboard/focus behavior with your saved data.

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

`persistence.files` provides asynchronous `save`, `get`, `delete` and
`deleteEntries` methods. The local adapter uses IndexedDB database
`galaxy-attachments`, version 1, with a `files` store keyed by opaque file key and
an `entryId` index. Original Blob bytes and small thumbnail Blobs live there,
never in localStorage. The UI receives the adapter by dependency injection and
does not call IndexedDB directly. A startup scan reads only owner/key metadata,
not blobs/previews, so cleanup also finds unreferenced files belonging to an entry.

Ordinary documents, archives, design/CAD and project files are accepted broadly.
Internal previews remain JPG/JPEG, PNG, WebP, PDF, TXT and MD. Central limits live in
`galaxyModel.contentLimits`: **10 MiB per file**, **20 megapixels per image**,
**240px thumbnail edge**, **2048-byte text previews**, and **100,000 note characters**.
Image headers provide dimensions cheaply; JPEG orientation is respected.
Only the visible selected Content panel requests previews.
Images display bounded, aspect-preserving thumbnails; explicit Open uses original
bytes. PDFs use the browser-native reader inside the attachment viewer. TXT/MD previews are bounded
plain text, and MD opens as text rather than executable HTML or rendered Markdown.
Preview object URLs are revoked on selection/close, and full-file URLs on tab close
or page exit. Choose files through sidebar + → Add files; file-policy/size
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

`createLocalMetadataStore` loads versions 1–5 and the old `tool-galaxy:user-data` key.
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

## Persistence foundation

Domain state remains plain entries keyed by stable IDs, linked placements,
Constellations, archived-Galaxy records and saved layout. DOM, camera, transient
physics state and navigation preferences are separate. Duplicate names and
coordinates never identify an item. `getGalaxySnapshot()` delegates to the
Universe repository to produce complete metadata, including archived content;
binary bytes remain separate.

`persistence/composition.js` is the single adapter-selection point, configured
by `config.js`. The default is local metadata and preferences, IndexedDB files,
no authentication and no sync. There is no provider, network dependency or new
container migration. Opening `index.html` locally still works.

| Boundary | Contract | Local implementation |
| --- | --- | --- |
| Metadata | synchronous `load`, `save(snapshot, intent)`, `clear` | `persistence/local-metadata-store.js`; existing `galaxy:user-data`, v5 |
| Files | async `save`, `get`, `delete`, `deleteEntries`; `hasEntries` | `persistence/indexeddb-file-store.js`; existing `galaxy-attachments`, v1 |
| UI preferences | `load`, merge `update`, `clear` | `persistence/local-preferences-store.js`; existing `galaxy:navigation-ui` |
| Sample | the same contracts, disposable data | `persistence/memory-stores.js` |

`script.js` composes these services once. Navigation receives the preferences
interface; Content receives the file interface. Product writes go through
`services/universe-repository.js`: content updates, collection changes, linked
placements, Archive/Restore, and compound subtree deletion. File preparation
stays in `attachment-store.js`, with no storage implementation. Normal product
and UI code no longer calls localStorage or IndexedDB.

Repository subscribers receive typed change intent and stable IDs only after
metadata saves succeed; subscriber failure cannot break a local save. Layout
saves have a separate intent, remain on settle/drag/lifecycle boundaries, and do
not change domain timestamps or write every animation frame. New items receive
`createdAt`/`updatedAt`; rename, reparent and content changes update `updatedAt`.
Constellation edits also update it. Old records may omit these fields. Existing
file/placement/Constellation creation dates and archive dates are retained.

Content, linked placements, collections and Archive/Restore publish only after
a successful metadata write. Subtree deletion stages bytes, canonical entries,
linked placements, memberships and layout together before changing active UI.
File writes/removals keep synchronous metadata commit and recovery callbacks:
a metadata failure aborts the IndexedDB transaction, and a later file abort
compensates metadata, including content timestamps. This is recovery across two
browser stores, not a crash-proof cross-store database transaction. File-content
subscribers can see a metadata commit followed by recovery on late abort; a
future sync implementation must account for that compound operation. Ordinary
failed layout/CRUD saves retain the existing unsaved-session banner and stay
dirty for retry. Persistence errors preserve cause, quota classification, store,
operation and scope in `persistence.diagnostics.lastError`.

Sample composition forcibly selects memory stores, even if real adapters were
passed. It never reads personal content, preferences or file bytes. Refresh or
Leave Sample returns to the real adapters. No fake workspace or account UI is
added. A future composition can supply metadata/files/preferences adapters and
an authenticated `workspaceId`; local adapters already namespace non-null scopes
while preserving all existing anonymous keys and database names by default.
Namespacing is isolation, not authentication or access control.

For cloud work, keep a synchronous local metadata cache/commit boundary and add
an outbox/remote sync behind it, or evolve the service contract deliberately.
Async-only metadata adapters are rejected explicitly because current file
transactions depend on synchronous commit callbacks. File methods already return
promises and can use an object-store adapter. Future adapters can implement
compound repository intent transactionally; preferences need not sync. Opaque
file keys and separate metadata allow later external-file references without
duplicating binary content. No cloud, Drive, auth or sync is implemented here.

Validation: `node --test (rg --files tests -g '*.test.js')`,
`python tests/browser-check.py --persistence-only`, and the existing broader and
feature browser checks. `--foundation-performance-only` measures the same
187-item load/save/Sample workload before and after architectural changes. Use
`--site-root` for an isolated baseline tree and `--file-protocol` to open
`index.html` directly. In the direct-file headless comparison, initial load was
191/155 ms before/after, Sample load 477/485 ms, metadata save median 0.5/0.4 ms,
Sample render p95 1.4/1.4 ms and frame median 8.3/8.3 ms. These short runs are
sanity checks, not a performance guarantee; local HTTP navigation varied more
(Sample 356–386 ms before, 406–493 ms after). Check load on the eventual hosted
build separately from steady-state physics/render responsiveness.

## Layout and forces

One cooling D3 simulation maintains three local levels:

- Galaxies pack in a filled sunflower arrangement, using envelope proxies with
  collision strength **0.65**, 60px clearance, three iterations and gentle home
  attraction **0.018 × alpha**. Existing homes survive graph edits; Galaxy drag
  moves its home to the released location.
- Each Galaxy packs Sun/system footprints locally: collision strength **0.7**,
  24px clearance, three iterations. Suns prefer a filled region around their
  Galaxy, rather than a rigid orbital rail. Sun radial/angular strengths are
  **0.04 / 0.012**. Galaxy regions don't body-collide with their own contents.
- Planets, Moons and Satellites use their parent's preferred orbital band.
  Bottom-up branch envelopes account for descendants. Planet radial/angular
  strengths are **0.10 / 0.025**; Moon/Satellite strengths **0.14 / 0.04**. Radial
  force has a dead zone of `max(12px, 12% of target radius)` and is capped at
  **5 × alpha** per tick. Angular force is tangential and caps its radius factor
  at 80px. This reduces sharp restorative acceleration without extra damping.

A local band uses direct child radii and sibling count, with a bounded
allowance for child branches (28px inside a Sun, 14px deeper). Descendant
envelopes still inform system collision without recursively inflating every band.
Clearance is 82px for Sun-to-Planet placement, 48px for Planet-to-Moon and 26px
for Moon-to-Satellite; count-based clearance factors are 1.45 / 1.1 / .95.
The preferred Moon band is reduced by 18% and Satellite band by 25% after this
calculation. Original packing envelopes preserve Planet-to-Sun spacing, while
unchanged collision clearance prevents cramped families. The Sample reference
bands are 149.212px (Planet), 66.135px (Moon), and 30.165px (Satellite).
Astronaut bands, angles, sibling clearance and cluster layout remain unchanged.

Planets are sorted by stable IDs into preferred angular sectors around their Sun.
Seeded offsets vary angles by at most 8% of a sector and radii by at most 5%.
Moon and Satellite default angles follow the current outward parent direction,
with a broad local fan and slight radius variation. Saved drag preferences still
supply their chosen angle and radius directly. Soft sector-edge forces keep
Planet descendants on their own side and discourage crossing the Sun's center;
held drags bypass these forces. No snapping, walls or orbital animation is added.
Territory preferences cool with ordinary motion; the existing extreme radial
return force remains the only local reason to prolong settling.

The base diameter is 26px desktop / 24px mobile. At 100% desktop zoom the body
boxes are Sun 52px, Planet 28.6px, Moon 13.52px, Satellite 9.88px and Astronaut
7.28px, using role scales 2 / 1.1 / .52 / .38 / .28. CSS caps rendered diameters
at 76 / 44 / 25 / 18 / 14px respectively, including selected, hovered, focused,
Search-revealed and Constellation bodies. Centers keep projecting at the actual
camera scale: zoom expands local structure after a body reaches its cap. Texture
tiers use the capped diameter too. Collision radii remain in world coordinates;
body hit areas are independent (24px desktop, 44px touch). Proportional rings
and the close 2px selection outline preserve the role hierarchy.

A drag chooses a relative angle **and radius**: `clamp(releasedRadius, min, max)`.
The former 65% default / 35% released blend is removed. The same clamped preference
is used directly by the force after release and reload. For Planets and Moons,
the maximum is 2.4 × their adaptive default band; Satellites use 1.9 × their band.
The minimum is parent body radius + child body radius + 24px collision clearance;
the maximum is at least minimum + 24px. Suns retain their existing Galaxy packing
range, maximum default band + max(60px, 25% of system envelope), minimum zero.
These are soft preferred limits, with a free-floating
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
multipliers 1.45 for Planets, 1.1 for Moons and .95 for Satellites, strength 0.06 capped at
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
are repainted at native resolution during zoom. Body centers project in quarter-
pixel steps to avoid repainting imperceptible settling movement; world/camera
coordinates stay exact and SVG endpoints remain within 0.18px of body centers. Only SVG hierarchy paths/orbit guides
use the scaled world transform. Existing defined spherical shading/seeded texture
and restrained Sun glow remain. Procedural Galaxy SVG regions are built once per
identity; their names stay in the native text layer.
Galaxy clouds use soft, overlapping gradient concentrations in six deterministic
territory silhouettes: wispy, bloom, cluster, double-lobed, crescent and diffuse.
There are no spiral arms, central starbursts, hard containers or bright dust dots. Each
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

- Galaxy: **wispy, bloom, cluster, double-lobed, crescent, diffuse**, with stable
  orientation and muted blue/violet/teal/rose palettes. Legacy spiral/barred/
  elliptical/irregular appearance values resolve to nebula aliases for rendering;
  saved metadata remains untouched, with no schema change.
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
  overrides remain supported. A 24px SVG viewBox scales into a 7.28px body at
  100% desktop zoom, smaller than Satellite (9.88px) and Moon (13.52px). No
  raster/filter work. Deep focus uses 240% so the small silhouette remains usable.

Astronaut branches use compact local placement rather than additional orbital
bands. Default parent clearance is about 29px under another Astronaut and 35px
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
contextual creation paths, drag camera stability, independent sections, desktop/laptop/mobile
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
collapse/reopen and resize the sidebar; toggle each section and close/reopen Contents;
click empty space and press Escape; Fit with both panels open or closed; use keyboard tree
and menu navigation; and check the mobile drawer and refresh persistence. Load and
remove the temporary sample, then confirm your saved hierarchy and sidebar preference
are restored.
For the Content panel, upload an image, PDF and text file; open each, edit and
cancel a note, add `google.com` as a bookmark, then refresh. Check ancestor
breadcrumbs, Rename and Move, camera stability during content edits,
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


`python tests/browser-check.py --sidebar-sections-only --screenshots` checks
independent section state, native Enter/Space activation, preserved child branches,
content drafts/camera/lenses/physics, Universe + and Starter creation, Archive
appearance/restore/last-row removal, hidden diagnostics, existing canvas Fit,
mobile targets, preference reloads and the isolated Sample utility.

### Quick help

The quiet **? Help** beside Sample data at the bottom of the sidebar opens local Quick help. Seven short,
collapsible topics cover getting started, moving around, adding content,
Constellations, archiving, useful tricks, and using the same item in two places.
The last topic stays secondary and closed initially. There is no startup tour,
external documentation, dependency, or storage change.

Help uses a compact dark modal on desktop and responsive sizing on phones, with
an always-reachable header and internally scrolling topics. Enter/Space activate
topics, Tab stays in Help, and Close or Escape returns focus to the trigger.
Content drafts, selection, active Constellations, and camera state remain intact.
Help has no animation, including with reduced motion.

`python tests/browser-check.py --help-only --screenshots` checks disclosure state,
keyboard/focus, terminology, desktop and narrow/landscape mobile bounds, touch
targets, internal scrolling, reduced motion, and unchanged workspace/data.
Before committing, skim the copy, try Help with an unfinished Note and active
Constellation, and check long scrolling topics on a phone.


### Focused usability polish

Help lives in the bottom utility area, separate from the three navigation groups.
Its existing topics, dialog, keyboard behavior and focus restoration are unchanged.

On desktop, double-click a canonical sidebar name or press F2 on its focused row
to rename inline. The current name is selected. Enter trims and saves with the
same Rename validation, repository write and UI publication as menu Rename.
Escape or focus-away cancels. Empty/oversized names and failed saves leave the
editor open with validation feedback; no IDs, placements or memberships change.
Icons, chevrons and linked-placement labels do not start inline rename. Touch
users retain the existing menu action.

Click an image thumbnail or filename to open its original stored bytes in the
internal dark viewer. Close, Escape or empty overlay space dismisses it and
returns focus to the launching attachment. Multiple images follow attachment
order, using Previous/Next or Left/Right; navigation stops at the ends and hides
for a single image. Controls remain 44px on phones and images preserve aspect
ratio within the viewport. URLs are revoked on switching/closing; stale reads
cannot reopen a dismissed viewer. No new animation, gestures or storage changes.
PDFs now use the internal native reader; text keeps its existing browser-opening behavior.

`python tests/browser-check.py --usability-only --screenshots` checks these flows,
including shared rename failure/reload, relationships, viewer focus, keyboard,
missing/late files, no extra tabs, mobile bounds and reduced motion. Before
committing, try fast double-clicks, long names, a draft Note, mixed image sizes,
image browsing and phone controls. Storage remains v5.


### Image-first photos and internal PDFs

Photos have no visible filename heading. A quiet Info button reveals the existing
filename, MIME type, size and dimensions on demand; filenames remain unchanged
in metadata and Files. Close and ordered image browsing stay in the same viewer.

PDFs open in that modal with a subtle filename and a viewport-sized native PDF
embed. The browser owns page rendering, scrolling and reader controls. A quiet
Open externally link is always available for PDF readers that do not display
reliably; browsers reporting no native PDF support show an explanation instead
of an empty reader. External viewing requires an explicit click. There is no
PDF library, editing/search feature, file-store change or schema migration.

Viewer controls trap focus, Close restores the attachment, and Escape dismisses
from Cosmifold's controls. Native PDF reader frames own their keyboard events:
in the tested Chromium reader, Escape after clicking inside the PDF does not
reach the app. Close remains visible and works from that state; returning focus
to the viewer controls also restores Escape. This browser limitation is retained
rather than taking keyboard focus away from the native document reader.

`python tests/browser-check.py --attachment-viewer-only --screenshots` verifies
photo Info/metadata, native two-page PDF rendering and scrolling, no default
new tab, explicit unsupported-reader fallback, Close/focus/URL cleanup, Escape
from viewer controls, phone/landscape bounds and unchanged text-file opening.
Before committing, test representative PDFs in your desktop and phone browsers,
including native reader focus/keyboard behavior and Open externally.


### General file support

File acceptance is separate from viewing capability. Ordinary Office documents,
ZIPs, design/CAD/project files and unfamiliar formats use the same attachment
metadata, IDs, file adapter, IndexedDB bytes, deletion and Sample isolation as
images/PDFs. The picker has no format whitelist. The limit remains **10 MiB per
file**, and existing image pixel/thumbnail limits are unchanged. Storage stays
v5; new uploads include an optional lowercase extension. Older attachments load
without that field and need no migration.

`galaxyModel.filePolicy` is the one acceptance/preview decision point. It keeps
original filenames and reported MIME types, with `application/octet-stream` when
MIME is missing/invalid. Known extensions recover preview capability when MIME
is absent/generic; conflicting MIME/extension signals stay generic. Images/PDFs
retain their validation, internal viewers, Info and fallback. TXT/MD retain safe
plain-text previews/opening. Other formats, including video for now, get quiet
type badges, filenames, sizes and accessible File Details actions. Generic files
are not read for a preview. Clicking opens a compact internal File Details dialog
with filename, type/extension, size and a friendly preview explanation. Only an
explicit **Save a copy** action downloads original bytes under the original name
through an inert object URL. HTML/SVG do not execute inside Cosmifold. URLs expire
after a download grace period or page exit.

New uploads are blocked by case-insensitive filename extension or executable/
script MIME, independently. The focused list covers Windows programs/installers
(`exe`, `msi`, `msp`, `msix`, `msixbundle`, `appx`, `appxbundle`, `com`, `scr`,
`cpl`, `pif`, `lnk`), command/PowerShell/VB/JS/Python/shell scripts (`bat`, `cmd`,
`ps1`, `psm1`, `vbs`, `vbe`, `jse`, `wsf`, `wsh`, `hta`, `js`, `mjs`, `cjs`,
`py`, `pyw`, `sh`, `bash`, `zsh`, `fish`) and executable distribution formats
(`jar`, `apk`, `dmg`, `pkg`, `app`, `appimage`, `deb`, `rpm`, `run`). Trailing
spaces/dots and uppercase extensions cannot bypass matching. Blocking explains
that documents, project files or archives can be chosen instead. Archives are
not unpacked or scanned, and this is not antivirus/content-based detection.
Persisted metadata validation retains old content rather than discarding it
because of upload policy; generic opening stays in File Details until the user
chooses Save a copy. No generic-file action promises direct access to Word/Excel
or the original local file.

The existing picker and body/Galaxy/sidebar drop workflows share `prepare` and
file-store commits. Spring-loaded navigation and edge scrolling are unchanged.
Run `node --test tests/file-policy.test.js tests/content.test.js tests/storage.test.js`
and `python tests/browser-check.py --general-files-only --screenshots`, plus the
attachment-viewer, content, interface, everyday and spring-drop browser suites.
Before committing, attach/download real Office, ZIP and project files, refresh,
remove one, test body/sidebar/cloud drops and phone File Details/Save a copy, and check
that your existing images, PDFs and text files still open normally.

File Details uses a compact dark native modal, with Close/Escape/backdrop dismissal,
keyboard focus wrapping and focus restoration to the launching attachment. Phone
controls are 44px; the body scrolls independently when necessary. Opening or
closing Details does not create a duplicate file or write metadata. Save a copy
reuses the existing download path, displays read failures inside the dialog, and
keeps the managed attachment intact. No new animation or storage/schema change.
The general-file browser checks verify no download on activation, explicit saved
filename/bytes, dialog contents, keyboard/close/focus, backdrop and phone bounds.
