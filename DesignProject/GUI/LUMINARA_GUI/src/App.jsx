import React, { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import {
  LayoutGrid,
  Crosshair,
  Clock,
  Sun,
  Settings,
  Bell,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  MapPin,
} from 'lucide-react';
import StreetlightMap from './StreetlightMap.jsx';

/* ==========================================================================
   DESIGN TOKENS (sampled from the approved designs)
   navy #13223b | page bg #f3f6f9 | green #27a85a | red #e04848
   amber #f0a020 | blue #3b82f6 | ink #14233c | muted #6b7a90
   ========================================================================== */

const pad2 = (n) => String(n).padStart(2, '0');

/* ==========================================================================
   MOCK DATA — copied from the design images
   ========================================================================== */

// Dashboard lamp grid (Image 1): 21 ON, L-007 & L-018 FAULT, L-024 OFF
const LAMPS = Array.from({ length: 24 }, (_, i) => {
  const id = `L-${String(i + 1).padStart(3, '0')}`;
  const status = id === 'L-007' || id === 'L-018' ? 'FAULT' : id === 'L-024' ? 'OFF' : 'ON';
  return { id, status };
});

const LAMP_TILE = {
  ON: 'bg-[#e3f4ea] border-[#9dd5b2] text-[#1f9a52]',
  FAULT: 'bg-[#fde8e8] border-[#f0a3a3] text-[#e04040]',
  OFF: 'bg-[#fff3d6] border-[#f0b84a] text-[#c98a0a]',
};

const ALERTS = [
  { id: 'L-008', dot: 'bg-[#e04848]', text: 'Lamp fault detected', when: '2 min ago' },
  { id: 'L-014', dot: 'bg-[#f0a82e]', text: 'Signal not received', when: '18 min ago' },
  { id: 'L-021', dot: 'bg-[#27a85a]', text: 'Voltage restored', when: '1 hr ago' },
];

// Monitoring table (Image 2). Page 1 is exactly the 7 rows in the design;
// the remaining 17 devices fill the later pages.
const d = (id, loc, status, level, vol, time) => ({ id, loc, status, level, vol, time });
const DEVICES = [
  d('L-001', 'Main Road • North', 'ONLINE', 92, '221 V', '10:42 AM'),
  d('L-002', 'Main Road • North', 'ONLINE', 88, '220 V', '10:42 AM'),
  d('L-008', 'Market Street • East', 'FAULT', 0, '0 V', '10:40 AM'),
  d('L-014', 'School Road • West', 'OFFLINE', null, '—', '10:24 AM'),
  d('L-017', 'Rizal Avenue • South', 'ONLINE', 95, '222 V', '10:42 AM'),
  d('L-021', 'Park Entrance • South', 'ONLINE', 81, '219 V', '10:41 AM'),
  d('L-024', 'Barangay Hall • Central', 'ONLINE', 90, '221 V', '10:42 AM'),
  d('L-003', 'Main Road • South', 'ONLINE', 90, '220 V', '10:42 AM'),
  d('L-004', 'Main Road • South', 'ONLINE', 94, '222 V', '10:42 AM'),
  d('L-005', 'Market Street • West', 'ONLINE', 87, '219 V', '10:41 AM'),
  d('L-006', 'Market Street • West', 'ONLINE', 91, '221 V', '10:42 AM'),
  d('L-007', 'Market Street • Central', 'ONLINE', 89, '220 V', '10:42 AM'),
  d('L-009', 'School Road • East', 'ONLINE', 93, '221 V', '10:42 AM'),
  d('L-010', 'School Road • East', 'ONLINE', 85, '219 V', '10:41 AM'),
  d('L-011', 'School Road • Central', 'ONLINE', 90, '220 V', '10:42 AM'),
  d('L-012', 'School Road • Central', 'ONLINE', 88, '220 V', '10:42 AM'),
  d('L-013', 'School Road • West', 'ONLINE', 92, '222 V', '10:42 AM'),
  d('L-015', 'Rizal Avenue • North', 'ONLINE', 86, '219 V', '10:41 AM'),
  d('L-016', 'Rizal Avenue • North', 'ONLINE', 91, '221 V', '10:42 AM'),
  d('L-018', 'Rizal Avenue • South', 'ONLINE', 90, '220 V', '10:42 AM'),
  d('L-019', 'Park Entrance • North', 'ONLINE', 84, '218 V', '10:41 AM'),
  d('L-020', 'Park Entrance • North', 'ONLINE', 90, '220 V', '10:42 AM'),
  d('L-022', 'Park Entrance • South', 'ONLINE', 89, '221 V', '10:42 AM'),
  d('L-023', 'Barangay Hall • Central', 'ONLINE', 92, '221 V', '10:42 AM'),
];
const STREETS = [...new Set(DEVICES.map((x) => x.loc.split(' • ')[0]))];
const PAGE_SIZE = 7;

const STATUS_BADGE = {
  ONLINE: 'bg-[#e3f4ea] text-[#1f9a52]',
  FAULT: 'bg-[#fde8e8] text-[#e04040]',
  OFFLINE: 'bg-[#fff3d6] text-[#f0a020]',
};

// Details chart (Image 3): green while normal, red once voltage collapses.
// t = minutes after midnight (570 = 09:30)
const VOLTAGE_DATA = [
  { t: 570, ok: 221 },
  { t: 577, ok: 226 },
  { t: 583, ok: 222 },
  { t: 590, ok: 221 },
  { t: 597, ok: 223 },
  { t: 603, ok: 222 },
  { t: 610, ok: 140, bad: 140 },
  { t: 617, bad: 0 },
  { t: 623, bad: 0 },
  { t: 630, bad: 0 },
];
const fmtTime = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;

// Maintenance (Image 4)
const TICKETS = [
  { id: 'MT-1048', device: 'L-008 • Market Street', issue: 'Lamp not illuminating', priority: 'HIGH', status: 'OPEN', updated: '10:40 AM' },
  { id: 'MT-1047', device: 'L-014 • School Road', issue: 'No telemetry received', priority: 'MEDIUM', status: 'ASSIGNED', updated: '10:24 AM' },
  { id: 'MT-1046', device: 'L-021 • Park Entrance', issue: 'Intermittent voltage', priority: 'MEDIUM', status: 'IN PROGRESS', updated: '09:52 AM' },
  { id: 'MT-1045', device: 'L-003 • Main Road', issue: 'Photocell cleaned', priority: 'LOW', status: 'RESOLVED', updated: '09:31 AM' },
  { id: 'MT-1044', device: 'L-019 • Rizal Avenue', issue: 'Connector replaced', priority: 'LOW', status: 'RESOLVED', updated: 'Yesterday' },
];
const PRIORITY_BADGE = {
  HIGH: 'bg-[#fde8e8] text-[#e04040]',
  MEDIUM: 'bg-[#fff3d6] text-[#f0a020]',
  LOW: 'bg-[#e3f4ea] text-[#1f9a52]',
};
const TICKET_STATUS_BADGE = {
  OPEN: 'bg-[#fde8e8] text-[#e04040]',
  ASSIGNED: 'bg-[#fff3d6] text-[#f0a020]',
  'IN PROGRESS': 'bg-[#fff3d6] text-[#f0a020]',
  RESOLVED: 'bg-[#e3f4ea] text-[#1f9a52]',
};

/* ==========================================================================
   SHARED COMPONENTS
   ========================================================================== */

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutGrid },
  { id: 'monitoring', label: 'Streetlights', Icon: Crosshair },
  { id: 'map', label: 'Streetlight Map', Icon: MapPin },
  { id: 'maintenance', label: 'Maintenance', Icon: Clock },
  { id: 'controls', label: 'Controls', Icon: Sun },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

