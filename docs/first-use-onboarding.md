# First-use onboarding

The welcome bridges an empty workspace to creating ordinary Items. It contains
the Cosmifold name, a short purpose statement, familiar examples, a decorative
live preview, one primary **+ Create your first Item** button and the existing
Help entry point. There is no authentication dependency or new creation system.

## Architecture and isolation

`FirstUseOnboarding` in `first-use.js` controls the welcome and two temporary
hints. `syncFirstUse()` in `script.js` checks that both `entries` and
`archivedEntries` are empty. Explicit Sample mode and unavailable/unreadable
storage do not show the welcome. A previously used or restored empty Universe
does show it, regardless of old `firstItemCreated` or completed hint preferences.
Existing content, including archived content, suppresses it.

`FirstUsePreview` owns an immutable array of 117 fictional records: 30 real
Galaxy roots and 87 descendants. Its DOM, fixed coordinates, scripted camera and
label state are isolated. It never calls repositories, persistence, production
ID allocation, physics or canonical Maps. Demo entities cannot enter Search,
sidebar, Tasks, Constellations, Backup or Restore. No content UI is simulated.
The 45 records from the preceding preview are unchanged, including every Japan
Trip descendant and the first six Galaxy roots. All 72 new outer records exist
from mount; none spawn, fade in or disappear according to animation time.

## Real hierarchy and fixed geography

The original branch retains the full canonical production mapping:

| Human label | Production role | Depth |
| --- | --- | --- |
| Travel | Galaxy | 0 |
| Japan Trip | Sun | 1 |
| Tokyo | Planet | 2 |
| Stay | Moon | 3 |
| Hotel | Satellite | 4 |
| Reservation / Check-in | Astronaut | 5 |

Japan Trip's 23-body subtree still includes Tokyo's Stay/Food/Places branches,
Kyoto and Osaka. Travel, Recipes, Home, Learning, Projects and Ideas remain the
first macro reveal. Their coordinates and existing child systems are unchanged.

Twenty-four additional independent roots surround them: Health, Fitness, Books,
Music, Photography, Career, Finances, Hobbies, Friends, Family, Goals, Garden,
Car, Events, Inspiration, Courses, Home Projects, Memories, Volunteering, Writing,
Outdoors, Pets, Celebrations and Collections. Each has two ordinary Sun children;
only Japan Trip needs a deep hierarchy. `galaxyModel.roleAtDepth()` assigns the
roles, and tests check the entire forest against `normalizeHierarchy()`.

`firstUseOuterSystems` holds explicit positions, with near groups roughly
1,600-2,850 world units from the original region and peripheral groups reaching
4,500 units horizontally / 3,050 vertically. There are unequal gaps, side groups,
asymmetry and different child offsets. The arrangement is neither a grid nor a
perfect ring. Nothing moves in world space. The camera discovers new physical
territory, then lets outer systems leave the frame naturally during the return.

## Production rendering and labels

Every body calls the existing `renderCelestialBody()` artwork renderer. Native
Galaxy cores, Sun surfaces, Planet/Moon artwork, craft, Astronauts, starfield,
orbital guides and hierarchy tethers remain. There is no whole-scene scaling;
world projection controls spacing while each body receives its own native size.

`cosmosView.detail()`, `renderedDiameter()`, `renderCap()`, `galaxyDiameter()`,
`terminalLabelIds()`, `labelDisclosure()` and `labelPriority()` are reused without
modification. Bodies retain real size caps, fades and terminal-label behavior.
The Hotel climax remains approximately 26px / 14px for Hotel and its children;
Planet/Moon caps remain 32px / 16px. At extreme wide, native Galaxy cores stay at
the 14px minimum and Suns at their 6px overview minimum. These are genuine model
entities, not decorative dots or an alternate Galaxy rendering.

The existing production overview paint is also reused at scale <= .28. Its CSS
selectors now include `#first-use-preview` in addition to `#graph-viewport`, with
identical declarations/specificity. This removes distant surface layers, rings
and shadows while leaving the real cores and native gradients. The depth artwork
and production canvas behavior are unchanged. Bodies outside the preview are
culled; offscreen geometry writes and inactive relationship writes are skipped.
There is no force simulation or additional persistent work/subscription.

