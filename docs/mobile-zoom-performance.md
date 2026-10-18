# Mobile zoom performance

## Current branch behavior

The implementation now combines pass-local viewport batching, visibility-aware
visual updates and continuous real-body overview. No render coalescing or physics
retuning is included. Galaxy roots use the small core treatment; normal rendering
creates no cloud canvases, cloud hit territories or cloud-derived Fit bounds.
The unused application cloud-render/footprint functions have been removed. The
empty regions compatibility input and separately tested appearance/archive cloud
utilities remain; they do not run in normal overview.

Ordinary label handoffs are `.24–.42`, `.64–1.12`, `1.60–2.10`, `2.70–3.60`
and `5–7`, with the existing density engine and protected interaction/lens paths.
Manual overview deselection remains user-zoom-owned. Mobile parent focus now
frames the actual canonical subtree at every depth; leaf inspection and desktop
commands retain their established behavior. See [system framing](mobile-system-framing.md).

Mobile Contents has only Compact and adaptive Contents, with Files/Notes/Links/
Location pages and no Full state. See [current Contents behavior](mobile-contents-browse.md)
for sizing, forms, controls and gesture ownership.

The sections below preserve **historical phase measurements and validation**.
Statements about cloud loops, unchanged Fit, fixed sheet heights or intermediate
label envelopes describe those revisions, not the final behavior above. External
temporary artifact paths identify retained local evidence, not runtime dependencies
or files proposed for commit. Final stabilization results are recorded separately
in [the branch review](mobile-zoom-final-review.md).

## Phase 1 history

Phase 1 snapshots the current layout viewport once at the start of a synchronous
render pass, before its DOM/style writes. It does not retain dimensions across
passes, schedule/coalesce rendering, add culling, change appearance or alter
simulation, camera, hierarchy or persistence semantics.

`readRenderViewport()` supplies `{width,height}` from `window.innerWidth` and
`window.innerHeight`. Camera updates and whole-graph rendering pass that object
through both region and body loops. Tick/settlement callbacks, selection emphasis,
search highlighting, body creation and drag completion sample before their own
render writes. Standalone body/region rendering samples fresh dimensions by
default. Mobile viewport synchronization also reads layout height before writing
its CSS variables and reuses it for the keyboard calculation.

The layout viewport remains distinct from usable graph bounds and the visual
viewport. Sidebar/Contents bounds and label metrics still use their existing
current-geometry measurements. Resize/orientation/browser-bar changes therefore
do not depend on invalidating a persistent viewport cache. No label measurement
or menu/Contents behavior was changed.

## Focused verification

```powershell
python -B tests/browser-check.py --render-viewport-only --screenshots
node --test tests/camera.test.js tests/cosmos-view.test.js tests/physics.test.js tests/label-density.test.js tests/motion.test.js
```

The new browser suite passed 206 checks: one read per dimension before writes,
shared dimensions even when subsequent getters would return different values,
fresh later passes, mobile/desktop projection and tiers, orientation/resize,
sidebar/Contents transitions, visual viewport changes and unchanged placement.
The 96 focused Node tests passed. Existing native reparent-drag (59), mobile body
gestures (49), navigation (143), Contents swipes (145), sheet sizing (39), and
label density (18) browser checks also passed.

A separate temporary comparison ran original and changed render functions on
identical fixed state. All 120 combinations of viewport (360/390/430/740/1440px),
selection, pan and six zoom scales matched exactly for body/region styles,
projection, visibility flags, semantic opacity, camera state and SVG geometry.
It freezes footprint sampling and asynchronous label requests equally in both
arms to compare rendering rather than elapsed-time effects. Normal density and
gesture behavior is covered by the separate browser suites above.

Two older suites remain baseline failures, reproduced against the exact original
script in an isolated static site: `--cloud-fade-only` expects a Galaxy label to
remain opaque even when density-suppressed; `--visual-only` expects no selected
body to retain the existing `temporarily-revealed` class after focus. Neither
assertion nor production label/selection behavior was changed in this phase.

## Before/after measurements, October 17, 2026

Fresh sequential before/after runs used the same diagnosis harness, Chrome155,
390x844 viewport, DPR3, isolated synthetic 25/75/150/325-body hierarchies, normal
and CDP4x CPU throttling. The before server served the exact saved original
`script.js`; the after server served the working tree. No viewport-property
override, offscreen suppression or render coalescing was used in either arm.

Both use normal fresh-body seeding, 350 warm-up ticks, twelve render-update
microtimings, a RAF-driven camera sweep and twenty native touch drag moves.
Physics remains active during the motion/drag measurements. These are simulated
mobile workloads on Windows, not real Android FPS measurements.

Each cell is **before -> after**:

| CBs | CPU | Zoom style-recalc events | Mean render update (ms) | Drag RAF-gap P95 (ms) |
|---:|---:|---:|---:|---:|
| 25 | 1x | 2235 -> 140 | 9.8 -> 3.2 | 17.1 -> 17.0 |
| 75 | 1x | 2573 -> 148 | 11.1 -> 8.3 | 33.3 -> 33.4 |
| 150 | 1x | 2017 -> 90 | 16.0 -> 15.5 | 50.0 -> 50.0 |
| 325 | 1x | 1048 -> 38 | 73.2 -> 52.4 | 133.2 -> 133.2 |
| 25 | 4x | 448 -> 54 | 34.0 -> 23.6 | 66.5 -> 50.0 |
| 75 | 4x | 246 -> 23 | 67.3 -> 71.1 | 232.7 -> 166.4 |
| 150 | 4x | 296 -> 14 | 118.9 -> 117.5 | 282.9 -> 316.0 |
| 325 | 4x | 305 -> 5 | 320.2 -> 311.2 | 698.7 -> 898.5 |

