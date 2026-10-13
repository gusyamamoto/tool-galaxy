# Cloud metadata SQL: Step 3, review only

The draft migration is
`supabase/migrations/202610120001_cloud_metadata.sql`. The user has now reported
successful permanent installation with the intended private-schema exposure
settings. Earlier temporary compilation and single-session tests in the real
Supabase SQL Editor passed and rollback cleanup was verified; see
[the runtime checkpoints](cloud-metadata-validation.md).
Codex made no database connection, tooling installation, deployment,
application configuration or runtime behavior change.

This document describes the Step 3 SQL checkpoint. Steps 1/2 and their JavaScript
contract/projection remain unchanged. The subsequent [Step 4 gateway](cloud-metadata-gateway.md)
is separately documented; cloud repository activation, cache and migration UI
are still absent. Local storage v5, Backup/Restore and files are untouched.

## Schemas and representation

The migration would create `cosmifold_private` and exactly six tables:
`universes`, `entries`, `constellations`, `constellation_members`,
`linked_placements`, `operation_receipts`. It adds five RPCs to the existing
`public` schema. It creates no extension, role, profile, attachment or file table.

**Keep `cosmifold_private` out of the Data API's exposed schemas.** Authenticated
SQL table/helper permissions are needed by INVOKER functions; they are not a
direct browser table API. Adding this schema to exposed schemas would allow
owner-authorized direct writes that bypass the revision protocol. Verify both
the dashboard/API schema setting and a rejected `Content-Profile` /
`Accept-Profile: cosmifold_private` request in a disposable test project before
application. Do not expose a generic SQL-execution RPC elsewhere.
[Supabase schema exposure](https://supabase.com/docs/guides/api/using-custom-schemas).

The read projection is exactly the [Step-2 representation](cloud-metadata-contract.md):

- `format: cosmifold-cloud-metadata`, `projectionVersion: 1`, `storageVersion: 5`.
- Universe UUID/owner UUID and a decimal-string revision; `snapshot_fields` stored
  on the Universe preserves optional-array presence.
- Entry IDs/parents remain text; `parent_id_present`, name, ordinal,
  `attributes_json` and optional `archive_json` are retained.
- Constellation IDs, membership and placement endpoints remain text.
- Original application timestamps are **text**, preserving their spelling.
- Reads omit absent optional fields, never recursively strip JSON null values
  inside appearance metadata, and explicitly order all arrays.
- No positions/layout/presentation sidecar or derived roles enter the tables.
  File-bearing `content.attachments` is forbidden; RPC preflight returns
  `UNSUPPORTED_ATTACHMENTS` before changes.

`owner_id` references `auth.users(id)` and has a **nonunique** lookup index. One
owner may have multiple Universes. Primary selection is not a schema constraint.

## Constraints and deletion

Canonical keys are `(universe_id,id)`; member keys include collection and entry.
Composite foreign keys bind parents, memberships and both placement endpoints to
the same Universe. Parent references are nullable for Galaxy roots. Self-parenting
is rejected; complete canonical cycles are checked by the mutation RPC.

Ordering is nonnegative, JS-safe integer metadata with deferred unique ordinal
constraints. Final RPC validation requires contiguous zero-based ordering,
including archive order and per-collection membership order. Other final checks
cover ID collisions across canonical/collection/placement namespaces, valid root
archives, expanded IDs inside the archived subtree and truthful presence flags.

**There are no delete cascades.** Every foreign key uses `ON DELETE NO ACTION`:

- Auth-user deletion cannot silently erase Universes; account deletion is future
  explicit work.
- Universe deletion cannot erase its graph/receipts; no ordinary delete grant or
  RPC exists for it.
- Entry deletion must explicitly remove/update child, membership and placement
  references, including references to archived entries.
- Collection deletion requires explicit membership removal.
- Receipt retention/deletion is not an ordinary browser operation.

Graph/reference FKs and ordering/pair uniqueness are deferred so compound deletes,
parent-first/child-first batches and ordinal swaps can form one valid final state.
The mutation RPC forces **only its named constraints** immediate before success,
then restores their deferred mode. It validates rather than cascades, filters or
repairs. Cross-table graph/ordering validation belongs to the protected RPC;
direct privileged operator SQL must not bypass that invariant protocol.

## RLS and grants

All six tables have RLS enabled **and forced**. The Universe policy compares
`owner_id` with `auth.uid()`. Child/receipt policies resolve ownership through the
Universe, with `USING` and `WITH CHECK`. Receipt inserts additionally require the
acknowledgement's owner to match the verified caller. Policies do not recurse.

Anonymous/PUBLIC roles receive no private schema/table/helper or RPC access.
Authenticated grants are limited to what the INVOKER paths require:

- Universe SELECT, INSERT of `id/owner_id`, UPDATE of revision/presence flags.
  No ordinary owner/id reassignment or Universe DELETE.
- Domain SELECT/INSERT/DELETE, plus column-specific UPDATE of mutable fields.
  No canonical ID or Universe reassignment UPDATE.
- Receipt SELECT/INSERT only; receipt shape, digest, revision delta and
  acknowledgement identity are constrained.
- Private helper EXECUTE and schema USAGE; only the five named public RPCs are
  granted to authenticated clients. Supabase's default function grants are
  explicitly revoked on these objects.

**Every authored function is `SECURITY INVOKER`, with `search_path = ''`. No
DEFINER function is used.** Helpers use qualified domain names and PostgreSQL's
built-in functions. The frontend still needs only its existing publishable key
and SDK session; there is no secret or privileged-key architecture.
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[function security](https://supabase.com/docs/guides/database/functions).

## RPC surface

| RPC | Purpose/result |
| --- | --- |
| `cosmifold_list_universes()` | Owned UUID/revision summaries, ordered by UUID; empty list is valid. |
| `cosmifold_create_universe(p_universe_id uuid)` | Explicit empty-Universe creation, owner inferred from Auth. Repeating an owned ID returns its current projection without resetting revision/data. Never uploads local data or seeds starter content. |
| `cosmifold_read_universe(p_scope jsonb)` | Ownership-checked coherent projection. `{status: found, metadata: ...}` differs from `{status: absent, metadata: null}`. A found empty Universe has real revision/empty arrays. |
| `cosmifold_commit_metadata(p_command jsonb)` | Atomic row changes, CAS, validation, receipt and contract-compatible acknowledgement. |
| `cosmifold_operation_receipt(p_scope jsonb, p_operation_id uuid)` | `absent` Universe / `missing` receipt / `found` receipt. Found includes server `request_digest` and the original acknowledgement with `replayed: true`. |

`p_scope` is the contract's `{ownerUserId, universeId}`. Owner is verified against
`auth.uid()`, never trusted. A mismatched requested owner raises `FORBIDDEN`;
missing Auth raises `UNAUTHENTICATED` (anonymous grants deny access earlier).

RLS deliberately hides foreign rows. If B claims B's own scope but supplies A's
Universe UUID, a read returns **absent within B's authorized scope**, just like an
unknown UUID. Revealing which hidden UUID exists would undermine isolation and
cannot be justified merely to improve error wording. Known A-scope/B-caller
requests are explicitly forbidden. No DEFINER existence probe was added.

The command envelope remains the existing contract. Its previously unspecified
`payload` now has a narrow row-change convention, not a second projection:

```text
{
  upsert?: {
    entries?: [exact Step-2 entry rows],
    constellations?: [exact Step-2 collection rows],
    constellation_members?: [exact Step-2 membership rows],
    linked_placements?: [exact Step-2 placement rows]
  },
  delete?: {
    entries?: [text IDs], constellations?: [text IDs],
    linked_placements?: [text IDs],
    constellation_members?: [{constellation_id, entry_id}]
  },
  snapshot_fields?: <exact Step-2 presence flags>
}
```

Sections are optional; no unknown table/field or automatic-layout command is
accepted. Each row identity can be touched only once, including delete/upsert
overlap. Type labels match the JS contract; they describe intent, not separate
authorization levels. All row changes must leave a valid owned Universe.

## Revision/receipt transaction

1. Check command/verified scope and compute SHA-256 on the server over the JSONB
   command representation. No client digest is trusted or extension installed.
2. Lock the Universe with `FOR UPDATE`; absence is an explicit mutation error.
3. Look up `(universe_id, operation_id)` **before** checking revision. Identical
   digest returns the stored acknowledgement; a different digest fails.
4. Compare the base revision, apply explicit changes, validate final relationships
   and constraints, increment once if anything changed and insert its receipt.
   No-op commands get receipts at the unchanged revision.
5. Return the contract acknowledgement. `result` is currently JSON null: a future
   JS repository uses its validated plan for command result shapes. SQL neither
   normalizes content nor stores full snapshots in every receipt.

All of this runs in one database transaction. A statement/constraint failure
rolls back changed rows, flags, revision and receipt. Relational/cast failures are
sanitized; they are not returned with a failing row's Notes/Location text.

Read/reconciliation RPCs take `FOR SHARE` on the same Universe row. Readers wait
for in-flight writers; writers cannot publish between the revision and projection
read. Functions using multiple reads are VOLATILE; PostgREST's usual READ COMMITTED
is assumed. Stronger isolation can produce a serialization failure that needs
retry rather than a mixed projection. All application writes must use this lock.

Digest comparison uses PostgreSQL JSONB text normalization: object key order and
formatting whitespace do not matter; array order does. Immutable original command
retries are the authoritative digest-binding check. A receipt lookup alone is not
permission to change the payload/reuse the operation ID. No receipts are pruned
yet; a future reviewed retention policy must define how expired retries work.
[Native SHA-256](https://www.postgresql.org/docs/15/functions-binarystring.html).

| Outcome | SQL/API distinction |
| --- | --- |
| Absent owned Universe | Read wrapper `absent`; mutation `CM007 / UNIVERSE_ABSENT`. |
| Empty owned Universe | Read wrapper `found` with empty arrays/revision. |
| Forbidden scope | `42501 / FORBIDDEN`; anon execution also denied by grants. |
| Missing Auth subject | `28000 / UNAUTHENTICATED`. |
| Stale base revision | `CM003 / REVISION_CONFLICT`. |
| Identical retry | Original revision/status, `replayed: true`; no new write. |
| Same operation ID, different content | `CM004 / OPERATION_ID_REUSED`. |
| Invalid relational/content data | `CM005 / INVALID_METADATA`. |
| Attachments | `CM006 / UNSUPPORTED_ATTACHMENTS`. |
| Invalid envelope/cast | `22023 / INVALID_COMMAND`. |

The future gateway must translate these provider outcomes into the existing
contract (e.g. operation-ID reuse is a definite invalid-command rejection) and
keep transport timeouts/unknown responses as `OUTCOME_UNKNOWN`. It is not added
here. Server timestamps are not conflict resolution.

## Tests and review assumptions

Executed locally: **28 Node projection/static SQL checks**, and **127 focused
tests including local persistence, awaitable commands, storage, Auth and
Backup/Restore**. Static checks cover delimiters/procedural terminators, table
and FK/grant declarations, INVOKER headers, RPC boundary/locking order and
fixtures generated by the actual Step-2 projection. They are **not a PostgreSQL
parser, SQL compilation or evidence that RLS/transactions ran**.

The database suite in `tests/database/cloud-metadata.sql` was subsequently executed
by the user through the generated reversible SQL Editor artifact and passed.
It requires no
pgTAP/extra extension; it uses disposable Auth fixtures, actual authenticated/anon
roles, assertions and a final ROLLBACK. It covers owned/multi-Universe and empty
reads, A/B/anonymous denial, direct RLS, composite FKs, stale atomic rejection,
single increments, identical/different-digest retry, reconciliation, compound
rollback, cycles, attachments, owner reassignment denial, ordinal swaps, explicit
deletion and no-op receipts. SQL expected projections are compared with fixtures
generated from the Step-2 codec, not separately invented rows.

No psql/PostgreSQL, Supabase CLI, Docker or SQL parser was available locally to
Codex. Codex installed no tool and contacted no database. The user-reported real
SQL Editor run closes compilation/single-session assertions, not HTTP exposure
or concurrent-session tests. For those remaining integration checks, use an explicitly
authorized **disposable Supabase-compatible test database**, not the live project:

```text
psql <disposable test connection> -v ON_ERROR_STOP=1 -f supabase/migrations/202610120001_cloud_metadata.sql
psql <same disposable test connection> -v ON_ERROR_STOP=1 -f tests/database/cloud-metadata.sql
```

Do not paste that placeholder into a shell. No connection string/password is
needed in source or frontend configuration. The migration persists in that test
database; only test fixtures roll back. The test administrator must be able to
insert disposable `auth.users` rows and SET ROLE, while the tested app role must
have neither table ownership nor BYPASSRLS. Fixtures assume ordinary Supabase
Auth schema/roles without custom signup triggers.

Before considering a live application, review/verify:

- PostgreSQL 15+ with UTF8, built-in SHA-256, `auth.uid()`, `auth.users`, and normal
  `anon/authenticated` roles/grants; public RPC schema exposed, private schema not.
- The real single-session schema/security suite passed; still run independent concurrent-session checks:
  hold writer A before commit; reader/receipt lookup B must wait; a second writer
  with the old base must reject after A commits; rollback A must leave no receipt.
- PostgreSQL text/JSONB cannot store NUL/unpaired Unicode surrogates accepted by
  some JS strings. It rejects these rather than altering them. Historical imports
  need explicit preflight and must preserve the source if incompatible.
- PostgreSQL date parsing and the structural HTTP(S) URL check are not identical
  to JS `Date.parse` / WHATWG URL parsing. Original strings are retained. Test
  real/historical edge cases and reconcile accepted-subset differences before
  cloud ingestion; current ISO timestamps and ordinary HTTP(S) fixtures are the
  authored baseline. Client projection validation remains mandatory on reads.
- Benchmark realistic Notes/graph sizes; JSON/node limits and whole-Universe
  integrity/read projections are not yet database-performance tested.
- Review receipt retention and explicit account/Universe deletion later. No
  cleanup timer, deletion cascade, sharing, collaboration or realtime is added.

The Step 3 SQL runtime gate passed and the user subsequently installed the
unchanged migration with private API schema/search-path exclusion confirmed.
The user also reports successful Step 4 authenticated list/create/read and
anonymous-denial HTTP checks, followed by guarded cleanup returning exactly
one deleted disposable Universe; see [the live gateway checkpoint](cloud-metadata-gateway.md).
The subsequent user-reported Step 5 commit/read/receipt/stale-write diagnostic
passed, and guarded cleanup returned `test_universe_removed = true`; see
[the live repository checkpoint](cloud-metadata-repository.md). Step 5 is ready
to commit as an inactive foundation. Genuine transport-loss/delayed-request
cases, second-owner isolation and direct private-table/GraphQL HTTP exclusion,
plus concurrent-session locking, remain untested integration gates before
production cloud use. Codex performed no database connection, application,
cloud activation or deployment.
