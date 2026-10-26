# Global navigation visual foundation ? refined Phase 1

Branch: `ux/global-navigation-visual-foundation`. All work remains uncommitted. No push or deployment.

## Scope and reused architecture

The approved boxed major-section structure, compact hierarchy and existing layout are retained. This refinement tunes tokens and five inline icons, increases the static background slightly and changes the mobile accordion from exactly one open section to at most one.

`HierarchySidebar`, `NavigationSection`, `MobileSidebarSections`, `SidebarPaneSplit`, canonical rows and the existing More/action menus are reused. The production JavaScript diff consists of routing mobile disclosure through a new `MobileSidebarSections.toggle()` method and using the same toggle for the mobile Universe label. Programmatic `select()` remains idempotent for code that needs to reveal a section. Desktop section disclosure and the Universe overview/Fit handler are unchanged.

## Header hierarchy and icon family

Collapsed headers now have a darker translucent fill, quieter border, muted label and muted icon. Open headers retain a lighter blue fill, stronger thin border, brighter label/icon and controlled local halo. Native hover changes the collapsed header border/halo; keyboard focus retains its explicit outline. Header heights, margins, radius, tree indentation and nested row styles are unchanged from the original Phase 1 implementation. Nested Items, tasks and Constellations remain lightweight rows.

| Icon | Refined direction |
| --- | --- |
| Cosmifold | Compact astronaut helmet with a clear visor, side details and collar |
| Universe | Planet silhouette crossed by an open orbital ring |
| Tasks | Rounded checkbox with a simple check, replacing the calendar-like shape |
| Constellations | Connected celestial nodes with a small four-point star |
| More | Quiet four-point sparkle, replacing the action-like rocket |

All five are original simplified inline SVG drawings inspired by the supplied shortlist. The family shares 1.5px rounded strokes, outline construction, blue-gray default color and restrained emphasis. Major icons remain 16px; the existing brand and More sizes remain 20px. The wordmark, brand layout and More menu are unchanged. No raster icons, external libraries, stock artwork or dependencies were added. Identity icons remain stable while the existing disclosure chevrons rotate.

## Background adjustment

The sidebar remains a static CSS background. Two additional tiny edge stars bring the total to seven, with nine gradient layers including atmosphere and horizon. The dense label area remains dark.

| CSS alpha change from original Phase 1 | Desktop | Mobile |
| --- | --- | --- |
| Horizon | 43 ? 54, approximately +26% | 18 ? 22, approximately +22% |
| Atmospheric depth | 51 ? 66, approximately +29% | 26 ? 29, approximately +12% |
| Stars | 107 ? 130, approximately +21% | 56 ? 63, approximately +13% |

These are controlled opacity changes, not a claim of exact perceptual percentages. Mobile remains substantially calmer, particularly for stars and atmosphere. Background geometry, sidebar/canvas boundary and width behavior are unchanged. There are no animated particles, filters, backdrop effects, parallax, WebGL or new render loops.

## Mobile and desktop behavior

On mobile, activating a collapsed section opens it and closes the others. Activating that same section again clears the selected section and closes all three. This works for Universe's chevron and label, Tasks and Constellations. Zero sections may remain open. The maximum is one; switching remains exclusive.

The change is transient and does not overwrite independent desktop disclosure preferences or nested hierarchy scroll state. Focus returns from newly hidden content to its disclosure button. Universe +, row More and hidden mobile Item row + remain intact. Desktop/tablet retain independent expansion, all-three-open operation, row creation, More, right-click, drag/drop, width resizing and the pane splitter.

## Celestial-body visual audit

HEAD and local `main` both identify baseline commit `8995b7f1778b888cc70e729af410760da8f6fc86`. The original pre-refinement Phase 1 CSS was saved separately before editing. The new browser audit compares baseline, original Phase 1 and refinement CSS in the same frozen Sample scene. It compares synchronously to prevent normal label-density/animation progress between frames from masquerading as a CSS difference.

