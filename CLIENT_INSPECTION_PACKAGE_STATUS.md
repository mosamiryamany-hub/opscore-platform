# OpsCore v0.11.62 — Client Inspection Package Status

**Audit date:** 2026-11-11  
**Delivery class:** source-code candidate only; current-head archive NOT ISSUED.  
**Main:** `48ed78a825020986c53bd045e50c8ea852f53275`  
**Production certification:** NOT_ESTABLISHED.  
**Production isolation certification:** NOT_CERTIFIED.

## Exact source and CI evidence

Main GitHub Actions CI run `43031885131`: 525 passed, 2 skipped, 0 failed, 0 unaccounted. This verifies the committed test scope only. The run's own report marks database, PostGIS, OIDC, backup/restore, and production certification as UNVERIFIED / NOT_ESTABLISHED.

PR #22 contains additional staged deployment and production role-gate changes. Its latest branch CI reported 540 passed, 2 skipped, 0 failed, and 0 unaccounted. PR #22 is still a draft and is not merged into Main.

## Current infrastructure status

- Vercel Main deployment job completed, but the API endpoints returned HTTP 500 with `PRODUCTION_HOLD_ACTIVE`.
- Production Vercel environment lacks `OPSC_PRODUCTION_HOLD`; the safety gate correctly remains active.
- Neon Main is PostgreSQL 18.6 / PostGIS 3.6.4. Migration 053 is not applied; control-plane tenant policies still require restrictive guards.
- The `opscore_runtime` role itself is non-superuser and NOBYPASSRLS, but the actual Vercel connection role is NOT_VERIFIED.
- Production backup/restore and full tenant A/B behavioral acceptance are NOT_VERIFIED.

## Release evidence rule

The current candidate must be built by the GitHub Actions `OpsCore secure release` workflow from the exact Main commit. Use only that run's archive, release statement, SHA-256 manifest, JUnit, dependency audits, SBOM, provenance attestation, and localization reports. The tracked GitLab release statement is historical and must not identify a current package.

## Buyer residuals

- Android/iOS native signing, signed binaries, physical-device testing, and store submission.
- Native-speaker/domain review of 114 locale resources (currently 0/114 reviewed and 0/114 production-qualified).
- External identity, telephony/carrier, messaging, payment, webhook, object storage, KMS/HSM, maps/routing, and cloud accounts, licenses, and live acceptance.
- Buyer-specific TLS, WAF, observability, alerting, rate limiting, backup/restore, on-call, and disaster-recovery acceptance.

## Licensing

The bundled use-only license prohibits resale, redistribution, and sublicensing unless a separate written agreement signed by the rights holder grants those rights.
