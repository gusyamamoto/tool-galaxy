# Task Lists (V1)

Add a Task List anywhere in your Universe. Its children are tasks.
Complete them to bring the branch to life.

## Creation

**Add item** opens normal creation directly. **Add task list** is a separate
sibling action in the mobile quick menu, desktop CB context menu, Contents +,
and sidebar row +. The mobile menu retains Take Photo, Photo Gallery, Add item,
then Add task list. There is no additional type picker.

Task List creation uses the existing creation dialog: required Name, optional
Tasks (one per line), Create. Blank lines are ignored. Every name uses normal
CB validation (required, at most 60 characters). A zero-task list is allowed.
The complete list is validated and saved in one metadata commit before UI
publication, so invalid tasks or a failed save leave no partial checklist.

## Data and structure

Canonical parents optionally store `taskList: true`. A CB is a task exactly when
its direct parent has that flag. Tasks store `completed: boolean` (absent means
false). Task List versus regular kind is fixed at creation. There is no conversion action.

Task Lists contain ordinary leaf CB tasks; they cannot contain another Task List.
Tasks cannot contain child CBs. Files, Notes, Links, Location, rename,
Constellations and independent copying still work. Task capture menus keep
Take Photo and Photo Gallery. Shared model validation enforces restrictions for
creation, Move dialogs, drag/reparent, Duplicate structure and Copy/Paste.

Moving a regular leaf into a Task List makes it a task. Moving a task out makes
it normal, retaining stored completion without displaying task UI. Moving
between lists retains completion. Moving a Task List keeps its role and tasks.
Move destinations exclude tasks and reject lists/branches inside Task Lists.

**Duplicate structure** keeps Task List parents and task names and resets task
completion to false. Normal structure duplication keeps its existing empty
content semantics. Ordinary Copy/Paste retains completion metadata and derives
task status from the destination parent; copying a task outside a list makes it
normal. Pasting a branch or Task List into a Task List is rejected.

Older normal snapshots load unchanged. The experimental flag is discarded by
entry normalization; experimental branches become normal CBs with their
hierarchy and content intact. Task Lists and completion round trip through
canonical snapshots, local persistence, archives and Backup/Restore. There is
no new cloud schema or cloud activation behavior.

## Progress and visuals

A Task List counts completed direct children / all direct children. No task
ancestry or descendant aggregation is used. Empty lists display **0 tasks**,
ratio 0 and incomplete. A two-pass linear metadata index is rebuilt only on
mutations, never by the physics tick or animation loop.

Task Contents shows a native accessible **Done** checkbox; Task List Contents
shows **Task progress**, count, percentage and meter. Normal CBs show neither.
The task section remains available with Files, Notes, Links and Location.

Direct tasks also reuse the sidebar disclosure button as a compact checkbox.
The same `changeTask` action saves completion, updates all four controls and runs
the existing Universe visuals/progress/pulses. Clicking the task name still
navigates normally. Parent chevrons and normal childless gutters stay unchanged;
no columns, parent progress indicators or right-side controls are added.
The button exposes checkbox role, checked state, an actionable name, keyboard
focus, and pending-save state without losing focus. On mobile it has a centered
44px touch target inside the existing 32px gutter; visible indentation, label
positions and row height do not change. Scrolling from the target does not toggle.

Run `python tests/browser-check.py --sidebar-tasks-only --screenshots` for the
focused native mouse, keyboard, accessibility-tree and 360/390/430px touch checks.
For real-phone review, open Before the trip in the sidebar, check Buy flight,
confirm Universe/Contents/progress sync, tap its name to navigate, then reopen
the sidebar and uncheck. Repeat at all three widths; scroll a long checklist
starting on a checkbox and verify it scrolls without toggling. Check +/More
still work and that neither task names nor sibling alignment shift.

Existing artwork is reused: Sun unignited to ignited, Planet barren to alive,
Moon muted to illuminated, Satellite asteroid to craft, Astronaut alien to
astronaut. Celestial roles still derive only from depth. Parent artwork
interpolates with the direct-child ratio and retains the progress ring.
Checking a task focuses its real CB through existing navigation, then plays
the existing short energy pulse on camera arrival. The final task also
pulses its direct list parent. Unchecking plays no celebration. Reduced motion
suppresses animation and transition behavior as before.

