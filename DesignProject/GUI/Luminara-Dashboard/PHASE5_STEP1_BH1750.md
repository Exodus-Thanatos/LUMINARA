# Phase 5, Step 1: BH1750 status wording and indicators

## What the dashboard now says
| Firmware status (unchanged) | Dashboard label | Colour | Meaning shown to the user |
|---|---|---|---|
| `TOTAL_BLACKOUT` (≤ 5 lux while the lamp should be on) | **FAULT** | red | No light detected |
| `LOW_LIGHT` (5–80 lux while on) | **WARNING** | amber | Low light, the lamp may be dim |
| `BLINKING/UNSTABLE`, confirmed | **BLINKING** | red, animated dot | Unstable light output detected |
| `BLINKING/UNSTABLE`, one report only | WARNING | amber | Unstable reading, being checked (not called blinking yet) |
| `NORMAL_LIT` (and legacy `NORMAL`) | **CONNECTED / GOOD** | green | Operating normally |
| `DAYLIGHT_STANDBY` (> 3000 lux, incl. 65535) | DAYLIGHT STANDBY | blue | Normal, never a fault |
| `STANDBY` (outside the lighting schedule) | STANDBY | blue | Lamp not expected to be on |
| `SENSOR_ERROR` | SENSOR ERROR | grey | Sensor not answering; the lamp cannot be judged (not a lamp failure) |
| no report for a long time | OFFLINE | amber | Communication problem; condition unknown; never shown as 0 lux |
| status text the dashboard does not know | UNKNOWN | amber | Not assumed to be a fault |

## How BLINKING is confirmed (server side, no firmware change needed)
The server keeps the last 5 reports of each lamp. BLINKING needs, inside the last 5 minutes, either 3 unstable reports out of those 5, or 3 swings between healthy light and no-light/abnormal light. A single report, a duplicate retry of the same packet, or old reports never trigger it. See `server/lampHealth.js` (constants `BLINK`).

## Thresholds
Nothing new was invented. `server/lampHealth.js` mirrors the firmware (5 / 80 / 3000 lux, 50 lux flicker spread); the firmware still does the measuring.

## Files
New: `server/lampHealth.js`, `server/lampHealth.test.js`, `src/lampHealthUi.js`, `src/lampHealthUi.test.js`.
Changed: `server/server.js` (keeps recent reports, adds `health` to each lamp in the snapshot; telemetry intake otherwise untouched), `src/useLiveLamps.js`, `src/App.jsx` (status badge, tiles, explanation line), `src/faultInfo.js` and its test, `src/index.css` (blink animation, respects reduced motion), `src/useLiveLamps.test.js` (two expectations changed on purpose, see below), `package.json`, `firmware/LoraIntegrated/LoraIntegrated.ino`.

## Behaviour changes on purpose
- One unstable reading is now a WARNING (was an immediate FAULT).
- `SENSOR_ERROR` is now a WARNING shown as SENSOR ERROR (was a red FAULT), because a dead sensor is not proof the lamp failed. The map marker for such a lamp is amber instead of red.

## Firmware
Your updated `LORA-integratedupdated.ino` is now `firmware/LoraIntegrated/LoraIntegrated.ino`, with the Wi-Fi/server fallback block restored to the placeholders (your real values stay in `secrets.h`). One fix: a reading of 65535 or more was counted as a failed read and could produce `SENSOR_ERROR`; it is now kept as a valid very bright reading (capped at 65535) so it becomes `DAYLIGHT_STANDBY`. Your `NODE_ID 2` and `EXPECTED_NODES 2` settings were kept. **Re-flash the gateway and nodes to get the saturation fix.** The dashboard changes work with the old firmware too.

## Tests
`npm test`: 151 passed, 0 failed (includes the real bcrypt test). ESLint: only the pre-existing problems plus three unused leftover files (`server/auth.js`, `server/routes/*`, `src/AuthContext.jsx`) that are not imported anywhere. `npm run build` and the browser view were not run here (no Windows binaries/network): please run `npm run build` and look at the Dashboard and Streetlight Monitoring screens.

## Limits
- Recent reports are kept in server memory (reset on restart); persistent history is Step 2.
- The firmware still marks BLINKING from one 2-second window; the server's confirmation is what the dashboard shows.
