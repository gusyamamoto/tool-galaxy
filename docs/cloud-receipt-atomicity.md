# Original commit and receipt atomicity

Architecture review on `feature/cloud-genuine-late-receipt` (2026-10-14).
**The nominal post-commit gate is CLOSED AS NOT APPLICABLE / IMPOSSIBLE BY
CONTRACT.** A successful semantic mutation through the supported RPC cannot
commit its revision/metadata without its original receipt and create that receipt
later. No new live fixture, backend hook or diagnostic is appropriate for this
state. Normal cloud mode remains inactive.

## Transaction and code evidence

The invariant is: **a new operation's metadata changes, revision result and
original operation receipt commit together, or all roll back**. It is enforced
by the RPC transaction, not by an assertion that a cached revision proves commit.

All references below are to
[the installed migration source](../supabase/migrations/202610120001_cloud_metadata.sql):

1. `public.cosmifold_commit_metadata(jsonb)` is a PL/pgSQL `VOLATILE SECURITY
   INVOKER` function. It acquires the owner-scoped Universe `FOR UPDATE` lock,
   checks an existing `(universe_id, operation_id)` receipt/digest BEFORE revision
   CAS, and returns the saved acknowledgement on an identical replay.
2. A new operation validates and changes the relational metadata, calls
   `cosmifold_private.assert_integrity`, checks deferred domain constraints
   immediately, and increments `universes.revision` only if data changed.
3. It constructs the acknowledgement, synchronously executes
   `INSERT INTO cosmifold_private.operation_receipts ...
   VALUES(target,operation,digest,base,current_revision,result)`, then returns.
   This insert is unconditional for a new operation, including a no-op (which
   receives an `unchanged` receipt without advancing revision).
4. There is no intervening transaction commit, procedure call, background job,
   queue, asynchronous trigger, deferred receipt insert or second transaction.
   Receipt insertion failure cannot take a success path. Relational/cast handlers
   rethrow sanitized exceptions after the function subtransaction rolls back;
   other errors propagate. A later outer transaction failure also rolls back
   metadata, revision and receipt together.
5. The migration file's outer `BEGIN`/`COMMIT` installs the schema/functions. It
   is NOT a per-invocation transaction or a split commit between domain data and
   receipts. The grants follow-up changes permissions and notifies PostgREST to
   refresh its schema cache; it does not create operation receipts.

