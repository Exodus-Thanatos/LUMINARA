#include <SPI.h>
#include <LoRa.h>
#include <Wire.h>
#include <BH1750.h>
#include <LiquidCrystal_I2C.h> // Make sure this library is installed
#include <WiFi.h>        // ESP32 built-in (added for the dashboard bridge)
#include <HTTPClient.h>  // ESP32 built-in (added for the dashboard bridge)

// ===== BOARD IDENTITY & ROLE =====
#define IS_SENDER true   
#define NODE_ID 1             
#define MAX_NODES 32          

// ===== DASHBOARD BRIDGE (MASTER ONLY) — added for the LUMINARA dashboard =====
// Set to false to build the master exactly as before (no Wi-Fi at all).
#define ENABLE_WIFI_BRIDGE true
#define WIFI_SSID   "YOUR_WIFI_NAME"                         // 2.4 GHz network (ESP32 has no 5 GHz)
#define WIFI_PASS   "YOUR_WIFI_PASSWORD"
#define SERVER_URL  "http://YOUR_PC_IP:3001/api/telemetry" // IP of the computer running server/server.js
#define DEVICE_KEY  "CHANGE_ME_SAME_AS_SERVER_DEVICE_KEY"                      // must equal DEVICE_KEY used to start the server
#define BRIDGE_QUEUE_SIZE 16   // packets kept while Wi-Fi/server is down (oldest dropped when full)
#define BRIDGE_HTTP_TIMEOUT_MS 1500

// ===== CALIBRATION SETTINGS =====
#define LUX_MULTIPLIER 1.0  
#define LUX_OFFSET     0.0  
#define LORA_FREQ_OFFSET 0  

// ===== PROTOCOL TIMING =====
#define LUX_CHANGE_THRESHOLD 10.0    
#define HEARTBEAT_INTERVAL_MS 30000  
#define EVAL_INTERVAL_MS 2000        
#define DISCONNECT_TIMEOUT_MS 75000  
#define ACK_TIMEOUT_MS 1500   
#define MAX_RETRIES 3
#define ROLLCALL_WINDOW_MS 10000

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

BH1750 lightMeter(0x23);

// LCD object for the Master (0x27 is the default I2C address for most 16x2 LCDs)
LiquidCrystal_I2C lcd(0x27, 16, 2); 

// Shared variables
unsigned long ledBlinkStartTime = 0;
bool isLedBlinking = false;
RTC_DATA_ATTR unsigned long seqNo = 0;

// ================= SENDER GLOBALS =================
enum NodeState { STATE_BOOT, STATE_ROLLCALL, STATE_NORMAL, STATE_BACKOFF, STATE_WAIT_ACK };
NodeState currentState = STATE_BOOT;

RTC_DATA_ATTR float lastSentLux = -100.0;
RTC_DATA_ATTR char lastSentStatus[20] = "INIT"; 

unsigned long stateTimer = 0;
unsigned long lastEvalTime = 0;
unsigned long lastTxTime = 0;
unsigned long backoffDelay = 0;
String pendingPayload = "";

float minLuxWindow = 100000.0;
float maxLuxWindow = 0.0;
unsigned long lastSensorSampleTime = 0;

uint8_t bh1750ErrorCount = 0;
uint8_t retryCount = 0;

// ================= RECEIVER GLOBALS =================
struct NodeRecord {
  bool isActive;
  bool isConnected;
  unsigned long lastReceiveTime;
  long lastSeqSeen;
  unsigned long rxCount;
  unsigned long missedCount;
};
NodeRecord nodes[MAX_NODES]; 
unsigned long masterBootTime = 0;

