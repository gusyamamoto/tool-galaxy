# Account foundation

Cosmifold now has an optional email/password account surface beside **Help** and
**Backup**. Accounts are ready to configure, but no Supabase project is connected
in this branch. With the public configuration blank, the app still opens and
saves its local Cosmos normally, and does not download the Auth SDK or make Auth
requests.

**Signing in changes identity only.** It does not upload, claim, move, rename or
assign ownership to any local data. Signing out keeps every local Galaxy, item,
Note, Bookmark, Location, Constellation, linked placement, archived item and file.
Account A and account B see the same browser-local Cosmos in this phase. On a
shared computer, signing out does not hide that browser's local data; do not
describe it as private account storage. Another browser/origin/device has its own
local data, even when the same account signs in.

## Architecture

```text
Account button / CosmifoldAccountUI (account-ui.js)
    -> createAuthService (services/auth-service.js)
        -> createSupabaseAuthAdapter (services/supabase-auth.js)
            -> official Supabase JS Auth client

Cosmos UI -> existing universe repository -> local metadata v5 / IndexedDB
Backup / Restore -> existing explicitly scoped local persistence keys
```

`account-startup.js` starts Auth independently of `startup.js`. Local recovery,
Web Locks, repository composition and application commands are unchanged. Auth
never receives a Cosmos repository. Sample uses disabled Auth and never loads
the SDK or changes personal sessions. The service publishes only a public user
ID/email, readiness, recovery and pending state; SDK sessions/tokens are not part
of its state or any Cosmos snapshot.

The provider interface is `available`, `initialize(onChange)`, `signUp`, `signIn`,
`signOut`, `requestPasswordReset`, `updatePassword`, and `dispose`. Operations are
Promises. Initialization is once per instance, with retry after failure. The
service guards duplicate actions and clears pending state after success/failure.
Provider failures remain account errors; they never disable local editing.

## SDK and session lifecycle

The static app lazily loads **@supabase/supabase-js 2.117.3**, the official UMD
browser bundle, from the exact URL below. It is pinned and checked with SHA-384
Subresource Integrity, with anonymous CORS. No package installation, bundler,
manual token management or custom Auth REST implementation is required. A
failed/blocked SDK load has a 15-second timeout and can be retried.

```text
https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js
sha384-BWcjm9OdFth9TbhCxZPdm+gAOUMAzQy9nmTs12ioXdCcbVnJaPMn+fMUoQCLt60R
```

