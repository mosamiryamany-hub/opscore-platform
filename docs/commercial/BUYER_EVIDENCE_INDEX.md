# OpsCore — Buyer Evidence Index

**Evidence cut:** 2026-11-19  
**Protected main at evidence cut:** [`d672dce8f18e1d7095aed3126aedb0f995796144`](https://github.com/mosamiryamany-hub/opscore-platform/commit/d672dce8f18e1d7095aed3126aedb0f995796144)  
**Live Production deployment:** `dpl_AgWqB4kaSRXhdsmKfvXg9qgeQgt9`  
**Live Production application-code SHA:** `68505535f1c2fabd2a786094f8f64d234d26e123` — Production is still pinned to this earlier application revision; protected main at the evidence cut `d672dce8...` includes PR #292 trust-proof UI changes not yet in Production

> This index separates merged source from deployed Production. Provider READY, green CI, and RLS catalog state are not equivalent to Production release certification.

## Public live checks

- Health: https://opscore-platform.vercel.app/api/health
- Login (live 307 redirect to Control Plane): https://opscore-platform.vercel.app/login
- Release proof: https://opscore-platform.vercel.app/api/verify/release
- Deployment identity: https://opscore-platform.vercel.app/api/verify/deployment
- Database security: https://opscore-platform.vercel.app/api/verify/database-security
- Human-readable release proof: https://opscore-platform.vercel.app/verify/release.html

## Main and CI references

- Protected main at evidence cut: https://github.com/mosamiryamany-hub/opscore-platform/commit/d672dce8f18e1d7095aed3126aedb0f995796144
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
| Current Production app-code source | NOT CURRENT — Production remains on `68505535...`; main at the evidence cut `d672dce8...` includes PR #292 UI code |
| Vercel live deployment source | `68505535...`; does not yet include the evidence-cut main revision `d672dce8...` |
| PR #292 Preview build | READY — `dpl_DCQk2TbxtCoMHLDCEQ8pN4W33ay1`, exact SHA `d672dce8...`; SSO-protected; not Production |
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

## Superseding code-only sale scope — 2026-11-23

The deliverable is source code plus the exact release/evidence package. Seller Vercel website, seller Production deployment, seller Neon database and seller operational data are excluded. No paid Neon/Vercel plan upgrade is required or authorized. Seller infrastructure health and backup schedules are not buyer-code acceptance gates.

Exact release evidence and the current full-site closeout scope are documented in [Full-site Closeout Scope](SELLER_CODE_ONLY_CLOSEOUT_2026-11-23.md): main `fbc4a3082325dff98e2ed41fffe42c3d76863254`, Secure Release run `45122272270`, archive SHA-256 `7783d6614c033ecf85ee181db394fbd499dccd8f19a0b0509b97d0495e69c6ac`, CycloneDX 1.6 SBOM, Sigstore verification, tamper rejection and wrong-signer rejection. One conditional release-tag check was skipped because no tag was supplied; it is not reported as a pass.

Current locale catalog: exactly 105 (1 English source, 100 machine-assisted drafts, 4 English fallbacks); 0 native-speaker reviewed and 0 production-qualified. The historical 114-row qualification matrix is not the current catalog.

Seller-side code gates remain: complete applicable test accounting on exact source, isolated PostgreSQL migration/schema/RLS/tenant/FK tests, dependency/security audits, deterministic SBOM/provenance, archive/signature verification, clean-room reproducibility, and exact-source trust-link reconciliation. External ISO/SOC2/PCI certificates are not evidenced and cannot be self-issued by CI. Buyer environment acceptance and license grant remain separate.


## Superseding full-site evidence update — 2026-11-23

This section supersedes the preceding code-only sale paragraph. The current owner-approved scope includes the seller Vercel website, Production deployment, Neon Production database and recovery posture, and six legal/commercial pages.

- Evidence-cut `main`: `5e3cb211b7660002418757612033ff8928f25b69`; PR #401 merged.
- OpsCore CI run `45129195704`: 990 total / 987 passed / 0 failed / 3 skipped (`PASS_WITH_SKIPS`).
- PostgreSQL 18 acceptance run `45129195834`: HTTP commercial acceptance 1/1 PASS; PostgreSQL firewall rate-limit 1/1 PASS; tenant matrix 2/2 PASS; 346 source-derived tenant routes PASS; disposable logical restore 137 tables PASS.
- The three generic-runner skips were separately run and passed in the isolated PostgreSQL job. Do not relabel the generic runner's own result.
- Production deployment remains `dpl_FVXwPoqefvkNsxA3BqVrxYnxRQka` on `88df9046...`; no Production deployment exists for `5e3cb211...` in the Vercel deployment query. The successful push workflow did not run the separately gated Production deploy job.
- Vercel WAF: active CRS/Bot Protection rules are log-only; auth rate limit is active at 60/IP/60s; active attack query returned no anomalies.
- Neon Free: 6-hour history, one existing manual snapshot, no scheduled backups, Primary unprotected due plan limit. Two restore branches from the same snapshot matched SHA-256 content digests across 136/136 public tables, while Primary-versus-restore differences remain expected historical point-in-time divergence, not current parity.
- Production proof binding remains open: the code uses a textual certification flag and evidence pinned to a probe deployment; the workflow subsequently builds a separate staged deployment. Same-final-deployment certification is not established.
- Six legal/commercial pages were reported 404 by the supplied probe; publishing requires owner-approved legal and commercial facts.
- Historical GitHub, Vercel and Neon credentials require provider-side revocation and replacement; connected actions cannot revoke those account-level tokens.

The full measured register is in [Buyer Residuals](../BUYER_RESIDUALS.md) and [Full-site Closeout Scope](SELLER_CODE_ONLY_CLOSEOUT_2026-11-23.md). Current decision: **OPEN**. No license grant or independent external certification is evidenced.


**Buyer-transfer boundary:** This full-site closeout measures the seller's own Vercel/Neon operations and website. It does not transfer seller Vercel or Neon accounts, customer records, live database contents, domains, or hosting to a buyer. The buyer deliverable remains source code and release evidence unless a separate written transfer agreement explicitly adds hosted services or data migration.
