# Phase C: bounded uncertain-operation recovery

This is an inactive development test, not cloud activation. Normal Cosmifold
still uses its existing local metadata and IndexedDB files. Auth, storage v5,
Backup/Restore and the Phase A/B privacy/revision boundaries are unchanged.
Phase B is merged, live-validated and cleaned up. Phase C uses new fixture IDs.

## Architecture review and smallest implementation

The existing `createCloudWorkspace` coordinates `createCloudUniverseRepository`
with `createCloudCacheStore`. Its command path takes an account/Universe Web Lock,
checks the cached base, persists the original command and intended snapshot,
then dispatches through the gateway. Acknowledgement durability precedes
publication. Uncertain outcomes retain pending state, blocking dependent writes.
`bootstrap(universeId)` rehydrates that exact journal and reconciles its original
operation ID before remote refresh/editing. A missing or unavailable receipt
does not prove noncommit and does not unlock writes. Receipt-proven recovery
advances the acknowledged revision; a subsequent remote read may rewrite cache
control/sequence fields, but never applies the semantic mutation twice.

Account changes dispose/fence the prior workspace generation. Same-origin Web
Locks serialize cache preparation/recovery, and cache base/CAS checks reject a
stale peer. Phase B intentionally used separate origins for writer overlap;
Phase C deliberately uses the SAME origin to test shared cache/lock ownership.

No production architectural refactor was necessary for this initial checkpoint.
The additions are pure fixed-fixture planning, an inactive diagnostic, mock/unit
tests and a mocked two-tab browser suite. The normal app does not load them.

```text
Explicit diagnostic button
  → existing cloud workspace / repository
  → versioned account+Universe pending journal
  → gateway transport with development-only failure injection
  → original operation receipt on reload/reconciliation
  → durable acknowledgement, then validated server read
```

The durable pending format stays `pendingVersion: 1`, inside cloud cache version
1, with command (including original operation ID, scope and base revision),
intended semantic v5 snapshot, presentation sidecar and semantic intent. No Auth
credential enters it. The new diagnostic control marker is a separate
`localStorage` key, `cosmifold:dev:cloud-recovery:v1`. It stores only versioned
fixture scope, original operation ID, case and phase. It is shared across tabs
at that origin; unlike Phase B, it is not a tab-scoped session marker. It must
not be confused with a production outbox. Cache namespace remains
`cosmifold:cloud-cache:v1:<user-id>:<universe-id>`.

## Two distinct fixed-fixture cases

- **Lost reply:** one real RPC commit of a fixed disposable root, revision 0→1.
  The harness discards the successful reply and makes receipt requests
  unavailable. Cache stays acknowledged at 0 with the original pending command.
  After reload, real receipt access can be explicitly allowed to prove recovery.
- **Not dispatched:** the harness interrupts the command before any HTTP commit
  call, after journaling. The real receipt RPC reports missing; server remains
  empty at revision 0. The client must remain blocked. There is no delivery or
  replay button; this fixture is ultimately cleaned up, not retried.

These injections are accurately labelled. They are NOT evidence that a real
connection dropped, that a request never reached PostgreSQL during a genuine
outage, or that arbitrary network-loss cases are solved. A real delayed original
commit after a missing receipt, request timeout with late reply, and failed
durability after receipt are exercised deterministically; those broader live
transport cases require a subsequent reviewed procedure.

Each case owns exactly one disposable Universe and one operation ID; never reuse
Phase A/B identities. Creation records identity before HTTP; uncertain creation
retains its allocated marker and fails closed. It is not automatically recreated.
Mutation requires `prepared` phase and changes phase before dispatch. Repeated
clicks, reload or another tab cannot allocate a replacement mutation ID or retry.
Preparation/control transitions use a dedicated same-origin Web Lock. Each
gateway request has a 15-second bound; timeout consumes/fences a late result and
does not cancel a PostgreSQL write. No automatic network retry is added.

