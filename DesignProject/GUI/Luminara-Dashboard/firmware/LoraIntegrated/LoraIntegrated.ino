/*
  LUMINARA - Decentralized ad-hoc LoRa controlled-flooding prototype.
  Hardware: ESP32 + SX1278, BH1750 sensor; existing pin/radio settings retained.
  IS_SENDER=true  : sensor + peer relay (set a unique NODE_ID on each board).
  IS_SENDER=false : Wi-Fi gateway + peer relay (Wi-Fi is only used for HTTP/NTP).

  Mesh packet: LM1,type,originNodeId,seq,lux,status,ttl
  Relays preserve origin/seq/sensor fields, decrement TTL, cache duplicates,
  and forward once after randomized jitter. This is controlled flooding, not
  route discovery. The gateway's periodic SYNC is an optional time seed only;
  sensor telemetry and relay forwarding do not depend on it.
*/

#include <SPI.h>
#include <LoRa.h>
#include <Wire.h>
#include <BH1750.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <LittleFS.h>
#include <time.h>
#include <sys/time.h>
#include <ctype.h>
#include "esp_sleep.h"
#include <Preferences.h>

// ===== BOARD IDENTITY & ROLE =====
#define IS_SENDER  false  // true = lamp node, false = master gateway
#define NODE_ID 1             // set 1, 2, 3... for each lamp node (ignored when IS_SENDER == false)
#define MAX_NODES 32
#define EXPECTED_NODES 2      // master polls node IDs 1..EXPECTED_NODES; change to 3 post defense, or whatever actual nodes are present
#define DEMO_MODE 1           // 1 = compressed 20-minute bench cycle, 0 = real daily schedule (see buildSchedule)

// ===== DASHBOARD BRIDGE (MASTER ONLY) =====
#define ENABLE_WIFI_BRIDGE true
#if __has_include("secrets.h")
  #include "secrets.h"   // your real values; copy secrets.h.example to secrets.h (git-ignored)
#else
  #warning "secrets.h not found: using PLACEHOLDER Wi-Fi/server settings. Create secrets.h for real credentials."
#define WIFI_SSID  "Gonz" //GFiber_1A6C7 || Pasaway_Extender                                    // 2.4 GHz network
  #define WIFI_PASS  "Rophil12345" //zhNf7G37 || PlatimuM0911
  #define SERVER_URL "http://10.78.234.148:3001/api/telemetry"              // PC that runs server/server.js
  #define DEVICE_KEY "rophil1234"                         // Must equal DEVICE_KEY used by the backend
#endif
#define BRIDGE_QUEUE_SIZE 64
#define BRIDGE_HTTP_TIMEOUT_MS 1500
#define TZ_STRING "PST-8"     // Philippines, UTC+8, no DST

// ===== CALIBRATION =====
#define LUX_MULTIPLIER 1.0
#define LUX_OFFSET     0.0
#define LORA_FREQ_OFFSET 0

// ===== BH1750 LIGHT THRESHOLDS (LUX) — FROM ORIGINAL =====
#define LUX_BLACKOUT_MAX   5.0     // 0.0 to 5.0 Lux    -> TOTAL_BLACKOUT (Fault)
#define LUX_LOW_LIGHT_MAX  80.0    // 5.1 to 80.0 Lux   -> LOW_LIGHT (Warning)
#define LUX_DAYLIGHT_MIN   3000.0  // > 3000.0 Lux      -> DAYLIGHT_STANDBY (Normal / Never Fault)
#define LUX_FLICKER_DELTA  50.0    // Max-Min window difference to flag BLINKING/UNSTABLE

// ===== LAMP STATE TIMING & THRESHOLDS =====
#define LUX_CHANGE_THRESHOLD 50.0  // Raised from 10.0 to prevent LoRa packet spam
#define EVAL_INTERVAL_MS 2000
#define SERIAL_STATUS_MS 5000

// ===== DECENTRALIZED MESH CONFIGURATION =====
#define MESH_ENABLED true
#define MESH_TTL_INITIAL 5
#define MESH_CACHE_SIZE 48
#define MESH_RELAY_QUEUE_SIZE 8
#define MESH_RELAY_JITTER_MIN_MS 200
#define MESH_RELAY_JITTER_MAX_MS 1800
#define MESH_LOCAL_REPORT_INTERVAL_MS 30000UL
#define MESH_TIME_BEACON_INTERVAL_MS 60000UL
#define MESH_ACTIVE_RELAY true
#define MESH_RELAY_AWAKE true
#define MESH_QUEUE_EXPIRY_MS 120000UL

// ===== LEGACY PROTOCOL TIMING (mesh mode does not use strict slots) =====
#define FREE_PERIOD_S 30
#define SLOT_MS 3000                 // 8 slots * 3 s = 24 s, master window at the end of the 30 s cycle
#define MAX_SLOTS 8
#define SLOT_JITTER_MS 300           // a node may start up to this late inside its slot
#define ACK_WAIT_MS 700
#define MASTER_WIN_START_MS (MAX_SLOTS * SLOT_MS + 800)
#define NODE_WIN_OPEN_MS (MASTER_WIN_START_MS - 400)
#define NODE_WIN_CLOSE_MS (MASTER_WIN_START_MS + 3200)
#define BEACON_INTERVAL_MS 10000
#define SLEEP_BURST_CYCLES 3         // "sleep now" = this many sleep beacons, one per 30 s cycle (survives a lost packet)
#define SLEEP_POLL_MS 5000           // how often the master asks the dashboard server for the sleep setting
#define POLL_REPLY_MS 1500
#define POLL_WAVES 3
#define SYNC_AIRTIME_MS 490          // airtime of the beacon (max 37 bytes incl. the auto-sleep flag) at SF10/BW125 = 48 payload symbols, same as 35 bytes; recompute if SF/BW change or the beacon grows past 39 bytes
#define DISCONNECT_TIMEOUT_MS 85000  // master: node silent this long -> OFFLINE
#define LINK_TIMEOUT_MS 95000        // node: nothing heard from master this long -> DISCONNECTED
#define LOG_SNAPSHOT_S 300
#define STATUS_TABLE_MS 60000

#if DEMO_MODE
  #define WAVE_GAP_S 20
  #define LAMP_GRACE_S 20
  #define FAILSAFE_S 120
#else
  #define WAVE_GAP_S 300
  #define LAMP_GRACE_S 300           // ignore "lamp off" this long after switch-on time
  #define FAILSAFE_S 2700            // node sleeps by itself this long after shift end if master never said so
#endif

static_assert(!IS_SENDER || (NODE_ID >= 1 && NODE_ID <= MAX_SLOTS), "NODE_ID must be between 1 and MAX_SLOTS");

// ===== Pins (ESP32 -> SX1278) =====
#define LORA_SCK  18
#define LORA_MISO 19
#define LORA_MOSI 23
#define LORA_SS   5
#define LORA_RST  14
#define LORA_DIO0 26
#define I2C_SDA 21
#define I2C_SCL 22
#define LED_PIN 2

#define LORA_FREQ  433E6
#define LORA_SF    10
#define LORA_BW    125E3
#define LORA_CR    5
#define LORA_TXPWR 17

// Master phases. Declared up here (before any function) because the Arduino IDE auto-generates
// function prototypes near the top of the file, and onPhaseChange(MPhase, MPhase) needs this type first.
enum MPhase { MP_IDLE, MP_SYNC, MP_POLL, MP_FREE, MP_SLEEPCMD };

BH1750 lightMeter(0x23);
LiquidCrystal_I2C lcd(0x27, 16, 2);

unsigned long ledBlinkStartTime = 0;
bool isLedBlinking = false;

// Forward declaration so sendBeacon can service incoming packets while aligning to second boundary
void masterHandleRx();
void meshHandlePacket(const String &msg, int rssi, float snr, bool fromGateway);
void meshServiceRelay();
#if ENABLE_WIFI_BRIDGE
void bridgeSetup();
void bridgeEnqueue(const char *type, int nodeId, long seq, float lux, const char *status, int rssi);
#endif

// ================= SMALL HELPERS =================
void triggerBlink() { digitalWrite(LED_PIN, HIGH); isLedBlinking = true; ledBlinkStartTime = millis(); }
void processBlink() {
  if (isLedBlinking && (millis() - ledBlinkStartTime >= 100)) { digitalWrite(LED_PIN, LOW); isLedBlinking = false; }
}

bool radioRx(String &msg, int &rssi, float &snr) {
  int size = LoRa.parsePacket();
  if (size <= 0) return false;
  msg = "";
  msg.reserve(size + 1);
  while (LoRa.available()) msg += (char)LoRa.read();
  msg.trim();
  rssi = LoRa.packetRssi();
  snr = LoRa.packetSnr();
  return true;
}
void radioTx(const String &s) { LoRa.beginPacket(); LoRa.print(s); LoRa.endPacket(); }

bool timeIsValid() { return time(nullptr) > 1700000000L; }
uint64_t epochMs() { struct timeval tv; gettimeofday(&tv, NULL); return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000; }
long sodOf(time_t t) { struct tm tm; localtime_r(&t, &tm); return tm.tm_hour * 3600L + tm.tm_min * 60L + tm.tm_sec; }
void stampTo(time_t t, char *buf, size_t n) {
  if (t <= 1700000000L) { snprintf(buf, n, "NOTIME"); return; }
  struct tm tm; localtime_r(&t, &tm); strftime(buf, n, "%Y-%m-%d %H:%M:%S", &tm);
}

