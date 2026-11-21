// Which screens a role may open. Uses the SAME permission table as the server (server/permissions.js); the server is what
// actually enforces it. This only decides what to show.
import { can } from '../server/permissions.js';

// Screens not listed here (dashboard, map, settings, help, manual) are open to every signed-in role.
// BASIC has its own screens (works / history / schedule) and none of the technical ones.
const SCREEN_PERMISSION = {
  users: 'users.manage',
  data: 'data.view',
  monitoring: 'technical.view',
  details: 'technical.view',
  maintenance: 'maintenance.view',
  controls: 'technical.view',
  works: 'basic.dashboard',
  history: 'basic.dashboard',
  schedule: 'basic.dashboard',
};
export const screenAllowed = (screen, role) => {
  if (!role) return false;
  const p = SCREEN_PERMISSION[screen];
  return p ? can(role, p) : true;
};
export const ROLE_LABEL = { ADMIN: 'Administrator', TECHNICIAN: 'Technician', STAFF: 'Staff', BASIC: 'Basic User', DEVELOPER: 'Developer' };
export { can };
