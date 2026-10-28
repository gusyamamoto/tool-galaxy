# Cosmifold Product / Pre-release Readiness Audit

Audit date: October 27, 2026. Branch: `audit/product-prerelease-readiness`.
Scope: the current local-first beta product and a freshly prepared local release artifact. Production code and existing tests were not changed. No commit, push, deployment, remote database access, or modification of the frozen Netlify site occurred.

## 1. Executive verdict

**READY AFTER TARGETED FIXES**

A first-time user has a credible path from the Introduction to a useful Trip, nested destinations, notes, links, locations and files. Creating, organizing, retrieving and reopening real content worked. Tasks and Time extend the spatial hierarchy without replacing it. Constellations remain optional. Desktop and mobile controls support the intended division between navigation/organization and working in Contents.

The remaining concerns are bounded: unfinished overdue work falls out of Upcoming, browser-local storage is not explained during ordinary first use, and returning users unnecessarily request hidden Introduction images. Address these before beta where practical, and refresh the obsolete/racy test contracts. There is no evidence requiring a new reliability foundation project.

Finding counts: **0 Blocker, 0 High, 3 Medium, 2 Low**. This is an engineering/product inspection with browser-driven journeys, not a usability study with first-time participants. Comprehension conclusions should be checked with real testers next.

## 2. Release blockers

None found.

## 3. High-priority findings

None found.

## 4. Medium findings

### M1 — Incomplete overdue tasks disappear from the forward attention view

- **Severity:** MEDIUM.
- **Area:** Tasks / Time; known deferred urgency contract, not a persistence regression.
- **User impact:** An unfinished assignment stops appearing in Upcoming after its due date. Tasks still retains it, but its sidebar row has no due-date/overdue cue. A person checking what needs attention must remember to inspect the task or look back through Calendar.
- **Exact reproduction:** Create School → Statistics → an Assignments Task List. Add an incomplete task, give it yesterday's Due date, and open Time. On the audit date, `Late worksheet` was incomplete and due October 26 while Today was October 27. It remained on October 26 in Calendar and in its Task List, but Upcoming contained only the later Trip range. Advance the month and the past Calendar occurrence also leaves the current view.
- **Evidence:** `time-view-model.js:49` excludes every event whose `end < today`, including incomplete tasks. `task-views.js:91-93` renders task names/check states without due information. The directed journey recorded `task:true`, `completed:false`, `start:"2026-10-26"`, `upcomingContains:false`, `calendarContains:true`. See `journey-shots/04-overdue-task.png` in the local evidence directory. `docs/time-view.md:108-114` already records the deferred urgency contract; no data was lost.
- **Recommended fix direction:** Keep unfinished overdue work discoverable in a forward attention surface with an explicit urgency state. Follow the approved time-state rule: normal future Due remains normal; Due today merits moderate attention; overdue plus incomplete merits clear attention; completed history remains readable with reduced emphasis. Ordinary dated Items occurring today remain conceptually distinct. Preserve the current Calendar/Upcoming composition and avoid permanent priority merely for being a Task.
- **Expected scope:** Medium; focused projection/presentation work plus tests for yesterday/today, month boundaries, completion and date removal. Full urgency artwork can be designed separately.

### M2 — The browser-local storage boundary is absent from ordinary first use

- **Severity:** MEDIUM.
- **Area:** First-time comprehension / trust / release communication.
- **User impact:** The Introduction promises organizing and saving useful content, but does not explain that it lives in this browser. A non-technical person can create meaningful work without encountering the storage boundary or the need for a downloaded backup. This is a communication gap, not evidence that saves are unreliable.
- **Exact reproduction:** Open a fresh empty workspace. Read the Introduction, create Trip, then add a destination and content without opening Help or Account. The visible first-use copy and normal creation flow contain no browser-local explanation. Backup is inside More. The fuller explanation requires More → Help → Backup & Restore, or Account.
- **Evidence:** Introduction text in `index.html:49-57`; Backup inside `#utility-menu` at `index.html:136-141`; browser-local explanation inside a collapsed Help topic at `index.html:527-530`; Account description at `index.html:632`. The journey saved the initial rendered text and observed `backupVisible:false`.
- **Recommended fix direction:** Add one short, plain storage explanation at first use or another unavoidable early point, with a clear route to Backup. Explain the same-browser/device boundary and keeping a recent downloaded copy. Preserve quiet saving and the approved intro hierarchy.
- **Expected scope:** Small; copy/entry-point work and an early-experience assertion. No persistence redesign or cloud feature is required.