`firstUseLabelCandidates()` is a pure, preview-local screen-space layout helper.
It leaves production semantic eligibility/opacity untouched. It reuses the
production root-name body-obstruction rule (3px body margin, 24% overlap tolerance,
focus protected), then sends candidates through `LabelDensity.resolve()`.
To avoid thirty names obscuring the field, a preview density budget permits
`ceil(36 / max(6, visibleRootCount))` root labels, prioritizing the original region.
That budget depends on projected visible roots, not elapsed time or a new zoom
threshold. It is separate from semantic eligibility and never shrinks text.

The early macro view prioritizes the original primary names; as more territory
enters, the density budget reduces that set. At final cosmic distance the
preview-only optical envelope suppresses all labels, including Travel. Native
Sun/Planet names have already yielded by these scales. At depth, focus, immediate
children, parent and siblings retain the preceding priorities and continuous
context weights. Production protected tethers remain at .25 opacity. No tutorial
captions, arrows or feature overlays are added.

## Deepest-family horizontal anchor

Tracing the camera and projected Hotel position identified the rightward nudge at
10.5-10.8s, immediately after the deepest hold. The old Hotel camera X was 111;
the fixed macro X was 110. Interpolating that one-world-unit difference at scale
8.6 / 9 shifted the composition right by 8.583px compact / 8.982px roomy desktop.
There is no separate Reservation/Check-in camera target, dynamic bounding-box
centroid, collision compensation or viewport correction. X/Y was already constant
during the 9-10.5s hold itself.

The Hotel pose now shares macro X=110. Its approach still uses the original zoom
and position easing, and its framing retains the same bodies, size, label rules,
connectors and Y=-53.5. Hotel sits a steady 8.6px / 9px right of preview center in
the deepest hold. Its center is constant throughout that hold; the following
10.5-10.8s boundary now has zero camera X movement and only ~0.018px of horizontal
Hotel projection change caused by the existing zoom curve.

Y is deliberately unchanged: Check-in needs the existing top headroom at 360px.
It remains fixed through the deepest hold, then makes the existing +.5-world-unit
vertical-only adjustment at the initial retreat. No additional correction, pause,
zoom keyframe or simulation is introduced. Tokyo/Stay through 7.7s, all camera
Y/zoom/context values, the macro path from 10.8s onward, the dissolve, starfield-only
interval, loop, reduced motion and all native renderer/lifecycle code are unchanged.

## Straight cosmic pullback

The loop remains 24.5 seconds:

| Time | Motion |
| --- | --- |
| 0-2.3s | Unchanged Japan Trip overview |
| 2.3-4.7s / 4.7-5.4s | Unchanged Tokyo approach / hold |
| 5.4-7s / 7-7.7s | Unchanged Stay approach / hold |
| 7.7-9s / 9-10.5s | Unchanged Hotel approach / deepest hold |
| 10.5-10.8s | Start outward zoom and complete the existing tiny vertical adjustment |
| 10.8-19.75s | Continue the same zoom curve with X/Y locked |
| Around 19.31-20.01s | Stars-only breath hides the continuous 19.75s reversal; no static hold |
| 19.75-24.5s | One straight, continuous approach to the exact Japan Trip overview |

The previous zig-zag came from using Hotel, Stay, Tokyo, Japan Trip and multiple
macro landmarks as camera-center targets, even though zoom was continuous.
Those targets are now used only as scale/ID pairs for semantic family emphasis.
They contain no outbound X/Y coordinates. The camera never chases those families.

The selected preview macro center is **(110,-53)** on both paths. Hotel's camera
center is (110,-53.5), so X is locked from its established deepest composition
onward. The only outbound adjustment is +.5 world units in Y, eased over .3 seconds.
Both axes are exactly fixed from 10.8s through maximum wide. That anchor is close
to the visual center of the much larger populated forest at cosmic distance.
Parents reconstruct inside the expanding view without another camera target.

One quintic smootherstep controls logarithmic scale for the full 9.25-second
outward journey. It starts gently, accelerates, keeps moving through every
semantic depth and macro count, then decelerates to zero at 19.75s. There are no
outward holds or sequential camera targets. Native body fades, sizing and family
weights reconstruct parents as the field of view expands. Outward framing is
intentionally different from the exploratory inward poses; it does not replay
their local compositions. Additional roots enter spatially without timed flags.

| Camera range | Compact | Roomy desktop |
| --- | --- | --- |
| Deepest scale | 8.6 | 9 |
| Cosmic minimum scale | .018 | .020 |
| Locked macro X/Y | (110,-53) | (110,-53) |
| Final Japan X/Y / scale | (8,55) / .95 | (0,50) / .95 |

