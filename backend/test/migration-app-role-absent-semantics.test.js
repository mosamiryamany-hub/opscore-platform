'use strict';
// MIGRATION_APP_ROLE_NOT_LEAST_PRIVILEGED on an absent legacy role.
// Migration 068 deletes opscore_app and records OPSC_LEGACY_APP_ROLE_ABSENT_TREATED_AS_LOCKED.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAppRolePreflight } = require('../scripts/apply-postgres-migrations');

const locked = {
  role_exists: true, rolsuper: false, rolbypassrls: false, rolcreaterole: false,
  rolcreatedb: false, rolcanlogin: false, rolinherit: false,
  active_sessions: 0, owned_objects: 0, incoming_memberships: 0, memberships: []
};

test('absent legacy role passes the least-privilege preflight (068 semantics)', () => {
  assert.deepEqual(validateAppRolePreflight({ role_exists: false }, false), {
    status: 'PASS_WITH_ABSENT_LEGACY_ROLE', repairPending: false, roleExists: false,
    note: 'OPSC_LEGACY_APP_ROLE_ABSENT_TREATED_AS_LOCKED'
  });
});

test('absent legacy role is not repaired or recreated', () => {
  assert.notStrictEqual(validateAppRolePreflight({ role_exists: false }, true).status,
    'PASS_WITH_ABSENT_LEGACY_ROLE');
});

test('fully locked role passes', () => {
  assert.deepEqual(validateAppRolePreflight(locked, false),
    { status: 'PASS', repairPending: false, roleExists: true });
});

test('locked role with inert neon_superuser residual passes with documented residual', () => {
  assert.equal(validateAppRolePreflight({ ...locked, memberships: ['neon_superuser'] }, false).status,
    'PASS_WITH_ADMIN_RESIDUAL');
});

test('escalated role is rejected regardless of presence', () => {
  for (const flag of ['rolsuper', 'rolbypassrls', 'rolcreaterole', 'rolcreatedb', 'rolcanlogin', 'rolinherit']) {
    assert.throws(() => validateAppRolePreflight({ ...locked, [flag]: true }, false),
      /MIGRATION_APP_ROLE_NOT_LEAST_PRIVILEGED/, flag);
  }
});

test('role with incoming memberships is rejected', () => {
  assert.throws(() => validateAppRolePreflight({ ...locked, incoming_memberships: 1 }, false),
    /MIGRATION_APP_ROLE_NOT_LEAST_PRIVILEGED/);
});