The [gateway](../services/supabase-metadata-gateway.js) uses the
[shared client provider](../services/supabase-client.js), one configured project
URL, `client.schema('public').rpc(name,params).retry(false)` for all five RPCs.
No `get: true`, second receipt endpoint or replica routing is configured.
Each RPC is a separate HTTP POST; the commit POST performs all writes in ONE
PostgREST request transaction. Returning from the SQL function does not commit
independently of that request. See [PostgREST request transactions](https://docs.postgrest.org/en/stable/references/transactions.html).

## Visibility, constraints and scope of the guarantee

[PostgreSQL transaction visibility](https://www.postgresql.org/docs/15/tutorial-transactions.html)
does not expose part of another transaction's updates. A snapshot that includes
this commit includes both metadata and receipt; a pre-commit snapshot includes
neither change. The revision is an ordinary transactional `bigint` column, not
a nontransactional sequence. Different requests can observe different snapshots;
an earlier missing lookup followed by a later committed read does not show a
split commit. An advanced revision alone can also belong to a different operation.

`public.cosmifold_read_universe` and `public.cosmifold_operation_receipt` are
`VOLATILE` and take `FOR SHARE` on the SAME owner-scoped Universe row BEFORE
reading projection/receipt. Under the default READ COMMITTED isolation level,
they wait for a writer holding `FOR UPDATE`; subsequent volatile reads see the
committed result. If it aborts, no mutation or receipt survives. A lock/statement
timeout is an error, not evidence of a missing receipt. See
[PostgreSQL isolation](https://www.postgresql.org/docs/15/transaction-iso.html).
Changing isolation cannot permit a partial commit; it can change snapshot
freshness or cause serialization failures and needs separate review.

The receipt table has a `(universe_id,operation_id)` primary key, Universe FK,
digest/acknowledgement/revision constraints, forced ownership RLS, and authenticated
SELECT/INSERT only (no UPDATE/DELETE). The private schema is excluded from the
browser Data API; only the reviewed RPC surface is exposed. These constraints
validate receipt rows; they do NOT independently require a receipt for arbitrary
raw SQL that changes a Universe. Authenticated SQL privileges support INVOKER
RPCs. Privileged/manual SQL, exposing private tables or adding another write API
could bypass the protocol and invalidate this conclusion. Guarded fixture
cleanup intentionally deletes exact test data and is not a production lifecycle.
No receipt pruning or asynchronous repair path exists in the reviewed sources.

[Supabase read replicas](https://supabase.com/docs/guides/platform/read-replicas)
use dedicated endpoints and support Data API GET; the load balancer routes
non-GET requests to Primary. The current gateway uses POST even for receipt and
metadata reads. There is no application replica-read path. Replica lag or reads
from different snapshots/endpoints can explain stale observations, not an
authoritative post-commit state lacking half of this transaction. This review
inspects source and documented platform semantics; it is not a new live audit of
dashboard routing, deployed function drift or external privileged writers.

## Reachable states and remaining gates

| State for the ORIGINAL operation | Reachable under this contract? |
| --- | --- |
| Not dispatched, or request has not acquired the Universe writer lock; receipt missing | Yes; no original mutation has committed. |
| Writer holds `FOR UPDATE` and is executing; recovery requests receipt | Recovery's `FOR SHARE` waits, or errors on timeout; it cannot expose a partial original commit. |
| Original commit succeeds, response is lost | Metadata/revision AND original receipt exist; this checkpoint already passed live. |
| Original commit succeeds, recovery observer withholds its receipt | Controlled client observation only; already live-passed, not genuine server absence. |
| Original commit succeeds, authoritative original receipt does not exist and is inserted later | Impossible through the supported RPC; gate closed as not applicable. |

**Server admission is not commit or writer-lock acquisition.** An original
request delayed before its `FOR UPDATE` can be overtaken by a receipt lookup
that obtains `FOR SHARE`, returns missing and releases its lock. The original
request may then execute and commit metadata AND receipt together, without any
client resend. This is a genuine missing-before-commit / later original commit
case, not receipt creation after a committed mutation. It remains an unverified
transport timing case; do not close it using this invariant or controlled tests.

Interruption/cancellation during SQL execution also remains live-unverified.
Actual cancellation before commit rolls back both writes; transport loss alone
does not establish server cancellation and can leave an original request running.
Neither timing case is implemented or claimed live-passed by this review.

The next recommended bounded activation checkpoint is **same-origin simultaneous
recovery contention and account/session changes during delayed recovery**.
Existing automated fencing/stale-peer checks are retained; broader live races
remain open. Delayed original execution, mid-SQL interruption, rich metadata,
files, migration and controlled activation remain separate gates.

Missing/unavailable receipt recovery remains conservative in
[the repository](../services/cloud-universe-repository.js) and
[workspace](../services/cloud-workspace.js): preserve original ID/journal/base
and exact cache scope, block dependent writes, never infer definite noncommit,
resend, replace IDs, clear unresolved journals or publish speculative state.
The atomicity conclusion gives no authorization to weaken that behavior.

## Validation and limits

[Schema source guards](../tests/cloud-schema.test.js) check write ordering,
success/replay paths, rethrown failures, shared receipt lock, the sole receipt
insertion site across migrations and lack of a separate asynchronous writer.
These are static review guards, not a PostgreSQL interpreter or live proof.
Existing gateway/recovery tests cover exact identities, blocked missing recovery,
no retries and same-receipt/idempotent acknowledgement.

[The rollback-only database suite](../tests/database/cloud-metadata.sql) now
asserts receipt existence immediately after a new-operation/no-op RPC return,
exact acknowledgement identity, and rollback of metadata/revision/receipt after
a successful RPC returns into an enclosing failed subtransaction. It introduces
no trigger or split write. The [generated SQL Editor artifact](../tests/database/cloud-metadata-sql-editor.sql)
is regenerated from those sources. These new SQL assertions are authored but
**not executed against PostgreSQL in this review**; no PostgreSQL runtime is
available on PATH. The runner refuses an already-installed schema and must not be
used to bypass that preflight on the real project. No live validation or fixture
is required to close an impossible post-commit gate by contract; future scratch
database execution would add regression evidence, not make this state reachable.

Review checks passed: 493 non-physics Node tests (including all 19 schema and
SQL-artifact checks), 58 physics tests, 16 Python coordinator/barrier tests, and
89 isolated mocked recovery browser checks. Tracked diff and new-document
whitespace checks passed. The SQL Editor artifact matches its generator exactly;
generation and source checks did not execute SQL. No production code, migration,
diagnostic behavior, backend setting or recovery policy changed. No live fixture,
commit, push, merge, deployment or cloud activation was performed.
