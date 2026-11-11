# OpsCore v0.11.62 — Commercial and IP Transfer Checklist

This operational checklist does not replace legal advice. The parties must sign a written transfer/assignment covering source-code rights, modification/distribution rights, repository/history scope, brand/domains if included, third-party dependencies/licenses, excluded assets, support, and responsibility allocation. The bundled license file is not a substitute for a negotiated commercial grant.

## Three scope items to record explicitly

| Area | Included by this source package | Buyer/customer responsibility |
|---|---|---|
| Contact Center translation | 114 selectable locale resources, runtime loader/selector/RTL/safe rendering, machine-translation notice, and four reproducible forensic/structural audit rounds whose pass result is in the build-specific CI report. Coverage is 1 English source, 109 machine-assisted drafts, 4 English fallback locales; 89 keys per locale. | Native-speaker/domain review and approval before official use. Do not claim human-reviewed or 114 production-qualified languages; currently 0/114 are production-qualified. |
| External integrations | Source contracts, routes/adapters and configuration boundaries only where present. | Accounts, licenses, API credentials, OIDC/JWKS, email/SMS/WhatsApp/carrier and external call-center/telephony providers, payment, webhooks, object storage, KMS/HSM, maps/routing, cloud, quotas, billing, callbacks, live acceptance tests and maintenance. |
| Mobile apps | Expo mobile source (version 0.1.16) and source-level verification. No signed APK/AAB/IPA is included. | EAS project/account, signing keys, Apple/Google developer accounts, native builds, physical-device testing, API environment setup, store submission/distribution, security/dependency remediation and updates. |

## Mobile dependency warning

The verified current source candidate uses Expo SDK 58.0.23 / React Native 0.88.1 / React 19.3.0. GitHub Secure Release run 42949619029 reported zero findings across all npm audit severities in its same-run mobile audit JSON. This is a point-in-time locked-tree result, not a guarantee against future advisories. Signed native binaries and physical-device acceptance remain buyer-side gates.

## Other production boundaries

The buyer/hosting owner must separately accept PostgreSQL/PostGIS schema and runtime behavior, tenant isolation, grants, production backup/restore, KMS/HSM and rotation, TLS/reverse proxy/WAF, centralized observability, rate limiting/shared runtime state, live identity and external integrations, licensed map attribution/quota, physical-device workflows, and operations/on-call/recovery.

## Handover evidence

Use the same GitHub Actions Secure Release run's outer artifact, nested `OpsCore-release.zip`, external `COMMERCIAL_RELEASE_STATEMENT.json`, JUnit/step results, `I18N_FORENSIC_AUDIT_RESULT.json`, mobile dependency audit JSON, root PostgreSQL runtime dependency audit JSON and SHA-256 evidence. For the current verified candidate, run ID is 42949619029 and its artifact is `opscore-release-42949619029`. Older artifacts are historical only. Neither a green backend closure gate nor a source archive implies production certification.
