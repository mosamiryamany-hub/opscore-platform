# OpsCore — Client Trust Pack

**Evidence cut:** 2026-11-19 15:17 UTC  
**Current protected main:** `d672dce8f18e1d7095aed3126aedb0f995796144`  
**Current live Production application-code source:** `68505535f1c2fabd2a786094f8f64d234d26e123`  
**Live Production deployment:** `dpl_AgWqB4kaSRXhdsmKfvXg9qgeQgt9`  
**Public site:** https://opscore-platform.vercel.app

> **Client diligence notice:** This document distinguishes current protected `main` from live Production. PR #292 merged trust-proof UI changes at `d672dce8...`; a Vercel Preview from that exact commit is READY but SSO-protected. Public Production remains on `68505535...` and does not yet contain PR #292. Release status remains UNVERIFIED; Production-wide isolation remains NOT_CERTIFIED. This is evidence disclosure, not a certificate, warranty, or license grant.

## 1. Current source and hosted pin

| Item | Current evidence |
|---|---|
| GitHub repository | [mosamiryamany-hub/opscore-platform](https://github.com/mosamiryamany-hub/opscore-platform) |
| Protected main | [`d672dce8f18e1d7095aed3126aedb0f995796144`](https://github.com/mosamiryamany-hub/opscore-platform/commit/d672dce8f18e1d7095aed3126aedb0f995796144) |
| Vercel Production | `dpl_AgWqB4kaSRXhdsmKfvXg9qgeQgt9` — READY |
| Deployed application-code source | `68505535f1c2fabd2a786094f8f64d234d26e123` — live Production SHA; NOT current main after PR #292 |
| Product version reported by live health | `0.11.62` |
| PR #287 | Merged: adds explicit login route and test |
| PR #288 | Merged: makes deployment/release trust proofs fail closed on unbound environment-only values |

PR #291 was documentation-only, but PR #292 subsequently changed the trust-proof UI and merged as current main `d672dce8...`. A separate Vercel Preview build `dpl_DCQk2TbxtCoMHLDCEQ8pN4W33ay1` is READY from that exact commit and remains SSO-protected. The latest public Production deployment is still `dpl_AgWq...` on application SHA `68505535...`; no Production promotion occurred.

## 2. Public verification endpoints

| Evidence | Current live response |
|---|---|
| [Health](https://opscore-platform.vercel.app/api/health) | Healthy; PostgreSQL; version 0.11.62 |
| [Login](https://opscore-platform.vercel.app/login) | **307 redirect** to `/control-plane.html`; PR #290 route is deployed |
| [Release proof](https://opscore-platform.vercel.app/api/verify/release) | **UNVERIFIED** |
| [Deployment proof](https://opscore-platform.vercel.app/api/verify/deployment) | `identified` through `vercel-git-metadata`; native Git source identity, not a GitHub Actions signature |
| [Database-security proof](https://opscore-platform.vercel.app/api/verify/database-security) | `IDENTITY_PLANE_RLS_ENFORCED`; catalog-level proof only |
| [Human-readable release proof](https://opscore-platform.vercel.app/verify/release.html) | Public release view for the currently deployed bundle |

## 3. What the live release endpoint says

| Gate | Live response | Customer-safe interpretation |
|---|---|---|
| Source identity method | `unverified` | Embedded GitHub Actions identity is not established by this endpoint |
| Commit | `68505535...` | This is the live Production application-code SHA; current main is `d672dce8...` and contains the merged PR #292 UI change |
| Embedded CI attestation | `UNVERIFIED`, no pipeline ID | Separate successful CI runs exist, but no CI assertion is embedded in this exact deployed bundle |
| Commercial release closure | `UNVERIFIED` | Release is not commercially closed |
| Production acceptance | `NOT_VERIFIED` | No current exact-deployment acceptance proof |
| Release-bound PostgreSQL / RLS | `UNVERIFIED` | Separate CI RLS tests passed in disposable PostgreSQL; this release gate is not embedded/Production behavior |
| Signed tenant route coverage | `NOT_VERIFIED`, 0 routes | No live all-67-route Production proof |
| Production session tenant boundary | `NOT_VERIFIED` | No current exact-deployment proof |
| Production recovery bundle | `NOT_VERIFIED` | No current exact-deployment recovery proof |
| Production-wide isolation certification | `NOT_CERTIFIED` | No certification claim |

The live release endpoint reports package fingerprint SHA-256 `UNVERIFIED` with a null value. PR #288's fail-closed verifier is deployed: stale environment-only CI/package values are not accepted when the validated identity JSON is absent. This is a correct unverified result, not a failed SHA-256 calculation.

## 4. Trust-proof discrepancy — disclosed and fixed in source

The two live endpoints are now consistent:
- `/api/verify/deployment` identifies source via `vercel-git-metadata`;
- `/api/verify/release` reports `sourceCommitIdentitySource=unverified` because an embedded GitHub Actions identity is not present.

Native Vercel Git metadata confirms what code is running; it is not a GitHub Actions signature.

Root cause: the previous deployment verifier could use stale Vercel environment variables as CLI provenance when the generated identity JSON was missing; the release verifier independently required the embedded identity file. PR #288 now clears environment-only source, CI, package, and release-tag values, and trusts the generated identity only when it exists inside that exact deployed bundle. Regression tests intentionally inject stale values to prove they cannot upgrade the public trust result.

**Status:** PR #288 is deployed. The old endpoint contradiction is resolved. The release remains UNVERIFIED until an authorized CI release identity and package attestation are embedded in the exact bundle.

## 5. CI evidence boundary

Current-main runs:
- [OpsCore CI 44552772156](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44552772156) — SUCCESS (source/regression/performance/security/mobile)
- [Vercel source / PostgreSQL 18 / contract workflow 44552772494](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44552772494) — SUCCESS (disposable PostgreSQL 18 acceptance, 346-route CI matrix, RLS, composite FKs, HTTP and logical restore drill)

Current-main run 44552772494 passed source verification, disposable PostgreSQL 18 acceptance and the contract job. Its isolated matrix covered 346 source-derived routes and its logical restore drill covered 137 tables; Production deploy, Neon Preview migration/HTTP acceptance and Production Neon PITR jobs were skipped. The earlier authorized Production attempt [44529428910](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44529428910) passed source/CI/PostgreSQL/contract checks but failed at paid-plan and branch-capacity preflight; candidate build and Production probes were skipped.

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

Fresh read-only comparison in configured database `opscore_acceptance` found Primary vs restore counts: `activity_log` 20/17, `audit_log` 59/54, `firewall_rate_buckets` 1/1 but digest differs, `integration_outbox` 20/17, `organizations` 18/16, `users` 18/16. Only counts and digests were returned; no row contents were changed or returned. Differences may be post-snapshot writes, not proof of corruption. Exact parity is not proven; do not promote the restore branch as an exact full-parity restore.

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
3. Open [deployment proof](https://opscore-platform.vercel.app/api/verify/deployment); it identifies native Vercel Git metadata. Compare it with the stricter embedded release attestation; these are different evidence types, not conflicting claims.
4. Review [database-security proof](https://opscore-platform.vercel.app/api/verify/database-security) as catalog evidence only.
5. Confirm the live deployment ID and SHA using Vercel metadata.
6. Obtain current-main archive/provenance and execute a legal license only when those artifacts and rights are actually issued.

---

## ملخص الثقة للعميل

الموقع العام يعمل، و`/login` يحوّل إلى صفحة Control Plane. Production ما زالت على كود التطبيق `68505535`، بينما `main` عند `d672dce8` ويتضمن تحديث واجهة إثبات الثقة في PR #292؛ نسخة Preview من هذا الالتزام جاهزة لكنها محمية بـSSO ولم تُرقَّ إلى Production. اختبارات CI وPostgreSQL 18 الحالية نجحت، بما فيها مصفوفة 346 مسارًا وتجربة استعادة منطقية لـ137 جدولًا داخل قواعد اختبار معزولة، لكنها لا تثبت عزل المستأجرين أو استعادة Production. إثبات النشر يحدد مصدر Git من Vercel، وإثبات الإصدار يظل UNVERIFIED لغياب هوية GitHub Actions المضمّنة وبصمة الحزمة الموقعة. إعدادات RLS الحية مثبتة على مستوى الكتالوج فقط. فرع Neon الأساسي غير محمي والنسخ المجدول غير متاح، وفرع الاستعادة يختلف عن Primary في ستة جداول. لا توجد حزمة موقعة أو ترخيص استخدام/إعادة بيع.