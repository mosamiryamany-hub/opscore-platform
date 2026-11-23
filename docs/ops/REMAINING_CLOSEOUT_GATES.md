# OpsCore — current-main, live Production, and closeout ledger

**Evidence cut:** 2026-11-19  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Protected main at evidence cut:** `d672dce8f18e1d7095aed3126aedb0f995796144`  
**Latest live Production deployment:** `dpl_AgWqB4kaSRXhdsmKfvXg9qgeQgt9`  
**Production application-code SHA:** `68505535f1c2fabd2a786094f8f64d234d26e123`  
**Product/runtime version reported live:** `0.11.62`

> **Decision:** Protected `main` at this evidence cut is `d672dce8...` after PR #292, which changes the trust-proof UI. Production remains on the earlier application SHA `68505535...`; the new main commit has a READY but SSO-protected Preview only. The live site and `/login` route remain healthy. Release proof remains UNVERIFIED; Production isolation remains NOT_CERTIFIED. This is not a Production or commercial closeout.

## 1. Immutable and live references

| System | Verified state |
|---|---|
| GitHub main at evidence cut | Protected; `d672dce8f18e1d7095aed3126aedb0f995796144` |
| PR #287 | Merged; added explicit `GET/HEAD /login` redirect and HTTP smoke coverage |
| PR #288 | Merged at current main; hardens public source/CI/package trust proofs against stale environment-only assertions |
| Vercel project | `opscore-platform` / `prj_8jMqBt0l6OALicWSwQ3ECQTn8yPe` |
| Current-main Preview | READY; `dpl_DCQk2TbxtCoMHLDCEQ8pN4W33ay1`; SSO-protected; no Production promotion |
| Vercel Production deployment | `dpl_AgWqB4kaSRXhdsmKfvXg9qgeQgt9`, READY |
| Public Production alias | https://opscore-platform.vercel.app |
| Live application-code SHA | `68505535f1c2fabd2a786094f8f64d234d26e123` — prior Production version; it does not include evidence-cut main revision `d672dce8...` |
| Neon project | `summer-leaf-18448271` / PostgreSQL 18.7 |
| Neon Primary | `br-proud-salad-bcshhdap` / ready / primary / default / **not protected** |
| Neon restore branch | `br-calm-poetry-bc7l7wik` / ready; restored from `snap-aged-thunder-bcsxc1a5` |

## 2. Current-main CI

