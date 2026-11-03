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
//   MapPin,
//   Menu,
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

// const LAMP_TILE = {
//   ONLINE: 'bg-[#e3f4ea] border-[#9dd5b2] text-[#1f9a52]', // live statuses
//   WARNING: 'bg-[#fff3d6] border-[#f0b84a] text-[#c98a0a]',
//   OFFLINE: 'bg-[#fff3d6] border-[#f0b84a] text-[#c98a0a]',
//   'NO DATA': 'bg-[#eceff3] border-[#cfd6df] text-[#8895a7]',
//   ON: 'bg-[#e3f4ea] border-[#9dd5b2] text-[#1f9a52]',
//   FAULT: 'bg-[#fde8e8] border-[#f0a3a3] text-[#e04040]',
//   OFF: 'bg-[#fff3d6] border-[#f0b84a] text-[#c98a0a]',
//   UNINSTALLED: 'bg-[#f3f6f9] border-[#d5dce6] border-dashed text-[#9aa7b8] opacity-70', // new addition, for lamps without sensor nodes
// };

// const ALERTS = [
//   { id: 'L-008', dot: 'bg-[#e04848]', text: 'Lamp fault detected', when: '2 min ago' },
//   { id: 'L-014', dot: 'bg-[#f0a82e]', text: 'Signal not received', when: '18 min ago' },
//   { id: 'L-021', dot: 'bg-[#27a85a]', text: 'Voltage restored', when: '1 hr ago' },
// ];

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
//                 <td><Pill className={`w-[122px] h-9 ${PRIORITY_BADGE[t.priority]}`}>{t.priority}</Pill></td>
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
//                 <Pill className={`px-3 h-8 ${PRIORITY_BADGE[t.priority]}`}>{t.priority}</Pill>
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
import React, { memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
  Bell,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  MapPin,
  Menu,
  X,
} from 'lucide-react';
import SettingsScreen from './Settings.jsx';
import { CardTitle } from './uiKit.jsx';
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

const LAMP_TILE = {
  ONLINE: 'bg-[#e3f4ea] border-[#9dd5b2] text-[#1f9a52]', // live statuses
  WARNING: 'bg-[#fff3d6] border-[#f0b84a] text-[#c98a0a]',
  OFFLINE: 'bg-[#fff3d6] border-[#f0b84a] text-[#c98a0a]',
  'NO DATA': 'bg-[#eceff3] border-[#cfd6df] text-[#8895a7]',
  ON: 'bg-[#e3f4ea] border-[#9dd5b2] text-[#1f9a52]',
  FAULT: 'bg-[#fde8e8] border-[#f0a3a3] text-[#e04040]',
  OFF: 'bg-[#fff3d6] border-[#f0b84a] text-[#c98a0a]',
  UNINSTALLED: 'bg-[#f3f6f9] border-[#d5dce6] border-dashed text-[#9aa7b8] opacity-70', // new addition, for lamps without sensor nodes
};

const ALERTS = [
  { id: 'L-008', dot: 'bg-[#e04848]', text: 'Lamp fault detected', when: '2 min ago' },
  { id: 'L-014', dot: 'bg-[#f0a82e]', text: 'Signal not received', when: '18 min ago' },
  { id: 'L-021', dot: 'bg-[#27a85a]', text: 'Voltage restored', when: '1 hr ago' },
];

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

