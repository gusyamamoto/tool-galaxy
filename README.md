# Galaxy

A 2.5D universe for organizing ideas, resources, places and other entries. No
install/build step: serve this directory with `python -m http.server 8000` and
open `http://localhost:8000`. Use the same browser, address and port for saved data.

## Creating and navigating

- **Add:** without selection, Add Galaxy creates a domain. With selection, the
  button offers the appropriate child: Sun, Planet, Moon or Satellite. The form
  defaults to that parent. Choose **Universe — new Galaxy** to create another
  independent Galaxy, or any valid parent to create a child there. The role
  preview updates automatically; content may end at any level.
- **Edit:** name, description, optional category/label, parent and semantic
  connections. IDs stay stable. Moving a branch changes its descendants' computed
  depths/roles together. Self/descendant parent choices are excluded, with model
  validation also rejecting cycles. Appearance overrides survive ordinary edits.
- **Delete:** confirmation for leaves; parents with children must have those
  children reassigned/deleted first. Original built-in IDs remain protected.
- **Search:** names at every depth, case insensitive. While results are open,
  matches and their ancestry reveal even at Universe zoom. Choose a result to select it, open Details and
  smoothly focus. Details includes clickable ancestor names. Arrow Down reaches
  results, Enter selects the first match, Escape dismisses results.
- **Explore:** wheel zoom toward the cursor, drag space to pan, Fit Galaxy to
  include all regions and content beside the panel. Galaxy/Sun search frames its
  region/system; deeper search focuses the body at a useful close scale.
  Single-click a Galaxy name or cloud to frame its systems, then a Sun or its
  name to frame that system. Focus uses eased camera motion and viewport padding;
  Sun framing centers the Sun. Dragging suppresses the following focus click.
- **Position:** normal bodies are **Flowing**. Dragging influences the preferred
  parent-relative angle while physics remains active. Flowing radial preferences
  have soft local bounds, so an extreme drop gently returns toward its parent.
  **Pin position**
  holds exact world coordinates; dragging a pin moves it. Unpin resumes flowing
  directly. There is no Soft positioned mode or Release to physics action.

## Generic hierarchy and persistence

Version 5 stores entries with `id`, `parentId`, `name`, `description`, `category`,
`x`, `y`, and optional `appearance`. Role and depth are computed, never stored:

| Computed depth | Visual role | Body scale |
| --- | --- | --- |
| 0 | Galaxy region | Spatial envelope, not a sphere |
| 1 | Sun | 1.35 |
| 2 | Planet | 1 |
| 3 | Moon | 0.66 |
| 4+ | Satellite | 0.43 |

The tree can continue beyond these visual levels. Iterative normalization,
ancestry traversal and layout traversal avoid a fixed maximum depth. Missing
parents/cycles in stored trees are repaired into roots without dropping valid
records. Invalid records disable saving for that session so the original snapshot
is preserved. `category` is only an optional text label, separate from ancestry.

Optional relationships store `{from,to}` pairs. Hierarchy edges derive from
`parentId`; hierarchy takes priority if both describe the same pair. Semantic
relationships remain separate for future “related to”, “uses” and “alternative
to” rendering. Parent changes never invent relationships.

`galaxyStorage` loads versions 1–5 and the old `tool-galaxy:user-data` key.
For pre-v5 data, valid Sun→Planet→Moon parent links and all stable IDs/content are
preserved. A collision-safe **My Galaxy** root contains former Suns and unassigned
entries. Unassigned records become its direct children; no intermediate topics
are invented and free-form labels/links are not used to guess parents. Pins
retain exact coordinates. Old soft placements become initial positions plus
relative angle/radius influences, without absolute coordinate attraction.

Before replacing an old snapshot, save its exact raw text under
`galaxy:user-data:pre-cosmic-tree`. Existing pre-hierarchy/pre-layout backups and
the legacy key remain untouched. Backup failure prevents replacing the original.
Future/unsupported versions and corrupt snapshots disable saving. The new format
is not readable by older app versions; restoring an older app requires restoring
the appropriate backup too.

`layout` stores either `{id,x,y,pinned:true}` or
`{id,parentId,angle,radius}`. Relative influences are independent of camera and
travel with a parent naturally. Reparenting clears that entry's obsolete relative
influence while keeping its pin and descendants' valid local influences.

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

A drag chooses a relative angle; the radial target blends **65% original band /
35% bounded dragged radius**. Flowing preferences cap at the normal band plus
55px for Planets, 28px for Moons, 20px for Satellites, or max(60px, 25% of the
system envelope) for Suns. Saved oversized preferences are bounded when read by
the force; new drag preferences are bounded before saving. There is no old **0.15** absolute-coordinate force. A body
can drift within the band and yields to collisions. Parent translation carries
movable descendants at any depth; exact pinned branches stay in world space.
Beyond the soft limit and radial dead zone, a local return force adds 0.008 times
the excess distance, capped at 4px per tick. It keeps alpha at least 0.06 only
while a Flowing outlier needs to return (over 12px excess), then normal cooling
resumes. Active drags and pins skip attraction. Release preserves inertia and
does not directly add heat. These are local forces; global repulsion is unchanged.

