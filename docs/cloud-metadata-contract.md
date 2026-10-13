# Cloud metadata foundation: Steps 1 and 2

This branch adds **interfaces and pure projection/validation only**. The new
modules are not registered in `index.html`. There is no cloud repository instance,
SDK/database call, SQL migration, cache implementation, mode activation or UI
change. The existing local repository, Auth and Backup/Restore are unchanged.

An authenticated owner may own **multiple Universes**. Every request/projection
identifies both owner and Universe. There is no one-Universe-per-owner constraint
in this format; a primary Universe will be an application selection later.

## Future interfaces and outcomes

`services/cloud-repository-contract.js` exposes `cosmifoldCloudContract`:

- `scope({ownerUserId, universeId})`: validate/copy scope, with UUID scope IDs.
  Canonical item/collection/placement IDs remain their original textual IDs.
- `revision(value)`: decimal-string, nonnegative PostgreSQL bigint-compatible
  revision, avoiding JavaScript number precision loss.
- `command(value)`: validate/copy a command envelope containing `scope`,
  `operationId`, `baseRevision`, semantic `type` and JSON `payload`.
- `acknowledgement(value, request)`: validate an acknowledgement against its
  originating scope/operation/base revision. A committed command advances one
  revision; a validated no-op returns `unchanged` at the base revision. Replayed
  receipts retain their original acknowledgement revision, not the latest one.
- `CloudMetadataError`: stable `code`, structural `path`, `outcome` and
  `requiresReconciliation`. Messages contain no actual Notes/Location values.
- `capabilities`, `requireCapability`, `repositoryInterface`, `commandTypes`:
  describe the intended metadata-only interface and unsupported capabilities.

Definitive validation/version/attachment/capability/auth/permission/revision
rejections have `outcome: 'not-committed'`. `OUTCOME_UNKNOWN` and
`INVALID_ACKNOWLEDGEMENT` require receipt reconciliation, with `outcome: 'unknown'`.
These are classification primitives, not transport error detection. A future
adapter must never classify a timeout as definitive rejection without evidence.

Example envelope (illustrative; no execution is implemented):

```text
{
  scope: {ownerUserId, universeId},
  operationId: UUID,
  baseRevision: "42",
  type: "items.renamed",
  payload: {id: "entry-original-text-id", name: "Tokyo"}
}

acknowledgement:
{
  scope, operationId, baseRevision: "42", revision: "43",
  status: "committed", replayed: false, result: <command result>
}
```

The payload currently receives strict JSON validation only. Semantic command
planning, database validation, authorization, request digests and receipt storage
are later steps. The envelope does not authorize ownership or execute writes.

The future gateway declares Promise-returning `listOwnedUniverses()`,
`readUniverse(scope)`, `commitMetadata(command)` and
`getOperationReceipt(scope, operationId)`. It is not implemented here.

The future repository bootstraps asynchronously with `open(scope)` before its
synchronous `load()`/`snapshot()` can be used. Semantic method names/result shapes
follow the existing [persistence contract](persistence-contract.md): `save`,
content/Location, collections, placements, moves, structure duplication, copy,
archive/unarchive and subtree deletion. `subscribe` and `whenIdle` retain their
existing meaning. Attachment mutations and local replacement Restore are not
supported. `saveLayout`/`checkpointLayout` are presentation-cache operations,
never semantic remote writes.

Server acknowledgement is authoritative. A future cache failure must not turn a
committed command into a claimed rejection or trigger a cloud rollback. An older
replayed receipt must not move a newer cache revision backwards. No queue, retry
engine, cache or event system is introduced in this step.

## Pure projection format

`services/cloud-metadata-projection.js` exposes `cosmifoldCloudProjection`:

```text
validateStorageV5(snapshot) -> validated independent copy
toRelational(snapshot, {ownerUserId, universeId, revision})
    -> {metadata, presentation}
toStorageV5(metadata, presentation = null) -> validated v5 snapshot
validateRelational(metadata) -> validated independent copy
```

`metadata.format` is `cosmifold-cloud-metadata`, `projectionVersion` is **1** and
`storageVersion` is **5**. This version describes the proposed row exchange, not
the portable backup format or a database migration version. Backup stays v1.

| Representation | Fields / purpose |
| --- | --- |
| `universe` | `id`, `owner_id`, decimal-string `revision`. |
| `entries[]` | `universe_id`, exact text `id`, nullable `parent_id`, `name`, global `ordinal`, `attributes_json`, optional `archive_json`, `parent_id_present`. |
| `attributes_json` | Optional description/category, Notes/ordered Bookmarks in content v1, empty attachment array, appearance, Location and original application timestamps. No positions/roles/depth. |
| `archive_json` | Root archive time, optional exact expanded-ID list and archive-array ordinal. Archived canonical entries remain ordinary rows. |
| `constellations[]` | Scope, text ID, name, `created_at`, optional `updated_at`, collection ordinal. |
| `constellation_members[]` | Scope, collection/entry IDs and per-collection ordinal. |
| `linked_placements[]` | Scope, text placement ID, `target_entry_id`, `parent_entry_id`, `created_at`, placement ordinal. |
| `snapshot_fields` | Presence flags for optional v5 arrays/empty legacy connections, preserving omitted versus explicitly empty fields. |
| `presentation` | Version 1, Universe ID, optional per-entry `x`/`y` and ordered `layout[]`. This is a separate local sidecar, not semantic rows. |