## Diagnostic and local tests

Entry: `/dev/cloud-recovery-diagnostic.html`, loopback only. It makes no Auth/RPC
requests on load; sign-in/session recovery occurs only after an explicit action.
Use normal Cosmifold's sign-in UI at the same origin; no token copying/display.
Buttons expose fixed actions, not arbitrary commands or real-Cosmos import.

```text
node --test --test-timeout=15000 tests/cloud-recovery.test.js
python tests/browser-check.py --cloud-recovery-only
```

Node tests cover original-ID reload, acknowledged revision advancing once,
missing/unavailable and later receipts, cache quota failure after receipt,
late reply after disposal, account switch during recovery, same-origin lock
contention and stale cache-base rejection, plus strict cleanup generation.
Browser tests use isolated temporary profiles, two same-origin tabs and a local
mock Auth/RPC transport, including real page reload. They make no Supabase/CDN
requests and execute no SQL. Existing Phase B local mock transport/guarded SQL
renderer are reused without changing their implementation or guards.

Local validation for this checkpoint: 11 focused Phase C Node tests passed
within 476 non-physics regressions; 34 Phase C mocked browser checks passed,
including page reload and same-origin stale peer fencing. The existing Phase B
mocked browser suite still passed all 94 checks. `git diff --check` and explicit
new-file whitespace checks passed. The browser harness fixture was corrected
to use the canonical marker rather than the identity display object; no
production behavior was changed. No live Supabase request or SQL was executed.

## Repeatable manual procedure — review before each new run

No live Phase C request has been performed by Codex. The operator has now
validated the lost-reply/reload/receipt/stale-peer flow and guarded cleanup,
as recorded below. The following remains the reviewed staged procedure for a
future new run, not an instruction to recreate the cleaned-up fixture. Proceed one
checkpoint at a time. Keep the exact original marker/cache; any STOPPED result
requires review, not clearing storage, retrying dispatch or recreating fixtures.

### C1: one commit, reload and blocked journal only

1. Use a clean ordinary local static server at the existing Auth-configured
   origin, for example `python -m http.server 5500 --bind 127.0.0.1` if that port
   is available. No relay is needed; do not restart Phase B. Use the actual same
   host/port for every Phase C tab.
2. Sign in through the normal app at that origin. Do not change the local Cosmos.
3. Open `/dev/cloud-recovery-diagnostic.html` in tab A. Confirm no existing Phase C
   fixture. Leave **Real commit; discard successful reply** selected.
4. Click **Create ONE new disposable Universe**. Expect PREPARED at revision 0.
   Save the printed owner, Universe, original operation ID and exact cache key.
5. Click **Send ONE planned command with transport injection** once. Expect PASS:
   acknowledged cache 0, original command journalled, dependent writes blocked.
   Do not assume a server outcome if this step stops unexpectedly.
6. Reload the SAME diagnostic tab. Click **Reopen original pending operation;
   receipts unavailable**. Expect the same ID and exact pending cache.
7. Click **Check dependent writes remain blocked**. Expect PASS.
8. STOP and report the results/identities (no credentials). Do not allow receipts,
   create another fixture, run SQL or clean up yet.

### C2: same-origin stale peer enrolled before receipt recovery

After C1 review, open tab B at the EXACT same origin and diagnostic URL in the
same browser profile. Do not use localhost versus 127.0.0.1, incognito, another
profile or another port: they would not share the cache/Web Lock context.
Click **Reopen original pending operation; receipts unavailable** and **Check
dependent writes remain blocked** in B. Both tabs must be pending against the
same operation at acknowledged revision 0. STOP for review before continuing.

### C3: receipt recovery and stale-peer fencing

After C2 review:

1. A: click **Allow real receipt lookup and reconcile original ID**. Expect PASS
   with validated server/cache revision 1 and cleared journal, no resubmission.
