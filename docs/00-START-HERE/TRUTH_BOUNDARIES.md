# OpsCore — Truth Boundaries

**Evidence cut:** 2026-11-24  
**Main SHA:** `d243a428bb44b4cbd0d1fd768cb907d0e9fcbdb1`  
**Classification:** SOURCE-CODE CANDIDATE / SELF-HOSTED PRODUCTION BLOCKED / NO LICENSE GRANT / NO EXTERNAL CERTIFICATION.

## Verified on the named CI revision

OpsCore CI [45374083091](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374083091) passed 21/21; Vercel/PG run [45374083161](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374083161) passed source (18/18), contract (3/3), isolated PostgreSQL (3/3), and deploy-bound PostgreSQL 18 acceptance (30/30); CodeQL [45374082761](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374082761) passed Actions, JS/TS and Python.

These results prove only the tests and targets run by that workflow. They do not certify a buyer production database, customer network, all business workflows, restore objectives or third-party integrations.

## Seller-hosted Vercel availability — measured 2026-11-24

- Vercel project `opscore-platform`: `live=false`.
- No Production deployment exists for current main `d243a428bb44b4cbd0d1fd768cb907d0e9fcbdb1` (exact-SHA deployment query returned zero records).
- Public `GET /api/health` and `GET /api/verify/release` both returned HTTP `402 Payment Required` with `x-vercel-error: DEPLOYMENT_DISABLED` at approximately 10:22 UTC on 2026-11-24.
- A verified project-domain association does not prove that the domain is currently aliased to a live deployment.
- Team context reports plan `Pro`; the available charges endpoint reports usage attribution only, not invoice, outstanding balance or payment-good-standing status. The specific account suspension/billing cause is therefore NOT VERIFIED.

This seller-hosted service outage is separate from CI and from the proposed buyer-owned deployment model. Do not advertise the seller-hosted demo/API as live until Vercel re-enables the project and the current main commit is deployed and measured.

## Not passed / not established

- Vercel production deployment: SKIPPED in the current-main workflow.
- Neon Preview migration and HTTP acceptance: SKIPPED.
- Historical Production Neon PITR probe: SKIPPED.
- Exact-head Secure Release archive: NOT ESTABLISHED.
- Release proof: a distinct Ed25519 self-hosted operator-attestation mode is implemented on the existing endpoint; it verifies signed claims only and does not independently measure archive/TLS/database facts.
- Self-hosted tenant-context activation and provider-neutral PostgreSQL migrations: BLOCKED by Vercel/Neon-specific coupling in current code.
- Buyer-controlled self-hosted installation and acceptance: NOT RUN.
- External ISO 27001, SOC 2, PCI DSS or other accreditation: NONE CLAIMED.
- Buyer licence and distribution authorization: NONE until an exact-deliverable License Schedule is executed.

## Product residuals

- Expo source only; native signed binaries and physical-device/store acceptance are not included.
- Contact Center translations are machine-assisted; native-speaker review remains 0/114 source-language qualification rows and current selectable runtime qualification 0/105.
- Licensed maps/road-routing and external providers are not included unless separately licensed, configured and live-tested.
- Payment processing is disabled until provider onboarding, signed webhook verification and live acceptance.

## Status vocabulary

- PASS — the named test ran and passed on its named target.
- FAIL — the named test ran and failed.
- SKIPPED — the test did not run; never count it as PASS.
- NOT RUN — no execution evidence exists.
- NOT VERIFIED — evidence is absent, stale, mismatched or insufficient.
- BLOCKED — a known technical/authority prerequisite prevents qualification.
- NOT CERTIFIED — no independent or scoped certification has been established.

For the controlling technical and commercial record, see [Self-Hosted Buyer Edition](../commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md).
