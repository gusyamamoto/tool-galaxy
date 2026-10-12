# Static hosting for Cosmifold

This phase prepares Cosmifold to run at a normal HTTPS web address. It does **not** make your data cloud data: each browser still stores its own Cosmos and files locally. There is no backend, account, upload service or cross-device sync yet.

Nothing has been deployed or connected by this branch. The instructions below describe the staged GitHub connection and deployment to perform only after review.

## What is ready

The existing application was already static-host compatible. `index.html` loads one local stylesheet and ordered classic JavaScript scripts, including the existing vendored D3 bundle. Relative paths preserve the current application layout. Artwork/icons are generated or inline SVG; media previews use local data/Blob URLs. There are no runtime Windows paths, filesystem URLs, localhost endpoints, workers, service workers, remote fonts, mapping APIs or application API calls.

The `http://www.w3.org/...` strings in SVG/HTML namespaces identify standards; they do not fetch insecure resources. Bookmarks may deliberately link to external HTTP sites, but Cosmifold does not embed those pages. Location uses the existing HTTPS Google Maps search link, with an encoded query, a new tab and `noopener noreferrer`.

Production must use HTTPS. Browser APIs such as `crypto.randomUUID()` are available in secure contexts; loopback HTTP development is also a trusted context. Do not host the production app on ordinary insecure HTTP. No runtime path correction or framework is needed.

## Deployment root and settings

**The repository root containing `index.html` is the application root.** No `dist/`, `build/` or `public/` application copy is required. The directory can be served directly by a static host.

