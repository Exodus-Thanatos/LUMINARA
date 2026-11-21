# Phase 4: PostgreSQL, login, admin-managed users, roles, maintenance archiving

## 1. What was built
- **PostgreSQL** is the central database (`users`, `sessions`, `maintenance_tickets`, `maintenance_history`), reached through one connection module (`server/db.js`) with parameterized SQL only, a migration runner and `.env.example`.
- **Working login** against database accounts. Passwords are hashed with bcrypt (`bcryptjs`). The session is a random token in an **HTTP-only, SameSite=Lax cookie** (Secure when `COOKIE_SECURE=true`); only a SHA-256 hash of the token is stored. Logout deletes the session on the server and cuts the live stream.
- **No public sign-up.** There is no registration route. The old *Settings → Create Worker Account* form (browser-only, no passwords) was replaced by an "Accounts" card that opens **User Management** (admins only).
- **User Management** (admin): list/search, add, edit, change role, activate/deactivate, reset password (temporary password shown once, user must change it at next sign-in).
- **Initial administrator** from environment variables via a command-line script (`npm run db:seed-admin`). No HTTP route, no defaults, no hard-coded accounts.
- **Role-based access control** (ADMIN / TECHNICIAN / STAFF) enforced by the server on every request; the React app only hides what the server would refuse. One permission table (`server/permissions.js`) is shared by both.
- **Maintenance on PostgreSQL**: create, update, assign, resolve, archive and restore all save to the database; every signed-in device sees the same tickets (the list refreshes every 30 s while no ticket window is open). Technicians are real user IDs (foreign key); the full name is shown.
- **Remove / Archive**: a *Remove* button appears beside a ticket **only when it is RESOLVED**; it asks for confirmation, then archives the ticket (nothing is deleted). Admins get an **Archived records** view (all required fields + full history + who archived it) and a **Restore** action.
- **Import** of tickets saved in the browser by the old prototype: a banner for admins; keeps ticket numbers, dates, technician names and history; never overwrites; never deletes the browser copy.

## 2. Files
**New, server:** `api.js` `config.js` `db.js` `env-init.js` `http-util.js` `loadEnv.js` `migrate.js` `migrations/001_init.sql` `password.js` `permissions.js` `repos.js` `seed-admin.js` `services.js` `testkit.js`; tests `auth.test.js` `tickets.test.js` `password.test.js` `permissions.test.js` `db.integration.test.js`.
**New, frontend:** `src/api.js` `src/access.js` `src/presenceStore.js` `src/UserManagement.jsx` `src/ArchivedTickets.jsx` `src/PasswordChange.jsx`; tests `src/permissions.test.js` `src/ticketApi.test.js` `src/presenceStore.test.js`.
**New, root:** `.env.example`, this file.
**Modified:** `server/server.js` (receiver handler renamed, not edited; wrapper + startup added), `src/App.jsx` (Login, auth state, sidebar, Maintenance), `src/TicketDialogs.jsx` (async + role-aware), `src/TechnicianUI.jsx` (two wording changes), `src/Settings.jsx` (worker card -> Accounts card), `src/helpContent.js`, `src/dark.css` (2 rules), `package.json`, `.gitignore`.
**Not touched:** `firmware/`, `server/pzem.js`, LoRa/telemetry logic, streetlight controls and scheduling code, `StreetlightMap.jsx`, theme/dark mode, the existing test files.

## 3. Database schema
See `server/migrations/001_init.sql` (the source of truth). Summary:
- `users` — id, full_name, username, email, password_hash, role (`ADMIN|TECHNICIAN|STAFF`), account_status (`ACTIVE|INACTIVE`), must_change_password, last_login_at, created_at, updated_at, created_by. Unique on `lower(username)` and `lower(email)`.
- `sessions` — token_hash (unique), user_id (cascade), expires_at, last_seen_at, ip, user_agent.
- `maintenance_tickets` — id, ticket_number (`MT-1001…` from a sequence), streetlight_id, location, issue_description, priority, assigned_technician_id (FK users, RESTRICT), legacy_technician_name (imports only), status, reported_at, first_response_at, resolved_at, resolution, archived_at, **archived_by** (FK users), created_by, version, created_at, updated_at. Database CHECKs: resolved needs a resolved date; **archived only if RESOLVED**; archived needs an archiver; Assigned/In Progress need a technician.
- `maintenance_history` — id, ticket_id (FK, RESTRICT), action, previous_value, new_value, performed_by (FK users), created_at. Append-only; RESTRICT means a ticket with history cannot be deleted.
- Adjustments to your suggested schema: added `sessions`, `must_change_password`, `last_login_at`, `archived_by`, `first_response_at`, `resolution`, `version` (to stop two people overwriting each other), `legacy_technician_name`.
- Indexes: unique username/email, role+status, active/archived ticket lists, technician, streetlight, status, history by ticket, sessions by user/expiry.

## 4. Database setup
1. Install PostgreSQL 12 or newer.
2. Create a database and a dedicated user (in `psql` as the postgres user):
   ```sql
   CREATE USER luminara_app WITH PASSWORD 'choose-a-strong-password';
   CREATE DATABASE luminara OWNER luminara_app;
   ```
3. `npm install` (adds `pg` and `bcryptjs`; this also updates `package-lock.json`).
4. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and the `INITIAL_ADMIN_*` values.
5. `npm run db:setup` (= `db:migrate` then `db:seed-admin`). Both are safe to re-run.
6. `npm run server` (the server **refuses to start** without a working database) and `npm run dev`.