Compact means width below 440px or height below 320px, including shorter desktop
previews. The semantic scale needed to fit the field differs by viewport; neither
path introduces extra stops. The cosmic endpoints go beyond the prior .019 / .022
minimums while preserving production's 14px Galaxy and 6px Sun size floors.

## Preview-only cosmic dissolution

`firstUseCosmicVisibility(scale, compact)` is a pure preview-only helper. It uses
production's `cosmosView.smooth` interpolation but does not change native sizing,
semantic eligibility, artwork or production camera behavior. There is no longer
an opacity floor: all fictional Universe visuals reach exactly zero.

| Visual | Fade starts below | Fully invisible at/below |
| --- | --- | --- |
| Labels | .065 | .050 |
| Relationships, orbit bands and tethers | .050 | .030 |
| All bodies, compact | .050 | .018108 |
| All bodies, roomy desktop | .050 | .020120 |

Each multiplier is `cosmosView.smooth(scale, invisibleZoom, fadeStartZoom)`.
Labels therefore disappear before the body dissolution starts; connectors vanish
before the last bodies. Bodies retain full native opacity at .050 and above,
after the six / more / many-system discovery stages. The final body dissolve
covers roughly the last 15-17% of logarithmic outward zoom distance. Descendants
also retain their native semantic fades beneath this common multiplier.

Bodies receive their multiplier individually, including inherited label opacity.
The existing SVG containing all hierarchy decorations receives the connector
multiplier. Preview label-candidate eligibility uses the label multiplier. No
parent containing the starfield, copy, CTA or preview border is faded. No demo
entities are replaced, removed, recreated, scaled into particles or timed away.
All 117 records and fixed coordinates remain unchanged.

At maximum distance every demo body and SVG decoration is exactly transparent,
and every label is suppressed. Only the original background starfield remains.
Its layers, positions, brightness, density and opacity stay unchanged. The zero
band ends just above the minimum camera zoom, giving a finite starfield-only breath:

| Layout | Stars only begin | Systems start reappearing | Duration |
| --- | --- | --- | --- |
| Compact | ~19.315s | ~20.010s | ~695ms |
| Roomy desktop | ~19.313s | ~20.012s | ~699ms |

These times are consequences of zoom thresholds, not timed visibility flags.
The same helper runs in both directions. On approach, systems emerge at nearly
zero opacity, become faint points and regain full native body opacity at .050.
Labels restore after .050 and reach their normal treatment at .065, well before
the Japan Trip overview. There is no separate fade-in state or timer.

The 24.5-second camera zoom/timing remain unchanged. Hotel now shares macro X;
the existing tiny vertical adjustment ends at 10.8s, then both axes stay exactly
fixed through the 19.75s reversal. The 4.75-second
approach follows one straight interpolation to the original Japan Trip overview.
No hidden reset/reconfiguration is needed: the continuous reversal occurs inside
the invisible band, with the background untouched throughout. The overview seam
and following stepped Tokyo/Stay/Hotel exploration are unchanged.

Compact means width below 440px or height below 320px. Mobile uses the lower end
threshold because its existing minimum zoom is .018 rather than .020; every
layout reaches zero opacity. Reduced motion remains at its original middle depth,
where all three multipliers equal 1.

Reduced motion draws a middle-depth Tokyo frame (scale 1.9 compact / 2 desktop)
with Japan Trip and Tokyo as context and Stay, Food, Places semantically eligible.
There is no animated camera RAF. Runtime preference changes remain supported.

Help and other open dialogs, a mobile drawer, an offscreen preview, hidden tabs
and page lifecycle suspension stop the camera. Resumption preserves elapsed
scene time. Removing the welcome cancels RAF and disconnects resize, intersection
and modal observers plus visibility, motion and page lifecycle listeners. All
preview DOM nodes and density state are removed. There is no preview work after
real content exists. This lifecycle, the onboarding controller, its preferences,
copy, layout, creation flow, Help integration and both contextual hints are
preserved by the semantic-preview revision.

## Creation and hints

The CTA opens the existing `openEntryForm()`. Only a successfully saved creation
reaches the hint hook. Normal CRUD continues to select and focus the real new
Item; rebuilding the hierarchy hides and destroys the preview.

The first root creation shows **Now add something inside it with +** for up to
16 seconds. Creating its first direct child replaces it with the final branch
message mentioning Contents, files, notes, links and location. That message also
lasts up to 16 seconds. Both hints have a keyboard-accessible dismiss button;
text passes pointer input through and hints yield to inline editors. A starter
that already creates children goes straight to the final message.

