# Mobile zoom branch stabilization

Review of the final working tree against `main`, October 18, 2026. No commit,
push, merge, deployment or production cloud activation was performed. All
browser checks use disposable profiles and synthetic local data; Auth/cloud
checks use mocks.

**READY TO COMMIT:** no remaining local blocker. Physical-phone follow-up below
is still recommended before release. No staged files were created by this review.

## Final behavior

- Render passes share one fresh viewport snapshot before visual writes.
- Offscreen ordinary body/relationship visuals skip unnecessary work. Canonical
  records, DOM identities, solver nodes and protected interaction context remain.
- Overview uses real bodies and small Galaxy cores, with no normal cloud canvas,
  cloud hit territory or cloud-derived framing bounds.
- Label handoffs remain `.24–.42`, `.64–1.12`, `1.60–2.10`, `2.70–3.60`, `5–7`.
  The existing density engine, protected reveals and Constellation lens remain.
- Outward user zoom into overview releases ordinary selection/Compact; inward
  zoom does not restore it. Explicit navigation and open Contents retain ownership.
- Mobile has Compact and adaptive Contents only. Four persistent pages, guarded
  swipes, CB switching, safe areas, inline forms and the compact dock remain.
- Common actions have contained secondary surfaces and mathematically centered
  text. Save is stronger; Remove is restrained; Google Maps remains a link.
- Mobile parent focus frames every canonical descendant at actual coordinates,
  including distant/manual/pinned children. Leaf inspection, Universe Fit and
  desktop commands remain distinct. Camera framing never rewrites placements.

## Stabilization changes

A reproduced defect limited mobile family framing to Galaxy/Sun. Planet, Moon
and deeper parents used point targets, leaving a distant descendant outside the
canvas. They now reuse the same family solver with their established focus
scale as the ceiling. The regression suite checks both ordinary and close focus,
every requested mobile width and landscape, pinned descendants, world centers,
native bounds, retained page and unchanged positions/constraints.

The old DOM-only test could accept an offscreen `display:none` descendant's empty
rectangle. World-coordinate checks now prevent that false pass.

Removed the unused application `updateRegionFootprints`/`renderRegions` functions
and their timing fields after confirming no runtime callers remained. Removed
the obsolete empty-region viewport-test invocation. Empty region compatibility
inputs and separately tested appearance/archive cloud utilities remain; normal
presentation does not populate or invoke cloud rendering.

Capture/sidebar/default smoke expectations now describe the approved Link/add-row,
real-core and culling behavior. Exact repeated-Fit comparison waits for the
post-Restore simulation to settle before pausing the same world. Sample tests
assert the existing collapsed mobile disclosure and expanded desktop disclosure.
These are test updates; no capture, Sample, persistence or physics behavior was
changed to satisfy them.

README and phase documentation now distinguish current behavior from retained
historical measurements. Legacy `--cloud-fade-only` / `--visual-only` drivers are
historical baseline diagnostics, not current release checks.

## Final performance sanity

Sequential main/final runs used Chrome 155 on Windows, 390×844/DPR 3, 4× CPU
throttling, 150/325 synthetic bodies, paused solver, identical 350-tick seeded
positions and 20 render samples per scene. World-coordinate digests matched
between arms. Each sample moves all fixture records by the same small delta.
The overview camera is derived from identical actual world centers in both arms;
it does not use the old cloud bounds or new focus command. Instrumentation exists
only in a retained temporary driver, never in product code.

| Bodies | Scene | Mean synchronous render, main → final | Style recalculations over 20 samples | Body subtrees styled per close pass |
| --- | --- | --- | --- | --- |
| 150 | Close | 124.03 → 4.58ms | 660 → 20 | 150 → 8 |
| 325 | Close | 436.87 → 9.57ms | 1100 → 20 | 325 → 8 |
| 150 | Overview | 62.26 → 8.02ms | 310 → 26 | Detail-dependent |
| 325 | Overview | 77.49 → 18.66ms | 400 → 23 | Detail-dependent |

