// Lighting schedule rules. Pure functions (no I/O), shared by the server and the dashboard.
// Times are Philippine local time, fixed UTC+8 with no daylight saving (same as TZ_STRING "PST-8" in the firmware).
export const LOCAL_OFFSET_MIN = 480;
export const DEFAULT_SCHEDULE = { onTime: '18:00', offTime: '05:30' }; // gateway shift in LoraIntegrated.ino

// Firmware facts (LoraIntegrated.ino buildSchedule): the lamp nodes deep-sleep after the lamps go OFF and only start
// answering again at the first poll wave, one hour before lamps-on (17:00 for 18:00). So silence from lamps-off until
// shortly after that poll is expected and is shown as SLEEPING, not OFFLINE.
export const WAKE_LEAD_MIN = 60;
export const SLEEP_GRACE_MIN = 10; // a node that is still silent this long after its wake-up poll is really offline

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY = 1440;
const MIN = 60000;

export const parseHHMM = (s) => {
  const m = HHMM.exec(String(s ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// { errors, values } for a schedule typed by an administrator.
export const validateSchedule = (input) => {
  const errors = {};
  const onTime = String(input?.onTime ?? '').trim();
  const offTime = String(input?.offTime ?? '').trim();
  if (parseHHMM(onTime) === null) errors.onTime = 'Use the 24-hour format HH:MM, for example 18:00.';
  if (parseHHMM(offTime) === null) errors.offTime = 'Use the 24-hour format HH:MM, for example 05:30.';
  if (!errors.onTime && !errors.offTime && onTime === offTime) errors.offTime = 'The OFF time must be different from the ON time.';
  return { errors, values: { onTime, offTime } };
};

export const localMinutes = (ms, offsetMin = LOCAL_OFFSET_MIN) => {
  const t = Math.floor(ms / MIN) + offsetMin;
  return ((t % DAY) + DAY) % DAY;
};
const localDayStart = (ms, offsetMin = LOCAL_OFFSET_MIN) => ms - (localMinutes(ms, offsetMin) * MIN + (ms % MIN + MIN) % MIN);

const inWindow = (m, start, end) => (start < end ? m >= start && m < end : m >= start || m < end);

// Should the lamps be lit right now? (ON time up to the OFF time, which may be after midnight.)
export const lampsExpectedOn = (sched, ms, offsetMin = LOCAL_OFFSET_MIN) => {
  const on = parseHHMM(sched?.onTime);
  const off = parseHHMM(sched?.offTime);
  if (on === null || off === null) return null;
  return inWindow(localMinutes(ms, offsetMin), on, off);
};

// Read-only summary for the dashboard: current operating state and the next switch.
export const scheduleSummary = (sched, ms, offsetMin = LOCAL_OFFSET_MIN) => {
  const on = parseHHMM(sched?.onTime);
  const off = parseHHMM(sched?.offTime);
  if (on === null || off === null) return null;
  const isOn = inWindow(localMinutes(ms, offsetMin), on, off);
  const target = isOn ? off : on;
  const m = localMinutes(ms, offsetMin);
  const wait = ((target - m + DAY) % DAY || DAY) * MIN - (ms % MIN + MIN) % MIN;
  return { state: isOn ? 'ON' : 'OFF', nextChange: isOn ? 'OFF' : 'ON', nextChangeAt: ms + wait };
};

// While nodes are expected to be asleep this returns when that sleep started (ms), otherwise null.
export const sleepWindowStart = (sched, ms, offsetMin = LOCAL_OFFSET_MIN) => {
  const on = parseHHMM(sched?.onTime);
  const off = parseHHMM(sched?.offTime);
  if (on === null || off === null) return null;
  const end = (((on - WAKE_LEAD_MIN + SLEEP_GRACE_MIN) % DAY) + DAY) % DAY;
  const len = (((end - off) % DAY) + DAY) % DAY;
  if (len === 0 || len > 20 * 60) return null; // nonsense schedule (no sleep period, or one longer than a day shift): never hide a silent lamp
  const m = localMinutes(ms, offsetMin);
  if (!inWindow(m, off, end)) return null;
  const start = localDayStart(ms, offsetMin) + off * MIN;
  return start > ms ? start - DAY * MIN : start;
};

// A silent node counts as SLEEPING only if it is inside the sleep period AND its last report was the one around the moment
// the sleep period began (the nodes keep reporting until the master's sleep command / their own failsafe, at most ~45 min
// after lamps-off). A node last heard much earlier did not fall asleep as planned: it is offline. A node that reports
// in the middle of the sleep period is awake, so if it then goes quiet that is a real STALE/OFFLINE, not sleep.
export const SLEEP_LAST_REPORT_WINDOW_MIN = 75;
export const isSleeping = ({ sched, lastSeenMs, now, offsetMin = LOCAL_OFFSET_MIN }) => {
  const start = sleepWindowStart(sched, now, offsetMin);
  return start !== null && lastSeenMs >= start - 15 * MIN && lastSeenMs <= start + SLEEP_LAST_REPORT_WINDOW_MIN * MIN;
};
