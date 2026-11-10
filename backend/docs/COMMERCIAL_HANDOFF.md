# OpsCore v0.11.62 — Commercial Handoff


## Buyer path
1. Verify the ZIP, generated release statement, JUnit, forensic translation report, mobile dependency audit report and SHA-256 checksums from the same successful pipeline.
2. Run the local install/acceptance path using the included buyer quickstart.
3. Review the Contact Center language disclosure and current 4-round forensic report.
4. Configure and live-test the required external providers in the buyer's own environment.
5. If mobile is required, provision EAS/Android/iOS accounts and signing, build native apps, test physical devices, remediate dependency findings and complete the store process.
6. Perform production database, backup/restore, TLS/WAF, KMS, observability and isolation acceptance.

## Translation status
The Contact Center locale resources are integrated: 114 locale codes, 1 English source, 109 machine-assisted drafts, 4 explicit English fallbacks and 89 keys per locale. Four structural integrity rounds are enforced in CI. These do not constitute native-speaker review; 0/114 locales are production-qualified and the in-app notice must remain visible.

## Buyer-owned scope
External providers and accounts, licenses, credentials, webhooks, maps, KMS, cloud operations, mobile builds/signing/device tests/store distribution and dependency maintenance are buyer-owned unless a separate signed agreement states otherwise. The archive contains mobile source only and no signed binaries.

## Certification boundary
Production PostgreSQL/RLS, full backup/restore, KMS, TLS/WAF, live identity/providers, native app release and production-wide isolation remain environment-specific. `NOT_ESTABLISHED` / `NOT_CERTIFIED` is the production certification state.

## Licensing
The bundled license file is not a substitute for a signed commercial transfer. Third-party rights remain with their owners.
