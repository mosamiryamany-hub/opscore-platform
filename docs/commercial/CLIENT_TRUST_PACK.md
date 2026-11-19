# OpsCore — Client Trust Pack

**Evidence date:** 2026-11-19  
**Product version:** 0.11.62  
**Current source pin:** `e1d6c1b7939684e0f55d9f95f102b53687f9544b`  
**Current Vercel Production deployment:** `dpl_9BbbFdVocyY73Mh7dTRyTAPy71J3`  
**Production alias:** https://opscore-platform.vercel.app

> **Buyer diligence notice:** This document is an evidence index, not a production certificate, warranty, license grant, or statement that every release gate is closed. The current deployment is online according to Vercel deployment metadata, but the runtime release proof remains UNVERIFIED in the latest operator-provided endpoint report. Do not treat provider state READY or a CI pass as production certification.

## 1. What is currently pinned

| Item | Current evidence |
|---|---|
| GitHub repository | [mosamiryamany-hub/opscore-platform](https://github.com/mosamiryamany-hub/opscore-platform) |
| Protected source branch | `main` |
| Source commit | [e1d6c1b7939684e0f55d9f95f102b53687f9544b](https://github.com/mosamiryamany-hub/opscore-platform/commit/e1d6c1b7939684e0f55d9f95f102b53687f9544b) |
| Vercel deployment | `dpl_9BbbFdVocyY73Mh7dTRyTAPy71J3` — READY, target Production |
| Production alias | [opscore-platform.vercel.app](https://opscore-platform.vercel.app) |
| Runtime version | 0.11.62 |
| Release tag shown by latest runtime report | `v0.11.62` |

Vercel's API confirms that the named deployment is READY, has Production as its target, owns the public alias, and records the same Git commit shown above. This confirms the hosting pin only. It does **not** establish a GitHub Actions deployment identity or certification.

## 2. Public verification endpoints

A prospective buyer can open these without receiving application credentials:

| Evidence | Link |
|---|---|
| Runtime health | [`/api/health`](https://opscore-platform.vercel.app/api/health) |
| Machine-readable release proof | [`/api/verify/release`](https://opscore-platform.vercel.app/api/verify/release) |
| Deployment identity proof | [`/api/verify/deployment`](https://opscore-platform.vercel.app/api/verify/deployment) |
| Live database-security proof | [`/api/verify/database-security`](https://opscore-platform.vercel.app/api/verify/database-security) |
| Human-readable release proof | [`/verify/release.html`](https://opscore-platform.vercel.app/verify/release.html) |
| Source commit | [GitHub commit](https://github.com/mosamiryamany-hub/opscore-platform/commit/e1d6c1b7939684e0f55d9f95f102b53687f9544b) |
| Current authorized deploy attempt | [GitHub Actions run 44529428910](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44529428910) |
| Same-commit OpsCore CI | [GitHub Actions run 44520992630](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44520992630) |
| Same-commit Vercel contract workflow | [GitHub Actions run 44520992632](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44520992632) |

The public endpoints were not fetched independently from this session because the available network path rejected the Vercel origin. The latest runtime values below are therefore attributed to the operator-provided live report; buyers should re-open the live URLs and record their own timestamped response.

## 3. Latest reported runtime release status

| Gate | Latest reported result | Meaning |
|---|---|---|
| Source identity method | **UNVERIFIED** | The deployed bundle does not carry the required GitHub Actions identity assertion |
| Commit-bound CI verification | **PASS** | The referenced CI run matches the source commit; this is not Production behavioral proof |
| Commercial release closure | **UNVERIFIED** | The complete release-evidence chain is not closed |
| Production acceptance evidence | **NOT_VERIFIED** | The configured fingerprint does not by itself prove the evidence file is present and valid in this deployment |
| PostgreSQL / RLS behavioral gate | **PASS_TEST_SCOPE** | Acceptance passed in the defined test scope; do not relabel it as Production certification |
| Production session tenant boundary | **NOT_VERIFIED** | No current exact-deployment dual-tenant Production result is established |
| Production recovery bundle | **NOT_VERIFIED** | No current exact-deployment Production recovery-point proof is established |
| Production-wide isolation certification | **NOT_CERTIFIED** | No certification claim is made |

**Root cause of the identity gap:** `scripts/write-vercel-release-identity.js` creates the identity file during the GitHub Actions deployment workflow. The file is deliberately ignored by Git because it is a generated build-time artifact. The current Production deployment was created outside that workflow, so Git metadata on the Vercel deployment is not a substitute for the embedded `github-actions-cli-assertion`.

**Production acceptance:** the authorized workflow generated acceptance evidence in its runner workspace, but the subsequent plan preflight failed before the candidate build/embed/promotion steps. That transient output was not promoted into the current Production bundle.

## 4. CI evidence — explicitly limited to CI

The latest same-commit authorized workflow run, [44529428910](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44529428910), passed source verification, disposable PostgreSQL 18 acceptance, and the required `vercel-contract-verify` gate. The deploy job failed at step 13, **Preflight Vercel and Neon paid-plan and branch capacity**. Candidate build, live 67-route probe, session-isolation probe, recovery probe, certification, and promotion steps were skipped.

The run contains artifact `signed-tenant-postgres-18-ci-coverage-44529428910` (artifact ID `14532353558`). It is CI evidence from disposable PostgreSQL 18. **67/67 CI routes are not 67/67 Production routes.**

## 5. Database posture and restore boundary

The Neon project is PostgreSQL 18.7 on the Free organization plan. The current Primary branch is `br-proud-salad-bcshhdap`; it is ready but not protected. The scheduled snapshot list is empty. Four branches are retained; the recovery and preview branches have not been deleted.

A read-only comparison of Primary with restore branch `br-calm-poetry-bc7l7wik` examined 136 public base tables. Six tables have different row counts or row-content hashes: `activity_log`, `audit_log`, `firewall_rate_buckets`, `integration_outbox`, `organizations`, and `users`. This can reflect data drift since the snapshot; it is not evidence that the snapshot is corrupted. It does mean full data parity has **not** been demonstrated, and the restore branch must not replace Primary.

A prior read-only Primary catalog audit recorded 135 of 136 public base tables with RLS enabled and FORCE RLS; the sole exception was the PostGIS extension-owned `spatial_ref_sys`. That audit also counted 278 RLS policies and 11 SECURITY DEFINER functions with pinned search paths. The audit's source binding was the parent commit `0edd7d8c855e1dd4645979c05fd30be105dff369`, not a fresh re-run bound to the current deployment. Catalog configuration is not a substitute for a live two-tenant behavior proof.

## 6. Credentials and security disclosure

Vercel environment metadata confirms that production database URLs and tenant-context HMAC material are stored as Sensitive/Secret variables. Secret bytes, passwords, tokens, and private keys are intentionally not reproduced in this pack or shared with a buyer. A buyer should use buyer-owned provider accounts and credentials during their own deployment acceptance.

The current application exposes a public release proof and a separate database-security proof. Neither endpoint should display connection strings, HMAC key material, database hosts, or customer records.

## 7. Commercial and legal boundary

- The repository package is marked `UNLICENSED`.
- No buyer-specific license or distribution right is granted by repository access, this document, a release page, or a ZIP file.
- The existing License Schedule is a blank template. Rights-holder identity, buyer legal entity, tier, territory, term, price/payment, support, governing law, and signatures are not completed here.
- The historic commercial package `v0.11.62.16` is a different source pin and SHA. It is not the current `e1d6c1b` deployment package.
- A current-main release ZIP, signed release statement, SBOM/provenance set, and buyer-specific signed License Schedule remain required before a commercial delivery claim.

## 8. Remaining buyer / transaction items

| Item | Current status |
|---|---|
| Signed Android/iOS store artifacts and store listings | Buyer-side, not included |
| Native-speaker translation review | Not certified |
| Licensed map provider, keys, and attribution | Buyer/provider contract required |
| External identity, telephony, messaging, payment, maps, cloud, and storage accounts | Buyer-owned credentials and contracts |
| Terms, Privacy, and Pricing pages | Not published; do not invent legal terms or prices |
| 60-second external monitoring | Not configured; no verified low-cost monitor is active |
| Production plan eligibility and scheduled backup/protection | Blocked by current Vercel Hobby / Neon Free plan posture |

## 9. Buyer verification checklist

1. Open the live health endpoint and note the response timestamp.
2. Open `/api/verify/release`; confirm the source commit, deployment ID, CI pipeline, package fingerprint, and every gate.
3. Open `/api/verify/database-security`; review the result without assuming it proves cross-tenant behavior on all 67 routes.
4. Open the linked GitHub runs and distinguish successful CI from the failed Production plan preflight.
5. Obtain the current-main release archive and provenance only after a successful authorized release workflow.
6. Execute a buyer-specific technical, legal, and security acceptance before signing or deploying.

---

## ملخص الثقة للعميل

النشر الحالي موجود على Vercel ويشير إلى الالتزام `e1d6c1b7`، لكن إثبات هوية النشر المضمّن غير متحقق. فحوص PostgreSQL 18 و67 مسارًا نجحت داخل CI المعزول فقط، وليست اعتمادًا لسلوك الإنتاج. اختبار العزل بين مستأجرين في الإنتاج، وإثبات الاستعادة الكامل، وشهادة العزل الشاملة ما زالت مفتوحة. لا يوجد ترخيص أو حق توزيع قبل توقيع جدول ترخيص خاص بالمشتري ومحدد ببصمة الحزمة.