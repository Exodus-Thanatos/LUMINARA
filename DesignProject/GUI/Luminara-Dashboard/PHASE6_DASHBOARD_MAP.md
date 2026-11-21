# Phase 6: Dashboard map, standard status model, fault identification, P1–P4

Date: 2026-11-18. Applies on top of the Oct 29 build. This file follows the other `PHASE*_CHANGES.md` notes.

## What changed (short)

1. **The interactive map is now part of the Dashboard** and replaces the old "Lamp Network Status" tile grid. The separate **Map** tab is removed from the sidebar. `goto('map')` still works: it opens the Dashboard. The map component, its data and all its features are kept (markers, search, status and street filters, zoom, reset, CSV import / template / export, sample locations, selection, details panel).
2. **Hover preview** on every marker (ID, location, communication, lamp condition, voltage, light level, last report, detected fault). Click or tap selects it and fills the details panel (now with Fault information and role-aware actions).
3. **Electrical monitoring is permanently expanded.** The PZEM card's collapse button, the "Show details" toggle and the "status guide" disclosure were removed; the readings and history chart are always shown.
4. **One status model** (`src/streetlightStatus.js`) used by the Dashboard, the map, the Streetlights table, the fault dialog, Maintenance wording and the User Manual. Communication state and lamp condition are separate.
5. **Specific fault types** in the Streetlights table ("Online – Lamp Failure"), the map and a new Fault information section in the fault dialog.
6. **P1–P4 maintenance priorities** (display only; see "Database").
7. **User Manual and tutorial updated**; three new manual topics.

## Dashboard layout

Header and connection badge, KPI cards (Total Streetlights, Online, Offline, Fault Alerts), alert summary, Electrical monitoring, interactive map, then Needs Attention with the Streetlight History panel under it in the wide column, and System Activity beside them. The History panel is compact: its events scroll inside a fixed-height area (about 22 rem) and long descriptions are clamped to two lines (full text in the tooltip), so it no longer stretches the page. Every KPI number is computed from the **same records the map draws** (`onRecords` callback), so the cards, the map and the Needs Attention list cannot disagree. Until the map has loaded, the cards show a loading placeholder instead of a number.

Navigation: **Needs Attention → Locate on map** selects the lamp on the Dashboard map; **Details** opens its fault dialog. A maintenance ticket's view dialog has **Locate on map**; the fault dialog has **Locate on map** and **Create maintenance ticket**.

## Status model (official technical reference)

Generated from `src/streetlightStatus.js`. Two questions are kept apart: *Communication* (can the system hear the device?) and *Lamp condition* (what does the device report about the lamp?). A lamp can be Online and still have a Lamp Failure; Offline never means the lamp failed; No Device is never counted as Offline.

| Status | Definition | Conditions for this status | Data required | Display (colour, shape) | Recommended action |
|---|---|---|---|---|---|
| **Online** | The device is communicating with the system and reporting within the communication threshold. | The receiver has heard from the node recently (not offline). Sleeping nodes and daylight standby count as Online: silence is expected. | Last report time from the lamp node (via the receiver). | Green, circle with a check | None. Check the lamp condition for faults. |
| **Offline** | The device has not communicated within the offline threshold. Its lamp condition is unknown. | No report for longer than the offline limit (server setting; default 90 seconds), outside the scheduled sleep window. | Last report time; lighting schedule (sleep window). | Amber, circle with a dash | Check the node power, antenna and LoRa range, and the receiver. Do not assume the lamp has failed. |
| **Fault** | A specific device or operating malfunction has been detected. A Fault is always shown with its fault type. | The node reports no light during the lighting shift (5 lux or less) or unstable light (swing of more than 50 lux). | Light level (BH1750), node status, lighting schedule. | Red, diamond with ! | Open the fault details, inspect on site, and create a maintenance ticket. |
| **Warning** | An abnormal condition that needs attention but is not a confirmed hardware failure. | Low light (5 to 80 lux), light close to the low-light limit (80 to 100 lux), or the light sensor not answering. | Light level (BH1750), node status. | Amber, triangle with ! | Keep watching and inspect on the next visit. Escalate if it persists or gets worse. |
| **No Data** | There is not enough recent information to decide the condition of the device. | The device is registered but nothing usable has been received from it. | None received yet. | Grey, circle with ? | Check the installation and the node power. A missing reading is never treated as zero. |
| **No Device** | The mapped location has no installed streetlight device. | The registry entry has no device ID, or its node has not been detected yet. | Streetlight registry. | Grey, dashed empty ring | Install a node, or keep the location as a planned one. It is never counted as Offline. |

