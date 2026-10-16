# Local PostgreSQL 15 admission monitor validation

This repository procedure explicitly supports a separately isolated, disposable
LOCAL validation using `scripts/cloud-delayed-admission-local-locklab.py`.
It does not authorize a live Cosmifold/Supabase fixture or coordinator attempt.

The script accepts only a PostgreSQL 15 binary directory and NEW output filename.
It creates its own temporary cluster, binds only IPv4 loopback on a newly chosen
port, verifies its exact data directory and version before creating anything,
and removes inherited libpq service/password/routing settings. It accepts no
DSN, service, host, existing data directory or remote database. It installs no
Windows service. Its processes are hidden on Windows.

Inside ONLY that new cluster it creates synthetic Auth roles/functions, applies
the unchanged migration and uses fixed synthetic test UUIDs. No retained browser
snapshot or live operation identity is used. It runs the actual holder SQL,
actual read/receipt/commit RPCs and current monitor SQL with independent local
psql sessions. Both unassigned-XID and preassigned-XID controls are tested. The
preassignment is a local control, never a change to the production RPC/dispatch.

JSONL evidence captures unfiltered activity/query/lock/blocker/tuple facts before
dispatch, during waiting, across a real missing receipt, after holder release,
and after commit. Queries and command data are synthetic; no Auth token exists.
On success or failure the script closes its sessions and stops only its own new
cluster; its directory and logs remain retained for review. Existing output
files are refused. It never opens Chrome/CDP or reads a libpq service file.

For observation-only comparison, run from the repository root, substituting a
reviewed PostgreSQL 15 binary path. The legacy non-null-XID filter is also
executed as a counterfactual against the same real blocked writer:

```powershell
python -B scripts/cloud-delayed-admission-local-locklab.py --pg-bin '<PG15_BIN_DIRECTORY>' --output delayed-admission-local-pg15-before.jsonl
```

After a monitor correction, use a NEW file and require the current admission
validator to accept the same writer transaction before/after the missing RPC:

```powershell
python -B scripts/cloud-delayed-admission-local-locklab.py --pg-bin '<PG15_BIN_DIRECTORY>' --output delayed-admission-local-pg15-after.jsonl --expect-current-admission
```

These commands never invoke the live coordinator. Review the script and results
before considering any separately authorized live attempt. Neither a local PASS
nor a source audit grants a live delayed-admission gate PASS.

## Predicate audit and real observations, 2026-10-15

Only PostgreSQL 18 was initially installed. Official EDB portable PostgreSQL
15.19 binaries were downloaded into a NEW temporary directory, without an
installer or service registration. The source URL, archive size/SHA-256 and
binary directory are retained in `delayed-admission-local-pg15-environment.json`.
The experiment verifies `server_version_num=150019` and its exact new data
directory before any schema/data operation. It uses the unchanged migration
and actual RPCs; only the synthetic local Auth bootstrap substitutes for Supabase.

Evidence in the repository root:

- `delayed-admission-local-pg15-before.jsonl`: initial runner startup failure.
  Windows server children inherited captured pg_ctl pipes. Its own verified
  local cluster was stopped; no lock observations were claimed. The runner now
  directs pg_ctl output to DEVNULL; the server retains its own log.
- `delayed-admission-local-pg15-before-02.jsonl`: successful PRE-FIX reproduction.
- `delayed-admission-local-pg15-after-01.jsonl`: successful corrected SQL/proof
  validation, including eighteen negative predicate checks.
- `delayed-admission-local-pg15-after-02.jsonl`: final runner validation, also
  explicitly executing the legacy non-null-XID counterfactual on both controls.

Each successful file retains the cluster directory, full synthetic queries,
raw pg_locks rows, unfiltered activity for the known holder/writer PIDs, blockers,
database/relation/CTID, wall-clock timestamps and (after correction) elapsed
times. Both SQL sessions' full transition is recorded across dispatch, blocking,
missing receipt, holder release, assigned XID and commit. No live identity,
browser storage, token or service is read. All temporary clusters are stopped
and their files retained; none is an installed PostgreSQL service.

