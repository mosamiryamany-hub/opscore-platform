# OpsCore — Seller Sales Kit

**Proposed sale:** source-code handoff for buyer-controlled infrastructure.  
**Delivery:** HOLD — no executed buyer licence, no buyer delivery authority, and self-hosted production qualification is not yet complete.

OpsCore is a multi-sector operational software source candidate comprising a web console, HTTP API, PostgreSQL schema/migration assets, operational workflows and Expo mobile source. The intended buyer model is to control its own compute, database, network, secrets, backup/restore, provider accounts and operating processes. This is not a seller-hosted SaaS subscription.

## Evidence and limitations

The 2026-11-24 evidence cut is main `6859b5d86f13ba9f481ed8fce5cc95c729d22b55`, CI run [45360794536](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45360794536). Source validation, contract checks, isolated PostgreSQL RLS/HTTP acceptance and CodeQL checks passed in that run. Production deploy, Neon Preview acceptance and historical PITR were skipped. The exact-head Secure Release archive is not established by that run.

Provider-neutral self-hosted production remains blocked by Vercel-specific signed-tenant/release gates and Neon-specific migration targeting. A complete application + database + persistent storage + ingress production stack and buyer-target acceptance are not established.

Mobile source only is included; no signed native binaries or store publication. Machine-assisted translations require native-speaker review. Licensed maps/road-routing and live external providers are not included. Payment processing remains disabled until configured and live-tested.

No independent ISO 27001, SOC 2, PCI DSS or other external certificate is claimed.

## Rights

Package metadata is `UNLICENSED`; the root `NO_LICENSE_GRANT_NOTICE.txt` controls. The seller may advertise, present and negotiate a prospective offer, but no buyer may use or receive the source until the rights holder and named buyer execute a written License Schedule pinning the exact source commit and/or package SHA-256. Resale, hosting for third parties, OEM, source redistribution and sublicensing require explicit rights in that Schedule. L1 internal-use rights do not include resale.

For the controlling evidence and detailed boundaries, see [docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md](docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md).
