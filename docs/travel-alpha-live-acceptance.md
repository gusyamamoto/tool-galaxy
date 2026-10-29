# First live Travel Alpha editor acceptance

This is an operator procedure, not an activation already performed. Milestone 2
tests use synthetic Auth/RPCs. Existing live diagnostic history in
[activation gates](cloud-activation-gates.md) does not prove this editor path.
Do not repurpose the browser-local beta or an existing deployment folder.

## Prepare one disposable local Alpha

1. Confirm the intended Supabase test project retains the approved five
   authenticated-only public RPCs, ownership checks, forced RLS and private-schema
   exclusion described in [the boundary checkpoint](cloud-boundary-integration.md)
   and [RPC grants](cloud-rpc-grants.md). Retain the closed gates' evidence and
   inspect any configuration changes since that checkpoint. Provision two
   confirmed, disposable Auth users, A and B; the Alpha UI supports sign-in, not
   account creation or password recovery yet. Do not change database grants or
   run migrations merely to start this test.
2. Build into a **new** temporary directory:

   ```powershell
   python -B scripts/prepare-alpha.py --output "$env:TEMP\cosmifold-alpha-m2-live-1"
   ```

   The generated build is deliberately disabled. After reviewing the artifact,
   edit **only its** `alpha/config.js`: retain mode `cloud-alpha`, milestone `2`
   and Auth key `cosmifold:travel-alpha:auth:v1`; set `cloudEnabled: true`,
   `allowedOrigin: 'http://127.0.0.1:5042'` and `localBetaOrigin` to the actual beta
   origin, which must differ. Do not edit source/beta/deployment configuration.
3. In that artifact's `alpha/auth-config.js`, define `cosmifoldAuthConfig` as a
   frozen object containing `SUPABASE_URL: 'https://<project>.supabase.co/'` and
   `SUPABASE_PUBLISHABLE_KEY: '<project publishable key>'`. Never use a secret,
   service-role key, password or token in configuration. Serve only this artifact:

   ```powershell
   python -m http.server 5042 --bind 127.0.0.1 --directory "$env:TEMP\cosmifold-alpha-m2-live-1"
   ```

   Open `http://127.0.0.1:5042/` in a disposable browser profile. This is loopback
   testing, not deployment. Python's basic server does **not** apply `_headers`.
   A future header-aware/private HTTPS host must retain the security headers and
   explicitly permit only the pinned SDK's CDN in `script-src` and the selected
   project in `connect-src`; the generated artifact currently forbids both.
   Do not upload this manually configured artifact or the repository.

## Acceptance and recorded evidence

1. Sign in as A. Discover owned Universes without automatic selection/migration.
   Click Create empty test Universe once; record its exact owner UUID and Universe
   UUID. It must be empty at revision `0`. Use only this disposable Universe.
2. Create Galaxy `Mexico Alpha` (revision `1`), add `Hotel` inside it (`2`), then
   rename that Item `Oaxaca stay` (`3`). Each action must show Saving followed by
   Saved, once. Record the public commit acknowledgements' operation IDs and
   revisions without recording Auth headers/tokens or passwords. Confirm exactly
   two entries and the child's original ID/parent ID in an authoritative read.
3. Click Reload from server. Hard-refresh the page, then Refresh account datasets
   and explicitly select the same Universe. Names, IDs and revision must survive.
   Verify the real `cosmifold_read_universe` response, rather than relying on a
   displayed cached name. Repeat from an independent browser profile signed in
   as A to exclude the first profile's cache.
4. Open the same revision in two contexts. Rename in one, then attempt a rename
   from the stale context. The loser must show Failed, preserve confirmed content
   and block edits. Explicit server reload must obtain the winning name/revision;
   a new, reviewed rename can then succeed. Never silently replay the stale edit.
5. Sign out A, including once while a save is in flight, then sign in B. A's
   bodies, names, drafts and save status must disappear immediately and stay gone
   when late responses arrive. B must not list A's Universe. Verify the live read
   RPC rejects A's exact scope under B's session, following the existing boundary
   diagnostic procedure. Return to A and recover only A's original pending state.
6. Run controlled rejection and response-interruption cases using the reviewed
   [in-flight recovery procedure](cloud-inflight-recovery.md), scoped to this
   disposable Universe. A proven rejection must show Failed; an uncertain outcome
   must show Unresolved and retain its original operation ID. Once its real
   receipt is available, explicit reload must reconcile it once and read the
   server, without another commit request. Test a page refresh while Saving too.
   Offline alone does not prove where execution stopped. If no receipt exists,
   editing must remain blocked; do not clear the pending cache, recreate the Item
   or treat absence as proof of non-commit.
7. Confirm unsupported actions remain disabled and the existing beta's Items,
   preferences and original attachment bytes are unchanged. Record browser,
   tested origin, source revision/diff and pass/fail per case. Never attach tokens.

Stop on ownership failure, unexpected mutation, missing recovery evidence or
incorrect save status. Keep the original pending record and exact test IDs for
review. Stop the loopback server to retire the local preview; use guarded,
owner/Universe-specific cleanup from the existing diagnostics only after pending
requests are resolved. The unchanged local beta remains the fallback. A separate
private HTTPS activation and real-device/cross-device acceptance remain later
work; this procedure and mocked passes grant no deployment approval.