void setup() {
  Serial.begin(115200);
  delay(500);

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

  if (IS_SENDER) {
    Wire.begin(I2C_SDA, I2C_SCL);
    if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
      Serial.println("BH1750 init FAILED");
    }
    delay(200); 
    currentState = STATE_BOOT;
    Serial.printf("NODE %d Ready. Type a message to send chat.\n", NODE_ID);
  } else {
    for(int i=0; i<MAX_NODES; i++) {
      nodes[i].isActive = false;
      nodes[i].isConnected = false;
    }
    masterBootTime = millis();
    
    // Initialize LCD strictly for the Master
    Wire.begin(I2C_SDA, I2C_SCL);
    lcd.init();
    lcd.backlight();
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("MASTER Ready");
    lcd.setCursor(0, 1);
    lcd.print("Waiting for chat");

    Serial.println("MASTER Ready. Type a message to broadcast to all nodes.");
#if ENABLE_WIFI_BRIDGE
    bridgeSetup();
#endif
  }
  LoRa.receive(); 
}

void loop() {
  if (IS_SENDER) runSender();
  else runReceiver();
}

void triggerBlink() {
  digitalWrite(LED_PIN, HIGH);
  isLedBlinking = true;
  ledBlinkStartTime = millis();
}

void processBlink(unsigned long currentMillis) {
  if (isLedBlinking && (currentMillis - ledBlinkStartTime >= 100)) {
    digitalWrite(LED_PIN, LOW);
    isLedBlinking = false;
  }
}

