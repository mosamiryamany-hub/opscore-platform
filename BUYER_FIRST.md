# OpsCore — Start Here (Buyer)

> **HOLD — SOURCE-CODE CANDIDATE ONLY. NO LICENSE GRANT. SELF-HOSTED PRODUCTION NOT YET QUALIFIED.**

This page is technical/commercial orientation only. Do not install, run, copy, modify, deploy, distribute, resell, sublicense or otherwise exploit the source unless the rights holder and named buyer have executed a written License Schedule for the exact deliverable.

## What is being offered

OpsCore is a multi-sector operations source candidate comprising web console, HTTP API, PostgreSQL schema/migration assets, and Expo mobile source. The proposed commercial model is a source-code handoff for buyer-controlled infrastructure, not a seller-hosted subscription.

This does **not** mean a provider-neutral self-hosted production installation is already supported. Current source-level blockers include Vercel-specific signed-tenant release gating and Neon-specific PostgreSQL migration targeting. The current status and required engineering closure are documented in [Self-Hosted Buyer Edition](docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md).

## Current evidence

Evidence cut: main `6859b5d86f13ba9f481ed8fce5cc95c729d22b55`, GitHub Actions run [45360794536](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45360794536).

- Source validation, contract checks, isolated PostgreSQL RLS/HTTP acceptance and CodeQL checks: PASS in the named CI run.
- Production deployment, Neon Preview migration/HTTP acceptance and historical Production PITR probe: SKIPPED.
- Exact-head Secure Release package for this evidence cut: NOT ESTABLISHED.
- Buyer-owned self-hosted production acceptance: NOT RUN.
- Independent external certification: NONE CLAIMED.

A PASS applies only to the test and target named in its evidence. SKIPPED is not PASS. CI is not a buyer production certificate.

## Legal and commercial boundary

- Package metadata: `UNLICENSED`.
- Buyer licence: `NONE` until a written Schedule is executed.
- Distribution/resale/sublicensing: `NOT AUTHORIZED` unless expressly granted in the signed Schedule.
- Third-party dependency licences are separate; the SBOM inventory is not legal clearance.
- Rights-holder identity and authority to sign must be established for the transaction.

The seller may advertise, present and negotiate a prospective source-code offer as allowed by the no-license notice. This does not authorize buyer access or use.

## Source scope and residuals

Included source: web/API, database schema and migration assets, tests/release tooling, technical docs and Expo source.

Not included or not qualified: seller-hosted services/accounts/data, buyer-specific infrastructure, signed native mobile artifacts, app-store publication, native-speaker language review, licensed maps/road-routing, external provider contracts/credentials/live integrations, payment processing, and independent certification.

## Before any buyer installation

1. The rights holder and buyer execute a License Schedule for the exact source commit/package digest.
2. The seller produces a fresh exact-head release archive, SHA-256, SBOM, provenance/signature and test evidence.
3. The self-hosted blockers in the controlling edition document are closed and independently tested, or the buyer receives a clearly limited non-production evaluation scope.
4. The buyer runs acceptance on buyer-controlled infrastructure and records the exact target, evidence, residuals and responsible operators.

Start with the [Buyer Delivery Boundary](BUYER_DELIVERY.md), [Self-Hosted Buyer Edition](docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md), and [Buyer Installation Guide](docs/commercial/BUYER_INSTALLATION_GUIDE.md).