2. A: click **Verify recovery does not apply twice**. Expect revision 1/state
   unchanged and no second mutation. Cache control sequence may refresh.
3. B: click **Stale peer: reject recovery against changed cache**. Expect PASS;
   its prior pending repository must fail its base check before querying/applying
   another receipt. A's acknowledged cache must remain byte-for-byte unchanged.
4. B: click **Peer: reopen validated acknowledged state**. Expect revision 1.
5. STOP and report. This does not declare all of Phase C complete or authorize SQL.

### C4: separately approved cleanup

Click **Inspect exact fixture; generate guarded cleanup SQL**, then save the
printed exact identities. The reused SQL guard locks/checks exact owner,
revision, snapshot flags, every entry field, absence of other related data,
receipt count and original request digest/acknowledgement. Revision 1 requires
exactly the original receipt; revision 0 requires none. Changed/extra data aborts.
Dispose ALL diagnostic tabs using **Dispose this diagnostic (retain storage)**.
After separate approval, manually run the entire generated transaction in SQL
Editor under the ordinary administrative role, require
`test_universes_removed = 1` with no error, then remove ONLY the printed cache key
and `cosmifold:dev:cloud-recovery:v1` from this origin's Local Storage using exact
`removeItem` calls. Do not clear stores, rename keys, alter guards or remove Auth
sessions. Both keys should read null; close tabs. There is no Phase C session
marker. Do not delete an Auth account or touch Phase A/B keys.

### C5: real missing-receipt case (new fixture after reviewed cleanup)

Only after C4 success, prepare a separate new fixture with **Block HTTP dispatch;
real missing receipt** selected. Dispatch once, reload, reopen unavailable,
then explicitly allow real receipt lookup. Require real missing receipt,
unchanged empty server/cache revision 0 and original pending ID. Repeated
receipt checks/dependent writes must remain blocked, with no commit HTTP call.
STOP for review. Cleanup uses the same strict renderer but expects zero receipts
and empty metadata. Never deliver/replay that command to make this case pass.

## Remaining live gates and stopping point

This branch prepares C1–C5 and deterministic account/late-response/lock races.
The lost-reply flow, original receipt recovery, repeated recovery, same-origin
stale-peer fencing and guarded cleanup have passed operator-run live validation.
The separate not-dispatched/missing-receipt case is automated-tested; no live
result for it is claimed from this report. Genuine browser/network interruption while a
write is in flight, live later-arriving original receipt, account change during
delayed recovery, actual simultaneous same-origin recovery contention, and
quota/cache failures in a live environment remain separate reviewed substeps.
Holding or suppressing a Promise alone does not close genuine outage gates.
No broad Phase C COMPLETE banner is added. A model test is not a PostgreSQL or
network substitute. Normal startup remains local; cloud files, migration,
activation, PWA, offline outbox/merge and deployment remain out of scope.

## Operator-reported live checkpoint and cleanup

The operator confirmed:

- Lost-reply operation persisted across reload; dependent writes stayed blocked
  while recovery was uncertain.
- The original receipt was recovered using the original operation ID, with no
  semantic resubmission; repeated recovery did not apply the operation twice.
- A stale same-origin peer rejected recovery against the changed cache,
  preserved the authoritative revision-1 cache, then reopened validated
  authoritative revision-1 state.
- Guarded cleanup removed exactly one disposable Universe; final browser
  cleanup returned the diagnostic to **No Phase C fixture**.

The tested inactive Phase C checkpoint is ready for commit review. This does
not activate normal cloud mode or close the broader live transport gates above.
The generated cleanup comment now says **MANUAL PHASE-C CLEANUP** and tells the
operator to dispose ALL Phase C diagnostics. Every executable SQL statement and
guard remains identical to the reused renderer; its Phase B default is unchanged.

