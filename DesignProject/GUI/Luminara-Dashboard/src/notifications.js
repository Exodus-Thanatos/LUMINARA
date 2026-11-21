// Notification centre store. Notifications are created ONLY from things this browser actually observed from the receiver
// (a lamp reporting a fault, a node going silent, the receiver link dropping). Nothing is invented.
// Kept in this browser (localStorage); read/unread state is per browser. There is no server-side notification history.
import { describeFault } from './faultInfo.js';

export const STORAGE_KEY = 'luminara.notifications.v1';
export const MAX_ITEMS = 50;

// Which notifications exist for the current devices. Pure.
export function activeConditions(devices) {
  const out = [];
  for (const d of devices) {
    const f = describeFault(d);
    if (!f || f.severity === 'info') continue;
    const kind = d.status === 'OFFLINE' ? 'offline' : d.status === 'FAULT' ? 'fault' : 'warning';
    out.push({
      key: `${kind}:${d.id}:${d.status === 'OFFLINE' ? '' : d.reported}`,
      kind,
      severity: f.severity,
      lampId: d.id,
      title: kind === 'offline' ? `${d.id} is not responding` : kind === 'fault' ? `${d.id} reported a fault` : `${d.id} needs a look`,
      text: f.problem,
    });
  }
  return out;
}

// Merge what is active now into the saved list. New conditions become unread "active" items;
// items whose condition is gone become "cleared" (kept as history). Pure: returns a new array.
export function reconcile(list, active, now) {
  const activeKeys = new Set(active.map((a) => a.key));
  const known = new Set(list.filter((n) => n.state === 'active').map((n) => n.key));
  const added = active
    .filter((a) => !known.has(a.key))
    .map((a) => ({ ...a, id: `${a.key}@${now}`, at: now, read: false, state: 'active' }));
  const updated = list.map((n) => (n.state === 'active' && !activeKeys.has(n.key) ? { ...n, state: 'cleared', clearedAt: now } : n));
  return [...added, ...updated].sort((a, b) => b.at - a.at).slice(0, MAX_ITEMS);
}

const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
};
const save = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* private mode: notifications just won't persist */
  }
};

let state = typeof localStorage === 'undefined' ? [] : load();
const subs = new Set();
const set = (next) => {
  state = next;
  save(state);
  subs.forEach((f) => f());
};
export const subscribeNotifications = (f) => {
  subs.add(f);
  return () => subs.delete(f);
};
export const getNotifications = () => state;

let lastMode = null;
let everLive = false;
// Call whenever devices / connection mode change. Does nothing in demo mode (sample lamps are not real events).
export function syncNotifications(devices, mode, now = Date.now()) {
  let next = state;
  if (mode === 'live') {
    next = reconcile(next, activeConditions(devices), now);
    if (lastMode === 'demo' && everLive) {
      next = [{ key: `conn:up:${now}`, id: `conn:up@${now}`, kind: 'connection', severity: 'info', title: 'Receiver connection restored', text: 'The dashboard is receiving live data again.', at: now, read: false, state: 'event' }, ...next].slice(0, MAX_ITEMS);
    }
    everLive = true;
  } else if (lastMode === 'live') {
    next = [{ key: `conn:down:${now}`, id: `conn:down@${now}`, kind: 'connection', severity: 'warning', title: 'Receiver connection lost', text: 'The dashboard cannot reach the receiver. Lamp status is not being updated and the sample data is shown instead.', at: now, read: false, state: 'event' }, ...next].slice(0, MAX_ITEMS);
  }
  lastMode = mode;
  if (next !== state) set(next);
}
export const markRead = (id) => set(state.map((n) => (n.id === id ? { ...n, read: true } : n)));
export const markAllRead = () => set(state.map((n) => ({ ...n, read: true })));
export const clearNotifications = () => set([]);
export const unreadCount = (list) => list.filter((n) => !n.read).length;
export const __resetForTests = () => {
  state = [];
  lastMode = null;
  everLive = false;
};
