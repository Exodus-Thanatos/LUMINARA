// Admin-only list of archived (removed) maintenance tickets, with their full history and a Restore action.
import { useState } from 'react';
import { PRIORITY_BADGE, TICKET_STATUS_BADGE } from './ticketBadges.js';
import { priorityLabel } from './maintenancePriority.js';

const stamp = (ms) => (ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const Tag = ({ cls, children }) => <span className={`inline-flex items-center justify-center rounded-md text-[11px] font-bold uppercase px-2.5 h-7 ${cls}`}>{children}</span>;
const Item = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-[10px] font-bold uppercase text-[#6b7a90]">{label}</dt>
    <dd className="text-sm text-[#14233c] break-words">{children}</dd>
  </div>
);

export default function ArchivedTickets({ tickets, loading, error, canRestore, onRestore, onClose }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="bg-white border border-[#e6ebf1] rounded-2xl p-4 md:p-6 mt-6 md:mt-8" aria-label="Archived maintenance records">
      <div className="flex items-center justify-between gap-3 flex-wrap pb-3 mb-4 border-b border-[#e6ebf1]">
        <h3 className="font-bold text-[#14233c] text-lg">Archived maintenance records</h3>
        <button type="button" onClick={onClose} className="h-[38px] px-4 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50">Hide archive</button>
      </div>
      <p className="text-xs text-[#6b7a90] -mt-1 mb-4">Removed tickets are kept here with their full history. Nothing is deleted from the database.</p>
      {error && <div role="alert" className="mb-3 text-sm font-semibold text-[#e04040]">{error}</div>}
      {loading ? <p className="py-8 text-center text-sm text-[#6b7a90]">Loading archived records…</p> : tickets.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#6b7a90]">No archived tickets yet. Resolved tickets you remove from the active list will appear here.</p>
      ) : (
        <ul className="divide-y divide-[#e6ebf1]">
          {tickets.map((t) => {
            const expanded = open === t.dbId;
            return (
              <li key={t.dbId} className="py-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="font-bold text-sm w-20">{t.id}</span>
                  <span className="text-sm min-w-0 flex-1 basis-48"><b>{t.lamp}</b> • {t.where}<span className="block text-xs text-[#6b7a90] truncate" title={t.issue}>{t.issue}</span></span>
                  <Tag cls={PRIORITY_BADGE[t.priority]}>{priorityLabel(t.priority)}</Tag>
                  <Tag cls={TICKET_STATUS_BADGE[t.status]}>{t.status}</Tag>
                  <span className="text-xs text-[#6b7a90]">Archived {stamp(t.archivedAt)}</span>
                  <div className="flex gap-2 ml-auto">
                    <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : t.dbId)} className="h-[36px] px-4 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50">{expanded ? 'Hide details' : 'Details'}</button>
                    {canRestore && <button type="button" onClick={() => onRestore(t)} aria-label={`Restore ticket ${t.id}`} className="h-[36px] px-4 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52]">Restore</button>}
                  </div>
                </div>
                {expanded && (
                  <div className="mt-4 rounded-xl bg-[#f8fafc] border border-[#e6ebf1] p-4">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                      <Item label="Ticket number">{t.id}</Item>
                      <Item label="Streetlight ID">{t.lamp}</Item>
                      <Item label="Location">{t.where}</Item>
                      <Item label="Issue description">{t.issue}</Item>
                      <Item label="Assigned technician">{t.technician || 'Unassigned'}</Item>
                      <Item label="Priority">{priorityLabel(t.priority)}</Item>
                      <Item label="Report date">{stamp(t.createdAt)}</Item>
                      <Item label="Resolution date">{stamp(t.resolvedAt)}{t.resolution ? ` · ${t.resolution}` : ''}</Item>
                      <Item label="Archived">{stamp(t.archivedAt)}{t.archivedByName ? ` by ${t.archivedByName}` : ''}</Item>
                    </dl>
                    <div className="text-[10px] font-bold uppercase text-[#6b7a90] mt-4 mb-2">Maintenance history</div>
                    <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {t.history.map((h, i) => (
                        <li key={i} className="text-xs text-[#5b6b82]"><span className="font-semibold text-[#14233c]">{stamp(h.at)}</span> · {h.text}{h.by ? ` — ${h.by}` : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
