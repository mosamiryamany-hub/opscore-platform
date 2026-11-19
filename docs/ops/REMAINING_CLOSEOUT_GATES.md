# Main release and hosted Production closeout — live state 2026-11-19

This register supersedes the stale 2026-11-18 snapshot below. It distinguishes repository/CI acceptance, live database catalog evidence, Production deployment evidence, Production behavioral certification, and commercial/legal delivery. Those are separate gates and must not be substituted for one another.

## Immutable current references

| System | Verified state |
|---|---|
| GitHub repository | `mosamiryamany-hub/opscore-platform` |
| Main commit | `0edd7d8c855e1dd4645979c05fd30be105dff369` |
| Main protection | Enabled (`protected=true`) |
| PR #285 | Merged at `0edd7d8c855e1dd4645979c05fd30be105dff369`; the required contract check now depends on source verification and disposable PostgreSQL 18 acceptance |
| OpsCore CI | Run `44515948537` — success |
| Vercel workflow / protected gate | Run `44515948610` — success |
| Main CI signed-tenant artifact | `14524968082`, run `44515948610`, 67/67 PASS; JSON SHA-256 `e488372853af1746521499c69067271ac3c639a221dff46234b532a24a9285bc` |
| Vercel Production deployment | `dpl_HYeEvgN7dWGDBVpyHFBmphjwnZcG`, READY, alias `opscore-platform.vercel.app` |
| Vercel served source commit | `95b39f578ef7d1fda1b371237be627e71da3f1cf` — older than current main |
| Neon project / Primary | `summer-leaf-18448271` / `br-proud-salad-bcshhdap` |
| Neon database / PostgreSQL | `opscore_acceptance` / PostgreSQL 18.7 |
| Neon organization plan | Free |
| Manual Neon snapshot | `snap-aged-thunder-bcsxc1a5` |
| Restore branch metadata | `br-calm-poetry-bc7l7wik`, ready, restored from the exact snapshot and reports `restored_as` Primary |

## Closed and evidenced

| Item | Result | Evidence boundary |
|---|---|---|
| Protected merge gate | PASS | `vercel-contract-verify` requires both `vercel-source-verify` and `deploy-bound-postgres-18-acceptance`; both passed on PR #285 and again on current main |
| Source / regression / mobile checks | PASS | OpsCore CI and Vercel source verification succeeded on current main |
| Disposable PostgreSQL 18 acceptance | PASS | PostgreSQL 18.7/PostGIS service, migrations, tenant RLS, composite FKs, HTTP acceptance, restore drill and source-derived tenant matrix passed inside disposable CI databases |
| Signed-tenant route coverage | 67/67 PASS | 67 unique routes, 0 failures, sidecar SHA-256 matches the exact JSON; evidence class is `DISPOSABLE_POSTGRESQL_18_CI_ROUTE_PROBES`, not Production |
| Live Primary migration ledger | 68/68 source SHA-256 matches | Every `schema_migrations` filename has a same-named source file on main; all 68 exact UTF-8 file contents were hashed with PostgreSQL `pgcrypto.digest` in transactions beginning `SET TRANSACTION READ ONLY`; no mismatch or missing source file |
| Migration 056 attestation | PASS | Runtime-callable attestation confirms migration 056 recorded and its official source hash matches; latest ledger file is migration 069, count 68 |
| Runtime role boundary (catalog) | PASS | `opscore_runtime` is non-superuser, cannot create databases/roles, does not bypass RLS, has no role memberships and cannot directly read the migration ledger |
| Primary RLS/catalog inventory | PASS within stated scope | 136 public base tables; 135 have RLS enabled and FORCE RLS. The only non-RLS table is PostGIS extension-owned `spatial_ref_sys` (owner `cloud_admin`) |
| RLS policy inventory | Measured | 135 tables with policies; 278 policies total (134 restrictive, 144 permissive) |
| SECURITY DEFINER search-path audit | PASS within stated scope | 11 public SECURITY DEFINER functions; all 11 have the expected pinned search path |
| Foreign-key inventory | Measured, not a full tenant-FK proof | 292 FKs total, 77 composite FKs; this count alone does not certify every tenant relationship |
| HMAC secret classification | PASS | Production `OPSC_TENANT_CONTEXT_HMAC_KEY` and `OPSC_TENANT_CONTEXT_KEY_JSON` are present as Vercel Sensitive/Secret; secret bytes were not read or included in evidence |
| Read-only discipline for this audit | PASS | Live database audit queries ran in explicit read-only transactions; no Production DDL/DML, branch changes, snapshot changes, environment edits or deployment promotions were performed |

Read-only audit evidence:
- `docs/ops/evidence/PRODUCTION_PRIMARY_READ_ONLY_AUDIT_2026-11-19.json`
- SHA-256 sidecar: `docs/ops/evidence/PRODUCTION_PRIMARY_READ_ONLY_AUDIT_2026-11-19.json.sha256`
- Audit JSON SHA-256: `0f803fa0b881c978229e1113e4547d9332edb1151815e2bf5d239a6e308dce40`

