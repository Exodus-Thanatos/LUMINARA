// Pretends to be the master ESP32 so you can test the dashboard WITHOUT hardware.
// Every packet is marked source:"test", so the dashboard shows a "TEST DATA" label.
//
//   node server/send-test-data.js            -> nodes 1,2,3 send a BEAT every 5 s
//   node server/send-test-data.js stop2      -> same, but node 2 goes silent after 3 packets (watch it go OFFLINE)
//   node server/send-test-data.js blackout1  -> node 1 reports TOTAL_BLACKOUT (lux 0.0)
const URL = process.env.SERVER_URL || 'http://localhost:3001/api/telemetry';
const KEY = process.env.DEVICE_KEY || 'dev-key-change-me';
const mode = process.argv[2] || '';

const seq = { 1: 0, 2: 0, 3: 0 };
let round = 0;

async function send(nodeId) {
  seq[nodeId] += 1;
  const blackout = mode === 'blackout1' && nodeId === 1;
  const body = {
    type: seq[nodeId] === 1 ? 'JOIN' : 'BEAT',
    nodeId,
    seq: seq[nodeId],
    lux: blackout ? 0 : Number((120 + nodeId * 15 + Math.random() * 5).toFixed(1)),
    status: blackout ? 'TOTAL_BLACKOUT' : 'NORMAL',
    rssi: -70 - nodeId * 3,
    source: 'test',
  };
  try {
    const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': KEY }, body: JSON.stringify(body) });
    console.log(`node ${nodeId} seq ${body.seq} ->`, r.status);
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