Sleeping nodes and daylight standby count as **Online** (silence is expected). The offline limit is the server's existing setting (default 90 s); the thresholds 5 / 50 / 80 / 100 lux mirror the existing firmware and `server/lampHealth.js`.

Counts always reconcile: `total = installed + no device`, and `installed = healthy + warning + fault + offline + no data`.

## Fault classification

| Fault type | Detected today? | How LUMINARA identifies it | Affected component | What to do |
|---|---|---|---|---|
| **Lamp Failure** | Automatic | Node reports TOTAL_BLACKOUT: light at or below 5 lux while the schedule says the lamp should be on. | Lamp or driver (the sensor data cannot tell these apart) | Inspect the lamp, its wiring and the switching hardware. |
| **Unstable Light** | Automatic | Node reports BLINKING/UNSTABLE (light spread above 50 lux). | Lamp, driver or wiring | Watch the lamp on site and inspect connectors, wiring and the supply at the pole. |
| **Low Light Output** | Automatic | Node reports LOW_LIGHT (5 to 80 lux). | Lamp, lamp cover or light sensor | Compare with neighbouring lamps, clean the cover and sensor window, and keep watching. |
| **Near Low-Light Limit** | Automatic | Healthy report with light between 80 and 100 lux (dashboard early warning). | Lamp or light sensor | Compare with neighbouring lamps and keep watching. |
| **Sensor Malfunction** | Automatic | Node reports SENSOR_ERROR. | Light sensor (BH1750) or its wiring | Check the sensor wiring and power at the node, restart the node, replace the sensor if it persists. |
| **Communication Failure** | Automatic | No report within the offline threshold (default 90 seconds) outside the sleep window. | Node power, antenna, LoRa link or receiver | Check node power, antenna and range, and that the receiver is running and other lamps still report. |
| **Unrecognised Status** | Automatic | The reported status is not in the known list. | Node firmware version | Check which firmware the node runs and compare with the status list in the User Manual. |
| **Relay Failure** | Partial | A command not confirmed within the timeout shows as "no confirmation". The cause (relay, Wi-Fi or controller) is not identified. | Relay controller, Wi-Fi link, relay or contactor | Check the relay controller, its Wi-Fi connection, the relay and the contactor. |
| **Voltage Abnormality** | Needs backend | The PZEM meter measures the whole feed only, and the voltage threshold setting is not connected yet. Lamp nodes do not measure voltage. | Power supply or PZEM meter | Check the supply and the PZEM meter on site. |
| **Intermittent Connection** | Needs backend | Not counted today. The event log could be used to count repeated drops. | Antenna, node power or interference | Check the antenna, node power and interference. |
| **Power Failure** | Manual inspection | There is no per-lamp power sensing, so it looks like Communication Failure. | Breaker, supply or wiring | Inspect the breaker, the supply and the wiring on site. |

Only the rows marked **Automatic** are produced by the system. Relay Failure is only partly seen (a command not confirmed in time). Voltage Abnormality, Intermittent Connection and Power Failure are **not** detected today and are listed so the manual says "inspect on site" instead of implying detection. A fault with no diagnostic detail is shown as "Fault (type not reported)", never guessed.

## Maintenance priority (P1–P4)

| Stored value (unchanged in the database) | Shown as | Meaning |
|---|---|---|
| CRITICAL | **P1 – Emergency** | Immediate safety risk or major outage. |
| HIGH | **P2 – Urgent** | Significant impact; address soon. |
| MEDIUM | **P3 – Normal** | Standard repair, scheduled normally. |
| LOW | **P4 – Planned** | Routine or planned work. |

Only the **wording** changed. The database `CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL'))` and every existing ticket are untouched (no migration). `src/maintenancePriority.js` maps the stored value to its P-label. The system **suggests** a priority (lamp failure P2, communication failure P3, low light P4); it is raised one level after 24 h, and a lamp failure is raised one level when three or more lamps are dark. The person creating the ticket decides. **The P1–P4 meaning sentences are proposed wording: confirm them with your adviser.**

