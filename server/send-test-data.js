// Pretends to be the master ESP32 so you can test the dashboard WITHOUT hardware.
// It posts the SAME JSON that LoraIntegrated.ino's bridge posts:
//   {"type":"RPT|ALRT|BEAT","nodeId":N,"seq":N,"lux":X,"status":"...","rssi":N}
// (plus source:"test", which makes the dashboard show a "TEST DATA" label; the real firmware never sends it).
// Like the firmware: the first packet of a node is a poll reply (RPT), later packets are BEAT, and a status
// change is sent as ALRT.
//
//   node server/send-test-data.js            -> node 1 NORMAL_LIT, node 2 DAYLIGHT_STANDBY, node 3 STANDBY, a report every 5 s
//   node server/send-test-data.js stop2      -> node 2 goes silent after 3 reports (watch it turn STALE, then OFFLINE)
//   node server/send-test-data.js blackout1  -> node 1 reports TOTAL_BLACKOUT (lux 0.0 is a real reading here)
//   node server/send-test-data.js lowlight1  -> node 1 reports LOW_LIGHT (warning)
//   node server/send-test-data.js flicker1   -> node 1 reports BLINKING/UNSTABLE
//   node server/send-test-data.js sensor1    -> node 1 reports SENSOR_ERROR (the firmware sends lux 0.0 as a placeholder)
const URL = process.env.SERVER_URL || 'http://localhost:3001/api/telemetry';
const KEY = process.env.DEVICE_KEY || 'dev-key-change-me';
const mode = process.argv[2] || '';

const NORMAL = { 1: 'NORMAL_LIT', 2: 'DAYLIGHT_STANDBY', 3: 'STANDBY' };
const NORMAL_LUX = { 1: 160, 2: 12000, 3: 20 };
const OVERRIDE = {
  blackout1: ['TOTAL_BLACKOUT', 0],
  lowlight1: ['LOW_LIGHT', 40],
  flicker1: ['BLINKING/UNSTABLE', 220],
  sensor1: ['SENSOR_ERROR', 0],
};

const seq = { 1: 0, 2: 0, 3: 0 };
const lastStatus = {};
let round = 0;

async function send(nodeId) {
  seq[nodeId] += 1;
  const [ovStatus, ovLux] = nodeId === 1 && OVERRIDE[mode] ? OVERRIDE[mode] : [];
  const status = ovStatus || NORMAL[nodeId];
  const lux = ovStatus ? ovLux : Number((NORMAL_LUX[nodeId] + Math.random() * 5).toFixed(1));
  const type = seq[nodeId] === 1 ? 'RPT' : status !== lastStatus[nodeId] ? 'ALRT' : 'BEAT';
  lastStatus[nodeId] = status;
  const body = { type, nodeId, seq: seq[nodeId], lux, status, rssi: -70 - nodeId * 3, source: 'test' };
  try {
    const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': KEY }, body: JSON.stringify(body) });
    console.log(`node ${nodeId} ${type} seq ${body.seq} ${status} ->`, r.status);
  } catch (e) {
    console.log('cannot reach server:', e.message);
  }
}

setInterval(() => {
  round += 1;
  for (const n of [1, 2, 3]) {
    if (mode === 'stop2' && n === 2 && round > 3) continue; // node 2 "dies"
    send(n);
  }
}, 5000);
console.log('Sending test packets every 5 s. Press Ctrl+C to stop.');
