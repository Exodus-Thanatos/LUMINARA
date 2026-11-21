// import React, { useEffect, useMemo, useState } from 'react';
// import {
//   LineChart,
//   Line,
//   XAxis,
//   YAxis,
//   CartesianGrid,
//   ResponsiveContainer,
// } from 'recharts';
// import {
//   LayoutGrid,
//   Crosshair,
//   Clock,
//   Sun,
//   Settings,
//   Bell,
//   Search,
//   ChevronLeft,
//   ChevronRight,
//   MoreHorizontal,
// //   Menu,
//   X,
// } from 'lucide-react';
// import StreetlightMap from './StreetlightMap.jsx';
// import { useLiveLamps, mergeLive, byLampId } from './useLiveLamps.js';
// import CityIntro from './CityIntro.jsx';
// import { shouldPlayIntro } from './introSession.js';

// /* ==========================================================================
//    DESIGN TOKENS (sampled from the approved designs)
//    navy #13223b | page bg #f3f6f9 | green #27a85a | red #e04848
//    amber #f0a020 | blue #3b82f6 | ink #14233c | muted #6b7a90
//    ========================================================================== */

// const pad2 = (n) => String(n).padStart(2, '0');

// /* ==========================================================================
//    MOCK DATA — copied from the design images
//    ========================================================================== */

// // Dashboard lamp grid (Image 1): 21 ON, L-007 & L-018 FAULT, L-024 OFF
// // const LAMPS = Array.from({ length: 24 }, (_, i) => {
// //   const id = `L-${String(i + 1).padStart(3, '0')}`;
// //   const status = id === 'L-007' || id === 'L-018' ? 'FAULT' : id === 'L-024' ? 'OFF' : 'ON';
// //   return { id, status };
// // });

// // Dashboard lamp grid: 19 planned lamps, only 3 installed so far
// const PLANNED_TOTAL = 19;
// const INSTALLED = { 'L-001': 'ON', 'L-002': 'OFF', 'L-003': 'FAULT' }; // change IDs/statuses here
// const LAMPS = Array.from({ length: PLANNED_TOTAL }, (_, i) => {
//   const id = `L-${String(i + 1).padStart(3, '0')}`;
//   return { id, status: INSTALLED[id] ?? 'UNINSTALLED' };
// });

// // Monitoring table (Image 2). Page 1 is exactly the 7 rows in the design;
// // the remaining 17 devices fill the later pages.
// // const d = (id, loc, status, level, vol, time) => ({ id, loc, status, level, vol, time });
// // const DEVICES = [
// //   d('L-001', 'Main Road • North', 'ONLINE', 92, '221 V', '10:42 AM'),
// //   d('L-002', 'Main Road • North', 'ONLINE', 88, '220 V', '10:42 AM'),
// //   d('L-008', 'Market Street • East', 'FAULT', 0, '0 V', '10:40 AM'),
// //   d('L-014', 'School Road • West', 'OFFLINE', null, '—', '10:24 AM'),
// //   d('L-017', 'Rizal Avenue • South', 'ONLINE', 95, '222 V', '10:42 AM'),
// //   d('L-021', 'Park Entrance • South', 'ONLINE', 81, '219 V', '10:41 AM'),
// //   d('L-024', 'Barangay Hall • Central', 'ONLINE', 90, '221 V', '10:42 AM'),
// //   d('L-003', 'Main Road • South', 'ONLINE', 90, '220 V', '10:42 AM'),
// //   d('L-004', 'Main Road • South', 'ONLINE', 94, '222 V', '10:42 AM'),
// //   d('L-005', 'Market Street • West', 'ONLINE', 87, '219 V', '10:41 AM'),
// //   d('L-006', 'Market Street • West', 'ONLINE', 91, '221 V', '10:42 AM'),
// //   d('L-007', 'Market Street • Central', 'ONLINE', 89, '220 V', '10:42 AM'),
// //   d('L-009', 'School Road • East', 'ONLINE', 93, '221 V', '10:42 AM'),
// //   d('L-010', 'School Road • East', 'ONLINE', 85, '219 V', '10:41 AM'),
// //   d('L-011', 'School Road • Central', 'ONLINE', 90, '220 V', '10:42 AM'),
// //   d('L-012', 'School Road • Central', 'ONLINE', 88, '220 V', '10:42 AM'),
// //   d('L-013', 'School Road • West', 'ONLINE', 92, '222 V', '10:42 AM'),
// //   d('L-015', 'Rizal Avenue • North', 'ONLINE', 86, '219 V', '10:41 AM'),
// //   d('L-016', 'Rizal Avenue • North', 'ONLINE', 91, '221 V', '10:42 AM'),
// //   d('L-018', 'Rizal Avenue • South', 'ONLINE', 90, '220 V', '10:42 AM'),
// //   d('L-019', 'Park Entrance • North', 'ONLINE', 84, '218 V', '10:41 AM'),
// //   d('L-020', 'Park Entrance • North', 'ONLINE', 90, '220 V', '10:42 AM'),
// //   d('L-022', 'Park Entrance • South', 'ONLINE', 89, '221 V', '10:42 AM'),
// //   d('L-023', 'Barangay Hall • Central', 'ONLINE', 92, '221 V', '10:42 AM'),
// // ].sort(byLampId); // always in ID order
// // Sample readings for lamps that have a node. Only a node can report these:
// // light (BH1750 aimed at the bulb), battery (18650) and LoRa signal.
// const NODE_SAMPLE = {
//   'L-001': { lux: 4210, batt: '3.92 V', rssi: '-71 dBm', ago: 12 },
//   'L-002': { lux: 3985, batt: '3.88 V', rssi: '-84 dBm', ago: 31 },
//   'L-003': { lux: 4377, batt: '3.85 V', rssi: '-96 dBm', ago: 47 },
// };
// const DEVICES = Array.from({ length: PLANNED_TOTAL }, (_, i) => {
//   const n = i + 1;
//   const id = `L-${String(n).padStart(3, '0')}`;
//   const loc = `${n <= 15 ? 'Straight road' : 'Intersection'} • Pole ${pad2(n)}`;
//   if (!INSTALLED[id]) {
//     return { id, loc, status: 'UNINSTALLED', level: null, lux: null, batt: '—', rssi: '—', vol: '—', time: '—' };
//   }
//   const s = NODE_SAMPLE[id] ?? { lux: 4000, batt: '3.90 V', rssi: '-80 dBm', ago: 20 };
//   const fault = INSTALLED[id] === 'FAULT';
//   return {
//     id, loc, level: null, vol: '—',
//     status: fault ? 'FAULT' : 'ONLINE',
//     lux: fault ? 0.8 : s.lux,
//     reported: fault ? 'Lamp dark' : 'Lamp ON',
//     batt: s.batt, rssi: s.rssi, time: `${s.ago} s ago`,
//   };
// }).sort(byLampId);

// // Panel meter (PZEM-004T on the breaker): ONE reading for the whole feed, not per lamp.
// // Sample: 19 lamps at roughly 150-200 W each. Adjust to the real lamp rating.
// const PANEL = { voltage: '227.4 V', current: '14.2 A', power: '3.07 kW', contactor: 'ON' };
// const PAGE_SIZE = 7;

// const STATUS_BADGE = {
//   ONLINE: 'bg-[#e3f4ea] text-[#1f9a52]',
//   FAULT: 'bg-[#fde8e8] text-[#e04040]',
//   OFFLINE: 'bg-[#fff3d6] text-[#f0a020]',
//   WARNING: 'bg-[#fff3d6] text-[#c98a0a]',
//   UNINSTALLED: 'bg-[#f3f6f9] text-[#9aa7b8]',
//   'NO DATA': 'bg-[#eceff3] text-[#8895a7]',
// };

// // Details chart (Image 3): green while normal, red once voltage collapses.
// // t = minutes after midnight (570 = 09:30)
// const VOLTAGE_DATA = [
//   { t: 570, ok: 221 },
//   { t: 577, ok: 226 },
//   { t: 583, ok: 222 },
//   { t: 590, ok: 221 },
//   { t: 597, ok: 223 },
//   { t: 603, ok: 222 },
//   { t: 610, ok: 140, bad: 140 },
//   { t: 617, bad: 0 },
//   { t: 623, bad: 0 },
//   { t: 630, bad: 0 },
// ];
// const fmtTime = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;

// // Maintenance (Image 4)
// // SAMPLE tickets. `ticket` is the maintenance ticket number (MT-0000); `lamp` is the lamp ID (L-000).
// const TICKETS = [
//   { id: 'MT-1048', lamp: 'L-008', where: 'Market Street', issue: 'Lamp not illuminating', priority: 'HIGH', status: 'OPEN', updated: '10:40 AM' },
//   { id: 'MT-1047', lamp: 'L-014', where: 'School Road', issue: 'No telemetry received', priority: 'MEDIUM', status: 'ASSIGNED', updated: '10:24 AM' },
//   { id: 'MT-1046', lamp: 'L-021', where: 'Park Entrance', issue: 'Intermittent voltage', priority: 'MEDIUM', status: 'IN PROGRESS', updated: '09:52 AM' },
//   { id: 'MT-1045', lamp: 'L-003', where: 'Main Road', issue: 'Photocell cleaned', priority: 'LOW', status: 'RESOLVED', updated: '09:31 AM' },
//   { id: 'MT-1044', lamp: 'L-019', where: 'Park Entrance', issue: 'Connector replaced', priority: 'LOW', status: 'RESOLVED', updated: 'Yesterday' },
// ];
// const PRIORITY_BADGE = {
//   HIGH: 'bg-[#fde8e8] text-[#e04040]',
//   MEDIUM: 'bg-[#fff3d6] text-[#f0a020]',
//   LOW: 'bg-[#e3f4ea] text-[#1f9a52]',
// };
// const TICKET_STATUS_BADGE = {
//   OPEN: 'bg-[#fde8e8] text-[#e04040]',
//   ASSIGNED: 'bg-[#fff3d6] text-[#f0a020]',
//   'IN PROGRESS': 'bg-[#fff3d6] text-[#f0a020]',
//   RESOLVED: 'bg-[#e3f4ea] text-[#1f9a52]',
// };

// /* ==========================================================================
//    SHARED COMPONENTS
//    ========================================================================== */

// const NAV_ITEMS = [
//   { id: 'dashboard', label: 'Dashboard', Icon: LayoutGrid },
//   { id: 'monitoring', label: 'Streetlights', Icon: Crosshair },
//   { id: 'map', label: 'Streetlight Map', Icon: MapPin },
//   { id: 'maintenance', label: 'Maintenance', Icon: Clock },
//   { id: 'controls', label: 'Controls', Icon: Sun },
//   { id: 'settings', label: 'Settings', Icon: Settings },
// ];

// const Sidebar = ({ currentScreen, setScreen, open = false, onClose = () => {} }) => (
//   <aside
//     id="sidebar"
//     className={`w-64 bg-[#13223b] text-white h-screen fixed left-0 top-0 z-50 flex flex-col justify-between overflow-y-auto transition-transform duration-200 lg:translate-x-0 ${
//       open ? 'translate-x-0' : '-translate-x-full invisible lg:visible'
//     }`}
//   >
//     <div>
//       <div className="px-8 pt-8 flex items-center gap-3">
//         <div className="w-12 h-12 bg-[#27a85a] rounded-full flex items-center justify-center font-bold text-lg">SL</div>
//         <div className="flex-1">
//           <div className="font-bold text-2xl leading-tight">LUMINARA</div>
//           <div className="text-xs font-bold text-[#cdd7e5]">STREETLIGHTS</div>
//         </div>
//         <button onClick={onClose} className="lg:hidden -mr-4 w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[#1b2e4b]" aria-label="Close menu">
//           <X className="w-5 h-5" />
//         </button>
//       </div>
//       <nav className="mt-8 lg:mt-12 px-3.5 space-y-2.5">
//         {NAV_ITEMS.map(({ id, label, Icon }) => {
//           const active = currentScreen === id || (currentScreen === 'details' && id === 'monitoring');
//           return (
//             <button
//               key={id}
//               onClick={() => {
//                 setScreen(id);
//                 onClose();
//               }}
//               className={`w-full h-14 flex items-center px-5 rounded-lg border-l-[5px] text-base transition-colors ${
//                 active
//                   ? 'bg-[#1b2e4b] border-[#27a85a] text-white font-semibold'
//                   : 'border-transparent text-[#d5deea] hover:bg-[#1b2e4b]'
//               }`}
//             >
//               <Icon className={`w-5 h-5 mr-4 ${active ? 'text-[#27a85a]' : 'opacity-70'}`} />
//               {label}
//             </button>
//           );
//         })}
//       </nav>
//     </div>
//     <button
//       title="Sign out"
//       onClick={() => setScreen('login')}
//       className="m-4 p-4 bg-[#1b2e4b] rounded-xl flex items-center gap-3 text-left hover:bg-[#223758] transition-colors"
//     >
//       <div className="w-10 h-10 bg-[#27a85a] rounded-full flex items-center justify-center font-bold">A</div>
//       <div>
//         <div className="text-sm font-bold">Admin User</div>
//         <div className="text-xs text-[#cdd7e5]">Engineering</div>
//       </div>
//     </button>
//   </aside>
// );

// /* Title bar + the sub-row (subtitle on the left, actions on the right) */
// const Header = ({ title, subtitle, actions }) => (
//   <>
//     <div className="flex justify-between items-center border-b-[3px] border-[#e1e7ee] pb-4 md:pb-6">
//       <h1 className="text-2xl md:text-3xl font-bold text-[#14233c]">{title}</h1>
//       <div className="hidden md:flex items-center gap-4">
//         <span className="text-sm font-semibold text-[#5b6b82]">Barangay 6</span>
//         <button className="w-12 h-12 bg-white border border-[#e1e7ee] rounded-full flex items-center justify-center hover:bg-gray-50" aria-label="Notifications">
//           <Bell className="w-5 h-5 text-[#5b6b82]" />
//         </button>
//         <div className="w-12 h-12 bg-[#e0f3e8] text-[#27a85a] font-bold rounded-full flex items-center justify-center">A</div>
//       </div>
//     </div>
//     {(subtitle || actions) && (
//       <div className="flex flex-col items-start gap-3 md:flex-row md:justify-between md:items-center mt-4 md:mt-5 mb-5 md:mb-6 md:min-h-[42px]">
//         <div className="text-sm text-[#6b7a90]">{subtitle}</div>
//         {actions}
//       </div>
//     )}
//   </>
// );

// const Page = ({ children }) => (
//   <main className="lg:ml-64 pt-[4.5rem] px-4 pb-8 md:px-6 lg:p-10 bg-[#f3f6f9] min-h-screen text-[#14233c] overflow-x-hidden">{children}</main>
// );

// const Card = ({ big = false, className = '', children }) => (
//   <div className={`bg-white border border-[#e6ebf1] ${big ? 'rounded-3xl md:rounded-[2rem]' : 'rounded-2xl'} ${className}`}>
//     {children}
//   </div>
// );

// const Pill = ({ className = '', children }) => (
//   <span className={`inline-flex items-center justify-center rounded-md text-xs font-bold uppercase ${className}`}>{children}</span>
// );

// const OutlineButton = ({ className = '', ...p }) => (
//   <button {...p} className={`h-[42px] px-6 bg-white border border-[#e1e7ee] rounded-md text-sm font-semibold text-[#14233c] hover:bg-gray-50 ${className}`} />
// );
// const PrimaryButton = ({ className = '', ...p }) => (
//   <button {...p} className={`h-[42px] px-6 bg-[#27a85a] text-white rounded-md text-sm font-semibold hover:bg-[#1f9a52] ${className}`} />
// );

// /* ==========================================================================
//    SCREEN 1 — LOGIN
//    ========================================================================== */

// const Login = ({ onSignIn }) => (
//   <div className="flex flex-col lg:flex-row min-h-screen lg:h-screen w-full">
//     <div className="lg:w-1/2 bg-[#1b3049] flex flex-col justify-center px-6 py-8 lg:px-[120px] lg:py-0">
//       <div className="w-14 h-14 lg:w-[72px] lg:h-[72px] bg-[#27a85a] rounded-full flex items-center justify-center font-bold text-xl lg:text-2xl text-white mb-5 lg:mb-10">SL</div>
//       <h1 className="text-4xl lg:text-5xl font-bold text-white mb-2 lg:mb-4">LUMINARA</h1>
//       <h2 className="text-sm lg:text-lg font-bold text-[#c3cfdf] mb-4 lg:mb-14">SMART STREETLIGHT SYSTEM</h2>
//       <p className="hidden lg:block text-[28px] leading-snug text-white font-semibold mb-12">
//         Streetlight monitoring<br />and control center
//       </p>
//       <div className="hidden lg:block w-[84px] h-1.5 bg-[#27a85a] mb-12"></div>
//       <p className="text-base text-[#c3cfdf]">Barangay 6 • Carmona, Cavite</p>
//     </div>

//     <div className="flex-1 lg:w-1/2 lg:flex-none bg-[#12213a] flex items-center justify-center px-4 py-8 lg:p-0">
//       <form
//         onSubmit={(e) => {
//           e.preventDefault();
//           onSignIn();
//         }}
//         className="bg-white rounded-[2rem] lg:rounded-[3rem] p-6 sm:p-10 lg:p-14 w-full max-w-[536px]"
//       >
//         <h2 className="text-3xl font-bold text-[#14233c] mb-3">Welcome back</h2>
//         <p className="text-sm text-[#6b7a90] mb-8 lg:mb-12">Sign in to manage your network</p>

//         <label htmlFor="email" className="block text-xs font-bold text-[#6b7a90] uppercase mb-2">Email or Username</label>
//         <input id="email" type="text" defaultValue="admin@lumen.local" className="w-full h-[60px] bg-[#f3f6f9] border border-[#e1e7ee] rounded-lg px-5 text-base text-[#5b6b82] outline-none focus:ring-1 focus:ring-[#27a85a] mb-6" />

