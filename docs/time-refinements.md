# Final post-integration Time refinements

Branch: `feature/time-calendar-upcoming`. No commit, push or deployment.

Subsequent mobile corrections are recorded in `time-mobile-ranges.md`: the shared
header X is now also visible on mobile, and canonical When ranges use continuous
mobile spans. The validation below records the earlier refinement pass.

## Behavior and implementation

1. Desktop's accessible header X closes the Time workspace, retaining the
   canonical selected ID. It invokes existing `focusEntry` to reveal that CB
   and its ancestors in Universe, followed by the existing keyboard-focus
   handoff. With no selection, it returns without selecting or reframing.
   Ordinary Calendar/Upcoming event clicks still stay in Time and update the
   existing selection, Contents and sidebar. The X is hidden on mobile.
2. Functional ellipses use three font-independent CSS circles: 2px diameter,
   4px center spacing, centered in a 14x4px paint area. This covers Contents,
   compact mobile actions, hierarchy rows, linked-item rows, task-list rows,
   collections and content-item menus. Existing button/summary sizes, accessible
   labels, focus treatment and handlers are retained; glyphs do not intercept
   pointer input. In particular, desktop Contents retains 28x28px and mobile
   retains 44x44px targets.
3. Only Time's native vertical scrollbar receives the existing app palette:
   dark `#0a1220` track, muted `#344359` thumb, `#465571` hover. Desktop
   Chromium/WebKit paints a narrow thumb inside its existing native gutter
   with a 4px border, without assigning a new scrollbar width. The tested
   Windows gutter remains 15px and its visible thumb is about 7px wide.
   Other engines use the scoped native color fallback. Scrolling and dragging
   remain native; Calendar/Upcoming dimensions remain unchanged.
4. Mobile Contents is a transient layer over Time. A press on an exposed date
   or empty Time surface dismisses Contents; the same native date input selects
   immediately. An exposed event tap updates the existing open sheet without
   a close/reopen. A drag starting on an event dismisses after 10px of movement;
   native panning continues. Exposed non-event surfaces dismiss on press and
   native scrolling continues there too. Narrow-screen wheel scrolling also
   dismisses the sheet.

Outside listeners belong only to the Time root. Contents is a sibling, so its
controls and internal scrolling never enter these listeners. They do not cancel
pointer/touch input, capture pointers, synthesize clicks, or replay a tap.
Touch tracking survives native pan's `pointercancel`. A trailing pointer click
after an outside event drag is suppressed; the next real press resets that
guard, and keyboard activation remains available. Outside dismissal bypasses
the explicit-close focus return so it cannot steal the intended date focus or
scroll. Existing close/chevron, swipe-down and explicit focus return remain.
Stale-session inertness and dialog/recovery guards are retained.

## Validation

All browser runs use disposable local profiles, fixture data and local servers.
Touch checks use native browser input dispatch, with exposed-target hit testing,
at 390x844, 320x568 and 740x390. This pass does not claim new physical-device or
Safari testing.

| Suite | Passing checks |
| --- | ---: |
| Focused Time refinements, native touch and internal Notes scrolling | 104 |
| Existing Time view | 102 |
| Approved design plus six exact pre-pass CSS comparisons | 101 |
| Existing mobile Contents | 714 |
| Existing mobile capture | 160 |
| Existing action menus | 95 |
| Existing sidebar refinement | 95 |
| Relevant Node tests | 80 |

The design run includes the existing 95 checks plus six exact comparisons:
1440x900, 1280x800, 1200x768, 390x844, 320x568 and 740x390. All 234
Calendar/Upcoming elements retain their rectangles, colors, backgrounds and
font sizes; each viewport retains its native scrollbar gutter. The separate
95-check design run also passed. Screenshots were visually inspected.

The Contents suite's former assertion of the old font glyph/letter spacing was
updated to require the requested fixed three-circle paint, suppressed legacy
glyph, accessible label, and unchanged 28x28px desktop target. Its existing
mobile 44px targets, gesture, editor, file/photo and focus assertions remain.
JavaScript and Python syntax checks also pass.

The legacy `--navigation-only` suite fails after 111 passing checks on its old
canvas context-menu action-list expectation. The identical failure and count
were reproduced using the saved pre-pass app files in an isolated temporary
site. That unrelated assertion was left intact. Current action-menu and Time
navigation checks pass.

Logs, before-file hashes, the isolated baseline, six-viewport geometry results
and screenshot paths are recorded locally in
`C:/Users/gusta/AppData/Local/Temp/cosmifold-time-final-refinement-ops4p_5g/`.

## Scope

This pass changes `index.html`, `script.js`, `style.css`, `time-view.js`,
`time-view.css`, `tests/browser-check.py`, `tests/mobile_contents_browser.py`,
`tests/time_refinement_browser.py`, `docs/time-view.md` and this note.

Pre-existing worktree changes are retained. The pre-pass hash audit confirms no
changes to the design lab, Calendar/Upcoming paint/layout rules, temporal avatars,
Manrope assets, Time data model, metadata, persistence, copy/paste, backup/restore
or cloud implementations. Only the former mobile Time input-blocking rule was
removed from the approved mobile styles. No commit, push or deployment was made.
