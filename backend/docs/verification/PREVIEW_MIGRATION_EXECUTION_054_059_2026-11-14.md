# Preview migration execution — 054–059

Date: 2026-11-14  
Scope: Preview only; no Production or main changes.

## Exact target

- Neon project: `summer-leaf-18448271`
- Branch: `br-wispy-credit-bckacgvt` (`vercel-dev`)
- Parent branch: `br-wispy-term-bcrqqj84`
- Database: `opscore_acceptance`
- Migration execution identity: `neondb_owner`
- Runtime verification identity: `opscore_runtime`

The branch metadata confirms this is a non-default child branch whose parent is the production branch. All SQL execution calls were scoped to the child branch and database above.

## Execution record

All six source migrations were applied sequentially, each in its own transaction, with the migration ledger row written in the same transaction. Every transaction returned successfully. The SHA-256 recorded in `public.schema_migrations` was computed by PostgreSQL from the exact GitHub source file content.

| Migration | Result | Source SHA-256 |
|---|---|---|
| 054_tenant_composite_foreign_keys.sql | APPLIED | `acce8245849f74b25c774881d580d0d1b14577c422e9566e80d6b15df31734a0` |
| 055_completion_policy_version.sql | APPLIED | `199d90a9a978114ce655c2ac81f13caf5af26442f56ec07d196b7b3c312f9af7` |
| 056_runtime_auth_definer_function_grants.sql | APPLIED | `c089750bef8830ac5fc29548580698efcc7c94457dd63e9d2fa5ad4f99006e8c` |
| 057_read_only_runtime_migration_ledger_attestation.sql | APPLIED | `dd0e1628e82ed7a825b6d4c1a442721e09b5d3a9f44f6e05ba99ac90543112ed` |
| 058_security_definer_search_path_hardening.sql | APPLIED | `634f5f2228c02888ec2e3653a661ed6703ee741a73f00a44d6a2caead1cc681c` |
| 059_runtime_system_table_policy_and_privilege_alignment.sql | APPLIED | `a3adba142b8e9383f572a88d40346e45e88ecc76d78168a5afe776ab7c9e1fb8` |

A separate comparison recomputed all six source hashes from the branch files and confirmed exact equality with the six ledger entries.

## Post-migration verification

- Tenant-scoped foreign keys: 73 total; 73 validated composite references; 0 residual single-column/unvalidated references.
- Migration 055: `completion_policies.version` exists as INTEGER, NOT NULL, default 1; `completion_policies_version_positive` is validated.
- Migration 056: 10 auth SECURITY DEFINER functions are executable by `opscore_runtime`; PUBLIC EXECUTE is revoked for all 10.
- Migration 057: `opscore_attest_migration_056(text)` is owned by `neondb_owner`, SECURITY DEFINER, fixed search_path, row_security=off, and executable by runtime but not PUBLIC.
- Runtime invoked the attestation function successfully. It returned `migration_056_recorded=true`, `migration_056_hash_matches=true`, latest filename `059_runtime_system_table_policy_and_privilege_alignment.sql`, and migration count 58.
- Migration 058: 11 public SECURITY DEFINER functions; all 11 have `search_path=pg_catalog, public, pg_temp`; all 11 retain the expected `neondb_owner` owner; all 11 are executable by runtime; none grants EXECUTE to PUBLIC.
- Migration 059: the three system operational policies now target `opscore_runtime`. Their runtime grants match the migration's intended least-privilege matrix. The migration ledger is not readable/writable by runtime. `spatial_ref_sys` is read-only to runtime. The control-plane grants are restricted to SELECT/INSERT/UPDATE for feature flags and safe mode, and INSERT only for control-plane runs.
- All 131 application tables with RLS have FORCE RLS. The one table without RLS is PostGIS `spatial_ref_sys`, which has no runtime write privileges.

## Live Preview HTTP checks

Against deployment `dpl_HNPjAfHWrUBHkRZTreASzRkhp2qw` at SHA `23ddd6e98f80d9bc6d68597780f7d3b2833dcfbc`:

- `/api/health`: HTTP 200, `healthy`, PostgreSQL engine.
- `/api/verify/database`: HTTP 200, `ok=true`.
- `/api/verify/database-security`: HTTP 200, `IDENTITY_PLANE_RLS_ENFORCED`; reports 131/131 FORCE RLS tables, owner-only migration ledger, no runtime privilege gaps in the inspected control-plane/system tables, and a least-privileged runtime role.

The endpoint correctly continues to report `productionIsolationCertification=NOT_CERTIFIED`. Catalog evidence does not replace authenticated route-by-route, cross-tenant behavioral, session-binding, and production acceptance tests.

## Explicit scope boundary and remaining work

- The source tree continues through migrations 060, 061, and 062. They were **not** applied because the explicit authorization covered only 054–059. The preview ledger therefore ends at 059; the repository's latest migration file is 062.
- No Production branch, Production database, Production environment variable, Vercel Production deployment/alias, or GitHub `main` branch was modified.
- PR #103 remains Draft and unmerged.
- Migration 059 establishes default DML grants for future tables created by `neondb_owner`; each subsequent table migration must explicitly enable and FORCE RLS before application use. This remains a forward-looking schema-governance requirement.
- Production tenant isolation remains NOT CERTIFIED. The signed tenant-context Node/worker integration and behavioral acceptance remain separate release blockers.

## Correction to an earlier preflight note

An initial inspection reported the completion-policy table as missing because the query looked specifically for the not-yet-added `version` column. The table `public.completion_policies` was present; the missing column was precisely what migration 055 adds. No migration was executed on the basis of that mistaken interpretation. The actual preflight was rerun, and 055 subsequently applied and validated successfully.