bool timeSynced = false;   // node: set by a beacon
bool clockTrusted() { return IS_SENDER ? timeSynced : timeIsValid(); }
const char *clockStr() {
  static char b[16];
  if (!clockTrusted()) { strcpy(b, "--:--:--"); return b; }
  time_t t = time(nullptr); struct tm tm; localtime_r(&t, &tm); strftime(b, sizeof(b), "%H:%M:%S", &tm);
  return b;
}

const char *lampText(const char *st) {
  if (!strcmp(st, "NORMAL_LIT") || !strcmp(st, "NORMAL")) return "ON";
  if (!strcmp(st, "DAYLIGHT_STANDBY")) return "DAYLIGHT";
  if (!strcmp(st, "LOW_LIGHT")) return "DIM";
  if (!strcmp(st, "TOTAL_BLACKOUT")) return "OFF";
  if (!strcmp(st, "BLINKING/UNSTABLE")) return "FLICKERING";
  if (!strcmp(st, "SENSOR_ERROR")) return "SENSOR ERR";
  if (!strcmp(st, "STANDBY")) return "STANDBY";
  return "?";
}
bool isFault(const char *st) {
  return !strcmp(st, "LOW_LIGHT") || !strcmp(st, "TOTAL_BLACKOUT") || !strcmp(st, "BLINKING/UNSTABLE") || !strcmp(st, "SENSOR_ERROR");
}
bool isValidStatusString(const String &st) {
  return st == "NORMAL_LIT" || st == "NORMAL" || st == "DAYLIGHT_STANDBY" ||
         st == "LOW_LIGHT" || st == "TOTAL_BLACKOUT" || st == "BLINKING/UNSTABLE" ||
         st == "SENSOR_ERROR" || st == "STANDBY";
}
bool isStrictInt(const String &s) {
  if (s.length() == 0) return false;
  size_t start = (s[0] == '-') ? 1 : 0;
  if (start == s.length()) return false;
  for (size_t i = start; i < s.length(); i++) if (!isdigit((unsigned char)s[i])) return false;
  return true;
}
bool isStrictFloat(const String &s) {
  if (s.length() == 0) return false;
  size_t start = (s[0] == '-' || s[0] == '+') ? 1 : 0;
  if (start == s.length()) return false;
  bool seenDot = false, seenDigit = false;
  for (size_t i = start; i < s.length(); i++) {
    if (s[i] == '.') {
      if (seenDot) return false;
      seenDot = true;
    } else if (isdigit((unsigned char)s[i])) {
      seenDigit = true;
    } else {
      return false;
    }
  }
  return seenDigit;
}

// ================= SENDER (LAMP NODE) =================
enum NodeMode { NM_LISTEN, NM_WAIT_POLL, NM_FREE };
const char *NODE_MODE_NAME[] = {"LISTENING", "WAIT-POLL", "FREE"};
NodeMode nodeMode = NM_LISTEN;

RTC_DATA_ATTR unsigned long seqNo = 0;
RTC_DATA_ATTR float lastSentLux = -100.0;
RTC_DATA_ATTR char lastSentStatus[24] = "INIT";
RTC_DATA_ATTR time_t expectedWakeEpoch = 0;

long shiftStartSod = 64800, shiftEndSod = 19800, wakeSod = 57600;   // replaced by the first beacon
bool nodeAutoSleep = true;      // from the beacon: false = MANUAL sleep control, so the failsafe below stays off
unsigned long lastHeardMs = 0, lastBeaconMs_n = 0;
bool linkConnected = false;
int lastRssi = 0; float lastSnr = 0; bool everHeard = false;
uint64_t lastTxCycle = 0;
bool radioRxOn = false;
struct MeshSeenEntry { uint16_t origin; uint32_t seq; uint32_t seenAt; };
struct MeshRelayItem { char packet[180]; uint32_t dueAt; uint32_t queuedAt; bool used; };
MeshSeenEntry meshSeen[MESH_CACHE_SIZE] = {};
MeshRelayItem meshRelayQueue[MESH_RELAY_QUEUE_SIZE] = {};
uint8_t meshSeenCursor = 0;
uint32_t meshForwarded = 0, meshDuplicates = 0, meshTtlDrops = 0, meshMalformed = 0;
uint32_t lastMeshLocalTx = 0;

float sampleLux = -1.0f, currentLux = -1.0f, minLuxWindow = 100000.0f, maxLuxWindow = 0.0f;
bool sensorOk = false;
bool hasFreshSample = false;
uint8_t bh1750ErrorCount = 0;
unsigned long lastSensorRetryMs = 0;
String currentStatus = "STANDBY";
unsigned long lastSampleMs = 0, lastEvalMs = 0, lastPrintMs = 0;

void powerDownBH1750() { Wire.beginTransmission(0x23); Wire.write(0x00); Wire.endTransmission(); }

bool initBH1750Sensor() {
  bool ok = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
  if (!ok) {
    sensorOk = false;
    hasFreshSample = false;
    currentStatus = "SENSOR_ERROR";
  } else {
    sensorOk = true;
    bh1750ErrorCount = 0;
  }
  return ok;
}

void goToSleep(const char *why) {
  long secs = 3600L; // Safe fallback if clock is somehow untrusted
  if (timeSynced || timeIsValid()) {
    long sod = sodOf(time(nullptr));
    secs = (wakeSod - sod + 86400L) % 86400L;
    if (secs < 30) secs = 30;
    expectedWakeEpoch = time(nullptr) + secs;
  } else {
    expectedWakeEpoch = 0;
  }
  Serial.printf("\n*** DEEP SLEEP (%s). Wake in %ld s (%ldh %02ldm) ***\n", why, secs, secs / 3600, (secs % 3600) / 60);
  Serial.flush();
  digitalWrite(LED_PIN, LOW);
  powerDownBH1750();
  LoRa.sleep();
  esp_sleep_enable_timer_wakeup((uint64_t)secs * 1000000ULL);
  esp_deep_sleep_start();
}

double applyClock(time_t ep) {
  struct timeval cur; gettimeofday(&cur, NULL);
  bool plausible = cur.tv_sec > 1700000000L;
  double before = cur.tv_sec + cur.tv_usec / 1e6;
  struct timeval nt; nt.tv_sec = ep; nt.tv_usec = SYNC_AIRTIME_MS * 1000L;
  settimeofday(&nt, NULL);
  timeSynced = true;
  return plausible ? (ep + SYNC_AIRTIME_MS / 1000.0 - before) : NAN;
}

void setLink(bool heard, int rssi, float snr) {
  if (!heard) return;
  lastHeardMs = millis(); lastRssi = rssi; lastSnr = snr; everHeard = true;
  if (!linkConnected) { linkConnected = true; Serial.printf("*** LINK CONNECTED (RSSI %d dBm, SNR %.1f dB) ***\n", rssi, snr); }
}

bool shiftActive() {
  if (!timeSynced) return false;
  long sod = sodOf(time(nullptr));
  long start = (shiftStartSod + LAMP_GRACE_S) % 86400L;
  long end = shiftEndSod;
  return (start <= end) ? (sod >= start && sod < end) : (sod >= start || sod < end);
}

// Uses Original v1 BH1750 thresholds + v2 schedule awareness
String computeStatus() {
  if (!sensorOk || !hasFreshSample || currentLux < 0.0f) return "SENSOR_ERROR";
  // 1. Brighter than any streetlight -> Daytime Standby (Never a fault, even during active shift)
  if (currentLux > LUX_DAYLIGHT_MIN) return "DAYLIGHT_STANDBY";
  // 2. Outside scheduled shift hours
  if (!shiftActive()) return "STANDBY";
  // 3. Flickering check during nighttime / active shift
  if (maxLuxWindow >= minLuxWindow && (maxLuxWindow - minLuxWindow) > LUX_FLICKER_DELTA) return "BLINKING/UNSTABLE";
  // 4. Complete bulb failure at night (Fault)
  if (currentLux <= LUX_BLACKOUT_MAX) return "TOTAL_BLACKOUT";
  // 5. Weak/dimming bulb or dirty lens cover (Warning)
  if (currentLux <= LUX_LOW_LIGHT_MAX) return "LOW_LIGHT";
  // 6. Healthy 150W-200W lamp reading (80.1 to 3000.0 Lux)
  return "NORMAL_LIT";
}

void onBeacon(const String &msg, int rssi, float snr) {
  unsigned long ep; int mode; long ss, se, wk; int autoFlag = 1;
  int got = sscanf(msg.c_str(), "SYNC,%lu,%d,%ld,%ld,%ld,%d", &ep, &mode, &ss, &se, &wk, &autoFlag);
  if (got < 5) return;   // 5 fields = old master (always AUTO), 6 = with the auto-sleep flag
  if (ep <= 1700000000UL) return; // Reject invalid epoch timestamps
  double delta = applyClock((time_t)ep);
  shiftStartSod = ss; shiftEndSod = se; wakeSod = wk;
  bool newAuto = (got >= 6) ? (autoFlag != 0) : true;
  if (newAuto != nodeAutoSleep) Serial.printf("** Sleep control is now %s **\n", newAuto ? "AUTO" : "MANUAL (node stays awake until told to sleep)");
  nodeAutoSleep = newAuto;
  lastBeaconMs_n = millis();
  setLink(true, rssi, snr);
  if (isnan(delta)) Serial.printf("<< SYNC mode=%d | clock set | RSSI %d dBm | SNR %.1f dB\n", mode, rssi, snr);
  else Serial.printf("<< SYNC mode=%d | clock error was %+.2f s | RSSI %d dBm | SNR %.1f dB\n", mode, delta, rssi, snr);
  if (mode == 2) { if (!MESH_ENABLED) goToSleep(nodeAutoSleep ? "master sleep command" : "MANUAL sleep command"); return; }
  NodeMode nm = (mode == 1) ? NM_FREE : NM_WAIT_POLL;
  if (nm != nodeMode) { nodeMode = nm; Serial.printf("Mode -> %s\n", NODE_MODE_NAME[nodeMode]); }
}

