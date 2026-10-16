# Delayed-admission branch closeout

Branch: `feature/cloud-delayed-admission-race`.
Status: **LIVE-PROVED / CLOSED**, including complete guarded retirement.
The [architecture/procedure](cloud-delayed-admission-race.md) records the bounded
proof; the [PostgreSQL 15 audit](cloud-delayed-admission-local-locklab.md) records
the reproduced monitor mismatch and correction. No further live test, fixture,
recovery or cleanup is needed. Production cloud activation remains disabled.

## Completed evidence

The operator reported coordinator PROVED/PASS and exit 0 with proofVersion 2:
the exact original HTTP command and the same writer PID/owned virtual transaction
were blocked on the exact holder-XID wait before commit. The permanent writer XID
was legitimately null. The real original receipt was missing across the required
bracket, with the exact pending cache/base 0 and writes blocked. Only holder
release allowed completion; the SAME original validated receipt recovered
revision 1 without resend or replacement operation ID.

WRITER-only reload and two sequential repeats remained idempotent. Authoritative
read-only confirmation passed with exact revision-1 metadata, one original
committed receipt, base 0/result 1, coordinator digest/full acknowledgement match,
replayed=false, no other receipts and no relevant retained transactions/sessions.
The saved successful transcript, authoritative result, cleanup COMMIT/exit-0 log
and independent six-zero-count absence log were also inspected locally during
closeout. Browser final-key absence is operator-reported, not a new CDP read.

Final snapshots were retained, WRITER then OBSERVER disposed retaining storage,
the fresh read-only precheck passed, guarded cleanup removed exactly one
Universe and committed, and independent absence passed for all six tables with
no old holder/writer/harness session. Exact guarded storage removal succeeded;
both tabs verified cache=null and marker=null. All earlier STOPPED fixtures are
also retired and remain historically unproved.

The original `backend_xid IS NOT NULL` filter excluded a valid blocked writer.
Real isolated PostgreSQL 15.19 with the unchanged migration/RPC reproduced zero
candidates despite all other predicates matching; a local preassigned-XID control
matched. Proof version 2 requires owned virtual transaction identity and an exact
holder-XID ShareLock wait, with stable proof objects on both sides of missing.
Current-database matching is explicit. The six-second window was not increased,
safety predicates were not weakened, and production recovery/RPC/transaction/lock
semantics were not changed.

## Artifact classification

No pre-existing file was deleted. Narrow `.gitignore` rules preserve the local
files while keeping evidence and generated retired-identity code out of the
proposed commit. Ignore rules are not deletion. Never force-add these artifacts
to satisfy a reusable test or execute them against a retired fixture.

### Permanent implementation, documentation and tests

The proposed commit contains exactly these paths:

```text
.gitignore
dev/cloud-recovery-diagnostic.html
dev/cloud-recovery-diagnostic.js
dev/cloud-recovery-page.js
dev/cloud-recovery-plan.js
docs/cloud-activation-gates.md
docs/cloud-delayed-admission-closeout.md
docs/cloud-delayed-admission-local-locklab.md
docs/cloud-delayed-admission-race.md
docs/cloud-inflight-recovery.md
docs/cloud-receipt-atomicity.md
docs/cloud-uncertain-recovery.md
scripts/cloud-delayed-admission-harness.py
scripts/cloud-delayed-admission-local-locklab.py
scripts/cloud-inflight-harness.py
tests/browser-check.py
tests/cloud-recovery.test.js
tests/cloud_delayed_admission_test.py
tests/cloud_inflight_harness_test.py
tests/cloud_recovery_browser.py
```

Reusable runtime code contains no live attempt owner/Universe/operation/PID/XID,
digest or user-specific temporary path. The locklab and tests use synthetic UUIDs
only. Normal app services, persistence, migrations/RPCs, grants and activation
configuration are unchanged. Shared native changes are limited to strict literal
loopback IPv4/IPv6 discovery and bracketed IPv6 WebSocket Host formatting.

### Retained local forensic evidence and attempt-bound support

Preserve without staging:

- Root `delayed-admission-*.txt`, `*.json`, `*.jsonl`: coordinator transcripts,
  browser captures, SQL confirmation/precheck/cleanup/absence results and local
  PostgreSQL raw observations/environment provenance.
