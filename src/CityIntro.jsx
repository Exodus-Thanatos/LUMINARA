import { useEffect, useRef, useState } from 'react';
import './cityIntro.css';
import { markIntroSeen } from './introSession.js';

/* ==========================================================================
   LUMINARA — NIGHTTIME CITY OPENING
   A full-screen intro that sits on top of the login screen. Everything is SVG
   + CSS (no video, no GIF). JavaScript only handles: session skip, the Skip /
   Sign In buttons, and noticing when the walk has finished.

   Scene coordinates: viewBox 1000 x 600, anchored to the bottom and scaled to
   cover the screen, so the street is always visible.
   ========================================================================== */

const mulberry32 = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Distant skyline [x, width, top] and nearer glass towers [x, width, top]
const DISTANT = [
  [300, 40, 400], [336, 34, 365], [366, 44, 410], [406, 30, 385], [430, 36, 330], [460, 28, 420],
  [486, 40, 300], [522, 34, 352], [552, 46, 395], [596, 30, 340], [622, 40, 372], [660, 34, 318],
  [690, 42, 385], [728, 36, 340], [760, 44, 404], [800, 30, 368], [826, 38, 420],
];
const NEAR = [[520, 70, 380], [600, 56, 336], [672, 44, 402], [730, 64, 372]];
const ANTENNAS = [[506, 300, 268], [679, 318, 284]]; // x, top of building, tip

// Streetlights: pole x, pole top, head outline, light cone, pool of light on the ground
const LAMPS = [
  { x: 84, top: 128, head: '80,128 130,112 138,122 86,138', bulb: [120, 126], cone: '98,134 132,126 262,250 150,262', pool: [230, 135], halo: [122, 130] },
  { x: 464, top: 366, head: '460,366 500,356 506,364 464,376', bulb: [496, 364], cone: '476,372 504,364 590,440 510,452', pool: [520, 85], halo: [498, 368] },
  { x: 655, top: 446, head: '651,446 680,438 684,445 655,454', bulb: [676, 445], cone: '662,452 682,446 722,488 676,494', pool: [690, 55], halo: [678, 448] },
  { x: 790, top: 454, head: '786,454 812,447 816,454 790,462', bulb: [808, 453], cone: '796,460 814,455 846,492 806,498', pool: [825, 50], halo: [810, 456] },
];

const roofY = (x) => (x < 140 ? 140 : 145 + (x - 140) * 0.7);

function buildScene() {
  const rand = mulberry32(11);

  const stars = Array.from({ length: 38 }, () => ({
    x: Math.round(rand() * 1000),
    y: Math.round(10 + rand() * 280),
    r: Number((0.7 + rand() * 1.3).toFixed(1)),
    d: Number((rand() * 4).toFixed(1)),
    t: Number((3 + rand() * 3).toFixed(1)),
  }));

  const windows = [];
  const grid = (list, w, h, gx, gy, p) =>
    list.forEach(([bx, bw, top]) => {
      for (let y = top + 10; y + h < 494; y += gy) {
        for (let x = bx + 5; x + w <= bx + bw - 4; x += gx) {
          if (rand() < p) {
            windows.push({ x, y, w, h, warm: rand() < 0.45, quick: rand() < 0.4, d: Number((1 + rand() * 2.2).toFixed(2)) });
          }
        }
      }
    });
  grid(DISTANT, 4, 5, 10, 13, 0.07);
  grid(NEAR, 7, 9, 14, 18, 0.45);

  // left foreground building: windows light one after another
  const left = [];
  [22, 108, 194, 280].forEach((x) =>
    [225, 315, 405].forEach((y) => {
      if (roofY(x) + 10 < y) left.push({ x, y });
    })
  );
  left.forEach((w, i) => Object.assign(w, { d: Number((1.3 + i * 0.16).toFixed(2)) }));

  return { stars, windows, left };
}

