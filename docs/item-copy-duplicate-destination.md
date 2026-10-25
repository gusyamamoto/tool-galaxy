# Item Copy/Paste and Duplicate Structure locations

Branch: `fix/item-copy-duplicate-destination`. No commit, push or deployment.

## Contract audit

Copy uses a page-local `HierarchyClipboard` containing canonical source/root IDs, not an OS clipboard payload or a frozen content snapshot. Selected ancestors absorb selected descendants. Paste reads the current branch afresh at execution and creates independent IDs for Items, bookmark records, attachment metadata/ownership and wholly internal linked placements. It copies descendants, names, descriptions, category, appearance, Notes, Links, Files/Media, Location, Task List markers and task completion. External linked placements, Constellation memberships, archive membership and incidental rendering flags are excluded. The clipboard is reusable until its sources disappear or the page reloads. Names remain unchanged; collisions already permit identical names, with no new suffix/numbering policy.

Duplicate Structure has a separate allowlist: fresh IDs, names and canonical parentage, empty description/category, new timestamps/position, Task List markers and incomplete tasks. It excludes Notes, Links, Location, files, thumbnails, appearance, linked placements and memberships. No attachment storage access is needed. Its default name remains the source name truncated to 55 characters plus ` copy`, editable with the same trimming and 60-character validation. Leaving Location unchanged preserves the previous same-parent behavior.

The sidebar right-click menu, row management menu and Contents `...` already share `renderBodyActions()`. A desktop-only hiding condition suppressed Paste. That condition is removed, the shared label is **Paste here**, and all these surfaces consult `canPasteHierarchy()` with the same clipboard/model validator. Clicking it immediately executes the existing independent-copy repository operation, capacity check and attachment adapter. No intermediate confirmation or routine success notification is shown. Desktop Contents `+` still contains structural creation actions only. Existing sidebar `+` shortcuts are unchanged.

## Destination validation

`hierarchyCopies.destinationValidator()` projects independent structural IDs without reading attachment bytes, cloning content, allocating production IDs or mutating originals. It runs the existing `galaxyModel.validateChange()` on the resulting hierarchy. The same validation supports menu availability, the Duplicate picker, planning and copy commit revalidation.

Paste is hidden when the page-local clipboard has no surviving roots, storage is unavailable, the destination is missing/inactive, a conflicting operation is busy, or the resulting hierarchy would violate Task List/task constraints. Raw archived destinations are also rejected by the repository/planner. A branch with children cannot become a task; Task Lists cannot contain other Task Lists; tasks cannot contain children.

Existing independent-copy semantics allow copying into the source or a descendant: all copied IDs are new, and only the finite source snapshot is copied. Move's cycle prohibition is therefore not reused for independent copies. Existing hierarchy rules have no fixed maximum Item depth; roles derive from depth and deep Items remain supported. No new depth cap is introduced.

Galaxy **Duplicate Structure** remains fixed to Universe/root; Location shows Universe with no nesting selector. Other structures may choose any model-valid active location, including another Galaxy, a valid descendant, or Universe when permitted by the model. This creates new Items and leaves the original in place.

## Location UI reuse

The existing `MoveDestinationIndex`, `MoveDestinationPicker` and `CanonicalSinglePicker` provide tree rendering, expansion, case-insensitive search, paths, canonical identities and keyboard behavior. Optional controller settings allow the current parent to be selected by default and supply independent-copy validation. Duplicate omits the redundant bottom destination summary; Move retains its existing summary and operation.

There is one Duplicate dialog across desktop/mobile. Its Location field uses a bounded scrolling choice list, 44px controls and a selected-row highlight/checkmark, with Galaxy ancestry shown in search results. The tree leads directly to Cancel / Duplicate without repeating the destination beneath it. Galaxy duplication displays a fixed Universe location. Submit captures the destination, disables editing during the operation and revalidates before one metadata commit. Invalid destination/name or persistence failure publishes no partial duplicate.

