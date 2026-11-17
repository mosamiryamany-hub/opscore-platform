# Commercial closeout — final seller posture

> **Current status (2026-11-17): HOLD — NOT CURRENT-HEAD RELEASE-QUALIFIED.**
>
> Current `main` is `6adea6fa209e394b464c4272db1860422d608afb`. No successful exact-head Secure Release artifact has been established for this commit. Required CI currently fails at the mobile dependency audit with 26 High findings associated with GHSA-fc5q-39xc-vjpf / CVE-2026-112366. Draft PR #222 refreshes Expo SDK 58 to 58.0.26 but is not merged or release-qualified. The old production proof below remains a historical reference bound to its earlier commit/deployment; it does not certify current main or a new buyer package. Do not use its package digest as a current deliverable fingerprint.

**Updated:** 2026-11-17T06:13Z UTC  
**Live production pin:** commit `4017497068defa9c1d0761fcb07bc746925e002a`

## Historical runtime evidence — earlier Production pin only

The following records are retained for traceability. They describe the earlier pinned deployment and must not be represented as current-main or current-package acceptance.

## Historical runtime evidence

| Gate | Status |
|---|---|
| Overall | PASS_WITH_BUYER_RESIDUALS |
| Isolation | CERTIFIED |
| Session boundary | PASS_PRODUCTION |
| Recovery bundle | PASS_PRODUCTION |
| Package SHA-256 | dea02a40c556fee6abfc84c372fb153009317867593bf9dafe8f21e171b02880 |
| Proof URL | https://opscore-platform.vercel.app/api/verify/release |

## Historical git-stored evidence for the earlier pin (2026-11-17)

| Artifact | Status | Notes |
|---|---|---|
| PRODUCTION_SESSION_ISOLATION.json | PASS | dual-tenant HTTP probes; sourceCommitHint=4017497…; run 44029395474 |
| PRODUCTION_RECOVERY_POINT.json | PASS | 135 tables compared; mismatchCount=0; recovery branch created then eligible for ephemeral prune |

No `evidenceRebind` / `probesReexecuted=false` on these files.

## Seller offer

- OPEN FOR MARKETING AND COMMERCIAL NEGOTIATION  
- NO LICENSE GRANT until per-buyer License Schedule is signed  
- Tiers A (use) / B (modify) / C (modify+distribute) via schedule template  

## Remaining closeout blockers and disclosed residuals

1. Neon Launch+ for scheduled primary backups + multi-day PITR (manual snapshot limit on current plan)  
2. Vercel edge WAF: promote auth rules log → deny/rate-limit after observation  
3. Buyer residuals: mobile stores, human translation, licensed maps  
4. Optional: promote current `main` tip to Production after a new deploy-bound evidence cycle

## Ops merge note (2026-11-17)

Merged fail-closed Neon maintenance (#213) and guarded migration runner (#212). Production pin and isolation certification unchanged until a deliberate production evidence cycle.