Style counts are totals for the camera sweep, not fixed-frame counts: rendering
speed changes how many camera callbacks complete. At the largest throttled size
the sweep completes only a few frames, so its percentile is not a reliable FPS
estimate. Render microtimings include synchronous style work but exclude later
paint; batching can defer work to the browser's rendering phase. Drag samples
include input/RAF scheduling and are descriptive single runs, not a statistical
proof of improvement or a universal performance budget.

The repeated viewport-read problem is structurally fixed and style-recalc counts
fell substantially. Timing improvement is mixed; the largest throttled drag run
was worse. This phase does not resolve dense-phone choppiness or establish a
uniform drag-speed improvement. The prior visibility-aware-rendering control
still supports investigating Phase 2 separately; it was not implemented here.

Raw before/after JSON, logs, screenshots and comparison code are retained outside
the repository in the OS temporary directory
`cosmifold-viewport-phase1-1c8e47cb80874070ae7b48e1943da833`.

Real-phone follow-up should repeat the same scene and gestures before/after,
including orientation, browser-bar changes and sheet/sidebar transitions. Confirm
no stale bounds, visual jumps or changed motion, and collect actual device frame
and style timings before claiming a phone-level speedup.

## Phase 2A: visibility-aware rendering

Every body is still visited and every physics particle/force remains active.
`renderNode` projects current world coordinates through the current camera and
uses the existing body margin, `max(100, renderedDiameter + 64)` screen pixels.
Outside that rectangle, ordinary bodies retain their DOM identity but receive
`data-render-skipped="true"`; CSS excludes their entire visual subtree with
`display:none`. Subsequent offscreen motion skips transform, label-style and
texture work. The first renderable pass removes that flag and applies all current
visual details and coordinates synchronously, before the browser paints.

Logical semantic visibility, inert state, reveal/context classes, diameter and
label opacity remain current even offscreen. Flag/class writes are guarded so
unchanged state does not mutate the DOM. This matters when zooming or exiting a
Constellation; suspending those logical updates would leave stale eligibility.
No semantic threshold, body size, label policy or fade range changes.

Exceptions retain full rendering: selection (including semantically muted
selection), hover, keyboard focus, active drag (class or physics membership),
search focus/matches/ancestors, navigation reveal, selected ancestry, Constellation
members and represented Galaxy context. Exceptions preserve the existing
semantic/culling outcome; protection does not independently reveal a body.
Cloud footprint evolution and opacity/motion state remain active; offscreen
cloud transforms use known projected footprint bounds plus 100px overscan.
Creation/interaction effects keep their existing lifecycle, deletion ghosts stay
in their separate layer, and Constellation transition endpoints remain protected.

Hierarchy lines now establish their existing context eligibility before writing
geometry. Inactive hierarchy edges skip geometry; offscreen tethers and context
edges skip geometry/style work unless an endpoint is protected. Projected segment
bounding boxes retain any possible crossing line, including lines with both
endpoints offscreen, plus `32 + 18 * scale` pixels for stroke/curve slack. Active
orbit ellipses use their projected radius plus 100px and retain protected parent
context. No general geometry cache was introduced. The active Constellation
overlay continues updating all its protected endpoints and sparse edges.

Camera, tick, selection and search passes share the Phase 1 viewport snapshot
with relationship updates. There are no per-body layout measurements, DOM
recreation, retained viewport cache, render coalescing or simulation changes.

### Phase 2A checks

```powershell
python -B tests/browser-check.py --render-visibility-only --screenshots
python -B tests/browser-check.py --render-viewport-only
```

The visibility suite passed 212 checks covering no-write offscreen motion, each
exception, retained node/particle identity, immediate pan/zoom re-entry, semantic
and label thresholds, crossing/protected tethers, orbit re-entry, solver activity,
unchanged saved placement and reduced motion. Viewports include 360, 390, 430,
740 landscape and 1440 desktop. The viewport suite passed all 206 checks; its
projection assertion now explicitly permits suspended transforms only for
offscreen subtrees and still requires exact projection whenever renderable.

Existing suites passed: reparent/native drag 59 (including descendants), mobile
body gestures 49, navigation 143, Constellations 105 and label density 18. The 102
focused Node tests for camera, semantic zoom, physics, density, motion and
Constellations passed. During implementation the Constellation suite exposed stale
offscreen semantic/context flags; those were fixed rather than weakening tests.

### Phase 2A before/after measurements

The same diagnostic fixture builder, fresh-body seeding, 350 warm-up ticks,
twelve render-update samples, 1.6-second RAF camera sweep and twenty native
touch moves were reused. Before serves the exact Phase 1 script/style snapshot;
after serves Phase 2A. Runs are sequential, Chrome 155 on Windows, 390x844,
DPR3, normal and CDP 4x CPU. All sixteen cases finished without browser
exceptions; no live profile or cloud data was used. A separate fixed-state
comparison matched visible body/region styles, semantic state, projection and
visible SVG geometry in all 120 mobile/desktop width, scale, pan and selection
combinations. Footprint sampling, asynchronous density work and CSS transitions
are frozen equally for that comparison; ordinary lifecycle/interaction tests
remain separate.

Each numeric pair below is **Phase 1 -> Phase 2A**, milliseconds:

