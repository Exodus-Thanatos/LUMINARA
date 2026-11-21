# Phase 5, Step 2: permanent streetlight history, schedule, and "Sleeping" instead of "Offline"

## What changed
- **Permanent history** in PostgreSQL (`server/migrations/002_streetlight_events.sql`, new table `streetlight_events`). It does not duplicate `maintenance_history`, which stays the per-ticket trail; each maintenance event links to its ticket.
- Saved per row: streetlight ID, real time of the event, previous status, new status, raw node status, lux (empty when there was no reading, never 0), description, source (DEVICE / TEST / SERVER / USER), ticket (if any), who did it.
- **What creates a row**: a lamp's plain-language condition changing (GOOD, WARNING, FAULT, BLINKING, DAYLIGHT, STANDBY, SENSOR_ERROR, OFFLINE, SLEEPING); ticket created / status / technician / priority changed (written in the same transaction as the ticket); lighting schedule edited. Identical repeated readings write nothing. GOOD <-> "close to low-light limit" flips are only recorded after 10 minutes so a hovering lamp cannot flood the log.
- **Append-only**: the database refuses UPDATE, DELETE and TRUNCATE on the history table.
- **Survives restart**: at start-up the server loads each lamp's last recorded condition, so it does not write the same condition twice. If the database is briefly unreachable, events wait in a queue and are saved later with their original times.
- **Lighting schedule** stored in `lighting_schedule` (one row, starts at the gateway firmware shift: ON 18:00, OFF 05:30). Everyone signed in can read it; only ADMIN can edit it (Controls > Automatic Schedule). Edits are recorded in the history.
- **Sleeping, not offline**: the nodes deep-sleep after lamps-off. Silence between lamps-off and ~10 min after the first wake-up poll (one hour before lamps-on, 17:00 -> window ends 17:10) is shown as **SLEEPING** (blue, not a fault). It only applies if the node's last report was around the start of the sleep; a node that went quiet at 01:00, or is silent in the evening, is still OFFLINE. When a node reports again it is shown awake in the same moment (no timer), and the history records "woke up".
- Dashboard: new **Streetlight History** card (filter by lamp / event type, "Show older events"); Automatic Schedule card shows the real times.

## New / changed files
New: `server/migrations/002_streetlight_events.sql`, `server/schedule.js`, `server/lightEvents.js`, `server/history.test.js`, `src/HistoryPanel.jsx`, `src/ScheduleTimes.jsx`, `src/useHistory.js`, `src/historyUi.js` (+test), `src/scheduleFormat.js` (+test).
Changed: `server/server.js`, `server/services.js`, `server/repos.js`, `server/api.js`, `server/permissions.js`, `server/testkit.js`, `server/lampHealth.js`, `server/db.integration.test.js`, `src/App.jsx`, `src/api.js`, `src/useLiveLamps.js`, `src/lampHealthUi.js`, `package.json`.

## Permissions added (same table the server enforces)
`history.view` and `schedule.view`: ADMIN, TECHNICIAN, STAFF. `schedule.edit`: ADMIN only. API: `GET /api/history`, `GET /api/schedule`, `PUT /api/schedule`.

## To apply
`npm run db:migrate` (applies 002), then restart the server.

## Tests
`npm test`: 179 passed. `npm run test:db` (real PostgreSQL 16): 13 passed. `vite build` passes (run in a Linux copy). A live check with the real server: telemetry -> history rows -> server killed and restarted -> same rows returned by `/api/history`, no duplicated condition.

## Limits
- Manual relay Turn ON/OFF is not logged (not requested; the control endpoint has no signed-in user attached).
- Lamps that have not reported since a server restart are not listed, so a sleeping lamp only shows after its first report.
- Relay sketch `ScheduledRelay.ino` has ON 17:28 while the gateway uses 18:00: the website schedule is not pushed to firmware, keep them equal by hand.
- A node that sends one packet while waking (16:00-17:00) and then stays silent until the 17:00 poll would show OFFLINE for that time.
- `DEVICE_KEY` still defaults to a hard-coded value in `server/server.js` if the environment variable is missing; set your own.