Focused pre-commit checks passed: 39 Phase C/Phase B Node tests, 34 mocked Phase C
browser checks, `git diff --check` and new-file whitespace checks. The SQL comment
test compares everything after the first line against the original renderer for
both revision-0 and revision-1 cleanup, proving all executable guards unchanged.

## Completed bounded checkpoint: browser Offline transport and reconnect

The initial checkpoint above is merged, live-validated and cleaned up. The next
subgate covered here is **actual browser transport failure while offline**, followed by
reload/reconnect against the original receipt. The risk is that clients discard
an unresolved operation or retry it under a replacement ID merely because a
response or receipt is unavailable. This is deliberately smaller than arbitrary
loss of a request already executing on the server.

The existing fixture plan adds case `browser-offline` and phase `network-ready`
for a verified online preflight. Original markers/cases remain compatible. After
proven transport failure, the same version-1 diagnostic marker gains a strictly
validated optional `transport` object with attempts=1, observedOffline=true and
safe gateway code/reason/outcome. It stores no tokens, headers or raw errors.
Production pending/cache/storage versions and `.cosmifold` format are unchanged.

No parallel network mechanism is added: the actual gateway, SDK and Web Lock /
pending journal are used. The new case returns the real commit result/error and
always calls the real receipt gateway; old synthetic Phase C cases are unchanged.
No rejected/unclassified result is proof of noncommit. An unexpected successful
commit or Auth failure stops this test without erasing its identities; preserve
the actual resulting data and obtain reviewed cleanup rather than re-dispatching.
No operation retry or new ID is offered. Each RPC remains bounded to 15 seconds.

The browser offline flag is only a prerequisite. A classified unknown-outcome
transport error AND unchanged original pending journal are required. Offline
receipt checking requires a real failed receipt request, not a missing-receipt
response or a synthetic exception. During live review, additionally require
DevTools Network evidence for the failed commit request; an indicator/error
string alone is not enough. Do not share request headers, tokens, HAR files or
credentials. A safe report needs only operation ID, revision, request endpoint
name and failure status.

### N1: online preparation, then actual Offline failure — repeatable validated procedure

1. Run ordinary local static hosting at the existing configured Auth origin;
   sign in through normal Cosmifold. No relay or new configuration is required.
2. Open the same `/dev/cloud-recovery-diagnostic.html`. Require **No Phase C
   fixture**; if an old marker exists, stop rather than clearing/reusing it.
3. Select **Actual browser Offline transport / reconnect**.
4. Click **Create ONE new disposable Universe**. Record its printed exact owner,
   Universe, original operation ID, cache key and marker key. Expect PREPARED at 0.
5. Click **Online: preflight browser-offline fixture (no mutation)**. Expect ARMED
   after a real empty-Universe/missing-receipt read and valid acknowledged cache.
