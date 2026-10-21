#include <SPI.h>
#include <LoRa.h>
#include <math.h>

// ===== CHANGE PER BOARD =====
#define IS_INITIATOR false  // true = Node A (starts pings), false = Node B (replies)

// ===== Pins (ESP32 -> SX1278) =====
#define LORA_SCK  18
#define LORA_MISO 19
#define LORA_MOSI 23
#define LORA_SS   5
#define LORA_RST  14
#define LORA_DIO0 26

// ===== STATUS LED PIN =====
#define LED_PIN 2 // Connect your LED here (with a resistor)

// ===== Radio settings =====
#define LORA_FREQ  433E6
#define LORA_SF    10     // SF 10 for much better range and penetration
#define LORA_BW    125E3
#define LORA_CR    5      
#define LORA_TXPWR 17     

#define REPLY_TIMEOUT_MS 4000 // Increased timeout to handle the slower SF 10 speed
#define PING_INTERVAL_MS 2000

// ===== Distance Estimation Settings =====
#define RSSI_AT_1M -65.0      
#define PATH_LOSS_EXPONENT 2.5 

// ===== Connection Status Settings =====
#define DISCONNECT_TIMEOUT_MS 6000 // 6 seconds without receiving = disconnected
bool isConnected = false;
unsigned long lastReceiveTime = 0;

unsigned long seqNo = 0, sentCount = 0, okCount = 0;

void setup() {
  Serial.begin(115200);
  delay(500);

  // Initialize the LED
  pinMode(LED_PIN, OUTPUT);
  analogWrite(LED_PIN, 0); // Start with the LED completely OFF

  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("LoRa init FAILED - check wiring, 3.3V, antenna");
    while (true) delay(1000);
  }
  LoRa.setSpreadingFactor(LORA_SF);
  LoRa.setSignalBandwidth(LORA_BW);
  LoRa.setCodingRate4(LORA_CR);
  LoRa.setTxPower(LORA_TXPWR);
  LoRa.enableCrc();

  if (IS_INITIATOR) {
    Serial.println("NODE A (initiator) ready");
  } else {
    Serial.println("NODE B (responder) ready");
  }
  Serial.println("Waiting for connection...");
  Serial.println("--------------------------------------------------");
}

void checkConnectionTimeout() {
  if (isConnected && (millis() - lastReceiveTime > DISCONNECT_TIMEOUT_MS)) {
    isConnected = false;
    analogWrite(LED_PIN, 0); // Turn OFF LED when signal is lost
    Serial.println("\n*** STATUS: DISCONNECTED ***\n");
  }
}

void markConnected() {
  lastReceiveTime = millis();
  if (!isConnected) {
    isConnected = true;
    analogWrite(LED_PIN, 15); // Turn ON LED dimly (Scale is 0 to 255. Try 15 for low light)
    Serial.println("\n*** STATUS: CONNECTED ***\n");
  }
}

void loop() {
  if (IS_INITIATOR) runInitiator();
  else runResponder();

  checkConnectionTimeout(); 
}

void sendText(const String &s) {
  LoRa.beginPacket();
  LoRa.print(s);
  LoRa.endPacket();            
}

bool readText(String &out) {
  int size = LoRa.parsePacket();
  if (size == 0) return false;
  out = "";
  while (LoRa.available()) out += (char)LoRa.read();
  return true;
}

float calculateDistance(int rssi) {
  return pow(10.0, ((RSSI_AT_1M - rssi) / (10.0 * PATH_LOSS_EXPONENT)));
}

String formatDistance(float meters) {
  if (meters < 0.01) {
    return String(meters * 1000.0, 1) + " mm";
  } else if (meters < 1.0) {
    return String(meters * 100.0, 1) + " cm";
  } else {
    return String(meters, 2) + " meters";
  }
}

void runInitiator() {
  seqNo++;
  sentCount++;
  unsigned long t0 = millis();
  sendText("PING," + String(seqNo));

  bool got = false;
  while (millis() - t0 < REPLY_TIMEOUT_MS) {
    String msg;
    if (readText(msg) && msg.startsWith("PONG," + String(seqNo) + ",")) {
      markConnected(); 

      unsigned long rtt = millis() - t0;
      int rssiHere = LoRa.packetRssi();
      float snrHere = LoRa.packetSnr();

      int c1 = msg.indexOf(',');
      int c2 = msg.indexOf(',', c1 + 1);
      int c3 = msg.indexOf(',', c2 + 1);
      int rssiThere = msg.substring(c2 + 1, c3).toInt();
      float snrThere = msg.substring(c3 + 1).toFloat();

      float estimatedDistance = calculateDistance(rssiHere);
      String distStr = formatDistance(estimatedDistance);

      Serial.printf("[Seq: %lu] Status: OK | RSSI (Here): %d dBm | SNR (Here): %.1f | RSSI (There): %d dBm | SNR (There): %.1f | RTT: %lu ms | Distance: %s\n",
                    seqNo, rssiHere, snrHere, rssiThere, snrThere, rtt, distStr.c_str());
      
      okCount++;
      got = true;
      break;
    }
  }
  
  if (!got) {
    Serial.printf("[Seq: %lu] Status: LOST (Timeout)\n", seqNo);
  }

  if (sentCount % 10 == 0) {
    Serial.printf(">>> SUMMARY: Sent = %lu | OK = %lu | Loss = %.0f%%\n",
                  sentCount, okCount, 100.0 * (sentCount - okCount) / sentCount);
  }

  unsigned long used = millis() - t0;
  if (used < PING_INTERVAL_MS) delay(PING_INTERVAL_MS - used);
}

void runResponder() {
  String msg;
  if (readText(msg) && msg.startsWith("PING,")) {
    markConnected(); 

    int rssi = LoRa.packetRssi();
    float snr = LoRa.packetSnr();
    String seq = msg.substring(5);
    delay(20);   
    sendText("PONG," + seq + "," + String(rssi) + "," + String(snr, 1));
    
    float estimatedDistance = calculateDistance(rssi);
    String distStr = formatDistance(estimatedDistance);
    
    Serial.println("[Seq: " + seq + "] PING heard | RSSI: " + String(rssi) + " dBm | SNR: " + String(snr, 1) + " | Distance: " + distStr);
  }
}