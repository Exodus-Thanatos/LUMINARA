# LUMINARA Integrated: support for `LoraIntegrated.ino`

Everything below is derived from the real firmware source and was checked in code or by tests. Anything that needs the ESP32 boards is listed under **Not verified**.

## 1. Compatibility report

### What the firmware really sends
The master's Wi-Fi bridge posts this to `POST /api/telemetry` (header `X-Api-Key`), one packet per accepted LoRa message:

```json
{"type":"RPT","nodeId":1,"seq":42,"lux":153.2,"status":"NORMAL_LIT","rssi":-71}
```

| Firmware fact (source) | Value |
|---|---|
| Packet types forwarded | `RPT` (reply to master `POLL`), `ALRT`, `BEAT` (free phase). **`JOIN` does not exist in this firmware.** |
| Status strings (`computeStatus()`) | `NORMAL_LIT`, `DAYLIGHT_STANDBY`, `STANDBY`, `LOW_LIGHT`, `TOTAL_BLACKOUT`, `BLINKING/UNSTABLE`, `SENSOR_ERROR` |
| Reporting rhythm | FREE phase: each node transmits once per 30 s cycle (`FREE_PERIOD_S`) in its own 3 s slot. `ALRT` when status changed or lux moved >= 50 (not during `DAYLIGHT_STANDBY`), otherwise `BEAT`. Poll phase: one `RPT` per node per wave. |
| `seq` | per-node counter, kept in RTC memory: survives deep sleep, restarts at 1 after a power loss. One value per transmission (a retry reuses it). |
| `lux` | `%.1f`. **On `SENSOR_ERROR` the node sends `0.0` as a placeholder**, not a measurement. |
| Master timeout | `DISCONNECT_TIMEOUT_MS` = 85 s, checked only in the FREE phase. |
| Bridge reply handling | HTTP 200 = sent; any other 4xx = packet **dropped** (logged); 5xx / no reply = retried every 5 s. |
| Fields **not** sent | timestamp, packet type "JOIN", light-state/brightness %, voltage, `source`. None were invented. |

### What already worked
Endpoint, `X-Api-Key` auth, field names (`type,nodeId,seq,lux,status,rssi`), `ALRT`/`BEAT`, node IDs 1..31, status length limit, SSE stream, `/api/lamps`, demo-mode fallback, map and all other screens.

### What was incompatible (confirmed from source)
1. `RPT` was rejected with HTTP 400, so every poll reply was dropped (and the first packet each node sends after waking is an `RPT`).
2. The hook only knew `NORMAL`; the firmware's `NORMAL_LIT`, `DAYLIGHT_STANDBY` and `STANDBY` all displayed as **FAULT**.
3. `SENSOR_ERROR` arrives with `lux: 0.0` and was displayed as a real 0 lx reading.
4. Offline threshold 75 s was shorter than the master's own 85 s timeout; no "stale" step.
5. Any packet overwrote the stored one, so an older/replayed packet could replace newer data.
6. Docs and the test tool said nodes send `JOIN` and report `NORMAL`; this firmware does neither.
7. The supplied sketch had Wi-Fi password, server IP and API key embedded as fallback values.

## 2. Change report

