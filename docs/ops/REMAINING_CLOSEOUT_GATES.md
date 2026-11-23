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


---

## 10. Latest measured full-site status — 2026-11-23

This section supersedes Section 9's stale evidence cut and gate statuses. PR #401 is merged; the current `main` evidence cut is `5e3cb211b7660002418757612033ff8928f25b69`.

### Verified in this evidence cut

- OpsCore CI `45129195704`: success; release runner 990 total, 987 pass, 0 fail, 3 skipped (`PASS_WITH_SKIPS`).
- Isolated PostgreSQL 18 acceptance `45129195834`: success; PostgreSQL HTTP acceptance 1/1, firewall shared rate limiter 1/1, tenant matrix 2/2, route matrix 346 routes, logical restore drill 137 tables. The three DB-gated files skipped in the generic runner were executed separately in this job with zero skips.
- Neon restore branches `br-calm-poetry-bc7l7wik` and `br-orange-union-bc90bp8r` originate from `snap-aged-thunder-bcsxc1a5`; SHA-256 row-content digests matched across 136/136 public base tables.
- Vercel active firewall configuration read: firewall enabled; `gen`, `rce`, `sqli`, `xss` and Bot Protection are log-only; no IP allow/deny rules; auth edge rate limit is active at 60 requests/IP/60 seconds. Active attack status returned no anomalies.

### Open gates — current measured state

| Gate | State | Evidence / required action |
|---|---|---|
| Current `main` deployed to Production | **OPEN** | Public domain `opscore-platform.vercel.app` resolves to `dpl_FVXwPoqefvkNsxA3BqVrxYnxRQka` / commit `88df9046...`. A separate READY Production-target deployment `dpl_9Xnqs1UrK74N7YpVr6s11S2KJ2Ur` exists for `5e3cb211...` but has `alias=[]`; current main `3f7d9110...` has zero Production deployments. |
| Production release workflow | **NOT RUN** | Run `45129195834` was a push; its Production deploy job was skipped. Workflow requires `workflow_dispatch` with `run_mode=AUTHORIZE_PRODUCTION_RELEASE` |
| Same-final-deployment certification | **OPEN** | Evidence is pinned to `OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID`; workflow later builds a separate staged deployment. Redesign required so every behavioral proof is bound to the final promoted deployment ID |
| Certification flag semantics | **OPEN** | `OPSC_PRODUCTION_ISOLATION_CERTIFICATION=CERTIFIED` is a text environment flag. It cannot independently establish certification; derive status from exact, signed, deployment-bound evidence |
| Catalog vs behavioral proof naming | **OPEN** | Database-security endpoint is catalog-only and returns `NOT_CERTIFIED`; release endpoint uses behavioral evidence. Public field names/scopes must be explicit and non-ambiguous |
| Neon Primary protection | **PLAN-LIMITED** | Primary is `protected=false`; Neon rejected protection because the Free plan limit was reached. No upgrade or branch unprotection performed |
| Neon scheduled backups | **PLAN-LIMITED** | Schedule is empty; Free plan has one manual snapshot and no scheduled backup schedules. Existing snapshot preserved; paid upgrade not authorized |
| Neon Production current-state restore parity | **NOT VERIFIED** | Two restored branches match each other 136/136 by SHA-256, but are from the 2026-11-19 snapshot. Primary is newer: seven row-count differences; migration ledger 70 vs 68. Not evidence of corruption, not current-primary parity |
| WAF enforcement | **OPEN** | CRS/Bot Protection log-only. Auth rate limit is active; active attack query had no anomalies. An approved blocking policy and observed block test are still needed |
| Six legal/commercial pages | **BLOCKED ON OWNER DATA** | `/terms`, `/privacy`, `/refund`, `/pricing`, `/legal`, `/security` were reported 404. Legal entity, jurisdiction, contact, privacy/data practices, refund policy, price/currency/tax, and license limits required |
| Historical credential exposure | **OPEN / SECURITY PRIORITY** | Revoke GitHub PAT, Vercel token and Neon API key in provider consoles; replace corresponding GitHub Actions secrets. Do not paste credentials into chat |
| Exact-current-main release archive | **OPEN** | Previous Secure Release artifact is bound to `fbc4a308...`; regenerate SBOM, archive SHA-256 and signature on `5e3cb211...` |
| External certification | **NOT EVIDENCED** | Internal CI/SBOM/Sigstore is not ISO/SOC 2/PCI or third-party certification |
| License/distribution authority | **NOT GRANTED** | `UNLICENSED`; signed rights-holder License Schedule required before any buyer use or distribution |

