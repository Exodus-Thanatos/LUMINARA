#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>

const char* WIFI_SSID  = "YOUR_WIFI_NAME";
const char* WIFI_PASS  = "YOUR_WIFI_PASSWORD";
const char* COMMAND_URL = "http://192.168.100.2:3001/api/command";  // PC running server.js
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

void setup() {
  Serial.begin(115200);
  digitalWrite(RELAY_PIN, ACTIVE_LOW ? HIGH : LOW);   // start "off" before enabling the pin
  pinMode(RELAY_PIN, OUTPUT);
  relay(false);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
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
