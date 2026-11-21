// Detailed view of one lamp's fault. Two sources, both existing:
//   faultInfo.js         what the receiver reported, possible causes, suggested checks (unchanged)
//   streetlightStatus.js the standard status model: the specific fault TYPE, its description, affected component and detection method
// Added here: Fault Information (type, description, severity, suggested P1-P4 priority, detection time from the history log,
// current condition, affected component, related maintenance ticket) and a ticket action for roles that may create tickets.
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from './Dialogs.jsx';
import { SEVERITY } from './faultInfo.js';
import { apiHistory, apiListTickets } from './api.js';
import { classifyStreetlight, conditionSince, minutesSince, formatActive, FAULT_CATALOG, DETECTION_LABEL } from './streetlightStatus.js';
import { suggestPriority, priorityLabel } from './maintenancePriority.js';

export const SeverityBadge = ({ severity }) => (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase ${SEVERITY[severity].badge}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY[severity].dot}`} aria-hidden="true" />
    {SEVERITY[severity].label}
  </span>
);

const btn = 'h-[42px] px-5 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50';
const Label = ({ children }) => <dt className="text-xs font-bold text-[#6b7a90] uppercase mb-1">{children}</dt>;

const FaultDetail = ({ fault, device, canViewHistory = false, canViewTickets = false, onCreateTicket, onClose, onOpenHelp, onOpenStreetlights, onLocate }) => {
  const cls = classifyStreetlight(device);
  const type = cls.faultType ? FAULT_CATALOG[cls.faultType] : null;
  const healthKey = device && device.health && device.health.key;

  // Detection time: from the status history (never guessed). undefined = loading, null = not in the log.
  const [since, setSince] = useState(canViewHistory && healthKey ? undefined : null);
  // Related unresolved ticket for this lamp. undefined = loading, null = none (or not allowed to see tickets).
  const [ticket, setTicket] = useState(canViewTickets ? undefined : null);
  useEffect(() => {
    let alive = true;
    if (canViewHistory && healthKey) {
      apiHistory({ lamp: fault.id, type: 'STATUS_CHANGE', limit: 40 })
        .then((r) => alive && setSince(conditionSince(r.events || [], healthKey)))
        .catch(() => alive && setSince(null));
    }
    if (canViewTickets) {
      apiListTickets()
        .then((r) => alive && setTicket(r.tickets.find((t) => t.lamp === fault.id && t.status !== 'RESOLVED') || null))
        .catch(() => alive && setTicket(null));
    }
    return () => {
      alive = false;
    };
  }, [fault.id, healthKey, canViewHistory, canViewTickets]);

  const minutes = typeof since === 'number' ? minutesSince(since) : null;
  const sug = cls.faultType ? suggestPriority(cls.faultType, { minutesActive: minutes ?? undefined }) : null;
  const when = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <Modal labelledBy="fault-title" onClose={onClose} wide>
      <div className="p-6">
        <div className="flex items-start justify-between gap-3 pb-3 mb-4 border-b border-[#e6ebf1]">
          <div>
            <h2 id="fault-title" className="text-xl font-bold text-[#14233c]">Streetlight {fault.id}</h2>
            <p className="text-xs text-[#6b7a90] mt-0.5">{fault.location}</p>
          </div>
          <button onClick={onClose} aria-label="Close fault details" className="w-9 h-9 -mr-2 -mt-1 rounded-lg text-[#6b7a90] hover:bg-gray-100 flex items-center justify-center">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap mb-5">
          <SeverityBadge severity={fault.severity} />
          <span className="text-sm font-bold text-[#14233c]">{cls.statusId === 'NO_DEVICE' ? fault.statusLabel : cls.label}</span>
        </div>

        {type && (
          <section aria-label="Fault information" className="rounded-xl border border-[#e1e7ee] bg-[#f8fafc] p-4 mb-5">
            <h3 className="text-xs font-bold text-[#5b6b82] uppercase mb-3">Fault information</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div><Label>Fault type</Label><dd className="font-bold text-[#14233c]">{type.label}</dd></div>
              <div><Label>Detected automatically</Label><dd>{DETECTION_LABEL[type.detection]}</dd></div>
              <div className="sm:col-span-2"><Label>Description</Label><dd>{type.description}</dd></div>
              <div><Label>Affected component</Label><dd>{type.component}</dd></div>
              <div>
                <Label>Current condition</Label>
                <dd>Active{minutes != null ? ` for ${formatActive(minutes)}` : ''}</dd>
              </div>
              <div>
                <Label>Detected</Label>
                <dd>
                  {since === undefined ? 'Checking the history…' : typeof since === 'number' ? when(since) : `Not in the history log. Last report: ${fault.lastReport || '—'}`}
                </dd>
              </div>
              <div>
                <Label>Suggested maintenance priority</Label>
                <dd>
                  <span className="font-bold">{sug.label}</span>
                  <ul className="mt-1 text-xs text-[#6b7a90] list-disc pl-4">{sug.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  <span className="text-xs text-[#6b7a90]">A suggestion only. The final priority is set by the person creating the ticket.</span>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <Label>Related maintenance ticket</Label>
                <dd>
                  {ticket === undefined && 'Checking…'}
                  {ticket === null && (canViewTickets ? 'No open ticket for this streetlight.' : 'Not available for this account.')}
                  {ticket && (
                    <span><span className="font-bold">{ticket.id}</span> · {priorityLabel(ticket.priority)} · {String(ticket.status).replace('_', ' ').toLowerCase()}</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>
        )}

        {cls.statusId === 'OFFLINE' && (
          <p className="text-xs text-[#6b7a90] mb-4">This is a communication problem. The lamp itself may be fine: the system simply cannot hear from this node.</p>
        )}

        <dl className="space-y-4 text-sm">
          <div>
            <Label>Problem</Label>
            <dd className="text-[#14233c]">{fault.problem}</dd>
          </div>
          <div>
            <Label>Possible causes <span className="normal-case font-normal">(not confirmed)</span></Label>
            <dd><ul className="list-disc pl-5 text-[#14233c] space-y-0.5">{fault.causes.map((c) => <li key={c}>{c}</li>)}</ul></dd>
          </div>
          <div>
            <Label>Recommended actions</Label>
            <dd><ol className="list-decimal pl-5 text-[#14233c] space-y-0.5">{fault.actions.map((a) => <li key={a}>{a}</li>)}</ol></dd>
          </div>
          <div className="grid grid-cols-2 gap-4 bg-[#f3f6f9] rounded-lg p-4">
            <div>
              <Label>Current device status</Label>
              <dd className="text-[#14233c]">{fault.comm || '—'} · {fault.reported || '—'}</dd>
            </div>
            <div>
              <Label>Last report received</Label>
              <dd className="text-[#14233c]">{fault.lastReport || '—'}</dd>
            </div>
          </div>
        </dl>
        <p className="text-[11px] text-[#6b7a90] mt-3">
          {typeof since === 'number' ? 'The detection time comes from the status history log.' : 'When the history log has no entry, only the time of the node’s last report is known.'} Recovery is shown only when the node itself reports normal again.
        </p>

        <div className="flex flex-wrap justify-end gap-3 mt-6">
          <button onClick={() => onOpenHelp(fault.help)} className={btn}>Troubleshooting guide</button>
          {onLocate && <button onClick={onLocate} className={btn}>Locate on map</button>}
          <button onClick={onOpenStreetlights} className={btn}>View streetlights</button>
          {onCreateTicket && type && ticket === null && (
            <button onClick={() => onCreateTicket({ lamp: fault.id, where: fault.location, issue: `${type.label}: ${type.short}`, priority: sug.value })} className={btn}>Create maintenance ticket</button>
          )}
          <button onClick={onClose} className="h-[42px] px-6 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52]">Close</button>
        </div>
      </div>
    </Modal>
  );
};

export default FaultDetail;
