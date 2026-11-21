// 24-hour "HH:MM" -> "06:00 PM" for the schedule card. Pure function.
export const fmt12 = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return '—';
  const h = Number(m[1]);
  return `${String(h % 12 || 12).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};