Create the primary production project with **Cloudflare Pages + GitHub Git integration from the beginning**. The eventual workflow is `GitHub main → production`. A Direct Upload project cannot later be switched to Git integration without creating another project, so it is not the recommended production setup. [Cloudflare's project-type restriction](https://developers.cloudflare.com/pages/get-started/direct-upload/).

| Setting | Proposed value |
| --- | --- |
| Hosting product | Cloudflare Pages |
| Deployment method | Git integration with the Cosmifold GitHub repository |
| Production branch | `main`, selected explicitly |
| Framework preset | None |
| Build command | None; leave blank |
| Build output directory | `.` — existing application root |
| Root directory | Default repository root; leave blank |
| Automatic production deployments during validation | Disabled after the deliberate initial deployment |
| Automatic preview deployments during validation | None |
| Functions / backend | None |
| Application environment variables / secrets | None |
| Initial address | `https://<project>.pages.dev/` |

These are Git-integrated project settings. A framework-free app can leave the build command blank; Cloudflare also documents `exit 0` as an explicit no-op alternative if the setup screen requires one. Neither installs tooling or compiles the app. [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

Choose the actual project name later; `cosmifold.pages.dev` is an example, not a reserved address or an existing deployment.

### Review what the Git project will publish

With output directory `.`, treat the checked-out application root as public deployment content. Review the selected commit before connecting or deploying: never commit credentials, local backups, private screenshots or user files there. A private GitHub repository does not make served assets private. Documentation and tests in that root may also be publicly reachable; do not assume Git integration filters them into a runtime-only allowlist.

Keep `index.html` at the repository root, with `persistence/`, `services/` and `vendor/` in their existing relative positions. Keep vendor licenses/notices. No ZIP packaging helper or copied build directory is needed. The retired source-only ZIP was not a backup/export of browser metadata or IndexedDB attachments; real Export/Restore remains a separate future feature.

## Staged Git deployment — later, after explicit review

1. Review and approve the exact `main` commit containing the hosting preparation; run the checks below and audit its public files. Keep further `main` pushes paused throughout initial project setup. This task does not commit, push, connect or deploy anything.
2. Once connection/deployment is explicitly authorized, create a Pages project using **Connect to Git**, grant the GitHub integration access to the intended Cosmifold repository, and select it. Do not create a Direct Upload project. [Git setup guide](https://developers.cloudflare.com/pages/get-started/git-integration/).
3. Explicitly choose `main` as production and use the root/static settings above. Creating the project with **Save and Deploy** starts the initial build/deployment; treat that as deliberate publication of the reviewed commit, not a harmless connection-only step. Record its commit and deployment ID.
4. As soon as project settings are available, disable the production automatic-deployment toggle and set preview deployments to None; save and verify both settings before allowing more pushes. The documented controls are under **Settings → Builds/Builds & deployments → Branch control/Production deployments** (dashboard wording varies). Cloudflare calls the production toggle **Enable automatic production branch deployments**. These controls are supported today. If the actual dashboard lacks them, stop and review the setup rather than assume pushes are safe. [Branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/).
5. Verify the initial HTTPS deployment deliberately with disposable data: create a Galaxy/items, add content/files, reload, use Copy/Link/Structure, open Help and check Maps and response headers. Keep automatic production and preview deployment disabled throughout validation. Do not add Wrangler, Actions or deploy hooks to bypass the pause.
6. Later, only after an explicit decision, re-enable automatic production deployment for `main`. Choose preview controls separately; they can remain None. Protect/review changes to `main` so the normal workflow becomes `approved main push → production`. Git integration is already established, so this requires no replacement production project or origin change.

Git integration defaults to automatic deployments, so pausing production alone is not enough if previews remain enabled. Do not claim the first creation/build can be paused before settings exist. During the pause, do not assume a new `main` commit deploys, or that retrying an existing deployment fetches a new commit. Any additional validation deployment must be a separately reviewed action. [Git deployment defaults and pause controls](https://developers.cloudflare.com/pages/configuration/git-integration/).

These steps are documentation only. Use the stable project address for ongoing local data; preview/deployment-specific addresses have separate browser origins.

## Browser-local data: the important warning

These are separate browser origins and therefore separate local datasets:

```text
http://127.0.0.1:5500       -> that browser's existing local Cosmos
http://localhost:5500      -> another origin, even on the same computer
https://<project>.pages.dev -> its own local Cosmos and IndexedDB files
https://cosmifold.com      -> another origin if connected later
```

Scheme, hostname and port matter. Browser profiles/devices also keep separate storage. A fresh hosted origin initializes its own normal local Cosmos; it does not read or remove the one at `127.0.0.1`. This is expected. [Browser storage origin behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

The hosted application keeps the existing `galaxy:user-data` v5 metadata, `galaxy:navigation-ui` preferences and `galaxy-attachments` IndexedDB database (binary DB version 1). Notes, Bookmarks, Location, collections, linked placements and archive/layout data remain browser-local. Files, Media and thumbnails remain in IndexedDB and are not part of the Git deployment. No credentials are required by the app.

There is no auto-import, browser-storage workaround or upload of localhost data. Keep the original browser profile/origin available. Export/Restore will provide safe portability in the next product phase. Do not promise that hosting protects against clearing site data, private-session loss or browser storage eviction.

## Headers and compatibility

The root [_headers](../_headers) file applies one `/*` rule to static responses. Cloudflare interprets this file as configuration rather than serving it as a regular asset. [Pages headers](https://developers.cloudflare.com/pages/configuration/headers/).

| Header | Decision |
| --- | --- |
| `X-Content-Type-Options: nosniff` | Require correct JavaScript/CSS/media MIME types rather than guessing. |
| `Referrer-Policy: strict-origin-when-cross-origin` | Standard restrained referrers for external navigation. |
| `Permissions-Policy: geolocation=(self), camera=(self), microphone=(self)` | Permit these capabilities for the same-origin app, subject to normal browser permission; do not globally disable them for possible future features. No use of these capabilities is added. Sharing is not disabled. |
| `Cache-Control: no-cache` | All stable-name static resources must revalidate before reuse. No year-long immutable caching. |
| `Content-Security-Policy` | Enforce the compatible policy described below. |

### CSP decision

All application scripts are external same-origin files, and the vendored bundle does not require dynamic evaluation. Script execution is restricted to `'self'`; there is no script `'unsafe-inline'` or `'unsafe-eval'`.

Styles permit `'unsafe-inline'` because current rendering/menus use dynamic style properties and SVG/style generation. Images permit same-origin, `data:` and `blob:` for generated artwork/thumbnails. Media permits same-origin/Blob sources; PDF objects permit `blob:`, and frames permit same-origin/Blob sources for native viewing. Connections permit same-origin/Blob reads. Base tags and framing the app are blocked, and forms stay same-origin.

The policy intentionally does not block ordinary external link navigation or rewrite user Bookmark URLs. It does not ban current native PDF/Blob viewing to satisfy a blanket `object-src 'none'` rule. No application code was refactored to satisfy CSP. Any future cloud SDK/API, external map embed, worker or remotely served media needs an explicit policy review; do not silently weaken it globally. [CSP reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).

### Cache policy

Current assets are named `script.js`, `style.css`, etc., with no content hashes. `no-cache` allows a browser to keep bytes but requires freshness validation. Apply it to HTML and all assets to reduce mismatched/stuck releases. Existing tabs keep their already-running version until reload; this is not hot deployment. Keep Pages' platform caching defaults otherwise and do not add a custom “cache everything” rule. Cache policy is not a guarantee that a release switch occurs between every asset request at exactly the same instant; publish a complete release and test ordinary reload afterward.

### URLs and missing pages

Cosmifold uses `/` or `index.html`, with a query parameter for temporary Sample mode; it has no client-side pathname routes. There is no `_redirects` file or SPA router.

The small root [404.html](../404.html) prevents Pages' default SPA fallback and keeps unknown addresses/missing files as real not-found responses instead of returning app HTML as JavaScript. Pages may canonicalize HTML URLs; use `/` as the main app address. [Pages route/404 behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/).

Some browsers probe `/favicon.ico` even though the existing app declares no favicon. A not-found response to that optional browser probe is not a failed app dependency; the smoke test reports it separately. All declared app assets must resolve correctly. No app icon/design change is made in this phase.

## Local verification

Serve the **actual application root**, not a duplicate build folder. For a quick manual check using a standard-library static server:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/` and stop the server with Ctrl+C. This stock server serves files but does **not** interpret `_headers`. The automated browser harness uses the same simple static-server approach and emulates our single catch-all header rule, so CSP/cache/MIME checks also run without Cloudflare tooling or a connection.

```powershell
python tests/browser-check.py --static-hosting-only
python tests/browser-check.py --media-only
python tests/browser-check.py --attachment-viewer-only
python tests/browser-check.py --sidebar-copy-paste-only
python tests/browser-check.py --everyday-only
python tests/browser-check.py --locations-only
python tests/browser-check.py --duplicate-structure-only
python tests/browser-check.py --help-only
python tests/browser-check.py --consolidation-only
```

Run all existing unit tests on PowerShell:

```powershell
$testFiles = @(rg --files tests -g '*.test.js')
node --test @testFiles
```

Browser checks launch Chrome/Edge with disposable profiles and a temporary-port server. The hosting smoke uses `http://localhost:<temporary-port>`, discovers required assets directly from HTML/CSS and audits their MIME types/headers, checks console/network/CSP issues and ordinary reload, and verifies v5 metadata plus IndexedDB upload/thumbnail/copy/delete/download behavior. It also verifies that the same app served at `127.0.0.1` does not see localhost metadata/files. External Maps URLs retain their encoded HTTPS queries and safe new-tab attributes; no Google API is called. Asset discovery is test-only; it does not package or deploy anything.

The browser tests emulate our headers, not all Pages routing/CDN/TLS behavior. Real HTTPS publication has not been tested because no deployment is authorized yet; repeat the smoke checklist on the actual HTTPS address after the later manual deployment.

## Rollback

Later, choose a known-good **production** deployment in the Pages project's Deployments list and use **Rollback to this deployment**; previews are not rollback targets. Keep the project/hostname unchanged and verify the deployment's commit ID. Keep the production automatic-deployment pause in place during validation; re-enabling it is a separate decision. [Cloudflare rollback instructions](https://developers.cloudflare.com/pages/configuration/rollbacks/).

A static rollback changes served application files, not localStorage/IndexedDB in visitors' browsers. Do not clear site data as part of rollback. Only roll back to code known to understand the current v5 fields and attachment behavior; older v5 readers can still omit newer optional fields during subsequent saves. Retest reload and content using a disposable profile. A rollback is not a user-data backup or restore.

## What comes later

The next coding branch should be **`feature/local-backup-export`**, following [the cloud foundation plan](cloud-foundation-plan.md): portable metadata, original file bytes and thumbnails, while preserving the source. Staged Restore follows. Accounts, awaitable/cloud persistence, private cloud files and cross-device sync are separate later branches.

PWA installation, service workers, offline asset caching and push notifications are also later work. No manifest/service worker is added here.

A custom domain would later be connected under the Pages project's **Custom domains** settings. No domain/DNS change is made now, and moving to a custom domain is another origin change requiring a portability plan.

Stopping gate: statically hostable application root, compatible headers and a reviewed staged Git-integration plan. No Cloudflare/GitHub connection, deployment or automatic workflow is configured in this branch. No CLI, Actions, credentials, dependencies, backend, accounts, Supabase, data migration or sync are added.
