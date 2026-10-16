# Server-committed / native response interruption

This is a development-only continuation of the existing Phase C diagnostic.
Normal cloud mode remains inactive. No real local Cosmos, files, Auth behavior,
storage v5, Backup v1, hierarchy, physics or product UI changes are involved.
No SQL/RPC/schema/grant/platform change is required. The operator has completed
live validation and guarded cleanup; normal cloud activation remains blocked.

The follow-up [controlled missing-then-visible receipt case](cloud-late-receipt-recovery.md)
has also passed operator-run live validation and guarded cleanup using this
native coordinator with a separate disposable fixture. Its withholding
control applies only to case `late-receipt`; this checkpoint's case
`response-interruption` still uses real receipts without that control.

The separate [delayed-admission coordinator](cloud-delayed-admission-race.md)
reuses the diagnostic and this harness's safe CDP transport, not its response
interception sequence. It targets a real writer waiting behind a shared row-lock
holder, with real missing receipt lookup before commit. Its proofVersion-2 live
proof, same-receipt recovery and guarded server/browser retirement are complete:
LIVE-PROVED / CLOSED. The native-response checkpoint remains unchanged, and
mid-SQL interruption/session races remain separate open gates.

## The exact boundary and why it is reliable

For this bounded test, **server-admitted** means something stronger: the original
transaction has committed, while the original browser fetch still awaits its
response. We prove that through an independent authenticated HTTP request which
finds the ORIGINAL receipt and exact revision-1 metadata. The existing
`cosmifold_commit_metadata` writes metadata, revision and receipt atomically;
`cosmifold_operation_receipt` and `cosmifold_read_universe` provide coherent
ownership-checked reads. An independent request cannot see an uncommitted row.
The native response-stage HTTP status alone is not accepted as commit proof.

A local Chromium DevTools Protocol (CDP) coordinator pauses the exact original
commit response at **Response** stage, before the SDK consumes it. It correlates
the exact URL, POST body, scope and operation ID, requires HTTP 200, and uses a
different same-origin browser target to audit the real receipt/state without
writing cache. The writer must still have its original revision-0 journal.
Only then does the coordinator put the writer offline and call
`Fetch.failRequest(InternetDisconnected)`. It requires the corresponding native
`Network.loadingFailed` event, a pending journal at 0 and blocked dependent writes.
It never obtains the response body or supplies an artificial success response.

