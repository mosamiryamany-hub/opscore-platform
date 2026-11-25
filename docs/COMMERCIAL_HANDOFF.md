# OpsCore v0.11.62 — Commercial Handoff

**Seller offer status: OPEN FOR MARKETING AND NEGOTIATION BEFORE A BUYER IS IDENTIFIED.**  
**NO LICENSE GRANT BY DEFAULT.** Marketing, demonstrations, buyer discovery and negotiation are open without a pre-sale signature or separate Schedule. If a sale proceeds, accepted buyer-specific transaction terms define the deliverable and permitted rights.

The commercial classification `PASS_WITH_BUYER_RESIDUALS` describes technical evidence only. The source commit, workflow run, artifact ID, archive filename/size/SHA-256, SBOM and provenance attestation must be obtained from one successful exact-head Secure Release run. This document intentionally pins no candidate-specific identifiers.

## 1. Rights boundary

The rights holder may advertise, list, present, demonstrate, quote and negotiate the offer before a buyer is identified. No pre-sale signature or separate License Schedule is required. If a sale proceeds, the accepted buyer-specific offer/order/contract states the exact pinned deliverable, selected tier, permitted use and distribution scope, price, term and support. Package metadata remains `UNLICENSED`; this document does not itself grant rights.

## 2. Release identity and evidence

The archive-producing exact-head GitHub Actions run is authoritative for source commit, workflow run ID, artifact, archive byte count and SHA-256, JUnit/step results, dependency audits, i18n report, SBOM and provenance attestation. Recalculate the nested ZIP digest and compare it with the external same-run statement. Any source, release-tooling or package change invalidates all prior candidate identity. Never reuse old pipeline IDs, hashes, test counts, artifact names or deployments.

The Vercel Production deployment must be READY and identify the same source commit as the selected run before any technical handoff claim. Verify `/api/health`, `/api/verify/deployment`, `/api/verify/release`, `/api/verify/database-security`, and `/api/verify/database`. The source commit, pipeline, deployment identity and package fingerprint must agree. Neon Preview migration, RLS and role/grant proof must be queried on the actual Preview database as the runtime role.

PostgreSQL HTTP acceptance is PASS only when the evidence commit and workflow run exactly match the archive-producing run. Historical PASS evidence never qualifies for a newer candidate.

## 3. Seller-reference technical status

The Vercel Production deployment is READY, but the current stored session-isolation and recovery evidence is NOT_VERIFIED: both records contain a rebind marker with probesReexecuted=false, and the recovery record is bound to a previous Neon branch. Do not claim seller-reference production isolation certification until fresh dual-tenant and recovery probes are bound to the exact active application commit and Neon Production branch and independently reviewed. This does not certify a buyer environment or every functional business flow. A branch-point comparison is not full PITR/RPO/RTO certification.

Signed tenant-context cutover remains incomplete: Preview-only session-autobind work has passed isolated CI but is not yet deployed or enabled in Vercel Preview; Production migrations remain on the legacy context path, while authentication, system/background, Knowledge-pool and remaining route-purpose paths still require live proof.

## 4. Delivered engineering scope

OpsCore includes backend/API source, browser operations console, internal workflows, authentication/session/tenant controls, Contact Center module, locale resources, Expo mobile source, PostgreSQL migrations, tests, release tooling, documentation and build evidence.

## 5. Dependencies and localization

Translation catalogue: 105 selectable runtime locales (1 English source, 100 machine-assisted drafts, 4 English fallbacks); 9 flagged codes are withdrawn. The separate qualification register contains 114 source rows. Native-speaker review is 0/114 source rows; production qualification is 0/105 selectable runtime locales. Keep the visible machine-translation notice. Dependency findings must be taken from the full same-run root/mobile audit JSON; do not use stale summaries or claim zero advisories without evidence.

## 6. Customer-owned responsibilities

1. External provider accounts, credentials, licenses, contracts, quotas, billing, setup and live acceptance for identity/OIDC/JWKS, email/SMS/WhatsApp/PSTN/SIP, external call-center/telephony, payments, webhooks, object storage, KMS/HSM and cloud.
2. Maps: provider selection, road-routing/map license, API keys, attribution, quotas, billing and live acceptance.
3. Android/iOS: buyer-specific EAS accounts/projects, signing, native builds, physical-device tests, developer accounts, store submission and publication. No signed APK/AAB/IPA is included.
4. Native-speaker/domain review before production language-quality claims.
5. Buyer-environment installation, migrations, RLS, restore, WAF/TLS, observability and operational acceptance.
6. Post-handover dependency/security maintenance.

The seller remains responsible for fixable defects in delivered source, internal APIs/adapters, authorization, migrations, test coverage, packaging, release evidence and documentation that can be fixed without buyer credentials or provider contracts.

## 7. Handoff prohibitions

- Do not claim all external providers are live.
- Do not claim signed Android/iOS binaries or app-store approval.
- Do not claim 114 human-reviewed languages.
- Do not claim vulnerability-free dependencies.
- Do not describe seller Production or Preview evidence as buyer-environment certification.
- Do not imply that a technical report, package hash, SBOM or deployment grants rights. State the buyer-specific permitted rights and exclusions in the accepted transaction terms.

**Seller-side offer: OPEN FOR MARKETING AND CUSTOMER ACQUISITION. Buyer-environment certification: NOT ESTABLISHED. Any rights granted in a sale are defined by the accepted buyer-specific transaction terms.**
