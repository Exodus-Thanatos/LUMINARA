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
struct String {
  std::string s; String() {} String(const char* c) : s(c) {} String(const std::string& x) : s(x) {}
  int indexOf(const char* p) const { auto i = s.find(p); return i == std::string::npos ? -1 : (int)i; }
  String operator+(const char* o) const { return String(s + o); }
  String operator+(const String& o) const { return String(s + o.s); }
  const char* c_str() const { return s.c_str(); }
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