void replyToPoll() {
  seqNo++;
  bool validReading = (sensorOk && hasFreshSample && currentLux >= 0.0f);
  String statusToSend = validReading ? currentStatus : String("SENSOR_ERROR");
  float luxToSend = validReading ? currentLux : 0.0f;
  String p = "RPT," + String(NODE_ID) + "," + String(seqNo) + "," + String(luxToSend, 1) + "," + statusToSend;
  radioTx(p); LoRa.receive(); radioRxOn = true; triggerBlink();
  Serial.println("TX (poll reply) -> " + p);
}

void transmitReport() {
  bool validReading = sensorOk && hasFreshSample && currentLux >= 0.0f;
  String st = validReading ? currentStatus : String("SENSOR_ERROR");
  float lux = validReading ? currentLux : 0.0f;
  bool luxChanged = validReading && st != "DAYLIGHT_STANDBY" && lastSentLux >= 0.0f &&
                    fabs(lux - lastSentLux) >= LUX_CHANGE_THRESHOLD;
  bool statusChanged = st != String(lastSentStatus);
  const char *type = (luxChanged || statusChanged) ? "ALRT" : "BEAT";
  seqNo++;
  String packet = "LM1," + String(type) + "," + String(NODE_ID) + "," +
                  String((uint32_t)seqNo) + "," + String(lux, 1) + "," + st + "," + String(MESH_TTL_INITIAL);
  if (packet.length() > 180) return;
  radioTx(packet); LoRa.receive(); radioRxOn = true; triggerBlink();
  lastMeshLocalTx = millis();
  if (validReading) lastSentLux = lux;
  strlcpy(lastSentStatus, st.c_str(), sizeof(lastSentStatus));
#if ENABLE_WIFI_BRIDGE
  bridgeEnqueue(type, NODE_ID, (long)seqNo, lux, st.c_str(), everHeard ? lastRssi : 0);
#endif
  Serial.println("[MESH TX] " + packet);
}
void senderSetup() {
  Wire.begin(I2C_SDA, I2C_SCL);
  if (!initBH1750Sensor()) {
    Serial.println("BH1750 init FAILED -> sensor marked unavailable (SENSOR_ERROR)");
  } else {
    Serial.println("BH1750 sensor initialized OK.");
  }
  Serial.printf("\n=== LUMINARA NODE %d | SF%d BW%.0f kHz | MESH ===\n", NODE_ID, LORA_SF, LORA_BW / 1000.0);
#if ENABLE_WIFI_BRIDGE
  bridgeSetup(); // optional: this sensor/relay node also acts as an HTTP bridge
#endif
  if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER) {
    Serial.println("Woke from deep sleep.");
    if (expectedWakeEpoch > 0 && timeIsValid())
      Serial.printf("Wake time vs plan: %+ld s (deep-sleep RTC drift)\n", (long)(time(nullptr) - expectedWakeEpoch));
  }
  Serial.println(MESH_ENABLED ? "[MESH] Receiver ready; peer relay enabled" : "LoRa receiver ready. Listening for the master's SYNC beacon...");
  LoRa.receive(); radioRxOn = true;
}

void runSender() {
  unsigned long now = millis();
  processBlink();

  String msg; int rssi; float snr;
  if (radioRx(msg, rssi, snr)) {
    if (MESH_ENABLED && msg.startsWith("LM1,")) meshHandlePacket(msg, rssi, snr, false);
    else if (msg.startsWith("SYNC,")) onBeacon(msg, rssi, snr);
    else if (!MESH_ENABLED && msg.startsWith("POLL,") && msg.substring(5).toInt() == NODE_ID) { setLink(true, rssi, snr); replyToPoll(); }
  }
  if (MESH_ENABLED && MESH_ACTIVE_RELAY && MESH_RELAY_AWAKE) meshServiceRelay();

  if (now - lastSampleMs >= 150) {
    lastSampleMs = now;
    if (sensorOk) {
      float raw = lightMeter.readLightLevel();
      if (raw >= 0.0f && raw < 65535.0f) {
        bh1750ErrorCount = 0;
        float cal = raw * LUX_MULTIPLIER + LUX_OFFSET;
        if (cal < 0.0f) cal = 0.0f;
        sampleLux = cal;
        hasFreshSample = true;
        if (cal < minLuxWindow) minLuxWindow = cal;
        if (cal > maxLuxWindow) maxLuxWindow = cal;
      } else {
        if (++bh1750ErrorCount >= 3) {
          sensorOk = false;
          hasFreshSample = false;
          sampleLux = -1.0f;
          currentLux = -1.0f;
          currentStatus = "SENSOR_ERROR";
          minLuxWindow = 100000.0f;
          maxLuxWindow = 0.0f;
          lastSensorRetryMs = now;
          Serial.println("!! BH1750 read failed repeatedly -> status set to SENSOR_ERROR");
        }
      }
    } else if (now - lastSensorRetryMs >= 5000UL) {
      // Non-blocking periodic sensor recovery attempt every 5 seconds
      lastSensorRetryMs = now;
      Wire.end();
      delay(5);
      Wire.begin(I2C_SDA, I2C_SCL);
      if (initBH1750Sensor()) {
        Serial.println("** BH1750 sensor recovered and re-initialized! **");
      }
    }
  }

  if (now - lastEvalMs >= EVAL_INTERVAL_MS) {
    lastEvalMs = now;
    if (sensorOk && hasFreshSample) {
      currentLux = sampleLux;
    } else {
      currentLux = -1.0f;
    }
    currentStatus = computeStatus();
    minLuxWindow = 100000.0f;
    maxLuxWindow = 0.0f;
  }

  if (MESH_ENABLED) {
    bool changed = currentStatus != String(lastSentStatus) ||
      (sensorOk && hasFreshSample && lastSentLux >= 0.0f && fabs(currentLux-lastSentLux) >= LUX_CHANGE_THRESHOLD);
    if ((lastMeshLocalTx == 0 && now > 5000UL) ||
        (changed && now-lastMeshLocalTx >= 5000UL) ||
        now-lastMeshLocalTx >= MESH_LOCAL_REPORT_INTERVAL_MS) {
      delay((uint32_t)random(40, 450));
      transmitReport();
    }
  } else if (nodeMode == NM_FREE && timeSynced) {
    uint32_t period = FREE_PERIOD_S * 1000UL;
    uint64_t ms = epochMs(); uint64_t cycle = ms / period; uint32_t ph = ms % period;
    uint32_t slotStart = (NODE_ID - 1) * SLOT_MS;
    if (cycle != lastTxCycle && ph >= slotStart && ph < slotStart + SLOT_JITTER_MS) { lastTxCycle = cycle; transmitReport(); }
  }

  // radio on only when needed (listening / poll wait / master window / ACK wait)
  bool want = MESH_ENABLED ? (MESH_ACTIVE_RELAY && MESH_RELAY_AWAKE) : true;
  if (!MESH_ENABLED && nodeMode == NM_FREE && timeSynced) { uint32_t ph = epochMs() % (FREE_PERIOD_S * 1000UL); want = (ph >= NODE_WIN_OPEN_MS && ph < NODE_WIN_CLOSE_MS); }
  
  // Using LoRa.idle() instead of LoRa.sleep() during FREE shifts to keep the oscillator running
  if (want && !radioRxOn) { LoRa.receive(); radioRxOn = true; }
  else if (!want && radioRxOn) { LoRa.idle(); radioRxOn = false; } 

  now = millis(); //latest addition to fix FREE MODE Disconnection Bug
  // link monitor
  if (linkConnected && now - lastHeardMs > LINK_TIMEOUT_MS) { linkConnected = false; Serial.println("*** LINK DISCONNECTED (no master packets) ***"); }
  if (!MESH_ENABLED && nodeMode == NM_FREE && now - lastBeaconMs_n > 90000UL) { nodeMode = NM_LISTEN; Serial.println("!! Lost beacons -> back to LISTENING"); }

  // failsafe: master never told us to sleep (only runs when clock is valid/synced, and only in AUTO sleep control)
  if (!MESH_ENABLED && nodeAutoSleep && timeSynced && nodeMode == NM_FREE) {
    long since = (sodOf(time(nullptr)) - shiftEndSod + 86400L) % 86400L;
    if (since >= FAILSAFE_S && since < FAILSAFE_S + 7200L) goToSleep("failsafe, no sleep command heard");
  }

  if (now - lastPrintMs >= SERIAL_STATUS_MS) {
    lastPrintMs = now;
    char luxs[12];
    if (sensorOk && hasFreshSample && currentLux >= 0.0f) snprintf(luxs, sizeof luxs, "%.1f", currentLux);
    else strcpy(luxs, "ERR");
    Serial.printf("[%s] Lux: %s | Lamp: %s (%s) | Link: %s", clockStr(), luxs, lampText(currentStatus.c_str()), currentStatus.c_str(),
                  linkConnected ? "CONNECTED" : "DISCONNECTED");
    if (everHeard) Serial.printf(" | RSSI: %d dBm SNR: %.1f dB", lastRssi, lastSnr);
    Serial.printf(" | Mode: %s | Sleep: %s", NODE_MODE_NAME[nodeMode], nodeAutoSleep ? "AUTO" : "MANUAL");
    if (nodeMode == NM_FREE && timeSynced) {
      uint32_t period = FREE_PERIOD_S * 1000UL, ph = epochMs() % period, slotStart = (NODE_ID - 1) * SLOT_MS;
      Serial.printf(" | next TX in %lu s", (unsigned long)(((slotStart + period - ph) % period) / 1000));
    }
    Serial.println();
  }
}

