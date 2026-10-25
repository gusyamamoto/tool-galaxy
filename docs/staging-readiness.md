# First public staging: local-only static deployment

This is an early external test, not a production launch. No deployment, account
activation, cloud persistence, sync, paid feature or database action is part of
preparation. Keep one stable HTTPS staging hostname for testers' local data.

## Prepare exactly the public files

From the repository root, run once into a new output directory:

```powershell
python -B scripts/prepare-staging.py
python -B tests/staging_package_test.py
python -B tests/browser-check.py --staging-only --site-root staging-site
```

The current artifact contains 61 declared static files, including the existing
404 page, headers and vendor notices; the preparation command reports the actual
discovered inventory. Scripts, styles and their existing relative locations are
preserved. There is no compilation, framework, package installation, migration or
duplicated source tree to maintain. The helper discovers HTML/CSS asset references;
`script.js`, dynamically loaded by startup, is already declared as an HTML preload.
Any future dynamic local asset must also be declared/reviewed in that inventory.

The generated directory is ignored by Git. The helper refuses any existing output
directory rather than deleting or overwriting files. To prepare another reviewed
artifact, choose a new dedicated path with `--output`; pass that path to the test
and host. Never upload the repository/working directory: it contains development
diagnostics and retained forensic/operator evidence, including ignored files.
They remain untouched locally. The artifact includes no `dev/`, `tests/`, `docs/`,
`scripts/`, `supabase/`, Git directory, local backups or forensic files.

Two generated files deliberately differ from source:

- `auth-config.js`: an empty frozen public configuration, using the existing
  unavailable-account path. It never initializes the remote SDK/session.
- `_headers`: existing security, MIME, permission and cache rules, with external
  SDK/project permissions removed from `script-src` and `connect-src`.

Source Auth configuration and production cloud behavior remain unchanged. Startup's
missing-main-script error now releases the workspace lock, disables controls, and
displays a reload instruction. Unconfigured accounts are labeled “Account” rather
than inviting “Sign in”; configured account flows are unchanged. Existing
storage-failure handling remains intact.

## Exact first-deployment settings

Use a separate Netlify staging site and manually upload **only `staging-site/`**
after review. Do not connect automatic deployment in this task.

| Setting | Value |
| --- | --- |
| Framework | None / static HTML |
| Public directory | `staging-site` (its contents, with `index.html` directly at URL `/`) |
| Entry | `index.html` |
| Build command on host | None for the prepared manual upload |
| Local preparation | `python -B scripts/prepare-staging.py` |
| Environment variables / secrets | None |
| Functions / backend | None |
| SPA rewrite / `_redirects` | None |
| Headers | Generated `_headers` in the uploaded folder |
| HTTPS | Use the assigned HTTPS site URL; keep it stable |