| Run | Result | What it proves |
|---|---|---|
| [OpsCore CI — 44552772156](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44552772156) | SUCCESS | Latest source/regression/performance/security/mobile CI suite |
| [PostgreSQL 18 acceptance — 44552772494](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44552772494) | SUCCESS | Source verification, disposable PostgreSQL 18 acceptance, 346-route CI matrix, RLS, composite FK, HTTP and 137-table logical restore drill |
| [PR #288 — 44533613579](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44533613579) | SUCCESS | Trust-hardening regression checks on the pre-merge head |
| [PR #288 Vercel contracts — 44533613473](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44533613473) | SUCCESS | Source, disposable PostgreSQL 18, and vercel-contract checks |

Run 44533918970 is a `push` event. Its `deploy` job is **SKIPPED by design**, because the workflow only runs the deploy job for an explicitly dispatched `workflow_dispatch` run. A green workflow on a push is not a Production deployment.

## 3. Exact live endpoint results

Public endpoints were fetched directly at approximately 2026-11-19 13:35 UTC.

| Endpoint | Live result | Interpretation |
|---|---|---|
| [`/api/health`](https://opscore-platform.vercel.app/api/health) | HTTP 200-equivalent response; `healthy`, PostgreSQL, version `0.11.62` | Site/runtime availability only |
| [`/login`](https://opscore-platform.vercel.app/login) | **307 redirect** to `/control-plane.html` | PR #290 is deployed |
| [`/api/verify/release`](https://opscore-platform.vercel.app/api/verify/release) | `UNVERIFIED`; source identity `unverified`; embedded CI `UNVERIFIED`; package SHA null; Production acceptance `NOT_VERIFIED` | No release certification; CI passes are linked separately |
| [`/api/verify/deployment`](https://opscore-platform.vercel.app/api/verify/deployment) | `identified`; `commitIdentitySource=vercel-git-metadata` | Native Vercel Git source identity; not a GitHub Actions assertion |
| [`/api/verify/database-security`](https://opscore-platform.vercel.app/api/verify/database-security) | `IDENTITY_PLANE_RLS_ENFORCED`; 135/136 public tables RLS+FORCE RLS; runtime least-privilege status present | Live catalog controls, not cross-tenant behavioral certification |

### Live trust-proof discrepancy — root cause and code fix

The current live deployment includes PR #288's fail-closed verifier:
- `/api/verify/deployment` used raw Vercel Production environment values when the generated identity file was absent.
- `/api/verify/release` separately required the embedded identity file, but stale environment values could still make CI and package fingerprint fields appear `PASS` / `PUBLISHED`.
- This explains why native Git deployment identification does not create a signed Actions attestation: the deployment verifier reports Vercel Git metadata, while the release verifier requires a separate identity artifact embedded in the deployed bundle.

PR #288 is merged in current main and changes both verifiers:
- environment-only `OPSC_RELEASE_DEPLOYMENT_SOURCE`, `OPSC_RELEASE_CI_*`, source-commit, package-fingerprint, CI, and release-tag values are discarded when the identity artifact is absent;
- only a validated identity JSON embedded in that exact deployed bundle may assert GitHub Actions CLI identity, pipeline, and package fingerprint;
- tests inject stale/forged variables to verify fail-closed behavior.

**Current behavior:** both live endpoints are consistent. `/api/verify/deployment` identifies the deployed SHA through native Vercel Git metadata. `/api/verify/release` remains UNVERIFIED because no validated GitHub Actions identity JSON is embedded in the exact bundle. SHA-256 is UNVERIFIED with a null digest; this is not a failed hash calculation.

## 4. Why Production did not update

The workflow `.github/workflows/vercel-deploy.yml` explicitly prevents automatic Production deployment on push. The deploy job requires a manual dispatch on `main` using either:
- `CANDIDATE_EVIDENCE_ONLY`, or
- `AUTHORIZE_PRODUCTION_RELEASE` plus the explicit confirmation and owner-controlled readiness variables.

The authorized attempt [44529428910](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44529428910) passed source verification, disposable PostgreSQL 18 acceptance, and the contract check, but failed at step 13, **Preflight Vercel and Neon paid-plan and branch capacity**. Candidate build, evidence embedding, live 67-route probes, session/recovery probes, certification, and promotion were skipped.

The read-only preflight source requires:
- Vercel team plan `Pro` or `Enterprise`;
- Neon organization plan `Launch`, `Scale`, `Business`, or `Enterprise`;
- Neon Primary branch ready, primary/default, and `protected=true`;
- branch capacity and logical-size checks.

Current Neon API data reports the organization plan as `free_v3`; Primary `protected=false`; 4 branches retained out of the configured limit 10; no scheduled snapshot/PITR schedule. The most recent Vercel project metadata does not expose its billing tier; the last failed deploy-preflight is the authoritative observed gate failure. Prior account inspection identified the Vercel Hobby tier; verify the current team billing page before purchase or dispatch.

No plan upgrade or billing change was made.

## 5. Neon data recovery posture

| Check | Result |
|---|---|
| PostgreSQL | 18.7 |
| Neon organization plan | Free (`free_v3`) |
| Primary state | Ready / primary / default |
| Primary protection | `false` |
| Branches retained | 4 |
| Scheduled snapshot/PITR schedule | Empty |
| Retained snapshot | `snap-aged-thunder-bcsxc1a5` |
| Restore branch | `br-calm-poetry-bc7l7wik`, ready |
| Exact row-content parity | **NOT VERIFIED** |

A read-only comparison over 136 public base tables found six differing tables between Primary and the retained restore branch: `activity_log`, `audit_log`, `firewall_rate_buckets`, `integration_outbox`, `organizations`, and `users`. The differences may reflect legitimate writes since the snapshot; they are not proof of snapshot corruption. They do mean full data parity is not established. Keep Primary and every recovery branch/snapshot; do not promote or delete the restore artefacts.

The live database-security endpoint reports 135/136 public base tables with RLS enabled and FORCE RLS; the single catalog exception is PostGIS-owned `spatial_ref_sys`, whose runtime write access count is zero. It also reports no non-PostGIS table lacking RLS/FORCE RLS and a least-privilege runtime role. This remains catalog evidence, not a two-tenant live application behavior test.

## 6. Current hard gates

| Gate | State | Closure evidence |
|---|---|---|
| Current-main CI | **PASS** | Current evidence-cut runs `44552772156` and `44552772494` (see links above) |
| Current application code deployed to Production | **NOT CURRENT** | Deployment `dpl_AgWq...` runs `68505535...`; evidence-cut main revision `d672dce8...` includes PR #292 trust UI not yet in Production; Preview only is READY |
| Live `/login` route | **PASS** | Production redirects to `/control-plane.html` |
| Trust-proof discrepancy | **RESOLVED** | Deployment proof identifies Vercel Git metadata; release proof correctly remains unverified without embedded Actions identity |
| Embedded build identity and package fingerprint | **OPEN** | Must be generated and embedded in the exact deployed bundle; environment-only variables do not count |
| Current Production acceptance evidence | **NOT_VERIFIED** | Exact deployment/run/database-bound evidence file and recomputed SHA-256 |
| 67-route signed-tenant Production coverage | **NOT_VERIFIED** | All 67 routes, two signed tenants, exact deployment/run/Primary binding, cleanup verified |
| Production session tenant boundary | **NOT_VERIFIED** | Exact-deployment dual-tenant HTTP session proof, cross-tenant denial, cleanup |
| Production recovery / PITR | **NOT_VERIFIED** | Exact Primary recovery point, verified restore, data parity, and signed manifest |
| Production-wide isolation certification | **NOT_CERTIFIED** | All route, session, recovery, acceptance, identity, and explicit certification gates pass together |
| Neon Primary protection and automated backups | **PLAN-LIMITED** | Eligible plan, protected Primary, supported schedule, and fresh verified restore |
| Current-main buyer release archive / SBOM / provenance | **NOT PRODUCED** | Successful Secure Release workflow on exact current main |
| Terms / Privacy / Pricing pages | **NOT PUBLISHED** | Approved legal entity, jurisdiction, data practices, contact, and price copy |
| External 60-second monitoring | **NOT CONFIGURED** | Supported external monitor and authorized budget |
| License / distribution authority | **NOT GRANTED** | Rights-holder authority and signed License Schedule bound to delivered archive SHA-256 |

No buyer signature is required to record the engineering state of the project. However, no buyer-specific use, resale, or distribution rights are granted until the rights-holder executes the relevant License Schedule.

## 7. Operational boundaries

1. Do not mark a release or isolation certification flag manually.
2. Do not use direct Vercel API deployment/promotion as a substitute for the authorized workflow or embedded identity.
3. Do not change Primary data, promote the restore branch, delete any branch/snapshot, or rewrite database credentials to make a gate appear green.
4. Do not disable SSO or security controls to expose Preview deployment endpoints.
5. Do not create legal, privacy, pricing, or license terms with invented legal entity details or rights.
6. Keep all buyer-facing claims bound to the live public proof endpoints and exact archive SHA-256.

## 8. Current closeout decision

**Engineering source:** protected `main` at the evidence cut (`d672dce8...`); PR #292 is merged and current-main source/isolated PostgreSQL CI passed in runs `44552772156` and `44552772494`.  
**Hosted Production:** healthy but not current; deployment `dpl_AgWq...` still runs application SHA `68505535...`; `/login` redirects to Control Plane. The `d672dce8...` Preview is READY and SSO-protected, not promoted.  
**Production certification:** open; no 67-route live certification, exact Production session proof, or exact Production recovery proof.  
**Commercial/legal delivery:** open; current-main release archive/provenance and license grant not established.

This is the honest, buyer-safe state. It must not be described as Production-ready, commercially closed, or fully certified.
---

## 9. Superseding full-site closeout scope — 2026-11-23

This section supersedes Sections 1, 4, 5, 6 and 8 above wherever they classify the seller Vercel website, the seller Production deployment or the seller Neon database as out of scope. Those sections remain as historical evidence and are not the current acceptance scope.

**Product being closed:** the complete hosted product — source and release package, the seller website on Vercel, the seller Production deployment, the Neon production database with periodic backup and a full restore test, and the commercial/legal pages — each proven on the same commit and the same deployment id.

**Measured state (2026-11-23):** `main` = `fbc4a3082325dff98e2ed41fffe42c3d76863254`; live `/api/verify/release` reports `sourceCommit: 88df9046ea5d57b392530565bc8cf6a10627ac4a` and deployment `dpl_FVXwPoqefvkNsxA3BqVrxYnxRQka`, so the deployed commit is **not** `main`; `/api/verify/database-security` reports `productionIsolationCertification: NOT_CERTIFIED` on a catalog-only scope while `/api/verify/release` reports `CERTIFIED`; `/terms`, `/privacy`, `/refund`, `/pricing`, `/legal` and `/security` return **HTTP 404** on the live domain.

**Open gates:**
- Three red checks on PR #401 (`verify`, `vercel-contract-verify`, `vercel-source-verify`).
- Production identity divergence between `main` and the deployed commit; a new deployment must go through the gated release workflow, never a direct publish.
- Reconciliation of the `CERTIFIED` / `NOT_CERTIFIED` proof disagreement at the source, both bound to the same deployment id.
- Six missing commercial/legal pages, blocked on owner-supplied legal entity, jurisdiction, contact, refund, price and licence data.
- No periodic external backup, no automated digest/freshness check and no scheduled restore drill; Neon Free history window is 6 hours, not zero-loss.
- Vercel firewall posture is log-only and is not evidenced as enforcement.

**No paid upgrade is authorized by this document.** Preserve Neon branches, snapshots and Production data.

See [Full-site closeout scope](../commercial/SELLER_CODE_ONLY_CLOSEOUT_2026-11-23.md). Closeout remains **OPEN**.
