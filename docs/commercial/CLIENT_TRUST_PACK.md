# OpsCore — Client Trust Pack

**Evidence cut:** 2026-11-19 13:35 UTC  
**Current protected main:** `4ac54611c0456728a2db010e6beb9d018d9d560b`  
**Current live Production source:** `e1d6c1b7939684e0f55d9f95f102b53687f9544b`  
**Live Production deployment:** `dpl_9BbbFdVocyY73Mh7dTRyTAPy71J3`  
**Public site:** https://opscore-platform.vercel.app

> **Client diligence notice:** This document reports what is deployed and what is only merged in source. The website is healthy, but it is behind current main. Production release status is UNVERIFIED and Production-wide isolation is NOT_CERTIFIED. This is evidence disclosure, not a certificate, warranty, or license grant.

## 1. Current source and hosted pin

| Item | Current evidence |
|---|---|
| GitHub repository | [mosamiryamany-hub/opscore-platform](https://github.com/mosamiryamany-hub/opscore-platform) |
| Protected main | [`4ac54611c0456728a2db010e6beb9d018d9d560b`](https://github.com/mosamiryamany-hub/opscore-platform/commit/4ac54611c0456728a2db010e6beb9d018d9d560b) |
| Vercel Production | `dpl_9BbbFdVocyY73Mh7dTRyTAPy71J3` — READY |
| Deployed source | `e1d6c1b7939684e0f55d9f95f102b53687f9544b` — behind main |
| Product version reported by live health | `0.11.62` |
| PR #287 | Merged: adds explicit login route and test |
| PR #288 | Merged: makes deployment/release trust proofs fail closed on unbound environment-only values |

CI on current main is green, but the workflow's automatic push path deliberately skips the Production deploy job. The latest live Vercel Production metadata remains pinned to the older source commit.

## 2. Public verification endpoints

| Evidence | Current live response |
|---|---|
| [Health](https://opscore-platform.vercel.app/api/health) | Healthy; PostgreSQL; version 0.11.62 |
| [Login](https://opscore-platform.vercel.app/login) | **404** on live Production; fix is merged in main, not deployed |
| [Release proof](https://opscore-platform.vercel.app/api/verify/release) | **UNVERIFIED** |
| [Deployment proof](https://opscore-platform.vercel.app/api/verify/deployment) | Reports CLI assertion, but conflicts with release proof; not reliable until PR #288 is deployed |
| [Database-security proof](https://opscore-platform.vercel.app/api/verify/database-security) | `IDENTITY_PLANE_RLS_ENFORCED`; catalog-level proof only |
| [Human-readable release proof](https://opscore-platform.vercel.app/verify/release.html) | Public release view for the currently deployed bundle |

## 3. What the live release endpoint says

| Gate | Live response | Customer-safe interpretation |
|---|---|---|
| Source identity method | `unverified` | Embedded GitHub Actions identity is not established by this endpoint |
| Commit | `e1d6c1b7...` | This is the live deployment SHA, not current main |
| CI verification | `PASS`, pipeline `44520992630` | Historical commit-bound CI evidence; not current-main Production proof |
| Commercial release closure | `UNVERIFIED` | Release is not commercially closed |
| Production acceptance | `NOT_VERIFIED` | No current exact-deployment acceptance proof |
| PostgreSQL / RLS | `PASS_TEST_SCOPE` | Test scope only |
| Signed tenant route coverage | `NOT_VERIFIED`, 0 routes | No live all-67-route Production proof |
| Production session tenant boundary | `NOT_VERIFIED` | No current exact-deployment proof |
| Production recovery bundle | `NOT_VERIFIED` | No current exact-deployment recovery proof |
| Production-wide isolation certification | `NOT_CERTIFIED` | No certification claim |

The live endpoint still shows a package fingerprint as `PUBLISHED`, but it is not accepted as current-main package attestation. The old implementation could derive package and CI status from persistent environment variables even when the identity artifact was absent. PR #288 removes that fallback in source; the live deployment has not yet received it.

## 4. Trust-proof discrepancy — disclosed and fixed in source

The two current live endpoints disagree:
- `/api/verify/deployment` reports `github-actions-cli-assertion`;
- `/api/verify/release` reports `sourceCommitIdentitySource=unverified`.

Root cause: the previous deployment verifier could use stale Vercel environment variables as CLI provenance when the generated identity JSON was missing; the release verifier independently required the embedded identity file. PR #288 now clears environment-only source, CI, package, and release-tag values, and trusts the generated identity only when it exists inside that exact deployed bundle. Regression tests intentionally inject stale values to prove they cannot upgrade the public trust result.

**Status:** fix merged to main; public Production endpoint not yet updated. Until deployment, the two live values remain inconsistent and must not be presented as a coherent certificate.

## 5. CI evidence boundary

Current-main runs:
- [OpsCore CI 44533918767](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44533918767) — SUCCESS
- [Vercel source / PostgreSQL 18 / contract workflow 44533918970](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44533918970) — SUCCESS

The second run proves source verification, disposable PostgreSQL 18 acceptance, and contract checks. Its Production deploy job was skipped because the event was a push. The earlier authorized Production attempt [44529428910](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44529428910) passed source/CI/PostgreSQL/contract checks but failed at step 13, the paid-plan and branch-capacity preflight. The candidate build and all Production probes were skipped.

The 67-route matrix passing in disposable PostgreSQL CI is not 67/67 live Production tenant-session coverage.

## 6. Database and isolation evidence

The live database-security endpoint reports:
- 136 public ordinary tables;
- 135 with RLS enabled and FORCE RLS;
- the only table without RLS is PostGIS-owned `spatial_ref_sys`, with zero runtime write access;
- zero non-PostGIS tables without RLS or FORCE RLS;
- runtime role `opscore_runtime` has no superuser, BYPASSRLS, create-role, create-database, or elevated membership privileges;
- Control Plane and system operational table grants are reported as least-privilege.

This is catalog-level configuration evidence. The endpoint itself states that it does not certify production tenant isolation; cross-tenant behavioral tests remain required.

### Neon recovery posture

| Item | State |
|---|---|
| Version / plan | PostgreSQL 18.7 / Free organization |
| Primary branch | `br-proud-salad-bcshhdap`, ready, primary/default |
| Primary protection | **false** |
| Retained branches | 4 |
| Scheduled backup/snapshot schedule | Empty |
| Retained snapshot | `snap-aged-thunder-bcsxc1a5` |
| Restore branch | `br-calm-poetry-bc7l7wik`, ready |
| Full restore row-content parity | **NOT VERIFIED** |

Read-only comparison over 136 public base tables found mismatches in six tables: `activity_log`, `audit_log`, `firewall_rate_buckets`, `integration_outbox`, `organizations`, and `users`. Treat these as data differences requiring investigation; they may be normal post-snapshot writes, not proof of corruption. Do not promote the restore branch as an exact full-parity restore.

## 7. Hosting and recovery preconditions

The authorized workflow's read-only preflight permits Vercel Pro/Enterprise and Neon Launch/Scale/Business/Enterprise; it also requires a protected, ready Neon Primary and available branch capacity. Neon currently reports Free and Primary `protected=false`. The last failed authorized workflow stopped at this preflight before candidate build or live tests. No billing plan was changed. Confirm Vercel's current team billing tier in the Vercel billing console before authorizing an upgrade; the API project response does not expose plan entitlement.

## 8. Commercial and legal boundary

- The source package declares `UNLICENSED`.
- Repository access, a running site, or an evidence report does not grant usage, resale, modification, or distribution rights.
- The License Schedule in the repository is a blank template. It needs rights-holder authority and completed buyer-specific scope/term/territory/price/support/governing-law fields and signatures before it grants rights.
- No current-main release archive, archive SHA-256, SBOM/provenance set, or signed release statement has been produced from the exact current main.
- Terms, Privacy, and Pricing pages are not published. They must not be filled with invented legal identity, data-controller facts, jurisdiction, retention policy, or pricing.
- Buyer execution is not a prerequisite to accurately report engineering status; it is necessary only for buyer-specific rights and contractual commitments.

## 9. Client verification checklist

1. Check [health](https://opscore-platform.vercel.app/api/health) for live availability.
2. Open [release proof](https://opscore-platform.vercel.app/api/verify/release) and distinguish the live SHA from current main.
3. Open [deployment proof](https://opscore-platform.vercel.app/api/verify/deployment); note the inconsistency with release proof until PR #288 is deployed.
4. Review [database-security proof](https://opscore-platform.vercel.app/api/verify/database-security) as catalog evidence only.
5. Confirm the live deployment ID and SHA using Vercel metadata.
6. Obtain current-main archive/provenance and execute a legal license only when those artifacts and rights are actually issued.

---

## ملخص الثقة للعميل

الموقع يعمل حاليًا على PostgreSQL، لكن النشر الحي متأخر عن آخر كود في GitHub. إصلاح الدخول وإصلاح تضارب إثبات النشر تم دمجهما في `main` ولم يصلا بعد إلى Production؛ لذلك مسار `/login` ما زال 404، وإثبات الإصدار ما زال UNVERIFIED، وشهادة عزل المستأجرين غير معتمدة. فحوص RLS الحية تؤكد إعدادات الكتالوج والصلاحيات، ولا تثبت وحدها سلوك العزل بين العملاء. قاعدة Neon مجانية، والفرع الأساسي غير محمي، ولا يوجد جدول نسخ مجدول، كما أن تطابق بيانات الاستعادة بالكامل غير مثبت. لا يوجد ترخيص استخدام أو إعادة بيع قبل صدور حزمة حالية وبصمتها وتوقيع جدول الحقوق المناسب.