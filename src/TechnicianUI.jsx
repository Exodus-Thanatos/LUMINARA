// Technician dropdown, availability dot and the on-duty panel. Presentation only; the rules are in technicianStore.js.
import { CardTitle, Toggle, inputCls } from './uiKit.jsx';
import { ACTIVE_STATUSES } from './maintenanceStore.js';
import { listTechnicians, availability } from './technicianStore.js';

export const LEGACY = '__legacy';

// Green or red circle. Colour is never the only signal: the label always sits beside it.
export const Dot = ({ available, className = '' }) => (
  <span
    aria-hidden="true"
    className={`inline-block shrink-0 w-2.5 h-2.5 rounded-full ${available ? 'bg-[#27a85a]' : 'bg-[#e04848]'} ${className}`}
  />
);

export const AvailabilityLine = ({ info }) => (
  <span className="inline-flex items-center gap-2 flex-wrap">
    <Dot available={info.available} />
    <span className={`font-semibold ${info.available ? 'text-[#1f9a52]' : 'text-[#e04040]'}`}>{info.label}</span>
    {info.reasons.length > 0 && <span className="text-[#6b7a90] text-xs">{info.reasons.join(' · ')}</span>}
  </span>
);

/* Native <select> (best on mobile). Each option carries a coloured circle emoji + name + label, and the
   selected technician's status is repeated underneath with a drawn circle. Unavailable people are disabled,
   except the technician who already holds this ticket. */
export const TechnicianSelect = ({ id, value, onChange, users, tickets, now, ticket = null, error, hint }) => {
  const list = listTechnicians(users, tickets, now, { ignoreTicketId: ticket?.id ?? null });
  const holder = ticket && ACTIVE_STATUSES.includes(ticket.status) ? ticket.technicianId : null;
  const legacy = ticket && !ticket.technicianId && ticket.technician ? ticket.technician : '';
  const selected = list.find((t) => t.user.id === value);
  return (
    <div>
      <select
        id={id}
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={id ? `${id}-status` : undefined}
      >
        <option value="">{list.length === 0 ? 'No registered technicians' : '— Unassigned —'}</option>
        {legacy && <option value={LEGACY}>{`Previous name: ${legacy} (not a registered technician)`}</option>}
        {list.map((t) => (
          <option key={t.user.id} value={t.user.id} disabled={!t.available && t.user.id !== holder}>
            {`${t.available ? '🟢' : '🔴'} ${t.user.name} — ${t.label}${t.reasons.length ? ` · ${t.reasons.join(' · ')}` : ''}`}
          </option>
        ))}
      </select>
      <div id={id ? `${id}-status` : undefined} className="mt-1.5 text-[11px] min-h-[16px]">
        {error ? (
          <span role="alert" className="block font-semibold text-[#e04040]">{error}</span>
        ) : selected ? (
          <AvailabilityLine info={selected} />
        ) : (
          <span className="text-[#6b7a90]">{hint}</span>
        )}
      </div>
    </div>
  );
};

/* Small management section: who is on duty today, and who is free. Presence is set here, never inferred. */
export const TechnicianPanel = ({ users, tickets, now, onPresence }) => {
  const list = listTechnicians(users, tickets, now);
  return (
    <div className="bg-white border border-[#e6ebf1] rounded-2xl p-4 md:p-6 mb-6 md:mb-8">
      <CardTitle right={<span className="inline-flex items-center rounded-md px-3 h-7 text-[11px] font-bold uppercase bg-[#eceff3] text-[#5b6b82]">PROTOTYPE · REGISTERED IN THIS BROWSER</span>}>Technicians</CardTitle>
      <p className="text-xs text-[#6b7a90] -mt-2 mb-4">
        Switch a technician on duty when they are at the office. Available (green) means on duty today and not handling a ticket; everyone else is Unavailable (red). On-duty resets each day.
      </p>
      {list.length === 0 ? (
        <p className="py-4 text-sm text-[#6b7a90]">No technicians registered yet. Add one under Settings → Create Worker Account (role: Basic Worker / Technician).</p>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {list.map((t) => (
            <li key={t.user.id} className="flex items-center gap-3 rounded-xl border border-[#e6ebf1] px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-[#14233c] truncate">{t.user.name}</div>
                <div className="text-sm mt-0.5"><AvailabilityLine info={availability(t.user, tickets, now)} /></div>
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <Toggle checked={t.present} onChange={(v) => onPresence(t.user.id, v)} label={`${t.user.name} on duty today`} />
                <span className="text-[10px] font-bold uppercase text-[#6b7a90]">{t.present ? 'On duty' : 'Off duty'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
