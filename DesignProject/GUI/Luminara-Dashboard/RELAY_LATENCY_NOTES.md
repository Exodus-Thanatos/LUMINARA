# Relay switching latency

**Status after Phase 2:** A (immediate report) and the dashboard side of C (control state pushed on the stream) are DONE, see `PHASE2_CHANGES.md`.
Still open: B/C for the relay's own poll (Stage 2: server holds the relay's request), D, and the repeat-command issue (Stage 4).
The text below is the original analysis (before Phase 2).

Phase 1 changed only the dashboard's presentation of the Turn ON / Turn OFF flow. The wait itself comes from the
relay round trip, which lives in firmware and server code that Phase 1 did not touch.

## Where the time goes today (from reading `scheduledrelayTest.ino`, `server.js`, `App.jsx`)
1. Dashboard POST `/api/control` sets `want` immediately (fast).
2. The relay ESP32 polls `/api/command` every 2 s, so it learns about the command after 0–2 s.
3. The relay reports `applied=` on its NEXT poll, another 0–2 s later.
4. The dashboard polls `/api/control` every 2 s, another 0–2 s.
Typical ≈ 3 s, worst case ≈ 6 s. A blocking HTTP call on the relay (1.5 s connect / 2.5 s read timeouts) can add more, and also delays the relay's own schedule check.

## Options (each needs your approval; the first three change firmware or backend behaviour)
- **A. Relay reports as soon as it switches** (one extra request right after the relay changes), instead of on the next poll. Saves 0–2 s.
- **B. Shorter relay poll** (e.g. 1 s). Saves 0–1 s on average; more traffic.
- **C. Push instead of poll**: server-sent events (the dashboard already uses SSE for telemetry) for `applied`/`want`, and long-polling for the relay. Removes most of the wait.
- **D. Non-blocking relay HTTP** (shorter timeouts / run the poll in a task) so the schedule check never waits on the network.
- **E. Dashboard polls `/api/control` less often or reuses the SSE stream** (frontend-only once C exists).

## Related behaviour found while reading (not changed)
- The relay acts only when the command CHANGES. If the last dashboard command was ON, the relay's own schedule then turned it OFF,
  and you press "Turn ON" again, the server's `want` is unchanged (ON) so the relay ignores it and the dashboard keeps showing
  "Waiting for relay…". Phase 1 now shows a clear "no confirmation yet" message after 15 s, but the fix itself (e.g. the relay also
  compares `on` with its actual state, or the server clears `want` when the relay reports a different state) is a logic change.
- `POST /api/control` has no authentication.
