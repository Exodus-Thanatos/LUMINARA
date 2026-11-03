# Relay sketch host test

Compiles the REAL relay sketch on a PC (tiny Arduino stand-ins in `stubs/`, real HTTP via curl) and times how long the server
takes to record the relay's confirmation after a dashboard command. Used to compare the original sketch with the Phase 2 one.

    sed -e 's#http://192.168.100.2:3001/api/command#http://127.0.0.1:3001/api/command#' \
        -e 's#DEVICE_KEY  = "[^"]*"#DEVICE_KEY  = "test-key"#' -e 's#SCHEDULE_ENABLED = true#SCHEDULE_ENABLED = false#' \
        <sketch>.ino > host.cpp
    g++ -std=c++17 -Istubs -include stubs/Arduino.h -include unistd.h host.cpp stubs/main.cpp -o relay_x -lpthread
    python3 measure_relay.py      # expects ./relay_original and ./relay_phase2; starts server/server.js itself (DEVICE_KEY=test-key)

It checks the sketch logic and timing only. It does not test the ESP32 radio, relay hardware or real Wi-Fi.
