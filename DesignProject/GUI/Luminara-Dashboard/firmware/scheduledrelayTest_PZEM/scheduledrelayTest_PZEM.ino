#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>

const char* WIFI_SSID  = "YOUR_WIFI_NAME";
const char* WIFI_PASS  = "YOUR_WIFI_PASSWORD";
const char* COMMAND_URL = "http://YOUR_PC_IP:3001/api/command";  // PC running server.js
const char* DEVICE_KEY  = "YOUR_DEVICE_KEY";  // must match DEVICE_KEY of server.js

const int  RELAY_PIN  = 27;
const bool ACTIVE_LOW = false;   // flip if your board turns on with HIGH
bool lampOn = false;

// ===== SCHEDULE: edit these to test (24-hour clock) =====
const bool  SCHEDULE_ENABLED = true;   // false = dashboard control only, like before
const int   ON_HOUR  = 17, ON_MIN  = 28;    // lights ON  at 6:00 PM
const int   OFF_HOUR = 5,  OFF_MIN = 30;   // lights OFF at 5:30 AM
const char* TZ_STRING = "PST-8";           // Philippines, UTC+8 (same as the master)
// Quick test example (same-day window): ON 14:05, OFF 14:07 -> set the two
// times 2 minutes apart, a minute or two ahead of the current time.

int  lastCmd    = -1;      // last command value seen from the server (-1 = none yet)
bool ntpStarted = false;
bool pollNow    = false;   // Phase 2: set after the relay switches, so the new state is reported to the server right away


// =====================================================================================================
// PZEM-004T 100A (v3.0, Modbus-RTU over TTL) energy monitoring -- ADDED to scheduledrelayTest_phase2.ino.
// Everything above and in loop() is unchanged. The PZEM runs in its own FreeRTOS tasks (see the PZEM
// section before setup()), so a slow, missing or broken meter can never delay the relay, the schedule or
// the command polling.  Wiring, level shifting and the pre-power-up checks: PZEM_INTEGRATION.md.
// =====================================================================================================
const bool     PZEM_ENABLED  = true;     // false = behaves exactly like scheduledrelayTest_phase2.ino (no PZEM code runs)
const int      PZEM_RX_PIN   = 16;       // ESP32 UART2 RX  <-  PZEM "TX"  (5 V idle level: needs a level shifter/divider)
const int      PZEM_TX_PIN   = 17;       // ESP32 UART2 TX  ->  PZEM "RX"
const long     PZEM_BAUD     = 9600;     // fixed by the module: 9600 baud, 8 data bits, no parity, 1 stop bit
const uint8_t  PZEM_ADDR     = 0xF8;     // 0xF8 = "general address": the meter answers whatever its own address is (one meter only)
const uint32_t PZEM_READ_MS  = 2000;     // read the meter every 2 s
const uint32_t PZEM_POST_MS  = 5000;     // send to the server every 5 s (the dashboard treats 15 s of silence as "no update")
// Readings are POSTed to the PZEM endpoint, derived from COMMAND_URL (".../api/command" -> ".../api/pzem").
// It is a separate endpoint from the relay commands above and from the streetlight telemetry.

// Pin sanity checks (compile-time): the PZEM pins must not collide with the relay, the flash pins or the boot-strapping pins.
#define PZEM_PIN_BAD(p) ((p) == RELAY_PIN || ((p) >= 6 && (p) <= 11) || (p) == 0 || (p) == 2 || (p) == 5 || (p) == 12 || (p) == 15 || (p) < 0 || (p) > 39)
static_assert(!PZEM_PIN_BAD(PZEM_RX_PIN), "PZEM_RX_PIN must not be GPIO27 (relay), 6-11 (flash) or 0/2/5/12/15 (boot-strapping)");
static_assert(!PZEM_PIN_BAD(PZEM_TX_PIN) && !(PZEM_TX_PIN >= 34), "PZEM_TX_PIN must be an output-capable pin: not GPIO27 (relay), 6-11, 34-39 (input only) or 0/2/5/12/15");
static_assert(PZEM_RX_PIN != PZEM_TX_PIN, "PZEM RX and TX pins must differ");