//         <label htmlFor="password" className="block text-xs font-bold text-[#6b7a90] uppercase mb-2">Password</label>
//         <input id="password" type="password" defaultValue="••••••••••••" className="w-full h-[60px] bg-[#f3f6f9] border border-[#e1e7ee] rounded-lg px-5 text-base text-[#5b6b82] outline-none focus:ring-1 focus:ring-[#27a85a]" />

//         <div className="text-right mt-3 mb-6">
//           <a href="#" onClick={(e) => e.preventDefault()} className="text-xs font-bold text-[#27a85a]">Forgot password?</a>
//         </div>

//         <button type="submit" className="w-full h-[65px] bg-[#27a85a] hover:bg-[#1f9a52] text-white font-bold rounded-lg text-base">
//           SIGN IN →
//         </button>
//         <p className="text-center text-xs text-[#6b7a90] mt-5">Authorized personnel only</p>
//       </form>
//     </div>
//   </div>
// );

// /* ==========================================================================
//    SCREEN 2 — DASHBOARD OVERVIEW
//    ========================================================================== */

// const Dashboard = ({ setScreen, devices, mode, lastSync }) => {
//   const live = mode === 'live';
//   const count = (st) => devices.filter((x) => x.status === st).length;
//   const nOnline = count('ONLINE');
//   const nAlert = count('FAULT') + count('WARNING');

//   const demoCount = (st) => LAMPS.filter((l) => l.status === st).length;
//   const nInstalled = LAMPS.length - demoCount('UNINSTALLED');

//   const tiles = live ? devices : LAMPS;
//   const liveAlerts = devices
//     .filter((x) => ['FAULT', 'WARNING', 'OFFLINE'].includes(x.status))
//     .map((x) => ({
//       id: x.id,
//       dot: x.status === 'FAULT' ? 'bg-[#e04848]' : 'bg-[#f0a82e]',
//       text: x.status === 'OFFLINE'
//         ? `No signal from node (last reported ${x.reported})`
//         : !x.known ? `Unrecognised status ${x.reported}` : `Reported ${x.reported}${x.comm === 'Stale' ? ' (report delayed)' : ''}`,
//       when: x.time,
//     }));
//   const alerts = live ? liveAlerts : ALERTS;
//   const summary = live ? [
//     { label: 'Total Lights', value: pad2(devices.length), note: 'Detected by the dashboard', bg: 'bg-[#27a85a]', mark: 'dot' }, //devices.length — value
//     { label: 'Online', value: pad2(nOnline), note: 'Reporting normally', bg: 'bg-[#27a85a]', mark: 'dot' },
//     { label: 'Fault Alerts', value: pad2(nAlert), note: 'Reported by nodes', bg: 'bg-[#e04848]', mark: '!' },
//     { label: 'Offline', value: pad2(count('OFFLINE')), note: 'No recent signal', bg: 'bg-[#f0a82e]', mark: 'dot' },
//     ] : [
//     { label: 'Total Lights', value: String(PLANNED_TOTAL), note: `${nInstalled} installed, ${PLANNED_TOTAL - nInstalled} uninstalled`, bg: 'bg-[#27a85a]', mark: 'dot' },
//     { label: 'Online', value: pad2(demoCount('ON')), note: 'Installed and reporting', bg: 'bg-[#27a85a]', mark: 'dot' },
//     { label: 'Fault Alerts', value: pad2(demoCount('FAULT')), note: 'Needs attention', bg: 'bg-[#e04848]', mark: '!' },
//     { label: 'Offline', value: pad2(demoCount('OFF')), note: 'No recent signal', bg: 'bg-[#f0a82e]', mark: 'dot' },
//   ];
//   return (
//     <Page>
//       <Header title="Dashboard Overview" subtitle="Good afternoon, Admin" />

//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-7">
//         {summary.map((c) => (
//           <Card key={c.label} className="p-4 md:p-6">
//             <div className="flex items-start gap-4">
//               <div className={`w-10 h-10 shrink-0 rounded-full ${c.bg} flex items-center justify-center text-white text-sm font-bold`}>
//                 {c.mark === '!' ? '!' : <span className="w-1.5 h-1.5 bg-white rounded-full"></span>}
//               </div>
//               <div>
//                 <div className="text-xs font-semibold text-[#5b6b82] uppercase">{c.label}</div>
//                 <div className="text-4xl font-bold leading-tight">{c.value}</div>
//               </div>
//             </div>
//             <div className="text-xs text-[#6b7a90] mt-3">{c.note}</div>
//           </Card>
//         ))}
//       </div>

//       <div className="grid grid-cols-1 lg:grid-cols-[1.9fr_1fr] gap-6 lg:gap-8 items-start">
//         <div>
//           <div className="flex justify-between items-center mb-3">
//             <h2 className="text-lg font-bold">Streetlight Network</h2>
//             <Pill className="px-5 py-2.5 bg-[#e3f4ea] text-[#27a85a]">Live Status</Pill>
//           </div>
//           <Card big className="p-4 sm:p-7">
//             <div className="flex justify-between items-center mb-5 sm:mb-7">
//               <h3 className="font-bold">LAMP NETWORK STATUS</h3>
//               <span className="text-xs font-bold text-[#1f9a52]">● {live ? nOnline : demoCount('ON')} normal</span>
//             </div>
//             {live && tiles.length === 0 && (
//               <p className="py-10 text-center text-sm text-[#6b7a90]">No lamp nodes detected yet. A lamp appears here when its node first reports.</p>
//             )}
//             <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-3.5">
//               {tiles.map((l) => (
//                 <button
//                   key={l.id}
//                   onClick={live || l.status === 'UNINSTALLED' ? undefined : () => setScreen('details')}
//                   className={`h-14 rounded-md border-2 flex flex-col items-center justify-center hover:shadow-md transition-shadow ${LAMP_TILE[l.status]}`}
//                 >
//                   <span className="text-xs font-bold text-[#14233c]">{l.id}</span>
//                   <span className="text-[10px] font-bold mt-1">{l.status}</span>
//                 </button>
//               ))}
//             </div>
//             <p className="mt-8 text-xs text-[#6b7a90] italic">{live ? 'A lamp appears here automatically when the dashboard detects its node.' : 'Select a lamp tile to open its readings and fault details.'}</p>
//           </Card>
//         </div>

//         <div className="space-y-6">
//           <Card big className="p-6">
//             <h3 className="font-bold text-lg mb-5">Recent Alerts</h3>
//             {live && alerts.length === 0 && <p className="text-sm text-[#6b7a90]">No active alerts.</p>}
//             {alerts.map((a, i) => (
//               <div
//                 key={a.id}
//                 onClick={!live && a.id === 'L-008' ? () => setScreen('details') : undefined}
//                 className={`${i < alerts.length - 1 ? 'border-b-2 border-[#e6ebf1] pb-4 mb-4' : ''} ${!live && a.id === 'L-008' ? 'cursor-pointer' : ''}`}
//               >
//                 <div className="flex justify-between items-center">
//                   <div className="flex items-center gap-3">
//                     <span className={`w-4 h-4 rounded-full ${a.dot}`}></span>
//                     <span className="font-bold text-sm">{a.id}</span>
//                   </div>
//                   <span className="text-xs text-[#6b7a90]">{a.when}</span>
//                 </div>
//                 <p className="text-sm text-[#6b7a90] mt-1 ml-7">{a.text}</p>
//               </div>
//             ))}
//           </Card>

//           <Card big className="p-6">
//             <h3 className="font-bold text-lg mb-5">System Activity</h3>
//             <div className="flex justify-between items-center mb-4 text-sm">
//               <span className="text-[#6b7a90]">Last sync</span>
//               <span className="font-bold">{live ? lastSync : '10:42:08 AM'}</span>
//             </div>
//             <div className="flex justify-between items-center text-sm">
//               <span className="text-[#6b7a90]">Network status</span>
//               <Pill className="px-5 py-2.5 bg-[#e3f4ea] text-[#27a85a]">{live ? 'Receiver connected' : 'Connected'}</Pill>
//             </div>
//           </Card>
//         </div>
//       </div>
//     </Page>
//   );
// };

// /* ==========================================================================
//    SCREEN 3 — STREETLIGHT MONITORING
//    ========================================================================== */

// const Monitoring = ({ setScreen, devices, mode }) => {
//   const detailsEnabled = mode !== 'live'; // the Details screen is still sample data for L-008
//   const streets = useMemo(() => [...new Set(devices.map((x) => x.loc.split(' • ')[0]))], [devices]);
//   const [query, setQuery] = useState('');
//   const [statusFilter, setStatusFilter] = useState('ALL');
//   const [streetFilter, setStreetFilter] = useState('ALL');
//   const [page, setPage] = useState(1);

//   const q = query.trim().toLowerCase();
//   const filtered = devices.filter(
//     (x) =>
//       (statusFilter === 'ALL' || x.status === statusFilter) &&
//       (streetFilter === 'ALL' || x.loc.startsWith(streetFilter)) &&
//       (q === '' || x.id.toLowerCase().includes(q) || x.loc.toLowerCase().includes(q))
//   );
//   const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
//   const current = Math.min(page, pageCount);
//   const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

//   const onChange = (setter) => (e) => {
//     setter(e.target.value);
//     setPage(1);
//   };
//   const selectCls = 'h-11 md:h-10 px-4 bg-[#f3f6f9] border border-[#e1e7ee] rounded-md text-base md:text-sm text-[#14233c] focus:outline-none';

//   return (
//     <Page>
//       <Header
//         title="Streetlight Monitoring"
//         subtitle="Manage devices and inspect current readings"
//         actions={
//           <div className="flex flex-wrap gap-3">
//             <OutlineButton>Export CSV</OutlineButton>
//             <PrimaryButton>+ Add Light</PrimaryButton>
//           </div>
//         }
//       />

//       <Card className="px-4 md:px-6 py-4 mb-5 md:mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
//         <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 md:gap-4 md:w-auto">
//           <div className="relative w-full sm:w-[300px] lg:w-[382px]">
//             <Search className="w-4 h-4 text-[#8895a7] absolute left-4 top-1/2 -translate-y-1/2" />
//             <input
//               type="text"
//               value={query}
//               onChange={onChange(setQuery)}
//               placeholder="Search ID, location..."
//               className="w-full h-11 md:h-10 pl-10 pr-3 bg-[#f3f6f9] border border-[#e1e7ee] rounded-md text-base md:text-sm focus:outline-none focus:ring-1 focus:ring-[#27a85a]"
//             />
//           </div>
//           <select value={statusFilter} onChange={onChange(setStatusFilter)} className={`${selectCls} w-full sm:w-44`}>
//             <option value="ALL">All statuses</option>
//             <option value="ONLINE">Online</option>
//             <option value="FAULT">Fault</option>
//             <option value="OFFLINE">Offline</option>
//             <option value="WARNING">Warning</option>
//             <option value="UNINSTALLED">Uninstalled</option>
//           </select>
//           <select value={streetFilter} onChange={onChange(setStreetFilter)} className={`${selectCls} w-full sm:w-44`}>
//             <option value="ALL">All streets</option>
//             {streets.map((s) => (
//               <option key={s} value={s}>{s}</option>
//             ))}
//           </select>
//         </div>
//         <span className="text-sm text-[#6b7a90] md:mr-4">{devices.filter((x) => x.status !== 'UNINSTALLED').length} installed of {devices.length}</span>
//       </Card>

//       {mode !== 'live' && (
//   <Card className="px-4 md:px-6 py-4 mb-5 md:mb-6">
//     <div className="flex items-center justify-between mb-3">
//       <h3 className="font-bold text-sm">Panel feed <span className="font-normal text-[#6b7a90]">· whole line, all {PLANNED_TOTAL} lamps</span></h3>
//       <span className="text-[11px] text-[#6b7a90]">Sample data</span>
//     </div>
//     <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
//       {[['Voltage', PANEL.voltage], ['Current', PANEL.current], ['Active power', PANEL.power], ['Contactor', PANEL.contactor]].map(([k, v]) => (
//         <div key={k} className="bg-[#f3f6f9] rounded-lg px-4 py-3">
//           <div className="text-[11px] font-semibold text-[#6b7a90] uppercase">{k}</div>
//           <div className="text-xl font-bold mt-1">{v}</div>
//         </div>
//       ))}
//     </div>
//   </Card>
// )}

//       <Card big className="p-3 pb-0 overflow-hidden">
//         <div className="hidden md:block">
//         <table className="w-full text-left border-collapse">
//           <thead>
//             <tr className="bg-[#f3f6f9] text-xs font-bold text-[#6b7a90] uppercase">
//               <th className="py-4 pl-4 rounded-l-lg">Device ID</th>
//               <th className="py-4">Location</th>
//               <th className="py-4">Status</th>
//               <th className="py-4">Light Level</th>
//               <th className="py-4">Battery</th>
//               <th className="py-4">Signal</th>
//               <th className="py-4">Last Update</th>
//               <th className="py-4 rounded-r-lg"></th>
//             </tr>
//           </thead>
//           <tbody>
//             {rows.map((x, i) => (
//               <tr
//                 key={x.id}
//                 onClick={detailsEnabled && x.id === 'L-008' ? () => setScreen('details') : undefined}
//                 className={`h-[58px] border-b-2 border-[#e6ebf1] ${x.status === 'UNINSTALLED' ? 'opacity-60' : ''} ${i % 2 === 1 ? 'bg-[#f8fafc]' : ''} ${detailsEnabled && x.id === 'L-008' ? 'cursor-pointer' : ''}`}
//               >
//                 <td className="pl-4 font-bold text-sm">{x.id}</td>
//                 <td className="text-sm">{x.loc}</td>
//                 <td>
//                   <Pill className={`w-[105px] h-9 ${STATUS_BADGE[x.status]}`}>{x.status}</Pill>
//                 </td>
//                 <td>
//                 {x.status === 'UNINSTALLED' ? (
//                     <span className="text-sm text-[#9aa7b8]">Not installed</span>
//                   ) : x.lux != null ? (
//                     <div>
//                       <span className="text-sm font-bold">{x.lux.toFixed(1)} lx</span>
//                       <div className="text-[10px] text-[#6b7a90]">{x.reported}{x.comm === 'Stale' ? ' · delayed' : ''}</div>
//                     </div>
//                   ) : x.level !== null ? (
//                     <div className="flex items-center gap-2">
//                       <div className="w-28 h-1.5 bg-[#e3e8ee] rounded-full overflow-hidden">
//                         <div
//                           className={`h-full ${x.status === 'FAULT' ? 'bg-[#e04848]' : 'bg-[#27a85a]'}`}
//                           style={{ width: x.level === 0 ? '2px' : `${x.level}%` }}
//                         ></div>
//                       </div>
//                       <span className="text-xs font-bold">{x.level}%</span>
//                     </div>
//                   ) : x.reported ? (
//                     <div>
//                       <span className="text-sm text-[#6b7a90]">No reading</span>
//                       <div className="text-[10px] text-[#6b7a90]">{x.status === 'OFFLINE' ? `Last: ${x.reported}` : x.reported}</div>
//                     </div>
//                   ) : (
//                     <span className="text-sm text-[#6b7a90]">No data</span>
//                   )}
//                 </td>
//                 <td className="text-sm">{x.batt ?? '—'}</td>
//                 <td className="text-sm">{x.rssi ?? '—'}</td>
//                 <td className="text-sm text-[#6b7a90]">{x.time}</td>
//                 <td className="pr-4 text-right">
//                   <button className="text-[#5b6b82] hover:text-[#14233c]" aria-label={`Actions for ${x.id}`}>
//                     <MoreHorizontal className="w-6 h-6 inline" />
//                   </button>
//                 </td>
//               </tr>
//             ))}
//             {rows.length === 0 && (
//               <tr>
//                 <td colSpan={8} className="py-10 text-center text-sm text-[#6b7a90]">{devices.length === 0 ? 'No lamp nodes detected yet.' : 'No devices match your search.'}</td>
//               </tr>
//             )}
//           </tbody>
//         </table>
//         </div>

//         <ul className="md:hidden">
//           {rows.map((x) => (
//             <li
//               key={x.id}
//               onClick={detailsEnabled && x.id === 'L-008' ? () => setScreen('details') : undefined}
//               className={`px-2 py-4 border-b-2 border-[#e6ebf1] ${detailsEnabled && x.id === 'L-008' ? 'cursor-pointer active:bg-[#f3f6f9]' : ''}`}
//             >
//               <div className="flex items-center justify-between gap-3">
//                 <div className="min-w-0">
//                   <div className="font-bold text-sm">{x.id}</div>
//                   <div className="text-sm text-[#6b7a90] truncate">{x.loc}</div>
//                 </div>
//                 <Pill className={`px-3 h-8 shrink-0 ${STATUS_BADGE[x.status]}`}>{x.status}</Pill>
//               </div>
//               <div className="flex items-center gap-3 mt-3 text-xs">
//                   {x.status === 'UNINSTALLED' ? (
//                   <span className="flex-1 text-[#9aa7b8]">Not installed</span>
//                 ) : x.lux != null ? (
//                   <span className="flex-1 font-bold">{x.lux.toFixed(1)} lx <span className="font-normal text-[#6b7a90]">{x.reported}{x.comm === 'Stale' ? ' · delayed' : ''}</span></span>
//                 ) : x.level !== null ? (
//                   <div className="flex items-center gap-2 flex-1 min-w-0">
//                     <div className="flex-1 h-1.5 bg-[#e3e8ee] rounded-full overflow-hidden">
//                       <div
//                         className={`h-full ${x.status === 'FAULT' ? 'bg-[#e04848]' : 'bg-[#27a85a]'}`}
//                         style={{ width: x.level === 0 ? '2px' : `${x.level}%` }}
//                       ></div>
//                     </div>
//                     <span className="font-bold">{x.level}%</span>
//                   </div>
//                 ) : x.reported ? (
//                   <span className="flex-1 text-[#6b7a90]">No reading <span className="font-normal">{x.status === 'OFFLINE' ? `Last: ${x.reported}` : x.reported}</span></span>
//                 ) : (
//                   <span className="flex-1 text-[#6b7a90]">No data</span>
//                 )}
//                 <span className="font-semibold">{x.batt ?? '—'}</span>
//                 <span className="text-[#6b7a90]">{x.time}</span>
//               </div>
//             </li>
//           ))}
//           {rows.length === 0 && <li className="py-10 text-center text-sm text-[#6b7a90]">{devices.length === 0 ? 'No lamp nodes detected yet.' : 'No devices match your search.'}</li>}
//         </ul>