| CBs | CPU | Close render mean | Drag RAF-gap P95 | Zoom sweep RAF-gap P95 | All-body Fit render mean |
|---:|---:|---:|---:|---:|---:|
| 25 | 1x | 7.36 -> 2.42 | 16.9 -> 17.0 | 16.8 -> 33.2 | 1.35 -> 1.05 |
| 75 | 1x | 7.21 -> 1.71 | 33.2 -> 16.8 | 33.2 -> 16.9 | 3.22 -> 2.58 |
| 150 | 1x | 11.95 -> 2.53 | 66.5 -> 17.1 | 49.9 -> 33.3 | 5.31 -> 3.91 |
| 325 | 1x | 40.39 -> 2.73 | 116.5 -> 16.9 | 99.7 -> 33.4 | 15.50 -> 6.13 |
| 25 | 4x | 57.66 -> 5.68 | 66.5 -> 66.6 | 83.3 -> 49.9 | 11.51 -> 5.48 |
| 75 | 4x | 45.49 -> 9.78 | 232.7 -> 33.5 | 299.4 -> 83.3 | 24.33 -> 13.79 |
| 150 | 4x | 132.05 -> 12.19 | 482.5 -> 49.9 | 332.9 -> 116.4 | 37.89 -> 20.33 |
| 325 | 4x | 157.46 -> 24.12 | 765.4 -> 50.0 | 565.6 -> 216.4 | 88.41 -> 26.76 |

All N bodies are still visited per full render pass. Close-view visual-update
candidates fell from N to 14 at 25 bodies and 13 at 75/150/325 bodies; 312 of the
325 visual subtrees are suspended. At all-body Fit, all N bodies still receive
visual updates, including semantically faded bodies; this phase deliberately
does not introduce semantic-only culling. Overview gains come primarily from
skipping inactive SVG geometry and avoiding unchanged class mutations.

In the 325-body close view, hierarchy geometry-update candidates fell from 321
to 2. Across the native drag workload, SVG geometry attribute writes fell from
75,608 to 1,668 at normal CPU, and 66,219 to 1,226 at 4x. Those are whole-workload
counts, not equal-frame counts: the optimized workload completes more render
passes. Inactive orbit guides already skipped geometry before Phase 2A; the new
rule additionally skips active offscreen guides with no protected parent.
Constellation geometry remains fully updated for its protected members.

A separate all-body Fit pan sweep moved the camera 60px left/right at a fixed
overview scale. At 325 bodies, its RAF-gap P95 changed from 116.5 to 50.1ms at
normal CPU and 632.2 to 216.2ms at 4x. Close-view drag therefore benefits much
more than overview pan/zoom, where many bodies and clouds still need rendering.

These are instrumented browser simulations, not Android FPS or statistical
guarantees. CPU timing varies between runs, synchronous render timings exclude
later paint, and the slow baseline camera sweeps contain very few samples (four
in the largest throttled case). The 25-body drag sample is effectively unchanged
and the first normal-CPU zoom sample is worse; no uniform speedup is claimed.
Five additional 25-body, normal-CPU zoom sweeps in each version did not reproduce
that slowdown: baseline P95 was 16.8/16.8/16.9/17.0/17.0ms and Phase 2A was
16.8/16.8/17.0/16.9/16.9ms. Both reached 96 frames per sweep after their first run.

Phase 2B remains a justified separate experiment, not part of this change. Even
after culling, the 325-body throttled drag recorded 96 whole-graph renders across
73 sampled RAF intervals. Native `moveDrag` still invokes `onTick` synchronously
in addition to simulation ticks. Coalescing may reduce overlapping visual work,
but must be measured without delaying pointer feedback or changing simulation
ordering. Real-phone verification of Phase 2A should precede that work.

Raw fixtures, saved baseline, instrumentation, JSON, logs, repeat controls and
screenshots are retained outside the repository in the OS temporary directory
`cosmifold-visibility-phase2a-32a3b63540914f9f9d4f0e3a795bc401`.

On the phone, compare the same dense scene in a close view and whole-system
overview: drag a leaf and a parent with children, pan across distant systems,
pinch rapidly across visibility boundaries, search/focus a previously offscreen
body, activate/exit a Constellation, then rotate and open/close UI chrome. Check
immediate current positions, correct labels/context, uninterrupted drag capture
and unchanged playful motion. Collect device frame traces before claiming a
real-device frame rate or deciding the next performance change.

## Continuous real-body overview

This presentation phase follows the real-phone validation of Phases 1 and 2A.
It does not implement render coalescing or redesign system Fit.

Normal rendering no longer creates/bakes Galaxy cloud canvases, samples/eases
cloud footprints, projects cloud transforms, or triggers the cloud-focus pulse.
The regions layer/map remain empty compatibility inputs; legacy cloud artwork,
footprint and snapshot helpers remain available for isolated historical tests.
The Universe background/starfield is unchanged. Supabase/cloud-storage behavior
is unrelated and untouched.

Each Galaxy has a small luminous core at its actual world root, using two static
CSS radial gradients rather than a spiral symbol, bordered disc or cloud.
Its bounded footprint is 14px through the widest overview, easing to 22px between
scales .08 and .58; the bright center occupies only a small fraction of that area.
Glow alpha stays fixed (.30 at its center, fading to transparent); there is no
filter, raster bake or continuous animation. The name carries identification.
Its label prefers below the core, using the existing 14–16px Galaxy typography
and density priority. Before the same density pass, it can choose above/either
side to avoid projected bodies, protected labels and other Galaxy names. If a
close Sun covers all default placements, edge-derived clearance is bounded to
64px. Impossible collisions still use the existing suppression/protection rules;
this is not a guarantee that arbitrarily coincident protected labels can all fit.
Geometry is cached/projected, with no additional DOM measurements. Obstacles are
only collected if an eligible Galaxy label needs placement.
Root projection and labels never consult a cloud footprint. Background
Galaxy hit-testing uses the actual marker's screen-space circle; the native
button/label keep the existing canonical selection, context menu and drag paths.
The Galaxy core uses a modest 20px minimum native hit span, behind physical
bodies in paint/hit order; its visible name is also a native interaction target.
There is no invisible cloud territory. At scale .28 and below, ordinary marker
hit spans use at least 12px rather than overlapping 44px spans that could mask
neighboring tiny bodies. Revealed/selected controls retain their normal targets.

