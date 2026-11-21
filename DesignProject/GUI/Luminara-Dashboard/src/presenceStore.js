// "On duty today" switches for technicians. PROTOTYPE, unchanged in behaviour: kept in THIS browser only, because
// attendance tracking is a separate future feature. Only the on-duty flag lives here; the technicians themselves
// (names, roles, ids) now come from the user accounts in the database.
export const PRESENCE_KEY = 'luminara.presence.v1';

export const loadPresence = (storage = globalThis.localStorage) => {
  try {
    const v = JSON.parse(storage.getItem(PRESENCE_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
};

export const savePresence = (map, storage = globalThis.localStorage) => {
  try {
    storage.setItem(PRESENCE_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
};

// Server technicians + local on-duty flags -> the user objects technicianStore.js / TechnicianUI.jsx already understand.
export const technicianUsers = (technicians, presence) =>
  technicians.map((t) => ({
    id: String(t.id),
    name: t.fullName,
    role: 'TECHNICIAN',
    presentOn: presence[t.id]?.presentOn ?? null,
    presenceUpdatedAt: presence[t.id]?.presenceUpdatedAt ?? null,
  }));

export const presenceFromUsers = (users) => Object.fromEntries(users.filter((u) => u.presentOn).map((u) => [u.id, { presentOn: u.presentOn, presenceUpdatedAt: u.presenceUpdatedAt }]));
