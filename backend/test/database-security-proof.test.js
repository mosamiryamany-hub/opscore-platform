'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DATABASE_SECURITY_SQL, buildDatabaseSecurityProof: buildDatabaseSecurityProofInternal, readDatabaseSecurityProof } = require('../src/database-security-proof');
const fixedTime = () => new Date('2026-10-22T20:30:00.000Z');
const SAFE_RUNTIME_ROLE = {
  runtime_role_name: 'opscore_runtime',
  runtime_role_login: true,
  runtime_role_superuser: false,
  runtime_role_bypassrls: false,
  runtime_role_createrole: false,
  runtime_role_createdb: false,
  runtime_role_elevated_membership_count: 0
};
function buildDatabaseSecurityProof(row, ...args) {
  return buildDatabaseSecurityProofInternal({ non_postgis_tables_without_force_rls_count: 0, ...SAFE_RUNTIME_ROLE, ...row }, ...args);
}

test('identity tables accessible without RLS remain not certified', () => {
  const proof = buildDatabaseSecurityProof({
    public_table_count:129, rls_enabled_table_count:119, rls_forced_table_count:119,
    tables_without_rls_count:10, non_postgis_tables_without_rls_count:9,
    spatial_ref_sys_runtime_write_access_count:0, migration_ledger_table_count:1,
    migration_ledger_without_force_rls_count:1, migration_ledger_runtime_privileges_count:1,
    identity_tables_without_rls_with_runtime_access_count:5,
    ...SAFE_RUNTIME_ROLE,
    control_plane_table_count:3, control_plane_runtime_privilege_gap_count:0, control_plane_policy_valid_table_count: 3
  }, fixedTime);
  assert.equal(proof.schemaVersion,'opscore.public-database-security-proof.v2');
  assert.equal(proof.status,'NOT_CERTIFIED');
  assert.equal(proof.productionIsolationCertification,'NOT_CERTIFIED');
  assert.equal(proof.publicSchema.nonPostgisTablesWithoutRlsCount,9);
  assert.equal(proof.migrationLedger.status,'REVIEW_REQUIRED');
  assert.equal(proof.identityPlane.criticalTablesWithoutRlsButAccessibleToRuntimeRole,5);
});

test('only read-only spatial_ref_sys may remain outside FORCE RLS and migration ledger must be owner-only', () => {
  const proof = buildDatabaseSecurityProof({
    public_table_count:132, rls_enabled_table_count:131, rls_forced_table_count:131,
    tables_without_rls_count:1, non_postgis_tables_without_rls_count:0,
    spatial_ref_sys_runtime_write_access_count:0, migration_ledger_table_count:1,
    migration_ledger_without_force_rls_count:0, migration_ledger_runtime_privileges_count:0,
    identity_tables_without_rls_with_runtime_access_count:0,
    control_plane_table_count:3, control_plane_runtime_privilege_gap_count:0, control_plane_policy_valid_table_count: 3
  }, fixedTime);
  assert.equal(proof.status,'IDENTITY_PLANE_RLS_ENFORCED');
  assert.equal(proof.productionIsolationCertification,'NOT_CERTIFIED');
  assert.equal(proof.migrationLedger.status,'OWNER_ONLY');
  assert.match(proof.note,/cross-tenant behavioral tests/);
});

test('unprotected non-PostGIS table is rejected even when total RLS gap count is one', () => {
  const proof=buildDatabaseSecurityProof({
    public_table_count:132,rls_enabled_table_count:131,rls_forced_table_count:131,
    tables_without_rls_count:1,non_postgis_tables_without_rls_count:1,
    spatial_ref_sys_runtime_write_access_count:0,migration_ledger_table_count:1,
    migration_ledger_without_force_rls_count:0,migration_ledger_runtime_privileges_count:0,
    identity_tables_without_rls_with_runtime_access_count:0,
    ...SAFE_RUNTIME_ROLE,
    control_plane_table_count:3,control_plane_runtime_privilege_gap_count:0, control_plane_policy_valid_table_count: 3
  },fixedTime);
  assert.equal(proof.status,'REVIEW_REQUIRED');
});

test('an application table with RLS enabled but without FORCE RLS is rejected', () => {
  const proof = buildDatabaseSecurityProof({
    public_table_count: 132,
    rls_enabled_table_count: 132,
    rls_forced_table_count: 130,
    tables_without_rls_count: 0,
    non_postgis_tables_without_rls_count: 0,
    non_postgis_tables_without_force_rls_count: 1,
    spatial_ref_sys_runtime_write_access_count: 0,
    migration_ledger_table_count: 1,
    migration_ledger_without_force_rls_count: 0,
    migration_ledger_runtime_privileges_count: 0,
    identity_tables_without_rls_with_runtime_access_count: 0,
    control_plane_table_count: 3,
    control_plane_runtime_privilege_gap_count: 0,
    control_plane_policy_valid_table_count: 3
  }, fixedTime);
  assert.equal(proof.publicSchema.nonPostgisTablesWithoutForceRlsCount, 1);
  assert.equal(proof.status, 'REVIEW_REQUIRED');
  assert.equal(proof.productionIsolationCertification, 'NOT_CERTIFIED');
});

