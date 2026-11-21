// server/routes/ticketRoutes.js
import { query, getClient } from '../db.js';
import { requireAuth, checkRole } from '../auth.js';

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { if (raw.length < 16384) raw += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

const STATUSES = ['OPEN', 'ASSIGNED', 'IN PROGRESS', 'RESOLVED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

async function nextTicketNumber() {
  const r = await query(`SELECT ticket_number FROM maintenance_tickets ORDER BY id DESC LIMIT 1`);
  if (!r.rows.length) return 'MT-1001';
  const last = r.rows[0].ticket_number;
  const n = parseInt(last.replace('MT-', ''), 10);
  return `MT-${n + 1}`;
}

function formatTicket(row) {
  return {
    id: row.ticket_number,
    dbId: row.id,
    lamp: row.streetlight_id,
    where: row.location,
    issue: row.issue_description,
    priority: row.priority,
    technicianId: row.assigned_technician_id ? String(row.assigned_technician_id) : null,
    technician: row.technician_name || null,
    technicianRole: row.technician_role || null,
    status: row.status,
    reportDate: row.reported_at ? row.reported_at.toISOString().split('T')[0] : null,
    createdAt: row.created_at ? row.created_at.getTime() : null,
    updatedAt: row.updated_at ? row.updated_at.getTime() : null,
    resolvedAt: row.resolved_at ? row.resolved_at.getTime() : null,
    archivedAt: row.archived_at ? row.archived_at.getTime() : null,
    archivedBy: row.archived_by_name || null,
    firstResponseAt: null, // derived from history if needed
  };
}

const TICKET_SELECT = `
  SELECT t.*,
    u.full_name AS technician_name,
    u.role AS technician_role,
    ab.full_name AS archived_by_name
  FROM maintenance_tickets t
  LEFT JOIN users u ON u.id = t.assigned_technician_id
  LEFT JOIN users ab ON ab.id = t.archived_by
`;

export async function handleTicketRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/tickets')) return false;

  const user = await requireAuth(req, res);
  if (!user) return true;

  // GET /api/tickets/archived
  if (req.method === 'GET' && url.pathname === '/api/tickets/archived') {
    if (!checkRole(user, ['ADMIN'], res)) return true;
    const r = await query(`${TICKET_SELECT} WHERE t.status = 'ARCHIVED' ORDER BY t.archived_at DESC`);
    return json(res, 200, { ok: true, tickets: r.rows.map(formatTicket) });
  }

  // GET /api/tickets
  if (req.method === 'GET' && url.pathname === '/api/tickets') {
    const r = await query(`${TICKET_SELECT} WHERE t.status != 'ARCHIVED' ORDER BY t.updated_at DESC`);
    const tickets = r.rows.map(formatTicket);
    // TECHNICIAN sees all (they need to see assigned), STAFF sees all active, ADMIN sees all
    // (Future: filter by role if needed)
    return json(res, 200, { ok: true, tickets });
  }

  // POST /api/tickets/import (admin only — migrate from localStorage)
  if (req.method === 'POST' && url.pathname === '/api/tickets/import') {
    if (!checkRole(user, ['ADMIN'], res)) return true;
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { ok: false, code: 'invalid_json' }); }
    const { tickets: incoming } = body || {};
    if (!Array.isArray(incoming) || !incoming.length) return json(res, 400, { ok: false, error: 'No tickets to import.' });
    let imported = 0;
    for (const t of incoming) {
      try {
        const tn = t.id || await nextTicketNumber();
        await query(
          `INSERT INTO maintenance_tickets
             (ticket_number, streetlight_id, location, issue_description, priority, status, reported_at, resolved_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (ticket_number) DO NOTHING`,
          [tn, t.lamp || 'L-000', t.where || 'Unknown', t.issue || 'Imported', t.priority || 'LOW',
           t.status || 'OPEN', t.createdAt ? new Date(t.createdAt) : new Date(),
           t.resolvedAt ? new Date(t.resolvedAt) : null]
        );
        imported++;
      } catch { /* skip invalid */ }
    }
    return json(res, 200, { ok: true, imported });
  }

  // POST /api/tickets (create)
  if (req.method === 'POST' && url.pathname === '/api/tickets') {
    if (!checkRole(user, ['ADMIN', 'STAFF'], res)) return true;
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { ok: false, code: 'invalid_json' }); }

    const { lamp, where: location, issue, priority, status, technicianId, reportDate } = body || {};
    const errors = {};
    if (!lamp || !/^L-\d{3}$/.test(lamp.trim().toUpperCase())) errors.lamp = 'Valid lamp ID required (e.g. L-001).';
    if (!location || location.trim().length < 3) errors.where = 'Location is required.';
    if (!issue || issue.trim().length < 5) errors.issue = 'Issue description required.';
    if (!PRIORITIES.includes(priority)) errors.priority = 'Valid priority required.';
    if (!STATUSES.includes(status)) errors.status = 'Valid status required.';
    if (!reportDate) errors.reportDate = 'Report date is required.';
    if (Object.keys(errors).length) return json(res, 400, { ok: false, code: 'validation', errors });

    const techId = technicianId ? parseInt(technicianId, 10) : null;
    const ticketNumber = await nextTicketNumber();
    const reportedAt = new Date(reportDate + 'T12:00:00');

    const client = await getClient();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `INSERT INTO maintenance_tickets
           (ticket_number, streetlight_id, location, issue_description, priority,
            assigned_technician_id, status, reported_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [ticketNumber, lamp.trim().toUpperCase(), location.trim(), issue.trim(),
         priority, techId, status, reportedAt]
      );
      const ticket = r.rows[0];
      await client.query(
        `INSERT INTO maintenance_history (ticket_id, action, performed_by) VALUES ($1, $2, $3)`,
        [ticket.id, `Ticket created as ${status}${techId ? ' with technician assigned' : ''}`, user.id]
      );
      await client.query('COMMIT');
      const full = await query(`${TICKET_SELECT} WHERE t.id = $1`, [ticket.id]);
      return json(res, 201, { ok: true, ticket: formatTicket(full.rows[0]) });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Match /api/tickets/:id and /api/tickets/:id/action
  const idMatch = url.pathname.match(/^\/api\/tickets\/([^/]+)(\/.*)?$/);
  if (!idMatch) return false;
  const ticketRef = idMatch[1]; // ticket_number like MT-1001 or db id
  const sub = idMatch[2] || '';

  // Resolve ticket
  const isNum = /^\d+$/.test(ticketRef);
  const tRes = await query(
    `${TICKET_SELECT} WHERE ${isNum ? 't.id' : 't.ticket_number'} = $1`,
    [isNum ? parseInt(ticketRef) : ticketRef]
  );
  if (!tRes.rows.length) return json(res, 404, { ok: false, error: 'Ticket not found.' });
  const ticket = tRes.rows[0];

  // GET /api/tickets/:id/history
  if (req.method === 'GET' && sub === '/history') {
    const h = await query(
      `SELECT mh.*, u.full_name AS performed_by_name
       FROM maintenance_history mh
       LEFT JOIN users u ON u.id = mh.performed_by
       WHERE mh.ticket_id = $1
       ORDER BY mh.created_at ASC`,
      [ticket.id]
    );
    return json(res, 200, { ok: true, history: h.rows });
  }

  // POST /api/tickets/:id/archive
  if (req.method === 'POST' && sub === '/archive') {
    if (!checkRole(user, ['ADMIN'], res)) return true;
    if (ticket.status !== 'RESOLVED') return json(res, 400, { ok: false, error: 'Only RESOLVED tickets can be archived.' });
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE maintenance_tickets SET status='ARCHIVED', archived_at=NOW(), archived_by=$1, updated_at=NOW() WHERE id=$2`,
        [user.id, ticket.id]
      );
      await client.query(
        `INSERT INTO maintenance_history (ticket_id, action, previous_value, new_value, performed_by)
         VALUES ($1,'Status changed','RESOLVED','ARCHIVED',$2)`,
        [ticket.id, user.id]
      );
      await client.query('COMMIT');
      return json(res, 200, { ok: true, message: `Ticket ${ticket.ticket_number} archived.` });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // POST /api/tickets/:id/restore
  if (req.method === 'POST' && sub === '/restore') {
    if (!checkRole(user, ['ADMIN'], res)) return true;
    if (ticket.status !== 'ARCHIVED') return json(res, 400, { ok: false, error: 'Only ARCHIVED tickets can be restored.' });
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE maintenance_tickets SET status='RESOLVED', archived_at=NULL, archived_by=NULL, updated_at=NOW() WHERE id=$1`,
        [ticket.id]
      );
      await client.query(
        `INSERT INTO maintenance_history (ticket_id, action, previous_value, new_value, performed_by)
         VALUES ($1,'Ticket restored from archive','ARCHIVED','RESOLVED',$2)`,
        [ticket.id, user.id]
      );
      await client.query('COMMIT');
      return json(res, 200, { ok: true, message: `Ticket ${ticket.ticket_number} restored.` });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // PUT /api/tickets/:id (update)
  if (req.method === 'PUT' && sub === '') {
    if (!checkRole(user, ['ADMIN', 'TECHNICIAN'], res)) return true;
    if (ticket.status === 'ARCHIVED') return json(res, 400, { ok: false, error: 'Archived tickets cannot be updated.' });
    // TECHNICIAN can only update status of their assigned ticket
    if (user.role === 'TECHNICIAN' && ticket.assigned_technician_id !== user.id) {
      return json(res, 403, { ok: false, error: 'You can only update tickets assigned to you.' });
    }
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { ok: false, code: 'invalid_json' }); }

    const { status, resolution, technicianId, priority, lamp, where: location, issue, reportDate } = body || {};
    const changes = {};
    const historyLines = [];

    if (status && STATUSES.includes(status) && status !== ticket.status) {
      if (user.role === 'TECHNICIAN' && !['IN PROGRESS','RESOLVED'].includes(status)) {
        return json(res, 403, { ok: false, error: 'Technicians can only set In Progress or Resolved.' });
      }
      historyLines.push({ action: 'Status changed', prev: ticket.status, next: status });
      changes.status = status;
      if (status === 'RESOLVED') { changes.resolved_at = new Date(); }
      if (status !== 'RESOLVED' && ticket.status === 'RESOLVED') { changes.resolved_at = null; }
    }
    if (user.role === 'ADMIN') {
      if (technicianId !== undefined) {
        const techId = technicianId ? parseInt(technicianId, 10) : null;
        if (techId !== ticket.assigned_technician_id) {
          historyLines.push({ action: 'Technician changed', prev: String(ticket.assigned_technician_id||''), next: String(techId||'') });
          changes.assigned_technician_id = techId;
        }
      }
      if (priority && PRIORITIES.includes(priority) && priority !== ticket.priority) {
        historyLines.push({ action: 'Priority changed', prev: ticket.priority, next: priority });
        changes.priority = priority;
      }
      if (lamp) changes.streetlight_id = lamp.trim().toUpperCase();
      if (location) changes.location = location.trim();
      if (issue) changes.issue_description = issue.trim();
      if (reportDate) changes.reported_at = new Date(reportDate + 'T12:00:00');
      if (lamp || location || issue || reportDate) historyLines.push({ action: 'Details edited', prev: null, next: null });
    }

    if (!Object.keys(changes).length) return json(res, 200, { ok: true, ticket: formatTicket(ticket) });

    const client = await getClient();
    try {
      await client.query('BEGIN');
      const setClauses = Object.keys(changes).map((k, i) => `${k} = $${i + 1}`).join(', ');
      const vals = Object.values(changes);
      await client.query(`UPDATE maintenance_tickets SET ${setClauses}, updated_at=NOW() WHERE id=$${vals.length + 1}`, [...vals, ticket.id]);
      for (const h of historyLines) {
        await client.query(
          `INSERT INTO maintenance_history (ticket_id, action, previous_value, new_value, performed_by) VALUES ($1,$2,$3,$4,$5)`,
          [ticket.id, h.action, h.prev, h.next, user.id]
        );
      }
      if (resolution && changes.status === 'RESOLVED') {
        await client.query(
          `INSERT INTO maintenance_history (ticket_id, action, performed_by) VALUES ($1,$2,$3)`,
          [ticket.id, `Resolution note: ${resolution}`, user.id]
        );
      }
      await client.query('COMMIT');
      const updated = await query(`${TICKET_SELECT} WHERE t.id = $1`, [ticket.id]);
      return json(res, 200, { ok: true, ticket: formatTicket(updated.rows[0]) });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return false;
}