### M3 — Hidden Introduction artwork is downloaded for returning users

- **Severity:** MEDIUM.
- **Area:** Loading performance / recent intro integration.
- **User impact:** Existing mobile users with a cold HTTP cache download about 1.77 MB of artwork they will not see. Cached returns still revalidate these resources. This is unnecessary transfer and competition for mobile bandwidth; the audit does not claim a measured slow-phone frame-rate regression.
- **Exact reproduction:** In a disposable profile, create and save an Item. At 390×844, clear only that profile's HTTP cache, enable Network observation and reload without removing local data. Confirm `firstUse.root.hidden === true`. Inspect resource timing for the astronaut and Example Universe images.
- **Evidence:** The native picture/img declarations at `index.html:44-46` and the Example Universe picture remain in the document with real sources and eager/high-priority loading while the section is hidden. The cold returning-user journey recorded:

  | Hidden asset | Encoded bytes | Transferred bytes, including HTTP overhead |
  | --- | ---: | ---: |
  | `cosmifold-astronaut-mobile.webp` | 301,140 | 301,440 |
  | `introduction-example-compact.png` | 1,469,631 | 1,469,931 |
  | Total | **1,770,771** | **1,771,371** |

  A separate warm-cache return revalidated both requests with 300-byte responses. These measurements used loopback networking; their durations are not mobile-network benchmarks. Artwork remains visually hidden in the internal app, as intended.
- **Recommended fix direction:** Activate/load intro-only image sources when Introduction is actually needed. Preserve native responsive source selection, intrinsic dimensions, the current crop/fades and the approved first-use layout. Add a cold returning-user request assertion alongside the existing fresh-intro asset checks.
- **Expected scope:** Small; image loading lifecycle and focused regression coverage.

## 5. Low / post-beta findings

| ID | Severity / area | Evidence and direction |
| --- | --- | --- |
| L1 | LOW — test maintenance | Three suites retain retired interaction/decoration assumptions, Help checks focus before the native close event settles, and the orphan race assumes one error code when two protective guards can win. Exact failures are classified in section 10. Refresh contracts/synchronization while preserving functional and safety assertions. This is worth doing before beta for a trustworthy green baseline, though it is not a product blocker. |
| L2 | LOW — release documentation | `docs/staging-readiness.md:17` still says 61 declared files; the current validated package has 70. The scanner and preparation output are correct. Update the descriptive inventory when maintaining release documentation. |

## 6. First-time-user assessment

- **Can they understand what Cosmifold is?** Yes, provisionally. “Organize anything as your own Universe” plus familiar trip/recipe/project examples gives a practical purpose. Japan Trip explains the product; the astronaut remains atmosphere. No taxonomy selection is required to start.
- **Can they understand what to do first?** Yes. The first Item CTA is clear and initially visible at both requested phone portrait sizes. Blank creation asks for a name; optional starters are a recognizable alternative. The named first-child coach and subsequent Contents hint bridge creating a place to adding useful material.
- **Can they understand where content belongs?** The inspected flow supports this: select an Item, use its Contents sections, or add a nested Item through its contextual +. Mobile keeps capture at the selected body/Contents; sidebar rows focus on navigation and organization. Desktop Contents + exposes structural creation, while its sections provide Files, Notes, Links and Location directly.
- **Biggest remaining comprehension risk:** M2, the storage boundary. A secondary learning point is that a new Item is an organizing place while a note/photo is content inside it. The coach and direct section labels explain this sufficiently for a small beta; confirm it with first-time participants rather than adding another onboarding system now.

Universe → Galaxy → Sun/Planet/Moon/Satellite/deeper identities is coherent as a visual hierarchy: users supply ordinary names and roles follow depth. Contents belongs to the selected canonical Item. A Task List owns its direct task children; Time projects When/Due from those same objects. Constellations reference Items across branches without creating another ownership hierarchy. Their extra learning curve is acceptable because users can ignore them.

