// Wording and colours for the streetlight history list. Pure functions (no React, no I/O).
import { HEALTH_NAMES } from '../server/lightEvents.js';

export const EVENT_TYPE_LABEL = { STATUS_CHANGE: 'Status change', MAINTENANCE: 'Maintenance', SCHEDULE_CHANGE: 'Schedule change' };
export const SOURCE_LABEL = { DEVICE: 'Lamp node', TEST: 'Test data', SERVER: 'Receiver', USER: 'User' };

// Dot colour of one history row: what the lamp became (status change), or a neutral colour for maintenance / schedule rows.
const KEY_DOT = { GOOD: 'bg-[#27a85a]', DAYLIGHT: 'bg-[#3b82f6]', STANDBY: 'bg-[#3b82f6]', SLEEPING: 'bg-[#3b82f6]', NEAR_LIMIT: 'bg-[#f0a82e]', WARNING: 'bg-[#f0a82e]', OFFLINE: 'bg-[#f0a82e]', UNKNOWN: 'bg-[#f0a82e]', FAULT: 'bg-[#e04848]', BLINKING: 'bg-[#e04848]', SENSOR_ERROR: 'bg-[#8895a7]' };
export const eventDot = (e) => (e.type === 'STATUS_CHANGE' ? KEY_DOT[e.next] || 'bg-[#8895a7]' : e.type === 'MAINTENANCE' ? 'bg-[#8b5cf6]' : 'bg-[#14233c]');

// "Connected / good" for a status change; the raw words (OPEN, IN PROGRESS, "ON 18:00 · OFF 05:30") for the others.
export const statusText = (e, which) => {
  const v = which === 'previous' ? e.previous : e.next;
  if (v === null || v === undefined) return which === 'previous' ? 'None yet' : '';
  return e.type === 'STATUS_CHANGE' ? HEALTH_NAMES[v] || v : v;
};

export const fmtWhen = (ms) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });

// A lux reading is only shown when there is one: a missing reading is "no reading", never 0.
export const luxText = (lux) => (typeof lux === 'number' && Number.isFinite(lux) ? `${Math.round(lux * 10) / 10} lux` : 'no reading');
