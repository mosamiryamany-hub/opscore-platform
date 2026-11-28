# OpsCore Source Baseline Audit

**Audit date:** 2026-11-28  
**Audit phase:** 0 — Source Baseline only  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Baseline branch:** `main`  
**Baseline commit:** `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`  
**Audit branch:** `audit/source-baseline-2026-11-28`  
**Change scope:** Documentation only; no application, migration, workflow, environment, database, deployment, or production changes.

## 1. Executive disposition

**Phase 0 status: BASELINE IDENTIFIED — SOURCE REVIEW PARTIALLY COMPLETE.**

The repository and exact main commit were reachable and inspected. The audit branch was created from the exact main SHA above. This report is committed only on that independent branch.

No source-code change is justified by the evidence collected in this phase. Do not merge this audit branch. Do not begin Phase 1 until this source baseline is reviewed and accepted.

## 2. Repository and Git evidence

| Item | Observed result |
|---|---|
| Repository | `mosamiryamany-hub/opscore-platform` |
| Visibility | Public |
| Default branch | `main` |
| Main protection | GitHub branch endpoint reports `protected: true` |
| Main SHA | `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187` |
| Repository size | 6,028 KB (GitHub repository metadata) |
| Branch count | 487 (all search pages exhausted) |
| Open pull requests | 15 |
| Recursive Git tree entries | 1,010; tree response was not truncated |
| Main latest commit | `fix(release): verify canonical production domain` |
| Latest main commit changed paths | `.github/workflows/vercel-deploy.yml` only |

The main branch was not modified. No pull request was merged or changed by this audit.

### 2.1 Relevant open pull requests observed

The following open work is relevant to the present source baseline. Their existence is not evidence of acceptance or merge readiness.

| PR | Title / scope | State at audit |
|---|---|---|
| #513 | CRM migration sequence after GIS 073–075 | Open, draft; targets a test branch |
| #510 | GIS signed PostGIS / Dispatcher Map / million-row validation | Open, draft; validation-only |
| #509 / #508 / #505 / #503 | Stacked Dispatcher Map and GIS implementation/acceptance | Open, draft |
| #499 / #498 | Digital Twin browser acceptance and command room | Open, draft |
| #497 | Buyer delivery, branding and encrypted backups | Open |
| #496 | Self-hosted PWA, dispatcher map and Android preview pipeline | Open |
| #495 | UI accessibility and design primitives | Open |
| #494 / #493 | Contact Center CRM and operations workspaces | Open |
| #491 | Live PostgreSQL acceptance on disposable Neon branch | Open |
| #490 | Keycloak multi-provider sign-in | Open |

Several open PRs targeting `main` still record base SHA `3cc84f92ee6dd30730d4e96cabf3f9853ffdd7dd`, while current main is three commits ahead at `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`. Their diffs and required checks must be re-evaluated against the current main tip before review or merge.

PR #514 (`integration/gis-crm-feature-stack-20261128`) is closed without merging. Its recorded disposition says the integrated GIS + Digital Twin + Contact Center CRM stack is already on main and that the remaining candidate delta would remove a spatial fixture seed needed by candidate-mode map acceptance. Do not re-merge that branch or recreate its changes without a fresh comparison.

## 3. Source inventory

| Area | Observed inventory |
|---|---:|
| Recursive Git tree entries | 1,010 |
| PostgreSQL migration source files | 75 |
| Backend Node test files matching `backend/test/*.test.js` | 193 |
| Mobile test/spec files matching the inspected filename pattern | 2 |
| GitHub workflow files | 38 |

These are source-tree counts, not counts of passing test cases or proof of runtime completeness.

### 3.1 Runtime and package metadata

- Root package version: `0.11.62`.
- Backend package version: `0.11.62`.
- Mobile package version: `0.1.16`.
- Root and backend Node engine constraints: `>=22.23.4 <23`.
- Root `.nvmrc`: `22.23.4`.
- Backend Dockerfile base: `node:22.23.4-bookworm-slim`.
- Mobile package currently declares Expo `^58.0.26`, React Native `0.88.1`, React `19.3.1`.
- All three inspected npm lockfiles use lockfile format version 3.
- The root lockfile's committed dependency-audit snapshot reports 14 dependencies and zero vulnerabilities, but the snapshot has no freshness timestamp and is not treated as a current security attestation.
- Current-head CI's successful verification job runs the backend production dependency audit (`npm audit --omit=dev --audit-level=high`) and the mobile dependency audit gate. The overall current-head verify job passed; this is the current CI evidence, not a substitute for an independent license inventory or buyer-environment scan.

Node 26 is not the repository's current supported runtime. Any runtime upgrade is a Phase 2 compatibility decision and must not be inferred from the research recommendation alone.

## 4. Database migration source inventory

- The source tree contains 75 migration files under `backend/sql/postgres`.
- The highest migration number currently present is 076:
  - `073_digital_twin_snapshot_rls.sql`
  - `074_tenant_scoped_postgis_spatial_features.sql`
  - `075_signed_rls_spatial_viewport_query.sql`
  - `076_contact_center_crm_customer_link.sql`
- The migration parser explicitly accepts a numeric suffix, and the source includes `031b_sessions_organization_id.sql`.
- The migration preflight source explicitly reserves historical gaps 006–008. Tree inspection found no other missing numeric migration IDs between the first and latest migration numbers and no duplicate migration identifiers under the parser's number-plus-suffix scheme.
- The migration planner contains explicit legacy filename/checksum reconciliation rules, including catalog-equivalence verifiers. These exceptions are security-sensitive migration logic and require target-ledger/catalog evidence; source inspection does not prove that any live database ledger matches.
- The full migration ledger gate reads the live `public.schema_migrations` table and compares filenames and SHA-256 digests. It cannot be treated as executed merely because the script exists.

