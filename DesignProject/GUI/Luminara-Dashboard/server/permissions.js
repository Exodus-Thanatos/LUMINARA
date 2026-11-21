// Who may do what. ONE table, used by the backend to enforce access and imported by the React app only to
// decide which buttons and pages to show. Hiding something in the UI is never the protection: the server
// checks this table on every request.
export const ROLES = ['ADMIN', 'TECHNICIAN', 'STAFF', 'BASIC', 'DEVELOPER'];

export const PERMISSIONS = {
  'dashboard.view': ['ADMIN', 'TECHNICIAN', 'STAFF', 'BASIC', 'DEVELOPER'], // live lamp status and the map (BASIC sees the simplified dashboard)
  'technical.view': ['ADMIN', 'TECHNICIAN', 'STAFF', 'DEVELOPER'], // PZEM power readings, the Streetlights list with raw sensor values, the lighting-controls page
  'controls.operate': ['ADMIN', 'TECHNICIAN'], // manual lights on/off (POST /api/control) and node sleep control (POST /api/sleep)
  'maintenance.view': ['ADMIN', 'TECHNICIAN', 'STAFF'], // TECHNICIAN sees only tickets assigned to them
  'maintenance.create': ['ADMIN'],
  'maintenance.edit': ['ADMIN'], // all fields, assign technicians
  'maintenance.viewAssigned': ['BASIC'], // BASIC: read-only list of the tickets assigned to them (no edits)
  'basic.dashboard': ['BASIC'], // the simplified dashboard screens (Assigned Works, History, Schedule)
  'maintenance.updateOwn': ['TECHNICIAN'], // status + resolution note of a ticket assigned to them
  'maintenance.archive': ['ADMIN'],
  'maintenance.viewArchive': ['ADMIN'],
  'maintenance.restore': ['ADMIN'],
  'maintenance.import': ['ADMIN'],
  'users.manage': ['ADMIN'],
  'technicians.list': ['ADMIN', 'TECHNICIAN', 'STAFF'], // names only, to show who a ticket is assigned to
  'settings.admin': ['ADMIN'],
  'history.view': ['ADMIN', 'TECHNICIAN', 'STAFF', 'BASIC', 'DEVELOPER'], // permanent streetlight history (status changes, maintenance, schedule edits)
  'schedule.view': ['ADMIN', 'TECHNICIAN', 'STAFF', 'BASIC', 'DEVELOPER'], // read-only ON/OFF schedule
  'schedule.edit': ['ADMIN'], // change the ON/OFF times
  // Phase 5 Step 4. DEVELOPER is read-only technical access: it sees what STAFF sees plus nothing that changes anything.
  // It cannot operate lights, edit the schedule, touch tickets or manage users. Only an ADMIN issues or revokes registration keys.
  'developers.invite': ['ADMIN'],
  // Read-only Data screen: row counts and the saved tickets / events / schedule as the database holds them. The Users tab
  // inside it still needs users.manage (ADMIN), so a DEVELOPER never sees the account list.
  'data.view': ['ADMIN', 'DEVELOPER'],
};

export const can = (role, permission) => !!PERMISSIONS[permission]?.includes(role);
