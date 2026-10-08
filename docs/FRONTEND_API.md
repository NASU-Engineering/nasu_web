# Frontend ↔ backend contract

Static site, no build step. Every view talks only to
`assets/js/services/api.js`, which delegates to one backend module:

| `CONFIG.backend` | Module | Use |
|---|---|---|
| `'supabase'` (default) | `services/supabase-backend.js` | Real backend |
| `'mock'` | `services/mock-backend.js` | **DEV ONLY** — fake demo student, never contacts Microsoft or Supabase |

The single Supabase client lives in `services/supabase-client.js`.

> ⚠️ **Never put a `service_role` key, a secret (`sb_secret_…`) key, an Azure
> client secret, a database password, the student roster or application data
> in frontend code.** Everything under `assets/` is downloaded by every visitor.
> `tests/static-security.test.mjs` fails if any of these appear.

## Sign-in model

**NASU Microsoft (Azure / Entra ID) SSO is the only way to sign in**, through
Supabase Auth's `azure` OAuth provider. There are no passwords, activation
codes or emailed one-time codes in the frontend.

## Public configuration (`assets/js/config.js`)

All values are public by design:

| Key | Value |
|---|---|
| `supabase.url` | `https://hfrnfkmlqxnajocxkzpq.supabase.co` |
| `supabase.publishableKey` | `sb_publishable_…` (publishable key only) |
| `supabase.clientUrl` | supabase-js ESM build, pinned (`@2.117.2`, jsdelivr) |
| `auth.provider` | `'azure'` |
| `auth.scopes` | `'email profile'` (Supabase adds `openid`) |
| `auth.emailDomain` | `nasu.edu.eg` — **UX only** |
| `auth.queryParams` | `{ domain_hint: 'nasu.edu.eg', prompt: 'select_account' }` — pre-selects NASU and shows the account picker (useful on shared devices) |
| `contentSource` | `'mock'` until content tables exist (shows a "Preview" banner) |

## Responsibilities

**Frontend**
- One primary action: **Continue with NASU Microsoft Account**
  (`supabase.auth.signInWithOAuth({ provider: 'azure', … })`).
- Finish the PKCE redirect, keep/restore the session, sign out.
- Route guards (UX only — **not** a security boundary).
- Simple messages chosen from error **codes** (`services/errors.js`); server
  error text is never shown. Technical details go to the console only on
  `localhost` / `127.0.0.1`.
- UX check: a session whose email isn't `@nasu.edu.eg` is signed out locally
  with "Please sign in with your NASU university Microsoft account".

**Backend** (unchanged by the frontend)
- Azure provider configuration (tenant, client ID/secret) in Supabase.
- Deciding who may sign in (tenant restriction, hooks, approved-student checks).
- Creating/linking `profiles`; RLS on every table.
- `get_my_profile()` returns only the caller's own row.

## Auth lifecycle

```
Landing or /login ── "Continue with NASU Microsoft Account"
   │  api.auth.startSignIn({ next })        next = protected route the student wanted
   │    └─ signInWithOAuth({ provider:'azure', redirectTo: <site origin + path> })
   ▼
Microsoft sign-in (login.microsoftonline.com) → Supabase /auth/v1/callback
   ▼
<site>/?code=…   (or ?error=…)
   │  app.js start(): api.auth.completeSignIn() BEFORE any routing
   │    1. strips ?code / ?error from the address bar (history.replaceState)
   │    2. exchangeCodeForSession(code)        (PKCE verifier from this browser)
   │    3. non-@nasu.edu.eg email → local sign-out → "wrong_account"
   ▼
#/<next> or #/dashboard  → rpc('get_my_profile')
   - no profile row → "No hub profile" screen with Sign out
reload       auth.getSession() restores the persisted session
sign out     auth.signOut() → /login?signedout=1
elsewhere    onAuthStateChange('SIGNED_OUT') → guards re-run → /login
```

Guards run only **after** the session is known. If it can't be determined
(e.g. the client failed to load) a retry screen is shown instead of redirecting.

