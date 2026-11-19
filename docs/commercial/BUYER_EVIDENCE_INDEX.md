# OpsCore — Buyer Evidence Index

**Evidence cut:** 2026-11-19 13:35 UTC  
**Current protected source:** [`4ac54611c0456728a2db010e6beb9d018d9d560b`](https://github.com/mosamiryamany-hub/opscore-platform/commit/4ac54611c0456728a2db010e6beb9d018d9d560b)  
**Live Production deployment:** `dpl_9BbbFdVocyY73Mh7dTRyTAPy71J3`  
**Live Production SHA:** `e1d6c1b7939684e0f55d9f95f102b53687f9544b` — behind current main

> This index separates merged source from deployed Production. Provider READY, green CI, and RLS catalog state are not equivalent to Production release certification.

## Public live checks

- Health: https://opscore-platform.vercel.app/api/health
- Login (currently 404 in live Production): https://opscore-platform.vercel.app/login
- Release proof: https://opscore-platform.vercel.app/api/verify/release
- Deployment identity: https://opscore-platform.vercel.app/api/verify/deployment
- Database security: https://opscore-platform.vercel.app/api/verify/database-security
- Human-readable release proof: https://opscore-platform.vercel.app/verify/release.html

## Main and CI references

- Current protected main: https://github.com/mosamiryamany-hub/opscore-platform/commit/4ac54611c0456728a2db010e6beb9d018d9d560b
- PR #287 — login route and HTTP smoke test: https://github.com/mosamiryamany-hub/opscore-platform/pull/287
- PR #288 — fail-closed trust-proof correction: https://github.com/mosamiryamany-hub/opscore-platform/pull/288
- Current-main OpsCore CI: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44533918767
- Current-main source/PostgreSQL 18/contract workflow: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44533918970
- Earlier authorized Production workflow attempt: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44529428910

## Current status

| Evidence | State |
|---|---|
| Current main and branch protection | Verified |
| Current-main source regression CI | PASS |
| Disposable PostgreSQL 18 and contract acceptance | PASS |
| Current-main auto-deployment | Intentionally skipped on push |
| Vercel live deployment source | Older SHA `e1d6c1b7...` |
| Live health | Healthy / PostgreSQL / 0.11.62 |
| Live `/login` | 404; source fix merged, not deployed |
| Live release proof | UNVERIFIED |
| Live deployment proof | Conflicting CLI assertion; PR #288 corrects source, not yet deployed |
| Current-main identity/package attestation | Not established in live Production |
| Production acceptance evidence | NOT_VERIFIED |
| 67-route signed-session Production coverage | NOT_VERIFIED (CI-only route coverage is not Production) |
| Production session tenant boundary | NOT_VERIFIED |
| Production recovery / full data parity | NOT_VERIFIED |
| Production-wide isolation certification | NOT_CERTIFIED |
| Current-main release archive/SBOM/provenance | Not produced |
| Buyer-specific license | Not granted |

## Neon restore note

Neon Free, PostgreSQL 18.7. Primary `br-proud-salad-bcshhdap` is ready/default but unprotected; snapshot schedule is empty. Four branches are retained. Primary vs restore branch content differs in six tables: `activity_log`, `audit_log`, `firewall_rate_buckets`, `integration_outbox`, `organizations`, `users`. Preserve Primary and recovery artefacts; do not promote the restore branch as exact full parity.

## Commercial boundary

The repository package is `UNLICENSED`. No use, modification, resale, or distribution rights are granted by the repository, website, or this evidence index. Current-main archive SHA-256, SBOM/provenance, and a rights-holder-authorized License Schedule must exist before a buyer-specific grant is made. This does not make a buyer signature a prerequisite for describing the engineering state of the project.

See the full [Client Trust Pack](CLIENT_TRUST_PACK.md), [Current closeout ledger](../ops/REMAINING_CLOSEOUT_GATES.md), [License Schedule template](LICENSE_SCHEDULE_TEMPLATE.md), and [No License Grant notice](../../NO_LICENSE_GRANT_NOTICE.txt).