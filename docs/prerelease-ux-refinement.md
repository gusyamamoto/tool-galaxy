# Prerelease UX refinement

Branch: `ux/prerelease-refinement`. No commit, push, deployment, data migration or new runtime dependency. The final Action-model simplification and approved production image section below records the current implementation. It supersedes the earlier hero compositions and camera visibility decisions; the accepted icons and More remain unchanged. The final section records the new mobile sidebar simplification. Earlier sections retain validation history.

## Implementation audit and change map

| Surface inspected | Existing owner | Result |
| --- | --- | --- |
| Introduction | `index.html`, `style.css`, static image assets | Keep the composition, static example Universe, desktop columns, small-screen stacking, copy and Create your first Item CTA. |
| New Galaxy | `galaxy-starter-field` in `index.html`, existing starters in `everyday.js`, form in `script.js` | Label becomes **Choose a starting point**. Keep Blank and existing Trip, Home project and Class / course choices and creation behavior. |
| Onboarding hint | `FirstUseOnboarding` and selected-Item controls in `script.js` | Replace detached message with an arrow coach beside the visible selected Item +; use the Item name. Keep existing phases and 16-second timeout. Dismissal cancels positioning work. Hide while menus, dialogs, inline editors or the mobile drawer obscure the action. |
| Major sidebar sections | `NavigationSection`, `TasksSecondaryView`, `ConstellationWorkspace`, `SidebarPaneSplit` | Reuse section disclosure for all three. Mobile keeps a transient selected section; nested expansion and saved desktop preferences remain independent. Desktop/tablet keep existing coexisting sections and splitter. |
| Responsive boundary | `HierarchySidebar.mobileQuery` | Reuse `(max-width: 760px), (pointer: coarse) and (max-width: 1024px) and (max-height: 500px)` exactly. |
| Tasks / Constellations hierarchy | Existing shared sidebar heading/row CSS | Keep equal secondary typography and the existing Universe-first space allocation. Mobile selected major header gains a quiet background and edge. Tasks retains its existing visibility rule when there are no Task Lists. |
| Empty Constellations | `ConstellationWorkspace.renderSidebar()` | Explain “Connect related items from anywhere in your Universe.” and offer Create Constellation inside the expanded empty section. Existing header + also remains available. |
| Item membership menus | Shared `renderBodyActions()` in `script.js` | Hide Add to Constellation when the collection Map is empty; reveal it when at least one exists. Keep membership storage and selection behavior. Canvas, sidebar and Contents share this gate. |
| Mobile sidebar + | Existing shared add menu, `renderAddMenu()`, `openEntryContentAction()` | Offer Take a photo, Add photo, Add files, Add item / task, Add task list, Add note, Add link and Add location where supported. Tasks retain their existing structural restrictions. Editors reveal Contents for the retained destination. |
| Native file input | `EntryContentInspector.chooseFiles()` and shared change/upload handling | Separate camera, photo-library and general-file inputs. Camera requests `image/*` with `capture="environment"` and single selection; photo uses `image/*`, multiple selection and no capture; general files have no accept/capture restriction. Retain original destinations independently per input, cancellation, validation, HEIF support and transactions. |
| Contents + | Same menu with a distinct trigger context | Keep compact: Take a photo, Add photo, Add files, Add item / task and Add task list where supported. Direct Files, Notes, Links and Location pages remain available. |
| Global utilities | Existing `help.js`, `CosmifoldBackupUI`, `CosmifoldAccountUI` and actual utility buttons | One labeled rocket More button exposes Help, Backup and current Account / Sign in. Reuse live disabled/auth state. Keyboard arrows, Home/End, Escape, outside dismissal and dialog return focus are supported. No Settings layer. |
| Brand / icons | Existing inline SVG strategy in `index.html`, `style.css` | Original minimal helmet outline with visor beside Cosmifold; distinct rocket outline beside More. Same UI line weight; no gradients, stock art or icon dependency. Branding stays decorative and More stays labeled and interactive. |
| Touch / pointer | Existing +, ellipsis, context menus and native dialogs | Actions remain visible touch controls. Desktop context-menu shortcuts remain. No new hover, right-click or long-press requirement. |

Persistence/recovery F1–F9, cloud/auth service architecture, Copy/Paste, Duplicate structure destination, Move, templates, task features, drag-and-drop and deployment configuration are outside this change. The only Backup/Account implementation edits concern focus after closing their dialogs.

## Focused automated coverage

`python -B tests/browser-check.py --prerelease-ux-only --screenshots` exercises fresh creation, modal wording, anchored/dismissed coach, all mobile accordion transitions, preserved nested/desktop state, zero/one-collection disclosure, sidebar native picker and editors, compact Contents +, existing membership picker, More dialog actions and keyboard behavior, decorative branding, and saved-data reload. Screenshots are local disposable-profile artifacts; they are not deployment output.

Representative sizes: 1440×1000 desktop, 900×1000 touch-enabled tablet, 360×800, 390×844, 430×932 phones, and 844×390 touch landscape. These are Chromium emulations, not physical-device Safari or Android results.

