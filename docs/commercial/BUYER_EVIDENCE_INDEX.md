# OpsCore — Buyer Evidence Index

**Evidence cut:** 2026-11-24  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Main SHA:** `d243a428bb44b4cbd0d1fd768cb907d0e9fcbdb1`  
**OpsCore CI:** [45374083091](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374083091) · **Vercel/PG acceptance:** [45374083161](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374083161) · **CodeQL:** [45374082761](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374082761)

> This index supersedes historical deployment, CI, and release identifiers copied into older buyer documents. The evidence below is scoped to the named source revision and test target. It is not a self-hosted production or external certification.

## Current source and CI evidence

| Check | Result | Scope |
|---|---|---|
| Protected main reference | VERIFIED | GitHub branch metadata |
| `verify` | PASS (21/21) | GitHub Actions run 45374083091 |
| `vercel-source-verify` | PASS (18/18) | Run 45374083161 |
| `vercel-contract-verify` | PASS (3/3) | Run 45374083161 |
| Isolated PostgreSQL RLS/HTTP acceptance | PASS (3/3) | Run 45374083161 |
| Deploy-bound PostgreSQL 18 acceptance | PASS (30/30) | Run 45374083161 |
| CodeQL Actions / JS-TS / Python | PASS | Run 45374082761 |
| Vercel Production deploy job | SKIPPED | No production deployment from this run |
| Neon Preview migration and HTTP acceptance | SKIPPED | No Preview acceptance from this run |
| Historical Production Neon PITR probe | SKIPPED | No current PITR proof from this run |
| Exact-head Secure Release archive | NOT ESTABLISHED | Must be produced for the eventual deliverable commit |
| Buyer-controlled self-hosted deployment | NOT RUN | No buyer target evidence |
| External accreditation | NONE CLAIMED | No independent assessor certificate is evidenced |

Main is covered by the active repository ruleset `protect-main` (enforcement `active`, strict required checks `verify`, `vercel-contract-verify`, `isolated-postgres-rls-and-http-acceptance`, no bypass actors). The separate legacy branch-protection API reports disabled, so this index specifically relies on the active ruleset.

## Seller-hosted Vercel availability — measured 2026-11-24

- Vercel project `opscore-platform`: `live=false`.
- No Production deployment exists for current main `d243a428bb44b4cbd0d1fd768cb907d0e9fcbdb1` (exact-SHA deployment query returned zero records).
- Public `GET /api/health` and `GET /api/verify/release` both returned HTTP `402 Payment Required` with `x-vercel-error: DEPLOYMENT_DISABLED` at approximately 10:22 UTC on 2026-11-24.
- A verified project-domain association does not prove that the domain is currently aliased to a live deployment.
- Team context reports plan `Pro`; the available charges endpoint reports usage attribution only, not invoice, outstanding balance or payment-good-standing status. The specific account suspension/billing cause is therefore NOT VERIFIED.

This seller-hosted service outage is separate from CI and from the proposed buyer-owned deployment model. Do not advertise the seller-hosted demo/API as live until Vercel re-enables the project and the current main commit is deployed and measured.

## Self-hosted qualification blockers

1. Signed tenant-context policy is coupled to Vercel Preview/Production environment checks and Vercel release readiness.
2. A separate Ed25519 self-hosted release-identity verifier and selector on the existing `/api/verify/release` endpoint are implemented. They verify a trusted operator-signed statement only; they do not independently collect the archive/TLS/database facts, open production traffic, or qualify the complete buyer deployment.
3. PostgreSQL migration target validation is Neon-specific; a generic customer-managed PostgreSQL target is not implemented/qualified.
4. The PostgreSQL Compose file is a database service, not a complete application production stack.
5. Buyer-specific TLS ingress, persistent file storage, secret management, backups, restore, monitoring, upgrades and buyer target acceptance are not evidenced.

Details and the required engineering plan are in [Self-Hosted Buyer Edition](SELF_HOSTED_BUYER_EDITION_2026-11-24.md).

## Buyer scope

The proposed product is a source-code handoff for buyer-controlled infrastructure, not a subscription to seller hosting. Seller Vercel/Neon accounts, domains, databases, records, credentials and uptime are excluded unless a separate signed transfer agreement says otherwise.

Expo mobile source is included; signed native binaries, device QA and store publication are not. Machine-assisted translation remains disclosed; native-speaker review is not established. Licensed maps/road-routing and external provider accounts are not included. Payment processing is disabled until provider setup and live acceptance.

## Commercial / legal boundary

Package metadata is `UNLICENSED`. The root `NO_LICENSE_GRANT_NOTICE.txt` controls. This repository, this index, CI, SBOM, signatures, ZIPs and deployment evidence grant no buyer rights. Use, modification, hosting, redistribution, resale and sublicensing require an executed rights-holder/buyer License Schedule pinning the exact deliverable. The existing tier framework is not itself a grant.

Third-party licence inventory is not legal clearance. Two SBOM components have no declared licence expression in the 2026-11-24 inventory and require resolution before claiming complete licence clearance.

## Required next evidence

- Fresh Secure Release artifact for the exact delivery commit, with archive SHA-256, SBOM, signature/provenance and same-run tests.
- Remaining self-hosted release work: independent archive/TLS/database measurement and CI provenance binding; provider-neutral migration target and signed tenant-context gates.
- Clean-install, migration, upgrade, HTTP/business-flow, tenant-boundary, backup/restore and rollback CI on a reproducible self-hosted PostgreSQL stack.
- Buyer-controlled target acceptance for the exact artifact and deployment.
- Executed buyer-specific License Schedule. Resale/redistribution rights must be explicit, not inferred.

**Classification at evidence cut: SOURCE-CODE CANDIDATE / SELF-HOSTED PRODUCTION BLOCKED / NO LICENSE GRANT / NO EXTERNAL CERTIFICATION.**