## 7. Core workflow assessment

| Workflow | Result | Assessment |
| --- | --- | --- |
| Create | PASS | First Item, nested Item and named Task List creation work; cancellation, validation and failure draft retention are covered. |
| Capture | PASS | Direct Notes/Link/Location and real file-input change handling work. Camera, photo library and general files have distinct inputs/constraints; unsupported previews preserve originals. Physical chooser behavior is a stated limit below. |
| Organize | PASS | Move, reusable immediate Paste here, independent content copies, cross-Galaxy structure-only duplication, Rename, search and archive behavior pass current focused coverage. Invalid/deleted destinations are revalidated. |
| Retrieve / return later | PASS | Search and tree selection open canonical Contents. Reopening preserved hierarchy, dates, completion, notes/links/location and files; the three mobile attachment originals matched SHA-256 hashes. |
| Time | PASS WITH CONCERNS | Single dates, cross-week/month ranges, same-day aggregation, Today, month navigation, overflow/day entries, static mini-CBs, native scrolling, Contents and return-to-Universe work. M1 is the attention gap. |
| Tasks | PASS WITH CONCERNS | List ownership, creation, completion/progress, Due editing, inherited owning-list miniature identity and completed history work. Discoverability through Add task list and Tasks is adequate; M1 remains. |
| Mobile | PASS WITH CONCERNS | Compact/Contents, four sections, swipe/outside interactions and navigation remain usable. M3 adds unnecessary returning-user transfer. No severe clipping/reachability defect was reproduced. |
| Desktop | PASS | Direct content work, keyboard/mouse paths, sidebar controls and the approved Calendar/horizontal timeline remain coherent. |

### Directed end-to-end journeys

All five ran in an isolated browser through UI controls. Mouse hover was used for desktop controls and native touch for phone controls; real file-input change handlers stored fixture bytes. Thirteen final journey assertions passed.

| Journey | Result / evidence |
| --- | --- |
| 1 — Trip | Created Trip → Tokyo; added a note, booking link, location and text file; assigned October 29–November 6; selected its range in Time and returned to the same Universe Item. |
| 2 — Class | Created School → Statistics → Assignments → Problem set; assigned today's Due, found it in Time, completed it and observed its removal from Upcoming with history retained. A separate incomplete yesterday task reproduced M1. |
| 3 — Photos/capture | On 390×844, used Take a photo, Add photo and Add files for the selected Item. Observed separate camera (`image/*`, `capture=environment`, single), library (`image/*`, no capture, multiple), and general chooser (no accept/capture filter, multiple). Three originals saved and retained matching hashes after reload. |
| 4 — Reorganize | Moved Tokyo into Statistics; copied it once and pasted under Trip and School; duplicated an empty Tokyo template back into the other Galaxy. Copies had independent IDs; the structure omitted content and dates. |
| 5 — Secondary features | Created Travel plans through the empty Constellation state and explicitly added the existing template through the staged picker. Membership did not move or duplicate the Item. Earlier journeys required no Constellation. |

### Accessibility, empty states and performance

Practical keyboard coverage includes tree/search navigation, context-menu navigation, date-grid arrows, native dialog focus, Escape/Cancel and editor focus return. Phone actions use the existing touch targets; selected-day text and complete accessible labels supplement color and truncated Calendar text. Help's eventual focus return was correct, despite its racy old test. This was not a formal screen-reader or WCAG conformance audit.

New/empty Universe has the intro CTA; Tasks has its quiet empty state; empty Time retains Calendar and a date-adding explanation; empty Constellations provides an optional creation action. Empty Contents has direct section entry points. Clipboard-source deletion hides invalid Paste, invalid/archive destinations fail validation, and selected/deleted/date-removed states are handled by canonical refresh paths. Attachment absence/error/recovery receives existing feedback without silently dropping originals.