The new dialog was inspected at desktop and 320px phone widths. Automated interaction checks also cover 390px portrait and 740×360 landscape, including scrolling a short management menu and reaching Duplicate after selection.

## Persistence and preserved UX

| Contract | Result |
| --- | --- |
| F1 | Existing write lock and stale comparison retained. A copy made stale after byte staging exposes authoritative Reload, preserves winning metadata and compensates the staged rows without a generic F2 banner. |
| F2 | Both raw-Blob and byte-fallback failures use the existing persistent F2 file-failure banner and support retrying Paste here without partial publication. |
| F3 | Corruption preservation/startup ordering are unchanged; combined recovery tests pass. |
| F4 | Copy still uses the existing journal/saveBatch/compensation/recovery path. No separate binary pipeline. |
| F5 | New cross-Galaxy structures and content copies pass portable Backup validation. Existing Restore model and byte round-trip tests pass. |
| F6 | Object URL implementation and ownership unchanged; lifecycle suite passes. |
| F7 | Existing batch capacity check remains before copy persistence; actual write errors remain authoritative. |
| F8 | Audit sees ordinary canonical references and recognizes both Blob and byte-backed records. No copy-created orphans/recovery ownership remain after success or failure. |
| F9 | Combined persistence/recovery checks pass. |
| WebKit | Existing `cosmifold-bytes-v1` decoder/fallback is reused unchanged. Original and thumbnail hashes match independently owned copies. |

The approved static hero/assets, mobile sidebar action layout, Universe `+`, always-visible Tasks, mobile accordion, desktop section disclosure, capture menus, More/icons, Constellation disclosure, coach, starting-point flow and cloud/auth implementation were not edited. Appropriate shared mobile management menus inherit the same Paste here label/validity; no sidebar row `+` was reintroduced.

## Initial Batch 2 validation (before immediate-Paste correction)

Full Node suite: **852 passed**, including 16 new destination tests. Baseline was 836.

| Browser suite | Passed |
| --- | ---: |
| New item destination workflow | 84 |
| Existing Duplicate Structure | 43 |
| Existing Copy/Paste | 61 |
| Desktop add/action isolation | 30 |
| Move destinations | 156 |
| Sidebar group Move | 62 |
| Pre-release UX | 136 |
| Mobile capture | 104 |
| Mobile attachment | 48 |
| Task Lists | 92 |
| Sidebar Tasks | 72 |
| First-use/onboarding | 74 |
| WebKit binary compatibility | 40 |
| Attachment transaction recovery | 32 |
| Combined persistence/recovery | 33 |
| Local stale writes | 20 |
| Background file failures/F2 | 35 |
| Attachment orphan audit | 39 |
| Storage capacity | 29 |
| Restore model validation | 53 |
| Object URL lifecycle | 26 |
| Fresh package smoke | 265 |

Browser total: **1,534 checks across 22 suites**. This covers the affected action/hierarchy/storage workflows and accepted UX regressions, rather than every historical browser suite. Only final successful runs are counted.

Packaging: **5 tests passed**. The fresh ignored local package is `staging-site/item-destinations-20261025` (61 runtime files). Existing packages were not overwritten; no deployment occurred. Syntax: **150 JavaScript files and 2 Python files passed**. Whitespace and `git diff --check` passed.

Existing fixtures were adjusted where the broader validation exposed obsolete assumptions: structure/Backup fixtures now use active creation destinations (Backup archives after copying); the group Move fixture waits for async starter creation and queued content/membership writes before capturing its baseline. Assertions for metadata/content/attachment preservation remain intact. The new browser suite also checks F1's established policy of closing stale editors and prioritizing Reload.

## Exact manual checklist

Use disposable test data at the same local test origin throughout; reload must retain that origin.

