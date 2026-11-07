import { memo, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { Zap, ChevronDown } from 'lucide-react';
import { usePzem, usePowerHistory, fmtValue, fmtAge, fmtClock } from './usePzem.js';

/* ==========================================================================
   THE VOLTAGE CARD (power meter)
   ONE card on the Dashboard. Click it and it expands inline (no page, tab, modal or drawer) to show current, power, energy,
   frequency, power factor and the power history. Click again to collapse. It stays visible and highlighted in both states.

   Honesty rules: a value that was not received is "Unavailable" (never 0), a value the firmware does not send is "Not reported",
   old values are labeled, and test data is labeled TEST DATA. The chart and its data request exist only while the card is open.
   ========================================================================== */

// Colours come from the existing LUMINARA palette (the same ones the lamp tiles and tags already use).
const STATUS = {
  LIVE: { label: 'LIVE', border: 'border-[#27a85a]', ring: 'ring-[#27a85a]/15', head: 'bg-[#f4fbf7]', icon: 'bg-[#27a85a]', pill: 'bg-[#e3f4ea] text-[#1f9a52]' },
  STALE: { label: 'STALE', border: 'border-[#f0b84a]', ring: 'ring-[#f0b84a]/20', head: 'bg-[#fffaf0]', icon: 'bg-[#f0a82e]', pill: 'bg-[#fff3d6] text-[#c98a0a]' },
  OFFLINE: { label: 'OFFLINE', border: 'border-[#9aa7b8]', ring: 'ring-[#9aa7b8]/20', head: 'bg-[#f6f8fa]', icon: 'bg-[#9aa7b8]', pill: 'bg-[#eceff3] text-[#5b6b82]' },
};

const METRICS = [
  { key: 'v', label: 'Voltage', unit: 'V', digits: 1 },
  { key: 'i', label: 'Current', unit: 'A', digits: 2 },
  { key: 'p', label: 'Active Power', unit: 'W', digits: 1 },
  { key: 'e', label: 'Energy', unit: 'kWh', digits: 3 },
  { key: 'f', label: 'Frequency', unit: 'Hz', digits: 1, optional: true },
  { key: 'pf', label: 'Power Factor', unit: '', digits: 2, optional: true },
];

const RANGE_OPTIONS = [
  ['1h', '1 hour'],
  ['6h', '6 hours'],
  ['24h', '24 hours'],
];

const fmtDuration = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60000)} min`);
const fmtHM = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// One-line explanation under the big number (the collapsed card must say what state the meter is in).
function headerNote(p) {
  const at = p.lastUpdate ? fmtClock(p.lastUpdate) : '';
  switch (p.why) {
    case 'ok':
      return `Last update ${at} (${fmtAge(p.ageMs)})`;
    case 'silent':
      return `No readings since ${at} (${fmtAge(p.ageMs)})`;
    case 'no-data':
      return p.controllerOnline ? 'Controller connected, but no meter readings yet' : 'No meter readings received yet';
    case 'no-receiver':
      return 'Receiver not connected';
    default:
      return 'Waiting for the receiver';
  }
}

// Message inside the expanded section (null = nothing to explain).
function banner(p) {
  if (p.why === 'no-receiver') return { tone: 'idle', text: 'The dashboard cannot reach the receiver, so no meter data is available.' };
  if (p.why === 'waiting') return { tone: 'idle', text: 'The receiver has not sent any meter information yet. Make sure the receiver is updated and running.' };
  if (p.why === 'no-data') {
    return {
      tone: 'idle',
      text: p.controllerOnline
        ? 'The relay controller is connected, but it is not sending valid meter readings. Check the PZEM and its connection to the ESP32.'
        : 'No meter readings have been received since the receiver started, and the relay controller is not connected.',
    };
  }
  if (p.why === 'silent') {
    return {
      tone: 'idle',
      text: `No readings for ${fmtAge(p.ageMs).replace(' ago', '')}. The values below are unavailable. Last reading was at ${fmtClock(p.lastUpdate)}.${
        p.controllerOnline ? ' The relay controller is still connected, so the meter or its connection may be down.' : ''
      }`,
    };
  }
  if (p.status === 'STALE') return { tone: 'warn', text: `Readings are getting old. Showing the last known values from ${fmtClock(p.lastUpdate)}.` };
  return null;
}

const BANNER_CLS = {
  idle: 'bg-[#eceff3] text-[#5b6b82]',
  warn: 'bg-[#fff3d6] text-[#8a6410]',
  test: 'bg-[#fdf2d9] text-[#8a6410]',
};

/* ---------------------------- the history chart ---------------------------- */

const PowerTip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const pt = payload[0].payload;
  if (pt.p === null) return null;
  return (
    <div className="bg-white border border-[#e6ebf1] rounded-lg px-3 py-2 text-xs shadow-sm">
      <div className="font-bold text-[#14233c] text-sm">{pt.p.toFixed(1)} W</div>
      <div className="text-[#6b7a90]">{fmtClock(pt.t)}</div>
    </div>
  );
};

const PowerChart = memo(function PowerChart({ data }) {
  const ticks = useMemo(() => Array.from({ length: 5 }, (_, k) => data.from + ((data.to - data.from) * k) / 4), [data.from, data.to]);
  return (
    <div className="h-56 md:h-72 w-full" role="img" aria-label={`Power history in watts for the last ${data.range}, ${data.samples} readings`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.points} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e3e8ee" />
          <XAxis
            dataKey="t"
            type="number"
            domain={[data.from, data.to]}
            ticks={ticks}
            tickFormatter={fmtHM}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6b7a90', fontSize: 11 }}
          />
          <YAxis
            width={64}
            domain={[0, 'auto']}
            allowDecimals={false}
            tickFormatter={(w) => `${Math.round(w)} W`}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6b7a90', fontSize: 11 }}
          />
          <Tooltip content={<PowerTip />} isAnimationActive={false} />
          {/* A bucket with no readings is null: the line breaks there instead of bridging an outage. Dots keep isolated readings visible. */}
          <Line type="linear" dataKey="p" stroke="#27a85a" strokeWidth={2} dot={{ r: 2.5, fill: '#27a85a', strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

// Mounted ONLY while the card is expanded, so a collapsed card renders no chart and makes no history requests.
const PowerHistory = memo(function PowerHistory({ range }) {
  const { status, data } = usePowerHistory(range, true);

  if (!data) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-[#6b7a90]" role="status">
        {status === 'error' ? 'History could not be loaded from the receiver. Trying again shortly.' : 'Loading history…'}
      </div>
    );
  }
  if (data.samples === 0) {
    return (
      <div className="rounded-lg bg-[#f6f8fa] border border-[#e6ebf1] px-4 py-8 text-center">
        <p className="text-sm font-bold text-[#14233c]">No history yet</p>
        <p className="text-xs text-[#6b7a90] mt-1.5 max-w-md mx-auto">
          Readings are recorded while the meter is sending valid data. Nothing has been recorded for this period.
          {!data.persisted && ' History is kept in memory only and starts again when the receiver restarts.'}
        </p>
      </div>
    );
  }
  return (
    <div>
      <PowerChart data={data} />
      <div className="mt-3 space-y-1 text-xs text-[#6b7a90]">
        <p>
          {data.samples} recorded {data.samples === 1 ? 'reading' : 'readings'} from {fmtHM(data.coveredFrom)} to {fmtHM(data.coveredTo)}. Each point is the average of the readings in a{' '}
          {fmtDuration(data.bucketMs)} slot, and a break in the line means no readings arrived.
        </p>
        <p className="text-[#14233c]">
          {data.energyKwh === null ? (
            'Energy for this period: not enough readings yet.'
          ) : (
            <>
              Energy recorded in this period: <span className="font-bold">{data.energyKwh.toFixed(3)} kWh</span>{' '}
              <span className="text-[#6b7a90]">(increase of the meter&apos;s own energy counter over the recorded time)</span>
            </>
          )}
        </p>
        {data.containsTest && <p className="font-bold text-[#8a6410]">This period includes TEST DATA.</p>}
        {!data.persisted && <p>History is kept in memory only and starts again when the receiver restarts.</p>}
        {status === 'error' && <p className="text-[#c98a0a]">The last refresh failed, so this may be slightly out of date.</p>}
      </div>
    </div>
  );
});

/* ------------------------------- the card ---------------------------------- */

function PowerCard({ receiverConnected = true }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState('1h');
  const p = usePzem(receiverConnected);
  const st = STATUS[p.status];
  const hasValues = p.status !== 'OFFLINE' && p.reading !== null;
  const dim = p.status === 'STALE';
  const voltage = hasValues ? fmtValue(p.reading.v, 1) : null;
  const isTest = p.source === 'test' && p.hasData;
  const note = banner(p);

  return (
    <section aria-label="Voltage and power" className="mb-6 md:mb-7">
      <div className={`bg-white rounded-2xl border-2 ${st.border} overflow-hidden transition-shadow ${open ? `ring-4 ${st.ring} shadow-md` : ''}`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={open ? 'pzem-panel' : undefined}
          className={`w-full text-left p-4 md:p-6 flex items-center gap-4 ${st.head} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#27a85a]/30`}
        >
          <div className={`w-10 h-10 shrink-0 rounded-full ${st.icon} flex items-center justify-center text-white`}>
            <Zap className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-[#5b6b82] uppercase">Voltage</div>
            <div className="flex items-baseline gap-2 flex-wrap">
              {voltage !== null ? (
                <>
                  <span className={`text-3xl sm:text-4xl font-bold leading-tight ${dim ? 'text-[#6b7a90]' : 'text-[#14233c]'}`}>{voltage}</span>
                  <span className="text-lg font-semibold text-[#6b7a90]">V</span>
                </>
              ) : (
                <span className="text-2xl md:text-3xl font-bold leading-tight text-[#8895a7]">Unavailable</span>
              )}
            </div>
            <div className="text-xs text-[#6b7a90] mt-1">{headerNote(p)}</div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {isTest && <span className="inline-block px-2 py-1 rounded-md text-[10px] font-bold tracking-wider bg-[#fdf2d9] text-[#8a6410]">TEST DATA</span>}
              <span role="status" className={`inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-bold uppercase ${st.pill}`}>
                {st.label}
              </span>
            </div>
            <span className="flex items-center gap-1 text-xs font-semibold text-[#5b6b82]">
              <span className="hidden sm:inline">{open ? 'Hide details' : 'Show details'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </span>
          </div>
        </button>

        {open && (
          <div id="pzem-panel" className="border-t border-[#e6ebf1] px-4 md:px-6 pb-6 pt-5">
            {isTest && (
              <p className={`mb-4 rounded-lg px-4 py-3 text-xs font-bold ${BANNER_CLS.test}`}>
                TEST DATA: these readings were sent by a test script, not measured by the PZEM.
              </p>
            )}
            {note && <p className={`mb-4 rounded-lg px-4 py-3 text-xs ${BANNER_CLS[note.tone]}`}>{note.text}</p>}

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              {METRICS.map((m) => {
                const text = hasValues ? fmtValue(p.reading[m.key], m.digits) : null;
                return (
                  <div key={m.key} className="rounded-xl border border-[#e6ebf1] p-4">
                    <div className="text-xs font-bold text-[#5b6b82] uppercase">{m.label}</div>
                    {text !== null ? (
                      <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                        <span className={`text-2xl font-bold ${dim ? 'text-[#6b7a90]' : 'text-[#14233c]'}`}>{text}</span>
                        {m.unit && <span className="text-sm font-semibold text-[#6b7a90]">{m.unit}</span>}
                      </div>
                    ) : (
                      <div className="mt-2 text-base font-semibold text-[#8895a7]">{hasValues && m.optional ? 'Not reported' : 'Unavailable'}</div>
                    )}
                    {hasValues && m.optional && text === null && <div className="text-[11px] text-[#6b7a90] mt-1.5">The ESP32 does not send this value.</div>}
                  </div>
                );
              })}
            </div>

            {p.rejected.count > 0 && (
              <p className="mt-3 text-[11px] text-[#6b7a90]">
                {p.rejected.count} invalid reading{p.rejected.count === 1 ? ' was' : 's were'} rejected since the receiver started (last: {p.rejected.lastReason}).
              </p>
            )}

            <div className="mt-7">
              <div className="flex items-center justify-between gap-3 flex-wrap pb-3 mb-4 border-b border-[#e6ebf1]">
                <h3 className="text-base font-bold text-[#14233c]">Power consumption history</h3>
                <div role="group" aria-label="History range" className="inline-flex rounded-lg border border-[#e1e7ee] overflow-hidden">
                  {RANGE_OPTIONS.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRange(key)}
                      aria-pressed={range === key}
                      className={`h-9 px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#27a85a]/40 ${
                        range === key ? 'bg-[#27a85a] text-white' : 'bg-white text-[#14233c] hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <PowerHistory range={range} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default memo(PowerCard);
