# Phase 5, Step 3: BASIC role and simplified dashboard

A new **BASIC** role (label "Basic User") for ordinary users and barangay personnel. It is read-only. An administrator creates it under User Management (there is still no public sign-up).

## Run this once
```
npm run db:migrate     # applies 003_basic_role.sql (allows the BASIC role; existing accounts are untouched)
```
Then restart the server and refresh the site.

## What a BASIC user sees
| Sidebar item | What it shows |
|---|---|
| Dashboard | Totals (Total / Working / Needs Attention / No Signal), a read-only lamp status grid with the plain-language state of each lamp, the ON/OFF schedule, a short list of their assigned works and the 5 newest history events |
| Streetlight Map | The existing map, unchanged (markers, status, filters) |
| Assigned Works | Tickets assigned to the signed-in user: lamp ID, issue, priority, status, assigned date |
| History | The permanent streetlight history (status changes, maintenance updates, schedule edits) with date and time |
| Schedule | Scheduled ON time, OFF time, the state the lights should be in now, and each lamp's current state. Read only |
| Settings | Own account details and appearance only (no System & Notifications tab) |
| Help Center / User Manual | Unchanged |

BASIC has **no** Streetlights list (raw sensor values), Maintenance, Controls, PZEM power panel or User Management. The tutorial skips those steps for BASIC.

## Permission table (server/permissions.js, enforced on every request)
| Permission | ADMIN | TECHNICIAN | STAFF | BASIC |
|---|---|---|---|---|
| dashboard.view (lamp status, map, live stream, control state read) | yes | yes | yes | yes |
| technical.view (PZEM readings, Streetlights list, Controls page) | yes | yes | yes | **no** |
| controls.operate (manual ON/OFF) | yes | yes | no | no |
| history.view | yes | yes | yes | yes |
| schedule.view | yes | yes | yes | yes |
| schedule.edit | yes | no | no | no |
| maintenance.view | yes | yes (own tickets) | yes | **no** |
| maintenance.viewAssigned (read-only, own tickets) | no | no | no | yes |
| maintenance create / edit / archive / restore / import | yes | no | no | no |
| maintenance.updateOwn | no | yes | no | no |
| technicians.list | yes | yes | yes | no |
| users.manage, settings.admin | yes | no | no | no |
| basic.dashboard (Assigned Works / History / Schedule screens) | no | no | no | yes |

ADMIN, TECHNICIAN and STAFF keep exactly what they had. The only change to an existing endpoint is that `/api/pzem` and `/api/pzem/history` now check `technical.view` instead of `dashboard.view` (the same three roles as before).

## Files
New: `server/migrations/003_basic_role.sql`, `server/basic.test.js`, `src/BasicScreens.jsx`, `src/basicDashboard.js`, `src/basicDashboard.test.js`, `src/useAssignedWorks.js`, this file.
Changed: `server/permissions.js`, `server/api.js` (PZEM guard), `server/services.js` (BASIC ticket scope), `server/db.integration.test.js`, `server/permissions.test.js`, `src/access.js`, `src/App.jsx`, `src/Settings.jsx`, `src/Tutorial.jsx`, `src/UserManagement.jsx`, `src/permissions.test.js`, `package.json` (test list).
Not touched: LoRa, firmware, PZEM code, scheduling logic, maintenance rules, the history writer, and the three stray files (`server/auth.js`, `server/routes/*`, `src/AuthContext.jsx`).

## Known limits
- **Assigned Works is empty for most BASIC users.** Tickets can only be assigned to active TECHNICIAN accounts (unchanged rule), and BASIC cannot update a ticket, so a ticket assigned to a BASIC user could never be moved forward. The screen is ready and shows the user's own tickets if any exist. Giving BASIC users works needs a decision about who updates them.
- The Help Center has no BASIC-specific article yet.
- `.env` and `node_modules` are not in the ZIP. Keep your own `.env` and run `npm install` after unzipping.