test('PostGIS write access or application access to migration ledger is rejected', () => {
  const base={public_table_count:132,rls_enabled_table_count:131,rls_forced_table_count:131,tables_without_rls_count:1,non_postgis_tables_without_rls_count:0,spatial_ref_sys_runtime_write_access_count:0,migration_ledger_table_count:1,migration_ledger_without_force_rls_count:0,migration_ledger_runtime_privileges_count:0,identity_tables_without_rls_with_runtime_access_count:0,control_plane_table_count:3,control_plane_runtime_privilege_gap_count:0, control_plane_policy_valid_table_count: 3};
  assert.equal(buildDatabaseSecurityProof({...base,spatial_ref_sys_runtime_write_access_count:1},fixedTime).status,'REVIEW_REQUIRED');
  assert.equal(buildDatabaseSecurityProof({...base,migration_ledger_runtime_privileges_count:1},fixedTime).status,'REVIEW_REQUIRED');
});

test('runtime catalog query is read-only and inspects identity, PostGIS and migration ledger', () => {
  assert.match(DATABASE_SECURITY_SQL,/FROM pg_class c/);
  assert.match(DATABASE_SECURITY_SQL,/'users'/);
  assert.match(DATABASE_SECURITY_SQL,/'password_reset_tokens'/);
  assert.match(DATABASE_SECURITY_SQL,/'spatial_ref_sys'/);
  assert.match(DATABASE_SECURITY_SQL,/'schema_migrations'/);
  assert.match(DATABASE_SECURITY_SQL,/LEFT JOIN pg_policy p/);
  assert.match(DATABASE_SECURITY_SQL,/non_postgis_tables_without_force_rls_count/);
  assert.match(DATABASE_SECURITY_SQL,/runtime_role_bypassrls/);
  assert.match(DATABASE_SECURITY_SQL,/runtime_role_elevated_membership_count/);
  assert.match(DATABASE_SECURITY_SQL,/polpermissive/);
  assert.match(DATABASE_SECURITY_SQL,/opscore_tenant_permissive/);
  assert.match(DATABASE_SECURITY_SQL,/opscore_tenant_boundary_guard/);
  assert.ok(DATABASE_SECURITY_SQL.includes("p.polroles::text = '{0}'"));
  assert.ok(DATABASE_SECURITY_SQL.includes('COUNT(p.oid) = 2'));
  assert.ok(DATABASE_SECURITY_SQL.includes("(organization_id = NULLIF(current_setting(''app.tenant_id''::text, true), ''''::text))"));
  assert.match(DATABASE_SECURITY_SQL,/pg_get_expr\(p\.polqual,p\.polrelid\)/);
  assert.match(DATABASE_SECURITY_SQL,/pg_get_expr\(p\.polwithcheck,p\.polrelid\)/);
  assert.doesNotMatch(DATABASE_SECURITY_SQL,/regexp_replace/i);
  assert.doesNotMatch(DATABASE_SECURITY_SQL,/pg_get_expr[\s\S]{0,500}LIKE/i);
  assert.doesNotMatch(DATABASE_SECURITY_SQL,/(?:^|\n)\s*(?:ALTER|UPDATE|DELETE|DROP|GRANT|REVOKE)\s+/i);
});

test('database security proof performs one catalog query', () => {
  let calls=0,used='';
  const db={prepare(sql){calls++;used=sql;return{get(){return{
    public_table_count:132,rls_enabled_table_count:131,rls_forced_table_count:131,
    tables_without_rls_count:1,non_postgis_tables_without_rls_count:0,
    spatial_ref_sys_runtime_write_access_count:0,migration_ledger_table_count:1,
    migration_ledger_without_force_rls_count:0,migration_ledger_runtime_privileges_count:0,
    identity_tables_without_rls_with_runtime_access_count:0,
    ...SAFE_RUNTIME_ROLE,
    control_plane_table_count:3,control_plane_runtime_privilege_gap_count:0, control_plane_policy_valid_table_count: 3
  };}};}};
  const proof=readDatabaseSecurityProof(db,fixedTime);
  assert.equal(calls,1); assert.equal(used,DATABASE_SECURITY_SQL);
  assert.equal(proof.status,'IDENTITY_PLANE_RLS_ENFORCED');
});

