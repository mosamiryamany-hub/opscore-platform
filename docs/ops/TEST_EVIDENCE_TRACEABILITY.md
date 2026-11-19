# OpsCore — Test Evidence Traceability

**Evidence date:** 2026-11-19 15:17 UTC  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Current main:** `d672dce8f18e1d7095aed3126aedb0f995796144` (PR #292 trust-proof UI merged)
**Current Production application-code SHA:** `68505535f1c2fabd2a786094f8f64d234d26e123`  
**Evidence rule:** A successful job proves only the environment and scope it actually exercised. CI/isolated PostgreSQL evidence is not Production tenant-isolation certification.

## 1. Current-main successful test runs

**Current main:** `d672dce8f18e1d7095aed3126aedb0f995796144`  
**Current live Production application-code SHA:** `68505535f1c2fabd2a786094f8f64d234d26e123` — not yet updated to current main  
**Current-main Preview:** `dpl_DCQk2TbxtCoMHLDCEQ8pN4W33ay1` — READY, exact current-main SHA, SSO-protected, not Production

### Run 44552772156 — OpsCore CI on current main

[Open workflow run](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44552772156)

**Result: SUCCESS.** Current-main source/regression/performance/security/mobile CI completed. The new release-proof display regression passed **2/2**, along with the release proof UI tests (2/2) and release proof regression suite (17/17).

### Run 44552772494 — source and disposable PostgreSQL 18 acceptance on current main

[Open workflow run](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44552772494)

| Job | Result | Verified work | Scope boundary |
|---|---|---|---|
| `vercel-source-verify` | SUCCESS | Syntax, runtime identity/release contracts, regression, provenance and dependency checks | Source/CI |
| `isolated-postgres-rls-and-http-acceptance` | SUCCESS | Disposable PostgreSQL 18, least-privilege roles, migrations, signed tenant context, 346-route source-derived matrix, RLS, composite tenant FKs, HTTP acceptance, login throttling and logical dump/restore drill over 137 tables | Disposable database only |
| `vercel-contract-verify` | SUCCESS | Enforces source and isolated PostgreSQL acceptance | Contract gate |
| Neon Preview migration/HTTP acceptance | SKIPPED | Not run | No Neon Preview acceptance evidence |
| Production Neon PITR historical branch probe | SKIPPED | Not run | No Production recovery evidence |
| Production deploy | SKIPPED | Push event; official workflow requires explicit workflow dispatch and authorization | No Production deployment evidence |

The 346-route matrix and 137-table logical restore are CI/disposable-database results. The restore drill explicitly does not restore ownership/ACLs and is not Neon PITR or Production restore evidence. The logs expressly preserve `productionCertification=false`; these passes do not certify Production tenant isolation.

## 1A. Historical successful test runs (PR #291)



### Run 44547562235 — OpsCore CI for PR #291

[Open workflow run](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44547562235)

**Result: SUCCESS.** Completed steps included syntax and production deployment/preflight/identity contracts; OIDC and logical restore safety; hardened metadata; backend release regression; deterministic performance regression; provenance; security dependency audit; mobile source/contract verification; and mobile dependency audit.

### Run 44547562215 — source and disposable PostgreSQL 18 acceptance

[Open workflow run](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44547562215)

| Job | Result | Verified work | Scope boundary |
|---|---|---|---|
| `vercel-source-verify` | SUCCESS | Source syntax, runtime/identity/restore contracts, regression, provenance, dependency and route contracts | Source/CI |
| `isolated-postgres-rls-and-http-acceptance` | SUCCESS | PostgreSQL 18 disposable DBs, least-privilege roles, full migrations, signed tenant context, 67-route matrix, RLS, composite FK, HTTP acceptance, login throttling, logical dump/restore and evidence export | Disposable DB, not Production |
| `vercel-contract-verify` | SUCCESS | Enforces source and isolated PostgreSQL acceptance | Contract gate |
| Production deploy | SKIPPED | Not run in PR workflow | No Production evidence |
| Neon Preview acceptance | SKIPPED | Not run | No Preview evidence |
| Production Neon PITR probe | SKIPPED | Not run | No Production recovery evidence |

PR #291 head `f3ab1791cf5979eda49702b19802db7dc4d0f8e4` differed from deployed application commit `68505535...` only by the added evidence ledger file; application code was unchanged. It was merged as `66d1b564...`.

## 1A. Earlier successful test runs retained as history

### Run 44533918970 — current-main push workflow before PR #290

[Open workflow run](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44533918970)

| Job | Result | Verified work | Scope boundary |
|---|---|---|---|
| `vercel-source-verify` | SUCCESS | Syntax; production runtime diagnostic contracts; OIDC/logical-restore safety contracts; hardened metadata gate; backend release regression; recorded evidence/provenance; dependency audit; per-route functional contract acceptance; mobile dependency audit | Source/CI |
| `isolated-postgres-rls-and-http-acceptance` | SUCCESS | Disposable PostgreSQL 18; least-privilege runtime/migration roles; full migrations; signed tenant context through real Node PostgreSQL worker; 67-route evidence validation; logical dump/restore drill; migration ledger attestation; isolated RLS; composite tenant FK integrity; HTTP acceptance as `opscore_runtime`; login throttling; caller-bound evidence export | Disposable isolated PostgreSQL, not Neon Production |
| `vercel-contract-verify` | SUCCESS | Enforces source and disposable PostgreSQL acceptance | Contract gate |
| Production deploy | SKIPPED | Not run on push event | No Production deployment evidence |
| Neon Preview acceptance | SKIPPED | Not run | No Preview evidence |
| Production Neon PITR historical branch probe | SKIPPED | Not run | No Production recovery evidence |

### Run 44540238937 — PR #290 checks

[Open workflow run](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44540238937)

| Job | Result | Verified work | Scope boundary |
|---|---|---|---|
| `vercel-source-verify` | SUCCESS | Same source-level regression, metadata, dependency, provenance, and route-contract suite | PR source |
| `isolated-postgres-rls-and-http-acceptance` | SUCCESS | Same disposable PostgreSQL 18 signed-tenant, 67-route, logical restore, RLS, composite-FK, runtime HTTP and evidence-export steps | Disposable isolated PostgreSQL, not Neon Production |
| `vercel-contract-verify` | SUCCESS | Source and isolated PostgreSQL contract enforcement | Contract gate |
| Production deploy | SKIPPED | Not run in this PR check workflow | No Production deployment evidence |
| Neon Preview acceptance | SKIPPED | Not run | No Preview evidence |
| Production Neon PITR historical branch probe | SKIPPED | Not run | No Production recovery evidence |

PR #290 merged as main commit `68505535f1c2fabd2a786094f8f64d234d26e123`. It adds and tests the explicit `GET/HEAD /login` 307 redirect to `/control-plane.html`, `Cache-Control: no-store`, and a 405 response for unsupported methods.

## 2. Test-to-gate mapping

| Gate / claim | Existing evidence | Correct status |
|---|---|---|
| Source syntax and regression | Successful source-verification jobs above | **PASS — CI scope** |
| Runtime diagnostic / OIDC / restore safety contracts | Successful source-verification jobs above | **PASS — contract scope** |
| PostgreSQL 18 migration and runtime acceptance | Successful isolated PostgreSQL job above | **PASS — disposable DB scope** |
| RLS behavior in isolated acceptance DB | Successful isolated RLS gate | **PASS — isolated DB scope** |
| Signed tenant context and 67-route matrix | Evidence validation and source-derived route matrix succeeded in disposable PostgreSQL | **PASS — CI/isolated DB only** |
| Composite tenant FK integrity | Composite-FK gate succeeded in disposable PostgreSQL | **PASS — tested isolated DB scope** |
| Logical dump/restore drill | Real logical dump/restore step succeeded in disposable PostgreSQL | **PASS — disposable DB recovery drill** |
| Production tenant isolation across 67 routes | No live Production dual-tenant route run is present in these runs | **NOT VERIFIED in Production** |
| Production tenant session boundary | No exact-live-deployment dual-tenant HTTP/session proof is present | **NOT VERIFIED in Production** |
| Neon Production PITR / full recovery parity | Production PITR job was skipped; retained restore differs in six table comparisons per prior read-only report | **NOT VERIFIED** |
| Production RLS configuration | Separate live database-security endpoint reported catalog configuration (135/136 public tables RLS+FORCE RLS; PostGIS-owned `spatial_ref_sys` exception) | **CATALOG EVIDENCE ONLY; not behavioral tenant certification** |
| Current Production deployment identity | Must be checked against the deployed bundle and embedded identity, not stale environment values | **NOT ESTABLISHED by these CI runs** |
| Current-main signed release archive / SHA-256 / SBOM / provenance | No successful Secure Release artifact run is established by these two runs | **NOT PRODUCED / NOT VERIFIED** |
| Neon Primary protection and scheduled backups | Neon API previously rejected Primary protection due plan cap; snapshot schedule creation returned not enabled | **PLAN-LIMITED / NOT CONFIGURED** |

## 3. Why successful tests did not issue Production certificates

The CI jobs exercise disposable resources created for acceptance and clean them up. They do not authenticate two real Production tenants against the public Production deployment, do not prove cross-tenant denial on every live route, and do not restore the live Primary into a verified exact-parity state. The skipped jobs are not failures, but they are also not evidence of success.

The successful logical restore drill is valuable: it verifies the tested PostgreSQL dump/restore procedure in its disposable acceptance scope. It must not be relabelled as proof that Neon Production PITR, a Production recovery point, or full live data parity has been verified.

## 4. Reuse policy — avoid needless reruns

1. Reuse these successful commit/run-bound CI results while their source commit and workflow inputs remain applicable.
2. Do not rerun the full suite solely to change a dashboard label.
3. Rerun only when source changes invalidate the relevant evidence, an evidence artifact is missing/expired, or a required environment-specific gate was not executed.
4. For Production-only gates, run the authorized workflow against the exact current deployment and Primary using approved test tenants and verify cleanup. Never substitute CI fixtures or production customer records.
5. Never manually set certification flags or convert `PASS — CI scope` into `PASS — Production`.

## 5. Current engineering conclusion

The successful tests have real value and are recorded as successful within their actual scopes. They establish source/CI regression quality and substantial PostgreSQL 18 isolated acceptance coverage, including signed-tenant route checks and a real logical restore drill. They do **not** establish Production tenant isolation, Production PITR/recovery parity, an embedded identity for the live deployment, or a signed current-main release package.

This traceability record is an evidence map, not a Production certificate or commercial release declaration.
