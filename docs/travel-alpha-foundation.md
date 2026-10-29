# Travel Alpha foundation — Milestone 1

The local beta stays at `index.html` with `applicationMode: local-beta`.
The separate `alpha.html` entry declares `cloud-alpha` and never loads beta
startup, the editor, local metadata/preferences, local file storage or Restore.
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

Account changes immediately clear displayed data and invalidate old asynchronous
work. Sign-out retains pending records for their original owner. All displayed
datasets are read-only in Milestone 1, including acknowledged cached snapshots.
No photos, editor, cloud Backup/Restore, sharing or collaboration are available.

## Next milestone

Connect the existing Universe presentation to the selected, fenced cloud dataset
and route a small allowlist of semantic metadata commands through acknowledged
repository writes. Keep file capture and local replacement Restore unavailable.
That integration, live security/migration verification, private cloud files and
portable cloud export remain blockers to the real-user Travel Alpha. This
foundation is not a deployment approval or a claim of cross-device production readiness.

## Regression checks

`node --test tests/travel-alpha.test.js` exercises owner fencing, opt-in Auth
storage, explicit discovery/selection, empty provisioning, concurrent creation
and uncertain outcomes. `python -B -m unittest discover -s tests -p '*package_test.py'`
checks both separate artifacts. `python -B tests/browser-check.py --travel-alpha-only`
checks default-off source/build entries beside real beta storage and exercises
the authenticated bootstrap with a test-only SDK. These are mock cloud checks,
not evidence of live Supabase security or cross-device readiness.
