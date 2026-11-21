# LUMINARA: PZEM-004T 100A integration (single ESP32: relay + PZEM)

Checkpoint tags: `pzem-baseline` (Phase 2 as delivered) -> `pzem-complete`.
**Status: software verified in simulation. The hardware is NOT verified operational.** See `PZEM_HARDWARE_CHECKLIST.md`.
Mains-side installation (the PZEM voltage terminals and the split-core CT) must be done and checked by a qualified electrician. This document does not describe mains wiring.

## 1. What was verified about the hardware, and what was not

| Item | Result | Basis |
|---|---|---|
| Protocol | Modbus-RTU over TTL UART, **9600 baud, 8N1**, read function 0x04, 10 registers from 0x0000, CRC-16 (poly 0xA001, low byte first) | Manufacturer datasheet (PZEM-004T V3.0), read directly, incl. its worked example frame |
| Address | 0x01-0xF7 per meter; **0xF8 = general address**, valid when exactly one meter is on the line. Firmware uses 0xF8 | Datasheet |
| Ranges (V3.0 datasheet) | 80-260 V (0.1 V), 0-100 A for the 100A model (0.001 A), 0-23 kW (0.1 W), 0-9999.99 kWh (1 Wh), 45-65 Hz (0.1 Hz), PF 0.00-1.00 (0.01). 60 Hz Philippine mains is inside the range | Datasheet |
| TTL side | "Passive" interface: needs its own external **5 V** on the TTL side | Datasheet |
| Isolation | TTL side is separated from the mains side by optocouplers; the 5 V only powers the opto side | Third-party descriptions (library README, Arduino forum), consistent with the design. **Not a certified isolation rating, not verified on your unit** |
| Logic levels | The meter's TX output idles at about the module's own 5 V (pull-up to 5 V). The ESP32 inputs are 3.3 V only and **not 5 V tolerant**. The meter's RX is an optocoupler LED input, normally driven fine from 3.3 V | Third-party descriptions of the module circuit; **must be confirmed by measuring your module** (checklist step 3) |
| **Exact hardware revision** | **NOT verified.** Nothing here can read your label. 100A modules were sold as V3.0 (Modbus, supported) and as older versions with a different protocol (NOT supported) | You must read the label (checklist step 1). If the meter answers the first request, it is the Modbus type |
| 100A CT | The 100A model uses an external CT (split-core in your case). The datasheet does not publish a CT ratio. Use only the CT supplied with the module; do not substitute | Datasheet / listings. Confirm CT type with the supplier |
| ESP32 pins | GPIO16/17 are the default UART2 pins; free on ESP32-WROOM-32 (they are used internally on WROVER/PSRAM modules); not strapping pins; separate from the USB-serial UART0 (GPIO1/3) | Pinout references (Last Minute Engineers, uPesy) |

## 2. GPIO assignment

| ESP32 GPIO | PZEM signal | Purpose | Electrical compatibility / verification |
|---|---|---|---|
| **27** | (relay module input) | Existing relay control, unchanged | Not used by the PZEM. Compile-time check forbids reusing it |
| **16** (RX2) | PZEM **TX** | Modbus replies into the ESP32 | **Needs level shifting. Do not connect directly.** PZEM TX idles at about 5 V; GPIO16 is 3.3 V only. Measure first (checklist step 3), then use a 3.3 V/5 V level shifter or an equivalent verified divider |
| **17** (TX2) | PZEM **RX** | Modbus requests out of the ESP32 | 3.3 V output into an optocoupler LED input: widely reported to work. Confirm by the communication test (checklist step 5) |
| 5 V (board 5V/VIN pin) | PZEM **5V** | Powers the opto (TTL) side | Datasheet: external 5 V required. Use a regulated supply; check the ESP32 does not brown out when the PZEM is connected |
| GND | PZEM **GND** | Common reference for the TTL side only | The TTL side is optically isolated from mains. Do not connect it to the mains side |
| 1 / 3 (UART0) | - | USB serial log and flashing | Untouched |
| 0, 2, 5, 12, 15 / 6-11 / 34-39 | - | Boot-strapping / flash / input-only | Not used. The sketch refuses to compile if PZEM pins are set to these, to GPIO27, or if RX = TX |

No wiring diagram is provided on purpose: the level-shifter values depend on what you measure on your module.

## 3. Firmware: `scheduledrelayTest_PZEM.ino`

