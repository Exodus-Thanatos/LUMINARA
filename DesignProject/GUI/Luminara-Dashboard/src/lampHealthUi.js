// Colours and short labels for the lamp health states (wording itself comes from server/lampHealth.js).
// The colour classes are the ones the dashboard already uses, so Light and Dark Mode keep working.
import { classifyLamp } from '../server/lampHealth.js';

export const TONE_PILL = {
  green: 'bg-[#e3f4ea] text-[#1f9a52]',
  red: 'bg-[#fde8e8] text-[#e04040]',
  amber: 'bg-[#fff3d6] text-[#c98a0a]',
  blue: 'bg-[#e6edfc] text-[#3b82f6]',
  gray: 'bg-[#eceff3] text-[#5b6b82]',
};
export const TONE_DOT = { green: 'bg-[#27a85a]', red: 'bg-[#e04848]', amber: 'bg-[#f0a82e]', blue: 'bg-[#3b82f6]', gray: 'bg-[#8895a7]' };

// Demo data (receiver not reachable) has no `health`, so it is worked out from the dashboard status.
const DEMO_STATUS = { ONLINE: 'NORMAL_LIT', FAULT: 'TOTAL_BLACKOUT', WARNING: 'LOW_LIGHT' };

// null = nothing to describe (not installed / no data yet): the caller keeps its old badge.
export const healthOf = (d) => {
  if (!d || d.status === 'UNINSTALLED' || d.status === 'NO DATA') return null;
  if (d.health) return d.health;
  if (d.status === 'OFFLINE') return classifyLamp({ status: d.reported || 'NORMAL_LIT', link: 'OFFLINE', recent: [] });
  const raw = d.reported || DEMO_STATUS[d.status];
  return raw ? classifyLamp({ status: raw, link: 'ONLINE', recent: [] }) : null;
};

// Very small labels for the lamp tiles on the dashboard.
const TILE_LABEL = { GOOD: 'GOOD', FAULT: 'FAULT', WARNING: 'WARNING', NEAR_LIMIT: 'WARNING', BLINKING: 'BLINKING', DAYLIGHT: 'DAYLIGHT', STANDBY: 'STANDBY', SENSOR_ERROR: 'SENSOR', OFFLINE: 'OFFLINE', SLEEPING: 'SLEEPING', UNKNOWN: 'UNKNOWN' };
export const tileLabel = (d) => {
  const h = healthOf(d);
  return h ? TILE_LABEL[h.key] || d.status : d.status;
};