Coverage: **2,397 elements ? 27 visual/geometry properties**, including `::before`/`::after`, at zoom **0.1, 0.65, 1.1 and 2.2**, including selected Sun, Planet and deep-Item states. Properties include backgrounds/textures, glow shadows, filters, opacity, blending, fill/stroke, width/height, transforms and label styling. The hierarchy SVG paths, Constellation/motion overlays, regions, world layers and main starfield are included. A control assertion confirms that sidebar backgrounds actually differ between the CSS variants.

**Result: zero effective CB, label, pseudo-element, world or SVG visual-style differences were found for either original Phase 1 or this refinement against baseline.** No accidental style leak was found or repaired. Apparent brightness could be a surrounding-contrast effect; that is an interpretation rather than evidence of a body-style change.

All CSS before the sidebar foundation block still matches the original Phase 1 CSS. Runtime changes are confined to navigation. Body textures, sizes, glow, gradients, physics, simulation, dragging, zoom, focus, Fit, visibility, rendering and canvas starfield implementations remain unchanged. Introduction, attachment/WebKit fallback, local persistence/recovery and Paste/Duplicate code remain untouched.

## Validation results

Full Node suite: **855 passed**, zero failures; four more than the previous 851 because of the new mobile disclosure tests. Packaging: **5 passed**.

| Current passing browser suite | Checks |
| --- | ---: |
| Global navigation visuals, hover, icon family, native canvas interactions and responsive/all-closed mobile states | 126 |
| Sidebar alignment, density and resizing | 95 |
| Pre-release UX, coach, accordion, capture controls and More | 140 |
| First-use/static Introduction | 74 |
| First-user readiness and responsive editors | 349 |
| Sidebar task interactions | 72 |
| Canvas viewport/render invariants | 203 |
| Immediate Paste/Duplicate destinations and mixed binary storage | 109 |
| Effective celestial-style audit | 13 |
| Dense Sample performance diagnostic | 6 |
| **Total across ten passing suites** | **1187** |

Successful reruns are counted once. Relative to the previous 1,143 checks, global navigation adds 27 checks, pre-release UX adds four zero-open checks and the visual-style audit adds 13. Baseline failure probes are excluded from the passing total.

Syntax passed for **150 JavaScript files** (all 149 tracked files plus the new Node test) and **5 affected Python files**. Whitespace checks cover all eleven Phase 1 changed/new files. `git diff --check` passes with no output.

### Historical suites rechecked

All three were rerun using the current harness against a freshly extracted unchanged HEAD/main snapshot, in isolated browser profiles. No branch switch or user-data access was needed. All three still fail:

- `--mobile-polish-only`: expects a 44px mobile Item row + that the accepted UX intentionally removed.
- `--navigation-refinement-only`: measures Constellation row bounds without opening that accordion section, so its rows have zero visible size.
- `--sidebar-sections-only`: reads a Starter creation result before the asynchronous command completes. In earlier runs the same timing issue reached the Archive assertion instead.

These suites are not silently skipped or reported as passing. Their historical fixtures were not rewritten in this focused pass. Runtime behavior was not distorted to satisfy obsolete expectations. The passing current suites above cover the accepted mobile actions, section behavior and first-use path.

### Tests changed and reasons

- New `tests/mobile-sidebar-sections.test.js`: four actual-controller tests for zero-open toggling, exclusive switches/idempotent reveal, independent desktop preferences and focus recovery.
- `tests/navigation_visual_browser.py`: five-icon rendering, quiet/open states, native hover, all-closed states for each mobile section and Universe label toggling. No pixel-perfect assertions.
- New `tests/navigation_style_audit_browser.py` plus runner flags: frozen effective-style comparison against main and the saved original Phase 1 CSS.
- `tests/prerelease_ux_browser.py`: mobile setup explicitly begins closed, then checks open ? closed ? open; the artwork assertion now accepts the requested sparkle More icon instead of requiring rocket-specific circle geometry. Existing menu placement, keyboard and focus checks remain.
- `tests/sidebar_refinement_browser.py` retains the preceding Phase 1 typography expectation changes and was rerun successfully; it was not edited again in this refinement.