6. Open DevTools → Network. Enable Preserve log; select **Offline** in the
   throttling selector, as described in the [Chrome Network reference](https://developer.chrome.com/docs/devtools/network/reference#offline).
   Keep this SAME tab loaded and signed in. Do not reload while offline.
7. Click **Send ONE planned command with transport injection** ONCE. In this case
   it uses the actual gateway without synthetic failure. Expect PASS: transport
   failure, original pending ID and acknowledged revision 0. In Network, verify
   the commit RPC failed as offline (`net::ERR_INTERNET_DISCONNECTED` in Chrome).
   Do not use Edit/resend or Replay XHR; do not copy headers or tokens.
8. Click **Offline: verify real receipt transport remains blocked**. Expect PASS
   and a failed real receipt RPC; exact pending/cache retained.
9. Click **Check dependent writes remain blocked**. Expect PASS, no second commit.
10. STOP and report these outputs plus the safe Network failure status. Restore
    **No throttling** to avoid leaving the tab offline, but do not reload/reopen,
    retry, clear data or run SQL until N1 is reviewed. No manual-copy deadline.

### N2: reconnect/reload original operation — only after N1 review

1. Confirm Network is **No throttling**, then reload this SAME tab. Reloading
   online avoids conflating the test with unavailable static/SDK assets; no PWA
   or offline asset cache is added. Do not press preparation or dispatch again.
2. Click **Reconnected: reopen original operation with real receipts**.
   Normally the offline-before-dispatch case yields a real missing receipt and
   empty server at revision 0: require the original pending ID/cache byte-for-byte
   unchanged and dependent writes still blocked. This does NOT authorize retry.
   If the original receipt is found, the only supported alternative is exact
   fixed metadata at revision 1, cleared pending state and no semantic resend;
   report that outcome for review rather than assuming an empty account.
3. For the missing outcome, click **Check dependent writes remain blocked**.
4. Click **Reconnected: reopen original operation with real receipts** again.
   Require the same outcome/ID and no second semantic command.
5. STOP and report. A PASS is only this bounded offline/reconnect subgate,
   not COMPLETE for all transport/network or activation gates.

### N3: unchanged guarded cleanup — separately reviewed

Use the existing **Inspect exact fixture; generate guarded cleanup SQL**. It
checks the actual coherent fixture state and expects zero receipts at revision
0 or exactly the original receipt at 1. Dispose ALL diagnostics, manually run
the entire unchanged guarded transaction as the ordinary SQL administrator,
require `test_universes_removed = 1`, and only then remove the printed cloud
cache and `cosmifold:dev:cloud-recovery:v1` with exact `removeItem` calls. Verify
both are null and the diagnostic shows **No Phase C fixture**. Never clear all
storage, rewrite guards or force cleanup of unexpected/changed data. Existing
Auth session, local Cosmos and Phase A/B storage remain untouched.

### Tests and remaining gates

Node tests cover online-only preflight, classified real transport failure,
unavailable receipt blocking, reconnect/reload preserving a real missing receipt,
an original found receipt after an unknown outcome, unrelated Auth failure and
unexpected success refusing transport PASS, and strict compatible marker parsing.
The isolated browser suite uses Chromium's native Offline network emulation,
failing real `fetch` calls to a local mocked backend; no real Supabase/CDN traffic
or SQL. Old Phase C lost-reply and stale-peer flows remain regression-tested.

The operator has now completed live Supabase N1–N3 and guarded cleanup, as
recorded below. Interruption during SQL execution, late
original commit after an initially missing receipt, live session-switch/recovery
overlap, simultaneous same-origin recovery contention, offline app/SDK loading,
quota failures and realistic limits remain later bounded subgates. Files,
migration/activation, richer semantic compatibility and deployment are untouched.

Offline/reconnect extension verification: all 15 focused recovery Node tests
passed within 480 non-physics regression tests. All 50 isolated browser checks
passed, including native Chromium Offline transport failure, blocked real receipt
fetch, online reload/missing receipt and the original Phase C regressions.
`git diff --check` passed. No live Supabase request or SQL was executed.

### Operator-reported live Offline/reconnect checkpoint and cleanup

The operator started with **No Phase C fixture**, created one new disposable
Universe at revision 0 and passed online preflight with no mutation sent. With
Chrome DevTools Network set to Offline, exactly one original command was
attempted through the real gateway; its commit request failed with
`net::ERR_INTERNET_DISCONNECTED`. The original pending operation ID and exact
revision-0 cache were retained. Neither synthetic receipt failure nor the
discarded-successful-reply mechanism was used. Real offline receipt transport
also failed, and dependent writes remained blocked.

After restoring No throttling and reloading the SAME tab, real receipt lookup
found the original receipt genuinely missing at revision 0. The operation stayed
blocked: no resend and no replacement operation ID. The operator reviewed the
generated guarded cleanup, disposed the diagnostic, and ran the unchanged SQL;
`test_universes_removed = 1`. Only the exact temporary cloud-cache and recovery
marker keys were removed. Final browser state was **No Phase C fixture** and
**Ready; no requests made.** This is operator-reported live evidence, not a claim
of remote requests or SQL execution by Codex.

The checkpoint proves real browser transport failure **before server execution /
dispatch completion**, preservation of the unresolved operation across reload,
and safe reconnect against a genuinely missing receipt. It does NOT prove
arbitrary interruption while PostgreSQL is already executing the mutation.
It is ready for commit review as an inactive checkpoint, not cloud activation.

### Next incomplete gate

The [late-receipt observation subgate](cloud-late-receipt-recovery.md) has PASSED
operator-run live validation and guarded cleanup (2026-10-14). The SAME diagnostic
and native harness independently proved the original receipt/exact server revision
1 while WRITER retained its original journal/cache at 0. Controlled missing
visibility preserved that exact pending state and blocked dependent writes across
reload. Release changed visibility only; reopening recovered the SAME original
receipt once, and two repeat checks were idempotent. No resend, replacement ID,
journal deletion while unresolved or speculative publication occurred. Both tabs
were disposed; full guarded cleanup returned `test_universes_removed = 1`; exact
temporary cache/marker removal restored **No Phase C fixture.** /
**Ready; no requests made.** This is operator-reported evidence, not Codex remote
execution. Every withheld lookup verified the real underlying receipt/state.
This closes controlled receipt unavailability AFTER a real commit, not natural
database replication/visibility delay, later creation of a genuinely absent
server receipt, cancellation during SQL execution or broader live timing races.
Existing cases and production recovery behavior remain unchanged; cloud activation
is still blocked.

The [atomicity review](cloud-receipt-atomicity.md) closes **committed original
mutation with a genuinely absent receipt created later** as NOT APPLICABLE /
IMPOSSIBLE BY CONTRACT, not live-passed. Metadata/revision/receipt commit in one
transaction; no asynchronous receipt creation or replica-read path is configured.
The next recommended checkpoint is live same-origin simultaneous recovery
contention and account/session changes during delayed recovery.

The distinct reachable timing case is **original request delayed BEFORE acquiring
the writer lock, missing receipt lookup first, original commit later**. Admission
alone is not commit. Preserve the original journal/cache/ID and block writes
through delay/reload; an eventual original commit must create metadata and receipt
together without resend. This and mid-SQL interruption/cancellation remain
live-UNVERIFIED. Future evidence must independently establish server admission /
overlap and outcome; a client timer or held Promise alone is not proof.
The bounded server-committed/native-response continuation is implemented as
an additional case in the SAME diagnostic; see [cloud-inflight-recovery.md](cloud-inflight-recovery.md).
It uses an independent real receipt/state audit before native response failure,
not the original successful-reply discard. The operator has now live-validated
independent visibility of the original receipt/exact revision-1 state BEFORE
native response failure, with WRITER's original journal/cache still at 0.
Transport-only reconnect followed by WRITER-only reload recovered the original
receipt once. Two repeated recovery checks retained that state without resend,
replacement ID, stale publication or duplicate semantic application.
Both diagnostics were disposed; guarded cleanup returned
`test_universes_removed = 1`; only exact temporary cache/marker keys were removed.
Final state was **No Phase C fixture.** / **Ready; no requests made.**
This closes the committed-before-SDK-acceptance checkpoint, not mid-SQL
cancellation or a delayed original commit after a missing lookup. Existing cases,
original-ID recovery and cleanup guards are unchanged. Those reachable timing
cases remain UNVERIFIED; impossible post-commit receipt creation is closed by
the architecture review above. No live request or SQL was executed by Codex.

Post-validation review reran all 480 non-physics Node tests (including 15 focused
recovery tests), all 50 isolated recovery browser checks and `git diff --check`;
all passed. Only checkpoint documentation and two generic diagnostic-page
instructions changed during that review. Recovery code, SQL guards, production
startup and activation gates were not weakened or changed. No live requests,
SQL execution, commit, push or merge were performed by Codex.
