# OpsCore — Commercial closeout reconciliation

**Evidence cut:** 2026-11-23 05:33 UTC  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Main commit:** `88df9046ea5d57b392530565bc8cf6a10627ac4a`  
**Disposition:** `PASS_WITH_BUYER_RESIDUALS` / `QUALIFIED_DELIVERY_HOLD`

This record supersedes the 2026-11-22 operational status for the Production deployment and evidence listed below. It does not grant a buyer license, establish buyer-environment acceptance, or claim third-party certification.

## 1. Production release — verified

GitHub Actions workflow `vercel-deploy`, run [45116314003](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45116314003), was dispatched once on `main` at the exact head SHA above and completed `success` on 2026-11-23. All seven jobs succeeded; no job failed.

| Item | Verified result |
|---|---|
| Public domain | https://opscore-platform.vercel.app |
| Production deployment | `dpl_FVXwPoqefvkNsxA3BqVrxYnxRQka` |
| Deployment source | `88df9046ea5d57b392530565bc8cf6a10627ac4a` |
| `/api/health` | HTTP 200, `healthy`, version `0.11.62`, PostgreSQL |
| `/api/verify/release` | HTTP 200, `status=PASS`, same source SHA and deployment identity |
| Production isolation | `CERTIFIED` within the release's defined evidence scope |
| Signed tenant route matrix | 67/67 PASS, 0 failures |
| Production PostgreSQL HTTP route inventory | 358/358 PASS, 0 failures |
| Authenticated tenant business flows | 3/3 PASS |
| Full-data recovery comparison | 136 tables, 9,218 rows, 0 content mismatches |
| RLS policy comparison | 135 policy-bearing tables; 0 policy mismatches; `spatial_ref_sys` is the documented PostGIS exception |
| Native Neon PITR | PASS, exact release evidence; restore duration 7,239 ms; temporary restore/comparison branches cleaned up |
| Production promotion and public-domain smoke | PASS; final promoted deployment was checked against the exact commit |

The 67-route signed-session matrix, the 358-route HTTP probe inventory, and the three authenticated business flows are distinct evidence scopes. Do not describe this as 358 separate authenticated end-to-end business workflows. The release proof records `functionalApiRouteAcceptance=PASS_PRODUCTION_FUNCTIONAL_SCOPE` for its defined route and flow inventory.

The Production proof also records:
- `productionAcceptance.status=PASS`, commit and pipeline bound to run 45116314003;
- package SHA-256 `f6c97a996883462d831f56c2a44e792f9c8788c3bf95e49b937184a17df4e717`;
- release archive identity attestation `HMAC-SHA256`, PASS, bound to the same commit and pipeline.

The HMAC attestation above is an internal release-evidence attestation. It is **not** a downloadable buyer ZIP with a Sigstore signature, an in-toto/SLSA provenance statement, or an independent security certification.

## 2. C — Full backend regression results

The exact `vercel-source-verify` job logs for run 45116314003 report:

| Measure | Result |
|---|---:|
| Test files | 181 passed / 0 failed |
| Test cases | 992 total |
| Passed | 989 |
| Failed | 0 |
| Skipped | 3 |
| TODO / unaccounted | 0 / 0 |
| Runner result | `PASS_WITH_SKIPS` |

The three skips were explicit environment-dependent tests, not failures:

1. `firewall-rate-limit-postgres.test.js` — requires `OPSC_PG_ACCEPTANCE_URL` to test atomic rate limiting across independent PostgreSQL runtime processes.
2. `postgres-commercial-acceptance-http.test.js` — requires a dedicated isolated `OPSC_PG_ACCEPTANCE_URL`; without it, the test records `UNVERIFIED` and skips without attempting a database request.
3. `tenant-isolation-matrix.test.js` — requires a disposable `OPSC_PG_TEST_URL` or `OPSC_PG_ACCEPTANCE_URL`; without it, the matrix records `UNVERIFIED` and skips.

Separate run-bound Production PostgreSQL / RLS / HTTP acceptance and the 67/358/3 production evidence described above passed. Those separate gates do not retroactively convert the three skipped Node test cases into executed test cases.

The older reported `912 tests / 25 failures` does not match the latest observed run. The current exact-run log shows 992 cases, zero failures and three explicit skips. Keep the three skips visible until their respective isolated test cases are run with a controlled disposable PostgreSQL URL.

## 3. H — Vercel WAF rehearsal and remaining production posture