Close views suspended 142/317 visual subtrees while retaining all 150/325 solver
nodes. At overview, no body subtrees were skipped in this fixture. Close RAF-gap
means changed 181.79 → 18.49ms and 443.23 → 37.70ms; overview means changed
76.03 → 48.10ms and 94.61 → 63.08ms. These are small, instrumented browser samples
with paused physics, not native-drag tests or Android frame rates. Synchronous
render timings exclude later paint. They demonstrate retained rendering gains,
not a universal frame budget or guaranteed smoothness on a physical phone.

Baseline export, driver, failed setup attempts and successful raw JSON/logs remain
outside the repository at
`%TEMP%/cosmifold-zoom-closeout-tzhzfwui`. No screenshots/logs/benchmarks are proposed
for commit. Historical forensic artifacts were preserved.

## Validation

All 591 Node tests passed. Current focused browser suites passed:

| Area | Checks |
| --- | --- |
| Viewport batching / visibility | 203 / 212 |
| Real-body overview, 150/325-body scenes | 394 |
| Semantic handoff, 150 + Sample / 325 | 413 / 278 |
| Adaptive Contents, gestures, forms and actions | 718 |
| Family framing at all parent depths | 342 |
| Mobile taps/drag / capture / management menus | 49 / 73 / 77 |
| Native post-reparent drag / Move destination | 59 / 156 |
| Navigation / Constellations / local collection management | 143 / 105 / 27 |
| Copy/Paste / duplicate structure / archive | 61 / 43 / 65 |
| Bookmark/Location persistence / attachments | 110 / 29 |
| Static hosting / Backup dialog / mocked Account/cloud foundation | 216 / 27 / 83 |
| Sidebar sections / standard browser smoke | 40 / 139 |

This totals 4,062 browser assertions across 25 suites. All completed with exit
code 0. JavaScript syntax, changed Python AST parsing and whitespace checks passed.
Cloud/data modules, SQL/RPC/migration files, physics and hierarchy models are
unchanged against main. `tests/__pycache__/` remains excluded and preserved.

Screenshots cover 360/390/430px, landscape and desktop, including all-depth parent
framing and current Contents controls. Safe-area fallback checks use synthetic
insets where native emulation is unavailable. Real-device keyboard/font/browser
chrome behavior remains a physical-phone check.

## Scope and remaining follow-ups

No new framework, storage system, cloud/Supabase production semantics, migrations,
hierarchy model, physics tuning, saved-position changes or render coalescing.
No temporary product diagnostics or permanent Sample data were introduced.

No unintended desktop regression was found in the representative checks. The
approved overview artwork/body/label changes also apply to desktop; desktop
inspector, focus commands, storage and direct manipulation retain their paths.

Physical-device follow-up: focus a Planet/Moon with distant descendants above open
Contents, switch pages/CBs, rotate, edit with the Android keyboard, and manually
zoom outward/inward. The user already confirmed the continuous real-body overview
and earlier gesture improvements on the phone; the all-depth stabilization fix
has browser validation, not new physical-device proof.

Very dense systems can still require a wide view and overlap/density suppression.
Further rendering optimization requires a separate measured task. Camera captures
remain stored in Cosmifold; automatic Gallery/Photos saving is outside the web MVP.
Historical cloud diagnostics require their matching baseline checkout.

## Permanent commit manifest

Production:

```text
archives.js
camera.js
cosmos-view.js
index.html
mobile-contents.js
script.js
style.css
```

Documentation:

```text
README.md
docs/mobile-contents-browse.md
docs/mobile-system-framing.md
docs/mobile-zoom-performance.md
docs/mobile-zoom-final-review.md
```

Tests:

```text
tests/bookmark_entry_browser.py
tests/browser-check.py
tests/camera.test.js
tests/cosmos-view.test.js
tests/label-density.test.js
tests/mobile-contents.test.js
tests/mobile_attachment_browser.py
tests/mobile_body_browser.py
tests/mobile_capture_browser.py
tests/mobile_contents_browser.py
tests/mobile_fit_browser.py
tests/real_body_overview_browser.py
tests/render_viewport_browser.py
tests/render_visibility_browser.py
tests/semantic_handoff_browser.py
```

27 files total. Temporary profiles, screenshots, logs, baseline exports,
performance drivers/results and forensic evidence are outside this manifest.