// ================= MASTER =================
struct NodeRecord {
  bool isActive, isConnected;
  unsigned long lastReceiveTime, offlineStartMs, lastSnapshotMs;
  long lastSeqSeen;
  unsigned long rxCount, missedCount;
  int lastRssi; float lastSnr, lastLux; char lastStatus[24];
  // per-shift stats
  unsigned long sPackets, sOfflineMs; long sRssiSum;
  float sMinLux, sMaxLux;
  unsigned sOfflineEvents, sFaultEvents;
  time_t firstFault, lastFault; char lastFaultStatus[24];
};
NodeRecord nodes[MAX_NODES];

const char *PHASE_NAME[] = {"IDLE", "SYNC", "POLL", "FREE", "SLEEP-CMD"};
MPhase phase = MP_IDLE;
struct Sched { long syncStart, pollStart, shiftStart, shiftEnd, sleepCmd, nextWake, cycleLen; } S;
time_t cycleBase = 0, demoOrigin = 0;
long rel = 0;
uint8_t wavesRun = 0, waveNode = 0, pollTry = 0;
bool waveActive = false, pollWaiting = false, pollGot = false, waveReplied[MAX_NODES];
unsigned long pollDeadline = 0, lastBeaconMs = 0, freeStartMs = 0, lastStatusTable = 0, lastLcd = 0, lastHealth = 0, lastTimeMsg = 0;
uint64_t lastBeaconCycle = 0;
uint8_t sleepBeacons = 0;
// Node sleep control. autoSleep: true = nodes sleep after every shift; false = they stay awake until "sleep now".
// pendingAuto / pendingSleepNow are set by the Wi-Fi task and applied by the main loop (applySleepCommands).
bool autoSleep = true;
volatile bool autoSleepPub = true;       // copy the Wi-Fi task may read
volatile int8_t pendingAuto = -1;        // -1 = nothing, 0 = switch to MANUAL, 1 = switch to AUTO
volatile bool pendingSleepNow = false;
uint8_t sleepNowLeft = 0;                // sleep beacons still to send for a "sleep now"
Preferences prefs;
bool clockWasSynchronized = false;
unsigned long malformedPacketCount = 0;
unsigned long bridgeDroppedCount = 0;
char logPath[40] = "/log_boot.csv", reportPath[40] = "/report_boot.txt";

void buildSchedule() {
#if DEMO_MODE
  // seconds after the cycle start: sync, polls, lamps-on, lamps-off, sleep command, node wake, cycle length
  S = {0, 45, 120, 600, 630, 1180, 1200};
#else
  // seconds after local midnight of the shift's start day
  S = {15 * 3600L + 30 * 60L,        // 15:30 master starts beaconing (nodes wake ~16:00 +/- drift)
       17 * 3600L,                   // 17:00 first poll wave
       18 * 3600L,                   // 18:00 lamps should be ON
       86400L + 5 * 3600L + 30 * 60L,// 05:30 lamps should be OFF
       86400L + 6 * 3600L,           // 06:00 sleep command
       86400L + 16 * 3600L,          // next day 16:00 nodes wake
       86400L};
#endif
}

// ---------- storage ----------
static String fullName(const char *n) { String s(n); if (!s.startsWith("/")) s = "/" + s; return s; }
int listLogFiles(String *out, int maxN) {
  int n = 0;
  File root = LittleFS.open("/");
  if (!root) return 0;
  File f = root.openNextFile();
  while (f && n < maxN) {
    String nm = fullName(f.name());
    if (nm.startsWith("/log_") || nm.startsWith("/report_")) out[n++] = nm;
    f = root.openNextFile();
  }
  return n;
}
void pruneStorage() {
  for (int guard = 0; guard < 30; guard++) {
    if (LittleFS.totalBytes() == 0 || LittleFS.usedBytes() * 100 < LittleFS.totalBytes() * 70) return;
    String names[40]; int n = listLogFiles(names, 40);
    int oldest = -1;
    for (int i = 0; i < n; i++) { if (names[i] == String(logPath)) continue; if (oldest < 0 || names[i] < names[oldest]) oldest = i; }
    if (oldest < 0) return;
    Serial.println("Storage >70% full, deleting " + names[oldest]);
    LittleFS.remove(names[oldest]);
  }
}
String latestFile(const char *prefix) {
  String names[40]; int n = listLogFiles(names, 40); String best = "";
  for (int i = 0; i < n; i++) if (names[i].startsWith(prefix) && names[i] > best) best = names[i];
  return best;
}
void logEvent(int node, const char *ev, float lux, const char *status, int rssi, const char *detail) {
  File f = LittleFS.open(logPath, FILE_APPEND);
  if (!f) return;
  if (f.size() == 0) f.println("time,node,event,lux,status,rssi,detail");
  char ts[24]; if (timeIsValid()) stampTo(time(nullptr), ts, sizeof ts); else strcpy(ts, "NOTIME");
  f.printf("%s,%d,%s,%.1f,%s,%d,%s\n", ts, node, ev, lux, status, rssi, detail);
  f.close();
}
void dumpFile(const String &path) {
  File f = LittleFS.open(path, FILE_READ);
  if (!f) { Serial.println("No such file: " + path); return; }
  Serial.println("----- " + path + " -----");
  while (f.available()) Serial.write(f.read());
  Serial.println("----- end -----");
  f.close();
}

// ---------- node bookkeeping ----------
void resetShiftStats() {
  for (int i = 0; i < MAX_NODES; i++) {
    // Preserve active connectivity state across cycle boundaries if already heard
    bool wasActive = nodes[i].isActive;
    bool wasConn = nodes[i].isConnected;
    unsigned long lastRx = nodes[i].lastReceiveTime;
    long lastSeq = nodes[i].lastSeqSeen;
    int lastRssiVal = nodes[i].lastRssi;
    float lastSnrVal = nodes[i].lastSnr;
    float lastLuxVal = nodes[i].lastLux;
    char prevSt[24];
    strlcpy(prevSt, nodes[i].lastStatus, sizeof(prevSt));

    memset(&nodes[i], 0, sizeof(NodeRecord));
    nodes[i].isActive = wasActive;
    nodes[i].isConnected = wasConn;
    nodes[i].lastReceiveTime = lastRx;
    nodes[i].lastSeqSeen = wasActive ? lastSeq : -1;
    nodes[i].lastRssi = lastRssiVal;
    nodes[i].lastSnr = lastSnrVal;
    nodes[i].lastLux = lastLuxVal;
    strlcpy(nodes[i].lastStatus, prevSt, sizeof(nodes[i].lastStatus));
    nodes[i].sMinLux = 1e9f;
    nodes[i].sMaxLux = -1.0f;
  }
}
void initNodesFirstBoot() {
  for (int i = 0; i < MAX_NODES; i++) {
    memset(&nodes[i], 0, sizeof(NodeRecord));
    nodes[i].lastSeqSeen = -1;
    nodes[i].sMinLux = 1e9f;
    nodes[i].sMaxLux = -1.0f;
  }
}
void markOnline(int n, int rssi) {
  NodeRecord &r = nodes[n];
  if (r.isActive && !r.isConnected && r.offlineStartMs) { r.sOfflineMs += millis() - r.offlineStartMs; r.offlineStartMs = 0; }
  bool was = r.isConnected;
  r.isActive = true; r.isConnected = true;
  if (!was) {
    Serial.printf("*** NODE %d CONNECTED (RSSI %d dBm) ***\n", n, rssi);
    logEvent(n, "ONLINE", r.lastLux, r.lastStatus, rssi, "");
  }
}
void markOffline(int n, const char *why) {
  NodeRecord &r = nodes[n];
  if (r.isActive && !r.isConnected) return;
  r.isActive = true; r.isConnected = false; r.offlineStartMs = millis(); r.sOfflineEvents++;
  Serial.printf("\n*** ALERT: NODE %d OFFLINE (%s) ***\n\n", n, why);
  logEvent(n, "OFFLINE", r.lastLux, r.lastStatus, r.lastRssi, why);
}

