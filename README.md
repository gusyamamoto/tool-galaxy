# Galaxy

A 2.5D universe for organizing ideas, resources, places and other entries. No
install/build step: serve this directory with `python -m http.server 8000` and
open `http://localhost:8000`. Use the same browser, address and port for saved data.

## Creating and navigating

- **Add Galaxy:** at the top of the sidebar, this action always starts a new
  domain. Its normal form also allows choosing any valid parent manually.
- **Add child:** use the small **+** on a tree row, the action in Entry Details,
  or the body's right-click menu. All three use the same parent context: Galaxy
  → Sun → Planet → Moon → Satellite, then **Add child** at any deeper level.
  The form shows the chosen parent and derived role; **Change parent** restores
  manual selection. Content may end at any level.
- **Hierarchy:** the left tree derives directly from `parentId`, with no depth
  limit. Galaxies start expanded and other branches closed. Disclosure arrows
  only change the tree. Selecting a body expands its ancestor path, highlights
  its row and scrolls it into view; selecting a row focuses the corresponding
  Galaxy/system/body and updates Details. Arrow keys navigate/expand/collapse,
  Home/End reach the first/last visible row, and Enter/Space activate it. Tab also
  reaches the current row's child-creation action.
- **Sidebar:** Add Galaxy, Fit Galaxy and search sit above the compact tree.
  The small Galaxy title stays in the sidebar; there is no visible Hierarchy
  heading. **More tools** at the bottom holds zoom/count information, navigation
  hints and temporary Sample controls. A small Sample label identifies that mode.
  Toggle navigation beside the title to reclaim canvas space; a small reopen
  control remains when it is closed. Drag its
  right edge to resize, or focus the separator and use Left/Right/Home/End.
  Width stays within 180–360px and 30% of a desktop viewport. On narrow screens
  it becomes a drawer that closes after navigation. Camera fitting and focus
  use the space remaining beside the sidebar and any open Details drawer; resizing changes
  screen bounds and camera translation without moving world coordinates.
- **Details:** selecting a tree item, body or search result opens a narrow right
  drawer. It starts hidden and can be closed with its ×, Escape or an empty-canvas
  click. Closing preserves selection and tree state; selecting again reopens it.
  Name, description, clickable ancestry, Add child, Edit and Delete come first.
  **More** contains only the optional label and is hidden when the item has none.
  A root shows its Universe location; other items use their ancestry breadcrumb.
  On mobile it becomes a bottom sheet; opening navigation closes it, and selecting
  from navigation switches back to Details. Right-click updates selection and
  opens its menu without opening a closed drawer or shifting the camera. Opening
  Details eases the camera at the same zoom and keeps an edge-selected body visible;
  it waits for drag release before opening if a pointer is held.
- **Body actions:** right-click a body, Galaxy name, cloud or sidebar row for Add child,
  Connect to..., Edit and Delete. Existing deletion protections and confirmation
  remain. The menu stays inside the viewport, closes on outside clicks/Escape,
  and does not start dragging or camera focus. Shift+F10 opens it from a focused
  body; arrows/Home/End navigate its actions.
- **Add / Edit:** required name, optional description/category/label and one structural
  parent. Relationship fields are absent. IDs and existing semantic links stay stable.
  Moving a branch changes its descendants' computed depths/roles together.
  Self/descendant parent choices are excluded, with model
  validation also rejecting cycles. Appearance overrides survive ordinary edits.
- **Delete:** confirmation for leaves; parents with children must have those
  children reassigned/deleted first. Original built-in IDs remain protected.
- **Search:** in the sidebar, names at every depth, case insensitive. Matching
  visible tree rows are highlighted; choosing a result opens its ancestor path.
  While results are open,
  matches and their ancestry reveal even at Universe zoom. Choose a result to select it, open Details and
  smoothly focus. Details includes clickable ancestor names. Arrow Down reaches
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

## Generic hierarchy and persistence

Version 5 stores entries with `id`, `parentId`, `name`, `description`, `category`,
`x`, `y`, and optional `appearance`. Role and depth are computed, never stored:

