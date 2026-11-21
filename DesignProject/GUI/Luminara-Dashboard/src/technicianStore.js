// Technician registry, attendance and availability — TEMPORARY PROTOTYPE STORAGE.
//
// LUMINARA has no user database or login system on the server (the sign-in screen is a placeholder and the
// server has no user routes). So "registered users" here means people added through Settings → Create Worker
// Account, saved in THIS browser's localStorage. They are not global accounts and are not shared between
// devices. Replace load/save with API calls when a real user system exists; the shapes below are what it
// would need to provide.
//
// User:  { id: 'U-0001', name, email, role: 'TECHNICIAN' | 'VIEWER', registeredAt, presentOn, presenceUpdatedAt }
//   presentOn = the local date ('YYYY-MM-DD') the person was marked on duty, or null. A person counts as
//   present only if presentOn is TODAY, so nobody stays "on duty" from a previous day and nobody is ever
//   present just because they registered or signed in.
import { ACTIVE_STATUSES, toDateInput } from './maintenanceStore.js';

export const USERS_KEY = 'luminara.technicians.v1';
export const USERS_EVENT = 'luminara:technicians-changed'; // same-tab change signal (the `storage` event covers other tabs)
export const ROLES = { TECHNICIAN: 'Basic Worker / Technician', VIEWER: 'Read-only Viewer' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const loadUsers = (storage = globalThis.localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(USERS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((u) => u && typeof u.id === 'string' && typeof u.name === 'string' && u.role in ROLES) : [];
  } catch {
    return [];
  }
};

export const saveUsers = (users, storage = globalThis.localStorage) => {
  try {
    storage.setItem(USERS_KEY, JSON.stringify(users));
    try { globalThis.dispatchEvent?.(new Event(USERS_EVENT)); } catch { /* no window */ }
    return true;
  } catch {
    return false;
  }
};

export const nextUserId = (users) => {
  const nums = users.map((u) => Number(/^U-(\d+)$/.exec(u.id)?.[1])).filter(Number.isFinite);
  return `U-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`;
};

export const validateRegistration = (f, users) => {
  const e = {};
  const name = (f.name || '').trim();
  if (!name) e.name = 'Enter the worker’s full name.';
  else if (name.length < 2 || name.length > 60) e.name = 'Use 2 to 60 characters.';
  const email = (f.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email address, such as worker@lumen.local.';
  else if (users.some((u) => u.email === email)) e.email = 'That email is already registered.';
  if ((f.password || '').length < 8) e.password = 'Use at least 8 characters.';
  if (!(f.role in ROLES)) e.role = 'Choose a role.';
  return e;
};

// The password is validated by the form but deliberately NOT stored: this prototype has no login to use it.
export const registerUser = (users, f, now = Date.now()) => ({
  id: nextUserId(users),
  name: f.name.trim().replace(/\s+/g, ' '),
  email: f.email.trim().toLowerCase(),
  role: f.role,
  registeredAt: now,
  presentOn: null,
  presenceUpdatedAt: null,
});

export const isEligible = (u) => !!u && u.role === 'TECHNICIAN';
export const isPresent = (u, now = Date.now()) => !!u && u.presentOn === toDateInput(now);

export const setPresence = (users, id, present, now = Date.now()) =>
  users.map((u) => (u.id === id ? { ...u, presentOn: present ? toDateInput(now) : null, presenceUpdatedAt: now } : u));

// ---- availability: GREEN only when present today AND not holding an active ticket ----
export const activeTicketsOf = (userId, tickets, ignoreTicketId = null) =>
  tickets.filter((t) => t.technicianId === userId && ACTIVE_STATUSES.includes(t.status) && t.id !== ignoreTicketId);

export const availability = (user, tickets, now = Date.now(), { ignoreTicketId = null } = {}) => {
  const present = isPresent(user, now);
  const active = activeTicketsOf(user.id, tickets, ignoreTicketId);
  const reasons = [];
  if (!present) reasons.push('Absent / off duty');
  if (active.length) reasons.push(`Handling ${active.map((t) => t.id).join(', ')}`);
  return { available: reasons.length === 0, present, activeTickets: active, reasons, label: reasons.length === 0 ? 'Available' : 'Unavailable' };
};

// Registered, eligible people only, with their availability, sorted by name.
export const listTechnicians = (users, tickets, now = Date.now(), opts = {}) =>
  users
    .filter(isEligible)
    .map((u) => ({ user: u, ...availability(u, tickets, now, opts) }))
    .sort((a, b) => a.user.name.localeCompare(b.user.name));

// Returns a message when the ticket (after the change) may not be given to this technician, else null.
// A technician may keep a ticket they already hold; a NEW active assignment needs present + no other active ticket.
export const assignmentError = ({ ticket = null, status, technicianId }, users, tickets, now = Date.now()) => {
  if (!technicianId || !ACTIVE_STATUSES.includes(status)) return null;
  if (ticket && ACTIVE_STATUSES.includes(ticket.status) && ticket.technicianId === technicianId) return null;
  const user = users.find((u) => u.id === technicianId);
  if (!isEligible(user)) return 'Choose a registered technician.';
  const av = availability(user, tickets, now, { ignoreTicketId: ticket?.id ?? null });
  if (av.available) return null;
  return `${user.name} is unavailable (${av.reasons.join('; ')}).`;
};