Body detail uses these continuous policies:

| Role | Overview body policy | Screen-size floor |
|---|---|---|
| Galaxy | Always present; actual root core | 14px |
| Sun | Opacity .82 -> 1 across .04 -> .30 | 6px |
| Planet | Opacity .58 -> 1 across .08 -> .50 | 2.5px |
| Moon | Smooth fade 0 -> 1 across .14 -> .55 | None |
| Satellite | Existing .70 -> .79 fade | None |
| Astronaut/deep item | Existing .74 -> .86 fade | None |

Existing context/Constellation attenuation still applies. The tier boundaries,
close body caps and inspection caps are unchanged. Selection now wins at wide
zoom as well as search, hover, keyboard focus and active navigation reveal;
normal selected-body emphasis is no longer muted just because the tier is wide.
Transient navigation reveal still clears at camera rest through its existing
lifecycle; explicit navigation continues to identify the target afterward.

Ordinary labels now use the hierarchy handoff policy documented below. Suns,
Planets and closer detail use readable 10px type when eligible; Galaxy labels
retain their existing 14–16px type. The existing
collision grid, scale-aware hierarchy priority, throttling and hysteresis choose labels;
there is no second label engine. Protected selected/search/focus labels continue
to win over ordinary overview labels.

Glows, shadows and rings ease in across .28 -> .68. At .28 and below ordinary
bodies exclude their zero-opacity texture/shading pseudo-elements and rings from
display. Body gradients/silhouettes stay continuous; detail does not abruptly
swap to different artwork at that boundary. Surface texture disclosure remains
.5 -> 1, and no low-zoom texture generation is introduced. Close-view computed
paint matches the saved Phase 2A stylesheet for 148 non-Galaxy bodies (including
Sun/Planet/Moon paint and Satellite/Astronaut SVGs).

Global Fit still targets the whole active Universe and includes all descendants.
Its bounds now include actual roots and remove the cloud's inflated/easing
extents; camera padding, system-focus bounds, winsorized outlier treatment,
navigation scales and saved positions are otherwise unchanged. This is the
cloud-geometry dependency removal, not the next mobile framing redesign.
Archive snapshots now include the actual Galaxy marker, allowing an empty
Galaxy to animate without a cloud; archive/restore data and timing are unchanged.

### Overview verification

```powershell
python -B tests/browser-check.py --real-body-overview-only --screenshots
python -B tests/browser-check.py --render-visibility-only
python -B tests/browser-check.py --render-viewport-only
```

The new suite passed 334 checks across 150/325 bodies and 360/390/430px,
740x360 mobile landscape and 1440px desktop:
no cloud baking/DOM, no cloud influence on projection/bounds/hit-testing, actual
root input, sparse Fit labels, continuous Sun/Planet eligibility and size,
semantic deep detail, selected/search/navigation label overrides, root-only
archive snapshots, restored close detail and unchanged world/saved positions.
Phase 2A's 212 checks and Phase 1's 206 checks pass. Existing checks also pass:
native reparent drag 59, mobile body gestures 49, navigation 143, Constellations
105, density 18 and archive/restore 65. The 113 Node tests for camera, semantic
zoom, physics, density, motion, appearance, archives and Constellations pass.

The Constellation threshold assertions now explicitly cover the new earlier
Sun/Planet/Moon disclosure while retaining the lens's far-zoom suppression.
Archive tests now require real root snapshots and no cloud canvas; its mobile
action follows the existing quick menu's More route instead of clicking the old
hidden menu. Historical cloud-fade/region browser suites describe a retired
presentation and are superseded by the new overview suite; standalone legacy
cloud math remains unit-tested.

### Overview measurements

Fresh sequential runs compare the saved Phase 2A `script.js`, `style.css` and
`cosmos-view.js` with this phase. Chrome 155, isolated synthetic 150/325-body
fixtures, 390x844, DPR3, normal/CDP 4x CPU, the same 350 warm-up ticks and twelve
render samples are used. All eight cases completed without browser exceptions.
No viewport getter overrides, render coalescing, live profiles or cloud data
participate. Tests/benchmarks were not run concurrently.

The comparison below fixes the camera to the same actual-body bounds in both
versions, rather than attributing a framing change to rendering performance.
Pan is a 1.6-second 60px sweep at that fixed scale; zoom is a 1.6-second logarithmic
.02 -> .35 -> .02 sweep centered on the same Sun. Physics is paused for those
camera/render measurements. A separate overview-motion pass reheats the unchanged
full simulation to .22 and resumes all particles/forces.

Pairs are **Phase 2A -> continuous real-body overview**, in milliseconds:

| CBs | CPU | Fixed overview render mean | Pan RAF-gap P95 | Zoom RAF-gap P95 | Active overview motion P95 |
|---:|---:|---:|---:|---:|---:|
| 150 | 1x | 2.62 -> 3.38 | 33.4 -> 33.2 | 33.3 -> 33.3 | 17.0 -> 16.9 |
| 325 | 1x | 7.55 -> 6.76 | 66.6 -> 49.9 | 66.7 -> 49.9 | 33.4 -> 17.2 |
| 150 | 4x | 26.08 -> 12.68 | 150.0 -> 99.8 | 183.1 -> 149.8 | 183.2 -> 83.2 |
| 325 | 4x | 58.34 -> 26.08 | 366.2 -> 166.5 | 465.8 -> 249.7 | 299.4 -> 149.7 |