Built from your `scheduledrelayTest_phase2.ino` by **insertion only: 169 lines added, 0 removed or changed.** `loop()`, `relay()`, `pollCommand()` and `scheduledState()` are byte-identical (checked). Preserved: GPIO27 relay, Wi-Fi, NTP, 2 s command polling, immediate "applied" reporting (Phase 2), the automatic schedule, dashboard commands. Credentials stay in the file you flash.
- `PZEM_ENABLED = false` makes it behave exactly like the Phase 2 sketch.
- Settings block (top of the file): `PZEM_RX_PIN 16`, `PZEM_TX_PIN 17`, 9600 baud, address 0xF8, read every 2 s, post every 5 s.
- Two FreeRTOS tasks on core 0 (loop() runs on core 1): **read task** (Modbus read, never waits more than 300 ms, yields while waiting) and **post task** (own HTTP client and timeouts). A slow server or a missing meter cannot block the relay.
- Disconnection: after 3 failed reads the status is "not answering"; the post task keeps sending `{ok:false, reason}` so the dashboard can tell "meter not answering" from "ESP32 offline". Reasons: `no_response`, `bad_crc`, `meter_error`, `bad_frame`. It recovers by itself.
- Serial log (115200): `[PZEM] enabled: ...`, `[PZEM] reading OK ...`, `[PZEM] not answering (reason). Check 5 V ...`, `[PZEM] post failed ...` (only when the result changes).
- Not implemented: resetting the meter's energy counter, changing its address, alarm threshold, calibration. (Deliberate: these write to the meter.)
- Different pins: edit the two constants; bad choices fail to compile.

## 4. Backend (additive; existing endpoints unchanged)

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/pzem` | `X-Api-Key` (same device key) | ESP32 posts a reading or a status |
| `GET /api/pzem` | none (like `/api/lamps`) | latest reading + status for the dashboard |
| `GET /api/pzem/history?range=1h\|6h\|24h` | none | power history (1 / 5 / 15-minute steps) |

Payload (reading): `{"ok":true,"seq":12,"voltage":229.8,"current":1.234,"power":280.5,"energy":12.345,"frequency":60.0,"pf":0.99,"alarm":false,"errors":0}` (units: V, A, W, kWh, Hz). Status only: `{"ok":false,"seq":13,"errors":4,"reason":"no_response"}`. Optional `"source":"test"` marks simulated data (the dashboard shows a TEST DATA tag).
Status values: `none`, `live`, `pzem_offline` (ESP32 posting, meter silent), `stale` (nothing received for 15 s; env `PZEM_STALE_AFTER_MS`).
Separate by construction: PZEM data is in its own module (`server/pzem.js`); it never enters lamp telemetry, the stream snapshot or relay control (tested both ways). In memory only: a server restart clears the history; the meter keeps its own kWh counter.
`node server/send-test-pzem.js` sends simulated readings (always labelled test).

## 5. Dashboard

On the existing Dashboard, under the four summary cards: **Extension Power Monitoring**. One Voltage card by default. Click: Current, Active Power, Energy, Frequency, Power Factor and a meter-status card appear, with **Power Consumption History** underneath (1 h / 6 h / 24 h, average and peak power, energy used). Click again: collapses. No new page or navigation item. States: no connection, waiting, live, meter not answering (with what to check), no update (with the age); stale values are greyed, nothing is invented. History is only requested while expanded.
Settings: the (still UI-only) low-voltage threshold hint now says it is not compared with the PZEM voltage.

## 6. Test results (simulation only)

- Unit/HTTP tests: 51/51 (31 before + 10 PZEM module + 5 PZEM HTTP + 5 panel wording).
- Firmware on a PC (real sketch code, simulated meter, real server): 20/20. Request bytes F8 04 00 00 00 0A 64 64 match an independent CRC implementation; the datasheet's example frame decodes to 220.0 V / 1.000 A / 220.0 W / 0 kWh / 50.0 Hz / PF 1.00; 32-bit values (100.000 A, 23000 W, 1234.567 kWh) decode; corrupted CRC, error frame, truncated and wrong-function replies are rejected; meter removal and return, and a server outage, are survived.
- Relay timing, same command sequence: Phase 2 sketch 1175 ms median; PZEM sketch with the meter disabled 1194 ms; with the meter running 1206 ms; relay confirmation unchanged while the meter is missing.
- Pin guards: 7 bad combinations rejected at compile time, a valid alternative accepted.
- Browser (real receiver): panel states, collapse/expand, range switching, no polling while collapsed, no new page/tab, phone width: 19/19. Earlier regression runs: see section 7.

## 7. Not verified / limits
- Not run on a real ESP32, PZEM, CT, relay board or mains. The simulation checks logic and protocol, not the radio, the level shifter, the optocouplers or accuracy.
- No claim of measurement accuracy; verify against a reference meter (checklist).
- Revision, CT type and logic levels of your unit are unconfirmed (section 1).
- The relay sketch's schedule still has the test value `ON 17:28` (comment says 6:00 PM); unchanged.
- History is in memory only.

Sources: PZEM-004T V3.0 datasheet (https://narodmon.com/img/sens/PZEM-004Tv3.pdf); PZEM-004T-v30 Arduino library README (https://github.com/mandulaj/PZEM-004T-v30); ESPHome pzemac docs (https://esphome.io/components/sensor/pzemac/); Arduino forum thread on ESP32 + PZEM (https://forum.arduino.cc/t/esp32-pzem-004t-v3-communication-problem/881630); ESP32-WROOM-32 pinout (https://lastminuteengineers.com/esp32-wroom-32-pinout-reference).