Desktop Contents + and More share a centered 28px control group with a 6px gap.
Normal CB phone layout, sheet navigation and editor/capture implementations are
unchanged; tasks gain the Compact Preview control described below.

## Returning to Tasks and Compact Preview

`task-views.js` derives the lower sidebar's Tasks view from the canonical entry
Map and the existing direct-child progress index. It holds UI references and
disclosure state only, never copied CBs or a persisted task dataset. List order
follows stable model order. Names navigate to the real Task List/task; list
disclosures affect only this secondary view. Context is available in list-name
tooltips. Empty Tasks is hidden; empty checklists stay active with **0 tasks**.

Checklists start collapsed and show a quiet completed/total summary. Expanded
checklists retain both complete and incomplete tasks. Lists are grouped under
peer **ACTIVE** and **COMPLETED** headings; fully complete lists belong to Completed. Active defaults expanded;
Completed defaults collapsed. Manual changes persist independently as
`tasksActiveCollapsed` and `tasksCompletedCollapsed` in navigation preferences,
including Backup/Restore. Completion never overrides those preferences; unchecking
returns a list to Active. The Tasks heading retains its separate `tasksCollapsed`
preference. Individual checklist disclosures remain disposable UI state.

Constellations sits below Tasks in the quieter, bounded, scrollable secondary
area. It starts collapsed unless the existing explicit preference says otherwise.
Its heading/+ and Add to Constellation remain available, including when empty.
Tasks never creates automatic Constellations. The primary Universe hierarchy's
rows and indentation remain unchanged.

Mobile task Compact Preview adds a single 44px **Done** row below the existing
title/+ /More controls. Task List parents show a small progress count instead;
normal CBs retain their existing Compact Preview. No content editors are added.
The Done label owns its touch interaction; the title/handle keeps the existing
Preview/Contents gesture behavior.

Compact Preview, Contents, Universe sidebar and global Tasks checkboxes all call
`changeTask` and read the same durable `completed` value. Failed or pending saves
keep durable state and use existing error handling. No surface has a separate
completion state. Create, rename, Move, delete, duplicate, archive/reload and
Restore rebuild the view from canonical mutations.

Checking Done uses `focusEntry` with normal, bounded CB framing. If the selected
task is already adequately framed, its view stays stable. Desktop sidebar and
secondary disclosures remain open. On a phone, a drawer leaving too little
canvas closes through ordinary navigation to reveal the task; reopening retains
the secondary view's expanded state. Pulses wait for the existing camera's rest
callback, and stale pulses are discarded after selection/state changes. Unchecking
does not navigate or celebrate. Reduced motion uses the camera's existing immediate
positioning and suppresses animated effects.

Run `python tests/browser-check.py --task-views-only --screenshots` for focused
four-surface synchronization, navigation, mobile gesture, dynamic-mutation and
real Backup/Restore coverage.

Repeat on a real device at 360/390/430px equivalents:

1. Create Before the trip under Travel/Japan, Renovation tasks under Home/Kitchen,
   and Assignments under Learning/Course. Find all three in Tasks.
2. Expand Before the trip. Check Car from Tasks; confirm the real CB is selected,
   framed, alive/pulsing, its parent count/ring advances, and all four controls agree.
   Reopen the phone drawer and confirm the checklist stayed expanded.
3. Uncheck from each sidebar; confirm state/visual reversal with no camera travel.
4. Select an incomplete task and check Done in Compact Preview. Verify stable
   already-appropriate framing, a compact 44px target, readable title, +/More,
   and working handle swipe to Contents with Done already checked.
5. Complete the final task: parent reaches 100%, Completed stays discoverable,
   and unchecking returns the list to active. Reload to check both saved group disclosures.
6. Test rename, add/delete task, Move out/between lists, duplicate reset and
   Backup/Restore. Verify every view follows the real hierarchy.
7. Scroll long secondary checklists, switch Tasks/Constellations disclosures,
   create/use a manual Constellation, and confirm the Universe remains usable.
8. Repeat with reduced motion and real keyboard/camera/gallery flows.

## Validation and manual review

