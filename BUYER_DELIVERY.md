# OpsCore — Buyer Delivery Boundary

**Delivery status: HOLD — NO BUYER LICENSE GRANT / NO DELIVERY BEFORE EXECUTED SCHEDULE.**  
**NO LICENSE GRANT — ALL RIGHTS RESERVED.**
**Self-hosted production: BLOCKED — NOT QUALIFIED.**

This repository, any deployment, checksum, SBOM, test report, attestation or generated archive does not grant permission to access, use, install, run, inspect, copy, modify, host, publish, distribute, sell, resell, sublicense, rent, transfer or commercially exploit the software. The root `NO_LICENSE_GRANT_NOTICE.txt` remains controlling. Delivery and buyer use require a written License Schedule executed and signed by the rights holder and the named buyer for the exact deliverable.

Seller advertising, listings, demonstrations and negotiations may happen before a buyer is known. These activities do not grant buyer rights or authorize delivery.

## Intended delivery model

The proposed edition is source code for deployment on infrastructure controlled by the buyer. It is not a hosted subscription. Seller Vercel/Neon accounts, domains, production databases, customer records, provider credentials, cloud accounts and operational service are excluded unless a separate signed agreement explicitly includes them.

**The current code is not yet qualified for provider-neutral self-hosted production.** A separate Ed25519 self-hosted operator-attestation mode is now available on the existing release verification endpoint; signed-tenant context is still Vercel-gated and PostgreSQL migration identity remains Neon-specific. See [Self-Hosted Buyer Edition](docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md).

## Candidate identity

Do not reuse historical commit hashes, pipeline IDs, deployment IDs, package digests or archive names. A deliverable identity must be taken together from one successful exact-head Secure Release run:
- source commit and workflow run;
- archive filename, byte length and SHA-256;
- SBOM and provenance/signature evidence;
- exact-run test and dependency-audit evidence.

The 2026-11-24 evidence cut is main `d243a428bb44b4cbd0d1fd768cb907d0e9fcbdb1`. OpsCore CI passed 21/21, source/contract and isolated PostgreSQL acceptance passed, deploy-bound PostgreSQL 18 acceptance passed 30/30, and CodeQL passed for Actions/JS-TS/Python. Production deploy, Neon Preview acceptance and historical PITR were skipped. No exact-head buyer release archive is established for this commit. Any additional source change invalidates this evidence identity and requires a fresh release run.

## Seller-hosted Vercel availability — measured 2026-11-24

- Vercel project `opscore-platform`: `live=false`.
- No Production deployment exists for current main `d243a428bb44b4cbd0d1fd768cb907d0e9fcbdb1` (exact-SHA deployment query returned zero records).
- Public `GET /api/health` and `GET /api/verify/release` both returned HTTP `402 Payment Required` with `x-vercel-error: DEPLOYMENT_DISABLED` at approximately 10:22 UTC on 2026-11-24.
- A verified project-domain association does not prove that the domain is currently aliased to a live deployment.
- Team context reports plan `Pro`; the available charges endpoint reports usage attribution only, not invoice, outstanding balance or payment-good-standing status. The specific account suspension/billing cause is therefore NOT VERIFIED.

This seller-hosted service outage is separate from CI and from the proposed buyer-owned deployment model. Do not advertise the seller-hosted demo/API as live until Vercel re-enables the project and the current main commit is deployed and measured.

## Included source candidate

- Web console and backend/API source.
- PostgreSQL schema/migration assets and database-adapter code.
- Tests, source validation, CI/release tooling and technical documentation.
- Expo mobile source and lockfiles only.

## Exclusions and open buyer/seller work

- No provider-neutral self-hosted production qualification is established.
- No signed Android/iOS binaries, device QA, buyer signing identities or store publication.
- Native-speaker translation review and production language qualification are not established; machine-assisted translation must remain disclosed.
- Licensed maps/road-routing, attribution, provider quotas and traffic ETA are not included.
- External OIDC/JWKS, email/SMS/WhatsApp, telephony, payments, webhooks, object storage, KMS/HSM and cloud services are not live-connected or transferred by source presence.
- Payment processing remains disabled until a provider is configured and live signed-webhook/payment-flow acceptance passes.
- No ISO 27001, SOC 2, PCI DSS or other independent certificate is claimed.

Seller-reference CI is not buyer-environment acceptance. A buyer deployment requires its own exact-commit, database, tenant-isolation, TLS, backup/restore, provider and operational acceptance.

## Rights and resale

Package metadata remains `UNLICENSED`. L1/L2/L3 in `docs/commercial/LICENSE_FRAMEWORK.md` are negotiation options, not grants. Internal-use rights, modification, third-party hosting, OEM, source redistribution, resale and sublicensing are distinct rights. Any redistribution/resale right must be expressly selected in a signed Schedule. No such right is granted by this repository.

**NO BUYER DELIVERY OR USE BEFORE EXECUTED LICENSE SCHEDULE.**
