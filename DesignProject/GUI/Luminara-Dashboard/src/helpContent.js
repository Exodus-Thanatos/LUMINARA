// Help Center / User Manual content. Plain data, no React. Every statement describes what LUMINARA does today.
// Block types: p (paragraph) | steps (numbered procedure) | terms (term / meaning pairs) | note | warn

import { STATUS_MODEL, STATUS_IDS, FAULT_CATALOG, DETECTION_LABEL } from './streetlightStatus.js';
import { PRIORITY_INFO, PRIORITY_ORDER } from './maintenancePriority.js';

export const HELP_SECTIONS = [
  {
    id: 'overview',
    title: 'System Overview',
    icon: 'Info',
    summary: 'What LUMINARA is, what it is for and what it can do.',
    blocks: [
      { t: 'p', text: 'LUMINARA is a streetlight monitoring dashboard. Small nodes on the lamp poles measure the light level and send it by LoRa radio to a receiver. The receiver passes the data to this website, which shows which lamps are working, which need attention and which have gone silent.' },
      { t: 'terms', title: 'Major features', items: [
        ['Dashboard', 'The main control center: totals, the always-visible electrical readings, the interactive streetlight map, the Needs Attention list and system activity.'],
        ['Streetlights', 'A searchable list of every lamp with its status and latest readings.'],
        ['Interactive streetlight map', 'Part of the Dashboard (there is no separate Map page). Lamp positions with status markers, hover previews, details, search, filters, CSV export and import.'],
        ['Electrical monitoring (PZEM)', 'Voltage, current, power, energy, frequency and power factor of a separate electrical feed, with a history chart. Always visible on the Dashboard.'],
        ['Controls', 'Manual ON/OFF switching of the relay feed, with honest confirmation messages.'],
        ['Maintenance', 'Create, assign, update and resolve fault and repair tickets, with a P1 to P4 priority. Tickets are saved in the shared database; resolved tickets can be removed (archived).'],
        ['Settings', 'Profile and system preferences. Each item is tagged WORKING or UI ONLY.'],
      ] },
      { t: 'note', text: 'The badge in the bottom-right corner tells you what kind of data you are looking at: LIVE DATA (from the receiver), LIVE + TEST DATA, or DEMO DATA (the receiver is not connected, so sample content is shown).' },
    ],
  },
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: 'Compass',
    summary: 'Find your way around and learn the basic operations.',
    blocks: [
      { t: 'steps', title: 'Basic navigation', items: [
        'Use the dark sidebar on the left to move between pages. The page you are on is highlighted with a green bar.',
        'On a phone or small window, tap the menu button (three lines) at the top left to open the sidebar.',
        'The bell in the top-right corner opens the Notification Center. The question-mark icon opens help for the page you are on.',
        'Open Help Center from the sidebar at any time to search the manual or restart the guided tutorial.',
      ] },
      { t: 'steps', title: 'A first look at the system', items: [
        'Open the Dashboard and check the four summary cards: Total Streetlights, Online, Offline and Fault Alerts.',
        'Look at the data badge (bottom-right) to confirm you are seeing live data.',
        'If a streetlight is listed under Needs Attention, select Locate on map to see it, or Details to read what the fault means and what to check.',
      ] },
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard Guide',
    icon: 'LayoutGrid',
    summary: 'What each card, alert and indicator on the Dashboard means, and how to use the map.',
    blocks: [
      { t: 'terms', title: 'Summary cards', items: [
        ['Total Streetlights', 'Every location in the streetlight list. The note under it says how many have a device installed and how many have none.'],
        ['Online', 'Installed streetlights that are communicating with the system, whatever their lamp condition is. A communicating lamp can still have a fault.'],
        ['Offline', 'Installed streetlights that have not reported recently, so their lamp condition is unknown. It does not mean the lamp has failed.'],
        ['Fault Alerts', 'Streetlights with a confirmed fault, for example a lamp failure. Warnings are counted separately in the note.'],
      ] },
      { t: 'p', text: 'All of these numbers come from the same streetlight list that the map uses, so the cards, the map and the Streetlights page always agree.' },
      { t: 'terms', title: 'Dashboard areas, top to bottom', items: [
        ['Electrical monitoring', 'The PZEM readings. They are always visible: there is nothing to open. See the PZEM Monitoring Guide.'],
        ['Interactive streetlight map', 'Where each streetlight is and what condition it is in. See “Use the map” below.'],
        ['Needs Attention', 'Streetlights that are not healthy, most serious first, with the fault type, a suggested maintenance priority and the time of the last report. Locate on map selects the lamp on the map; Details opens its fault information.'],
        ['System Activity', 'When the data was last refreshed and whether the receiver is connected.'],
      ] },
      { t: 'steps', title: 'Use the map', items: [
        'Locate a streetlight: type its ID or street in the search box, or choose a status or street. Show all clears the filters and Reset view returns to the full map.',
        'Hover over a marker (on a phone, tap it) to see a short preview: ID, location, communication, lamp condition, light level, last report and any fault.',
        'Click or tap a marker to select it. The marker is outlined and its details open beside the map, including the fault information if there is one.',
        'Read the marker: each status has its own shape and symbol, not only a colour (see the Streetlight Status Legend).',
        'Use the actions in the details panel: View fault details, Open Maintenance and Go to Lighting Controls. You only see the actions your account is allowed to use.',
      ] },
      { t: 'note', text: 'The map has no ON/OFF button for a single streetlight. One relay controls the whole lighting feed, so switching is done from Lighting Controls and affects every lamp.' },
      { t: 'note', text: 'Data freshness: “Last updated” shows how long ago the dashboard last heard from the receiver. If it keeps growing, the connection is likely down.' },
    ],
  },
  {
    id: 'monitoring',
    title: 'Streetlight Monitoring Guide',
    icon: 'Crosshair',
    summary: 'View registered lamps, inspect them and spot problem lamps.',
    blocks: [
      { t: 'steps', title: 'View and find streetlights', items: [
        'Open Streetlights in the sidebar.',
        'Type a lamp ID or street name in the search box.',
        'Use the status and street drop-downs to narrow the list. Select Clear filters to start again.',
        'Use the page arrows under the table to move through long lists.',
      ] },
      { t: 'terms', title: 'Understanding device status', items: [
        ['Online – Healthy', 'The node is reporting and the lamp condition it reported is normal (lit at night, daylight standby, sleeping or outside its shift).'],
        ['Online – (fault type)', 'The node is reporting, but it reported a fault such as Lamp Failure or Unstable Light. Hover over the badge for what it means; open Details for the full fault information.'],
        ['Warning – (type)', 'An abnormal condition that needs attention but is not a confirmed failure, such as Low Light Output or Sensor Malfunction.'],
        ['Offline – Communication Lost', 'No recent signal from the node. Its lamp condition is not guessed: the lamp may be fine.'],
        ['No Data – Telemetry Unavailable', 'The device is registered but nothing usable has been received.'],
        ['UNINSTALLED / No Device', 'A planned location with no node installed.'],
      ] },
      { t: 'p', text: 'The full definitions are in the Streetlight Status Legend, and every fault type is explained in the Fault Classification Guide.' },
      { t: 'p', text: 'To identify problem lamps, filter by FAULT, WARNING and OFFLINE, or open the Dashboard and read Needs Attention, which lists them most serious first.' },
    ],
  },
  {
    id: 'status-legend',
    title: 'Streetlight Status Legend',
    icon: 'Info',
    summary: 'The official status words used on every page, and what each one means.',
    blocks: [
      { t: 'p', text: 'Two different questions are kept apart. Communication: can the system still hear the device? Lamp condition: what does the device report about the lamp? That is why a streetlight can be Online and still have a Lamp Failure, and why Offline never means the lamp has failed.' },
      { t: 'terms', title: 'Statuses', items: STATUS_IDS.map((id) => [STATUS_MODEL[id].label, `${STATUS_MODEL[id].definition} How it is decided: ${STATUS_MODEL[id].conditions} Data used: ${STATUS_MODEL[id].data} What to do: ${STATUS_MODEL[id].action}`]) },
      { t: 'terms', title: 'How a status is shown', items: [
        ['Online – Healthy', 'Communicating, lamp normal.'],
        ['Online – Lamp Failure', 'Communicating, but no light is detected while the lamp should be on.'],
        ['Warning – Low Light Output', 'Communicating, lamp dimmer than expected.'],
        ['Offline – Communication Lost', 'Not communicating. Lamp condition unknown.'],
        ['No Data – Telemetry Unavailable', 'Registered, but nothing usable received.'],
        ['No Device', 'A mapped location with no installed device. It is never counted as Offline.'],
      ] },
      { t: 'note', text: 'Sleeping nodes and daylight standby are part of Online: a node that is quiet on purpose is not Offline. A missing reading is shown as No Data and is never treated as zero.' },
    ],
  },
  {
    id: 'faults',
    title: 'Fault Classification Guide',
    icon: 'Wrench',
    summary: 'The fault types, how each one is identified, and what to check.',
    blocks: [
      { t: 'p', text: 'A Fault status is always shown with its specific fault type. The types below that say Automatic are identified by the system from what the lamp nodes report. The others are listed so you know they are NOT detected automatically: they need an on-site inspection or further development.' },
      { t: 'terms', title: 'Detected automatically', items: Object.values(FAULT_CATALOG).filter((f) => f.detection === 'AUTOMATIC').map((f) => [f.label, `${f.description} How it is identified: ${f.how} What to inspect: ${f.component}. What to do: ${f.action}`]) },
      { t: 'terms', title: 'Not detected automatically', items: Object.values(FAULT_CATALOG).filter((f) => f.detection !== 'AUTOMATIC').map((f) => [`${f.label} (${DETECTION_LABEL[f.detection]})`, `${f.description} Why: ${f.how} What to do: ${f.action}`]) },
      { t: 'note', text: 'When several problems exist at once, the Streetlights table shows the primary one. The detection time comes from the status history log; if the log has no entry, only the time of the node’s last report is known.' },
    ],
  },
  {
    id: 'map',
    title: 'Streetlight Map Guide',
    icon: 'MapPin',
    summary: 'The interactive map on the Dashboard: locate lamps and read the markers.',
    blocks: [
      { t: 'p', text: 'The streetlight map is part of the Dashboard. The separate Streetlight Map page was removed so the map, the totals, the electrical readings and the alerts can be read together on one page.' },
      { t: 'steps', title: 'Locate a streetlight', items: [
        'Open the Dashboard and scroll to the Streetlight Map.',
        'Drag to pan and use the scroll wheel or the + / − buttons to zoom.',
        'Search for a lamp or choose a status or street filter. The map zooms to what is left.',
        'Hover a marker for a preview, or select it to see the lamp’s details in the side panel.',
      ] },
      { t: 'terms', title: 'Markers and status indicators', items: [
        ['Green circle with a check', 'Active / Healthy: the lamp is reporting and normal.'],
        ['Amber triangle with !', 'Warning: needs attention, not a confirmed failure.'],
        ['Red diamond with !', 'Fault: a specific fault was detected (see its type in the preview).'],
        ['Grey circle with a dash', 'Offline: no recent report. The lamp condition is unknown.'],
        ['Light grey circle with ?', 'No Data: registered, but nothing usable received.'],
        ['Dashed empty ring', 'No Device: a location with no installed device.'],
      ] },
      { t: 'note', text: 'Sample locations are placeholders (their marker has no verified position). Use “Show sample locations” under Map data tools (or Compact Map View in Settings) to hide them. Lamps without saved coordinates are listed separately and are not drawn.' },
    ],
  },
  {
    id: 'pzem',
    title: 'PZEM Monitoring Guide',
    icon: 'Zap',
    summary: 'What each electrical reading means and how to read the history chart.',
    blocks: [
      { t: 'p', text: 'The PZEM-004T meter measures a separate electrical feed (the “extension”). It is independent of the lamp light sensors. The readings and the history chart are always visible on the Dashboard; there is nothing to expand.' },
      { t: 'terms', title: 'Readings', items: [
        ['Voltage (V)', 'The electrical “pressure” on the line. The guide range used here is 207 to 253 V (230 V nominal, ±10%).'],
        ['Current (A)', 'How much electricity flows. No limit is shown because the feed’s rating is not known to the system.'],
        ['Active power (W)', 'The power actually being used right now: voltage × current × power factor.'],
        ['Energy (kWh)', 'Total energy used, counted by the meter itself. It only goes up. “Energy used” in the chart is the change over the chosen range.'],
        ['Power factor', 'How efficiently the load uses power, from 0 to 1. Near 1 is efficient. It is only meaningful while a load is drawing power.'],
        ['Frequency (Hz)', 'How fast the supply alternates. 60 Hz is expected; the guide range is 59 to 61 Hz.'],
      ] },
      { t: 'terms', title: 'Meter status', items: [
        ['LIVE', 'A fresh reading arrived within the last few seconds.'],
        ['NO UPDATE', 'Nothing has arrived recently. The ESP32, its Wi-Fi or the link to the dashboard may be down.'],
        ['METER NOT ANSWERING', 'The ESP32 is online but the meter does not reply.'],
        ['WAITING / NO CONNECTION', 'No reading received yet, or the receiver cannot be reached.'],
      ] },
      { t: 'p', text: 'A dash (—) means the value is unavailable. It is never shown as zero, because zero is a real reading. In the chart, gaps mean no readings were received in that period.' },
      { t: 'note', text: 'History is kept in the receiver’s memory (up to 24 hours) and is cleared when the receiver restarts. History is recorded for power, voltage, current and the energy counter. Frequency and power factor are shown live only.' },
    ],
  },
  {
    id: 'controls',
    title: 'Lighting Controls Guide',
    icon: 'Sun',
    summary: 'Manual switching, confirmation messages and what is not connected yet.',
    blocks: [
      { t: 'steps', title: 'Switch the feed on or off', items: [
        'Open Controls and find Manual Switching.',
        'Select Turn ON or Turn OFF. The button shows “Sending…” and then “Waiting for relay…”.',
        'Wait for “Lights ON” or “Lights OFF”. That message appears only after the relay itself confirms.',
        'If nothing is confirmed after about 15 seconds, the page says so. Check the troubleshooting guide.',
      ] },
      { t: 'terms', title: 'Control status messages', items: [
        ['Waiting for relay…', 'Your command was accepted by the receiver but the relay has not confirmed it yet.'],
        ['Queued · controller offline', 'The relay controller is not reachable; the command will be applied when it returns.'],
        ['Server unreachable', 'The dashboard cannot reach the receiver at all.'],
      ] },
      { t: 'warn', text: 'The Automatic Schedule card is a preview and is not connected: changing it does not change when lights switch. “Reset fault alerts” only clears the counter on this page.' },
    ],
  },
  {
    id: 'maintenance',
    title: 'Maintenance Guide',
    icon: 'Clock',
    summary: 'Identify issues, review fault reports and follow repair activity.',
    blocks: [
      { t: 'steps', title: 'Identify and review issues', items: [
        'Start at the Dashboard: Fault Alerts and Needs Attention show which lamps need attention.',
        'Select Details on an alert (or View fault details on the map) to read the fault type, severity, suggested priority, possible causes and recommended checks.',
        'Open Maintenance to review tickets. Use the search box and the status filter to find a ticket. A fault’s details also show whether a ticket is already open for that streetlight.',
        'If no ticket is open and your account may create tickets, select Create maintenance ticket in the fault details: the form opens with the fault type and a suggested priority filled in. You can change both.',
        'Select + New Report to create a ticket, then select View on a ticket to edit it, assign a technician, change its status or mark it Resolved.',
        'Technicians are user accounts with the Technician role, created by an administrator under User Management. Switch a technician on duty in the Technicians section (this switch is saved in your browser only for now); a technician shows green only when on duty today and not handling a ticket.',
      ] },
      { t: 'warn', text: 'Maintenance tickets are saved in the LUMINARA database, so everyone who signs in sees the same tickets on every device. Technicians see only the tickets assigned to them. Removing a resolved ticket archives it: the record and its history are kept, and an administrator can view or restore it from Archived records.' },
    ],
  },
  {
    id: 'priorities',
    title: 'Maintenance Priority Legend',
    icon: 'Clock',
    summary: 'P1 to P4: what each maintenance priority means and how it is chosen.',
    blocks: [
      { t: 'terms', title: 'Priorities', items: [...PRIORITY_ORDER].reverse().map((k) => [`${PRIORITY_INFO[k].p} – ${PRIORITY_INFO[k].name}`, PRIORITY_INFO[k].meaning]) },
      { t: 'p', text: 'A fault type does not decide the priority by itself. The system only SUGGESTS one: a lamp failure starts as P2, a communication failure as P3 and low light as P4. It is raised one level when the problem has lasted more than 24 hours, and a lamp failure is raised one level when three or more lamps are dark at once. The person creating the ticket can always change it.' },
      { t: 'note', text: 'Impact, safety and duration matter more than the label. A dark lamp at a dangerous junction can deserve a higher priority than the same fault elsewhere. Tickets created before this change keep their records: Critical, High, Medium and Low are now shown as P1, P2, P3 and P4.' },
    ],
  },
  {
    id: 'settings',
    title: 'Settings Guide',
    icon: 'Settings',
    summary: 'Profile, appearance, alert preferences and system configuration.',
    blocks: [
      { t: 'terms', title: 'Sections', items: [
        ['Profile', 'Shows the admin profile. It is a sample profile; accounts need a login system on the server.'],
        ['Appearance Preferences', 'Dark Theme switches the whole site to a low-light view and is remembered in this browser (the moon/sun button in the sidebar does the same). Compact Map View hides the sample markers on the map.'],
        ['Alert Preferences', 'Email and SMS alerts are previews: no email or SMS service is connected.'],
        ['System Configuration', 'Timezone and the low-voltage threshold are previews and are not used by the Dashboard yet.'],
      ] },
      { t: 'note', text: 'Every item is tagged WORKING or UI ONLY. Changes you make to working settings take effect when you confirm them. Preview items never save, and the page says so.' },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    icon: 'Wrench',
    summary: 'Common problems and the steps to try.',
    blocks: [
      { t: 'steps', title: 'The dashboard says DEMO DATA / receiver not connected', items: [
        'Check that the receiver (server) is running on the computer or device that hosts it.',
        'Check your own network connection and reload the page.',
        'Check that the website address is the one served by the receiver.',
      ] },
      { t: 'steps', title: 'A streetlight is Offline', items: [
        'Check that the node on that pole has power.',
        'Check its antenna and the distance or obstacles to the receiver.',
        'See whether other lamps are also offline. If all are, the receiver or gateway is the likely cause.',
        'Wait a few minutes: a lamp returns to Online by itself when its node reports again.',
      ] },
      { t: 'steps', title: 'Missing or outdated sensor readings', items: [
        'Look at “Last updated” and the lamp’s Last seen time.',
        'A report-delayed (Stale) lamp is still reporting, only later than usual. Check signal strength.',
        'SENSOR ERROR means the light sensor is not answering. Check its wiring and power.',
      ] },
      { t: 'steps', title: 'PZEM readings are missing', items: [
        'NO UPDATE: check the ESP32 power and Wi-Fi.',
        'METER NOT ANSWERING: check the meter’s 5 V supply, the RX/TX wires and that it has mains power.',
        'WAITING: the ESP32 has not posted its first reading yet.',
      ] },
      { t: 'steps', title: 'The lights do not switch', items: [
        'Look at the status under Manual Switching. “Queued · controller offline” means the relay controller is not connected.',
        'Check the relay controller’s power and Wi-Fi.',
        'Try the command again after the controller shows as online.',
      ] },
      { t: 'note', text: 'These steps are suggestions. LUMINARA reports conditions it measured; it cannot confirm the exact cause of a fault without an on-site check.' },
    ],
  },
];

// Short explanations used next to PZEM readings.
export const READING_HELP = {
  voltage: 'Electrical pressure on the line. Guide range 207–253 V.',
  current: 'How much electricity is flowing.',
  power: 'Power being used right now.',
  energy: 'Total energy counted by the meter. It only increases.',
  frequency: 'Supply frequency. 60 Hz expected; guide range 59–61 Hz.',
  pf: 'Efficiency of the load, 0 to 1. Meaningful only while power is drawn.',
};

export const sectionById = (id) => HELP_SECTIONS.find((s) => s.id === id) || null;

const blockText = (b) => [b.title, b.text, ...(b.items || []).map((i) => (Array.isArray(i) ? i.join(' ') : i))].filter(Boolean).join(' ');

// Search over titles, summaries and every block. Returns sections that match, each with the first matching snippet.
export function searchHelp(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  return HELP_SECTIONS.map((s) => {
    const parts = [{ label: s.title, text: `${s.title} ${s.summary}` }, ...s.blocks.map((b) => ({ label: b.title || s.title, text: blockText(b) }))];
    const hit = parts.find((p) => words.every((w) => p.text.toLowerCase().includes(w)));
    const anyHit = hit || (words.every((w) => parts.some((p) => p.text.toLowerCase().includes(w))) ? parts[0] : null);
    if (!anyHit) return null;
    return { section: s, snippet: anyHit.text.length > 150 ? `${anyHit.text.slice(0, 147)}…` : anyHit.text, where: anyHit.label };
  }).filter(Boolean);
}
