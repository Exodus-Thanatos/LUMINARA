// Dashboard additions: connection / last-updated badge and the alert summary card. Same card, pill and colour styles as the rest of the Dashboard.
import { useNow } from './useNow.js';
import { CircleCheck } from 'lucide-react';
import { CardTitle } from './uiKit.jsx';
import { connectionState, lampFreshness } from './dashboardStatus.js';
import { SEVERITY, countBySeverity } from './faultInfo.js';
import { SeverityBadge } from './FaultDetail.jsx';

const LEVEL_STYLE = {
  fresh: ['bg-[#e3f4ea] text-[#1f9a52]', 'bg-[#27a85a]'],
  delayed: ['bg-[#fff3d6] text-[#b9770e]', 'bg-[#f0a82e]'],
  outdated: ['bg-[#fde8e8] text-[#e04040]', 'bg-[#e04848]'],
  disconnected: ['bg-[#eceff3] text-[#5b6b82]', 'bg-[#9aa7b8]'],
  connecting: ['bg-[#eceff3] text-[#5b6b82]', 'bg-[#9aa7b8] animate-pulse'],
};

export const ConnectionBadge = ({ mode, connecting, receivedAt, lastSync }) => {
  const now = useNow(1000);
  const s = connectionState({ mode, connecting, receivedAt, now });
  const [cls, dot] = LEVEL_STYLE[s.level];
  return (
    <div className="flex items-center gap-3 flex-wrap" role="status" aria-live="polite">
      <span className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold uppercase ${cls}`}>
        <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />
        {s.label}
      </span>
      <span className="text-xs text-[#6b7a90]">
        {s.level === 'disconnected' || s.level === 'connecting' ? s.detail : `${s.detail}${lastSync ? ` · ${lastSync}` : ''}`}
      </span>
    </div>
  );
};

export const AlertSummary = ({ Card, live, connecting, devices, faults, onOpen }) => {
  if (!live) {
    return (
      <Card className="px-4 md:px-6 py-4 mb-6 md:mb-7 text-sm text-[#6b7a90]">
        <span className="font-bold text-[#14233c]">Alert summary: </span>
        {connecting ? 'Waiting for the receiver…' : 'not available while the receiver is disconnected. Sample data is not treated as a real problem.'}
      </Card>
    );
  }
  const c = countBySeverity(faults);
  const f = lampFreshness(devices);
  return (
    <Card className="px-4 md:px-6 py-4 mb-6 md:mb-7">
      <CardTitle small right={<span className="text-xs text-[#6b7a90]">{f.onTime} on time · {f.late} delayed · {f.offline} offline</span>}>Alert Summary</CardTitle>
      {faults.length === 0 ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-[#1f9a52]">
          <CircleCheck size={16} aria-hidden="true" /> No active problems. All reporting lamps look normal.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[#14233c]">
            <b>{c.critical}</b> critical · <b>{c.warning}</b> warning · <b>{c.info}</b> informational
          </p>
          <ul className="flex flex-wrap gap-2">
            {faults.slice(0, 6).map((x) => (
              <li key={x.id}>
                <button onClick={() => onOpen(x.id)} className="flex items-center gap-2 h-9 pl-2 pr-3 bg-[#f8fafc] border border-[#e1e7ee] rounded-lg text-xs font-bold text-[#14233c] hover:bg-white hover:shadow-md transition-shadow" aria-label={`${x.id}, ${SEVERITY[x.severity].label}. Open details`}>
                  <SeverityBadge severity={x.severity} /> {x.id}
                </button>
              </li>
            ))}
            {faults.length > 6 && <li className="text-xs text-[#6b7a90] self-center">+{faults.length - 6} more in Recent Alerts</li>}
          </ul>
        </div>
      )}
    </Card>
  );
};