The existing preference store holds only `firstUseHints: {phase: 'child', rootId}`
or `{phase: 'done'}`. No flag enters Item data. A refresh never replays the child
hint; a pending first child can still trigger the final message after refresh.
Completed hints do not restart on later creation or deletion/recreation. Welcome
visibility remains independent of that preference. Help closes back to the welcome
Help button; creation retains the normal form and Item focus behavior.

## Layout and accessibility

Large desktop layouts place copy/actions beside a roomy preview within the
workspace canvas. Medium layouts stack them. On phones, copy, a 230–300px tall
preview and full-width CTA stack above Help. The ordinary sidebar is retained;
the old Start here cue is removed and its empty sidebar + yields to the welcome
CTA. Non-empty navigation and creation controls retain ordinary behavior.

The preview is inert and hidden from assistive technology, while its caption
identifies it as an example. The real buttons retain visible focus styles and
native keyboard behavior. The text explains purpose and first action without
requiring the animation or relying on color. Contextual hint messages use a
polite status region. No sound, flashing or additional particle animation is used.

## Automated checks

Run from the repository root:

```powershell
node --test tests/first-use.test.js tests/appearance.test.js tests/cosmos-view.test.js tests/task-lists.test.js tests/hierarchy.test.js tests/backup.test.js tests/restore.test.js
node --test tests/first-use.test.js tests/cosmos-view.test.js tests/terminal-labels.test.js tests/camera.test.js tests/label-density.test.js
python tests/browser-check.py --first-use-only --screenshots
python tests/browser-check.py --first-user-readiness-only
python tests/browser-check.py --task-views-only
python tests/staging_package_test.py
node --check first-use.js
node --check body-renderer.js
node --check script.js
git diff --check
```

The first-use browser suite uses a disposable profile, exercises a complete live
loop, tests 360/390/430px phone and 1024/1440px desktop layouts, actual exported
Backup isolation, Search/Tasks/sidebar isolation, native keyboard/Help focus,
reduced motion, suspension, 20 instrumented mount/unmount cycles, real CRUD and
hints, refresh, archived content and an empty restored profile. Screenshot paths
are printed by the harness. Staging tests build and inspect a fresh temporary
artifact; they never overwrite an existing package or deploy anything.

The revised preview adds stage-by-stage browser checks at every tested width,
including visible native labels and capped figures, ancestor label handoff,
craft/Astronaut artwork, a meaningful static frame and unchanged layout/CTA.
Validation for this Hotel-anchor correction passed 72 focused semantic/camera/
label unit tests, 352 onboarding/preview browser checks and all 4 staging packaging
tests. Baseline comparisons confirmed all 117 records and reduced-motion frames
are unchanged. All 9,802 camera samples retain their Y, zoom and semantic context;
full camera values match outside the intended 7.7-10.8s X correction. Another
4,290 full frames and label layouts across five preview sizes match outside that
interval; every affected native size, opacity, label-disclosure, relationship and
context field also matches. All code after the camera function is unchanged.
New DOM checks sample the deepest hold and initial retreat, assert less than .02px
Hotel horizontal drift, and check both Astronauts, labels and connectors remain
fully framed at every tested viewport.
Live pacing metrics are recorded by the browser suite; the latest 390px live loop measured 2.8ms draw time at p95, 16.7ms median frame
interval and 33.3ms frame interval at p95 (1,363 samples). These are desktop-browser
phone-width emulation measurements, not physical-phone performance claims.
JavaScript syntax and tracked/new-file whitespace checks passed. A source
comparison also confirmed that `FirstUseOnboarding`, its integration, the preview
pause/cleanup lifecycle, page markup, body artwork and production semantic/
camera files are unchanged from the preceding implementation. Stage snapshots
pause the real loop after its full live-cycle test, so late resize callbacks
cannot replace the camera pose being measured.
Phone widths are emulated; physical-device frame pacing and unaided first-time
user comprehension remain manual checks.

## Files changed

This Hotel-anchor correction changes only `first-use.js`, `tests/first-use.test.js`,
`tests/first_use_browser.py` and this document. The dataset, artwork, CSS, page
markup, production camera/semantic code and onboarding controller are unchanged;
the runtime change is only Hotel's fixed X target, 111 -> 110, plus explanatory
camera comments. The existing cosmic dissolution, native label handoffs, Y/zoom,
and macro/return path after the initial adjustment remain unchanged. Earlier
branch changes listed below remain preserved.

