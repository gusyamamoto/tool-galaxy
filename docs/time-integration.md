# Approved Time design — production integration

Implemented on `feature/time-calendar-upcoming`, October 27, 2026, and subsequently
manually reviewed on desktop, Android and iPhone. Production Time is now the
implemented/validated design; the development prototype and its dedicated
comparison test have been retired. No commit, push or deployment.

## Audit and implementation map

The audit preceded production edits. The existing Time feature already owned the
correct canonical projection and Contents/navigation paths. Those paths were reused.

| Approved source | Production implementation | Contract retained |
| --- | --- | --- |
| `index.html` / `calendar.css` in the lab | root `index.html`, `time-view.css`, `TimeWorkspace.render` | existing month/date state, locale grid and canonical event IDs |
| Lab event rectangles | `TimeWorkspace.eventButton` and scoped Time CSS | canonical `inspect` callback, exact title/time/context labels, completed history |
| Lab `upcoming.css` | date groups built over `cosmosTime.upcoming` | existing chronological comparator, ranges, past/completed inclusion rules |
| Lab `temporal-avatars.js` | root `temporal-avatars.js` and approved miniature paint | real `galaxyAppearance.resolve`, immediate Task List ownership, pure SVG helpers |
| Lab mobile HTML/CSS/JS | responsive production Time CSS and existing Calendar projection | same selected-day state, canonical entries, existing mobile detail sheet |
| Lab local Manrope | `assets/fonts/` and global `style.css` font stack | local bundle, OFL license, system fallbacks |
| Approved navigation cleanup | root HTML / sidebar CSS | existing hierarchy columns, disclosure/actions, pane split and navigation callbacks |

`time-view-model.js`, `model.js`, `appearance.js`, `task-lists.js`, the repository,
write coordinator, persistence, backup/restore services, cloud projection/schema
and attachment implementations were not changed. Before/after hashes verify the
core-file and complete design-lab boundaries.

## Final behavior (report items 1–21)

1. **Architecture reused:** active canonical `entries`, When/Due projections,
   `cosmosTime.aggregate/onDay/upcoming/segments`, existing repository commands,
   existing selected-day/month state, `selectEntry` and production Contents.
   No second model/store, duplicate Calendar state or fixture-backed production data.
2. **Production Time files:** `time-view.js`, `time-view.css`, root HTML; new
   `temporal-avatars.js`. `script.js` supplies the canonical selection ID, publishes
   selection to Time and preserves the camera while mobile Universe navigation closes.
3. **Calendar:** approved gradient, 16px panel radius, 76px desktop month header,
   32px weekday band, quiet week separators, circular Today, subtle selected day,
   original approved dimensions and 36px bottom breathing zone.
4. **Containment:** a 21px date track plus bounded event slot; actual slot-size
   container queries tighten text/padding. A 452px minimum preserves readability
   in short windows. Six-week months and existing range lanes get additional room;
   native workspace scrolling handles dense data instead of clipping it. Range
   overlays share the date grid's exact column gaps and inclusive segment boundaries.
5. **Events:** 4px dark/context-tinted rectangles, 2px inset left accent, title and
   optional time, no semantic icons, checkbox or Task badge. Selected bounds remain
   identical, with brighter paint/text, 3px accent and a soft glow. Existing completed
   history reduction/strike-through remains. Overflow opens every selected-day entry.
6. **Context:** the existing canonical anchor/classifier/hash/palette is unchanged.
   The approved paint consumes its colors. The lab's manually fixed palette and
   independent Calendar/Upcoming fixture dates are not production data contracts.
7. **Desktop Upcoming:** one 1px continuous horizontal rail, 7px neutral nodes,
   124px groups (128px for multiple entries), same-day stacks, optional times,
   compact range labels and native horizontal overflow. No event cards or boxes.
8. **Static avatars:** 28px native CSS/SVG bodies resolved from production appearance;
   pure production satellite/astronaut geometry without canvas-specific CSS classes.
   No live body nodes, canvas, simulation, drag, orbit, timer or texture-baking queue.
9. **Task inheritance:** immediate owning canonical Task List supplies miniature
   identity. Normal dated objects retain their own identity, including Galaxy types.
10. **Mobile Calendar:** separate phone density, approved panel/controls/weekdays,
    44px-high date targets and Today ring; no desktop event rectangles in cells.
    The existing app drawer toggle is the only extra header navigation affordance.
    The compact production header remains sticky during scrolling, with scroll
    margins keeping timeline/detail headings clear of that existing navigation.
11. **Mobile bars:** context bars are 18×2px at 390px, 14×2px at 320px, with 1px gaps;
    up to three plus a small `+N`. Selection brightens bars and preserves the Today ring.
    Counts and full event identities remain available independently of color.