void relay(bool on) {
  lampOn = on;
  digitalWrite(RELAY_PIN, (on == ACTIVE_LOW) ? LOW : HIGH);
  Serial.println(on ? "RELAY ON" : "RELAY OFF");
}

// 1 = schedule says ON, 0 = schedule says OFF, -1 = clock not synced yet
int scheduledState() {
  struct tm t;
  if (!getLocalTime(&t, 0)) return -1;
  int nowMin = t.tm_hour * 60 + t.tm_min;
  int onMin  = ON_HOUR * 60 + ON_MIN;
  int offMin = OFF_HOUR * 60 + OFF_MIN;
  bool isOn = (onMin < offMin) ? (nowMin >= onMin && nowMin < offMin)    // same-day window
                               : (nowMin >= onMin || nowMin < offMin);   // crosses midnight
  return isOn ? 1 : 0;
}

void pollCommand() {
  HTTPClient http;
  http.setConnectTimeout(1500);
  http.setTimeout(2500);
  if (!http.begin(String(COMMAND_URL) + "?applied=" + (lampOn ? "on" : "off"))) return;
  http.addHeader("X-Api-Key", DEVICE_KEY);
  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    int cmd = -1;                                    // "on":null -> no command, hold state
    if      (body.indexOf("\"on\":true")  >= 0) cmd = 1;
    else if (body.indexOf("\"on\":false") >= 0) cmd = 0;
    // Act only when the command CHANGES, so the server's old command does not
    // undo a scheduled switch. First value after boot is recorded, not applied,
    // when the schedule is enabled (the schedule decides the state at boot).
    if (cmd >= 0 && cmd != lastCmd) {
      bool first = (lastCmd < 0);
      lastCmd = cmd;
      if (!(first && SCHEDULE_ENABLED)) {
        relay(cmd == 1);
        pollNow = true;      // report "applied" now instead of waiting for the next 2 s poll
      }
    }
  } else {
    Serial.printf("poll failed: HTTP %d (%s) | my IP %s | url %s\n",
              code, HTTPClient::errorToString(code).c_str(),
              WiFi.localIP().toString().c_str(), COMMAND_URL);
  }
  http.end();
}

// ===================================== PZEM-004T monitoring =====================================
// Frame (datasheet): request  ADDR 04 00 00 00 0A CRC16   -> reads 10 input registers starting at 0x0000
//                    reply    ADDR 04 14 <20 data bytes> CRC16   (25 bytes), CRC16 = Modbus (poly 0xA001, low byte first)
// Registers: 0 voltage 0.1 V | 1-2 current 0.001 A (low word first) | 3-4 power 0.1 W (low word first)
//            5-6 energy 1 Wh (low word first) | 7 frequency 0.1 Hz | 8 power factor 0.01 | 9 alarm 0xFFFF = on
struct PzemData { float v, a, w, kwh, hz, pf; bool alarm; };

static SemaphoreHandle_t pzemMutex;
static PzemData  pzemData;
static bool      pzemHaveData = false;
static uint32_t  pzemDataAt   = 0;        // millis() of the last good reading
static uint8_t   pzemFails    = 0;        // consecutive failed reads
static uint32_t  pzemErrors   = 0;        // failed reads since boot
static int       pzemLastRc   = 0;
static uint32_t  pzemSeq      = 0;

static uint16_t pzemCrc(const uint8_t* b, size_t n) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < n; i++) {
    crc ^= b[i];
    for (int k = 0; k < 8; k++) crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : (crc >> 1);
  }
  return crc;
}