const SCENE = buildScene();

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CityIntro = ({ onDone }) => {
  const [reduced] = useState(prefersReducedMotion);
  const [ready, setReady] = useState(reduced); // the Sign In button works once the content has appeared
  const [settled, setSettled] = useState(reduced); // the walk is over: pause the looping animations
  const [leaving, setLeaving] = useState(false);
  const timers = useRef([]);

  useEffect(() => {
    markIntroSeen();
    const fallback = setTimeout(() => setReady(true), 9000); // safety net if animationend never fires
    const list = timers.current;
    return () => {
      clearTimeout(fallback);
      list.forEach(clearTimeout);
    };
  }, []);

  const leave = () => {
    if (leaving) return;
    setLeaving(true);
    timers.current.push(setTimeout(onDone, reduced ? 0 : 650));
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') leave();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const rootCls = `ci-root${reduced ? ' ci-static' : ''}${settled ? ' ci-settled' : ''}${leaving ? ' ci-leaving' : ''}`;

  return (
    <section className={rootCls} aria-label="LUMINARA opening scene">
      {/* ---------- scene (decorative) ---------- */}
      <svg className="ci-scene" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="ci-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--ci-sky-top)' }} />
            <stop offset="0.55" style={{ stopColor: 'var(--ci-sky-mid)' }} />
            <stop offset="0.78" style={{ stopColor: 'var(--ci-sky-low)' }} />
            <stop offset="1" style={{ stopColor: 'var(--ci-sky-low)' }} />
          </linearGradient>
          <linearGradient id="ci-bld-left" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--ci-wall-a)' }} />
            <stop offset="1" style={{ stopColor: 'var(--ci-wall-b)' }} />
          </linearGradient>
          <linearGradient id="ci-bld-right" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--ci-wall-b)' }} />
            <stop offset="1" style={{ stopColor: 'var(--ci-wall-a)' }} />
          </linearGradient>
          <linearGradient id="ci-cone" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--ci-lamp)', stopOpacity: 0.85 }} />
            <stop offset="1" style={{ stopColor: 'var(--ci-lamp)', stopOpacity: 0 }} />
          </linearGradient>
          <radialGradient id="ci-halo">
            <stop offset="0" style={{ stopColor: 'var(--ci-lamp)', stopOpacity: 0.75 }} />
            <stop offset="1" style={{ stopColor: 'var(--ci-lamp)', stopOpacity: 0 }} />
          </radialGradient>
          <radialGradient id="ci-pool">
            <stop offset="0" style={{ stopColor: 'var(--ci-lamp)', stopOpacity: 0.9 }} />
            <stop offset="0.6" style={{ stopColor: 'var(--ci-lamp)', stopOpacity: 0.35 }} />
            <stop offset="1" style={{ stopColor: 'var(--ci-lamp)', stopOpacity: 0 }} />
          </radialGradient>
          <radialGradient id="ci-moonglow">
            <stop offset="0" stopColor="#bcd0ff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#bcd0ff" stopOpacity="0" />
          </radialGradient>
          <mask id="ci-moonmask">
            <rect x="500" y="80" width="120" height="120" fill="#fff" />
            <circle cx="574" cy="122" r="25" fill="#000" />
          </mask>
        </defs>

        {/* 1. sky */}
        <rect className="ci-sky" x="0" y="0" width="1000" height="600" fill="url(#ci-sky)" />

        {/* 2. stars and moon */}
        <g className="ci-stars">
          {SCENE.stars.map((s, i) => (
            <circle key={i} className="ci-star" cx={s.x} cy={s.y} r={s.r} style={{ '--d': s.d, '--t': s.t }} />
          ))}
        </g>
        <g className="ci-moon">
          <circle cx="552" cy="130" r="60" fill="url(#ci-moonglow)" />
          <circle cx="552" cy="130" r="26" fill="#e8eeff" mask="url(#ci-moonmask)" />
        </g>

        {/* 3. distant skyline */}
        <g className="ci-skyline">
          {DISTANT.map(([x, w, top], i) => (
            <rect key={i} x={x} y={top} width={w} height={520 - top} fill="var(--ci-far)" />
          ))}
          {ANTENNAS.map(([x, a, b], i) => (
            <line key={i} x1={x} y1={a} x2={x} y2={b} stroke="var(--ci-far)" strokeWidth="2" />
          ))}
        </g>

        {/* 4. nearer glass towers and trees */}
        <g className="ci-near">
          {NEAR.map(([x, w, top], i) => (
            <rect key={i} x={x} y={top} width={w} height={520 - top} fill="var(--ci-near)" stroke="var(--ci-cyan)" strokeOpacity="0.45" strokeWidth="1.5" />
          ))}
          <g fill="var(--ci-tree)">
            <rect x="388" y="470" width="7" height="50" />
            <ellipse cx="392" cy="466" rx="54" ry="30" />
            <rect x="568" y="484" width="5" height="36" />
            <ellipse cx="570" cy="482" rx="42" ry="11" />
            <rect x="772" y="490" width="5" height="30" />
            <ellipse cx="774" cy="488" rx="26" ry="16" />
          </g>
        </g>

        {/* 5. foreground buildings + their windows */}
        <g className="ci-front">
          <polygon points="0,130 140,145 340,285 340,520 0,520" fill="url(#ci-bld-left)" />
          <polygon points="0,130 140,145 340,285 340,302 140,162 0,148" fill="var(--ci-roof)" />
          <polygon points="850,70 1000,40 1000,520 850,520" fill="url(#ci-bld-right)" />
        </g>
        <g className="ci-windows">
          {SCENE.left.map((w, i) => (
            <rect key={`l${i}`} className="ci-win ci-win-warm ci-win-big" x={w.x} y={w.y} width="46" height="58" rx="2" style={{ '--d': w.d }} />
          ))}
          {SCENE.windows.map((w, i) => (
            <rect
              key={i}
              className={`ci-win${w.warm ? ' ci-win-warm' : ''}${w.quick ? ' ci-win-quick' : ''}`}
              x={w.x}
              y={w.y}
              width={w.w}
              height={w.h}
              rx="1"
              style={{ '--d': w.d }}
            />
          ))}
        </g>

        {/* 7. road and sidewalk */}
        <g className="ci-ground">
          <rect x="0" y="505" width="1000" height="100" fill="var(--ci-road)" />
          <rect x="0" y="505" width="1000" height="40" fill="var(--ci-sidewalk)" />
          <rect x="0" y="505" width="1000" height="2" fill="var(--ci-cyan)" opacity="0.35" />
        </g>

        {/* 6. streetlights: poles, light cones, halos and pools of light */}
        {LAMPS.map((l, i) => (
          <g key={i} className="ci-lamp" style={{ '--i': i }}>
            <ellipse className="ci-pool" cx={l.pool[0]} cy="530" rx={l.pool[1]} ry="11" fill="url(#ci-pool)" />
            <rect x={l.x - 3.5} y={l.top} width="7" height={520 - l.top} fill="var(--ci-pole)" />
            <polygon points={l.head} fill="var(--ci-pole)" />
            <polygon className="ci-cone" points={l.cone} fill="url(#ci-cone)" />
            <circle className="ci-halo" cx={l.halo[0]} cy={l.halo[1]} r="34" fill="url(#ci-halo)" />
            <ellipse className="ci-bulb" cx={l.bulb[0]} cy={l.bulb[1]} rx="9" ry="3.5" />
          </g>
        ))}

        {/* 8. the person */}
        <g className="ci-person-travel" onAnimationEnd={(e) => e.animationName === 'ci-personWalk' && setSettled(true)}>
          <ellipse className="ci-person-shadow" cx="0" cy="1" rx="16" ry="3" />
          <g className="ci-person-bob">
            <g className="ci-person">
              <g className="ci-limb ci-leg ci-leg-back"><rect x="-4" y="-40" width="8" height="40" rx="4" /><rect x="-3" y="-4" width="12" height="5" rx="2.5" /></g>
              <g className="ci-limb ci-arm ci-arm-back"><rect x="-3.5" y="-67" width="7" height="30" rx="3.5" /></g>
              <rect x="-15" y="-64" width="9" height="20" rx="3" />
              <rect x="-8.5" y="-70" width="17" height="34" rx="7" />
              <circle cx="1" cy="-79" r="7.5" />
              <g className="ci-limb ci-leg ci-leg-front"><rect x="-4" y="-40" width="8" height="40" rx="4" /><rect x="-3" y="-4" width="12" height="5" rx="2.5" /></g>
              <g className="ci-limb ci-arm ci-arm-front"><rect x="-3.5" y="-67" width="7" height="30" rx="3.5" /></g>
            </g>
          </g>
        </g>
      </svg>

      {/* ---------- 9. logo, title and call to action ---------- */}
      <div className="ci-content-wrap">
        <div
          className="ci-content"
          data-ready={ready ? 'true' : 'false'}
          onAnimationEnd={(e) => e.animationName === 'ci-contentReveal' && setReady(true)}
        >
          <img className="ci-logo" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="68" height="68" />
          <h1 className="ci-title">LUMINARA</h1>
          <p className="ci-sub">Smart Streetlight System</p>
          <p className="ci-place">Barangay 6, Carmona, Cavite</p>
          <button type="button" className="ci-cta" onClick={leave} disabled={!ready}>
            Sign In
          </button>
        </div>
      </div>

      {!ready && (
        <button type="button" className="ci-skip" onClick={leave}>
          Skip intro
        </button>
      )}
    </section>
  );
};

export default CityIntro;
