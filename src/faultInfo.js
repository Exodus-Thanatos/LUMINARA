// Fault detail wording for a lamp. Pure functions (no React, no fetch).
// Everything here is built ONLY from what the receiver reports (status text, link state, last report time).
// Causes are POSSIBLE causes drawn from what each firmware status means. They are never presented as confirmed.

export const SEVERITY = {
  critical: { label: 'Critical', badge: 'bg-[#fde8e8] text-[#e04040]', dot: 'bg-[#e04848]', rank: 3 },
  warning: { label: 'Warning', badge: 'bg-[#fff3d6] text-[#c98a0a]', dot: 'bg-[#f0a82e]', rank: 2 },
  info: { label: 'Info', badge: 'bg-[#e6edfc] text-[#3b82f6]', dot: 'bg-[#3b82f6]', rank: 1 },
};

// Keyed by the exact status text the lamp node reports (see LoraIntegrated.ino computeStatus()).
const BY_REPORTED = {
  TOTAL_BLACKOUT: {
    problem: 'The node measured almost no light (5 lux or less) during the scheduled lighting shift.',
    causes: ['Lamp or driver failure', 'Power loss to this lamp', 'Light sensor covered or blocked'],
    actions: ['Visit the pole and check whether the lamp is lit.', 'Check the power supply and breaker feeding this lamp.', 'Check that the light sensor is clean and not covered.'],
    help: 'maintenance',
  },
  'BLINKING/UNSTABLE': {
    problem: 'The light level swung by more than 50 lux within a short window, which the node treats as a lamp fault.',
    causes: ['Loose wiring or connector', 'Lamp or driver nearing failure', 'Unstable power supply'],
    actions: ['Watch the lamp on site to see whether it flickers.', 'Inspect the connectors and wiring at the pole.', 'Check the supply voltage at the pole.'],
    help: 'maintenance',
  },
  SENSOR_ERROR: {
    problem: 'The node is still talking, but its light sensor (BH1750) is not answering, so there is no valid light reading.',
    causes: ['Sensor wiring (SDA/SCL) loose or damaged', 'Sensor not powered', 'Sensor failure'],
    actions: ['Check the sensor wiring and its power at the node.', 'Restart the node and see whether the reading returns.', 'Replace the sensor if the problem remains.'],
    help: 'troubleshooting',
  },
  LOW_LIGHT: {
    problem: 'The light level was low (5 to 80 lux) during the scheduled shift.',
    causes: ['Dirty or dim lamp', 'Partial lamp failure', 'Sensor partly shaded'],
    actions: ['Compare with neighbouring lamps on site.', 'Clean the lamp cover and the sensor window.', 'Keep watching: report again if it gets darker.'],
    help: 'monitoring',
  },
};

const OFFLINE = {
  problem: 'The streetlight is not responding: the receiver has heard nothing from its node recently.',
  causes: ['Communication interruption (LoRa range, antenna or interference)', 'Node power failure', 'Receiver or gateway problem'],
  actions: ['Check the power supply of the node.', 'Inspect the communication connection and antenna.', 'Check that the receiver is running and other lamps still report.'],
  help: 'troubleshooting',
};

const UNKNOWN = (raw) => ({
  problem: `The node reported a status the dashboard does not recognise${raw ? ` (“${raw}”)` : ''}. It is not treated as a confirmed hardware fault.`,
  causes: ['Node running a different firmware version'],
  actions: ['Check which firmware the node is running.', 'Compare with the status list in the User Manual.'],
  help: 'troubleshooting',
});

const STALE = {
  problem: 'The node has reported, but later than expected.',
  causes: ['Weak LoRa signal', 'Receiver busy or briefly interrupted'],
  actions: ['Wait a minute and see whether reports resume on time.', 'If it keeps happening, check the antenna and signal strength.'],
  help: 'troubleshooting',
};

// Returns null when the lamp has nothing to report (healthy, on time, or not installed).
export function describeFault(d) {
  if (!d || d.status === 'UNINSTALLED' || d.status === 'NO DATA') return null;
  let severity;
  let body;
  let statusLabel;
  if (d.status === 'OFFLINE') {
    severity = 'critical';
    body = OFFLINE;
    statusLabel = 'Offline (no recent signal)';
  } else if (d.status === 'FAULT') {
    severity = 'critical';
    body = BY_REPORTED[d.reported] || UNKNOWN(d.reported);
    statusLabel = `Fault reported (${d.reported})`;
  } else if (d.status === 'WARNING') {
    severity = 'warning';
    body = BY_REPORTED[d.reported] || UNKNOWN(d.reported);
    statusLabel = `Warning (${d.reported})`;
  } else if (d.comm === 'Stale') {
    severity = 'info';
    body = STALE;
    statusLabel = 'Online, report delayed';
  } else {
    return null;
  }
  return {
    id: d.id,
    severity,
    title: `${SEVERITY[severity].label}: ${d.status === 'OFFLINE' ? 'not responding' : d.status === 'FAULT' ? 'fault reported' : d.status === 'WARNING' ? 'needs a look' : 'report delayed'}`,
    statusLabel,
    problem: body.problem,
    causes: body.causes,
    actions: body.actions,
    help: body.help,
    lastReport: d.time,
    location: d.loc,
    comm: d.comm,
    reported: d.reported,
  };
}

export const describeFaults = (devices) =>
  devices
    .map(describeFault)
    .filter(Boolean)
    .sort((a, b) => SEVERITY[b.severity].rank - SEVERITY[a.severity].rank || a.id.localeCompare(b.id, undefined, { numeric: true }));

export const countBySeverity = (faults) => ({
  critical: faults.filter((f) => f.severity === 'critical').length,
  warning: faults.filter((f) => f.severity === 'warning').length,
  info: faults.filter((f) => f.severity === 'info').length,
});
