# Galaxy

A 2.5D universe for organizing generic entries: apps, websites, books, food,
ideas, resources, places, products, or other concepts. Celestial bodies represent
the hierarchy; the content model is independent of the metaphor.

No install or build step is needed. Serve this folder with
`python -m http.server 8000`, then open `http://localhost:8000`. Keep the same
browser, address and port to access the same saved galaxy.

## Using the galaxy

- **Add Entry:** enter a name and description, optionally a category/label, then
  choose a role. Suns need no parent, Planets need a Sun, and Moons need a Planet.
  Parent choices update with the role. Create a parent first if none are available.
  Parent connections are automatic; the checklist creates other optional links.
- **Edit:** select a body, then use Edit in Entry Details. The form supports name,
  description, label, role, parent and optional connections. Saving updates the
  same entry and node immediately. Its ID and drag position remain intact.
- **Delete:** user-created entries require confirmation. An entry with children
  cannot be deleted until its children are reassigned or deleted. Incompatible
  role changes follow the same rule, preventing silent orphaning. Built-in
  entries can be edited and reorganized but cannot be deleted.
- **Search:** type an entry name. Results show the role and parent, where assigned.
  Click a result or press Enter to select it, open details and smoothly focus the
  view. Arrow Down reaches the result buttons; Escape dismisses the results.
- **Explore:** drag a body to move it, drag empty space to pan, or scroll over the
  graph to zoom toward the cursor (8%–240%, with wider fitting for remote pins).
  Fit Galaxy centers all bodies in the usable viewport with padding.
  Panel and form scrolling do not zoom the graph.
- **Position:** dragging gives a body a soft preferred location. It stays nearby
  while connections, repulsion and collisions can still adjust it. Entry Details
  shows Automatic, Soft positioned or Pinned. Pin position holds exact coordinates;
  dragging a pinned body moves its pin. Unpin position keeps the current location
  as a soft preference. Release to physics clears both preference and pin for that
  entry. All these choices survive refresh and metadata/parent edits. Preferences
  use world coordinates, so resizing or changing the camera never rewrites them.
  Use search or pan to reach bodies placed outside the initial view.

## Development sample galaxy

Use **Load Sample Galaxy** in the development-data bar at the top center to open
the large interactive sample. The active sample is clearly marked at the top of
the viewport.

The sample contains 77 entries: 7 Suns, 21 Planets and 49 Moons covering
Technology, Food, Travel, Books, Fitness, Business and Music. Every relationship
uses the normal `parentId` hierarchy and the same rendering, force simulation, search,
dragging, selection and editing paths as regular entries.

Sample mode does not read or write the saved Galaxy in localStorage. Edits, manual
positions, pins and deletions remain in memory for the current page only. Use
**Remove Sample Galaxy**, or simply refresh the page, to return to the saved
Galaxy. The internal activation query is removed as soon as the sample loads so
it cannot survive a refresh or bookmarked URL.

## Data and hierarchy

Each plain entry contains `id`, `name`, `description`, `category`, `role`,
`parentId`, `x` and `y`. New IDs use `crypto.randomUUID()` when available, with a
collision-checked counter fallback. Editing never changes an ID.

The generic roles in `model.js` map to the existing celestial presentation:

| Stored role | Body | Parent role | Size relative to base |
| --- | --- | --- | --- |
| `category` | Sun | None | 1.35 |
| `subcategory` | Planet | `category` | 1 |
| `entry` | Moon | `subcategory` | 0.66 |

`category` remains an optional free-form label, separate from the hierarchy role.
`parentId` is either an existing entry ID or `null`. `galaxyModel` owns parent
validation, child lookup, normalization, derived connections and name search.
It is independent of DOM, D3 and localStorage.

The user-facing top-level metaphor is Sun. The persisted role remains the generic
`category`, so existing snapshots require no terminology migration. `sun` is only
the derived DOM presentation name used by the renderer; it is not stored.

Optional relationships are plain `{from, to}` ID pairs. Parent-child edges are
derived from `parentId` rather than stored a second time. One rendered SVG edge
is used per pair; hierarchy takes priority if an optional relationship duplicates
it. The current parent is disabled in the optional-connections checklist. Moving
an entry to another parent removes the previous derived edge while keeping other
optional relationships. Hierarchy rules prevent self-parenting and cycles.

## Graph and presentation

`script.js` coordinates forms, selection, CRUD, searching and DOM rendering.
`createEntryNode()` attaches interactions once, and `updateEntryNode()` applies
the same appearance renderer when editing or restoring entries. D3 particles and
DOM elements remain separate from the persistent records.

