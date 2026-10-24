# F9: local persistence/recovery integration audit

Branch: `audit/persistence-recovery-integration`. Local-only audit; no commit, push or deployment.

## Lifecycle/order map (recorded before implementation decisions)

`S` = lifetime `cosmifold-workspace:<scope>` session lock (shared ordinarily, exclusive for Restore).
`W` = existing exclusive `cosmifold-workspace-write:<scope>` mutation lock. `W` compares exact persisted text with the tab's acknowledged text before ordinary operations. Explicit Restore/recovery replacement uses its guarded replacement exception.

| Path | Actual order and authority boundary |
| --- | --- |
| Startup | Compose adapters → hold S → resolve pending Restore under exclusive S + W → W → F3 raw validation → F4 reconciliation → load script/UI → validate raw snapshot again → project valid data → permit ordinary commands. F3/F4 failure shows recovery, suppresses onboarding and saving. |
| Metadata write | Application/repository queues → W/stale comparison → validate previous raw snapshot → domain mutation/save → publish runtime only after success. Pagehide checkpoint never obtains/bypasses an asynchronous lock. |
| Attachment add | One advisory F7 batch check → prepare original/thumbnail → W → durable F4 prepared journal → atomic bytes + files-written marker → synchronous metadata callback → journal cleanup → publish. F2 owns failures. |
| Attachment copy | W → read/validate sources → advisory F7 batch check using original + thumbnail sizes → prepared copy journal → durable new rows/marker → validated metadata callback → journal cleanup → publish. |
| Attachment remove | W → enumerate owned row → prepared F4 journal → metadata callback → atomic row/journal deletion → publish. |
| Branch delete | W → enumerate branch-owned rows → F4 journal → canonical subtree removal → atomic row/journal deletion → publish. References/layout/archives use the existing domain rules. |
| Backup | Capture raw metadata/preferences → read files → verify raw captures unchanged → filter canonical references → hash original/thumbnail payloads → build portable Blob → download owner retains URL for 60 seconds. No durable extra copy. |
| Restore inspection | Header/version/size → manifest integrity/UTF-8/structure → raw F3 + backup-specific model rules → manifest ownership/size → payload hashes/counts → opaque validated handle → real picker preview. No storage writes. |
| Restore commit | Confirm → pause normal commands/physics → exclusive S → W/replacement → raw old/new metadata/preferences journal → one IDB replacement transaction for files, F4 journals and commit marker → synchronous metadata/preferences publication → complete or abort/rollback → clear Restore journal → release old F6 resources → reload. |
| F3 recovery | Preserve exact raw text and all files/journals; inert normal graph/editors, no onboarding. Offer raw download/reload and explicitly validated F5 Restore. No normalization before replacement. |
| F4 recovery | Before normal UI: W → F3 validation → validate every journal → atomic canonical-reference reconciliation of enumerated keys only. Unsupported/ambiguous records preserve evidence and block editing/maintenance. |
| F8 audit | Explicit Backup/Local storage check → W/F3 → reject pending Restore → read-only cursor descriptors + F4/marker state → conservative classification. No payload decoding or deletion. |
| F8 cleanup | Explicit confirmation → W/fresh F3 snapshot → transaction reads selected rows + recovery state → synchronous raw/reference/shape revalidation → delete still-proven orphan keys → commit → update ownership cache/report. No canonical write. |

On F3/F4 failure the UI shell still constructs the recovery controls; `initializeGalaxy()` returns before normal graph projection/editing/onboarding is activated. This lets a valid explicitly confirmed Restore recover the workspace without treating corruption as an empty Universe.

## Authoritative state

