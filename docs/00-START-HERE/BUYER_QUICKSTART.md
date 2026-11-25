# OpsCore Buyer Quickstart — v0.11.62

**Status: SOURCE-CODE CANDIDATE ONLY. NO LICENSE GRANT. SELF-HOSTED PRODUCTION BLOCKED.**

This guide is not permission to use the source. Obtain an executed License Schedule first. Use only the exact authorized package and the release statement from its own successful Secure Release run. Do not reuse historical ZIPs, hashes, pipeline IDs or deployment IDs.

## 1. Local evaluation

1. Use Node.js `>=22.23.4 <23` and install backend dependencies with `npm ci`.
2. Run `npm run buyer:preflight` and `npm run verify:installation`.
3. Run `npm run contact-center:i18n` and `npm run contact-center:i18n:forensic`.
4. Run `npm test` and `npm run verify`.
5. If authorized for local evaluation, follow [backend/BUYER_QUICKSTART.md](../../backend/BUYER_QUICKSTART.md) for the SQLite-only, non-production demo path.

Record Node/npm versions, exact source commit, archive SHA-256, command outputs, exit codes and all skipped/failed tests. A local PASS proves only that named local check.

## 2. PostgreSQL and self-hosted production

Do not run the current migration tool against arbitrary customer-managed PostgreSQL and do not set Vercel environment variables to simulate Vercel. The current PostgreSQL migration flow validates Neon project/branch/endpoint identity and expects the Neon owner role. The signed-tenant-context and release-proof logic also depends on Vercel-specific environment/readiness.

The current Compose file supplies a PostgreSQL service only; it is not a complete app/database/ingress/persistent-storage production stack. Provider-neutral self-hosted production remains BLOCKED until the work in [Self-Hosted Buyer Edition](../commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md) is implemented and independently tested.

## 3. Translation truth

The runtime currently exposes 105 selectable locale codes: 1 English source, 100 machine-assisted drafts and 4 English fallbacks. The qualification register has 114 source rows. Native-speaker reviewed: 0/114 source-language qualification rows. Production-qualified: 0/105 selectable runtime locales. Structural/forensic tests are not linguistic approval. Keep machine-translation disclosure visible.

## 4. Buyer-owned services and mobile

Buyer-controlled provider accounts, licences, credentials and live acceptance are required as applicable for OIDC/JWKS, email/SMS/WhatsApp, telephony/contact-center, payments, webhooks, object storage, KMS/HSM, maps/road-routing and cloud. No adapter or config entry proves a provider connection.

The package includes Expo source only. There are no signed APK/AAB/IPA artifacts, native signing identities, physical-device QA or app-store publication in this source handoff.

## 5. Current evidence cut

Use only the latest exact-main Secure Release artifact and its matching OpsCore CI and Vercel/PostgreSQL acceptance runs. Do not reuse historical commit IDs, run IDs, deployment IDs or archive hashes. CI and isolated PostgreSQL acceptance do not establish public Production deployment, Neon Preview migration, Production PITR or buyer self-hosted acceptance. A signed archive does not grant a license or establish Production acceptance.

See [Buyer Evidence Index](../commercial/BUYER_EVIDENCE_INDEX.md) for the complete evidence boundary.
