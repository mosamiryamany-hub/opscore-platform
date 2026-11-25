# OpsCore — Buyer Evidence Index

**Evidence snapshot:** 2026-11-24 10:43 UTC (pre-PR #436)  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Main SHA at snapshot:** `f71b8eee32631c833dda8115af8508ae1ccc1a63`  
**OpsCore CI:** [45377527984](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45377527984) · **Vercel/PG acceptance:** [45377522840](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45377522840) · **CodeQL:** [45377523517](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45377523517)

> This index is a dated evidence snapshot for exactly `f71b8eee32631c833dda8115af8508ae1ccc1a63`, immediately before PR #436. It does not qualify the later PR #436 candidate head or any later `main` commit. Its evidence applies only to the named commit and test targets; it is not self-hosted production acceptance or external certification. Its old transaction wording is superseded by the current buyer-acquisition policy in `LICENSE_FRAMEWORK.md` and `SALES_KIT.md`.

## Current source and CI evidence

| Check | Result | Scope |
|---|---|---|
| Protected main reference | VERIFIED | GitHub branch metadata |
| `verify` | PASS_WITH_SKIPS — 1,021 passed, 0 failed, 3 skipped | GitHub Actions run 45377527984 |
| `vercel-source-verify` | PASS (18/18) | Run 45377522840 |
| `vercel-contract-verify` | PASS (3/3) | Run 45377522840 |
| Isolated PostgreSQL RLS/HTTP acceptance | PASS (3/3) | Run 45377522840 |
| Deploy-bound PostgreSQL 18 acceptance | PASS (30/30) | Run 45377522840 |
| CodeQL Actions / JS-TS / Python | PASS | Run 45377523517 |
| Vercel Production deploy job | SKIPPED | No production deployment from this run |
| Neon Preview migration and HTTP acceptance | SKIPPED | No Preview acceptance from this run |
| Historical Production Neon PITR probe | SKIPPED | No current PITR proof from this run |
| Exact-head Secure Release archive | NOT ESTABLISHED | Must be produced for the eventual deliverable commit |
| Buyer-controlled self-hosted deployment | NOT RUN | No buyer target evidence |
| External accreditation | NONE CLAIMED | No independent assessor certificate is evidenced |

Main is covered by the active repository ruleset `protect-main` (enforcement `active`, strict required checks `verify`, `vercel-contract-verify`, `isolated-postgres-rls-and-http-acceptance`, no bypass actors). The separate legacy branch-protection API reports disabled, so this index specifically relies on the active ruleset.

## Seller-hosted Vercel availability — measured 2026-11-24

- Vercel project `opscore-platform`: `live=false`.
- The Production deploy job for snapshot SHA `f71b8eee...` was `SKIPPED`; this workflow created no Production deployment for that SHA.
- Public `GET /api/health` and `GET /api/verify/release` both returned HTTP `402 Payment Required` with `x-vercel-error: DEPLOYMENT_DISABLED` at approximately 10:22 UTC on 2026-11-24.
- A verified project-domain association does not prove that the domain is currently aliased to a live deployment.
- Team context reports plan `Pro`; the available charges endpoint reports usage attribution only, not invoice, outstanding balance or payment-good-standing status. The specific account suspension/billing cause is therefore NOT VERIFIED.

This seller-hosted service outage is separate from CI and from the proposed buyer-owned deployment model. Do not advertise the seller-hosted demo/API as live until Vercel re-enables the project and the current main commit is deployed and measured.

## Self-hosted qualification blockers

1. Signed tenant-context policy is coupled to Vercel Preview/Production environment checks and Vercel release readiness.
2. The `main` snapshot includes an Ed25519 self-hosted release-identity verifier, which verifies trusted operator-signed claims. PR #436 proposes a separate collector for archive/TLS/database measurements, with bounded scope and owner-only output; no buyer-host measurement has yet been executed or accepted. Neither mechanism opens production traffic or qualifies the complete buyer deployment.
3. PostgreSQL migration target validation is Neon-specific; a generic customer-managed PostgreSQL target is not implemented/qualified.
4. The PostgreSQL Compose file is a database service, not a complete application production stack.
5. Buyer-specific TLS ingress, persistent file storage, secret management, backups, restore, monitoring, upgrades and buyer target acceptance are not evidenced.

Details and the required engineering plan are in [Self-Hosted Buyer Edition](SELF_HOSTED_BUYER_EDITION_2026-11-24.md).

## Buyer scope

The proposed product is a source-code handoff for buyer-controlled infrastructure, not a subscription to seller hosting. Seller Vercel/Neon accounts, domains, databases, records, credentials and uptime are excluded unless the accepted buyer-specific transaction terms say otherwise.

Expo mobile source is included; signed native binaries, device QA and store publication are not. Machine-assisted translation remains disclosed; native-speaker review is not established. Licensed maps/road-routing and external provider accounts are not included. Payment processing is disabled until provider setup and live acceptance.

## Commercial / legal boundary

Package metadata is `UNLICENSED`. The root `NO_LICENSE_GRANT_NOTICE.txt` controls. This repository, this index, CI, SBOM, signatures, ZIPs and deployment evidence do not themselves grant buyer rights. Marketing, demonstrations, buyer discovery, quotations and negotiation are open without a pre-sale signature or separate License Schedule. If a sale proceeds, the accepted buyer-specific offer/order/contract pins the exact deliverable and states use, modification, hosting, redistribution, resale and sublicensing rights. The existing tier framework is not itself a grant.

Third-party licence inventory is not legal clearance. The 496-component SBOM inventory is not exact-head legal clearance; two first-party entries have no declared licence expression, notices/license-text collection is incomplete, and commercial clearance is not established.

## Required next evidence

- Fresh Secure Release artifact for the exact delivery commit, with archive SHA-256, SBOM, signature/provenance and same-run tests.
- Remaining self-hosted release work: independent archive/TLS/database measurement and CI provenance binding; provider-neutral migration target and signed tenant-context gates.
- Clean-install, migration, upgrade, HTTP/business-flow, tenant-boundary, backup/restore and rollback CI on a reproducible self-hosted PostgreSQL stack.
- Buyer-controlled target acceptance for the exact artifact and deployment.
- Accepted buyer-specific offer/order/contract recording the exact deliverable and any permitted resale/redistribution rights. A separate License Schedule is optional.

**Classification at this dated evidence cut: SOURCE-CODE CANDIDATE / SELF-HOSTED PRODUCTION BLOCKED / NO LICENSE GRANT / NO EXTERNAL CERTIFICATION. PR #436 remains a separate candidate and must pass its own exact-head checks.**