## Permission and security review

No permission rule changed; `server/permissions.js` and the route guards are untouched. The Dashboard map only receives the actions the account is allowed to use (`controls.operate` → "Go to Lighting Controls", `maintenance` screen → "Open Maintenance", `maintenance.create` → "Create maintenance ticket"). Basic users get a view-only map with no actions and no priority suggestion. The server still rejects anything the account may not do. Street names from imported CSV files are HTML-escaped in the hover preview (unit-tested).

## Hardware limitation (not worked around)

There is **no individual ON/OFF control**. One relay (GPIO 27) switches the whole feed and `/api/control` / `/api/command` carry no lamp ID. The map therefore offers only "Go to Lighting Controls" and states that switching is circuit-wide. Per-lamp control would need a relay or controller per lamp plus firmware and an API that names a lamp.

## Data and database

* **No database change and no migration.**
* The streetlight list (28 mapped locations + the ones without coordinates) is still stored in the **browser** (`localStorage`, key `luminara.map.lamps.v1`), as before. It is now read through one module (`src/streetlightRegistry.js`) by the map and the Streetlights page. **Limitation:** each browser has its own copy. Moving it into a database table is the recommended next step and needs a migration.
* The Dashboard counts only lamps that are in that list. If a lamp node reports but is not in the list, a note says so.
* Detection time in the fault dialog comes from the existing `streetlight_events` history; if there is no entry it says so instead of guessing.

## Files

New: `src/streetlightStatus.js`, `src/maintenancePriority.js`, `src/mapMarkers.js`, `src/streetlightRegistry.js`, `src/streetlightStatus.test.js`, `src/mapMarkers.test.js`.
Changed: `src/App.jsx` (Dashboard, navigation, status badge, fault wiring), `src/StreetlightMap.jsx`, `src/PzemPanel.jsx`, `src/FaultDetail.jsx`, `src/BasicScreens.jsx`, `src/TicketDialogs.jsx`, `src/ArchivedTickets.jsx`, `src/DataViewer.jsx`, `src/Settings.jsx` (one sentence), `src/helpContent.js`, `src/helpContent.test.js`, `src/Tutorial.jsx`, `src/App.css`, `package.json` (test list).
Removed from the live code: the hard-coded demo alert list and the old tile grid. The commented-out history at the top of `App.jsx` was left alone, except that a few commented lines were touched by an automated edit (comments only).

## Testing done

* `npm test`: **245 tests, all pass** (220 original + 25 new: status model, counts reconcile, fault mapping, priority suggestion, detection time, marker shapes, hover preview, HTML escaping, manual content).
* ESLint: the **same 8 problems as the original** (none added).
* The whole app bundles with esbuild (all imports resolve).
* A headless-browser smoke test (Chromium, API mocked) signed in as Administrator and as Basic User: the Dashboard rendered with the KPI cards, the always-expanded electrical readings, the map with 28 markers and the Needs Attention list; there was no Map item in the sidebar and no "Show details"; the hover preview, marker selection, Locate on map, the fault dialog and the Streetlights table worked; **no page errors**.

## NOT verified (please do these on your machine)

1. `npm run build` was **not** run: the installed `node_modules` are the Windows binaries and Vite/Tailwind cannot run in the Linux sandbox used for this work. The existing `dist/` folder is therefore the OLD build; run `npm run build` before serving it.
2. Because Tailwind could not run, the **visual layout was not checked** (spacing, the map height, phone / tablet / laptop layouts, dark mode). The map keeps its previous responsive classes and has a 40 px touch target, but please look at it at desktop, tablet and phone widths.
3. Nothing was tested against the real receiver, lamp nodes, PZEM or relay (only the mocked browser and unit tests).
4. No server-side duplicate-ticket check was added: "Create maintenance ticket" is hidden when an unresolved ticket for that lamp is already open, but the server does not enforce it.

## Remaining tasks

* Decide where the streetlight list should live (database table, recommended) so every browser and the server share it.
* Connect the voltage threshold setting to the PZEM reading (it is "UI only" today) to make Voltage Abnormality detectable at circuit level.
* Count repeated drop/restore events from the history to detect Intermittent Connection.
* Confirm the P1–P4 wording.
