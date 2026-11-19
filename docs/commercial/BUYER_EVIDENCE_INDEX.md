# OpsCore — Buyer Evidence Index

**Evidence cut:** 2026-11-19 15:17 UTC  
**Current protected main:** [`d672dce8f18e1d7095aed3126aedb0f995796144`](https://github.com/mosamiryamany-hub/opscore-platform/commit/d672dce8f18e1d7095aed3126aedb0f995796144)  
**Live Production deployment:** `dpl_AgWqB4kaSRXhdsmKfvXg9qgeQgt9`  
**Live Production application-code SHA:** `68505535f1c2fabd2a786094f8f64d234d26e123` — Production is still pinned to this earlier application revision; current protected main `d672dce8...` includes PR #292 trust-proof UI changes not yet in Production

> This index separates merged source from deployed Production. Provider READY, green CI, and RLS catalog state are not equivalent to Production release certification.

## Public live checks

- Health: https://opscore-platform.vercel.app/api/health
- Login (live 307 redirect to Control Plane): https://opscore-platform.vercel.app/login
- Release proof: https://opscore-platform.vercel.app/api/verify/release
- Deployment identity: https://opscore-platform.vercel.app/api/verify/deployment
- Database security: https://opscore-platform.vercel.app/api/verify/database-security
- Human-readable release proof: https://opscore-platform.vercel.app/verify/release.html

## Main and CI references

- Current protected main: https://github.com/mosamiryamany-hub/opscore-platform/commit/d672dce8f18e1d7095aed3126aedb0f995796144
- Deployed application-code commit: https://github.com/mosamiryamany-hub/opscore-platform/commit/68505535f1c2fabd2a786094f8f64d234d26e123
- PR #290 — live login route: https://github.com/mosamiryamany-hub/opscore-platform/pull/290
- PR #291 — evidence traceability ledger: https://github.com/mosamiryamany-hub/opscore-platform/pull/291
- Latest OpsCore CI: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44552772156
- Latest PostgreSQL 18 isolated acceptance: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44552772494
- PR #287 — login route and HTTP smoke test: https://github.com/mosamiryamany-hub/opscore-platform/pull/287
- PR #288 — fail-closed trust-proof correction: https://github.com/mosamiryamany-hub/opscore-platform/pull/288
- Current-main OpsCore CI: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44552772156
- Current-main source/PostgreSQL 18/contract workflow: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44552772494
- Earlier authorized Production workflow attempt: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44529428910

## Current status

| Evidence | State |
|---|---|
| Current main and branch protection | Verified |
| Current-main source regression CI | PASS |
| Disposable PostgreSQL 18 and contract acceptance | PASS |
| Current Production app-code source | NOT CURRENT — Production remains on `68505535...`; current main `d672dce8...` includes PR #292 UI code |
| Vercel live deployment source | `68505535...`; does not yet include current main `d672dce8...` |
| Current-main Preview build | READY — `dpl_DCQk2TbxtCoMHLDCEQ8pN4W33ay1`, exact SHA `d672dce8...`; SSO-protected; not Production |
| Live health | Healthy / PostgreSQL / 0.11.62 |
| Live `/login` | Redirects to `/control-plane.html` |
| Live release proof | UNVERIFIED |
| Live deployment proof | Identified through `vercel-git-metadata`; this is native Git identity, not a GitHub Actions signature |
| Embedded GitHub Actions identity/package attestation | Not established in live Production |
| Production acceptance evidence | NOT_VERIFIED |
| 67-route signed-session Production coverage | NOT_VERIFIED (CI-only route coverage is not Production) |
| Production session tenant boundary | NOT_VERIFIED |
| Production recovery / full data parity | NOT_VERIFIED |
| Production-wide isolation certification | NOT_CERTIFIED |
| Current-main release archive/SBOM/provenance | Not produced |
| Buyer-specific license | Not granted |

## Neon restore note

Neon Free, PostgreSQL 18.7. Production database is `opscore_acceptance`; Primary `br-proud-salad-bcshhdap` is ready/default but unprotected; automatic snapshot schedule is empty. Four branches and one manual snapshot are retained. Fresh read-only comparison of Primary vs restore branch `br-calm-poetry-bc7l7wik`: `activity_log` 20/17 rows; `audit_log` 59/54; `firewall_rate_buckets` 1/1 but content digest differs; `integration_outbox` 20/17; `organizations` 18/16; `users` 18/16. No row contents were returned or changed. Exact parity is not proven; preserve Primary and all recovery artefacts.

## Latest CI evidence scope

The latest completed current-main push runs on `d672dce8...` passed: OpsCore source/regression/performance/security/mobile CI (`44552772156`) and source plus disposable PostgreSQL 18 acceptance (`44552772494`). The isolated database job reported a 346-route source-derived CI matrix and a 137-table logical restore drill, with RLS, composite tenant FKs, HTTP runtime acceptance and cleanup checks. Production deploy, Neon Preview migration/HTTP acceptance and Production PITR jobs were skipped. These results are CI/disposable-database evidence only, not Production certificates. Production remains on application SHA `68505535...`; PR #292's trust-proof UI is merged to main and built as an SSO-protected Preview only.

## Commercial boundary

The repository package is `UNLICENSED`. No use, modification, resale, or distribution rights are granted by the repository, website, or this evidence index. Current-main archive SHA-256, SBOM/provenance, and a rights-holder-authorized License Schedule must exist before a buyer-specific grant is made. This does not make a buyer signature a prerequisite for describing the engineering state of the project.

See the full [Client Trust Pack](CLIENT_TRUST_PACK.md), [Current closeout ledger](../ops/REMAINING_CLOSEOUT_GATES.md), [License Schedule template](LICENSE_SCHEDULE_TEMPLATE.md), and [No License Grant notice](../../NO_LICENSE_GRANT_NOTICE.txt).