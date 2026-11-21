// Streetlight History: the permanent record (lamp condition changes, maintenance updates, schedule edits).
// Read-only. The data comes from the database through /api/history, so it is the same after a refresh or a server restart.
import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { CardTitle, inputCls } from './uiKit.jsx';
import { useHistory } from './useHistory.js';
import { EVENT_TYPE_LABEL, SOURCE_LABEL, eventDot, fmtWhen, luxText, statusText } from './historyUi.js';

const LAMP_RE = /^L-\d{3}$/i;

// Compact on purpose: the Dashboard shows it next to other panels, so the list scrolls inside a fixed-height area instead of
// stretching the page. Long descriptions are clamped to two lines (the full text is in the tooltip).
export default function HistoryPanel({ Card, pageSize = 8 }) {
  const [lampInput, setLampInput] = useState('');
  const [type, setType] = useState('');
  const lamp = LAMP_RE.test(lampInput.trim()) ? lampInput.trim().toUpperCase() : '';
  const h = useHistory({ lamp, type, pageSize });

  return (
    <Card big className="p-4 sm:p-5">
      <CardTitle small>Streetlight History</CardTitle>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          className={inputCls}
          value={lampInput}
          onChange={(e) => setLampInput(e.target.value)}
          placeholder="Lamp, e.g. L-008"
          aria-label="Filter history by streetlight ID"
          maxLength={5}
        />
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter history by event type">
          <option value="">All events</option>
          {Object.entries(EVENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {lampInput.trim() && !lamp && <p className="text-[11px] text-[#6b7a90] mb-3">Type the full lamp ID (letter L, a dash and three digits) to filter.</p>}

      {h.loading && <p className="text-sm text-[#6b7a90] inline-flex items-center gap-2"><LoaderCircle size={14} className="animate-spin" /> Loading history…</p>}
      {h.error && <p role="alert" className="text-sm text-[#e04040]">{h.error}</p>}
      {!h.loading && !h.error && h.events.length === 0 && <p className="text-sm text-[#6b7a90]">No history recorded yet. Events appear here when a lamp changes condition, a maintenance ticket is updated or the schedule is edited.</p>}

      <div className="max-h-[22rem] overflow-y-auto pr-2 -mr-2" tabIndex={0} role="region" aria-label="Streetlight history events">
      <ol className="space-y-3">
        {h.events.map((e) => (
          <li key={e.id} className="flex items-start gap-2.5">
            <span className={`w-3 h-3 mt-1 rounded-full shrink-0 ${eventDot(e)}`} aria-hidden="true"></span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#6b7a90]">
                {fmtWhen(e.at)} · {e.lamp || 'All streetlights'} · {EVENT_TYPE_LABEL[e.type]}
              </div>
              <div className="text-sm mt-0.5 break-words">
                <span className="font-semibold">{e.previous !== null && e.previous !== undefined ? `${statusText(e, 'previous')} → ` : ''}{statusText(e, 'next')}</span>
              </div>
              <div className="text-xs text-[#6b7a90] mt-0.5 break-words line-clamp-2" title={e.description}>{e.description}</div>
              <div className="text-[11px] text-[#8895a7] mt-0.5">
                {e.type === 'STATUS_CHANGE' && <>{luxText(e.lux)} · </>}
                {e.ticketNumber && <>Ticket {e.ticketNumber} · </>}
                {SOURCE_LABEL[e.source] || e.source}{e.actorName ? ` · ${e.actorName}` : ''}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {h.next && (
        <button type="button" onClick={h.loadMore} disabled={h.loadingMore} className="mt-3 h-9 px-4 rounded-lg bg-[#eceff3] text-[#5b6b82] text-sm font-bold hover:bg-[#e1e6ec] disabled:opacity-60 inline-flex items-center gap-2">
          {h.loadingMore && <LoaderCircle size={14} className="animate-spin" />} Show older events
        </button>
      )}
      </div>
    </Card>
  );
}
