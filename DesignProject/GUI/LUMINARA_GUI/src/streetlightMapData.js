/* ==========================================================================
   STREETLIGHT MAP — DATA LAYER
   --------------------------------------------------------------------------
   This file describes PHYSICAL streetlights (where a pole is). It does NOT
   store device status. A lamp points to a monitoring device by `deviceId`;
   status/voltage/last-update always come from the existing DEVICES list in
   App.jsx, so there is one source of truth for device state.

   A lamp with `deviceId: null` is a known physical streetlight that has no
   LUMEN monitoring device installed (shown as a RED dot on the map).

   ⚠ SAMPLE DATA — NOT VERIFIED
   The coordinates below are PLACEHOLDERS laid out near the Barangay 6 center
   so the map can be demonstrated. They are NOT surveyed lamp positions.
   Replace them by (a) clicking "Place on map" in the app, (b) typing
   latitude/longitude, or (c) importing a CSV of field-survey coordinates.
   Records you enter or import are saved as coordSource: 'entered'.
   ========================================================================== */

// Approximate center of Barangay 6 (formerly Poblacion), Carmona, Cavite.
// Source: PhilAtlas — https://www.philatlas.com/luzon/r04a/cavite/carmona/barangay-6.html
// This is a map-centering reference only, not a lamp location or a boundary.
export const BARANGAY_CENTER = { lat: 14.3146, lng: 121.0584, zoom: 17 };

const r6 = (n) => Number(n.toFixed(6));

// Straight sample "streets" used only to lay out placeholder points.
// They do not follow the real road geometry.
const SAMPLE_LINES = {
  'Main Road': { start: [14.3146, 121.056], step: [0, 0.0004] },
  'Market Street': { start: [14.3159, 121.0588], step: [-0.00035, 0] },
  'School Road': { start: [14.3134, 121.0568], step: [0, 0.0004] },
  'Rizal Avenue': { start: [14.3159, 121.0598], step: [-0.00035, 0] },
  'Park Entrance': { start: [14.3159, 121.0554], step: [-0.00035, 0] },
  'Barangay Hall': { start: [14.3152, 121.057], step: [0, 0.0003] },
};

// [streetlightId, deviceId | null, sample street, position on line | null, streetName | null]
//  - Lamps that already have a device reuse the existing device ID (L-001…L-024).
//    Their location text comes from the existing inventory, so streetName is null.
//  - "NL-xxx" lamps are known poles with NO monitoring device installed.
//  - position null = lamp is registered but its coordinates have not been collected yet.
const ROWS = [
  ['L-001', 'L-001', 'Main Road', 0, null],
  ['L-002', 'L-002', 'Main Road', 1, null],
  ['L-003', 'L-003', 'Main Road', 2, null],
  ['L-004', 'L-004', 'Main Road', 3, null],
  ['NL-001', null, 'Main Road', 4, 'Main Road • East'],
  ['NL-002', null, 'Main Road', 5, 'Main Road • East'],

  ['L-005', 'L-005', 'Market Street', 0, null],
  ['L-006', 'L-006', 'Market Street', 1, null],
  ['L-007', 'L-007', 'Market Street', 2, null],
  ['L-008', 'L-008', 'Market Street', 3, null],
  ['NL-003', null, 'Market Street', 4, 'Market Street • North'],

  ['L-009', 'L-009', 'School Road', 0, null],
  ['L-010', 'L-010', 'School Road', 1, null],
  ['L-011', 'L-011', 'School Road', 2, null],
  ['L-012', 'L-012', 'School Road', 3, null],
  ['L-013', 'L-013', 'School Road', null, null], // coordinates not collected yet
  ['L-014', 'L-014', 'School Road', 5, null],
  ['NL-004', null, 'School Road', 6, 'School Road • East'],

  ['L-015', 'L-015', 'Rizal Avenue', 0, null],
  ['L-016', 'L-016', 'Rizal Avenue', null, null], // coordinates not collected yet
  ['L-017', 'L-017', 'Rizal Avenue', 2, null],
  ['L-018', 'L-018', 'Rizal Avenue', 3, null],
  ['NL-005', null, 'Rizal Avenue', 4, 'Rizal Avenue • North'],

  ['L-019', 'L-019', 'Park Entrance', 0, null],
  ['L-020', 'L-020', 'Park Entrance', null, null], // coordinates not collected yet
  ['L-021', 'L-021', 'Park Entrance', 2, null],
  ['L-022', 'L-022', 'Park Entrance', 3, null],
  ['NL-006', null, 'Park Entrance', 4, 'Park Entrance • South'],

  ['L-023', 'L-023', 'Barangay Hall', 0, null],
  ['L-024', 'L-024', 'Barangay Hall', 1, null],
  ['NL-007', null, 'Barangay Hall', 2, 'Barangay Hall • Central'],
  ['NL-008', null, 'Barangay Hall', null, 'Barangay Hall • Central'], // coordinates not collected yet
];

export const SAMPLE_LAMPS = ROWS.map(([streetlightId, deviceId, street, pos, streetName]) => {
  const line = SAMPLE_LINES[street];
  const placed = pos !== null;
  return {
    streetlightId,
    streetName,
    latitude: placed ? r6(line.start[0] + line.step[0] * pos) : null,
    longitude: placed ? r6(line.start[1] + line.step[1] * pos) : null,
    deviceId,
    coordSource: placed ? 'sample' : 'none', // 'sample' | 'entered' | 'none'
  };
});
