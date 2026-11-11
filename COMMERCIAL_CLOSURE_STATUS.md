# OpsCore Commercial Closure Status — 2026-11-11

**Source commit on Main:** `48ed78a825020986c53bd045e50c8ea852f53275`  
**Commercial release decision:** BLOCKED — no current-head buyer archive approved.  
**Production certification:** NOT_ESTABLISHED.  
**Production isolation certification:** NOT_CERTIFIED.

## Verified engineering evidence

- Main CI: 525 passed, 2 skipped, 0 failed, 0 unaccounted (run `43031885131`).
- Production dependency audit scope in that run: 0 reported vulnerabilities.
- Main Vercel deployment job completed, but live API endpoints returned HTTP 500 with `PRODUCTION_HOLD_ACTIVE`.
- Neon Main migration ledger ends at 052; migration 053 restrictive tenant guards are not applied.
- The isolated Neon verification branch has migration 053 applied, matching SQL/ledger SHA-256, and read-only Tenant A/B checks on feature flags and safe-mode states returned 1 own-tenant row and 0 foreign rows for each tenant. This is limited evidence, not full production certification.
- The `opscore_runtime` role is least-privilege at the role catalog level; the actual Vercel runtime connection identity remains unverified.
- PR #24 is the integrated candidate combining PR #22 and PR #23; its combined-head CI is still pending. The source branches were separately green (553 passed / 2 skipped and 532 passed / 2 skipped), but those runs are not combined evidence.
- Both skipped acceptance tests require a disposable PostgreSQL URL: `postgres-commercial-acceptance-http.test.js` and `tenant-isolation-matrix.test.js`. They remain UNVERIFIED.
- Live PostgreSQL catalog: 132 public ordinary/partitioned relations, 131 with RLS and FORCE RLS; only read-only `spatial_ref_sys` is outside RLS. Main's control-plane restrictive guards are still absent.
- Neon network settings: public connections allowed, IP allowlist empty, six branches unprotected, protected-branches-only disabled, history retention 6 hours.
- Vercel Firewall is enabled, but active Bot Protection and CRS generic/RCE/SQLi/XSS rules are LOG-only; no custom/IP rules are configured.
- Vercel's last-24-hour runtime aggregation showed 59 `PRODUCTION_HOLD_ACTIVE` errors across 32 users.

## Release blockers

1. Restore service only after exact production environment and database-role evidence pass; keep Production Hold active until then.
2. Apply and verify migration 053 on Main only after backup, preflight, rollback plan, and explicit approval.
3. Prove Tenant A/B session isolation across all tenant-owned tables and API paths.
4. Prove production backup and restore, with measured RPO/RTO and integrity checks.
5. Verify live TLS, WAF enforcement, rate limits, OIDC/JWKS, KMS/HSM, observability, external provider integrations, and operational alerting.
6. Generate a new exact-head commercial archive and verify its signed provenance.
7. Resolve license grant, resale rights, support, SLA, data processing, and liability terms in signed agreements.

## Buyer-owned residuals

Mobile signing, native Android/iOS builds, physical-device QA, and store submission remain buyer-owned. Native-speaker translation/domain review of all 114 locale resources is not complete (0/114 reviewed; 0/114 production-qualified).

- Android/iOS signing, native builds, physical-device QA, and app-store release.
- Native-speaker/domain review of all 114 locale resources; current production qualification is 0/114.
- External provider accounts, licenses, credentials, quotas, maps/road routing, telephony/carrier, payments, webhooks, storage, KMS/HSM, and cloud services.

## Historical evidence rule

Older GitLab pipeline references, old Vercel domains, prior test counts, archive digests, and prior candidate commits are historical only. The current source of truth is the GitHub repository and the exact-head GitHub Actions secure-release artifact.