Sibling separation remains parent-local and tangential: radius sums +24px,
multiplier 1.35 for Planets or 1.15 for deeper bodies, strength 0.06 capped at
`2 × alpha` per pair. Unpinned siblings have full mobility, pins zero. Local
system repulsion remains `-radius × 1.1`. Body collision remains strength 1,
12px clearance, four iterations. Semantic links have strength 0.015 inside a
system and zero between systems; they cannot drag remote Galaxies together.

Normal velocity decay stays **0.42**, alpha decay **0.032**, alpha minimum
**0.002**. Moving a drag reheats to at least **0.22**, active alpha target **0.10**;
release preserves velocities/alpha and sets the last target to zero. Structural
changes reheat to 0.55; Pin/Unpin to 0.28; resize to 0.3. Reduced motion uses alpha
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
clouds fade between 0.58 and 0.95, leaving close bodies/local guides clear.
`cosmos-view.js` derives visual footprints from normal parent-relative positions
of contained Suns and descendants, including the Galaxy anchor. For presentation
only, distant offsets are limited to 1.4 times the preferred band plus local
clearance (40% of the system envelope +60px for Suns; body radius +32px deeper).
This bounds a temporary outlier without changing physics or saved coordinates;
its movable subtree keeps its normal local shape. Exact remote pins remain real
world objects, and Universe Fit still includes their actual coordinates.
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
depth-seven recipe branch. Normal interactions use the same model/renderer/
physics. Sample mode neither reads nor writes real saved data. Remove Sample or
refresh returns to it; the activation query is removed immediately.

Run unit tests in PowerShell: `node --test (rg --files tests -g '*.test.js')`.
Run isolated real-browser regression/visual checks:
`python tests/browser-check.py --screenshots`. The standard-library harness
launches headless Chrome/Edge with a temporary profile and local HTTP server;
it never accesses your normal browser profile. Screenshots are retained in the
printed OS temporary directory. `GALAXY_BROWSER` can select the executable.
`python tests/browser-check.py --migration-only` additionally exercises a full
saved v4 family with soft positions/pins, invalid records and future-version
overwrite protection.
`python tests/browser-check.py --performance-only` profiles active/idle rendering,
display-scale changes and individual paint layers using the isolated sample.
Add `--software-rendering` to profile without GPU compositing separately.
`python tests/browser-check.py --visual-only --screenshots` checks the 183-entry
nebula sample, all zoom tiers, zooming both directions, deep selection/search,
Food/Work/Travel zoom-out without deselection, Galaxy cloud/name and Sun
body/name clicks, all four artificial Satellite silhouettes, interrupted focus,
an extreme Planet drop, stable appearances after an actual reload, cached images,
a dragged Sun's cloud containment and Galaxy-view motion cost.
The full regression checks normal-view motion and projection budgets.
The current run passes 71 unit tests and 70 focused visual checks.
The current isolated run passes 141 full-browser checks, including baseline
motion (4.0ms projection p95; 49.9/100.1ms frame median/p95). Galaxy-cloud motion
is measured separately by the focused visual check. Frame intervals after
synthetic 1×→2×→1× display switching are reported separately: this headless stress
sequence retains slower texture repainting (116.4/216.4ms frame median/p95),
while projection remains fast (3.8ms p95). These timings depend on the machine;
verify motion on a native high-DPI display too.

Tests cover generic/deep/cyclic trees, old schema backups including quota failures,
relative-position migration, deterministic/overridden appearance, local forces,
release inertia, overlapping siblings, pins, native zoom rendering, every body
drag, CRUD/reparenting, deep search, responsive controls and sample isolation.

Before committing, try the new Universe→Galaxy→Sun navigation with your own data,
check migrated My Galaxy organization, drag parents/children at several zoom
levels, Pin/Unpin, and refresh. Focus Food, Work and Travel, zoom to 80%, then back
to Universe without changing selection; every descendant should fade. Search a
deep Satellite and repeat, including interrupting its focus transition. Check
name/cloud/Sun clicks, far-drop recovery, sparse/wide systems, and stable Satellite
variants after reload. Verify Galaxy region prominence and the quieter
orbital guides on your display. Exact pins can intentionally overlap or stretch a
branch outside its nominal region; layout does not override pins. Very deep/wide
trees have larger footprints, so Fit may zoom far out. Galaxy clouds are spatial
cues rather than hard containers or an astronomical simulation. Large production
datasets beyond this sample still need profiling. A dedicated hierarchy sidebar
and appearance picker are deferred.
At extreme fitted zoom on narrow screens, temporarily revealed search labels can
crowd together; focus and the ancestry breadcrumbs restore local reading.