## 5. Environment variables
`DATABASE_URL` (or `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD`), `DATABASE_SSL`, `DATABASE_POOL_MAX`, `SESSION_TTL_HOURS` (12), `COOKIE_SECURE`, `BCRYPT_ROUNDS` (12), `ALLOWED_ORIGINS`, `LOGIN_MAX_FAILURES` (5), `LOGIN_WINDOW_MINUTES` (15), `INITIAL_ADMIN_FULL_NAME/USERNAME/EMAIL/PASSWORD`, and the existing `PORT`, `DEVICE_KEY`, `OFFLINE_AFTER_MS`, `STALE_AFTER_MS`. `.env` is git-ignored.
**ngrok:** people open the site over `https://…ngrok…`, so set `COOKIE_SECURE=true`.

## 6. Initial administrator
Put `INITIAL_ADMIN_FULL_NAME`, `_USERNAME`, `_EMAIL`, `_PASSWORD` (10+ characters, letter and number) in `.env`, run `npm run db:seed-admin`, then **delete `INITIAL_ADMIN_PASSWORD` from `.env`**. The script refuses to run if any administrator already exists, never prints the password, and the admin must choose a new password at first sign-in. From then on, add users in the app.

## 7. Roles and permissions
| | ADMIN | TECHNICIAN | STAFF |
|---|---|---|---|
| Dashboard, Streetlights, Map, PZEM (view) | yes | yes | yes |
| Lighting Controls: switch lights on/off | yes | yes | view only |
| Maintenance: view tickets | all | only tickets assigned to them | all (read only) |
| Create / edit tickets, assign technicians | yes | no | no |
| Change status of a ticket | any | own tickets only, forward (Assigned ↔ In Progress → Resolved), no re-open | no |
| Remove (archive) resolved tickets, view archive, restore, import | yes | no | no |
| User Management | yes | no | no |
Rules: nobody can create or promote accounts except an admin; the last active administrator cannot be deactivated or demoted; deactivating a user, changing their role or resetting their password signs them out immediately.
Device endpoints (`/api/telemetry`, `/api/pzem` POST, `/api/command`) are unchanged: the ESP32 keeps using its `X-Api-Key`.

## 8. Maintenance archiving
Remove is offered only for RESOLVED tickets and only to admins. Confirming sets `archived_at` and `archived_by`, writes an `ARCHIVED` history row in the same transaction, and the ticket leaves the active list. The row, its history and its technician link stay in PostgreSQL. Archived records show ticket number, streetlight, location, issue, technician, priority, report date, resolution date, history and archive date/admin. Restore clears the archive fields and logs `RESTORED`. Archived tickets cannot be edited until restored, and the summary cards still count them.

## 9. Testing
Automated (`npm test`): **128 passed, 0 failed, 1 skipped** (84 existing + 44 new). Covers login/logout/inactive/expired sessions, throttling, cookie flags, origin check, route protection (including that the ESP32 endpoints still work), user creation, duplicates, weak passwords, forced password change, password reset, last-admin guard, role enforcement for users/tickets/controls, ticket create/assign/update/resolve, archive/restore rules, archive atomicity, history preservation, localStorage import, and the initial-admin script. ESLint: same 5 pre-existing problems, none new.
**What was NOT run in this environment (no network, no PostgreSQL, Windows-only native binaries in `node_modules`):**
- The real SQL against PostgreSQL. The logic tests use an in-memory stand-in with the same interface and the schema's rules. Run `TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/luminara_test npm run test:db` once: it creates and drops a throw-away schema and checks the migration, unique indexes, CHECK constraints, foreign keys, restart persistence, archive flow, import and sequence.
- The skipped test is the real bcrypt check (needs `npm install`).
- `npm run build` and any in-browser check (Dashboard, Map, Controls, Scheduling, telemetry, PZEM, Light/Dark Mode). Those code paths were not modified, the existing 84 tests pass and ESLint parses all new screens, but please run `npm run build` and click through once.

## 10. Conflicts, decisions and limitations
- **Technician availability already existed.** The prototype already had "on duty today" switches and availability colours (browser localStorage). Your brief says not to implement attendance now, but removing it would break working features. Kept as is, now fed by database technicians: the on-duty switch is still per browser and the server does **not** enforce availability. Replace it when the attendance feature is built.
- **Browser-registered workers** (Settings form of the old prototype) never had passwords. They cannot become accounts automatically; User Management lists them so an admin can recreate them.
- **Dashboard endpoints now need sign-in** (`/api/lamps`, `/api/stream`, `/api/pzem*`, `/api/control`). Handler code is untouched; a guard runs in front. `server.test.js` still tests the unguarded receiver.
- **Lighting Controls**: STAFF may look but not switch (your call; change `controls.operate` in `server/permissions.js`).
- Login throttling and live-stream tracking are in memory (reset on restart; one server process). Run a single server instance.
- No email-based password reset (resets are admin-controlled, as requested). No password-expiry or 2FA.
- Technician names on imported tickets are text only (`legacy_technician_name`) until an admin assigns a real technician.
- The server will not start without PostgreSQL, so hardware testing now needs the database running.
- `package-lock.json` was not regenerated (no network); `npm install` will update it. `node_modules` is not included in the ZIP.