// ---------- report ----------
void writeReport(Print &out, bool live) {
  char a[24], b[24], c[24];
  if (cycleBase > 0) {
    stampTo(cycleBase + S.shiftStart, a, sizeof a);
    stampTo(cycleBase + S.shiftEnd, b, sizeof b);
  } else {
    strcpy(a, "NOTIME");
    strcpy(b, "NOTIME");
  }
  stampTo(time(nullptr), c, sizeof c);
  out.println("========== LUMINARA SHIFT REPORT ==========");
  out.printf("Shift (lamps ON -> OFF): %s  ->  %s\n", a, b);
  out.printf("Generated: %s%s\n", c, live ? "  (LIVE, shift not finished)" : "");
  int problems = 0;
  for (int n = 1; n <= EXPECTED_NODES; n++) {
    NodeRecord &r = nodes[n];
    unsigned long off = r.sOfflineMs + ((r.isActive && !r.isConnected && r.offlineStartMs) ? millis() - r.offlineStartMs : 0);
    out.printf("\nLamp node %d: now %s, last status %s (%s)\n", n,
               !r.isActive ? "NEVER SEEN" : (r.isConnected ? "CONNECTED" : "OFFLINE"), r.lastStatus[0] ? r.lastStatus : "-", lampText(r.lastStatus));
    out.printf("  packets: %lu rx, %lu missed | avg RSSI: %d dBm | lux min/max: %.1f / %.1f\n", r.sPackets, r.missedCount,
               r.sPackets ? (int)(r.sRssiSum / (long)r.sPackets) : 0, r.sMinLux > 1e8f ? 0.0f : r.sMinLux, r.sMaxLux < 0 ? 0.0f : r.sMaxLux);
    out.printf("  offline events: %u (total %lu s) | lamp fault events: %u\n", r.sOfflineEvents, off / 1000, r.sFaultEvents);
    if (r.sFaultEvents) {
      stampTo(r.firstFault, a, sizeof a); stampTo(r.lastFault, b, sizeof b);
      out.printf("  first fault %s | last fault %s (%s)\n", a, b, r.lastFaultStatus);
    }
    if (r.sFaultEvents || r.sOfflineEvents || !r.isActive) problems++;
  }
  out.println(problems ? "\n>>> ATTENTION: check the lamps/nodes flagged above." : "\n>>> All lamps and nodes ran without a recorded problem.");
  out.println("\n-- Event timeline (state changes, online/offline, polls) --");
  File lf = LittleFS.open(logPath, FILE_READ);
  if (lf) {
    while (lf.available()) {
      String line = lf.readStringUntil('\n');
      if (line.indexOf(",STATE,") > 0 || line.indexOf(",ONLINE,") > 0 || line.indexOf(",OFFLINE,") > 0 || line.indexOf(",POLL_MISS,") > 0 || line.indexOf(",WAVE,") > 0) out.println(line);
    }
    lf.close();
  }
  out.println("========== END OF REPORT ==========");
}
void finishShift() {
  writeReport(Serial, false);
  String rp = String(logPath); rp.replace("/log_", "/report_"); rp.replace(".csv", ".txt");
  File f = LittleFS.open(rp, FILE_WRITE);
  if (f) { writeReport(f, false); f.close(); Serial.println("Report saved: " + rp); }
  logEvent(0, "REPORT", 0, "", 0, rp.c_str());
}

void printStatusTable() {
  Serial.printf("---- STATUS %s | phase %s | clock %s ----\n", clockStr(), PHASE_NAME[phase], timeIsValid() ? "SYNCHRONIZED" : "UNAVAILABLE");
  for (int n = 1; n <= EXPECTED_NODES; n++) {
    NodeRecord &r = nodes[n];
    if (!r.isActive) { Serial.printf("Node %d: no data yet\n", n); continue; }
    Serial.printf("Node %d: %-12s | lamp %-10s (%s) | lux %7.1f | RSSI %4d dBm | SNR %5.1f dB | heard %lus ago | rx %lu, missed %lu\n", n,
                  r.isConnected ? "CONNECTED" : "DISCONNECTED", lampText(r.lastStatus), r.lastStatus, r.lastLux, r.lastRssi, r.lastSnr,
                  (millis() - r.lastReceiveTime) / 1000, r.rxCount, r.missedCount);
  }
  Serial.printf("Node sleep control: %s%s\n", autoSleep ? "AUTO (nodes sleep after every shift)" : "MANUAL (nodes stay awake until SLEEP NOW)", sleepNowLeft ? " | sleep command being sent" : "");
  Serial.printf("Diagnostics: malformed_rx=%lu | bridge_dropped=%lu\n", malformedPacketCount, bridgeDroppedCount);
}

// ---------- dashboard bridge (runs in its own task so HTTP never blocks LoRa) ----------
#if ENABLE_WIFI_BRIDGE
struct BridgeItem { char type[6]; int nodeId; long seq; float lux; char status[24]; int rssi; };
QueueHandle_t bridgeQ = NULL;

// Asks the server what the dashboard wants for node sleep. GET <server>/api/sleep/poll?applied=auto|manual
// Reply: {"autoSleep":true|false|null,"sleepNowSeq":<n>}   (null = the dashboard has not chosen yet -> keep our own setting)
// The setting is applied when it CHANGES (so a Serial SLEEP command is not undone 5 s later); the first value seen
// after boot is adopted. "sleep now" fires only when sleepNowSeq goes UP; the first poll after boot just takes the baseline.
void pollSleepControl() {
  static int8_t lastSrvAuto = -1;
  static long lastSrvSeq = -1;
  String u = SERVER_URL;
  int i = u.lastIndexOf("/api/");
  u = (i >= 0 ? u.substring(0, i) : u) + "/api/sleep/poll?applied=" + (autoSleepPub ? "auto" : "manual");
  HTTPClient http;
  http.setConnectTimeout(800);
  http.setTimeout(BRIDGE_HTTP_TIMEOUT_MS);
  if (!http.begin(u)) return;
  http.addHeader("X-Api-Key", DEVICE_KEY);
  int code = http.GET();
  if (code != 200) { http.end(); return; }
  String body = http.getString();
  http.end();
  int8_t a = -1;
  int p = body.indexOf("\"autoSleep\":");
  if (p >= 0) { String v = body.substring(p + 12); v.trim(); if (v.startsWith("true")) a = 1; else if (v.startsWith("false")) a = 0; }
  long seq = -1;
  p = body.indexOf("\"sleepNowSeq\":");
  if (p >= 0) seq = body.substring(p + 14).toInt();
  if (a >= 0 && a != lastSrvAuto) { lastSrvAuto = a; if ((a == 1) != autoSleepPub) pendingAuto = a; }
  if (seq >= 0) {
    if (lastSrvSeq >= 0 && seq > lastSrvSeq) pendingSleepNow = true;
    lastSrvSeq = seq;
  }
}

