# OpsCore v0.11.62 — Commercial Handoff


## Buyer path
1. Verify the ZIP, generated release statement, JUnit, forensic translation report, mobile dependency audit report and SHA-256 checksums from the same successful pipeline.
2. Run the local install/acceptance path using the included buyer quickstart.
3. Review the Contact Center language disclosure and current 4-round forensic report.
4. Configure and live-test the required external providers in the buyer's own environment.
5. If mobile is required, provision EAS/Android/iOS accounts and signing, build native apps, test physical devices, remediate dependency findings and complete the store process.
6. Perform production database, backup/restore, TLS/WAF, KMS, observability and isolation acceptance.

## Translation status
The Contact Center runtime exposes 105 selectable locales: 1 English source, 100 machine-assisted drafts and 4 explicit English fallbacks; 9 flagged codes are withdrawn. The separate qualification register contains 114 source rows. Four structural integrity rounds are enforced in CI; these do not constitute native-speaker review. Native-speaker review is 0/114 source rows and production qualification is 0/105 selectable runtime locales. The in-app machine-translation notice must remain visible.

## Buyer-owned scope
External providers and accounts, licenses, credentials, webhooks, maps, KMS, cloud operations, mobile builds/signing/device tests/store distribution and dependency maintenance are buyer-owned unless the accepted buyer-specific transaction terms state otherwise. The archive contains mobile source only and no signed binaries.

## Certification boundary
Production PostgreSQL/RLS, full backup/restore, KMS, TLS/WAF, live identity/providers, native app release and production-wide isolation remain environment-specific. `NOT_ESTABLISHED` / `NOT_CERTIFIED` is the production certification state.

## Licensing
No bundled license grant is included by default. Marketing, demonstrations, buyer discovery and negotiation are open without a pre-sale signature or separate License Schedule. If a purchase proceeds, the accepted buyer-specific offer/order/contract states the exact deliverable and permitted rights. Third-party rights remain with their owners.