| Computed depth | Visual role | Body scale |
| --- | --- | --- |
| 0 | Galaxy region | Spatial envelope, not a sphere |
| 1 | Sun | 1.75 |
| 2 | Planet | 1 |
| 3 | Moon | 0.65 |
| 4+ | Satellite | 0.58 |

The tree can continue beyond these visual levels. Iterative normalization,
ancestry traversal and layout traversal avoid a fixed maximum depth. Missing
parents/cycles in stored trees are repaired into roots without dropping valid
records. Invalid records disable saving for that session so the original snapshot
is preserved. `category` is only an optional text label, separate from ancestry.

Optional, undirected relationships reuse the existing `connections` array and
`from`/`to` entry-ID references. Records now contain `{id,from,to,type}` with an
optional `label`; the first workflow defaults to `type:"related"`. Legacy pairs
receive a deterministic stable ID from their sorted endpoints. Existing valid IDs,
types and labels survive normalization and saving; self-links, missing endpoints
and reversed/exact duplicate pairs are rejected. A semantic parent/child connection
coexists with its derived hierarchy edge. Creation adds no semantic links; content
edits and parent changes preserve them. Deleting a leaf removes only its incident
relationships. These additive fields keep the version 5 storage container and
existing migration/backups; `parentId` and layout records are unchanged.

## Semantic connections

Choose **Connect to...** from a body's or tree row's context menu, or **+ Connect**
in Details. The inspector prompts “Connect [name] to...” and highlights the source.
Click a visible body or Galaxy cloud/name to relate it; body dragging is suppressed
until target selection ends. The source and already-connected targets are rejected.
Escape, Cancel, the inspector's × or an empty-space click cancel. Space remains
pannable and wheel zoom remains available. Target search reaches all entries,
including hidden bodies and other Galaxies; results show ancestry to distinguish
duplicate names, with already-connected results disabled. Enter chooses the first
eligible match; Arrow Down reaches result buttons. Sidebar row activation can also
choose a target. No type picker or constellation UI is included.

Details lists connected names with navigation and a compact × removal action.
An empty section contains only **+ Connect**. Editing connections updates the
presentation and saves immediately without rebuilding/reheating physics. All
semantic force strengths are zero, including links within a single solar system.

Semantic lines are thin dashed SVG lines, distinct from faint solid hierarchy
cues and orbital guides. Strokes/dashes compensate for the HTML world transform,
remaining 1px for selected/hovered links and 0.7px otherwise at any zoom.
Their world-space endpoints update on every physics tick,
drag frame and camera change. Galaxy endpoints follow the projected Galaxy names.
Universe and system views hide unrelated links; close zoom fades them up to only
5.5% opacity when both endpoints are visible onscreen. Hover reveals incident
links at 30% opacity from Galaxy zoom; selection reveals direct links at 50%
(40% in Universe view), including cross-Galaxy links. Connected visible targets
receive a restrained outline/name emphasis. Body semantic hiding is unchanged,
and inspector navigation can focus a hidden or distant endpoint. Unrelated bodies
retain at least 72% contextual opacity.

Semantic lines have presentation-only screen-space hit-testing: a 6px radius on
desktop and 10px on touch, including gaps between dashes. The rendered stroke
stays 1px. Only lines at least 18% opaque and intersecting the usable viewport are
interactive; hidden and 5.5% background links leave no pointer or keyboard traps.
Bodies/labels take priority over line hits. At crossings, nearest half-pixel
distance wins, then an incident link of the selected entry, then stable ID.
Hovering shows endpoint names and the relationship label/type in a compact,
viewport-clamped tooltip, emphasizing the line and both bodies without dimming
unrelated content. Leaving clears the emphasis. Pointer hit-testing and tooltip
anchors use current projected geometry on every movement/physics/camera update.