| Predicate | PostgreSQL 15 observation / conclusion |
| --- | --- |
| Exact tuple | Visible Universe CTID `(0,1)` matched writer lock page `0`, tuple `1`, relation OID `16407`, database OID `5` in the pre-fix run. The holder prevented update/CTID replacement while the writer waited. OIDs are local examples, never live constants. |
| Database | pg_locks is cluster-wide; relation OID/CTID alone is incomplete identity. Corrected SQL also requires the current database and activity datid to match. |
| Lock type/mode | Writer owned a heavyweight `tuple` / `AccessExclusiveLock`. This is arbitration for acquiring the row lock, not proof that FOR UPDATE was already acquired. |
| Granted | That heavyweight tuple lock was granted=true while the writer waited on the holder's transaction. Requiring an ungranted tuple lock would reject this first waiter. |
| Activity state | Writer was `active`; holder was `idle in transaction`. |
| Wait type/event | Writer was `Lock` / `transactionid`. Its ungranted `transactionid` lock had mode `ShareLock` and targeted holder XID `733`. |
| backend_xid | **NULL for the real blocked RPC without preassignment. This alone excluded it from the old query.** All other old candidate predicates matched. After holder release, the original RPC acquired an XID and committed normally. |
| Assigned-XID control | Calling pg_current_xact_id ONLY in the local writer control before invoking the unchanged RPC assigned XID `739`; the old monitor then returned one writer. No such preassignment was added to the live path. |
| Virtual transaction | Unassigned-XID writer owned virtual-XID `6/3`, with a granted ExclusiveLock on that virtual ID; its tuple and holder-XID wait locks had that same virtualtransaction. This identifies the transaction before permanent XID allocation. |
| Query text | The local session's top-level query contained the actual cosmifold_commit_metadata call. Live PostgREST text may be wrapped/truncated or hidden; retain that predicate and STOP if it cannot be established. This local run does not simulate PostgREST networking. |
| Holder correlation | pg_blocking_pids(writer) contained exactly the holder PID. Corrected SQL additionally verifies the same virtual transaction's ungranted ShareLock on that exact holder XID. |
| Missing bracket | Independent real receipt RPC returned missing while exact revision 0 / zero receipts and the same holder PID/XID and writer PID/virtual transaction/query start remained visible before/after. |
| Release/commit | Only holder rollback released the writer. The unchanged RPC returned its original committed acknowledgement, then its transaction committed revision 1 with one receipt. |

The pre-fix unassigned writer was PID `8824`, holder PID `28216`, holder XID
`733`: writerCount was zero. The assigned control was writer PID `30704`, holder
PID `10312`, holder XID `738`, writer XID `739`: writerCount was one. These are
historical LOCAL process identities from a stopped cluster, never live targets.

In the first corrected run the unassigned writer was PID `28156`, virtual ID
`5/3`, xid=null, sole holder blocker `22948`. The monitor returned exactly one
writer on both sides of the missing result, separated by about 15ms locally.
The assigned control also returned one. Eighteen negative SQL queries rejected
wrong database, tuple, mode, grant state, activity state, wait event, RPC name,
owned virtual transaction and holder-XID wait (nine per control).

Source agreement: PostgreSQL 15's
[heap_lock_tuple](https://raw.githubusercontent.com/postgres/postgres/REL_15_STABLE/src/backend/access/heap/heapam.c)
acquires the heavyweight tuple lock and waits for the conflicting transaction
before the later GetCurrentTransactionId used to record the acquired row lock.
[pg_locks documentation](https://www.postgresql.org/docs/15/view-pg-locks.html)
distinguishes virtual transaction locks from permanent XIDs assigned on demand.
The observed null is valid state, not hidden statistics in this experiment.

## Correction and proof boundary

The monitor retains the exact tuple/mode/grant/activity/wait/RPC filters, removes
the invalid non-null permanent-XID requirement, and adds current-database,
owned-virtual-XID-lock and exact-holder-XID-wait correlations. The proof is now
version 2 with a mandatory writerVirtualXid and nullable writerXid. Both bracket
proof objects must remain identical, including PID, virtual transaction, query
start, holder PID/XID, any assigned writer XID, scope/operation and digest.
Malformed/missing virtual IDs, changed transaction/query start, multiple
candidates, wrong blockers and old proof schemas remain rejected. The browser
diagnostic's pure proof validator uses that same version-2 shape. Production
recovery, RPCs, migrations, dispatch and cloud activation are untouched.

The six-second clock still begins after the dispatch click returns, BEFORE the
async diagnostic's final preflight and the POST necessarily reach PostgreSQL.
ARM and dispatch preflight round trips can consume holder lifetime/window; probe
queries, CDP drains and scheduling also consume it. Each SQL query is bounded,
but the deadline is checked around calls rather than interrupting them. The
12-second holder idle timeout still starts before browser arming. These are
unchanged conservative STOP conditions, not evidence supporting more time.

This is a definite, reproduced monitor bug and the leading explanation for the
retired live run. That run did not retain raw candidate facts, so its exact
backend_xid and admission time cannot be reconstructed retrospectively. Transit,
queueing or scheduling delay cannot be excluded as additional contributors; the
local experiment is not a cloud latency measurement. No deadline was increased.

## Completed live follow-up

The operator subsequently completed the corrected proofVersion-2 live run:
PROVED/PASS and exit 0, legitimately null permanent writer XID, stable owned
virtual transaction and exact holder-XID wait across the real missing-receipt
bracket. Holder-only release allowed the original request to complete and the
same original validated receipt to recover revision 1 without resend. WRITER
reload and two repeat recovery checks remained idempotent. Authoritative
confirmation and guarded cleanup passed; independent absence found all six
counts zero and both tabs verified exact cache/marker keys null.

The delayed-admission gate is **LIVE-PROVED / CLOSED**. Earlier STOPPED attempts
remain unproved, all live fixtures are retired, and this audit grants no new run.
The six-second deadline and production recovery/RPC/lock semantics were not
changed. Local evidence and one-off tools are retained but excluded from the
commit as described in the [closeout manifest](cloud-delayed-admission-closeout.md).
Cloud activation and separate open recovery gates remain unchanged.