// ================= SENDER LOGIC =================
void runSender() {
  unsigned long currentMillis = millis();
  processBlink(currentMillis);

  // --- MANUAL CHAT INPUT (NODE -> MASTER) ---
  if (Serial.available() && currentState == STATE_NORMAL) {
    String chatMsg = Serial.readStringUntil('\n');
    chatMsg.trim();
    if (chatMsg.length() > 0) {
      seqNo++;
      pendingPayload = "CHAT," + String(NODE_ID) + "," + String(seqNo) + "," + chatMsg;
      backoffDelay = random(10, 150);
      currentState = STATE_BACKOFF;
      stateTimer = currentMillis;
    }
  }

  // Parse incoming ACKs, POLLs, and CHATs
  int size = LoRa.parsePacket();
  if (size > 0) {
    String msg = "";
    while (LoRa.available()) msg += (char)LoRa.read();
    
    if (msg == "POLL,0" && currentState == STATE_ROLLCALL) {
      backoffDelay = random(50, 2000);
      pendingPayload = "JOIN," + String(NODE_ID) + "," + String(seqNo + 1) + ",0.0,INIT";
      currentState = STATE_BACKOFF;
      stateTimer = currentMillis;
    } 
    else if (msg.startsWith("ACK,") && currentState == STATE_WAIT_ACK) {
      int c1 = msg.indexOf(',');
      int c2 = msg.indexOf(',', c1 + 1);
      if (c1 != -1 && c2 != -1) {
        int ackNode = msg.substring(c1 + 1, c2).toInt();
        long ackSeq = msg.substring(c2 + 1).toInt();
        if (ackNode == NODE_ID && ackSeq == seqNo) {
          currentState = STATE_NORMAL;
          retryCount = 0;
          Serial.println("<< ACK Received");
        }
      }
    }
    else if (msg.startsWith("CHAT,0,")) {
      int c1 = msg.indexOf(',');
      int c2 = msg.indexOf(',', c1 + 1);
      int c3 = msg.indexOf(',', c2 + 1);
      if (c3 != -1) {
        int targetNode = msg.substring(c2 + 1, c3).toInt();
        if (targetNode == 0 || targetNode == NODE_ID) {
          String chatText = msg.substring(c3 + 1);
          Serial.println("\n[CHAT FROM MASTER] -> " + chatText + "\n");
          triggerBlink();
        }
      }
    }
  }

  // Sensor sampling
  if (currentMillis - lastSensorSampleTime >= 150) {
    lastSensorSampleTime = currentMillis;
    float tempRaw = lightMeter.readLightLevel();
    if (tempRaw >= 0) {
      bh1750ErrorCount = 0; 
      float cal = (tempRaw * LUX_MULTIPLIER) + LUX_OFFSET;
      if (cal < 0) cal = 0; 
      if (cal < minLuxWindow) minLuxWindow = cal;
      if (cal > maxLuxWindow) maxLuxWindow = cal;
    } else {
      bh1750ErrorCount++;
      if (bh1750ErrorCount > 3) {
         Wire.end(); delay(10);
         Wire.begin(I2C_SDA, I2C_SCL);
         lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
         bh1750ErrorCount = 0; 
      }
    }
  }

  // State Machine
  switch(currentState) {
    case STATE_BOOT:
      stateTimer = currentMillis;
      currentState = STATE_ROLLCALL;
      break;

    case STATE_ROLLCALL:
      if (currentMillis - stateTimer > ROLLCALL_WINDOW_MS) {
        backoffDelay = random(50, 1000);
        pendingPayload = "JOIN," + String(NODE_ID) + "," + String(seqNo + 1) + ",0.0,INIT";
        currentState = STATE_BACKOFF;
        stateTimer = currentMillis;
      }
      break;

    case STATE_BACKOFF:
      if (currentMillis - stateTimer >= backoffDelay) {
        seqNo++; 
        if (pendingPayload.startsWith("CHAT,")) {
          seqNo--; 
        }

        LoRa.beginPacket();
        LoRa.print(pendingPayload);
        LoRa.endPacket();
        LoRa.receive();
        triggerBlink();
        Serial.println("TX -> " + pendingPayload);
        
        lastTxTime = currentMillis;
        currentState = STATE_WAIT_ACK;
        stateTimer = currentMillis;
      }
      break;

    case STATE_WAIT_ACK:
      if (currentMillis - stateTimer >= ACK_TIMEOUT_MS) {
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          backoffDelay = random(100, 800);
          currentState = STATE_BACKOFF;
          stateTimer = currentMillis;
          Serial.printf("Retry %d\n", retryCount);
        } else {
          Serial.println("Max retries reached. Dropping packet.");
          retryCount = 0;
          currentState = STATE_NORMAL;
        }
      }
      break;

    case STATE_NORMAL:
      if (currentMillis - lastEvalTime >= EVAL_INTERVAL_MS) {
        lastEvalTime = currentMillis; 
        
        float rawLux = lightMeter.readLightLevel();
        String statusStr = "NORMAL";
        float calibratedLux = (rawLux * LUX_MULTIPLIER) + LUX_OFFSET;
        if (calibratedLux < 0) calibratedLux = 0;
        
        if (rawLux < 0) {
          statusStr = "SENSOR_ERROR";
        } else {
          if (maxLuxWindow - minLuxWindow > 25.0) statusStr = "BLINKING/UNSTABLE";
          else if (calibratedLux <= 1.0) statusStr = "TOTAL_BLACKOUT";
          else if (calibratedLux <= 25.0) statusStr = "LOW_LIGHT";
        }

        bool luxChanged = (abs(calibratedLux - lastSentLux) >= LUX_CHANGE_THRESHOLD);
        bool statusChanged = (statusStr != String(lastSentStatus));
        bool heartbeatDue = (currentMillis - lastTxTime >= HEARTBEAT_INTERVAL_MS);

        if (luxChanged || statusChanged || heartbeatDue) {
          String prefix = (luxChanged || statusChanged) ? "ALRT" : "BEAT";
          pendingPayload = prefix + "," + String(NODE_ID) + "," + String(seqNo + 1) + "," + String(calibratedLux, 1) + "," + statusStr;
          
          lastSentLux = calibratedLux;
          strncpy(lastSentStatus, statusStr.c_str(), sizeof(lastSentStatus) - 1);
          
          backoffDelay = (prefix == "ALRT") ? random(10, 150) : random(50, 1500); 
          currentState = STATE_BACKOFF;
          stateTimer = currentMillis;
        }
        minLuxWindow = 100000.0;
        maxLuxWindow = 0.0;
      }
      break;
  }
}

// ================= DASHBOARD BRIDGE (MASTER ONLY) =================
// Idea: the master keeps doing exactly what it did (receive, ACK, print).
// After a packet is ACKed, a copy is put in a small queue and sent to the
// dashboard server over Wi-Fi when the loop is free.
#if ENABLE_WIFI_BRIDGE
struct BridgeItem {
  char type[5];
  int nodeId;
  long seq;
  float lux;
  char status[24];
  int rssi;
};
BridgeItem bridgeQueue[BRIDGE_QUEUE_SIZE];
int bridgeHead = 0;   // next item to send
int bridgeCount = 0;  // items waiting
unsigned long lastWifiAttempt = 0;

