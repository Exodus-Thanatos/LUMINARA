// First-time guided tutorial. Highlights real elements (found by their data-tour attribute) and moves between pages.
// Nothing is saved except one flag in this browser so the offer is not repeated.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const STEPS = [
  { title: 'Welcome to LUMINARA', text: 'LUMINARA shows which streetlights are working and which need attention. This short tour introduces each page. It takes about a minute.', screen: null, target: null },
  { title: 'Dashboard', text: 'Your starting point. The cards show total, online, faulty and offline lights, with recent alerts and when the data was last updated.', screen: 'dashboard', target: 'nav-dashboard' },
  { title: 'Streetlight Monitoring', text: 'A searchable list of every lamp with its status and latest readings. Use the filters to find problem lamps quickly.', screen: 'monitoring', target: 'nav-monitoring' },
  { title: 'Streetlight Map', text: 'See where each lamp is. Marker colours and status words show which lamps are normal, faulty or offline.', screen: 'map', target: 'nav-map' },
  { title: 'PZEM Monitoring', text: 'On the Dashboard, this panel shows the electrical readings of the extension feed. Select the Voltage card to see everything and the history chart.', screen: 'dashboard', target: 'pzem-section' },
  { title: 'Lighting Controls', text: 'Switch the feed on or off. The page waits for the relay to confirm before it says the lights changed.', screen: 'controls', target: 'nav-controls' },
  { title: 'Maintenance', text: 'Where fault and repair tickets are reviewed. The tickets shown today are sample content.', screen: 'maintenance', target: 'nav-maintenance' },
  { title: 'Settings', text: 'Profile and system preferences. Each item says whether it works today or is only a preview.', screen: 'settings', target: 'nav-settings' },
];

const PAD = 6;

const Tutorial = ({ onNavigate, onEnsureMenu, onClose }) => {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const primary = useRef(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  // go to the step's page, and open the phone menu when the target lives in it
  useEffect(() => {
    if (step.screen) onNavigate(step.screen);
    onEnsureMenu(!!step.target && step.target.startsWith('nav-'));
  }, [i, step, onNavigate, onEnsureMenu]);

  // find and follow the highlighted element
  useLayoutEffect(() => {
    if (!step.target) return undefined;
    let raf = 0;
    let tries = 0;
    const find = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el && el.getBoundingClientRect().width > 0) {
        if (!step.target.startsWith('nav-')) el.scrollIntoView({ block: 'center', behavior: 'auto' });
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else if (tries < 30) {
        tries += 1;
        raf = requestAnimationFrame(find);
      } else {
        setRect(null);
      }
    };
    find();
    const settle = setTimeout(find, 320); // the phone menu slides in; measure again once it has stopped
    const onResize = () => find();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      window.removeEventListener('resize', onResize);
      setRect(null);
    };
  }, [step]);

  useEffect(() => {
    primary.current?.focus();
  }, [i]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose('skipped');
      if (e.key === 'ArrowRight' && !last) setI((n) => n + 1);
      if (e.key === 'ArrowLeft' && i > 0) setI((n) => n - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [i, last, onClose]);

  const wide = typeof window !== 'undefined' && window.innerWidth >= 768;
  const beside = wide && rect && rect.left + rect.width < 320; // a sidebar item: put the box to its right
  const boxStyle = beside
    ? { left: rect.left + rect.width + 20, top: Math.min(Math.max(rect.top - 20, 16), window.innerHeight - 280) }
    : undefined;

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {rect ? (
        <div
          aria-hidden="true"
          className="absolute rounded-lg pointer-events-none ring-2 ring-[#27a85a]"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: '0 0 0 9999px rgba(19,34,59,0.62)' }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-[#13223b]/60" />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        style={boxStyle}
        className={`absolute bg-white rounded-2xl border border-[#e6ebf1] shadow-xl p-5 sm:p-6 ${
          beside ? 'w-[340px]' : 'left-3 right-3 bottom-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[420px] sm:bottom-8'
        } ${!rect && !beside ? 'sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2' : ''}`}
      >
        <div className="text-[11px] font-bold text-[#6b7a90] uppercase mb-1">{i === 0 ? 'Guided tutorial' : `Step ${i} of ${STEPS.length - 1}`}</div>
        <h2 id="tour-title" className="text-lg font-bold text-[#14233c]">{step.title}</h2>
        <p id="tour-text" className="text-sm text-[#5b6b82] mt-2">{step.text}</p>
        <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
          <button onClick={() => onClose('skipped')} className="text-sm font-semibold text-[#6b7a90] hover:text-[#14233c] px-1 h-[42px]">
            {i === 0 ? 'Skip Tutorial' : 'Skip'}
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="h-[42px] px-5 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50">Previous</button>
            )}
            <button
              ref={primary}
              onClick={() => (last ? onClose('done') : setI(i + 1))}
              className="h-[42px] px-6 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52] transition-colors"
            >
              {i === 0 ? 'Start Tutorial' : last ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tutorial;