| Domain | Authority / must preserve | Derived or discardable |
| --- | --- | --- |
| Canonical metadata | Active raw localStorage snapshot (legacy fallback only if current absent); F3 validates identity, hierarchy, tasks, content, memberships and archives | Runtime maps, hierarchy projections, selection, physics and view state may be stale/rebuilt. Never normalize invalid raw input. |
| Attachment bytes | IDB files row: key, owner, original Blob and optional thumbnail Blob | Thumbnail URLs, decoder state and ownership index/cache can be rebuilt. Missing bytes never authorize metadata deletion. |
| F4 journals | Versioned operation/key/owner/stage records coupled to durable file transactions | Recovery plan is recomputed from valid canonical references; unknown versions/ownership preserve journal and rows. No file bytes in journals. |
| Restore state | Local raw old/new metadata/preferences journal + atomic IDB commit marker/file set | Preview handle is temporary. Marker chooses roll-forward/rollback; neither side is guessed or silently reset. |
| Revision / ownership | W plus acknowledged exact persisted text; S excludes replacing another live workspace | Runtime snapshots alone grant no write authority. Stale tab must reload. Restore revision marker fences losing simultaneous Restore attempts. |
| Background failure | Captured operation, source Item and filename; actual write result | Message is runtime-only, survives navigation until dismissed/promoted; no success or forced navigation on failed write. |
| Object URLs | Live runtime owner (Contents, viewer session, native reader, download timer or texture cache) | Never durable identity or Backup state; detach media before revoke, ignore stale async allocations. |
| Capacity | Actual write result is authoritative | F7 usage/quota estimates are approximate, local, advisory and refreshed at growth boundaries; invalid/missing estimates fail open. |
| Historical orphans | Current validated references/recovery state + recognizable stored row under W at deletion time | Audit result is stale-able advice. Unknown data stays; only fresh proven orphan classification grants deletion. |

## Meaningful F1–F8 interaction matrix

| Pair/group | Coexistence and winner | Stop/preserve/UI |
| --- | --- | --- |
| F1 + F2 | A stale write may fail during a background file action; F1 wins | Stop stale command before side effects; Reload notice suppresses generic file failure. |
| F1 + F3 | Other tab may retain valid-looking memory after raw corruption; exact revision/F3 guards win | No overwrite; preserve corrupt text/files; stale Reload or F3 recovery. |
| F1 + F4 | File transactions/recovery share W | No stale metadata/blob/journal publication; preserve winner and compensate/recover only owned keys. |
| F1 + F5 | Shared S blocks Restore with another live tab; simultaneous losing Restore compares marker | No replacement beneath a live workspace; close-other-tabs or Reload feedback; restored state stays authoritative. |
| F1 + F6 | Stale tab may still display a valid old preview | Preview owns only temporary resources; cannot grant a write or change durable identity. |
| F1 + F7 | Estimate may finish after a tab becomes stale | Invalidate advice; F1 stops the actual write. |
| F1 + F8 | Audit may predate another writer | W/fresh references win; preserve newly live row or reject stale cleanup. |
| F2 + F3 | Corruption/recovery is stronger than routine operation feedback | Disable normal writes; preserve data and show recovery, not onboarding. |
| F2 + F4 | Actual file/metadata rejection may occur after staging | F2 reports source failure; F4 rollback/journal recovery prevents phantom reference/bytes. |
| F2 + F5 | Replacement may abort after partial metadata publication | Verified rollback; no Restore success; old workspace/journals remain. |
| F2 + F6 | Preview/read/decode may fail independently of durable original | Friendly fallback/error; release failed decoder URLs, preserve original and remaining valid owners. |
| F2 + F7 | Low advice or healthy estimate can precede quota rejection | Actual F2 failure wins and clears competing advice. |
| F2 + F8 | Maintenance can fail with a file error already visible | Separate maintenance status; transaction abort preserves all selected rows; F2 notice stays. |
| F3 + F4 | Invalid raw metadata plus pending journal | F3 wins before any file reconciliation; preserve both journal and Blob. |
| F3 + F5 | Corrupt workspace may accept explicitly validated replacement | Invalid candidate preserves exact corruption; valid confirmed Restore exits recovery after reload. |
| F3 + F6/F7/F8 | Recovery state grants no ordinary operation/cleanup authority | No capacity advice/maintenance; temporary URL cleanup cannot delete durable data. |
| F4 + F5 | Restore may replace an older workspace with journals | Failed Restore preserves evidence; successful atomic replacement removes obsolete journals, marker recovery precedes F4. |
| F4 + F6/F7 | Preparation may generate temporary media; F7 can warn first | Release preparatory URLs; estimates never bypass/deny the journaled transaction. |
| F4 + F8 | Staged/unresolved files are not historical garbage | Recovery wins; block cleanup, preserve staged/unknown rows; later audit reflects settled state. |
| F5 + F6 | Candidate failure versus successful replacement | Failure retains valid current resources; success closes old viewers/native readers and invalidates late texture work before reload. |
| F5 + F7/F8 | Candidate size cannot predict replacement's transactional space | No F7 Restore preflight; F8 hidden during preview/commit; no candidate-based orphan classification. |
| F6 + F7/F8 | Temporary URLs are not durable quota/ownership references | No durable-state coupling or orphan deletion through URL revocation. |
| F7 + F8 | Cleanup may change later browser estimates | No fake numbers or live polling; later growth obtains a fresh estimate and can clear advice. |

