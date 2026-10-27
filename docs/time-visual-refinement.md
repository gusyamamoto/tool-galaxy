# Time visual refinement

Historical presentation notes. The icon/card/atmosphere treatment below is
superseded by the [approved-lab production integration](time-integration.md).

This pass preserves the approved Phase 3 projection, context anchors, keyword
classifier, identity hashes, canonical selection, Contents sheet, local date
calculations and completed/past/ongoing rules. No production/default data was
added. The reference was the supplied `time-cosmic-productivity-dashboard.png`.

The prior presentation relied on large bare grid cells, tiny naked event rows,
weak context accents and an Upcoming divider without a composed surface. The
new treatment follows the reference's hierarchy: compact Time identity, a
rounded Calendar surface, recognizable contextual event treatments, and a
separate rounded Upcoming timeline. The current Contents panel is untouched.

## Presentation decisions

- Calendar and Upcoming share Time-local translucent navy surfaces, 12px outer
  radii, cool borders, top highlights and restrained shadows. Static radial
  gradients and a few faint CSS stars give the workspace depth. A small inline
  orbital glyph accompanies the compact heading; no raster imagery or animation.
- Month/year is stronger than weekdays and dates. Controls remain previous,
  next and Today with a quiet Month label where width permits. Desktop has no
  Back to Universe control; mobile retains its existing exit action.
- Grid lines are low-contrast separators. The desktop Calendar uses the
  available height while protecting Upcoming's 204–236px surface. The populated
  five-week review fits Calendar and Upcoming together at 1280×800 and 1600×1000.
  Narrow/short desktops, six-week months, dense range lanes or an expanded day
  inspection can scroll vertically to preserve legibility.
- One readable single-event mini-card per day replaces two microscopic rows.
  Calendar titles use 12px type and 20px semantic icons. Wide/tall layouts show
  the clock beneath the title; shorter or narrow layouts omit that detail and
  retain the full clock in accessible names, day inspection and Upcoming.
  Overflow is a small keyboard-focusable `+N`, with an explicit accessible name.
- At a center width below 560px, the icon sits above the title so the text can
  use the whole cell width. Icon silhouettes stay 20px instead of shrinking.
- Context reinforces identity through a tinted card surface, border, icon,
  time, range and timeline node. Text remains the definitive identity.
- The stable SVG variant indices and families are unchanged. Stroke weight is
  increased to 1.9. The Travel capsule now has a curved pod silhouette and a
  round window, clearly distinct from the angled shuttle and finned rocket.
- Tasks retain their semantic icon plus an outlined corner badge; completion
  adds a check, strike-through and restrained reduced emphasis. The incomplete
  badge uses a single square frame for a cleaner small-size silhouette.
- Ranges use stronger continuous contextual bars with rounded real endpoints,
  squared/dashed week continuations, a readable label and 17px semantic glyph.
  Week segmentation and inclusive dates are unchanged.
- Today has its own circular cool ring/glow. Day selection has a separate
  inset outline and soft cell tint. Both states coexist without a bright cell fill.
- Upcoming has a quiet supporting phrase, chronological connecting line and
  contextual nodes. Larger cards use 13px titles, 32px icon containers with
  24px SVG content, clocks and context chips. Approximately four entries fit the
  laptop review and five fit the wide review; later entries scroll horizontally.
  Only that strip scrolls sideways. Empty Upcoming keeps its panel and a compact
  intentional message.
- Mobile retains the dedicated Time scroller, 49px calendar weeks with semantic
  miniatures, selected-day cards and vertical Upcoming. Selected-day icons are
  27px and Upcoming icon containers 36px. A vertical line/nodes connect dates,
  with readable cards rather than a compressed horizontal layout. Its compact
  Time header stays visible while scrolling; scroll padding keeps section
  headings clear of the existing fixed navigation toggle.
- Time's active sidebar border/fill/glow is slightly stronger within the
  approved navigation system. Universe, Tasks and Constellations styles are
  unchanged. The boundary to Contents is a Time-side edge; no inspector styles
  or structures were redesigned.

## Populated visual review

The disposable browser fixture creates Health (Dentist today at 14:30), a Work
Task (Finish report today at 17:00), a School Task (Statistics assignment
tomorrow at 23:59), a Japan Trip range, a hotel reservation in three days and
another Travel context in five days with a different stable icon variant.
Earlier-month meetings, study, health and travel dates populate Calendar.
Completed Tasks, long titles, dense-day overflow and horizontal overflow are
also covered. These are test-harness writes in an isolated temporary browser
profile, never the developer's normal data or production/default samples.

Screenshots cover 1600×1000, 1280×800 and 900×750 desktop with Contents open and
closed, plus 390×844, 320×568 and 740×390 mobile. Additional frames show selected
Today, later Upcoming entries, mobile day/details/Upcoming and grayscale
desktop/mobile views. Visual review compares composition, panel depth, density,
event legibility, icon silhouettes, context accents, ranges, Today/selection,
timeline direction and atmosphere directly with the supplied reference.

The grayscale review retains family silhouettes, event text, Task frames and
completed checks. Full accessible names and focus outlines remain available.
This is screenshot/input review, not physical-device or screen-reader certification.

## Performance and validation

Projection and sorting code is unchanged. Time remains event-driven with no
hidden aggregation, animation loop, animated particles, network classification,
large raster background or backdrop-filter stack. New effects are static local
CSS and inline SVG. Rendering retains bounded cell density and scrolling lists.

Run `node --test`, the focused `tests/time-view.test.js` and
`tests/time-data.test.js`, and the browser modes `--time-view-only --screenshots`,
`--sidebar-refinement-only` and `--contents-browse-only`. The Time browser suite
also verifies populated context families, Contents open/closed, calendar/overflow
bounds, desktop composition height, icon size, horizontal scroll, mobile detail
return and unchanged camera coordinates. Packaging tests verify all local runtime
assets without deploying.

Final validation on 2026-10-26:

| Check | Passed |
| --- | ---: |
| Full Node suite | 911 |
| Focused Time projection/identity + canonical When/Due tests (included above) | 56 |
| Populated Time browser review / functional regressions | 80 |
| Existing sidebar/navigation browser regressions | 95 |
| Existing Contents browser regressions | 714 |
| Static packaging tests | 5 |
| JavaScript syntax checks | 65 files |
| Python syntax checks | 3 files |

All 889 browser assertions passed. Trailing-whitespace checks on the seven
files touched in this refinement and `git diff --check` passed. The latest
screenshot directory is `galaxy-preview-0zzsqyj4` in the local temporary
directory. It contains all six requested viewport sizes, Contents open/closed,
grayscale, selected-day, later Upcoming, mobile details and empty-panel frames.

Measured desktop composition with Contents open: 1600×1000 has a 642px Calendar
and 236px Upcoming; 1280×800 has a 502px Calendar and 204px Upcoming. Both fit
without workspace scrolling in the populated five-week fixture. At 900×750,
the Calendar is 546px and Upcoming 204px; 94px of vertical scrolling preserves
the full-width stacked labels and icon sizes. No horizontal page overflow was
observed. Contents has its existing responsive fixed width; the app offers no
separate inspector-resize control.

This pass touched `index.html`, `time-view.css`, `time-view.js`,
`tests/time_view_browser.py`, `docs/time-view.md` and this document. Earlier
uncommitted Phase 3 changes remain in the working tree. No commit, push or
deployment was performed.
