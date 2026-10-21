import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css'; // only defines .leaflet-* classes; does not affect other pages
import { Search } from 'lucide-react';
import { BARANGAY_CENTER, SAMPLE_LAMPS } from './streetlightMapData.js';

/* ==========================================================================
   STREETLIGHT MAP PAGE
   Shared UI (Page, Header, Card, Pill) and the device inventory are passed in
   from App.jsx, so this page reuses the existing look and the existing
   device data instead of duplicating either.
   ========================================================================== */

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const STORAGE_LAMPS = 'luminara.map.lamps.v1';
const STORAGE_SAMPLE = 'luminara.map.showSample.v1';
const MAX_DISTANCE_KM = 3; // reject coordinates farther than this from Barangay 6

// RED = no device. FAULT is a different SHAPE (diamond with "!") so it can never be mistaken for it.
const STATUS = {
  NO_DEVICE: { label: 'No Device', color: '#e53935' },
  ACTIVE: { label: 'Active', color: '#27a85a' },
  OFFLINE: { label: 'Offline', color: '#f57c00' },
  WARNING: { label: 'Warning', color: '#f2c200' },
  FAULT: { label: 'Fault', color: '#b3261e' },
};

/* ---------- helpers ---------- */

const toNum = (v) => (typeof v === 'number' ? v : v == null || String(v).trim() === '' ? NaN : Number(v));
const round6 = (n) => Number(n.toFixed(6));

const distanceKm = (aLat, aLng, bLat, bLng) => {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

// Returns { lat, lng } when valid, or { error } with a readable reason.
const checkCoords = (latRaw, lngRaw) => {
  const lat = toNum(latRaw);
  const lng = toNum(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: 'Latitude and longitude must both be numbers.' };
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { error: 'Coordinates are out of range (latitude ±90, longitude ±180).' };
  const km = distanceKm(BARANGAY_CENTER.lat, BARANGAY_CENTER.lng, lat, lng);
  if (km > MAX_DISTANCE_KM) {
    return { error: `That point is ${km.toFixed(1)} km from Barangay 6. Check the values (latitude first, then longitude).` };
  }
  return { lat, lng };
};
const hasCoords = (l) => !checkCoords(l.latitude, l.longitude).error;

/* Device installation and device communication are tracked separately.
   Status always comes from the existing inventory (deviceById). */
const deriveLamp = (lamp, deviceById) => {
  const dev = lamp.deviceId ? deviceById[lamp.deviceId] : undefined;
  const location = lamp.streetName || (dev && dev.loc) || 'Location not recorded';
  if (!lamp.deviceId) return { key: 'NO_DEVICE', installed: false, location, comm: null, op: null, last: null };
  // Device is registered but absent from the monitoring list: it IS installed, we just have no telemetry.
  if (!dev) return { key: 'OFFLINE', installed: true, location, comm: 'No telemetry received', op: 'Unknown', last: null };
  switch (dev.status) {
    case 'ONLINE':
      return { key: 'ACTIVE', installed: true, location, comm: 'Online', op: 'Normal', last: dev.time };
    case 'FAULT': // matches the Streetlight Details screen: fault + signal offline
      return { key: 'FAULT', installed: true, location, comm: 'Offline', op: 'Fault', last: dev.time };
    case 'WARNING':
      return { key: 'WARNING', installed: true, location, comm: 'Online', op: 'Warning', last: dev.time };
    default: // OFFLINE
      return { key: 'OFFLINE', installed: true, location, comm: 'Offline', op: 'Unknown (no telemetry)', last: dev.time };
  }
};

const loadLamps = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_LAMPS));
    return Array.isArray(parsed) ? parsed : SAMPLE_LAMPS;
  } catch {
    return SAMPLE_LAMPS;
  }
};
const loadShowSample = () => {
  try {
    return localStorage.getItem(STORAGE_SAMPLE) !== 'false';
  } catch {
    return true;
  }
};

/* ---------- CSV import ---------- */

const parseCsv = (raw) => {
  const text = raw.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = '';
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else cell += ch;
  }
  endRow();
  return rows;
};

const HEADER_ALIASES = {
  id: ['streetlightid', 'id', 'lampid'],
  street: ['streetname', 'location', 'street'],
  lat: ['latitude', 'lat'],
  lng: ['longitude', 'lng', 'lon', 'long'],
  device: ['deviceid', 'device'],
};