This is NOT the previous JavaScript discarded-successful-reply case: the SDK
never receives/accepts success. The delay at the browser network boundary is
insufficient by itself; the independent committed receipt is the required server
proof. The [Fetch protocol](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/)
provides response-stage interception and native failure, and
[PostgREST transactions](https://docs.postgrest.org/en/stable/references/transactions.html)
describe the request transaction boundary. The deployed SQL remains our model
source of truth; no reliance on a particular Supabase internal transaction hook.

```text
Writer journals operation X at acknowledged revision 0
  → ONE real commit RPC
  → server commits metadata/revision/receipt X
  → native response paused; SDK still has no acknowledgement
Observer independently reads receipt X + exact revision 1 (no cache write)
  → save safe admission evidence; writer cache still at 0
  → native response failed, writer offline; real receipt transport unavailable
Writer retains operation X / pending snapshot / base 0; writes blocked
  → reconnect/reload
  → existing workspace queries original receipt X
  → durable revision 1 acknowledgement, then coherent read
```

SQL row-lock/admission probes plus aborting a request before commit were considered.
PostgREST/browser cancellation may cancel the transaction, so that would not
deterministically produce a later receipt. A new server function/trigger delay
would broaden the private schema/API surface. Neither is needed for this
committed-but-unreceived test. Cancellation during SQL execution remains a
distinct gate, not a passed claim here.

## Minimal additions and safeguards

The existing fixture plan adds case `response-interruption`, `native-ready` phase
and a strict optional `admission` object in the development marker. It binds the
original owner/Universe/operation, base 0/result 1, receipt digest, cache revision 0
and independent-proof source. Existing version-1 markers/cases remain compatible;
production cache/pending formats do not change. After actual native failure the
same strict `transport` evidence records one attempt and safe error fields only.

Only this diagnostic case uses a 45-second request bound, allowing automated
independent auditing before the client times out. Existing cases keep their
15-second bound. The coordinator has a 35-second protocol bound and a bounded
response wait; no human/manual-copy countdown occurs after dispatch. Missing,
wrong-owner, changed-state, invalid response, early cache advance, duplicate
response or ambiguous interruption yields STOPPED/UNVERIFIED, not PASS.

`scripts/cloud-inflight-harness.py` uses the existing standard-library WebSocket
transport, with safe event handling that discards headers, cookies, exceptions
and response bodies. It connects only to a loopback debug endpoint and only
targets the exact diagnostic URL. It requires distinct WRITER/OBSERVER target
IDs with identical account/Universe/operation descriptors. It exposes no generic
proxy/server endpoint, retries nothing and installs nothing. The CLI never
accepts tokens, passwords or a mock/alternate RPC destination. Local automated
tests inject a dedicated mock endpoint only through test seams.

Read-only auditing uses the existing public RPCs; no private table browser API.
Admission evidence updates only the development marker, not acknowledged cache.
The original journal blocks mutations throughout the uncertainty window.
On coordinator failure, any paused response is failed after disposing the
context rather than released as success; retain all identities for review.
Never rerun the coordinator or recreate a stopped fixture without review.

## Manual live procedure — review first

Use exactly ONE NEW disposable Universe. Do not reuse any cleaned Phase A/B/C
fixture. No live requests have been made by Codex. This procedure requires a
dedicated interactive Chrome/Edge debug profile; the normal browser/profile is
not instrumented. Remote debugging can control its profile, so keep the endpoint
loopback-only and use this isolated profile for the test, not regular browsing.

### L1: local setup and single disposable preparation

1. Serve the existing static app at its configured loopback Auth origin, e.g.
   `python -m http.server 5500 --bind 127.0.0.1`. No relay/production deployment.
2. Open an isolated debug browser from PowerShell (adjust the executable only if
   your installed browser is Edge). These commands create no application secrets:

   ```powershell
   $inflightProfile = Join-Path $env:TEMP ('cosmifold-inflight-' + [guid]::NewGuid())
   & 'C:\Program Files\Google\Chrome\Application\chrome.exe' --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 "--user-data-dir=$inflightProfile" 'http://127.0.0.1:5500/'
   ```

   Keep the profile path for later cleanup. Do not pass account credentials on
   the command line or reuse your regular user-data directory. If the debug port
   is occupied, choose another and use that port consistently below.
3. Sign in through normal Cosmifold in this browser at the SAME origin, using
   the existing test account. Do not create/delete an account automatically or
   copy tokens. The isolated browser's local Cosmos is not uploaded or imported.
4. Open `/dev/cloud-recovery-diagnostic.html`. Require **No Phase C fixture**.
   Select **Server-committed / native response interruption** and click
   **Label this tab WRITER (no requests)**.
5. WRITER: click **Create ONE new disposable Universe**. Require PREPARED at 0.
   Save the printed exact owner, Universe, original operation ID, cache/marker keys.
6. Open a SECOND tab in the same browser/profile at the EXACT same origin and
   diagnostic URL. Click **Label this tab OBSERVER (no requests)**. Do NOT prepare
   or dispatch there. Do not use another profile, port, localhost variant or account.
7. STOP for setup review if anything differs. Do not click the dispatch button
   by hand: the coordinator installs interception before sending the single command.

### L2: coordinator sends once and proves native interruption

After L1 review, from the repository root run manually:

```text
python scripts/cloud-inflight-harness.py --origin http://127.0.0.1:5500 --debug-port 9222
```

1. The explicit command selects the two labelled tabs, preflights account/fixture,
   installs exact response interception and dispatches ONE semantic command.
   No human timing or extra click is needed while it runs; keep both tabs open.
2. Require **PROVED**: independent original receipt and exact revision-1 state
   visible BEFORE interruption, while writer journal/cache is still at 0.
3. Require final **PASS**: native `net::ERR_INTERNET_DISCONNECTED` for that paused
   request, original ID/base/cache retained, dependent writes blocked, no resend.
   The writer page must show the independent-before-native-failure PASS too.
4. STOP and report safe output/printed fixture IDs. Writer intentionally stays
   offline. Do not rerun, manually dispatch, reload, clear storage or clean up yet.
   If STOPPED/UNVERIFIED, preserve the journal and exact fixture for review.

The script outputs only fixed fixture identifiers, receipt digest and safe proof
fields. Do not share HAR, request headers, browser sessions or credentials.

### L3: reconnect/reload and original receipt recovery

After L2 review, use this transport-only command (CDP emulation may not match the
DevTools dropdown's displayed setting, so use the command to restore it):

```text
python scripts/cloud-inflight-harness.py --origin http://127.0.0.1:5500 --debug-port 9222 --reconnect
```

1. Require RECONNECTED; it restores writer transport only, sends no RPC/mutation
   and does not reload or alter the journal.
2. Reload ONLY the SAME writer tab, leaving observer open.
3. Click **Reconnected: reopen original operation with real receipts**. Require
   native-response recovery PASS at revision 1, original receipt digest/ID
   matching admission evidence, acknowledged journal cleared and no command resent.
   A missing/changed original receipt after committed proof must STOP, not retry.
4. Click **Verify recovery does not apply twice** twice. Require unchanged
   revision-1 semantic state and no second application. Cache control sequence
   may refresh through the existing read path.
5. STOP and report. This is only the committed-but-unreceived boundary; it does
   not activate cloud mode or declare every in-flight failure covered.

### L4: guarded cleanup, only after result review

1. WRITER: click **Inspect exact fixture; generate guarded cleanup SQL**. Save
   the SQL/printed keys. It must bind the exact committed revision 1 and ORIGINAL
   receipt/digest, with no extra entries/related data/receipts allowed.
2. Click **Dispose this diagnostic (retain storage)** in ALL diagnostic tabs.
3. Manually run the ENTIRE generated transaction in Supabase SQL Editor under
   the ordinary administrative role. Require `test_universes_removed = 1` with
   no error. If a guard fails, rollback/STOP; never remove guards or force deletion.
4. Only after server success, remove ONLY the exact printed cloud-cache key and
   `cosmifold:dev:cloud-recovery:v1` using `localStorage.removeItem` at this origin.
   Verify both null and **No Phase C fixture**. No extra session marker is created;
   tab roles are just `window.name`, discarded when tabs close.
5. Close both diagnostics and the isolated debug browser. No Auth account deletion.
   The temporary profile contains a test Auth session: after reviewed cleanup,
   it may be removed privately by the operator or signed out in the normal app.
   Never remove your regular profile, other browser stores or real local Cosmos.

The existing guarded SQL body/cascade decisions are unchanged. Live cleanup is
manual; neither coordinator nor browser executes SQL or deletes the cloud fixture.

## Automated proof versus remaining live gaps

Node model tests exercise real workspace/repository/cache code with explicit
backend-commit visibility, retained base/journal, independent audit, negative
scope/receipt/early-acceptance cases, disposal and original-ID/idempotent recovery.
Pure Python tests verify response/request correlation, independent target IDs,
audit-before-interruption order, sensitive-field discard and fail-closed behavior.
The isolated browser suite uses the ACTUAL CDP coordinator and native response
failure against a LOCAL mocked backend, then reloads and reconciles. No live
Supabase/CDN request or SQL execution is involved in automated checks.

This does NOT prove: cancellation halfway through SQL, receipt creation only
after an initially missing lookup, every real proxy/server timeout, long offline
asset/SDK loading, live account-switch or simultaneous multi-tab timing races,
quota/performance limits, cloud files, migration/import, sync activation or PWA.
A native pause alone is insufficient; independent receipt/state proof is required.
Live L1–L4 passed with guarded cleanup, as recorded below. These instructions
remain a repeatable procedure, not a request to recreate the cleaned fixture.

## Operator-reported live validation and cleanup

The operator used the isolated Chrome debug profile on port 9222, signed in
normally, and opened same-origin WRITER and OBSERVER tabs. Only WRITER prepared
one disposable Universe; OBSERVER neither prepared nor dispatched a mutation.
The reviewed Python harness ran once. Before native interruption, the independent
OBSERVER saw the ORIGINAL receipt and exact authoritative revision-1 metadata,
while WRITER retained its original pending journal and acknowledged cache at 0.

The successful native response was interrupted before SDK acceptance. WRITER
retained the original operation ID and revision-0 cache, with dependent writes
blocked and no semantic resend. The harness's `--reconnect` restored only WRITER
transport; it made no RPC, mutation or reload. After WRITER-only reload, real
receipt recovery accepted the original authoritative revision-1 acknowledgement
once, without a replacement operation ID or stale publication. Two repeated
recovery checks preserved the same revision/state, with no additional mutation
call or duplicate semantic application.

Both diagnostics were disposed before the full guarded Phase C cleanup
transaction was run manually. It returned `test_universes_removed = 1`. Only
the exact temporary cloud-cache and recovery-marker keys were removed. The
diagnostic returned **No Phase C fixture.** / **Ready; no requests made.**

This closes the **server-committed / native response interruption** checkpoint:
commit was independently visible before WRITER accepted the response, and later
reload recovered that original receipt. It does NOT prove interruption or
cancellation midway through SQL execution, or a receipt initially missing and
created later. The [subsequent atomicity review](cloud-receipt-atomicity.md) closes
post-commit receipt absence as impossible by contract; delayed original execution
before writer-lock acquisition and mid-SQL interruption remain unverified. This is
operator-reported live evidence; Codex did not connect or execute SQL.

Post-validation review changed checkpoint documentation only and found no
concrete recovery defect or mismatch with the reported sequence. All 484
non-physics Node tests (including 19 focused recovery tests), seven Python
coordinator tests and 66 isolated mocked browser recovery checks passed again.
`git diff --check` and new-file whitespace checks passed. Recovery behavior,
cleanup guards and activation restrictions remain unchanged.

Local verification: 19 focused recovery Node tests passed within 484 non-physics
regression tests; seven pure Python coordinator tests passed; all 66 isolated
browser checks passed. Native checks include response-stage pause, independent
receipt/state visibility BEFORE failure, native loading failure, retained cache
base/journal, reload, original-ID reconciliation, repeated recovery and exactly
one HTTP semantic command. Negative tests cover wrong/absent/changed proof,
early acceptance, same target masquerading as an observer, and account switch
after admission fencing the abandoned writer. `git diff --check` and new-file
whitespace checks passed. No live Supabase request or SQL was executed by Codex.
