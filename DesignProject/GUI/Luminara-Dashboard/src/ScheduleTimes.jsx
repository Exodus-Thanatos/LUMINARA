// The ON / OFF times of the automatic lighting schedule, read from the server (the same times the receiver uses to tell
// "asleep as planned" from "offline"). Everyone who can see the dashboard can read it; only an administrator can change it.
// NOTE: the lamps themselves still follow the times stored in their firmware; this screen does not reprogram them.
import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { apiSchedule, apiSaveSchedule } from './api.js';
import { inputCls } from './uiKit.jsx';
import { fmt12 } from './scheduleFormat.js';

export default function ScheduleTimes({ canEdit = false }) {
  const [data, setData] = useState(null); // { schedule, summary }
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(null); // { onTime, offTime } while editing
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let alive = true;
    const run = () =>
      apiSchedule()
        .then((d) => { if (alive) { setData(d); setError(''); } })
        .catch((e) => { if (alive) setError(e.message || 'Could not load the schedule.'); });
    run();
    const id = setInterval(() => { if (document.visibilityState === 'visible') run(); }, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const save = async () => {
    setSaving(true);
    setFieldErrors({});
    try {
      setData(await apiSaveSchedule(edit.onTime, edit.offTime));
      setEdit(null);
      setError('');
    } catch (e) {
      setFieldErrors(e.fields || {});
      setError(e.fields && Object.keys(e.fields).length ? '' : e.message);
    } finally {
      setSaving(false);
    }
  };

  const s = data?.schedule;
  const sum = data?.summary;
  return (
    <div className="px-2">
      <div className="flex gap-6 sm:gap-24 flex-wrap">
        <div>
          <div className="font-bold">Lights ON</div>
          {edit ? (
            <input type="time" className={`${inputCls} mt-2 w-36`} value={edit.onTime} onChange={(e) => setEdit({ ...edit, onTime: e.target.value })} aria-label="Lights ON time" />
          ) : (
            <div className="text-2xl sm:text-3xl font-bold text-[#27a85a] mt-2">{s ? fmt12(s.onTime) : '…'}</div>
          )}
          {fieldErrors.onTime && <div role="alert" className="text-[11px] font-semibold text-[#e04040] mt-1">{fieldErrors.onTime}</div>}
        </div>
        <div>
          <div className="font-bold">Lights OFF</div>
          {edit ? (
            <input type="time" className={`${inputCls} mt-2 w-36`} value={edit.offTime} onChange={(e) => setEdit({ ...edit, offTime: e.target.value })} aria-label="Lights OFF time" />
          ) : (
            <div className="text-2xl sm:text-3xl font-bold mt-2">{s ? fmt12(s.offTime) : '…'}</div>
          )}
          {fieldErrors.offTime && <div role="alert" className="text-[11px] font-semibold text-[#e04040] mt-1">{fieldErrors.offTime}</div>}
        </div>
      </div>

      {sum && !edit && (
        <p className="text-sm mt-4" aria-live="polite">
          Operating state now: <span className={`font-bold ${sum.state === 'ON' ? 'text-[#27a85a]' : 'text-[#5b6b82]'}`}>{sum.state === 'ON' ? 'Lights should be ON' : 'Lights should be OFF'}</span>
          <span className="text-[#6b7a90]"> · switches {sum.nextChange} at {new Date(sum.nextChangeAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
        </p>
      )}
      {error && <p role="alert" className="text-sm text-[#e04040] mt-3">{error}</p>}

      {canEdit && (
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          {edit ? (
            <>
              <button type="button" onClick={save} disabled={saving} className="h-10 px-4 rounded-lg bg-[#27a85a] text-white text-sm font-bold disabled:opacity-60 inline-flex items-center gap-2">
                {saving && <LoaderCircle size={14} className="animate-spin" />} Save times
              </button>
              <button type="button" onClick={() => { setEdit(null); setFieldErrors({}); setError(''); }} disabled={saving} className="h-10 px-4 rounded-lg bg-[#eceff3] text-[#5b6b82] text-sm font-bold">Cancel</button>
            </>
          ) : (
            <button type="button" disabled={!s} onClick={() => setEdit({ onTime: s.onTime, offTime: s.offTime })} className="h-10 px-4 rounded-lg bg-[#eceff3] text-[#5b6b82] text-sm font-bold hover:bg-[#e1e6ec] disabled:opacity-60">Edit times</button>
          )}
        </div>
      )}
      <p className="text-[11px] text-[#6b7a90] mt-3">
        {canEdit ? 'These times are saved on the server and recorded in the history. ' : 'Read only. Only an administrator can change the times. '}
        The lamps keep following the times stored in their firmware, so keep both the same.
      </p>
    </div>
  );
}
