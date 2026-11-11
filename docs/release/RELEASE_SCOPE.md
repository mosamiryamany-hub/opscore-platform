# OpsCore v0.11.62 — Release Scope and Verification Boundary

**Source commit on Main:** `48ed78a825020986c53bd045e50c8ea852f53275` (audit snapshot 2026-11-11).  
**Delivery decision:** NOT_ISSUED — no current-head `OPSCORE.zip` is approved.  
**Commercial class:** BLOCKED pending exact-head evidence and production gates.  
**Production certification:** NOT_ESTABLISHED.  
**Production isolation certification:** NOT_CERTIFIED.

## Included and seller-owned

- Node.js backend/API, web operations console, internal workflows, and source contracts.
- Authentication/session/tenant authorization, database migrations, RLS policies, and internal integration adapters.
- Contact Center module and 114 locale resources, selector/loader/RTL/safe rendering, and visible machine-translation notice.
- Expo mobile source for Android/iOS, source verification, dependency lockfile, and Web export verification.
- Automated tests, release packaging, evidence generation, checksums, installation and operational documentation.
- Fixing defects in delivered source and remediating high/critical dependency vulnerabilities before delivery.

## Translation disclosure

One English source locale, 109 machine-assisted draft locales, 4 explicit English fallback locales (din, nus, pau, ch), and 89 keys per locale. Four structural/forensic rounds run in CI. Native-speaker reviewed = 0/114; production-qualified = 0/114. This is not linguistic certification; the machine-translation notice must remain visible. Buyer owns native-speaker review before production language-quality claims.

## Buyer/customer-owned scope

- External provider accounts, licenses, credentials, setup, quotas, billing, contracts and live acceptance: identity/OIDC/JWKS, email/SMS/WhatsApp/PSTN/SIP, external call-center/telephony, payments, webhooks, object storage, KMS/HSM and cloud.
- Maps/road-routing provider, license, API key, attribution, quota and live acceptance.
- Android/iOS buyer-specific EAS accounts/projects, signing, native builds, physical-device QA, developer accounts, app-store submission and distribution. No signed APK/AAB/IPA is included.
- Post-handover dependency/security maintenance and buyer-environment operations.

Buyer-owned tasks do not transfer responsibility for defects in the delivered source package, internal APIs/adapters, authorization, migrations, tests, or release tooling to the buyer.

## Previous successful candidate evidence — historical only

GitLab pipeline `3014428936` passed on commit `30bf29aa`: 468 tests total, 467 passed, 0 failed, 1 skipped. Mobile dependency audit: 0 high, 0 critical, 10 moderate, 2 low. Root PostgreSQL driver pg 8.23.1 was pinned; root audit reported 0 findings. That historical archive and its release statement/checksums do not identify current Main.

The tracked `docs/release/COMMERCIAL_RELEASE_STATEMENT.json` is another historical GitLab record for commit `5c60420f42330d7bd79623547b07eee96ef0ebd77214e9996cf53dd2d997a7e7`, pipeline `3017246123`. Preserve historical records; never reuse their digests, IDs, or URLs.

## Current-candidate evidence rule

GitHub Actions is the current source-control and CI authority. The authoritative current candidate must be produced by `.github/workflows/opscore-secure-release.yml` on the exact approved Main source commit. Use only the same successful workflow run's `OPSCORE.zip`, `COMMERCIAL_RELEASE_STATEMENT.json`, `SHA256SUMS.txt`, JUnit, full root/mobile dependency-audit JSON, i18n forensic result, mobile source/Web export results, SBOM, provenance/SBOM attestations, commercial closure report, and buyer installation verification. Do not copy prior pipeline identifiers, test counts, digests, or Preview URLs into a newer candidate.

The Vercel deployment workflow is `.github/workflows/vercel-deploy.yml`. A READY deployment is not proof of healthy API behavior. The current seller reference API returned HTTP 500 with `PRODUCTION_HOLD_ACTIVE`; it is not a buyer-ready hosted service.

## Current production boundary — 2026-11-11

- Vercel Production is held. `OPSC_PRODUCTION_HOLD` is absent from Production environment variables; application code treats a missing value as hold-active.
- Neon Main branch `br-wispy-term-bcrqqj84`, database `opscore_acceptance`, is PostgreSQL 18.6 / PostGIS 3.6.4. Its migration ledger ends at `052_runtime_policy_function_grants.sql`; migration 053 is not applied.
- Main still needs the restrictive tenant guards from migration 053 on `feature_flags`, `safe_mode_states`, and `control_plane_runs`.
- The `opscore_runtime` role itself is LOGIN, non-superuser, NOBYPASSRLS, non-CREATEROLE, and non-CREATEDB. The actual Vercel runtime connection role is NOT_VERIFIED.
- `opscore_app` has BYPASSRLS and elevated role/database privileges; do not use it as the application runtime role.
- A read-only catalog check found 132 public ordinary/partitioned relations: 131 have RLS and FORCE RLS; the sole no-RLS exception is read-only PostGIS `spatial_ref_sys`. Non-PostGIS relations without RLS or FORCE RLS: 0; migration-ledger runtime privileges: 0.
- Main's three control-plane tables still expose only the old PERMISSIVE `opscore_tenant_boundary_guard` policy. Migration 053's restrictive policy pair remains unapplied.
- Neon network posture is not production-hardened: `block_public_connections=false`, empty IP allowlist, `protected_branches_only=false`, all six listed branches unprotected, and 6-hour history retention.
- Vercel Firewall is enabled but Bot Protection and active CRS rules (generic, RCE, SQLi, XSS) are LOG-only; no custom/IP rules are present. No active attack anomalies were returned in the inspected window.
- Runtime error aggregation for the last 24 hours reported 59 `PRODUCTION_HOLD_ACTIVE` occurrences across 32 users.
- Production tenant-session A/B behavior, backup/restore, OIDC, KMS/HSM, external webhooks, and full production certification remain NOT_VERIFIED / NOT_ESTABLISHED.

## PR verification boundary

PR #22 adds staged production deployment, authenticated HTTP smoke checks, explicit production environment preflight, runtime-role attestation, and production tenant/recovery acceptance requirements. Its latest CI run on the PR branch reported 550 passed, 2 skipped, 0 failed, and 0 unaccounted. The two skips are `postgres-commercial-acceptance-http.test.js` and `tenant-isolation-matrix.test.js`; both require a disposable PostgreSQL acceptance URL and remain UNVERIFIED. PR #22 is still a draft and not merged into Main.

## SBOM and supply-chain verification

The tracked SBOM is CycloneDX 1.6 with 491 components; 489 carry component hashes and license entries. Two top-level application components lack those entries, and the BOM metadata lacks `metadata.timestamp` and `metadata.authors`. Main's secure-release workflow creates GitHub attestations but does not yet verify them. PR #23 adds both verification gates before artifact upload; a successful current-head release run remains required. Upgrade the generator to CycloneDX 1.7, close component coverage without substituting manifest hashes for artifact hashes, and verify the attestations before buyer delivery.

## PostgreSQL HTTP acceptance — exact-head evidence

PostgreSQL HTTP acceptance is PASS only when the evidence source commit and pipeline ID exactly match the same archive-producing GitHub Actions run. When no dedicated acceptance URL/evidence exists, state NOT_VERIFIED; historical PASS evidence never qualifies for a newer candidate. This is seller-owned before handover, not a buyer residual.

## Release decision

The source package may be delivered only after the exact current-head build statement, checksums, audit reports, SBOM and attestation verification, installation evidence, and production prerequisites have passed. Do not describe it as Production-certified, fully translated by humans, signed for app stores, or connected to every external provider.
