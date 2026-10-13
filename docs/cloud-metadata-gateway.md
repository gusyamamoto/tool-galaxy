# Cloud metadata gateway — Step 4

This step adds an explicit transport boundary, not cloud persistence. Cosmifold
still reads and writes its local v5 metadata and IndexedDB files. Signing in does
not upload or associate that local Cosmos with an account. Backup/Restore,
hierarchy, layout, physics and the account UI are unchanged.

The user reports that the permanent migration is installed in Supabase, all six
private tables have forced RLS, only the five intended public RPCs are exposed,
automatic table exposure is disabled, `cosmifold_private` is not exposed, and the
Data API extra search path is `public, extensions`. Codex has not connected to
the project or executed live RPCs in this step. The earlier rollback-only SQL
validation is documented in [database validation](cloud-metadata-validation.md).

## Live RPC boundary checkpoint

Recorded October 12, 2026: the user reports that the real local-browser
diagnostic passed against the installed Supabase project. Codex did not connect
to Supabase or execute the diagnostic/cleanup.

| Live check | Reported result |
| --- | --- |
| Anonymous list | Rejected |
| Authenticated `listOwnedUniverses()` | Succeeded; initially returned 0 Universes |
| Explicit disposable empty Universe creation | Succeeded |
| Authenticated list after creation | Included the disposable Universe |
| Authenticated read | Returned the empty Universe with revision `0` |
| Anonymous read | Rejected |
| Local Cosmos metadata upload | None |
| Generated guarded SQL cleanup | Returned exactly **1 row**, confirming the disposable Universe was removed |

This closes Step 4's real authenticated/anonymous HTTP list/create/read gate
and verifies the guarded cleanup for that empty test Universe. It does not
claim a post-cleanup list check, real metadata commit/receipt HTTP behavior,
second-owner HTTP isolation, private-table/GraphQL HTTP probing or concurrency
testing. No semantic metadata commit was needed for this checkpoint.

**Step 4 is ready to commit as the inactive gateway foundation.** Production
cloud activation and Step 5 repository work remain separate approvals.

Documentation-checkpoint verification: the focused gateway, diagnostic, Auth,
projection, SQL static and validation-generator suites were rerun locally;
**95 tests passed**. `git diff --check` passed. This update changes documentation
only; implementation and migration SQL are unchanged.

## Shared client ownership

```text
Account UI -> unchanged Auth service -> Supabase Auth adapter ─┐
                                                             ├-> shared lazy SDK client
Future repository -> explicit metadata gateway ───────────────┘

Current Cosmos UI -> existing local repository -> localStorage / IndexedDB
```

`getSharedSupabaseClientProvider()` owns one configured SDK client per page.
`getClient()` coalesces concurrent construction and permits a fresh attempt if
SDK loading/construction fails. It uses the existing `auth-config.js` public
configuration and the unchanged pinned **Supabase JS 2.117.3** CDN URL/SRI.
Session persistence, automatic refresh, URL detection and PKCE flags are
unchanged. No extra client or token store is created for metadata.

Auth adapter and gateway each remove their own subscription when disposed;
borrowed-client disposal does not stop another consumer's token refresh. The
provider owner alone tears down the client's refresh lifecycle. Config/SDK
injection remains supported for isolated tests. Blank configuration stays lazy,
and Auth initialization still does not gate loading the local Cosmos.

`index.html` loads the shared provider before the Auth adapter. It does **not**
load or instantiate the cloud gateway, contract or projection. No cloud
bootstrap, starter Universe, cache switch or repository commands are wired up.

## Gateway API

`createSupabaseMetadataGateway({provider})` is injectable; its default provider
is shared with Auth. All methods return Promises. The only transport is
`client.schema('public').rpc(...)`, with SDK retries explicitly disabled on
every request. There are no table, Storage, realtime or file APIs.

| Method | Installed RPC / arguments | Validated result |
| --- | --- | --- |
| `listOwnedUniverses()` | `cosmifold_list_universes`, `{}` | Array of `{id, owner_id, revision}`; empty is success |
| `createUniverse(universeId)` | `cosmifold_create_universe`, `{p_universe_id}` | Full supported semantic projection, including revision |
| `readUniverse(scope)` | `cosmifold_read_universe`, `{p_scope}` | `{status: 'found', metadata}` or `{status: 'absent', metadata: null}` |
| `commitMetadata(command)` | `cosmifold_commit_metadata`, `{p_command}` | Contract-bound acknowledgement with revisions/status/replay flag |
| `getOperationReceipt(scope, operationId)` | `cosmifold_operation_receipt`, `{p_scope, p_operation_id}` | `found` with server digest/replay acknowledgement; or distinct `absent`/`missing` with null acknowledgement |