Clicking a line focuses the opposite endpoint when one endpoint is selected;
otherwise it focuses the endpoint nearest the pointer (exact ties choose `from`).
It uses the same semantic `focusEntry` path as inspector rows, updating Details and
the expanded tree. Nearby routes ease directly in 450–650ms without context zoom.
Distance is measured in usable viewport lengths at the current/destination scale;
different-system/distant same-Galaxy routes take 800–1100ms, and cross-Galaxy routes
take 1200–1500ms, with durations capped even for extreme distances.
Longer routes zoom out during the first 32%, pan continuously through spatial
context, and zoom into the normal target hierarchy during the final 38%. A quintic
smootherstep gives the pan a slow–fast–slow velocity profile. Zoom interpolates
logarithmic scale with the same easing, keeping proportional size changes smooth
across large zoom ranges. The phases overlap without camera jumps. Normal tree/body
focus retains its faster behavior. Wheel, pan, body drag and Escape cancel travel
at the visible view; reduced motion uses immediate focus without the sequence.
Dragging space from a line still pans. Wheel/Fit/navigation
dismiss hover context. Touch first previews endpoint names and a **Go to [name]**
action; that action or a second tap on the same line navigates. The preview can
be closed or dismissed by another canvas/control interaction. Visible eligible
lines have accessible labels and support Tab then Enter/Space; inspector rows
remain the keyboard navigation alternative. No connection, hierarchy, layout or
storage fields change for this refinement.

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
Content, ancestry, appearance and semantic relationships are unaffected by normalization.

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
- Planets, Moons and deeper Satellites use their parent's preferred orbital band.
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
are repainted at native resolution during zoom. Only SVG connections/orbit guides
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
`display:none` while retaining their derived connections and coordinates.
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
branches and dragging may show very subtle context lines. Semantic relationships
keep explicit lines. Orbit guides show only for a selected/hovered system above
0.58, fading to full subtle opacity by 0.78; close selection may add the immediate parent/child band. At most three
guides are shown, never whole-Universe concentric rings. There are no decorative
partial orbit fragments.

`appearance.js` hashes stable IDs (FNV-1a) and resolves optional overrides:

- Galaxy: **spiral, barred spiral, elliptical, irregular**, with stable
  orientation, flattening, density and muted blue/violet/teal/rose palettes.
  These are spiral-like cloud, elongated/barred cloud, elliptical cloud and
  irregular nebula distributions; variation is filled silhouette/core/dust,
  never line-art arms.
- Planet: **rocky, gas giant, icy, oceanic, ringed, desert**. Only the ringed
  default archetype has rings; approximately one in six automatic Planets.
- Sun: warm/golden. Moon: rocky/icy/earthy.
- Satellite (depth 4 and deeper): **twin-panel, dish, probe, station**. Small
  native SVG silhouettes use metallic bodies, muted panels and restrained antenna
  strokes. They fit inside the existing Satellite size, smaller than a Moon, with
  stable ID-based archetype/orientation and optional archetype/palette overrides.
  They use no spherical surface, procedural textures, filters, or per-frame redraw.

The model already preserves `appearance` for a future small Edit Appearance UI:
`{mode:"manual",archetype:"oceanic",rings:true,palette:"teal"}`. Allowed palettes
are amber, blue, teal, violet and rose. `{mode:"auto"}` returns to deterministic
defaults. Invalid/role-incompatible choices fall back safely. Appearance is
independent of subscription/features. No customization UI is added yet.

## Development sample and tests

**Load Sample Galaxy** opens 183 temporary entries: four Galaxies (Work, Food,
Travel, Personal), eight Suns, 24 Planets, 48 Moons, 99 Satellites, including a
depth-seven recipe branch and eight semantic links demonstrating technology,
recipes/ingredients, travel, business and cross-Galaxy interests. Normal interactions use the same model/renderer/
physics. Sample mode neither reads nor writes real saved data. Remove Sample or
refresh returns to it; the activation query is removed immediately.