## Performance and accessibility

No normal full-scene degradation was observed in headless Chromium. This pass's original Phase 1 profile versus refinement:

| Dense 282-body Sample, close view | Original Phase 1 | Refined |
| --- | ---: | ---: |
| Frame median | 16.7ms | 16.6ms |
| Frame p95 | 16.8ms | 16.9ms |
| Projection/render p95 | 3.2ms | 2.2ms |
| DPR 2 frame median | 16.7ms | 16.6ms |

Native drag, wheel zoom, pan and Fit passed. Final diagnostic times, including focus/cooling/animation/CDP overhead, were 3360ms drag, 609ms wheel and 94ms pan; these are not per-frame costs. Dense hierarchy expand/collapse measured median/p95 35.5/80.7ms. Batches of three section activations plus closing/reopening the drawer measured median 65.1ms wide desktop, 65.4ms resized desktop, 65.7ms tablet, 60.3ms 390px phone, 55.3ms 320px phone and 51.2ms short landscape.

Profiling is noisy. The altered diagnostic scene with structural paths deliberately hidden reached 33.2ms median/49.8ms p95 in the final run, while the unmodified full scene and other diagnostic scenes retained approximately 16.6ms medians. This does not establish a sidebar-caused regression, but physical-device review remains necessary; no speedup or native Safari performance claim is made.

Native labels, button semantics, tab order and disclosure attributes are retained. Decorative SVGs are hidden from accessibility APIs. Open state uses fill, border, label/icon contrast and chevrons in addition to glow. Calculated label contrast on composited base section surfaces is approximately **7.65:1 collapsed** and **11.44:1 open**. Keyboard focus and reduced-motion behavior pass. No header height or spacing increase was made.

Responsive checks and screenshot review cover 1440?1000, 1100?800, 820?1000 touch, 390?844, 320?568 and 740?360 touch. Both open hierarchy and all-closed mobile states were reviewed. Long hierarchy scrolling, More reachability, action separation and unchanged breakpoints pass. Short landscape continues to use the existing drawer scrolling when a long section is open.

Final screenshots: local Temp directory `galaxy-preview-x8etg7fc`, including `navigation-desktop-mixed.png` and all-closed portraits/landscape. Physical Android/iPhone review remains outstanding.

## Manual review checklist

- Desktop: collapse/expand Universe, inspect a long hierarchy, expand Tasks and Constellations independently, leave Universe + Tasks and then all three open. Compare active/inactive fills, borders and icons; check hover, Tab focus, More, width/pane resizing and scrolling.
- Mobile: open and close each section by tapping it again; leave all three closed; switch directly between sections to confirm exclusivity. Test Universe label and chevron, Universe +, row More, absent Item row +, long-tree scrolling and More. Repeat at 390px, 320px and short landscape.
- Canvas/performance: while the sidebar is visible and a dense system moves, drag bodies, pan, wheel zoom, focus from navigation and use Fit. Repeat drawer/accordion/branch changes. Confirm accepted body artwork and motion remain consistent on physical Android and iPhone Safari.

## Files and workspace

This refinement edited `hierarchy.js`, `script.js`, `index.html`, `style.css`, `tests/browser-check.py`, `tests/prerelease_ux_browser.py`, `tests/navigation_visual_browser.py` and this report, and added `tests/mobile-sidebar-sections.test.js` and `tests/navigation_style_audit_browser.py`. The earlier Phase 1 change in `tests/sidebar_refinement_browser.py` remains uncommitted. The pre-existing untracked `device-test-build/` directory was not modified.

All work remains on the requested branch. No commits, pushes or deployments were performed.
