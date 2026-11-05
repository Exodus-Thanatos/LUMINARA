#pragma once
#include "Arduino.h"
#include <fstream>
#include <sstream>
struct HTTPClient {
  std::string url, key, body, ctype; int ct = 0, to = 0;
  void setConnectTimeout(int v) { ct = v; } void setTimeout(int v) { to = v; }
  bool begin(const String& u) { url = u.s; return true; }
  void addHeader(const char* n, const char* v) { if (std::string(n) == "X-Api-Key") key = v; if (std::string(n) == "Content-Type") ctype = v; }
  int GET() {
    std::string cmd = "curl -s -m 3 -o /tmp/relay_body_" + std::to_string(getpid()) + " -w '%{http_code}' -H 'X-Api-Key: " + key + "' '" + url + "' 2>/dev/null";
    FILE* p = popen(cmd.c_str(), "r"); char buf[16] = {0}; if (p) { fgets(buf, sizeof buf, p); pclose(p); }
    std::ifstream f("/tmp/relay_body_" + std::to_string(getpid())); std::stringstream ss; ss << f.rdbuf(); body = ss.str();
    int code = atoi(buf); return code ? code : -1;
  }
  int POST(const String& payload) {
    std::string pid = std::to_string(getpid());
    { std::ofstream f("/tmp/relay_post_" + pid); f << payload.s; }
    std::string cmd = "curl -s -m 3 -o /tmp/relay_body_" + pid + " -w '%{http_code}' -X POST -H 'X-Api-Key: " + key + "' -H 'Content-Type: " + ctype + "' --data-binary @/tmp/relay_post_" + pid + " '" + url + "' 2>/dev/null";
    FILE* p = popen(cmd.c_str(), "r"); char buf[16] = {0}; if (p) { fgets(buf, sizeof buf, p); pclose(p); }
    int code = atoi(buf); return code ? code : -1;
  }
  String getString() { return String(body); }
  void end() {}
  static String errorToString(int) { return String("error"); }
};