| Route | Rule |
|---|---|
| `/`, 404 | public (landing has the Microsoft button) |
| `/login` | guests only (signed-in → `/dashboard`) |
| `/activate`, `/activate/verify`, `/create-password` | retired → `/login` |
| `/dashboard`, `/subjects…`, `/search`, `/resources`, `/assignments`, `/announcements`, `/profile`, `/quizzes`, `/activities`, `/leaderboard` | signed in |
| `/start` | signed in → redirects to the account's workspace (see ROLE_PLATFORM.md) |
| `/editor…`, `/review…`, `/admin…` | signed in + role (UX only — see ROLE_PLATFORM.md / ROLE_DASHBOARDS.md) |

Errors returned from the redirect are mapped (details logged in dev only):

| Return | Shown as |
|---|---|
| `error_description` mentions cancel/declined/consent | "Sign-in was cancelled…" |
| `access_denied`, signup not allowed, hook rejection | "Your NASU account couldn't be signed in to the hub… contact the prep-year office." |
| rate limit | "Too many attempts…" |
| bad/used code, verifier missing (started in another browser) | "Sign-in didn't complete. Please try again." |
| non-NASU email | "Please sign in with your NASU university Microsoft account (@nasu.edu.eg)." |

## `get_my_profile()` contract

```js
supabase.rpc('get_my_profile')   // no arguments — ever
```

Returns one row (object or single-element array):

```json
{ "full_name": "string", "student_id": "string", "group_name": "string", "section": "string" }
```

- `SECURITY INVOKER`, `authenticated` only; anon receives `42501` (verified on
  the live project) → frontend signs out locally and shows "session ended".
- Empty result → "No hub profile" screen (signed in, but not set up).

## Backend / Supabase settings the frontend depends on

1. **Redirect URLs** (Auth → URL Configuration) must include every origin+path
   the site is served from, exactly as `location.origin + location.pathname`:
   - the production URL (e.g. `https://<user>.github.io/nasu_web/`)
   - `http://127.0.0.1:5173/` for local development
2. **Site URL** set to the production URL (used if `redirectTo` is rejected).
3. Azure provider enabled with the NASU tenant URL, so only NASU accounts can
   authenticate — verified: the authorize step reaches the NASU tenant at
   `login.microsoftonline.com/<tenant-id>/…`.
4. The account's **email claim** must be present (the frontend reads
   `session.user.email` for the `@nasu.edu.eg` UX check and to display it).

## Service functions

| Function | Resolves to |
|---|---|
| `api.auth.getSession()` | `{ email, studentId } \| null` |
| `api.auth.startSignIn({ next })` | navigates to Microsoft |
| `api.auth.isSignInReturn()` | `true` on the OAuth return page load |
| `api.auth.completeSignIn()` | `{ next }` |
| `api.auth.signOut()` | — (`auth.signOut()`, default scope) |
| `api.auth.onChange(cb)` | `cb('signed_in' \| 'signed_out')` |
| `api.profile.getMine()` | `{ fullName, studentId, group, section }` |
| `api.subjects.*`, `api.resources.*`, `api.announcements.*` | sample content while `contentSource: 'mock'` |

## Course content (later)

Proposed read-only tables for authenticated students:
- `resources`: `id, subject_id, category, title, url, format, added_at, week, due_at`
- `announcements`: `id, title, body, subject_id (null = general), published_at, pinned, author`

`category` ∈ `lecture | tutorial | board | pdf | assignment`; subject ids
`math1, vib, stat, chem, soc, draw`. `services/normalize.js` maps these rows.

The old client-side admin password has been removed. Staff workspaces (editor,
review, admin) are role-based and documented in
[ROLE_DASHBOARDS.md](ROLE_DASHBOARDS.md); they stay hidden until the backend
provides roles.

## Tests

```bash
node --test tests/*.test.mjs
```

Security, auth and contract tests (`static-security`, `identity`,
`supabase-workspace`, `workspace-api`), role/experience tests
(`roles`, `experiences`, `simulator`, `mock-workflow`), and UI logic
(`content-workflow`, `deep-links`, `updates`, `activity`, `view-logic`).
Mock-based tests prove the frontend flow only — not production E2E.