void bridgeTask(void *arg) {
  unsigned long lastWifiAttempt = millis();
  unsigned long lastSleepPoll = 0;
  bool wifiWasConnected = false;
  for (;;) {
    bool connectedNow = (WiFi.status() == WL_CONNECTED);
    if (!connectedNow) {
      if (wifiWasConnected) {
        wifiWasConnected = false;
        Serial.println("[Wi-Fi] Disconnected from network. Telemetry queued locally.");
      }
      if (millis() - lastWifiAttempt >= 10000UL) {
        lastWifiAttempt = millis();
        Serial.println("[Wi-Fi] Attempting reconnection...");
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASS);
      }
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    if (!wifiWasConnected) {
      wifiWasConnected = true;
      Serial.printf("[Wi-Fi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
      if (!timeIsValid()) {
        Serial.println("[NTP] Wi-Fi online; requesting NTP synchronization...");
        configTzTime(TZ_STRING, "pool.ntp.org", "time.google.com");
      }
    }

    if (!IS_SENDER && millis() - lastSleepPoll >= SLEEP_POLL_MS) { lastSleepPoll = millis(); pollSleepControl(); }

    BridgeItem it;
    if (xQueuePeek(bridgeQ, &it, pdMS_TO_TICKS(500)) != pdTRUE) continue;
    char body[180];
    snprintf(body, sizeof(body), "{\"type\":\"%s\",\"nodeId\":%d,\"seq\":%ld,\"lux\":%.1f,\"status\":\"%s\",\"rssi\":%d}",
             it.type, it.nodeId, it.seq, it.lux, it.status, it.rssi);
    HTTPClient http;
    http.setConnectTimeout(800);
    http.setTimeout(BRIDGE_HTTP_TIMEOUT_MS);
    if (!http.begin(SERVER_URL)) {
      Serial.println("[Bridge] Invalid SERVER_URL configuration; retrying in 5 s");
      vTaskDelay(pdMS_TO_TICKS(5000));
      continue;
    }
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Api-Key", DEVICE_KEY);
    int code = http.POST((uint8_t *)body, strlen(body));
    http.end();
    if (code >= 200 && code < 300) {
      BridgeItem gone; xQueueReceive(bridgeQ, &gone, 0);
      Serial.printf("[Bridge] Telemetry forwarded: node %d seq %ld (HTTP %d)\n", it.nodeId, it.seq, code);
    } else if (code >= 400 && code < 500) {
      BridgeItem gone; xQueueReceive(bridgeQ, &gone, 0);
      Serial.printf("[Bridge] Telemetry rejected by backend (HTTP %d), dropped node %d seq %ld\n", code, it.nodeId, it.seq);
    } else {
      Serial.printf("[Bridge] Telemetry forwarding failed (HTTP %d), retrying in 5 s (queued=%u)\n",
                    code, (unsigned)uxQueueMessagesWaiting(bridgeQ));
      vTaskDelay(pdMS_TO_TICKS(5000));
    }
  }
}
void bridgeSetup() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  configTzTime(TZ_STRING, "pool.ntp.org", "time.google.com");
  bridgeQ = xQueueCreate(BRIDGE_QUEUE_SIZE, sizeof(BridgeItem));
  xTaskCreatePinnedToCore(bridgeTask, "bridge", 8192, NULL, 1, NULL, 0);
  Serial.println("[Wi-Fi] Connecting to Wi-Fi and starting NTP synchronization...");
}
void bridgeEnqueue(const char *type, int nodeId, long seq, float lux, const char *status, int rssi) {
  if (!bridgeQ) return;
  BridgeItem it;
  strlcpy(it.type, type, sizeof it.type); strlcpy(it.status, status, sizeof it.status);
  it.nodeId = nodeId; it.seq = seq; it.lux = lux; it.rssi = rssi;
  if (xQueueSend(bridgeQ, &it, 0) != pdTRUE) {
    BridgeItem drop;
    xQueueReceive(bridgeQ, &drop, 0);
    xQueueSend(bridgeQ, &it, 0);
    bridgeDroppedCount++;
    Serial.printf("[Bridge] Queue full (%d items)! Dropped oldest packet (node %d seq %ld) to enqueue node %d seq %ld (total drops=%lu)\n",
                  BRIDGE_QUEUE_SIZE, drop.nodeId, drop.seq, nodeId, seq, bridgeDroppedCount);
  }
}
// Mesh wire format: LM1,type,origin,seq,lux,status,ttl
bool meshRemember(uint16_t origin, uint32_t seq) {
  uint32_t now = millis();
  for (uint8_t i=0; i<MESH_CACHE_SIZE; ++i)
    if (meshSeen[i].origin==origin && meshSeen[i].seq==seq &&
        (uint32_t)(now-meshSeen[i].seenAt)<MESH_QUEUE_EXPIRY_MS) return false;
  meshSeen[meshSeenCursor] = {origin,seq,now};
  meshSeenCursor = (meshSeenCursor+1)%MESH_CACHE_SIZE;
  return true;
}
bool meshQueueRelay(const String &packet) {
  for (uint8_t i=0;i<MESH_RELAY_QUEUE_SIZE;++i) if (!meshRelayQueue[i].used) {
    strlcpy(meshRelayQueue[i].packet,packet.c_str(),sizeof(meshRelayQueue[i].packet));
    meshRelayQueue[i].queuedAt=millis();
    meshRelayQueue[i].dueAt=millis()+random(MESH_RELAY_JITTER_MIN_MS,MESH_RELAY_JITTER_MAX_MS+1);
    meshRelayQueue[i].used=true; return true;
  }
  Serial.println("[MESH] Relay queue full; dropping packet"); return false;
}
void meshHandlePacket(const String &msg,int rssi,float snr,bool fromGateway) {
  (void)fromGateway;
  String f[7]; int pos=0;
  for(int i=0;i<6;i++){int c=msg.indexOf(',',pos);if(c<0){meshMalformed++;return;}f[i]=msg.substring(pos,c);pos=c+1;}
  if(msg.indexOf(',',pos)>=0){meshMalformed++;return;} f[6]=msg.substring(pos);
  if(f[0]!="LM1" || !(f[1]=="ALRT"||f[1]=="BEAT"||f[1]=="RPT") ||
     !isStrictInt(f[2])||!isStrictInt(f[3])||!isStrictFloat(f[4])||
     !isValidStatusString(f[5])||!isStrictInt(f[6])){meshMalformed++;return;}
  long originL=f[2].toInt(),seqL=f[3].toInt(); float lux=f[4].toFloat(); int ttl=f[6].toInt();
  if(originL<1||originL>=MAX_NODES||seqL<0||lux<0||lux>100000||ttl<0||ttl>MESH_TTL_INITIAL){meshMalformed++;return;}
  uint16_t origin=(uint16_t)originL; uint32_t seq=(uint32_t)seqL;
  if(IS_SENDER && origin==NODE_ID)return;
  if(!meshRemember(origin,seq)){meshDuplicates++;Serial.printf("[MESH] duplicate suppressed origin=%u seq=%lu (total=%lu)\n",origin,(unsigned long)seq,(unsigned long)meshDuplicates);return;}
  setLink(true,rssi,snr);
  Serial.printf("[MESH RX] origin=%u seq=%lu type=%s ttl=%d RSSI=%d SNR=%.1f\n",origin,(unsigned long)seq,f[1].c_str(),ttl,rssi,snr);
#if ENABLE_WIFI_BRIDGE
  bridgeEnqueue(f[1].c_str(),origin,(long)seq,lux,f[5].c_str(),rssi);
#endif
  if(ttl==0){meshTtlDrops++;Serial.printf("[MESH] TTL expired origin=%u seq=%lu (total=%lu)\n",origin,(unsigned long)seq,(unsigned long)meshTtlDrops);return;}
  f[6]=String(ttl-1);
  String forwarded=f[0]+","+f[1]+","+f[2]+","+f[3]+","+f[4]+","+f[5]+","+f[6];
  if(MESH_ACTIVE_RELAY&&MESH_RELAY_AWAKE)meshQueueRelay(forwarded);
}
void meshServiceRelay() {
  uint32_t now=millis();
  for(uint8_t i=0;i<MESH_RELAY_QUEUE_SIZE;++i)if(meshRelayQueue[i].used){
    if((uint32_t)(now-meshRelayQueue[i].queuedAt)>MESH_QUEUE_EXPIRY_MS){meshRelayQueue[i].used=false;continue;}
    if((int32_t)(now-meshRelayQueue[i].dueAt)<0)continue;
    String p(meshRelayQueue[i].packet);meshRelayQueue[i].used=false;
    radioTx(p);LoRa.receive();radioRxOn=true;meshForwarded++;Serial.println("[MESH FWD] "+p);break;
  }
}

#endif

// ---------- schedule / phases ----------
time_t computeBase(time_t now) {
#if DEMO_MODE
  if (demoOrigin == 0) demoOrigin = now;
  return demoOrigin + ((now - demoOrigin) / S.cycleLen) * S.cycleLen;
#else
  long sod = sodOf(now);
  time_t mid = now - sod;
  return (sod < (S.sleepCmd - 86400L) + 600) ? mid - 86400L : mid;   // before 06:10 we are still in last night's cycle
#endif
}

void onNewCycle(time_t base) {
  cycleBase = base;
  wavesRun = 0; waveActive = false; pollWaiting = false; lastBeaconCycle = 0; sleepBeacons = 0;
  long r = (long)(time(nullptr) - base);
  for (int w = 0; w < POLL_WAVES; w++) if (r > S.pollStart + (long)w * WAVE_GAP_S + 60) wavesRun = w + 1;   // master restarted mid-night: skip missed waves
  resetShiftStats();
  struct tm tm; localtime_r(&base, &tm); char d[24];
#if DEMO_MODE
  strftime(d, sizeof d, "%m%d_%H%M", &tm);
#else
  strftime(d, sizeof d, "%Y%m%d", &tm);
#endif
  snprintf(logPath, sizeof logPath, "/log_%s.csv", d);
  snprintf(reportPath, sizeof reportPath, "/report_%s.txt", d);
  pruneStorage();
  Serial.printf("\n===== NEW CYCLE (log: %s) =====\n", logPath);
  logEvent(0, "CYCLE", 0, "", 0, "new cycle");
}

void onPhaseChange(MPhase from, MPhase to) {
  Serial.printf("\n>>> PHASE %s -> %s at %s\n", PHASE_NAME[from], PHASE_NAME[to], clockStr());
  logEvent(0, "PHASE", 0, "", 0, PHASE_NAME[to]);
  if (to == MP_FREE) {
    freeStartMs = millis();
    for (int n = 1; n <= EXPECTED_NODES; n++) {
      // Only mark offline after poll waves if the node actually failed to connect during polls/sync
      if (!nodes[n].isConnected) markOffline(n, "no reply to poll waves");
    }
  }
  if (to == MP_SLEEPCMD) finishShift();
}

void updatePhase() {
  if (!timeIsValid()) return; // Do not evaluate scheduled phases or sleep commands with an invalid clock
  static unsigned long last = 0;
  if (millis() - last < 250) return;
  last = millis();
  time_t now = time(nullptr);
  time_t base = computeBase(now);
  if (base != cycleBase) onNewCycle(base);
  rel = (long)(now - cycleBase);
  MPhase np;
  if (rel < S.syncStart) np = MP_IDLE;
  else if (rel < S.pollStart) np = MP_SYNC;
  else if (!(wavesRun >= POLL_WAVES && !waveActive)) np = MP_POLL;
  else if (rel < S.sleepCmd) np = MP_FREE;
  else if (rel < S.sleepCmd + 3L * FREE_PERIOD_S) np = MP_SLEEPCMD;
  else np = MP_IDLE;
  if (np != phase) { MPhase old = phase; phase = np; onPhaseChange(old, np); }
}

void sendBeacon(uint8_t mode) {
  if (!timeIsValid()) return; // Never broadcast false timestamps or sleep commands without a valid clock
  struct timeval tv; gettimeofday(&tv, NULL);
  time_t ep = tv.tv_sec + 1; // the packet starts on the next whole second
  unsigned long waitMs = (1000000UL - tv.tv_usec) / 1000UL;
  unsigned long t0 = millis();
  // Non-blocking wait: keep receiving LoRa packets while aligning to the next whole second
  while (millis() - t0 < waitMs) {
    masterHandleRx();
    processBlink();
    delay(1);
  }
  String p = "SYNC," + String((unsigned long)ep) + "," + String(mode) + "," + String(sodOf(cycleBase + S.shiftStart)) + "," +
             String(sodOf(cycleBase + S.shiftEnd)) + "," + String(sodOf(cycleBase + S.nextWake)) + "," + String(autoSleep ? 1 : 0);
  radioTx(p); LoRa.receive(); triggerBlink();
  Serial.printf("TX SYNC mode=%d (%s, sleep control %s)\n", mode, PHASE_NAME[phase], autoSleep ? "AUTO" : "MANUAL");
}

void beaconEvery() {
  if (millis() - lastBeaconMs >= BEACON_INTERVAL_MS) { lastBeaconMs = millis(); sendBeacon(0); }
}
void cycleBeacon(uint8_t mode) {
  if (!timeIsValid()) return;
  uint64_t ms = epochMs();
  uint32_t period = FREE_PERIOD_S * 1000UL, ph = ms % period;
  uint64_t cycle = ms / period;
  if (ph >= MASTER_WIN_START_MS && ph < MASTER_WIN_START_MS + 1500 && cycle != lastBeaconCycle) {
    lastBeaconCycle = cycle; sendBeacon(mode);
    if (mode == 2) { sleepBeacons++; if (sleepNowLeft > 0) { sleepNowLeft--; if (sleepNowLeft == 0) Serial.println("[Sleep] Sleep command sent to the nodes."); } }
  }
}