1. Create **Galaxy A** and **Galaxy B**. In A, create **Reusable structure → Restaurants → Bookings**, plus a Task List with a completed task. In B, create **Library**. Add a photo and document, Notes, a Link and a Location to Reusable structure.
2. Before copying anything, right-click Library and open its Contents `...`. **Paste here must be absent** in both.
3. Open Reusable structure's **Duplicate structure**. Confirm the usual `Reusable structure copy` name and Location defaulting to Galaxy A. Duplicate without changing Location; confirm a sibling with the same hierarchy, empty contents and incomplete tasks. Original content remains unchanged.
4. Repeat Duplicate Structure, edit the name if desired, search **Library**, select **Galaxy B › Library**, and confirm **Duplicate**. Verify the new root is inside Library, its descendants/Task Lists are correct, tasks are incomplete, and it has no Files, Notes, Links or Location. Verify the original remains in A with its content intact.
5. Repeat with another valid location inside A. Try a Task List/task as destination for a branch with children: it must not be selectable. Archived locations must not appear. Open Duplicate on Galaxy A: Location must be fixed to Universe.
6. Copy Reusable structure. Right-click Library in the sidebar: **Paste here** must appear. Choose it once; no second screen or confirmation should appear. Confirm the branch immediately lands inside Library with its original names, contents, completed task and independently owned photo/document bytes.
7. Without another Copy, choose a second valid Item and open **Contents `...` → Paste here**. Confirm the same copy operation immediately succeeds again. Original and first copy remain intact. Duplicate names follow the existing behavior.
8. Copy a branch with children, then inspect a Task List and a task destination: Paste here must be absent. Copy a leaf Item and verify model-valid Task List placement remains possible. A self/descendant destination may remain available for an independent copy; confirm a finite separate subtree with fresh IDs.
9. Open copied photos/documents, reload, then reopen all copies/duplicates. Rename or edit one copy and verify originals remain unchanged. Delete a copy and verify original attachments remain available. Make a Backup and validate/Restore it only in disposable data.
10. On phone/tablet, open the same Duplicate dialog and select a destination in another Galaxy. Check search, full path, scrolling, Cancel, Duplicate and focus. At short landscape height, scroll the management menu/dialog as needed; controls must remain reachable.
11. Confirm accepted UX still works: mobile has row `...` without row `+`, Universe `+`, Tasks and its major-section accordion, camera/photo/files menus, static Introduction and More. Desktop Contents `+` remains Add item/Add task list.

Physical iPhone/Android UI was not exercised here; responsive checks used Chromium emulation. WebKit storage faults were injected into real IndexedDB transactions, using the accepted compatibility test probe. The native camera/provider path and storage representation themselves are unchanged in this pass.

## Immediate-Paste correction

The confirmation component was Paste-only. Its hidden legacy Link option was no longer a user-facing choice; existing linked-item/reference features have their own infrastructure. The correction removes the modal, its DOM, CSS, listeners, destination/focus state, hidden Link branch and obsolete modal tests. The page-local clipboard keeps its ID/root and copy-validity behavior. Linked placements still load, navigate, edit shared originals and use their independent reference management; no linked-item implementation was removed.

Every management menu, existing sidebar Add shortcut, Ctrl+V and Cmd+V now calls `pasteHierarchy(destination)`. It captures the requested source roots, starts the existing ordered command immediately, reads current source data at execution, validates before planning and again before metadata publication, and uses the existing repository/capacity/saveBatch/journal/compensation path. A lifetime busy flag blocks repeated activation and keeps CRUD animation ownership while bytes are pending. Source/destination invalidation after menu rendering produces the existing F2 failure banner with no partial copy. Success naturally publishes/selects the new branch, retains the clipboard and shows no routine success toast/modal. Failure remains dismissible through the existing banner; retry is another Paste here activation. F1 Reload retains priority over generic errors.

The accepted Duplicate Structure JavaScript, HTML and CSS regions were hash-compared against the start of this correction and are unchanged. The shared Move destination controller and repository were also unchanged during this correction.

Regression coverage includes immediate execution from both desktop menus and mobile management, absence of the obsolete modal, reusable/live-source clipboard, invalidated clipboard and destination, duplicate activation during pending copy, independent Blob/byte-backed original and thumbnail hashes, actual fallback failure, callback rollback, F4 crash/reload recovery, F5 validation and F8 audit. Older fixtures now invoke immediate Paste directly; linked fixture creation uses the retained reference API instead of the retired hidden Link option.

