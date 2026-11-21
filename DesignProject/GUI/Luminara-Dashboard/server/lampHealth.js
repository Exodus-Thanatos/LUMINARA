// One place that turns what a lamp node reports into the wording and colour the dashboard shows.
// Pure functions (no React, no I/O). The server uses it for every snapshot, and the browser imports the same file for
// demo data, so firmware, server and screens always agree.
//
// Thresholds are NOT invented here: they mirror firmware/LoraIntegrated/LoraIntegrated.ino (computeStatus()):
//   <= 5 lux in shift -> TOTAL_BLACKOUT   5..80 lux -> LOW_LIGHT   > 3000 lux -> DAYLIGHT_STANDBY   spread > 50 lux -> BLINKING/UNSTABLE
// The firmware stays the one that measures; this file only explains and, for BLINKING, asks for confirmation.

export const LUX = { BLACKOUT_MAX: 5, LOW_LIGHT_MAX: 80, DAYLIGHT_MIN: 3000, FLICKER_DELTA: 50 };
// Early warning: a lamp still reported as healthy whose light is within NEAR_MARGIN lux above the low-light limit is
// "close to the threshold" and shows WARNING (limit 80 lux + margin 20 = warning from 80 up to 100 lux). Dashboard-only; the firmware is unchanged.
// Kept apart from LUX because LUX mirrors the firmware thresholds exactly.
export const NEAR_MARGIN = 20;

// NOTE: the firmware already confirms flicker itself (spread > 50 lux), so a BLINKING/UNSTABLE report is shown as BLINKING at once.
// blinkingConfirmed() below is kept as a helper but is no longer required before showing BLINKING.
export const BLINK = {
  windowMs: 5 * 60 * 1000, // only reports from the last 5 minutes count (an old flicker must not stick)
  keep: 5, // the last 5 reports are looked at
  confirm: 3, // 3 unstable reports out of those 5, or 3 swings between good light and bad light
};

const LIT_EXPECTED = new Set(['NORMAL_LIT', 'NORMAL', 'LOW_LIGHT', 'TOTAL_BLACKOUT', 'BLINKING/UNSTABLE']); // lamp is supposed to be on
const GOOD = new Set(['NORMAL_LIT', 'NORMAL']);
export const KNOWN_STATUSES = new Set([...LIT_EXPECTED, 'DAYLIGHT_STANDBY', 'STANDBY', 'SENSOR_ERROR']);

// recent = [{ status, at }] oldest first. Returns true only when several reports confirm unstable light.
export const blinkingConfirmed = (recent, now) => {
  const r = (recent || []).filter((x) => now - x.at <= BLINK.windowMs).slice(-BLINK.keep);
  if (r.filter((x) => x.status === 'BLINKING/UNSTABLE').length >= BLINK.confirm) return true;
  // Light jumping between healthy and no-light / abnormal across reports (the node may flag each one differently).
  const lit = r.map((x) => x.status).filter((s) => LIT_EXPECTED.has(s));
  let swings = 0;
  for (let i = 1; i < lit.length; i += 1) if (GOOD.has(lit[i]) !== GOOD.has(lit[i - 1])) swings += 1;
  return swings >= BLINK.confirm;
};

// tone -> which colour family the UI uses. animate = blinking dot.
const mk = (key, label, tone, dashboardStatus, short, long, extra = {}) => ({ key, label, tone, dashboardStatus, short, long, animate: false, lampKnown: true, ...extra });

