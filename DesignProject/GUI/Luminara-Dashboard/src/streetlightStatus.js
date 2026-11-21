// The ONE status model for streetlights. Pure functions (no React, no fetch), so the Dashboard, the Map, the Streetlights table,
// Maintenance and the User Manual all use the same words and the same rules.
//
// Two separate questions are always kept apart:
//   1. Communication: can the system still hear the device?   (Online / Offline / No Data / No Device)
//   2. Lamp condition: what does the device report about the lamp? (Healthy / Warning / Fault / Unknown)
// Nothing here invents a detection. Fault types are built ONLY from what the lamp nodes already report
// (see server/lampHealth.js and firmware/LoraIntegrated). Types the hardware cannot detect are listed in FAULT_CATALOG
// with detection: 'MANUAL' / 'NEEDS_BACKEND' so the manual can say "inspect on site" instead of claiming detection.

export const STATUS_IDS = ['ONLINE', 'OFFLINE', 'FAULT', 'WARNING', 'NO_DATA', 'NO_DEVICE'];

// Technical reference (official definitions). `tone` picks the colour family; `icon` is a text glyph so colour is never the only cue.
export const STATUS_MODEL = {
  ONLINE: {
    label: 'Online',
    tone: 'green',
    icon: '✓',
    definition: 'The device is communicating with the system and reporting within the communication threshold.',
    conditions: 'The receiver has heard from the node recently (not offline). Sleeping nodes and daylight standby count as Online: silence is expected.',
    data: 'Last report time from the lamp node (via the receiver).',
    action: 'None. Check the lamp condition for faults.',
  },
  OFFLINE: {
    label: 'Offline',
    tone: 'amber',
    icon: '–',
    definition: 'The device has not communicated within the offline threshold. Its lamp condition is unknown.',
    conditions: 'No report for longer than the offline limit (server setting; default 90 seconds), outside the scheduled sleep window.',
    data: 'Last report time; lighting schedule (sleep window).',
    action: 'Check the node power, antenna and LoRa range, and the receiver. Do not assume the lamp has failed.',
  },
  FAULT: {
    label: 'Fault',
    tone: 'red',
    icon: '!',
    definition: 'A specific device or operating malfunction has been detected. A Fault is always shown with its fault type.',
    conditions: 'The node reports no light during the lighting shift (5 lux or less) or unstable light (swing of more than 50 lux).',
    data: 'Light level (BH1750), node status, lighting schedule.',
    action: 'Open the fault details, inspect on site, and create a maintenance ticket.',
  },
  WARNING: {
    label: 'Warning',
    tone: 'amber',
    icon: '!',
    definition: 'An abnormal condition that needs attention but is not a confirmed hardware failure.',
    conditions: 'Low light (5 to 80 lux), light close to the low-light limit (80 to 100 lux), or the light sensor not answering.',
    data: 'Light level (BH1750), node status.',
    action: 'Keep watching and inspect on the next visit. Escalate if it persists or gets worse.',
  },
  NO_DATA: {
    label: 'No Data',
    tone: 'gray',
    icon: '?',
    definition: 'There is not enough recent information to decide the condition of the device.',
    conditions: 'The device is registered but nothing usable has been received from it.',
    data: 'None received yet.',
    action: 'Check the installation and the node power. A missing reading is never treated as zero.',
  },
  NO_DEVICE: {
    label: 'No Device',
    tone: 'gray',
    icon: '+',
    definition: 'The mapped location has no installed streetlight device.',
    conditions: 'The registry entry has no device ID, or its node has not been detected yet.',
    data: 'Streetlight registry.',
    action: 'Install a node, or keep the location as a planned one. It is never counted as Offline.',
  },
};