`scope` is `{ownerUserId, universeId}`. The caller explicitly supplies the new
Universe UUID; the gateway never generates one or creates anything automatically.
The server's existing create RPC is idempotent by UUID and may return an existing
owned Universe without clearing it. It has no operation receipt; reconcile an
uncertain create by reading/listing the same UUID.

Commands retain the approved Step 1 envelope and SQL Step 3 row-patch payload.
This transport does not plan mutations or implement repository commands.
Decimal revision strings are preserved without conversion to JavaScript Number.
Each private call requires a current SDK session; an explicitly supplied scope
must match its authenticated user. SDK auth notifications plus a post-response
session check reject account changes during a request. Server ownership checks
and forced RLS remain authoritative; local session checks do not prove JWT
validity or replace server authorization.

Responses pass strict JSON validation and the Step 2 projection or Step 1
acknowledgement validator. Summaries/receipts/status wrappers have exact shape
checks, unique IDs and scope binding. Returned objects are independent copies.
Invalid versions, relationships, ordering, attachments or presentation fields in
semantic projections are rejected, never repaired or silently dropped.

## Errors and uncertain outcomes

Gateway errors contain safe codes/reasons, `outcome`, `requiresReconciliation`
and applicable owner/Universe/operation/base-revision correlation fields. They
contain no raw SDK errors, request payloads, sessions, tokens or credentials.

| Failure | Code / handling |
| --- | --- |
| No session / wrong owner | `UNAUTHENTICATED` / `FORBIDDEN`, before transport where detectable |
| No config, unavailable SDK/session | `AUTH_UNAVAILABLE`, no request dispatched |
| SQL `CM003` | `REVISION_CONFLICT`, definite non-commit |
| SQL `CM004` | `INVALID_COMMAND`, reason `OPERATION_ID_REUSED` |
| SQL `CM005` / integrity constraints | `INVALID_METADATA` |
| SQL `CM006` | `UNSUPPORTED_ATTACHMENTS` |
| SQL `CM007` | `INVALID_COMMAND`, reason `UNIVERSE_ABSENT` |
| SQL invalid arguments/revision exhaustion | `INVALID_COMMAND` with safe reason |
| SQL unauthenticated/permission denied; JWT errors | `UNAUTHENTICATED` / `FORBIDDEN` |
| SQL serialization/deadlock/cancel rejection | `TRANSACTION_ABORTED`, definite non-commit |
| Missing/ambiguous RPC or schema cache configuration | `RPC_UNAVAILABLE`, definite non-commit |
| Read transport/unclassified server failure | `NETWORK_UNAVAILABLE` |
| Malformed read/receipt/list | `INVALID_RPC_RESPONSE` |
| Mutation transport/unclassified server failure or session change | `OUTCOME_UNKNOWN`, reconciliation required |
| Malformed mutation result | `INVALID_ACKNOWLEDGEMENT`, reconciliation required |

Only recognized database/API failures are considered definite non-commits.
An unclassified write failure can mean that the server committed but its reply
was lost. Do not generate a new operation ID, apply optimistic success, or
silently retry. Future Step 5 repository code must retain the immutable original
command, inspect its receipt and deliberately retry the identical command when
appropriate. A valid replay acknowledgement can refer to an older revision than
the Universe's current revision.

The receipt digest is preserved as a server-produced SHA-256 string. The
gateway does **not** compare it to browser `JSON.stringify` output: PostgreSQL
JSONB canonical text is not the browser's serialization. The server remains
responsible for detecting operation-ID reuse with different content. Receipts
are validated for identity and acknowledgement invariants, not speculative
client digest reconstruction.

