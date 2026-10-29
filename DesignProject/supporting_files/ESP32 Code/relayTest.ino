#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID  = "GFiber_1A6C7"; //Pasaway_Extender and GFiber_1A6C7
const char* WIFI_PASS  = "zhNf7G37"; //PlatimuM0911 and zhNf7G37
const char* COMMAND_URL = "http://192.168.254.103:3001/api/command";  // PC running server.js
const char* DEVICE_KEY  = "rophil1234";

const int  RELAY_PIN  = 27;
const bool ACTIVE_LOW = false;   // flip if your board turns on with HIGH
bool lampOn = false;

void relay(bool on) {
  lampOn = on;
  digitalWrite(RELAY_PIN, (on == ACTIVE_LOW) ? LOW : HIGH);
  Serial.println(on ? "RELAY ON" : "RELAY OFF");
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
    if      (body.indexOf("\"on\":true")  >= 0 && !lampOn) relay(true);
    else if (body.indexOf("\"on\":false") >= 0 &&  lampOn) relay(false);
    // "on":null -> server has no command yet; hold the current state
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
  static uint32_t last = 0;
  if (WiFi.status() == WL_CONNECTED && millis() - last >= 2000) {
    last = millis();
    pollCommand();
  }
  delay(10);
}