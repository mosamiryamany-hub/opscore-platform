'use strict';
// MIGRATION_APP_ROLE_NOT_LEAST_PRIVILEGED on an absent legacy role.
// Migration 068 deletes opscore_app and records OPSC_LEGACY_APP_ROLE_ABSENT_TREATED_AS_LOCKED.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAppRolePreflight, validateAppRolePostconditions } = require('../scripts/apply-postgres-migrations');

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

test('contradictory absence + escalation still fails closed', () => {
  assert.throws(() => validateAppRolePreflight({ role_exists: false, rolcanlogin: true }, false),
    /MIGRATION_APP_ROLE_NOT_LEAST_PRIVILEGED/);
  assert.throws(() => validateAppRolePreflight({ role_exists: false, rolbypassrls: true }, false),
    /MIGRATION_APP_ROLE_NOT_LEAST_PRIVILEGED/);
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

const lockedPostconditions = {
  app_role_exists: true,
  app_superuser: false,
  app_bypassrls: false,
  app_create_role: false,
  app_create_db: false,
  app_login: false,
  app_inherit: false,
  app_privileged_membership_count: 0,
  app_incoming_membership_count: 0,
  app_neon_superuser_membership_count: 0,
  control_plane_privilege_gap_count: 0
};

test('postconditions accept an absent opscore_app role as the migration 068 locked state', () => {
  assert.equal(validateAppRolePostconditions({
    ...lockedPostconditions,
    app_role_exists: false,
    // These are deliberately fail-closed SQL defaults for an absent row.
    app_superuser: true,
    app_bypassrls: true,
    app_create_role: true,
    app_create_db: true,
    app_login: true,
    app_inherit: true,
    app_privileged_membership_count: 1,
    app_incoming_membership_count: 1
  }), true);
});

test('postconditions accept an existing locked role with at most one inert Neon membership', () => {
  assert.equal(validateAppRolePostconditions({
    ...lockedPostconditions,
    app_neon_superuser_membership_count: 1
  }), true);
});

test('postconditions reject an existing app role with any elevated attribute or unsafe membership', () => {
  const invalid = [
    { app_superuser: true },
    { app_bypassrls: true },
    { app_create_role: true },
    { app_create_db: true },
    { app_login: true },
    { app_inherit: true },
    { app_privileged_membership_count: 1 },
    { app_incoming_membership_count: 1 },
    { app_neon_superuser_membership_count: 2 },
    { control_plane_privilege_gap_count: 1 }
  ];
  for (const override of invalid) {
    assert.equal(validateAppRolePostconditions({ ...lockedPostconditions, ...override }), false,
      JSON.stringify(override));
  }
});

test('postconditions fail closed when the role-presence or control-plane evidence is missing', () => {
  assert.equal(validateAppRolePostconditions({ ...lockedPostconditions, app_role_exists: undefined }), false);
  assert.equal(validateAppRolePostconditions({ ...lockedPostconditions, control_plane_privilege_gap_count: undefined }), false);
});