The pinned SDK supports per-request `.retry(false)`;
[Supabase retry controls](https://supabase.com/docs/guides/api/automatic-retries-in-supabase-js).

## Manual browser HTTP diagnostic

This temporary test page is **not linked from normal Cosmifold**:
`dev/cloud-metadata-diagnostic.html`. It is blocked outside loopback HTTP/HTTPS
origins. There are no requests until its explicit Run button is pressed. It
does not ask for, display, log or copy an access token.

1. Start the normal local static server at the repository root. For example:

   ```powershell
   python -m http.server 5500 --bind 127.0.0.1
   ```

   If another server already serves that port/root, use it instead. Use the same
   origin for both tabs; do not switch between `localhost` and `127.0.0.1`.
2. Open `http://127.0.0.1:5500/` and sign in normally. Keep that tab open. The
   local redirect must already be allowed in Supabase Auth, as in the verified
   Auth setup. No dashboard edits or credentials are needed for this test.
3. In another tab open
   `http://127.0.0.1:5500/dev/cloud-metadata-diagnostic.html`.
4. Read the description, then press **Run boundary checks (creates test Universe)**.
   The report checks, in order:
   - real anonymous list request is denied;
   - authenticated list succeeds (zero Universes is a valid initial result);
   - explicitly creates a disposable empty Universe using a fresh UUID;
   - authenticated list sees it;
   - authenticated read returns a valid empty projection and revision `0`;
   - real anonymous read of that UUID is still denied.
5. A complete PASS report proves these HTTP list/create/read checks for this
   account. Record the UUID and the generated cleanup SQL before closing.

The schema has no Universe name column. **Cosmifold disposable RPC boundary test**
is its clear label in the diagnostic/report, paired with the UUID. No artificial
entry or schema field is added just to give the empty Universe a name.

Anonymous probes use native fetch with only the public publishable API key,
no Authorization JWT and `credentials: omit`. They neither sign out the normal
tab nor construct a second SDK client. Only HTTP 401/403 with recognized
permission/Auth error codes counts as rejection; 404, 5xx, network failures or
unexpected success do not. Authenticated calls go through the actual gateway
and shared SDK/session storage. No `commit_metadata` call is made in this test.

While this page remains open, an explicit rerun reuses the same UUID and does
not create an additional Universe. Repeated/concurrent clicks are guarded. On
an uncertain create, stop and inspect/read the recorded UUID before deciding
to rerun. Reloading loses the in-memory test identity, so keep the report.
No local Cosmos, preferences, files or backup data is read or changed.

### Removing the disposable Universe

Use the **Manual cleanup** SQL shown by the page in the Supabase SQL Editor,
under its normal administrative role. It is an exact owner/Universe UUID delete,
guarded by revision `0` and absence of rows in all five child tables. It returns
the deleted row. One row means removed; zero means already absent or changed.
Do not remove guards or force/cascade-delete a changed Universe. There is no
delete RPC or normal-user cleanup UI in this milestone.

Codex does not run this diagnostic or the cleanup against the live project.
No secret key, password, token paste, CLI or deployment is needed. Removing this
temporary diagnostic later means deleting the four `dev/cloud-metadata-diagnostic*`
files and their dedicated unit/browser checks/documentation; the normal app has
no link or dependency on them.

## Verification and stopping gate

```powershell
node --test tests/metadata-gateway.test.js tests/metadata-diagnostic.test.js tests/auth.test.js tests/cloud-metadata.test.js tests/cloud-schema.test.js tests/cloud-validation.test.js
python tests/browser-check.py --auth-only --screenshots
python tests/browser-check.py --static-hosting-only
```

Mocks cover shared client ownership, lazy/retryable loading, session isolation,
all five public RPC mappings, validation, expected failures versus uncertain
outcomes, receipt/replay/no-op/revision precision, account switches, no mutation
retries and the diagnostic's ordered/anonymous/loopback/cleanup behavior.
Browser regression tests inject fake Auth before application initialization and
never connect to the configured real project. The actual JWT/PostgREST
list/create/read gate was subsequently closed by the user-reported live run
above; the manual instructions remain available for deliberate future reruns.

Local results for this step: **165 targeted Node tests passed** (gateway,
diagnostic, Auth, projection, SQL static/generator, persistence, Backup/Restore),
**58 Auth/diagnostic browser checks passed**, and **204 static-hosting browser
checks passed**. The latter verified the new shared-client script's asset/MIME/
cache loading, existing CSP, local workflow persistence/reload, IndexedDB
originals/thumbnails/copies/download/delete, Help and Google Maps. Diagnostic
screenshots were reviewed at desktop/narrow/mobile widths. All browser sessions
were isolated test profiles with Auth/SDK/RPC mocks. These automated results
remain distinct from the subsequent user-reported real HTTP checkpoint above.

Still separate: real metadata commit/receipt HTTP behavior, independent-session
locking/races, second authenticated-owner isolation over HTTP, GraphQL HTTP
exposure, cross-device bootstrap/cache, migration decisions, files, synchronization
and offline/PWA work. The installed schema/configuration review and SQL Editor
assertions do not claim these live integration checks.

Stop at Step 4. Step 5 repository commands and production cloud activation need
their own approved work; nothing in this branch enables them.
