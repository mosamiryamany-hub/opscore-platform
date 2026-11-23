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
| Neon Primary protection | **PLAN-LIMITED** | Primary is `protected=false`; Neon Free does not include protected branches, so the protection request was rejected. No upgrade or branch unprotection performed |
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


Post-merge CI evidence on main `3f7d9110f2f092e0f146b36d007345fe1977107d`: OpsCore CI `45132141296` PASS; Vercel workflow `45132141500` PASS with source, contract and isolated PostgreSQL 18 RLS/HTTP jobs PASS. Neon Preview migration, Production PITR probe and Production deploy were skipped. CodeQL run `45132141084`: Actions, JavaScript/TypeScript and Python all PASS. No Production deployment was created.


The active public deployment predates the fail-closed proof correction. Its historical `/api/verify/release = PASS` response is not accepted as final-deployment certification because the proof was bound to the held candidate deployment ID rather than the deployment serving the public domain.


## 11. Final deployment-binding evidence and remaining closeout — 2026-11-23

This section is the latest evidence cut and supersedes older deployment-binding classifications above where they conflict. Historical observations remain preserved as historical; they are not silently re-dated.

### Verified final binding

- Current `main` at this cut: `8e00b72995876910d3f21506c09f821462e24aec` (PR #417 merged; binding workflow SAN parsing and content-type validation corrected).
- Final binding workflow: [run 45236113208](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45236113208) — SUCCESS.
- Binding artifact ID: `14850520927`.
- in-toto statement SHA-256: `97208c28f918223a36a101c9cb1e19f1affa6f3c472295682425eb8330c0ff22`.
- Archive SHA-256: `47a1afb9718437c5f4c9f67c449525efed0646a98b70bdc424efe7cc54c340e0` (2,651,915 bytes; release source commit `8011bc5550372a318dbf47bf89e6837059987f58`).
- Final Vercel deployment: `dpl_6r4ZCJiuVHonja32AXhsjwMSDoig`; public alias `opscore-platform.vercel.app` verified before and after the six-request smoke sequence.
- Six public HTTPS checks passed: `/`, `/api/health`, `/api/verify/deployment`, `/api/verify/database`, `/api/verify/database-security`, `/api/verify/release` (all HTTP 200; JSON content validated for API routes).
- Source-pinned GitHub attestation, SLSA verification, original archive Cosign signature, final binding statement signature, and Vercel alias binding passed in that run.

### Evidence scope — do not overstate

- The 358-route acceptance artifact is classified as candidate-deployment-only; it is not full route acceptance for the final production deployment.
- The 67-route signed tenant artifact is disposable PostgreSQL 18 CI-only, has `deploymentId=null`, and is not Production certification.
- The binding statement associates the exact ZIP digest with the exact Vercel deployment and source commit. It explicitly does not claim that the ZIP bytes are the Vercel deployment output.
- The six HTTP checks are smoke checks, not complete route/business-flow acceptance.
- Internal isolation qualification is not ISO 27001, SOC 2, PCI DSS, or independent third-party accreditation.

### Remaining commercial/technical gates

1. **Current application-source package alignment — VERIFIED for this code delta.** GitHub compare `8011bc5550372a318dbf47bf89e6837059987f58...8e00b72995876910d3f21506c09f821462e24aec` shows exactly two added files: `.github/workflows/opscore-final-deployment-binding.yml` and `docs/release/FINAL_DEPLOYMENT_BINDING_PLAN.md`. Both are absent from the inner `OpsCore-release.zip` (936 entries), so the application payload in the existing release remains aligned with current `main` application source. Do not rebuild solely for these workflow/docs-only changes. Rebuild and regenerate SBOM/provenance only if application source, runtime dependencies/lockfiles, release metadata, or packaging inputs change.
2. Complete full final-deployment Production route and business-flow acceptance with route inventory, source commit, pipeline, deployment ID, database identity and zero unresolved failures.
3. Re-run Production tenant-boundary behavioral probes on the exact live deployment and Primary database, including raw-GUC tampering, runtime-role denials, identity-table grants, privileged helpers, AI/search pools and non-PostgreSQL workers. CI-only 67-route evidence is insufficient.
4. Establish protected scheduled backups, retention, restore rehearsal and measured RPO/RTO. No Neon/Vercel paid upgrade is authorized by this record.
5. Rehearse WAF blocking/challenge policy on Preview, inspect false positives, then capture approved production enforcement and a real block test. Log-only rules are not enforcement.
6. Publish Terms, Privacy, Refund, Pricing, Legal and Security pages only after rights-holder-approved legal entity, jurisdiction, contact, privacy/data practices, refund, pricing/tax and licensing content is supplied.
7. Execute a rights-holder and named-buyer License Schedule pinning exact artifact SHA and selected rights. Until then `licenseGrant=NONE` and `distributionAuthorized=false` remain controlling.

### Buyer-owned and third-party qualification boundaries

- I18N forensic audit: 105 selectable locales = 1 English source, 100 machine-assisted drafts, 4 English fallbacks; 0 native-speaker-reviewed and 0 production-qualified. Structural integrity PASS is not linguistic quality approval.
- Mobile source and dependency audit are included; signed Android/iOS binaries, physical-device QA, store credentials and publication are not evidenced in this package.
- Licensed maps/road routing, provider accounts, API credentials, attribution, quotas and live acceptance require buyer/provider arrangements.
- External accreditation remains absent.

Tracking issue: [#418 — remaining seller and buyer commercial gates](https://github.com/mosamiryamany-hub/opscore-platform/issues/418).

**Decision: final archive-to-deployment binding PASS; full seller commercial closeout remains OPEN/HOLD.** Preserve Neon Primary, all branches/snapshots, production settings and the current Vercel alias. Do not mark any skipped or out-of-scope check as passed.


### 11.1 Read-only Production Primary spot probe — 2026-11-23

A fresh read-only inspection of Neon project `summer-leaf-18448271`, Primary branch `br-proud-salad-bcshhdap`, database `opscore_acceptance` (PostgreSQL `18.7`) found:

- Migration ledger: 71 rows; latest filename `072_deployment_release_evidence_store.sql`, applied at `2026-11-23T08:57:33.905Z`.
- Public tables: 137; RLS enabled and FORCE RLS on 136/137. The public exception is `spatial_ref_sys`; `opscore_security.context_hmac_keys` is outside public and is not RLS-enabled.
- Runtime role `opscore_runtime`: not superuser, no BYPASSRLS, no CREATEDB/CREATEROLE. It cannot SELECT `opscore_security.context_hmac_keys`.
- Runtime-role behavioral probe used transaction-local forged `app.signed_context_payload`, invalid HMAC signature, and forged legacy tenant/user/access-mode GUCs. Results: resolved tenant NULL, resolved user NULL, resolved access mode empty, and visible row counts were zero for `activity_log`, `users`, `memberships`, and `organizations`.
- Relevant RLS policies on sessions, users, memberships, organizations, governance and tenant tables were inspected; policy expressions depend on verified context accessors, not direct raw-GUC tenant selection.

This is fresh, exact-Primary behavioral evidence for the tested forged-context denial path. It does **not** close the complete Production tenant trust-boundary gate: it is one read-only negative probe, not full signed positive-flow coverage, all access modes, all privileged-helper grants, independent AI/search pools, every non-PostgreSQL worker, or complete per-route HTTP acceptance. Keep the full gate OPEN until those scopes are evidenced.


## 12. Read-only Neon Primary inspection — 2026-11-23

**Target:** Neon project `summer-leaf-18448271`, Primary/default branch `br-proud-salad-bcshhdap`, database `opscore_acceptance`. All SQL below was read-only except one deliberately transaction-local test that set forged legacy GUC values for the duration of its SELECT; a fresh subsequent connection confirmed the session context clean. No persistent data, schema, role, branch, snapshot, endpoint, or plan was changed.

### Applied migration and database identity

- PostgreSQL reports `18.7 (84da7d8)`.
- `public.schema_migrations`: 71 rows; latest is `072_deployment_release_evidence_store.sql`, SHA-256 `84c8ad55d4aae5aaa33a7e1edbb1dec5c25cfab773c2238c93956eea67dd2b17`, applied `2026-11-23T08:57:33.905Z`.
- `071_signed_rls_context_all_access_modes.sql` is present, SHA-256 `46645f6b199e17f55ac46f63518b611c77171980ece6efed8b3ef9be7d4886f6`, applied `2026-11-21T01:28:31.910Z`.

### Runtime role, signed context and HMAC key isolation

- `opscore_runtime`: `rolsuper=false`, `rolbypassrls=false`, `rolcreaterole=false`, `rolcreatedb=false`, login enabled.
- `opscore_auth_definer`: `rolsuper=false`, `rolbypassrls=true`, `rolcanlogin=false`; runtime is not a member of this role or `neondb_owner`.
- `opscore_security.context_hmac_keys` is owned by `opscore_auth_definer`. Runtime has schema USAGE but no SELECT/INSERT/UPDATE/DELETE privilege on the key table.
- `opscore_security.verified_tenant_context()` and `verified_rls_context()` are SECURITY DEFINER functions owned by `opscore_auth_definer`; runtime may EXECUTE them but cannot directly access the key table. Both pin `search_path` to `pg_catalog, opscore_security, pg_temp`.
- `opscore_current_tenant()`, `opscore_current_user()` and `opscore_access_mode()` derive values from `verified_rls_context()`, with pinned search paths.
- Behavioral test as `opscore_runtime`: transaction-local raw writes to `app.tenant_id`, `app.current_tenant_id`, `app.organization_id`, `app.user_id`, `app.current_user_id` and `app.access_mode=system` yielded `verified_tenant=NULL`, `verified_user=NULL`, `verified_access_mode=''`, and `opscore_is_privileged()=false`. A subsequent fresh runtime connection returned `context_clean=true` and empty legacy tenant/user GUC values.
- `opscore_is_privileged()` is a SECURITY DEFINER function owned by `neondb_owner` (which has BYPASSRLS), and is executable by runtime. Its observed body checks owner/admin/manager membership only by matching the signed `opscore_current_tenant()` and `opscore_current_user()` accessors. Keep this privileged helper in the explicit code-review scope; the raw-GUC test above does not replace review of all caller paths.

### RLS and policy inventory

- 137 public base tables; 136 have both RLS and FORCE RLS.
- The only public base-table exception is PostGIS `spatial_ref_sys`, owned by `cloud_admin`; `opscore_runtime` has SELECT only and no INSERT/UPDATE/DELETE.
- 279 public RLS policies observed; none of their `qual` or `with_check` expressions reference raw `current_setting`. 266 policies reference signed tenant/user accessors.
- 126 public tables expose an `organization_id` column; all 126 have at least one policy using the signed tenant accessor.
- Dedicated non-standard policies were also inspected: `deployment_release_evidence` and `schema_migrations` deny runtime table privileges; `technician_location_trail` has a restrictive signed-tenant guard; `password_reset_tokens` has a restrictive no-SELECT guard; system rate-limit tables are explicitly shared for runtime; `worker_guard_system_events` has runtime INSERT only.
- This is a fresh catalog read plus one raw-GUC behavioral probe. It does not establish live cross-tenant acceptance for all HTTP routes, AI/search pools, background workers, or every transaction lifecycle.

### Recovery and plan limitations

- Neon organization `free`; project history retention `21,600 seconds` (6 hours); branch logical-size limit `1,073,741,824 bytes` (1 GiB).
- Eight branches were listed, all READY; Primary `br-proud-salad-bcshhdap` is default/primary but `protected=false`. The seven non-primary branches are also `protected=false`; preserve all of them.
- One manual snapshot exists: `snap-aged-thunder-bcsxc1a5`, created `2026-11-19T06:58:55Z`; no automatic snapshot schedule is configured on any of the eight branches.
- No plan upgrade, snapshot schedule change, branch protection mutation, branch deletion, snapshot deletion, or recovery operation was attempted.

**Current DB conclusion:** migration 071/072 are recorded; runtime direct access to HMAC key material is denied; raw legacy-GUC tenant/user/access-mode forgery was rejected in the direct runtime-role probe; 136/137 public base tables enforce RLS+FORCE RLS. **Production-wide isolation certification remains NOT_CERTIFIED** until exact-deployment HTTP behavioral proofs cover the complete route inventory, application/business flows and all non-HTTP workers. Recovery remains **PLAN-LIMITED / OPEN** until protected scheduled snapshots and an accepted restore/RPO/RTO process exist.