A narrow temporary deny canary was added to the Vercel firewall and tested against the non-production staging deployment `opscore-platform-pqerecsww-mosamiryany-1692.vercel.app`. The rule required all of these conditions: the Vercel environment condition `preview`, the exact staging host, `GET /api/health`, and a unique query marker.

Observed results:
- staging health request without the marker: HTTP 200;
- exact marked staging request: HTTP 403 with `x-vercel-mitigated: deny`;
- same marker sent to the Production public domain: HTTP 200.

The temporary rule was then removed. A fresh active-configuration read returned firewall version 6 and confirmed the canary is absent. The existing login/mobile-login POST rate-limit rule remains active at 60 requests per source IP per 60-second window.

Production managed attack rules remain in log-only mode: active `gen`, `rce`, `sqli`, `xss` and `bot_protection` actions still report `log`. Therefore H is **rehearsed, not fully closed**: the bounded staging enforcement path was proven, but broad managed-rule enforcement was not enabled on Production. Do not claim that WAF block/challenge enforcement is globally active.

## 4. I — Buyer Secure Release archive / SBOM / signature

Current committed SBOM inventory is CycloneDX 1.6 with 496 components and 247 dependency edges, generated from the committed backend and mobile npm lockfiles. The generator's own note correctly says this is an inventory/provenance input, not a vulnerability verdict.

The Production deployment's HMAC package attestation passed, but run 45116314003 did not produce the buyer Secure Release bundle. Its uploaded artifacts do not include the Secure Release ZIP, commercial statement, or Sigstore bundle.

The repository's `.github/workflows/opscore-secure-release.yml` contains the required process (backend/mobile checks and audits, SBOM generation/verification, archive creation, commercial statement, Cosign keyless signing, tamper rejection and wrong-signer rejection). A workflow definition and static SBOM are not evidence that this process ran for the exact current SHA.

**I remains UNVERIFIED** until a Secure Release workflow run on the agreed exact SHA publishes and verifies the ZIP, SHA-256, SBOM, commercial statement and Sigstore bundle from that same run. No marketplace code-signing, SLSA provenance or third-party certificate is claimed here.

## 5. J — License and distribution rights

`backend/package.json` remains `UNLICENSED`; `NO_LICENSE_GRANT_NOTICE.txt` remains in force. The License Framework and Schedule template are not executed agreements.

**NO LICENSE GRANT.** A grant requires the rights holder and named buyer to execute a Schedule that identifies the exact deliverable and SHA-256, selects one tier, and records the agreed rights, territory, permitted distribution, price, payment, term, governing law and signatures. These buyer/legal fields cannot be fabricated or signed by automation.

## 6. K — Buyer-owned residuals

These remain buyer-specific and are not seller-side completion claims:

- signed native Android/iOS builds, physical-device QA and app-store publication;
- native-speaker language review and production language qualification (currently 0/114);
- licensed maps and road routing, provider credentials/contracts, attribution, quotas and buyer acceptance;
- installation, migration, security, recovery and operational acceptance in the buyer's own environment.

## 7. Neon operational limits and non-claims

The current Neon project was read again: Production branch `br-proud-salad-bcshhdap` is ready but `protected=false`; automatic snapshot schedule is empty; one manual snapshot is listed. Neon organization remains on the Free plan in the latest plan read.

The successful exact-source PITR comparison is valuable point-in-time recovery evidence. It does not create scheduled backup retention, guarantee an RPO/RTO, enable protected-branch controls, or provide an external availability SLA. No paid upgrade, branch deletion or snapshot deletion was performed.

## 8. Final classification

| Gate | Current state |
|---|---|
| Exact Production deployment and public-domain verification | PASS |
| Production isolation / signed tenant route / defined HTTP and business-flow evidence | PASS within stated scopes |
| Full-data recovery and native PITR evidence | PASS within stated scope |
| Backend regression | PASS_WITH_SKIPS — 992 total, 989 pass, 0 fail, 3 documented skips |
| WAF | Staging canary rehearsal PASS; Production managed rules remain log-only |
| Buyer Secure Release ZIP + same-run SBOM + Sigstore | UNVERIFIED |
| Executed buyer License Schedule | NO LICENSE GRANT |
| Buyer-owned mobile / native language / licensed maps / buyer deployment | REMAINING_BUYER |

**Disposition: Production technical release PASS; commercial delivery remains QUALIFIED_DELIVERY_HOLD / PASS_WITH_BUYER_RESIDUALS.** Do not label the project fully commercially CLOSED, do not distribute software under a nonexistent license, and do not imply independent ISO/SOC/PCI or penetration-test certification.