const importCsv = (text, lamps) => {
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: 'The file has no data rows.' };
  const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = {};
  Object.entries(HEADER_ALIASES).forEach(([k, names]) => {
    col[k] = header.findIndex((h) => names.includes(h));
  });
  if (col.id < 0 || col.lat < 0 || col.lng < 0) {
    return { error: 'Missing columns. Required: streetlightId, latitude, longitude (optional: streetName, deviceId).' };
  }
  const next = lamps.map((l) => ({ ...l }));
  let added = 0;
  let updated = 0;
  const skipped = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const id = (r[col.id] || '').trim();
    if (!id) { skipped.push(`line ${line}: no streetlightId`); return; }
    const res = checkCoords(r[col.lat], r[col.lng]);
    if (res.error) { skipped.push(`line ${line} (${id}): ${res.error}`); return; }
    const street = col.street >= 0 ? (r[col.street] || '').trim() : '';
    const device = col.device >= 0 ? (r[col.device] || '').trim() : '';
    const existing = next.find((l) => l.streetlightId === id);
    if (existing) {
      existing.latitude = round6(res.lat);
      existing.longitude = round6(res.lng);
      existing.coordSource = 'entered';
      if (street) existing.streetName = street;
      if (device) existing.deviceId = device;
      updated++;
    } else {
      next.push({
        streetlightId: id,
        streetName: street || null,
        latitude: round6(res.lat),
        longitude: round6(res.lng),
        deviceId: device || null,
        coordSource: 'entered',
      });
      added++;
    }
  });
  return { lamps: next, added, updated, skipped };
};

/* ---------- marker graphics ---------- */

const markerHtml = (key, selected, sample) => {
  const c = STATUS[key].color;
  const ring = selected ? '0 0 0 4px rgba(19,34,59,.6)' : '0 0 0 1px rgba(0,0,0,.35)';
  const outline = sample ? 'outline:2px dashed #6b7a90;outline-offset:3px;' : '';
  if (key === 'FAULT') {
    return `<div style="box-sizing:border-box;width:30px;height:30px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:${ring};${outline}"><svg width="24" height="24" viewBox="0 0 26 26"><polygon points="13,1 25,13 13,25 1,13" fill="${c}"/><text x="13" y="18" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" font-family="sans-serif">!</text></svg></div>`;
  }
  return `<div style="box-sizing:border-box;width:22px;height:22px;border-radius:50%;background:${c};border:3px solid #fff;box-shadow:${ring};${outline}"></div>`;
};

