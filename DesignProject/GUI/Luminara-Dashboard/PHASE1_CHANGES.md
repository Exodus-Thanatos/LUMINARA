# Phase 1: UI refresh, PowerPoint sync, navigation performance

Checkpoint: Git tag `phase1-baseline` (the project exactly as uploaded) and `luminara-phase1-baseline.zip`.
Result: tag `phase1-complete`.

## Not touched (verified by `git diff phase1-baseline --stat`)
`server/` (server.js, send-test-data.js, server.test.js), `firmware/`, `src/useLiveLamps.js` and its test, `vite.config.js`, `package.json`,
all API endpoints and request bodies. The 1,100-line commented-out copies in `App.jsx` and `server.js` are preserved.

## Changed
- `src/App.jsx` (live part only): shared card/button/input styling; card titles with dividers; Settings screen wired in; map is loaded on first
  visit and then kept mounted; `devices` keeps the same array while nothing in it changed; Dashboard/Streetlights memoised; Controls feedback (below).
- `src/StreetlightMap.jsx`: markers update in place (only changed markers are rebuilt); map re-measures when shown again; `Row` moved out of render;
  optional `active` / `showSample` props (the parent can own the existing "show sample locations" setting); restyled inputs and buttons.
- `src/streetlightMapData.js`: exports the existing "show sample" storage key and reader (same key, same behaviour).
- `src/index.css`: page fade-in, focus rings, press feedback (respects reduced motion).
- NEW `src/Settings.jsx`, `src/uiKit.jsx`; NEW `tools/ppt-sync/`, `RELAY_LATENCY_NOTES.md`, this file.

## UI
Green branding kept. Adopted from the reference: card layout with divider under the title, 16 px card radius, grey rounded inputs, pill toggles (green), spacing.
Settings has two views (Profile & Account, System & Notifications). Each item is tagged **WORKING** or **UI ONLY · NOT CONNECTED**.
Only Compact Map View is working (it is the map's existing "Show sample locations" setting, inverted, shared in both directions).
Dark Theme is shown disabled ("not available yet"). No account, alert, threshold or export does anything; the buttons say so.
Controls: Automatic Schedule is tagged PREVIEW · NOT CONNECTED. Details: tagged SAMPLE DATA.

## Navigation / button performance
Findings: the map was rebuilt on every visit (Leaflet + markers), and every 5 s receiver snapshot re-rendered the active screen and rebuilt every marker.
Production build, headless Chromium, 6× CPU throttle (milliseconds, click to content painted):
| Map visit | before | after |
|---|---|---|
| first | 395 | 345 |
| 2nd / 3rd / 4th | 160 / 152 / 163 | 58 / 59 / 82 |
Without throttle: repeat visits 41–72 ms → 27–34 ms. Other screens were already fast and are unchanged within noise.
Main JS bundle 767 KB → 608 KB (map code is now a separate 172 KB chunk, preloaded after sign-in and on hover).
React.lazy/Suspense was tried and dropped: Suspense held its fallback ~300 ms even when the code was ready.
Turn ON / OFF: the wait for the relay is backend/firmware (see `RELAY_LATENCY_NOTES.md`) and was NOT changed. The dashboard now shows "Sending…", then
"Waiting for relay…" with an outlined button and "Requested ON · sent N s ago". "Lights ON/OFF" appears only when the relay itself reports it;
after 15 s without confirmation it says so; if the relay is offline it says "Queued · controller offline".

## Tests
`npm test`: 26/26 pass. `npm run build`: OK. `npm run lint`: 5 problems (was 15; all pre-existing, none new).
Manual run against a real receiver with test telemetry (35 checks, all pass): live vs demo labelling; lamps from the receiver; map markers, details, filters, search,
CSV export and import, reset; map kept alive and markers updated in place across 12 s of live updates; selection preserved; Compact Map View both ways;
Settings preview buttons send no requests; Turn ON never shows "Lights ON" before the relay confirms; relay confirmation shows "Lights ON";
browser uses only GET /api/stream, GET/POST /api/control (body `{"on":bool}`); one SSE connection for the whole session; no console errors.

## Found, NOT changed (need your decision)
1. Demo-mode map counts the 16 UNINSTALLED lamps as installed-but-offline ("Devices installed 17", "Offline / fault 15" while the dashboard says 3 installed). It comes from `deriveLamp` in `StreetlightMap.jsx`.
2. Relay ignores a repeated command after its own schedule changed the state (see `RELAY_LATENCY_NOTES.md`).
3. `POST /api/control` is unauthenticated; the server default key and `send-test-data.js` default key differ; Wi-Fi password and device key are hardcoded as fallbacks in the `.ino` files and `server.js`.
4. `INTEGRATION.md` still says Manual Control was removed.
5. Details, Maintenance and the schedule card are still sample/preview content.
6. In the deck the map base tiles and the Details chart (an image of the real chart) are not editable; slides show the first screen of each page (1440×810), like a browser window.
