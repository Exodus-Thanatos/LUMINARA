// Talks to the LUMINARA server for sign-in, users and maintenance tickets. The session lives in an HTTP-only cookie the
// browser sends by itself; no token or password is ever kept in JavaScript or localStorage.
import { toDateInput } from './maintenanceStore.js';

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields || {};
  }
}

let onUnauthorized = null;
// App registers a callback so an expired / revoked session sends the person back to the sign-in page.
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export const request = async (method, url, body, { silent401 = false } = {}) => {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the LUMINARA server. Check that it is running and try again.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty or not JSON */ }
  if (!res.ok) {
    if (res.status === 401 && !silent401 && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, data?.code || 'error', data?.error || `Request failed (${res.status}).`, data?.fields);
  }
  return data;
};

// ---- auth ----
export const apiLogin = (identifier, password) => request('POST', '/api/auth/login', { identifier, password }, { silent401: true }).then((d) => d.user);
export const apiLogout = () => request('POST', '/api/auth/logout', {}, { silent401: true });
export const apiMe = () => request('GET', '/api/auth/me', undefined, { silent401: true }).then((d) => d.user);
export const apiChangePassword = (currentPassword, newPassword) => request('POST', '/api/auth/change-password', { currentPassword, newPassword }).then((d) => d.user);

// ---- users (admin) ----
export const apiListUsers = () => request('GET', '/api/users').then((d) => d.users);
export const apiCreateUser = (f) => request('POST', '/api/users', f);
export const apiUpdateUser = (id, f) => request('PATCH', `/api/users/${id}`, f).then((d) => d.user);
export const apiResetPassword = (id) => request('POST', `/api/users/${id}/reset-password`, {});
export const apiTechnicians = () => request('GET', '/api/technicians').then((d) => d.technicians);

// ---- tickets ----
// The server sends timestamps as milliseconds; the screens also expect `reportDate` (the local day it was reported).
export const toUiTicket = (t) => ({ ...t, reportDate: toDateInput(t.createdAt) });

// The form holds a report DATE (YYYY-MM-DD). Same rule as before: noon of that day, or "now" if it is today.
export const reportedAtFrom = (reportDate, now = Date.now()) => (reportDate === toDateInput(now) ? now : new Date(`${reportDate}T12:00:00`).getTime());

export const apiListTickets = async () => {
  const d = await request('GET', '/api/tickets');
  return { tickets: d.tickets.map(toUiTicket), summaryRows: d.summaryRows };
};
export const apiListArchived = () => request('GET', '/api/tickets?archived=1').then((d) => d.tickets.map(toUiTicket));
export const apiCreateTicket = (f, now = Date.now()) =>
  request('POST', '/api/tickets', { lamp: f.lamp, where: f.where, issue: f.issue, priority: f.priority, status: f.status, technicianId: f.technicianId || null, reportedAt: reportedAtFrom(f.reportDate, now) }).then((d) => toUiTicket(d.ticket));
export const apiUpdateTicket = (ticket, patch) => request('PATCH', `/api/tickets/${ticket.dbId}`, { ...patch, expectedVersion: ticket.version }).then((d) => toUiTicket(d.ticket));
export const apiArchiveTicket = (ticket) => request('POST', `/api/tickets/${ticket.dbId}/archive`, {}).then((d) => toUiTicket(d.ticket));
export const apiRestoreTicket = (ticket) => request('POST', `/api/tickets/${ticket.dbId}/restore`, {}).then((d) => toUiTicket(d.ticket));
export const apiImportTickets = (tickets) => request('POST', '/api/tickets/import', { tickets });

// ---- permanent streetlight history and the lighting schedule ----
// params: { lamp, type, limit, before: { beforeAt, beforeId } }
export const apiHistory = ({ lamp, type, limit = 20, before } = {}) => {
  const q = new URLSearchParams();
  if (lamp) q.set('lamp', lamp);
  if (type) q.set('type', type);
  q.set('limit', String(limit));
  if (before) { q.set('beforeAt', String(before.beforeAt)); q.set('beforeId', String(before.beforeId)); }
  return request('GET', `/api/history?${q.toString()}`);
};
// ---- read-only data viewer (ADMIN, DEVELOPER) ----
export const apiDataSummary = () => request('GET', '/api/data/summary');
export const apiDataTickets = (archived = false) => request('GET', `/api/data/tickets${archived ? '?archived=1' : ''}`).then((d) => d.tickets);
export const apiSchedule = () => request('GET', '/api/schedule');
export const apiSaveSchedule = (onTime, offTime) => request('PUT', '/api/schedule', { onTime, offTime });

// ---- developer registration keys (Phase 5 Step 4) ----
// Public: creates a DEVELOPER account when the key is valid. The role is decided by the server, never sent from here.
export const apiRegisterDeveloper = (f) => request('POST', '/api/auth/register-developer', { fullName: f.fullName, username: f.username, email: f.email, password: f.password, confirmPassword: f.confirmPassword, registrationKey: f.registrationKey }, { silent401: true });
// Admin: the key is in the response of apiCreateInvite only; the list never contains it.
export const apiListInvites = () => request('GET', '/api/developer-invites').then((d) => d.invites);
export const apiCreateInvite = (label, expiresInDays) => request('POST', '/api/developer-invites', { label, expiresInDays });
export const apiRevokeInvite = (id) => request('POST', `/api/developer-invites/${id}/revoke`, {}).then((d) => d.invite);
