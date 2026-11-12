# OpsCore v0.11.62 — Buyer Verification and Acceptance

## Exact-artifact rule

Verify the exact ZIP generated for delivery. From the same GitHub Actions Secure Release run download and review its artifact. For the verified candidate, use run 43308699094: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/43308699094. Download artifact `opscore-release-43308699094` and review:
1. `dist/COMMERCIAL_RELEASE_STATEMENT.json` — commit, pipeline, archive byte count and SHA-256.
2. `dist/SHA256SUMS.txt` and run `sha256sum --check SHA256SUMS.txt`.
3. GitHub Actions job/step results and the release workflow's test report for that exact run.
4. `backend/docs/verification/I18N_FORENSIC_AUDIT_RESULT.json` — must say PASS and 4/4 rounds for the delivered commit.
5. `mobile/mobile-dependency-audit.json` from `mobile-dependency-audit`, plus `root-dependency-audit.json` from `root-dependency-audit`. The CI gates block High/Critical findings; Moderate/Low findings remain disclosed in the full reports.

Do not copy hashes or test counts from earlier pipelines; every source/documentation change makes prior package evidence historical.

## Translation status

The Contact Center translation resources and runtime are included. Registered counts are 114 locales, 89 source keys per locale, 1 English source, 109 machine-assisted draft locales, and 4 English-fallback locales (din, nus, pau, ch). The visible notice explicitly says AI/machine translation. The automated four-round forensic report checks structural integrity and integration safety; it is not proof of linguistic correctness. Native-speaker reviewed: 0/114. Production-qualified: 0/114. Buyer/operator must arrange native-speaker/domain review before presenting translations as official or relying on them for legal, safety, contractual, or regulated content.

## External integrations — buyer responsibility

The buyer configures, licenses, secures and tests any required identity provider/OIDC/JWKS, outbound messages, carrier channels, payment services, webhooks, object storage, KMS/HSM, maps/road routing, and cloud accounts. No third-party service should be claimed as connected without a successful live contract test in the target environment. Credentials belong in buyer-controlled secret management, never source control.

## Mobile — buyer responsibility

The package includes Expo mobile source only; it does not include signed native binaries or certify app-store readiness. The buyer owns EAS/project accounts, Android/iOS signing, native build, GPS/camera/offline/device testing, environment configuration, app-store accounts/submission, distribution, and ongoing updates.

The current locked Expo SDK 58.0.23 / React Native 0.88.1 / React 19.3.0 baseline in run 43308699094 reports zero findings across all severities. The exact same-run mobile audit JSON is authoritative. This is a point-in-time npm audit, not a guarantee against future advisories.

## Production and operational limits

PostgreSQL/PostGIS runtime behavior, production-wide tenant isolation, application-level backup/restore, KMS/key rotation, TLS/WAF, centralized observability, live identity-provider integration, provider contracts, licensed maps, signed native apps, and physical-device execution remain environment-specific tasks. Production certification remains NOT_ESTABLISHED.

## Acceptance decision

This is a source-code commercial candidate, not a certified production deployment. Buyer acceptance must record the exact archive SHA-256, source commit, pipeline ID, test status, open residuals, owners, and agreed maintenance terms.
