# PZEM hardware verification checklist

Nothing below has been done yet. Do not call the system operational until steps 1-9 pass. Steps marked (E) involve mains and must be done by a qualified electrician.
Record the result next to each step.

1. **Identify the module.** Photograph the label: model text (needs "V3.0" / Modbus, 4-pin TTL header 5V / RX / TX / GND), the CT type (split-core, supplied with the module). If it is an older version, STOP: the firmware does not support it.
2. **ESP32 board.** Confirm it is a WROOM-32 (not WROVER). If it is WROVER, change the two pin constants (for example RX 25, TX 26); the sketch checks them at compile time.
3. **Measure the PZEM TX idle level (no mains).** Power only the PZEM TTL side from 5 V, TX/RX NOT connected to the ESP32. Multimeter from PZEM TX to GND. About 5 V -> the ESP32 RX needs a level shifter (do not connect directly). 3.3 V or less -> still confirm before connecting.
4. **Flash** `scheduledrelayTest_PZEM.ino` (with `PZEM_ENABLED = true`). Open the serial monitor at 115200: expect `[PZEM] enabled: UART2 RX=GPIO16 TX=GPIO17 9600 8N1`.
5. **Link test, TTL side only (no mains on the PZEM).** Connect 5 V, GND, and the two signal wires through the verified level shifting. Expected: the meter does NOT answer without mains (its measuring chip is powered from the mains side). Serial: `[PZEM] not answering (no_response) ...`; dashboard: METER NOT ANSWERING. This proves the ESP32 side and server path work and that the relay is unaffected (press Turn ON/OFF: it still switches).
6. **(E) Mains side and CT** installed per the manufacturer manual and local rules, load connected through the relay circuit as designed. CT clamped around ONE conductor only.
7. **First readings.** Serial: `[PZEM] reading OK ...`; dashboard Voltage card shows LIVE and no TEST DATA tag. Click it: all readings appear.
8. **Accuracy against a reference.** Compare with a trusted meter: voltage (within the datasheet 0.5% plus the reference's own error), no-load current near 0, then a known load (for example a resistive 100 W lamp): power about 100 W, PF about 1.0, frequency about 60 Hz. Check the kWh counter increases with the load. Write down the numbers.
9. **Fault behaviour.** Unplug the PZEM TX wire: dashboard shows METER NOT ANSWERING within about 15 s, relay still switches at its normal speed. Reconnect: LIVE returns by itself. Switch Wi-Fi off for 30 s: NO UPDATE appears, then recovers.
10. **Soak.** 24 hours: no ESP32 resets, relay schedule still switches on time, history chart fills.
11. **Release.** Only now treat the PZEM monitoring as operational. Keep the previous sketch (`scheduledrelayTest_phase2.ino`) as the rollback.
