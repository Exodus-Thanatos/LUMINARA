// CSV export for the Data screen. Pure functions (no React) except downloadCsv, which only touches the browser's download API.

// One CSV cell. Text that a spreadsheet would run as a formula (starts with = + - @) gets a leading apostrophe so it
// opens as plain text; real numbers are written as they are.
export const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// columns: [{ label, value: (row) => string | number | null }]
export const toCsv = (columns, rows) =>
  [columns.map((c) => csvCell(c.label)).join(','), ...rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(','))].join('\r\n');

export const isoOrBlank = (ms) => (typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : '');

export const csvFileName = (what, now = Date.now()) => `luminara-${what}-${new Date(now).toISOString().slice(0, 10)}.csv`;

// The BOM makes Excel read the file as UTF-8.
export const downloadCsv = (fileName, text) => {
  const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
