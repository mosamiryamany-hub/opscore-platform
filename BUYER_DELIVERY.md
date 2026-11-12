# OpsCore v0.11.62 — Buyer Delivery Record

Delivery type: commercial source-code package.
Commercial closure: **PASS_WITH_BUYER_RESIDUALS** for the exact candidate identified below.
Production certification: **NOT_ESTABLISHED**.
Production-wide tenant-isolation certification: **NOT_CERTIFIED**.

## Exact verified candidate

- GitHub repository: https://github.com/mosamiryamany-hub/opscore-platform
- Source branch: `main`
- Source commit: `d940152d1428d82d9bb0c57695d929099a648ac3`
- Secure Release workflow run: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/43308699094
- GitHub artifact name: `opscore-release-43308699094`
- GitHub artifact ID: `13824023354`
- Nested release archive: `OpsCore-release.zip`
- Archive bytes: `1,881,299`
- Archive SHA-256: `5a5b731b17f1c8dcc1c102ea5c79fa3e4d01bb2750d91b6d941e6a02a068de9c`

The ZIP passed archive integrity testing. The nested source package contains 687 files (734 ZIP entries including directory entries). Use the archive and statement from this exact run only. Any later source/documentation change requires a new archive and digest.

## Release evidence

Run 43308699094 completed successfully with all 29 workflow steps successful, including buyer installation/self-validation, SBOM generation and verification, external release statement, Attestation and artifact upload.

The artifact statement intentionally records:
- `commercialClosure: PASS_WITH_BUYER_RESIDUALS`
- `productionCertification: false`
- `productionAcceptance: NOT_VERIFIED_AT_BUILD`

The ZIP SHA-256 above was independently recalculated and matches the release statement. Artifact attestation is a separate supply-chain proof; it is not the same as a signed Git commit, and neither is a production-acceptance certificate.

## Mobile source boundary

The archive contains Expo source, not signed Android AAB/APK or iOS IPA binaries. The exact locked dependency audit in the current verified candidate run reported zero findings across info, low, moderate, high and critical severities. SDK baseline: Expo 58.0.23 / React Native 0.88.1 / React 19.3.0. This point-in-time npm audit does not replace future advisory monitoring, signed native builds or physical-device tests.

## Buyer-owned / environment-specific residuals

- Buyer EAS project/account linkage, Android/iOS signing, native builds, physical-device QA, store accounts, submission and distribution.
- Native-speaker/domain review of translations: 0/114 locales are currently production-qualified; keep the machine-translation notice visible.
- Buyer credentials/licenses/live acceptance for OIDC/JWKS, email/SMS/WhatsApp/carrier and external call-center/telephony, payments, webhooks, object storage, KMS/HSM, licensed maps/road routing and cloud.
- Production database privilege dependency review, behavioral tenant-isolation acceptance, application-level backup/restore, WAF/TLS, observability and recovery in the exact target environment.
- Commercial contract must explicitly settle source ownership, modification/distribution rights, resale/sublicensing, third-party licenses, support, update scope and responsibility allocation. The bundled license is not a substitute for a negotiated transfer.

## Buyer activation checklist

1. Verify the downloaded ZIP SHA-256 against the exact release statement.
2. Install the extracted backend from its lockfile and run `verify:installation` and `buyer:preflight`.
3. Apply PostgreSQL migrations only to an explicitly designated disposable acceptance database first.
4. Configure buyer-owned secrets in buyer-controlled secret management; never paste tokens into chat or source control.
5. Complete the buyer's live integration, RLS, restore and operational acceptance tests.
6. Build and test signed mobile binaries separately if mobile distribution is in scope.
7. Record buyer acceptance against the exact archive SHA, source commit, pipeline ID, test results and accepted residuals.

This package is a source-code commercial candidate with disclosed buyer residuals. It is not a managed SaaS tenancy on the seller's Neon or Vercel projects and is not a certified production deployment.
