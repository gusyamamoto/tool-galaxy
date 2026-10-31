# Travel Alpha M2: one native interrupted rename and original-receipt recovery

This is an operator-authorized live acceptance test with a qualified first live
result recorded below. Use only a disposable Universe in the existing isolated,
loopback Alpha. The controller never changes app files, Supabase configuration,
permissions, SQL, or deployment artifacts. It performs ONE normal Alpha UI rename
only when the operator supplies `--authorize-one-rename` with the exact project,
owner, Universe, entry, starting revision and intended name. No CLI option accepts
credentials. No second commit, creation, deletion or cleanup is supported.

## First live result: October 30, 2026

Operator-reported scope: Universe `9941eb73-0273-4b9c-a1af-43b010f4f8da` in the
existing isolated Alpha. The controller reached ARMED, PROVED, UNRESOLVED
VERIFIED, RESTORED and RECOVERED. The original operation committed before its
response was lost; the UI retained Unresolved and blocked editing, then recovered
through the original receipt to Saved at revision 6 with correct renamed data.
Codex did not execute the live test or its database writes.

The final automated checkpoint returned STOPPED: BOUNDED_PHASE_TIMEOUT rather
than PASS. Transport-only restoration succeeded, and a subsequent manual server
reload confirmed Saved, revision 6 and correct metadata. The exact final
duplicate-request count was not conclusively established. Record original-
receipt recovery as live verified, but keep the final automated/request-count
acceptance UNVERIFIED. A stable revision alone cannot count repeated requests.

The final stage first waits up to 120 seconds for a newly observed WRITER read
after its counter checkpoint, then performs an independent audit with an
8-second phase budget. Both waits use BOUNDED_PHASE_TIMEOUT; the reported stage
sequence alone does not identify which expired. A reload observed before the
counter checkpoint does not satisfy its later-read condition. This is a possible
observation limitation, not an established root cause or proven application bug.
The synthetic success case clicks only after the prompt; it does not establish
all human timing cases. No controller behavior was changed for this record.

Account switching during an in-flight Alpha save remains live-unverified. The
synthetic missing-receipt case is not live evidence of natural receipt absence
after commit. Do not rerun the rename, create replacement operations, or clear
storage to repair this historical verification gap. Preserve the operation ID,
safe output and any retained request evidence; use only explicitly reviewed
read-only checks for further inspection. No cleanup or production activation
is claimed. See the [full editor checkpoint](travel-alpha-live-acceptance.md).

The preparation/run steps below remain a reference for a future deliberately
authorized test, not a request to repeat the completed mutation.

## Preparation: no mutation yet

1. Keep the already configured isolated Alpha server running at its existing
   allowed origin, for example `http://127.0.0.1:5042`. Do not serve the beta or
   copy diagnostics into the artifact. Complete the catalog/dashboard preflight.
2. Open a dedicated interactive Chrome debug profile from PowerShell. Keep port
   9222 loopback-only; use another port consistently if occupied. These commands
   neither configure the app nor pass credentials:

   ```powershell
   $alphaInterruptProfile = Join-Path $env:TEMP ('cosmifold-alpha-interrupt-' + [guid]::NewGuid())
   & 'C:\Program Files\Google\Chrome\Application\chrome.exe' --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 "--user-data-dir=$alphaInterruptProfile" 'http://127.0.0.1:5042/'
   ```

3. Sign in normally as A in this profile. Label this tab WRITER by opening
   F12 > Console and entering only:

   ```javascript
   window.name = 'cosmifold-alpha-interrupt-writer';
   ```

4. Select the existing disposable Universe (for the current acceptance run,
   `9941eb73-0273-4b9c-a1af-43b010f4f8da`). Click **Reload from server / check
   pending save**. Require Saved, editing enabled, and no pending save. Stop if
   any operation is already Unresolved. Record the actual starting revision;
   do not assume an old revision or reset the data.
5. Obtain the project URL from the already reviewed Alpha configuration and
   the owner/entry identifiers from your existing test record. If necessary,
   this read-only Console expression prints only disposable dataset identifiers
   and names, never Auth/session objects:

   ```javascript
   (({dataset}) => ({scope:dataset.scope, revision:dataset.revision,
     entries:dataset.snapshot.entries.map(({id,name}) => ({id,name}))}))(travelAlpha.getState());
   ```

6. Open a SECOND tab at the exact SAME Alpha origin in the same debug profile.
   It must show the same signed-in A, but **leave its dataset unselected**. It
   serves as an independent authenticated HTTP observer without writing the
   Alpha cache. Label it through its Console:

   ```javascript
   window.name = 'cosmifold-alpha-interrupt-observer';
   ```

7. In WRITER select the disposable child, click **Rename selection**, and type
   a new fixed test name, e.g. `Oaxaca stay - recovered`. **Do not click Save.**
   Leave that modal open. Do not interact with OBSERVER while the controller runs.

## One authorized submission

From the repository root, replace the placeholders and use the actual starting
revision. This command explicitly authorizes ONE rename through the open UI:

