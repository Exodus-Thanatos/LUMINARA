// Extension power monitoring (PZEM-004T) on the Dashboard.
// UI: the single expandable Voltage card (design taken from the PowerCard of the "pzem website update" build).
// Collapsed: one card with the Voltage and the meter status. Click it: the six readings and the history chart open inline. Click again: it collapses.
// Data and behaviour are unchanged from Phase 3 (usePzem / usePzemHistory / pzemFormat): no readings are invented,
// an unavailable value is shown as "Unavailable" (never 0), old values are labelled, and test data is labelled TEST DATA.
import { memo, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, Zap } from 'lucide-react';
import { usePzem, usePzemHistory } from './usePzem.js';
import { HISTORY_METRICS, HISTORY_OPTIONS, READING_CARDS, THRESHOLD_NOTE, describePzem, fmtAgo, historySeries, readingLevel } from './pzemFormat.js';
import { READING_HELP } from './helpContent.js';

// Card colours per meter state (same LUMINARA palette the lamp tiles and tags already use).
const STATUS = {
  live: { border: 'border-[#27a85a]', ring: 'ring-[#27a85a]/15', head: 'bg-[#f4fbf7]', icon: 'bg-[#27a85a]', pill: 'bg-[#e3f4ea] text-[#1f9a52]' },
  stale: { border: 'border-[#f0b84a]', ring: 'ring-[#f0b84a]/20', head: 'bg-[#fffaf0]', icon: 'bg-[#f0a82e]', pill: 'bg-[#fff3d6] text-[#c98a0a]' },
  offline: { border: 'border-[#9aa7b8]', ring: 'ring-[#9aa7b8]/20', head: 'bg-[#f6f8fa]', icon: 'bg-[#9aa7b8]', pill: 'bg-[#eceff3] text-[#5b6b82]' },
  // The meter itself does not answer (the ESP32 is online). Same card, in the red already used for faults in this app.
  fault: { border: 'border-[#e04848]', ring: 'ring-[#e04848]/15', head: 'bg-[#fff6f6]', icon: 'bg-[#e04848]', pill: 'bg-[#fdeaea] text-[#e04040]' },
};
const STATUS_OF = { live: 'live', stale: 'stale', pzem_offline: 'fault', none: 'offline', unreachable: 'offline' };

const BANNER_CLS = {
  idle: 'bg-[#eceff3] text-[#5b6b82]',
  warn: 'bg-[#fff3d6] text-[#8a6410]',
  bad: 'bg-[#fdeaea] text-[#b32f2f]',
  test: 'bg-[#fdf2d9] text-[#8a6410]',
};

const LEVEL = {
  normal: { text: 'text-[#1f9a52]', dot: 'bg-[#27a85a]' },
  warning: { text: 'text-[#b9770e]', dot: 'bg-[#f0a82e]' },
  critical: { text: 'text-[#e04040]', dot: 'bg-[#e04848]' },
  none: { text: 'text-[#6b7a90]', dot: 'bg-[#cfd6df]' },
};

// Status of one reading, always as words plus a dot (never colour alone). Hidden while there is no usable reading.
const LevelTag = ({ k, reading }) => {
  if (!reading) return null;
  const lv = readingLevel(k, reading[k], reading);
  const t = LEVEL[lv.level];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${t.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} aria-hidden="true" />
      {lv.level === 'warning' ? 'Warning: ' : lv.level === 'critical' ? 'Critical: ' : ''}
      {lv.label}
    </span>
  );
};

const clockHMS = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const fmtHM = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const fmtNum = (n, digits) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : null);

// Decimals shown on the chart axis / tooltip per history metric.
const METRIC_DIGITS = { powerW: 1, voltageV: 1, currentA: 3, energyKwh: 3 };
const AXIS_DIGITS = { powerW: 0, voltageV: 0, currentA: 2, energyKwh: 3 };

const TestTag = () => <span className="inline-block px-2 py-1 rounded-md text-[10px] font-bold tracking-wider bg-[#fdf2d9] text-[#8a6410]">TEST DATA</span>;

// Short line under the big number: what state the meter is in, and when its last reading arrived.
function headerNote({ d, loaded, view, at }) {
  if (!loaded) return 'Checking the receiver…';
  if (d.state === 'unreachable') return 'Receiver not connected';
  if (!d.reading) return d.state === 'none' ? 'No meter readings received yet' : 'No valid meter reading yet';
  if (view?.readingAgeMs == null) return d.detail;
  return `${d.dim ? 'Last known reading' : 'Last update'} ${clockHMS(at - view.readingAgeMs)} (${fmtAgo(view.readingAgeMs)})`;
}

