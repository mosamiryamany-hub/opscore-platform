# OpsCore v0.11.62 — Client Inspection Package Status

Delivery class: commercial source-code package.
Commercial CI closure: `PASS_WITH_BUYER_RESIDUALS` for the exact candidate below.
Production certification: `NOT_ESTABLISHED`.
Production isolation certification: `NOT_CERTIFIED`.

## Exact candidate identity

- Repository: https://github.com/mosamiryamany-hub/opscore-platform
- Branch: `main`
- Commit: `f3f33865618f0c9da304fe47ab2538b310d7d453`
- Secure Release run: [42949619029](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/42949619029)
- GitHub artifact: `opscore-release-42949619029` (artifact ID `13824023354`)
- Nested archive: `OpsCore-release.zip` — 1,881,299 bytes
- SHA-256: `20aace624d0afe6dbdc0b07e8a8d3ee3a8604b7116a9eaca6cf0c8108d02adeb`

All values above identify only this source candidate and its artifact. Any later source, release-tooling or package change requires a new Secure Release and new archive digest.

## Release evidence

Run 42949619029 completed successfully with all 29 workflow steps successful. The run produced SBOM generation/verification, buyer installation/self-validation, archive, external release statement, artifact Attestation and uploaded artifact.

The archive statement records:
- `commercialClosure: PASS_WITH_BUYER_RESIDUALS`
- `productionCertification: false`
- `productionAcceptance: NOT_VERIFIED_AT_BUILD`

The archive digest was independently recalculated and matched the release statement. Artifact Attestation is proof about the exact artifact's provenance; it is not a signed Git commit or production certification.

## Mobile source and dependency evidence

- Expo SDK 58.0.23 / React Native 0.88.1 / React 19.3.0.
- Exact run #6 mobile npm audit: zero findings across info, low, moderate, high and critical.
- Expo Doctor: 20/20 on the isolated SDK58 resolver workflow; Android/iOS/web JavaScript exports succeeded.
- Signed AAB/IPA, physical-device QA, Google Play Internal Testing, TestFlight and store publication are not included.
- Native-speaker translation review remains 0/114; language production qualification remains 0/114. Keep machine-translation disclosure visible.

## Current production deployment

Vercel production deployment `dpl_JD2jLc2ifxtMezaoAovgFALmapjH` is READY and identifies the same source commit. The public site and `/api/health` were live-checked; health returned 200. `/api/ready` returned 401 without an authorized session, so authenticated readiness acceptance remains open. Production database role actually used by Vercel and production-wide tenant isolation are not independently certified.

## Buyer-owned residuals

- EAS project/account linkage, native Android/iOS signing, builds, physical-device QA, store accounts, submission and distribution.
- Native-speaker/domain review of all translations.
- Buyer credentials/licenses/live acceptance for OIDC/JWKS, email/SMS/WhatsApp/carrier, call-center/telephony, payments, webhooks, object storage, KMS/HSM, licensed maps/road routing and cloud accounts.
- Production database privilege dependency review, behavioral tenant-isolation acceptance, application-level backup/restore, WAF/TLS, observability, recovery and target environment acceptance.
- Contract must settle ownership, modification/distribution rights, resale/sublicensing, third-party licenses, support, update scope and responsibility allocation. The bundled license grants internal-use only and does not itself grant resale.

## Buyer / Seller responsibility boundary

Seller remains responsible for fixable defects in delivered source, migrations, authorization, tests, package integrity, release tooling and handoff documentation before acceptance. Buyer-specific accounts, credentials, licensing, external services, native signing and target-environment acceptance remain buyer-owned.

## Historical evidence

Older GitLab pipeline and Preview references are preserved only under `docs/archive/`. Previous candidate IDs, test counts, dependency findings and digests must not be reused for the current or a future release.