void endWave() {
  int ok = 0; String missing = "";
  for (int n = 1; n <= EXPECTED_NODES; n++) { if (waveReplied[n]) ok++; else missing += String(n) + " "; }
  Serial.printf("--- WAVE %d/%d done: %d/%d replied%s%s ---\n", wavesRun + 1, POLL_WAVES, ok, EXPECTED_NODES, missing.length() ? ", no reply from: " : "", missing.c_str());
  logEvent(0, "WAVE", ok, "", 0, missing.length() ? ("missing " + missing).c_str() : "all replied");
  wavesRun++; waveActive = false; pollWaiting = false;
}

void runWaves() {
  unsigned long now = millis();
  if (!waveActive) {
    if (wavesRun < POLL_WAVES && rel >= S.pollStart + (long)wavesRun * WAVE_GAP_S) {
      waveActive = true; waveNode = 1; pollTry = 0; pollWaiting = false;
      memset(waveReplied, 0, sizeof waveReplied);
      Serial.printf("--- POLL WAVE %d/%d ---\n", wavesRun + 1, POLL_WAVES);
    }
    return;
  }
  if (!pollWaiting) {
    if (waveNode > EXPECTED_NODES) { endWave(); return; }
    radioTx("POLL," + String(waveNode)); LoRa.receive(); triggerBlink();
    pollWaiting = true; pollGot = false; pollDeadline = now + POLL_REPLY_MS;
    return;
  }
  if (pollGot) { waveReplied[waveNode] = true; pollWaiting = false; waveNode++; pollTry = 0; return; }
  if ((long)(now - pollDeadline) >= 0) {
    pollWaiting = false;
    if (++pollTry >= 2) {
      Serial.printf("POLL node %d: no reply\n", waveNode);
      logEvent(waveNode, "POLL_MISS", 0, "", 0, "no reply");
      waveNode++; pollTry = 0;
    }
  }
}

void masterHandleRx() {
  String msg; int rssi; float snr;
  if (!radioRx(msg, rssi, snr)) return;
  if (msg.startsWith("ACK,") || msg.startsWith("POLL,") || msg.startsWith("SYNC,")) return;
  if (MESH_ENABLED && msg.startsWith("LM1,")) { meshHandlePacket(msg,rssi,snr,true); return; }

  // Validate exact 5-field CSV structure: TYPE,NODE_ID,SEQ,LUX,STATUS
  int c1 = msg.indexOf(',');
  int c2 = (c1 >= 0) ? msg.indexOf(',', c1 + 1) : -1;
  int c3 = (c2 >= 0) ? msg.indexOf(',', c2 + 1) : -1;
  int c4 = (c3 >= 0) ? msg.indexOf(',', c3 + 1) : -1;
  int c5 = (c4 >= 0) ? msg.indexOf(',', c4 + 1) : -1; // Ensure no extra commas
  if (c1 <= 0 || c2 <= c1 + 1 || c3 <= c2 + 1 || c4 <= c3 + 1 || c5 >= 0) {
    malformedPacketCount++;
    Serial.printf("!! Rejected malformed LoRa packet (bad CSV structure): \"%s\"\n", msg.c_str());
    return;
  }

  String type = msg.substring(0, c1);
  String sNode = msg.substring(c1 + 1, c2);
  String sSeq  = msg.substring(c2 + 1, c3);
  String sLux  = msg.substring(c3 + 1, c4);
  String st    = msg.substring(c4 + 1);

  bool validType = (type == "RPT" || type == "ALRT" || type == "BEAT" || type == "JOIN");
  if (!validType || !isStrictInt(sNode) || !isStrictInt(sSeq) || !isStrictFloat(sLux) || !isValidStatusString(st)) {
    malformedPacketCount++;
    Serial.printf("!! Rejected invalid LoRa packet fields: \"%s\"\n", msg.c_str());
    return;
  }

  int nId = sNode.toInt();
  long seq = sSeq.toInt();
  float lux = sLux.toFloat();
  if (nId < 1 || nId >= MAX_NODES || seq < 0 || lux < 0.0f || lux > 100000.0f) {
    malformedPacketCount++;
    Serial.printf("!! Rejected out-of-range LoRa packet (node=%d seq=%ld lux=%.1f)\n", nId, seq, lux);
    return;
  }

  bool isRpt = (type == "RPT");
  if (!isRpt) { radioTx("ACK," + String(nId) + "," + String(seq)); LoRa.receive(); }   // ACK first, bookkeeping after
  triggerBlink();

  unsigned long now = millis();
  NodeRecord &r = nodes[nId];

  // Handle node reboot / sequence number reset vs duplicate retry
  if (r.lastSeqSeen >= 0) {
    if (seq == r.lastSeqSeen) {
      // If seq == 1 and it has been > 15s since we heard this node, it rebooted from seq 1 -> seq 1
      if (seq == 1 && (now - r.lastReceiveTime > 15000UL)) {
        Serial.printf("** Node %d sequence reset detected (seq=1 after reboot) **\n", nId);
        logEvent(nId, "SEQ_RESET", lux, st.c_str(), rssi, "reboot seq=1");
      } else {
        // Genuine retry of the packet we just ACKed: do not double-count or overwrite
        return;
      }
    } else if (seq < r.lastSeqSeen) {
      Serial.printf("** Node %d sequence reset detected (prev=%ld, new=%ld) **\n", nId, r.lastSeqSeen, seq);
      logEvent(nId, "SEQ_RESET", lux, st.c_str(), rssi, "seq reset");
    } else if (seq > r.lastSeqSeen + 1) {
      r.missedCount += (unsigned long)(seq - r.lastSeqSeen - 1);
    }
  }

  r.lastSeqSeen = seq;
  r.rxCount++;
  r.sPackets++;
  r.lastReceiveTime = now;
  r.lastRssi = rssi;
  r.lastSnr = snr;
  if (st != "SENSOR_ERROR") {
    r.lastLux = lux;
  }
  r.sRssiSum += rssi;

  char prev[24]; strlcpy(prev, r.lastStatus, sizeof prev);
  strlcpy(r.lastStatus, st.c_str(), sizeof r.lastStatus);
  markOnline(nId, rssi);

  if (strcmp(prev, r.lastStatus) != 0) {
    char det[64]; snprintf(det, sizeof det, "%s->%s", prev[0] ? prev : "-", r.lastStatus);
    logEvent(nId, "STATE", lux, r.lastStatus, rssi, det);
    if (isFault(r.lastStatus) && !isFault(prev)) {
      r.sFaultEvents++;
      if (timeIsValid()) {
        r.lastFault = time(nullptr);
        if (!r.firstFault) r.firstFault = r.lastFault;
      }
      strlcpy(r.lastFaultStatus, r.lastStatus, sizeof r.lastFaultStatus);
      Serial.printf("!!! LAMP FAULT on node %d: %s !!!\n", nId, r.lastStatus);
    }
  }
  if (strcmp(r.lastStatus, "STANDBY") != 0 && strcmp(r.lastStatus, "DAYLIGHT_STANDBY") != 0 && strcmp(r.lastStatus, "SENSOR_ERROR") != 0) {
    if (lux < r.sMinLux) r.sMinLux = lux;
    if (lux > r.sMaxLux) r.sMaxLux = lux;
  }
  if (now - r.lastSnapshotMs >= LOG_SNAPSHOT_S * 1000UL || r.lastSnapshotMs == 0) { r.lastSnapshotMs = now; logEvent(nId, "SNAP", lux, r.lastStatus, rssi, ""); }

  Serial.printf("[%s] N%d %-4s seq=%ld | Lux: %.1f | Lamp: %s (%s) | Link: CONNECTED | RSSI: %d dBm | SNR: %.1f dB | Missed: %lu\n",
                clockStr(), nId, type.c_str(), seq, lux, lampText(r.lastStatus), r.lastStatus, rssi, snr, r.missedCount);
  if (isRpt && waveActive && pollWaiting && nId == waveNode) pollGot = true;
#if ENABLE_WIFI_BRIDGE
  bridgeEnqueue(type.c_str(), nId, seq, lux, r.lastStatus, rssi);
#endif
}

void loadSleepPrefs() {
  if (prefs.begin("luminara", true)) { autoSleep = prefs.getBool("autoSleep", true); prefs.end(); }
  autoSleepPub = autoSleep;
}

// Switch between AUTO and MANUAL node sleep. Survives a master reboot.
void setAutoSleep(bool on, const char *src) {
  if (on == autoSleep) { Serial.printf("[Sleep] Already %s (%s)\n", on ? "AUTO" : "MANUAL", src); return; }
  autoSleep = on; autoSleepPub = on;
  if (prefs.begin("luminara", false)) { prefs.putBool("autoSleep", on); prefs.end(); }
  Serial.printf("\n[Sleep] Node sleep control -> %s (from %s)\n", on ? "AUTO: nodes sleep after every shift" : "MANUAL: nodes stay awake until SLEEP NOW", src);
  logEvent(0, "SLEEPCTL", 0, "", 0, on ? "auto" : "manual");
  // Back to AUTO while the schedule says nodes should already be asleep (outside a shift): put them to sleep now.
  if (on && phase == MP_IDLE && timeIsValid()) { sleepNowLeft = SLEEP_BURST_CYCLES; Serial.println("[Sleep] Outside the shift -> sending the sleep command to the nodes."); }
}

