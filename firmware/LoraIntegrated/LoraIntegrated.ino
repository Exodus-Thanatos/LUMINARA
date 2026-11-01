/*
  LUMINARA - LoRa lamp node + master gateway (Merged v2 Engine + v1 Thresholds)

  One sketch, two roles. Lamp node: IS_SENDER true + its own NODE_ID. Master: IS_SENDER false.
  Flash every board with the SAME protocol constants (slots, period, DEMO_MODE).

  Daily cycle (the master drives it, nodes follow its messages):
    1. SYNC  : master beacons "SYNC,<epoch>,<mode>,<shiftStart>,<shiftEnd>,<wake>" every 10 s.
               Nodes wake EARLY (deep-sleep timer is only +/-5 %), listen, and set their clock from it.
    2. POLL  : POLL_WAVES waves. Master polls node 1..N one by one, each answers "RPT".
    3. FREE  : 30 s cycle on the shared clock. Node k transmits in its own slot (k-1)*SLOT_MS and the
               master ACKs. The master's own window is the end of every cycle (beacon = clock re-sync).
    4. SLEEP : after the shift the beacon carries mode 2. Nodes deep-sleep until the wake time.
  The master (mains powered, Wi-Fi + NTP) never sleeps; it just follows the clock.

  Master Serial commands: STATUS, REPORT, DUMP, FILES, CLEAR, SETTIME YYYY-MM-DD HH:MM:SS, HELP
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
#include "esp_sleep.h"

// ===== BOARD IDENTITY & ROLE =====
#define IS_SENDER false       // true = lamp node, false = master gateway
#define NODE_ID 1             // set 1, 2, 3... for each lamp node
#define MAX_NODES 32
#define EXPECTED_NODES 3      // master polls node IDs 1..EXPECTED_NODES
#define DEMO_MODE 1           // 1 = compressed 20-minute bench cycle, 0 = real daily schedule (see buildSchedule)

// ===== DASHBOARD BRIDGE (MASTER ONLY) =====
#define ENABLE_WIFI_BRIDGE true
#if __has_include("secrets.h")
  #include "secrets.h"   // your real values; copy secrets.h.example to secrets.h (git-ignored)
#else
  #warning "secrets.h not found: using PLACEHOLDER Wi-Fi/server settings. Copy secrets.h.example to secrets.h and fill it in."
  #define WIFI_SSID  "YOUR_WIFI_NAME"                                    // 2.4 GHz network
  #define WIFI_PASS  "YOUR_WIFI_PASSWORD"
  #define SERVER_URL "http://YOUR_PC_IP:3001/api/telemetry"              // PC that runs server/server.js
  #define DEVICE_KEY "CHANGE_ME_SAME_AS_SERVER_DEVICE_KEY"               // must equal DEVICE_KEY used to start the server
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

// ===== PROTOCOL TIMING =====
#define FREE_PERIOD_S 30
#define SLOT_MS 3000                 // 8 slots * 3 s = 24 s, master window at the end of the 30 s cycle
#define MAX_SLOTS 8
#define SLOT_JITTER_MS 300           // a node may start up to this late inside its slot
#define ACK_WAIT_MS 700
#define MASTER_WIN_START_MS (MAX_SLOTS * SLOT_MS + 800)
#define NODE_WIN_OPEN_MS (MASTER_WIN_START_MS - 400)
#define NODE_WIN_CLOSE_MS (MASTER_WIN_START_MS + 3200)
#define BEACON_INTERVAL_MS 10000
#define POLL_REPLY_MS 1500
#define POLL_WAVES 3
#define SYNC_AIRTIME_MS 490          // airtime of a 35-byte beacon at SF10/BW125; recompute if SF/BW change
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

static_assert(MASTER_WIN_START_MS + 3200 < FREE_PERIOD_S * 1000, "slots + master window do not fit in the cycle");
static_assert(EXPECTED_NODES <= MAX_SLOTS, "more expected nodes than slots");
static_assert(!IS_SENDER || NODE_ID <= MAX_SLOTS, "NODE_ID has no slot");

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

// ================= SMALL HELPERS =================
void triggerBlink() { digitalWrite(LED_PIN, HIGH); isLedBlinking = true; ledBlinkStartTime = millis(); }
void processBlink() {
  if (isLedBlinking && (millis() - ledBlinkStartTime >= 100)) { digitalWrite(LED_PIN, LOW); isLedBlinking = false; }
}

bool radioRx(String &msg, int &rssi, float &snr) {
  int size = LoRa.parsePacket();
  if (size <= 0) return false;
  msg = "";
  while (LoRa.available()) msg += (char)LoRa.read();
  rssi = LoRa.packetRssi();
  snr = LoRa.packetSnr();
  return true;
}
void radioTx(const String &s) { LoRa.beginPacket(); LoRa.print(s); LoRa.endPacket(); }

bool timeIsValid() { return time(nullptr) > 1700000000L; }
uint64_t epochMs() { struct timeval tv; gettimeofday(&tv, NULL); return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000; }
long sodOf(time_t t) { struct tm tm; localtime_r(&t, &tm); return tm.tm_hour * 3600L + tm.tm_min * 60L + tm.tm_sec; }
void stampTo(time_t t, char *buf, size_t n) {
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

// ================= SENDER (LAMP NODE) =================
enum NodeMode { NM_LISTEN, NM_WAIT_POLL, NM_FREE };
const char *NODE_MODE_NAME[] = {"LISTENING", "WAIT-POLL", "FREE"};
NodeMode nodeMode = NM_LISTEN;

RTC_DATA_ATTR unsigned long seqNo = 0;
RTC_DATA_ATTR float lastSentLux = -100.0;
RTC_DATA_ATTR char lastSentStatus[24] = "INIT";
RTC_DATA_ATTR time_t expectedWakeEpoch = 0;

long shiftStartSod = 64800, shiftEndSod = 19800, wakeSod = 57600;   // replaced by the first beacon
unsigned long lastHeardMs = 0, lastBeaconMs_n = 0;
bool linkConnected = false;
int lastRssi = 0; float lastSnr = 0; bool everHeard = false;
uint64_t lastTxCycle = 0;
bool radioRxOn = false;

float sampleLux = 0, currentLux = 0, minLuxWindow = 100000.0, maxLuxWindow = 0.0;
bool sensorOk = true;
uint8_t bh1750ErrorCount = 0;
String currentStatus = "STANDBY";
unsigned long lastSampleMs = 0, lastEvalMs = 0, lastPrintMs = 0;

void powerDownBH1750() { Wire.beginTransmission(0x23); Wire.write(0x00); Wire.endTransmission(); }

void goToSleep(const char *why) {
  long sod = sodOf(time(nullptr));
  long secs = (wakeSod - sod + 86400L) % 86400L;
  if (secs < 30) secs = 30;
  expectedWakeEpoch = time(nullptr) + secs;
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
  if (!sensorOk) return "SENSOR_ERROR";
  // 1. Brighter than any streetlight -> Daytime Standby (Never a fault, even during active shift)
  if (currentLux > LUX_DAYLIGHT_MIN) return "DAYLIGHT_STANDBY";
  // 2. Outside scheduled shift hours
  if (!shiftActive()) return "STANDBY";
  // 3. Flickering check during nighttime / active shift
  if ((maxLuxWindow - minLuxWindow) > LUX_FLICKER_DELTA) return "BLINKING/UNSTABLE";
  // 4. Complete bulb failure at night (Fault)
  if (currentLux <= LUX_BLACKOUT_MAX) return "TOTAL_BLACKOUT";
  // 5. Weak/dimming bulb or dirty lens cover (Warning)
  if (currentLux <= LUX_LOW_LIGHT_MAX) return "LOW_LIGHT";
  // 6. Healthy 150W-200W lamp reading (80.1 to 3000.0 Lux)
  return "NORMAL_LIT";
}

void onBeacon(const String &msg, int rssi, float snr) {
  unsigned long ep; int mode; long ss, se, wk;
  if (sscanf(msg.c_str(), "SYNC,%lu,%d,%ld,%ld,%ld", &ep, &mode, &ss, &se, &wk) != 5) return;
  double delta = applyClock((time_t)ep);
  shiftStartSod = ss; shiftEndSod = se; wakeSod = wk;
  lastBeaconMs_n = millis();
  setLink(true, rssi, snr);
  if (delta != delta) Serial.printf("<< SYNC mode=%d | clock set | RSSI %d dBm | SNR %.1f dB\n", mode, rssi, snr);
  else Serial.printf("<< SYNC mode=%d | clock error was %+.2f s | RSSI %d dBm | SNR %.1f dB\n", mode, delta, rssi, snr);
  if (mode == 2) { goToSleep("master sleep command"); return; }
  NodeMode nm = (mode == 1) ? NM_FREE : NM_WAIT_POLL;
  if (nm != nodeMode) { nodeMode = nm; Serial.printf("Mode -> %s\n", NODE_MODE_NAME[nodeMode]); }
}

void replyToPoll() {
  seqNo++;
  String p = "RPT," + String(NODE_ID) + "," + String(seqNo) + "," + String(sensorOk ? currentLux : 0.0f, 1) + "," + currentStatus;
  radioTx(p); LoRa.receive(); radioRxOn = true; triggerBlink();
  Serial.println("TX (poll reply) -> " + p);
}

void transmitReport() {
  // Suppress lux-change alerts during DAYLIGHT_STANDBY so passing clouds don't trigger ALRT
  bool luxChanged = (currentStatus != "DAYLIGHT_STANDBY") &&
                    (fabs(currentLux - lastSentLux) >= LUX_CHANGE_THRESHOLD);
  bool statusChanged = (currentStatus != String(lastSentStatus));
  const char *type = (luxChanged || statusChanged) ? "ALRT" : "BEAT";
  seqNo++;
  String p = String(type) + "," + String(NODE_ID) + "," + String(seqNo) + "," + String(sensorOk ? currentLux : 0.0f, 1) + "," + currentStatus;
  uint32_t period = FREE_PERIOD_S * 1000UL;
  uint32_t slotEnd = (NODE_ID - 1) * SLOT_MS + SLOT_MS;
  bool acked = false;
  for (int attempt = 0; attempt < 2 && !acked; attempt++) {
    uint32_t ph = epochMs() % period;
    if (attempt > 0 && ph + 1300 > slotEnd) break;   // no room left in this slot for a retry
    radioTx(p); triggerBlink();
    Serial.println(String("TX -> ") + p + (attempt ? "  (retry)" : ""));
    LoRa.receive(); radioRxOn = true;
    unsigned long t0 = millis();
    while (millis() - t0 < ACK_WAIT_MS && !acked) {
      String msg; int rssi; float snr;
      if (radioRx(msg, rssi, snr) && msg.startsWith("ACK,")) {
        int id; unsigned long sq;
        if (sscanf(msg.c_str(), "ACK,%d,%lu", &id, &sq) == 2 && id == NODE_ID && sq == seqNo) {
          acked = true;
          setLink(true, rssi, snr);
          lastHeardMs = millis();
          Serial.printf("<< ACK | RSSI %d dBm | SNR %.1f dB\n", rssi, snr);
        }
      }
      delay(2);
    }
  }
  if (acked) { lastSentLux = currentLux; strncpy(lastSentStatus, currentStatus.c_str(), sizeof(lastSentStatus) - 1); }
  else Serial.println("!! No ACK from master for this report");
}

void senderSetup() {
  Wire.begin(I2C_SDA, I2C_SCL);
  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) Serial.println("BH1750 init FAILED");
  Serial.printf("\n=== LUMINARA NODE %d | SF%d BW%.0f kHz | %s ===\n", NODE_ID, LORA_SF, LORA_BW / 1000.0, DEMO_MODE ? "DEMO schedule" : "real schedule");
  if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER) {
    Serial.println("Woke from deep sleep.");
    if (expectedWakeEpoch > 0 && timeIsValid())
      Serial.printf("Wake time vs plan: %+ld s (deep-sleep RTC drift)\n", (long)(time(nullptr) - expectedWakeEpoch));
  }
  Serial.println("Listening for the master's SYNC beacon...");
  LoRa.receive(); radioRxOn = true;
}

void runSender() {
  unsigned long now = millis();
  processBlink();

  String msg; int rssi; float snr;
  if (radioRx(msg, rssi, snr)) {
    if (msg.startsWith("SYNC,")) onBeacon(msg, rssi, snr);
    else if (msg.startsWith("POLL,") && msg.substring(5).toInt() == NODE_ID) { setLink(true, rssi, snr); replyToPoll(); }
  }

  if (now - lastSampleMs >= 150) {
    lastSampleMs = now;
    float raw = lightMeter.readLightLevel();
    if (raw >= 0) {
      bh1750ErrorCount = 0; sensorOk = true;
      float cal = raw * LUX_MULTIPLIER + LUX_OFFSET; if (cal < 0) cal = 0;
      sampleLux = cal;
      if (cal < minLuxWindow) minLuxWindow = cal;
      if (cal > maxLuxWindow) maxLuxWindow = cal;
    } else if (++bh1750ErrorCount > 3) {
      sensorOk = false;
      Wire.end(); delay(10); Wire.begin(I2C_SDA, I2C_SCL);
      lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
      bh1750ErrorCount = 0;
    }
  }

  if (now - lastEvalMs >= EVAL_INTERVAL_MS) {
    lastEvalMs = now;
    currentLux = sampleLux;
    currentStatus = computeStatus();
    minLuxWindow = 100000.0; maxLuxWindow = 0.0;
  }

  if (nodeMode == NM_FREE && timeSynced) {
    uint32_t period = FREE_PERIOD_S * 1000UL;
    uint64_t ms = epochMs();
    uint64_t cycle = ms / period;
    uint32_t ph = ms % period;
    uint32_t slotStart = (NODE_ID - 1) * SLOT_MS;
    if (cycle != lastTxCycle && ph >= slotStart && ph < slotStart + SLOT_JITTER_MS) { lastTxCycle = cycle; transmitReport(); }
  }

  // radio on only when needed (listening / poll wait / master window / ACK wait)
  bool want = true;
  if (nodeMode == NM_FREE && timeSynced) { uint32_t ph = epochMs() % (FREE_PERIOD_S * 1000UL); want = (ph >= NODE_WIN_OPEN_MS && ph < NODE_WIN_CLOSE_MS); }
  if (want && !radioRxOn) { LoRa.receive(); radioRxOn = true; }
  else if (!want && radioRxOn) { LoRa.sleep(); radioRxOn = false; }

  // link monitor
  if (linkConnected && now - lastHeardMs > LINK_TIMEOUT_MS) { linkConnected = false; Serial.println("*** LINK DISCONNECTED (no master packets) ***"); }
  if (nodeMode == NM_FREE && now - lastBeaconMs_n > 90000UL) { nodeMode = NM_LISTEN; Serial.println("!! Lost beacons -> back to LISTENING"); }

  // failsafe: master never told us to sleep
  if (timeSynced && nodeMode == NM_FREE) {
    long since = (sodOf(time(nullptr)) - shiftEndSod + 86400L) % 86400L;
    if (since >= FAILSAFE_S && since < FAILSAFE_S + 7200L) goToSleep("failsafe, no sleep command heard");
  }

  if (now - lastPrintMs >= SERIAL_STATUS_MS) {
    lastPrintMs = now;
    char luxs[12]; if (sensorOk) snprintf(luxs, sizeof luxs, "%.1f", currentLux); else strcpy(luxs, "ERR");
    Serial.printf("[%s] Lux: %s | Lamp: %s (%s) | Link: %s", clockStr(), luxs, lampText(currentStatus.c_str()), currentStatus.c_str(),
                  linkConnected ? "CONNECTED" : "DISCONNECTED");
    if (everHeard) Serial.printf(" | RSSI: %d dBm SNR: %.1f dB", lastRssi, lastSnr);
    Serial.printf(" | Mode: %s", NODE_MODE_NAME[nodeMode]);
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
    memset(&nodes[i], 0, sizeof(NodeRecord));
    nodes[i].lastSeqSeen = -1; nodes[i].sMinLux = 1e9f; nodes[i].sMaxLux = -1.0f;
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
  stampTo(cycleBase + S.shiftStart, a, sizeof a); stampTo(cycleBase + S.shiftEnd, b, sizeof b); stampTo(time(nullptr), c, sizeof c);
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
  Serial.printf("---- STATUS %s | phase %s ----\n", clockStr(), PHASE_NAME[phase]);
  for (int n = 1; n <= EXPECTED_NODES; n++) {
    NodeRecord &r = nodes[n];
    if (!r.isActive) { Serial.printf("Node %d: no data yet\n", n); continue; }
    Serial.printf("Node %d: %-12s | lamp %-10s | lux %7.1f | RSSI %4d dBm | SNR %5.1f dB | heard %lus ago | rx %lu, missed %lu\n", n,
                  r.isConnected ? "CONNECTED" : "DISCONNECTED", lampText(r.lastStatus), r.lastLux, r.lastRssi, r.lastSnr,
                  (millis() - r.lastReceiveTime) / 1000, r.rxCount, r.missedCount);
  }
}

// ---------- dashboard bridge (runs in its own task so HTTP never blocks LoRa) ----------
#if ENABLE_WIFI_BRIDGE
struct BridgeItem { char type[6]; int nodeId; long seq; float lux; char status[24]; int rssi; };
QueueHandle_t bridgeQ = NULL;

void bridgeTask(void *arg) {
  unsigned long lastWifiAttempt = 0;
  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      if (millis() - lastWifiAttempt > 10000) { lastWifiAttempt = millis(); WiFi.disconnect(); WiFi.begin(WIFI_SSID, WIFI_PASS); }
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }
    BridgeItem it;
    if (xQueuePeek(bridgeQ, &it, pdMS_TO_TICKS(500)) != pdTRUE) continue;
    char body[180];
    snprintf(body, sizeof(body), "{\"type\":\"%s\",\"nodeId\":%d,\"seq\":%ld,\"lux\":%.1f,\"status\":\"%s\",\"rssi\":%d}",
             it.type, it.nodeId, it.seq, it.lux, it.status, it.rssi);
    HTTPClient http;
    http.setConnectTimeout(800);
    http.setTimeout(BRIDGE_HTTP_TIMEOUT_MS);
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Api-Key", DEVICE_KEY);
    int code = http.POST((uint8_t *)body, strlen(body));
    http.end();
    if (code == 200 || (code >= 400 && code < 500)) {
      BridgeItem gone; xQueueReceive(bridgeQ, &gone, 0);
      if (code == 200) Serial.printf("Bridge: sent node %d seq %ld (HTTP 200)\n", it.nodeId, it.seq);
      else Serial.printf("Bridge: server rejected packet (HTTP %d), dropped\n", code);
    } else {
      Serial.printf("Bridge: send failed (%d), retry in 5 s\n", code);
      vTaskDelay(pdMS_TO_TICKS(5000));
    }
  }
}
void bridgeSetup() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  configTzTime(TZ_STRING, "pool.ntp.org", "time.google.com");
  bridgeQ = xQueueCreate(BRIDGE_QUEUE_SIZE, sizeof(BridgeItem));
  xTaskCreatePinnedToCore(bridgeTask, "bridge", 8192, NULL, 1, NULL, 0);
  Serial.println("Bridge: connecting to Wi-Fi + NTP...");
}
void bridgeEnqueue(const char *type, int nodeId, long seq, float lux, const char *status, int rssi) {
  if (!bridgeQ) return;
  BridgeItem it;
  strlcpy(it.type, type, sizeof it.type); strlcpy(it.status, status, sizeof it.status);
  it.nodeId = nodeId; it.seq = seq; it.lux = lux; it.rssi = rssi;
  if (xQueueSend(bridgeQ, &it, 0) != pdTRUE) {
    BridgeItem drop; xQueueReceive(bridgeQ, &drop, 0); xQueueSend(bridgeQ, &it, 0);
    Serial.println("Bridge: queue full, oldest packet dropped");
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
    for (int n = 1; n <= EXPECTED_NODES; n++) if (!nodes[n].isConnected) markOffline(n, "no reply to poll waves");
  }
  if (to == MP_SLEEPCMD) finishShift();
}

void updatePhase() {
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
  struct timeval tv; gettimeofday(&tv, NULL);
  time_t ep = tv.tv_sec + 1;                       // the packet starts on the next whole second
  delay((1000000UL - tv.tv_usec) / 1000UL);
  String p = "SYNC," + String((unsigned long)ep) + "," + String(mode) + "," + String(sodOf(cycleBase + S.shiftStart)) + "," +
             String(sodOf(cycleBase + S.shiftEnd)) + "," + String(sodOf(cycleBase + S.nextWake));
  radioTx(p); LoRa.receive(); triggerBlink();
  Serial.printf("TX SYNC mode=%d (%s)\n", mode, PHASE_NAME[phase]);
}

void beaconEvery() {
  if (millis() - lastBeaconMs >= BEACON_INTERVAL_MS) { lastBeaconMs = millis(); sendBeacon(0); }
}
void cycleBeacon(uint8_t mode) {
  uint64_t ms = epochMs();
  uint32_t period = FREE_PERIOD_S * 1000UL, ph = ms % period;
  uint64_t cycle = ms / period;
  if (ph >= MASTER_WIN_START_MS && ph < MASTER_WIN_START_MS + 1500 && cycle != lastBeaconCycle) {
    lastBeaconCycle = cycle; sendBeacon(mode); if (mode == 2) sleepBeacons++;
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
  int c1 = msg.indexOf(','), c2 = msg.indexOf(',', c1 + 1), c3 = msg.indexOf(',', c2 + 1), c4 = msg.indexOf(',', c3 + 1);
  if (c1 < 0 || c2 < 0 || c3 < 0 || c4 < 0) return;
  String type = msg.substring(0, c1);
  int nId = msg.substring(c1 + 1, c2).toInt();
  long seq = msg.substring(c2 + 1, c3).toInt();
  float lux = msg.substring(c3 + 1, c4).toFloat();
  String st = msg.substring(c4 + 1);
  if (nId < 1 || nId >= MAX_NODES) return;

  bool isRpt = (type == "RPT");
  if (!isRpt) { radioTx("ACK," + String(nId) + "," + String(seq)); LoRa.receive(); }   // ACK first, bookkeeping after
  triggerBlink();

  NodeRecord &r = nodes[nId];
  if (r.lastSeqSeen >= 0 && seq == r.lastSeqSeen) return;                              // retry of a packet we already have
  if (r.lastSeqSeen >= 0 && seq > r.lastSeqSeen + 1) r.missedCount += seq - r.lastSeqSeen - 1;
  r.lastSeqSeen = seq; r.rxCount++; r.sPackets++;
  unsigned long now = millis();
  r.lastReceiveTime = now; r.lastRssi = rssi; r.lastSnr = snr; r.lastLux = lux; r.sRssiSum += rssi;

  char prev[24]; strlcpy(prev, r.lastStatus, sizeof prev);
  strlcpy(r.lastStatus, st.c_str(), sizeof r.lastStatus);
  markOnline(nId, rssi);

  if (strcmp(prev, r.lastStatus) != 0) {
    char det[64]; snprintf(det, sizeof det, "%s->%s", prev[0] ? prev : "-", r.lastStatus);
    logEvent(nId, "STATE", lux, r.lastStatus, rssi, det);
    if (isFault(r.lastStatus) && !isFault(prev)) {
      r.sFaultEvents++; r.lastFault = time(nullptr); if (!r.firstFault) r.firstFault = r.lastFault;
      strlcpy(r.lastFaultStatus, r.lastStatus, sizeof r.lastFaultStatus);
      Serial.printf("!!! LAMP FAULT on node %d: %s !!!\n", nId, r.lastStatus);
    }
  }
  if (strcmp(r.lastStatus, "STANDBY") != 0 && strcmp(r.lastStatus, "DAYLIGHT_STANDBY") != 0) {
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
  else if (u.startsWith("SETTIME ")) {
    int y, mo, d, h, mi, s;
    if (sscanf(cmd.c_str() + 8, "%d-%d-%d %d:%d:%d", &y, &mo, &d, &h, &mi, &s) == 6) {
      struct tm tm = {}; tm.tm_year = y - 1900; tm.tm_mon = mo - 1; tm.tm_mday = d; tm.tm_hour = h; tm.tm_min = mi; tm.tm_sec = s; tm.tm_isdst = 0;
      struct timeval tv; tv.tv_sec = mktime(&tm); tv.tv_usec = 0; settimeofday(&tv, NULL);
      Serial.printf("Clock set to %s\n", clockStr());
    } else Serial.println("Usage: SETTIME 2026-10-27 17:00:00");
  }
  else Serial.println("Commands: STATUS, REPORT, DUMP, FILES, CLEAR, SETTIME YYYY-MM-DD HH:MM:SS");
}

void masterSetup() {
  resetShiftStats();
  buildSchedule();
  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.init(); lcd.backlight(); lcd.clear();
  lcdLine(0, "MASTER Ready"); lcdLine(1, "Waiting for time");
  if (!LittleFS.begin(true)) Serial.println("LittleFS mount FAILED - history will not be saved");
  Serial.printf("\n=== LUMINARA MASTER | %s | expecting nodes 1..%d ===\n", DEMO_MODE ? "DEMO schedule" : "real schedule", EXPECTED_NODES);
  Serial.println("Type HELP for commands.");
  setenv("TZ", TZ_STRING, 1); tzset();
#if ENABLE_WIFI_BRIDGE
  bridgeSetup();
#endif
  LoRa.receive();
}

void runMaster() {
  unsigned long now = millis();
  processBlink();
  handleSerialCmd();

  if (!timeIsValid()) {
    if (now - lastTimeMsg > 10000) { lastTimeMsg = now; Serial.println("Waiting for NTP time (or type SETTIME YYYY-MM-DD HH:MM:SS)..."); }
    return;
  }
  updatePhase();
  masterHandleRx();

  switch (phase) {
    case MP_SYNC:     beaconEvery(); break;
    case MP_POLL:     runWaves(); if (!waveActive) beaconEvery(); break;
    case MP_FREE:     cycleBeacon(1); break;
    case MP_SLEEPCMD: cycleBeacon(2); break;
    default: break;
  }

  if (phase == MP_FREE && now - lastHealth > 5000) {
    lastHealth = now;
    if (now - freeStartMs > 90000UL)
      for (int i = 1; i < MAX_NODES; i++)
        if (nodes[i].isActive && nodes[i].isConnected && now - nodes[i].lastReceiveTime > DISCONNECT_TIMEOUT_MS) markOffline(i, "timeout");
  }
  if (phase == MP_FREE && now - lastStatusTable > STATUS_TABLE_MS) { lastStatusTable = now; printStatusTable(); }

  if (now - lastLcd > 1000) {
    lastLcd = now;
    int on = 0; for (int i = 1; i <= EXPECTED_NODES; i++) if (nodes[i].isConnected) on++;
    lcdLine(0, String(PHASE_NAME[phase]) + " " + clockStr());
    lcdLine(1, "Nodes " + String(on) + "/" + String(EXPECTED_NODES) + " W" + String(wavesRun) + "/" + String(POLL_WAVES));
  }
}

// ================= SETUP / LOOP =================
void setup() {
  if (IS_SENDER) setCpuFrequencyMhz(80);     // radio + sensor do not need 240 MHz; saves battery
  Serial.begin(115200);
  Serial.setTimeout(50);
  delay(300);
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