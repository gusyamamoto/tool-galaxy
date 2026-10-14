# Committed original receipt: controlled missing, then visible

This inactive, loopback-only extension reuses the Phase C diagnostic and the
native-response interruption harness. Normal Cosmifold remains browser-local.
No production service, repository, cache, Auth, SQL/RPC, grant, storage v5,
Backup v1, files, hierarchy, layout or physics behavior changes.

**Status: operator-reported manual live validation PASSED; guarded cleanup complete
(2026-10-14). Normal cloud activation remains blocked.**
Review this bounded procedure before any new run. Never reuse a cleaned fixture.

## Completed live checkpoint

The operator used the isolated Chrome debug profile on port 9222 with same-origin
WRITER and OBSERVER tabs. Only WRITER prepared ONE disposable Universe; OBSERVER
neither prepared nor dispatched. The existing native harness ran exactly once.
OBSERVER independently saw the ORIGINAL receipt and exact authoritative revision-1
state before native response failure, while WRITER's original journal/cache was
still at revision 0. Dependent writes stayed blocked; no semantic resend occurred.

The harness `--reconnect` restored WRITER transport only, with no RPC, mutation or
reload. After WRITER-only reload, recovery verified the real underlying original
receipt and exact revision-1 state, then deliberately withheld receipt visibility.
This was a controlled missing observation, NOT a real server-missing result.
The same original journal/operation ID and exact revision-0 cache survived this
check and another WRITER reload/check. There was no resend, replacement ID,
journal deletion, speculative publication or dependent write.

**Restore receipt visibility only** changed only visibility control: journal/cache
remained at revision 0 and no mutation or acknowledgement was applied. Reopening
the SAME ORIGINAL operation then recovered its SAME validated original receipt
at revision 1, acknowledged once. Two repeat-recovery checks preserved the same
revision/state without a second semantic application or mutation call.

The operator generated guarded Phase C cleanup SQL, disposed BOTH diagnostics,
and ran the full guarded transaction: `test_universes_removed = 1`. Only the exact
temporary cloud-cache and recovery marker keys were removed. The final diagnostic
reported **No Phase C fixture.** / **Ready; no requests made.** This is
operator-reported live evidence; Codex did not execute live requests or SQL.

This closes safe recovery across controlled receipt unavailability AFTER a real,
independently verified original commit. It does not prove natural database
replication/visibility delay, a genuinely absent server receipt created later,
or interruption/cancellation midway through SQL execution. Those timing cases
remain UNVERIFIED; broader live recovery contention/session races remain open.

## Exact proof and limits

The deployed commit RPC atomically stores metadata, revision and its receipt.
Once a second HTTP transaction sees the original receipt/exact revision 1, a
normal receipt lookup should also find it. We do not describe PostgreSQL as
eventually consistent or claim a real server missing response after that proof.

This case first uses the already-reviewed native harness: ONE original mutation
commits; OBSERVER independently proves its receipt/exact authoritative state;
WRITER's successful native response is failed before SDK acceptance, preserving
the original journal/cache at revision 0. No successful reply is fabricated.

After reconnect/reload, only the recovering diagnostic's receipt-observation
wrapper is controlled. It calls the real receipt RPC using the ORIGINAL scope
and operation ID, checks every acknowledgement field against the planned command
and checks the digest against the independently observed original receipt. It
also reads and verifies exact authoritative revision-1 metadata. Only then may
it withhold that receipt and return `{status:'missing', acknowledgement:null}`
to the unchanged recovery implementation. The UI explicitly calls this a
**controlled missing observation**, never a server-reported missing receipt.

Thus the test proves the client stays blocked even though an original commit is
known independently, when its recovery observer cannot yet confirm that receipt.
A later explicit release restores observation of the SAME real receipt. It
does not execute a mutation, clear a journal or advance a cache. Reopening then
uses normal workspace/repository recovery and authoritative reads.

Missing, unavailable, wrong-scope, altered-acknowledgement, altered-digest or
changed-state evidence cannot earn a controlled-missing PASS. A dev marker alone
does not substitute for real underlying receipt/state checks on each lookup.
Direct server inspection and guarded cleanup always bypass the visibility gate.

This does NOT prove natural receipt creation after an initially missing server
lookup, replication lag, cancellation/interruption during SQL execution, every
proxy timeout, or arbitrary account/multi-tab/quota timing. Those remain distinct
limits/gates. Receipt withholding is deliberate development failure injection,
not backend behavior and not production sync activation.

## Durable control and fencing

Only case `late-receipt` adds this independently versioned development control
to the existing `cosmifold:dev:cloud-recovery:v1` marker:

```json
{"visibility":{"visibilityVersion":1,"state":"withheld"}}
```

States are `withheld` -> `observed-missing` -> `released`. Unsupported shapes,
unexpected extra fields, or non-withheld states without native admission and
transport evidence are rejected. Existing cases have no visibility field and
retain their former behavior. Reload never automatically releases this control.

Admission binds owner, Universe, original operation, base 0/result 1 and receipt
digest. Real acknowledged data and pending command remain in the unchanged exact
account+Universe cache. The original operation is never regenerated or resent.
Marker control uses the existing Web Lock; workspace/cache guards fence stale
same-origin peers. Auth generation/disposal guards prevent late publication or
control/cache writes from abandoned contexts. Release is permitted only after
an observed missing result in the current blocked context with exact pending
base 0 and independently reverified server state.

## Reviewed manual procedure: one action at a time

