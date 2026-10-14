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
