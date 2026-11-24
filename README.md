# OpsCore Field Source Kit v0.11.62 — Zero Illusions + AI Contact Center

**Source-code candidate. Buyer-controlled deployment is the intended model; self-hosted production is not yet qualified.**

OpsCore is a multi-sector operational source candidate comprising a web console, HTTP API, PostgreSQL schema/migration assets and Expo mobile source. This is not a seller-hosted SaaS subscription. The target buyer model is operation on infrastructure controlled by the buyer. The existing release-verification endpoint now supports an explicit Ed25519 self-hosted operator-attestation mode, but it does not independently measure the attested archive/TLS/database facts. Signed tenant-context activation remains Vercel-gated and PostgreSQL migration targeting remains Neon-specific; those blockers must be closed before claiming a supported provider-neutral self-hosted production edition.

> **Current classification: SOURCE-CODE CANDIDATE / SELF-HOSTED PRODUCTION BLOCKED / NO LICENSE GRANT / NO EXTERNAL CERTIFICATION.**

## Start Here

| Document | Purpose |
|---|---|
| [BUYER_FIRST.md](BUYER_FIRST.md) | Buyer entry point and current rights boundary |
| [BUYER_DELIVERY.md](BUYER_DELIVERY.md) | Delivery scope, exact artifact and exclusions |
| [Self-Hosted Buyer Edition](docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md) | Controlling self-hosted scope, evidence and blockers |
| [Buyer Installation Guide](docs/commercial/BUYER_INSTALLATION_GUIDE.md) | Local source checks and current installation limitations |
| [Buyer Evidence Index](docs/commercial/BUYER_EVIDENCE_INDEX.md) | Current source/CI evidence cut |
| [Sales Kit](docs/commercial/SALES_KIT.md) | Permitted seller positioning |
| [Truth Boundaries](docs/00-START-HERE/TRUTH_BOUNDARIES.md) | PASS / SKIPPED / NOT VERIFIED / NOT CERTIFIED definitions |

## Evidence cut — 2026-11-24

- Protected main: `d243a428bb44b4cbd0d1fd768cb907d0e9fcbdb1`.
**Current evidence cut (2026-11-24):** main `d243a428bb44b4cbd0d1fd768cb907d0e9fcbdb1`.
- - [OpsCore CI](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374083091): `verify` PASS (21/21).
- - [Vercel source/contract and PostgreSQL acceptance](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374083161): `vercel-source-verify` PASS (18/18); `vercel-contract-verify` PASS (3/3); isolated PostgreSQL RLS/HTTP acceptance PASS (3/3); deploy-bound PostgreSQL 18 acceptance PASS (30/30).
- - [CodeQL](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374082761): Actions, JavaScript/TypeScript and Python PASS.
- - Production deployment, Neon Preview migration/HTTP acceptance and historical Production Neon PITR: SKIPPED. SKIPPED is not PASS.
- - Exact-head Secure Release archive for `d243a428bb44b4cbd0d1fd768cb907d0e9fcbdb1`: NOT ESTABLISHED.
- - Buyer-controlled self-hosted production acceptance: NOT RUN.
- - `backend/docs/API_INVENTORY.json`: unchanged, SHA-256 blob `2ece147beaa36867e56f051d597ffa86d0a979e8`, 60,357 bytes.
- 
- Buyer-controlled self-hosted production acceptance has not been run.
- No independent ISO 27001, SOC 2, PCI DSS or other external certification is claimed.

## Seller-hosted Vercel availability — measured 2026-11-24

- Vercel project `opscore-platform`: `live=false`.
- No Production deployment exists for current main `d243a428bb44b4cbd0d1fd768cb907d0e9fcbdb1` (exact-SHA deployment query returned zero records).
- Public `GET /api/health` and `GET /api/verify/release` both returned HTTP `402 Payment Required` with `x-vercel-error: DEPLOYMENT_DISABLED` at approximately 10:22 UTC on 2026-11-24.
- A verified project-domain association does not prove that the domain is currently aliased to a live deployment.
- Team context reports plan `Pro`; the available charges endpoint reports usage attribution only, not invoice, outstanding balance or payment-good-standing status. The specific account suspension/billing cause is therefore NOT VERIFIED.

This seller-hosted service outage is separate from CI and from the proposed buyer-owned deployment model. Do not advertise the seller-hosted demo/API as live until Vercel re-enables the project and the current main commit is deployed and measured.

A PASS applies only to the named test and target. SKIPPED is not PASS. CI is not an external certificate or a buyer-environment qualification.

## Version compatibility

- Backend: `0.11.62`
- Mobile: `0.1.16` (Expo source)
- Node.js: `>=22.23.4 <23`

## Zero Illusions

Always separate:
1. Source code and automated tests that were actually run.
2. Environment-dependent functions that require buyer infrastructure and credentials.
3. BLOCKED, SKIPPED, NOT RUN, NOT VERIFIED and NOT CERTIFIED items.

No demo data is to be seeded into a real customer database. The local SQLite demo is for non-production evaluation only. Current PostgreSQL migration and signed-tenant release gates are not yet provider-neutral for self-hosted Production; see the controlling edition document before attempting deployment.

## Contact Center language boundary

The current runtime manifest exposes 105 selectable locale codes: 1 English source, 100 machine-assisted drafts, and 4 explicit English fallbacks. The separate qualification register contains 114 source rows; 9 flagged locales are withdrawn from runtime selection pending remediation and native-speaker review. Native-speaker review is 0/114 and production qualification is 0/105. Keep the machine-translation notice visible. Structural checks are not linguistic approval.

Browser realtime voice is included behind explicit consent and server-minted short-lived credentials. PSTN/SIP/WhatsApp/email adapters are not connected by this source package unless separately configured and live-tested in a buyer environment.

## Repository layout

```
├── NO_LICENSE_GRANT_NOTICE.txt
├── BUYER_FIRST.md
├── BUYER_DELIVERY.md
├── backend/                  # Node backend + web console + PostgreSQL assets
├── mobile/                   # Expo source only
├── sdk/
├── scripts/                  # Release gates and packaging
├── docs/commercial/           # Buyer scope, sales and licence framework
├── docs/ops/                  # Operational evidence and closeout records
└── evidence-pack/             # Evidence records; verify exact-run identity
```

## Commercial and legal boundary

Package metadata remains `UNLICENSED`. The root `NO_LICENSE_GRANT_NOTICE.txt` is controlling. The seller may advertise and negotiate a prospective offer, but no buyer may use or receive the software before the rights holder and named buyer execute a written License Schedule pinning the exact commit and/or package SHA-256. L1 internal use does not include resale. Redistribution, resale, OEM, hosting for third parties and sublicensing require express rights in the signed Schedule.

Seller Vercel/Neon accounts, domains, databases, records, provider credentials and hosted service are excluded from the proposed source-code handoff unless a separate signed transfer agreement states otherwise.
