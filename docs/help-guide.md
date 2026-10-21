# Help: quick hints and optional details

Help is an English-only, presentation-only native dialog, reached from the
existing sidebar utility. No product model, persistence, account, navigation,
completion, camera or gesture behavior changes.

## Visible opening

**Getting started** introduces Cosmifold as a visual place to organize things,
then suggests creating an Item and adding other Items inside it.

**A few things to know** gives five short, plain-text hints:

- **+ Add something:** add an Item, Task List or content where you are working.
- **More / Manage something:** rename, move, duplicate or delete the current Item.
- **Tap or click an Item:** select it to move through your Universe.
- **Contents:** keep Files, Notes, Links and Location inside an Item.
- **Task Lists:** choose Add task list for a checklist; find lists under Tasks.

This is a quick skim, not a course. No concept cards, trees, flow diagrams,
relationship graphics, images, grids, numbered steps or tutorial paths remain.
Their Help-only markup and CSS have been removed.

## Optional details

**Need more help?** contains nine native disclosures, collapsed on every open:

1. Navigating
2. Adding & organizing Items
3. Contents
4. Task Lists & Tasks
5. Search
6. Constellations
7. Moving & duplicating
8. Backup & Restore
9. Mobile tips

Active/Completed, hiding and automatic return stay in the Task Lists & Tasks
topic. Tasks are direct children, can hold content and cannot hold child Items.
Constellations stay optional and favor normal branches when appropriate.
Copy/Paste creates independent copies; Duplicate structure leaves content behind
and resets checklist completion. Backup describes portable browser-local copies
and replacement on Restore, without promising cloud sync.

## Interaction and accessibility

The existing Help trigger, Close/Escape behavior, Tab containment, native
Enter/Space disclosures and focus restoration are retained. Disclosure and Close
touch targets are at least 44px on phones. No Help animation is introduced.

The topics pane alone scrolls. The dialog clips outer overflow and its header
stays pinned, preventing native disclosure focus/scroll from hiding Close.
Desktop width is bounded at 560px; narrow and landscape viewports remain usable.
There are no changes to the sidebar, splitter or mobile product interactions.

## Repeat manually

Have someone new skim the opening for 20-30 seconds. Ask what Cosmifold is, what
+ and More do, what selecting an Item does, what an Item can hold and how to
create a checklist. Close Help and let them experiment without an explanation.
The opening should not require learning Constellations, backups or task grouping.

On desktop, open each of the nine topics, use Space/Enter, Tab/Shift+Tab and
Escape, then reopen and confirm all topics are collapsed. Scroll long expanded
content and verify Close stays reachable. Open Help with an unfinished Note or
Location and an active Constellation; check selection, drafts and view survive.

On real phones at 360/390/430px, check text wrapping without horizontal scrolling,
tap disclosures, scroll expanded text and use Close. Reopen at the beginning.
After closing, repeat Preview/Contents swipes, Compact Done and +/More. Also
check 320px, short landscape and reduced motion when available.

Automated review: `python tests/browser-check.py --help-only --screenshots`.

## Validation (October 21, 2026)

- 81 focused Help browser checks passed: opening and topic content, collapsed
  defaults, removed visual markup/CSS, word budgets, keyboard/focus, native touch
  scrolling/taps, one scroll owner, reachable Close and unchanged workspace data.
- Product regressions passed: 97 Tasks/Compact Preview, 40 Task List dismissal,
  105 Constellation and 714 Contents/swipe browser checks.
- All 626 Node tests passed, including hierarchy, semantic labels, physics,
  Task Lists, completion, Move/Duplicate, storage and Backup/Restore coverage.
- Four packaging tests and 241 staging browser checks passed; staging contains
  the existing 54 runtime files, with no new assets or dependencies.
- JavaScript/Python syntax and Git whitespace checks passed. Desktop and
  360/390/430px screenshots were inspected; 320px and landscape bounds were tested.

The new-user comprehension exercise and real-phone review remain manual.
Nothing was committed, pushed or deployed.
