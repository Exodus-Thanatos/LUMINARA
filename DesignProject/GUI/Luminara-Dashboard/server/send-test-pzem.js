// Sends SIMULATED PZEM readings (labelled source:"test") so you can see the Dashboard panel without the meter.
//   DEVICE_KEY=your-key node server/send-test-pzem.js            (every 5 s, like the ESP32)
// Optional: URL=http://host:3001/api/pzem  EVERY_MS=5000  MODE=ok|offline
const KEY = process.env.DEVICE_KEY || 'dev-key-change-me';
const URL_ = process.env.URL || 'http://127.0.0.1:3001/api/pzem';
const EVERY = Number(process.env.EVERY_MS) || 5000;
const MODE = process.env.MODE || 'ok';
let seq = 0;
let energy = 12.0;
const tick = async () => {
  seq += 1;
  const t = Date.now() / 1000;
  const voltage = 230 + 2 * Math.sin(t / 40);
  const power = Math.max(0, 350 + 220 * Math.sin(t / 90) + 40 * Math.sin(t / 7));
  const pf = 0.97;
  const current = power / (voltage * pf);
  energy += (power * EVERY) / 1000 / 3600 / 1000; // kWh
  const body = MODE === 'offline'
    ? { ok: false, seq, errors: seq, reason: 'no_response', source: 'test' }
    : { ok: true, seq, voltage: +voltage.toFixed(1), current: +current.toFixed(3), power: +power.toFixed(1), energy: +energy.toFixed(3), frequency: 60, pf, source: 'test' };
  try {
    const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': KEY }, body: JSON.stringify(body) });
    console.log(`pzem seq ${seq} ${MODE} -> ${r.status}`);
  } catch (e) {
    console.log(`pzem seq ${seq} -> failed: ${e.message}`);
  }
};
tick();
setInterval(tick, EVERY);
