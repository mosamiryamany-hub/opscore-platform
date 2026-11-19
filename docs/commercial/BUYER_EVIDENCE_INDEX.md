# OpsCore — Buyer Evidence Index

**Evidence cut:** 2026-11-19 14:52 UTC  
**Current protected main:** [`66d1b564886c42a42dbc9775da91af672d45e04c`](https://github.com/mosamiryamany-hub/opscore-platform/commit/66d1b564886c42a42dbc9775da91af672d45e04c)  
**Live Production deployment:** `dpl_AgWqB4kaSRXhdsmKfvXg9qgeQgt9`  
**Live Production application-code SHA:** `68505535f1c2fabd2a786094f8f64d234d26e123` — matches deployed application code; current main adds documentation only

> This index separates merged source from deployed Production. Provider READY, green CI, and RLS catalog state are not equivalent to Production release certification.

## Public live checks

- Health: https://opscore-platform.vercel.app/api/health
- Login (live 307 redirect to Control Plane): https://opscore-platform.vercel.app/login
- Release proof: https://opscore-platform.vercel.app/api/verify/release
- Deployment identity: https://opscore-platform.vercel.app/api/verify/deployment
- Database security: https://opscore-platform.vercel.app/api/verify/database-security
- Human-readable release proof: https://opscore-platform.vercel.app/verify/release.html

## Main and CI references

- Current protected main: https://github.com/mosamiryamany-hub/opscore-platform/commit/66d1b564886c42a42dbc9775da91af672d45e04c
- Deployed application-code commit: https://github.com/mosamiryamany-hub/opscore-platform/commit/68505535f1c2fabd2a786094f8f64d234d26e123
- PR #290 — live login route: https://github.com/mosamiryamany-hub/opscore-platform/pull/290
- PR #291 — evidence traceability ledger: https://github.com/mosamiryamany-hub/opscore-platform/pull/291
- Latest OpsCore CI: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44547562235
- Latest PostgreSQL 18 isolated acceptance: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44547562215
- PR #287 — login route and HTTP smoke test: https://github.com/mosamiryamany-hub/opscore-platform/pull/287
- PR #288 — fail-closed trust-proof correction: https://github.com/mosamiryamany-hub/opscore-platform/pull/288
- Current-main OpsCore CI: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44547562235
- Current-main source/PostgreSQL 18/contract workflow: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44547562215
- Earlier authorized Production workflow attempt: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44529428910

## Current status

| Evidence | State |
|---|---|
| Current main and branch protection | Verified |
| Current-main source regression CI | PASS |
| Disposable PostgreSQL 18 and contract acceptance | PASS |
| Current Production app-code source | Matches current main application code; latest main addition is docs-only |
| Vercel live deployment source | `68505535...`; current main's only later change is docs-only |
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

The latest completed runs on PR #291 passed: OpsCore source/regression/performance/security/mobile CI (`44547562235`) and disposable PostgreSQL 18 acceptance (`44547562215`), including signed tenant context, 67-route CI matrix, RLS, composite tenant FKs, HTTP runtime acceptance and a real logical dump/restore drill. Production deploy, Neon Preview and Production PITR jobs were skipped. These successes are valid CI evidence, not Production certificates. The deployed app code `68505535...` and tested PR revision `f3ab1791...` differ only by the traceability documentation file; application code is unchanged.

## Commercial boundary

The repository package is `UNLICENSED`. No use, modification, resale, or distribution rights are granted by the repository, website, or this evidence index. Current-main archive SHA-256, SBOM/provenance, and a rights-holder-authorized License Schedule must exist before a buyer-specific grant is made. This does not make a buyer signature a prerequisite for describing the engineering state of the project.

See the full [Client Trust Pack](CLIENT_TRUST_PACK.md), [Current closeout ledger](../ops/REMAINING_CLOSEOUT_GATES.md), [License Schedule template](LICENSE_SCHEDULE_TEMPLATE.md), and [No License Grant notice](../../NO_LICENSE_GRANT_NOTICE.txt).