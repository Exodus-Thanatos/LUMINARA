// Pure helpers for the simplified BASIC dashboard (no React, no I/O), so they can be unit-tested.
import { healthOf } from './lampHealthUi.js';

const NORMAL = new Set(['GOOD', 'DAYLIGHT', 'STANDBY', 'SLEEPING']);
const ATTENTION = new Set(['FAULT', 'WARNING', 'NEAR_LIMIT', 'BLINKING', 'SENSOR_ERROR', 'UNKNOWN']);

// normal | attention | nosignal | nodata. A silent node is "no signal" (never "0 lux" and never "failed"),
// and a sleeping node is normal: both rules come from lampHealth.js, this only groups the result.
export const groupOf = (d) => {
  const h = healthOf(d);
  if (!h) return 'nodata';
  if (h.key === 'OFFLINE') return 'nosignal';
  if (NORMAL.has(h.key)) return 'normal';
  if (ATTENTION.has(h.key)) return 'attention';
  return 'nodata';
};

export const summarize = (devices) => {
  const out = { total: devices.length, normal: 0, attention: 0, nosignal: 0, nodata: 0 };
  for (const d of devices) out[groupOf(d)] += 1;
  return out;
};

const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// When the ticket was given to this person: the latest "technician set to <name>" entry of the ticket trail,
// else the first-response time, else the day it was reported.
export const assignedAt = (ticket, fullName) => {
  const mine = (ticket.history || []).filter((h) => h.action === 'TECHNICIAN_CHANGED' && h.next === fullName).map((h) => h.at);
  if (mine.length) return Math.max(...mine);
  return ticket.firstResponseAt || ticket.createdAt || null;
};

// Open work first (most urgent on top, then the longest waiting), finished work last.
export const sortAssigned = (tickets, fullName) =>
  [...tickets].sort((a, b) => {
    const done = Number(a.status === 'RESOLVED') - Number(b.status === 'RESOLVED');
    if (done) return done;
    const p = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (p) return p;
    return (assignedAt(a, fullName) || 0) - (assignedAt(b, fullName) || 0);
  });

export const fmtDate = (ms) => (Number.isFinite(ms) && ms ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
