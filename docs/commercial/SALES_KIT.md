# OpsCore v0.11.62 — Commercial Sales Kit

**Product:** Multi-Sector Operational Source Kit — web console, HTTP API and Expo mobile source.  
**Sale type:** source-code handoff, not a hosted SaaS subscription. Transaction price is agreed separately in writing.
**Seller offer status:** May be advertised, presented and negotiated before a buyer is identified. A buyer signature is not a prerequisite to publish or market this offer; the transaction-specific License Schedule is executed only when a sale proceeds.

## What the source contains

- Work-order, scheduling, dispatch, evidence and completion workflows.
- Multi-tenant backend/security controls, operational UI, audit paths and APIs.
- Expo mobile source and integration contract; not signed, built or store-published native apps.
- Contact Center module with 105 selectable runtime locale codes, visible AI/machine-translation disclosure, and a separate 114-row qualification register.
- Release gates, evidence-generation scripts/templates and buyer handoff documents; the final exact-head ZIP and release statement are not available until the Secure Release workflow succeeds.

## Translation disclosure

The Contact Center runtime currently exposes 105 selectable locale codes: 1 English source, 100 machine-assisted drafts, and 4 explicit English-fallback locales (din, nus, pau, ch); 89 keys per locale. The separate qualification register contains 114 source rows; 9 flagged locales (ms, sw, hy, uz, my, ml, es, sr, te) are currently withdrawn from runtime selection pending remediation and native-speaker review. Structural/integrity checks are not linguistic approval: native-speaker review is 0/114 and production qualification is 0/105 currently selectable locales. Keep the machine-translation notice visible.

## Customer responsibilities

**External integrations:** buyer owns provider accounts, credentials, licenses, configuration, live acceptance tests and operations (as applicable: identity/OIDC/JWKS, email/SMS/WhatsApp/carrier, external call-center/telephony, payments, webhooks, object storage, KMS/HSM, maps/routing and cloud).

**Mobile release:** buyer owns EAS project/account setup, Android/iOS signing, native builds, physical-device QA, developer accounts, store submission/distribution and post-handover dependency maintenance. No signed APK/AAB/IPA is included; the delivered item is mobile source plus source-level verification.

**Mobile dependency security — unresolved advisory under a temporary documented-risk gate exception:** Current main is Expo SDK 58.0.26 / React Native 0.88.1 / React 19.3.1. Post-merge main OpsCore CI run [44205567188](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44205567188) passed, but the mobile audit gate does so only because mobile/audit-allowlist.json records GHSA-fc5q-39xc-vjpf with a 2026-12-18 review expiry and picomatch maximum accepted version 4.0.7. This is a time-limited documented exception, **not a security fix, clean audit or formal signed risk acceptance**. The advisory remains unresolved through picomatch 4.0.7; PR #230 is Draft/HOLD and its 4.0.7 override is not accepted as remediation. No authorized seller-side risk-owner signature was found in the reviewed evidence. Review mobile/security/DEPENDENCY_ADVISORY_REVIEW_2026-11-17.md and docs/commercial/COMMERCIAL_CLOSEOUT_FINAL.md before making any security claim. The exact-main Secure Release ZIP and external statement have not yet been produced.

**Production:** the buyer validates production PostgreSQL/RLS, backup/restore, KMS, TLS/WAF, observability, operations and tenant isolation. Production certification is NOT_ESTABLISHED.

## Delivery rule

Only use the ZIP and evidence artifacts from the same successful current-head pipeline. Confirm source commit, pipeline ID, byte count, archive SHA-256, JUnit, translation audit, mobile dependency audit and root PostgreSQL runtime dependency audit before handover. Never claim production-ready, all-language-qualified, human-reviewed translation, signed apps, or live provider connections without direct evidence.