const iconFor = (key, selected, sample) => {
  const size = key === 'FAULT' ? 30 : 22;
  return L.divIcon({
    html: markerHtml(key, selected, sample),
    className: 'lmp-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const LegendMark = ({ k }) =>
  k === 'FAULT' ? (
    <svg width="16" height="16" viewBox="0 0 26 26" aria-hidden="true">
      <polygon points="13,1 25,13 13,25 1,13" fill={STATUS.FAULT.color} />
      <text x="13" y="18" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">!</text>
    </svg>
  ) : (
    <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ background: STATUS[k].color }}></span>
  );

/* ==========================================================================
   COMPONENT
   ========================================================================== */

const StreetlightMap = ({ Page, Header, Card, Pill, devices, detailsDeviceIds = [], onOpenDetails }) => {
  const deviceById = useMemo(() => Object.fromEntries(devices.map((d) => [d.id, d])), [devices]);

  const [lamps, setLamps] = useState(loadLamps);
  const [showSample, setShowSample] = useState(loadShowSample);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [streetFilter, setStreetFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState(null);
  const [placingId, setPlacingId] = useState(null);
  const [latStr, setLatStr] = useState('');
  const [lngStr, setLngStr] = useState('');
  const [formError, setFormError] = useState('');
  const [importMsg, setImportMsg] = useState(null);

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const clickRef = useRef(() => {});
  const fileRef = useRef(null);

  /* ----- persistence (browser only; replace with your backend later) ----- */
  useEffect(() => {
    try { localStorage.setItem(STORAGE_LAMPS, JSON.stringify(lamps)); } catch { /* storage unavailable */ }
  }, [lamps]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_SAMPLE, String(showSample)); } catch { /* storage unavailable */ }
  }, [showSample]);

  /* ----- derived data: every count below comes from this one list ----- */
  const records = useMemo(
    () =>
      lamps.map((l) => ({
        ...l,
        ...deriveLamp(l, deviceById),
        placed: hasCoords(l) && (showSample || l.coordSource !== 'sample'),
      })),
    [lamps, showSample, deviceById]
  );
  const mapped = useMemo(() => records.filter((r) => r.placed), [records]);
  const unplaced = useMemo(() => records.filter((r) => !r.placed), [records]);

  const countKey = (k) => mapped.filter((r) => r.key === k).length;
  const counts = {
    total: mapped.length,
    installed: mapped.filter((r) => r.installed).length,
    active: countKey('ACTIVE'),
    none: countKey('NO_DEVICE'),
    problem: countKey('OFFLINE') + countKey('FAULT'),
  };
  const hasWarning = countKey('WARNING') > 0;
  const sampleShown = mapped.filter((r) => r.coordSource === 'sample').length;

  const streetOf = (r) => r.location.split(' • ')[0];
  const streets = useMemo(
    () => [...new Set(records.map(streetOf).filter((s) => s !== 'Location not recorded'))].sort(),
    [records]
  );

  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      mapped.filter(
        (r) =>
          (statusFilter === 'ALL' ||
            (statusFilter === 'INSTALLED' ? r.installed : r.key === statusFilter)) &&
          (streetFilter === 'ALL' || streetOf(r) === streetFilter) &&
          (q === '' ||
            r.streetlightId.toLowerCase().includes(q) ||
            r.location.toLowerCase().includes(q) ||
            (r.deviceId || '').toLowerCase().includes(q))
      ),
    [mapped, statusFilter, streetFilter, q]
  );

  const selected = records.find((r) => r.streetlightId === selectedId) || null;

  /* ----- map setup (runs once) ----- */
  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: [BARANGAY_CENTER.lat, BARANGAY_CENTER.lng],
      zoom: BARANGAY_CENTER.zoom,
      zoomControl: true,
    });
    L.tileLayer(OSM_URL, { maxZoom: 19, attribution: OSM_ATTR }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on('click', (e) => clickRef.current(e.latlng));
    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 0);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  /* ----- click-on-map placement ----- */
  clickRef.current = (latlng) => {
    if (!placingId) return;
    const res = checkCoords(latlng.lat, latlng.lng);
    if (res.error) {
      setFormError(res.error);
      return;
    }
    applyCoords(placingId, res.lat, res.lng);
    setPlacingId(null);
  };

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getContainer().style.cursor = placingId ? 'crosshair' : '';
  }, [placingId]);

  /* ----- markers: redrawn when data, filters or selection change ----- */
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    visible.forEach((r) => {
      const marker = L.marker([Number(r.latitude), Number(r.longitude)], {
        icon: iconFor(r.key, r.streetlightId === selectedId, r.coordSource === 'sample'),
        title: `${r.streetlightId} — ${STATUS[r.key].label}`,
        keyboard: true,
        riseOnHover: true,
      });
      marker.bindTooltip(r.streetlightId, { direction: 'top', offset: [0, -12] });
      marker.on('click', () => {
        setSelectedId(r.streetlightId);
        setFormError('');
      });
      marker.addTo(layer);
    });
  }, [visible, selectedId]);

  /* ----- view controls ----- */
  const fitTo = (list) => {
    const map = mapRef.current;
    if (!map) return;
    if (list.length === 0) return;
    const bounds = L.latLngBounds(list.map((r) => [Number(r.latitude), Number(r.longitude)]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 18 });
  };
  const resetView = () => {
    const map = mapRef.current;
    if (map) map.setView([BARANGAY_CENTER.lat, BARANGAY_CENTER.lng], BARANGAY_CENTER.zoom);
  };
  const showAll = () => {
    setSearch('');
    setStatusFilter('ALL');
    setStreetFilter('ALL');
    fitTo(mapped);
  };

  // when search/filters change, zoom to what is now visible
  const filterKey = `${search}|${statusFilter}|${streetFilter}`;
  const prevFilterKey = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKey.current === filterKey) return;
    prevFilterKey.current = filterKey;
    fitTo(visible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  /* ----- coordinate editing ----- */
  const applyCoords = (id, lat, lng) => {
    setLamps((prev) =>
      prev.map((l) =>
        l.streetlightId === id
          ? { ...l, latitude: round6(lat), longitude: round6(lng), coordSource: 'entered' }
          : l
      )
    );
    setFormError('');
  };

  // keep the inputs in sync with the selected lamp
  useEffect(() => {
    setLatStr(selected && selected.latitude != null ? String(selected.latitude) : '');
    setLngStr(selected && selected.longitude != null ? String(selected.longitude) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected && selected.latitude, selected && selected.longitude]);

  const saveCoords = () => {
    if (!selected) return;
    const res = checkCoords(latStr, lngStr);
    if (res.error) {
      setFormError(res.error);
      return;
    }
    applyCoords(selected.streetlightId, res.lat, res.lng);
  };

  const startPlacing = () => {
    if (!selected) return;
    setFormError('');
    setPlacingId(selected.streetlightId);
  };

  /* ----- CSV import / template / reset ----- */
  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importCsv(String(reader.result), lamps);
      if (result.error) {
        setImportMsg({ ok: false, text: result.error });
      } else {
        setLamps(result.lamps);
        const skipNote = result.skipped.length
          ? ` Skipped ${result.skipped.length}: ${result.skipped.slice(0, 3).join('; ')}${result.skipped.length > 3 ? '…' : ''}`
          : '';
        setImportMsg({ ok: result.skipped.length === 0, text: `Imported ${result.added} new and updated ${result.updated} streetlights.${skipNote}` });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const downloadTemplate = () => {
    const blob = new Blob(['streetlightId,streetName,latitude,longitude,deviceId\n'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'streetlight-locations-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetData = () => {
    if (!window.confirm('Reset the map to the built-in sample data? Coordinates you entered or imported will be lost.')) return;
    setLamps(SAMPLE_LAMPS);
    setShowSample(true);
    setSelectedId(null);
    setPlacingId(null);
    setImportMsg(null);
  };

  /* ----- small UI pieces ----- */
  const selectCls = 'h-10 px-3 bg-[#f3f6f9] border border-[#e1e7ee] rounded-md text-sm text-[#14233c] focus:outline-none';
  const outlineBtn = 'h-10 px-4 bg-white border border-[#e1e7ee] rounded-md text-sm font-semibold text-[#14233c] hover:bg-gray-50';
  const primaryBtn = 'h-10 px-4 bg-[#27a85a] text-white rounded-md text-sm font-semibold hover:bg-[#1f9a52]';
  const inputCls = 'w-full h-10 px-3 bg-[#f3f6f9] border border-[#e1e7ee] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#27a85a]';

  const summary = [
    { label: 'Mapped Streetlights', value: counts.total, color: 'text-[#14233c]' },
    { label: 'Devices Installed', value: counts.installed, color: 'text-[#14233c]' },
    { label: 'Active Devices', value: counts.active, color: 'text-[#27a85a]' },
    { label: 'No Device', value: counts.none, color: 'text-[#e53935]' },
    { label: 'Offline / Fault', value: counts.problem, color: 'text-[#f57c00]' },
  ];

  const statusBadge = (k) => (
    <span
      className="inline-flex items-center px-3 py-1 rounded-md text-xs font-bold uppercase"
      style={{ background: `${STATUS[k].color}22`, color: STATUS[k].color }}
    >
      {STATUS[k].label}
    </span>
  );

  const Row = ({ label, children }) => (
    <div className="flex justify-between items-start gap-4 text-sm">
      <span className="text-[#6b7a90] shrink-0">{label}</span>
      <span className="font-semibold text-right">{children}</span>
    </div>
  );

  const legendKeys = ['NO_DEVICE', 'ACTIVE', 'OFFLINE', ...(hasWarning ? ['WARNING'] : []), 'FAULT'];
  const legendText = {
    NO_DEVICE: 'No Device',
    ACTIVE: 'Active',
    OFFLINE: 'Offline',
    WARNING: 'Warning',
    FAULT: 'Fault (device reports fault)',
  };

  return (
    <Page>
      <Header
        title="Streetlight Map"
        subtitle="Geographical deployment and monitoring status of streetlights in Barangay 6, Carmona, Cavite."
        actions={
          sampleShown > 0 ? (
            <Pill className="px-5 py-2.5 bg-[#fff3d6] text-[#c98a0a]">Sample data</Pill>
          ) : null
        }
      />

      {/* summary — all numbers come from the mapped dataset */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-5">
        {summary.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="text-xs font-bold text-[#5b6b82] uppercase">{s.label}</div>
            <div className={`text-3xl font-bold mt-2 ${s.color}`}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* controls */}
      <Card className="px-5 py-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#8895a7] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID, location..."
              aria-label="Search streetlights"
              className={`${inputCls} pl-9`}
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${selectCls} w-44`} aria-label="Filter by deployment status">
            <option value="ALL">All statuses</option>
            <option value="NO_DEVICE">No device</option>
            <option value="INSTALLED">Device installed</option>
            <option value="ACTIVE">Active</option>
            <option value="OFFLINE">Offline</option>
            <option value="FAULT">Fault</option>
            {hasWarning && <option value="WARNING">Warning</option>}
          </select>
          <select value={streetFilter} onChange={(e) => setStreetFilter(e.target.value)} className={`${selectCls} w-44`} aria-label="Filter by street">
            <option value="ALL">All streets</option>
            {streets.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="flex gap-3 sm:ml-auto">
            <button onClick={showAll} className={primaryBtn}>Show all</button>
            <button onClick={resetView} className={outlineBtn}>Reset view</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-[#e6ebf1]">
          <label className="flex items-center gap-2 text-sm text-[#14233c] cursor-pointer">
            <input type="checkbox" checked={showSample} onChange={(e) => setShowSample(e.target.checked)} className="w-4 h-4 accent-[#27a85a]" />
            Show sample locations
          </label>
          <span className="text-xs text-[#6b7a90] hidden md:inline">Field-survey data:</span>
          <button onClick={() => fileRef.current && fileRef.current.click()} className={outlineBtn}>Import CSV</button>
          <button onClick={downloadTemplate} className={outlineBtn}>CSV template</button>
          <button onClick={resetData} className="text-xs font-semibold text-[#6b7a90] hover:text-[#e04040] underline ml-auto">Reset map data</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" aria-label="Import streetlight locations CSV" />
        </div>
        {importMsg && (
          <p className={`text-xs mt-3 ${importMsg.ok ? 'text-[#1f9a52]' : 'text-[#e04040]'}`} role="status">{importMsg.text}</p>
        )}
      </Card>

      {sampleShown > 0 && (
        <div className="mb-5 px-5 py-3 rounded-xl bg-[#fff8e6] border border-[#f0d58a] text-sm text-[#7a5a00]" role="note">
          <strong>Sample data:</strong> {sampleShown} marker{sampleShown === 1 ? '' : 's'} with a dashed ring use placeholder coordinates for demonstration. They are
          <strong> not</strong> verified lamp locations. Replace them with surveyed coordinates (place on map, type them in, or import a CSV).
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
        {/* map */}
        <Card big className="p-3">
          <div className="relative isolate overflow-hidden rounded-[1.5rem] h-[520px] md:h-[620px]">
            <div ref={containerRef} className="absolute inset-0" role="region" aria-label="Map of streetlights in Barangay 6, Carmona, Cavite" />

            {placingId && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-[#13223b] text-white text-sm rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg">
                <span>Click the map to set the location of <strong>{placingId}</strong></span>
                <button onClick={() => setPlacingId(null)} className="text-xs font-bold underline">Cancel</button>
              </div>
            )}

            {mapped.length === 0 && (
              <div className="absolute inset-0 z-[900] flex items-center justify-center pointer-events-none">
                <div className="bg-white/95 rounded-xl border border-[#e6ebf1] px-6 py-4 text-sm text-[#6b7a90] text-center max-w-xs">
                  No streetlight locations have been entered yet. Turn on sample locations, import a CSV, or place lamps from the list.
                </div>
              </div>
            )}

            <div className="absolute left-3 bottom-8 z-[1000] bg-white/95 rounded-xl border border-[#e6ebf1] p-3 text-xs shadow">
              <div className="font-bold text-[#14233c] mb-2">Legend</div>
              <ul className="space-y-1.5">
                {legendKeys.map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <LegendMark k={k} />
                    <span>{legendText[k]}</span>
                    <span className="text-[#6b7a90] ml-auto pl-3">{countKey(k)}</span>
                  </li>
                ))}
                <li className="flex items-center gap-2 pt-1.5 mt-1.5 border-t border-[#e6ebf1]">
                  <span className="inline-block w-3.5 h-3.5 rounded-full bg-[#cfd6df]" style={{ outline: '2px dashed #6b7a90', outlineOffset: '2px' }}></span>
                  <span>Sample location (not verified)</span>
                </li>
              </ul>
            </div>
          </div>
          <p className="px-2 pt-3 text-xs text-[#6b7a90]">
            Showing {visible.length} of {mapped.length} mapped streetlights
          </p>
        </Card>

        {/* side panels */}
        <div className="space-y-6">
          <Card big className="p-6">
            <h3 className="font-bold text-lg mb-4">Streetlight Details</h3>
            {!selected ? (
              <p className="text-sm text-[#6b7a90]">Click a marker on the map, or a lamp in the list below, to inspect it.</p>
            ) : (
              <div className="space-y-3">
                <Row label="Streetlight ID">{selected.streetlightId}</Row>
                <Row label="Location">{selected.location}</Row>
                <Row label="Coordinates">
                  {hasCoords(selected) ? `${selected.latitude}, ${selected.longitude}` : 'Not set'}
                </Row>
                <Row label="Coordinate source">
                  {selected.coordSource === 'entered' ? (
                    <span className="text-[#1f9a52]">Entered by administrator</span>
                  ) : selected.coordSource === 'sample' ? (
                    <span className="text-[#c98a0a]">Sample (not verified)</span>
                  ) : (
                    <span className="text-[#6b7a90]">Not collected</span>
                  )}
                </Row>
                <div className="border-t border-[#e6ebf1] pt-3 space-y-3">
                  <Row label="Marker">{statusBadge(selected.key)}</Row>
                  {selected.installed ? (
                    <>
                      <Row label="Device Installation">Installed ({selected.deviceId})</Row>
                      <Row label="Communication">{selected.comm}</Row>
                      <Row label="Operational Status">{selected.op}</Row>
                      <Row label="Last communication">{selected.last || '—'}</Row>
                    </>
                  ) : (
                    <Row label="Device Status">No Device Installed</Row>
                  )}
                </div>

                {selected.installed &&
                  (detailsDeviceIds.includes(selected.deviceId) ? (
                    <button onClick={onOpenDetails} className={`${primaryBtn} w-full mt-2`}>Open Streetlight Details</button>
                  ) : (
                    <p className="text-xs text-[#6b7a90] pt-1">A detailed readings page for {selected.deviceId} is not available yet.</p>
                  ))}

                <div className="border-t border-[#e6ebf1] pt-4">
                  <div className="text-xs font-bold text-[#6b7a90] uppercase mb-2">Set location</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={latStr} onChange={(e) => setLatStr(e.target.value)} placeholder="Latitude" aria-label="Latitude" className={inputCls} />
                    <input value={lngStr} onChange={(e) => setLngStr(e.target.value)} placeholder="Longitude" aria-label="Longitude" className={inputCls} />
                  </div>
                  {formError && <p className="text-xs text-[#e04040] mt-2" role="alert">{formError}</p>}
                  <div className="flex gap-2 mt-3">
                    <button onClick={saveCoords} className={`${primaryBtn} flex-1`}>Save</button>
                    <button onClick={startPlacing} className={`${outlineBtn} flex-1`}>Place on map</button>
                  </div>
                  <p className="text-[11px] text-[#6b7a90] mt-2">Saving marks the location as entered by an administrator.</p>
                </div>
              </div>
            )}
          </Card>

          <Card big className="p-6">
            <h3 className="font-bold text-lg mb-1">Needs location ({unplaced.length})</h3>
            <p className="text-xs text-[#6b7a90] mb-3">Registered streetlights without usable coordinates. They are not shown on the map.</p>
            {unplaced.length === 0 ? (
              <p className="text-sm text-[#6b7a90]">Every registered streetlight has a location.</p>
            ) : (
              <ul className="max-h-56 overflow-y-auto space-y-2">
                {unplaced.map((r) => (
                  <li key={r.streetlightId}>
                    <button
                      onClick={() => {
                        setSelectedId(r.streetlightId);
                        setFormError('');
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm flex justify-between items-center hover:bg-[#f3f6f9] ${
                        r.streetlightId === selectedId ? 'border-[#27a85a] bg-[#f3fbf6]' : 'border-[#e6ebf1]'
                      }`}
                    >
                      <span>
                        <span className="font-bold">{r.streetlightId}</span>
                        <span className="block text-xs text-[#6b7a90]">{r.location}</span>
                      </span>
                      <span className="text-[11px] font-bold" style={{ color: STATUS[r.key].color }}>
                        {r.installed ? 'Device' : 'No device'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
};

export default StreetlightMap;
