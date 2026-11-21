# Connecting the master ESP32 to the LUMINARA dashboard

> Current firmware: `firmware/LoraIntegrated/LoraIntegrated.ino`. See `LORAINTEGRATED_UPDATE.md` for what changed for it.

```
BH1750 -> lamp node ESP32 --LoRa--> MASTER ESP32 --Wi-Fi (HTTP POST)--> server/server.js --> dashboard
```

## What changed (and nothing else)
| File | Change |
|---|---|
| `firmware/Lora-withBH1750/Lora-withBH1750.ino` | Master only: +104 added lines (Wi-Fi + send to server). No original line was changed or removed. LoRa protocol, thresholds, node code untouched. |
| `server/server.js` (new) | Receives packets, keeps the latest per node, marks a node STALE after 60 s and OFFLINE after 90 s of silence, streams to the dashboard. |
| `server/send-test-data.js` (new) | Fake packets for testing without hardware. Marked as test data. |
| `src/useLiveLamps.js` (new) | Dashboard hook that listens to the server. |
| `src/App.jsx` | Dashboard, Streetlights and Map now use live data when the server is reachable; "DEMO DATA" otherwise. |
| `src/StreetlightMap.jsx` | 2 lines: show reported status text. |
| `vite.config.js` | Forward `/api` to the server (port 3001). |
| `eslint.config.js`, `package.json` | Node globals for `server/`; two npm shortcuts. |

## Steps
1. **Install**: `cd luminara` then `npm install` (Node 18 or newer).
2. **Find your PC's IP** (the PC that runs the server): Windows `ipconfig` -> IPv4 Address, e.g. 192.168.1.50. PC and ESP32 must be on the same Wi-Fi (2.4 GHz). Allow Node through the firewall on port 3001 if asked.
3. **Start the server** (terminal 1):
   - Windows PowerShell: `$env:DEVICE_KEY="my-secret-key"; npm run server`
   - macOS/Linux: `DEVICE_KEY=my-secret-key npm run server`
4. **Start the dashboard** (terminal 2): `npm run dev`, open the address Vite prints, press Sign In.
5. **Test without hardware** (terminal 3): `$env:DEVICE_KEY="my-secret-key"; npm run test-data` (add `stop2` to watch a node go offline, `blackout1` to see a fault). The corner badge says LIVE + TEST DATA.
6. **Flash the master**: open the .ino in Arduino IDE, set `IS_SENDER false`, and fill `WIFI_SSID`, `WIFI_PASS`, `SERVER_URL` (your PC IP), and `DEVICE_KEY` (same as step 3). Board: ESP32 Dev Module. Upload.
7. **Flash each lamp node**: `IS_SENDER true`, `NODE_ID` 1, 2, 3 (one each). `NODE_ID 1` appears as `L-001`.
8. **Verify**: master Serial Monitor (115200) should print `Bridge: sent node 1 seq N (HTTP 200)` after each `[BEAT]` line, and L-001 turns ONLINE with its lux. Unplug a node: after 60 s it shows a delayed reading (STALE), after 90 s OFFLINE.

## Notes
- The server keeps data in memory only; restarting it clears the lamps until they report again.
- **Lamps appear only when detected.** The Lamp Network Status grid, Streetlight Monitoring table and map start empty. A lamp is added the first time its node reports (`NODE_ID 4` appears as `L-004`), and it stays listed as OFFLINE if it later goes silent. Lamps are always listed in ID order (L-001, L-002, L-003...). A newly detected lamp shows "Location not set" until it is given a street. Voltage shows "—" because no voltage is measured.
- Map poles whose device has not been detected yet show as "No Device" (details say "Not detected yet").
- The Details, Maintenance and Controls screens are still sample data and are not connected. Maintenance tickets are labeled SAMPLE DATA: the ticket number is `MT-0000` and the lamp ID is the separate `L-000` value (e.g. MT-1046 is a ticket for lamp L-021).
- Manual Control (and Turn all ON/OFF) were removed from the Controls tab; it keeps the schedule, Reset fault alerts and the activity log.
- If the receiver cannot be reached, the dashboard falls back to labeled DEMO DATA (24 sample lamps, in ID order).

## Opening city animation (login screen)
New files: `src/CityIntro.jsx`, `src/cityIntro.css`, `src/introSession.js`. Modified: `src/App.jsx` (3 small additions: two imports, one `showIntro` state, and the overlay rendered next to `<Login />`). No existing screen was changed.
- Plays every time the page is opened or refreshed. To play it only once per browser session, set `PLAY_EVERY_LOAD = false` in `src/introSession.js` (then `?intro=1` replays it). "Skip intro" (or Esc) is available from the start.
- `prefers-reduced-motion`: shows the finished, still scene with the Sign In button, no movement.
- Tuning (top of `.ci-root` in `cityIntro.css`): `--ci-s` overall speed (1.5 = 50% slower), `--ci-walk-time` walking time, `--ci-flicker-low` flicker depth (0.35 visible, 0.8 almost none), `--ci-lamp` / `--ci-warm` / `--ci-win-cool` / `--ci-sky-*` colours.
- To remove it: delete the two imports, the `showIntro` line and the `{showIntro && ...}` line in `App.jsx`.