If Git deployment is deliberately chosen later, base directory is the repository
root, preparation command is `python3 -B scripts/prepare-staging.py`, and publish
directory is `staging-site`. This is an asset-copy/configuration step, not an app
build. No `netlify.toml` is necessary; these settings also work on another static
host that supports equivalent response headers. No project or hosting connection
has been created. Netlify reads `_headers` from the publish directory:
[build settings](https://docs.netlify.com/build/configure-builds/overview/),
[custom headers](https://docs.netlify.com/manage/routing/headers/).

Cosmifold uses one page at `/` or `/index.html`, not pathname routes. Root direct
load, reload and reopening use that same entry. Query parameters are supported;
no catch-all SPA fallback is required. Keep unknown pages and missing assets as
404s. The existing `404.html` links back to `/`.

## Audit findings

Every matching localhost/LAN/Live Server/Windows-path/file-URL line is classified
in [the reference inventory](staging-local-reference-audit.md). No runtime endpoint
or asset depends on a development machine. Runtime occurrences of “localhost” are
only helpful HTTPS/storage capability messages. Tests, operator scripts, docs,
explicit `dev/` diagnostics and retained evidence are excluded from staging.

Other URL categories were reviewed separately:

| Reference | Purpose / staging treatment |
| --- | --- |
| SVG/XHTML namespace strings in rendering | Standard identifiers, not network requests or mixed content |
| Google Maps HTTPS search in `model.js` | Explicit external navigation with an encoded query and safe link attributes; no API/embed |
| Saved link URLs | Validated external navigation, never automatic remote previews |
| Sample links in `sample-data.js` | Only explicit temporary Sample mode; no automatic content |
| Supabase project in source Auth configuration / headers | Public project/publishable configuration; omitted from generated staging configuration/permissions |
| Pinned SDK URL in `services/supabase-client.js` | Dormant descriptor; no SDK request with unconfigured Auth, and staging CSP permits no external script |
| Auth callback URL | Derived from current page origin in the adapter; inactive in staging |
| Blob/data URLs | Generated images, native file viewing/download and stored previews; existing CSP permits them |

There are no local data fetches, module imports, workers, runtime filesystem paths,
remote fonts or additional asset servers. The 51-file inventory resolves with
compatible MIME types. Console output consists of meaningful backup/restore/startup
errors and explicit Sample failures; no routine debug spam or sensitive dumps
were found in the staging runtime.

Credential scanning found no private API key, password-bearing database URI,
private key, service-role JWT or real privileged token. Privileged-key-shaped
strings in `tests/cloud-boundary.test.js` are synthetic redaction/rejection fixtures
and are excluded. The source Supabase publishable key is intentionally public,
not a secret; the offline artifact replaces that configuration anyway. Retained
forensic identities are private operational evidence and are not published.
This is a working-tree/source audit, not a guarantee about Git history or future files.

## Browser APIs and persistence

- IDs use the existing shared `crypto.randomUUID`/`getRandomValues` fallback.
  HTTPS supports the normal path; insecure-LAN compatibility remains unchanged.
- Native camera/gallery/file inputs use the same FileList/validation/attachment
  pipeline. No `getUserMedia` integration or permission shortcut is added.
  Originals/names remain intact. HEIC/HEIF decode failures keep originals and
  the existing preview fallback; actual device codec support still varies.
- Notes, Links, Location, hierarchy, Constellations, rename/Move/delete and file
  metadata use existing v5 local storage; binary originals/thumbnails stay in
  the existing origin-scoped IndexedDB store. No storage format changes.
- Copy/Paste uses the page-local clipboard, not the OS Clipboard API. Location
  is text plus a Maps link, without geolocation permission/API.
- Backup uses Web Crypto and ordinary Blob downloads. Safe Restore uses Web Locks;
  existing capability checks disable unsupported Restore with an explanation.
- Modern Chrome is the automated browser target. Modern Safari/iOS is expected
  to use the same paths; native capture, codecs, downloads, quota/private browsing,
  keyboard behavior and standalone shortcuts require physical-device review.

The smoke test uses a trusted loopback HTTP origin with real secure-context APIs
and real localStorage/IndexedDB under the staged CSP. It verifies direct entry,
ordinary/hard reload, tab reopening, all content types, hierarchy mutations and
collection persistence, plus native file bytes/thumbnails. It uses the **actual
unconfigured Auth adapter**, no Auth stub, blocks external requests and asserts
none were attempted. Expected missing-script/storage failures are injected only
after the clean startup/network check, and retained data is rechecked afterward.

This does not verify public TLS/CDN behavior, a complete browser-process restart,
Android native picker UI or Safari. Those are post-deployment device checks.

Local storage belongs to the exact scheme/hostname/port/profile. LAN/localhost data
does not appear at staging; preview URLs, another device, a custom domain and
private browsing have independent data. Reopen the same stable site/profile.
Clearing site data or browser eviction can remove it. Use Backup for test data
worth keeping; do not present staging as trusted long-term storage or cloud backup.

## Account, developer UI and installability

Cloud persistence remains `local`, Auth is unconfigured, and sync is `none`.
The existing Account control opens “Accounts aren't connected yet” without login
fields or an actionable account request. Changing to HTTPS cannot activate cloud
writes. No production account or paid flow is enabled. Help/Backup and that existing
account explanation are sufficient; no warning banner/onboarding redesign is added.
Tell testers in the invitation that this is an early local-only build.

Normal UI exposes no Sample/developer utility or debug overlay. Existing invisible
debug functions and explicit `?sample=large` remain for developer use. No sample
data is loaded automatically or made permanent.

There is no manifest, service worker, app icon set, theme-color metadata or install
hook. No PWA is added. Browser/home-screen shortcuts simply reopen the HTTPS URL;
there is no offline-asset or native Gallery-saving promise. An optional favicon
probe may return 404; all declared app dependencies must succeed.

## Required post-deployment checks (disposable data)

1. Open the stable root HTTPS URL on Android Chrome, desktop Chrome and modern
   Safari/iOS where available. Confirm the certificate, no mixed-content/CSP/asset
   failures, correct response headers and a real 404 for an unknown path.
2. On a fresh profile, verify empty first-run orientation, no Sample UI, no startup
   login popup. Account must show the existing unavailable explanation and make no
   Auth/Supabase/CDN requests. Cloud remains inactive.
3. Create a Galaxy/system and CBs; rename, Move and delete a disposable item. Add
   a Note, two Links, Location and a Constellation referencing an existing CB.
4. Use Take Photo, Photo Gallery and Files. Verify originals/names, visible previews
   or HEIF fallback, file scrolling and a friendly invalid-file error. Save flows
   should complete silently. Camera captures stay in Cosmifold, not automatically
   in the phone Gallery.
5. Check Compact ↔ Contents, title-tap rename, keyboard-open inline actions, menus,
   terminal-label deep-to-shallow panning and desktop interactions without redesign.
6. Ordinary refresh, hard refresh, close/reopen the full browser and reopen a saved
   shortcut. All saved content/hierarchy/collections and attachment bytes must
   remain on the same origin/profile. Verify Backup/download; use only disposable
   data if testing Restore.
7. Invite external testers only after these pass. Do not migrate localhost data,
   clear storage, activate accounts/cloud or change the hostname as part of testing.
