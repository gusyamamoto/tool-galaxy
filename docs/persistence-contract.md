# Persistence command contract

This branch prepares acknowledged local commands, without a cloud adapter. Reads,
rendering, hierarchy calculations and selection remain synchronous.

## Write-path audit before the refactor

| Action | Actual chain | Previous completion/publication |
| --- | --- | --- |
| Create / form reparent | form submit -> commitCrudMutation -> saveGalaxy -> repository.save -> metadata.save | Runtime Maps/physics changed first; save errors were swallowed. |
| Rename / inline rename | renameEntry -> repository.save -> metadata.save | Synchronous staged snapshot; immediate DOM publication. |
| Group move | HierarchySidebar.onMove -> moveSidebarEntries -> repository.moveEntries | Synchronous snapshot then runtime publication. |
| Duplicate structure | structure form -> repository.duplicateStructure -> metadata.save | Synchronous staged hierarchy; one save. |
| Copy / Make copies | confirmHierarchyPaste -> repository.copyEntries -> files.saveBatch + metadata.save callbacks | Already asynchronous file transaction; synchronous metadata/compensation inside it. |
| Link / remove placement | portal form / Paste Link / removePortal -> commitPortalReferences -> replacePlacements | Synchronous snapshot then sidebar publication. |
| Delete subtree | delete form -> repository.deleteSubtree -> files.deleteEntries + metadata.save callbacks | Already asynchronous compound deletion; rollback snapshots. |
| Archive / unarchive | archive form / restoreGalaxy -> repository.archive/restore -> metadata.save | Synchronous snapshot followed by active/archive Map projection. |
| Constellations | ConstellationWorkspace forms/membership -> commitConstellations -> replaceConstellations | Synchronous collection snapshot then UI publication. |
| Notes / Bookmarks / Location | EntryContentInspector -> saveEntryContent/saveEntryLocation -> updateContent/updateLocation | Immediate synchronous save; drafts closed after return. |
| File upload / remove | EntryContentInspector jobs -> file adapter transaction -> content save/rollback callbacks | Promise for complete transaction; content callbacks necessarily synchronous. |
| Layout / positions | physics settle / drag completion / pagehide -> saveGalaxy -> repository.save | Whole-snapshot coordinate checkpoints; no save per tick. |
| Sidebar preferences | hierarchy/section controls -> preferences.update | Best-effort device-local writes, independent from metadata. |
| Migration recovery | initializeGalaxy -> canonical save -> metadata.save | Exact historical strings preserved synchronously before replacing metadata. |
| Export | Backup UI -> repository.readBackup | Read-only; no user-data writes. |
| Restore | Restore UI -> replaceLocalBackup -> journal + files.replaceAll + raw metadata/preferences callbacks | Already Promise-based; durable marker/recovery before bootstrap. Preserve this mechanism. |

## Current contract

`UniverseRepository` write commands return Promises. Resolution means persistence
completed; rejection means it failed. Validation/no-op commands follow the same
contract. Observers receive typed intents after successful persistence, and their
errors cannot turn a committed write into failure.

| API | Resolved result |
| --- | --- |
| `save`, `saveLayout`, `archive`, `restore`, `replacePlacements` | No additional value |
| `updateContent`, `updateLocation`, `addAttachment`, `removeAttachment` | Updated canonical item |
| `replaceConstellations` | Acknowledged records, including current lifecycle timestamps |
| `moveEntries` | Snapshot, effective roots and changed IDs |
| `copyEntries`, `duplicateStructure` | Copy plan/results and acknowledged snapshot |
| `deleteSubtree` | Acknowledged remaining snapshot |
| `replaceLocalBackup`, `recoverPendingRestore` | Existing Restore completion/recovery contract |

Snapshot-taking commands accept either an explicit immutable snapshot or a
synchronous snapshot factory. Use a factory for queued commands which depend on
previous writes. A static snapshot is not automatically rebased or merged.

The repository has one FIFO Promise tail. Rejections do not poison later commands.
`whenIdle()` is an ordering fence, not a substitute for awaiting an individual
command to observe success/failure.
The application has a small FIFO around planning -> repository acknowledgement ?
runtime/DOM publication. That second boundary ensures the next user command reads
the latest acknowledged runtime Maps, rather than a snapshot captured before a
previous rename/move/content edit. It is not a retry queue, outbox or sync engine.

Create/form reparent now plan in temporary Maps, persist the canonical snapshot,
then invoke the existing `commitCrudMutation` publication path. Rename, moves,
structure duplication, collection/link changes and archive projections publish
after acknowledgement. Failure leaves canonical runtime data unchanged. Existing
error surfaces remain responsible for concise feedback; relevant forms prevent
repeated submissions while pending, without locking unrelated navigation.

Notes, Bookmark and Location handlers await acknowledgement before closing editors
or announcing success. Content-field changes are applied to current content inside
the queue. Pending/failing drafts are held only in memory for the originating item;
completion is checked against the selected item before changing the visible editor.
Cancel discards that draft explicitly. These drafts are not included in Backup.
UI helpers may return a handled boolean (for example Bookmark validation or drag
acceptance); repository persistence failures always reject, never resolve `false`.

## Local adapter and attachment transaction capability