// Detection: AUTOMATIC = the existing hardware/backend identifies it. PARTIAL = only part of it is seen.
// NEEDS_BACKEND = would need new logic or configuration. MANUAL = cannot be detected; needs an on-site inspection.
export const FAULT_CATALOG = {
  LAMP_FAILURE: {
    label: 'Lamp Failure',
    short: 'No light detected while the lamp should be on',
    description: 'The light sensor reads almost no light (5 lux or less) during the lighting shift, so the lamp is not producing the expected light.',
    component: 'Lamp or driver (the sensor data cannot tell these apart)',
    severity: 'critical',
    detection: 'AUTOMATIC',
    how: 'Node reports TOTAL_BLACKOUT: light at or below 5 lux while the schedule says the lamp should be on.',
    action: 'Inspect the lamp, its wiring and the switching hardware.',
  },
  UNSTABLE_LIGHT: {
    label: 'Unstable Light',
    short: 'Light is flickering',
    description: 'The light level is swinging by more than 50 lux within a short window: the lamp is blinking.',
    component: 'Lamp, driver or wiring',
    severity: 'critical',
    detection: 'AUTOMATIC',
    how: 'Node reports BLINKING/UNSTABLE (light spread above 50 lux).',
    action: 'Watch the lamp on site and inspect connectors, wiring and the supply at the pole.',
  },
  LOW_LIGHT: {
    label: 'Low Light Output',
    short: 'Lamp is on but dimmer than expected',
    description: 'The light level is low (5 to 80 lux) during the lighting shift.',
    component: 'Lamp, lamp cover or light sensor',
    severity: 'warning',
    detection: 'AUTOMATIC',
    how: 'Node reports LOW_LIGHT (5 to 80 lux).',
    action: 'Compare with neighbouring lamps, clean the cover and sensor window, and keep watching.',
  },
  NEAR_LOW_LIGHT: {
    label: 'Near Low-Light Limit',
    short: 'Light is close to the low-light limit',
    description: 'The lamp is still lit, but its light is only just above the low-light limit (80 lux). It is not a fault yet.',
    component: 'Lamp or light sensor',
    severity: 'warning',
    detection: 'AUTOMATIC',
    how: 'Healthy report with light between 80 and 100 lux (dashboard early warning).',
    action: 'Compare with neighbouring lamps and keep watching.',
  },
  SENSOR_MALFUNCTION: {
    label: 'Sensor Malfunction',
    short: 'Light sensor is not answering',
    description: 'The node is still reporting, but its light sensor (BH1750) gives no valid reading, so the lamp cannot be judged.',
    component: 'Light sensor (BH1750) or its wiring',
    severity: 'warning',
    detection: 'AUTOMATIC',
    how: 'Node reports SENSOR_ERROR.',
    action: 'Check the sensor wiring and power at the node, restart the node, replace the sensor if it persists.',
  },
  COMMUNICATION_FAILURE: {
    label: 'Communication Failure',
    short: 'No report received',
    description: 'The receiver has heard nothing from this node recently. The lamp condition is unknown: this is not a confirmed lamp failure.',
    component: 'Node power, antenna, LoRa link or receiver',
    severity: 'critical',
    detection: 'AUTOMATIC',
    how: 'No report within the offline threshold (default 90 seconds) outside the sleep window.',
    action: 'Check node power, antenna and range, and that the receiver is running and other lamps still report.',
  },
  UNRECOGNISED_STATUS: {
    label: 'Unrecognised Status',
    short: 'Status not recognised by the dashboard',
    description: 'The node reported a status the dashboard does not recognise. It is not treated as a confirmed hardware fault.',
    component: 'Node firmware version',
    severity: 'warning',
    detection: 'AUTOMATIC',
    how: 'The reported status is not in the known list.',
    action: 'Check which firmware the node runs and compare with the status list in the User Manual.',
  },
  // ---- not detected automatically today: listed so the manual can say so honestly ----
  RELAY_FAILURE: {
    label: 'Relay Failure',
    short: 'Switching command not carried out',
    description: 'A relay command was issued but the switching was not confirmed.',
    component: 'Relay controller, Wi-Fi link, relay or contactor',
    severity: 'critical',
    detection: 'PARTIAL',
    how: 'A command not confirmed within the timeout shows as "no confirmation". The cause (relay, Wi-Fi or controller) is not identified.',
    action: 'Check the relay controller, its Wi-Fi connection, the relay and the contactor.',
  },
  VOLTAGE_ABNORMALITY: {
    label: 'Voltage Abnormality',
    short: 'Supply voltage outside its range',
    description: 'The measured voltage is outside the acceptable operating range.',
    component: 'Power supply or PZEM meter',
    severity: 'warning',
    detection: 'NEEDS_BACKEND',
    how: 'The PZEM meter measures the whole feed only, and the voltage threshold setting is not connected yet. Lamp nodes do not measure voltage.',
    action: 'Check the supply and the PZEM meter on site.',
  },
  INTERMITTENT_CONNECTION: {
    label: 'Intermittent Connection',
    short: 'Link drops and returns repeatedly',
    description: 'The device repeatedly loses and restores communication.',
    component: 'Antenna, node power or interference',
    severity: 'warning',
    detection: 'NEEDS_BACKEND',
    how: 'Not counted today. The event log could be used to count repeated drops.',
    action: 'Check the antenna, node power and interference.',
  },
  POWER_FAILURE: {
    label: 'Power Failure',
    short: 'Lamp or node lost its power supply',
    description: 'An interruption in the power supply.',
    component: 'Breaker, supply or wiring',
    severity: 'critical',
    detection: 'MANUAL',
    how: 'There is no per-lamp power sensing, so it looks like Communication Failure.',
    action: 'Inspect the breaker, the supply and the wiring on site.',
  },
};
export const DETECTION_LABEL = { AUTOMATIC: 'Automatic', PARTIAL: 'Partial', NEEDS_BACKEND: 'Needs backend', MANUAL: 'Manual inspection' };

const REPORTED_FAULT = { 'Lamp dark': 'LAMP_FAILURE', /* wording used by the built-in demo list */ TOTAL_BLACKOUT: 'LAMP_FAILURE', 'BLINKING/UNSTABLE': 'UNSTABLE_LIGHT', SENSOR_ERROR: 'SENSOR_MALFUNCTION', LOW_LIGHT: 'LOW_LIGHT' };