Ordinary product Fit was measured separately, allowing its authorized cloud-bounds
removal: render means were 6.97 -> 6.71ms (150/1x), 7.52 -> 7.12ms (325/1x),
25.04 -> 13.20ms (150/4x), and 53.62 -> 24.03ms (325/4x). Fit scales changed from
approximately .0314 to .0360 for 150 bodies, and .0206 to .0221 for 325 bodies.
There is no extra Fit policy or layout change.

At the common widest overview, semantically present bodies increased from just
2 Galaxy roots to 32 real markers (2 Galaxies, 6 Suns, 24 Planets) in the 150-body
scene, and from 4 roots to 69 markers (4 Galaxies, 13 Suns, 52 Planets) in the
325-body scene. Ordinary visible label counts stayed at 2 and 4, respectively.
All 150/325 particles remain in the simulation and Phase 2A culling is unchanged.

The small normal-CPU render cost rose by .76ms in this sample; no uniform speedup
is claimed. These are descriptive browser-simulated timings, not Android FPS or
a statistical guarantee. Synchronous render samples exclude later paint. The
slow baseline sweeps complete very few frames, limiting percentile precision.
Dense throttled overview still warrants physical-device review.

Raw saved baseline, fixture builder, JSON, logs, close-paint comparison and
before/after screenshots are retained in the OS temporary directory
`cosmifold-real-body-overview-c7eb8f14398544b9b7e8643711ba6986`.

On the real phone, pinch fully out and back in; compare Universe Fit and a whole
system focus, watch Galaxy/Sun/Planet scale hierarchy and marker overlap, verify
selected/search labels orient you without a text wall, and pan quickly through
culling boundaries. Inspect Sample at 360/390/430px and after rotation, including
Galaxy tapping and leaf/parent dragging. Spacing/framing remains the existing
spatial layout and is deliberately reserved for the next Fit task. Do not infer
that coalescing or a physics/layout change has been implemented.


### Galaxy core refinement review

The spiral baseline for this refinement was saved separately from the old-cloud
baseline. Only Galaxy artwork, its presentation diameter and immediate label
placement changed; viewport batching, culling, role fades, physics, Fit and saved
positions remain unchanged. The SVG's five elements are replaced by one span per
Galaxy. Galaxy label placement extends the existing `LabelDensity` class; the
shared grid, priorities, hysteresis and request cadence are unchanged.

Responsive synthetic scenes contain 150 and 325 bodies at 360?800, 390?844,
430?932, 740?360 and 1440?1000. Checks cover continuous diameters, multi-Galaxy
overview, core/label native targets, a Sun inside the expanded core hit span,
a nearby Sun across the default name position, a close Sun directly over the
root, protected selected-Sun labels, no filters/animation/canvas and unchanged
world/saved positions. Screenshots include overview, system focus, root-centered
medium/close views and controlled overlap cases. These are browser-simulated
mobile layouts, not physical-device results.

Bounded performance comparisons used Chrome 155, 390?844/DPR 3 and 4? CPU
throttling, paused identical synthetic scenes, 60 render samples and a 2.4-second
camera sweep. The independent-browser sweep/frame timings were noisy: 150-body
RAF p95 166.5?233ms, 325-body 349.2?199.8ms. Render means also varied (3.87?6.82ms
and 8.16?11.99ms); these runs do not establish a reliable overall frame-time
change or physical-phone FPS. No extra body-render/physics work was introduced.
To isolate the new label work, the same 325-body browser alternated the saved
baseline label callback, current callback, and baseline again, with ten warmups
and sixty measured samples each. Mean label costs were 3.29 / 5.88 / 4.30ms
(medians 2.8 / 4.9 / 3.9ms) at 4? throttle. The added clearance is small but not
free and remains on the existing 120ms-throttled label path. No new per-label
layout reads were added. Temporary measurement code and baseline snapshots are
outside the repository, in:

`%TEMP%/cosmifold-galaxy-anchor-e3b5a4d23521425883b31015751bade6`

Phone review should check that the very small luminous center remains legible
on the physical display, names remain associated with the correct Galaxy when
a Sun covers its center, nearby Suns remain easy to tap, and label changes during
pinch zoom do not feel distracting. Arbitrarily coincident protected names may
still overlap; no global label engine or body-layout changes were introduced.


### Manual overview release and initial hierarchy label handoff

A decreasing camera frame with explicit `user-zoom` ownership releases ordinary
canvas selection at scale **.45 or below**, the existing Universe/overview tier
boundary. This includes a further outward gesture after explicitly selecting a
body at an already-wide scale. Pinch, native wheel/trackpad and the zoom buttons
supply this ownership. `setView`/`zoomAt` default to programmatic ownership;
animated navigation reports navigation ownership. Each callback includes its
previous rendered scale, so an inward wheel gesture, pan, resize, Fit, search or
programmatic focus cannot accidentally release selection. Ownership is replaced
when a new camera operation starts; it does not leak from a prior wheel gesture.

Release is one-way: nothing restores an old selection on zoom-in or boundary
oscillation. No extra threshold timer or re-selection hysteresis is needed.
Expanded Contents (`panel.hidden === false`) and active CRUD retain selection:
those flows continue to own their content/edits. After closing Contents, the next
outward overview gesture can release the ordinary selected card normally.

The release cancels pending body focus/double-tap state and the selection accent, blurs the old body if
focused, clears its matching hover/system and search-hover records, then reuses
`clearSelection` to clear selection, navigation reveal IDs, hierarchy emphasis,
ARIA pressed state, Content selection and the compact card. The existing render
pass immediately restores ordinary diameter, disclosure and label priority.
Its viewport snapshot is also reused by selection-emphasis rendering. Native
`:hover` no longer bypasses the renderer's label-priority class, preventing a
wheel anchored on the old body from keeping its label bright. Fresh intentional
hover/focus/selection still uses the existing reveal handlers/classes.

