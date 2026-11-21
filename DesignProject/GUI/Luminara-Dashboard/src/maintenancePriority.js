// Maintenance priority classes P1 to P4. The database keeps its existing values (CRITICAL / HIGH / MEDIUM / LOW) so no record or
// constraint changes; only the wording shown to people changes. Pure functions.

export const PRIORITY_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const PRIORITY_INFO = {
  CRITICAL: { p: 'P1', name: 'Emergency', meaning: 'Immediate safety risk or major outage.' },
  HIGH: { p: 'P2', name: 'Urgent', meaning: 'Significant impact; address soon.' },
  MEDIUM: { p: 'P3', name: 'Normal', meaning: 'Standard repair, scheduled normally.' },
  LOW: { p: 'P4', name: 'Planned', meaning: 'Routine or planned work.' },
};
export const priorityLabel = (v) => (PRIORITY_INFO[v] ? `${PRIORITY_INFO[v].p} – ${PRIORITY_INFO[v].name}` : String(v ?? ''));
export const priorityShort = (v) => (PRIORITY_INFO[v] ? PRIORITY_INFO[v].p : String(v ?? ''));

const BASE = { LAMP_FAILURE: 'HIGH', UNSTABLE_LIGHT: 'HIGH', COMMUNICATION_FAILURE: 'MEDIUM', SENSOR_MALFUNCTION: 'MEDIUM', LOW_LIGHT: 'LOW', NEAR_LOW_LIGHT: 'LOW', UNRECOGNISED_STATUS: 'MEDIUM' };
const up = (v) => PRIORITY_ORDER[Math.min(PRIORITY_ORDER.indexOf(v) + 1, PRIORITY_ORDER.length - 1)];

// A SUGGESTION only. A fault type does not fix the priority: duration and how many neighbouring lamps are affected can raise it.
// ctx: { minutesActive?: number, clusterCount?: number (how many lamps have a lamp failure right now) }
// Many offline nodes at once usually share one cause (receiver, power), so they do not raise each other's priority.
export function suggestPriority(faultType, ctx = {}) {
  let value = BASE[faultType] || 'MEDIUM';
  const reasons = [`Base for this fault type: ${priorityLabel(value)}.`];
  if (typeof ctx.minutesActive === 'number' && ctx.minutesActive >= 24 * 60) {
    value = up(value);
    reasons.push('Active for more than 24 hours: raised one level.');
  }
  if (faultType === 'LAMP_FAILURE' && (ctx.clusterCount || 0) >= 3) {
    value = up(value);
    reasons.push('Three or more lamps are dark at once: a larger dark stretch, raised one level.');
  }
  return { value, label: priorityLabel(value), reasons };
}
