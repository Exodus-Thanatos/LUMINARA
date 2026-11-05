// Collapsible extension power monitoring (PZEM-004T) on the Dashboard.
// Collapsed: one Voltage card. Click it: the other readings and the power-consumption history appear underneath. Click again: it collapses.
// Shows only what the receiver has: no readings are invented. States: no connection / waiting / live / meter not answering / no update.
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, Zap } from 'lucide-react';
import { CardTitle } from './uiKit.jsx';
import { usePzem, usePzemHistory } from './usePzem.js';
import { HISTORY_OPTIONS, READING_CARDS, describePzem, historyRows } from './pzemFormat.js';

const TONE = {
  ok: { dot: 'bg-[#27a85a]', text: 'text-[#1f9a52]' },
  warn: { dot: 'bg-[#f0a82e]', text: 'text-[#b9770e]' },
  bad: { dot: 'bg-[#e04848]', text: 'text-[#e04848]' },
  idle: { dot: 'bg-[#9aa7b8]', text: 'text-[#6b7a90]' },
};

const TestTag = () => (
  <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider bg-[#fdf2d9] text-[#8a6410]">TEST DATA</span>
);

const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const PzemPanel = ({ Card }) => {
  const { view, reachable, loaded } = usePzem();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState('1h');
  const { history, failed, loading } = usePzemHistory(range, open);
  const d = describePzem({ view, reachable });
  const tone = TONE[d.tone];
  const rows = historyRows(history);
  const hasData = rows.some((r) => r.powerW !== null);

  const valueOf = (c) => (d.reading ? c.fmt(d.reading[c.key]) : '—');
  const valueCls = d.dim ? 'text-[#9aa7b8]' : 'text-[#14233c]';
  const headline = !loaded ? 'Checking…' : d.label;

  const cards = READING_CARDS.slice(1); // everything except Voltage
  return (
    <section aria-label="Extension power monitoring" className="mb-6 md:mb-7">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-3 mb-3">
        <h2 className="text-lg font-bold">Extension Power Monitoring</h2>
        <span className="text-xs text-[#6b7a90]">PZEM-004T · separate from streetlight telemetry</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <Card className="p-0 overflow-hidden">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="pzem-details"
            onClick={() => setOpen((o) => !o)}
            className="w-full text-left p-4 md:p-6 hover:bg-[#fafcfd] transition-colors"
          >
            <div className="flex flex-col sm:flex-row items-start gap-2 sm:gap-4">
              <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white ${d.state === 'live' ? 'bg-[#27a85a]' : 'bg-[#9aa7b8]'}`}>
                <Zap size={18} />
              </div>
              <div className="min-w-0 w-full sm:flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#5b6b82] uppercase">Voltage</span>
                  <ChevronDown size={18} className={`text-[#6b7a90] transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </div>
                <div className={`text-3xl md:text-4xl font-bold leading-tight ${valueCls}`}>
                  {valueOf(READING_CARDS[0])}
                  {d.reading && <span className="text-base font-semibold ml-1 text-[#6b7a90]">V</span>}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
              <span className={`inline-flex items-center gap-1.5 font-bold ${tone.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                {headline}
              </span>
              {d.isTest && <TestTag />}
              <span className="text-[#6b7a90]">{open ? 'Click to collapse' : 'Click for all readings'}</span>
            </div>
          </button>
        </Card>

        {open &&
          cards.map((c) => (
            <Card key={c.key} className="p-4 md:p-6">
              <div className="text-xs font-semibold text-[#5b6b82] uppercase">{c.label}</div>
              <div className={`text-2xl sm:text-3xl md:text-4xl font-bold leading-tight mt-1 ${valueCls}`}>
                {valueOf(c)}
                {d.reading && c.unit && <span className="text-base font-semibold ml-1 text-[#6b7a90]">{c.unit}</span>}
              </div>
            </Card>
          ))}

        {open && (
          <Card className="p-4 md:p-6 col-span-2" >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[#5b6b82] uppercase">Meter status</span>
              {d.isTest && <TestTag />}
            </div>
            <div className={`mt-1 inline-flex items-center gap-1.5 text-sm font-bold ${tone.text}`}>
              <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
              {headline}
            </div>
            <p className="text-xs text-[#6b7a90] mt-1.5">{loaded ? d.detail : 'Checking the receiver…'}</p>
            {d.reading?.alarm && <p className="text-xs font-bold text-[#e04848] mt-1.5">Power alarm is set on the meter.</p>}
          </Card>
        )}
      </div>

      {open && (
        <div id="pzem-details" className="mt-3 md:mt-6">
          <Card big className="p-4 sm:p-7">
            <CardTitle
              right={
                <div className="inline-flex bg-[#f3f6f9] border border-[#e1e7ee] rounded-lg p-1" role="group" aria-label="History range">
                  {HISTORY_OPTIONS.map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={range === id}
                      onClick={() => setRange(id)}
                      className={`px-3 h-8 rounded-md text-xs font-semibold transition-colors ${range === id ? 'bg-[#27a85a] text-white' : 'text-[#6b7a90] hover:text-[#14233c]'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
            >
              Power Consumption History
            </CardTitle>

            {failed ? (
              <p className="py-10 text-center text-sm text-[#6b7a90]">Could not load the history. The receiver is not reachable.</p>
            ) : loading ? (
              <p className="py-10 text-center text-sm text-[#6b7a90]">Loading history…</p>
            ) : !hasData ? (
              <p className="py-10 text-center text-sm text-[#6b7a90]">No history yet. Points appear here once the ESP32 has posted readings for a minute.</p>
            ) : (
              <>
                <div className="h-56 sm:h-64" role="img" aria-label="Average active power over time">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="#e6ebf1" vertical={false} />
                      <XAxis dataKey="t" tickFormatter={clock} tick={{ fontSize: 11, fill: '#6b7a90' }} minTickGap={36} axisLine={false} tickLine={false} />
                      <YAxis unit=" W" tick={{ fontSize: 11, fill: '#6b7a90' }} width={58} axisLine={false} tickLine={false} />
                      <Tooltip
                        labelFormatter={clock}
                        formatter={(v, name) => [v === null ? '—' : `${v} W`, name === 'powerW' ? 'Average' : 'Peak']}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e1e7ee', fontSize: 12 }}
                      />
                      <Area type="monotone" dataKey="powerW" stroke="#27a85a" strokeWidth={2} fill="#27a85a" fillOpacity={0.15} connectNulls={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {history?.summary && (
                  <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-[#6b7a90]">
                    <div>Average<div className="text-sm font-bold text-[#14233c]">{history.summary.avgPowerW} W</div></div>
                    <div>Peak<div className="text-sm font-bold text-[#14233c]">{history.summary.peakPowerW} W</div></div>
                    <div>Energy used<div className="text-sm font-bold text-[#14233c]">{history.summary.usedKwh} kWh</div></div>
                  </div>
                )}
                {history?.includesTestData && <p className="mt-3 text-[11px] text-[#8a6410]">Includes TEST DATA that did not come from the meter.</p>}
              </>
            )}
          </Card>
        </div>
      )}
    </section>
  );
};

export default PzemPanel;