## Open Production and commercial gates

| Gate | Verified state | Required closure evidence |
|---|---|---|
| Exact-current-main Production deployment | OPEN | Current Production alias still serves commit `95b39f5…`, not `0edd7d8…`. A deployment of current main must be built and staged, then validated against the exact commit and run identity before any promotion |
| Production release flags | NOT CERTIFIED | `OPSC_RELEASE_VERIFIED=false`; `OPSC_PRODUCTION_ISOLATION_CERTIFICATION=NOT_CERTIFIED`; `OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE=false`. These must not be changed to passing values without their exact underlying evidence |
| Production signed-tenant 67-route behavior | NOT ESTABLISHED | Requires a Production/candidate-bound two-tenant signed-session probe: own-tenant reads/writes, cross-tenant denial, session/PID/transaction binding, raw tenant-GUC tamper denial, all 67 routes, exact deployment/commit/pipeline/Primary/manifest binding and zero residue. CI 67/67 cannot substitute for this |
| Production proof bootstrap / trusted candidate probe | OPEN | The candidate-probe path must prove its Vercel Trusted Source identity, exact deployment-host binding, token scope, route allowlist, expiry/revocation and cleanup. Do not infer readiness from a merged code path or a skipped deployment job |
| Full Neon Primary restore proof v2 | NOT VERIFIED | The restore branch metadata is ready and identifies the exact source snapshot/Primary, but the formal proof still requires canonical schema-definition parity, complete public table inventory and row-content parity, exact migration-ledger parity, signed-context schema checks, runtime-role boundary and all nine required checks. No PASS proof file may be synthesized from branch metadata alone |
| Neon Primary protection and automated backups | OPEN / PLAN-LIMITED | Primary is currently `protected=false`; snapshot schedule is empty; the organization is on Free. Neon documents protected branches and scheduled backup features on paid plans. Any plan change, recurring backup schedule or protection change requires budget/owner authorization |
| Production Vercel plan / commercial entitlement | NOT VERIFIED | The connected team response did not expose the plan. Verify the actual entitlement before claiming commercial hosting. Vercel Hobby is restricted to personal/non-commercial use; commercial use requires an eligible commercial plan |
| Current-main buyer release archive | NOT PRODUCED | Generate the archive, file-level hashes, SBOM, provenance and external release statement only after technical release gates pass, all bound to the exact current main/deployment |
| Distribution/license authority | NOT EVIDENCED HERE | Do not claim buyer license or commercial distribution rights without rights-holder approval and a signed License Schedule bound to the exact deliverable SHA-256 |
| Buyer-side acceptance | OPEN | Buyer-owned provider credentials, app signing/store listing, customer environment, licensed maps, device acceptance and language/native-speaker review remain distinct buyer-side gates |
| WAF / dependency risk operations | NOT RE-CERTIFIED IN THIS AUDIT | Any previous WAF Log-mode or dependency-advisory residual must remain explicitly tracked until a fresh current-head review establishes closure; no WAF enforcement mode was changed in this round |

## Production environment facts that must not be misrepresented

- Vercel Production alias `opscore-platform.vercel.app` currently points to `dpl_HYeEvgN7dWGDBVpyHFBmphjwnZcG` (READY), whose Git commit is `95b39f578ef7d1fda1b371237be627e71da3f1cf`.
- Current repository main is `0edd7d8c855e1dd4645979c05fd30be105dff369`; these are different commits.
- Production values read for this audit: `OPSC_PRODUCTION_HOLD=false`, `OPSC_RELEASE_VERIFIED=false`, `OPSC_PRODUCTION_ISOLATION_CERTIFICATION=NOT_CERTIFIED`, `OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE=false`.
- The main push workflow completed successfully, but its Production deploy job was `SKIPPED`. CI success does not prove a new Production deployment.
- Neon Primary has four retained branches listed in the audit evidence; none was deleted or renamed.
- The Neon Free plan exposes one manual snapshot and no schedule in the current project settings. The branch metadata for a completed restore is not the complete v2 schema/data parity proof.

## Required operating boundaries

1. Do not set `OPSC_RELEASE_VERIFIED=true` or `OPSC_PRODUCTION_ISOLATION_CERTIFICATION=CERTIFIED` until exact-current-deployment behavioral and restore evidence has passed.
2. Do not promote a deployment whose source SHA, run identity, environment, database identity, signed-session matrix or rollback proof differs from the exact candidate.
3. Do not apply migrations 063–069 again: the 68-row Primary migration ledger matches the current-main source files by SHA-256.
4. Do not modify Neon Primary, run live fixture writes, delete recovery branches/snapshots, change plan/backup settings, or alter Vercel Production variables without a specifically authorized, reviewed operation and rollback plan.
5. Do not treat `READY` as current-main, CI 67/67 as Production isolation, restored branch metadata as full restore parity, or a CI restore drill as a Production backup/RPO guarantee.
6. Keep each future status report separated into `verified`, `recommended`, `unresolved` and `not verified` items. Do not claim commercial or Production closeout while any open gate above remains.