Ordinary label policy is shared once per camera update in `semanticDetail.labels`.
Galaxy/Sun/Planet/Moon CSS opacity uses shared viewport role variables; only
ID-staggered Satellite/deep labels write individual opacity variables. Logical
per-node opacity still feeds the same density pass.
No body visibility, texture, size, layout, physics, saved positions or Fit bounds
change. Galaxy core artwork, target footprint and typography remain unchanged.

| Ordinary label | Fade in | Parent handoff/fade down | Logical floor |
|---|---|---|---|
| Galaxy | Present at wide overview | .30?.78 | .08 |
| Sun | .10?.45 | .58?1.30 | .06 |
| Planet | .38?.90 | 1.12?2.40 | .08 |
| Moon | .90?1.35 | 1.80?3.60 | .08 |
| Satellite | Existing 1.10?2.70 + stable ID offset (0?.55) | 4.20?7 | .08 |
| Deeper item | Existing 2.70?7 + stable ID offset (0?1.50) | No later layer | 1 |

Fade-in and handoff multiply, using the existing smoothstep calculation. Child
names begin before parents finish yielding. Galaxy names stay at the existing
14?16px; other eligible labels use the existing native font sizing. No growing
billboards are introduced. The existing .18 ordinary eligibility cutoff and CSS
opacity transition remain in effect, so low-floor parent labels become hidden.

The same `LabelDensity` grid, tolerance, hysteresis and 120ms request cadence run
once. Only ordinary collision ranking changes: base role rank (Galaxy 4 through
deep item 9) plus `8 * (1 - retained parent strength)`. Thus a yielding parent
loses collisions to the next useful child layer. Explicit selected, interactive,
search and selected-ancestor priorities remain ahead of ordinary ranks. Existing
Constellation lens opacity/ranks and its forced Galaxy context labels are
preserved; leaving that lens returns to the current ordinary handoff policy.
The legacy `fades.*Label` rise values remain inputs to that preserved lens.

`--semantic-handoff-only --semantic-handoff-size 150` and the corresponding
`--semantic-handoff-size 325` run each disposable scene in a fresh browser profile,
keeping native touch input independent of prior device/renderer emulation. They test native input at
360?800, 390?844, 430?932, 740?360 and 1440?1000. It verifies release, actual CSS
opacity/outline, no re-selection, expanded-Contents retention, native pinch,
wheel anchored on the selected body, explicit navigation/search overrides,
scale-dependent collision priorities, rapid reversal, and unchanged world/saved
positions. Tests wait on input/camera/density state rather than timing the
production behavior. Performance comparison scripts/baselines live outside the
repository at:

`%TEMP%/cosmifold-label-handoff-90ea145bc22a4fab9f9972736399c0f4`


Final validation: 117 unit checks passed (camera, semantic view, density,
physics, motion, Constellations, appearance and archives); the focused 36
camera/view/density checks passed again. The native semantic suite passed 185
checks per fresh profile (150 and 325 bodies, 370 total), including final CSS
opacity and immediate accent cancellation. Viewport batching (206), visibility
rendering (212), navigation (143), real-body overview (384), mobile body input
(49) and Constellation behavior (105) passed. JS/Python syntax and whitespace
checks passed. Screenshots were reviewed at all five viewport sizes.

Final performance comparison uses Chrome 155, 390?844/DPR 3, 4? CPU throttling,
paused synthetic hierarchies, completed texture baking and 1.5s warmup. Each arm
samples twenty render/label passes and three 2.4s overview zoom sweeps (.02?.35
and back). Baseline and final code use identical fixtures and framing; no physical
phone FPS is inferred. Final repeated-run results, in milliseconds:

| CBs | Mean render before ? after | Mean zoom RAF gap before ? after | Zoom RAF gap p95 before ? after |
|---|---|---|---|
| 150 | 3.90 ? 3.71 | 139.81 ? 126.01 | 299.4 ? 199.5 |
| 325 | 11.57 ? 7.30 | 142.26 ? 133.59 | 199.8 ? 199.7 |

The 150-body frame-gap sample counts were 56/62; the 325-body counts were 53/55.
Earlier single-sweep tails were variable, so they are retained as diagnostics,
not treated as reliable phone performance. A first per-node normal-opacity
implementation showed worse tails; ordinary-role CSS opacity was moved onto the
existing shared viewport variables, with per-item values retained only for deep
ID-staggered labels. The final repeated comparison shows no material regression;
Phase 1/2A regression checks also remain green. All raw 60-sample single-sweep
results, repeated results and intermediate per-node measurements remain in the
external artifact directory above. No diagnostic instrumentation was added to
product behavior.

On the real phone, select a Planet, pinch outward past overview and verify its
card/emphasis disappear. Zoom back inward without tapping and verify it stays
unselected. Then watch Galaxy ? Sun ? Planet ? Moon/deeper handoff in both
directions, including fast reversals and densely packed centers. Judge the .45
release point, label pacing, touch/drag continuity and smoothness on the actual
device. Expanded Contents intentionally retains selection; close it to test the
ordinary card release. Fit remains unchanged for its separate follow-up task.


### Coordinated label visibility envelopes (current policy)

The manual overview release above is unchanged. Real-phone feedback found the
first label handoff too independent: long overlapping rise/yield curves, residual
parent floors, an 18% density eligibility cutoff, ID-dependent deep-label timing
and cardinal/extended Galaxy name placement obscured the hierarchy transition.
The preceding fade table and moving-anchor description are historical; the
following policy supersedes them without changing Galaxy artwork or body policy.