UI precedence observed: F3/F4 recovery disables ordinary flows; F1 stale state owns Reload; actual F2 failure overrides F7 advice; F8 blockers/errors are confined to explicit maintenance. Routine saves remain quiet.

## Crash/recovery matrix

| Boundary | Persisted authority | Reload/re-entry result and coverage |
| --- | --- | --- |
| Add/copy before file transaction | Prepared journal; old canonical references | F4 cannot claim pre-existing collisions; preserve unrelated rows, clear resolved journal. |
| Add/copy after bytes, before metadata | New rows + files-written journal; old canonical references | Remove only uncommitted journal-owned rows. Actual held-add reload and durable copy-boundary fixtures; source bytes survive. |
| Add/copy after metadata, before journal cleanup | Canonical new references + rows + lingering journal | Preserve successful rows and clear journal, without duplicate attachments. |
| Remove/delete after journal, before metadata | Old canonical references + owned rows | Preserve live rows; no removal is inferred from journal alone. |
| Remove/delete after metadata, before byte cleanup | Canonical references absent; journal enumerates old rows | Finish only enumerated deletion; no resurrection or unrelated sweep. |
| Restore journal before IDB commit / transaction abort | Old IDB rows/marker; captured raw old metadata/preferences | Roll back exact old raw state; failed transaction preserves old files/F4 journals. |
| Restore marker committed before journal cleanup | New rows/marker + old/new raw journal | Roll forward exact new metadata/preferences, clear journal, then F4 sees only the new workspace. |
| F8 interrupted selected deletion | No metadata change; one atomic IDB transaction | Either selected proven rows are removed or all deletes abort. Repeated audit safely recomputes. |

Fault tests cover persisted boundary states and real transactional abort/reload; they do not emulate physical power failure or browser engine/filesystem bugs.

## Audit evidence and outcome

Verdict: **CLOSED — no unresolved BLOCKER/HIGH integration defect found.** No production JavaScript or storage semantics changed in F9.

| Finding | Severity | Resolution |
| --- | --- | --- |
| Focused suites did not provide one combined real-picker round-trip with stale attachment/Restore fences, active image/video/native PDF ownership, mixed task copy, F3/F4/F8 coexistence and upgrade/reload stress | LOW (coverage) | Added `--persistence-integration-only`: 33 checks against real localStorage/IDB, native file-input change handling, downloaded Backup, actual confirmation/Restore/reload and two real tabs. |
| Staging documentation still described 51 files after F1–F8 additions | LOW (documentation) | Regenerated 59-file artifact, corrected inventory description and strengthened packaging assertions for all reliability runtime assets and excluded probes. |

Final validation: **832 Node tests; 1,205 browser checks across 20 suites; four packaging tests; Python syntax, changed-file whitespace and `git diff --check` passed.** The 18 existing suites ran serially; the new combined and staging suites used independent disposable profiles. During new-fixture development Windows output encoding, polling across reload and attempting to open a video before closing the PDF modal caused test-only failures; those fixtures were corrected. No concurrency-induced product failure or unresolved runtime failure remained.

| Browser suite | Checks |
| --- | ---: |
| F1 stale / F2 background / F3 corruption / F4 recovery | 20 / 35 / 58 / 32 |
| F5 model / F6 URLs / F7 capacity / F8 orphans | 53 / 26 / 29 / 39 |
| Backup dialog / Backup / Restore | 28 / 40 / 70 |
| Task Lists / Constellations | 92 / 105 |
| Mobile attachment / mobile capture | 33 / 82 |
| Copy-Paste / structure duplication / archive | 61 / 43 / 65 |
| New F9 combined integration / actual staging artifact | 33 / 261 |