// Tell every node to deep-sleep now (until the next scheduled wake time). Needs a valid master clock.
bool requestSleepNow(const char *src) {
  if (!timeIsValid()) { Serial.println("[Sleep] Cannot send a sleep command: master clock not set yet."); return false; }
  sleepNowLeft = SLEEP_BURST_CYCLES;
  Serial.printf("\n[Sleep] SLEEP NOW (from %s): sending %d sleep beacons, one per %d s...\n", src, SLEEP_BURST_CYCLES, FREE_PERIOD_S);
  logEvent(0, "SLEEPNOW", 0, "", 0, src);
  return true;
}

void applySleepCommands() {
  int8_t pa = pendingAuto;
  if (pa >= 0) { pendingAuto = -1; setAutoSleep(pa == 1, "dashboard"); }
  if (pendingSleepNow) { pendingSleepNow = false; requestSleepNow("dashboard"); }
}

void lcdLine(uint8_t row, String s) { while (s.length() < 16) s += ' '; lcd.setCursor(0, row); lcd.print(s.substring(0, 16)); }

void handleSerialCmd() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n'); cmd.trim();
  if (!cmd.length()) return;
  String u = cmd; u.toUpperCase();
  if (u == "STATUS") printStatusTable();
  else if (u == "REPORT") {
    if (phase == MP_POLL || phase == MP_FREE || phase == MP_SLEEPCMD) writeReport(Serial, phase != MP_SLEEPCMD);
    else { String lr = latestFile("/report_"); if (lr.length()) dumpFile(lr); else Serial.println("No saved report yet."); }
  }
  else if (u == "DUMP") dumpFile(logPath);
  else if (u == "FILES") {
    String names[40]; int n = listLogFiles(names, 40);
    for (int i = 0; i < n; i++) Serial.println(names[i]);
    Serial.printf("%d files | flash used %u of %u bytes\n", n, (unsigned)LittleFS.usedBytes(), (unsigned)LittleFS.totalBytes());
  }
  else if (u == "CLEAR") {
    String names[40]; int n = listLogFiles(names, 40);
    for (int i = 0; i < n; i++) LittleFS.remove(names[i]);
    Serial.printf("Deleted %d log/report files.\n", n);
  }
  else if (u == "SLEEP") Serial.printf("Node sleep control: %s%s. Use SLEEP AUTO, SLEEP MANUAL or SLEEP NOW.\n", autoSleep ? "AUTO" : "MANUAL", sleepNowLeft ? " (sleep command being sent)" : "");
  else if (u == "SLEEP AUTO") setAutoSleep(true, "serial");
  else if (u == "SLEEP MANUAL" || u == "SLEEP OFF") setAutoSleep(false, "serial");
  else if (u == "SLEEP NOW") requestSleepNow("serial");
  else if (u.startsWith("SETTIME ")) {
    int y, mo, d, h, mi, s;
    if (sscanf(cmd.c_str() + 8, "%d-%d-%d %d:%d:%d", &y, &mo, &d, &h, &mi, &s) == 6) {
      struct tm tm = {}; tm.tm_year = y - 1900; tm.tm_mon = mo - 1; tm.tm_mday = d; tm.tm_hour = h; tm.tm_min = mi; tm.tm_sec = s; tm.tm_isdst = 0;
      struct timeval tv; tv.tv_sec = mktime(&tm); tv.tv_usec = 0; settimeofday(&tv, NULL);
      Serial.printf("[Clock] Manually synchronized to %s\n", clockStr());
    } else Serial.println("Usage: SETTIME 2026-10-27 17:00:00");
  }
  else Serial.println("Commands: STATUS, REPORT, DUMP, FILES, CLEAR, SETTIME YYYY-MM-DD HH:MM:SS, SLEEP [AUTO|MANUAL|NOW]");
}

void masterSetup() {
  initNodesFirstBoot();
  buildSchedule();
  loadSleepPrefs();
  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.init(); lcd.backlight(); lcd.clear();
  lcdLine(0, "MASTER Ready"); lcdLine(1, "LoRa RX Active");
  if (!LittleFS.begin(true)) Serial.println("LittleFS mount FAILED - history will not be saved");
  Serial.printf("\n=== LUMINARA MASTER | %s | expecting nodes 1..%d | node sleep: %s ===\n", DEMO_MODE ? "DEMO schedule" : "real schedule", EXPECTED_NODES, autoSleep ? "AUTO" : "MANUAL");
  Serial.println("Type HELP for commands.");
  setenv("TZ", TZ_STRING, 1); tzset();
#if ENABLE_WIFI_BRIDGE
  bridgeSetup();
#endif
  LoRa.receive();
  Serial.println("[LoRa] Receiver ready. Listening for lamp nodes (independent of NTP clock)...");
}

void runMaster() {
  unsigned long now = millis();
  processBlink();
  handleSerialCmd();
  applySleepCommands();

  // 1. Always process incoming LoRa packets even when Wi-Fi or NTP is unavailable
  masterHandleRx();
  if (MESH_ENABLED && MESH_ACTIVE_RELAY && MESH_RELAY_AWAKE) meshServiceRelay();

  // 2. Check clock state and log transitions clearly
  bool validClock = timeIsValid();
  if (MESH_ENABLED) {
    // Gateway NTP is only an optional time source for schedule-aware lamp classification.
    // Data forwarding does not depend on this gateway or its clock.
    if (validClock) {
      cycleBase = computeBase(time(nullptr)); // calculate schedule anchor without entering legacy POLL/SLEEP phases
      if (now - lastBeaconMs >= MESH_TIME_BEACON_INTERVAL_MS) {
        lastBeaconMs = now;
        sendBeacon(0);
      }
    }
  } else if (!validClock) {
    if (clockWasSynchronized) {
      clockWasSynchronized = false;
      Serial.println("[Clock] Clock unavailable! Scheduled beacons/sleep suspended; LoRa RX remains active.");
    }
    if (now - lastTimeMsg > 10000UL) {
      lastTimeMsg = now;
      Serial.printf("[NTP] Synchronization pending (Wi-Fi: %s) | LoRa RX active (type SETTIME YYYY-MM-DD HH:MM:SS to set manually)\n",
                    (WiFi.status() == WL_CONNECTED) ? "CONNECTED" : "DISCONNECTED");
    }
  } else {
    if (!clockWasSynchronized) {
      clockWasSynchronized = true;
      Serial.printf("[Clock] Synchronized! Current local time: %s\n", clockStr());
    }
    // 3. Time-dependent schedule updates and beacons run ONLY when clock is valid
    updatePhase();
    if (sleepNowLeft > 0) {
      cycleBeacon(2);                       // operator pressed "sleep now" (or AUTO was switched on outside a shift)
    } else {
      switch (phase) {
        case MP_SYNC:     beaconEvery(); break;
        case MP_POLL:     runWaves(); if (!waveActive) beaconEvery(); break;
        case MP_FREE:     cycleBeacon(1); break;
        case MP_SLEEPCMD: cycleBeacon(autoSleep ? 2 : 1); break;   // MANUAL: no scheduled sleep command
        default:          if (!autoSleep) cycleBeacon(1); break;   // MANUAL: keep awake nodes synced between shifts
      }
    }
  }

  // 4. Node connectivity timeout check (active during MP_FREE or when clock is unsynced and nodes are transmitting)
  if ((phase == MP_FREE || !validClock) && now - lastHealth > 5000UL) {
    lastHealth = now;
    if (!validClock || (now - freeStartMs > 90000UL)) {
      for (int i = 1; i < MAX_NODES; i++) {
        if (nodes[i].isActive && nodes[i].isConnected && (now - nodes[i].lastReceiveTime > DISCONNECT_TIMEOUT_MS)) {
          markOffline(i, "timeout");
        }
      }
    }
  }

  if ((phase == MP_FREE || !validClock) && now - lastStatusTable > STATUS_TABLE_MS) {
    lastStatusTable = now;
    printStatusTable();
  }

  if (now - lastLcd > 1000UL) {
    lastLcd = now;
    int on = 0; for (int i = 1; i <= EXPECTED_NODES; i++) if (nodes[i].isConnected) on++;
    if (validClock) {
      lcdLine(0, String(PHASE_NAME[phase]) + " " + clockStr());
      lcdLine(1, "Nodes " + String(on) + "/" + String(EXPECTED_NODES) + " W" + String(wavesRun) + "/" + String(POLL_WAVES) + (autoSleep ? " A" : " M"));
    } else {
      lcdLine(0, "NO-CLOCK LoRaRX");
      lcdLine(1, "Nodes " + String(on) + "/" + String(EXPECTED_NODES) + (WiFi.status() == WL_CONNECTED ? " WiFi:OK" : " WiFi:--"));
    }
  }
}

// ================= SETUP / LOOP =================
void setup() {
  if (IS_SENDER) setCpuFrequencyMhz(80);     // radio + sensor do not need 240 MHz; saves battery
  Serial.begin(115200);
  Serial.setTimeout(50);
  delay(300);
  randomSeed((uint32_t)esp_random() ^ (uint32_t)micros());
  setenv("TZ", TZ_STRING, 1); tzset();

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQ + LORA_FREQ_OFFSET)) {
    Serial.println("LoRa init FAILED");
    while (true) delay(1000);
  }
  LoRa.setSpreadingFactor(LORA_SF);
  LoRa.setSignalBandwidth(LORA_BW);
  LoRa.setCodingRate4(LORA_CR);
  LoRa.setTxPower(LORA_TXPWR);
  LoRa.enableCrc();

  if (IS_SENDER) senderSetup(); else masterSetup();
}

void loop() {
  if (IS_SENDER) runSender();
  else runMaster();
}