### Resource and safety decisions

- No Neon/Vercel paid upgrade.
- No branch, snapshot, database row, restore artifact, or Production environment variable was deleted or promoted.
- The attempted Neon Primary protection change failed at the provider plan limit; no other branch was unprotected to make room.
- No Production deployment was created through a direct API or CLI shortcut; only the gated workflow is acceptable.
- No legal text, pricing, refund policy, certification or license grant is invented.

**Current decision: OPEN.** Engineering CI and disposable PostgreSQL acceptance pass, but live Production identity, same-deployment proof, WAF enforcement, legal pages, credential rotation, scheduled backup strategy, exact-main release package, and license authority remain unresolved.


Official Neon limits used for this classification: [Neon plans](https://neon.com/docs/introduction/plans) and [Backup & Restore](https://neon.com/docs/guides/backup-restore). Free includes one manual snapshot and a six-hour history window; automated backup schedules are paid-plan functionality.


### Exact same-deployment evidence gap

Historical Production run `45116314003` used held probe deployment `dpl_7PcZ9ym1nc1vEJqPssYioPLEBJd6`, then promoted staged deployment `dpl_FVXwPoqefvkNsxA3BqVrxYnxRQka`. The production probes were pinned to the first ID; the public domain served the second. Same commit and pipeline do not make these the same deployment.

PR #403 is the fail-closed code correction. Its latest OpsCore CI verify job passed; release-proof tests 18/18 and production-candidate environment tests 9/9 passed, with full backend runner 990/987/0/3 (`PASS_WITH_SKIPS`). CodeQL and Analyze checks passed. The earlier Vercel PR run `45131203007` was cancelled with zero jobs. A later PR #403 run `45131755968` on head `b3feb4b...` completed successfully: source verification, contract verification and isolated PostgreSQL 18 RLS/HTTP acceptance all PASS. Production deploy was skipped as expected for a PR; Neon Preview migration and Production PITR probes were also skipped. No Production deployment occurred. PR #403 remains open and blocked with no review submitted. The current workflow must be redesigned to persist signed evidence keyed to the final staged deployment ID (or use an equivalent same-ID promotion flow) before Production can be certified. Do not run the gated Production release until that redesign and its tests pass.


The Production database has no existing system-level deployment-attestation store. Existing `evidence_uploads` and `evidence_upload_chunks` are tenant/work-order scoped and must not be repurposed for global release proof. A new isolated attestation table, signing/verification contract, and least-privilege writer/reader grants are required; no schema was changed in this audit.


Restore-artifact preservation: the replay branch `br-orange-union-bc90bp8r` previously had a 2026-11-29 expiry. Its expiry was removed on 2026-11-23 and verified as absent; no restore branch or snapshot was deleted.


Read-only SHA-256 table-content manifest roots across 136 public base tables:
- Restore proof and replay branches both: `6f1af6f95f242e12d66e409d8c0d72b8c57132d99a629dd1085e8e61e57817b2`.
- Current Primary: `a4e9293bc9fa1628182c6e9b26fbfe1084c7781d5697c58a1ade6ec0f1266242`.
The equal restore roots verify identical table content between the two branches; the different Primary root confirms point-in-time divergence. These are diagnostic hashes, not signed backup attestations or current-Primary restore parity.


Scope limitation: the 136-table SHA-256 manifest covers the `public` schema only; `opscore_security.context_hmac_keys` was not included, so its restore parity remains unverified.
