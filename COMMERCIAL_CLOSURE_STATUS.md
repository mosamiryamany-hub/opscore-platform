# OpsCore — Technical and Commercial Closure Status

**Reconciled:** 2026-11-25  
**Evidence-cut main:** `c477135a4dda84f9ca3bb158871bae4381d362c6`  
**Seller offer:** OPEN FOR MARKETING AND NEGOTIATION — NO BUYER LICENSE GRANT.  
**Delivery status:** HOLD — exact-head release archive and provider-neutral self-hosted Production qualification are not established.  
**Self-hosted production:** BLOCKED — NOT QUALIFIED.  
**Buyer environment:** NOT_ESTABLISHED / NOT VERIFIED.  
**External certification:** NONE CLAIMED.  
**Rights status:** **NO LICENSE GRANT BY DEFAULT.** Marketing and buyer acquisition are open without a pre-sale signature or separate Schedule; if a sale proceeds, the accepted buyer-specific offer/order/contract defines the deliverable and permitted rights.

Current source baseline: main commit `c477135a4dda84f9ca3bb158871bae4381d362c6`. The exact source commit and package SHA-256 must be pinned to the buyer-specific transaction record if a sale proceeds. This file replaces the stale 2026-11-22 deployment and Neon snapshot as the current status summary. Do not use historical deployment IDs, pipeline IDs, hashes, provider statuses or test counts from the earlier report as current evidence.

The seller may advertise, publish, present, demonstrate, quote and negotiate the source-code candidate before a buyer is known. No pre-sale signature or separate License Schedule is required for these activities. If a sale proceeds, the accepted buyer-specific offer/order/contract records the exact deliverable and the selected rights; no rights beyond those terms are implied.

## Current evidence

Historical pre-PR #436 evidence snapshot for `f71b8eee32631c833dda8115af8508ae1ccc1a63`:
**Historical evidence snapshot (2026-11-24 10:43 UTC; pre-PR #436):** main `f71b8eee32631c833dda8115af8508ae1ccc1a63`.
- [OpsCore CI](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45377527984): `verify` PASS (1,021 passed / 0 failed / 3 skipped).
- [Vercel source/contract and PostgreSQL acceptance](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45377522840): `vercel-source-verify` PASS (18/18); `vercel-contract-verify` PASS (3/3); isolated PostgreSQL RLS/HTTP acceptance PASS (3/3); deploy-bound PostgreSQL 18 acceptance PASS (30/30).
- [CodeQL](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45377523517): Actions, JavaScript/TypeScript and Python PASS.
- Production deployment, Neon Preview migration/HTTP acceptance and historical Production Neon PITR: SKIPPED. SKIPPED is not PASS.
- Exact-head Secure Release archive for `f71b8eee32631c833dda8115af8508ae1ccc1a63`: NOT ESTABLISHED.
- Buyer-controlled self-hosted production acceptance: NOT RUN.
- `backend/docs/API_INVENTORY.json`: unchanged, SHA-256 blob `2ece147beaa36867e56f051d597ffa86d0a979e8`, 60,357 bytes.

- NOT RUN: buyer-controlled self-hosted production acceptance.

## Seller-hosted Vercel availability — measured 2026-11-24

- Vercel project `opscore-platform`: `live=false`.
- The Production deploy job for snapshot SHA `f71b8eee...` was `SKIPPED`; this workflow created no Production deployment for that SHA.
- Public `GET /api/health` and `GET /api/verify/release` both returned HTTP `402 Payment Required` with `x-vercel-error: DEPLOYMENT_DISABLED` at approximately 10:22 UTC on 2026-11-24.
- A verified project-domain association does not prove that the domain is currently aliased to a live deployment.
- Team context reports plan `Pro`; the available charges endpoint reports usage attribution only, not invoice, outstanding balance or payment-good-standing status. The specific account suspension/billing cause is therefore NOT VERIFIED.

This seller-hosted service outage is separate from CI and from the proposed buyer-owned deployment model. Do not advertise the seller-hosted demo/API as live until Vercel re-enables the project and the current main commit is deployed and measured.

## Technical disposition

The intended source-code offer is for buyer-controlled infrastructure, with seller-hosted Vercel/Neon services excluded. However, provider-neutral self-hosted production is not yet supported by current code:
1. Signed tenant-context activation is coupled to Vercel Preview/Production environment and release-readiness conditions.
2. A separate Ed25519 self-hosted release-attestation verifier is now wired to the existing `/api/verify/release` endpoint through explicit `OPSC_RELEASE_PROOF_MODE=self-hosted`. It verifies trusted operator-signed claims only; it does not independently collect archive/TLS/database measurements, open traffic or qualify end-to-end production.
3. Neon-specific PostgreSQL migration targeting validates Neon endpoint/project/branch identity and expects a Neon owner role; a generic customer-managed PostgreSQL target is not implemented or qualified.
4. The current PostgreSQL Compose file is not a complete application production stack with durable storage, ingress, secrets, monitoring and recovery.

The detailed source-level findings and required corrective plan are in [Self-Hosted Buyer Edition](docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md).

## Security, product and buyer residuals

- The backend Docker build context excludes environment files, local databases, uploads/data and build residue. Docker image build-context verification passed before merge and again in CI.
- Expo mobile source only; no signed native binaries, physical-device acceptance or store publication.
- Machine-assisted translations remain disclosed; native-speaker review is not established.
- Licensed maps/road-routing and external provider accounts/credentials/live acceptance are not included.
- Payment processing is disabled until a provider is configured and its signed webhook/payment flows are tested.
- No accredited ISO 27001, SOC 2, PCI DSS or other external certification is evidenced.

## Legal disposition

Package metadata remains `UNLICENSED`; `NO_LICENSE_GRANT_NOTICE.txt` controls. L1 internal use does not include resale; L2 resale/redistribution applies only in the forms stated in the accepted buyer-specific transaction terms. Third-party components remain under their own licenses and are not re-licensed by this package.

**Final status: OPEN / HOLD.** A marketing conversation may describe the source candidate within these limits. Do not deliver or describe it as a qualified self-hosted production system until technical blockers, exact-artifact evidence, buyer acceptance and legal authority are resolved.