Normal orientation is now a sequence of adjacent shared envelopes. At any scale,
exactly one layer has strength 1, or two adjacent layers share a smoothstep
crossfade whose strengths sum to 1. Parents finish at zero; no third layer enters
until the previous handoff is complete. Ordinary deep names share their layer's
timing instead of individual ID offsets. Tether staggering is unchanged.

| Layer | Emergence | Dominant band | Departure |
|---|---|---|---|
| Galaxy | Already present at far overview | through .24 | .24?.42 |
| Sun/system | .24?.42 | .42?.64 | .64?1.12 |
| Planet | .64?1.12 | 1.12?1.60 | 1.60?2.10 |
| Moon | 1.60?2.10 | 2.10?2.70 | 2.70?3.60 |
| Satellite | 2.70?3.60 | 3.60?5 | 5?7 |
| Deep item | 5?7 | 7 and above | No deeper role |

The shortened Galaxy/system crossfade ends near the existing Galaxy tier (.45).
Planet emergence starts just before close (.78); deeper bands leave
stable orientation ranges between transitions. Those tier constants, body
fades, sizes and camera limits are unchanged. The existing ordinary zoom cap
is 3; deeper bands are available through the existing close Moon-ancestry
inspection context (up to 12). Tests also evaluate those bands without explicit
reveal overrides by setting a diagnostic camera limit. Typography remains 14?16px for
Galaxy names and the existing native size for other roles; no label travel,
billboard scaling or independent animation is added.

The existing density resolver receives ordinary priority
`4 + 6 * (1 - envelope strength) + roleIndex * .001`, so stronger semantic layers
win before spatial collision suppression. Exact crossfade ties favor the parent.
Explicit interaction/search/navigation and selected ancestry retain their ranks
and reveal exceptions. The established Constellation lens keeps its own fades,
context and ranks. Density grid, overlap tolerances, 120ms cadence, 240ms restore
hysteresis and existing CSS opacity easing are unchanged. Positive envelope
strength now enters that same pass, including faint emergence below .18; zero
strength is excluded. The .18 threshold remains only a reporting definition of
perceptible text in the measurements, not a visibility switch.

Galaxy names stay centered four pixels below the actual root's projected edge.
Collision handling no longer flips them above/beside a root or shifts them up to
64px. Projected body clearance can suppress an obscured ordinary root name;
other name collisions use the same density resolver. Explicitly revealed roots
remain anchored and protected, even if pathological coincident protected targets
cannot all be simultaneously clear. Modest core hit targets and neighboring-body
hit ordering are unchanged. No cloud footprints are consulted.

There are no new viewport/layout-read call sites, collision passes, physics
changes, render scheduling changes or persistent state. Cached label measurements
and projected geometry stay on the existing throttled path. Reverse/rapid zoom
computes the same envelopes directly from the latest camera scale.


Validation for this revision: 61 unit checks passed across camera, semantic view,
density, motion, Constellations, appearance and archives. Browser checks passed:
383 semantic checks (150-body fixture plus real Sample), 268 semantic checks
(325-body fixture), 206 viewport batching, 212 visibility, 394 real-body overview,
105 Constellations, 143 navigation and 49 mobile/desktop body interactions. A
separate Sample-only run passed 80 checks after explicitly awaiting viewport
resize delivery before framing. The ordinary-opacity change preserves the lens's
previous .18 density cutoff; its final Constellation rerun also passed 105 checks.
One concurrent mobile input run had a fixture target-exposure failure; the
isolated diagnostic rerun passed all 49 checks without product gesture changes.
No diagnostic hooks were added to product code. Syntax, Python AST and whitespace
checks passed. Camera/CSS/core, selection release, body fades, non-label rendering,
Constellation lens, Fit and navigation were compared with the saved start-of-task
code and are unchanged.

Measured perceptible labels before the small early-handoff tuning below, on the
real 282-body Sample at 390?844/DPR 3:

| Scale / framing | Galaxy | Sun | Planet | Moon | Satellite | Deep item |
|---|---|---|---|---|---|---|
| Whole-Universe Fit (.02428) | 4 | 0 | 0 | 0 | 0 | 0 |
| .03, Galaxy | 4 | 0 | 0 | 0 | 0 | 0 |
| .44, system transition | 1 | 0 | 0 | 0 | 0 | 0 |
| .60, system | 0 | 1 | 0 | 0 | 0 | 0 |
| .95, Planet transition | 0 | 0 | 1 | 0 | 0 | 0 |
| 1.30, Planet | 0 | 0 | 1 | 0 | 0 | 0 |
| 2.40, Moon | 0 | 0 | 0 | 1 | 0 | 0 |
| 4, Satellite | 0 | 0 | 0 | 0 | 3 | 0 |
| 9, deep item | 0 | 0 | 0 | 0 | 0 | 3 |

These count actual computed label opacity >= .18, no density suppression, and
rectangle intersection with usable canvas bounds. They are view-specific counts,
not all logically eligible offscreen names. During transitions the density engine
may show only one of the adjacent layers when names collide. Other rows follow
the relevant Sample branch; they do not all share one camera center. Both
synthetic fixtures additionally log counts through all five transition midpoints
inward and outward. Protected explicit targets may intentionally add another
layer. Screenshots cover 360/390/430px, landscape and desktop.

Current baseline, temporary benchmark/diagnostic drivers and raw comparison
results are retained outside the repository at:

`%TEMP%/cosmifold-label-envelopes-72c6cfe9e3154a4a9d5fbfb4f8f97416`

Real-phone review: slowly pinch Universe ? Galaxy ? system ? close and back.
Check that a parent softens while its immediate child takes orientation, with a
stable label band between transitions. Reverse midway through each handoff and
try rapid alternating pinch direction. Check dense centers for residual parent
names or positional jumping, then explicitly search/focus a hidden-depth item.
Manual overview deselection must still behave exactly as previously approved.
Collision suppression remains intentional; exactly coincident protected targets
can overlap rather than moving their names away from their actual roots. These
browser checks cannot establish the perceptual pacing of a continuous pinch on
the physical phone. Fit, artwork and body visibility remain out of scope.