Use [the isolated debug-browser setup](cloud-inflight-recovery.md#l1-local-setup-and-single-disposable-preparation)
from the prior checkpoint: dedicated profile, loopback app server, Chrome port
9222, normal sign-in. Do not expose the debug port or use a regular Chrome profile.
No token copying, keys, SQL hooks or Supabase configuration changes are required.
If a STOPPED result occurs, retain original identities and stop for review.
Never re-run preparation or the dispatch harness to repair an uncertain result.

1. Open `/dev/cloud-recovery-diagnostic.html` in the isolated profile. Require
   **No Phase C fixture.** / **Ready; no requests made.** If another marker exists,
   stop rather than clearing storage.
2. Label that tab **WRITER**.
3. Open the same diagnostic URL at the EXACT same origin in a second tab. Label
   it **OBSERVER**. Do not prepare or dispatch anything in OBSERVER.
4. In WRITER select **Committed original receipt; controlled missing then visible**.
5. In WRITER click **Create ONE new disposable Universe** exactly once. Require
   PREPARED at revision 0; retain the displayed scope, operation ID and exact keys.
6. Run the SAME reviewed native harness ONCE, using your actual loopback origin:

   ```powershell
   python scripts/cloud-inflight-harness.py --origin http://127.0.0.1:5500 --debug-port 9222
   ```

   Require independent original receipt/state PROVED before interruption and
   PASS for native failure with original journal/cache 0 and blocked writes.
   Neither diagnostic tab manually clicks dispatch. No replacement operation.
7. Restore WRITER transport only:

   ```powershell
   python scripts/cloud-inflight-harness.py --origin http://127.0.0.1:5500 --debug-port 9222 --reconnect
   ```

   Require RECONNECTED with no RPC, mutation or reload.
8. Reload WRITER only. Do not prepare or dispatch again.
9. Click **Reopen ORIGINAL operation under current receipt visibility** in WRITER.
   Require OBSERVATION explicitly verifying the underlying real receipt/state
   and PASS for controlled missing: same pending ID, exact cache/base 0 and
   blocked dependent writes. Do not use the other real-receipt reopen button.
10. Click **Check dependent writes remain blocked**. Require PASS.
11. Reload WRITER again, then click **Reopen ORIGINAL operation under current
    receipt visibility** again. Require the same controlled-missing PASS;
    visibility must not reset or release on reload.
12. Click **Restore receipt visibility only (no mutation)**. Require RELEASED;
    original journal/cache must still be at 0. No acknowledgement is applied yet.
13. Click **Reopen ORIGINAL operation under current receipt visibility** again.
    Require PASS: SAME ORIGINAL validated receipt recovered at revision 1;
    acknowledged once, no resend/replacement ID. Pending journal is now resolved.
14. Click **Verify recovery does not apply twice**, then repeat it once. Require
    unchanged revision/state and no second semantic application or mutation call.
15. Stop and report the results before cleanup. Live validation is not implied by
    the local/mock test results below.

## Guarded cleanup (separate deliberate action)

1. Generate **Inspect exact fixture; generate guarded cleanup SQL** in WRITER.
   It must target only the displayed owner/Universe at revision 1, fixed metadata
   and ORIGINAL receipt/digest with no unexpected rows/receipts permitted.
2. Dispose BOTH diagnostics (retain storage).
3. Manually run the ENTIRE generated guarded Phase C transaction in Supabase SQL
   Editor. Require `test_universes_removed = 1`, no errors. On guard failure,
   stop; never bypass it or force-delete changed data.
4. Only after server success remove ONLY the exact printed cloud-cache key and
   `cosmifold:dev:cloud-recovery:v1` from localStorage at this origin; verify null
   for both. Do not clear all storage or remove Auth/real local Cosmos data.
5. Refresh WRITER after exact-key removal and require **No Phase C fixture.** /
   **Ready; no requests made.** Close the diagnostic tabs and isolated browser.
   No extra marker or relay is introduced.

The SQL generator/body, ownership checks, receipt/state guards and cascade
decisions are unchanged. The harness never executes SQL or deletes a fixture.

## Automated validation

Focused Node tests cover real model commit evidence with controlled missing,
reload preservation, writes blocked, release without cache advance, same-ID
recovery exactly once, two repeated recovery checks, changed digest/ack/scope/
operation/base/revision/state and unavailable evidence, account/disposal fencing,
same-origin stale-peer protection, marker compatibility and guarded cleanup.
Python tests prove the new case uses the existing independent proof/native
failure sequence, without an additional mutation or broad interception surface.
The isolated browser suite runs the actual CDP coordinator against a LOCAL mock
HTTP backend, then tests missing across reload, release, recovery, repeat checks
and exactly ONE original HTTP commit. All former recovery cases still run.
These are local/mock checks, not live Supabase evidence.

Pre-live verification on this branch: all 490 non-physics Node regression tests
passed, including 25 focused recovery tests; all nine Python coordinator tests
passed; all 89 isolated browser recovery checks passed. These local/mock results
are separate from the operator-reported live evidence above. Existing lost-reply,
browser Offline and native-response interruption cases remain covered.

Post-validation review (2026-10-14): all 490 non-physics Node tests (including 25
focused recovery tests), all 58 physics tests, all 16 Python tests (nine native
coordinator plus seven local HTTP barrier tests), and all 89 isolated recovery
browser checks passed. Initial sandboxed Python/browser runs failed on local
loopback connections; reruns outside the sandbox passed. `git diff --check` and
the new document's whitespace check passed. Review found stale gate/status wording
and corrected documentation only; no concrete production recovery bug or mismatch
with the reported live behavior was identified. Diagnostic controls, local mock
assumptions and native harness changes remain confined to development/test files.
No live request, SQL execution, production activation, commit, push or merge was
performed by Codex during this review.