Run unit tests in PowerShell: `node --test (rg --files tests -g '*.test.js')`.
Run isolated real-browser regression/visual checks:
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
`python tests/browser-check.py --connections-only --screenshots` checks actual
right-click and pointer target selection, search across Galaxies, self/reverse
duplicate rejection, cancellation, inspector navigation/removal, refresh and
endpoint deletion. It also checks sample isolation, zero physics effects,
moving/dragged/camera-aligned endpoints, Galaxy/Sun/deep endpoints, contextual
line visibility, native motion cost and mobile target search. Screenshots show
the picker, search, selected Codex, far zoom, cross-Galaxy links and mobile sheet.
`python tests/browser-check.py --connections-performance-only` repeats the full
regression's deep-focus motion scene in isolation, comparing normal rendering
with semantic line painting disabled and enforcing the existing frame budget.
Add `--baseline-head` to serve a temporary snapshot of the committed app for the
same comparison, without modifying workspace files. Headless frame budgets can
fail even on that baseline; report this separately from functional checks and
verify smooth motion on a native display.
`python tests/browser-check.py --cloud-fade-only --screenshots` checks early fade
on desktop, laptop and narrow canvas with sidebar/inspector open, strong Universe
clouds, faint system clouds, independent Galaxy identity, smooth actual zoom in/
out, translation stability and cached pixel reuse. It retains comparison views
and measured opacity values.

`python tests/browser-check.py --travel-only --screenshots` checks native blank
description submission at every depth, clearing during Edit, reload, local/system/
Galaxy travel from rows and lines, arrival visibility, reverse routes, manual
wheel/pan/drag/Escape interruption and reduced motion. It retains departure,
context and arrival screenshots and camera traces.

`python tests/browser-check.py --connection-lines-only --screenshots` checks
actual line hover/click gestures, label wording, invisible hit margins, endpoint
emphasis, tooltip clamping, opposite/nearest navigation, inspector-row parity,
cross-Galaxy focus, wheel resumption, hidden-link pointer/keyboard safety, keyboard
activation, moving geometry and mobile touch preview/action/repeat-tap behavior.
`python tests/browser-check.py --navigation-only --screenshots` checks all three
contextual creation paths through depth six, synchronized tree/body/search
selection, branch/sidebar collapse, pointer/keyboard resizing, viewport Fit,
right-click actions and keyboard dismissal, mobile navigation and Sample isolation.
`python tests/browser-check.py --interface-only --screenshots` checks control placement,
hidden/contextual Details, Escape and empty-click dismissal, edge-selection visibility,
unchanged world coordinates through panel transitions, minimum sidebar width, all
three creation paths, drag camera stability, label-only More, desktop/laptop/mobile
layouts and panel-aware Fit. Its screenshots include the clean and immersive canvas.
The migration-only suite pauses fixtures before their first physics frame to
verify exact initial coordinates, then exercises normal save, v4/v5 pin normalization,
semantic links through content edits/reparenting/reload, and corrupt/future-data safeguards.
Motion/settling assertions remain in the physics and full browser regressions.
`python tests/browser-check.py --performance-only` profiles active/idle rendering,
display-scale changes and individual paint layers using the isolated sample.
Add `--software-rendering` to profile without GPU compositing separately.
`python tests/browser-check.py --visual-only --screenshots` checks the 183-entry
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
deep Satellite and repeat, including interrupting its focus transition. Check
name/cloud/Sun clicks, far-drop recovery, sparse/wide systems, and stable Satellite
variants after reload. Verify Galaxy region prominence and the quieter
orbital guides on your display. Compare two- and eight-Planet families, and
check Moon/Satellite clearance and label readability on mobile. Very deep/wide
trees have larger footprints, so Fit may zoom far out. Galaxy clouds are spatial
cues rather than hard containers or an astronomical simulation. Large production
datasets beyond this sample still need profiling. An appearance picker is deferred.
Before committing the interface changes, also check long names and deep branches
in your own hierarchy; create children through the tree, Details and right-click;
collapse/reopen and resize the sidebar; close/reopen Details and expand More;
click empty space and press Escape; Fit with both panels open or closed; use keyboard tree
and menu navigation; and check the mobile drawer and refresh persistence. Load and
remove the temporary sample, then confirm your saved hierarchy and sidebar preference
are restored.
At extreme fitted zoom on narrow screens, temporarily revealed search labels can
crowd together; focus and the ancestry breadcrumbs restore local reading.
Before committing connections, try a visible target and a distant search target
with your own data, including duplicate names. Cancel with Escape/empty space,
refresh, navigate/remove a connection in Details, and inspect the Sample at far
and close zoom. Check cross-Galaxy line contrast and mobile result scrolling on
your display. Connections do not provide richer relationship classification or
named collections yet.