| File | Change |
|---|---|
| `server/server.js` | Accepts `RPT`, `ALRT`, `BEAT` (+ `JOIN`, kept for the old sketch/test tool). Strict field validation with error codes. `lux` required except on `SENSOR_ERROR`, where it is stored as `null`. Per-node latest record now also keeps packet `type`, `statusSince`, `lastAlert`, `rxCount`, `restarts`. Sequence handling (see 4). Link health `ONLINE`/`STALE`/`OFFLINE` from configurable thresholds. Constant-time key compare, 413 for oversized bodies. Exports `validate/ingest/snapshot/server` and only listens when run directly. `POST /api/telemetry`, `/api/lamps`, `/api/stream` and auth are unchanged. |
| `src/useLiveLamps.js` | `toDashboardStatus()` uses the exact firmware strings (table below); unknown values become WARNING with the raw text (never a silent FAULT). `mergeLive()` keeps the same device shape and adds `condition`, `known`, `packetType`; `comm` is now Online / Stale / Offline; null lux stays null. |
| `src/App.jsx` | A few small display edits (desktop table and mobile cards): alert text (offline shows last reported condition, unrecognised status is called out, delayed report is marked); lux cell shows "· delayed" when stale; rows with no lux (SENSOR_ERROR, offline) show "No reading" plus the status text instead of a bare "No data". Layout, colours and navigation untouched. |
| `src/StreetlightMap.jsx` | Three lines in `deriveLamp()`: communication label comes from the data (Stale is visible); standby states show as "Normal (DAYLIGHT_STANDBY)"; offline details show "last reported ...". |
| `server/send-test-data.js` | Now emits firmware-shaped packets (first `RPT`, then `BEAT`, `ALRT` on change, real status names). New modes `lowlight1`, `flicker1`, `sensor1` besides `stop2`, `blackout1`. |
| `server/server.test.js`, `src/useLiveLamps.test.js` (new), `package.json` | 26 automated tests; `npm test`. |
| `firmware/LoraIntegrated/LoraIntegrated.ino` (new) | Your sketch, **only** the credential fallback block changed to placeholders (+ a compile `#warning`). Everything else byte-identical. |
| `firmware/LoraIntegrated/secrets.h.example`, `.gitignore` (new/edited) | Template for the local, untracked `secrets.h` the sketch already supports. |
| `firmware/Lora-withBH1750/Lora-withBH1750.ino` | Legacy sketch kept; its four embedded credential values replaced by placeholders. |
| `SETUP_GUIDE.md`, `INTEGRATION.md` | Banner pointing here; 75 s -> 60/90 s; status table corrected. |

## 3. Status mapping (dashboard constants unchanged)

| Firmware status | Dashboard status | Notes |
|---|---|---|
| `NORMAL_LIT` | ONLINE | healthy |
| `DAYLIGHT_STANDBY` | ONLINE | normal, shown as "Normal (DAYLIGHT_STANDBY)" on the map |
| `STANDBY` | ONLINE | the firmware only emits it outside the scheduled shift |
| `LOW_LIGHT` | WARNING | 5 to 80 lx during the shift |
| `TOTAL_BLACKOUT` | FAULT | |
| `BLINKING/UNSTABLE` | FAULT | the firmware itself counts it as a lamp fault; change to WARNING in `STATUS_MAP` if you prefer |
| `SENSOR_ERROR` | FAULT | node still communicating; lux shown as "No reading" |
| `NORMAL` (old sketch) | ONLINE | legacy |
| anything else | WARNING | "Unrecognised status X" |

**Lamp condition vs communication.** `status` (lamp) and `link` (communication) are separate fields end to end. STALE never changes the lamp status. OFFLINE shows the existing OFFLINE badge, keeps the last reported condition in `condition`/`reported` ("Last: NORMAL_LIT") and is never turned into a blackout or fault.

## 4. Timeouts and sequence handling

| Setting (env var) | Default | Why |
|---|---|---|
| `STALE_AFTER_MS` | 60000 | two missed 30 s cycles |
| `OFFLINE_AFTER_MS` | 90000 | master's 85 s timeout + ~5 s (master checks every 5 s; packet waits in the Wi-Fi queue). A healthy node is never flagged before the master would flag it. |

Firmware timeout left untouched. Sequence rules: same `seq` = duplicate (data kept, "last seen" refreshed, HTTP 200 `duplicate:true`); lower `seq` is accepted as a **node restart** if it is <= 10 or the node had been OFFLINE, otherwise rejected with HTTP 409 and not stored; higher `seq` is accepted (deep sleep keeps the counter, so normal increases after a night are fine).

## 5. Testing report (what was actually run)

| Check | Result |
|---|---|
| `npm test` (clean `npm ci`) | **26 / 26 pass**: JOIN/ALRT/BEAT/RPT accepted; all 7 firmware statuses stored unchanged; zero lux kept as 0; SENSOR_ERROR lux -> null; missing/invalid lux, wrong types, bad node/seq/status/rssi/JSON/oversize rejected; auth enforced (wrong, missing, empty key); updates hit the right node; duplicate / stale / restart sequences; ONLINE -> STALE -> OFFLINE at 60 s / 90 s with lamp status untouched; dashboard mapping for NORMAL_LIT, standby, faults, unknown, stale, offline, demo fallback. |
| Real server process + curl | Started `node server/server.js`; firmware-shaped RPT/BEAT/ALRT/SENSOR_ERROR posts returned 200, no key returned 401, duplicate returned `duplicate:true`; `/api/lamps` and the first SSE event showed the expected data. |
| Simulator | `send-test-data.js blackout1` ran 12 s against that server, all 200. |
| `vite build` (clean install) | Succeeds. |
| `eslint .` | 15 problems (14 errors, 1 warning), **identical rule-by-rule to the original project**; all in pre-existing `App.jsx`/`StreetlightMap.jsx` code. No new lint findings. |

