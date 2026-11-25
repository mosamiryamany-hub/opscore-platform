# OpsCore — Client Inspection Package Status

**Marketing:** MAY BE PRESENTED AS A SOURCE-CODE CANDIDATE WITH DISCLOSURES.  
**Delivery:** HOLD — exact-head release archive and provider-neutral self-hosted Production qualification are not established. **NO LICENSE GRANT BY DEFAULT.** Marketing, demonstration and negotiation are open without a pre-sale signature or separate Schedule.  
**Self-hosted production:** BLOCKED — NOT QUALIFIED.  
**External accreditation:** NONE CLAIMED.

This static status page is not a current archive, certificate, deployment acceptance or licence. It is superseded by the controlling [Self-Hosted Buyer Edition](docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md) and [Buyer Evidence Index](docs/commercial/BUYER_EVIDENCE_INDEX.md).

## Historical evidence snapshot (2026-11-24 10:43 UTC; pre-PR #436)

- Main SHA: `f71b8eee32631c833dda8115af8508ae1ccc1a63`.
- OpsCore CI [45377527984](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45377527984): PASS_WITH_SKIPS — 1,021 passed, 0 failed, 3 skipped.
- Vercel/PG run [45377522840](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45377522840): source verification, contract checks, isolated RLS/HTTP and disposable PostgreSQL 18 acceptance: PASS.
- CodeQL [45377523517](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45377523517): Actions/JS-TS/Python PASS.
- Vercel Production deploy, Neon Preview migration/HTTP acceptance and historical Production PITR: SKIPPED.
- Exact-head Secure Release archive: NOT ESTABLISHED.
- Buyer-controlled self-hosted production acceptance: NOT RUN.

## Seller-hosted Vercel availability — measured 2026-11-24

- Vercel project `opscore-platform`: `live=false`.
- The Production deploy job for snapshot SHA `f71b8eee...` was `SKIPPED`; this workflow created no Production deployment for that SHA.
- Public `GET /api/health` and `GET /api/verify/release` both returned HTTP `402 Payment Required` with `x-vercel-error: DEPLOYMENT_DISABLED` at approximately 10:22 UTC on 2026-11-24.
- A verified project-domain association does not prove that the domain is currently aliased to a live deployment.
- Team context reports plan `Pro`; the available charges endpoint reports usage attribution only, not invoice, outstanding balance or payment-good-standing status. The specific account suspension/billing cause is therefore NOT VERIFIED.

This seller-hosted service outage is separate from CI and from the proposed buyer-owned deployment model. Do not advertise the seller-hosted demo/API as live until Vercel re-enables the project and the current main commit is deployed and measured.

A green CI result does not certify a buyer's server, PostgreSQL, TLS, backup/restore, integrations or entire business workflows.

## Intended transaction

The offer is a proposed source-code handoff for buyer-controlled infrastructure, not a seller-hosted subscription. Seller Vercel/Neon accounts, domains, production database, customer data, provider credentials and hosting service are excluded unless the accepted buyer-specific transaction terms explicitly include them.

The source is not yet qualified for provider-neutral self-hosted production. The release-verification endpoint now supports an explicit Ed25519 self-hosted operator-attestation mode, but Vercel-specific signed tenant-context activation and Neon-specific PostgreSQL migration targeting remain open. The attestation is not an independent measurement or end-to-end buyer deployment acceptance.

## Source scope

Included: web console, backend/API source, PostgreSQL schema/migration assets, tests/release tooling/documentation and Expo mobile source.

Not included or not qualified: signed APK/AAB/IPA, native signing, physical-device QA, store publication, native-speaker language review, licensed maps/road-routing, live third-party provider integrations, payment processing and buyer infrastructure acceptance.

## Translation and locale qualification

The Contact Center runtime currently exposes 105 selectable locale codes: 1 English source, 100 machine-assisted drafts and 4 explicit English fallbacks. The separate qualification register contains 114 source rows. Native-speaker review is 0/114; production qualification is 0/105 selectable locales. Structural checks are not linguistic approval; keep the machine-translation notice visible.

## Security and compliance

Internal automated testing, static analysis, an SBOM or a signed provenance statement is not an external certification. No ISO 27001, SOC 2, PCI DSS or other accredited certificate is claimed. Do not say vulnerability-free or fully secure.

## Rights

Package metadata remains `UNLICENSED`; `NO_LICENSE_GRANT_NOTICE.txt` controls. Marketing and buyer acquisition do not require a pre-sale signature or separate License Schedule. If a sale proceeds, the accepted buyer-specific offer/order/contract identifies the exact source commit/package SHA-256 and expressly states the granted rights. L1 internal use does not include resale. Redistribution, resale, OEM hosting or sublicensing applies only to the extent expressly stated in those accepted transaction terms.

Third-party dependency licences remain separate; the SBOM inventory is not legal clearance. Rights-holder authority to sign must be confirmed for the transaction.