Existing browser expectations are updated only for the intended menu, accordion and focus changes. Capture regressions retain original bytes, HEIF fallback, executable rejection, cancellation and destination ownership checks. Existing Auth tests retain mocked provider states and no real credentials or email submissions.

## Manual device checklist

Use a disposable browser profile or a separate test origin; preserve your normal local Universe. A browser tab already open before this change needs a reload to run the new scripts.

- **Desktop:** Fresh launch; verify the two-column Introduction and static example. Create a Blank first Item and a starter example. Verify the named coach points to +, dismiss it, create a child and reload; onboarding must not restart. Expand Universe, Tasks and Constellations together. Exercise sidebar + and ellipsis, and More → Help / Backup / Account. Check normal saved tasks, memberships and keyboard focus return.
- **Tablet-sized browser:** Repeat at roughly 900×1000 with touch. Verify sections remain independent and coexist, the pane splitter remains available, the header stays compact, and all More actions remain reachable. Resize between desktop, tablet and phone and confirm nested branches survive.
- **Android Chrome:** Repeat first launch at phone size. Tap all three major headers and verify only the selected section expands. Use sidebar + for photo, file, note, link, location, Item and Task List. Cancel the native picker, then select a photo and a document; confirm the retained Item receives each. Contents + must stay compact. Create the first Constellation, then verify Add to Constellation appears in Item ellipsis menus. Check More’s three dialogs, portrait and landscape, and keyboard-visible editors.
- **iPhone Safari:** Repeat the Android sequence. Verify Cosmifold offers separate Add photo and Add file actions; inspect the native image and document source choices Safari supplies (Photo Library, Take Photo, Choose Files and installed providers as available). Check cancellation, photo capture/selection, HEIC original preservation or fallback, file selection, safe-area layout, coach arrow, and short landscape. Cosmifold does not choose or guarantee the OS-provided source list.

Native picker source lists and real camera/provider permissions require physical devices. No physical Android or iPhone test is claimed by the automated checks.

## Batch 1 validation before physical-device follow-up

All 832 Node tests passed. After the final coach target visibility adjustment, all 29 focused onboarding/capture Node tests passed again. Four staging packaging tests passed. JavaScript syntax, Python syntax (including existing UTF-8 BOM files), trailing whitespace and `git diff --check` passed.

| Browser suite | Passed checks |
| --- | ---: |
| Prerelease UX (new) | 112 |
| First-use onboarding | 352 |
| First-user readiness | 349 |
| Mobile capture | 82 |
| Mobile attachment | 33 |
| Mobile inline editors | 393 |
| Contents browse/swipes | 714 |
| Sidebar refinement | 95 |
| Mobile footer | 121 |
| Desktop Add/mobile isolation | 24 |
| Task Lists | 92 |
| Sidebar Tasks | 72 |
| Tasks secondary view/Compact Preview | 97 |
| Item actions | 97 |
| Constellations | 105 |
| Constellation context menus | 45 |
| Backup/Restore dialog | 28 |
| Mocked Account/cloud foundation | 83 |
| Persistence/recovery integration | 33 |
| **Total, 19 suites** | **2,927** |

Screenshot review covered the preserved Introduction, desktop/phone coach, mobile add menu, empty Constellations and tablet/phone More menu. Existing UI tests were adapted to open the selected mobile section and More before interacting, and to expect the revised menu and focus behavior. Two old Item-action assertions referenced superseded Help prose; they now check the current compact copy without changing product Help. The footer test now checks the existing one-step indentation of root Items, consistent with the sidebar refinement suite. Copy/Paste and Duplicate behavior were exercised as existing regressions; their implementation was not changed.

## Files changed

- Runtime: `index.html`, `style.css`, `script.js`, `hierarchy.js`, `constellations-ui.js`, `first-use.js`, `help.js`, `backup-ui.js`, `account-ui.js`.
- Tests: `tests/browser-check.py`, `tests/prerelease_ux_browser.py` (new), `tests/auth_browser.py`, `tests/desktop_add_browser.py`, `tests/first-use.test.js`, `tests/first_use_browser.py`, `tests/first_user_readiness_browser.py`, `tests/mobile_body_actions_browser.py`, `tests/mobile_capture_browser.py`, `tests/mobile_footer_browser.py`, `tests/sidebar_refinement_browser.py`, `tests/sidebar_tasks_browser.py`, `tests/task_lists_browser.py`, `tests/task_views_browser.py`.
- Report/manual checklist: `docs/prerelease-ux-refinement.md` (new).

## Physical-device follow-up

This follow-up changes four surfaces only. The Introduction now loads static PNG captures of the existing Japan Trip example at desktop and compact sizes. The former demo scene, camera/label animation, observers and lifecycle callbacks were removed; no video asset existed. The actual attachment video player remains intact. Layout, rounded frame, CTA, purpose copy and model isolation remain.

Mobile sidebar and compact Contents + now offer **Add photo** and **Add file**. The sidebar also retains note, link, location, Item and Task List actions where allowed; Contents + stays compact. Photo uses the existing attachment pipeline with `accept="image/*"`, multiple selection and no `capture` attribute. File clears the image hint and uses the general picker. HEIC/HEIF original handling, previews, validation, cancellation, destination ownership and F2/F4/F7 operations remain in their existing owners.