test('control-plane runtime grants are explicit and deny unnecessary writes', () => {
  const base = {
    public_table_count: 132, rls_enabled_table_count: 131, rls_forced_table_count: 131,
    tables_without_rls_count: 1, non_postgis_tables_without_rls_count: 0,
    spatial_ref_sys_runtime_write_access_count: 0, migration_ledger_table_count: 1,
    migration_ledger_without_force_rls_count: 0, migration_ledger_runtime_privileges_count: 0,
    identity_tables_without_rls_with_runtime_access_count: 0,
    control_plane_table_count: 3, control_plane_runtime_privilege_gap_count: 0, control_plane_policy_valid_table_count: 3
  };
  const good = buildDatabaseSecurityProof(base, fixedTime);
  assert.equal(good.status, 'IDENTITY_PLANE_RLS_ENFORCED');
  assert.equal(good.controlPlaneRuntimePrivileges.status, 'LEAST_PRIVILEGE_PRESENT');
  assert.equal(buildDatabaseSecurityProof({...base, control_plane_runtime_privilege_gap_count: 1}, fixedTime).status, 'REVIEW_REQUIRED');
  assert.equal(buildDatabaseSecurityProof({...base, control_plane_table_count: 2}, fixedTime).status, 'REVIEW_REQUIRED');
});


test('live database connection must use the dedicated least-privilege runtime role', () => {
  const base = {
    public_table_count: 132, rls_enabled_table_count: 131, rls_forced_table_count: 131,
    tables_without_rls_count: 1, non_postgis_tables_without_rls_count: 0,
    spatial_ref_sys_runtime_write_access_count: 0, migration_ledger_table_count: 1,
    migration_ledger_without_force_rls_count: 0, migration_ledger_runtime_privileges_count: 0,
    identity_tables_without_rls_with_runtime_access_count: 0,
    control_plane_table_count: 3, control_plane_policy_valid_table_count: 3,
    control_plane_runtime_privilege_gap_count: 0,
    ...SAFE_RUNTIME_ROLE
  };
  const safe = buildDatabaseSecurityProof(base, fixedTime);
  assert.equal(safe.runtimeRole.status, 'LEAST_PRIVILEGE_PRESENT');
  assert.equal(safe.status, 'IDENTITY_PLANE_RLS_ENFORCED');
  for (const bad of [
    { runtime_role_bypassrls: true },
    { runtime_role_superuser: true },
    { runtime_role_createrole: true },
    { runtime_role_createdb: true },
    { runtime_role_name: 'opscore_app' },
    { runtime_role_elevated_membership_count: 1 },
    { runtime_role_login: false }
  ]) assert.equal(buildDatabaseSecurityProof({ ...base, ...bad }, fixedTime).status, 'REVIEW_REQUIRED');
});

test('database security proof fails closed when adapter is absent', () => {
  assert.throws(()=>readDatabaseSecurityProof(null,fixedTime),/DATABASE_SECURITY_CATALOG_UNAVAILABLE/);
});

test('database security proof requires restrictive tenant-boundary policy catalog on all control-plane tables', () => {
  const base = {
    public_table_count: 132,
    rls_enabled_table_count: 131,
    rls_forced_table_count: 131,
    tables_without_rls_count: 1,
    non_postgis_tables_without_rls_count: 0,
    spatial_ref_sys_runtime_write_access_count: 0,
    migration_ledger_table_count: 1,
    migration_ledger_without_force_rls_count: 0,
    migration_ledger_runtime_privileges_count: 0,
    identity_tables_without_rls_with_runtime_access_count: 0,
    control_plane_table_count: 3,
    control_plane_policy_valid_table_count: 3,
    control_plane_runtime_privilege_gap_count: 0
  };

  const enforced = buildDatabaseSecurityProof(base, fixedTime);
  assert.equal(enforced.controlPlaneTenantBoundaryPolicies.validatedTableCount, 3);
  assert.equal(enforced.controlPlaneTenantBoundaryPolicies.status, 'CATALOG_ENFORCED');
  assert.equal(enforced.status, 'IDENTITY_PLANE_RLS_ENFORCED');

  const partial = buildDatabaseSecurityProof({
    ...base,
    control_plane_policy_valid_table_count: 2
  }, fixedTime);
  assert.equal(partial.controlPlaneTenantBoundaryPolicies.status, 'REVIEW_REQUIRED');
  assert.equal(partial.status, 'REVIEW_REQUIRED');
  assert.equal(partial.productionIsolationCertification, 'NOT_CERTIFIED');

  const missing = buildDatabaseSecurityProof({
    ...base,
    control_plane_policy_valid_table_count: 0
  }, fixedTime);
  assert.equal(missing.controlPlaneTenantBoundaryPolicies.validatedTableCount, 0);
  assert.equal(missing.controlPlaneTenantBoundaryPolicies.status, 'REVIEW_REQUIRED');
  assert.equal(missing.status, 'REVIEW_REQUIRED');
});
