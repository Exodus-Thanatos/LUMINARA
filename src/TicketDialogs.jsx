// Maintenance ticket dialogs: create, view, edit, resolve. Presentation + form state only;
// the ticket rules live in maintenanceStore.js and persistence is handled by the Maintenance screen.
import { useState } from 'react';
import { Modal } from './Dialogs.jsx';
import { Field, inputCls } from './uiKit.jsx';
import { PRIORITY_BADGE, TICKET_STATUS_BADGE } from './ticketBadges.js';
import { STATUSES, INITIAL_STATUSES, PRIORITIES, validateTicket, toDateInput, formatStamp } from './maintenanceStore.js';
import { availability } from './technicianStore.js';
import { TechnicianSelect, AvailabilityLine, LEGACY } from './TechnicianUI.jsx';

const Tag = ({ className = '', children }) => (
  <span className={`inline-flex items-center justify-center rounded-md text-xs font-bold uppercase px-3 h-7 ${className}`}>{children}</span>
);
const PriorityTag = ({ value }) => <Tag className={PRIORITY_BADGE[value]}>{value}</Tag>;
const StatusTag = ({ value }) => <Tag className={TICKET_STATUS_BADGE[value]}>{value}</Tag>;

const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const btnOutline = 'h-[42px] px-5 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50 transition-colors';
const btnPrimary = 'h-[42px] px-5 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52] transition-colors disabled:opacity-60';