- `first-use.js`: isolated scene, camera, preview lifecycle, welcome/hint controller.
- `body-renderer.js`: shared existing synchronous celestial artwork.
- `index.html`: welcome/hint markup, removal of Start here, script references.
- `script.js`: emptiness detection, existing creation/Help integration, shared artwork call.
- `style.css`: scoped welcome, preview and contextual hint presentation.
- `tests/first-use.test.js`: focused scene, camera, controller and persisted hint checks.
- `tests/first_use_browser.py`: real browser flow, data isolation, lifecycle, layout and accessibility checks.
- `tests/browser-check.py`: onboarding suite entry point and fresh-profile setup.
- `tests/first_user_readiness_browser.py`: current welcome expectations and safe Sample-load wait.
- `tests/staging_package_test.py`: explicit inclusion of the new runtime scripts.
- `README.md`, `docs/first-user-readiness.md`, `docs/first-use-onboarding.md`: current behavior, architecture and review steps.

## Manual checks to repeat

1. Serve the repository locally with `python -m http.server 8000`. Open
   `http://localhost:8000` in a disposable fresh browser profile. Do not clear a
   personal profile. Confirm name, ordinary purpose, live example and one clear
   first creation action without scrolling at 360×800, 390×844 and 430×932.
2. Watch three complete 24.5-second loops at 360x800, 390x844, 430x932,
   1024x768 and 1440x1000. Confirm the original inward Tokyo, Stay and Hotel holds
   through 10.5s. Watch Stay -> Hotel -> Reservation/Check-in, especially the
   deepest hold and 10.5-10.8s boundary: Hotel and both child labels must stay
   horizontally anchored, with no final rightward nudge. Ensure Check-in stays
   inside the top edge and Reservation's label stays inside the right edge.
   The unchanged tiny vertical adjustment finishes by 10.8s, followed by an
   essentially straight retreat through 19.75s.
   The camera must not recenter on Stay, Tokyo, Japan or the macro groups. Parents
   should appear because the view expands. More outer systems must enter naturally.
   After the six / more / many stages, inspect the dissolve: labels disappear
   first, lines/orbits/tethers next, then all bodies grow faint and vanish. Around
   19.31-20.01s verify ONLY the unchanged background stars remain for ~0.7 seconds:
   no golden cluster, no labels, no hierarchy decoration. Copy, CTA and preview
   container must stay visible. On approach, look for almost invisible systems
   emerging among the stars, then becoming brighter and structured. Through
   24.5s follow one straight approach: opacity and labels restore through zoom,
   outer groups leave, and Japan Trip becomes dominant. It must stop at the Japan
   overview, not enter Tokyo before the preserved next exploration begins. Watch
   across the seam for a jump. Repeat on a physical phone for frame pacing and
   smooth faint reappearance without pop-in or a background jump.
3. Tab to Create and Help. Activate Help with the keyboard, close with Escape,
   and confirm focus returns to **How does it work?**. The preview pauses during
   Help and resumes at the same point. Open/close the mobile drawer too.
4. Enable reduced motion in browser/OS preferences. Confirm a static middle-depth
   scene showing Japan Trip, Tokyo and Stay/Food/Places, an unchanged visible CTA
   and no camera movement. Toggle the preference while open.
5. Press **Create your first Item**, cancel once, then reopen and create `Travel`
   using Blank. Confirm the normal form, selected/focused real Item, welcome
   removal and small child hint. No demo names should appear anywhere else.
6. Use Travel's ordinary **+ → Add item** to create `Japan`. Confirm the first
   hint disappears, the final branch message appears and normal Contents works.
   Open a note editor while the hint is active; it must yield to editing.
7. Dismiss the final hint or wait 16 seconds. Add `Tokyo` inside Japan, refresh,
   and continue normal use. Confirm no repeated hints or welcome.
8. In another disposable profile, refresh after creating Travel but before Japan.
   Confirm the child hint does not replay; creating Japan still offers the final
   hint. Verify both hints can be dismissed with keyboard and touch.
9. Open an existing populated profile and one with archived Items only: no
   welcome. Open/restore a genuinely empty profile: welcome appears. Check
   Search, Tasks, sidebar and an exported Backup for absence of all demo records.
10. On desktop, test navigation expanded/collapsed and a normal Contents panel.
    On a phone, create a Task List and use Compact Preview/Contents. Confirm
    ordinary behavior, then ask a first-time user what Cosmifold is for and what
    they would do first, without giving them instructions.