```powershell
python -B scripts/travel-alpha-inflight.py --origin http://127.0.0.1:5042 --project https://YOUR-PROJECT.supabase.co --owner A-OWNER-UUID --universe 9941eb73-0273-4b9c-a1af-43b010f4f8da --entry CHILD-ID --revision CURRENT-REVISION --name 'Oaxaca stay - recovered' --debug-port 9222 --authorize-one-rename
```

The controller refuses beta/non-loopback pages, wrong project/account/scope,
pending saves, stale baselines, an unselected/wrong entry, a mismatched rename
form or extra labelled tabs. It independently reads the baseline first. It
guards both tabs' RPC requests; only the one exact journalled entry rename
(name plus its normal updatedAt) may pass. It never constructs a write RPC.

1. Expect **ARMED**, then ONE UI Save submitted by the controller. Do not click
   Save yourself. It captures the exact original operation ID from the durable
   Alpha pending journal before allowing the request to reach the service.
2. Expect **PROVED**: the original HTTP 200 response is paused before SDK
   acceptance, and OBSERVER independently found the same receipt and exact
   intended state at starting revision + 1. The controller requires this proof
   before Alpha's existing request timeout; slow/ambiguous runs stop unverified.
3. The controller natively fails that paused response and fails WRITER's receipt
   requests, without making the whole browser offline on a successful run.
   Expect **UNRESOLVED VERIFIED**. WRITER must show Unresolved, retain its old
   confirmed name/revision, and block Save/new/rename actions. Record the printed
   ORIGINAL operation ID. A red failed request line is expected; no headers or
   response payloads are printed.
4. Review the Unresolved UI, then press **Enter in the controller terminal**.
   Within two minutes of the prompt, require **RESTORED**. This restores normal
   receipt responses only; it sends no mutation, does not clear the journal,
   and does not automatically reload or apply an acknowledgement.
5. In WRITER click **Cancel** to dismiss the failed rename dialog, then click
   **Reload from server / check pending save ONCE**. Expect **RECOVERED**, Saved,
   the intended new name at starting revision + 1, and editing enabled. The
   recovery lookup must use the SAME ORIGINAL operation ID. No Save is repeated.
6. When prompted, click that same server-reload button once more. Expect final
   **PASS**: identical receipt/digest, name, IDs and revision, exactly ONE commit
   request and no duplicate application. Stop editing and retain the safe result.

Each operator checkpoint has a two-minute bound. Do not reload before RESTORED,
switch accounts, close tabs, submit another edit, or run a second controller.
The controller stops rather than accepting an extra/changed RPC, changed scope,
premature acknowledgement, missing/mismatched proof, early Saved, duplicate
commit, changed revision/state, or unreconciled pending operation.

## Stopped runs and missing receipts

**STOPPED is UNVERIFIED, never a successful interrupted-save acceptance.** Keep
both tabs, the original pending record and printed IDs. Do not rerun the rename,
generate another operation, edit storage, clear pending state, or force cleanup.
On a stopped armed run, the controller fails paused requests and leaves WRITER
transport offline to prevent a paused success or recovery being released silently.
This fallback offline setting is containment, not proof of post-commit loss.

After reviewing the stopped result, restore only transport by running the same
command with `--restore-transport-only` IN PLACE OF `--authorize-one-rename`.
Keep the other identifiers/parameters unchanged. Require **TRANSPORT RESTORED
ONLY**, then use Alpha's ordinary explicit reload to inspect/reconcile. This
recovery does not turn the stopped acceptance run into PASS.

If a real original receipt is missing/unavailable, keep the same pending ID,
old acknowledged state and blocked editing. Never infer that retry is safe.
After independent commit proof, genuine missing receipt is a contradiction to
the atomic commit contract and requires investigation. The synthetic negative
test deliberately hides receipt visibility; it is not natural Supabase behavior.
No live absent-receipt injection, artificial receipt, pruning or cleanup exists.

## Evidence and limits

Record the tested origin/project reference, operator-authorized disposable scope
and entry ID, starting/final revision, intended name, original operation ID,
PROVED/UNRESOLVED/RESTORED/RECOVERED/PASS stages and UI screenshots containing no
credentials. The controller inspects pending state read-only; only normal Alpha
recovery clears it after a validated receipt. Never share HAR, headers, browser
profile contents, passwords or tokens. The temporary profile contains normal
Auth state; retain it privately until recovery is complete. No deletion is run.

This proves committed-but-unreceived response recovery for ONE selected rename,
not cancellation during SQL, genuinely delayed receipt creation, browser/process
crash recovery, multi-tab recovery races, all network failures or production
activation. The controller must remain attached throughout; detachment/crash
makes the run unverified. The synthetic service models atomic metadata/receipt
commit; it does not run PostgreSQL or prove live behavior.

Local verification commands (synthetic services only):

```powershell
python -B tests/travel_alpha_inflight_test.py
python -B tests/travel_alpha_inflight_browser.py
python -B tests/cloud_inflight_harness_test.py
node --test tests/travel-alpha.test.js
```
