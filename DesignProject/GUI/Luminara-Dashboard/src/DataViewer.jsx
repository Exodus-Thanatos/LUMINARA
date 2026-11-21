// Read-only Data screen for ADMIN and DEVELOPER: what the database has saved, as tables you can export.
// Nothing here changes data. The server enforces access (data.view; the Users tab also needs users.manage).
import { priorityLabel } from './maintenancePriority.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { CardTitle, inputCls } from './uiKit.jsx';
import { apiDataSummary, apiDataTickets, apiListUsers, apiSchedule } from './api.js';
import { useHistory } from './useHistory.js';
import { EVENT_TYPE_LABEL, SOURCE_LABEL, fmtWhen, luxText, statusText } from './historyUi.js';
import { ROLE_LABEL, can } from './access.js';
import { toCsv, downloadCsv, csvFileName, isoOrBlank } from './dataCsv.js';

const when = (ms) => (ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const btn = 'h-10 px-4 rounded-lg bg-[#eceff3] text-[#5b6b82] text-sm font-bold hover:bg-[#e1e6ec] disabled:opacity-60 inline-flex items-center gap-2';
const tabCls = (on) => `h-10 px-4 rounded-lg text-sm font-bold transition-colors ${on ? 'bg-[#27a85a] text-white' : 'bg-[#eceff3] text-[#5b6b82] hover:bg-[#e1e6ec]'}`;

// Loads one thing, ignores a late answer for an older request, and can reload.
function useLoad(fn, deps, enabled = true) {
  const [s, setS] = useState({ data: null, error: '', loading: true });
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setS((p) => ({ ...p, loading: true, error: '' }));
    try {
      const data = await fn();
      if (mine === seq.current) setS({ data, error: '', loading: false });
    } catch (e) {
      if (mine === seq.current) setS((p) => ({ ...p, loading: false, error: e.message || 'Could not load this data.' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    if (enabled) reload();
    return () => { seq.current += 1; };
  }, [enabled, reload]);
  return { ...s, reload };
}

// columns: [{ key, label, value(row) -> text/number for the table and the CSV, csv?(row) overrides the CSV value, wrap? }]
function DataTable({ columns, rows, rowKey, empty }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left border-collapse">
        <thead>
          <tr className="bg-[#f3f6f9] text-xs font-bold text-[#6b7a90]">
            {columns.map((c, i) => (
              <th key={c.key} className={`py-3 px-3 whitespace-nowrap ${i === 0 ? 'rounded-l-lg' : ''} ${i === columns.length - 1 ? 'rounded-r-lg' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r)} className={i % 2 === 1 ? 'bg-[#f8fafc]' : ''}>
              {columns.map((c) => {
                const v = c.value(r);
                return <td key={c.key} className={`py-3 px-3 text-sm align-top ${c.wrap ? 'min-w-[16rem] break-words' : 'whitespace-nowrap'}`}>{v === null || v === undefined || v === '' ? '—' : v}</td>;
              })}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={columns.length} className="py-10 text-center text-sm text-[#6b7a90]">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const Status = ({ loading, error, text = 'Loading…' }) => (
  <>
    {loading && <p className="text-sm text-[#6b7a90] inline-flex items-center gap-2 mb-3"><LoaderCircle size={14} className="animate-spin" /> {text}</p>}
    {error && <p role="alert" className="text-sm font-semibold text-[#e04040] mb-3">{error}</p>}
  </>
);

const exportBtn = (name, columns, rows) => (
  <button type="button" className={btn} disabled={!rows.length} onClick={() => downloadCsv(csvFileName(name), toCsv(columns.map((c) => ({ label: c.label, value: c.csv || c.value })), rows))}>
    Export CSV
  </button>
);

// ------------------------------------------------------------------ Events
const EVENT_COLS = [
  { key: 'at', label: 'Time', value: (e) => fmtWhen(e.at), csv: (e) => isoOrBlank(e.at) },
  { key: 'lamp', label: 'Lamp', value: (e) => e.lamp || 'All streetlights' },
  { key: 'type', label: 'Type', value: (e) => EVENT_TYPE_LABEL[e.type] || e.type },
  { key: 'change', label: 'Change', value: (e) => `${e.previous !== null && e.previous !== undefined ? `${statusText(e, 'previous')} → ` : ''}${statusText(e, 'next')}` },
  { key: 'raw', label: 'Node status', value: (e) => e.rawStatus },
  { key: 'lux', label: 'Light', value: (e) => (e.type === 'STATUS_CHANGE' ? luxText(e.lux) : ''), csv: (e) => (typeof e.lux === 'number' ? e.lux : '') },
  { key: 'source', label: 'Source', value: (e) => SOURCE_LABEL[e.source] || e.source },
  { key: 'by', label: 'By', value: (e) => e.actorName },
  { key: 'ticket', label: 'Ticket', value: (e) => e.ticketNumber },
  { key: 'desc', label: 'Description', value: (e) => e.description, wrap: true },
];

function EventsTab() {
  const [lampInput, setLampInput] = useState('');
  const [type, setType] = useState('');
  const lamp = /^L-\d{3}$/i.test(lampInput.trim()) ? lampInput.trim().toUpperCase() : '';
  const h = useHistory({ lamp, type, pageSize: 25, refreshMs: 30000 });
  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input className={inputCls} value={lampInput} onChange={(e) => setLampInput(e.target.value)} placeholder="Lamp, e.g. L-008" aria-label="Filter events by streetlight ID" maxLength={5} />
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter events by type">
          <option value="">All events</option>
          {Object.entries(EVENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {exportBtn('events', EVENT_COLS, h.events)}
      </div>
      <Status loading={h.loading} error={h.error} />
      <DataTable columns={EVENT_COLS} rows={h.events} rowKey={(e) => e.id} empty="No events saved yet." />
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        {h.next && <button type="button" onClick={h.loadMore} disabled={h.loadingMore} className={btn}>{h.loadingMore && <LoaderCircle size={14} className="animate-spin" />} Show older events</button>}
        <span className="text-xs text-[#6b7a90]">{h.events.length} row{h.events.length === 1 ? '' : 's'} loaded. Export CSV saves the rows loaded here.</span>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Tickets
const TICKET_COLS = [
  { key: 'id', label: 'Ticket', value: (t) => t.id },
  { key: 'lamp', label: 'Lamp', value: (t) => t.lamp },
  { key: 'where', label: 'Location', value: (t) => t.where, wrap: true },
  { key: 'issue', label: 'Issue', value: (t) => t.issue, wrap: true },
  { key: 'priority', label: 'Priority', value: (t) => priorityLabel(t.priority) },
  { key: 'status', label: 'Status', value: (t) => t.status },
  { key: 'tech', label: 'Technician', value: (t) => t.technician },
  { key: 'reported', label: 'Reported', value: (t) => when(t.createdAt), csv: (t) => isoOrBlank(t.createdAt) },
  { key: 'updated', label: 'Updated', value: (t) => when(t.updatedAt), csv: (t) => isoOrBlank(t.updatedAt) },
  { key: 'resolved', label: 'Resolved', value: (t) => when(t.resolvedAt), csv: (t) => isoOrBlank(t.resolvedAt) },
  { key: 'resolution', label: 'Resolution note', value: (t) => t.resolution, wrap: true },
];

function TicketsTab() {
  const [archived, setArchived] = useState(false);
  const q = useLoad(() => apiDataTickets(archived), [archived]);
  const rows = q.data || [];
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <button type="button" className={tabCls(!archived)} onClick={() => setArchived(false)} aria-pressed={!archived}>Active</button>
        <button type="button" className={tabCls(archived)} onClick={() => setArchived(true)} aria-pressed={archived}>Archived</button>
        {exportBtn(archived ? 'archived-tickets' : 'tickets', TICKET_COLS, rows)}
      </div>
      <Status loading={q.loading} error={q.error} />
      <DataTable columns={TICKET_COLS} rows={rows} rowKey={(t) => t.dbId} empty={archived ? 'No archived tickets.' : 'No tickets saved yet.'} />
    </>
  );
}

// ------------------------------------------------------------------ Users (ADMIN only)
const USER_COLS = [
  { key: 'name', label: 'Name', value: (u) => u.fullName },
  { key: 'username', label: 'Username', value: (u) => u.username },
  { key: 'email', label: 'Email', value: (u) => u.email },
  { key: 'role', label: 'Role', value: (u) => ROLE_LABEL[u.role] || u.role },
  { key: 'status', label: 'Status', value: (u) => (u.accountStatus === 'ACTIVE' ? 'Active' : 'Inactive') },
  { key: 'login', label: 'Last sign-in', value: (u) => (u.lastLoginAt ? when(u.lastLoginAt) : 'Never'), csv: (u) => isoOrBlank(u.lastLoginAt) },
  { key: 'created', label: 'Created', value: (u) => when(u.createdAt), csv: (u) => isoOrBlank(u.createdAt) },
];

function UsersTab() {
  const q = useLoad(() => apiListUsers(), []);
  const rows = q.data || [];
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {exportBtn('users', USER_COLS, rows)}
        <span className="text-xs text-[#6b7a90]">Passwords and sign-in tokens are never shown or exported.</span>
      </div>
      <Status loading={q.loading} error={q.error} />
      <DataTable columns={USER_COLS} rows={rows} rowKey={(u) => u.id} empty="No users yet." />
    </>
  );
}

// ------------------------------------------------------------------ Schedule
const SCHEDULE_COLS = [
  { key: 'on', label: 'Lamps on', value: (s) => s.onTime },
  { key: 'off', label: 'Lamps off', value: (s) => s.offTime },
  { key: 'when', label: 'Last changed', value: (s) => (s.updatedAt ? when(s.updatedAt) : 'Never edited (default)'), csv: (s) => isoOrBlank(s.updatedAt) },
];

function ScheduleTab() {
  const q = useLoad(() => apiSchedule(), []);
  const rows = q.data ? [q.data.schedule] : [];
  return (
    <>
      <div className="mb-4">{exportBtn('schedule', SCHEDULE_COLS, rows)}</div>
      <Status loading={q.loading} error={q.error} />
      <DataTable columns={SCHEDULE_COLS} rows={rows} rowKey={() => 'schedule'} empty="No schedule saved." />
    </>
  );
}

// ------------------------------------------------------------------ Screen
const Stat = ({ Card, label, value }) => (
  <Card className="p-5">
    <div className="text-xs font-bold text-[#6b7a90]">{label}</div>
    <div className="text-2xl font-bold text-[#14233c] mt-1">{value === null || value === undefined ? '—' : value}</div>
  </Card>
);

export default function DataViewer({ Page, Header, Card, user }) {
  const showUsers = can(user.role, 'users.manage');
  const [tab, setTab] = useState('events');
  const [version, setVersion] = useState(0); // bumping it remounts the open tab, which reloads it
  const summary = useLoad(() => apiDataSummary(), []);
  const c = summary.data?.counts;
  const tabs = [['events', 'Events'], ['tickets', 'Tickets'], ...(showUsers ? [['users', 'Users']] : []), ['schedule', 'Schedule']];

  return (
    <Page>
      <Header
        title="Data"
        subtitle="What the database has saved. Read-only."
        actions={<button type="button" className={btn} onClick={() => { summary.reload(); setVersion((v) => v + 1); }}>Refresh</button>}
      />
      {summary.error && <p role="alert" className="mb-4 text-sm font-semibold text-[#e04040]">{summary.error}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-4">
        <Stat Card={Card} label="Events saved" value={c?.events} />
        <Stat Card={Card} label="Active tickets" value={c?.tickets} />
        <Stat Card={Card} label="Archived tickets" value={c?.archivedTickets} />
        {showUsers && <Stat Card={Card} label="Users" value={c?.users} />}
        <Stat Card={Card} label="Latest event" value={summary.data?.lastEventAt ? when(summary.data.lastEventAt) : summary.loading ? '…' : 'None yet'} />
      </div>
      <div className="mb-4 px-4 py-3 rounded-lg text-xs text-[#5b6b82] bg-[#f8fafc] border border-[#e1e7ee]">
        Saved here: lamp condition changes, maintenance tickets and their trail, the lighting schedule, and accounts. Live lamp readings and power (PZEM) values are shown on the Dashboard but are held in memory only, so they are not in these tables and reset when the server restarts.
      </div>
      <Card big className="p-4 md:p-6">
        <CardTitle right={<div role="tablist" aria-label="Saved data" className="flex flex-wrap gap-2">
          {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tabCls(tab === id)} onClick={() => setTab(id)}>{label}</button>)}
        </div>}>{tabs.find(([id]) => id === tab)?.[1]}</CardTitle>
        <div key={`${tab}-${version}`}>
          {tab === 'events' && <EventsTab />}
          {tab === 'tickets' && <TicketsTab />}
          {tab === 'users' && showUsers && <UsersTab />}
          {tab === 'schedule' && <ScheduleTab />}
        </div>
      </Card>
    </Page>
  );
}
