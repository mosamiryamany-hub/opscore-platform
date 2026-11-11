'use strict';
const DATABASE_SECURITY_SQL = `
SELECT
  COUNT(*) FILTER (WHERE c.relkind = 'r')::int AS public_table_count,
  COUNT(*) FILTER (WHERE c.relkind = 'r' AND c.relrowsecurity)::int AS rls_enabled_table_count,
  COUNT(*) FILTER (WHERE c.relkind = 'r' AND c.relforcerowsecurity)::int AS rls_forced_table_count,
  COUNT(*) FILTER (WHERE c.relkind = 'r' AND NOT c.relrowsecurity)::int AS tables_without_rls_count,
  COUNT(*) FILTER (WHERE c.relkind = 'r' AND c.relname <> 'spatial_ref_sys' AND NOT c.relrowsecurity)::int AS non_postgis_tables_without_rls_count,
  COUNT(*) FILTER (
    WHERE c.relkind = 'r' AND c.relname = 'spatial_ref_sys'
      AND (has_table_privilege(current_user,c.oid,'INSERT')
        OR has_table_privilege(current_user,c.oid,'UPDATE')
        OR has_table_privilege(current_user,c.oid,'DELETE')
        OR has_table_privilege(current_user,c.oid,'TRUNCATE'))
  )::int AS spatial_ref_sys_runtime_write_access_count,
  COUNT(*) FILTER (WHERE c.relkind = 'r' AND c.relname = 'schema_migrations')::int AS migration_ledger_table_count,
  COUNT(*) FILTER (
    WHERE c.relkind = 'r' AND c.relname = 'schema_migrations'
      AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
  )::int AS migration_ledger_without_force_rls_count,
  COUNT(*) FILTER (
    WHERE c.relkind = 'r' AND c.relname = 'schema_migrations'
      AND (has_table_privilege(current_user,c.oid,'SELECT')
        OR has_table_privilege(current_user,c.oid,'INSERT')
        OR has_table_privilege(current_user,c.oid,'UPDATE')
        OR has_table_privilege(current_user,c.oid,'DELETE')
        OR has_table_privilege(current_user,c.oid,'TRUNCATE'))
  )::int AS migration_ledger_runtime_privileges_count,
  COUNT(*) FILTER (
    WHERE c.relkind = 'r'
      AND c.relname = ANY (ARRAY['users','sessions','organizations','password_reset_tokens','oidc_identities']::text[])
      AND NOT c.relrowsecurity
      AND (has_table_privilege(current_user,c.oid,'SELECT')
        OR has_table_privilege(current_user,c.oid,'INSERT')
        OR has_table_privilege(current_user,c.oid,'UPDATE')
        OR has_table_privilege(current_user,c.oid,'DELETE'))
  )::int AS identity_tables_without_rls_with_runtime_access_count,
  COUNT(*) FILTER (
    WHERE c.relkind = 'r'
      AND c.relname = ANY (ARRAY['feature_flags','safe_mode_states','control_plane_runs']::text[])
  )::int AS control_plane_table_count,
  (
    SELECT COUNT(*)::int
    FROM (
      SELECT c.oid
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname = ANY (ARRAY['feature_flags','safe_mode_states','control_plane_runs']::text[])
      GROUP BY c.oid, c.relrowsecurity, c.relforcerowsecurity
      HAVING c.relrowsecurity
        AND c.relforcerowsecurity
        -- Exactly two policies are permitted: one tenant access and one boundary guard.
        AND COUNT(p.oid) = 2
        AND COUNT(p.oid) FILTER (
          WHERE p.polname = 'opscore_tenant_permissive'
            AND p.polpermissive IS TRUE
            AND p.polcmd = '*'
            AND p.polroles::text = '{0}'
            AND COALESCE(pg_get_expr(p.polqual,p.polrelid),'') =
              '(organization_id = NULLIF(current_setting(''app.tenant_id''::text, true), ''''::text))'
            AND COALESCE(pg_get_expr(p.polwithcheck,p.polrelid),'') =
              '(organization_id = NULLIF(current_setting(''app.tenant_id''::text, true), ''''::text))'
        ) = 1
        AND COUNT(p.oid) FILTER (
          WHERE p.polname = 'opscore_tenant_boundary_guard'
            AND p.polpermissive IS FALSE
            AND p.polcmd = '*'
            AND p.polroles::text = '{0}'
            AND COALESCE(pg_get_expr(p.polqual,p.polrelid),'') =
              '(organization_id = NULLIF(current_setting(''app.tenant_id''::text, true), ''''::text))'
            AND COALESCE(pg_get_expr(p.polwithcheck,p.polrelid),'') =
              '(organization_id = NULLIF(current_setting(''app.tenant_id''::text, true), ''''::text))'
        ) = 1
    ) AS valid_control_plane_policy_tables
  ) AS control_plane_policy_valid_table_count,
  COUNT(*) FILTER (
    WHERE c.relkind = 'r' AND (
      (c.relname = 'feature_flags' AND (
        NOT has_table_privilege(current_user,c.oid,'SELECT')
        OR NOT has_table_privilege(current_user,c.oid,'INSERT')
        OR NOT has_table_privilege(current_user,c.oid,'UPDATE')
        OR has_table_privilege(current_user,c.oid,'DELETE')
        OR has_table_privilege(current_user,c.oid,'TRUNCATE')
      ))
      OR (c.relname = 'safe_mode_states' AND (
        NOT has_table_privilege(current_user,c.oid,'SELECT')
        OR NOT has_table_privilege(current_user,c.oid,'INSERT')
        OR NOT has_table_privilege(current_user,c.oid,'UPDATE')
        OR has_table_privilege(current_user,c.oid,'DELETE')
        OR has_table_privilege(current_user,c.oid,'TRUNCATE')
      ))
      OR (c.relname = 'control_plane_runs' AND (
        NOT has_table_privilege(current_user,c.oid,'INSERT')
        OR has_table_privilege(current_user,c.oid,'SELECT')
        OR has_table_privilege(current_user,c.oid,'UPDATE')
        OR has_table_privilege(current_user,c.oid,'DELETE')
        OR has_table_privilege(current_user,c.oid,'TRUNCATE')
      ))
    )
  )::int AS control_plane_runtime_privilege_gap_count,
  current_user::text AS runtime_role_name,
  COALESCE((SELECT r.rolcanlogin FROM pg_roles r WHERE r.rolname = current_user), false) AS runtime_role_login,
  COALESCE((SELECT r.rolsuper FROM pg_roles r WHERE r.rolname = current_user), true) AS runtime_role_superuser,
  COALESCE((SELECT r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user), true) AS runtime_role_bypassrls,
  COALESCE((SELECT r.rolcreaterole FROM pg_roles r WHERE r.rolname = current_user), true) AS runtime_role_createrole,
  COALESCE((SELECT r.rolcreatedb FROM pg_roles r WHERE r.rolname = current_user), true) AS runtime_role_createdb,
  (
    SELECT COUNT(*)::int
    FROM pg_roles elevated
    WHERE elevated.oid <> (SELECT current_role.oid FROM pg_roles current_role WHERE current_role.rolname = current_user)
      AND (elevated.rolsuper OR elevated.rolbypassrls OR elevated.rolcreaterole OR elevated.rolcreatedb)
      AND pg_has_role(current_user, elevated.oid, 'MEMBER')
  ) AS runtime_role_elevated_membership_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';
`;

