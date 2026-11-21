// Pure helpers for the Dashboard map (no Leaflet, no React) so they can be unit-tested:
// marker styles, the joining of a streetlight-list row with its live device, the marker SVG and the hover preview HTML.
import { classifyStreetlight, FAULT_CATALOG } from './streetlightStatus.js';

// Marker styles. Colour is never the only cue: every status also has its own SHAPE and glyph (and a text label in the tooltip and legend).
//   Active = circle with a check, Warning = triangle with !, Fault = diamond with !, Offline = grey circle with a dash,
//   No Data = light circle with ?, No Device = hollow dashed ring.
export const STATUS = {
  ACTIVE: { label: 'Active / Healthy', color: '#27a85a' },
  WARNING: { label: 'Warning', color: '#f0a82e' },
  FAULT: { label: 'Fault', color: '#e04848' },
  OFFLINE: { label: 'Offline', color: '#6b7a90' },
  NO_DATA: { label: 'No Data', color: '#a3afc0' },
  NO_DEVICE: { label: 'No Device', color: '#8895a7' },
};
export const KEY_OF = { ONLINE: 'ACTIVE', WARNING: 'WARNING', FAULT: 'FAULT', OFFLINE: 'OFFLINE', NO_DATA: 'NO_DATA', NO_DEVICE: 'NO_DEVICE' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Device installation and device communication are tracked separately.
   Status always comes from the existing inventory (deviceById) through the ONE status model (streetlightStatus.js). */
export const deriveLamp = (lamp, deviceById) => {
  const dev = lamp.deviceId ? deviceById[lamp.deviceId] : undefined;
  const location = lamp.streetName || (dev && dev.loc) || 'Location not recorded';
  const none = { installed: false, location, comm: null, op: null, last: null, dev: undefined, cls: classifyStreetlight(null) };
  if (!lamp.deviceId) return { key: 'NO_DEVICE', ...none };
  // Registered pole whose node the dashboard has not detected yet: shown as no device until it reports.
  if (!dev) return { key: 'NO_DEVICE', pending: true, ...none };
  const cls = classifyStreetlight(dev);
  const fault = cls.faultType ? FAULT_CATALOG[cls.faultType].label : null;
  const op = cls.statusId === 'OFFLINE' ? `Unknown (no telemetry${dev.reported ? `; last reported ${dev.reported}` : ''})` : cls.statusId === 'NO_DATA' ? 'Unknown (no data)' : fault ? `${cls.statusId === 'FAULT' ? 'Fault' : 'Warning'}: ${fault}` : cls.label.replace('Online – ', '');
  return {
    key: KEY_OF[cls.statusId],
    installed: true,
    location,
    comm: cls.statusId === 'OFFLINE' ? 'Offline' : dev.comm || 'Online',
    op,
    last: dev.time,
    dev,
    cls,
  };
};


export const markerHtml = (key, selected, sample) => {
  const c = STATUS[key].color;
  const ring = selected ? 'filter:drop-shadow(0 0 0 #13223b) drop-shadow(0 0 3px #13223b) drop-shadow(0 0 3px #13223b);' : 'filter:drop-shadow(0 1px 1px rgba(0,0,0,.4));';
  const dash = sample ? '<circle cx="16" cy="16" r="15" fill="none" stroke="#6b7a90" stroke-width="1.5" stroke-dasharray="3 2"/>' : '';
  const sel = selected ? '<circle cx="16" cy="16" r="15.5" fill="none" stroke="#13223b" stroke-width="3"/>' : '';
  let shape;
  if (key === 'FAULT') shape = `<polygon points="16,3 29,16 16,29 3,16" fill="${c}" stroke="#fff" stroke-width="2"/><text x="16" y="21" text-anchor="middle" font-size="15" font-weight="700" fill="#fff" font-family="Arial,sans-serif">!</text>`;
  else if (key === 'WARNING') shape = `<polygon points="16,4 29,27 3,27" fill="${c}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><text x="16" y="24" text-anchor="middle" font-size="14" font-weight="700" fill="#14233c" font-family="Arial,sans-serif">!</text>`;
  else if (key === 'NO_DEVICE') shape = `<circle cx="16" cy="16" r="8" fill="#fff" stroke="${c}" stroke-width="2.5" stroke-dasharray="3.5 2.5"/>`;
  else {
    const glyph = key === 'ACTIVE' ? '✓' : key === 'OFFLINE' ? '–' : '?';
    shape = `<circle cx="16" cy="16" r="11" fill="${c}" stroke="#fff" stroke-width="2.5"/><text x="16" y="21" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" font-family="Arial,sans-serif">${glyph}</text>`;
  }
  return `<svg width="32" height="32" viewBox="0 0 32 32" style="${ring}overflow:visible" aria-hidden="true">${sel}${dash}${shape}</svg>`;
};


// Hover preview: only fields the system really has. Anything missing says "No Data". All text is escaped (street names come from CSV).
export const tipHtml = (r) => {
  const dev = r.dev;
  const lux = dev && typeof dev.lux === 'number' ? `${dev.lux.toLocaleString()} lx` : 'No Data';
  const cls = r.cls;
  const rowH = (k, v) => `<div style="display:flex;justify-content:space-between;gap:14px"><span style="color:#6b7a90">${esc(k)}</span><b style="text-align:right">${esc(v)}</b></div>`;
  const head = `<div style="font-weight:700;font-size:13px">${esc(r.streetlightId)}</div><div style="color:#6b7a90;margin-bottom:6px">${esc(r.location)}</div>`;
  if (!r.installed) return `<div style="min-width:200px;font-size:12px">${head}${rowH('Status', r.pending ? 'Not detected yet' : 'No Device Installed')}</div>`;
  const fault = cls.faultType ? `<div style="margin-top:6px;padding:5px 7px;border-radius:6px;background:${cls.tone === 'red' ? '#fde8e8' : '#fff3d6'};color:${cls.tone === 'red' ? '#b3261e' : '#8a6410'};white-space:normal;max-width:240px"><b>${esc(FAULT_CATALOG[cls.faultType].label)}</b>: ${esc(FAULT_CATALOG[cls.faultType].short)}</div>` : '';
  return `<div style="min-width:220px;font-size:12px;line-height:1.5">${head}${rowH('Communication', r.comm || '—')}${rowH('Lamp', cls.statusId === 'OFFLINE' || cls.statusId === 'NO_DATA' ? 'Unknown' : cls.statusId === 'ONLINE' ? cls.label.replace('Online – ', '') : cls.condition === 'FAULT' ? 'Fault' : 'Warning')}${rowH('Voltage', 'No Data')}${rowH('Light level', lux)}${rowH('Last report', r.last || 'No Data')}${fault}<div style="margin-top:5px;color:#6b7a90;font-size:11px">Click for details</div></div>`;
};