// d = a device as the dashboard holds it ({ status, reported, comm, health, known, ... }), or null/undefined for "no device".
// Returns the two-part status. `statusId` is the single primary status used for counts, filters and the legend.
export function classifyStreetlight(d) {
  if (!d || d.status === 'UNINSTALLED') return { statusId: 'NO_DEVICE', comm: 'NO_DEVICE', condition: 'UNKNOWN', faultType: null, label: 'No Device', detail: 'No device installed', tone: 'gray', icon: '+' };
  if (d.status === 'NO DATA') return { statusId: 'NO_DATA', comm: 'NO_DATA', condition: 'UNKNOWN', faultType: null, label: 'No Data – Telemetry Unavailable', detail: 'Nothing usable received', tone: 'gray', icon: '?' };
  if (d.status === 'OFFLINE' || d.status === 'OFF') {
    return { statusId: 'OFFLINE', comm: 'OFFLINE', condition: 'UNKNOWN', faultType: 'COMMUNICATION_FAILURE', label: 'Offline – Communication Lost', detail: FAULT_CATALOG.COMMUNICATION_FAILURE.short, tone: 'amber', icon: '–' };
  }
  const key = d.health && d.health.key;
  if (d.status === 'FAULT') {
    // A fault with no diagnostic detail at all (e.g. the built-in demo list) is shown honestly as "type not reported", never guessed.
    if (!d.reported) return { statusId: 'FAULT', comm: 'ONLINE', condition: 'FAULT', faultType: null, label: 'Online – Fault (type not reported)', detail: 'Fault reported without a type', tone: 'red', icon: '!' };
    const type = REPORTED_FAULT[d.reported] || 'UNRECOGNISED_STATUS';
    const f = FAULT_CATALOG[type];
    return { statusId: 'FAULT', comm: 'ONLINE', condition: 'FAULT', faultType: type, label: `Online – ${f.label}`, detail: f.short, tone: 'red', icon: '!' };
  }
  if (d.status === 'WARNING') {
    const type = key === 'NEAR_LIMIT' ? 'NEAR_LOW_LIGHT' : key === 'SENSOR_ERROR' ? 'SENSOR_MALFUNCTION' : REPORTED_FAULT[d.reported] || 'UNRECOGNISED_STATUS';
    const f = FAULT_CATALOG[type];
    return { statusId: 'WARNING', comm: 'ONLINE', condition: 'WARNING', faultType: type, label: `Warning – ${f.label}`, detail: f.short, tone: 'amber', icon: '!' };
  }
  // ONLINE (or the demo statuses ON / anything else that is not a problem)
  const extra = key === 'SLEEPING' ? 'Sleeping' : key === 'DAYLIGHT' || key === 'STANDBY' ? 'Standby' : d.comm === 'Stale' ? 'Healthy (report delayed)' : 'Healthy';
  return { statusId: 'ONLINE', comm: 'ONLINE', condition: 'HEALTHY', faultType: null, label: `Online – ${extra}`, detail: extra === 'Sleeping' ? 'Node is in its scheduled sleep window' : 'Operating normally', tone: 'green', icon: '✓' };
}

// Counts for the KPI cards, from a list of classified records (each has .statusId). Every number on every page comes from here.
export function summarize(classified) {
  const n = (id) => classified.filter((c) => c.statusId === id).length;
  const noDevice = n('NO_DEVICE');
  const installed = classified.length - noDevice;
  return {
    total: classified.length,
    installed,
    noDevice,
    online: n('ONLINE') + n('WARNING') + n('FAULT'), // communicating, whatever the lamp condition is
    healthy: n('ONLINE'),
    warning: n('WARNING'),
    fault: n('FAULT'),
    offline: n('OFFLINE'),
    noData: n('NO_DATA'),
  };
}

// Needs-attention list: anything that is not healthy, worst first. `records` carry { id, statusId, faultType, ... }.
const ATTENTION_RANK = { FAULT: 0, OFFLINE: 1, WARNING: 2 };
export const needsAttention = (records) =>
  records
    .filter((r) => r.statusId in ATTENTION_RANK)
    .sort((a, b) => ATTENTION_RANK[a.statusId] - ATTENTION_RANK[b.statusId] || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));

// When did the lamp's CURRENT condition begin? `events` = the lamp's STATUS_CHANGE history rows ({ at, next }, any order).
// The log only records changes, so the newest change INTO the current health key is when it began. Returns ms, or null when it is
// not in the log (never guessed). `key` is the lamp's current health key (e.g. 'FAULT', 'OFFLINE').
export function conditionSince(events, key) {
  if (!key || !Array.isArray(events)) return null;
  const rows = events.filter((e) => e && e.next === key && typeof e.at === 'number' && Number.isFinite(e.at)).sort((a, b) => b.at - a.at);
  return rows.length ? rows[0].at : null;
}
export const minutesSince = (at, now = Date.now()) => (typeof at === 'number' ? Math.max(0, Math.round((now - at) / 60000)) : null);
export const formatActive = (minutes) => {
  if (minutes == null) return null;
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h} h ${minutes % 60} min`;
  return `${Math.floor(h / 24)} days`;
};
