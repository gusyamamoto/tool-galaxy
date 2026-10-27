# Time workspace

The [approved-design production integration](time-integration.md) records the
current visual contract, validation, known baseline test failures and device checklist.
Production Time is the implemented design, manually reviewed on desktop,
Android and iPhone. The development prototype and its dedicated comparison test
have been retired; production Time tests remain the validation suite.

Time is a read-only projection of the existing canonical hierarchy. It reuses
`entries`, direct-child Task ownership, canonical When/Due metadata,
`cosmosTime.aggregate/onDay/upcoming/segments`, the repository/write coordinator,
`selectEntry`, the existing desktop Contents panel and mobile Contents sheet.
There is no second event store, temporal model or persisted Calendar state.
Storage schemas, cloud projections, recovery, backup/restore, attachment ownership,
local-date arithmetic and chronological/completed/past/ongoing rules are unchanged.

## Calendar

Local date strings remain local calendar dates. Numeric local Date components,
noon anchors and locale first-weekday rules preserve DST, month and year boundaries.
Previous/next/Today and the existing roving date focus remain: arrows, Home/End,
Page Up/Down and Enter/Space. Date accessible names include the full date and count.

Desktop ports the approved gradient, 16px outer radius, 76px month header, 32px
weekday band, soft horizontal separators, Today ring, subtle selected day and
36px bottom padding. Each cell has a 21px date track and bounded event slot;
container queries adapt padding/text to the actual available space. The panel
has a 452px minimum for readable short-window rows. Six-week months add room;
existing inclusive ranges retain up to two week-segment lanes, with extra height
instead of overlapping events. One single-date event is shown in each cell;
`+N` reveals all entries through the existing selected-day section.

Events use 4px rectangles, a dark/context fill, a 2px inset context accent and
readable title/optional time. Selection keeps the same bounds, with brighter
fill/text, a 3px accent and soft glow. Long names ellipsize, retaining complete
accessible names/title attributes. Tasks use exactly the same component;
completed entries keep the existing reduced emphasis/strike-through in history.
No event icon, checkbox or Task badge is added.

Mobile uses the approved separate density: 44px-high date targets, no event
rectangles in cells, and up to three stacked indicator lanes with 1px gaps.
Single-date When/Due entries retain short context bars (18x2px, or 14x2px at
320px). Canonical When ranges instead use continuous 2px context spans with
rounded true endpoints and flush continuation at week boundaries. Up to two
range lanes leave a third lane available for singles; singles also use other
free lanes. Hidden ranges/singles contribute to the same +N overflow. Range
lanes remain stable across weeks where possible. Today ring and selection remain separate.
Selected-day entries appear immediately below Calendar, with full titles/times
and the same compact context-accent row language. The surface scrolls vertically.

## Upcoming and static avatars

`cosmosTime.upcoming` still decides inclusion and ordering. The view groups that
result by effective date (ongoing ranges group under Today), preserving event
order. One neutral node/date label serves all entries on a date. Range labels
are compact, and complete endpoints remain in accessible descriptions. Ongoing
range detail remains available when it shares a group with single-date entries.

Desktop uses one continuous 1px horizontal rail, 7px neutral nodes, 124px groups
(128px for multiple entries), readable text and native horizontal overflow.
Mobile uses a vertical rail/date groups and wrapping text. No individual event
has an enclosing card, border or background. Selection brightens title, source
miniature and local neutral node, with a restrained miniature halo.

`temporal-avatars.js` uses canonical objects and `galaxyAppearance.resolve`.
Ordinary dated objects use their own identity. Tasks use their immediate owning
Task List identity. Static satellite/astronaut geometry comes from the existing
pure SVG helpers; the DOM omits canvas-specific classes. Spheres use the approved
native CSS paint and a fixed tiny SVG texture. Galaxies use the existing pure
cloud SVG as a static image. No live nodes, force simulation, canvas, drag,
orbital behavior, animation loop, texture baking queue or timers are mounted.

The production context anchor/classifier/hash/palette logic remains unchanged.
Consequently fixture colors can differ from the lab's manually fixed review
palette. Identity remains readable through titles, dates, counts and accessible
labels, without requiring color discrimination. No manual color/icon controls exist.

## Navigation, Contents and writes

Time remains the existing sidebar destination. Desktop only replaces the center
canvas surface and keeps production Contents available. Calendar/Upcoming entry
selection calls canonical `selectEntry` with `fromTime`, preserving the camera
and keeping Time active. The selected state follows the canonical selected ID.
Metadata edits, task completion and hierarchy publication use their original
commands and refresh callbacks. Hidden Time does not aggregate on publication.

The shared desktop/mobile header X closes Time and uses canonical Universe focus to reveal the
selected CB, retaining selection. With no selection it returns without reframing.
Mobile uses a 44x44px target around the same compact X, alongside its existing
sidebar navigation affordance. Ordinary event selection continues to stay inside Time.

Mobile uses the existing drawer toggle and existing detail/Contents sheet.
Exposed Time stays interactive: a date or blank-area press dismisses the sheet,
and that same native input continues. An event tap updates the existing open
sheet. An outside drag dismisses without cancelling native scrolling; sheet
controls and internal gestures retain ownership of their own input. Explicit
close/swipe-down still restores entry focus in Time. Stale-session and dialog
guards remain. There is no duplicate detail UI. Universe navigation closes Time
through its existing handler; the drawer closes while Time is still active to
avoid a camera reset. There is no extra Back button or decorative header orbit.

Manrope is locally bundled for the app, with its OFL license and system fallbacks.
Only decorative major sidebar icons/background are removed. Hierarchy columns,
disclosures, pane splitting, data and the Universe starfield remain unchanged.
Functional ellipses share three fixed CSS circles while retaining their existing
action targets, labels and handlers. See `time-refinements.md` for validation.

## Deferred urgency contract

Task type does not imply stronger permanent emphasis. A future Due is normal;
Due today calls for moderate attention; overdue plus incomplete calls for clear
attention; completed stays readable with reduced emphasis in Calendar/history.
An ordinary dated Item's Today/current treatment is distinct from an overdue
Task. Final urgency styles, warnings and badges are deferred. Existing
aggregation and completed-history behavior are preserved.