// Message inside the expanded section (null = nothing to explain).
function banner({ d, loaded }) {
  if (!loaded || d.state === 'live') return null;
  const tone = d.tone === 'bad' ? 'bad' : d.tone === 'warn' ? 'warn' : 'idle';
  return { tone, text: `${d.detail}${d.reading ? ' The values shown are old, not current.' : ''}` };
}

/* ---------------------------- the history chart ---------------------------- */

const HistoryTip = ({ active, payload, metric }) => {
  if (!active || !payload || !payload.length) return null;
  const pt = payload[0].payload;
  const m = HISTORY_METRICS.find((x) => x.id === metric);
  if (pt[metric] === null || pt[metric] === undefined) return null;
  return (
    <div className="bg-white border border-[#e6ebf1] rounded-lg px-3 py-2 text-xs shadow-sm">
      <div className="font-bold text-[#14233c] text-sm">
        {pt[metric].toFixed(METRIC_DIGITS[metric])} {m.unit}
      </div>
      <div className="text-[#6b7a90]">{clockHMS(pt.t)}</div>
    </div>
  );
};

const HistoryChart = memo(function HistoryChart({ rows, metric }) {
  const m = HISTORY_METRICS.find((x) => x.id === metric);
  const from = rows[0].t;
  const to = rows[rows.length - 1].t;
  const ticks = useMemo(() => Array.from({ length: 5 }, (_, k) => from + ((to - from) * k) / 4), [from, to]);
  return (
    <div className="h-56 md:h-72 w-full" role="img" aria-label={`${m.name} over time`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e3e8ee" />
          <XAxis dataKey="t" type="number" domain={[from, to]} ticks={ticks} tickFormatter={fmtHM} axisLine={false} tickLine={false} tick={{ fill: '#6b7a90', fontSize: 11 }} />
          <YAxis
            width={metric === 'energyKwh' || metric === 'currentA' ? 76 : 64}
            domain={metric === 'energyKwh' ? ['auto', 'auto'] : [0, 'auto']}
            tickFormatter={(v) => `${Number(v).toFixed(AXIS_DIGITS[metric])} ${m.unit}`}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6b7a90', fontSize: 11 }}
          />
          <Tooltip content={<HistoryTip metric={metric} />} isAnimationActive={false} />
          {/* A slot with no readings is null: the line breaks there instead of bridging an outage. Dots keep isolated readings visible. */}
          <Line type="linear" dataKey={metric} stroke="#27a85a" strokeWidth={2} dot={{ r: 2.5, fill: '#27a85a', strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

const Segmented = ({ label, options, value, onChange }) => (
  <div role="group" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-[#e1e7ee] overflow-hidden">
    {options.map(([key, text]) => (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        aria-pressed={value === key}
        className={`h-9 px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#27a85a]/40 ${
          value === key ? 'bg-[#27a85a] text-white' : 'bg-white text-[#14233c] hover:bg-gray-50'
        }`}
      >
        {text}
      </button>
    ))}
  </div>
);

// Mounted ONLY while the card is expanded, so a collapsed card renders no chart and makes no history requests.
const PzemHistory = ({ range, metric }) => {
  const { history, failed, loading } = usePzemHistory(range, true);
  const rows = useMemo(() => historySeries(history), [history]);
  const hasData = rows.some((r) => r[metric] !== null);

  if (failed) return <div className="h-40 flex items-center justify-center text-sm text-[#6b7a90]" role="status">Could not load the history. The receiver is not reachable.</div>;
  if (loading) return <div className="h-40 flex items-center justify-center text-sm text-[#6b7a90]" role="status">Loading history…</div>;
  if (!hasData) {
    return (
      <div className="rounded-lg bg-[#f6f8fa] border border-[#e6ebf1] px-4 py-8 text-center">
        <p className="text-sm font-bold text-[#14233c]">No history yet</p>
        <p className="text-xs text-[#6b7a90] mt-1.5 max-w-md mx-auto">Points appear here once the ESP32 has posted readings for a minute. Gaps in the chart mean no readings were received, not zero.</p>
      </div>
    );
  }
  return (
    <div>
      <HistoryChart rows={rows} metric={metric} />
      <div className="mt-3 space-y-1 text-xs text-[#6b7a90]">
        {history?.summary && (
          <p className="text-[#14233c]">
            Average <span className="font-bold">{history.summary.avgPowerW} W</span> · Peak <span className="font-bold">{history.summary.peakPowerW} W</span> · Energy used{' '}
            <span className="font-bold">{history.summary.usedKwh} kWh</span>
          </p>
        )}
        <p>Frequency and power factor are shown live only: the receiver does not record their history. History covers the last 1, 6 or 24 hours kept in the receiver’s memory. A break in the line means no readings arrived.</p>
        {history?.includesTestData && <p className="font-bold text-[#8a6410]">This period includes TEST DATA that did not come from the meter.</p>}
      </div>
    </div>
  );
};

/* ------------------------------- the card ---------------------------------- */

const PzemPanel = () => {
  const { view, reachable, loaded, at } = usePzem();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState('1h');
  const [metric, setMetric] = useState('powerW');
  const [showHelp, setShowHelp] = useState(false);
  const d = describePzem({ view, reachable });
  const st = STATUS[loaded ? STATUS_OF[d.state] : 'offline'];
  const reading = d.reading;
  const voltage = reading ? fmtNum(reading.voltage, 1) : null;
  const note = banner({ d, loaded });
  const m = HISTORY_METRICS.find((x) => x.id === metric);

  return (
    <section aria-label="Extension power monitoring" data-tour="pzem-section" className="mb-6 md:mb-7">
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
                  <span className={`text-3xl sm:text-4xl font-bold leading-tight ${d.dim ? 'text-[#6b7a90]' : 'text-[#14233c]'}`}>{voltage}</span>
                  <span className="text-lg font-semibold text-[#6b7a90]">V</span>
                </>
              ) : (
                <span className="text-2xl md:text-3xl font-bold leading-tight text-[#8895a7]">Unavailable</span>
              )}
            </div>
            <div className="text-xs text-[#6b7a90] mt-1">{headerNote({ d, loaded, view, at })}</div>
            <div className="mt-1"><LevelTag k="voltage" reading={reading} /></div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {d.isTest && <TestTag />}
              <span role="status" className={`inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-bold uppercase text-center leading-tight max-w-[9rem] ${st.pill}`}>
                {loaded ? d.label : 'CHECKING'}
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
            {d.isTest && <p className={`mb-4 rounded-lg px-4 py-3 text-xs font-bold ${BANNER_CLS.test}`}>TEST DATA: these readings were sent by a test script, not measured by the PZEM.</p>}
            {note && <p className={`mb-4 rounded-lg px-4 py-3 text-xs ${BANNER_CLS[note.tone]}`}>{note.text}</p>}
            {reading?.alarm && <p className={`mb-4 rounded-lg px-4 py-3 text-xs font-bold ${BANNER_CLS.bad}`}>Power alarm is set on the meter.</p>}

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              {READING_CARDS.map((c) => {
                const raw = reading ? reading[c.key] : undefined;
                const text = typeof raw === 'number' && Number.isFinite(raw) ? c.fmt(raw) : null;
                const optional = c.key === 'frequency' || c.key === 'pf';
                return (
                  <div key={c.key} className="rounded-xl border border-[#e6ebf1] p-4">
                    <div className="text-xs font-bold text-[#5b6b82] uppercase">{c.label}</div>
                    {text !== null ? (
                      <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                        <span className={`text-2xl font-bold ${d.dim ? 'text-[#6b7a90]' : 'text-[#14233c]'}`}>{text}</span>
                        {c.unit && <span className="text-sm font-semibold text-[#6b7a90]">{c.unit}</span>}
                      </div>
                    ) : (
                      <div className="mt-2 text-base font-semibold text-[#8895a7]">{reading && optional ? 'Not reported' : 'Unavailable'}</div>
                    )}
                    <div className="mt-1.5"><LevelTag k={c.key} reading={reading} /></div>
                    <p className="text-[11px] text-[#6b7a90] mt-1.5">{READING_HELP[c.key]}</p>
                  </div>
                );
              })}
            </div>

            {loaded && !reading && <p className="mt-3 text-[11px] text-[#6b7a90]">Values show “Unavailable” because no reading is available. This does not mean zero.</p>}
            <button type="button" aria-expanded={showHelp} onClick={() => setShowHelp((v) => !v)} className="mt-3 text-xs font-bold text-[#27a85a] hover:underline">
              {showHelp ? 'Hide status guide' : 'How are statuses decided?'}
            </button>
            {showHelp && <p className="text-[11px] text-[#6b7a90] mt-1.5">{THRESHOLD_NOTE} Current, power and energy have no threshold because the rating of the monitored feed is not known.</p>}

            <div className="mt-7">
              <div className="flex items-center justify-between gap-3 flex-wrap pb-3 mb-4 border-b border-[#e6ebf1]">
                <h3 className="text-base font-bold text-[#14233c]">{metric === 'powerW' ? 'Power consumption history' : `${m.label} history`}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <Segmented label="History measurement" options={HISTORY_METRICS.map((x) => [x.id, x.label])} value={metric} onChange={setMetric} />
                  <Segmented label="History range" options={HISTORY_OPTIONS} value={range} onChange={setRange} />
                </div>
              </div>
              <PzemHistory range={range} metric={metric} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default memo(PzemPanel);