```powershell
node --test (rg --files tests -g '*.test.js')
python tests/browser-check.py --task-lists-only --screenshots
python tests/browser-check.py --desktop-add-only --screenshots
python tests/browser-check.py --mobile-capture-only
python tests/browser-check.py --body-actions-only
python tests/staging_package_test.py
```

Use disposable browser storage for automated scenes; never alter personal data.
The focused browser scene builds Japan contains Photos, Places, Before the trip, with
Buy flight, Book hotel, Rent car and Buy eSIM as direct tasks.

Repeat on a real phone at 360/390/430px equivalents:

1. Open Japan's +: Take Photo, Photo Gallery, Add item, Add task list, in order.
   Add item must open its normal name form immediately.
2. Choose Add task list. Enter Before the trip plus the four tasks, including
   blank lines. Create once. Check the hierarchy and normal Photos/Places.
3. Check tasks one at a time: each lights up, count/ring advance 0/4 to 4/4,
   parent gradually comes alive, final completion pulses parent briefly.
4. Uncheck: task becomes dormant, progress decreases, no completion pulse.
5. Open a task's + and More: no child creation; camera/gallery, Files, Notes,
   Links, Location, rename, Constellations, Copy and valid Move still work.
6. Move a task out: no Done UI. Move it back/between lists: state is retained.
   Reject a branch or Task List moved/pasted into a Task List.
7. Duplicate the list: names/structure match and all tasks start unchecked.
8. Create an empty list: 0 tasks, dormant, never complete; add its first task.
9. Check Preview and Contents, swipes, title rename, inline save/cancel editors,
   keyboard, capture cancellation, sheet sizing and mobile More at all widths.
10. Back up, reload and Restore in disposable data: list roles and completion
    survive. Open old normal data and confirm it remains normal.
11. On desktop check context/Contents/sidebar sibling creation choices and
    title +/More alignment at narrow panel widths, semantic zoom and labels.
12. Enable reduced motion and repeat completion/uncheck.

## Implementation files

- `task-lists.js` replaces the experimental task module: direct-parent state,
  batch creation, completion validation and reusable artwork.
- `task-views.js`: derived secondary checklist UI; `constellations-ui.js`: quiet
  default honoring explicit preferences; `mobile-contents.js`: task-control
  gesture ownership; `services/local-restore.js`: Tasks UI preference validation.
- `model.js`, `hierarchy.js`: metadata normalization, immutable list kind,
  structural restrictions and contextual task creation wording.
- `script.js`, `index.html`, `style.css`: creation surfaces, single checklist
  form, shared Contents, progress/animation integration and desktop alignment.
- `clipboard.js`, `services/universe-repository.js`: duplication reset, paste
  validation (including revalidation after file staging), canonical persistence.
- `tests/task-lists.test.js`, `tests/task_lists_browser.py`: replacement coverage
  for the experimental task suites. `tests/sidebar_tasks_browser.py` checks
  completion through the reused sidebar gutter and shared Contents action.
- `tests/task_views_browser.py`: four-surface completion/focus, dynamic secondary
  view, real Restore and Compact Preview coverage at all three phone widths.
- `tests/desktop_add_browser.py`, `tests/browser-check.py`,
  `tests/mobile_capture_browser.py`, `tests/mobile_body_actions_browser.py`,
  `tests/restore.test.js`, `tests/staging_package_test.py`: creation expectations,
  responsive alignment, mobile regressions, restore and package coverage.
- `README.md`, `docs/mobile-capture-flow.md`, this document: Task List terminology
  and review instructions. Existing `motion.js` and `tests/motion.test.js`
  completion effects/coverage are reused; existing staging/browser changes remain.

## Validation results (October 20, 2026)

- Full Node unit suite: 614 passed, zero failures.
- Global Tasks/Compact Preview: 97 browser checks passed, including the multi-
  Galaxy 2/4, 1/3, 2/5 review scene, four-surface state sync, completion focus,
  stable already-focused camera, visible arrival pulses, active/Completed groups,
  dynamic mutations, keyboard/touch controls, task rename/cancel, real Restore,
  and native secondary scrolling.
- Focused Task List browser suite: 92 passed, including failed creation rollback,
  direct progress, visual interpolation, completion/uncheck, reduced motion,
  Move, duplicate, paste, content saving, reload, and 360/390/430px creation.