For the correction's manual retest, follow steps 1?11 above with the updated direct Paste interaction. Additionally, dismiss a storage failure through the existing banner and choose Paste here again to retry. If another tab wins a write during copying, verify Reload remains authoritative and the failed copy does not appear. Physical device testing remains manual; browser phone/tablet checks use emulation.

### Correction validation results

- Full Node suite: **851 passed**, zero failures/skips. One obsolete hidden-Link clipboard unit test was retired (previous count: 852).
- Browser: **1,797 checks across 24 suites**, including **104** immediate-Paste/destination checks. Counts below include only each suite's final successful run.
- Packaging: **5 passed**; fresh ignored `staging-site/immediate-paste-20261025` contains 61 runtime files and passed its 265-check browser smoke test. No existing package was overwritten or deployed.
- Syntax: **150 JavaScript files** and all **7 changed Python modules** passed.
- All 15 files touched by this correction passed explicit whitespace checks; cumulative `git diff --check` passed.

| Browser suite | Passed |
| --- | ---: |
| Immediate Paste / item destinations | 104 |
| Copy/Paste, keyboard, live source, content and compensation | 41 |
| WebKit binary compatibility | 40 |
| Accepted Duplicate Structure | 43 |
| Attachment recovery | 32 |
| Combined persistence/recovery | 33 |
| Local stale writes | 20 |
| Background file failures/F2 | 35 |
| Orphan audit | 39 |
| Storage capacity | 29 |
| Restore model validation | 53 |
| Backup | 40 |
| Restore | 70 |
| Locations | 59 |
| Static hosting / upload / copy / linked references | 256 |
| Linked items | 47 |
| Portal/reference preservation | 56 |
| Pre-release UX | 136 |
| Desktop add/menu isolation | 30 |
| Mobile body actions | 95 |
| Task Lists | 92 |
| Move destinations | 156 |
| Object URLs | 26 |
| Fresh package smoke | 265 |

The older Copy/Paste suite now has fewer checks because it no longer asserts modal choices or the hidden Link mode; immediate, reusable, live-source content copying is covered instead. The obsolete paste-card styling suite/CLI option was removed. Reference fixtures use the separate retained API, and reference navigation/management remain covered. Existing asynchronous fixtures now await completion before assertions. The exact compensation snapshot check freezes animation explicitly because a failed immediate Paste no longer leaves an open modal holding animation paused. The older dangling-reference test now asserts F3 preservation rather than destructive normalization, then reloads its isolated known-good fixture to continue reference checks.

Files touched by this correction:

- Runtime: `clipboard.js`, `script.js`, `index.html`, `style.css`.
- Tests: `tests/clipboard.test.js`, `tests/browser-check.py`, `tests/attachment_binary_browser.py`, `tests/item_destinations_browser.py`, `tests/mobile_body_actions_browser.py`, `tests/persistence_integration_browser.py`, `tests/storage_capacity_browser.py`, `tests/task_lists_browser.py`.
- Documentation: this report, `docs/cloud-foundation-plan.md`, `docs/persistence-contract.md`.

The other accepted Batch 2 files in working-tree status were not changed by this correction. No commits, pushes or deployments were performed.

## Duplicate summary cleanup validation

Removed the bottom `Create in:` summary and repeated path, keeping selection in the canonical tree. Galaxy duplication retains a single fixed Universe label. Destination validation, submission and Paste here are unchanged.

Focused validation: 28 Node tests; 109 item-destination browser checks (five new summary/selection assertions), 43 Duplicate Structure checks and 156 Move destination checks, totaling 308 browser checks. Desktop screenshots and 320×568 phone screenshots were inspected; automated responsive checks also passed at 390×844 and 740×360, including scroll access to Duplicate. JavaScript/Python syntax, whitespace checks on all six files changed in this cleanup and `git diff --check` passed. These are focused results for this visual cleanup, not a repeat of the full Batch 2 validation above.