function count(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function buildDatabaseSecurityProof(row = {}, now = () => new Date(), env = process.env) {
  const publicTableCount = count(row.public_table_count);
  const rlsEnabledTableCount = count(row.rls_enabled_table_count);
  const rlsForcedTableCount = count(row.rls_forced_table_count);
  const tablesWithoutRlsCount = count(row.tables_without_rls_count);
  const nonPostgisTablesWithoutRlsCount = count(row.non_postgis_tables_without_rls_count);
  const spatialRefSysRuntimeWriteAccessCount = count(row.spatial_ref_sys_runtime_write_access_count);
  const migrationLedgerTableCount = count(row.migration_ledger_table_count);
  const migrationLedgerWithoutForceRlsCount = count(row.migration_ledger_without_force_rls_count);
  const migrationLedgerRuntimePrivilegesCount = count(row.migration_ledger_runtime_privileges_count);
  const identityTablesWithoutRlsWithRuntimeAccessCount =
    count(row.identity_tables_without_rls_with_runtime_access_count);
  const controlPlaneTableCount = count(row.control_plane_table_count);
  const controlPlanePolicyValidTableCount = count(row.control_plane_policy_valid_table_count);
  const controlPlaneRuntimePrivilegeGapCount = count(row.control_plane_runtime_privilege_gap_count);
  const runtimeRoleName = String(row.runtime_role_name || '').trim();
  const runtimeRoleLogin = row.runtime_role_login === true;
  const runtimeRoleSuperuser = row.runtime_role_superuser === true;
  const runtimeRoleBypassRls = row.runtime_role_bypassrls === true;
  const runtimeRoleCreateRole = row.runtime_role_createrole === true;
  const runtimeRoleCreateDatabase = row.runtime_role_createdb === true;
  const runtimeRoleElevatedMembershipCount = count(row.runtime_role_elevated_membership_count);
  const runtimeRoleSafe = runtimeRoleName === 'opscore_runtime' && runtimeRoleLogin &&
    !runtimeRoleSuperuser && !runtimeRoleBypassRls && !runtimeRoleCreateRole &&
    !runtimeRoleCreateDatabase && runtimeRoleElevatedMembershipCount === 0;

  const identityPlaneHardened = identityTablesWithoutRlsWithRuntimeAccessCount === 0;
  const catalogAcceptable =
    nonPostgisTablesWithoutRlsCount === 0 &&
    spatialRefSysRuntimeWriteAccessCount === 0 &&
    migrationLedgerTableCount === 1 &&
    migrationLedgerWithoutForceRlsCount === 0 &&
    migrationLedgerRuntimePrivilegesCount === 0 &&
    controlPlaneTableCount === 3 &&
    controlPlanePolicyValidTableCount === 3 &&
    controlPlaneRuntimePrivilegeGapCount === 0 &&\n    runtimeRoleSafe;

  let status = 'NOT_CERTIFIED';
  let note = 'Catalog metadata is not a full behavioral certification of every application path.';
  const isolationCertified = String(env.OPSC_PRODUCTION_ISOLATION_CERTIFICATION || '').trim().toUpperCase() === 'CERTIFIED'
    && identityPlaneHardened && catalogAcceptable;
  if (isolationCertified) {
    status = 'IDENTITY_PLANE_RLS_ENFORCED';
    note = 'Catalog FORCE RLS and least-privilege boundaries are enforced. Formal production isolation certification was attested via OPSC_PRODUCTION_ISOLATION_CERTIFICATION after dual-tenant behavioral acceptance evidence was bound to the deployed release.';
  } else if (identityPlaneHardened && catalogAcceptable) {
    status = 'IDENTITY_PLANE_RLS_ENFORCED';
    note = 'Every public application table except the read-only PostGIS spatial_ref_sys catalog has FORCE RLS. The schema_migrations ledger is owner-only. Control-plane tables have explicit least-privilege runtime grants independent of provider default ACLs. Authenticated path-by-path and cross-tenant behavioral tests are still required before production isolation certification.';
  } else if (identityPlaneHardened) {
    status = 'REVIEW_REQUIRED';
    note = 'Identity-plane RLS is present, but a non-PostGIS relation, migration-ledger boundary, PostGIS write privilege, or control-plane tenant-boundary policy still requires review.';
  } else {
    note = 'Critical identity tables remain accessible to the runtime role without RLS.';
  }

  return {
    schemaVersion: 'opscore.public-database-security-proof.v2',
    status,
    productionIsolationCertification: isolationCertified ? 'CERTIFIED' : 'NOT_CERTIFIED',
    evidenceScope: 'Live PostgreSQL catalog metadata queried as the running application database role',
    publicSchema: {
      ordinaryTableCount: publicTableCount,
      rlsEnabledTableCount,
      rlsForcedTableCount,
      tablesWithoutRlsCount,
      nonPostgisTablesWithoutRlsCount,
      postgisSpatialRefSys: {
        allowedNoRlsCatalog: true,
        runtimeWriteAccessCount: spatialRefSysRuntimeWriteAccessCount
      }
    },
    migrationLedger: {
      tableCount: migrationLedgerTableCount,
      forceRls: migrationLedgerTableCount === 1 && migrationLedgerWithoutForceRlsCount === 0,
      runtimePrivilegesCount: migrationLedgerRuntimePrivilegesCount,
      status: catalogAcceptable && migrationLedgerTableCount === 1 ? 'OWNER_ONLY' : 'REVIEW_REQUIRED'
    },
    controlPlaneRuntimePrivileges: {
      tableCount: controlPlaneTableCount,
      privilegeGapCount: controlPlaneRuntimePrivilegeGapCount,
      status: controlPlaneTableCount === 3 && controlPlaneRuntimePrivilegeGapCount === 0 ? 'LEAST_PRIVILEGE_PRESENT' : 'REVIEW_REQUIRED'
    },
    runtimeRole: {
      name: runtimeRoleName || null,
      login: runtimeRoleLogin,
      superuser: runtimeRoleSuperuser,
      bypassRls: runtimeRoleBypassRls,
      createRole: runtimeRoleCreateRole,
      createDatabase: runtimeRoleCreateDatabase,
      elevatedMembershipCount: runtimeRoleElevatedMembershipCount,
      status: runtimeRoleSafe ? 'LEAST_PRIVILEGE_PRESENT' : 'REVIEW_REQUIRED'
    },
    controlPlaneTenantBoundaryPolicies: {
      tableCount: controlPlaneTableCount,
      validatedTableCount: controlPlanePolicyValidTableCount,
      status: controlPlaneTableCount === 3 && controlPlanePolicyValidTableCount === 3 ? 'CATALOG_ENFORCED' : 'REVIEW_REQUIRED'
    },
    identityPlane: {
      criticalTablesWithoutRlsButAccessibleToRuntimeRole: identityTablesWithoutRlsWithRuntimeAccessCount,
      status: identityPlaneHardened ? 'RLS_ENFORCED' : 'NOT_CERTIFIED'
    },
    checkedAt: now().toISOString(),
    note
  };
}

function readDatabaseSecurityProof(db, now = () => new Date()) {
  if (!db || typeof db.prepare !== 'function') throw new Error('DATABASE_SECURITY_CATALOG_UNAVAILABLE');
  const row = db.prepare(DATABASE_SECURITY_SQL).get();
  if (!row || typeof row !== 'object') throw new Error('DATABASE_SECURITY_CATALOG_EMPTY');
  return buildDatabaseSecurityProof(row, now);
}

module.exports = { DATABASE_SECURITY_SQL, buildDatabaseSecurityProof, readDatabaseSecurityProof };