- Sidebar completion: 72 passed, including native checkbox/name interaction,
  accessibility-tree name/state, repeat keyboard toggles with retained focus,
  pending/failed persistence, shared Contents sync, Move out/back, 44px touch
  geometry, scrolling without toggling and persistence after reload.
- Ordinary sidebar/readiness regression: 349 passed; sidebar group moves: 62 passed.
- Desktop Add/mobile isolation: 24 passed, including long names and aligned
  controls at 220/260/288px desktop panel widths.
- Mobile capture: 82 passed; body management: 97 passed.
- Contents/swipes/sheet sizing: 714 passed; mobile inline editors: 393 passed.
- Terminal labels: 90 passed; semantic zoom/handoffs: 413 passed.
- Constellations: 105 browser checks passed, including independent disclosures,
  manual membership/navigation and native mobile +/More controls.
- Staging: 4 package tests and 237 prepared-artifact browser checks passed.
- JavaScript syntax and Git whitespace checks passed.

Browser runs use disposable profiles and data. Real-device camera, touch/keyboard
and reduced-motion review still require the manual phone checklist above.
Nothing was committed, pushed or deployed.

## Sidebar refinement (October 21, 2026)

Universe and the secondary views share row typography, disclosure/icon gutters,
row heights and indentation tokens. Task checkboxes occupy the disclosure gutter;
their labels stay in place when checked. Progress counts remain small, muted and
right-aligned. Active and Completed use matching indented uppercase subgroup rows. Tasks and
Constellations retain the same small uppercase section-heading treatment.

On desktop, `sidebar-split.js` allocates vertical space between Universe and the
secondary content. Drag the divider, focus it and use Up/Down (16px), or double-
click to restore the default. Universe receives at least 160px and the secondary
pane at least 104px when space permits; both minima scale together in very short
windows. The default reserves up to 32% for secondary content and favors Universe.
The ratio is stored as `sidebarPaneRatio` in existing local navigation preferences,
separately from Universe content. Malformed values use the default; numeric values
and viewport changes clamp to the available space without replacing the preference.

Universe's tree scrolls inside the upper pane. Tasks and Constellations share one
lower scroller; neither checklist nor Constellation list adds an inner desktop
scrollbar. Help, Backup and Account remain anchored outside these content panes.
Collapsing Universe hides the divider and gives the secondary pane the free space.

Mobile uses the existing drawer layout and scroll sizing. The pane wrapper has
`display: contents`, and the divider is hidden and removed from keyboard navigation
at the same mobile breakpoint used by the hierarchy sidebar, including short
touch-screen landscape. Task checkbox targets remain 44px.

Repeat desktop review with enough rows to overflow both panes: drag up/down to
both limits, scroll each pane, use arrow keys, refresh, resize browser height,
double-click reset, and check narrow sidebar widths with long list names. Confirm
Universe/task indentation and progress alignment, Completed's subordinate styling,
and access to Help/Backup/Account. Expand and create Constellations as usual.

On a real phone at 360/390/430px, open the drawer and confirm no divider, natural
scrolling, aligned task labels and easy checkbox taps. Expand Completed and
Constellations, complete/uncomplete from both sidebars, Contents and Compact
Preview, and repeat Preview/Contents, rename, capture, +/More and swipe interactions.

Focused automated coverage: `tests/sidebar-split.test.js` and
`python tests/browser-check.py --sidebar-refinement-only --screenshots`.

Validation for this refinement: 618 Node tests, 57 focused sidebar browser checks,
97 task-view/Compact Preview checks, 72 hierarchy task checks, 349 readiness checks,
105 Constellation checks, 90 terminal-label checks, 413 semantic-handoff checks,
82 mobile capture checks, four packaging tests and 241 prepared-staging browser
checks passed. The staging artifact contains 54 runtime files. JavaScript/Python
syntax and Git whitespace checks passed. Desktop and 360/390/430px screenshots
were inspected; real-phone review remains manual. Nothing was committed, pushed
or deployed.

## Sidebar hierarchy alignment (October 21, 2026)