const Sidebar = ({ currentScreen, setScreen }) => (
  <aside className="w-64 bg-[#13223b] text-white h-screen fixed left-0 top-0 flex flex-col justify-between">
    <div>
      <div className="px-8 pt-8 flex items-center gap-3">
        <div className="w-12 h-12 bg-[#27a85a] rounded-full flex items-center justify-center font-bold text-lg">SL</div>
        <div>
          <div className="font-bold text-2xl leading-tight">LUMINARA</div>
          <div className="text-xs font-bold text-[#cdd7e5]">STREETLIGHTS</div>
        </div>
      </div>
      <nav className="mt-12 px-3.5 space-y-2.5">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = currentScreen === id || (currentScreen === 'details' && id === 'monitoring');
          return (
            <button
              key={id}
              onClick={() => setScreen(id)}
              className={`w-full h-14 flex items-center px-5 rounded-lg border-l-[5px] text-base transition-colors ${
                active
                  ? 'bg-[#1b2e4b] border-[#27a85a] text-white font-semibold'
                  : 'border-transparent text-[#d5deea] hover:bg-[#1b2e4b]'
              }`}
            >
              <Icon className={`w-5 h-5 mr-4 ${active ? 'text-[#27a85a]' : 'opacity-70'}`} />
              {label}
            </button>
          );
        })}
      </nav>
    </div>
    <button
      title="Sign out"
      onClick={() => setScreen('login')}
      className="m-4 p-4 bg-[#1b2e4b] rounded-xl flex items-center gap-3 text-left hover:bg-[#223758] transition-colors"
    >
      <div className="w-10 h-10 bg-[#27a85a] rounded-full flex items-center justify-center font-bold">A</div>
      <div>
        <div className="text-sm font-bold">Admin User</div>
        <div className="text-xs text-[#cdd7e5]">Engineering</div>
      </div>
    </button>
  </aside>
);