Time performs no aggregation while hidden (`time_view_browser.py` verifies zero hidden aggregate calls), and its miniatures use static CSS/SVG rather than another live physics renderer. The general 282-body smoke measured projection p95 **1.5 ms** and frame median/p95 **16.6/16.9 ms** on this audit machine. Object URL, texture/media teardown and storage-capacity regressions passed. These desktop measurements do not establish low-end phone performance; M3 is the concrete loading concern found.

## 8. Device/readiness matrix

| Viewport | Result | Review |
| --- | --- | --- |
| 1920×1080 | PASS | Intro expanded/collapsed; capped artwork stays at x=0 under the sidebar. Directed Time journey: Calendar/Contents reachable, no document or Time horizontal overflow. |
| 1440×900 | PASS | Intro both sidebar states; Calendar/ranges/timeline, content editors and directed desktop journeys. |
| 1280×800 | PASS | Calendar event containment, native timeline overflow and Contents remain usable; intro hierarchy retained. |
| 1200×768 | PASS | Compact desktop Calendar and foreground adapt; native workspace scrolling reaches dense content. |
| 390×844 | PASS | Intro crop/top/bottom fades and initially visible CTA; selected-day Calendar rows, vertical Upcoming, capture and Contents gestures. |
| 320×568 | PASS | No horizontal overflow; CTA initially visible; date editor, Calendar and sheet controls remain reachable through their intended scroll surfaces. |
| 740×390 / 844×390 landscape | PASS for reachability | CTA, Help, example bottom, date editors and Contents controls can be reached. No pixel-perfect landscape redesign is needed. |

Screenshots were reviewed for intro, Time, range/day details, short landscape Contents and the directed journeys. The normal app remains visually free of astronaut branding. WebP source selection/dimensions pass; the hidden-image request issue is M3, not a composition defect.

These are Chromium desktop/device-emulation results, not fresh physical Android/iPhone or Safari results. The earlier production device sign-off is recorded in `docs/time-integration.md`; it is not counted as a new audit run. A real phone's OS camera/library chooser, virtual keyboard and HEIC decoder cannot be certified by these emulated input tests. Use a brief physical smoke when handing the beta artifact to testers.

## 9. Reliability regression assessment

**F1–F9 remains closed. No new data-safety regression was demonstrated.**

Time metadata uses the existing queued repository update path and validation. Node coverage verifies temporal metadata through full Copy, structure-only exclusion, reparenting, archive/unarchive and repeated Backup/Restore; malformed temporal backups are rejected before replacement. Time interaction does not own a separate store.

Copy/Paste still uses independent identities and owned attachment records through the existing transaction/recovery path, including the WebKit byte fallback. Duplicate Structure uses its metadata allowlist and no attachment copying. Current browser suites exercise rejected writes, destination invalidation, stale sessions, corruption preservation, journals, restore validation, object URLs and maintenance. The combined integration suite passed all 33 checks. The directed returning-user journey additionally verified original file hashes.

The initial orphan test got a different protective rejection: “Saved data changed. Check unused files again.” Repository checks at `services/universe-repository.js:42-58` reject before deleting when the raw snapshot changes. An instrumented repeat passed all 39 original checks and recorded both the winning reference and original bytes present. Its assumption about exactly which guard rejects is flaky; this is not evidence of unsafe cleanup or a reason to invent F10 work.

The technical foundation cannot promise survival after browser-profile deletion, eviction or device failure. Communicating the existing browser-local/Backup model is M2; it does not reopen the persistence architecture.

## 10. Test results

### Totals and execution

- **Node:** all **915 tests passed** across 62 `*.test.js` files, including nested subtests.
- **Python:** **71 tests executed and passed**, including all **6 packaging tests**. Separately, the PostgreSQL-backed Time test class was skipped because no `--pg-bin` was supplied; no live database was contacted. The actual unittest subprocess exit was 0.
- **Existing browser coverage:** 39 distinct suites. With the orphan diagnostic rerun, **35 suites completed successfully, totaling 3,977 checks**. Four other suites reached **395 passing assertions** before obsolete/timing assertions stopped them. The initial orphan run also failed at its error-code assertion before the successful 39-check repeat. Repeated diagnostic assertions are not added to these totals.
- **Directed journeys:** **13 final assertions passed** across all five journeys, including original attachment hashes after reopen.
- **Production failures demonstrated by automated assertions:** none. M1–M3 are supported product observations, not claims that the red legacy assertions identify production failures.
- **Environmental limits/failures:** skipped SQL class and no physical camera/Safari testing. PowerShell stderr redirection misleadingly surfaced one successful unittest run as a shell failure; a direct subprocess rerun confirmed exit 0 and all 71 successful cases. Temporary journey-driver quoting, hover, native touch and moving-target synchronization were corrected outside the repository; unsuccessful fixture-development attempts are not counted as successful product checks.