void bridgeSetup() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.println("Bridge: connecting to Wi-Fi...");
}

void bridgeEnqueue(const String &type, int nodeId, long seq, float lux, const String &status, int rssi) {
  if (bridgeCount == BRIDGE_QUEUE_SIZE) {            // full: drop the oldest packet
    bridgeHead = (bridgeHead + 1) % BRIDGE_QUEUE_SIZE;
    bridgeCount--;
    Serial.println("Bridge: queue full, oldest packet dropped");
  }
  BridgeItem &it = bridgeQueue[(bridgeHead + bridgeCount) % BRIDGE_QUEUE_SIZE];
  type.toCharArray(it.type, sizeof(it.type));
  status.toCharArray(it.status, sizeof(it.status));
  it.nodeId = nodeId;
  it.seq = seq;
  it.lux = lux;
  it.rssi = rssi;
  bridgeCount++;
}

// Called every loop(). Sends at most ONE packet per call so LoRa listening is never blocked for long.
void bridgeLoop() {
  unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWifiAttempt > 10000) {             // retry every 10 s, never blocks
      lastWifiAttempt = now;
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASS);
    }
    return;
  }
  if (bridgeCount == 0) return;

  BridgeItem &it = bridgeQueue[bridgeHead];
  char body[160];
  snprintf(body, sizeof(body),
           "{\"type\":\"%s\",\"nodeId\":%d,\"seq\":%ld,\"lux\":%.1f,\"status\":\"%s\",\"rssi\":%d}",
           it.type, it.nodeId, it.seq, it.lux, it.status, it.rssi);

  HTTPClient http;
  http.setTimeout(BRIDGE_HTTP_TIMEOUT_MS);
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Api-Key", DEVICE_KEY);
  int code = http.POST((uint8_t *)body, strlen(body));
  http.end();

  if (code == 200) {                                  // delivered: remove from queue
    bridgeHead = (bridgeHead + 1) % BRIDGE_QUEUE_SIZE;
    bridgeCount--;
    Serial.printf("Bridge: sent node %d seq %ld (HTTP 200)\n", it.nodeId, it.seq);
  } else if (code >= 400 && code < 500) {             // server refused it (bad key / bad data): do not retry forever
    bridgeHead = (bridgeHead + 1) % BRIDGE_QUEUE_SIZE;
    bridgeCount--;
    Serial.printf("Bridge: server rejected packet (HTTP %d), dropped\n", code);
  } else {
    Serial.printf("Bridge: send failed (%d), will retry\n", code); // keep it queued
    lastWifiAttempt = now;                            // small pause so we don't hammer a dead server
  }
}
#endif