The image wildcard is the standard photo-source hint; camera/gallery presentation is a browser/OS decision, not an app-specific menu. See the [HTML file input standard](https://html.spec.whatwg.org/dev/input.html#file-upload-state-(type=file)). Plain `image/*` also avoids introducing extension hints that Android providers might map to generic file types; Chromium's [file picker implementation](https://chromium.googlesource.com/chromium/src/+/HEAD/ui/android/java/src/org/chromium/ui/base/SelectFileDialog.java) distinguishes image-only scopes from generic/unknown types. Physical-device retesting remains necessary.

Branding and More now share a minimal 20px planet/ring SVG with a 1.4px line and rounded ends. The brand is decorative. More keeps its accessible name, text label, hover state and touch target.

More, Add and Item actions share the `cosmos-menu` surface and row rules: background, border, radius, shadow, type, padding, hover/focus highlight and responsive row sizing. More calls the existing `positionCosmosMenu()` helper, opens six pixels from its trigger on the side with usable space, limits height and scrolls if necessary, and follows viewport/sidebar changes. It keeps the actual Help/Backup/Account buttons and their current states. Arrows, Home/End, Escape, outside dismissal and dialog focus return remain supported.

The static-package asset scanner now follows `picture/source` `srcset` references through its existing local-path checks, so both PNGs enter the 61-file package. Five packaging tests cover inclusion, unchanged source bytes, overwrite protection and invalid responsive asset paths. No hosting or deployment settings changed.

Follow-up runtime files: `index.html`, `style.css`, `first-use.js`, `script.js`, `rich-content.js`, `help.js`, `assets/introduction-example.png`, `assets/introduction-example-compact.png`. Supporting changes: `scripts/prepare-staging.py`, `docs/first-use-onboarding.md`, `docs/staging-readiness.md`, this report, and the focused/affected tests listed above plus `tests/mobile-capture.test.js`, `tests/mobile_attachment_browser.py`, `tests/staging_package_test.py`. Other Batch 1 edits remain uncommitted. The existing untracked `device-test-build/` was left untouched.

### Exact physical-device retest

Use the current source or the fresh local package at `staging-site/ux-device-followup-1792890448441`. Reload the testing page before beginning. The package is prepared locally, not published.

1. On **iPhone Safari and iPhone Chrome**, and **Android Chrome**, open a fresh empty test profile/Universe. Verify the static Japan Trip example appears, all four labels remain visible, and there are no video controls or play prompts. Rotate portrait/landscape, background and return to the browser, then reload; the image should remain available without playback interaction.
2. Create a Blank first Item. Verify its named coach points to the visible +, dismiss it, and reload before adding a child; it must not restart. Verify desktop still has two Introduction columns and tablet/phone use the existing stacked treatment.
3. Open the mobile sidebar +. Verify Add photo, Add file, Add note, Add link, Add location, Add item and Add task list, with the existing task restrictions. There must be no Add photo or file, Take Photo or Photo Gallery app action. Check the Contents + remains compact.
4. Tap **Add photo**. Inspect the native image/gallery/library picker on Android and the native photo choices on iPhone; use Camera if offered. Cancel once and verify no attachment appears. Then select JPEG/PNG and HEIC/HEIF where available. Verify the correct Item receives the original and its thumbnail/preview or existing fallback. Repeat after navigating to another Item while a picker result is pending.
5. Tap **Add file**. Choose a PDF/text document, then a document from an installed cloud provider where available. Verify generic selection is not image-limited. Cancel, reopen, and select the same file again. Existing file validation must remain authoritative.
6. Inspect the small brand mark and More on both phones, tablet and desktop. Open More in portrait and short landscape. It should look like the other contextual menus, remain next to its trigger, stay onscreen and leave the trigger uncovered. Tap Help, Backup and Account/Sign in; close each and verify focus returns to More. With a keyboard, check arrows, Home/End and Escape.
7. Verify the mobile section accordion, desktop/tablet independent sections, zero-Constellation explanation, first Constellation creation and subsequent Add to Constellation visibility. Reload an existing saved Universe with Tasks and Constellations and verify it remains intact.

### Follow-up validation results

- Full Node suite: **814 passed**. Animation-specific tests were replaced with static image/isolation tests; existing onboarding phase tests remain. A new photo/file routing unit test checks the wildcard, absent capture attribute, retained destination/callback and clearing image restrictions for files.
- Packaging: **5 tests passed**, including responsive-source inclusion and local-path validation.
- Browser: **1,302 checks passed across 17 suites**, counted once per suite: first-use 62; prerelease UX 126; capture 82; mobile attachments 33; mobile footer 121; desktop Add 24; Task Lists 92; sidebar Tasks 72; Tasks secondary view 97; Item actions 97; Backup dialog 28; mocked Account/cloud foundation 83; persistence integration 33; capacity 29; attachment recovery 32; object URLs 26; fresh prepared-package smoke 265.
- Screenshots reviewed: static desktop/phone Introduction, refined brand/More icons, seven-action sidebar add menu, and tablet/phone More styling and placement. Representative widths include 1440, 900, 360, 390, 430 and 844×390 landscape; Backup additionally checks 640 and 320 widths.
- JavaScript/Python syntax, trailing whitespace and `git diff --check` passed. Final status retains all original Batch 1 work and follow-up changes uncommitted. No push or deployment occurred.
- The Backup browser assertion now waits for the asynchronous native dialog close event before checking More focus; the same assertion and actual focus behavior are retained.
- Fresh local package: **61 runtime files** at `staging-site/ux-device-followup-1792890448441`, with unconfigured Auth and no external/cloud requests during its browser smoke. It is not published. The pre-existing `device-test-build/` was not changed.
- Physical-device source menus and camera/provider behavior still need the exact retest above; Chromium emulation does not establish native iPhone/Android picker presentation.

## Hero hierarchy and identity refinement

The next focused refinement replaces both hero PNGs with a close-up single branch: Japan Trip / Sun → Tokyo / Planet → Stay / Moon → Hotel / Satellite. It uses the existing body renderer, with four readable name/role labels and three directional connectors. It stops at Satellite and removes decorative sibling systems and unlabelled descendants. Desktop and compact compositions retain their prior image dimensions and the existing Introduction container, copy, CTA and responsive layout. `scripts/introduction-hero.js` preserves the authoring source without adding app runtime work.

The brand mark is now a minimal helmet outline with visor and collar; More retains its separate orbit/planet icon. Both keep the existing 20px size and thin line treatment. The brand remains decorative and More keeps its accessible label and menu behavior.

Files touched in this refinement: `index.html`, both `assets/introduction-example*.png` images, new `scripts/introduction-hero.js`, `tests/prerelease_ux_browser.py`, `docs/first-use-onboarding.md`, and this report. Earlier uncommitted Batch 1 work and the existing `device-test-build/` are preserved.

Validation: 4 authoring/export checks, 7 focused Node tests, 189 browser checks across Introduction and prerelease UX suites, and 5 packaging tests passed. Screenshot review covered 1440px desktop, 900px tablet, 390px phone and the distinct header/More icons; automated responsive checks also cover 360px, 430px and 844×390 landscape. The four-level example has no clipped labels or extra descendants. JavaScript/Python syntax, whitespace and `git diff --check` passed. This is browser viewport validation; no new physical-device run was performed.

## Product teaser and mobile sources refinement (current)

The static Introduction now uses the native Sun, Planet, Moon and Satellite artwork in a close-up Japan Trip / Tokyo / Stay / Hotel scene. Bodies are larger, only four name labels remain, and three quiet orbital arcs replace arrows and role captions. The simpler composition stops at Satellite. Desktop and compact PNGs retain the existing dimensions and responsive picture selection. Matching dark outer edges avoid letterbox seams. The layout, copy, caption, CTA, desktop columns and stacked small-screen layout remain intact; the authoring renderer is excluded from runtime packaging.

The header uses an original flat helmet outline with an inset visor and collar. More uses an original rocket outline and porthole. Both use the existing 20px UI footprint and shared line style. Add, Item actions and More now share an explicit 192px menu width, surface, row spacing, responsive touch sizing and visible keyboard focus outline. Existing placement, scroll handling, keyboard navigation and real Help/Backup/Account controls remain in their existing owners.

Mobile sidebar + now starts with **Take a photo**, **Add photo**, **Add files**, followed by the supported existing structural and content actions. Camera is exclusive to the full sidebar menu; Contents + retains its compact photo/files/Item/Task List choices. Each source owns a separate hidden native input and retained destination. All inputs use the same original-byte upload, validation, previews, HEIF fallback and persistence/recovery pipeline. A late cancel from one input cannot discard another input's active destination; late results retain their original Item, and deleted destinations are ignored. Cancel leaves saved data unchanged.

### Android and iPhone limitations / physical retest

| Action | Input request | Device expectation and limitation |
| --- | --- | --- |
| Take a photo | `accept="image/*"`, `capture="environment"`, single file | Requests direct rear-camera capture on Android and iPhone. Browser support, permissions and OS policy determine the final camera screen and facing mode. An unsupported capture request can fall back to ordinary selection. |
| Add photo | `accept="image/*"`, multiple, no `capture` | Requests image/library selection without forcing camera capture. Browser/OS source choices can still include Camera or Choose Files; HTML cannot force a named gallery provider or suppress all camera options. HEIC/HEIF original support remains intact. |
| Add files | Multiple, no `accept` or `capture` | Requests unrestricted file/provider selection. Android may offer Camera/Camcorder/Files; iPhone uses its normal providers. The app never makes this camera-only. |

These limits follow the [HTML file input standard](https://html.spec.whatwg.org/dev/input.html#file-upload-state-(type=file)) and [HTML Media Capture](https://www.w3.org/TR/html-media-capture/). Physical native picker UI was not exercised by Chromium emulation. On both Android Chrome and iPhone Safari/Chrome: reload the current build, open sidebar +, test each source, cancel and reopen, attach JPEG/PNG and HEIC/HEIF, verify the destination and original download, then select a general document/provider file. Confirm Contents + remains compact. Camera should request direct capture, photo should offer the image library without forced capture, and files must remain unrestricted.

### Exact files touched in this follow-up

- Runtime: `index.html`, `style.css`, `script.js`, `rich-content.js`.
- Artwork / authoring: `assets/introduction-example.png`, `assets/introduction-example-compact.png`, `scripts/introduction-hero.js`.
- Documentation: `docs/first-use-onboarding.md`, `docs/prerelease-ux-refinement.md`.
- Tests: `tests/mobile-capture.test.js`, `tests/first_use_browser.py`, `tests/prerelease_ux_browser.py`, `tests/mobile_capture_browser.py`, `tests/mobile_attachment_browser.py`, `tests/storage_capacity_browser.py`, `tests/desktop_add_browser.py`, `tests/task_lists_browser.py`, `tests/sidebar_tasks_browser.py`, `tests/task_views_browser.py`, `tests/mobile_body_actions_browser.py`.

Twenty files were touched in this follow-up. Other earlier uncommitted UX changes, the existing `device-test-build/`, old staging packages and the frozen cosmifold.netlify.app project were left intact. No commit, push or deployment occurred.

### Validation for this follow-up

- All **815 Node tests passed**, including separate-input routing, capture isolation, late cancellation/results, deleted destinations and unchanged HEIF handling.
- Four native artwork/export checks passed: exactly Sun / Planet / Moon / Satellite, no arrows or role captions, and readable unclipped labels in both compositions.
- Five packaging tests passed. Syntax checks passed for all 11 changed JavaScript files and 17 changed Python files; trailing whitespace passed for 33 changed text files, excluding the untouched device-test-build directory. `git diff --check` passed.
- **1,323 browser checks passed across 17 suites**, counted once each: Introduction 74; prerelease UX 130; capture 82; mobile attachments 38; desktop Add 24; Task Lists 92; sidebar Tasks 72; task secondary views 97; Item actions 97; capacity 29; persistence integration 33; attachment recovery 32; object URLs 26; mobile footer 121; Backup dialog 28; mocked Account/cloud foundation 83; prepared-package smoke 265. A mistyped body-actions flag was corrected and its intended 97-check suite passed. No application test failed.
- Screenshot inspection covered desktop 1440x1000, tablet 900x1000, phones 360/390/430px wide, short 390x667 and 320x568, and 844x390 landscape. All levels are visible, portrait labels remain readable, short/landscape screens scroll to the original CTA, and there is no horizontal overflow. More and the separate helmet/rocket icons were inspected in the real sidebar context. The eight-action sidebar menu and compact Contents menu preserve existing task restrictions.

Fresh local package: `staging-site/ux-prerelease-final-1792903939754` (61 runtime files). Its 265 checks used real local storage and IndexedDB, exercised normal/hard reload and reopened-tab persistence, and verified CSP, zero external cloud/Auth requests, responsive controls and safe startup failures. Nothing was published.

## Approved-reference and Contents-camera correction (current)

This pass is limited to the approved hero and mobile Contents camera availability. The current branch remains `ux/prerelease-refinement`; nothing is committed, pushed or deployed.

### Reference, clean assets, and visual result

The exact approved image `C:/Main/Principal/Projects/cosmifold-intro-reference.jpg` was inspected before editing. Its hero frame supplied the relative composition: a large warm Japan Trip at left, a much smaller Tokyo at right, Stay above Tokyo, Food lower-right, and Places lower-left. The Sun-to-Planet size ratio is approximately three to one. The asymmetric family, quiet native paths, faint orbit context and a few subordinate satellite details preserve the actual-canvas feeling and implicit nesting. There is no Hotel chain, level legend, taxonomy, arrow or annotation.

Both shipped assets were regenerated from the existing `renderCelestialBody()` implementation and canvas line rules. No screenshot pixels, browser chrome, status bar, surrounding Introduction text, CTA or controls are embedded. This is a close reconstruction of the approved spatial arrangement, adapted to the existing frame aspect ratios, not a pixel-identical screenshot crop. Native textures and small details can differ from the reference.

- `assets/introduction-example.png`: 1950 x 1380, authored at 650 x 460 and captured at 3x. Desktop retains the two-column Introduction and a wider composition, with Japan Trip large at left and its smaller surrounding family visible.
- `assets/introduction-example-compact.png`: 1062 x 810, authored at 354 x 270 and captured at 3x. Portrait retains the existing stacked layout; five names remain readable and primary bodies/labels stay away from card boundaries. The existing frame is slightly taller than the approved screenshot's frame, so positions are adjusted proportionally rather than cropping out Stay or Places.

The authoring script is development-only. Runtime continues to load static picture sources, without video, animation or hero generation. Introduction copy, CTA, caption and layout are unchanged. Screenshot inspection covered 1440x1000 desktop, 900x1000 tablet, phone widths 360/390/430, short 390x667 and 320x568, and functional 844x390 landscape with scroll access to the CTA.

### Contents and Preview Contents camera parity

Both full mobile Contents (`#entry-add-button`) and compact Preview Contents (`#mobile-body-add`) already use `renderAddMenu()` and `openEntryContentAction()`. The correction makes the existing `camera` menu item visible on mobile for both triggers. This is the same Take a photo action, hidden input, synchronous picker click, original destination, cancellation handling and upload pipeline already used by the working sidebar. There is no second camera pipeline or second menu.

Compact menus now offer **Take a photo / Add photo / Add files**, plus the existing Item/Task List actions where allowed. Sidebar actions, ordering and capture logic remain unchanged. Desktop still hides camera-only mobile actions. Image/library selection, generic file selection, HEIC/HEIF originals and fallback, file validation and all persistence/recovery handling are preserved.

Tests exercise actual touch taps and cancellation for all three sources in both surfaces. Native FileList delivery from each surface saves a camera image, library image and general file through the real shared change handler and IndexedDB transaction. Existing sidebar, task structural restrictions, retained destination, same-file reselection, provider-read error, quota failure, HEIF preview/download and object-URL checks remain active.

The new capture tests initially left Contents expanded before an existing body-tap check. The test setup now closes it before that older check; production selection behavior was not changed. The complete capture suite then passed.

### Platform limits and physical-device checklist

The capture implementation is unchanged: Take a photo requests `image/*` with `capture="environment"`; Add photo requests images with no capture attribute; Add files has neither an image filter nor capture attribute. Browser/OS permissions and native source UI still control the exact camera/library/provider presentation. Android Camera/Camcorder/Files options in the general chooser are acceptable. No platform-specific MIME workaround was added. Automated browser tests verify the requests and attachment pipeline, not physical camera hardware or native iOS/Android picker UI.

For **Android Chrome**, repeat this sequence using the fresh build:

1. Sidebar +: Take a photo, Add photo, Add files. Cancel each once, reopen, then save a camera photo, a library image and a general document to the intended Item.
2. Open Contents +: verify Take a photo, Add photo and Add files. Cancel each once; take a photo and confirm the saved preview and original download.
3. Collapse to Preview Contents +: repeat camera, photo and file selection/cancellation; save at least one image. Confirm the intended Item receives it, Contents opens after successful selection, and reload retains the image.
4. Confirm sidebar actions still behave as in the already-approved physical test. Inspect the new hero in portrait; landscape only needs accessible controls, normal scrolling and no severe overlap. There must be no diagram labels or arrows.

For **iPhone Safari**, repeat the same sidebar, Contents and Preview Contents sequence. Verify both a camera image and a Photo Library image persist through reload. Include a HEIC/HEIF original where available and verify preview or the existing original-download fallback. Cancel every picker at least once. iPhone Chrome is an optional additional check. OS source choices may differ; clear app actions and correct saved results are the criteria.

Also check desktop Introduction: the existing two columns, dominant Japan Trip, visible Tokyo/Stay/Food/Places, normal CTA and no screenshot chrome. Check phone portrait with all five names visible; rotate to landscape and scroll to the original CTA.

### Exact files touched in this correction

- Hero: `assets/introduction-example.png`, `assets/introduction-example-compact.png`, `scripts/introduction-hero.js`.
- Production behavior: `script.js` (only the shared mobile camera visibility condition).
- Focused/affected browser tests: `tests/mobile_capture_browser.py`, `tests/mobile_attachment_browser.py`, `tests/prerelease_ux_browser.py`, `tests/desktop_add_browser.py`, `tests/mobile_body_actions_browser.py`, `tests/task_lists_browser.py`, `tests/task_views_browser.py`.
- Documentation: `docs/first-use-onboarding.md`, `docs/prerelease-ux-refinement.md`.

Thirteen files were touched in this correction. Earlier uncommitted work is retained. Icons, More implementation/styling, sidebar capture implementation, rich-content upload code, F1-F9, coach, sidebar sections, Copy/Paste, Duplicate, Move, Tasks, Constellations and cloud/auth implementation were not edited. The pre-existing `device-test-build/`, old packages and frozen cosmifold.netlify.app project remain untouched.

### Correction validation and count accounting

- Full Node suite: **815 tests passed**, identical to the immediately preceding report. No Node tests were removed or added in this correction. The older 832 total predates the previous replacement of live-preview animation tests with static-image checks; that change happened before this correction.
- Four native authoring/export checks passed, verifying reference content and safe readable label bounds in both assets. These checks are reported separately from the application browser suites.
- Packaging: **5 tests passed**, including desktop/compact asset inclusion, unchanged asset bytes, runtime-only source selection, responsive-source validation and overwrite protection.
- **3,052 browser checks passed across 23 suites**: all 19 existing Batch 1 suites plus capacity, attachment recovery, object URLs and prepared-package smoke. Each suite is counted once; the capture retry is not counted twice. Compared with the immediately preceding 1,323 / 17-suite report, this adds six existing Batch 1 suites (1,701 checks) and 28 new capture checks: 18 routing/cancellation assertions plus 10 assertions from two additional real-file delivery cases. Compared with the original 2,927 / 19-suite Batch 1 report, the current static Introduction has fewer animation-specific assertions, while capture coverage and the four additional regression suites expand the scope. No tests disappeared in this correction.

| Browser suite | Passed checks |
| --- | ---: |
| First-use | 74 |
| Prerelease UX | 130 |
| First-user readiness | 349 |
| Mobile capture | 100 |
| Mobile attachments | 48 |
| Mobile inline editors | 393 |
| Contents browse / swipes | 714 |
| Sidebar refinement | 95 |
| Mobile footer | 121 |
| Desktop Add | 24 |
| Task Lists | 92 |
| Sidebar Tasks | 72 |
| Task views / Preview | 97 |
| Item actions | 97 |
| Constellations | 105 |
| Constellation context | 45 |
| Backup dialog | 28 |
| Account / cloud mocks | 83 |
| Persistence integration | 33 |
| Storage capacity | 29 |
| Attachment recovery | 32 |
| Object URLs | 26 |
| Prepared package | 265 |
| **Total: 23 suites** | **3,052** |

Final JavaScript syntax (11 changed JS files), Python syntax (17 changed Python files), trailing whitespace (33 changed text files) and `git diff --check` passed across the full uncommitted working tree, excluding the untouched device-test-build directory. A baseline hash comparison confirms that index.html, style.css, rich-content.js, help.js, hierarchy.js, first-use.js, constellations-ui.js, account-ui.js and backup-ui.js are byte-for-byte unchanged during this correction.

Fresh local package: `staging-site/ux-reference-correction-1792905830306` (61 runtime files). Its 265 smoke checks passed, including packaged assets, CSP, native attachment storage, ordinary/hard reload, reopened-tab persistence, responsive controls and preserved data through injected startup failures. No external SDK/Auth/cloud requests were attempted and nothing was published.

## Action-model simplification and approved production image (current)

Branch `ux/prerelease-refinement`; all work remains uncommitted. No commit, push or deployment. This pass changes action visibility, empty Tasks discovery and the static hero treatment; it does not rebuild Batch 1 or implement Batch 2 clipboard/destination changes.

### Audit and shared implementation mapping

| Surface audited | Existing shared owner | Result |
| --- | --- | --- |
| Desktop/tablet sidebar row + | `HierarchySidebar`, shared `renderAddMenu()` | Retained, including existing organization/content shortcuts and existing Paste availability. |
| Desktop/tablet sidebar row ... / right-click | Existing `onMenu`, `openContextMenu()`, `toggleBodyActions()` | Row ... is available with + on hover/focus, or continuously on coarse-pointer tablet. Existing right-click and drag/drop stay intact. |
| Mobile sidebar row actions | Same `HierarchySidebar` rows at its existing narrow breakpoint | Hide row +, remove its grid column and tab stop; keep the existing 44px management ... action. Resize restores wide-screen controls. |
| Universe section + | Existing `add-entry-button` | Retained, including an empty first-use Universe; opens existing New Galaxy form. |
| Desktop Contents + | Shared Add menu, distinguished by `entry-add-button` trigger | Only Add item / Add task list, subject to existing task restrictions. Direct Files / Notes / Links / Location controls remain. |
| Desktop Contents ... | Shared Item menu, distinguished by `surface=contents` | Management actions only; hide Add item / Add task list for this surface. Sidebar/canvas context behavior remains available. |
| Mobile Contents + | Existing Add menu and source routes | Take a photo, Add photo, Add files, Add item / task, Add task list where legal. No Notes / Links / Location duplication. |
| Preview Contents + | Same menu via `mobile-body-add` | Same five capabilities and restrictions. No second media menu or capture pipeline. |
| Tasks visibility | `TasksSecondaryView.render()` | Root stays visible with zero Task Lists; the open empty view says No tasks yet. Empty subgroup controls are hidden. |
| Mobile major sections | Existing `MobileSidebarSections` | Empty Tasks participates in the existing exclusive accordion; desktop/tablet retain independent disclosure and saved preferences. |
| Introduction | Existing static picture, rounded wrapper and responsive layout | Direct crops of the approved production PNG; wrapper remains the only visible frame. |

The camera/image/general-file inputs, original destination ownership, cancellations, validation, HEIC/HEIF, previews and F2/F4/F7 remain in `rich-content.js`, which was not edited. Existing Copy/Paste commands, Duplicate destination, Move handlers, task commands, Constellation storage, coach, More and icons were not redesigned. Desktop Contents + no longer repeats content or Paste entries because it is structural-only; the existing desktop sidebar Add menu and mobile management menu retain their established Paste behavior. No clipboard semantics or destination logic changed.

### Approved source and crop strategy

The exact source `C:/Main/Principal/Projects/cosmifold-intro-approved.png` was inspected and processed directly. Source SHA256: `0C43783B5465759333F9E15BFF6112F27F5E593354A9568B7AB9FB25F0E8A029`.

- Desktop: `assets/introduction-example.png`, 1336 x 699, copied from source rectangle x=100, y=163, width=1336, height=699.
- Compact: `assets/introduction-example-compact.png`, 1236 x 690, copied from x=160, y=170, width=1236, height=690.

`System.Drawing.Bitmap.Clone()` performs the crop; there is no scene renderer, drawing, resampling, relabeling, new body, ellipse or annotation. All five original bodies and their names remain within both crops. The compact crop trims more outer space and the desktop crop is wider. Source-frame pixels are excluded so the existing rounded wrapper supplies one border. Its aspect ratio follows the image, eliminating the old fixed-height letterbox treatment. The existing two-column desktop and stacked tablet/mobile layout, copy, caption and buttons remain.

Repeat with `scripts/prepare-introduction-hero.ps1`. The old native-renderer authoring script was not used. Both scripts remain excluded from the 61-file public package. Source image pixels, not a reconstructed interpretation, are shipped.

### Focused physical-device retest

1. **Desktop:** hover/focus sidebar rows and use + and ...; check right-click and drag/drop. Contents + must show only structural creation; Contents ... must omit creation. Use the direct Files / Notes / Links / Location controls. Open empty Tasks and verify No tasks yet.; expand Universe, Tasks and Constellations independently. Inspect the approved hero with one frame.
2. **Tablet:** verify the existing wide sidebar treatment, row + / ..., independent sections and uncropped hero. The existing narrow landscape breakpoint still applies to short coarse-pointer screens.
3. **Android Chrome:** verify no visible/focusable row +, working row ... and Universe +. From both Contents and Preview Contents, test Take a photo, Add photo and Add files; cancel and reopen each, then save a camera image and a library image. Reload and verify persistence. Open empty Tasks, switch the three major sections, and inspect hero portrait/functional landscape.
4. **iPhone Safari:** repeat the mobile checklist, including camera capture, library persistence, HEIC/HEIF preview or original-download fallback, portrait hero and functional scrolling/controls in landscape. Chrome is optional. Native source choices and permission UI remain browser/OS controlled; no platform-specific MIME hack was added.

### Validation

All **815 Node tests passed**, with no Node tests added or removed in this pass. Asset dimension checks now use the approved crops. Five packaging tests passed, verifying runtime-only inclusion and byte preservation of both assets, responsive source handling and overwrite safety. Browser assertions were migrated from the intentionally removed mobile row + and desktop Contents creation entries to their current shared controls; the direct mobile link control correctly uses its existing inline editor. **3,068 browser checks passed across 23 suites**, counted once per suite. This is the same broad scope as the immediately preceding 3,052 / 23-suite report, with 16 added assertions: six for empty Tasks/sidebar/Universe actions, six for desktop/tablet shortcuts and simplified Contents, and four for Universe + across mobile widths. No Node tests were removed. The older 19-suite Batch 1 totals used live-preview animation checks; this run uses the current static-image suite and also covers capacity, attachment recovery, object URLs and a prepared package. Retries and screenshot-only review are not added to the total.

| Browser suite | Passed checks |
| --- | ---: |
| First-use | 74 |
| Prerelease UX | 136 |
| First-user readiness | 349 |
| Mobile capture | 104 |
| Mobile attachments | 48 |
| Mobile inline editors | 393 |
| Contents browse / swipes | 714 |
| Sidebar refinement | 95 |
| Mobile footer | 121 |
| Desktop Add / sidebar | 30 |
| Task Lists | 92 |
| Sidebar Tasks | 72 |
| Task views / Preview | 97 |
| Item actions | 97 |
| Constellations | 105 |
| Constellation context | 45 |
| Backup dialog | 28 |
| Account / cloud mocks | 83 |
| Persistence integration | 33 |
| Storage capacity | 29 |
| Attachment recovery | 32 |
| Object URLs | 26 |
| Prepared package | 265 |
| **Total: 23 suites** | **3,068** |

JavaScript syntax passed for all 12 changed JS files, Python syntax for 17 changed Python files, PowerShell parser syntax for the new crop script, trailing whitespace across 35 changed text files, and `git diff --check`. The untouched device-test-build directory is excluded from source checks.

Fresh local package: `staging-site/ux-action-model-1792940553327` (61 runtime files), with 265 passing smoke checks, no external cloud/Auth requests, intact local storage/IndexedDB persistence, CSP and safe startup-failure handling. Nothing was published.

Screenshot review covered 1440px desktop, 900px tablet, 360/390/430px phones, short 320x568 and 390x667 screens, and functional 844x390 landscape. Empty Tasks and mobile sidebar simplification were additionally inspected in a fresh synthetic profile. The screenshot-only run adds no test assertions to the reported 23-suite total. Physical camera/provider UI was not tested here; use the device checklist above.

### Exact files changed in this pass

- `assets/introduction-example-compact.png`
- `assets/introduction-example.png`
- `docs/first-use-onboarding.md`
- `docs/prerelease-ux-refinement.md`
- `hierarchy.js`
- `index.html`
- `script.js`
- `scripts/prepare-introduction-hero.ps1`
- `style.css`
- `task-views.js`
- `tests/desktop_add_browser.py`
- `tests/first-use.test.js`
- `tests/first_use_browser.py`
- `tests/mobile_body_actions_browser.py`
- `tests/mobile_capture_browser.py`
- `tests/prerelease_ux_browser.py`
- `tests/sidebar_tasks_browser.py`
- `tests/task_lists_browser.py`
- `tests/task_views_browser.py`

Nineteen files were changed in this pass. Earlier uncommitted work remains intact; the pre-existing `device-test-build/`, old packages and frozen cosmifold.netlify.app project were not changed.