These are JavaScript row descriptions, not a final SQL schema. JSONB attribute
packing preserves optional field presence without introducing a column for every
small content field. The later SQL step can map these descriptions explicitly.

Passing **both** outputs back to `toStorageV5` preserves supported v5 fields and
array order exactly (object key order is not significant). Without presentation,
the result intentionally has no world coordinates and `layout: []`: this is a
semantic projection, not a complete visual-state backup. No default coordinates,
starter entries, IDs, timestamps, roles or depth are generated.

Automatic position/layout changes leave `metadata` identical. Presentation is
scoped to its Universe and must not be sent as a semantic metadata command.

Ordinals are explicit, zero-based and contiguous. Decoding sorts copies of row
arrays, so SQL arrival order cannot reorder entries, memberships, collections,
placements or archives. The current v5 global entry order is preserved rather
than inventing a sibling sorting policy. Original Bookmark/expanded-ID array
order is retained inside JSON.

## Validation and v5 decisions

- Require storage v5 and the supported projection/presentation versions. No
  legacy migration or speculative repair.
- Require unique nonblank textual IDs within the appropriate namespace. Reject
  collisions across canonical entries, collections and placements. Bookmark IDs
  are unique **within their owning item's content**, not across the Universe.
- Require valid parents and an acyclic canonical forest. Roots may omit
  `parentId` or explicitly use `null`; `parent_id_present` preserves that
  distinction. Empty-string/non-string parents are rejected rather than repaired.
- Require all memberships and placement endpoints to resolve to canonical
  entries in the same Universe. Duplicate members/placement pairs are rejected.
  Linked placements are references, not tree edges: ancestor/root/self references
  are allowed when the existing model allows them.
- Require archive records to identify distinct roots. Expanded IDs must be
  distinct members of that root's subtree. Archive ordering/expansion are not
  filtered or deduplicated.
- Enforce current name/ID/description/Notes/Bookmark/Location limits, plain Notes,
  supported structured shapes, valid date strings and finite coordinates.
  Bookmarks require absolute HTTP(S) URLs and retain their original spelling;
  they are not rewritten with `URL.href`. Location and Constellation names must
  already have canonical outer whitespace. Item names/IDs are not trimmed.
- Require `content.attachments` to be an array. Any nonempty attachment array
  fails with `UNSUPPORTED_ATTACHMENTS`, including archived content and relational
  input. Invalid attachment arrays fail validation. No attachment metadata is
  silently removed, and no binary store is opened.
- Presentation layout must reference existing entries and their exact parent,
  with finite angle/nonnegative radius and unique IDs. Legacy pins/coordinate
  layouts are rejected; no layout normalization or physics calculation occurs.
- Reject unknown fields instead of discarding them. Explicit null content,
  appearance or Location is rejected; omission is supported. This is a stricter
  cloud-ingestion subset of v5, **not a change to the local v5 reader**. Some local
  normalizers tolerate/repair malformed fields; this boundary deliberately does
  not. Future import must surface rejection while preserving the original data.
- JSON must contain finite JSON values only. Reject cycles, getters, unsafe
  prototype keys, executable/non-JSON values, sparse arrays and values that would
  be silently omitted. Shared ordinary object references are copied independently.
  Depth and node-count limits bound structured input. No content is executed.

Ownership UUID validation only checks representation. **RLS and server ownership
checks remain unimplemented and essential**. An input `owner_id` is not proof of
ownership. Cross-Universe rows and presentation are rejected here, but there is
no cross-owner authorization claim and no uniqueness requirement on `owner_id`.

## Tests and stopping point

```powershell
node --test tests/cloud-metadata.test.js
```

Tests cover rich active/archived and deep-hierarchy round trips, empty/minimal
snapshots, optional presence, exact text IDs/timestamps/content, shuffled row
ordering, multiple Universes per owner, presentation separation, independent
copies, invalid relationships/archives/order/scope, attachment rejection, unsafe
JSON, revision precision, acknowledgement binding/no-ops and uncertain outcomes.

Stop here. SQL/RLS/RPC, SDK integration, cache/bootstrap, cloud activation,
file operations, migration UX and synchronization are subsequent steps. The
ordinary Cosmifold app still uses its existing local persistence paths.