// ================= RECEIVER LOGIC =================
void runReceiver() {
  unsigned long currentMillis = millis();
  processBlink(currentMillis);

  // --- MANUAL CHAT INPUT (MASTER -> NODES) ---
  if (Serial.available()) {
    String chatMsg = Serial.readStringUntil('\n');
    chatMsg.trim();
    if (chatMsg.length() > 0) {
      LoRa.beginPacket();
      LoRa.print("CHAT,0,0," + chatMsg);
      LoRa.endPacket();
      LoRa.receive(); 
      triggerBlink();
      Serial.println("TX BROADCAST -> " + chatMsg);

      // Display Master's outgoing chat on the LCD
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Master (Me):");
      lcd.setCursor(0, 1);
      lcd.print(chatMsg.substring(0, 16)); // Truncate to prevent weird wrapping
    }
  }

  if (currentMillis - masterBootTime < 15000) {
    static unsigned long lastPoll = 0;
    if (currentMillis - lastPoll > 3000) {
      LoRa.beginPacket();
      LoRa.print("POLL,0");
      LoRa.endPacket();
      LoRa.receive();
      lastPoll = currentMillis;
      Serial.println("Broadcasting Roll Call (POLL,0)");
    }
  }

  int size = LoRa.parsePacket();
  if (size > 0) {
    String msg = "";
    while (LoRa.available()) msg += (char)LoRa.read();
    if (msg.startsWith("ACK,") || msg.startsWith("POLL,")) return; 

    int rssi = LoRa.packetRssi();
    triggerBlink();

    // Parse incoming Node Chat
    if (msg.startsWith("CHAT,")) {
      int c1 = msg.indexOf(',');
      int c2 = msg.indexOf(',', c1 + 1);
      int c3 = msg.indexOf(',', c2 + 1);
      if (c1 != -1 && c2 != -1 && c3 != -1) {
        int nId = msg.substring(c1 + 1, c2).toInt();
        long seq = msg.substring(c2 + 1, c3).toInt();
        String chatText = msg.substring(c3 + 1);

        // ACK the node's chat message
        LoRa.beginPacket();
        LoRa.print("ACK," + String(nId) + "," + String(seq));
        LoRa.endPacket();
        LoRa.receive();

        Serial.printf("\n[CHAT FROM NODE %d] -> %s (RSSI: %d)\n\n", nId, chatText.c_str(), rssi);

        // Display Incoming Node Chat on the LCD
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Node " + String(nId) + ":");
        lcd.setCursor(0, 1);
        lcd.print(chatText.substring(0, 16)); // Truncate to prevent weird wrapping
      }
      return;
    }

    // Parse JOIN, ALRT, BEAT
    int c1 = msg.indexOf(',');
    int c2 = msg.indexOf(',', c1 + 1);
    int c3 = msg.indexOf(',', c2 + 1);
    int c4 = msg.indexOf(',', c3 + 1); 

    if (c1 != -1 && c2 != -1 && c3 != -1 && c4 != -1) {
      String type = msg.substring(0, c1);
      int nId = msg.substring(c1 + 1, c2).toInt();
      long seq = msg.substring(c2 + 1, c3).toInt();
      float lux = msg.substring(c3 + 1, c4).toFloat();
      String statusStr = msg.substring(c4 + 1);

      if (nId > 0 && nId < MAX_NODES) {
        LoRa.beginPacket();
        LoRa.print("ACK," + String(nId) + "," + String(seq));
        LoRa.endPacket();
        LoRa.receive(); 

        nodes[nId].isActive = true;
        nodes[nId].isConnected = true;
        nodes[nId].lastReceiveTime = currentMillis;
        
        if (nodes[nId].lastSeqSeen >= 0 && seq > nodes[nId].lastSeqSeen + 1) {
          nodes[nId].missedCount += (seq - nodes[nId].lastSeqSeen - 1);
        }
        nodes[nId].lastSeqSeen = seq;
        nodes[nId].rxCount++;

        Serial.printf("[%s] Node: %d | Seq: %ld | Lux: %.1f | Stat: %s | RSSI: %d | Missed: %lu\n", 
                      type.c_str(), nId, seq, lux, statusStr.c_str(), rssi, nodes[nId].missedCount);
#if ENABLE_WIFI_BRIDGE
        bridgeEnqueue(type, nId, seq, lux, statusStr, rssi);   // copy for the dashboard
#endif
      }
    }
  }

  // Health Verification
  static unsigned long lastHealthCheck = 0;
  if (currentMillis - lastHealthCheck > 5000) {
    for (int i = 1; i < MAX_NODES; i++) {
      if (nodes[i].isActive && nodes[i].isConnected) {
        if (currentMillis - nodes[i].lastReceiveTime > DISCONNECT_TIMEOUT_MS) {
          nodes[i].isConnected = false;
          Serial.printf("\n*** ALERT: NODE %d OFFLINE (Timeout) ***\n", i);
        }
      }
    }
    lastHealthCheck = currentMillis;
  }

#if ENABLE_WIFI_BRIDGE
  bridgeLoop();   // forward queued packets to the dashboard server
#endif
}