Commands: `node --test` with all discovered `tests/*.test.js` paths; `python -B -m unittest discover -v -s tests -p '*_test.py'`; `python -B tests/browser-check.py` and its `--<suite>-only` flags below. Staging used `--site-root` pointing to a fresh temporary package. Original tests were not weakened or edited.

| Browser suite | Checks | Outcome |
| --- | ---: | --- |
| default | 139 | PASS |
| first-use | 211 | PASS |
| first-user-readiness | 349 | PASS |
| prerelease-ux | 161 before stop | Obsolete assertion |
| time-data | 114 | PASS |
| time-view | 102 | PASS |
| time-refinement | 104 | PASS |
| time-mobile-ranges | 102 | PASS |
| item-destinations | 109 | PASS |
| sidebar-copy-paste | 41 | PASS |
| duplicate-structure | 43 | PASS |
| move-destination | 156 | PASS |
| mobile-capture | 160 | PASS |
| mobile-attachment | 48 | PASS |
| contents-browse | 714 | PASS |
| task-lists | 109 | PASS |
| task-views | 97 | PASS |
| constellations | 94 before stop | Obsolete disclosure expectation |
| constellation-ux | 46 | PASS |
| help | 29 before stop | Native close-event timing |
| body-actions | 95 | PASS |
| desktop-add | 30 | PASS |
| sidebar-refinement | 95 | PASS |
| local-stale | 20 | PASS |
| background-files | 35 | PASS |
| corrupt-data | 58 | PASS |
| attachment-recovery | 32 | PASS |
| attachment-binary | 40 | PASS |
| restore-model | 53 | PASS |
| object-urls | 26 | PASS |
| storage-capacity | 29 | PASS |
| attachment-orphans | 39 | PASS on diagnostic rerun; initial assertion mismatch after 34 checks |
| persistence-integration | 33 | PASS |
| backup | 40 | PASS |
| restore | 70 | PASS |
| staging | 291 | PASS |
| static-hosting | 282 | PASS |
| navigation | 111 before stop | Obsolete menu expectation |
| archive | 65 | PASS |

### Failure classification and missing high-value coverage

| Suite / evidence | Classification / interpretation |
| --- | --- |
| `tests/prerelease_ux_browser.py:180-181` accesses `.brand-mark` after 161 passing checks | Obsolete test: decorative internal branding was intentionally removed. Current onboarding, capture, sections and More interactions passed before this assertion. |
| `tests/browser-check.py:4367-4373` opens Constellations if collapsed, taps it again, then expects it to remain open | Obsolete toggle expectation: the diagnostic observed `collapsed:true`, `listHidden:true`, `treeHidden:true`, `narrow:true`, no creation dialog. A tap closed the already-open exclusive section. Focused staged-picker coverage passed 46 checks. |
| `tests/browser-check.py:1638-1639` checks focus immediately after closing Help | Test timing: immediately after native close, focus was still `close-help-button`; after two animation frames it was correctly `utility-more`. No production focus fix is justified by that failure. |
| `tests/attachment_orphan_browser.py:184` requires `LOCAL_SNAPSHOT_STALE` | Flaky/over-specific assertion: the first run reached the independent snapshot-change rejection instead. The repeat returned the expected F1 code, preserved reference/bytes and passed all 39 checks. Test the safety invariant and accepted guarded outcomes rather than a single scheduling winner. |
| `tests/browser-check.py:5568` requires a canvas action list without creation or Paste | Obsolete expectation: current approved action availability is covered by body-actions (95), desktop-add (30) and item-destinations (109). Do not remove approved actions to satisfy it. |

