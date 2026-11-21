// The simplified, READ-ONLY screens of the BASIC role: dashboard, Assigned Works, History and Schedule.
// Nothing here can change a lamp, a schedule, a ticket or a setting; the server refuses those requests for BASIC anyway.
import { useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { CardTitle } from './uiKit.jsx';
import HistoryPanel from './HistoryPanel.jsx';
import ScheduleTimes from './ScheduleTimes.jsx';
import { useHistory } from './useHistory.js';
import { useAssignedWorks } from './useAssignedWorks.js';
import { healthOf, TONE_PILL, TONE_DOT } from './lampHealthUi.js';
import { PRIORITY_BADGE, TICKET_STATUS_BADGE } from './ticketBadges.js';
import { priorityLabel } from './maintenancePriority.js';
import { EVENT_TYPE_LABEL, eventDot, fmtWhen, statusText } from './historyUi.js';
import { assignedAt, sortAssigned, fmtDate } from './basicDashboard.js';
import { summarize as summarizeLights } from './streetlightStatus.js';

const Badge = ({ cls, children }) => <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-bold uppercase whitespace-nowrap ${cls}`}>{children}</span>;

// One lamp's plain-language state (CONNECTED / GOOD, WARNING, FAULT, BLINKING, SLEEPING, OFFLINE ...).
const LampState = ({ d }) => {
  const h = healthOf(d);
  if (!h) return <Badge cls="bg-[#eceff3] text-[#5b6b82]">{d.status}</Badge>;
  return (
    <span title={h.long} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase whitespace-nowrap ${TONE_PILL[h.tone]}`}>
      <span className={`w-2 h-2 rounded-full ${TONE_DOT[h.tone]} ${h.animate ? 'lm-blink' : ''}`} aria-hidden="true"></span>
      {h.label}
    </span>
  );
};

const Loading = ({ children }) => <p className="text-sm text-[#6b7a90] inline-flex items-center gap-2"><LoaderCircle size={14} className="animate-spin" /> {children}</p>;

const WorkCard = ({ t, fullName }) => (
  <li className="border border-[#e6ebf1] rounded-xl p-4">
    <div className="flex flex-wrap items-center gap-2 justify-between">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-sm">{t.lamp}</span>
        <span className="text-xs text-[#6b7a90]">Ticket {t.id}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge cls={PRIORITY_BADGE[t.priority] || 'bg-[#eceff3] text-[#5b6b82]'}>{priorityLabel(t.priority)}</Badge>
        <Badge cls={TICKET_STATUS_BADGE[t.status] || 'bg-[#eceff3] text-[#5b6b82]'}>{t.status}</Badge>
      </div>
    </div>
    <p className="text-sm mt-2 break-words">{t.issue}</p>
    <div className="text-xs text-[#6b7a90] mt-2 flex flex-wrap gap-x-4 gap-y-1">
      <span>{t.where}</span>
      <span>Assigned {fmtDate(assignedAt(t, fullName))}</span>
    </div>
  </li>
);

export function AssignedWorks({ Page, Header, Card, user }) {
  const { tickets, loading, error } = useAssignedWorks();
  const list = sortAssigned(tickets, user.fullName);
  return (
    <Page>
      <Header title="Assigned Works" subtitle="Maintenance works assigned to you (view only)" />
      <Card big className="p-5 sm:p-7">
        {loading && <Loading>Loading your assigned works…</Loading>}
        {error && <p role="alert" className="text-sm text-[#e04040]">{error}</p>}
        {!loading && !error && list.length === 0 && (
          <p className="text-sm text-[#6b7a90]">No maintenance works are assigned to you right now. When an administrator assigns a repair to you, it appears here with its priority and status.</p>
        )}
        <ul className="space-y-3">{list.map((t) => <WorkCard key={t.dbId} t={t} fullName={user.fullName} />)}</ul>
        <p className="text-[11px] text-[#6b7a90] mt-4">View only. Technicians update the status of a repair; a Basic account cannot change tickets.</p>
      </Card>
    </Page>
  );
}

export function BasicHistory({ Page, Header, Card }) {
  return (
    <Page>
      <Header title="History" subtitle="Streetlight status changes and maintenance updates, saved permanently" />
      <HistoryPanel Card={Card} pageSize={15} />
    </Page>
  );
}