`physics.js` uses two levels of layout inside one cooling D3 simulation:

- **Local systems:** every Sun and its descendants form one indexed system.
  Unassigned legacy entries remain visible as independent roots, with their
  valid descendants, rather than being assigned invented parents.
- **Orbital hierarchy:** branch footprints are estimated bottom-up from body
  radii and label clearance. Planets prefer a radial band around their Sun;
  Moons prefer a smaller band around their Planet. Stable ID-based angles spread
  siblings. Radial attraction is stronger than angular preference, allowing
  collisions and dragging to adjust positions. There are no rotating orbits.
- **Sibling clearance:** nearby children of the same parent receive a small
  tangential impulse before body collision. Clearance uses body radii plus 24px,
  multiplied by 1.35 for Planets or 1.15 for Moons. Strength is 0.06, capped at
  `2 * alpha` per pair; soft placements have 0.35 mobility and exact pins have
  zero mobility. Separate radial regions are left alone. This force never
  changes system homes, envelopes, preferred coordinates or global packing.
- **Galaxy layout:** system centers have soft homes in a filled sunflower
  distribution. D3 collision operates on system footprint proxies, while
  many-body repulsion operates separately inside each system. Individual Moons
  have no global charge. Short-range body collisions still prevent overlap
  where two systems meet.
- **Containment:** automatic roots receive a gentle additional restoring force
  outside a galaxy radius derived from system count and footprint size. There
  are no viewport walls and no global attraction on each child. Manual roots
  bypass containment and home attraction; pins remain exact.
- **Relationships:** hierarchy springs are replaced by the orbital force.
  Optional semantic links remain explicit SVG connections. Within a system
  they have a weak spring; between systems they are visual only, avoiding
  unrelated clusters pulling each other across the galaxy.

Dragging a Sun transports its movable subtree; dragging a Planet transports its
Moons. Automatic descendants then settle locally. Soft descendants' preferred
coordinates travel by the same deliberate drag offset and are saved together.
Pinned descendants stay at their exact world coordinates; a pinned Planet also
keeps its branch behind when its Sun moves. Ordinary physics motion does not
rewrite any preferences. A manually positioned child uses only a very small
residual radial pull, allowing intentional stretching. Unpin preserves its current
world position as a soft preference; Release clears the preference and rejoins the
automatic orbital layout. Existing version 4 placements retain their world-space
meaning and require no data migration.

System membership, child lists, footprints and D3 force caches rebuild on structural
changes or body-size changes. Tick work uses those indexes, local quadtrees and
system proxy collision instead of global body repulsion. Rendered transforms
and orbital bands skip identical writes. Zoom updates inherited detail/size
properties and projects body centers through the camera. The simulation stops
after settling and pauses while dialogs are open or the page is hidden.
During settling, compositor hints let the browser reuse painted celestial
surfaces while their transforms change. The hints are released after settling;
routine hidden Moons at Galaxy scale do not receive them.

Drag release cools from the current simulation alpha without adding a new heat
impulse. Drag movement reheats to at least `0.22`, with an active-drag alpha target
of `0.10`; the last release sets the target to zero. Automatic radial strengths
are `0.10` for Planets and `0.17` for Moons, with angular preferences of `0.025`
and `0.06` respectively. Soft-position attraction is `0.15` and same-system
semantic-link strength is `0.015`. Normal alpha decay is `0.032`, allowing a
slightly longer cooling tail. Velocity decay remains `0.42`: gentler restoration,
rather than extra damping, softens recoil while retaining the existing inertia.
Reduced-motion settings, home attraction, containment, collisions and the tiny
manual radial pull remain unchanged.

`camera.js` owns the shared world-to-screen mapping. SVG connections and orbital
bands use its world transform. Body buttons live in an unscaled screen layer;
their dimensions change with zoom and their centers are projected by the camera.
Labels use native CSS font sizes and translation only, avoiding magnification
of already painted text. Selected/context labels and Sun/root names stay
at 10px; routine distant labels shrink using font size before fading. Pointer
positions are converted to world coordinates before dragging. Camera changes
never modify stored coordinates. Search centers in the usable graph area and
chooses a readable scale. Wheel zoom and pan work normally afterward. Reduced
motion shortens physics settling and skips camera animation.

The base desktop body diameter is 46px: Suns render at about 62px, Planets at
46px and Moons at about 30px. Mobile uses a 42px base.