Universe, Tasks and Constellations share root heading text/disclosure alignment,
color, typography and row rhythm. Each section owns its contents. The existing
14px desktop / 9px mobile tree step now applies from the root heading inward:
Universe -> CB -> child; Tasks -> Active/Completed -> Task List -> task;
Constellations -> collection. Internal Universe branch steps are unchanged.
Subgroups use quieter 9px uppercase type; Task Lists and tasks retain normal 12px
row typography, stable checkbox gutters and right-aligned muted progress counts.
Both task groups remain available when empty, whenever Tasks itself is present.
The splitter implementation, ratio/minima, two desktop scroll panes and pinned
utilities are unchanged. Mobile keeps the existing drawer, scrolling and 44px
checkbox targets. NavigationSection supplies both group disclosures and accessible
state, and restores focus to the destination group if a focused checklist moves
into a collapsed group. Completion data and camera/visual behavior are unchanged.

Validation: 620 Node tests; 95 focused sidebar hierarchy/disclosure/splitter browser
checks; 97 task-view/Compact Preview checks; 349 readiness checks; 105 Constellation
checks; 413 semantic-handoff checks; 90 terminal-label checks; four packaging tests;
and 241 prepared-staging checks passed. JavaScript/Python syntax and Git whitespace
checks passed. The staging package contains 54 runtime files; nothing was deployed.

Visual review: in a fresh test profile, confirm equal root heading/disclosure
alignment, Active initially open and Completed initially closed. Expand a checklist
in each group and compare their name/progress columns and task gutters. Complete
and uncomplete a list: it changes groups without changing the saved disclosures.
Toggle both groups and refresh/reopen to verify each preference. Repeat splitter
drag, keyboard, reset and independent scrolling. On real phones at 360/390/430px,
check the same staircase, no splitter, 44px checkboxes, natural drawer scrolling,
Preview/Contents and Compact Done, plus capture and +/More behavior.

## Hide completed lists from Tasks

A completed Task List has a More menu in its secondary-view row with **Hide from
Tasks**. Desktop uses the existing hover/focus treatment; mobile exposes the
normal 44px More target. The shared menu keeps its existing keyboard dismissal,
focus restoration and bounded positioning. Active lists have no dismissal action.
Opening this menu and hiding a list do not select or frame its celestial body.

`hiddenCompletedTaskListIds` stores only IDs in navigation preferences, separate
from canonical content. The list remains in Universe and search with its tasks,
completion, alive appearance, Notes/Links/Location and original files unchanged.
The preference survives refresh and fresh app sessions and is included in the
existing Backup/Restore preference snapshot. Old normal data needs no migration.

The view reconciles these IDs against canonical direct-child completion whenever
it renders. If a dismissed list is incomplete, it removes its ID and persists the
updated preference. Unchecking, adding unfinished work, or another hierarchy edit
that makes work active therefore restores the real list under Active. Completing
it again shows it normally under Completed, where it can be hidden again. Missing
or archived IDs are left alone until that list's state is available. No expiry,
bulk cleanup or content flags are introduced.

An empty Completed group keeps its compact heading and existing disclosure
preference. Its empty list takes no height; Active behavior is unchanged. The
splitter, scrolling, completion/focus/visuals and mobile content flows are reused.

Review with Shopping 2/4 and Before the trip 4/4: open the completed row's More
menu and choose Hide from Tasks. Confirm it disappears only from the secondary
view, then refresh and reopen the browser. Find it through Universe/search and
uncheck one task: it returns under Active at 3/4. Complete it again: it appears
under Completed and can be hidden again. Repeat by adding an incomplete task to
a hidden list, and repeat touch More/Hide at 360/390/430px. Verify all content and
completed visuals remain, disclosure preferences stay unchanged, and no splitter
appears on mobile. `tests/task-dismissals.test.js` and browser mode
`--task-dismissals-only --screenshots` cover the dismissal lifecycle.

Validation: 626 Node tests, 40 dismissal browser checks, 95 sidebar/splitter
checks, 97 Tasks/Compact Preview checks, 105 Constellation checks, four packaging
tests and 241 prepared-staging checks passed. The dismissal suite verifies exact
canonical metadata/camera/selection preservation, original attachment bytes,
refresh and fresh-app-tab persistence, both return paths, re-completion, keyboard
focus, real Backup/Restore and native touch menus at all three phone widths.
Syntax and whitespace checks passed. Mobile screenshots were reviewed; full
browser reopen and real-phone checks remain manual. Nothing was committed,
pushed or deployed.