An SDK update must review the release, bundle hash, CSP path and tests together.
[Official browser installation](https://supabase.com/docs/reference/javascript/installing),
[pinned release](https://github.com/supabase/supabase-js/releases/tag/v2.117.3).

The single client sets `persistSession: true`, `autoRefreshToken: true`,
`detectSessionInUrl: true`, and `flowType: 'pkce'`. Supabase owns session storage,
refresh and cross-tab Auth notifications. Its project-scoped default session key
and PKCE verifier key are separate from Cosmifold's metadata/preferences keys and
attachment database. There is no custom cross-tab or refresh engine.

The adapter subscribes immediately after creating the client and uses
`getSession()` to recover the current browser session. The callback does no
asynchronous Auth calls, avoiding the SDK's callback lock hazard. State events
update the account entry and open account surface; `PASSWORD_RECOVERY` opens the
password dialog after any other modal has closed. This identity is presentation
state, not server authorization; future database access will need verified
sessions and RLS. [Auth state lifecycle](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).

Sign out uses the supported local scope: it signs this browser session out and
notifies its tabs, without signing every other device out or clearing site data.
[Sign-out scopes](https://supabase.com/docs/reference/javascript/auth-signout).

## Supported flows

- **Create account:** email, password and confirmation. Passwords need at least
  eight characters; no extra profile fields. Uses `signUp` with an email redirect
  to the current app directory. A returned user without a session shows **Check
  your email**, never a signed-in state. A returned session shows Account.
- **Sign in:** `signInWithPassword`, with a generic email/password error and
  retained form values. Pending buttons prevent repeat requests.
- **Forgot password:** `resetPasswordForEmail`. The confirmation says **If an
  account exists for that address, you'll receive a password reset link.**
- **Recovery:** the SDK exchanges the callback and emits `PASSWORD_RECOVERY`;
  the new-password dialog calls `updateUser({password})`. Passwords are cleared
  on completion/close. Only successful callback events permit the adapter's URL
  cleanup, preserving unrelated query parameters/fragments. No routes or
  repeated reloads are introduced.
- **Account:** email, a browser-local-data explanation and Sign out. No profile,
  billing, storage meter or synced status.

Email/password confirmation and recovery use PKCE. Open the link in the same
browser/origin where the flow began: the SDK needs its stored verifier. A link
opened in another browser/device cannot complete that PKCE exchange; request a
new reset there. Hosted and localhost sessions/verifiers are also separate.
Confirm this behavior during live verification; do not add a home-made exchange
or lower token protection to hide it. [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow),
[password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

Forms have labels, native email validation, password-manager autocomplete and
normal paste support. Close/Escape return focus to the account button. Closing
does not cancel an already submitted SDK request; it can finish changing identity
without reopening the dialog. The Cosmos remains usable. Auth dialogs fit narrow
screens with 44px controls, without changing other mobile interfaces.

## Public configuration and CSP

[auth-config.js](../auth-config.js) is the small configuration/template file:

```js
const cosmifoldAuthConfig = Object.freeze({
    SUPABASE_URL: '',
    SUPABASE_PUBLISHABLE_KEY: ''
});
```

Use the reviewed **HTTPS project root URL** and **publishable key** beginning
`sb_publishable_`. Both values are public browser configuration, visible to every
visitor. They are not secrets. No `.env` substitution/build is needed. Blank
values disable Auth. Incomplete/invalid configuration fails only the Account
surface. [Current Supabase API key model](https://supabase.com/docs/guides/api/api-keys).

Never put a secret key (`sb_secret_`), legacy `service_role`, database password,
SMTP password or any server credential in this file, HTML, JavaScript, public
deployments or source control. The adapter accepts only the publishable prefix.
Future user tables/storage need RLS/private access; a public key is not a
substitute for those controls. This phase creates no such tables or buckets.

`_headers` now permits **only the exact pinned CDN bundle URL** in `script-src`,
in addition to `'self'`. SRI verifies its bytes. No inline scripts, eval, wildcard
script hosts or other security/header/cache changes are added.

`connect-src` deliberately remains `'self' blob:` because the actual project host
is unknown. Once provided, append **that one exact HTTPS project origin** to the
existing directive, e.g. substitute the real dashboard URL in:

```text
connect-src 'self' blob: <exact HTTPS Supabase project origin>
```

Do not paste the angle-bracket placeholder into `_headers`. Do not add `*`, all
Supabase subdomains, CDN connection permissions or WebSocket permissions; Auth
HTTP requests need only the exact project origin. Update config and CSP in the
same reviewed change. Without this adjustment, a Pages deployment correctly
blocks Auth requests while local data continues working. A stock Python server
does not enforce `_headers`; the test server emulates it.

## Connect the real project manually, after review

1. Create/review the Supabase project yourself. Provide its **Project URL** and
   **publishable key** from Settings / API Keys. No secret/server key is needed.
   Do not create app tables, profiles, storage buckets or RLS in this step.
2. Enable the email/password provider. Choose **Confirm email** deliberately
   (recommended enabled for production), set the password minimum to at least
   eight characters, and review email delivery/rate limits. Default development
   email delivery is not a production SMTP plan; configure production delivery
   manually when appropriate, never in frontend configuration.
3. In Authentication / URL Configuration set **Site URL** to
   `https://tool-galaxy.pages.dev/`. Add exact allowed Redirect URLs:
   - `https://tool-galaxy.pages.dev/`
   - `http://127.0.0.1:5500/`
   - the exact `http://localhost:<development-port>/` you actually use, if needed.
   For another temporary port add that exact URL deliberately. No broad
   production wildcard. Root/index.html users redirect to the app directory `/`.
   [Redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).
4. Fill in the two public configuration values and append the exact HTTPS project
   origin to `_headers` as described above. Review this change before serving it.
5. Verify signup with/without confirmation, signin, reload/refresh, cross-tab
   signout, rejected/offline requests, reset email, PKCE recovery and clean URL
   in an isolated profile. Verify local metadata/files are unchanged by identity
   changes. Request/open recovery links in the same originating browser.
6. Repeat on the real HTTPS site only through a **separately deliberate deployment**.
   Cloudflare production and preview automatic deployments remain disabled; this
   branch does not connect accounts, re-enable them, install Wrangler/Actions,
   deploy or change domains. Do not assume a push publishes this work.

The real-project gate remains open until these tests pass. The branch's stopping
point is Auth-capable, mock-tested UI/services with blank public configuration.

## Backup / Restore and current local data

Auth credentials/passwords are never added to storage v5, sidebar preferences,
attachment records or `.cosmifold` backupVersion 1. Backup reads only its existing
explicit metadata/preferences keys and referenced file records, not arbitrary
localStorage. Restore replaces only those Cosmos stores; it does not restore,
remove or change Supabase session/verifier keys. Its journal, marker, rollback,
Web Locks and reload behavior are unchanged. After reload, Auth independently
recovers the current session.

There is no migration prompt or first-signin ownership change. Export/Restore
still transfers local data between origins, independently of account identity.
Account-specific local caches and explicit local-to-cloud import must be designed
when cloud metadata is introduced, rather than silently discarding data now.

## Verification and next step

```powershell
node --test tests/auth.test.js
python tests/browser-check.py --auth-only --screenshots
```

The reusable `tests/fake-auth.js` provider covers signed-out/signed-in sessions,
delays, rejection, confirmation and recovery events. Browser checks exercise the
actual account forms, native focus/Escape, desktop/narrow/mobile layouts, real
reload, IndexedDB and real Backup/Restore isolation. Unit tests check SDK flags,
method mapping, callback cleanup, retry and data isolation without a project.
Mocks cannot prove real email delivery, redirect allowlists, token refresh or
Supabase cross-tab behavior: those are explicit live checks above.

Branch verification: **294 Node tests**, **46 account browser checks**, **200
static-hosting checks**, **69 Backup/Restore**, **20 persistence**, **91 CRUD**,
**57 Media**, **61 Copy/Paste**, **43 Duplicate Structure**, **57 Locations**,
**105 Constellations** and **18 awaitable-command** checks passed. Auth controls
were reviewed at desktop, narrow and mobile widths. An initial concurrent
Backup/Restore run failed to play its generated video fixture; the isolated
sequential rerun passed all 69 checks. No Media/Restore code was changed.

After live Auth verification, proceed with the bounded
`feature/cloud-metadata-repository` phase: review ownership/RLS/revision and
transaction design before implementing cloud metadata. Files, migration and sync
remain separate gates. There is no framework rewrite or mobile backlog work here.