//         <div className="px-4 py-4 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center text-xs text-[#6b7a90]">
//           <span>Showing {rows.length} of {filtered.length} devices</span>
//           <div className="flex items-center gap-2 font-bold text-[#14233c]">
//             <button disabled={current === 1} onClick={() => setPage(current - 1)} className="disabled:opacity-30 p-2 md:p-0" aria-label="Previous page">
//               <ChevronLeft className="w-4 h-4" />
//             </button>
//             {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
//               <button
//                 key={p}
//                 onClick={() => setPage(p)}
//                 className={`w-9 h-9 md:w-6 md:h-6 rounded ${p === current ? 'bg-[#13223b] text-white' : 'hover:bg-[#f3f6f9]'}`}
//               >
//                 {p}
//               </button>
//             ))}
//             <button disabled={current === pageCount} onClick={() => setPage(current + 1)} className="disabled:opacity-30 p-2 md:p-0" aria-label="Next page">
//               <ChevronRight className="w-4 h-4" />
//             </button>
//           </div>
//         </div>
//       </Card>
//     </Page>
//   );
// };

// /* ==========================================================================
//    SCREEN 4 — STREETLIGHT DETAILS (L-008)
//    ========================================================================== */

// const redDot = (props) => {
//   const { cx, cy, payload } = props;
//   // the 10:10 point is drawn by the green line; red line starts from it
//   if (payload.bad == null || payload.t === 610) return <g key={`skip-${payload.t}`} />;
//   return <circle key={payload.t} cx={cx} cy={cy} r={5} fill="#e04848" />;
// };

// const Details = ({ setScreen }) => {
//   const metrics = [
//     { label: 'Light Level', value: '0%', note: 'No illumination', color: 'text-[#e04848]' },
//     { label: 'Voltage', value: '0 V', note: 'Below normal range', color: 'text-[#e04848]' },
//     { label: 'Current', value: '0.00 A', note: 'No load detected', color: 'text-[#f0a82e]' },
//     { label: 'Signal', value: 'Offline', note: 'Last seen 10:24 AM', color: 'text-[#f0a82e]' },
//   ];
//   const info = [
//     ['Installation ID', 'ST-008-24'],
//     ['Firmware', 'v1.2.4'],
//     ['Last communication', '10:24:16 AM'],
//   ];

//   return (
//     <Page>
//       <Header
//         title="Streetlight Details"
//         subtitle={
//           <button onClick={() => setScreen('monitoring')} className="text-xs font-bold text-[#27a85a] flex items-center hover:underline">
//             <ChevronLeft className="w-3 h-3 mr-1" /> All streetlights
//           </button>
//         }
//       />

//       <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center md:-mt-2">
//         <div className="flex items-center gap-4 sm:gap-6">
//           <h2 className="text-4xl font-bold">L-008</h2>
//           <Pill className="px-6 py-2.5 bg-[#fde8e8] text-[#e04040]">Fault</Pill>
//         </div>
//         <div className="flex gap-3 sm:gap-4">
//           <OutlineButton>Edit Device</OutlineButton>
//           <PrimaryButton className="h-[44px]">Run Test</PrimaryButton>
//         </div>
//       </div>
//       <p className="text-[#6b7a90] mt-1 mb-5">Market Street • East section</p>

//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-7">
//         {metrics.map((m) => (
//           <Card key={m.label} className="p-5">
//             <div className="text-xs font-bold text-[#5b6b82] uppercase mb-2">{m.label}</div>
//             <div className={`text-2xl sm:text-4xl font-bold ${m.color}`}>{m.value}</div>
//             <div className="text-xs text-[#6b7a90] mt-3">{m.note}</div>
//           </Card>
//         ))}
//       </div>

//       <div className="grid grid-cols-1 lg:grid-cols-[1.66fr_1fr] gap-6 lg:gap-7 items-start">
//         <Card big className="p-4 md:p-6">
//           <h3 className="font-bold text-lg mb-3">Sensor Readings</h3>
//           <p className="text-sm font-bold text-[#6b7a90] mb-3 ml-3">Voltage (V)</p>
//           <div className="h-56 md:h-72 w-full">
//             <ResponsiveContainer width="100%" height="100%">
//               <LineChart data={VOLTAGE_DATA} margin={{ top: 10, right: 24, left: 24, bottom: 0 }}>
//                 <CartesianGrid vertical={false} stroke="#e3e8ee" />
//                 <XAxis
//                   dataKey="t"
//                   type="number"
//                   domain={[570, 630]}
//                   ticks={[570, 585, 600, 615, 630]}
//                   tickFormatter={fmtTime}
//                   axisLine={false}
//                   tickLine={false}
//                   tick={{ fill: '#6b7a90', fontSize: 11 }}
//                 />
//                 <YAxis hide domain={[-25, 250]} ticks={[0, 80, 160, 240]} />
//                 <Line type="linear" dataKey="ok" stroke="#27a85a" strokeWidth={2} dot={{ r: 5, fill: '#27a85a', strokeWidth: 0 }} isAnimationActive={false} />
//                 <Line type="linear" dataKey="bad" stroke="#e04848" strokeWidth={2} dot={redDot} isAnimationActive={false} />
//               </LineChart>
//             </ResponsiveContainer>
//           </div>
//         </Card>

//         <div className="space-y-6">
//           <Card big className="p-6">
//             <h3 className="font-bold text-lg mb-5">Device Information</h3>
//             <div className="space-y-5">
//               {info.map(([k, v]) => (
//                 <div key={k} className="flex justify-between items-center text-sm">
//                   <span className="text-[#6b7a90]">{k}</span>
//                   <span className="font-bold">{v}</span>
//                 </div>
//               ))}
//             </div>
//           </Card>

//           <Card big className="p-6">
//             <h3 className="font-bold text-lg mb-4">Active Alert</h3>
//             <div className="flex items-start gap-4 mb-5">
//               <div className="w-10 h-10 shrink-0 rounded-full bg-[#fde8e8] text-[#e04848] flex items-center justify-center font-bold">!</div>
//               <div>
//                 <h4 className="font-bold">Lamp failure suspected</h4>
//                 <p className="text-xs text-[#6b7a90] mt-2">Voltage and light readings are below threshold.</p>
//               </div>
//             </div>
//             <button onClick={() => setScreen('maintenance')} className="px-6 py-3 bg-[#fde8e8] text-[#e04040] text-xs font-bold uppercase rounded-md hover:bg-[#fbd5d5]">
//               Open Alert
//             </button>
//           </Card>
//         </div>
//       </div>
//     </Page>
//   );
// };

// /* ==========================================================================
//    SCREEN 5 — MAINTENANCE & FAULT HISTORY
//    ========================================================================== */

// const Maintenance = () => {
//   const [filter, setFilter] = useState('ALL');
//   const rows = TICKETS.filter((t) => filter === 'ALL' || t.status === filter);

//   const summary = [
//     { label: 'Open Faults', value: '02', color: 'text-[#e04848]', tint: 'bg-[#fde8e8]' },
//     { label: 'In Progress', value: '03', color: 'text-[#f0a82e]', tint: 'bg-[#fff3d6]' },
//     { label: 'Resolved Today', value: '05', color: 'text-[#27a85a]', tint: 'bg-[#e3f4ea]' },
//     { label: 'Avg. Response', value: '18 min', color: 'text-[#3b82f6]', tint: 'bg-[#e6edfc]' },
//   ];

//   return (
//     <Page>
//       <Header
//         title="Maintenance & Fault History"
//         subtitle="Fault reports and technician activity"
//         actions={
//           <div className="flex flex-wrap gap-3">
//             <select
//               value={filter}
//               onChange={(e) => setFilter(e.target.value)}
//               className="h-[42px] px-4 bg-white border border-[#e1e7ee] rounded-md text-base md:text-sm font-semibold text-[#14233c] focus:outline-none"
//               aria-label="Filter tickets"
//             >
//               <option value="ALL">Filter: All</option>
//               <option value="OPEN">Filter: Open</option>
//               <option value="ASSIGNED">Filter: Assigned</option>
//               <option value="IN PROGRESS">Filter: In Progress</option>
//               <option value="RESOLVED">Filter: Resolved</option>
//             </select>
//             <PrimaryButton>+ New Report</PrimaryButton>
//           </div>
//         }
//       />

//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
//         {summary.map((c) => (
//           <Card key={c.label} className="p-4 md:p-6 flex justify-between items-start">
//             <div>
//               <div className="text-xs font-bold text-[#5b6b82] uppercase">{c.label}</div>
//               <div className={`text-3xl md:text-4xl font-bold mt-3 ${c.color}`}>{c.value}</div>
//             </div>
//             <span className={`hidden sm:block w-9 h-9 rounded-full ${c.tint}`}></span>
//           </Card>
//         ))}
//       </div>

//       <Card big className="p-4 md:p-6 pb-6 md:pb-10">
//         <div className="flex flex-wrap items-center gap-3 mb-4">
//           <h2 className="text-lg font-bold">Recent Maintenance Tickets</h2>
//           <Pill className="px-3 h-7 bg-[#eceff3] text-[#5b6b82] text-[11px]">SAMPLE DATA</Pill>
//         </div>
//         <div className="hidden md:block">
//         <table className="w-full text-left border-collapse">
//           <thead>
//             <tr className="bg-[#f3f6f9] text-xs font-bold text-[#6b7a90] uppercase">
//               <th className="py-4 pl-4 rounded-l-lg">Ticket No.</th>
//               <th className="py-4">Lamp ID / Location</th>
//               <th className="py-4">Issue</th>
//               <th className="py-4">Priority</th>
//               <th className="py-4">Status</th>
//               <th className="py-4 rounded-r-lg">Updated</th>
//             </tr>
//           </thead>
//           <tbody>
//             {rows.map((t, i) => (
//               <tr key={t.id} className={`h-[65px] ${i % 2 === 1 ? 'bg-[#f8fafc]' : ''}`}>
//                 <td className="pl-4 font-bold text-sm">{t.id}</td>
//                 <td className="text-sm"><span className="font-bold">{t.lamp}</span> • {t.where}</td>
//                 <td className="text-sm">{t.issue}</td>
//                 <td><Pill className={`w-[122px] h-9 ${PRIORITY_BADGE[t.priority]}`}>{priorityLabel(t.priority)}</Pill></td>
//                 <td><Pill className={`w-[122px] h-9 ${TICKET_STATUS_BADGE[t.status]}`}>{t.status}</Pill></td>
//                 <td className="text-sm text-[#6b7a90]">{t.updated}</td>
//               </tr>
//             ))}
//             {rows.length === 0 && (
//               <tr>
//                 <td colSpan={6} className="py-10 text-center text-sm text-[#6b7a90]">No tickets with this status.</td>
//               </tr>
//             )}
//           </tbody>
//         </table>
//         </div>

//         <ul className="md:hidden">
//           {rows.map((t) => (
//             <li key={t.id} className="py-4 border-b-2 border-[#e6ebf1] last:border-b-0">
//               <div className="flex items-center justify-between gap-3">
//                 <span className="font-bold text-sm">{t.id}</span>
//                 <span className="text-xs text-[#6b7a90]">{t.updated}</span>
//               </div>
//               <div className="text-sm mt-1">{t.issue}</div>
//               <div className="text-xs text-[#6b7a90] mt-0.5"><span className="font-bold text-[#14233c]">{t.lamp}</span> • {t.where}</div>
//               <div className="flex gap-2 mt-3">
//                 <Pill className={`px-3 h-8 ${PRIORITY_BADGE[t.priority]}`}>{priorityLabel(t.priority)}</Pill>
//                 <Pill className={`px-3 h-8 ${TICKET_STATUS_BADGE[t.status]}`}>{t.status}</Pill>
//               </div>
//             </li>
//           ))}
//           {rows.length === 0 && <li className="py-10 text-center text-sm text-[#6b7a90]">No tickets with this status.</li>}
//         </ul>
//       </Card>
//     </Page>
//   );
// };

// /* ==========================================================================
//    SCREEN 6 — LIGHTING CONTROLS & SCHEDULE
//    ========================================================================== */

// const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// const nowLabel = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

// const Controls = () => {
//   const [faults, setFaults] = useState(2);
//   const [scheduleOn, setScheduleOn] = useState(true);
//   const [days, setDays] = useState(DAY_LETTERS.map(() => true));
//   const [activity, setActivity] = useState([
//     { color: 'bg-[#3b82f6]', time: '10:12 AM', text: 'Schedule updated' },
//     { color: 'bg-[#e04848]', time: '09:46 AM', text: 'L-008 test failed' },
//   ]);

//   const log = (color, text) =>
//     setActivity((prev) => [{ color, time: nowLabel(), text }, ...prev].slice(0, 4));

//   const resetFaults = () => {
//     setFaults(0);
//     log('bg-[#3b82f6]', 'Fault alerts reset');
//   };
//   const toggleDay = (i) => {
//     setDays((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
//     log('bg-[#3b82f6]', 'Schedule updated');
//   };
//   const toggleSchedule = () => {
//     setScheduleOn(!scheduleOn);
//     log('bg-[#3b82f6]', `Schedule turned ${scheduleOn ? 'OFF' : 'ON'}`);
//   };

//   const quick = [{ label: 'Reset fault alerts', note: `${faults} active alerts`, onClick: resetFaults }];

//   return (
//     <Page>
//       <Header
//         title="Lighting Controls & Schedule"
//         subtitle="Operating schedule and fault alerts"
//         actions={<Pill className="px-6 py-3 bg-[#e3f4ea] text-[#27a85a]">System Online</Pill>}
//       />

//       <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-5 lg:gap-x-8 lg:gap-y-7">
//         {/* Quick Actions */}
//         <Card big className="p-4 sm:p-6">
//           <h3 className="font-bold text-lg mb-5">Quick Actions</h3>
//           <div className="space-y-3">
//             {quick.map((a) => (
//               <button
//                 key={a.label}
//                 onClick={a.onClick}
//                 className="w-full px-5 py-4 bg-[#f3f6f9] border border-[#e1e7ee] rounded-lg flex justify-between items-center hover:bg-[#eaeff4]"
//               >
//                 <span className="text-sm font-bold">{a.label}</span>
//                 <span className="text-xs text-[#6b7a90]">{a.note}</span>
//               </button>
//             ))}
//           </div>
//         </Card>

//         {/* Automatic Schedule */}
//         <Card big className="p-4 sm:p-6 lg:row-span-2 lg:order-first">
//           <h3 className="font-bold text-lg mb-5">Automatic Schedule</h3>
//           <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start px-2">
//             <div className="flex gap-6 sm:gap-24">
//               <div>
//                 <div className="font-bold">Sunset ON</div>
//                 <div className="text-2xl sm:text-3xl font-bold text-[#27a85a] mt-2">06:00 PM</div>
//               </div>
//               <div>
//                 <div className="font-bold">Sunrise OFF</div>
//                 <div className="text-2xl sm:text-3xl font-bold mt-2">06:00 AM</div>
//               </div>
//             </div>
//             <button onClick={toggleSchedule} aria-pressed={scheduleOn}>
//               <Pill className={`px-6 py-3 ${scheduleOn ? 'bg-[#e3f4ea] text-[#27a85a]' : 'bg-[#eceff3] text-[#8895a7]'}`}>
//                 Schedule {scheduleOn ? 'ON' : 'OFF'}
//               </Pill>
//             </button>
//           </div>
//           <hr className="my-6 border-t-2 border-[#e6ebf1] mx-2" />
//           <div className="px-2">
//             <div className="text-xs font-bold text-[#6b7a90] mb-4">Days of operation</div>
//             <div className="grid grid-cols-7 gap-2 sm:flex sm:gap-3.5">
//               {DAY_LETTERS.map((letter, i) => (
//                 <button
//                   key={i}
//                   role="switch"
//                   aria-checked={days[i]}
//                   onClick={() => toggleDay(i)}
//                   className={`w-full aspect-square sm:w-10 sm:h-10 sm:aspect-auto rounded-full text-xs font-bold transition-colors ${
//                     days[i] ? 'bg-[#e3f4ea] text-[#27a85a]' : 'bg-[#eceff3] text-[#8895a7]'
//                   }`}
//                 >
//                   {letter}
//                 </button>
//               ))}
//             </div>
//           </div>
//         </Card>

//         {/* Control Activity */}
//         <Card big className="p-4 sm:p-6">
//           <h3 className="font-bold text-lg mb-5">Control Activity</h3>
//           <div className="space-y-5">
//             {activity.map((a, i) => (
//               <div key={`${a.time}-${i}`} className="flex items-start gap-4">
//                 <span className={`w-4 h-4 mt-0.5 rounded-full shrink-0 ${a.color}`}></span>
//                 <div>
//                   <div className="text-xs font-bold text-[#6b7a90]">{a.time}</div>
//                   <div className="text-sm mt-1">{a.text}</div>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </Card>
//       </div>
//     </Page>
//   );
// };

// /* ==========================================================================
//    SETTINGS — nav target only (no approved design for it)
//    ========================================================================== */

// const SettingsPlaceholder = () => (
//   <Page>
//     <Header title="Settings" />
//     <Card big className="p-10 text-center text-sm text-[#6b7a90]">Settings are not part of this release.</Card>
//   </Page>
// );

// /* ==========================================================================
//    APP CONTAINER
//    ========================================================================== */

// const App = () => {
//   const [currentScreen, setCurrentScreen] = useState('login');
//   const [menuOpen, setMenuOpen] = useState(false); // slide-out menu on phones
//   const [showIntro, setShowIntro] = useState(shouldPlayIntro); // opening city animation (once per session)
//   const liveState = useLiveLamps();
//   const { devices, mode, hasTest, lastSync } = useMemo(() => mergeLive(DEVICES, liveState), [liveState]);