Local/memory metadata adapters expose awaitable `commit(snapshot, intent)` for
semantic commands. Local work still calls the existing synchronous v5 serializer;
no fake delay is added. Composition allows this Promise boundary and preserves
error names/causes. Tests inject deferred/rejecting commits independently of the
synchronous transaction primitive.

`metadata.save` is an intentional **local-only synchronous capability**, not the
application-facing semantic API. Local IndexedDB commit/rollback callbacks must
remain synchronous: returning/awaiting a Promise inside them breaks transaction
lifetime. The repository owns add/remove/copy/delete coordination, calls that
private local writer inside the unchanged file transaction, then resolves/publishes
only when the whole transaction succeeds. Runtime attachment content is published
afterward; abort compensation needs no optimistic runtime rollback. Originals,
thumbnails, IDs and ownership are unchanged.

A future cloud repository can implement the same public command results. It must
replace the local file coordinator with a server/object-storage lifecycle; it must
not pass network Promises to the local callbacks or simulate atomicity by restoring
an old whole cloud snapshot. No such cloud implementation exists in this branch.

Restore's raw metadata/preference writes, durable journal, file replacement,
commit marker, Web Locks and recovery order are unchanged. Its shared repository
entry points participate in repository ordering. Backup remains read-only and the
UI waits for ongoing application commands before allowing file replacement.

## Semantic edits versus layout/device preferences

Semantic commands use domain intents (`items.created`, `items.renamed`,
`items.moved`, `content.changed`, `location.changed`, `constellations.changed`,
`placements.changed`, attachment actions, archive actions).

Automatic coordinate persistence calls **`saveLayout` / `layout.saved`**, not the
semantic default `save`. Physics ticks still update only runtime data and a dirty
flag. Settling/drag completion schedules a layout write. Overlapping requests share
a pending flush and capture current state again if another checkpoint was requested.
No per-tick saves, force changes, network writes or elaborate debounce engine exists.

Closing/hidden-page handling retains **`checkpointLayout` / `layout.checkpoint`**:
a synchronous local-only best-effort checkpoint, fenced off whenever application
or repository commands are pending. It cannot flush network commands on tab close
and must never become a remote semantic save. Future remote layout policy and
unacknowledged-close handling remain separate work.

Sidebar preference `update`/`clear` return completion Promises in both local/memory
adapters. Their writes remain immediate and device-local. UI controls apply their
visual preference optimistically and catch/record errors as best-effort preferences;
they never announce that a failed write was saved. They are not universe commands
or future per-resize cloud writes. Strict synchronous `replaceRaw` is retained for
Restore, which does require preferences to participate in verified replacement.

## Remaining synchronous assumptions

**Intentional and safe locally:** model/selection/render reads; `repository.load`
and canonical snapshot construction; private local metadata serialization; local
file transaction/rollback callbacks; migration recovery strings inside that
serializer; Restore's raw writes; fenced closing layout checkpoints; disposable
Sample file seeding. None is an unawaited semantic user-data command.

**Future work:** remote bootstrap/authentication/loading states, account-scoped
cache isolation, remote compound file lifecycle, multi-device/tab revisions and
conflicts, permission/auth errors, remote layout policy and reliable pending-work
handling during tab closure. Repository ordering protects one instance, not a
server or all normal editing tabs. Existing Restore locks still protect replacement.

## Verification

`tests/awaitable-persistence.test.js` uses deterministic deferred Promises to check
acknowledgement, rejection, subsequent queue recovery, rename -> move -> content
ordering, file transaction completion and local checkpoint fences. Run:

```powershell
node --test (rg --no-ignore --files tests -g '*.test.js')
python tests/browser-check.py --awaitable-only
```

The browser test checks actual staged Create, rejection without mutation, repeated
submit guards, ordered rename/move/content, Notes/Location drafts and selection
changes, collection acknowledgement and absence of unhandled exceptions. Existing
Backup/Restore, Files/Media, hierarchy, content and hosting regressions verify the
same local v5 data and product workflows.


### Branch validation results

- Full Node suite: **285 passed** (including 7 deterministic async contract tests).
- Deferred UI/ordering/draft checks: **18 passed**, including form Move after pending Rename.
- Backup/Restore **69**, Media **57**, Locations **57**, Copy/Paste **61**, group move
  **62**, Duplicate structure **43**, multi-selection **55**, Constellations **105**,
  Portals **55**, archive **65**, Rich Content **56**, CRUD **91**, everyday workflows
  **59**, persistence adapter checks **20**, Help **44**, static hosting **180**:
  all passed in disposable browser profiles.
- The default combined visual suite stops at `normal close zoom makes local labels
  eligible under density handling` (`semanticDetail[role + 'Label'] > .9`). The
  identical assertion fails when serving an untouched **HEAD** archive through
  `--site-root`. This pre-existing visual expectation is outside this persistence
  refactor; no label, zoom, layout or physics implementation was changed to satisfy it.

The default visual-suite failure is reported separately; the above results do not
claim that every historical visual assertion passes. Test callers which previously
captured state in the same statement as a synchronous write now await acknowledgement
before checking dependent state. The pending-file/delete regression verifies FIFO
completion and absence of late orphan bytes, rather than assuming deletion can finish
before an earlier unresolved file command.
