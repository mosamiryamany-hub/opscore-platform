# OpsCore Field Source Kit v0.11.62 — Zero Illusions + AI Contact Center

**Source-code candidate. Buyer-controlled deployment is the intended model; self-hosted production is not yet qualified.**

OpsCore is a multi-sector operational source candidate comprising a web console, HTTP API, PostgreSQL schema/migration assets and Expo mobile source. This is not a seller-hosted SaaS subscription. The target buyer model is operation on infrastructure controlled by the buyer; however, current release and migration code still contains Vercel/Neon-specific gates that must be removed through a reviewed, tested engineering change before claiming a supported provider-neutral self-hosted production edition.

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

- Protected main: `6859b5d86f13ba9f481ed8fce5cc95c729d22b55`.
- GitHub Actions run [45360794536](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45360794536): source validation, contract checks, isolated PostgreSQL RLS/HTTP acceptance and CodeQL checks passed.
- Production deploy, Neon Preview migration/HTTP acceptance and historical Production PITR jobs were SKIPPED.
- A Secure Release archive for the exact evidence-cut commit is not established by that run.
- Buyer-controlled self-hosted production acceptance has not been run.
- No independent ISO 27001, SOC 2, PCI DSS or other external certification is claimed.

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
