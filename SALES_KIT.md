# OpsCore — Seller Sales Kit

**Proposed sale:** source-code handoff for buyer-controlled infrastructure.  
**Delivery:** HOLD — no executed buyer licence, no buyer delivery authority, and self-hosted production qualification is not yet complete.  
**NO LICENSE GRANT — ALL RIGHTS RESERVED.**

OpsCore is a multi-sector operational software source candidate comprising a web console, HTTP API, PostgreSQL schema/migration assets, operational workflows and Expo mobile source. The intended buyer model is to control its own compute, database, network, secrets, backup/restore, provider accounts and operating processes. This is not a seller-hosted SaaS subscription.

## Evidence and limitations

The dated 2026-11-24 10:43 UTC evidence snapshot was main `f71b8eee32631c833dda8115af8508ae1ccc1a63` (before PR #436). OpsCore CI: [45377527984](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45377527984), 1,021 passed, 0 failed, 3 skipped. Source/contract and isolated PostgreSQL 18 acceptance: [45377522840](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45377522840), PASS. CodeQL: [45377523517](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45377523517), PASS. Production deploy, Neon Preview migration and PITR were SKIPPED. No exact-head Secure Release archive was established. This snapshot does not certify PR #436 or later commits.

Provider-neutral self-hosted production remains blocked by Vercel-specific signed-tenant context gates and Neon-specific migration targeting. The existing release-verification endpoint now has an explicit Ed25519 self-hosted operator-attestation mode, but it verifies signed claims only; it does not independently measure the archive, TLS endpoint or database and does not qualify the complete deployment. A full application + database + persistent storage + ingress stack and buyer-target acceptance are not established.

Mobile source only is included; no signed native binaries or store publication. Machine-assisted translations require native-speaker review. Licensed maps/road-routing and live external providers are not included. Payment processing remains disabled until configured and live-tested.

No independent ISO 27001, SOC 2, PCI DSS or other external certificate is claimed.

## Rights

Package metadata is `UNLICENSED`; the root `NO_LICENSE_GRANT_NOTICE.txt` controls. The seller may advertise, present and negotiate a prospective offer, but no buyer may use or receive the source until the rights holder and named buyer execute a written License Schedule pinning the exact source commit and/or package SHA-256. Resale, hosting for third parties, OEM, source redistribution and sublicensing require explicit rights in that Schedule. L1 internal-use rights do not include resale.

For the controlling evidence and detailed boundaries, see [docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md](docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md).
