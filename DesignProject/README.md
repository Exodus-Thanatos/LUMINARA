# 1. Project Title

**LUMINARA: Smart Streetlight Management System with Centralized Switching and Per-Lamp Fault Detection for Barangay 6, Carmona, Cavite**

BS Computer Engineering thesis, Cavite State University (CvSU) - Carmona Campus, Department of Industrial and Information Technology.

---

# 2. Project Overview

Barangay 6, Carmona, Cavite has no streetlight census and no digital logs. Lamps are switched by hand from one manual breaker (ON around 6:00 PM, OFF around 5:30 AM), and a dead or dim lamp is only fixed after a citizen reports it through the city's app. The barangay therefore cannot tell which lamps are out, since when, or whether the feed itself has lost power.

LUMINARA reduces this manual, citizen-reliant reporting. Each lamp gets a small battery-powered **lamp node** with a light sensor aimed at the bulb. The nodes report to a **panel controller** over plain point-to-point LoRa. The panel controller sits at the existing breaker, switches the whole streetlight feed through a contactor, and measures the feed's current. A **web dashboard** records lamp and feed status, keeps a fault history, and lets authorized users send ON/OFF commands.

The system is built from common, low-cost IoT parts. The trade-off is accuracy and data detail, which the thesis states as a limitation.

---

# 3. Objectives

**General objective:** To design, develop, and test a streetlight management system that provides per-lamp state detection, centralized switching, and a logging dashboard for Barangay 6, Carmona, Cavite.

**Specific objectives:**

1. Design:
   - a. a lamp node that will detect whether its lamp is lit;
   - b. a panel controller that will switch the streetlight feed ON and OFF;
   - c. a panel controller that will measure the streetlight feed's current;
   - d. a web dashboard that will record lamp and feed status and send switching commands.
2. Develop the firmware of the lamp nodes and the panel controller, and the software of the web dashboard.
3. Test the accuracy and reliability of the lamp nodes, the panel controller, and the web dashboard.

---

# 4. Features

| Feature | Status |
|---|---|
| Per-lamp light sensing at each lamp node (BH1750) | Testing Phase |
| Point-to-point LoRa link, lamp nodes to panel controller (SX1278, 433 MHz, star topology) | Two-board link tested; multi-node polling in progress |
| Polling of lamp nodes by the panel controller | In progress |
| Remote ON/OFF of the feed through a contactor (relay module as demo stand-in) | In progress |
| Schedule-based switching on the panel controller (NTP time), with browser override | Planned |
| Feed current/voltage monitoring (PZEM-004T with split-core CT) | Planned |
| Fault reporting: one lamp out, feed/mains loss, low node battery, node offline | Planned |
| Dashboard (GUI): Overview, Lamp Status, Fault History, Switching Control, role-based login | In progress |
| Dashboard record-keeping of lamp states, faults, and switching commands | In progress |

**GUI functionality:** the dashboard shows each lamp's state, logs events, and lets the Engineering Department send ON/OFF commands and edit the schedule. Barangay officials get read-only access.

---

# 5. Technologies Used

**Hardware**
- ESP32 (WROOM) for lamp nodes and the panel controller
- SX1278 LoRa module (433 MHz)
- BH1750 digital light sensor
- PZEM-004T v3 (100 A) with split-core CT
- Contactor (Chint NCH8-25/20) driven by a 5 V opto relay module
- 18650 Li-ion cells (swap-in battery for lamp nodes) (Might be replaced with solar power post-proposal defense)

**Firmware / Software**
- Arduino (C++) via Arduino IDE
- Arduino libraries: [libraries include LINES, e.g. LoRa, BH1750, WiFi, etc.]
- Dashboard: [HTML, CSS, JavaScript, Node.js, React]
- Initial dashboard code was generated through wireframe only for now.

**Tools:** GitHub, Canva/AutoCAD (diagrams), Microsoft Word, Docs (manuscript)

---

# 6. Installation and Setup

**Requirements**
- Arduino IDE with the ESP32 board package
- The Arduino libraries listed in Section 5
- Hardware per the schematic in `documentation/diagrams/`

**Firmware**
1. Clone or download this repository.
2. Open [TBA] or [TBA] (panel controller) in Arduino IDE.
3. Select the ESP32 board and the correct COM port.
4. Set the node ID (lamp node) and the LoRa settings (433 MHz, SF10, BW 125 kHz, CR 4/5) so they match on both sides.
5. Wi-Fi and server credentials are **not** stored in this repository. Copy [TBA] to [TBA] and fill in your own values. [If final code has secrets; nonfinished for now so leave it here as is]
6. Upload.

**Dashboard**
1. Go to `GUI/source_code_files/`.
2. [INSTALL STEP, e.g. `npm install`]
3. [START STEP, e.g. `npm start`]

---

# 7. How to Run or Use the Project

Current implementation (bench prototype):
1. Power the panel controller and the lamp node(s).
2. Start the dashboard (Section 6).
3. The panel controller polls each lamp node over LoRa; each node replies with its light reading.
4. The dashboard shows each lamp's state and logs it.
5. Use the Switching Control page to send ON/OFF to the relay (contactor stand-in).

[ADJUST THESE STEPS TO WHAT ACTUALLY WORKS AT SUBMISSION TIME]

---

# 8. Project Members

| Member | Role / Responsibility | Completed/Ongoing work |
|---|---|---|
| Kian Rom R. Coronel | [Paper, Materials, Financing] | [Materials Purchasing, Manuscript Submission (Routing)] |
| Rophil Gonzaga | [3D Modeling, Software Code] | [GUI Wireframe Sample, 3D Modeling Sample, Code] |
| Charles Ehrric Padilla | [Hardware Prototyping] | [Soldering, Testing] |
| Vince Luther Sabido | [Paper, Software-Hardware Integration] | [Manuscript, Code, Client Interview] |

Thesis adviser: John Benneth C. Abuan
Technical Critique: Moneth Bersamin-Matala

---

# 9. Current Status and Future Improvements

**Implemented**
- Two-board LoRa link between ESP32 + SX1278 modules (about 480 m farthest tested)
- BH1750 readings (non-calibrated)

**In progress**
- Per-lamp sensing and multi-node LoRa polling
- Dashboard pages and logging finalization
- LoRa Polling
- Circuit Breaker setup

**Planned**
- Install the contactor and panel controller at the Barangay 6 breaker
- Feed current/voltage monitoring with the PZEM-004T
- Schedule-based switching with NTP time and browser override
- Fault classification (lamp out, feed loss, low battery, node offline)
- Field deployment on the straight-road lamps, with a thesis demo of 3 lamp nodes
- Wiring and enclosure work, with the permission of the Brgy and Engr. Dept.

---

# 10. Thesis and Documentation

| Item | Location |
|---|---|
| Thesis manuscript (Chapters 1-3, latest available version) | `documentation/thesis/2nd-Reading-02.pdf` |
| Diagrams (general schematic, process flow, functional block diagram, dashboard wireframes) | `documentation/diagrams/` |
| References | `documentation/references/` |
| Firmware | `firmware/` |
| Dashboard (GUI) source | `GUI/source_code_files/` |
| Other supporting files | `supporting_files/` |