# Mobile Time close and continuous ranges

Branch: `feature/time-calendar-upcoming`. No commit, push or deployment.

The existing header X now appears on mobile with a 44x44px touch target and the
existing `Close Time view` accessible label. It remains outside the Calendar and
retains the sidebar affordance. Its unchanged action preserves canonical
selection and invokes existing Universe focus/reveal. With no selection, it
returns without selecting or reframing. Event clicks continue to stay in Time
and open/update the existing Contents sheet.

Mobile When ranges derive directly from canonical aggregation and the existing
`cosmosTime.segments` weekly projection. No range metadata, storage or alternate
range model is introduced. A decorative, non-interactive layer paints 2px
context-colored spans below the date numbers. True starts/ends have rounded
caps aligned to the short indicator area. Week continuations meet the week
edges flush, without a diagonal connector. Continuing events retain their lane
when possible, including when an earlier range has ended.

Two lanes may display ranges. Singles fill any of the three unoccupied indicator
lanes, retaining their approved 18x2px/14x2px dimensions and context colors.
Additional overlapping ranges/singles contribute to +N; the complete canonical
set remains in the selected-day list. When ranges occupy the indicator area,
overflow text sits beside its bottom lane. It does not cross date numbers.
Independent single-date entries are never inferred to form a range.

All lane assignment is disposable rendering state. The mobile layer is hidden
on desktop; existing desktop range allocation, event buttons and styles remain.
Calendar width, 44px mobile rows, Today ring, selected-day treatment, Upcoming,
avatars, Manrope, sidebar, transient Contents input behavior and persistence
remain unchanged.

Validation uses isolated local browser profiles and canonical v5 fixtures:

- Native mobile checks at 390x844, 320x568 and 740x390 cover single dates,
  independent consecutive dates, 2-day/4-day ranges, week wrapping, several-week
  ranges, month continuation, range/single collisions, capped overlap and exact
  overflow, Today and selection, and X with/without a selected CB.
- Sunday-first and Monday-first wrapping are checked. Native date/event taps
  pass through the decorative layer. Canonical When metadata is unchanged after
  selection, navigation, month changes and closing Time.
- Each viewport retains the compact 358px five-week Calendar and 44px rows,
  with no horizontal overflow. Screenshots were visually inspected.
- Existing Time and transient Contents checks cover native date changes, event
  switching, outside drag/blank dismissal, internal Notes scrolling, tabs,
  ellipsis, explicit close, focus return and swipe-down.

The earlier refinement test's hidden-mobile-X assertion now requires its labeled
44px target. Its blank-header tap was moved away from the newly visible X so
the test continues to hit empty space. No behavior assertion was removed.

Passing suite counts: 78 new mobile-range checks, 104 existing refinement/Contents
checks, 102 existing Time checks, 104 design/comparison checks and 80 relevant
Node tests. The design/comparison run includes the original 95 checks plus nine
exact pre-pass render/CSS comparisons: six viewport sizes in October and three
desktop sizes in November with visible multi-week ranges. Geometry, paint and
font match outside the requested mobile indicators. The separate 95-check design
run also passed. JavaScript/Python syntax and whitespace checks passed.

This pass does not claim new physical Android/iPhone or Safari testing.
Logs, screenshots, pre-pass files/hashes and exact comparison results are local
in `C:/Users/gusta/AppData/Local/Temp/cosmifold-time-mobile-ranges-pciw7adx/`.