Semantic zoom interpolates detail with smoothstep fades. Sun bodies retain a
minimum screen diameter of about 18px (17px on mobile), while their labels stay
at normal screen size even at very distant fitted zoom. This affects rendering
and hit targets only; world-space physics radii and saved positions stay stable:

| Approximate scale | Information |
| --- | --- |
| Below 50% | Sun/system names at readable screen size; simplified Planets; routine Moons and labels fade away |
| 50–95% | Planet names and orbital grouping; Moon bodies gradually appear; selected/relevant Moon names |
| Above 95% | Individual entries and surface detail; all routine Moon labels reach full opacity at 105% |

Planet detail fades in across 35–65%, Moon bodies across 45–85%, Moon labels
across 80–105%, surface detail across 50–100%, and contextual orbit guides across 50–85%.
The named tiers are descriptive; the fades are continuous. Legacy unassigned roots
remain landmarks regardless of role. Selected entries, relevant ancestry and
all current search matches remain discoverable at every scale. Searching for a
Moon selects it, opens details and smoothly focuses at at least 115%; other
entries focus at at least 100%. Keyboard focus also reveals an entry.

Selection emphasizes the local system and slightly dims unrelated systems.
Selecting a Planet reveals its Sun, sibling Planets and Moons. Selecting a Moon
shows its parent and Sun context. Ordinary straight hierarchy lines are hidden.
Only a selected Moon's ancestry, a selected stretched branch (beyond 1.6 times
its preferred orbital radius), or a dragged child retains a 0.10-opacity direct
line. Semantic relationship lines retain their separate presentation.

Decorative partial orbit paths have been removed. Above 50% zoom, the selected
system (or a hovered system when nothing is selected) shows one thin circular
Sun band. At 95% and closer, a selected Planet or Moon also reveals its Planet's
Moon band. Guide opacity fades across 50-85% zoom, capped at 0.09 for Sun bands
and 0.07 for Moon bands, with a 0.65px non-scaling stroke. There are at most two
visible guides, and none at far zoom. These circles show preferred regions;
manual bodies need not sit on them.

**Fit Galaxy** replaces the old Reset View control. It computes world bounds
from every body, including descendants currently faded by semantic zoom, and
includes body radii and label allowances. The camera selects the smaller width/
height fit ratio, adds 32px screen padding and centers inside the usable area.
That area excludes the right details panel on desktop and the bottom panel on
mobile, plus the top controls. Fitting never changes saved positions. A small
galaxy is not enlarged beyond 100%; intentionally remote pins can fit below the
normal 8% zoom limit. The initial view is fitted again once physics settles;
wheel input, dragging, search or pan cancel that pending automatic fit.

The footprint estimates describe the automatic orbital layout. Deliberately
stretched branches and conflicting pins can overlap another system; local body
collision helps, but it does not expand every system's global envelope to include
a remote manual Moon. This keeps one stretched entry from evacuating neighboring
systems. Large sibling counts expand radial bands, and this version has no label
overlap solver. Selected labels can crowd at extreme overview scales; search
focuses close enough to read and explore them. Physics uses one shared clock and
cooling schedule, so interacting reheats all systems even though their forces
are scoped locally. Desktop/browser performance should still be checked with
your own data and hardware; headless Chrome's software rendering is a smoke check.

The universe keeps its dark gradients, small seeded background stars and subtle
clouds. Suns use a warm white core, yellow-gold falloff, a restrained corona and
soft bloom rather than a planet-style shadowed surface. The Sun bloom is reduced
to 5px/12px glows, with a tight luminous edge. Planets and Moons use tighter
inset shadows, stronger limb definition, directional lighting, restrained
atmospheric rims and finer seeded surface noise. ID-based variants
stay stable across refreshes and metadata edits. `background.js` runs only on
load/resize.

## Storage and migration

`storage.js` isolates persistence behind `galaxyStorage.load()` and `.save()`.
New saves use `galaxy:user-data`, version 4:

```json
{
  "version": 4,
  "entries": [
    {
      "id": "entry-example-sun",
      "name": "Food",
      "description": "Ingredients and recipes",
      "category": "Interests",
      "role": "category",
      "parentId": null,
      "x": 400,
      "y": 350
    },
    {
      "id": "entry-example-planet",
      "name": "Fruit",
      "description": "Seasonal fruit",
      "category": "Food",
      "role": "subcategory",
      "parentId": "entry-example-sun",
      "x": 600,
      "y": 350
    }
  ],
  "connections": [{ "from": "entry-example-planet", "to": "github" }],
  "layout": [{ "id": "entry-example-planet", "x": 600, "y": 350, "pinned": false }]
}
```

