# LUMINARA: Complete Step-by-Step Guide
Connecting the ESP32 lamp nodes and master to the web dashboard

Status of this guide: the PC side (server and dashboard, Parts 2 to 4) was tested with simulated packets. The ESP32 side (Parts 5 to 9) has NOT been tested on real hardware and the modified sketch has not been compiled by me. Treat Parts 5 to 9 as your first hardware test, and use the troubleshooting table (Part 11) if something differs.

---

## Part 0. How the pieces fit together

```
[BH1750] -> LAMP NODE ESP32 --LoRa 433 MHz--> MASTER ESP32 --Wi-Fi--> PC running server.js --> Dashboard in browser
            (IS_SENDER true)                  (IS_SENDER false)        (port 3001)             (port 5173)
```

1. Each lamp node reads its BH1750 and sends a packet by LoRa: JOIN when it starts, ALRT when the light changes or the status changes, BEAT every 30 seconds.
2. The master receives the packet, replies with an ACK (as before), then puts a copy in a small queue.
3. When the loop is free, the master sends the copy to your PC over Wi-Fi (HTTP POST).
4. The server (`server/server.js`) checks the packet and remembers the latest reading of each node. If a node is silent for 75 seconds it is marked OFFLINE.
5. The dashboard receives the update automatically (no page refresh) and shows it.

Node number to lamp ID: node 1 = L-001, node 2 = L-002, node 3 = L-003, and so on. NODE_ID in the sketch decides which lamp row the data appears in.

---

## Part 1. What you need

Hardware
- 1 master ESP32 + SX1278 LoRa module (+ antenna) + optional 16x2 I2C LCD (address 0x27)
- 1 to 3 lamp node ESP32 boards, each with an SX1278 LoRa module (+ antenna) and a BH1750
- USB cables (data cables, not charge-only)
- A PC (Windows, macOS or Linux) on a 2.4 GHz Wi-Fi network

Important: never power an SX1278 without its antenna attached; it can damage the radio.

Software (all free)
- Node.js 18 or newer: https://nodejs.org (choose LTS)
- Visual Studio Code: https://code.visualstudio.com
- Arduino IDE 2.x: https://www.arduino.cc/en/software

---

## Part 2. Prepare the dashboard project on your PC

1. Unzip `luminara-integrated.zip` to a simple folder, for example `C:\luminara-integrated`.
2. Open VS Code, then File > Open Folder, and choose the `luminara-integrated` folder.
3. Open the terminal: Terminal > New Terminal.
4. Check Node is installed:
   ```
   node --version
   ```
   It must print v18 or higher. If it says "not recognized", install Node.js and restart VS Code.
5. Install the dashboard's dependencies (one time, needs internet, takes a minute or two):
   ```
   npm install
   ```
   Warnings are normal. Errors are not; see Part 11.

---

## Part 3. Find your PC's IP address (the master needs it)

The master ESP32 must know where to send data. That is your PC's address on the Wi-Fi network.

Windows: open a terminal and run
```
ipconfig
```
Find the Wi-Fi adapter ("Wireless LAN adapter Wi-Fi") and read IPv4 Address, for example `192.168.1.50`.

macOS: `ipconfig getifaddr en0`    Linux: `hostname -I`

Write it down. Rules:
- The PC and the master ESP32 must be on the SAME Wi-Fi network.
- The network must be 2.4 GHz. The ESP32 cannot join 5 GHz.
- Many school or public Wi-Fi networks block devices from talking to each other ("client isolation"). If that happens, use a phone hotspot or a home router instead.
- Your PC's IP can change when you reconnect. If data stops arriving later, run ipconfig again and update SERVER_URL.

---

## Part 4. Run the server and dashboard, and test WITHOUT hardware

You need three terminals. In VS Code, click the "+" in the terminal panel to open more.

### Terminal 1: the receiver (server)

Choose a secret key (any word without spaces). You will put the same key in the Arduino sketch.

Windows PowerShell:
```
$env:DEVICE_KEY="my-secret-key"
npm run server
```
macOS / Linux:
```
DEVICE_KEY=my-secret-key npm run server
```
Expected output: `LUMINARA receiver listening on port 3001`

If Windows shows a firewall prompt, tick "Private networks" and click Allow. Without this the ESP32 cannot reach your PC.

