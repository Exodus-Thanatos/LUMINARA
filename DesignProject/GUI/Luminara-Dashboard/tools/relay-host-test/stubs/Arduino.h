// Host-side stand-ins for the few Arduino/ESP32 calls the relay sketch uses. Real HTTP (via curl) to the real server.
#pragma once
#include <string>
#include <cstdio>
#include <cstdlib>
#include <cstdarg>
#include <cstdint>
#include <chrono>
#include <thread>
#include <time.h>
#include <mutex>
#include <deque>
#include <fstream>
#include <sstream>
#include <cstring>
struct String {
  std::string s; String() {} String(const char* c) : s(c) {} String(const std::string& x) : s(x) {}
  int indexOf(const char* p) const { auto i = s.find(p); return i == std::string::npos ? -1 : (int)i; }
  String operator+(const char* o) const { return String(s + o); }
  String operator+(const String& o) const { return String(s + o.s); }
  const char* c_str() const { return s.c_str(); }
  void replace(const char* a, const char* b) { auto i = s.find(a); if (i != std::string::npos) s.replace(i, strlen(a), b); }
};
#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define WL_CONNECTED 3
#define WIFI_STA 1
inline uint32_t millis() { using namespace std::chrono; static auto t0 = steady_clock::now(); return (uint32_t)duration_cast<milliseconds>(steady_clock::now() - t0).count(); }
inline void delay(uint32_t ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }
inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
struct SerialT { void begin(int) {} void println(const char* s) { std::printf("%s\n", s); std::fflush(stdout); }
  template <typename... A> void printf(const char* f, A... a) { std::printf(f, a...); std::fflush(stdout); } }; inline SerialT Serial;
struct IP { String toString() { return String("127.0.0.1"); } };
struct WiFiT { void mode(int) {} void setAutoReconnect(bool) {} void begin(const char*, const char*) {} int status() { return WL_CONNECTED; } IP localIP() { return IP(); } }; inline WiFiT WiFi;
inline void configTzTime(const char* tz, const char*, const char*) { setenv("TZ", tz, 1); tzset(); }
inline bool getLocalTime(struct tm* t, uint32_t) { time_t n = time(nullptr); localtime_r(&n, t); return true; }

// ---- FreeRTOS shims (1 tick = 1 ms) ----
typedef std::mutex* SemaphoreHandle_t;
inline SemaphoreHandle_t xSemaphoreCreateMutex() { return new std::mutex(); }
inline int xSemaphoreTake(SemaphoreHandle_t m, uint32_t) { m->lock(); return 1; }
inline int xSemaphoreGive(SemaphoreHandle_t m) { m->unlock(); return 1; }
#define portMAX_DELAY 0xFFFFFFFF
#define pdMS_TO_TICKS(x) (x)
inline void vTaskDelay(uint32_t ms) { delay(ms); }
typedef void (*TaskFunction_t)(void*);
inline int xTaskCreatePinnedToCore(TaskFunction_t f, const char*, int, void* a, int, void*, int) { std::thread(f, a).detach(); return 1; }
#define SERIAL_8N1 0
// ---- Serial2 = simulated PZEM. Whatever the sketch writes is logged (hex) to $PZEM_SIM_DIR/request.log; the bytes in
// $PZEM_SIM_DIR/reply.hex (written by the test, CRC from an independent implementation) are returned. Empty file = silent meter.
struct HardwareSerialT {
  std::deque<uint8_t> rx;
  void begin(long, int, int, int) {}
  int available() { return (int)rx.size(); }
  int read() { if (rx.empty()) return -1; uint8_t b = rx.front(); rx.pop_front(); return b; }
  size_t write(const uint8_t* b, size_t n) {
    const char* dir = getenv("PZEM_SIM_DIR"); if (!dir) return n;
    std::string d(dir);
    { std::ofstream l(d + "/request.log", std::ios::app); char h[4]; for (size_t i = 0; i < n; i++) { snprintf(h, sizeof h, "%02X", b[i]); l << h; } l << "\n"; }
    std::ifstream f(d + "/reply.hex"); std::stringstream ss; ss << f.rdbuf(); std::string hex = ss.str(), t;
    for (char c : hex) if (isxdigit((unsigned char)c)) t += c;
    for (size_t i = 0; i + 1 < t.size(); i += 2) rx.push_back((uint8_t)strtol(t.substr(i, 2).c_str(), nullptr, 16));
    return n;
  }
};
inline HardwareSerialT Serial2;