The snapshot includes built-in entries too, so their edited metadata and positions
persist. Built-in defaults load first and stored records override them by ID.
The original built-in connections are seeded for new/legacy data; versions 3/4 load
the saved optional connections exactly, including user edits to those links.

Versions 1, 2 and 3 still load. The older `tools` array becomes generic entries, and
`builtInPositions` supplies positions for the built-in defaults. `group` becomes
`category`; missing/unknown roles become `entry`. Missing or invalid parents leave
entries unassigned rather than guessing hierarchy from optional connections.
Unassigned legacy Planets/Moons stay visible and searchable; choose a valid parent
when editing them, or convert them to a Sun.

Before replacing a version 1/2 snapshot in the current key, the first save retains
its exact contents in `galaxy:user-data:pre-hierarchy`. Later saves never overwrite
that backup. If the old data exists only at `tool-galaxy:user-data`, that original
key remains untouched. The current key takes precedence over the legacy key.
If writing the migration backup fails, the old snapshot is not replaced.
Version 3 snapshots are likewise retained in `galaxy:user-data:pre-layout` before
the first version 4 save. Older snapshots start with an empty layout preference
list: their existing coordinates still initialize the graph, but the application
does not guess which positions were deliberately dragged.

CRUD changes save immediately, and positions save at drag end, simulation settle
and page hide/exit. Entry `x`/`y` record the latest simulated coordinates. The
separate `layout` array stores only manually positioned entries, as stable ID,
preferred world-space `x`/`y` and a `pinned` boolean. `script.js` normalizes this
array through `galaxyModel.normalizeLayout()` during initialization and passes
preferences to `physics.setGraph()`. Invalid/stale preference records are ignored.
Deleting an entry removes its layout record; Release to physics does the same
without deleting the entry. This separation lets a future backend store semantic
content and layout independently.
Camera transforms, velocities, DOM and derived edges are not stored. Invalid
links/records are ignored; unreadable/unsupported snapshots stay untouched with
saving disabled for that session. Storage failures show an on-screen message.

Data remains local to the browser; there is no authentication, database or sync.
A backend can replace the storage adapter without changing the entry model.
No new runtime or test dependencies were added. D3 Force remains pinned in
`vendor/`, with its required modules and licenses.

## Tests

Run the dependency-free unit/regression tests:

```sh
node --test tests/model.test.js tests/storage.test.js tests/physics.test.js tests/camera.test.js tests/sample-data.test.js
```

Run real-browser regression checks with installed Chrome/Edge and Python 3.9+:

```sh
python tests/browser-check.py
```

The check uses an isolated temporary browser profile and a temporary local HTTP
server; it never touches your normal browser's saved entries. Set `GALAXY_BROWSER`
to an executable path if the browser is not found. Add `--screenshots` to save
desktop/mobile previews in a temporary directory printed in the output.

For focused visual and interaction checks, run
`python tests/browser-check.py --visual-only --screenshots`. It captures normal
and Sample Galaxies at 30%, 65% and 170%, plus a 2x-display close-up; checks native
body/text transforms during animated zoom and selective guide counts; and drops
Planet/Moon siblings onto pinned neighbors to verify local separation and pins.

The browser suite opens the actual development sample in its isolated profile. It
checks settling, all 70 hierarchy edges, local parent distances, system
separation and containment, label/body visibility at Galaxy/system/entry scales,
selection, parent and child dragging, search reveal, panel-aware fitting, and
temporary sample isolation. Unit checks cover remote system containment,
cross-system independence, pin exceptions and migrating manual preferences
unchanged. Sample interactions leave the saved localStorage snapshot byte-for-byte
unchanged.

Release regressions cover a Sun with descendants, a Planet with Moons and an
individual Moon. They check that release preserves velocities and alpha, initial
acceleration and displacement stay restrained, descendants react and the whole
system settles. A held drag and simultaneous drags also verify the cooling handoff.

Before committing, also try a Sun → Planet → Moon family with your own data,
edit and reparent it, drag a parent and a child at different zoom levels, confirm
delete/cancel and the parent deletion guard, search/focus, then refresh.
Also move a Planet far from its Sun and a Moon to the opposite side of its Planet,
refresh, and check their soft preferences. Try Pin, drag neighboring bodies around
it, Unpin, and Release to physics. The browser checks cover these actions and
verify hierarchy edges, responsive controls and persistence in each mode.
