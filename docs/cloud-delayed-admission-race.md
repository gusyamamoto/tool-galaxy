# Original writer waiting for a shared Universe row lock

Branch: `feature/cloud-delayed-admission-race`. **LIVE-PROVED / CLOSED.** The
operator completed proofVersion-2 admission/missing/release/recovery, WRITER
reload and two idempotency repeats, authoritative confirmation, guarded server
retirement and exact browser-key removal. No fixture remains to reuse and no
further live run is required. **Production cloud mode remains disabled.**
The [isolated PostgreSQL 15 audit](cloud-delayed-admission-local-locklab.md)
reproduces the permanent-XID filter mismatch using the unchanged RPC, then
validates the corrected virtual-transaction bracket. The live actions and final
key-absence checks were performed and reported by the operator; Codex performed
only local development, isolated synthetic validation and evidence review.

## Completed live proof and retirement

Operator-reported closeout, 2026-10-15 America/Vancouver (coordinator proof
timestamp 2026-10-16 UTC):

| Boundary | Verified evidence |
| --- | --- |
| Original admission | Coordinator PROVED, then PASS, exit 0. Exact original HTTP command; same backend PID/virtual transaction blocked on the exact share holder; permanent writer XID legitimately null. |
| Missing-before-commit bracket | Real original-ID receipt missing; exact pending cache/base 0 and blocked writes; same holder/writer proof before and after. No receipt filtering or synthetic absence. |
| Completion | Only holder released; original HTTP completed; SAME validated original receipt recovered revision 1; no resend or replacement ID. |
| Recovery after reload | WRITER alone reloaded after PASS; same original receipt recovered at revision 1; two sequential repeat checks preserved revision/state without a second application or mutation call. |
| Authoritative state | Read-only verifier exit 0 and AUTHORITATIVE_DELAYED_ADMISSION_CONFIRMED; exact revision-1 metadata, exactly one original committed receipt, base 0/result 1, matching coordinator digest/full acknowledgement, replayed=false, no other receipts or relevant sessions/transactions. |
| Retirement | Final browser snapshots retained; WRITER then OBSERVER disposed retaining storage; fresh authoritative precheck passed; guarded cleanup removed one Universe, COMMIT and exit 0; independent absence check found all six counts zero and no retained holder/writer/harness session. |
| Browser retirement | Only the exact cache/marker keys removed; WRITER and OBSERVER each verified cache=null and marker=null. Forensic files retained. |

The original monitor incorrectly required `backend_xid IS NOT NULL`. Real
PostgreSQL 15.19 running the unchanged RPC reproduced a blocked writer with an
owned/granted exact tuple AccessExclusiveLock and Lock/transactionid wait, but
no assigned permanent XID: all other candidate predicates matched and writerCount
was zero. A local preassigned-XID control returned one. Proof version 2 instead
requires the owned virtual transaction and its exact holder-XID ShareLock wait;
both bracket proof objects must remain identical. Current-database matching was
also made explicit. This corrects the transaction identity without relaxing the
row, wait, blocker, original-command, missing-receipt or cache guards.

**The six-second admission window was not increased.** No production recovery,
RPC, migration, grant, transaction or lock semantics were altered. The successful
live run closes this bounded gate; earlier STOPPED attempts remain unproved and
retired. Evidence/support artifacts are classified in the
[closeout manifest](cloud-delayed-admission-closeout.md). Other activation gates,
including mid-SQL interruption and broader recovery/session contention, remain
separate; this closure does not authorize cloud activation.

## Architecture decision and exact lock boundary

This is a production-reachable pre-writer-lock-acquisition race. It does NOT
require a point before the writer has requested its lock. A normal coherent
read/receipt transaction can hold the shared row lock that delays the writer.
The coordinator extends that interval with an otherwise idle test transaction;
it changes neither RPC nor transaction semantics.

