# OpsCore Integrated Buyer Quickstart v0.11.62

Release: 0.11.62.
Product: Multi-sector operational source kit — Web Console + API + Expo Mobile Source.

Use only the exact ZIP and release statement from its successful current-head pipeline. This is not a hosted SaaS. No signed native mobile binaries are included.

## Local evaluation

1. Install backend dependencies from the lockfile.
2. Run verify:installation and buyer:preflight.
3. Run Contact Center translation checks: contact-center:i18n, contact-center:i18n:forensic and the two translation node:test suites.
4. Start the backend and create a local owner using the documented bootstrap process.
5. Open the web console, create a work order, assign an appointment and inspect audit/completion output.
6. For mobile source, configure the buyer-owned API URL and test user; validate check-in, GPS, camera/evidence, offline queue and recovery on physical Android/iOS devices before any release.

## Database activation modes

The demo seed is local SQLite-only and must not be run with PostgreSQL environment variables. For a real PostgreSQL database, run migrations through the owner-only migration URL, then create the first real organization and owner using `npm run bootstrap` with the restricted runtime role and `OPSC_BOOTSTRAP_ORG_NAME`, `OPSC_BOOTSTRAP_CEO_EMAIL`, and `OPSC_BOOTSTRAP_CEO_PASSWORD`.

## Translation truth

The Contact Center runtime currently exposes 105 selectable locale codes: 1 English source, 100 machine-assisted drafts and 4 explicit English fallback locales; 89 keys per locale. A separate qualification register contains 114 source rows; 9 flagged locales are withdrawn from runtime selection pending remediation and native-speaker review. Structural/forensic checks do not establish linguistic approval. Native-speaker review is 0/114; production qualification is 0/105 selectable locales. Keep the machine-translation notice visible.

## Buyer-owned services

The buyer provisions and live-tests external provider credentials, licenses, webhooks, OIDC/JWKS, email/SMS/WhatsApp/carrier and external call-center/telephony, payment, object storage, KMS, licensed maps/road routing and cloud accounts.

## Mobile release boundary

The package includes Expo source only. Buyer owns EAS project/account linkage, Android/iOS signing credentials, native builds, physical-device QA, Apple/Google developer accounts, store submission/distribution and post-handover dependency maintenance. No signed APK/AAB/IPA is included. Seller remains responsible for defects in delivered source and pre-delivery High/Critical remediation.

Use only audit, test, SBOM and release evidence produced by the same exact-head Secure Release workflow that creates the package.

Current source baseline on main (2026-11-18):
- Repository commit: 27d41476a115d81ddd3ad1b4f03025142a7e5be6.
- Expo SDK 58.0.26, React 19.3.1, React Native 0.88.1.
- Main OpsCore CI [44203389751](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44203389751) passed.
- Main Vercel contract [44203389724](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44203389724) passed its contract and isolated PostgreSQL acceptance; deployment was skipped. Production has not been deployed by this run.

Mobile dependency security remains explicitly unresolved: the current main audit gate allows GHSA-fc5q-39xc-vjpf only through the documented, time-limited allowlist entry reviewed by 2026-12-18. The installed picomatch 4.0.7 override is not an upstream fix. A gate PASS under this entry is not a clean audit or signed risk acceptance. PR #230 remains Draft/HOLD. Review the advisory note before making any security claim.

### Exact release package identity

No successful Secure Release run has yet produced a ZIP and external release statement for current main commit 27d41476a115d81ddd3ad1b4f03025142a7e5be6. Do not use older ZIPs, artifact IDs or digests as current handoff evidence. A manual dispatch was attempted but did not start because the browser automation wallet balance was -$0.12; no GitHub Actions run was created. This is an execution-tool limitation, not a product CI failure.

The seller-side source release remains HOLD until one successful exact-main Secure Release run produces the ZIP, external statement, archive SHA-256, SBOM, provenance, test reports, mobile audit and i18n forensic evidence, followed by archive review. This is seller-owned work and does not depend on identifying a buyer or obtaining a buyer signature.

### Production and infrastructure truth

The operational Neon database inspected is opscore_acceptance; neondb on the primary branch is empty. In opscore_acceptance the migration ledger has 68 rows and migrations 063–067/069 are present. The prior migration workflow failed in a post-apply check because its runner mishandled the deliberately absent opscore_app role; PR #234 fixed that source-level check, but a post-fix Production verification run has not yet been recorded. Do not reapply the migrations already in the ledger.

The only listed manual Neon snapshot predates those migrations. Its restore branch has valid provenance for that snapshot but is not schema-identical to the current Primary after later migration writes. The project is Free, allows one snapshot, and automatic snapshot schedule is empty. Do not delete the retained snapshot without a deliberate replacement/retention decision. Current Production restore parity proof, RPO/RTO and 67-route signed-session certification remain unestablished. The HMAC key table has zero keys, so signed Production routes are not activated.

Vercel currently reports live=false, no custom domains and latest deployment target=null. No Production deployment was made by the current-main contract run. This source-code package is not seller-hosted SaaS; the buyer provisions its own hosting, providers and domain.

## Production truth

Production database behavior and isolation, backup/restore, TLS/WAF, KMS, observability, live integrations and native application acceptance must be verified separately in the buyer environment. Production certification remains NOT_ESTABLISHED.