### Terminal 2: the dashboard
```
npm run dev
```
Open the address it prints (normally http://localhost:5173) and click SIGN IN (the existing login screen accepts any input; real login is not part of this integration).

Before any data arrives you will see all lamps as NO DATA and a badge in the bottom-right corner reading "LIVE DATA". If the badge says "DEMO DATA - receiver not connected", the server in Terminal 1 is not running.

### Terminal 3: fake test packets

Windows PowerShell:
```
$env:DEVICE_KEY="my-secret-key"
npm run test-data
```
macOS / Linux: `DEVICE_KEY=my-secret-key npm run test-data`

Within about 5 seconds L-001, L-002 and L-003 turn ONLINE with lux values, and the badge changes to "LIVE + TEST DATA" (test packets are always labeled so they are not confused with real ones).

Optional test modes (stop Terminal 3 with Ctrl+C first, then run again with the word added):
- `npm run test-data -- stop2` : node 2 stops sending after 3 packets, so you can watch it turn OFFLINE after 75 seconds.
- `npm run test-data -- blackout1` : node 1 reports TOTAL_BLACKOUT with 0.0 lux, so you can see a FAULT in the table, tiles and map.

If this part works, the PC side is fine. Stop Terminal 3 before using real hardware so test packets do not mix with real ones. To clear old test data, stop and restart Terminal 1 (the server remembers readings only in memory).

---

## Part 5. Set up the Arduino IDE (one time)

1. Install the ESP32 board package: File > Preferences > "Additional boards manager URLs", add
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   then Tools > Board > Boards Manager, search "esp32", and install "esp32 by Espressif Systems".
2. Install libraries: Sketch > Include Library > Manage Libraries, then install:
   - `LoRa` by Sandeep Mistry
   - `BH1750` by Christopher Laws
   - `LiquidCrystal I2C` by Frank de Brabander
   (`WiFi` and `HTTPClient` come with the ESP32 package.)
3. Open the sketch: `firmware/Lora-withBH1750/Lora-withBH1750.ino`. Keep the file inside a folder with the same name (the Arduino IDE requires this; it is already arranged that way).
4. Select the board: Tools > Board > esp32 > "ESP32 Dev Module". Select the correct Port when a board is plugged in. If no port appears, install the USB driver for your board's chip (CP210x or CH340).

---

## Part 6. Wiring (taken directly from the pin definitions in your sketch)

SX1278 LoRa module to ESP32 (same on master and nodes). Use 3.3 V, not 5 V.

| SX1278 | ESP32 GPIO |
|---|---|
| SCK | 18 |
| MISO | 19 |
| MOSI | 23 |
| NSS / CS | 5 |
| RST | 14 |
| DIO0 | 26 |
| 3.3V / GND | 3V3 / GND |

BH1750 (lamp nodes) and the LCD (master) use I2C:

| Device | Pin | ESP32 GPIO |
|---|---|---|
| BH1750 | SDA / SCL | 21 / 22 |
| BH1750 | VCC / GND | 3V3 / GND |
| BH1750 | ADDR | leave unconnected or GND (address 0x23, as the sketch expects) |
| 16x2 LCD (I2C backpack, address 0x27) | SDA / SCL | 21 / 22 |

Point the BH1750 at the lamp. The sketch's LUX_MULTIPLIER, LUX_OFFSET and thresholds are unchanged from your original.

---

## Part 7. Flash the lamp nodes

For EACH lamp node board, one at a time:

1. In the sketch, near the top, set:
   ```
   #define IS_SENDER true
   #define NODE_ID 1        // use 1 for the first node, 2 for the second, 3 for the third
   ```
   Every node must have a different NODE_ID.
2. Set `#define ENABLE_WIFI_BRIDGE false` for node boards. This is optional (the bridge code does nothing on a node), but it keeps node builds identical to your original.
3. Select the board's port, click Upload. If it hangs at "Connecting......", hold the BOOT button on the board until upload starts.
4. Open Tools > Serial Monitor, set the speed to 115200. You should see the node start, the BH1750 initialize (not "BH1750 init FAILED"), and JOIN / BEAT activity.
5. Label the board with its NODE_ID so you do not mix them up.

---

## Part 8. Flash the master

1. In the sketch set:
   ```
   #define IS_SENDER false
   #define ENABLE_WIFI_BRIDGE true
   #define WIFI_SSID   "your wifi name"
   #define WIFI_PASS   "your wifi password"
   #define SERVER_URL  "http://192.168.1.50:3001/api/telemetry"
   #define DEVICE_KEY  "my-secret-key"
   ```
   - SERVER_URL: replace 192.168.1.50 with YOUR PC's IP from Part 3. Keep `:3001/api/telemetry`.
   - DEVICE_KEY must be exactly the same as the key used to start the server in Part 4 (case-sensitive). Never share the real key publicly.
2. Upload to the master board.
3. Open the Serial Monitor at 115200. Expect `Bridge: connecting to Wi-Fi...` and the normal master startup lines.

---

## Part 9. Verify real data reaches the dashboard

Make sure Terminal 1 (server) and Terminal 2 (dashboard) are running, and Terminal 3 (test data) is NOT.

1. Power on the master, then power on one lamp node.
2. Master Serial Monitor: when a node packet arrives you will see the existing `[JOIN]` / `[BEAT]` / `[ALRT]` line, then `Bridge: sent node 1 seq N (HTTP 200)`.
   - HTTP 200 means the server accepted it.
3. Server terminal: no output is printed per packet, so check the browser instead.
4. Dashboard: L-001 turns ONLINE and its lux appears on the Streetlights screen. The badge reads "LIVE DATA" (no "TEST"). The Overview counts update, and the Streetlight Map shows L-001 as active.
5. Cover the BH1750 with your hand. After the next ALRT (a change of more than 10 lux triggers one, checked every 2 seconds) the lux drops, and the status shows what the node reports: LOW_LIGHT appears as WARNING, TOTAL_BLACKOUT as FAULT. Uncover it and it returns to NORMAL / ONLINE.
6. Add the second and third nodes the same way and confirm each lights up its own row (L-002, L-003).

Real data works only when all three of these are true: the node packet appears in the master Serial Monitor, the Bridge line shows HTTP 200, and the dashboard badge says LIVE DATA.

---

## Part 10. Test disconnection, recovery and a fault

1. Disconnect: unplug one lamp node. Within about 75 seconds (the firmware's DISCONNECT_TIMEOUT_MS) its row changes to OFFLINE, its lux is no longer shown (an old value is never displayed as current), and it appears under Recent Alerts. The last-seen time stays visible.
2. Recovery: plug the node back in. It sends JOIN, and the row returns to ONLINE with a new reading.
3. Wi-Fi/server outage: stop the server (Ctrl+C in Terminal 1) for a minute. The master prints `Bridge: send failed ... will retry`, and the dashboard shows "DEMO DATA - receiver not connected". Restart the server: queued packets (up to 16) are delivered, and live data resumes. Because the server keeps data only in memory, lamps show NO DATA until each node reports again.
4. Wrong key: set a different DEVICE_KEY in the sketch and re-upload. The master prints `server rejected packet (HTTP 401)`. Fix the key to recover.

---

## Part 11. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `npm install` fails | Check internet and Node version (`node --version` must be 18+). Delete the `node_modules` folder and run again. |
| Dashboard badge says DEMO DATA | The server is not running, or not on port 3001. Start Terminal 1. Reload the page. |
| Test data does not appear | The DEVICE_KEY in Terminal 3 differs from Terminal 1. Use the same value. |
| Master never prints `Bridge: sent` | No LoRa packets are arriving: check antennas, wiring, same LORA_FREQ on both, nodes powered, IS_SENDER settings. |
| Master prints send failed (-1) | The master cannot reach the PC: wrong SERVER_URL IP, PC firewall blocking port 3001, different network, or school Wi-Fi isolation. Try the phone hotspot with both devices on it. |
| `server rejected packet (HTTP 401)` | DEVICE_KEY mismatch between sketch and server. |
| `server rejected packet (HTTP 400)` | The packet failed validation (for example a NODE_ID above 31). The server's error text is visible by testing with curl. |
| Wi-Fi never connects | Wrong SSID or password, or a 5 GHz-only network. Use 2.4 GHz. |
| `BH1750 init FAILED` | Check SDA 21 / SCL 22 wiring and 3.3 V power. |
| LoRa init failed | Check the SPI wiring in Part 6 and that the module is on 3.3 V. |
| Upload stuck at "Connecting..." | Hold the BOOT button, use a data USB cable, check the port. |
| Compile error about a missing library | Install the library named in the error (Part 5 step 2). |
| A lamp row stays NO DATA | Its NODE_ID does not match the row (node 5 appears as L-005), or that node's packets never reach the master. |
| Some packets seem missing | Known limit: while the master is sending to the server (up to 1.5 s) it is not listening to LoRa. Nodes retransmit, so data normally still arrives. |
| Nodes print "Max retries reached" | Known bug in the original node code: retries use a new sequence number that the master's ACK does not match. The master still receives the data. It was left unchanged on purpose. |

---

## Part 12. What the dashboard statuses mean

| Dashboard shows | Meaning |
|---|---|
| ONLINE | The node reported NORMAL within the last 75 seconds. |
| WARNING | The node reported LOW_LIGHT (25 lux or below). |
| FAULT | The node reported TOTAL_BLACKOUT (1 lux or below), BLINKING/UNSTABLE, or SENSOR_ERROR. This is a reported condition, not a confirmed lamp failure: the node does not know if the feed is ON, so it will also appear in daylight or when the feed is off. |
| OFFLINE | No packet for more than 75 seconds. This is a communication problem, not proof the lamp failed. |
| NO DATA | That lamp has not reported since the server started. |
| "-" for voltage | The lamp nodes do not measure voltage, so none is shown. |

Badge in the bottom-right corner: LIVE DATA (real packets only), LIVE + TEST DATA (a test packet is present), DEMO DATA (server not reachable; the original sample values are shown).

---

## Part 13. Limitations and what is not connected

- The server stores only the latest reading per node, in memory. There is no history or fault log yet.
- Still sample data: the Streetlight Details screen, Maintenance, and the Controls/Settings screens. The Controls ON/OFF buttons do not operate any hardware.
- No relay, contactor, PZEM electrical readings, battery level, schedule or real user login are included, by design.
- The LoRa protocol is the original node-initiated one. The master polling described in the research paper is not implemented.
- The street names in the lamp table and the coordinates on the map are the original sample placeholders, not surveyed locations.
- The default key `dev-key-change-me` is for testing only. Always set your own DEVICE_KEY, and use the server only on a trusted network.

## Quick reference (every time you work)

```
Terminal 1:  $env:DEVICE_KEY="my-secret-key" ; npm run server
Terminal 2:  npm run dev        ->  open http://localhost:5173
Hardware:    power the master first, then the nodes
Check:       master Serial Monitor shows "Bridge: sent ... (HTTP 200)"
```
