const WRITE_ROLES = new Set(['owner','admin','manager','member']);
const ADMIN_ROLES = new Set(['owner','admin']);
function can(role, action) {
  if (action === 'read') return true;
  if (action === 'write') return WRITE_ROLES.has(role);
  if (action === 'admin') return ADMIN_ROLES.has(role);
  return false;
}
function requireRole(role, action) { if (!can(role, action)) throw new Error('FORBIDDEN'); }
module.exports = { can, requireRole };
