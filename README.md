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
  graph to zoom toward the cursor (30%–240%). Reset view restores the original
  camera. Panel and form scrolling do not zoom the graph.
- **Position:** dragging gives a body a soft preferred location. It stays nearby
  while connections, repulsion and collisions can still adjust it. Entry Details
  shows Automatic, Soft positioned or Pinned. Pin position holds exact coordinates;
  dragging a pinned body moves its pin. Unpin position keeps the current location
  as a soft preference. Release to physics clears both preference and pin for that
  entry. All these choices survive refresh and metadata/parent edits. Preferences
  use world coordinates, so resizing or changing the camera never rewrites them.
  Use search or pan to reach bodies placed outside the initial view.

## Development sample galaxy

To open the large development sample, append `?sample=large` to the normal app
address. For example:

```text
http://localhost:8000/?sample=large
```

The sample contains 77 entries: 7 Suns, 21 Planets and 49 Moons covering
Technology, Food, Travel, Books, Fitness, Business and Music. Every relationship
uses the normal `parentId` hierarchy and the same rendering, force simulation, search,
dragging, selection and editing paths as regular entries.

Sample mode does not read or write the saved Galaxy in localStorage. Edits, manual
positions, pins and deletions remain in memory for the current page only. Use
**Reset sample** in the sample banner to rebuild the original fixture, or **Exit
sample** to remove the query parameter and return to the saved Galaxy. Refreshing
the sample URL also resets it.

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

`physics.js` wraps the existing locally vendored D3 Force runtime. Hierarchy
springs are stronger than optional relationship springs, with shorter gaps for
Moons than Planets. Soft parent attraction assists children that wander far away.
Suns repel more strongly to separate systems; circle collision, weak centering,
velocity damping and cooling keep the layout usable. Dragging temporarily pins
a body; children and parents remain free to react. Reparenting rebuilds the forces
without rewriting ancestry during motion. No continuous orbit animation is used.

Automatic hierarchy link strength is now 0.18 for Planets and 0.36 for Moons
(formerly 0.48 for both). Moons keep closer automatic clusters even when they have
additional optional links. A manually
positioned child uses 0.014, allowing a deliberately longer link; automatic
children follow manually placed parents with a gentler 0.14 spring, so they cannot
overpower the parent's anchor. Optional links use 0.08, or 0.008
when either endpoint has a preference. Extra parent gravity is 0.018 for automatic
children and 0.0015 for manually positioned children. A soft anchor applies a
velocity force toward its preferred coordinates (0.2 times simulation alpha),
with reduced global centering (0.001). Suns get extra short-range separation so
gentler springs do not crowd systems together. Normal velocity decay increases
from 0.32 to 0.38; alpha decay remains 0.035. Release reheats gently at 0.28 without
rebuilding or stopping the simulation. Hard pins use D3's `fx`/`fy`, and collisions
move free bodies around them. Automatic nodes retain the existing viewport bounds;
manually positioned bodies and their descendants remain free to occupy the wider
world. A viewport edge must not trap a child and pull its arranged parent back.

`camera.js` owns a view transform shared by nodes and SVG connections. Pointer
positions are converted to world coordinates before dragging. Camera changes
never modify stored coordinates. Search centers in the usable graph area and
chooses a readable scale. Wheel zoom and pan work normally afterward. Reduced
motion shortens physics settling and skips camera animation.

The base desktop body diameter is 46px: Suns render at about 62px, Planets at
46px and Moons at about 30px. Mobile uses a 42px base. At 50–79% zoom, surface
texture, labels and ordinary connections become quieter. Below 50%, routine Moon
labels disappear, Planet labels recede, textures simplify, and Suns remain visible
as landmarks. Sun labels receive extra compensation at the far tier, while a
selected label stays at its normal screen size. Selected and directly related
labels remain visible at every scale.
Labels only counter-scale down to 62%, so distant labels shrink with the graph
instead of staying full-sized. Thin non-scaling SVG lines remain subtle while a
selected relationship receives stronger emphasis.

The universe keeps its dark gradients, small seeded background stars and subtle
clouds. Suns use a warm white core, yellow-gold falloff, a restrained corona and
soft bloom rather than a planet-style shadowed surface. Planets and Moons retain
directional lighting, atmospheric rims and seeded surface noise. ID-based variants
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

The browser suite opens the actual development sample in its isolated profile. It
checks settlement time, all 70 hierarchy edges, rendered body sizes, label density
at 100%, 60% and 30%, selected-node visibility, dragging, search/focus, Reset and
Exit. It also verifies that loading and interacting with the sample leaves the
saved localStorage snapshot byte-for-byte unchanged.

Before committing, also try a Sun → Planet → Moon family with your own data,
edit and reparent it, drag a parent and a child at different zoom levels, confirm
delete/cancel and the parent deletion guard, search/focus, then refresh.
Also move a Planet far from its Sun and a Moon to the opposite side of its Planet,
refresh, and check their soft preferences. Try Pin, drag neighboring bodies around
it, Unpin, and Release to physics. The browser checks cover these actions and
verify hierarchy edges, responsive controls and persistence in each mode.