/* Title bar + the sub-row (subtitle on the left, actions on the right) */
const Header = ({ title, subtitle, actions }) => (
  <>
    <div className="flex justify-between items-center border-b-[3px] border-[#e1e7ee] pb-6">
      <h1 className="text-3xl font-bold text-[#14233c]">{title}</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-[#5b6b82]">Barangay 6</span>
        <button className="w-12 h-12 bg-white border border-[#e1e7ee] rounded-full flex items-center justify-center hover:bg-gray-50" aria-label="Notifications">
          <Bell className="w-5 h-5 text-[#5b6b82]" />
        </button>
        <div className="w-12 h-12 bg-[#e0f3e8] text-[#27a85a] font-bold rounded-full flex items-center justify-center">A</div>
      </div>
    </div>
    {(subtitle || actions) && (
      <div className="flex justify-between items-center mt-5 mb-6 min-h-[42px]">
        <div className="text-sm text-[#6b7a90]">{subtitle}</div>
        {actions}
      </div>
    )}
  </>
);

const Page = ({ children }) => (
  <main className="ml-64 p-10 bg-[#f3f6f9] min-h-screen text-[#14233c]">{children}</main>
);

const Card = ({ big = false, className = '', children }) => (
  <div className={`bg-white border border-[#e6ebf1] ${big ? 'rounded-[2rem]' : 'rounded-2xl'} ${className}`}>
    {children}
  </div>
);

const Pill = ({ className = '', children }) => (
  <span className={`inline-flex items-center justify-center rounded-md text-xs font-bold uppercase ${className}`}>{children}</span>
);

const OutlineButton = ({ className = '', ...p }) => (
  <button {...p} className={`h-[42px] px-6 bg-white border border-[#e1e7ee] rounded-md text-sm font-semibold text-[#14233c] hover:bg-gray-50 ${className}`} />
);
const PrimaryButton = ({ className = '', ...p }) => (
  <button {...p} className={`h-[42px] px-6 bg-[#27a85a] text-white rounded-md text-sm font-semibold hover:bg-[#1f9a52] ${className}`} />
);

/* ==========================================================================
   SCREEN 1 — LOGIN
   ========================================================================== */

const Login = ({ onSignIn }) => (
  <div className="flex h-screen w-full">
    <div className="w-1/2 bg-[#1b3049] flex flex-col justify-center px-[120px]">
      <div className="w-[72px] h-[72px] bg-[#27a85a] rounded-full flex items-center justify-center font-bold text-2xl text-white mb-10">SL</div>
      <h1 className="text-5xl font-bold text-white mb-4">LUMINARA</h1>
      <h2 className="text-lg font-bold text-[#c3cfdf] mb-14">SMART STREETLIGHT SYSTEM</h2>
      <p className="text-[28px] leading-snug text-white font-semibold mb-12">
        Streetlight monitoring<br />and control center
      </p>
      <div className="w-[84px] h-1.5 bg-[#27a85a] mb-12"></div>
      <p className="text-base text-[#c3cfdf]">Barangay 6 • Carmona, Cavite</p>
    </div>

    <div className="w-1/2 bg-[#12213a] flex items-center justify-center">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSignIn();
        }}
        className="bg-white rounded-[3rem] p-14 w-full max-w-[536px]"
      >
        <h2 className="text-3xl font-bold text-[#14233c] mb-3">Welcome back</h2>
        <p className="text-sm text-[#6b7a90] mb-12">Sign in to manage your network</p>

        <label htmlFor="email" className="block text-xs font-bold text-[#6b7a90] uppercase mb-2">Email or Username</label>
        <input id="email" type="text" defaultValue="admin@lumen.local" className="w-full h-[60px] bg-[#f3f6f9] border border-[#e1e7ee] rounded-lg px-5 text-base text-[#5b6b82] outline-none focus:ring-1 focus:ring-[#27a85a] mb-6" />

        <label htmlFor="password" className="block text-xs font-bold text-[#6b7a90] uppercase mb-2">Password</label>
        <input id="password" type="password" defaultValue="••••••••••••" className="w-full h-[60px] bg-[#f3f6f9] border border-[#e1e7ee] rounded-lg px-5 text-base text-[#5b6b82] outline-none focus:ring-1 focus:ring-[#27a85a]" />

        <div className="text-right mt-3 mb-6">
          <a href="#" onClick={(e) => e.preventDefault()} className="text-xs font-bold text-[#27a85a]">Forgot password?</a>
        </div>

        <button type="submit" className="w-full h-[65px] bg-[#27a85a] hover:bg-[#1f9a52] text-white font-bold rounded-lg text-base">
          SIGN IN →
        </button>
        <p className="text-center text-xs text-[#6b7a90] mt-5">Authorized personnel only</p>
      </form>
    </div>
  </div>
);