// 0 = ok | 1 = no / short reply | 2 = bad CRC | 3 = the meter answered with an error frame | 4 = unexpected frame
static int pzemRead(PzemData& d) {
  uint8_t req[8] = { PZEM_ADDR, 0x04, 0x00, 0x00, 0x00, 0x0A, 0, 0 };
  uint16_t c = pzemCrc(req, 6);
  req[6] = c & 0xFF;
  req[7] = c >> 8;
  while (Serial2.available()) Serial2.read();           // drop anything left over from a previous, failed read
  Serial2.write(req, sizeof(req));

  uint8_t buf[25];
  size_t n = 0;
  uint32_t t0 = millis();
  while (n < sizeof(buf) && millis() - t0 < 300) {      // never waits more than 300 ms, and yields while waiting
    if (Serial2.available()) buf[n++] = (uint8_t)Serial2.read();
    else vTaskDelay(1);
    if (n == 5 && (buf[1] & 0x80)) break;               // error frame: ADDR, FUNC|0x80, CODE, CRC16
  }
  if (n == 5 && (buf[1] & 0x80)) {
    uint16_t e = pzemCrc(buf, 3);
    return (buf[3] == (e & 0xFF) && buf[4] == (e >> 8)) ? 3 : 2;
  }
  if (n < sizeof(buf)) return 1;
  uint16_t crc = pzemCrc(buf, 23);
  if (buf[23] != (crc & 0xFF) || buf[24] != (crc >> 8)) return 2;
  if (buf[1] != 0x04 || buf[2] != 0x14) return 4;

  auto reg = [&](int i) -> uint32_t { return ((uint32_t)buf[3 + 2 * i] << 8) | buf[4 + 2 * i]; };
  d.v     = reg(0) / 10.0f;
  d.a     = ((reg(2) << 16) | reg(1)) / 1000.0f;
  d.w     = ((reg(4) << 16) | reg(3)) / 10.0f;
  d.kwh   = ((reg(6) << 16) | reg(5)) / 1000.0f;        // the meter counts Wh
  d.hz    = reg(7) / 10.0f;
  d.pf    = reg(8) / 100.0f;
  d.alarm = (reg(9) == 0xFFFF);
  return 0;
}

static const char* pzemReason(int rc) {
  switch (rc) {
    case 2:  return "bad_crc";
    case 3:  return "meter_error";
    case 4:  return "bad_frame";
    default: return "no_response";
  }
}

// Task 1: talk to the meter. A missing or silent meter only costs this task ~300 ms every PZEM_READ_MS.
static void pzemReadTask(void*) {
  Serial2.begin(PZEM_BAUD, SERIAL_8N1, PZEM_RX_PIN, PZEM_TX_PIN);
  bool reported = false;                                  // log only on state changes, not every failed read
  for (;;) {
    PzemData d;
    int rc = pzemRead(d);
    xSemaphoreTake(pzemMutex, portMAX_DELAY);
    if (rc == 0) {
      pzemData = d; pzemHaveData = true; pzemDataAt = millis(); pzemFails = 0;
    } else {
      if (pzemFails < 255) pzemFails++;
      pzemErrors++;
      pzemLastRc = rc;
    }
    uint8_t fails = pzemFails;
    xSemaphoreGive(pzemMutex);

    if (rc == 0 && !reported) { Serial.printf("[PZEM] reading OK: %.1f V %.3f A %.1f W %.3f kWh\n", d.v, d.a, d.w, d.kwh); reported = true; }
    if (rc != 0 && fails == 3) { Serial.printf("[PZEM] not answering (%s). Check 5 V on the PZEM TTL side, RX/TX wires, level shifter, and that the meter has mains power.\n", pzemReason(rc)); reported = false; }
    vTaskDelay(pdMS_TO_TICKS(PZEM_READ_MS));
  }
}

