# Travel Alpha Milestone 3A: cloud plain-text notes

Implementation and synthetic validation only; no live notes test has been run
by Codex. The local beta and deployment artifacts are unchanged. Source cloud
configuration remains disabled and Auth blank. The earlier
[Milestone 2 live checkpoint](travel-alpha-live-acceptance.md) remains qualified:
its interrupted-save controller did not finish final duplicate-request counting,
and account switching during an in-flight save remains live-unverified. Notes
tests do not close either gate.

## Existing contract, no database change

Notes are stored in the existing entry `attributes_json.content.notes`, with
content version 1, format `plain`, and text up to 100,000 UTF-16 code units. Both
the original metadata migration and its Time-validator replacement already
accept this shape. Saving uses the existing `content.changed` command through
`cosmifold_commit_metadata`; read and original-receipt recovery use the same
approved RPCs as other Alpha edits. No new function, schema, migration, grant or
policy is needed or applied. Do not change security settings to start this test.

The UI supports viewing, adding, editing and clearing notes on active Items.
Whitespace/newlines and Unicode are preserved. Markup is literal text. Existing
links and unrelated entry data are preserved, with attachments still forbidden.
There is no rich-text, photo, link-editing, sharing, automatic save or local-beta
fallback. Cancel discards an unsaved draft; a dispatched uncertain save retains
its existing scoped pending journal until proven recovery.

## First live acceptance: operator actions only

1. Prepare a NEW disabled artifact, never overwrite the existing M2 artifact or
   a beta/deployment folder:

   ```powershell
   python -B scripts/prepare-alpha.py --output "$env:TEMP\cosmifold-alpha-m3a-live-1"
   ```

   Review it, then configure only that artifact's `alpha/config.js` and public
   `alpha/auth-config.js` using the same reviewed project, distinct loopback
   origin and isolated Auth key from the
   [live setup procedure](travel-alpha-live-acceptance.md#prepare-one-disposable-local-alpha).
   Retain its generated isolation-profile/milestone value; this notes addition
   needs no configuration or security migration. Never provide secret/service
   keys, passwords or tokens in configuration or chat.
2. When retiring the earlier loopback preview, stop only its own static server.
   Serve the new artifact at the already approved Alpha origin, for example:

   ```powershell
   python -B -m http.server 5042 --bind 127.0.0.1 --directory "$env:TEMP\cosmifold-alpha-m3a-live-1"
   ```

   Do not change the beta origin or upload either artifact. Use disposable
   profiles/sessions and sign in normally as A.
3. Select the existing disposable Universe
   `9941eb73-0273-4b9c-a1af-43b010f4f8da`. Click **Reload from server / check
   pending save** and require Saved, editing enabled, no unresolved operation.
   Record the actual current revision (last reported as 6), child ID, parent ID
   and name. Do not create replacement Items or assume a fixed current revision.
4. Select the child, then **Add notes** or **Edit notes** below the visualization.
   Enter fixed disposable text such as:

   ```text
   Oaxaca Alpha notes
   Check-in at 15:00
   Bring booking confirmation 🧳
   ```

   Click **Save notes once**. Require Saving -> Saved, one revision increment,
   exact text in the preview and unchanged Item/parent IDs, name and Item count.
   Inspect the real read response after explicit server reload: the same entry's
   `attributes_json.content.notes` must contain format `plain` and the exact text.
   Record only safe response fields, revision and operation ID, never headers.
5. Edit a line and save once. Reopen the notes editor and verify it. Change a
   draft and click **Cancel**: confirmed notes/revision must remain unchanged
   and no commit may be sent for Cancel. Clearing the text and saving is an
   explicit cloud change; test it only if intended, then restore with a new
   deliberately reviewed edit. Do not use clearing as uncertain-save recovery.
6. Hard-refresh, Refresh account datasets and select the same Universe and
   child. Require the exact acknowledged note. Repeat from a second independent
   browser profile signed into A at the same Alpha URL; this must retrieve
   notes through the server, not the first profile's cache.
7. For stale-note acceptance, open the same current revision in both independent
   profiles. Save a new fixed note in one, then submit a different note from the
   still-stale profile without refreshing it. Require Failed/REVISION_CONFLICT,
   preservation of confirmed content, and blocked editing. Cancel that dialog
   and explicitly reload; require the winner's exact note/revision, with no
   silent replay or additional commit from reload.
8. After all saves are settled, sign out A and sign into B. Notes, selection and
   drafts must disappear; B must not list/read A's Universe. Return to A and
   explicitly select/reload to retrieve only A's note. This ordinary switch
   does not prove account changes during an in-flight save.

Stop immediately on Unresolved, unexpected mutation, missing ownership evidence,
wrong name/ID/revision, or incorrect save status. Keep the original pending
operation and both sessions. Do not resubmit, clear storage, create a replacement
operation or run cleanup. Restore connectivity if needed, then use only explicit
server reload/original-receipt recovery; a missing receipt must keep editing
blocked. The existing interruption controller authorizes only a rename and is
not a live notes-response-loss harness. Do not repurpose it or claim a simple
offline toggle proves post-commit note response loss.

Record browser/profile labels, origin, source revision/diff, disposable scope,
entry ID, note text, revisions, safe operation IDs and each pass/fail result.
No fixture deletion or production activation is authorized by this procedure.

## Focused validation

Node tests exercise note creation/editing/clearing, preserved links and identity,
separate-cache reads, UTF-16 limits/no-op writes, acknowledged Saving, conflicts,
original-receipt recovery, missing receipts and account fencing. The Alpha-only
browser suite covers plain text/markup, Cancel, refresh/recovery, blocked editing,
draft clearing, mobile layout and unchanged beta metadata/preferences/Auth/files.
Two HTTP browser cases use separate disposable Chrome profiles against a local
synthetic service to check persistence and stale-note rejection. They make no
live Supabase request and do not replace manual acceptance above.

Use external process timeouts when running locally: 30 seconds for focused Node
tests, 15 seconds for packaging, 60 seconds per HTTP notes browser case, and
90 seconds for the Alpha-only browser suite. On timeout terminate only the
newly created test process tree, never an unrelated server or browser profile.

Checkpoint validation on October 30, 2026: 108 focused Node tests passed (including
35 Alpha tests), four packaging tests passed, both HTTP notes browser cases
passed individually, and 70 Alpha/editor/beta-isolation browser checks passed.
All completed within those external bounds; no timeout termination was needed.
The HTTP cases used two actual separate temporary browser profiles. The UI
suite also checked note-save account changes and late-response fencing with a
synthetic session. These remain automated evidence, not live notes or live
in-flight account-switch acceptance.