12. **Selected-day details:** real canonical entries immediately beneath Calendar;
    compact title/time rows, context accents, no icons/badges; every overflow entry
    remains available. Desktop keeps its pre-existing overflow/day-detail behavior.
13. **Mobile Upcoming:** the same grouped projection becomes a vertical 1px rail,
    neutral date nodes, static mini-CBs and wrapping titles/times. The mobile shell
    retains the lab's 480px maximum content width in short landscape.
14. **Manrope:** self-hosted `assets/fonts/Manrope-Variable.ttf`, unchanged OFL source
    license, weights 200–800, font-display swap, system fallbacks; app-wide inheritance.
    No font CDN or runtime Google Fonts request. Packager requires/copies its license.
15. **Sidebar icons:** decorative Universe, Tasks, Time, Constellations and More
    symbols removed. Existing action SVGs, chevrons and hierarchy columns remain.
16. **Sidebar background:** plain dark `#080f1b`; stars/horizon/planet backgrounds
    removed only from the sidebar. Main Universe starfield/background code is unchanged.
17. **Contents:** production structure/editors remain. Desktop selection updates
    existing Contents while keeping Time open; mobile opens its existing sheet,
    makes Time inert and returns focus to Time on dismissal. No duplicate detail UI.
18. **Accessibility:** retained keyboard arrows/Home/End/Page Up/Down, roving dates,
    localized full-date/count labels and complete event descriptions. Active events
    expose `aria-pressed`; focus remains visible; decorative miniatures are hidden
    from accessibility APIs. Phone controls are 44px; at 320px, date targets are
    about 39px wide ×44px high, matching the approved seven-column Calendar.
19. **Performance:** event-driven rendering only, hidden Time skips aggregation,
    static miniatures, no Time animation loops/canvas/D3. Inherited button transitions
    were disabled within Time to match the static lab and avoid selection animation.
20. **Desktop visual review:** 1440×900, 1280×800, 1200×768 with real Contents open
    and closed; containment, selection, Today, bottom spacing and overflow verified.
21. **Mobile simulated review:** 390×844, 320×568 and 740×390 short landscape; matching
    Calendar dimensions, markers, selected day, timeline, detail return and scrolling.
    Calendar dimensions: 358×358, 288×358, 448×358 respectively.

## Urgency design contract

Task type does not receive stronger permanent emphasis. Normal future Due uses
normal treatment; Due today should receive moderate attention; overdue plus
incomplete should receive clear attention; completed remains readable in history
with reduced emphasis. An ordinary dated object's current/Today treatment is
conceptually distinct from overdue Task urgency. Final urgency styles, badges
and warning colors are deferred. Existing projection/completion behavior is retained.

## Visual comparison

The approved lab and production were captured at matching viewport sizes and
reviewed side-by-side. Phone Calendar dimensions, spacing, bars, detail rows and
vertical timeline match; production retains its existing navigation toggle and
its canonical context colors. Desktop matches panel/Calendar/event/timeline
geometry, gradients and miniature language. Production Contents remains the
existing functional panel. Real canonical dates determine event placement;
lab Calendar/Upcoming sample dates were deliberately independent visual fixtures.

Frames, side-by-side HTML/PNGs and browser logs are in:
`C:\Users\gusta\AppData\Local\Temp\cosmifold-time-integration-xkfoz7fz`.
`visual-comparison/compare-1440x900.html` and `compare-390x844.html` show the pairs.
Final source behavior frames: `galaxy-preview-37oayh5m` in the same OS temporary root.
The six-size lab/production frames are `galaxy-preview-g043rtgq`.

## Automated validation (items 22–23)

**915 Node tests passed**, including persistence, stale writes, recovery,
attachments, backup/restore, cloud metadata/projection contracts, copy/move,
Tasks, Time metadata/view-model and four new static-avatar tests.
**6 Python packaging tests passed**, including mandatory bundled font licensing.

Passing browser runs:

| Suite | Passed checks |
| --- | ---: |
| Time metadata/editors, canonical writes, reload and stale safety | 114 |
| Local stale write | 20 |
| Attachment recovery | 32 |
| Backup | 40 |
| Persistence | 20 |
| Sidebar copy/paste | 41 |
| Sidebar group move | 62 |
| Duplicate structure | 43 |
| Task Lists | 110 |
| Mobile Contents browse | 714 |
| Mobile capture | 160 |
| Expanded source Time view | 102 |
| Lab/production design integration | 95 |
| Current body-action/menu contracts | 95 |
| Sidebar hierarchy/panes/mobile alignment | 95 |
| Static hosting/assets/CSP | 278 |
| Offline staging browser | 287 |
| Latest reviewed offline artifact: Time view | 102 |
| **Total across 18 passing browser runs** | **2410** |

Tests were not weakened to bypass failures. Presentation assertions now express
approved no-icon/no-card/grouped-timeline contracts. A navigation helper now
awaits the existing async write acknowledgment before checking the saved form.
Dense same-day groups are tested for complete scrolling reachability instead
of assuming an arbitrary count can fit within one viewport.