// Task 2: send the latest reading (or "meter not answering") to the PZEM endpoint. Its own HTTP client and timeouts:
// a slow server never touches the relay loop, and a missing meter never stops the status reports.
static void pzemPostTask(void*) {
  String url(COMMAND_URL);
  url.replace("/api/command", "/api/pzem");
  int lastCode = 0;
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(PZEM_POST_MS));
    if (WiFi.status() != WL_CONNECTED) continue;

    PzemData d; bool fresh; uint32_t errs;
    xSemaphoreTake(pzemMutex, portMAX_DELAY);
    d = pzemData;
    fresh = pzemHaveData && pzemFails < 3 && (millis() - pzemDataAt) < 6000;
    errs = pzemErrors;
    int rc = pzemLastRc;
    xSemaphoreGive(pzemMutex);

    char body[256];
    pzemSeq++;
    if (fresh)
      snprintf(body, sizeof(body),
               "{\"ok\":true,\"seq\":%lu,\"voltage\":%.1f,\"current\":%.3f,\"power\":%.1f,\"energy\":%.3f,\"frequency\":%.1f,\"pf\":%.2f,\"alarm\":%s,\"errors\":%lu}",
               (unsigned long)pzemSeq, d.v, d.a, d.w, d.kwh, d.hz, d.pf, d.alarm ? "true" : "false", (unsigned long)errs);
    else
      snprintf(body, sizeof(body), "{\"ok\":false,\"seq\":%lu,\"errors\":%lu,\"reason\":\"%s\"}", (unsigned long)pzemSeq, (unsigned long)errs, pzemReason(rc));

    HTTPClient http;
    http.setConnectTimeout(1500);
    http.setTimeout(2500);
    if (!http.begin(url)) continue;
    http.addHeader("X-Api-Key", DEVICE_KEY);
    http.addHeader("Content-Type", "application/json");
    int code = http.POST(String(body));
    if (code != 200 && code != lastCode) Serial.printf("[PZEM] post failed: HTTP %d (%s) url %s\n", code, HTTPClient::errorToString(code).c_str(), url.c_str());
    lastCode = code;
    http.end();
  }
}

void pzemBegin() {
  if (!PZEM_ENABLED) return;
  pzemMutex = xSemaphoreCreateMutex();
  Serial.printf("[PZEM] enabled: UART2 RX=GPIO%d TX=GPIO%d %ld 8N1, address 0x%02X\n", PZEM_RX_PIN, PZEM_TX_PIN, PZEM_BAUD, PZEM_ADDR);
  // Core 0 (with the Wi-Fi stack), priority 1 (same as loop()): the relay loop on core 1 is never preempted by these.
  xTaskCreatePinnedToCore(pzemReadTask, "pzemRead", 4096, NULL, 1, NULL, 0);
  xTaskCreatePinnedToCore(pzemPostTask, "pzemPost", 8192, NULL, 1, NULL, 0);
}

void setup() {
  Serial.begin(115200);
  digitalWrite(RELAY_PIN, ACTIVE_LOW ? HIGH : LOW);   // start "off" before enabling the pin
  pinMode(RELAY_PIN, OUTPUT);
  relay(false);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  pzemBegin();                                        // PZEM monitoring in its own tasks (does nothing if PZEM_ENABLED is false)
}

void loop() {
  static uint32_t lastPoll = 0, lastSched = 0, lastPrint = 0;
  static int lastState = -2;
  uint32_t now = millis();

  if (WiFi.status() == WL_CONNECTED) {
    if (!ntpStarted) {                       // start NTP once WiFi is up; it re-syncs about hourly
      configTzTime(TZ_STRING, "pool.ntp.org", "time.google.com");
      ntpStarted = true;
    }
    if (pollNow || now - lastPoll >= 2000) { pollNow = false; lastPoll = now; pollCommand(); }
  }

  // Schedule: act only when the scheduled state changes (and once right after the first clock sync)
  if (SCHEDULE_ENABLED && now - lastSched >= 1000) {
    lastSched = now;
    int s = scheduledState();
    if (s >= 0 && s != lastState) {
      lastState = s;
      Serial.printf("[Schedule] now %s -> relay %s\n", s ? "inside ON window" : "outside ON window", s ? "ON" : "OFF");
      relay(s == 1);
      pollNow = true;        // let the dashboard see a scheduled switch right away too
    }
  }

  // Status line every 10 s so you can watch the clock while testing
  if (now - lastPrint >= 10000) {
    lastPrint = now;
    struct tm t;
    if (getLocalTime(&t, 0))
      Serial.printf("[%02d:%02d:%02d] relay %s | schedule ON %02d:%02d, OFF %02d:%02d\n",
                    t.tm_hour, t.tm_min, t.tm_sec, lampOn ? "ON" : "OFF",
                    ON_HOUR, ON_MIN, OFF_HOUR, OFF_MIN);
    else
      Serial.println("[clock not synced yet]");
  }
  delay(10);
}
