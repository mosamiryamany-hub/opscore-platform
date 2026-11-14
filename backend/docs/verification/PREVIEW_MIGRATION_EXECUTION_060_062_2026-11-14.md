# Preview Migration Execution Evidence — 060–062
**Date:** 2026-11-14  
**Scope:** Isolated Neon Preview branch only. This is execution evidence, not a production certification.

## 1. Target and isolation boundary

- Neon project: `summer-leaf-18448271`
- Database: `opscore_acceptance`
- Target branch: `vercel-dev` (`br-wispy-credit-bckacgvt`)
- Parent / Production branch: `main` (`br-wispy-term-bcrqqj84`)
- SQL execution role: `neondb_owner`
- Intended application runtime role: `opscore_runtime`

All migration execution and post-migration SQL checks recorded here targeted `br-wispy-credit-bckacgvt`. No SQL write was issued against `br-wispy-term-bcrqqj84`. No Git merge was performed.

## 2. Applied migrations and source integrity

The source files were fetched from branch `security/priority-production-hardening-20261114`. SHA-256 was computed by PostgreSQL over the fetched UTF-8 source text before execution and recorded in `public.schema_migrations`.

| Migration | Source SHA-256 | Ledger applied_at (UTC) |
|---|---|---|
| `060_firewall_rate_bucket_expiry_index.sql` | `5471638f449b5aea332188ef761e456bcb3227fe68ad2fb81089a7a5eb8ccf75` | `2026-11-14T15:17:17.937Z` |
| `061_operational_autopilot_tenant_persistence.sql` | `c44f383e0095ac3815743b754876f7403cc8eb69e33b3faddbf1bbef5bd286dd` | `2026-11-14T15:30:11.818Z` |
| `062_autopilot_table_privilege_minimization.sql` | `4c5dc413fde4b5beebaa47b9cca65c01e466e8f41a0ad40d8e480eb97625ae65` | `2026-11-14T15:31:05.775Z` |

Each migration ran in its own transaction, followed by its ledger insert in the same transaction. All three ledger rows were read back after execution and matched the exact source hashes above.

## 3. Catalog verification

### Migration 060
- Verified index: `public.idx_firewall_rate_buckets_updated_at`
- Index definition: B-tree on `public.firewall_rate_buckets(updated_at)`
- Verified one ledger row with the expected SHA-256.

### Migration 061
Created:
- `public.incident_replays`
- `public.decision_memory`
- `public.autopilot_proposals`

Verified:
- All three tables are owned by `neondb_owner`.
- All three have both RLS and FORCE RLS enabled.
- Each table has the expected permissive `opscore_tenant_permissive` and restrictive `opscore_tenant_boundary_guard` policies.
- Supporting indexes were present.
- `decision_memory_tenant_decision_fkey` is validated and binds `(decision_id, organization_id)` to `decision_replays(id, organization_id)`.
- The referenced unique index `idx_decision_replays_id_org_uq` is present.

### Migration 062 — effective runtime table privileges

Post-migration checks used `has_table_privilege` for `opscore_runtime`; this is an effective-privilege check rather than a reading of only direct ACL entries.

| Table | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER | MAINTAIN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `incident_replays` | yes | yes | no | no | no | no | no | no |
| `decision_memory` | yes | yes | no | no | no | no | no | no |
| `autopilot_proposals` | yes | yes | yes | no | no | no | no | no |

The runtime role attributes were also re-read: LOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB.

## 4. Residual role and default-privilege findings — not remediated

These are separate from the successful 060–062 table-level results and must not be interpreted as closed.

### 4.1 Legacy `opscore_app` role

On this Preview branch, the current catalog reports:
- `opscore_app`: LOGIN, NOSUPERUSER, BYPASSRLS, CREATEROLE, CREATEDB.
- It is a member of `neon_superuser`.
- Its effective privileges on `incident_replays` include SELECT, INSERT, UPDATE, and DELETE.
- `opscore_app` had zero active sessions in the inspected `pg_stat_activity` snapshot.

Historical source explains the direct grants:
- Migration 049 grants broad DML on existing public tables and default DML for future public tables to `opscore_app`.
- Migration 050 grants database/schema CREATE to `opscore_app`.
- Migration 051 revokes CREATE on the database and public schema.
- Migration 061 revokes direct privileges from `opscore_app` on the three new tables, but it does not remove role membership. Effective privileges remain because of the role membership/attributes observed in the live catalog.

No membership, role attribute, credential, or password change was attempted. Removing membership from a provider-managed role without a complete credential and dependency review could interrupt unrelated operations.

### 4.2 Default privileges remain broad for future tables

The live `pg_default_acl` for objects created by `neondb_owner` in schema `public` still grants SELECT, INSERT, UPDATE, DELETE on future tables to both:
- `opscore_app` (introduced explicitly in migration 049)
- `opscore_runtime` (introduced explicitly in migration 059)

Migration 062 narrows privileges on the three current Autopilot tables. It does not change these default privileges for future tables. A blanket default-privilege revocation would change the explicit behavior established by migrations 049 and 059 and may break application paths unless every future table receives separately reviewed grants. No default privilege was changed in this execution.

### Required follow-up before calling the privilege model fully hardened

1. Trace every use of `opscore_app`, its provider role membership, and the credential/configuration paths. Confirm whether it is a migration/test-only identity or still used by any deployed service.
2. Audit every existing table and runtime SQL call site before replacing the broad `opscore_runtime` default grants with per-table grants.
3. Add a versioned migration and regression tests only after the intended role/permission model is reconciled. Do not solve the problem with an untracked manual ACL change.

## 5. CI and Vercel evidence boundary

At the time of this evidence snapshot, PR head was `a5fc3fbf793cae552ebfd950ef732e089f89ea82`.

GitHub workflow runs on that commit reported success:
- PostgreSQL 18 isolated RLS and HTTP acceptance: run `43609156148`
- Vercel workflow: run `43609156158`
- OpsCore CI: run `43609156538`

The PostgreSQL 18 workflow ran before these live Neon Preview migrations were applied. It tested migration source on disposable acceptance databases and exercised tenant/RLS, composite-FK, restore, and HTTP acceptance gates. It is not evidence of an HTTP acceptance run against this Preview branch after 060–062.

The latest inspected Vercel deployment for the branch was READY but built from older commit `23ddd6e98f80d9bc6d68597780f7d3b2833dcfbc`, not the PR head or a post-060–062 build. Vercel SSO protection was enabled. No SSO bypass was used and no current-head deployment was claimed as tested.

## 6. Repository and release state

- PR #103 remained open and Draft.
- Base `main` remained at `4ef126ccd59f23cebeead30224d1bcf7199535ab` in the inspected PR metadata.
- No merge was performed.
- No Production branch SQL write was performed.
- Live Production tenant-isolation certification, PITR/restore certification, WAF enforcement, and full HTTP acceptance remain separate release gates. This report does not close them.

## 7. Outcome

**Verified on isolated Preview:** migrations 060, 061, and 062 applied; source hashes match; target objects, tenant RLS/FORCE RLS, composite FK, and post-062 runtime table privileges match the intended migration contracts.

**Not verified / still open:** inherited `opscore_app` elevated access, broad default privileges for future tables, current-head Vercel deployment and post-migration HTTP acceptance, and all previously identified Production release blockers.