Two pre-existing suite failures remain, reproduced against the saved
**pre-integration source** in `baseline-site/` using the same harness:

- `--restore-only`: 53 checks pass, including exact restored metadata/preferences,
  attachment bytes and image preview. The browser cannot decode the existing
  `trip.webm` fixture (`video.readyState` stays 0 and the existing unsupported-video
  fallback appears). The later PDF-preview and remaining post-restore browser
  assertions do not execute because this first failed assertion stops the suite.
  Both current/baseline logs show the same failure; no media code was changed.
- Legacy `--navigation-only`: reaches the old exact canvas-menu action-list
  assertion, which omits creation actions already present before this integration.
  Baseline reproduces it after 111 passed checks. The remainder of that legacy
  menu/keyboard/Sample sequence is not executed after the assertion. Current
  body-action tests pass 95 checks, sidebar tests pass 95 and Time navigation/
  Contents/camera contracts pass within the 102-check Time suite.

No real Android/iPhone, VoiceOver/TalkBack or live cloud/database deployment
review was run. Physical hardware is not connected; the requested device review
is manual. Cloud/persistence code was untouched and its automated local/mock
contracts passed. A physical-device pass and visual sign-off remain required.

## Physical-device checklist and artifact (item 24)

A **68-file offline artifact** is prepared locally at:
`C:\Users\gusta\AppData\Local\Temp\cosmifold-time-integration-xkfoz7fz\device-site-reviewed`.
It contains the current runtime source, local Manrope and its license. Auth is
explicitly unconfigured, cloud is inactive, and lab/tests/docs sources and
canonical fixture data are excluded. No upload/deployment occurred.
Source-versus-artifact bytes are checked, except the intentional offline Auth/CSP
substitutions. Its Time suite passed using an isolated browser profile.

After manual review, the user can publish **only this prepared folder** to the
chosen temporary HTTPS device-testing origin. This agent has not done so.

For both Android Chrome and iPhone Safari:

- [ ] Open the temporary HTTPS origin; verify local font and no missing assets.
- [ ] Open Time through existing mobile navigation; close/reopen its drawer.
- [ ] Previous / next / Today; date selection and Today ring.
- [ ] Single-date When, range When, optional time and Task Due from real objects.
- [ ] Context bars, multiple bars, three-bar/+N overflow; complete selected-day list.
- [ ] Vertical Upcoming grouping, compact ranges, real CB miniatures and selection.
- [ ] Native touch scrolling; no horizontal page overflow or date/title clipping.
- [ ] Open existing Contents/detail; edit When/Due or Done; dismiss/swipe down.
- [ ] Return to Time with correct focus/date/scroll; Universe return preserves camera.
- [ ] Portrait and short landscape; Calendar controls and safe-area navigation fit.
- [ ] Desktop review at the three sizes above with Contents open and closed.

## Scope confirmations

No fake lab events entered production. No new event store or persisted Calendar
state exists. No live D3/physics renderer is embedded in Time. The approved design
is implemented and manually validated in production. No commit, push or deployment was performed.

## Files changed during this pass (item 25)

- Runtime presentation: `index.html`, `time-view.js`, `time-view.css`, `temporal-avatars.js`.
- Integration/navigation/font: `script.js`, `style.css`, `assets/fonts/Manrope-Variable.ttf`,
  `assets/fonts/OFL-Manrope.txt`.
- Packaging: `scripts/prepare-staging.py`.
- Tests: `tests/browser-check.py`, `tests/time_view_browser.py`,
  `tests/temporal-avatars.test.js`, `tests/staging_package_test.py`.
- Documentation: `README.md`, `docs/time-view.md`, `docs/time-visual-refinement.md`, this report.

These are 17 source/documentation files. Existing unrelated dirty/untracked
work was preserved. Python test runs also refreshed ignored generated bytecode
under `scripts/__pycache__/` and `tests/__pycache__/`; no lab file changed.

## Final git checks (items 26–27)

`git diff --check` passes. Newly added source files were separately checked for
trailing whitespace. The branch remains `feature/time-calendar-upcoming`.

The full `git status --short` below includes work that was already dirty before
this integration; it is intentionally not reduced to this pass's change list.

```text
 M README.md
 M index.html
 M script.js
 M scripts/prepare-staging.py
 M style.css
 M tests/browser-check.py
 M tests/staging_package_test.py
?? assets/fonts/
?? device-test-build/
?? docs/time-integration.md
?? docs/time-view.md
?? docs/time-visual-refinement.md
?? temporal-avatars.js
?? tests/temporal-avatars.test.js
?? tests/time-view.test.js
?? tests/time_view_browser.py
?? time-view-model.js
?? time-view.css
?? time-view.js
```