const Header = ({ id, title, sub, onClose }) => (
  <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-[#e6ebf1]">
    <div className="min-w-0">
      <h2 id={id} className="text-lg font-bold text-[#14233c]">{title}</h2>
      {sub && <div className="text-xs text-[#6b7a90] mt-0.5">{sub}</div>}
    </div>
    <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 w-10 h-10 flex items-center justify-center rounded-lg text-xl leading-none text-[#6b7a90] hover:bg-gray-50">×</button>
  </div>
);

const emptyForm = () => ({ lamp: '', where: '', issue: '', priority: 'MEDIUM', technicianId: '', technician: '', status: 'OPEN', reportDate: toDateInput(Date.now()) });

/* Create / edit form. `ticket` present = editing. */
const TicketForm = ({ ticket, ticketNumber, lampIds, users, tickets, now, onSubmit, onCancel }) => {
  const [f, setF] = useState(() => (ticket ? { lamp: ticket.lamp, where: ticket.where, issue: ticket.issue, priority: ticket.priority, technicianId: ticket.technicianId || '', technician: ticket.technician, status: ticket.status, reportDate: ticket.reportDate } : emptyForm()));
  const [errors, setErrors] = useState({});
  const [today] = useState(() => toDateInput(Date.now()));
  const set = (k) => (e) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const submit = (e) => {
    e.preventDefault();
    const errs = validateTicket(f);
    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      const problem = onSubmit(f); // returns a message when the assignment is not allowed (technician unavailable)
      if (problem) setErrors({ technician: problem });
    }
  };
  const statusOptions = ticket ? STATUSES : INITIAL_STATUSES;
  return (
    <form onSubmit={submit} noValidate>
      <div className="px-5 sm:px-6 pt-5 grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4">
        <Field label="Ticket number" hint={ticket ? undefined : 'Generated automatically when you save.'}>
          <input className={inputCls} value={ticketNumber} disabled readOnly aria-label="Ticket number" />
        </Field>
        <Field label="Report date *" error={errors.reportDate}>
          <input type="date" className={inputCls} value={f.reportDate} max={today} onChange={set('reportDate')} aria-invalid={!!errors.reportDate} />
        </Field>
        <Field label="Streetlight ID *" error={errors.lamp}>
          <input className={inputCls} value={f.lamp} onChange={set('lamp')} list="mt-lamp-ids" placeholder="L-008" autoComplete="off" aria-invalid={!!errors.lamp} />
          <datalist id="mt-lamp-ids">{lampIds.map((id) => <option key={id} value={id} />)}</datalist>
        </Field>
        <Field label="Street or location *" error={errors.where}>
          <input className={inputCls} value={f.where} onChange={set('where')} placeholder="Market Street" maxLength={80} aria-invalid={!!errors.where} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Issue description *" error={errors.issue}>
            <textarea className={`${inputCls} h-24 py-3 resize-none`} value={f.issue} onChange={set('issue')} placeholder="What is wrong with the streetlight?" maxLength={300} aria-invalid={!!errors.issue} />
          </Field>
        </div>
        <Field label="Priority *" error={errors.priority}>
          <select className={inputCls} value={f.priority} onChange={set('priority')}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
          </select>
        </Field>
        <Field label={ticket ? 'Status *' : 'Initial status *'} error={errors.status}>
          <select className={inputCls} value={f.status} onChange={set('status')}>
            {statusOptions.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <div className="mb-4">
            <label htmlFor="mt-tech" className="block text-xs font-semibold text-[#14233c] mb-1.5">Assigned technician</label>
            <TechnicianSelect
              id="mt-tech"
              value={f.technicianId || (f.technician ? LEGACY : '')}
              users={users}
              tickets={tickets}
              now={now}
              ticket={ticket}
              error={errors.technician}
              hint="Registered technicians only. Required for Assigned and In Progress."
              onChange={(v) => {
                const u = users.find((x) => x.id === v);
                setF((p) => ({ ...p, technicianId: u ? u.id : '', technician: u ? u.name : v === LEGACY ? ticket.technician : '', status: u && p.status === 'OPEN' ? 'ASSIGNED' : p.status })); // choosing a technician for an Open ticket assigns it
                if (errors.technician) setErrors((p) => ({ ...p, technician: undefined }));
              }}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-5 sm:px-6 py-4 border-t border-[#e6ebf1]">
        <button type="button" onClick={onCancel} className={btnOutline}>Cancel</button>
        <button type="submit" className={btnPrimary}>{ticket ? 'Save changes' : 'Create ticket'}</button>
      </div>
    </form>
  );
};

const Row = ({ label, children }) => (
  <div className="py-2.5 flex flex-col sm:flex-row sm:gap-4">
    <dt className="sm:w-36 shrink-0 text-xs font-bold uppercase text-[#6b7a90]">{label}</dt>
    <dd className="text-sm text-[#14233c] min-w-0 break-words">{children}</dd>
  </div>
);

/* Read-only details with the actions: edit, change status, assign technician, resolve. */
const TicketView = ({ ticket, users, tickets, onEdit, onStatus, onResolve, onClose }) => {
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const [tech, setTech] = useState(ticket.technicianId || (ticket.technician ? LEGACY : ''));
  const [techErr, setTechErr] = useState('');
  const [now] = useState(() => Date.now());
  const holder = users.find((u) => u.id === ticket.technicianId);
  const techInfo = holder ? availability(holder, tickets, now) : null;
  const resolved = ticket.status === 'RESOLVED';
  const NEXT = { OPEN: ['ASSIGNED', 'IN PROGRESS'], ASSIGNED: ['IN PROGRESS', 'OPEN'], 'IN PROGRESS': ['ASSIGNED'], RESOLVED: ['IN PROGRESS'] };

  const hasTech = !!(ticket.technicianId || ticket.technician);
  const run = (status, techPatch) => {
    const problem = onStatus(status, techPatch); // null when applied, otherwise why it was refused
    setTechErr(problem || '');
  };
  const changeStatus = (st) => {
    if (st === 'OPEN') return run('OPEN', { technicianId: null, technician: '' }); // an Open ticket has no technician
    if ((st === 'ASSIGNED' || st === 'IN PROGRESS') && !hasTech) return setTechErr('Assign a technician first.');
    return run(st);
  };
  const saveTech = () => {
    const u = users.find((x) => x.id === tech);
    // Assigning to an OPEN ticket moves it to ASSIGNED; clearing the technician of an active ticket re-opens it.
    let status = ticket.status;
    if (u && status === 'OPEN') status = 'ASSIGNED';
    if (!u && (status === 'ASSIGNED' || status === 'IN PROGRESS')) status = 'OPEN';
    run(status, u ? { technicianId: u.id, technician: u.name } : { technicianId: null, technician: '' });
  };

  return (
    <>
      <div className="px-5 sm:px-6 pt-3">
        <div className="flex flex-wrap gap-2 pt-2">
          <StatusTag value={ticket.status} />
          <PriorityTag value={ticket.priority} />
        </div>
        <dl className="divide-y divide-[#e6ebf1] mt-2">
          <Row label="Streetlight">{ticket.lamp}</Row>
          <Row label="Location">{ticket.where}</Row>
          <Row label="Issue">{ticket.issue}</Row>
          <Row label="Technician">
            {holder ? (
              <div><div className="font-semibold">{holder.name}</div><div className="mt-1 text-sm"><AvailabilityLine info={techInfo} /></div></div>
            ) : ticket.technician ? (
              <div><div className="font-semibold">{ticket.technician}</div><div className="text-xs text-[#6b7a90] mt-0.5">{ticket.technicianId ? 'Technician account no longer found' : 'Name from an earlier version · not a registered technician'}</div></div>
            ) : (
              <span className="text-[#6b7a90]">Unassigned</span>
            )}
          </Row>
          <Row label="Reported">{ticket.reportDate}</Row>
          <Row label="Last updated">{formatStamp(ticket.updatedAt, now)}</Row>
          {resolved && <Row label="Resolved">{formatStamp(ticket.resolvedAt, now)}{ticket.resolution ? ` · ${ticket.resolution}` : ''}</Row>}
        </dl>

        {!resolved && (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-[#14233c] mb-1.5" htmlFor="mt-assign">Assign or change technician</label>
            <div className="flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <TechnicianSelect id="mt-assign" value={tech} users={users} tickets={tickets} now={now} ticket={ticket} onChange={(v) => { setTech(v); setTechErr(''); }} hint="Registered technicians only." />
              </div>
              <button type="button" onClick={saveTech} disabled={tech === (ticket.technicianId || (ticket.technician ? LEGACY : '')) || tech === LEGACY} className={`${btnOutline} shrink-0 disabled:opacity-50`}>Save</button>
            </div>
          </div>
        )}
        {techErr && <div role="alert" className="text-[11px] font-semibold text-[#e04040] mt-1.5">{techErr}</div>}

        <div className="mt-4">
          <div className="text-xs font-bold uppercase text-[#6b7a90] mb-2">History</div>
          <ul className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
            {[...(ticket.history || [])].reverse().map((h, i) => (
              <li key={i} className="text-xs text-[#5b6b82]"><span className="font-semibold text-[#14233c]">{formatStamp(h.at, now)}</span> · {h.text}</li>
            ))}
          </ul>
        </div>

        {resolving && (
          <div className="mt-4 rounded-xl border border-[#9dd5b2] bg-[#f4fbf7] p-4">
            <label className="block text-xs font-semibold text-[#14233c] mb-1.5" htmlFor="mt-resolution">Resolution note (optional)</label>
            <input id="mt-resolution" className={inputCls} value={note} maxLength={200} placeholder="e.g. Replaced the LED driver" onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-2 mt-3 justify-end">
              <button type="button" onClick={() => setResolving(false)} className={btnOutline}>Back</button>
              <button type="button" onClick={() => { setResolving(false); onResolve(note); }} className={btnPrimary}>Confirm resolved</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 sm:justify-end px-5 sm:px-6 py-4 mt-4 border-t border-[#e6ebf1]">
        <button type="button" onClick={onClose} className={`${btnOutline} w-full sm:w-auto sm:mr-auto`}>Close</button>
        {NEXT[ticket.status].map((s) => (
          <button key={s} type="button" onClick={() => changeStatus(s)} className={btnOutline}>{resolved ? 'Re-open' : `Set ${titleCase(s)}`}</button>
        ))}
        <button type="button" onClick={onEdit} className={btnOutline}>Edit</button>
        {!resolved && !resolving && (
          <button type="button" onClick={() => (ticket.technician ? setResolving(true) : setTechErr('Assign a technician before resolving.'))} className={btnPrimary}>Mark as Resolved</button>
        )}
      </div>
    </>
  );
};

/* mode: 'create' | 'view'. Edit is a sub-mode of view. */
export const TicketModal = ({ mode, ticket, ticketNumber, lampIds, users, tickets, now, onClose, onCreate, onSave, onStatus, onResolve }) => {
  const [editing, setEditing] = useState(false);
  if (mode === 'create') {
    return (
      <Modal labelledBy="mt-title" onClose={onClose} wide>
        <Header id="mt-title" title="New maintenance report" sub="Fields marked * are required." onClose={onClose} />
        <TicketForm ticketNumber={ticketNumber} lampIds={lampIds} users={users} tickets={tickets} now={now} onSubmit={onCreate} onCancel={onClose} />
      </Modal>
    );
  }
  return (
    <Modal labelledBy="mt-title" onClose={onClose} wide>
      <Header id="mt-title" title={`${ticket.id}${editing ? ' · Edit' : ''}`} sub={`${ticket.lamp} • ${ticket.where}`} onClose={onClose} />
      {editing ? (
        <TicketForm ticket={ticket} ticketNumber={ticket.id} lampIds={lampIds} users={users} tickets={tickets} now={now} onSubmit={(f) => { const problem = onSave(f); if (!problem) setEditing(false); return problem; }} onCancel={() => setEditing(false)} />
      ) : (
        <TicketView ticket={ticket} users={users} tickets={tickets} onEdit={() => setEditing(true)} onStatus={onStatus} onResolve={onResolve} onClose={onClose} />
      )}
    </Modal>
  );
};