Verified performance comparison for the preceding envelope revision: Chrome 155, 390?844/DPR 3, 4? CPU throttle,
paused identical 150/325-body fixtures, completed initial textures and 1.5s warmup.
Twenty render/label samples per arm; three 2.4s overview sweeps (.02?.35?.02)
and three system/close sweeps (.24?2.4?.24). Diagnostic bounds are explicit;
all reported label-count scales are asserted against the actual camera scale.
The normal production camera limits are unchanged.

| CBs | Render mean before ? after | Label mean before ? after | Overview RAF mean/p95 before ? after | System/close RAF mean/p95 before ? after |
|---|---|---|---|---|
| 150 | 3.44 ? 2.90ms | 2.62 ? 1.96ms | 121.33/233 ? 129.11/282.9ms | 52.85/116.5 ? 63.15/133.1ms |
| 325 | 5.40 ? 5.13ms | 4.08 ? 4.01ms | 155.63/249.5 ? 146.69/249.6ms | 89.57/149.8 ? 85.50/133.2ms |

Render/label means were lower, while frame pacing was mixed: 150-body gaps were
worse and 325-body gaps improved. These do not prove unchanged physical-phone
smoothness or a frame-rate improvement. No further optimization or timing change
was made to chase these samples. Overview frame counts were 63/59 and 49/54;
system/close counts were 138/116 and 83/87 (before/after). Total style-recalc counts
across both sweep types were 399?334 and 278?265, with differing frame counts;
they are not fixed-frame per-render comparisons. Style-recalc durations were
11227?11613ms and 12047?12438ms. The existing Phase 1/2A checks remain green.

Earlier incomplete benchmark attempts are retained separately. One reporter
assumed new policy metadata existed in the baseline; another exposed camera
clamping. Their high-scale counts are not used. The final comparison uses
`benchmark-verified.py` and `verified-before/after-zoom-repeat.json`. All original
artifacts remain retained; no diagnostic instrumentation is in product code.


The controlled before/after counts used identical centers in both arms. At .60,
150- and 325-body fixtures changed from one Sun + three Planet names to one Sun.
At 1.30, one Planet + two Moon names became one Planet; at 2.40, one Moon + one
Satellite became one Moon. At 1.85 the old three-level mix (Planet/Moon/Satellite)
became just Planet/Moon. At 4 and 9 the framed fixtures still showed one
Satellite and one deep-item name respectively in both arms, rather than moving
the earlier clutter into those dominant bands. Full per-role counts at twelve
scales are retained in both verified JSON reports.


### Small early-handoff tuning

Only two band values changed: Galaxy/Sun .30?.58 ? .27?.46, and Sun/Planet
.78?1.12 ? .70?1.12. The first shortens overlap so the Galaxy name reaches zero
near the Galaxy-tier boundary, before it can linger over the Sun. The second
brings Planet names forward gently: strength is about .095 at .78 and .259 at
.84, while Sun strength is still .905 and .741 respectively. Planet strength
reaches 1 at the same 1.12 scale; its dominant/fade-out and all deeper envelopes
are unchanged. The shared complementary smoothstep model, collision priorities,
engine, explicit reveals, rendering, selection release, core, bodies, Fit,
physics and storage are unchanged.

The focused tests cover these new endpoints, bounded smoothstep slopes and
secondary early Planet strength. Dense Sample checks include a four-second
continuous zoom inward/outward at 360/390/430px, landscape and desktop, plus
settled snapshots through the earlier emergence. Existing forward/reverse,
rapid reversal, collision, search/focus, native wheel/pinch deselection and
anchoring checks remain in place. The constant-only product change introduces
no new rendering code or layout-read call sites; no performance optimization was changed.


Tuning validation passed: 62 unit checks, 409 semantic/Sample browser checks
(150-body fixture plus real 282-body Sample), and 274 checks on the 325-body
fixture. All five viewport sizes passed continuous inward/outward checks; settled
screenshots show Sun names taking orientation at .44 and secondary Planet names
at .84. Only adjacent layers coexist; no Galaxy/Planet overlap is introduced.
Renderer, camera, stylesheet and density-engine files were byte-compared with
the start-of-tuning snapshot and are unchanged. The only product edit is the two
band literals plus their comment. Syntax and whitespace checks passed.


### Earlier handoff follow-up

Real-phone feedback prompted one more constant-only adjustment: Galaxy/Sun
.27?.46 ? .24?.42; Sun/Planet .70?1.12 ? .64?1.12. Galaxy now finishes yielding
before the .45 tier boundary. Planet strength is approximately .043 at .70,
.206 at .78 and .376 at .84, remaining secondary to Sun through early emergence.
Full Planet dominance still begins at 1.12, and its departure and all deeper
bands are unchanged. The shared complementary smoothstep model, collision
rules, explicit reveals, selection release, artwork, body visibility, Fit,
physics and rendering code are unchanged. Previous measurement/tuning sections
above remain historical evidence of their stated revisions.


Follow-up validation: 62 unit checks, 413 semantic/Sample browser checks and
278 dense-hierarchy browser checks passed. Continuous inward/outward camera
movement and settled screenshots were reviewed at 360/390/430px, landscape and
desktop. Only adjacent layers were present, wide overview stayed Galaxy-only,
and early Planet names remained subordinate to Sun. Product scope was verified
against the pre-tuning snapshot: exactly two band literals changed. Syntax and
whitespace checks passed; no commit or push was performed.