| Order | Session / action | Locks and authoritative state |
| --- | --- | --- |
| 1 | H: read exact disposable revision-0 Universe; verify original receipt missing; keep transaction open | `cosmifold_read_universe` holds `FOR SHARE` on the Universe row; no semantic changes. |
| 2 | W: ONE original browser POST invokes unchanged `cosmifold_commit_metadata` | Command validation/digest precede `SELECT ... FOR UPDATE`; writer waits on H before CAS, metadata changes or receipt insertion. |
| 3 | M: read-only administrative monitor | Exact database/relation/row `ctid`, granted heavyweight tuple `AccessExclusiveLock`, active commit query, waiting `transactionid`, owned virtual transaction and sole blocker H with an explicit wait on H's XID identify W. W's permanent XID may still be null. |
| 4 | WRITER diagnostic detaches its own await; W HTTP request remains open | Original journal/base/cache stay at 0. Existing repository recovery invokes the REAL original-ID receipt RPC. |
| 5 | R: receipt RPC takes `FOR SHARE`, returns genuinely missing | R is compatible with H. W has requested, but has NOT acquired, its exclusive row lock. M brackets this result with the same H/W identities and exact server revision 0 / zero receipts. |
| 6 | H: `ROLLBACK` only | Releases H. W obtains `FOR UPDATE`; unchanged RPC atomically commits metadata/revision/ORIGINAL receipt. |
| 7 | W's original HTTP response completes; client recovers | Detached response cannot publish. Receipt lookup validates ORIGINAL scope/ID/base/result/digest/full acknowledgement; authoritative read/cache advance to 1 once. Two repeats are idempotent. |