### Not verified
- Not compiled: no ESP32 toolchain here. Only the credential block of the sketch differs from your upload.
- No real LoRa, Wi-Fi/NTP, master HTTP bridge or BH1750 test. All "firmware" input was simulated; **a successful firmware-to-server connection has NOT been demonstrated**.
- The React UI was not opened in a browser (no visual or click-through check). Display logic is covered by the mapping tests and the build only.
- Dev-server `/api` proxy and live SSE into the browser were not exercised.

## 6. Remaining issues / manual steps
1. **Scheduled silence looks like OFFLINE.** Nodes deep-sleep after the shift (demo: ~550 s of each 20 min cycle; real schedule: 06:00 to 16:00), and with `DEMO_MODE 0` the poll waves are 300 s apart (17:00, 17:05, 17:10) with nothing sent before 17:00. The packets carry no schedule or sleep flag, so the server cannot tell this from lost communication. Expect STALE/OFFLINE then; raise `OFFLINE_AFTER_MS` (for example `OFFLINE_AFTER_MS=330000`) if you only want long-gap alarms. Derived from the source, needs hardware to confirm.
2. The bridge **drops** a packet on any 4xx, including 401 (wrong key) and 409 (stale). Check the master Serial Monitor for `server rejected packet (HTTP 401)` after flashing.
3. Node boot: `currentLux` starts at 0 and `currentStatus` at `STANDBY` for the first 2 s, so a very early poll reply could carry that. Firmware behaviour, left as is.
4. `STANDBY` is trusted as "outside shift"; the dashboard has no schedule to cross-check it.
5. Your supplied sketch and the repository's git history contained the real Wi-Fi password and key. The ZIP omits `.git` and has placeholders only; **rotate that Wi-Fi password and the API key**.
6. `STATUS_MAP` (BLINKING as FAULT) and thresholds are policy choices, easy to change.
7. Detail, Maintenance and Controls screens, map coordinates and the 24-lamp demo inventory are still sample data, as before (labelled in the UI). Voltage is "-" because nodes do not measure it.
8. The `node_modules` folder inside your original ZIP was installed for another operating system (build failed here with a missing native binding). Run `npm ci` on your machine.

## 7. Setup guide

**Server and dashboard**
```
npm ci
DEVICE_KEY=your-long-random-key npm run server      # PowerShell: $env:DEVICE_KEY="..."; npm run server
npm run dev                                         # open the printed address, Sign In
npm test                                            # optional
```
Optional: `STALE_AFTER_MS`, `OFFLINE_AFTER_MS`, `PORT`. Without hardware: `DEVICE_KEY=... npm run test-data` (add `stop2`, `blackout1`, `lowlight1`, `flicker1` or `sensor1`); the badge shows LIVE + TEST DATA.

**Master ESP32** (`firmware/LoraIntegrated/`)
1. Copy `secrets.h.example` to `secrets.h`; set your 2.4 GHz Wi-Fi, `SERVER_URL` (`http://<PC IP>:3001/api/telemetry`) and the same `DEVICE_KEY` as the server. `secrets.h` is git-ignored.
2. In the sketch: `IS_SENDER false`, `EXPECTED_NODES` = number of lamp nodes (max 8 slots), `DEMO_MODE` identical on **every** board (1 = 20 min bench cycle, 0 = real schedule). LoRa settings (433 MHz, SF10, BW125, CR5) are unchanged and must stay identical.
3. Board: ESP32 Dev Module; libraries as in `SETUP_GUIDE.md` Part 5.

**Each lamp node:** `IS_SENDER true`, unique `NODE_ID` 1, 2, 3... (<= `EXPECTED_NODES`). Node 1 appears as L-001.

**Verify** (Serial Monitor, 115200):
- Master: `[hh:mm:ss] N1 RPT/BEAT/ALRT seq=... | Lux: ... | Lamp: ... (NORMAL_LIT)` then `Bridge: sent node 1 seq N (HTTP 200)`.
- Dashboard: L-001 ONLINE with lux and the status text; cover the sensor to see LOW_LIGHT / TOTAL_BLACKOUT (only during the shift window; outside it the node reports STANDBY).
- Unplug a node in the FREE phase: delayed reading at ~60 s, OFFLINE at ~90 s; plug in, it returns on its next report.