/* ==========================================================================
   SCREEN 2 — DASHBOARD OVERVIEW
   ========================================================================== */

const Dashboard = ({ setScreen }) => {
  const summary = [
    { label: 'Total Lights', value: '24', note: 'Across monitored streets', bg: 'bg-[#27a85a]', mark: 'dot' },
    { label: 'Online', value: '21', note: '87.5% operational', bg: 'bg-[#27a85a]', mark: 'dot' },
    { label: 'Fault Alerts', value: '02', note: 'Needs attention', bg: 'bg-[#e04848]', mark: '!' },
    { label: 'Offline', value: '01', note: 'No recent signal', bg: 'bg-[#f0a82e]', mark: 'dot' },
  ];

  return (
    <Page>
      <Header title="Dashboard Overview" subtitle="Good afternoon, Admin" />

      <div className="grid grid-cols-4 gap-6 mb-7">
        {summary.map((c) => (
          <Card key={c.label} className="p-6">
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 shrink-0 rounded-full ${c.bg} flex items-center justify-center text-white text-sm font-bold`}>
                {c.mark === '!' ? '!' : <span className="w-1.5 h-1.5 bg-white rounded-full"></span>}
              </div>
              <div>
                <div className="text-xs font-semibold text-[#5b6b82] uppercase">{c.label}</div>
                <div className="text-4xl font-bold leading-tight">{c.value}</div>
              </div>
            </div>
            <div className="text-xs text-[#6b7a90] mt-3">{c.note}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-[1.9fr_1fr] gap-8 items-start">
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold">Streetlight Network</h2>
            <Pill className="px-5 py-2.5 bg-[#e3f4ea] text-[#27a85a]">Live Status</Pill>
          </div>
          <Card big className="p-7">
            <div className="flex justify-between items-center mb-7">
              <h3 className="font-bold">LAMP NETWORK STATUS</h3>
              <span className="text-xs font-bold text-[#1f9a52]">● 21 normal</span>
            </div>
            <div className="grid grid-cols-6 gap-3.5">
              {LAMPS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setScreen('details')}
                  className={`h-14 rounded-md border-2 flex flex-col items-center justify-center hover:shadow-md transition-shadow ${LAMP_TILE[l.status]}`}
                >
                  <span className="text-xs font-bold text-[#14233c]">{l.id}</span>
                  <span className="text-[10px] font-bold mt-1">{l.status}</span>
                </button>
              ))}
            </div>
            <p className="mt-8 text-xs text-[#6b7a90] italic">Select a lamp tile to open its readings and fault details.</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card big className="p-6">
            <h3 className="font-bold text-lg mb-5">Recent Alerts</h3>
            {ALERTS.map((a, i) => (
              <div
                key={a.id}
                onClick={a.id === 'L-008' ? () => setScreen('details') : undefined}
                className={`${i < ALERTS.length - 1 ? 'border-b-2 border-[#e6ebf1] pb-4 mb-4' : ''} ${a.id === 'L-008' ? 'cursor-pointer' : ''}`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className={`w-4 h-4 rounded-full ${a.dot}`}></span>
                    <span className="font-bold text-sm">{a.id}</span>
                  </div>
                  <span className="text-xs text-[#6b7a90]">{a.when}</span>
                </div>
                <p className="text-sm text-[#6b7a90] mt-1 ml-7">{a.text}</p>
              </div>
            ))}
          </Card>

          <Card big className="p-6">
            <h3 className="font-bold text-lg mb-5">System Activity</h3>
            <div className="flex justify-between items-center mb-4 text-sm">
              <span className="text-[#6b7a90]">Last sync</span>
              <span className="font-bold">10:42:08 AM</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#6b7a90]">Network status</span>
              <Pill className="px-5 py-2.5 bg-[#e3f4ea] text-[#27a85a]">Connected</Pill>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
};

/* ==========================================================================
   SCREEN 3 — STREETLIGHT MONITORING
   ========================================================================== */

const Monitoring = ({ setScreen }) => {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [streetFilter, setStreetFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const q = query.trim().toLowerCase();
  const filtered = DEVICES.filter(
    (x) =>
      (statusFilter === 'ALL' || x.status === statusFilter) &&
      (streetFilter === 'ALL' || x.loc.startsWith(streetFilter)) &&
      (q === '' || x.id.toLowerCase().includes(q) || x.loc.toLowerCase().includes(q))
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const onChange = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };
  const selectCls = 'h-10 px-4 bg-[#f3f6f9] border border-[#e1e7ee] rounded-md text-sm text-[#14233c] focus:outline-none';

  return (
    <Page>
      <Header
        title="Streetlight Monitoring"
        subtitle="Manage devices and inspect current readings"
        actions={
          <div className="flex gap-4">
            <OutlineButton>Export CSV</OutlineButton>
            <PrimaryButton>+ Add Light</PrimaryButton>
          </div>
        }
      />

      <Card className="px-6 py-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative w-[382px]">
            <Search className="w-4 h-4 text-[#8895a7] absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={onChange(setQuery)}
              placeholder="Search ID, location..."
              className="w-full h-10 pl-10 pr-3 bg-[#f3f6f9] border border-[#e1e7ee] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#27a85a]"
            />
          </div>
          <select value={statusFilter} onChange={onChange(setStatusFilter)} className={`${selectCls} w-44`}>
            <option value="ALL">All statuses</option>
            <option value="ONLINE">Online</option>
            <option value="FAULT">Fault</option>
            <option value="OFFLINE">Offline</option>
          </select>
          <select value={streetFilter} onChange={onChange(setStreetFilter)} className={`${selectCls} w-44`}>
            <option value="ALL">All streets</option>
            {STREETS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-[#6b7a90] mr-4">{DEVICES.length} devices</span>
      </Card>

      <Card big className="p-3 pb-0 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#f3f6f9] text-xs font-bold text-[#6b7a90] uppercase">
              <th className="py-4 pl-4 rounded-l-lg">Device ID</th>
              <th className="py-4">Location</th>
              <th className="py-4">Status</th>
              <th className="py-4">Light Level</th>
              <th className="py-4">Voltage</th>
              <th className="py-4">Last Update</th>
              <th className="py-4 rounded-r-lg"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x, i) => (
              <tr
                key={x.id}
                onClick={x.id === 'L-008' ? () => setScreen('details') : undefined}
                className={`h-[58px] border-b-2 border-[#e6ebf1] ${i % 2 === 1 ? 'bg-[#f8fafc]' : ''} ${x.id === 'L-008' ? 'cursor-pointer' : ''}`}
              >
                <td className="pl-4 font-bold text-sm">{x.id}</td>
                <td className="text-sm">{x.loc}</td>
                <td>
                  <Pill className={`w-[105px] h-9 ${STATUS_BADGE[x.status]}`}>{x.status}</Pill>
                </td>
                <td>
                  {x.level !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="w-28 h-1.5 bg-[#e3e8ee] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${x.status === 'FAULT' ? 'bg-[#e04848]' : 'bg-[#27a85a]'}`}
                          style={{ width: x.level === 0 ? '2px' : `${x.level}%` }}
                        ></div>
                      </div>
                      <span className="text-xs font-bold">{x.level}%</span>
                    </div>
                  ) : (
                    <span className="text-sm text-[#6b7a90]">No data</span>
                  )}
                </td>
                <td className="text-sm">{x.vol}</td>
                <td className="text-sm text-[#6b7a90]">{x.time}</td>
                <td className="pr-4 text-right">
                  <button className="text-[#5b6b82] hover:text-[#14233c]" aria-label={`Actions for ${x.id}`}>
                    <MoreHorizontal className="w-6 h-6 inline" />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-[#6b7a90]">No devices match your search.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="px-4 py-4 flex justify-between items-center text-xs text-[#6b7a90]">
          <span>Showing {rows.length} of {filtered.length} devices</span>
          <div className="flex items-center gap-2 font-bold text-[#14233c]">
            <button disabled={current === 1} onClick={() => setPage(current - 1)} className="disabled:opacity-30" aria-label="Previous page">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-6 h-6 rounded ${p === current ? 'bg-[#13223b] text-white' : 'hover:bg-[#f3f6f9]'}`}
              >
                {p}
              </button>
            ))}
            <button disabled={current === pageCount} onClick={() => setPage(current + 1)} className="disabled:opacity-30" aria-label="Next page">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Card>
    </Page>
  );
};

/* ==========================================================================
   SCREEN 4 — STREETLIGHT DETAILS (L-008)
   ========================================================================== */

const redDot = (props) => {
  const { cx, cy, payload } = props;
  // the 10:10 point is drawn by the green line; red line starts from it
  if (payload.t === 610) return <g key="skip" />;
  return <circle key={payload.t} cx={cx} cy={cy} r={5} fill="#e04848" />;
};

const Details = ({ setScreen }) => {
  const metrics = [
    { label: 'Light Level', value: '0%', note: 'No illumination', color: 'text-[#e04848]' },
    { label: 'Voltage', value: '0 V', note: 'Below normal range', color: 'text-[#e04848]' },
    { label: 'Current', value: '0.00 A', note: 'No load detected', color: 'text-[#f0a82e]' },
    { label: 'Signal', value: 'Offline', note: 'Last seen 10:24 AM', color: 'text-[#f0a82e]' },
  ];
  const info = [
    ['Installation ID', 'ST-008-24'],
    ['Firmware', 'v1.2.4'],
    ['Last communication', '10:24:16 AM'],
  ];

  return (
    <Page>
      <Header
        title="Streetlight Details"
        subtitle={
          <button onClick={() => setScreen('monitoring')} className="text-xs font-bold text-[#27a85a] flex items-center hover:underline">
            <ChevronLeft className="w-3 h-3 mr-1" /> All streetlights
          </button>
        }
      />

      <div className="flex justify-between items-center -mt-2">
        <div className="flex items-center gap-6">
          <h2 className="text-4xl font-bold">L-008</h2>
          <Pill className="px-6 py-2.5 bg-[#fde8e8] text-[#e04040]">Fault</Pill>
        </div>
        <div className="flex gap-4">
          <OutlineButton>Edit Device</OutlineButton>
          <PrimaryButton className="h-[44px]">Run Test</PrimaryButton>
        </div>
      </div>
      <p className="text-[#6b7a90] mt-1 mb-5">Market Street • East section</p>

      <div className="grid grid-cols-4 gap-6 mb-7">
        {metrics.map((m) => (
          <Card key={m.label} className="p-5">
            <div className="text-xs font-bold text-[#5b6b82] uppercase mb-2">{m.label}</div>
            <div className={`text-4xl font-bold ${m.color}`}>{m.value}</div>
            <div className="text-xs text-[#6b7a90] mt-3">{m.note}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-[1.66fr_1fr] gap-7 items-start">
        <Card big className="p-6">
          <h3 className="font-bold text-lg mb-3">Sensor Readings</h3>
          <p className="text-sm font-bold text-[#6b7a90] mb-3 ml-3">Voltage (V)</p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={VOLTAGE_DATA} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e3e8ee" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={[570, 630]}
                  ticks={[570, 585, 600, 615, 630]}
                  tickFormatter={fmtTime}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7a90', fontSize: 11 }}
                />
                <YAxis hide domain={[-25, 250]} ticks={[0, 80, 160, 240]} />
                <Line type="linear" dataKey="ok" stroke="#27a85a" strokeWidth={2} dot={{ r: 5, fill: '#27a85a', strokeWidth: 0 }} isAnimationActive={false} />
                <Line type="linear" dataKey="bad" stroke="#e04848" strokeWidth={2} dot={redDot} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-6">
          <Card big className="p-6">
            <h3 className="font-bold text-lg mb-5">Device Information</h3>
            <div className="space-y-5">
              {info.map(([k, v]) => (
                <div key={k} className="flex justify-between items-center text-sm">
                  <span className="text-[#6b7a90]">{k}</span>
                  <span className="font-bold">{v}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card big className="p-6">
            <h3 className="font-bold text-lg mb-4">Active Alert</h3>
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 shrink-0 rounded-full bg-[#fde8e8] text-[#e04848] flex items-center justify-center font-bold">!</div>
              <div>
                <h4 className="font-bold">Lamp failure suspected</h4>
                <p className="text-xs text-[#6b7a90] mt-2">Voltage and light readings are below threshold.</p>
              </div>
            </div>
            <button onClick={() => setScreen('maintenance')} className="px-6 py-3 bg-[#fde8e8] text-[#e04040] text-xs font-bold uppercase rounded-md hover:bg-[#fbd5d5]">
              Open Alert
            </button>
          </Card>
        </div>
      </div>
    </Page>
  );
};

/* ==========================================================================
   SCREEN 5 — MAINTENANCE & FAULT HISTORY
   ========================================================================== */

const Maintenance = () => {
  const [filter, setFilter] = useState('ALL');
  const rows = TICKETS.filter((t) => filter === 'ALL' || t.status === filter);

  const summary = [
    { label: 'Open Faults', value: '02', color: 'text-[#e04848]', tint: 'bg-[#fde8e8]' },
    { label: 'In Progress', value: '03', color: 'text-[#f0a82e]', tint: 'bg-[#fff3d6]' },
    { label: 'Resolved Today', value: '05', color: 'text-[#27a85a]', tint: 'bg-[#e3f4ea]' },
    { label: 'Avg. Response', value: '18 min', color: 'text-[#3b82f6]', tint: 'bg-[#e6edfc]' },
  ];

  return (
    <Page>
      <Header
        title="Maintenance & Fault History"
        subtitle="Fault reports and technician activity"
        actions={
          <div className="flex gap-4">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-[42px] px-4 bg-white border border-[#e1e7ee] rounded-md text-sm font-semibold text-[#14233c] focus:outline-none"
              aria-label="Filter tickets"
            >
              <option value="ALL">Filter: All</option>
              <option value="OPEN">Filter: Open</option>
              <option value="ASSIGNED">Filter: Assigned</option>
              <option value="IN PROGRESS">Filter: In Progress</option>
              <option value="RESOLVED">Filter: Resolved</option>
            </select>
            <PrimaryButton>+ New Report</PrimaryButton>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-6 mb-8">
        {summary.map((c) => (
          <Card key={c.label} className="p-6 flex justify-between items-start">
            <div>
              <div className="text-xs font-bold text-[#5b6b82] uppercase">{c.label}</div>
              <div className={`text-4xl font-bold mt-3 ${c.color}`}>{c.value}</div>
            </div>
            <span className={`w-9 h-9 rounded-full ${c.tint}`}></span>
          </Card>
        ))}
      </div>

      <Card big className="p-6 pb-10">
        <h2 className="text-lg font-bold mb-4">Recent Maintenance Tickets</h2>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#f3f6f9] text-xs font-bold text-[#6b7a90] uppercase">
              <th className="py-4 pl-4 rounded-l-lg">Ticket</th>
              <th className="py-4">Device / Location</th>
              <th className="py-4">Issue</th>
              <th className="py-4">Priority</th>
              <th className="py-4">Status</th>
              <th className="py-4 rounded-r-lg">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.id} className={`h-[65px] ${i % 2 === 1 ? 'bg-[#f8fafc]' : ''}`}>
                <td className="pl-4 font-bold text-sm">{t.id}</td>
                <td className="text-sm">{t.device}</td>
                <td className="text-sm">{t.issue}</td>
                <td><Pill className={`w-[122px] h-9 ${PRIORITY_BADGE[t.priority]}`}>{t.priority}</Pill></td>
                <td><Pill className={`w-[122px] h-9 ${TICKET_STATUS_BADGE[t.status]}`}>{t.status}</Pill></td>
                <td className="text-sm text-[#6b7a90]">{t.updated}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-[#6b7a90]">No tickets with this status.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </Page>
  );
};

/* ==========================================================================
   SCREEN 6 — LIGHTING CONTROLS & SCHEDULE
   ========================================================================== */

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const nowLabel = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

const Controls = () => {
  const [lightOn, setLightOn] = useState(true);
  const [faults, setFaults] = useState(2);
  const [scheduleOn, setScheduleOn] = useState(true);
  const [days, setDays] = useState(DAY_LETTERS.map(() => true));
  const [activity, setActivity] = useState([
    { color: 'bg-[#27a85a]', time: '10:38 AM', text: 'SL-001 switched ON' },
    { color: 'bg-[#3b82f6]', time: '10:12 AM', text: 'Schedule updated' },
    { color: 'bg-[#e04848]', time: '09:46 AM', text: 'SL-008 test failed' },
  ]);

  const log = (color, text) =>
    setActivity((prev) => [{ color, time: nowLabel(), text }, ...prev].slice(0, 4));

  const toggleLight = () => {
    const next = !lightOn;
    setLightOn(next);
    log(next ? 'bg-[#27a85a]' : 'bg-[#f0a82e]', `SL-001 switched ${next ? 'ON' : 'OFF'}`);
  };
  const allLights = (on) => {
    setLightOn(on);
    log(on ? 'bg-[#27a85a]' : 'bg-[#f0a82e]', `All 24 lights switched ${on ? 'ON' : 'OFF'}`);
  };
  const resetFaults = () => {
    setFaults(0);
    log('bg-[#3b82f6]', 'Fault alerts reset');
  };
  const toggleDay = (i) => {
    setDays((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
    log('bg-[#3b82f6]', 'Schedule updated');
  };
  const toggleSchedule = () => {
    setScheduleOn(!scheduleOn);
    log('bg-[#3b82f6]', `Schedule turned ${scheduleOn ? 'OFF' : 'ON'}`);
  };

  const quick = [
    { label: 'Turn all ON', note: '24 devices', onClick: () => allLights(true) },
    { label: 'Turn all OFF', note: '24 devices', onClick: () => allLights(false) },
    { label: 'Reset fault alerts', note: `${faults} active alerts`, onClick: resetFaults },
  ];

  return (
    <Page>
      <Header
        title="Lighting Controls & Schedule"
        subtitle="Device switching and operating schedule"
        actions={<Pill className="px-6 py-3 bg-[#e3f4ea] text-[#27a85a]">System Online</Pill>}
      />

      <div className="grid grid-cols-[1.8fr_1fr] gap-x-8 gap-y-7">
        {/* Manual Control */}
        <Card big className="p-6">
          <h3 className="font-bold text-lg mb-5">Manual Control</h3>
          <div className="flex justify-between items-start px-2">
            <div>
              <div className="text-xs text-[#6b7a90] mb-3">Selected device</div>
              <div className="text-4xl font-bold mb-3">L-001</div>
              <div className="text-sm text-[#6b7a90]">Main Road • North</div>
            </div>
            <div className="text-center">
              <button
                role="switch"
                aria-checked={lightOn}
                onClick={toggleLight}
                className={`w-[291px] h-[102px] rounded-2xl px-6 flex items-center justify-between transition-colors ${
                  lightOn ? 'bg-[#e3f4ea]' : 'bg-[#eceff3] flex-row-reverse'
                }`}
              >
                <span className={`text-xl font-bold ${lightOn ? 'text-[#27a85a]' : 'text-[#8895a7]'}`}>
                  {lightOn ? 'LIGHT ON' : 'LIGHT OFF'}
                </span>
                <span className={`w-[72px] h-[72px] rounded-full ${lightOn ? 'bg-[#27a85a]' : 'bg-[#b8c2cf]'}`}></span>
              </button>
              <p className="text-xs text-[#6b7a90] mt-5">Remote switching enabled</p>
            </div>
          </div>
        </Card>

        {/* Quick Actions */}
        <Card big className="p-6">
          <h3 className="font-bold text-lg mb-5">Quick Actions</h3>
          <div className="space-y-3">
            {quick.map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                className="w-full px-5 py-4 bg-[#f3f6f9] border border-[#e1e7ee] rounded-lg flex justify-between items-center hover:bg-[#eaeff4]"
              >
                <span className="text-sm font-bold">{a.label}</span>
                <span className="text-xs text-[#6b7a90]">{a.note}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Automatic Schedule */}
        <Card big className="p-6">
          <h3 className="font-bold text-lg mb-5">Automatic Schedule</h3>
          <div className="flex justify-between items-start px-2">
            <div className="flex gap-24">
              <div>
                <div className="font-bold">Sunset ON</div>
                <div className="text-3xl font-bold text-[#27a85a] mt-2">06:00 PM</div>
              </div>
              <div>
                <div className="font-bold">Sunrise OFF</div>
                <div className="text-3xl font-bold mt-2">06:00 AM</div>
              </div>
            </div>
            <button onClick={toggleSchedule} aria-pressed={scheduleOn}>
              <Pill className={`px-6 py-3 ${scheduleOn ? 'bg-[#e3f4ea] text-[#27a85a]' : 'bg-[#eceff3] text-[#8895a7]'}`}>
                Schedule {scheduleOn ? 'ON' : 'OFF'}
              </Pill>
            </button>
          </div>
          <hr className="my-6 border-t-2 border-[#e6ebf1] mx-2" />
          <div className="px-2">
            <div className="text-xs font-bold text-[#6b7a90] mb-4">Days of operation</div>
            <div className="flex gap-3.5">
              {DAY_LETTERS.map((letter, i) => (
                <button
                  key={i}
                  role="switch"
                  aria-checked={days[i]}
                  onClick={() => toggleDay(i)}
                  className={`w-10 h-10 rounded-full text-xs font-bold transition-colors ${
                    days[i] ? 'bg-[#e3f4ea] text-[#27a85a]' : 'bg-[#eceff3] text-[#8895a7]'
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Control Activity */}
        <Card big className="p-6">
          <h3 className="font-bold text-lg mb-5">Control Activity</h3>
          <div className="space-y-5">
            {activity.map((a, i) => (
              <div key={`${a.time}-${i}`} className="flex items-start gap-4">
                <span className={`w-4 h-4 mt-0.5 rounded-full shrink-0 ${a.color}`}></span>
                <div>
                  <div className="text-xs font-bold text-[#6b7a90]">{a.time}</div>
                  <div className="text-sm mt-1">{a.text}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
};

/* ==========================================================================
   SETTINGS — nav target only (no approved design for it)
   ========================================================================== */

const SettingsPlaceholder = () => (
  <Page>
    <Header title="Settings" />
    <Card big className="p-10 text-center text-sm text-[#6b7a90]">Settings are not part of this release.</Card>
  </Page>
);

/* ==========================================================================
   APP CONTAINER
   ========================================================================== */

const App = () => {
  const [currentScreen, setCurrentScreen] = useState('login');

  if (currentScreen === 'login') {
    return <Login onSignIn={() => setCurrentScreen('dashboard')} />;
  }

  return (
    <div className="font-sans bg-[#f3f6f9] min-h-screen">
      <Sidebar currentScreen={currentScreen} setScreen={setCurrentScreen} />
      {currentScreen === 'dashboard' && <Dashboard setScreen={setCurrentScreen} />}
      {currentScreen === 'monitoring' && <Monitoring setScreen={setCurrentScreen} />}
      {currentScreen === 'map' && (
        <StreetlightMap
          Page={Page}
          Header={Header}
          Card={Card}
          Pill={Pill}
          devices={DEVICES}
          detailsDeviceIds={['L-008']}
          onOpenDetails={() => setCurrentScreen('details')}
        />
      )}
      {currentScreen === 'details' && <Details setScreen={setCurrentScreen} />}
      {currentScreen === 'maintenance' && <Maintenance />}
      {currentScreen === 'controls' && <Controls />}
      {currentScreen === 'settings' && <SettingsPlaceholder />}
    </div>
  );
};

export default App;