Both locking SELECTs take relation-level `RowShareLock`; those table locks are
compatible. **Row** `FOR SHARE` conflicts with row `FOR UPDATE`, but is compatible
with another row `FOR SHARE`. A table-level `SHARE` lock is NOT the holder used
here. After mutation starts, writer table `RowExclusiveLock` is also compatible
with readers' relation `RowShareLock`; row locks enforce this serialization.
See [PostgreSQL lock compatibility](https://www.postgresql.org/docs/15/explicit-locking.html).

Do not assume universal FIFO row locking: PostgreSQL's compatible `LockTupleShare`
path skips waiting when the tuple has shared lockers and no update/exclusive
row lock. The waiting updater's heavyweight tuple lock is separate from the
tuple's acquired row-lock state. See `heap_lock_tuple` in
[PostgreSQL 15](https://raw.githubusercontent.com/postgres/postgres/REL_15_STABLE/src/backend/access/heap/heapam.c)
and [PostgreSQL 18](https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/backend/access/heap/heapam.c).
Heavyweight wait arbitration is described separately in
[README.tuplock](https://raw.githubusercontent.com/postgres/postgres/REL_15_STABLE/src/backend/access/heap/README.tuplock).
With an exclusive holder, or once W owns `FOR UPDATE`, R instead waits/errors.
That alternative cannot earn missing-receipt PASS here.

The local sources establishing order are
[commit RPC](../supabase/migrations/202610120001_cloud_metadata.sql),
[receipt/read RPCs](../supabase/migrations/202610120001_cloud_metadata.sql), and
[existing repository reconciliation](../services/cloud-universe-repository.js).
The [atomic post-commit invariant](cloud-receipt-atomicity.md) is unchanged.

## Coordinator and proof controls

[The separate coordinator](../scripts/cloud-delayed-admission-harness.py) uses
two persistent `psql` sessions plus the isolated browser's CDP connection:

- H assumes the exact authenticated owner using transaction-local claims/role,
  calls only read/receipt RPCs, verifies exact empty metadata and missing receipt,
  and remains open. Local statement/lock timeouts are 3s/1s; idle transaction
  expiry is 12s. The holder does not invoke commit or change semantic data.
- M uses `default_transaction_read_only=on`, 2s statement/1s lock timeouts and
  stable monitor PID checks. It reads catalog/lock state and exact fixture data.
  There must be exactly ONE waiting writer on the fixture tuple, with a distinct
  backend PID/virtual transaction, active commit query and H as its sole blocker.
  W must own its granted virtual-XID lock and have an ungranted `ShareLock` on
  H's permanent XID in that same virtual transaction. Exact revision-0
  projection and zero Universe receipts are checked before and after missing.
- CDP verifies the original URL/POST body, original operation and journal, one
  semantic HTTP request and its eventual completion. It does not intercept,
  abort, reload, offline, fulfill or replay that request. Only after SQL proof
  may `detachDelayedWait` reject the diagnostic await as unknown; the underlying
  HTTP promise continues. This is deliberate client-wait detachment, not native
  network-failure or SQL-cancellation evidence.
- Recovery uses real gateway RPCs. This case contains NO missing synthesis,
  unavailable-receipt injection, visibility gate, alternate receipt ID, new
  receipt writer or mutation retry. The SQL-computed planned command digest is
  retained with the proof and compared to the later real receipt. The full
  acknowledgement is compared with the fixed original plan before acceptance.
- The coordinator must finish the missing proof and release within 6s after
  dispatch; original HTTP completion gets a further bounded 6s. Existing server
  timeouts are not increased. If network/DB timeouts prevent the sequence, the
  result is STOPPED/UNVERIFIED, never PASS. H is released on every exit; no fixture
  is automatically deleted. Database errors/credentials are not printed.

This identifies W through exact fixture row + the only matching waiting commit
backend + the only original browser command. PostgREST bound SQL parameters are
not assumed visible in `pg_stat_activity`; query text alone does not prove an
operation ID. Use an isolated fixture with no other actor touching it. Multiple
writers, uninspectable/truncated query text, changed PID/virtual transaction/query
start/blocker/state, a timeout or a prematurely released holder all fail the proof.

No backend object, migration, grant, server setting or production client changes
are needed. There is no generic SQL relay/RPC or browser SQL execution channel.
SQL is generated locally from validated UUIDs and escaped JSON data; SQL text
from the browser is never executed. Existing guarded cleanup is reused unchanged.

## Reviewed manual procedure

Reference procedure for a separately authorized future regression only. This
gate is closed; do not run it as part of closeout or reuse any retired identity.

1. **Before preparation**, ensure `psql` is available (`Get-Command psql`). An
   operator must configure a named libpq service, e.g. `cosmifold_dev_primary`,
   pointing to the intended DEVELOPMENT project's Primary using its normal TLS
   settings and administrative monitoring permissions. Use a direct connection
   or session-mode pooler, NOT a transaction-mode pooler or replica. Credentials
   stay in operator-managed libpq service/password files, never source, browser,
   command line or chat. The harness accepts a service NAME only, disables
   password prompts and does not install tools or create these files. See
   [libpq service configuration](https://www.postgresql.org/docs/15/libpq-pgservice.html).
   If this prerequisite is unavailable, leave live validation UNRUN.
2. Use [the isolated debug browser setup](cloud-inflight-recovery.md#l1-local-setup-and-single-disposable-preparation),
   loopback app origin and Chrome port 9222. Sign in normally at that origin.
   No normal cloud mode or real local Cosmos is involved.
   DevTools discovery connects directly to `http://127.0.0.1:9222/json` first;
   only a connection-refused error triggers one fallback to
   `http://[::1]:9222/json`. Proxy settings are bypassed for these literal
   loopback requests. Timeouts, HTTP errors, invalid JSON and role errors do not
   trigger fallback. Returned page WebSocket URLs accept IPv4 or compressed/full
   IPv6 loopback, with bracketed IPv6 HTTP Host headers. Keep the APP origin
   unchanged (`http://127.0.0.1:5500`); its storage scope is independent of the
   DevTools listener address. No Chrome restart or tab reload is required.
3. Open `/dev/cloud-recovery-diagnostic.html` twice at the EXACT same origin.
   Require **No Phase C fixture.** / **Ready; no requests made.** Label the tabs
   **WRITER** and **OBSERVER**. OBSERVER does not prepare or dispatch anything.
4. In WRITER choose **Real missing receipt while original writer waits for share
   holder**. Click **Create ONE new disposable Universe** ONCE. Require PREPARED
   at revision 0; retain displayed owner/Universe/original operation and exact
   cache/marker keys. Dispatch is disabled until the coordinator arms it.
5. From the repository root, print/review the bounded SQL without connecting:

   ```powershell
   python -B scripts/cloud-delayed-admission-harness.py --origin http://127.0.0.1:5500 --debug-port 9222 --print-sql
   ```

   This exits successfully with `-- PRINT ONLY: offline SQL/operator plan` and
   holder/read-only monitor SQL templates. It does not contact Chrome or
   PostgreSQL, inspect or change browser state, dispatch, acquire/release locks,
   or enter live finalization. It needs no prepared fixture or libpq service;
   the origin/debug-port arguments are retained for CLI compatibility and used
   only by `--run`. It emits no live STOPPED/PASS result.

   `<...>` placeholders represent the existing fixture's owner, Universe,
   original operation, exact revision-0 metadata and original command JSONB.
   The monitor's holder PID/XID `1` values are TEMPLATE examples. During `--run`,
   the coordinator derives validated fixture-specific SQL from the existing
   WRITER descriptor and real holder identities. Do not paste/run templates
   manually; there is no human timing step while the writer waits. A print-only
   attempt is safe to repeat and does not require replacement of the fixture.
6. After review, run exactly ONCE:

   ```powershell
   python -B scripts/cloud-delayed-admission-harness.py --origin http://127.0.0.1:5500 --debug-port 9222 --run --service cosmifold_dev_primary
   ```

   The coordinator opens only its holder/monitor SQL sessions, arms the existing
   diagnostic and sends ONE original browser command. Do not click dispatch,
   change Offline, close/reload tabs, alter Auth or operate the holder manually.
7. Require **PROVED** for the original HTTP command, waiting backend identity,
   genuine missing original receipt, exact pending cache/base 0 and blocked
   writes. Require subsequent **PASS** for holder-only release, original HTTP
   completion, SAME validated receipt recovery at revision 1 and two idempotent
   repeats without resend. Retain the printed safe proof JSON (scope, operation,
   holder PID/XID, writer PID/virtual transaction, nullable permanent writer XID,
   query start and digest). Neither receipt filtering nor a client
   timer alone can satisfy this gate.
8. After PASS, optionally reload WRITER ONLY, then click **Reopen ORIGINAL delayed
   operation with real receipt lookup**. Require the same revision-1 receipt/state;
   **Verify recovery does not apply twice** must preserve it. Never prepare or
   dispatch again. Report the live evidence before cleanup.

If STOPPED: retain identities/storage, do not rerun dispatch or declare success.
Failure finalization attempts holder rollback/close; the original HTTP transaction
may subsequently commit. A close failure can obscure the original proof error,
so neither release nor dispatch can be inferred from the old generic message.
Do not reload, recover or generate cleanup while the outcome is unestablished.
Use the read-only post-mortem below, retaining the original journal and tabs.
Do not use global backend cancellation, force deletion, marker editing or receipt
insertion to repair the run. A stopped run is not proof of the gate, even if
ordinary original-ID receipt recovery later succeeds.

## Read-only post-mortem reference for STOPPED attempts

There is no current retained live fixture. For a future separately reviewed
STOPPED attempt, these reference steps preserve its fixture. Do not run the coordinator, click a
diagnostic action, reload/close a tab, change Auth, recover, or generate cleanup.
Only the operator performs the following live reads. No new operation ID is
generated. An error or unexpected identity/state is a review stop, not a reason
to repair data, relax a guard, or retry the semantic command.

### 1. Capture storage and the fixed original plan, without diagnostic methods

In WRITER's DevTools Console, at the existing diagnostic page, evaluate this
expression once. It reads only this fixture's exact storage keys and page text;
the plan/cache validators are pure functions. It does not initialize Auth, call
`delayedDescriptor()`, invoke any gateway, or modify the page/storage.

```javascript
(() => {
  const markerKey = 'cosmifold:dev:cloud-recovery:v1';
  const markerText = localStorage.getItem(markerKey);
  const out = {
    capturedAt: new Date().toISOString(), origin: location.origin, role: window.name,
    markerKey, markerText, outputText: document.getElementById('output')?.textContent,
    pageBusy: typeof recoveryBusy === 'boolean' ? recoveryBusy : null
  };
  try {
    if (markerText === null) throw new Error('ORIGINAL_MARKER_MISSING');
    const m = cloudRecoveryPlan.marker(JSON.parse(markerText));
    if (m.case !== 'delayed-admission') throw new Error('WRONG_CASE');
    const cacheKey = `cosmifold:cloud-cache:v1:${m.scope.ownerUserId.toLowerCase()}:${m.scope.universeId.toLowerCase()}`;
    const cacheText = localStorage.getItem(cacheKey);
    out.cacheKey = cacheKey; out.cacheText = cacheText; out.marker = m;
    const command = cloudRecoveryPlan.command(m);
    out.expected = {
      scope: m.scope, operationId: m.operationId, command,
      metadata0: cloudRecoveryPlan.metadata(m, '0'),
      metadata1: cloudRecoveryPlan.metadata(m, '1'),
      ackStored: {...cloudRecoveryPlan.ack(m), replayed: false},
      admission: m.delayedAdmission || null
    };
    if (cacheText === null) throw new Error('ORIGINAL_CACHE_MISSING');
    const record = cosmifoldCloudCacheFormat.validate(JSON.parse(cacheText), m.scope);
    out.cacheSummary = {
      acknowledgedRevision: record.acknowledged?.revision,
      pending: record.pending !== null,
      pendingOperationId: record.pending?.command.operationId || null,
      pendingMatchesPrepared: record.pending !== null && cosmifoldCloudChanges.equal(record.pending.command, command)
    };
    out.stableRead = localStorage.getItem(markerKey) === markerText && localStorage.getItem(cacheKey) === cacheText;
  } catch (error) {
    out.inspectionError = error.code || error.message;
  }
  return JSON.stringify(out, null, 2);
})()
```

Copy the returned **string contents** into a local file named
`delayed-postmortem-writer.json`. Retain the raw `markerText`/`cacheText`; do not
edit or restore them. Record any existing Network-panel commit POST's request
body, terminal HTTP status/failure or pending indication, without replaying it.
An empty newly opened Network panel cannot prove that no request was sent.

Run the same read-only expression in OBSERVER and save its returned string as
`delayed-postmortem-observer.json`. The two same-origin tabs share localStorage;
seeing the fixture in OBSERVER does not mean it prepared/dispatched anything.
Require the retained owner/Universe/original operation to agree with the original
preparation evidence. `stableRead` must be true and `inspectionError` absent.
If not, retain the output and stop for review. A changed later snapshot can be
an original request completing; capture it without replacing the earlier bytes.

### 2. Read authoritative state, receipt/digest, and SQL sessions/locks

From the repository root in PowerShell, run the following **single read-only
block** only after step 1's identities and snapshot have been checked. It creates
no database objects and sends no semantic RPC. Input is the retained plan, encoded
as hex for safe psql parameter substitution; credentials stay in the libpq service.

The connection is read-only from startup. The transaction uses a consistent
repeatable-read snapshot, 3s statement/500ms lock/10s idle-transaction limits,
and `row_security=off` to **error instead of silently returning RLS-filtered
rows** when the configured operator cannot bypass RLS. It does not grant access.
Any permission/visibility/timeout error leaves the result unverified. Do not
change privileges or remove the read-only/visibility guards to get a result.

```powershell
$pmEvidence = Get-Content -Raw -LiteralPath .\delayed-postmortem-writer.json | ConvertFrom-Json
if ($pmEvidence.inspectionError -or $pmEvidence.stableRead -ne $true -or !$pmEvidence.expected -or $pmEvidence.role -ne 'cosmifold-inflight-writer' -or $pmEvidence.origin -ne 'http://127.0.0.1:5500') {
    throw 'STOP: retained WRITER evidence requires review.'
}
$pmJson = $pmEvidence.expected | ConvertTo-Json -Depth 100 -Compress
$pmHex = [System.BitConverter]::ToString([System.Text.Encoding]::UTF8.GetBytes($pmJson)).Replace('-', '')
@'
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='3s';
SET LOCAL lock_timeout='500ms';
SET LOCAL idle_in_transaction_session_timeout='10s';
SET LOCAL row_security=off;

SELECT jsonb_build_object(
 'observedAt',clock_timestamp(),'readOnly',current_setting('transaction_read_only'),
 'isolation',current_setting('transaction_isolation'),'role',current_user,
 'superuser',r.rolsuper,'bypassRLS',r.rolbypassrls,
 'canSeeAllActivity',r.rolsuper OR pg_has_role(current_user,'pg_read_all_stats','USAGE')
) FROM pg_roles r WHERE r.rolname=current_user;

WITH raw AS (
 SELECT convert_from(decode(:'evidence_hex','hex'),'UTF8')::jsonb AS d
), p AS (
 SELECT d,encode(sha256(convert_to((d->'command')::text,'UTF8')),'hex') AS digest FROM raw
), target AS (
 SELECT u.id FROM cosmifold_private.universes u CROSS JOIN p
 WHERE u.id=(p.d->'scope'->>'universeId')::uuid AND u.owner_id=(p.d->'scope'->>'ownerUserId')::uuid
), receipts AS (
 SELECT r.* FROM cosmifold_private.operation_receipts r JOIN target t ON t.id=r.universe_id
), state AS (
 SELECT p.*,(SELECT cosmifold_private.project_universe(t.id) FROM target t) AS metadata FROM p
)
SELECT jsonb_build_object(
 'observedAt',clock_timestamp(),'scope',s.d->'scope','operationId',s.d->>'operationId',
 'metadata',s.metadata,'exactMetadata0',coalesce(s.metadata=s.d->'metadata0',false),
 'exactMetadata1',coalesce(s.metadata=s.d->'metadata1',false),'expectedRequestDigest',s.digest,
 'receiptCount',(SELECT count(*) FROM receipts),
 'originalReceipt',(SELECT to_jsonb(r) FROM receipts r WHERE r.operation_id=(s.d->>'operationId')::uuid),
 'originalReceiptMatches',coalesce((SELECT r.request_digest=s.digest AND r.base_revision=0 AND r.resulting_revision=1
   AND r.acknowledgement=s.d->'ackStored' FROM receipts r WHERE r.operation_id=(s.d->>'operationId')::uuid),false),
 'otherReceipts',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.operation_id) FROM receipts r
   WHERE r.operation_id<>(s.d->>'operationId')::uuid),'[]'::jsonb)
) FROM state s;

WITH p AS (
 SELECT convert_from(decode(:'evidence_hex','hex'),'UTF8')::jsonb AS d
), candidates AS (
 SELECT a.* FROM pg_stat_activity a CROSS JOIN p
 WHERE a.datname=current_database() AND a.pid<>pg_backend_pid() AND (
   a.application_name='cosmifold-delayed-admission' OR a.query LIKE '%cosmifold_commit_metadata%'
   OR a.state LIKE 'idle in transaction%'
   OR a.pid IN ((p.d->'admission'->>'holderPid')::integer,(p.d->'admission'->>'writerPid')::integer)
   OR EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND l.relation IN
     ('cosmifold_private.universes'::regclass,'cosmifold_private.operation_receipts'::regclass))
 )
)
SELECT jsonb_build_object(
 'observedAt',clock_timestamp(),
 'harnessSessionCount',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
   AND pid<>pg_backend_pid() AND application_name='cosmifold-delayed-admission'),
 'candidates',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'pid',a.pid,'applicationName',a.application_name,'state',a.state,'xactStart',a.xact_start,
   'xid',a.backend_xid::text,'waitEventType',a.wait_event_type,'waitEvent',a.wait_event,
   'blockers',pg_blocking_pids(a.pid),'commitQuery',a.query LIKE '%cosmifold_commit_metadata%',
   'activityHidden',a.query IS NULL OR a.query='<insufficient privilege>',
   'locks',coalesce((SELECT jsonb_agg(jsonb_build_object('type',l.locktype,'mode',l.mode,'granted',l.granted,
     'relation',l.relation::regclass::text,'page',l.page,'tuple',l.tuple,'transactionId',l.transactionid::text))
     FROM pg_locks l WHERE l.pid=a.pid),'[]'::jsonb)
 ) ORDER BY a.pid) FROM candidates a),'[]'::jsonb)
);
ROLLBACK;
'@ | psql "service=cosmifold_dev_primary application_name=cosmifold-delayed-postmortem options='-c default_transaction_read_only=on -c statement_timeout=3000 -c lock_timeout=500 -c idle_in_transaction_session_timeout=10000'" --no-psqlrc --no-password --quiet --tuples-only --no-align --pset pager=off --set ON_ERROR_STOP=1 --set "evidence_hex=$pmHex" --file - | Tee-Object -FilePath .\delayed-postmortem-sql.txt
if ($LASTEXITCODE -ne 0) { throw 'STOP: read-only inspection failed; retain output for review.' }
```

This reads the private projection/tables with the existing administrative service;
it deliberately avoids the public read/receipt RPCs, which take `FOR SHARE` and
can join the row-lock schedule. Ordinary SELECTs still take short relation
`AccessShareLock`s; this is not a lock-free observation, but takes no row lock.
The explicit `ROLLBACK` ends only the newly opened inspection transaction.
Connection termination also ends that transaction on error.

The three JSON rows describe permissions, coherent committed state/receipts,
then current session/lock candidates. `canSeeAllActivity` must be true to draw
negative conclusions about other sessions. Candidate commit queries/table locks
can belong to other Universes; do not attribute them to this operation without
retained PID/XID evidence. Activity/locks are transient monitoring data, not a
historical snapshot or a transactionally coherent part of the metadata snapshot.
No active candidates plus no harness sessions is useful current quiescence
evidence, not proof that an earlier HTTP request was never sent.
The libpq service can override an environment-supplied application name; absence
of that application name alone is not proof of closure. The candidate list also
includes idle transactions and sessions locking either target relation regardless
of application name. Without retained PIDs/XIDs, unrelated candidates cannot be
conclusively attributed to this coordinator.

If the holder/monitor application sessions remain, a matching writer waits, or
visibility is insufficient, retain the results and stop for review; do not cancel
backends, release other sessions or infer non-commit from missing receipts. If a
second observation is needed, repeat only this bounded read-only block in a new
connection, retaining both timestamped outputs. Do not poll inside a long
repeatable-read transaction: it cannot observe later committed state.

### 3. Compare the evidence before choosing any next action

| Observation | Meaning / allowed conclusion |
| --- | --- |
| `exactMetadata1=true`, exactly one receipt, `originalReceiptMatches=true`, `otherReceipts=[]` | A: original command committed with exact state/digest/full stored acknowledgement. The stored receipt has `replayed=false`; the receipt API returns the same acknowledgement with `replayed=true`. |
| Exact original pending command in cache at acknowledged revision `0`, plus A | Server commit and unacknowledged original client journal coexist. This is useful partial recovery evidence; do not run recovery yet. |
| `exactMetadata0=true`, receipt count `0`, original receipt null | B: no committed operation is visible at the snapshot. Does NOT prove no dispatch, rollback, cancellation, or future non-commit. Check original HTTP terminal evidence and session/lock visibility. |
| Revision `0`/no receipt plus a waiting/active candidate or unfinished original HTTP | Original may still be in flight. Retain state and use only a later bounded read-only snapshot if needed. |
| Cache at `0` with `pending=null` and marker `prepared` or `delayed-ready` | No journal currently proves dispatch. This alone cannot establish whether a click/preflight was attempted. |
| Cache at `1`/pending null plus exact committed original | Original acknowledgement may have published before failure/disposal. Not the retained-pending checkpoint; do not edit it back to `0`. |
| Changed owner/ID, bad cache/command, other receipts, unexpected metadata/revision, receipt/digest/ack mismatch, missing data, inconsistent visibility, SQL error | C: ambiguous or unsafe. Retain all bytes and stop for review. |

The receipt primary key prevents two committed receipt rows for the SAME
Universe/operation ID. `otherReceipts=[]` excludes other committed receipt IDs
visible for this Universe; it does not prove that no duplicate same-ID HTTP
attempt or uncommitted replacement request ever existed. Only retained network
evidence can additionally establish request counts; it cannot be recreated by
replaying anything.

No PROVED means the live bracketing gate was not established. A retained
`delayedAdmission` candidate and `delayedMissing=true` are useful evidence but
cannot retroactively prove the second SQL bracket, same waiting transaction,
timely holder release or absence of early publication. A committed fixture cannot
be reused for a new revision-0 missing-receipt timing proof. A fresh fixture will
eventually be necessary for that gate if this original committed or the retained
setup is no longer usable; do not create it during this post-mortem. If evidence
instead establishes no dispatch and an unchanged prepared fixture, review whether
it can be retained before authorizing any future run. Recovery/cleanup require a
separate decision after outcome, journal integrity and quiescence are established.

### Failure diagnostics for future attempts (do not rerun this attempt)

The original generic result was a catch-all for unexpected Python exceptions,
including HTTP/CDP transport, decoding, missing dict keys, subprocess I/O and
holder-close failures. Named `Unverified` proof failures ordinarily printed their
own condition codes. Raw PostgreSQL stderr, Python messages/locals and browser
exception descriptions were discarded; no failure-stage/proof JSON was retained.
In particular, coordinator-finally holder close could mask a named proof failure.

The harness now additionally emits a sanitized `DIAGNOSTIC:` JSON line on failure
with last checkpoint, exception type/location and chained condition codes, validated
scope/original ID, received holder/monitor identities, dispatch-attempt and observed
HTTP counts, candidate admission identities/digest, last typed SQL facts and cleanup
outcomes where available. Dispatch attempted means only that the click was tried;
HTTP observed/validated does not itself prove SQL commit. Holder setup completed
records successful setup, not perpetual holder liveness. No new browser/database
state/receipt API calls or semantic mutations are added for this report. On a
browser evaluation error, it now reads only the exception object's own properties
to retain an allowlisted diagnostic `code`; getters, descriptions and messages
are excluded. `psql` uses `VERBOSITY=sqlstate`, and only a bounded SQLSTATE token,
process exit code and sanitized stdout-reader failure are retained on SQL failure.
A cleanup failure retains the first
proof error and does not prevent trying to close the remaining resources on an
already failed run. Raw messages, SQL, command bodies, auth data and arbitrary SQL
JSON are excluded. This improvement cannot reconstruct evidence lost in the attempt
that has already exited.

Earlier failures are historical: the first generic STOPPED/Case-B attempt had
unknown historical transmission and was retired; an IPv6-only discovery refusal
was proven to precede SQL/dispatch; the later admission-expiry attempt sent one
original POST, subsequently committed (Case A), and was also retired. The
post-mortems did not retroactively prove admission. Only the later fresh
proofVersion-2 attempt earned the complete live proof and retirement recorded
above. No old Universe, operation or browser storage survives for reuse.

The attempt-specific post-mortem/retirement tools and original procedure archive
remain local forensic evidence, not reusable cleanup entry points. See the
[artifact classification](cloud-delayed-admission-closeout.md#artifact-classification).
Do not execute those retired-identity scripts or interpret their historical
pending-state instructions as current work.

## Guarded cleanup reference

Completed for this gate. These are reference requirements for a future separately
reviewed fixture, not instructions to run cleanup again. The successful attempt
used an additional bounded read-only precheck, hash-bound guarded transaction and
independent six-table absence check before exact key removal.

1. Confirm the coordinator has exited and its holder/monitor sessions are closed.
   The original HTTP request must have settled; do not race cleanup with it.
2. In WRITER choose **Inspect exact fixture; generate guarded cleanup SQL**. It
   reads actual server state/receipt and requires the exact original plan. On
   PASS this is revision 1 with exactly one original receipt/digest. Any mismatch
   stops generation; do not bypass guards.
3. Dispose BOTH diagnostic tabs, retaining storage.
4. Run the ENTIRE generated guarded Phase C cleanup transaction in the intended
   project's SQL Editor. Require **`test_universes_removed = 1`**, no errors.
   This deletes only the exact disposable Universe/metadata/receipt, not Auth
   users or real local data. On guard failure, stop for review.
5. Only after server success remove the exact printed temporary cloud-cache key
   and `cosmifold:dev:cloud-recovery:v1` at this origin. Verify both are null.
   Refresh WRITER: require **No Phase C fixture.** / **Ready; no requests made.**
   Close both tabs and the isolated browser. Do not clear all storage.

## Automated evidence and remaining limits

Node tests cover genuine model missing-before-commit, retained bytes/ID/base,
blocked writes, reload, late response fencing, receipt digest/ack validation,
original-ID recovery, repeat idempotency, account/disposal fencing and marker
compatibility. Pure Python tests cover generated SQL, authoritative proof guards,
ordering, sole writer/blocker correlation, bounded failure and holder release.
The actual CDP coordinator is also exercised with real isolated browser tabs and
LOCAL mock HTTP delay plus mock SQL observations. These do NOT execute PostgreSQL
locks or prove Supabase admission. Separate isolated PostgreSQL 15 observations
validated the real predicates; the operator then established the live bracket
and complete lifecycle. Earlier STOPPED attempts alone establish neither.

Print-only regression coverage invokes the actual CLI with network connections
and child-process creation forbidden. Direct CLI tests also guard SQL sessions,
CDP setup/evaluation, descriptor inspection, semantic dispatch and live cleanup;
they verify successful repeatable SQL/plan output without a fixture/service and
no live STOPPED/PASS result, including when the offline printer fails. Focused
verification after the print-only fix: **13 delayed-harness Python tests**,
**9 native-harness Python tests** and **31 recovery Node tests** passed without
contacting the live browser or PostgreSQL/Supabase.

Forensic diagnostics and read-only capture verification: **18 delayed-harness
Python tests**, **9 native-harness Python tests** and **31 recovery Node tests**
passed locally. The documented console capture runs against real pure plan/cache
modules with network, gateway, storage-write and operation-ID-allocation traps.
Documented PowerShell blocks passed syntax parsing without execution. Post-mortem
SQL was reviewed but not executed or compiled against a live database.

The subsequent diagnostic-boundary change passed **24 delayed-harness Python
tests**, including SQLSTATE/reader-error retention, redaction and allowlisted
browser own-property inspection. Successful browser evaluations add no diagnostic
roundtrip. No production RPC, transaction, role/grant or lock semantics changed.

Earlier implementation checkpoint: **499 non-physics Node tests** (including 31
focused recovery tests), **58 physics tests**, **25 Python tests** (nine new
delayed-coordinator checks), **105 isolated recovery browser checks** and **94
two-origin concurrency browser checks** passed. Tracked diff and new-file
whitespace checks passed. No PostgreSQL/psql runtime was available on that earlier
environment's PATH; Codex executed no generated SQL or live Supabase request.
Existing native-response, controlled-visibility, Offline and lost-reply cases
remain covered. Keep `tests/__pycache__/` out of any future commit.

This completed checkpoint proves safe recovery for the tested schedule in which
a production-shaped shared read lock delays an admitted original writer. It does NOT prove cancellation after
semantic SQL starts, real network-loss survival of the same server transaction,
post-commit receipt absence (impossible by contract), arbitrary lock queue
schedules, all live session/multi-tab/quota/performance timing, cloud files,
migration or activation. No further admission run or cleanup is required. Live simultaneous recovery
contention/session changes remain the next recommended bounded checkpoint;
mid-SQL interruption remains separate. Cloud activation is still disabled.
