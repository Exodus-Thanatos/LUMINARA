// Detailed view of one lamp's fault, built from faultInfo.js (what the receiver reported, possible causes, suggested checks).
import { X } from 'lucide-react';
import { Modal } from './Dialogs.jsx';
import { SEVERITY } from './faultInfo.js';

export const SeverityBadge = ({ severity }) => (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase ${SEVERITY[severity].badge}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY[severity].dot}`} aria-hidden="true" />
    {SEVERITY[severity].label}
  </span>
);

const FaultDetail = ({ fault, onClose, onOpenHelp, onOpenStreetlights }) => (
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
        <span className="text-sm font-bold text-[#14233c]">{fault.statusLabel}</span>
      </div>

      <dl className="space-y-4 text-sm">
        <div>
          <dt className="text-xs font-bold text-[#6b7a90] uppercase mb-1">Problem</dt>
          <dd className="text-[#14233c]">{fault.problem}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-[#6b7a90] uppercase mb-1">Possible causes <span className="normal-case font-normal">(not confirmed)</span></dt>
          <dd><ul className="list-disc pl-5 text-[#14233c] space-y-0.5">{fault.causes.map((c) => <li key={c}>{c}</li>)}</ul></dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-[#6b7a90] uppercase mb-1">Recommended actions</dt>
          <dd><ol className="list-decimal pl-5 text-[#14233c] space-y-0.5">{fault.actions.map((a) => <li key={a}>{a}</li>)}</ol></dd>
        </div>
        <div className="grid grid-cols-2 gap-4 bg-[#f3f6f9] rounded-lg p-4">
          <div>
            <dt className="text-xs font-bold text-[#6b7a90] uppercase mb-1">Current device status</dt>
            <dd className="text-[#14233c]">{fault.comm || '—'} · {fault.reported || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-[#6b7a90] uppercase mb-1">Last report received</dt>
            <dd className="text-[#14233c]">{fault.lastReport || '—'}</dd>
          </div>
        </div>
      </dl>
      <p className="text-[11px] text-[#6b7a90] mt-3">The system records only the time of the node’s last report. It does not record when the problem first started.</p>

      <div className="flex flex-wrap justify-end gap-3 mt-6">
        <button onClick={() => onOpenHelp(fault.help)} className="h-[42px] px-5 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50">Troubleshooting guide</button>
        <button onClick={onOpenStreetlights} className="h-[42px] px-5 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50">View streetlights</button>
        <button onClick={onClose} className="h-[42px] px-6 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52]">Close</button>
      </div>
    </div>
  </Modal>
);

export default FaultDetail;