Add focused regression cases when fixing M1–M3: overdue incomplete visibility across midnight/month changes and completion; unavoidable early local-storage explanation; and no intro image request on a cold returning-user startup. Existing range, miniature, camera-routing and canonical-write tests should remain intact.

Local evidence directory: `C:/Users/gusta/AppData/Local/Temp/cosmifold-product-audit-jqy27e7g/`. It contains `node.log`, `python-verbose.log`, per-suite `browser-*.log`, `browser-results.json`, three `diagnostic-*.json` files, `journeys.json`, `journeys-final.log`, journey screenshots and the package inventory. Browser-suite logs print their separate screenshot directories. Disposable profiles and fixture data did not use the user's normal browser storage.

## 11. Packaging/release hygiene

The fresh temporary artifact contains **70 files / 4,807,245 bytes**. Preparation uses the existing declared-asset scanner; nothing was deployed. All 6 packaging tests and 291 actual-package browser checks passed. Source auth configuration is replaced only in the generated artifact with the existing unconfigured local-only configuration; its CSP excludes remote account/script endpoints. Normal source configuration was untouched.

The artifact includes current Time scripts/styles/avatars, both responsive WebP brand images, both Example Universe images, Manrope and its OFL license, vendor notices, 404 and hosting headers. Dev/test/docs/operator/forensic directories, obsolete astronaut PNG copies and retired prototype/icon modules are not runtime package contents. Sample data remains hidden in release UI and does not automatically populate real data; explicit internal Sample fixtures remain isolated. Retained diagnostics outside the runtime inventory are not a reason to publish them or delete historical evidence during this audit.

Static assets, MIME types, revalidation, CSP, refresh and origin-local persistence passed. Staging checks found no production runtime/CSP errors. The optional browser favicon probe is harmless; it is not a missing application dependency. The two Example Universe PNGs account for 3,057,834 bytes of the whole artifact, but a normal responsive page chooses one; do not confuse package size with initial transfer. M3 documents the measured hidden-return path separately.

Use the reviewed local-only artifact on a stable HTTPS origin for beta and explain browser-local data/Backup. Browser assumptions include modern Web Locks, IndexedDB, native dialogs, responsive CSS and supported secure-context storage; existing unavailable-storage paths fail visibly. No production accounts/cloud activation is needed for this beta.

## 12. Recommended pre-beta fix list

1. **M2 — Explain browser-local storage early.** Makes the trust boundary clear before testers rely on it. **Small.**
2. **M1 — Keep incomplete overdue work discoverable.** Completes the minimum attention behavior already recorded in the urgency contract. **Medium.**
3. **M3 — Defer hidden intro image loading.** Avoids the measured 1.77 MB cold mobile transfer without changing design. **Small.**
4. **L1 — Refresh the five stale/racy test contracts and rerun affected suites.** Establishes a meaningful green release baseline without changing approved behavior or weakening safety assertions. **Small to medium.**

## 13. Explicitly deferred items

- L2's descriptive file-count correction is routine documentation maintenance.
- Final Due today/Overdue visual art direction can follow the minimum M1 behavior. Task type should not gain permanent visual priority.
- Cosmetic micro-spacing, more prominent Constellations, a different celestial taxonomy and a redesigned Time layout are not justified by this audit.
- Additional low-end-device performance profiling and broader assistive-technology exploration can continue with beta feedback. Fresh physical camera/library/WebKit checks remain a device-validation limit, not an invented code defect.
- No new reliability foundation, advanced scheduling system or expansion beyond the current local-first product is recommended.

## 14. Final recommendation

**Yes: after the targeted fixes and test-contract cleanup, release Cosmifold to a small group of real testers.**

The current product is coherent enough for ordinary trips, classes, notes, photos and lightweight planning. Its core creation, organization and reopening paths work, and the closed local-first foundation continues to protect canonical data and attachment bytes. The next useful evidence is whether real people naturally distinguish an organizing Item from its Contents and successfully reuse their work over several days.

Only this audit report was added. Production code, existing test files, other documentation, assets and persistence behavior were left unchanged. Final whitespace validation: `git diff --check` passed; expected worktree status is `?? docs/product-prerelease-readiness-audit.md`. No commit, push or deployment.
