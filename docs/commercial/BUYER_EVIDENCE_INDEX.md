# OpsCore — Buyer Evidence Index

**Evidence cut:** 2026-11-24  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Main SHA:** `6859b5d86f13ba9f481ed8fce5cc95c729d22b55`  
**Current-main run:** [45360794536](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45360794536)

> This index supersedes historical deployment, CI, and release identifiers copied into older buyer documents. The evidence below is scoped to the named source revision and test target. It is not a self-hosted production or external certification.

## Current source and CI evidence

| Check | Result | Scope |
|---|---|---|
| Protected main reference | VERIFIED | GitHub branch metadata |
| `verify` | PASS | GitHub Actions run 45360794536 |
| `vercel-source-verify` | PASS | Source validation |
| `vercel-contract-verify` | PASS | Contract validation |
| Isolated PostgreSQL RLS/HTTP acceptance | PASS | Disposable CI PostgreSQL |
| CodeQL Actions | PASS | Static analysis |
| CodeQL JS/TS | PASS | Static analysis |
| CodeQL Python | PASS | Static analysis |
| Vercel Production deploy job | SKIPPED | No production deployment from this run |
| Neon Preview migration and HTTP acceptance | SKIPPED | No Preview acceptance from this run |
| Historical Production Neon PITR probe | SKIPPED | No current PITR proof from this run |
| Exact-head Secure Release archive | NOT ESTABLISHED | Must be produced for the eventual deliverable commit |
| Buyer-controlled self-hosted deployment | NOT RUN | No buyer target evidence |
| External accreditation | NONE CLAIMED | No independent assessor certificate is evidenced |

Main branch protection was read as enabled. This index does not claim that all branch rules, secrets, or account-level controls have been independently reverified.

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
