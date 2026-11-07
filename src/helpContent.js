// Help Center / User Manual content. Plain data, no React. Every statement describes what LUMINARA does today.
// Block types: p (paragraph) | steps (numbered procedure) | terms (term / meaning pairs) | note | warn

export const HELP_SECTIONS = [
  {
    id: 'overview',
    title: 'System Overview',
    icon: 'Info',
    summary: 'What LUMINARA is, what it is for and what it can do.',
    blocks: [
      { t: 'p', text: 'LUMINARA is a streetlight monitoring dashboard. Small nodes on the lamp poles measure the light level and send it by LoRa radio to a receiver. The receiver passes the data to this website, which shows which lamps are working, which need attention and which have gone silent.' },
      { t: 'terms', title: 'Major features', items: [
        ['Dashboard', 'Totals for lights, online, fault alerts and offline, the lamp network, recent alerts and system activity.'],
        ['Streetlights', 'A searchable list of every lamp with its status and latest readings.'],
        ['Streetlight Map', 'Lamp positions on a map with status markers, search, filters, CSV export and import.'],
        ['Extension Power Monitoring (PZEM)', 'Voltage, current, power, energy, frequency and power factor of a separate electrical feed, with a history chart.'],
        ['Controls', 'Manual ON/OFF switching of the relay feed, with honest confirmation messages.'],
        ['Maintenance', 'Create, assign, update and resolve fault and repair tickets (saved in this browser for now).'],
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
        'Open the Dashboard and check the four summary cards: Total Lights, Online, Fault Alerts and Offline.',
        'Look at the data badge (bottom-right) to confirm you are seeing live data.',
        'If a fault is listed under Recent Alerts, select it to read what it means and what to check.',
      ] },
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard Guide',
    icon: 'LayoutGrid',
    summary: 'What each card, alert and indicator on the Dashboard means.',
    blocks: [
      { t: 'terms', title: 'Summary cards', items: [
        ['Total Lights', 'Lamps the dashboard knows about. In live mode a lamp appears here after its node reports for the first time.'],
        ['Online', 'Lamps whose node is reporting and whose last reported condition is normal (including daytime standby).'],
        ['Fault Alerts', 'Lamps whose node reported a fault or warning condition. These are reported conditions, not confirmed repairs needed.'],
        ['Offline', 'Lamps whose node has not been heard from recently, so their present state is unknown.'],
      ] },
      { t: 'terms', title: 'Other Dashboard areas', items: [
        ['Extension Power Monitoring', 'The PZEM electrical meter. See the PZEM Monitoring Guide.'],
        ['Lamp Network Status', 'One tile per lamp showing its ID and a status word. Colours are always paired with the word.'],
        ['Recent Alerts', 'Current problems. Select one to open its detailed view.'],
        ['System Activity', 'When the data was last refreshed and whether the receiver is connected.'],
      ] },
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
        ['ONLINE', 'Node reporting; the lamp condition it reported is normal (night lit, daylight standby or outside its shift).'],
        ['WARNING', 'Node reported a low-light condition, or a status the dashboard does not recognise.'],
        ['FAULT', 'Node reported a total blackout, unstable (blinking) light or a sensor error.'],
        ['OFFLINE', 'No recent signal from the node. Its lamp state is not guessed.'],
        ['NO DATA / UNINSTALLED', 'No reading yet, or a planned lamp that has no node installed.'],
      ] },
      { t: 'p', text: 'To identify problem lamps, filter by FAULT, WARNING and OFFLINE, or open the Dashboard and read Recent Alerts, which lists them most serious first.' },
    ],
  },
  {
    id: 'map',
    title: 'Streetlight Map Guide',
    icon: 'MapPin',
    summary: 'Navigate the map, locate lamps and read the markers.',
    blocks: [
      { t: 'steps', title: 'Locate a streetlight', items: [
        'Open Streetlight Map in the sidebar. It loads the first time you visit and then stays ready.',
        'Drag to pan and use the scroll wheel or the + / − buttons to zoom.',
        'Search for a lamp or choose a status or street filter. The map zooms to what is left.',
        'Select a marker to see that lamp’s details in the side panel.',
      ] },
      { t: 'terms', title: 'Markers and status indicators', items: [
        ['Green', 'Lamp is online and normal.'],
        ['Amber', 'Warning or offline.'],
        ['Red', 'Fault reported.'],
        ['Grey', 'No data or not installed.'],
      ] },
      { t: 'note', text: 'Sample locations are placeholders. Use “Show sample locations” on the map (or Compact Map View in Settings) to hide them. Lamps without saved coordinates are listed separately and are not drawn.' },
    ],
  },
  {
    id: 'pzem',
    title: 'PZEM Monitoring Guide',
    icon: 'Zap',
    summary: 'What each electrical reading means and how to read the history chart.',
    blocks: [
      { t: 'p', text: 'The PZEM-004T meter measures a separate electrical feed (the “extension”). It is independent of the lamp light sensors. Select the Voltage card on the Dashboard to expand all readings and the history chart.' },
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
        'Start at the Dashboard: Fault Alerts and Recent Alerts show which lamps need attention.',
        'Select an alert to read its severity, the problem, possible causes and recommended checks.',
        'Open Maintenance to review tickets. Use the search box and the status filter to find a ticket.',
        'Select + New Report to create a ticket, then select View on a ticket to edit it, assign a technician, change its status or mark it Resolved.',
        'Technicians come from Settings → Create Worker Account (role: Basic Worker / Technician). Switch a technician on duty in the Technicians section; a technician shows green only when on duty today and not handling a ticket.',
      ] },
      { t: 'warn', text: 'Maintenance tickets are saved in this browser only (temporary prototype storage). They are not shared with other devices or users, and clearing the browser data removes them. A maintenance backend is needed to share tickets.' },
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
