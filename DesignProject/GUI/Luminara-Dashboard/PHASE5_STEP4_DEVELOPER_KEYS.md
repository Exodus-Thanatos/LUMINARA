# Phase 5, Step 4: developer registration keys

## How it works
1. An **administrator** opens *User Management → Developer registration keys → + New key*, enters a label and a lifetime (1–30 days, default 7).
2. The server creates a random key (`LDK-` + 32 URL-safe characters, 192 bits) and shows it **once**. Only its SHA-256 hash is stored.
3. The developer opens the sign-in page and presses **Ctrl+Shift+D** (Cmd+Shift+D on Mac). The developer registration form opens; there is no visible link. They fill in the form and the key. The shortcut only hides the door; the server still requires a valid key.
4. The server checks the key and creates the account in **one database transaction**. The role is always `DEVELOPER`.
5. The developer then signs in normally.

## Security rules (all enforced on the server)
| Rule | How |
|---|---|
| Key not in the frontend | The registration form only sends what the person typed. No key exists in any JavaScript file. |
| Key not stored | Only `key_hash` (SHA-256) is in the database. The list endpoint returns no key and no hash. |
| Key shown once | Only the response that creates it contains it (`Cache-Control: no-store`). |
| Single use | `UPDATE … WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now()` is one atomic statement: of several simultaneous requests, one wins. |
| A failed registration does not burn the key | Key use and account creation share one transaction; a taken username or weak password rolls it back. |
| Revocable | Admin can revoke any unused key; a used key cannot be revoked (the account exists; deactivate it in User Management). |
| Expires | Every key has an expiry (max 30 days). |
| Cannot create ADMIN | The role is fixed to `DEVELOPER` in the service. `role`, `accountStatus` etc. in the request are ignored. The key table has no role column. |
| Only an ADMIN issues keys | Permission `developers.invite` = ADMIN only; checked in the service on every call. |
| No information leaks | Wrong, malformed, used, revoked and expired keys all give the same 403 and the same message. Field mistakes (weak password, etc.) are reported before the key is checked. "Username already taken" is shown only to someone holding a valid key. |
| Guessing is slowed | 5 failed keys per address per 15 minutes (`LOGIN_MAX_FAILURES` / `LOGIN_WINDOW_MINUTES`), then HTTP 429. In memory: resets on restart. |

## Roles after this step
| Permission | ADMIN | TECHNICIAN | STAFF | BASIC | DEVELOPER |
|---|---|---|---|---|---|
| dashboard.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| technical.view (PZEM, streetlight list, controls page) | ✓ | ✓ | ✓ | – | ✓ |
| history.view / schedule.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| controls.operate (lights on/off) | ✓ | ✓ | – | – | – |
| schedule.edit | ✓ | – | – | – | – |
| maintenance.* | ✓ | own tickets | view | own works (read) | – |
| users.manage | ✓ | – | – | – | – |
| developers.invite | ✓ | – | – | – | – |

DEVELOPER is read-only technical access. It was not specified in the brief, so this is a conservative default; widen it in `server/permissions.js` if you want more.

## Files
New: `server/migrations/004_developer_role_and_invites.sql`, `server/developer.test.js`, `src/DeveloperInvites.jsx`, `src/DeveloperRegister.jsx`, this file.
Changed: `server/permissions.js`, `server/repos.js`, `server/services.js`, `server/api.js`, `server/testkit.js`, `server/db.integration.test.js`, `src/api.js`, `src/access.js`, `src/UserManagement.jsx`, `src/App.jsx` (sign-in page only), `package.json` (test list).

## Setup
`npm run db:migrate` once (applies 004; existing accounts are not touched).

## Fix: dashboard showed DEMO DATA right after signing in
The live lamp stream (`/api/stream`) was opened when the app loaded, i.e. on the sign-in page, before there was a session cookie. The server correctly answered 401, and a browser never retries an EventSource that got a non-200 answer, so the dashboard stayed on demo data until a refresh. `useLiveLamps(enabled)` now opens the stream only while someone is signed in, closes it on sign-out, and reopens it after 3 s if the browser gave up on it. Changed: `src/useLiveLamps.js`, `src/App.jsx` (one line).
