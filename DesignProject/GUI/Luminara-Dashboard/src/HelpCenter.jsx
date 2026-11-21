// Help Center / User Manual. Uses the app's own Page, Header and Card so it matches the other screens.
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Compass, Crosshair, Info, LayoutGrid, MapPin, PlayCircle, Search, Settings, Sun, Wrench, X, Zap } from 'lucide-react';
import { CardTitle, inputCls } from './uiKit.jsx';
import { HELP_SECTIONS, searchHelp, sectionById } from './helpContent.js';

const ICONS = { Info, Compass, LayoutGrid, Crosshair, MapPin, Zap, Sun, Clock, Settings, Wrench };

const Block = ({ b }) => {
  if (b.t === 'p') return <p className="text-sm leading-relaxed text-[#14233c] mb-5">{b.text}</p>;
  if (b.t === 'note' || b.t === 'warn') {
    const warn = b.t === 'warn';
    return (
      <div className={`flex gap-2.5 items-start rounded-lg px-4 py-3 text-xs mb-5 border ${warn ? 'bg-[#fffaf0] border-[#f6d587] text-[#8a6410]' : 'bg-[#f3f6f9] border-[#e1e7ee] text-[#5b6b82]'}`}>
        <Info size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
        <div><b>{warn ? 'Not connected yet: ' : 'Note: '}</b>{b.text}</div>
      </div>
    );
  }
  if (b.t === 'steps') {
    return (
      <div className="mb-6">
        <h4 className="text-sm font-bold text-[#14233c] mb-3">{b.title}</h4>
        <ol className="space-y-3">
          {b.items.map((s, i) => (
            <li key={s} className="flex gap-3 items-start">
              <span className="w-6 h-6 shrink-0 rounded-full bg-[#e8f6ee] text-[#1b7a42] text-xs font-bold flex items-center justify-center" aria-hidden="true">{i + 1}</span>
              <span className="text-sm text-[#14233c] pt-0.5"><span className="sr-only">Step {i + 1}: </span>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (b.t === 'terms') {
    return (
      <div className="mb-6">
        {b.title && <h4 className="text-sm font-bold text-[#14233c] mb-3">{b.title}</h4>}
        <dl className="divide-y divide-[#eef1f5] border border-[#e6ebf1] rounded-lg">
          {b.items.map(([k, v]) => (
            <div key={k} className="px-4 py-3 sm:grid sm:grid-cols-[210px_1fr] sm:gap-4">
              <dt className="text-sm font-bold text-[#14233c]">{k}</dt>
              <dd className="text-sm text-[#5b6b82] mt-1 sm:mt-0">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  return null;
};

const SectionIcon = ({ name, size = 20 }) => {
  const I = ICONS[name] || Info;
  return <I size={size} aria-hidden="true" />;
};

// view: 'help' (landing with search and the tutorial) | 'manual' (table of contents of all articles)
const HelpCenter = ({ Page, Header, Card, view, topic, onTopic, onNavigate, onStartTutorial }) => {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchHelp(query), [query]);
  const section = sectionById(topic);
  const idx = section ? HELP_SECTIONS.indexOf(section) : -1;
  const prev = idx > 0 ? HELP_SECTIONS[idx - 1] : null;
  const next = idx >= 0 && idx < HELP_SECTIONS.length - 1 ? HELP_SECTIONS[idx + 1] : null;
  const rootLabel = view === 'manual' ? 'User Manual' : 'Help Center';
  const searching = query.trim() !== '';

  const open = (id) => {
    setQuery('');
    onTopic(id);
  };

  const crumbs = (
    <nav aria-label="Breadcrumb" className="text-xs text-[#6b7a90] flex items-center gap-1.5 flex-wrap">
      <button onClick={() => onTopic(null)} className="font-bold text-[#27a85a] hover:underline">{rootLabel}</button>
      {section && (
        <>
          <ChevronRight size={12} aria-hidden="true" />
          <span aria-current="page" className="font-semibold text-[#14233c]">{section.title}</span>
        </>
      )}
    </nav>
  );

  return (
    <Page>
      <Header title={rootLabel} subtitle={crumbs} />

      {section ? (
        <Card big className="p-5 sm:p-7 max-w-3xl">
          <button onClick={() => onTopic(null)} className="text-xs font-bold text-[#27a85a] flex items-center hover:underline mb-4">
            <ChevronLeft className="w-3 h-3 mr-1" aria-hidden="true" /> All topics
          </button>
          <div className="flex items-center gap-4 pb-3 mb-5 border-b border-[#e6ebf1]">
            <span className="w-11 h-11 shrink-0 rounded-full bg-[#e8f6ee] text-[#27a85a] flex items-center justify-center"><SectionIcon name={section.icon} /></span>
            <div>
              <h2 className="text-xl font-bold text-[#14233c]">{section.title}</h2>
              <p className="text-xs text-[#6b7a90]">{section.summary}</p>
            </div>
          </div>
          {section.blocks.map((b, i) => <Block key={i} b={b} />)}

          {section.id === 'getting-started' && (
            <button onClick={onStartTutorial} className="h-[42px] px-5 rounded-lg bg-[#27a85a] hover:bg-[#1f9a52] text-white text-sm font-semibold inline-flex items-center gap-2 mb-2">
              <PlayCircle size={16} aria-hidden="true" /> Start the guided tutorial
            </button>
          )}

          <div className="flex justify-between gap-3 mt-6 pt-5 border-t border-[#e6ebf1]">
            {prev ? (
              <button onClick={() => onTopic(prev.id)} className="text-left text-sm font-semibold text-[#14233c] hover:text-[#27a85a] min-w-0">
                <span className="block text-[11px] text-[#6b7a90] font-normal">Previous</span>
                <span className="inline-flex items-center gap-1"><ChevronLeft size={14} aria-hidden="true" />{prev.title}</span>
              </button>
            ) : <span />}
            {next ? (
              <button onClick={() => onTopic(next.id)} className="text-right text-sm font-semibold text-[#14233c] hover:text-[#27a85a] min-w-0">
                <span className="block text-[11px] text-[#6b7a90] font-normal">Next</span>
                <span className="inline-flex items-center gap-1">{next.title}<ChevronRight size={14} aria-hidden="true" /></span>
              </button>
            ) : <span />}
          </div>
        </Card>
      ) : (
        <>
          <Card className="px-4 md:px-6 py-4 mb-5 md:mb-6">
            <label htmlFor="help-search" className="sr-only">Search the manual</label>
            <div className="relative max-w-xl">
              <Search className="w-4 h-4 text-[#8895a7] absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="help-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the manual, e.g. “offline”, “voltage”, “schedule”"
                className={`${inputCls} pl-10 pr-10`}
              />
              {searching && (
                <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md text-[#6b7a90] hover:bg-gray-100 flex items-center justify-center">
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          </Card>

          {searching ? (
            <Card big className="p-5 sm:p-7">
              <CardTitle>{results.length} result{results.length === 1 ? '' : 's'} for “{query.trim()}”</CardTitle>
              {results.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#6b7a90]">
                  No articles match. Try a shorter or different word.
                  <div className="mt-3"><button onClick={() => setQuery('')} className="font-bold text-[#27a85a] hover:underline">Clear search</button></div>
                </div>
              ) : (
                <ul className="divide-y divide-[#eef1f5]" aria-live="polite">
                  {results.map(({ section: s, snippet, where }) => (
                    <li key={s.id}>
                      <button onClick={() => open(s.id)} className="w-full text-left py-3.5 hover:bg-[#fafcfd] rounded-md px-2">
                        <span className="text-sm font-bold text-[#14233c]">{s.title}</span>
                        {where !== s.title && <span className="text-[11px] text-[#6b7a90]"> · {where}</span>}
                        <span className="block text-xs text-[#6b7a90] mt-1">{snippet}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : (
            <>
              {view === 'help' && (
                <Card big className="p-5 sm:p-6 mb-5 md:mb-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
                  <div className="flex items-center gap-4">
                    <span className="w-11 h-11 shrink-0 rounded-full bg-[#e8f6ee] text-[#27a85a] flex items-center justify-center"><PlayCircle size={20} aria-hidden="true" /></span>
                    <div>
                      <h2 className="font-bold text-[#14233c]">Guided tutorial</h2>
                      <p className="text-xs text-[#6b7a90]">A short tour of each page. You can skip it at any time and restart it here.</p>
                    </div>
                  </div>
                  <button onClick={onStartTutorial} className="h-[42px] px-6 shrink-0 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52] transition-colors">Start tutorial</button>
                </Card>
              )}
              <h2 className="text-lg font-bold mb-3">{view === 'manual' ? 'All manual topics' : 'Browse by topic'}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-5">
                {HELP_SECTIONS.map((s, i) => (
                  <button key={s.id} onClick={() => open(s.id)} className="text-left">
                    <Card className="p-5 h-full hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="w-10 h-10 shrink-0 rounded-full bg-[#e8f6ee] text-[#27a85a] flex items-center justify-center"><SectionIcon name={s.icon} /></span>
                        <span className="text-xs font-bold text-[#6b7a90]">{String(i + 1).padStart(2, '0')}</span>
                      </div>
                      <div className="font-bold text-sm text-[#14233c]">{s.title}</div>
                      <p className="text-xs text-[#6b7a90] mt-1">{s.summary}</p>
                    </Card>
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#6b7a90] mt-6">
                Something not working? Start with <button onClick={() => open('troubleshooting')} className="font-bold text-[#27a85a] hover:underline">Troubleshooting</button>
                {view === 'help' && <> or open the full <button onClick={() => onNavigate('manual')} className="font-bold text-[#27a85a] hover:underline">User Manual</button></>}.
              </p>
            </>
          )}
        </>
      )}
    </Page>
  );
};

export default HelpCenter;