**Not established in Phase 0:** successful application of all 75 migrations to a clean PostgreSQL/PostGIS database, live ledger parity, live FK/composite-FK catalog coverage, RLS/Force RLS catalog coverage, or tenant isolation on a current production database.

## 5. Self-hosted source footprint

Observed source files include:

- `backend/docker/Dockerfile` — application image definition using Node 22.23.4.
- `backend/docker-compose.postgres.yml` — a PostgreSQL service definition with a persistent volume and health check.
- `backend/docker/postgres-init/10-opscore-roles.sh` — database role initialization.
- `backend/.env.example` — environment template.

The only Compose file found in the recursive source tree is `backend/docker-compose.postgres.yml`, and it defines the database service only. No Caddyfile and no complete application + database + ingress self-hosted Compose stack were found in the inspected tree.

**Disposition:** self-hosted building blocks exist, but the source inventory does not establish a complete buyer-ready runtime, TLS ingress, resource limits, internal-only service networking, secret lifecycle, or an independently restorable deployment.

## 6. Current-head CI evidence

### 6.1 OpsCore CI on current main

- Workflow run: [46101901504](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/46101901504)
- Commit: `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`
- Run conclusion: `success`.
- `verify`: `success`.
- `digital-twin-postgres-18-postgis-acceptance`: `skipped` because the workflow job is restricted to named pull-request branches.

### 6.2 Vercel workflow checks on current main

- Workflow run: [46101901507](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/46101901507)
- Commit: `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`
- `vercel-source-verify`: `success`.
- `isolated-postgres-rls-and-http-acceptance`: `success`.
- `vercel-contract-verify`: `success`.
- Isolated Neon Preview migration/HTTP acceptance: `skipped`.
- Production Neon PITR historical branch probe: `skipped`.
- Deployment job: `skipped`.

### 6.3 CodeQL on current main

The current-head check-run list reports successful Actions, JavaScript/TypeScript, and Python analysis jobs.

### 6.4 Historical run — not current-head proof

Workflow run [46098652375](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/46098652375) ran on prior commit `fbc3e3acac557bd2c53486eee8813f9f318d7198`.

Its disposable PostgreSQL 18 RLS/HTTP acceptance, composite-FK gate, Digital Twin/PostGIS gates, logical restore drill, Neon Preview migration/HTTP acceptance, and read-only historical Neon PITR probe reported success. The overall deployment job nevertheless failed at the final public-domain-to-promoted-commit verification step; subsequent release-evidence persistence was skipped. The main commit `f68ec555...` changes the Vercel workflow to verify the canonical production domain, but the latest current-head workflow run skipped deployment and Neon Preview/PITR. Therefore, the historical successes must not be relabelled as fresh evidence for `f68ec555...`.

**CI conclusion:** current main has passing source and isolated PostgreSQL checks, with important current-head acceptance jobs skipped. CI success is not a live deployment, current production database, device, PITR, or buyer installation attestation.

## 7. Confirmed / Implemented / Recommended / Unresolved / Unverified

### Confirmed
- Repository identity, default branch, protected-main flag, current main SHA, branch count, open PR count, and recursive tree size.
- Source package versions and Node 22.23.4 engine constraints.
- 75 migration files through 076, 193 backend test files, 38 workflows.
- Current-head CI run and check conclusions listed above.
- Existing self-hosted Dockerfile and database-only Compose definition.

### Implemented in source
- PostgreSQL migration planner and migration ledger gate.
- Tenant composite-FK acceptance script.
- PostgreSQL/PostGIS, RLS, Digital Twin, GIS, Dispatcher Map and Contact Center source/tests/workflows.
- PWA service-worker shell and Android preview workflow.
- Database Dockerfile/Compose building blocks.

“Implemented in source” does not mean every function is accepted in a buyer environment.

### Recommended
- Keep current main SHA fixed as the Phase 0 comparison baseline.
- Reconcile every open PR against current main before accepting further stacked work.
- Keep the audit branch documentation-only until Phase 0 review is complete.
- Preserve the existing Node 22 runtime until a separate compatibility matrix and CI proof authorize a change.
- Treat migration checksum reconciliation as a privileged, evidence-gated exception.

### Unresolved
- Whether every open branch/PR has been reconciled against the latest main tree.
- Whether all migrations apply cleanly from an empty database and whether every legacy checksum exception has exact catalog-equivalence evidence on each target.
- Whether every tenant FK and composite FK is covered by live catalog evidence.
- Whether the full self-hosted runtime can be installed, upgraded, rolled back, and restored from a clean host.
- Whether current-head production deployment and production database identity are bound to this exact main commit.

### Unverified in Phase 0
- Neon project/branch/database state, Vercel project/deployment/domain state, environment variable bindings, secrets, firewall, and production database identity.
- Current production runtime behavior, current production RLS state, current production PITR/RPO/RTO.
- Physical Android/iOS device acceptance and signed store binaries.
- Live GIS scale measurements, current tenant-specific map rendering in production, object-storage durability, and external integrations.

These items are deliberately not inspected or claimed as closed in this Phase 0 report; infrastructure verification belongs to Phase 1 and subsequent acceptance gates.

## 8. Safe execution boundary and next gate

- Audit branch created from exact main SHA `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`.
- This report is the only intended change in this branch.
- No main or production change was made.
- No migration, deployment, secret, environment, DNS, database, or provider setting was changed.
- Do not merge this branch.

**Phase 0 exit gate:** review this report, verify the listed counts and PR/branch dispositions, and approve the baseline. Only then proceed to Phase 1 Infrastructure Audit.