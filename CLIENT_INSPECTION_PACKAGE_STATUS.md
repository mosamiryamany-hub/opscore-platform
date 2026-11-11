# OpsCore v0.11.62 — Client Inspection Package Status

**Audit date:** 2026-11-11  
**Delivery class:** source-code candidate only; current-head archive NOT ISSUED.  
**Main:** `48ed78a825020986c53bd045e50c8ea852f53275`  
**Production certification:** NOT_ESTABLISHED.  
**Production isolation certification:** NOT_CERTIFIED.

## Exact source and CI evidence

Main GitHub Actions CI run `43031885131`: 525 passed, 2 skipped, 0 failed, 0 unaccounted. This verifies the committed test scope only. The run's own report marks database, PostGIS, OIDC, backup/restore, and production certification as UNVERIFIED / NOT_ESTABLISHED.

PR #24 is the integrated candidate combining runtime/bootstrap separation, staged deployment gates, PostgreSQL catalog hardening, and buyer documentation. An initial combined run (`43048381305`) passed 560 tests with 2 skipped, 0 failed, and 0 unaccounted, but it predates the CycloneDX 1.7 generation gate. The first run with that gate generated a 496-component BOM then failed on a verifier JavaScript syntax error; the syntax was corrected and a contract test added, but the latest head has no fresh CI result yet. Do not merge until the updated combined head passes. Source-branch runs (PR #22: 553 passed / 2 skipped; PR #23: 532 passed / 2 skipped) are not substitutes. Both skips are `postgres-commercial-acceptance-http.test.js` and `tenant-isolation-matrix.test.js`; they require a disposable PostgreSQL acceptance URL and remain UNVERIFIED.

## Current infrastructure status

- Vercel Main deployment job completed, but the API endpoints returned HTTP 500 with `PRODUCTION_HOLD_ACTIVE`.
- Production Vercel environment lacks `OPSC_PRODUCTION_HOLD`; the safety gate correctly remains active.
- Neon Main is PostgreSQL 18.6 / PostGIS 3.6.4. Migration 053 is not applied; control-plane tenant policies still require restrictive guards.
- The `opscore_runtime` role itself is LOGIN, non-superuser, NOBYPASSRLS, non-CREATEROLE, non-CREATEDB, and has no elevated memberships; the actual Vercel connection role is NOT_VERIFIED.
- Live catalog: 132 public ordinary/partitioned relations; 131 have RLS and FORCE RLS, with only read-only `spatial_ref_sys` outside RLS. Migration 053 remains unapplied, and the three control-plane tables still have only the old PERMISSIVE guard.
- Neon public connections are not blocked, the IP allowlist is empty, all six branches are unprotected, and history retention is 6 hours.
- Vercel Firewall is enabled but Bot Protection and active CRS generic/RCE/SQLi/XSS rules are LOG-only; no custom/IP rules are configured.
- Runtime error aggregation showed 59 `PRODUCTION_HOLD_ACTIVE` occurrences across 32 users in the last 24 hours. Production backup/restore and full tenant A/B behavioral acceptance are NOT_VERIFIED.

## Release evidence rule

The current candidate must be built by the GitHub Actions `OpsCore secure release` workflow from the exact Main commit. Use only that run's archive, release statement, SHA-256 manifest, JUnit, dependency audits, SBOM, provenance attestation, and localization reports. The tracked GitLab release statement is historical and must not identify a current package.

## Buyer residuals

- Android/iOS native signing, signed binaries, physical-device testing, and store submission.
- Native-speaker/domain review of 114 locale resources (currently 0/114 reviewed and 0/114 production-qualified).
- External identity, telephony/carrier, messaging, payment, webhook, object storage, KMS/HSM, maps/routing, and cloud accounts, licenses, and live acceptance.
- Buyer-specific TLS, WAF, observability, alerting, rate limiting, backup/restore, on-call, and disaster-recovery acceptance.

## Licensing

The bundled use-only license prohibits resale, redistribution, and sublicensing unless a separate written agreement signed by the rights holder grants those rights.
