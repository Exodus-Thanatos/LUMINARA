# LUMINARA mesh firmware notes

## Build configuration
- Sensor/relay node: set `IS_SENDER true`, set a unique `NODE_ID` (1..31). Set `ENABLE_WIFI_BRIDGE false` on battery-only relay nodes; set it true only on a sensor/relay that should also bridge over Wi-Fi.
- Wi-Fi gateway/relay: set `IS_SENDER false`, keep `ENABLE_WIFI_BRIDGE true`, and configure `secrets.h`. A sensor node can also be a bridge by using `IS_SENDER true` plus `ENABLE_WIFI_BRIDGE true`.
- All devices must use identical LoRa settings and the same mesh protocol constants.
- `MESH_ACTIVE_RELAY` and `MESH_RELAY_AWAKE` control relay participation/availability.
- `MESH_TTL_INITIAL` is the maximum forwarding depth (default 5).

## Wire packet
`LM1,type,originNodeId,seq,lux,status,ttl`

`type` is ALRT or BEAT. Origin and sequence are immutable. Each relay decrements TTL.
The SX127x hardware CRC is enabled by the sketch. Malformed fields and unknown statuses are rejected.

## Operation
This prototype uses controlled flooding, not route discovery. Each receiver caches
(origin, sequence), queues one forwarding copy after random 200..1800 ms jitter, and
drops duplicates/expired queue entries. The gateway queues the original dashboard
payload fields to the existing HTTP bridge. The backend's existing node/sequence
ingestion behavior provides an additional duplicate/stale-sequence guard.

## Power and time
Relay-enabled nodes stay in LoRa receive mode continuously. This is necessary to
relay immediately and increases power consumption. Set `MESH_RELAY_AWAKE false`
for a sensor-only node that is not an active relay. Mesh mode suppresses legacy
master sleep commands and automatic deep sleep so a relay is not silently removed.
The gateway may send a periodic SYNC time seed from NTP for the existing shift-aware
classification; telemetry routing does not depend on it. Without a valid time seed,
the existing `shiftActive()` logic will classify night-time readings as STANDBY
(unless daylight or sensor error takes precedence).

## Compatibility
The HTTP bridge continues posting `type,nodeId,seq,lux,status,rssi` to
`POST /api/telemetry` with the existing `X-Api-Key` header. `nodeId` and `seq`
refer to the original sensor, not the last relay. `rssi` is the RSSI measured by
the gateway for the last LoRa hop. No frontend/API schema change is required.

## Limitations
- No route discovery, acknowledgements, retransmission protocol, or end-to-end delivery guarantee.
- Random jitter reduces but does not eliminate collisions.
- Queue/cache are fixed-size RAM structures; congestion can drop packets.
- SF10/BW125 airtime and continuous RX power make dense networks expensive.
- `LoRa.endPacket()` is synchronous in the Arduino-LoRa library used here.
- Arduino CLI was not available in the editing environment; compile and RF validation
  must be performed in Arduino IDE with the same ESP32 core and library versions.