Combined evidence: semantic canonical comparison includes hierarchy, source/copied Task Lists with mixed completion, Constellations, notes/links/location, independent attachment copies and archived data; original and thumbnail hashes match after the real downloaded-file round-trip. Corruption plus a pending journal/historical row survives three reloads exactly. Confirmed valid recovery Restore then survives two further reloads. A real copy is paused after durable files, maintenance blocks it, and two F4 recovery passes preserve source hashes and retire staged keys. F7 remains advisory, and a later real file selection clears old advice using a fresh healthy estimate after F8 cleanup.

Cross-tab scope: normal live S ownership prevents another tab's Restore. The combined fixture additionally ends one tab's session lease deliberately while retaining its runtime to prove that its later write cannot overwrite a completed replacement. This is a fence test, not a claim that normal UI replaces data beneath an ordinary live tab. The existing simultaneous-Restore marker regression covers the losing replacement attempt.

Staging: `staging-site/f9-integration-1792870417519` is a new ignored output directory; earlier artifacts were not overwritten. `python -B scripts/prepare-staging.py --output <new-directory>` produced 59 static files. The actual artifact passed all 261 browser checks with Auth unavailable, persistence local and cloud sync disabled, no external request/CSP/runtime error, no service worker, and preserved data after missing-script/denied-storage injection. All F1–F8 runtime files are included; probes, fixtures, forensic/private source trees and cloud diagnostics are excluded. Nothing was deployed.

Backup portability: raw v5 canonical hierarchy, tasks/completion, content, locations, archived data, linked placements, Constellations, navigation preferences and every referenced original/thumbnail. It excludes drafts, selection/physics, object URLs, error/advisory state, estimates, recovery journals, historical orphan rows and pre-migration preservation copies. Missing referenced bytes fail export rather than silently producing an incomplete backup.

Intentional diagnostics: F4's existing `setOperationStageHook` is an explicit internal adapter test/DevTools hook, null by default, metadata-only and reversible with `setOperationStageHook(null)`. F5 fixture generation, F6/F7 probes/mocks, F8 helper and this audit's fixtures live under `tests/`; runtime packaging discovers declared assets only and excludes them. No new production debug global is required.

## Final manual smoke (10–15 minutes)

Use a new disposable/private profile on the updated local app or reviewed local-only staging artifact. Keep real data elsewhere; no quota filling or raw storage edits are needed.

1. Create a Galaxy with a normal Item and a Task List containing two direct tasks. Complete one task.
2. Create a Constellation containing the Item and a task. Add a Note, Bookmark and Location to the Item.
3. Add a small image and a document via Files/Photo Gallery. On a phone, optionally use Take Photo.
4. Open/close the image several times, navigate to another Item, then reopen it. Confirm the original/document is usable.
5. Archive a separate small Galaxy containing an attachment, if available; its content should remain recoverable.
6. Download **Backup A** using Backup. Add a clearly named later Item and change the unchecked task.
7. Restore Backup A through the real file picker. Review the preview, confirm replacement, and allow reload.
8. Confirm the later Item disappears and the saved hierarchy, task states, Constellation, content, archived branch and attachments return.
9. Reload twice. Reopen the image/document and confirm the same task states and memberships remain.
10. Backup → Local storage → Check unused files should report no unused files for this clean flow.
11. Add one more normal attachment. Confirm it saves quietly and survives reload.

Optional failure check: use the documented reversible F7/F2 mock in `storage-capacity-awareness.md` only in the disposable profile. A healthy estimate followed by a one-shot real write rejection must show F2, retain prior attachments and publish no failed attachment. Restore the mock afterward.

Limits: browser-local data remains subject to browser eviction/profile deletion/device failure; regular downloaded backups remain necessary. Safe mutation/Restore needs Web Locks on a supported secure context. No live cross-tab merge is promised; stale tabs reload, and Restore requires other workspace tabs to close. Unknown legacy/extended orphan data is intentionally preserved. Browser estimates and reclaimed physical space are not guarantees. No cloud recovery, persistent-storage permission, autosave history or speculative subsystem is added.