//   useEffect(() => {
//     if (!menuOpen) return undefined;
//     const onKey = (e) => {
//       if (e.key === 'Escape') setMenuOpen(false);
//     };
//     document.addEventListener('keydown', onKey);
//     const prev = document.body.style.overflow;
//     document.body.style.overflow = 'hidden'; // stop the page scrolling behind the menu
//     return () => {
//       document.removeEventListener('keydown', onKey);
//       document.body.style.overflow = prev;
//     };
//   }, [menuOpen]);

//   // phones keep the old scroll position when the screen changes, so jump back to the top
//   useEffect(() => {
//     window.scrollTo(0, 0);
//   }, [currentScreen]);

//   if (currentScreen === 'login') {
//     return (
//       <>
//         <Login onSignIn={() => setCurrentScreen('dashboard')} />
//         {showIntro && <CityIntro onDone={() => setShowIntro(false)} />}
//       </>
//     );
//   }

//   return (
//     <div className="font-sans bg-[#f3f6f9] min-h-screen">
//       <header className="lg:hidden fixed top-0 inset-x-0 h-14 z-30 bg-[#13223b] text-white flex items-center gap-3 px-3">
//         <button
//           onClick={() => setMenuOpen(true)}
//           aria-label="Open menu"
//           aria-expanded={menuOpen}
//           aria-controls="sidebar"
//           className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-[#1b2e4b]"
//         >
//           <Menu className="w-6 h-6" />
//         </button>
//         <div className="w-8 h-8 bg-[#27a85a] rounded-full flex items-center justify-center font-bold text-xs">SL</div>
//         <span className="font-bold text-lg">LUMINARA</span>
//         <span className="ml-auto text-xs font-semibold text-[#cdd7e5]">Barangay 6</span>
//         <div className="w-8 h-8 rounded-full bg-[#e0f3e8] text-[#27a85a] font-bold text-sm flex items-center justify-center">A</div>
//       </header>
//       {menuOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
//       <Sidebar currentScreen={currentScreen} setScreen={setCurrentScreen} open={menuOpen} onClose={() => setMenuOpen(false)} />
//       <div
//         className={`fixed bottom-3 right-3 z-30 px-3 py-1.5 rounded-md text-[11px] font-bold shadow ${
//           mode === 'live' ? (hasTest ? 'bg-[#fff3d6] text-[#c98a0a]' : 'bg-[#e3f4ea] text-[#1f9a52]') : 'bg-[#eceff3] text-[#5b6b82]'
//         }`}
//       >
//         {mode === 'live' ? (hasTest ? 'LIVE + TEST DATA' : 'LIVE DATA') : 'DEMO DATA — receiver not connected'}
//       </div>
//       {currentScreen === 'dashboard' && <Dashboard setScreen={setCurrentScreen} devices={devices} mode={mode} lastSync={lastSync} />}
//       {currentScreen === 'monitoring' && <Monitoring setScreen={setCurrentScreen} devices={devices} mode={mode} />}
//       {currentScreen === 'map' && (
//         <StreetlightMap
//           Page={Page}
//           Header={Header}
//           Card={Card}
//           Pill={Pill}
//           devices={devices}
//           detailsDeviceIds={mode === 'live' ? [] : ['L-008']}
//           onOpenDetails={() => setCurrentScreen('details')}
//         />
//       )}
//       {currentScreen === 'details' && <Details setScreen={setCurrentScreen} />}
//       {currentScreen === 'maintenance' && <Maintenance />}
//       {currentScreen === 'controls' && <Controls />}
//       {currentScreen === 'settings' && <SettingsPlaceholder />}
//     </div>
//   );
// };

// export default App;
import React, { createContext, memo, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
  LoaderCircle,
  Crosshair,
  Clock,
  Sun,
  Settings,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Menu,
  X,
  BookOpen,
  CircleQuestionMark,
  LifeBuoy,
  Users,
  ClipboardList,
  History as HistoryIcon,
  CalendarClock,
  Database,
} from 'lucide-react';
import SettingsScreen from './Settings.jsx';
import PzemPanel from './PzemPanel.jsx';
import ThemeSwitch from './ThemeSwitch.jsx';
import HelpCenter from './HelpCenter.jsx';
import Tutorial from './Tutorial.jsx';
import { readTutorialFlag, writeTutorialFlag } from './tutorialFlag.js';
import NotificationCenter from './NotificationCenter.jsx';
import FaultDetail from './FaultDetail.jsx';
import { ConnectionBadge, AlertSummary } from './DashboardStatus.jsx';
import { describeFault, describeFaults } from './faultInfo.js';
import { syncNotifications } from './notifications.js';
import { CardTitle } from './uiKit.jsx';
import { useNow } from './useNow.js';
import { TicketModal } from './TicketDialogs.jsx';
import { ConfirmDialog } from './Dialogs.jsx';
import ArchivedTickets from './ArchivedTickets.jsx';
import UserManagement from './UserManagement.jsx';
import DataViewer from './DataViewer.jsx';
import HistoryPanel from './HistoryPanel.jsx';
import ScheduleTimes from './ScheduleTimes.jsx';
import PasswordChange from './PasswordChange.jsx';
import { BasicDashboard, AssignedWorks, BasicHistory, BasicSchedule } from './BasicScreens.jsx';
import { apiLogin, apiLogout, apiMe, setUnauthorizedHandler, apiListTickets, apiListArchived, apiCreateTicket, apiUpdateTicket, apiArchiveTicket, apiRestoreTicket, apiImportTickets, apiTechnicians, reportedAtFrom } from './api.js';
import { can, screenAllowed, ROLE_LABEL } from './access.js';
import DeveloperRegister from './DeveloperRegister.jsx';
import { isDevShortcut } from './devShortcut.js';
import { loadPresence, savePresence, technicianUsers, presenceFromUsers } from './presenceStore.js';
import { PRIORITY_BADGE, TICKET_STATUS_BADGE } from './ticketBadges.js';
import { priorityLabel, priorityShort, suggestPriority } from './maintenancePriority.js';
import { loadLamps as loadRegistry } from './streetlightRegistry.js';
import { classifyStreetlight, FAULT_CATALOG, STATUS_MODEL, needsAttention, summarize as summarizeLights } from './streetlightStatus.js';
import { healthOf, TONE_PILL } from './lampHealthUi.js';
import { TechnicianPanel, Dot } from './TechnicianUI.jsx';
import { setPresence, assignmentError, availability } from './technicianStore.js';
import { loadTickets, summarize, formatDuration, formatStamp, STATUSES, MIN_RESPONSES_FOR_AVG } from './maintenanceStore.js';
import { STORAGE_SAMPLE, readShowSample } from './streetlightMapData.js';

// The map (Leaflet) is loaded on demand and then kept mounted, so it is not rebuilt on every visit.
// (Plain dynamic import instead of React.lazy/Suspense: Suspense holds its fallback on screen for ~300 ms even when ready.)
let MapScreenComp = null;
const loadMap = () =>
  MapScreenComp
    ? Promise.resolve(MapScreenComp)
    : import('./StreetlightMap.jsx').then((m) => (MapScreenComp = memo(m.default)));
import { useLiveLamps, mergeLive, byLampId, subscribeControl, getControlSnapshot, controlPushIsFresh } from './useLiveLamps.js';
import CityIntro from './CityIntro.jsx';
import { shouldPlayIntro } from './introSession.js';

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
// const LAMPS = Array.from({ length: 24 }, (_, i) => {
//   const id = `L-${String(i + 1).padStart(3, '0')}`;
//   const status = id === 'L-007' || id === 'L-018' ? 'FAULT' : id === 'L-024' ? 'OFF' : 'ON';
//   return { id, status };
// });

// Dashboard lamp grid: 19 planned lamps, only 3 installed so far
const PLANNED_TOTAL = 19;
const INSTALLED = { 'L-001': 'ON', 'L-002': 'OFF', 'L-003': 'FAULT' }; // change IDs/statuses here
const LAMPS = Array.from({ length: PLANNED_TOTAL }, (_, i) => {
  const id = `L-${String(i + 1).padStart(3, '0')}`;
  return { id, status: INSTALLED[id] ?? 'UNINSTALLED' };
});



// Monitoring table (Image 2). Page 1 is exactly the 7 rows in the design;
// the remaining 17 devices fill the later pages.
// const d = (id, loc, status, level, vol, time) => ({ id, loc, status, level, vol, time });
// const DEVICES = [
//   d('L-001', 'Main Road • North', 'ONLINE', 92, '221 V', '10:42 AM'),
//   d('L-002', 'Main Road • North', 'ONLINE', 88, '220 V', '10:42 AM'),
//   d('L-008', 'Market Street • East', 'FAULT', 0, '0 V', '10:40 AM'),
//   d('L-014', 'School Road • West', 'OFFLINE', null, '—', '10:24 AM'),
//   d('L-017', 'Rizal Avenue • South', 'ONLINE', 95, '222 V', '10:42 AM'),
//   d('L-021', 'Park Entrance • South', 'ONLINE', 81, '219 V', '10:41 AM'),
//   d('L-024', 'Barangay Hall • Central', 'ONLINE', 90, '221 V', '10:42 AM'),
//   d('L-003', 'Main Road • South', 'ONLINE', 90, '220 V', '10:42 AM'),
//   d('L-004', 'Main Road • South', 'ONLINE', 94, '222 V', '10:42 AM'),
//   d('L-005', 'Market Street • West', 'ONLINE', 87, '219 V', '10:41 AM'),
//   d('L-006', 'Market Street • West', 'ONLINE', 91, '221 V', '10:42 AM'),
//   d('L-007', 'Market Street • Central', 'ONLINE', 89, '220 V', '10:42 AM'),
//   d('L-009', 'School Road • East', 'ONLINE', 93, '221 V', '10:42 AM'),
//   d('L-010', 'School Road • East', 'ONLINE', 85, '219 V', '10:41 AM'),
//   d('L-011', 'School Road • Central', 'ONLINE', 90, '220 V', '10:42 AM'),
//   d('L-012', 'School Road • Central', 'ONLINE', 88, '220 V', '10:42 AM'),
//   d('L-013', 'School Road • West', 'ONLINE', 92, '222 V', '10:42 AM'),
//   d('L-015', 'Rizal Avenue • North', 'ONLINE', 86, '219 V', '10:41 AM'),
//   d('L-016', 'Rizal Avenue • North', 'ONLINE', 91, '221 V', '10:42 AM'),
//   d('L-018', 'Rizal Avenue • South', 'ONLINE', 90, '220 V', '10:42 AM'),
//   d('L-019', 'Park Entrance • North', 'ONLINE', 84, '218 V', '10:41 AM'),
//   d('L-020', 'Park Entrance • North', 'ONLINE', 90, '220 V', '10:42 AM'),
//   d('L-022', 'Park Entrance • South', 'ONLINE', 89, '221 V', '10:42 AM'),
//   d('L-023', 'Barangay Hall • Central', 'ONLINE', 92, '221 V', '10:42 AM'),
// ].sort(byLampId); // always in ID order
// Sample readings for lamps that have a node. Only a node can report these:
// light (BH1750 aimed at the bulb), battery (18650) and LoRa signal.
const NODE_SAMPLE = {
  'L-001': { lux: 4210, batt: '3.92 V', rssi: '-71 dBm', ago: 12 },
  'L-002': { lux: 3985, batt: '3.88 V', rssi: '-84 dBm', ago: 31 },
  'L-003': { lux: 4377, batt: '3.85 V', rssi: '-96 dBm', ago: 47 },
};
const DEVICES = Array.from({ length: PLANNED_TOTAL }, (_, i) => {
  const n = i + 1;
  const id = `L-${String(n).padStart(3, '0')}`;
  const loc = `${n <= 15 ? 'Straight road' : 'Intersection'} • Pole ${pad2(n)}`;
  if (!INSTALLED[id]) {
    return { id, loc, status: 'UNINSTALLED', level: null, lux: null, batt: '—', rssi: '—', vol: '—', time: '—' };
  }
  const s = NODE_SAMPLE[id] ?? { lux: 4000, batt: '3.90 V', rssi: '-80 dBm', ago: 20 };
  const fault = INSTALLED[id] === 'FAULT';
  return {
    id, loc, level: null, vol: '—',
    status: fault ? 'FAULT' : 'ONLINE',
    lux: fault ? 0.8 : s.lux,
    reported: fault ? 'Lamp dark' : 'Lamp ON',
    batt: s.batt, rssi: s.rssi, time: `${s.ago} s ago`,
  };
}).sort(byLampId);

// Panel meter (PZEM-004T on the breaker): ONE reading for the whole feed, not per lamp.
// Sample: 19 lamps at roughly 150-200 W each. Adjust to the real lamp rating.
const PANEL = { voltage: '227.4 V', current: '14.2 A', power: '3.07 kW', contactor: 'ON' };
const PAGE_SIZE = 7;

const STATUS_BADGE = {
  ONLINE: 'bg-[#e3f4ea] text-[#1f9a52]',
  FAULT: 'bg-[#fde8e8] text-[#e04040]',
  OFFLINE: 'bg-[#fff3d6] text-[#f0a020]',
  WARNING: 'bg-[#fff3d6] text-[#c98a0a]',
  UNINSTALLED: 'bg-[#f3f6f9] text-[#9aa7b8]',
  'NO DATA': 'bg-[#eceff3] text-[#8895a7]',
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

// Maintenance tickets are created by the user and stored by maintenanceStore.js (badges live in TicketDialogs.jsx).

const LOGO_SRC = `${import.meta.env.BASE_URL}favicon.svg`; // the provided LUMINARA logo (same file as the browser favicon)

/* ==========================================================================
   SHARED COMPONENTS
   ========================================================================== */

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutGrid },
  { id: 'monitoring', label: 'Streetlights', Icon: Crosshair },
  { id: 'works', label: 'Assigned Works', Icon: ClipboardList }, // BASIC accounts only (see access.js)
  { id: 'history', label: 'History', Icon: HistoryIcon }, // BASIC accounts only
  { id: 'schedule', label: 'Schedule', Icon: CalendarClock }, // BASIC accounts only
  { id: 'maintenance', label: 'Maintenance', Icon: Clock },
  { id: 'controls', label: 'Controls', Icon: Sun },
  { id: 'users', label: 'User Management', Icon: Users }, // administrators only
  { id: 'data', label: 'Data', Icon: Database }, // administrators and developers: read-only saved data
  { id: 'settings', label: 'Settings', Icon: Settings },
];
// Help links sit under the main navigation, separated by a thin line, so the main list is unchanged.
const HELP_NAV_ITEMS = [
  { id: 'help', label: 'Help Center', Icon: LifeBuoy },
  { id: 'manual', label: 'User Manual', Icon: BookOpen },
];

// Which manual article each page's help icon opens.
const SCREEN_HELP = { works: 'dashboard', history: 'dashboard', schedule: 'dashboard', dashboard: 'dashboard', monitoring: 'monitoring', details: 'monitoring', map: 'map', maintenance: 'maintenance', controls: 'controls', settings: 'settings' };
// Shared by the header (bell, help icon) without threading props through every screen.
const AppCtx = createContext({ screen: null, live: false, user: null, openFault: () => {}, openHelp: () => {}, focusLamp: () => {} });