- Root `delayed-postmortem-*`: the earlier retired attempt's snapshots, SQL
  results and exact cleanup artifact. These are never live fixture inputs now.
- Root `delayed-admission-*.sql` and `*.js`: the reviewed per-attempt cleanup,
  absence and exact-storage-removal artifacts. Their guards/hashes retain value
  as evidence; their retired identities make them unsuitable reusable commands.
- `delayed-admission-closeout-original-procedure.md`: byte-preserved pre-closeout
  procedure, archived before removing stale retired-attempt execution steps from
  the permanent procedure. It is historical evidence, not current instructions.
- `docs/cloud-delayed-admission-{expired-postmortem,case-a-retirement,vxid-retirement}.md`:
  historical attempt-specific procedures, including their then-pending language.
- `scripts/cloud-delayed-admission-{expired-postmortem,vxid-confirm,vxid-retire}.ps1`:
  hash/identity-bound one-off operator tools, preserved byte-for-byte. Their real
  identities are intentional forensic bindings, not reusable runtime defaults.
- `tests/cloud_delayed_admission_{expired_postmortem,vxid_confirmation,vxid_retirement}_test.py`:
  local mocked checks for those one-off tools/artifacts. The expired post-mortem
  test was moved intact out of the reusable suite, retaining its coverage while
  removing a clean-checkout dependency on an excluded script.
- The stopped local locklab clusters and their server logs remain under the
  recorded OS temporary paths. Raw observations remain preserved in root JSONL.

Original successful proof/authoritative logs and all pre-existing root evidence,
one-off operator scripts and vxid tests were hash-checked unchanged at closeout.
The final user request also records exact browser-key absence; no browser access
was performed to repeat that live verification.

### Genuinely disposable generated material, retained this turn

- `tests/__pycache__/` and any `scripts/__pycache__/` bytecode.
- The re-downloadable portable PostgreSQL ZIP/unpacked binary copy in its
  recorded temporary directory; these are not repository dependencies.
- Fresh isolated browser/unit-test temporary profiles and synthetic inputs are
  owned by their test runners and cleaned normally. They are separate from the
  operator's port-9222 profile and retained forensic directories.

No manual removal of pre-existing disposable material or forensic evidence was
performed. A later deletion decision needs separate review of retained evidence.

## Final local validation

All checks below passed without accessing Supabase/application data:

| Check | Result |
| --- | --- |
| Full repository Node suite: `node --test (rg --files tests -g '*.test.js')` | PASS, including 33 recovery tests and the physics suite. |
| Reusable delayed-admission tests | 32 passed. The 33rd pre-closeout test was moved intact to the retained attempt-specific suite below. |
| Native harness tests | 17 passed. |
| Local relay/barrier tests | 7 passed; synthetic loopback HTTP only. |
| Retained expired post-mortem / vxid confirmation / vxid retirement tests | 1 + 1 + 3 passed; psql fully mocked, including failure refusal and isolated browser-storage guards. |
| Isolated mocked recovery browser suite | 105 checks passed; new headless temporary profile/local HTTP, fake Auth/RPC and SQL observations; no Supabase/CDN request or live SQL. |
| JavaScript/Python/PowerShell syntax, documented PowerShell blocks | PASS; Python compile-in-memory with no bytecode, PowerShell parse-only. |
| Tracked and proposed untracked source whitespace | PASS. |
| Clean proposed checkout without forensic artifacts | Reusable delayed/native tests pass; permanent tests do not require excluded operator scripts. |
| Source/diff review | No production behavior/activation change, weakened guard, real attempt identity in reusable runtime, or accidental credential/body/debug log. |

Final local closeout did not repeat the PostgreSQL locklab or live coordinator;
the existing real PostgreSQL observations and operator live proof are retained.
The runtime gate and cleanup success are operator evidence, not inferred from
unit mocks. No commit, push, merge, deployment or cloud activation was performed.

## Review and remaining scope

Review/stage only the permanent path list above. The ignored files remain on
disk and can be reviewed separately; they are not proposed PR contents. Browser
Auth/local Cosmos, storage v5 and Backup v1 retain their current behavior.
Mid-SQL interruption/cancellation, broader simultaneous recovery/session races,
files, migration and activation remain separate gates. This branch has no
remaining delayed-admission proof/retirement blocker and needs no new fixture.
