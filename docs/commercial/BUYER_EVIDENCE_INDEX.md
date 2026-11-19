# OpsCore — Buyer Evidence Index

**Evidence date:** 2026-11-19  
**Current source:** `e1d6c1b7939684e0f55d9f95f102b53687f9544b`  
**Current Production deployment:** `dpl_9BbbFdVocyY73Mh7dTRyTAPy71J3` (Vercel reports READY / Production)

> This index separates evidence classes. A production deployment marked READY is not a release certification. Disposable CI acceptance is not Production behavioral acceptance. No license grant is made here.

## Public live checks

- Health: https://opscore-platform.vercel.app/api/health
- Release proof: https://opscore-platform.vercel.app/api/verify/release
- Deployment identity: https://opscore-platform.vercel.app/api/verify/deployment
- Database security: https://opscore-platform.vercel.app/api/verify/database-security
- Human-readable proof: https://opscore-platform.vercel.app/verify/release.html

## Source and CI references

- Protected main commit: https://github.com/mosamiryamany-hub/opscore-platform/commit/e1d6c1b7939684e0f55d9f95f102b53687f9544b
- OpsCore CI, same commit: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44520992630
- Vercel contract/source/PostgreSQL workflow, same commit: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44520992632
- Authorized production attempt: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44529428910
- CI signed-tenant artifact from run 44529428910: `14532353558`, disposable PostgreSQL 18 scope only

## Current status

| Evidence | State |
|---|---|
| Main protection and commit | Verified |
| Source/CI regression checks | PASS |
| Disposable PostgreSQL 18 acceptance | PASS |
| Signed-tenant route matrix | 67/67 in CI only |
| Current Vercel Production source commit | Matches current main |
| Embedded GitHub Actions deployment identity | UNVERIFIED |
| Production acceptance evidence | NOT_VERIFIED |
| Production session tenant boundary | NOT_VERIFIED |
| Production recovery bundle / full data parity | NOT_VERIFIED |
| Production-wide isolation certification | NOT_CERTIFIED |
| Current-main commercial archive/provenance | Not produced |
| Buyer-specific license | Not granted |

## Neon restore note

Primary and the retained restore branch have matching table inventory, but current row-content comparison differs in six tables: `activity_log`, `audit_log`, `firewall_rate_buckets`, `integration_outbox`, `organizations`, and `users`. Preserve Primary; do not promote the restore branch as an exact-parity restore.

## Commercial boundary

The package is `UNLICENSED`. No use, modification, resale, or distribution rights are granted until the rights holder and buyer execute a License Schedule bound to the exact delivered archive SHA-256. Pricing and governing-law fields remain negotiated/blank in the repository template.

See the complete [Client Trust Pack](CLIENT_TRUST_PACK.md), [Current closeout gates](../ops/REMAINING_CLOSEOUT_GATES.md), [License Schedule template](LICENSE_SCHEDULE_TEMPLATE.md), and [No License Grant notice](../../NO_LICENSE_GRANT_NOTICE.txt).