# Travel Alpha foundation — Milestones 1 and 2

The local beta stays at `index.html` with `applicationMode: local-beta`.
The separate `alpha.html` entry declares `cloud-alpha` and never loads beta
startup, `script.js`, local metadata/preferences, local file storage or Restore.
Opening `/alpha.html` is safe even at the beta's origin: the default build makes
no Auth/metadata requests and starts with a new empty **preview**, not an account
or a claim that a server Universe exists. It reads no local Cosmos data.

Prepare a separate artifact with:

```powershell
python -B scripts/prepare-alpha.py --output alpha-build
```

Its root `index.html` is the Alpha entry. The builder copies declared runtime
assets only, always generates disabled Alpha configuration and blank Auth,
removes external CSP permissions, and refuses existing/staging destinations.
It does not deploy. `prepare-staging.py` and Netlify deployment folders are untouched.
Do not upload the repository or repurpose the local-beta artifact.

## Prepared authenticated bootstrap

Future activation requires a separately reviewed build/configuration change:
an exact Alpha origin different from the beta origin, public Supabase configuration
and explicit cloud enablement. Query parameters and stored browser values cannot
activate it. No live Supabase request is part of this milestone's implementation.

The Alpha uses the existing Auth adapter/client, metadata gateway, cloud repository,
workspace fencing and validated cache. Auth has an isolated storage key. Cloud cache
and creation records use `cosmifold:travel-alpha:` keys, never the beta's metadata,
Auth, preferences or IndexedDB. No automatic migration, import, merge, replacement,
dataset selection or cloud creation occurs on sign-in or reload.

After sign-in, explicit Refresh discovers owned Universes; Select opens one through
the ownership-checked workspace. Create empty test Universe allocates a new UUID,
records it durably before dispatch under an account-scoped Web Lock, and verifies
the server returned the expected empty revision-0 Universe. It never seeds from
local data or writes semantic content. Unknown creation outcomes retain the exact
identity across reload; Refresh only reads to recover it, never resends creation.
Unreadable records, absent receipts/cache and authentication errors fail closed.

Account changes immediately clear displayed data, selection, editor drafts and
navigation state and invalidate old asynchronous work. Sign-out retains pending
records for their original owner. A selected server-confirmed dataset with a
writable validated cache permits only creating and renaming Items in Milestone 2.
Cached-only and unresolved datasets remain read-only.

## Milestone 2 editor

The Alpha composition reuses `HierarchySidebar`, `GalaxyPhysics`, `GraphCamera`,
`renderCelestialBody`, shared styles and the model's derived celestial hierarchy.
It does not load the beta's locally coupled application bootstrap. Create a
Galaxy at Universe level, create an Item inside a selected body, or rename via
the name dialog or the shared desktop sidebar editor. IDs stay stable on rename.
Archived bodies are not editable. Tasks, dates, notes, files, Move, Delete and
Backup/Restore are disabled; there is no generic repository escape hatch or local
fallback. Camera, physics and navigation preferences remain transient in Alpha.

Only the existing cloud workspace/repository commits `items.created` and
`items.renamed`, with the acknowledged revision, one original operation ID and
durable preparation. The display changes after acknowledgement, never optimistically.
Saving blocks duplicate writes and dataset navigation; sign-out remains available.
Old form contexts and late responses cannot publish into another dataset/account.

The save indicator distinguishes Saving, Saved, Failed and Unresolved. Failed
retains confirmed data; conflicts require an explicit authoritative reload.
Unresolved preserves the original pending operation and blocks editing. The
Reload from server / check pending save control bootstraps that same scope,
reconciles its original receipt first, then reads authoritative metadata. It
never resends an unconfirmed write or substitutes a new operation. A missing
receipt remains unresolved, including after page reload. Neither a cache write
nor an uncertain response is reported as Saved.

Live end-to-end editor/security verification, remaining recovery gates, private
cloud files and portable export still precede real-user Travel Alpha readiness.
See [the first live acceptance procedure](travel-alpha-live-acceptance.md). This
implementation does not activate cloud or claim live/cross-device verification.

## Regression checks

`node --test tests/travel-alpha.test.js` exercises owner fencing, opt-in Auth
storage, explicit discovery/selection, empty provisioning, acknowledged edits,
conflicts, interrupted writes, concurrent contexts and uncertain outcomes.
`python -B -m unittest discover -s tests -p '*package_test.py'`
checks both separate artifacts. `python -B tests/browser-check.py --travel-alpha-only`
checks default-off source/build entries beside real beta storage and exercises
the shared editor, save states and reload/account-switch recovery with a test-only
SDK. Its synthetic server state is separate from the application's cache and
survives page reload via test-only session storage. These are mock cloud checks,
not evidence of live Supabase security or cross-device readiness.