export function BasicSchedule({ Page, Header, Card, devices, mode }) {
  return (
    <Page>
      <Header title="Lighting Schedule" subtitle="When the streetlights switch ON and OFF (view only)" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-start">
        <Card big className="p-5 sm:p-7">
          <CardTitle>Scheduled ON / OFF</CardTitle>
          <ScheduleTimes canEdit={false} />
        </Card>
        <Card big className="p-5 sm:p-7">
          <CardTitle>Current operating state</CardTitle>
          {mode !== 'live' && <p className="text-xs text-[#8a6410] bg-[#fffaf0] border border-[#f6d587] rounded-lg px-3 py-2 mb-3">The receiver is not connected, so these are demo values, not real lamps.</p>}
          {devices.length === 0 && <p className="text-sm text-[#6b7a90]">No lamp nodes detected yet. A lamp appears here when its node first reports.</p>}
          <ul className="divide-y divide-[#eef1f5]">
            {devices.map((d) => (
              <li key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-sm">{d.id}</div>
                  <div className="text-[11px] text-[#6b7a90]">{d.time ? `Last report ${d.time}` : 'No report yet'}</div>
                </div>
                <LampState d={d} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}

const Tile = ({ label, value, note, bg, loading }) => (
  <div className="bg-white border border-[#e6ebf1] rounded-xl p-4 md:p-6">
    <div className="flex items-start gap-4">
      <div className={`w-10 h-10 shrink-0 rounded-full ${bg} flex items-center justify-center text-white text-sm font-bold`}><span className="w-1.5 h-1.5 bg-white rounded-full"></span></div>
      <div>
        <div className="text-xs font-semibold text-[#5b6b82] uppercase">{label}</div>
        {loading ? <div className="h-10 w-14 mt-1 rounded-md bg-[#e6ebf1] animate-pulse" role="status" aria-label={`Loading ${label}`} /> : <div className="text-4xl font-bold leading-tight">{String(value).padStart(2, '0')}</div>}
      </div>
    </div>
    <div className="text-xs text-[#6b7a90] mt-3">{note}</div>
  </div>
);

function RecentActivity({ Card, onNavigate }) {
  const h = useHistory({ pageSize: 5 });
  return (
    <Card big className="p-6">
      <CardTitle>Recent History</CardTitle>
      {h.loading && <Loading>Loading history…</Loading>}
      {h.error && <p role="alert" className="text-sm text-[#e04040]">{h.error}</p>}
      {!h.loading && !h.error && h.events.length === 0 && <p className="text-sm text-[#6b7a90]">No history recorded yet.</p>}
      <ol className="space-y-3">
        {h.events.map((e) => (
          <li key={e.id} className="flex items-start gap-3">
            <span className={`w-3 h-3 mt-1 rounded-full shrink-0 ${eventDot(e)}`} aria-hidden="true"></span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#6b7a90]">{fmtWhen(e.at)} · {e.lamp || 'All streetlights'} · {EVENT_TYPE_LABEL[e.type]}</div>
              <div className="text-sm font-semibold break-words">{statusText(e, 'next')}</div>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => onNavigate('history')} className="mt-4 text-xs font-bold text-[#27a85a] hover:underline">See all history</button>
    </Card>
  );
}

function WorksPreview({ Card, user, onNavigate }) {
  const { tickets, loading, error } = useAssignedWorks();
  const open = sortAssigned(tickets, user.fullName).filter((t) => t.status !== 'RESOLVED');
  return (
    <Card big className="p-6">
      <CardTitle>My Assigned Works</CardTitle>
      {loading && <Loading>Loading…</Loading>}
      {error && <p role="alert" className="text-sm text-[#e04040]">{error}</p>}
      {!loading && !error && open.length === 0 && <p className="text-sm text-[#6b7a90]">Nothing is assigned to you right now.</p>}
      <ul className="space-y-3">
        {open.slice(0, 3).map((t) => (
          <li key={t.dbId} className="flex items-center justify-between gap-2">
            <div className="min-w-0"><div className="font-bold text-sm">{t.lamp}</div><div className="text-xs text-[#6b7a90] truncate">{t.issue}</div></div>
            <Badge cls={TICKET_STATUS_BADGE[t.status] || ''}>{t.status}</Badge>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onNavigate('works')} className="mt-4 text-xs font-bold text-[#27a85a] hover:underline">{open.length > 3 ? `See all (${open.length})` : 'Open Assigned Works'}</button>
    </Card>
  );
}

export function BasicDashboard({ Page, Header, Card, Pill, devices, connecting, actions, user, onNavigate, MapComp, mapProps, focusRequest }) {
  // Same ONE dataset and the same status words as the administrator's dashboard (read-only: no actions are passed to the map).
  const [records, setRecords] = useState(null);
  const s = useMemo(() => (records ? summarizeLights(records) : null), [records]);
  const busy = connecting || !s;
  return (
    <Page>
      <Header title="Dashboard Overview" subtitle={`Welcome, ${user.fullName}. You have view-only access.`} actions={actions} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-7">
        <Tile label="Total Streetlights" value={s ? s.total : ''} note={s ? `${s.installed} installed, ${s.noDevice} no device` : ''} bg="bg-[#27a85a]" loading={busy} />
        <Tile label="Online" value={s ? s.online : ''} note="Communicating with the system" bg="bg-[#27a85a]" loading={busy} />
        <Tile label="Offline" value={s ? s.offline : ''} note="No recent report" bg="bg-[#f0a82e]" loading={busy} />
        <Tile label="Fault Alerts" value={s ? s.fault : ''} note="Confirmed faults" bg="bg-[#e04848]" loading={busy} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.9fr_1fr] gap-6 lg:gap-8 items-start">
        <div className="space-y-6">
          {MapComp ? (
            <MapComp Page={Page} Header={Header} Card={Card} Pill={Pill} devices={devices} embedded simple active onRecords={setRecords} focusRequest={focusRequest} {...mapProps} onOpenMaintenance={undefined} onOpenControls={undefined} onOpenFault={undefined} />
          ) : (
            <Card big className="p-10 text-center text-sm text-[#6b7a90] inline-flex items-center gap-3 justify-center w-full"><LoaderCircle size={18} className="animate-spin" /> Loading map</Card>
          )}
          <Card big className="p-6">
            <CardTitle>Lighting Schedule</CardTitle>
            <ScheduleTimes canEdit={false} />
          </Card>
        </div>
        <div className="space-y-6">
          <WorksPreview Card={Card} user={user} onNavigate={onNavigate} />
          <RecentActivity Card={Card} onNavigate={onNavigate} />
        </div>
      </div>
    </Page>
  );
}
