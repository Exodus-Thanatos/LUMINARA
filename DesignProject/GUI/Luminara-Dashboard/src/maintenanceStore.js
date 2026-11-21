// Maintenance tickets — TEMPORARY PROTOTYPE STORAGE.
//
// The backend (server/server.js) has no maintenance API or database table, so tickets are kept in this
// browser's localStorage. They survive a refresh but are NOT shared between devices or users and are lost if
// the browser data is cleared. Replace load/save with API calls when a maintenance backend exists; the
// ticket shape below is what such an API would need to store.
//
// Ticket: { id, lamp, where, issue, priority, technician, status, reportDate, createdAt, updatedAt,
//           firstResponseAt, resolvedAt, resolution, history: [{ at, text }] }  (timestamps are epoch ms)
// `technicianId` is the registered user's id (see technicianStore.js); `technician` is the name at the time of
// assignment, kept for display if the user can no longer be found. Tickets saved before technician accounts
// existed have a name only (technicianId null): they are kept and shown as legacy, never deleted or rewritten.

export const STORAGE_KEY = 'luminara.maintenance.tickets.v1';
export const STATUSES = ['OPEN', 'ASSIGNED', 'IN PROGRESS', 'RESOLVED'];
export const INITIAL_STATUSES = ['OPEN', 'ASSIGNED', 'IN PROGRESS'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const MIN_RESPONSES_FOR_AVG = 3; // average response is only shown once this many tickets have a response time

const LAMP_RE = /^L-\d{3}$/;
export const ACTIVE_STATUSES = ['ASSIGNED', 'IN PROGRESS']; // a ticket in one of these holds its technician
const NEEDS_TECH = new Set(ACTIVE_STATUSES);

const pad2 = (n) => String(n).padStart(2, '0');
export const toDateInput = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
export const sameLocalDay = (a, b) => toDateInput(a) === toDateInput(b);

// ---- storage (never throws; reports failure so the UI can show an error) ----
const isTicket = (t) =>
  t && typeof t === 'object' && typeof t.id === 'string' && STATUSES.includes(t.status) && PRIORITIES.includes(t.priority);

export const loadTickets = (storage = globalThis.localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isTicket) : [];
  } catch {
    return [];
  }
};

export const saveTickets = (tickets, storage = globalThis.localStorage) => {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(tickets));
    return true;
  } catch {
    return false;
  }
};

// ---- ticket numbers: MT-1001, MT-1002 … (highest existing number + 1, so numbers are never reused) ----
export const nextTicketNumber = (tickets) => {
  const nums = tickets.map((t) => Number(/^MT-(\d+)$/.exec(t.id)?.[1])).filter(Number.isFinite);
  return `MT-${(nums.length ? Math.max(...nums) : 1000) + 1}`;
};

// ---- validation: returns { field: message }; empty object = valid ----
export const validateTicket = (f, { now = Date.now() } = {}) => {
  const e = {};
  const lamp = (f.lamp || '').trim().toUpperCase();
  if (!lamp) e.lamp = 'Enter the streetlight ID.';
  else if (!LAMP_RE.test(lamp)) e.lamp = 'Use the format L-000, for example L-008.';
  const where = (f.where || '').trim();
  if (!where) e.where = 'Enter the street or location.';
  else if (where.length < 3) e.where = 'Location is too short.';
  else if (where.length > 80) e.where = 'Keep the location under 80 characters.';
  const issue = (f.issue || '').trim();
  if (!issue) e.issue = 'Describe the issue.';
  else if (issue.length < 5) e.issue = 'Add a little more detail (at least 5 characters).';
  else if (issue.length > 300) e.issue = 'Keep the description under 300 characters.';
  if (!PRIORITIES.includes(f.priority)) e.priority = 'Choose a priority.';
  if (!STATUSES.includes(f.status)) e.status = 'Choose a status.';
  const tech = f.technicianId || (f.technician || '').trim(); // an id, or a legacy name carried over from an old ticket
  if (NEEDS_TECH.has(f.status) && !tech) e.technician = 'Assign a technician before setting this status.';
  else if (f.status === 'OPEN' && f.technicianId) e.technician = 'An Open ticket has no technician. Choose Assigned or In Progress, or clear the technician.';
  if (!f.reportDate) e.reportDate = 'Choose the report date.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(f.reportDate) || Number.isNaN(Date.parse(f.reportDate))) e.reportDate = 'Enter a valid date.';
  else if (f.reportDate > toDateInput(now)) e.reportDate = 'The report date cannot be in the future.';
  return e;
};