const Sidebar = ({ currentScreen, setScreen, user, onSignOut, open = false, onClose = () => {} }) => (
  <aside
    id="sidebar"
    className={`w-64 bg-[#13223b] text-white h-screen fixed left-0 top-0 z-50 flex flex-col justify-between overflow-y-auto transition-transform duration-200 lg:translate-x-0 ${
      open ? 'translate-x-0' : '-translate-x-full invisible lg:visible'
    }`}
  >
    <div>
      <div className="px-8 pt-8 flex items-center gap-3">
        <img src={LOGO_SRC} alt="" width="48" height="48" className="w-12 h-12 shrink-0 object-contain" />
        <div className="flex-1">
          <div className="font-bold text-2xl leading-tight">LUMINARA</div>
          <div className="text-xs font-bold text-[#cdd7e5]">STREETLIGHTS</div>
        </div>
        <button onClick={onClose} className="lg:hidden -mr-4 w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[#1b2e4b]" aria-label="Close menu">
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav aria-label="Main navigation" className="mt-8 lg:mt-12 px-3.5 space-y-2.5">
        {[...NAV_ITEMS.filter((n) => screenAllowed(n.id, user.role)), null, ...HELP_NAV_ITEMS].map((item) => {
          if (item === null) return <div key="divider" role="separator" className="mx-2 my-1 border-t border-[#2a3f5f]" />;
          const { id, label, Icon } = item;
          const active = currentScreen === id || (currentScreen === 'details' && id === 'monitoring');
          return (
            <button
              key={id}
              data-tour={`nav-${id}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                setScreen(id);
                onClose();
              }}
              className={`w-full h-14 flex items-center px-5 rounded-lg border-l-[5px] text-base transition-colors ${
                active
                  ? 'bg-[#1b2e4b] border-[#27a85a] text-white font-semibold'
                  : 'border-transparent text-[#d5deea] hover:bg-[#1b2e4b]'
              }`}
            >
              <Icon aria-hidden="true" className={`w-5 h-5 mr-4 ${active ? 'text-[#27a85a]' : 'opacity-70'}`} />
              {label}
            </button>
          );
        })}
      </nav>
    </div>
    <div>
    <ThemeSwitch />
    <button
      title="Sign out"
      aria-label={`Sign out ${user.fullName}`}
      onClick={onSignOut}
      className="m-4 p-4 bg-[#1b2e4b] rounded-xl flex items-center gap-3 text-left hover:bg-[#223758] transition-colors"
    >
      <div className="w-10 h-10 shrink-0 bg-[#27a85a] rounded-full flex items-center justify-center font-bold">{user.fullName.charAt(0).toUpperCase()}</div>
      <div className="min-w-0">
        <div className="text-sm font-bold truncate">{user.fullName}</div>
        <div className="text-xs text-[#cdd7e5]">{ROLE_LABEL[user.role]} · Sign out</div>
      </div>
    </button>
    </div>
  </aside>
);

/* Title bar + the sub-row (subtitle on the left, actions on the right) */
const Header = ({ title, subtitle, actions }) => {
  const ctx = useContext(AppCtx);
  const helpTopic = SCREEN_HELP[ctx.screen];
  return (
  <>
    <div className="flex justify-between items-center border-b border-[#e1e7ee] pb-4 md:pb-6">
      <h1 className="text-2xl md:text-3xl font-bold text-[#14233c]">{title}</h1>
      <div className="hidden md:flex items-center gap-4">
        <span className="text-sm font-semibold text-[#5b6b82]">Barangay 6</span>
        {helpTopic && (
          <button
            onClick={() => ctx.openHelp(helpTopic)}
            className="w-12 h-12 bg-white border border-[#e1e7ee] rounded-full flex items-center justify-center hover:bg-gray-50"
            aria-label="Help for this page"
            title="Help for this page"
          >
            <CircleQuestionMark className="w-5 h-5 text-[#5b6b82]" aria-hidden="true" />
          </button>
        )}
        <NotificationCenter live={ctx.live} onOpenFault={ctx.openFault} />
        <div className="w-12 h-12 bg-[#e0f3e8] text-[#27a85a] font-bold rounded-full flex items-center justify-center">A</div>
      </div>
    </div>
    {(subtitle || actions) && (
      <div className="flex flex-col items-start gap-3 md:flex-row md:justify-between md:items-center mt-4 md:mt-5 mb-5 md:mb-6 md:min-h-[42px]">
        <div className="text-sm text-[#6b7a90]">{subtitle}</div>
        {actions}
      </div>
    )}
  </>
  );
};

const Page = ({ children }) => (
  <main id="main-content" className="lm-page lg:ml-64 pt-[4.5rem] px-4 pb-8 md:px-6 lg:p-10 bg-[#f3f6f9] min-h-screen text-[#14233c] overflow-x-hidden">{children}</main>
);

const Card = ({ big = false, className = '', children }) => (
  <div className={`bg-white border border-[#e6ebf1] ${big ? 'rounded-2xl' : 'rounded-xl'} ${className}`}>
    {children}
  </div>
);

const Pill = ({ className = '', children }) => (
  <span className={`inline-flex items-center justify-center rounded-md text-xs font-bold uppercase ${className}`}>{children}</span>
);

// Lamp condition badge: CONNECTED / GOOD, WARNING, FAULT, BLINKING (animated), DAYLIGHT STANDBY, SENSOR ERROR, OFFLINE.
// Falls back to the old status badge for lamps that are not installed / have no data.
// Descriptive status for the Streetlights table: communication state + lamp condition or fault type, e.g. "Online – Lamp Failure".
// The tooltip gives the official definition and what to do (see streetlightStatus.js).
const StatusBadge = ({ d, className = '' }) => {
  const c = classifyStreetlight(d);
  if (c.statusId === 'NO_DEVICE') return <Pill className={`${className} ${STATUS_BADGE[d.status] || ''}`}>{d.status}</Pill>;
  const f = c.faultType ? FAULT_CATALOG[c.faultType] : null;
  const tip = `${STATUS_MODEL[c.statusId].definition}${f ? ` ${f.short}. ${f.action}` : ''}`;
  return (
    <Pill className={`${className} gap-1.5 text-center leading-tight ${TONE_PILL[c.tone]}`} title={tip}>
      <span aria-hidden="true" className="font-black shrink-0">{c.icon}</span>
      <span>{c.label}</span>
    </Pill>
  );
};

const OutlineButton = ({ className = '', ...p }) => (
  <button {...p} className={`h-[42px] px-6 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50 transition-colors ${className}`} />
);
const PrimaryButton = ({ className = '', ...p }) => (
  <button {...p} className={`h-[42px] px-6 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52] transition-colors ${className}`} />
);

/* ==========================================================================
   SCREEN 1 — LOGIN
   ========================================================================== */

const Login = ({ onSignIn }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);
  const [mode, setMode] = useState('signin'); // 'signin' | 'register' (developer key registration)
  const [notice, setNotice] = useState('');
  // Ctrl+Shift+D opens the developer registration form (no visible link). The server still requires a valid key.
  useEffect(() => {
    const onKey = (e) => {
      if (!isDevShortcut(e)) return;
      e.preventDefault();
      setError('');
      setNotice('');
      setMode('register');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Enter your username or email and your password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onSignIn(await apiLogin(identifier.trim(), password));
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };
  return (
  <div className="flex flex-col lg:flex-row min-h-screen lg:h-screen w-full">
    <div className="lg:w-1/2 bg-[#1b3049] flex flex-col justify-center px-6 py-8 lg:px-[120px] lg:py-0">
      <img src={LOGO_SRC} alt="" width="72" height="72" className="w-14 h-14 lg:w-[72px] lg:h-[72px] object-contain mb-5 lg:mb-10" />
      <h1 className="text-4xl lg:text-5xl font-bold text-white mb-2 lg:mb-4">LUMINARA</h1>
      <h2 className="text-sm lg:text-lg font-bold text-[#c3cfdf] mb-4 lg:mb-14">SMART STREETLIGHT SYSTEM</h2>
      <p className="hidden lg:block text-[28px] leading-snug text-white font-semibold mb-12">
        Streetlight monitoring<br />and control center
      </p>
      <div className="hidden lg:block w-[84px] h-1.5 bg-[#27a85a] mb-12"></div>
      <p className="text-base text-[#c3cfdf]">Barangay 6 • Carmona, Cavite</p>
    </div>

    <div className="flex-1 lg:w-1/2 lg:flex-none bg-[#12213a] flex items-center justify-center px-4 py-8 lg:p-0">
      {mode === 'register' ? (
        <DeveloperRegister onBack={() => setMode('signin')} onDone={(u) => { setIdentifier(u); setPassword(''); setNotice('Developer account created. Sign in with your new password.'); setMode('signin'); }} />
      ) : (
      <form onSubmit={submit} noValidate className="bg-white rounded-[2rem] lg:rounded-[3rem] p-6 sm:p-10 lg:p-14 w-full max-w-[536px]">
        <h2 className="text-3xl font-bold text-[#14233c] mb-3">Welcome back</h2>
        <p className="text-sm text-[#6b7a90] mb-8 lg:mb-12">Sign in to manage your network</p>

        <label htmlFor="email" className="block text-xs font-bold text-[#6b7a90] uppercase mb-2">Email or Username</label>
        <input id="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Your username or email" className="w-full h-[60px] bg-[#f3f6f9] border border-[#e1e7ee] rounded-lg px-5 text-base text-[#14233c] placeholder:text-[#9aa7b8] outline-none focus:ring-1 focus:ring-[#27a85a] mb-6" />

        <label htmlFor="password" className="block text-xs font-bold text-[#6b7a90] uppercase mb-2">Password</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" className="w-full h-[60px] bg-[#f3f6f9] border border-[#e1e7ee] rounded-lg px-5 text-base text-[#14233c] placeholder:text-[#9aa7b8] outline-none focus:ring-1 focus:ring-[#27a85a]" />

        <div className="text-right mt-3 mb-6">
          <a href="#" onClick={(e) => { e.preventDefault(); setHint(!hint); }} className="text-xs font-bold text-[#27a85a]">Forgot password?</a>
        </div>
        {hint && <p className="text-xs text-[#5b6b82] bg-[#f3f6f9] rounded-lg px-3 py-2 mb-4">Passwords are reset by an administrator. Ask your LUMINARA administrator for a temporary password.</p>}
        {notice && <p role="status" className="text-sm font-semibold text-[#1f9a52] bg-[#e3f4ea] rounded-lg px-3 py-2 mb-4">{notice}</p>}
        {error && <p role="alert" className="text-sm font-semibold text-[#e04040] bg-[#fde8e8] rounded-lg px-3 py-2 mb-4">{error}</p>}

        <button type="submit" disabled={busy} className="w-full h-[65px] bg-[#27a85a] hover:bg-[#1f9a52] disabled:opacity-70 text-white font-bold rounded-lg text-base">
          {busy ? 'SIGNING IN…' : 'SIGN IN →'}
        </button>
        <p className="text-center text-xs text-[#6b7a90] mt-5">Authorized personnel only</p>
      </form>
      )}
    </div>
  </div>
  );
};

/* ==========================================================================
   SCREEN 2 — DASHBOARD OVERVIEW
   ========================================================================== */

const Dashboard = ({ setScreen, devices, mode, lastSync, receivedAt, connecting, onOpenFault, user, MapComp, mapProps, focusRequest, onFocusLamp }) => {
  const live = mode === 'live';
  const faults = useMemo(() => (live ? describeFaults(devices) : []), [live, devices]);

  // ONE dataset: the interactive map reports its classified records, and every number below is derived from them.
  const [records, setRecords] = useState(null);
  const stats = useMemo(() => (records ? summarizeLights(records) : null), [records]);
  const attention = useMemo(() => (records ? needsAttention(records) : []), [records]);
  const darkLamps = useMemo(() => (records ? records.filter((r) => r.faultType === 'LAMP_FAILURE').length : 0), [records]);
  const unregistered = useMemo(() => (records ? devices.filter((d) => !records.some((r) => r.deviceId === d.id)).length : 0), [records, devices]);

  const summary = [
    { label: 'Total Streetlights', value: stats ? String(stats.total) : '', note: stats ? `${stats.installed} installed, ${stats.noDevice} no device` : '', bg: 'bg-[#27a85a]', mark: 'dot' },
    { label: 'Online', value: stats ? pad2(stats.online) : '', note: stats ? `Communicating (${stats.healthy} healthy)` : '', bg: 'bg-[#27a85a]', mark: 'dot' },
    { label: 'Offline', value: stats ? pad2(stats.offline) : '', note: 'No recent report', bg: 'bg-[#f0a82e]', mark: 'dot' },
    { label: 'Fault Alerts', value: stats ? pad2(stats.fault) : '', note: stats ? `Confirmed faults${stats.warning ? ` · ${stats.warning} warning${stats.warning === 1 ? '' : 's'}` : ''}` : '', bg: 'bg-[#e04848]', mark: '!' },
  ];
  const TONE_DOT_CLS = { red: 'bg-[#e04848]', amber: 'bg-[#f0a82e]', gray: 'bg-[#8895a7]', green: 'bg-[#27a85a]' };
  const shown = attention.slice(0, 6);
  return (
    <Page>
      <Header
        title="Dashboard Overview"
        subtitle="Good afternoon, Admin"
        actions={<ConnectionBadge mode={mode} connecting={connecting} receivedAt={receivedAt} lastSync={lastSync} />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-7">
        {summary.map((c) => (
          <Card key={c.label} className="p-4 md:p-5">
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 shrink-0 rounded-full ${c.bg} flex items-center justify-center text-white text-sm font-bold`}>
                {c.mark === '!' ? '!' : <span className="w-1.5 h-1.5 bg-white rounded-full"></span>}
              </div>
              <div>
                <div className="text-xs font-semibold text-[#5b6b82] uppercase">{c.label}</div>
                {connecting || !stats ? (
                  <div className="h-9 w-14 mt-1 rounded-md bg-[#e6ebf1] animate-pulse" role="status" aria-label={`Loading ${c.label}`} />
                ) : (
                  <div className="text-3xl md:text-4xl font-bold leading-tight">{c.value}</div>
                )}
              </div>
            </div>
            <div className="text-xs text-[#6b7a90] mt-2 min-h-[1rem]">{c.note}</div>
          </Card>
        ))}
      </div>
      {unregistered > 0 && (
        <p className="mb-5 -mt-3 px-4 py-2 rounded-lg bg-[#fff8e6] border border-[#f0d58a] text-xs text-[#7a5a00]" role="note">
          {unregistered} lamp node{unregistered === 1 ? ' is' : 's are'} reporting but {unregistered === 1 ? 'is' : 'are'} not in the streetlight list yet, so {unregistered === 1 ? 'it is' : 'they are'} not counted above. Add {unregistered === 1 ? 'it' : 'them'} to the list by importing a CSV on the map.
        </p>
      )}

      <AlertSummary Card={Card} live={live} connecting={connecting} devices={devices} faults={faults} onOpen={onOpenFault} />

      <PzemPanel Card={Card} />

      {MapComp ? (
        <MapComp
          Page={Page}
          Header={Header}
          Card={Card}
          Pill={Pill}
          devices={devices}
          embedded
          active
          onRecords={setRecords}
          focusRequest={focusRequest}
          onOpenFault={onOpenFault}
          {...mapProps}
        />
      ) : (
        <Card big className="p-10 mb-6 md:mb-7 text-center text-sm text-[#6b7a90] inline-flex items-center gap-3 justify-center w-full">
          <LoaderCircle size={18} className="animate-spin" /> Loading map
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.9fr_1fr] gap-6 lg:gap-8 items-start">
        <div className="space-y-6 min-w-0">
        <Card big className="p-4 sm:p-6" data-tour="needs-attention">
          <CardTitle small right={attention.length > shown.length ? <span className="text-xs font-bold text-[#6b7a90]">Showing {shown.length} of {attention.length}</span> : null}>NEEDS ATTENTION</CardTitle>
          {!stats && <p className="text-sm text-[#6b7a90]">Loading…</p>}
          {stats && attention.length === 0 && <p className="py-6 text-center text-sm text-[#6b7a90]">Nothing needs attention right now.</p>}
          <ul className="divide-y divide-[#e6ebf1]">
            {shown.map((r) => {
              const f = r.faultType ? FAULT_CATALOG[r.faultType] : null;
              const sug = r.faultType ? suggestPriority(r.faultType, { clusterCount: darkLamps }) : null;
              const dev = devices.find((d) => d.id === r.deviceId);
              return (
                <li key={r.streetlightId} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${TONE_DOT_CLS[classifyStreetlight(dev).tone]}`} aria-hidden="true"></span>
                  <div className="min-w-[10rem] flex-1">
                    <div className="font-bold text-sm">{r.streetlightId} <span className="font-normal text-[#6b7a90]">· {r.location}</span></div>
                    <div className="text-sm text-[#14233c]">{r.label}</div>
                    {f && <div className="text-xs text-[#6b7a90]">{f.short}{r.last ? ` · last report ${r.last}` : ''}</div>}
                  </div>
                  {sug && <Pill className={`px-3 h-7 ${PRIORITY_BADGE[sug.value]}`} title="Suggested maintenance priority">{priorityShort(sug.value)}</Pill>}
                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={() => onFocusLamp(r.streetlightId)} className="h-9 px-3 rounded-lg border border-[#e1e7ee] bg-white text-xs font-bold hover:bg-gray-50">Locate on map</button>
                    {dev && <button type="button" onClick={() => onOpenFault(dev.id)} className="h-9 px-3 rounded-lg border border-[#e1e7ee] bg-white text-xs font-bold hover:bg-gray-50">Details</button>}
                  </div>
                </li>
              );
            })}
          </ul>
          {attention.length > shown.length && (
            <button type="button" onClick={() => setScreen('monitoring')} className="mt-3 text-xs font-bold text-[#27a85a] hover:underline">View all {attention.length} on the Streetlights page</button>
          )}
        </Card>
          {user && can(user.role, 'history.view') && <HistoryPanel Card={Card} />}
        </div>

        <div className="space-y-6">
          <Card big className="p-6">
            <CardTitle>System Activity</CardTitle>
            <div className="flex justify-between items-center mb-4 text-sm">
              <span className="text-[#6b7a90]">Last sync</span>
              <span className="font-bold">{connecting ? 'Connecting…' : live ? lastSync : 'Not connected'}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#6b7a90]">Receiver</span>
              <Pill className={`px-5 py-2.5 ${live ? 'bg-[#e3f4ea] text-[#27a85a]' : 'bg-[#eceff3] text-[#5b6b82]'}`}>{live ? 'Receiver connected' : 'Not connected'}</Pill>
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

const Monitoring = ({ setScreen, devices, mode, onOpenFault }) => {
  const registryTotal = useMemo(() => loadRegistry().length, []); // the same list the Dashboard and the map count
  const detailsEnabled = mode !== 'live'; // the Details screen is still sample data for L-008
  const streets = useMemo(() => [...new Set(devices.map((x) => x.loc.split(' • ')[0]))], [devices]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [streetFilter, setStreetFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const faultById = useMemo(() => Object.fromEntries(devices.map((d) => [d.id, describeFault(d)])), [devices]);

  const q = query.trim().toLowerCase();
  const filtered = devices.filter(
    (x) =>
      (statusFilter === 'ALL' || x.status === statusFilter) &&
      (streetFilter === 'ALL' || x.loc.startsWith(streetFilter)) &&
      (severityFilter === 'ALL' || faultById[x.id]?.severity === severityFilter) &&
      (q === '' || x.id.toLowerCase().includes(q) || x.loc.toLowerCase().includes(q))
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const onChange = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };
  const selectCls = 'h-11 md:h-10 px-4 bg-[#f8fafc] border border-[#e1e7ee] rounded-lg text-base md:text-sm text-[#14233c] focus:outline-none focus:ring-2 focus:ring-[#27a85a]/30';

  return (
    <Page>
      <Header
        title="Streetlight Monitoring"
        subtitle="Manage devices and inspect current readings"
        actions={
          <div className="flex flex-wrap gap-3">
            <OutlineButton>Export CSV</OutlineButton>
            <PrimaryButton>+ Add Light</PrimaryButton>
          </div>
        }
      />

      <Card className="px-4 md:px-6 py-4 mb-5 md:mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 md:gap-4 md:w-auto">
          <div className="relative w-full sm:w-[300px] lg:w-[382px]">
            <Search className="w-4 h-4 text-[#8895a7] absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={onChange(setQuery)}
              placeholder="Search ID, location..."
              aria-label="Search streetlights by ID or location"
              className="w-full h-11 md:h-10 pl-10 pr-3 bg-[#f8fafc] border border-[#e1e7ee] rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-[#27a85a]/30"
            />
          </div>
          <select value={statusFilter} onChange={onChange(setStatusFilter)} aria-label="Filter by status" className={`${selectCls} w-full sm:w-44`}>
            <option value="ALL">All statuses</option>
            <option value="ONLINE">Online</option>
            <option value="FAULT">Fault</option>
            <option value="OFFLINE">Offline</option>
            <option value="WARNING">Warning</option>
            <option value="UNINSTALLED">Uninstalled</option>
          </select>
          <select value={streetFilter} onChange={onChange(setStreetFilter)} aria-label="Filter by street" className={`${selectCls} w-full sm:w-44`}>
            <option value="ALL">All streets</option>
            {streets.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={severityFilter} onChange={onChange(setSeverityFilter)} aria-label="Filter by fault severity" className={`${selectCls} w-full sm:w-44`}>
            <option value="ALL">All severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Informational</option>
          </select>
          {(q !== '' || statusFilter !== 'ALL' || streetFilter !== 'ALL' || severityFilter !== 'ALL') && (
            <button
              onClick={() => {
                setQuery('');
                setStatusFilter('ALL');
                setStreetFilter('ALL');
                setSeverityFilter('ALL');
                setPage(1);
              }}
              className="h-11 md:h-10 px-3 text-sm font-bold text-[#27a85a] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        <span className="text-sm text-[#6b7a90] md:mr-4">{devices.filter((x) => x.status !== 'UNINSTALLED').length} installed · {registryTotal} streetlights in the list</span>
      </Card>

      {mode !== 'live' && (
  <Card className="px-4 md:px-6 py-4 mb-5 md:mb-6">
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-bold text-sm">Panel feed <span className="font-normal text-[#6b7a90]">· whole line, all {registryTotal} streetlights</span></h3>
      <span className="text-[11px] text-[#6b7a90]">Sample data</span>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[['Voltage', PANEL.voltage], ['Current', PANEL.current], ['Active power', PANEL.power], ['Contactor', PANEL.contactor]].map(([k, v]) => (
        <div key={k} className="bg-[#f3f6f9] rounded-lg px-4 py-3">
          <div className="text-[11px] font-semibold text-[#6b7a90] uppercase">{k}</div>
          <div className="text-xl font-bold mt-1">{v}</div>
        </div>
      ))}
    </div>
  </Card>
)}

      <Card big className="p-3 pb-0 overflow-hidden">
        <div className="hidden md:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#f3f6f9] text-xs font-bold text-[#6b7a90] uppercase">
              <th className="py-4 pl-4 rounded-l-lg">Device ID</th>
              <th className="py-4">Location</th>
              <th className="py-4">Status</th>
              <th className="py-4">Light Level</th>
              <th className="py-4">Battery</th>
              <th className="py-4">Signal</th>
              <th className="py-4">Last Update</th>
              <th className="py-4 rounded-r-lg"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x, i) => (
              <tr
                key={x.id}
                onClick={detailsEnabled && x.id === 'L-008' ? () => setScreen('details') : undefined}
                className={`h-[58px] border-b-2 border-[#e6ebf1] ${x.status === 'UNINSTALLED' ? 'opacity-60' : ''} ${i % 2 === 1 ? 'bg-[#f8fafc]' : ''} ${detailsEnabled && x.id === 'L-008' ? 'cursor-pointer' : ''}`}
              >
                <td className="pl-4 font-bold text-sm">{x.id}</td>
                <td className="text-sm py-1">{x.loc}{healthOf(x) && <div className="text-xs text-[#6b7a90] mt-0.5 max-w-[240px]">{classifyStreetlight(x).detail}</div>}</td>
                <td>
                  <StatusBadge d={x} className="min-w-[105px] max-w-[210px] px-3 py-1.5" />
                </td>
                <td>
                {x.status === 'UNINSTALLED' ? (
                    <span className="text-sm text-[#9aa7b8]">Not installed</span>
                  ) : x.lux != null ? (
                    <div>
                      <span className="text-sm font-bold">{x.lux.toFixed(1)} lx</span>
                      <div className="text-[10px] text-[#6b7a90]">{x.reported}{x.comm === 'Stale' ? ' · delayed' : ''}</div>
                    </div>
                  ) : x.level !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="w-28 h-1.5 bg-[#e3e8ee] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${x.status === 'FAULT' ? 'bg-[#e04848]' : 'bg-[#27a85a]'}`}
                          style={{ width: x.level === 0 ? '2px' : `${x.level}%` }}
                        ></div>
                      </div>
                      <span className="text-xs font-bold">{x.level}%</span>
                    </div>
                  ) : x.reported ? (
                    <div>
                      <span className="text-sm text-[#6b7a90]">No reading</span>
                      <div className="text-[10px] text-[#6b7a90]">{x.status === 'OFFLINE' ? `Last: ${x.reported}` : x.reported}</div>
                    </div>
                  ) : (
                    <span className="text-sm text-[#6b7a90]">No data</span>
                  )}
                </td>
                <td className="text-sm">{x.batt ?? '—'}</td>
                <td className="text-sm">{x.rssi ?? '—'}</td>
                <td className="text-sm text-[#6b7a90]">{x.time}</td>
                <td className="pr-4 text-right">
                  <button
                    className="text-[#5b6b82] hover:text-[#14233c] disabled:opacity-30"
                    disabled={!faultById[x.id]}
                    onClick={() => onOpenFault(x.id)}
                    aria-label={faultById[x.id] ? `View fault details for ${x.id}` : `No fault details for ${x.id}`}
                  >
                    <MoreHorizontal className="w-6 h-6 inline" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-sm text-[#6b7a90]">{devices.length === 0 ? 'No lamp nodes detected yet.' : 'No devices match your search.'}</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        <ul className="md:hidden">
          {rows.map((x) => (
            <li
              key={x.id}
              onClick={detailsEnabled && x.id === 'L-008' ? () => setScreen('details') : undefined}
              className={`px-2 py-4 border-b-2 border-[#e6ebf1] ${detailsEnabled && x.id === 'L-008' ? 'cursor-pointer active:bg-[#f3f6f9]' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-sm">{x.id}</div>
                  <div className="text-sm text-[#6b7a90] truncate">{x.loc}</div>
                  {healthOf(x) && <div className="text-xs text-[#6b7a90] mt-0.5">{classifyStreetlight(x).detail}</div>}
                </div>
                <StatusBadge d={x} className="px-3 py-1 max-w-[190px] shrink-0" />
              </div>
              <div className="flex items-center gap-3 mt-3 text-xs">
                  {x.status === 'UNINSTALLED' ? (
                  <span className="flex-1 text-[#9aa7b8]">Not installed</span>
                ) : x.lux != null ? (
                  <span className="flex-1 font-bold">{x.lux.toFixed(1)} lx <span className="font-normal text-[#6b7a90]">{x.reported}{x.comm === 'Stale' ? ' · delayed' : ''}</span></span>
                ) : x.level !== null ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex-1 h-1.5 bg-[#e3e8ee] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${x.status === 'FAULT' ? 'bg-[#e04848]' : 'bg-[#27a85a]'}`}
                        style={{ width: x.level === 0 ? '2px' : `${x.level}%` }}
                      ></div>
                    </div>
                    <span className="font-bold">{x.level}%</span>
                  </div>
                ) : x.reported ? (
                  <span className="flex-1 text-[#6b7a90]">No reading <span className="font-normal">{x.status === 'OFFLINE' ? `Last: ${x.reported}` : x.reported}</span></span>
                ) : (
                  <span className="flex-1 text-[#6b7a90]">No data</span>
                )}
                <span className="font-semibold">{x.batt ?? '—'}</span>
                <span className="text-[#6b7a90]">{x.time}</span>
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="py-10 text-center text-sm text-[#6b7a90]">{devices.length === 0 ? 'No lamp nodes detected yet.' : 'No devices match your search.'}</li>}
        </ul>

        <div className="px-4 py-4 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center text-xs text-[#6b7a90]">
          <span>Showing {rows.length} of {filtered.length} devices</span>
          <div className="flex items-center gap-2 font-bold text-[#14233c]">
            <button disabled={current === 1} onClick={() => setPage(current - 1)} className="disabled:opacity-30 p-2 md:p-0" aria-label="Previous page">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-9 h-9 md:w-6 md:h-6 rounded ${p === current ? 'bg-[#13223b] text-white' : 'hover:bg-[#f3f6f9]'}`}
              >
                {p}
              </button>
            ))}
            <button disabled={current === pageCount} onClick={() => setPage(current + 1)} className="disabled:opacity-30 p-2 md:p-0" aria-label="Next page">
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
  if (payload.bad == null || payload.t === 610) return <g key={`skip-${payload.t}`} />;
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

      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center md:-mt-2">
        <div className="flex items-center gap-4 sm:gap-6">
          <h2 className="text-4xl font-bold">L-008</h2>
          <Pill className="px-6 py-2.5 bg-[#fde8e8] text-[#e04040]">Fault</Pill>
          <Pill className="px-3 h-7 bg-[#eceff3] text-[#5b6b82] text-[11px]">SAMPLE DATA</Pill>
        </div>
        <div className="flex gap-3 sm:gap-4">
          <OutlineButton>Edit Device</OutlineButton>
          <PrimaryButton className="h-[44px]">Run Test</PrimaryButton>
        </div>
      </div>
      <p className="text-[#6b7a90] mt-1 mb-5">Market Street • East section</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-7">
        {metrics.map((m) => (
          <Card key={m.label} className="p-5">
            <div className="text-xs font-bold text-[#5b6b82] uppercase mb-2">{m.label}</div>
            <div className={`text-2xl sm:text-4xl font-bold ${m.color}`}>{m.value}</div>
            <div className="text-xs text-[#6b7a90] mt-3">{m.note}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.66fr_1fr] gap-6 lg:gap-7 items-start">
        <Card big className="p-4 md:p-6">
          <CardTitle>Sensor Readings</CardTitle>
          <p className="text-sm font-bold text-[#6b7a90] mb-3 ml-3">Voltage (V)</p>
          <div className="h-56 md:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={VOLTAGE_DATA} margin={{ top: 10, right: 24, left: 24, bottom: 0 }}>
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
            <CardTitle>Device Information</CardTitle>
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
            <CardTitle>Active Alert</CardTitle>
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

const IMPORTED_FLAG = 'luminara.maintenance.imported.v1';
const errText = (e) => (e?.fields && Object.values(e.fields).find(Boolean)) || e?.message || 'Something went wrong.';

const Maintenance = ({ draft = null }) => {
  const { user, focusLamp } = useContext(AppCtx);
  const canCreate = can(user.role, 'maintenance.create');
  const canEditAny = can(user.role, 'maintenance.edit');
  const canArchive = can(user.role, 'maintenance.archive');
  const canViewArchive = can(user.role, 'maintenance.viewArchive');
  const canRestore = can(user.role, 'maintenance.restore');
  const canImport = can(user.role, 'maintenance.import');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  // Tickets live in PostgreSQL: every signed-in person sees the same records on every device.
  const [tickets, setTickets] = useState([]);
  const [summaryRows, setSummaryRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [technicians, setTechnicians] = useState([]);
  const [presenceMap, setPresenceMap] = useState(() => loadPresence()); // "on duty today" switches: prototype, this browser only
  const users = useMemo(() => technicianUsers(technicians, presenceMap), [technicians, presenceMap]);
  const [dialog, setDialog] = useState(() => (draft && can(user.role, 'maintenance.create') ? { mode: 'create', initial: draft } : null)); // { mode: 'create', initial? } | { mode: 'view', id }
  const [toast, setToast] = useState(null); // { kind: 'ok' | 'error', text }
  const [confirmArchive, setConfirmArchive] = useState(null); // ticket waiting for "Remove" confirmation
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [archived, setArchived] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [legacy] = useState(() => (canImport ? loadTickets() : [])); // tickets the old prototype saved in this browser
  const [imported, setImported] = useState(() => { try { return !!localStorage.getItem(IMPORTED_FLAG); } catch { return false; } });
  const [importResult, setImportResult] = useState(null);
  const now = useNow(60000); // keeps "Resolved Today" correct across midnight

  useEffect(() => {
    if (!toast || toast.kind === 'error') return undefined;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const refresh = useCallback(async () => {
    try {
      const d = await apiListTickets();
      setTickets(d.tickets);
      setSummaryRows(d.summaryRows);
      setLoadError('');
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoaded(true);
    }
  }, []);
  const loadArchived = useCallback(async () => {
    setArchiveLoading(true);
    try {
      setArchived(await apiListArchived());
      setArchiveError('');
    } catch (e) {
      setArchiveError(e.message);
    } finally {
      setArchiveLoading(false);
    }
  }, []);
  useEffect(() => {
    let live = true;
    Promise.all([apiListTickets(), apiTechnicians()])
      .then(([d, t]) => { if (live) { setTickets(d.tickets); setSummaryRows(d.summaryRows); setTechnicians(t); setLoadError(''); } })
      .catch((e) => { if (live) setLoadError(e.message); })
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, []);
  // Pick up changes made on other devices (not while a ticket window is open, so nobody loses what they are typing).
  const idle = dialog === null && confirmArchive === null;
  useEffect(() => {
    if (!idle) return undefined;
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [idle, refresh]);

  const term = search.trim().toLowerCase();
  const techOf = (t) => users.find((u) => u.id === t.technicianId); // the registered technician on a ticket, if any
  const techName = (t) => t.technician;
  const rows = useMemo(
    () =>
      [...tickets]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .filter((t) => (filter === 'ALL' || t.status === filter) && (term === '' || [t.id, t.lamp, t.where, t.issue, t.technician].some((v) => (v || '').toLowerCase().includes(term)))),
    [tickets, filter, term]
  );
  const filtering = term !== '' || filter !== 'ALL';
  const emptyText = !loaded ? 'Loading tickets…' : tickets.length === 0 ? (canCreate ? 'No maintenance tickets yet. Select “+ New Report” to create the first one.' : 'No maintenance tickets to show.') : 'No tickets match your search or filter.';
  const lampIds = useMemo(() => LAMPS.map((l) => l.id), []);
  const active = dialog?.mode === 'view' ? tickets.find((t) => t.id === dialog.id) : null;
  const accessFor = (t) => ({ edit: canEditAny, move: canEditAny || (can(user.role, 'maintenance.updateOwn') && t.technicianId === user.id) });

  const sum = summarize(summaryRows, now);
  const summary = [
    { label: 'Open Faults', value: pad2(sum.open), color: 'text-[#e04848]', tint: 'bg-[#fde8e8]' },
    { label: 'In Progress', value: pad2(sum.inProgress), color: 'text-[#f0a82e]', tint: 'bg-[#fff3d6]' },
    { label: 'Resolved Today', value: pad2(sum.resolvedToday), color: 'text-[#27a85a]', tint: 'bg-[#e3f4ea]' },
    {
      label: 'Avg. Response',
      value: sum.avgResponseMs == null ? '—' : formatDuration(sum.avgResponseMs),
      note: sum.avgResponseMs == null ? `Needs ${MIN_RESPONSES_FOR_AVG}+ responded tickets (${sum.responseSamples} so far)` : `From ${sum.responseSamples} tickets`,
      color: 'text-[#3b82f6]',
      tint: 'bg-[#e6edfc]',
    },
  ];

  const openTicket = (t) => setDialog({ mode: 'view', id: t.id });
  // Both return a message (shown in the dialog) when something is refused, or null when the change was saved.
  const onCreate = async (form) => {
    const problem = assignmentError({ status: form.status, technicianId: form.technicianId }, users, tickets, Date.now());
    if (problem) return problem;
    try {
      const t = await apiCreateTicket(form);
      await refresh();
      setToast({ kind: 'ok', text: `Ticket ${t.id} created.` });
      setFilter('ALL');
      setSearch('');
      setDialog({ mode: 'view', id: t.id });
      return null;
    } catch (e) {
      return errText(e);
    }
  };
  const apply = async (t, patch, okText, resolution = '') => {
    const next = { ...t, ...patch };
    const problem = assignmentError({ ticket: t, status: next.status, technicianId: next.technicianId || null }, users, tickets, Date.now());
    if (problem) return problem;
    const body = {};
    for (const k of ['lamp', 'where', 'issue', 'priority', 'status']) if (patch[k] !== undefined) body[k] = patch[k];
    if (patch.technicianId !== undefined) body.technicianId = patch.technicianId || null;
    if (patch.reportDate !== undefined && patch.reportDate !== t.reportDate) body.reportedAt = reportedAtFrom(patch.reportDate);
    if (patch.status === 'RESOLVED' && t.status !== 'RESOLVED') body.resolution = resolution;
    try {
      await apiUpdateTicket(t, body);
      await refresh();
      setToast({ kind: 'ok', text: okText });
      return null;
    } catch (e) {
      if (e.status === 409) await refresh(); // someone else changed it: show the latest
      return errText(e);
    }
  };
  const onPresence = (id, present) => {
    const who = users.find((u) => u.id === id);
    const nextUsers = setPresence(users, id, present, Date.now());
    const map = { ...presenceMap, ...presenceFromUsers(nextUsers) };
    if (!present) delete map[id];
    setPresenceMap(map);
    if (savePresence(map)) setToast({ kind: 'ok', text: `${who?.name ?? 'Technician'} marked ${present ? 'on duty' : 'absent / off duty'}.` });
    else setToast({ kind: 'error', text: 'On-duty switch could not be saved because the browser blocked storage. It will be lost on refresh.' });
  };

  const doArchive = async () => {
    const t = confirmArchive;
    setBusy(true);
    try {
      await apiArchiveTicket(t);
      setToast({ kind: 'ok', text: `Ticket ${t.id} removed from the active list. It is kept in the archive records.` });
      if (dialog?.id === t.id) setDialog(null);
      if (showArchive) await loadArchived();
    } catch (e) {
      setToast({ kind: 'error', text: errText(e) });
    } finally {
      setConfirmArchive(null);
      setBusy(false);
      await refresh();
    }
  };
  const doRestore = async () => {
    const t = confirmRestore;
    setBusy(true);
    try {
      await apiRestoreTicket(t);
      setToast({ kind: 'ok', text: `Ticket ${t.id} restored to the active list.` });
    } catch (e) {
      setToast({ kind: 'error', text: errText(e) });
    } finally {
      setConfirmRestore(null);
      setBusy(false);
      await Promise.all([refresh(), loadArchived()]);
    }
  };
  const toggleArchive = () => {
    if (!showArchive) loadArchived();
    setShowArchive(!showArchive);
  };
  const doImport = async () => {
    setBusy(true);
    try {
      const r = await apiImportTickets(legacy);
      setImportResult(r);
      try { localStorage.setItem(IMPORTED_FLAG, String(Date.now())); } catch { /* flag only hides the banner */ }
      setImported(true); // the browser copy is left untouched
      await refresh();
    } catch (e) {
      setToast({ kind: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const RemoveButton = ({ t, className = '' }) =>
    canArchive && t.status === 'RESOLVED' ? (
      <button onClick={() => setConfirmArchive(t)} aria-label={`Remove ticket ${t.id}`} className={`h-9 px-4 bg-white border border-[#f3c4c4] rounded-lg text-sm font-semibold text-[#e04040] hover:bg-[#fff5f5] ${className}`}>Remove</button>
    ) : null;

  return (
    <Page>
      <Header
        title="Maintenance & Fault History"
        subtitle="Fault reports and technician activity"
        actions={
          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#8895a7] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tickets..."
                aria-label="Search maintenance tickets by number, lamp, street, issue or technician"
                className="h-[42px] w-full sm:w-56 pl-9 pr-3 bg-white border border-[#e1e7ee] rounded-md text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-[#27a85a]/30"
              />
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-[42px] px-4 bg-white border border-[#e1e7ee] rounded-md text-base md:text-sm font-semibold text-[#14233c] focus:outline-none"
              aria-label="Filter tickets"
            >
              <option value="ALL">Filter: All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>Filter: {s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </select>
            {filtering && (
              <button onClick={() => { setSearch(''); setFilter('ALL'); }} className="h-[42px] px-2 text-sm font-bold text-[#27a85a] hover:underline">Clear filters</button>
            )}
            {canViewArchive && (
              <button onClick={toggleArchive} aria-pressed={showArchive} className="h-[42px] px-4 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50">{showArchive ? 'Hide archived' : 'Archived records'}</button>
            )}
            {canCreate && <PrimaryButton onClick={() => setDialog({ mode: 'create' })}>+ New Report</PrimaryButton>}
          </div>
        }
      />

      {toast && (
        <div
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-semibold flex items-start justify-between gap-3 ${toast.kind === 'error' ? 'bg-[#fde8e8] text-[#e04040]' : 'bg-[#e3f4ea] text-[#1f9a52]'}`}
        >
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss message" className="leading-none text-lg -mt-0.5">×</button>
        </div>
      )}
      {loadError && (
        <div role="alert" className="mb-4 px-4 py-3 rounded-lg text-sm font-semibold bg-[#fde8e8] text-[#e04040] flex items-center justify-between gap-3">
          <span>Could not load maintenance tickets: {loadError}</span>
          <button onClick={refresh} className="h-8 px-3 bg-white border border-[#f3c4c4] rounded-md text-xs font-bold">Retry</button>
        </div>
      )}
      {canImport && legacy.length > 0 && !imported && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-[#fffaf0] border border-[#f6d587] text-[#8a6410] flex flex-wrap items-center justify-between gap-3">
          <span><b>{legacy.length} ticket{legacy.length === 1 ? '' : 's'} saved in this browser</b> by the old prototype. Import them into the database so everyone can see them. Your browser copy is not deleted, and tickets already in the database are never overwritten.</span>
          <button onClick={doImport} disabled={busy} className="h-9 px-4 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52] disabled:opacity-60">{busy ? 'Importing…' : `Import ${legacy.length} ticket${legacy.length === 1 ? '' : 's'}`}</button>
        </div>
      )}
      {importResult && (
        <div role="status" className="mb-4 px-4 py-3 rounded-lg text-sm bg-[#e3f4ea] text-[#1f9a52]">
          Imported {importResult.imported.length} ticket{importResult.imported.length === 1 ? '' : 's'}.
          {importResult.skipped.length > 0 && <span className="text-[#8a6410]"> Skipped {importResult.skipped.length}: {importResult.skipped.map((s) => `${s.id} (${s.reason})`).join('; ')}.</span>}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
        {summary.map((c) => (
          <Card key={c.label} className="p-4 md:p-6 flex justify-between items-start">
            <div>
              <div className="text-xs font-bold text-[#5b6b82] uppercase">{c.label}</div>
              <div className={`text-3xl md:text-4xl font-bold mt-3 ${c.color}`}>{c.value}</div>
              {c.note && <div className="text-[11px] text-[#6b7a90] mt-1.5">{c.note}</div>}
            </div>
            <span className={`hidden sm:block w-9 h-9 rounded-full ${c.tint}`}></span>
          </Card>
        ))}
      </div>

      {canEditAny && <TechnicianPanel users={users} tickets={tickets} now={now} onPresence={onPresence} />}

      <Card big className="p-4 md:p-6 pb-6 md:pb-10">
        <CardTitle right={<Pill className="px-3 h-7 bg-[#e3f4ea] text-[#1f9a52] text-[11px]">SHARED · SAVED IN DATABASE</Pill>}>Recent Maintenance Tickets</CardTitle>
        <p className="text-xs text-[#6b7a90] -mt-2 mb-4">
          {user.role === 'TECHNICIAN' ? 'You see the tickets assigned to you.' : 'Tickets are stored in the LUMINARA database and shared by everyone who signs in, on every device.'}
          {' '}Resolved tickets can be removed from this list; they are archived, not deleted.
        </p>
        <div className="hidden md:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#f3f6f9] text-xs font-bold text-[#6b7a90] uppercase">
              <th className="py-4 pl-4 rounded-l-lg">Ticket No.</th>
              <th className="py-4">Lamp ID / Location</th>
              <th className="py-4">Issue</th>
              <th className="py-4">Priority</th>
              <th className="py-4">Status</th>
              <th className="py-4">Updated</th>
              <th className="py-4 pr-4 rounded-r-lg"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.id} className={`h-[65px] ${i % 2 === 1 ? 'bg-[#f8fafc]' : ''}`}>
                <td className="pl-4 font-bold text-sm">{t.id}</td>
                <td className="text-sm"><span className="font-bold">{t.lamp}</span> • {t.where}</td>
                <td className="text-sm pr-3 max-w-[260px]">
                  <div className="truncate" title={t.issue}>{t.issue}</div>
                  <div className="text-xs text-[#6b7a90] truncate flex items-center gap-1.5">
                    {techOf(t) && <Dot available={availability(techOf(t), tickets, now).available} />}
                    <span className="truncate">{techName(t) ? `Technician: ${techName(t)}` : 'Unassigned'}</span>
                  </div>
                </td>
                <td><Pill className={`w-[122px] h-9 ${PRIORITY_BADGE[t.priority]}`}>{priorityLabel(t.priority)}</Pill></td>
                <td><Pill className={`w-[122px] h-9 ${TICKET_STATUS_BADGE[t.status]}`}>{t.status}</Pill></td>
                <td className="text-sm text-[#6b7a90]">{formatStamp(t.updatedAt, now)}</td>
                <td className="pr-4 text-right whitespace-nowrap">
                  <button onClick={() => openTicket(t)} aria-label={`View ticket ${t.id}`} className="h-9 px-4 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50">View</button>
                  <RemoveButton t={t} className="ml-2" />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-[#6b7a90]">{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        <ul className="md:hidden">
          {rows.map((t) => (
            <li key={t.id} className="py-4 border-b-2 border-[#e6ebf1] last:border-b-0">
              <button onClick={() => openTicket(t)} aria-label={`View ticket ${t.id}`} className="block w-full text-left">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-sm">{t.id}</span>
                  <span className="text-xs text-[#6b7a90]">{formatStamp(t.updatedAt, now)}</span>
                </div>
                <div className="text-sm mt-1 break-words">{t.issue}</div>
                <div className="text-xs text-[#6b7a90] mt-0.5"><span className="font-bold text-[#14233c]">{t.lamp}</span> • {t.where} • {techName(t) || 'Unassigned'}</div>
                <div className="flex gap-2 mt-3">
                  <Pill className={`px-3 h-8 ${PRIORITY_BADGE[t.priority]}`}>{priorityLabel(t.priority)}</Pill>
                  <Pill className={`px-3 h-8 ${TICKET_STATUS_BADGE[t.status]}`}>{t.status}</Pill>
                </div>
              </button>
              {canArchive && t.status === 'RESOLVED' && <div className="mt-3"><RemoveButton t={t} /></div>}
            </li>
          ))}
          {rows.length === 0 && <li className="py-10 text-center text-sm text-[#6b7a90]">{emptyText}</li>}
        </ul>
      </Card>

      {showArchive && canViewArchive && (
        <ArchivedTickets tickets={archived} loading={archiveLoading} error={archiveError} canRestore={canRestore} onRestore={setConfirmRestore} onClose={() => setShowArchive(false)} />
      )}

      {dialog?.mode === 'create' && canCreate && (
        <TicketModal mode="create" initial={dialog.initial} ticketNumber="Assigned when saved" lampIds={lampIds} users={users} tickets={tickets} now={now} onClose={() => setDialog(null)} onCreate={onCreate} />
      )}
      {active && (
        <TicketModal
          key={active.id}
          mode="view"
          ticket={active}
          lampIds={lampIds}
          users={users}
          tickets={tickets}
          now={now}
          access={accessFor(active)}
          onLocate={focusLamp}
          onClose={() => setDialog(null)}
          onSave={(form) => apply(active, form, `Ticket ${active.id} updated.`)}
          onStatus={(status, techPatch = {}) => apply(active, { status, ...techPatch }, `Ticket ${active.id} is now ${status}.`)}
          onResolve={(note) => apply(active, { status: 'RESOLVED' }, `Ticket ${active.id} marked as resolved.`, note)}
        />
      )}
      {confirmArchive && (
        <ConfirmDialog title={`Remove ticket ${confirmArchive.id}?`} confirmLabel={busy ? 'Removing…' : 'Remove ticket'} onCancel={() => setConfirmArchive(null)} onConfirm={doArchive}>
          This resolved ticket will leave the active list and be moved to the archive. It is <b>not deleted</b>: the record and its full history stay in the database, and an administrator can restore it.
        </ConfirmDialog>
      )}
      {confirmRestore && (
        <ConfirmDialog title={`Restore ticket ${confirmRestore.id}?`} confirmLabel={busy ? 'Restoring…' : 'Restore ticket'} onCancel={() => setConfirmRestore(null)} onConfirm={doRestore}>
          The ticket returns to the active Recent Maintenance Tickets list as Resolved.
        </ConfirmDialog>
      )}
    </Page>
  );
};

/* ==========================================================================
   SCREEN 6 — LIGHTING CONTROLS & SCHEDULE
   ========================================================================== */

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const nowLabel = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

// ---- Manual switching: talks to server.js (POST/GET /api/control); the relay ESP32 polls the server ----
const getControl = () => fetch('/api/control').then((r) => r.json());
const postControl = (on) =>
  fetch('/api/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ on }),
  }).then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });

// Only the relay's own report ("applied") ever shows Lights ON / OFF. Everything before that is a request, not a result.
const manualPill = (c, checked = true, sending = false) => {
  if (sending) return ['Sending…', 'bg-[#e8effc] text-[#3b82f6]'];
  if (!checked) return ['Checking…', 'bg-[#eceff3] text-[#8895a7]'];
  if (!c) return ['Server unreachable', 'bg-[#fdecec] text-[#e04848]'];
  if (c.pending && !c.controllerOnline) return ['Queued · controller offline', 'bg-[#fff3d6] text-[#c98a0a]'];
  if (!c.controllerOnline) return ['Controller offline', 'bg-[#fff3d6] text-[#c98a0a]'];
  if (c.pending) return ['Waiting for relay…', 'bg-[#e8effc] text-[#3b82f6]'];
  if (c.applied === true) return ['Lights ON', 'bg-[#e3f4ea] text-[#27a85a]'];
  if (c.applied === false) return ['Lights OFF', 'bg-[#eceff3] text-[#8895a7]'];
  return ['No command yet', 'bg-[#eceff3] text-[#8895a7]'];
};

// ---- LoRa node sleep: AUTO (nodes sleep after every shift) or MANUAL (they stay awake until "Sleep nodes now") ----
// Talks to server.js (GET/POST /api/sleep); the LoRa master polls the server and relays the choice to the nodes.
const getSleep = () => fetch('/api/sleep').then((r) => r.json());
const postSleep = (body) =>
  fetch('/api/sleep', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });

const sleepPill = (v, loaded, busy) => {
  if (busy) return ['Sending…', 'bg-[#e8effc] text-[#3b82f6]'];
  if (!loaded) return ['Checking…', 'bg-[#eceff3] text-[#8895a7]'];
  if (!v) return ['Server unreachable', 'bg-[#fdecec] text-[#e04848]'];
  if (v.pending && !v.masterOnline) return ['Queued · master offline', 'bg-[#fff3d6] text-[#c98a0a]'];
  if (v.pending) return ['Waiting for master…', 'bg-[#e8effc] text-[#3b82f6]'];
  if (v.applied === true) return ['AUTO sleep', 'bg-[#e3f4ea] text-[#27a85a]'];
  if (v.applied === false) return ['MANUAL sleep', 'bg-[#fff3d6] text-[#c98a0a]'];
  return [v.masterOnline ? 'Not set yet' : 'Master offline', 'bg-[#eceff3] text-[#8895a7]'];
};

const NodeSleepCard = ({ canOperate }) => {
  const [v, setV] = useState(null); // null = server unreachable
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmNow, setConfirmNow] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const poll = () =>
      getSleep()
        .then((c) => alive && (setV(c), setLoaded(true)))
        .catch(() => alive && (setV(null), setLoaded(true)));
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const send = async (body) => {
    setBusy(true);
    setError('');
    try {
      setV(await postSleep(body));
    } catch {
      setError('Could not reach the server. Nothing was changed.');
    } finally {
      setBusy(false);
      setConfirmNow(false);
    }
  };

  const mode = v ? (v.want ?? v.applied) : null; // true = AUTO, false = MANUAL
  const [pillText, pillClass] = sleepPill(v, loaded, busy);
  const sentAt = v?.sleepNowAt ? new Date(v.sleepNowAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  const seg = (active, tone) => `h-12 rounded-lg text-sm font-bold disabled:opacity-60 transition-colors ${active ? tone : 'bg-[#eceff3] text-[#5b6b82] hover:bg-[#e1e6ec]'}`;

  return (
    <Card big className="p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4 mb-3">
        <h3 className="font-bold text-lg">Node Sleep</h3>
        <Pill className={`px-4 py-2 ${pillClass}`}>{pillText}</Pill>
      </div>
      <p className="text-sm text-[#6b7a90] mb-5">
        <b>Auto</b>: the lamp nodes sleep by themselves after every shift. <b>Manual</b>: they stay awake and only sleep when you press the button below.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button disabled={!canOperate || busy} onClick={() => send({ autoSleep: true })} aria-pressed={mode === true} className={seg(mode === true, 'bg-[#27a85a] text-white')}>
          Auto sleep
        </button>
        <button disabled={!canOperate || busy} onClick={() => send({ autoSleep: false })} aria-pressed={mode === false} className={seg(mode === false, 'bg-[#14233c] text-white')}>
          Manual
        </button>
      </div>
      <button
        disabled={!canOperate || busy || mode !== false}
        onClick={() => setConfirmNow(true)}
        className="mt-3 w-full h-12 rounded-lg text-sm font-bold bg-[#fff3d6] text-[#c98a0a] hover:bg-[#ffeab8] disabled:opacity-50 disabled:hover:bg-[#fff3d6]"
      >
        Sleep nodes now
      </button>
      {mode === true && <p className="mt-3 text-xs text-[#6b7a90]">Switch to Manual to put the nodes to sleep yourself.</p>}
      {!canOperate && <p className="mt-3 text-xs text-[#6b7a90]">Only administrators and technicians can change this.</p>}
      {v?.pending && <p className="mt-3 text-xs text-[#6b7a90]" aria-live="polite">The status above changes only after the LoRa master confirms. The choice stays queued on the server.</p>}
      {sentAt && <p className="mt-3 text-xs text-[#6b7a90]">Last sleep command sent at {sentAt}. Nodes go to sleep within about 30 s and wake at the next scheduled wake-up time.</p>}
      {error && <p className="mt-3 text-xs text-[#e04848]" role="alert">{error}</p>}
      {confirmNow && (
        <ConfirmDialog title="Put all nodes to sleep now?" confirmLabel={busy ? 'Sending…' : 'Sleep nodes now'} onCancel={() => setConfirmNow(false)} onConfirm={() => send({ sleepNow: true })}>
          Every lamp node will deep-sleep and stop reporting until its next scheduled wake-up time. Streetlight status on the dashboard will go offline until then.
        </ConfirmDialog>
      )}
    </Card>
  );
};

const Controls = ({ user }) => {
  const [faults, setFaults] = useState(2);
  const [scheduleOn, setScheduleOn] = useState(true);
  const [days, setDays] = useState(DAY_LETTERS.map(() => true));
  const [activity, setActivity] = useState([
    { color: 'bg-[#3b82f6]', time: '10:12 AM', text: 'Schedule updated' },
    { color: 'bg-[#e04848]', time: '09:46 AM', text: 'L-008 test failed' },
  ]);

  const log = (color, text) =>
    setActivity((prev) => [{ color, time: nowLabel(), text }, ...prev].slice(0, 4));

  // Control state comes from two places: pushed by the receiver on the stream (instant), and /api/control (fallback + the POST reply).
  // The newer of the two is shown. null = server unreachable.
  const [ctlRec, setCtlRec] = useState({ view: null, at: 0 });
  const setCtl = useCallback((v) => setCtlRec({ view: v, at: Date.now() }), []);
  const pushed = useSyncExternalStore(subscribeControl, getControlSnapshot);
  const ctl = pushed && pushed.at > ctlRec.at ? pushed.view : ctlRec.view;
  const checked = !!pushed || ctlRec.at > 0; // has any answer arrived yet?
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(null); // { on, at } of the last command sent from this screen
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const poll = () => {
      if (controlPushIsFresh()) return; // the receiver is pushing updates: no need to ask
      getControl()
        .then((c) => {
          if (!alive) return;
          // no re-render when nothing changed
          setCtlRec((prev) => (prev.at > 0 && JSON.stringify(prev.view) === JSON.stringify(c) ? prev : { view: c, at: Date.now() }));
        })
        .catch(() => {
          if (alive) setCtl(null);
        });
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [setCtl]);

  const pending = !!ctl?.pending;
  useEffect(() => {
    if (!pending) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pending]);

  const setLamp = async (on) => {
    setBusy(true);
    try {
      const next = await postControl(on);
      setRequested({ on, at: Date.now() });
      setNow(Date.now());
      setCtl(next);
      log('bg-[#3b82f6]', `Manual: all lights ${on ? 'ON' : 'OFF'} requested`);
    } catch {
      setCtl(null);
      log('bg-[#e04848]', 'Manual switch failed: server unreachable');
    } finally {
      setBusy(false);
    }
  };
  const [pillText, pillClass] = manualPill(ctl, checked, busy);
  const waitedS = requested ? Math.max(0, Math.round((now - requested.at) / 1000)) : null;
  const wantOn = pending ? ctl.want : null; // the state that has been requested but not yet confirmed by the relay
  const pendingRing = 'ring-2 ring-[#3b82f6] ring-offset-2';

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

  const quick = [{ label: 'Reset fault alerts', note: `${faults} active alerts`, onClick: resetFaults }];

  return (
    <Page>
      <Header
        title="Lighting Controls & Schedule"
        subtitle="Operating schedule and fault alerts"
        actions={<Pill className="px-6 py-3 bg-[#e3f4ea] text-[#27a85a]">System Online</Pill>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-5 lg:gap-x-8 lg:gap-y-7">
        {/* Quick Actions */}
        <Card big className="p-4 sm:p-6">
          <CardTitle>Quick Actions</CardTitle>
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

        {/* Left column: Manual Switching above Automatic Schedule */}
        <div className="lg:row-span-2 lg:order-first flex flex-col gap-5 lg:gap-7">
        {/* Manual Switching */}
        <Card big className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <h3 className="font-bold text-lg">Manual Switching</h3>
            <Pill className={`px-4 py-2 ${pillClass}`}>{pillText}</Pill>
          </div>
          <p className="text-sm text-[#6b7a90] mb-5">Switch the entire feed on or off directly.</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              disabled={busy}
              onClick={() => setLamp(true)}
              className={`h-12 rounded-lg text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2 transition-colors ${
                ctl?.applied === true ? 'bg-[#27a85a] text-white' : 'bg-[#e3f4ea] text-[#27a85a] hover:bg-[#d3eddc]'
              } ${wantOn === true ? pendingRing : ''}`}
            >
              {busy && <LoaderCircle size={16} className="animate-spin" />}
              Turn ON
            </button>
            <button
              disabled={busy}
              onClick={() => setLamp(false)}
              className={`h-12 rounded-lg text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2 transition-colors ${
                ctl?.applied === false ? 'bg-[#14233c] text-white' : 'bg-[#eceff3] text-[#5b6b82] hover:bg-[#e1e6ec]'
              } ${wantOn === false ? pendingRing : ''}`}
            >
              {busy && <LoaderCircle size={16} className="animate-spin" />}
              Turn OFF
            </button>
          </div>
          {pending && (
            <p className="mt-4 text-xs text-[#6b7a90]" aria-live="polite">
              {requested
                ? `Requested ${ctl.want ? 'ON' : 'OFF'}${waitedS !== null ? ` · sent ${waitedS} s ago` : ''}. The status above changes only after the relay confirms.`
                : `A ${ctl.want ? 'ON' : 'OFF'} request is waiting for the relay to confirm.`}
              {waitedS !== null && waitedS >= 15 && ' No confirmation yet: check that the relay controller is powered and online. The request stays queued on the server.'}
            </p>
          )}
        </Card>

        {/* Node Sleep (LoRa nodes: AUTO / MANUAL / sleep now) */}
        <NodeSleepCard canOperate={!!user && can(user.role, 'controls.operate')} />

        {/* Automatic Schedule */}
        <Card big className="p-4 sm:p-6">
          <CardTitle right={<Pill className="px-3 h-7 bg-[#e3f4ea] text-[#27a85a] text-[11px]">TIMES SAVED ON SERVER</Pill>}>Automatic Schedule</CardTitle>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
            <ScheduleTimes canEdit={!!user && can(user.role, 'schedule.edit')} />
            <button onClick={toggleSchedule} aria-pressed={scheduleOn}>
              <Pill className={`px-6 py-3 ${scheduleOn ? 'bg-[#e3f4ea] text-[#27a85a]' : 'bg-[#eceff3] text-[#8895a7]'}`}>
                Schedule {scheduleOn ? 'ON' : 'OFF'}
              </Pill>
            </button>
          </div>
          <hr className="my-6 border-t-2 border-[#e6ebf1] mx-2" />
          <div className="px-2">
            <div className="text-xs font-bold text-[#6b7a90] mb-4">Days of operation</div>
            <div className="grid grid-cols-7 gap-2 sm:flex sm:gap-3.5">
              {DAY_LETTERS.map((letter, i) => (
                <button
                  key={i}
                  role="switch"
                  aria-checked={days[i]}
                  onClick={() => toggleDay(i)}
                  className={`w-full aspect-square sm:w-10 sm:h-10 sm:aspect-auto rounded-full text-xs font-bold transition-colors ${
                    days[i] ? 'bg-[#e3f4ea] text-[#27a85a]' : 'bg-[#eceff3] text-[#8895a7]'
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>
          <p className="px-2 mt-4 text-[11px] text-[#6b7a90]">The Schedule switch and the days of operation are a layout preview only: they are not connected to the lamps yet.</p>
        </Card>
        </div>

        {/* Control Activity */}
        <Card big className="p-4 sm:p-6">
          <CardTitle>Control Activity</CardTitle>
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
   APP CONTAINER
   ========================================================================== */

// Screens that only depend on `devices`/`mode` skip re-rendering when the receiver sends an identical snapshot.
const DashboardScreen = memo(Dashboard);
const MonitoringScreen = memo(Monitoring);

const App = () => {
  const [currentScreen, setCurrentScreen] = useState('login');
  // Who is signed in. The session is an HTTP-only cookie; on load we ask the server whether it is still valid.
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    let live = true;
    apiMe()
      .then((u) => { if (live) { setUser(u); setCurrentScreen('dashboard'); } })
      .catch(() => {})
      .finally(() => { if (live) setAuthChecked(true); });
    setUnauthorizedHandler(() => { setUser(null); setCurrentScreen('login'); }); // session expired, ended or revoked elsewhere
    return () => { live = false; setUnauthorizedHandler(null); };
  }, []);
  const [menuOpen, setMenuOpen] = useState(false); // slide-out menu on phones
  const signOut = useCallback(async () => {
    try { await apiLogout(); } catch { /* the cookie is cleared by the server; either way we leave */ }
    setUser(null);
    setMenuOpen(false);
    setCurrentScreen('login');
  }, []);
  const [showIntro, setShowIntro] = useState(shouldPlayIntro); // opening city animation (once per session)
  const liveState = useLiveLamps(!!user); // the stream needs the sign-in cookie, so it opens when someone signs in
  const merged = useMemo(() => mergeLive(DEVICES, liveState), [liveState]);
  const { mode, hasTest, lastSync } = merged;
  const receivedAt = liveState.receivedAt;
  // The receiver re-sends its snapshot every 5 s. Keep the same `devices` array while nothing in it has changed,
  // so the screens (and the map markers) are not re-rendered for nothing. The data itself is untouched.
  const devicesKey = JSON.stringify(merged.devices);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const devices = useMemo(() => merged.devices, [devicesKey]);

  const [MapComp, setMapComp] = useState(null); // the Dashboard map component, loaded on demand right after sign-in
  const [showSample, setShowSampleState] = useState(readShowSample);
  const setShowSample = useCallback((v) => {
    setShowSampleState(v);
    try {
      localStorage.setItem(STORAGE_SAMPLE, String(v));
    } catch {
      /* private mode: the setting just won't persist */
    }
  }, []);
  // A ticket form opened from a fault (prefilled with the fault type and a suggested priority). Cleared by any normal navigation.
  const [ticketDraft, setTicketDraft] = useState(null);
  const role = user?.role;
  const goto = useCallback((s) => {
    const wanted = s === 'map' ? 'dashboard' : s; // the interactive map now lives on the Dashboard (there is no separate Map screen)
    const target = screenAllowed(wanted, role) ? wanted : 'dashboard'; // the server enforces access too; this just avoids showing a screen that would only fail
    setTicketDraft(null);
    setCurrentScreen(target);
  }, [role]);
  // Select a streetlight on the Dashboard map (from an alert, a notification or the fault dialog).
  const [mapFocus, setMapFocus] = useState(null);
  const createTicketFor = useCallback((draft) => {
    setTicketDraft(draft);
    setCurrentScreen('maintenance');
  }, []);
  const focusLamp = useCallback((id) => {
    setMapFocus({ id, nonce: Date.now() });
    setCurrentScreen('dashboard');
  }, []);
  useEffect(() => {
    let alive = true;
    loadMap().then((C) => alive && setMapComp(() => C)); // the map is part of the Dashboard, so it is loaded right after sign-in
    return () => {
      alive = false;
    };
  }, []);
  const openDetails = useCallback(() => { if (screenAllowed('details', role)) setCurrentScreen('details'); }, [role]);

  // ---- help, tutorial, fault details, notifications ----
  const [helpTopic, setHelpTopic] = useState(null);
  const [faultId, setFaultId] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [waited, setWaited] = useState(false); // after 4 s without the receiver we stop saying "connecting"
  useEffect(() => {
    const id = setTimeout(() => setWaited(true), 4000);
    return () => clearTimeout(id);
  }, []);
  const connecting = mode !== 'live' && !waited;
  useEffect(() => {
    syncNotifications(devices, mode);
  }, [devices, mode]);
  const openHelp = useCallback((topic) => {
    setHelpTopic(topic);
    setCurrentScreen('manual');
  }, []);
  const openFault = useCallback((id) => setFaultId(id), []);
  const gotoScreen = useCallback(
    (s) => {
      if (s === 'help' || s === 'manual') setHelpTopic(null);
      goto(s);
    },
    [goto]
  );
  const startTutorial = useCallback(() => setShowTutorial(true), []);
  const closeTutorial = useCallback((how) => {
    writeTutorialFlag(how);
    setShowTutorial(false);
    setMenuOpen(false);
    setCurrentScreen('dashboard');
  }, []);
  const ensureMenu = useCallback((want) => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) setMenuOpen(want);
  }, []);
  const ctx = useMemo(() => ({ screen: currentScreen, live: mode === 'live', user, openFault, openHelp, focusLamp }), [currentScreen, mode, user, openFault, openHelp, focusLamp]);
  const activeFault = faultId ? describeFault(devices.find((d) => d.id === faultId)) : null;
  const detailsIds = useMemo(() => (mode === 'live' || !screenAllowed('details', role) ? [] : ['L-008']), [mode, role]);
  // What the Dashboard map may offer this account. A role that may not do something simply does not get the button (the server enforces it too).
  const mapProps = useMemo(
    () => ({
      detailsDeviceIds: detailsIds,
      onOpenDetails: openDetails,
      showSample,
      onShowSampleChange: setShowSample,
      onOpenMaintenance: screenAllowed('maintenance', role) ? () => goto('maintenance') : undefined,
      onOpenControls: can(role, 'controls.operate') ? () => goto('controls') : undefined,
    }),
    [detailsIds, openDetails, showSample, setShowSample, role, goto]
  );
  const toggleCompactMap = useCallback((on) => setShowSample(!on), [setShowSample]);

  // warm the map chunk once the user is in, so the first visit is instant
  const signedIn = currentScreen !== 'login';
  useEffect(() => {
    if (!signedIn) return undefined;
    const id = setTimeout(loadMap, 1200);
    return () => clearTimeout(id);
  }, [signedIn]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // stop the page scrolling behind the menu
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  // phones keep the old scroll position when the screen changes, so jump back to the top
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentScreen]);

  if (!authChecked) return <div className="min-h-screen bg-[#12213a]" aria-busy="true" />; // asking the server whether the session is still valid

  if (user?.mustChangePassword) {
    return (
      <PasswordChange
        user={user}
        onSignOut={signOut}
        onChanged={(u) => {
          setUser(u);
          setCurrentScreen('dashboard');
          if (!readTutorialFlag()) setShowTutorial(true);
        }}
      />
    );
  }

  if (currentScreen === 'login' || !user) {
    return (
      <>
        <Login
          onSignIn={(u) => {
            setUser(u);
            setCurrentScreen('dashboard');
            if (!u.mustChangePassword && !readTutorialFlag()) setShowTutorial(true); // offered once; Skip is always available
          }}
        />
        {showIntro && <CityIntro onDone={() => setShowIntro(false)} />}
      </>
    );
  }

  return (
    <AppCtx.Provider value={ctx}>
    <div className="font-sans bg-[#f3f6f9] min-h-screen">
      <a href="#main-content" className="lm-skip">Skip to main content</a>
      <header className="lg:hidden fixed top-0 inset-x-0 h-14 z-30 bg-[#13223b] text-white flex items-center gap-3 px-3">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-[#1b2e4b]"
        >
          <Menu className="w-6 h-6" />
        </button>
        <img src={LOGO_SRC} alt="" width="32" height="32" className="w-8 h-8 shrink-0 object-contain" />
        <span className="font-bold text-lg">LUMINARA</span>
        <span className="ml-auto text-xs font-semibold text-[#cdd7e5]">Barangay 6</span>
        <NotificationCenter compact live={mode === 'live'} onOpenFault={openFault} />
        <div className="w-8 h-8 rounded-full bg-[#e0f3e8] text-[#27a85a] font-bold text-sm flex items-center justify-center" aria-hidden="true">{user.fullName.charAt(0).toUpperCase()}</div>
      </header>
      {menuOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <Sidebar currentScreen={currentScreen} setScreen={gotoScreen} user={user} onSignOut={signOut} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div
        className={`fixed bottom-3 right-3 z-30 px-3 py-1.5 rounded-md text-[11px] font-bold shadow ${
          mode === 'live' ? (hasTest ? 'bg-[#fff3d6] text-[#c98a0a]' : 'bg-[#e3f4ea] text-[#1f9a52]') : 'bg-[#eceff3] text-[#5b6b82]'
        }`}
      >
        {mode === 'live' ? (hasTest ? 'LIVE + TEST DATA' : 'LIVE DATA') : 'DEMO DATA — receiver not connected'}
      </div>
      {currentScreen === 'dashboard' && role !== 'BASIC' && (
        <DashboardScreen setScreen={goto} devices={devices} mode={mode} lastSync={lastSync} receivedAt={receivedAt} connecting={connecting} onOpenFault={openFault} user={user} MapComp={MapComp} mapProps={mapProps} focusRequest={mapFocus} onFocusLamp={focusLamp} />
      )}
      {currentScreen === 'dashboard' && role === 'BASIC' && (
        <BasicDashboard
          Page={Page}
          Header={Header}
          Card={Card}
          Pill={Pill}
          devices={devices}
          mode={mode}
          connecting={connecting}
          actions={<ConnectionBadge mode={mode} connecting={connecting} receivedAt={receivedAt} lastSync={lastSync} />}
          user={user}
          onNavigate={goto}
          MapComp={MapComp}
          mapProps={mapProps}
          focusRequest={mapFocus}
        />
      )}
      {currentScreen === 'works' && screenAllowed('works', role) && <AssignedWorks Page={Page} Header={Header} Card={Card} user={user} />}
      {currentScreen === 'history' && screenAllowed('history', role) && <BasicHistory Page={Page} Header={Header} Card={Card} />}
      {currentScreen === 'schedule' && screenAllowed('schedule', role) && <BasicSchedule Page={Page} Header={Header} Card={Card} devices={devices} mode={mode} />}
      {currentScreen === 'monitoring' && screenAllowed('monitoring', role) && <MonitoringScreen setScreen={goto} devices={devices} mode={mode} onOpenFault={openFault} />}
      {currentScreen === 'details' && screenAllowed('details', role) && <Details setScreen={goto} />}
      {currentScreen === 'maintenance' && screenAllowed('maintenance', role) && <Maintenance draft={ticketDraft} />}
      {currentScreen === 'controls' && screenAllowed('controls', role) && <Controls user={user} />}
      {currentScreen === 'users' && screenAllowed('users', role) && <UserManagement Page={Page} Header={Header} Card={Card} currentUser={user} />}
      {currentScreen === 'data' && screenAllowed('data', role) && <DataViewer Page={Page} Header={Header} Card={Card} user={user} />}
      {currentScreen === 'settings' && (
        <SettingsScreen Page={Page} Header={Header} Card={Card} compactMap={!showSample} onCompactMapChange={toggleCompactMap} user={user} onOpenUsers={() => goto('users')} />
      )}
      {(currentScreen === 'help' || currentScreen === 'manual') && (
        <HelpCenter
          Page={Page}
          Header={Header}
          Card={Card}
          view={currentScreen}
          topic={helpTopic}
          onTopic={setHelpTopic}
          onNavigate={gotoScreen}
          onStartTutorial={startTutorial}
        />
      )}
      {activeFault && (
        <FaultDetail
          fault={activeFault}
          device={devices.find((d) => d.id === faultId)}
          canViewHistory={can(role, 'history.view')}
          canViewTickets={screenAllowed('maintenance', role)}
          onCreateTicket={can(role, 'maintenance.create') ? (draft) => { setFaultId(null); createTicketFor(draft); } : undefined}
          onLocate={() => { setFaultId(null); focusLamp(faultId); }}
          onClose={() => setFaultId(null)}
          onOpenHelp={(t) => {
            setFaultId(null);
            openHelp(t);
          }}
          onOpenStreetlights={() => {
            setFaultId(null);
            goto(screenAllowed('monitoring', role) ? 'monitoring' : 'map');
          }}
        />
      )}
      {showTutorial && <Tutorial role={role} onNavigate={goto} onEnsureMenu={ensureMenu} onClose={closeTutorial} />}
    </div>
    </AppCtx.Provider>
  );
};

export default App;
