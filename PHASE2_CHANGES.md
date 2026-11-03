# Phase 2 (Stages 1 + 3): faster relay confirmation

Checkpoint tags: `phase2-baseline` (Phase 1 as delivered) -> `phase2-complete`.

## What changed
**Stage 1: relay firmware (`firmware/ScheduledRelay/ScheduledRelay.ino`, drop-in file `scheduledrelayTest_phase2.ino`)**
After the relay switches (from a dashboard command or from its own schedule) it reports `applied` to the server immediately, instead of on its next 2 s poll.
Four small edits to your `scheduledrelayTest.ino`: a `pollNow` flag, set in the two places that call `relay()`, and one changed `if` in `loop()`.
Nothing else changed: same pins, schedule, URL, key, 2 s poll, same request format. Rollback = flash your old sketch.

**Stage 3: server + dashboard**
- `server/server.js` (additive): new `event: control` on the existing `/api/stream`, sent on connect, when a dashboard command is posted, when the relay's reported state or online status changes (not on identical polls), and every 5 s as a heartbeat. `GET/POST /api/control`, `GET /api/command`, telemetry ingest, auth and all response shapes are unchanged.
- `src/useLiveLamps.js` (additive): listens for `control` on the SAME EventSource (still one connection) and keeps the latest value in a small store. `mergeLive`, the hook's return value and the status mapping are untouched.
- `src/App.jsx` Controls: shows the newest of pushed state / POST reply / poll. The 2 s poll now only runs when no push has arrived for 8 s (old server, dropped stream).

## Measured (median ms, 8 or 10 random-timing trials each; real server, real browser)
Relay sketch, time until the server records "applied" (the real sketch code compiled on a PC): **original 2,784 -> Stage 1 823**.
Click to "Lights ON" on screen:
| dashboard | relay | median |
|---|---|---|
| Phase 1 | original | 3,367 |
| Phase 1 | Stage 1 | 2,474 |
| Stage 3 | original | 2,528 |
| **Stage 3** | **Stage 1** | **537** |
Slow trials in the last row (1.2-2.0 s) are the command waiting for the relay's next poll: that is Stage 2.
Relay confirmation to screen: 18-31 ms (was up to 2 s).

## Tests
`npm test`: 31/31 (26 original + 4 server tests for the control event/contract + 1 store test). Build OK. Lint: same 5 pre-existing problems.
Phase 1 manual checks (35): all still pass. New push-path checks (8): no polling while pushes arrive; confirmation < 500 ms; request shown as "waiting", never as success;
"controller offline" appears by itself; server stop -> "server unreachable" (about 9 s, because the dashboard waits for the missed heartbeat; plain polling took about 2 s);
automatic recovery; and an OLD server without control events still works through polling.

## NOT verified (needs your hardware)
Flashing and running `ScheduledRelay.ino` on the real ESP32 + relay on your Wi-Fi. The host test runs the same code with stand-ins, not the radio or relay.
Suggested check: flash, press Turn ON/OFF 10 times, note the time to "Lights ON".

## Still open (not done)
Stage 2 (server holds the relay's request so commands arrive instantly) and Stage 4 (repeat command ignored after a scheduled change); see `RELAY_LATENCY_NOTES.md`.