// Maintenance (Image 4)
// SAMPLE tickets. `ticket` is the maintenance ticket number (MT-0000); `lamp` is the lamp ID (L-000).
const TICKETS = [
  { id: 'MT-1048', lamp: 'L-008', where: 'Market Street', issue: 'Lamp not illuminating', priority: 'HIGH', status: 'OPEN', updated: '10:40 AM' },
  { id: 'MT-1047', lamp: 'L-014', where: 'School Road', issue: 'No telemetry received', priority: 'MEDIUM', status: 'ASSIGNED', updated: '10:24 AM' },
  { id: 'MT-1046', lamp: 'L-021', where: 'Park Entrance', issue: 'Intermittent voltage', priority: 'MEDIUM', status: 'IN PROGRESS', updated: '09:52 AM' },
  { id: 'MT-1045', lamp: 'L-003', where: 'Main Road', issue: 'Photocell cleaned', priority: 'LOW', status: 'RESOLVED', updated: '09:31 AM' },
  { id: 'MT-1044', lamp: 'L-019', where: 'Park Entrance', issue: 'Connector replaced', priority: 'LOW', status: 'RESOLVED', updated: 'Yesterday' },
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

const Sidebar = ({ currentScreen, setScreen, open = false, onClose = () => {} }) => (
  <aside
    id="sidebar"
    className={`w-64 bg-[#13223b] text-white h-screen fixed left-0 top-0 z-50 flex flex-col justify-between overflow-y-auto transition-transform duration-200 lg:translate-x-0 ${
      open ? 'translate-x-0' : '-translate-x-full invisible lg:visible'
    }`}
  >
    <div>
      <div className="px-8 pt-8 flex items-center gap-3">
        <div className="w-12 h-12 bg-[#27a85a] rounded-full flex items-center justify-center font-bold text-lg">SL</div>
        <div className="flex-1">
          <div className="font-bold text-2xl leading-tight">LUMINARA</div>
          <div className="text-xs font-bold text-[#cdd7e5]">STREETLIGHTS</div>
        </div>
        <button onClick={onClose} className="lg:hidden -mr-4 w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[#1b2e4b]" aria-label="Close menu">
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav className="mt-8 lg:mt-12 px-3.5 space-y-2.5">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = currentScreen === id || (currentScreen === 'details' && id === 'monitoring');
          return (
            <button
              key={id}
              aria-current={active ? 'page' : undefined}
              onMouseEnter={id === 'map' ? loadMap : undefined}
              onFocus={id === 'map' ? loadMap : undefined}
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
    <div className="flex justify-between items-center border-b border-[#e1e7ee] pb-4 md:pb-6">
      <h1 className="text-2xl md:text-3xl font-bold text-[#14233c]">{title}</h1>
      <div className="hidden md:flex items-center gap-4">
        <span className="text-sm font-semibold text-[#5b6b82]">Barangay 6</span>
        <button className="w-12 h-12 bg-white border border-[#e1e7ee] rounded-full flex items-center justify-center hover:bg-gray-50" aria-label="Notifications">
          <Bell className="w-5 h-5 text-[#5b6b82]" />
        </button>
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

const Page = ({ children }) => (
  <main className="lm-page lg:ml-64 pt-[4.5rem] px-4 pb-8 md:px-6 lg:p-10 bg-[#f3f6f9] min-h-screen text-[#14233c] overflow-x-hidden">{children}</main>
);

const Card = ({ big = false, className = '', children }) => (
  <div className={`bg-white border border-[#e6ebf1] ${big ? 'rounded-2xl' : 'rounded-xl'} ${className}`}>
    {children}
  </div>
);

const Pill = ({ className = '', children }) => (
  <span className={`inline-flex items-center justify-center rounded-md text-xs font-bold uppercase ${className}`}>{children}</span>
);

const OutlineButton = ({ className = '', ...p }) => (
  <button {...p} className={`h-[42px] px-6 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50 transition-colors ${className}`} />
);
const PrimaryButton = ({ className = '', ...p }) => (
  <button {...p} className={`h-[42px] px-6 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52] transition-colors ${className}`} />
);

/* ==========================================================================
   SCREEN 1 — LOGIN
   ========================================================================== */

const Login = ({ onSignIn }) => (
  <div className="flex flex-col lg:flex-row min-h-screen lg:h-screen w-full">
    <div className="lg:w-1/2 bg-[#1b3049] flex flex-col justify-center px-6 py-8 lg:px-[120px] lg:py-0">
      <div className="w-14 h-14 lg:w-[72px] lg:h-[72px] bg-[#27a85a] rounded-full flex items-center justify-center font-bold text-xl lg:text-2xl text-white mb-5 lg:mb-10">SL</div>
      <h1 className="text-4xl lg:text-5xl font-bold text-white mb-2 lg:mb-4">LUMINARA</h1>
      <h2 className="text-sm lg:text-lg font-bold text-[#c3cfdf] mb-4 lg:mb-14">SMART STREETLIGHT SYSTEM</h2>
      <p className="hidden lg:block text-[28px] leading-snug text-white font-semibold mb-12">
        Streetlight monitoring<br />and control center
      </p>
      <div className="hidden lg:block w-[84px] h-1.5 bg-[#27a85a] mb-12"></div>
      <p className="text-base text-[#c3cfdf]">Barangay 6 • Carmona, Cavite</p>
    </div>

    <div className="flex-1 lg:w-1/2 lg:flex-none bg-[#12213a] flex items-center justify-center px-4 py-8 lg:p-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSignIn();
        }}
        className="bg-white rounded-[2rem] lg:rounded-[3rem] p-6 sm:p-10 lg:p-14 w-full max-w-[536px]"
      >
        <h2 className="text-3xl font-bold text-[#14233c] mb-3">Welcome back</h2>
        <p className="text-sm text-[#6b7a90] mb-8 lg:mb-12">Sign in to manage your network</p>

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

const Dashboard = ({ setScreen, devices, mode, lastSync }) => {
  const live = mode === 'live';
  const count = (st) => devices.filter((x) => x.status === st).length;
  const nOnline = count('ONLINE');
  const nAlert = count('FAULT') + count('WARNING');

  const demoCount = (st) => LAMPS.filter((l) => l.status === st).length;
  const nInstalled = LAMPS.length - demoCount('UNINSTALLED');

  const tiles = live ? devices : LAMPS;
  const liveAlerts = devices
    .filter((x) => ['FAULT', 'WARNING', 'OFFLINE'].includes(x.status))
    .map((x) => ({
      id: x.id,
      dot: x.status === 'FAULT' ? 'bg-[#e04848]' : 'bg-[#f0a82e]',
      text: x.status === 'OFFLINE'
        ? `No signal from node (last reported ${x.reported})`
        : !x.known ? `Unrecognised status ${x.reported}` : `Reported ${x.reported}${x.comm === 'Stale' ? ' (report delayed)' : ''}`,
      when: x.time,
    }));
  const alerts = live ? liveAlerts : ALERTS;
  const summary = live ? [
    { label: 'Total Lights', value: pad2(devices.length), note: 'Detected by the dashboard', bg: 'bg-[#27a85a]', mark: 'dot' }, //devices.length — value
    { label: 'Online', value: pad2(nOnline), note: 'Reporting normally', bg: 'bg-[#27a85a]', mark: 'dot' },
    { label: 'Fault Alerts', value: pad2(nAlert), note: 'Reported by nodes', bg: 'bg-[#e04848]', mark: '!' },
    { label: 'Offline', value: pad2(count('OFFLINE')), note: 'No recent signal', bg: 'bg-[#f0a82e]', mark: 'dot' },
    ] : [
    { label: 'Total Lights', value: String(PLANNED_TOTAL), note: `${nInstalled} installed, ${PLANNED_TOTAL - nInstalled} uninstalled`, bg: 'bg-[#27a85a]', mark: 'dot' },
    { label: 'Online', value: pad2(demoCount('ON')), note: 'Installed and reporting', bg: 'bg-[#27a85a]', mark: 'dot' },
    { label: 'Fault Alerts', value: pad2(demoCount('FAULT')), note: 'Needs attention', bg: 'bg-[#e04848]', mark: '!' },
    { label: 'Offline', value: pad2(demoCount('OFF')), note: 'No recent signal', bg: 'bg-[#f0a82e]', mark: 'dot' },
  ];
  return (
    <Page>
      <Header title="Dashboard Overview" subtitle="Good afternoon, Admin" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-7">
        {summary.map((c) => (
          <Card key={c.label} className="p-4 md:p-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-[1.9fr_1fr] gap-6 lg:gap-8 items-start">
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold">Streetlight Network</h2>
            <Pill className="px-5 py-2.5 bg-[#e3f4ea] text-[#27a85a]">Live Status</Pill>
          </div>
          <Card big className="p-4 sm:p-7">
            <CardTitle small right={<span className="text-xs font-bold text-[#1f9a52]">● {live ? nOnline : demoCount('ON')} normal</span>}>LAMP NETWORK STATUS</CardTitle>
            {live && tiles.length === 0 && (
              <p className="py-10 text-center text-sm text-[#6b7a90]">No lamp nodes detected yet. A lamp appears here when its node first reports.</p>
            )}
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-3.5">
              {tiles.map((l) => (
                <button
                  key={l.id}
                  onClick={live || l.status === 'UNINSTALLED' ? undefined : () => setScreen('details')}
                  className={`h-14 rounded-md border-2 flex flex-col items-center justify-center hover:shadow-md transition-shadow ${LAMP_TILE[l.status]}`}
                >
                  <span className="text-xs font-bold text-[#14233c]">{l.id}</span>
                  <span className="text-[10px] font-bold mt-1">{l.status}</span>
                </button>
              ))}
            </div>
            <p className="mt-8 text-xs text-[#6b7a90] italic">{live ? 'A lamp appears here automatically when the dashboard detects its node.' : 'Select a lamp tile to open its readings and fault details.'}</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card big className="p-6">
            <CardTitle>Recent Alerts</CardTitle>
            {live && alerts.length === 0 && <p className="text-sm text-[#6b7a90]">No active alerts.</p>}
            {alerts.map((a, i) => (
              <div
                key={a.id}
                onClick={!live && a.id === 'L-008' ? () => setScreen('details') : undefined}
                className={`${i < alerts.length - 1 ? 'border-b-2 border-[#e6ebf1] pb-4 mb-4' : ''} ${!live && a.id === 'L-008' ? 'cursor-pointer' : ''}`}
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
            <CardTitle>System Activity</CardTitle>
            <div className="flex justify-between items-center mb-4 text-sm">
              <span className="text-[#6b7a90]">Last sync</span>
              <span className="font-bold">{live ? lastSync : '10:42:08 AM'}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#6b7a90]">Network status</span>
              <Pill className="px-5 py-2.5 bg-[#e3f4ea] text-[#27a85a]">{live ? 'Receiver connected' : 'Connected'}</Pill>
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

const Monitoring = ({ setScreen, devices, mode }) => {
  const detailsEnabled = mode !== 'live'; // the Details screen is still sample data for L-008
  const streets = useMemo(() => [...new Set(devices.map((x) => x.loc.split(' • ')[0]))], [devices]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [streetFilter, setStreetFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const q = query.trim().toLowerCase();
  const filtered = devices.filter(
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
              className="w-full h-11 md:h-10 pl-10 pr-3 bg-[#f8fafc] border border-[#e1e7ee] rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-[#27a85a]/30"
            />
          </div>
          <select value={statusFilter} onChange={onChange(setStatusFilter)} className={`${selectCls} w-full sm:w-44`}>
            <option value="ALL">All statuses</option>
            <option value="ONLINE">Online</option>
            <option value="FAULT">Fault</option>
            <option value="OFFLINE">Offline</option>
            <option value="WARNING">Warning</option>
            <option value="UNINSTALLED">Uninstalled</option>
          </select>
          <select value={streetFilter} onChange={onChange(setStreetFilter)} className={`${selectCls} w-full sm:w-44`}>
            <option value="ALL">All streets</option>
            {streets.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-[#6b7a90] md:mr-4">{devices.filter((x) => x.status !== 'UNINSTALLED').length} installed of {devices.length}</span>
      </Card>

      {mode !== 'live' && (
  <Card className="px-4 md:px-6 py-4 mb-5 md:mb-6">
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-bold text-sm">Panel feed <span className="font-normal text-[#6b7a90]">· whole line, all {PLANNED_TOTAL} lamps</span></h3>
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
                <td className="text-sm">{x.loc}</td>
                <td>
                  <Pill className={`w-[105px] h-9 ${STATUS_BADGE[x.status]}`}>{x.status}</Pill>
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
                  <button className="text-[#5b6b82] hover:text-[#14233c]" aria-label={`Actions for ${x.id}`}>
                    <MoreHorizontal className="w-6 h-6 inline" />
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
                </div>
                <Pill className={`px-3 h-8 shrink-0 ${STATUS_BADGE[x.status]}`}>{x.status}</Pill>
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
          <div className="flex flex-wrap gap-3">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-[42px] px-4 bg-white border border-[#e1e7ee] rounded-md text-base md:text-sm font-semibold text-[#14233c] focus:outline-none"
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
        {summary.map((c) => (
          <Card key={c.label} className="p-4 md:p-6 flex justify-between items-start">
            <div>
              <div className="text-xs font-bold text-[#5b6b82] uppercase">{c.label}</div>
              <div className={`text-3xl md:text-4xl font-bold mt-3 ${c.color}`}>{c.value}</div>
            </div>
            <span className={`hidden sm:block w-9 h-9 rounded-full ${c.tint}`}></span>
          </Card>
        ))}
      </div>

      <Card big className="p-4 md:p-6 pb-6 md:pb-10">
        <CardTitle right={<Pill className="px-3 h-7 bg-[#eceff3] text-[#5b6b82] text-[11px]">SAMPLE DATA</Pill>}>Recent Maintenance Tickets</CardTitle>
        <div className="hidden md:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#f3f6f9] text-xs font-bold text-[#6b7a90] uppercase">
              <th className="py-4 pl-4 rounded-l-lg">Ticket No.</th>
              <th className="py-4">Lamp ID / Location</th>
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
                <td className="text-sm"><span className="font-bold">{t.lamp}</span> • {t.where}</td>
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
        </div>

        <ul className="md:hidden">
          {rows.map((t) => (
            <li key={t.id} className="py-4 border-b-2 border-[#e6ebf1] last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-sm">{t.id}</span>
                <span className="text-xs text-[#6b7a90]">{t.updated}</span>
              </div>
              <div className="text-sm mt-1">{t.issue}</div>
              <div className="text-xs text-[#6b7a90] mt-0.5"><span className="font-bold text-[#14233c]">{t.lamp}</span> • {t.where}</div>
              <div className="flex gap-2 mt-3">
                <Pill className={`px-3 h-8 ${PRIORITY_BADGE[t.priority]}`}>{t.priority}</Pill>
                <Pill className={`px-3 h-8 ${TICKET_STATUS_BADGE[t.status]}`}>{t.status}</Pill>
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="py-10 text-center text-sm text-[#6b7a90]">No tickets with this status.</li>}
        </ul>
      </Card>
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

const Controls = () => {
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

        {/* Automatic Schedule */}
        <Card big className="p-4 sm:p-6">
          <CardTitle right={<Pill className="px-3 h-7 bg-[#eceff3] text-[#5b6b82] text-[11px]">PREVIEW · NOT CONNECTED</Pill>}>Automatic Schedule</CardTitle>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start px-2">
            <div className="flex gap-6 sm:gap-24">
              <div>
                <div className="font-bold">Sunset ON</div>
                <div className="text-2xl sm:text-3xl font-bold text-[#27a85a] mt-2">06:00 PM</div>
              </div>
              <div>
                <div className="font-bold">Sunrise OFF</div>
                <div className="text-2xl sm:text-3xl font-bold mt-2">06:00 AM</div>
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
  const [menuOpen, setMenuOpen] = useState(false); // slide-out menu on phones
  const [showIntro, setShowIntro] = useState(shouldPlayIntro); // opening city animation (once per session)
  const liveState = useLiveLamps();
  const merged = useMemo(() => mergeLive(DEVICES, liveState), [liveState]);
  const { mode, hasTest, lastSync } = merged;
  // The receiver re-sends its snapshot every 5 s. Keep the same `devices` array while nothing in it has changed,
  // so the screens (and the map markers) are not re-rendered for nothing. The data itself is untouched.
  const devicesKey = JSON.stringify(merged.devices);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const devices = useMemo(() => merged.devices, [devicesKey]);

  const [MapComp, setMapComp] = useState(null); // set on the first visit to the map, then the map is kept alive
  const [showSample, setShowSampleState] = useState(readShowSample);
  const setShowSample = useCallback((v) => {
    setShowSampleState(v);
    try {
      localStorage.setItem(STORAGE_SAMPLE, String(v));
    } catch {
      /* private mode: the setting just won't persist */
    }
  }, []);
  const goto = useCallback((s) => {
    if (s === 'map') loadMap().then((C) => setMapComp(() => C));
    setCurrentScreen(s);
  }, []);
  const openDetails = useCallback(() => setCurrentScreen('details'), []);
  const detailsIds = useMemo(() => (mode === 'live' ? [] : ['L-008']), [mode]);
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

  if (currentScreen === 'login') {
    return (
      <>
        <Login onSignIn={() => setCurrentScreen('dashboard')} />
        {showIntro && <CityIntro onDone={() => setShowIntro(false)} />}
      </>
    );
  }

  return (
    <div className="font-sans bg-[#f3f6f9] min-h-screen">
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
        <div className="w-8 h-8 bg-[#27a85a] rounded-full flex items-center justify-center font-bold text-xs">SL</div>
        <span className="font-bold text-lg">LUMINARA</span>
        <span className="ml-auto text-xs font-semibold text-[#cdd7e5]">Barangay 6</span>
        <div className="w-8 h-8 rounded-full bg-[#e0f3e8] text-[#27a85a] font-bold text-sm flex items-center justify-center">A</div>
      </header>
      {menuOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <Sidebar currentScreen={currentScreen} setScreen={goto} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div
        className={`fixed bottom-3 right-3 z-30 px-3 py-1.5 rounded-md text-[11px] font-bold shadow ${
          mode === 'live' ? (hasTest ? 'bg-[#fff3d6] text-[#c98a0a]' : 'bg-[#e3f4ea] text-[#1f9a52]') : 'bg-[#eceff3] text-[#5b6b82]'
        }`}
      >
        {mode === 'live' ? (hasTest ? 'LIVE + TEST DATA' : 'LIVE DATA') : 'DEMO DATA — receiver not connected'}
      </div>
      {currentScreen === 'dashboard' && <DashboardScreen setScreen={goto} devices={devices} mode={mode} lastSync={lastSync} />}
      {currentScreen === 'monitoring' && <MonitoringScreen setScreen={goto} devices={devices} mode={mode} />}
      {currentScreen === 'map' && !MapComp && (
        <Page>
          <Header title="Streetlight Map" subtitle="Loading the map…" />
          <Card big className="p-10 text-center text-sm text-[#6b7a90] inline-flex items-center gap-3 justify-center w-full">
            <LoaderCircle size={18} className="animate-spin" /> Loading map
          </Card>
        </Page>
      )}
      {MapComp && (
        <div hidden={currentScreen !== 'map'}>
          <MapComp
            Page={Page}
            Header={Header}
            Card={Card}
            Pill={Pill}
            devices={devices}
            detailsDeviceIds={detailsIds}
            onOpenDetails={openDetails}
            active={currentScreen === 'map'}
            showSample={showSample}
            onShowSampleChange={setShowSample}
          />
        </div>
      )}
      {currentScreen === 'details' && <Details setScreen={goto} />}
      {currentScreen === 'maintenance' && <Maintenance />}
      {currentScreen === 'controls' && <Controls />}
      {currentScreen === 'settings' && (
        <SettingsScreen Page={Page} Header={Header} Card={Card} compactMap={!showSample} onCompactMapChange={toggleCompactMap} />
      )}
    </div>
  );
};

export default App;