const clean = (f) => ({
  lamp: f.lamp.trim().toUpperCase(),
  where: f.where.trim(),
  issue: f.issue.trim(),
  priority: f.priority,
  technicianId: f.technicianId || null,
  technician: (f.technician || '').trim(),
  status: f.status,
  reportDate: f.reportDate,
});

// Report date at local noon is "the day it was reported"; if that day is today, use the real time instead.
const reportMs = (reportDate, now) => (reportDate === toDateInput(now) ? now : new Date(`${reportDate}T12:00:00`).getTime());

export const createTicket = (tickets, form, now = Date.now()) => {
  const c = clean(form);
  const createdAt = reportMs(c.reportDate, now);
  const responded = c.status !== 'OPEN';
  return {
    id: nextTicketNumber(tickets),
    ...c,
    createdAt,
    updatedAt: now,
    firstResponseAt: responded ? now : null,
    resolvedAt: null,
    resolution: '',
    history: [{ at: now, text: `Ticket created as ${c.status}${c.technician ? ` · assigned to ${c.technician}` : ''}` }],
  };
};

// Applies an edit to a ticket and records what changed. `resolution` is only used when moving to RESOLVED.
export const updateTicket = (ticket, form, now = Date.now(), resolution = '') => {
  const c = clean(form);
  const log = [];
  if (c.status !== ticket.status) log.push(`Status ${ticket.status} → ${c.status}`);
  if (c.technician !== ticket.technician || c.technicianId !== (ticket.technicianId || null)) log.push(c.technician ? `Technician ${ticket.technician ? `${ticket.technician} → ` : 'set to '}${c.technician}` : 'Technician removed');
  if (c.priority !== ticket.priority) log.push(`Priority ${ticket.priority} → ${c.priority}`);
  if (c.lamp !== ticket.lamp || c.where !== ticket.where || c.issue !== ticket.issue || c.reportDate !== ticket.reportDate) log.push('Details edited');
  const next = { ...ticket, ...c };
  if (c.reportDate !== ticket.reportDate) next.createdAt = reportMs(c.reportDate, now);
  if (!ticket.firstResponseAt && c.status !== 'OPEN') next.firstResponseAt = now;
  if (c.status === 'RESOLVED' && ticket.status !== 'RESOLVED') {
    next.resolvedAt = now;
    next.resolution = resolution.trim();
    if (resolution.trim()) log.push(`Resolution: ${resolution.trim()}`);
  } else if (c.status !== 'RESOLVED' && ticket.status === 'RESOLVED') {
    next.resolvedAt = null; // re-opened
  }
  if (log.length === 0) return ticket;
  next.updatedAt = now;
  next.history = [...(ticket.history || []), ...log.map((text) => ({ at: now, text }))];
  return next;
};

// ---- summary cards: every value is derived from the tickets ----
export const summarize = (tickets, now = Date.now()) => {
  const open = tickets.filter((t) => t.status === 'OPEN').length;
  const inProgress = tickets.filter((t) => t.status === 'IN PROGRESS').length;
  const resolvedToday = tickets.filter((t) => t.status === 'RESOLVED' && t.resolvedAt && sameLocalDay(t.resolvedAt, now)).length;
  const waits = tickets
    .filter((t) => t.firstResponseAt && t.firstResponseAt >= t.createdAt)
    .map((t) => t.firstResponseAt - t.createdAt);
  const avgResponseMs = waits.length >= MIN_RESPONSES_FOR_AVG ? waits.reduce((a, b) => a + b, 0) / waits.length : null;
  return { open, inProgress, resolvedToday, avgResponseMs, responseSamples: waits.length };
};

export const formatDuration = (ms) => {
  const min = Math.round(ms / 60000);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  const h = min / 60;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0).replace(/\.0$/, '')} hr`;
  return `${Math.round(h / 24)} days`;
};

export const formatStamp = (ms, now = Date.now()) => {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameLocalDay(ms, now)) return time;
  if (sameLocalDay(ms, now - 86400000)) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
};
