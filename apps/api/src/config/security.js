const OPERATIVE_ROLES = ['ADMIN', 'CAJERO'];
const OPERATIVE_ROLE_SET = new Set(OPERATIVE_ROLES);

function isOperativeRole(roleName) {
  return typeof roleName === 'string' && OPERATIVE_ROLE_SET.has(roleName);
}

module.exports = {
  OPERATIVE_ROLES,
  isOperativeRole
};