// l = { status, link ('ONLINE'|'STALE'|'SLEEPING'|'OFFLINE'), recent }. Returns the health object for one lamp.
export function classifyLamp(l) {
  if (!l || l.status === undefined || l.status === null) {
    return mk('NO_DATA', 'NO DATA', 'gray', 'NO DATA', 'No report yet.', 'This lamp has not reported. No light value is shown, and missing data is never treated as 0 lux.', { lampKnown: false });
  }
  if (l.link === 'SLEEPING') {
    // The node is silent because the firmware puts it into deep sleep between lamps-off and the next evening. It wakes and reports by itself.
    return mk('SLEEPING', 'SLEEPING', 'blue', 'ONLINE', 'Sleeping (daytime power saving).', 'The lamp node is in its scheduled deep sleep outside the lighting hours, so it is not reporting. This is normal, not a fault and not offline. It reports again by itself when it wakes up.', { lampKnown: false });
  }
  if (l.link === 'OFFLINE') {
    return mk('OFFLINE', 'OFFLINE', 'amber', 'OFFLINE', 'No recent report from this lamp.', 'The receiver has heard nothing from this lamp’s node for a while, so the lamp condition is unknown. This is a communication problem, not proof the lamp failed, and silence is never counted as 0 lux.', { lampKnown: false });
  }
  const stale = l.link === 'STALE' ? ' The last report is a little late, so this may be slightly out of date.' : '';
  const s = l.status;
  if (GOOD.has(s)) {
    // Healthy report, but the light is only just above the low-light limit: warn early, before it becomes LOW_LIGHT or a fault.
    if (typeof l.lux === 'number' && l.lux > LUX.LOW_LIGHT_MAX && l.lux <= LUX.LOW_LIGHT_MAX + NEAR_MARGIN) {
      return mk('NEAR_LIMIT', 'WARNING', 'amber', 'WARNING', 'Light is close to the low-light limit.', `The lamp is still lit, but its light (${Math.round(l.lux)} lux) is only just above the low-light limit of ${LUX.LOW_LIGHT_MAX} lux. If it keeps dropping it will become LOW LIGHT and then a fault.${stale}`);
    }
    return mk('GOOD', 'CONNECTED / GOOD', 'green', 'ONLINE', 'Operating normally.', `The streetlight is producing light within its expected healthy range.${stale}`);
  }
  if (s === 'LOW_LIGHT') {
    return mk('WARNING', 'WARNING', 'amber', 'WARNING', 'Low light: the streetlight may be dim.', `The lamp is on, but the light is below the expected healthy level (${LUX.BLACKOUT_MAX}–${LUX.LOW_LIGHT_MAX} lux). It may be dim, ageing or have a dirty cover.${stale}`);
  }
  if (s === 'TOTAL_BLACKOUT') {
    return mk('FAULT', 'FAULT', 'red', 'FAULT', 'No light detected.', `The lamp should be on, but the sensor detects almost no light (${LUX.BLACKOUT_MAX} lux or less).${stale}`);
  }
  if (s === 'BLINKING/UNSTABLE') {
    // The node itself measured the light swinging by more than 50 lux, so this is shown as BLINKING straight away.
    return mk('BLINKING', 'BLINKING', 'red', 'FAULT', 'Unstable light output detected.', `The lamp’s light is swinging between bright and dark, so it is flickering.${stale}`, { animate: true });
  }
  if (s === 'DAYLIGHT_STANDBY') return mk('DAYLIGHT', 'DAYLIGHT STANDBY', 'blue', 'ONLINE', 'Daylight: the lamp is not needed.', `It is brighter than any streetlight (over ${LUX.DAYLIGHT_MIN} lux), so the lamp is not judged. This is normal and never a fault.${stale}`);
  if (s === 'STANDBY') return mk('STANDBY', 'STANDBY', 'blue', 'ONLINE', 'Outside the lighting schedule.', `The lamp is not expected to be on right now, so it is not judged.${stale}`);
  if (s === 'SENSOR_ERROR') {
    return mk('SENSOR_ERROR', 'SENSOR ERROR', 'gray', 'WARNING', 'Light sensor not responding.', 'The node is still reporting, but its light sensor (BH1750) gives no valid reading, so the lamp cannot be judged. This does not mean the lamp has failed.', { lampKnown: false });
  }
  return mk('UNKNOWN', 'UNKNOWN', 'amber', 'WARNING', 'Unrecognised status.', `The node reported a status the dashboard does not recognise (“${String(s).slice(0, 24)}”). It is not treated as a confirmed fault.`);
}
