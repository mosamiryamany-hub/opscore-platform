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

**Mobile dependency security — current seller release blocker:** The current `main` baseline remains Expo SDK 58.0.23 / React Native 0.88.1 / React 19.3.0. Draft PR #222 updates the candidate to Expo SDK 58.0.26 and is currently at `807dee55f050bc96a4123091f09be1503c10004d`. Exact-head OpsCore CI run 44158727347 reports 25 High findings in the full mobile audit and 26 High with `npm audit --omit=dev` (0 Critical), through transitive picomatch dependencies associated with GHSA-fc5q-39xc-vjpf / CVE-2026-112366. The backend runtime dependency audit reported 0 findings. The mobile audit fails closed; no waiver, suppression or forced downgrade has been applied. PostgreSQL 18 isolated acceptance passed on the same candidate head in run 44158727249, while its evidence explicitly remains `isolationCertification=NOT_CERTIFIED`. Earlier run 44157820028 validated Expo Doctor 20/20 and Android/iOS/Web exports on `d59819b`; the later commits to `807dee5` changed only documentation/advisory records, not mobile source or lockfiles. No current-head Secure Release ZIP or external release statement exists. See `mobile/security/DEPENDENCY_ADVISORY_REVIEW_2026-11-17.md` and `docs/commercial/COMMERCIAL_CLOSEOUT_FINAL.md`.

**Production:** the buyer validates production PostgreSQL/RLS, backup/restore, KMS, TLS/WAF, observability, operations and tenant isolation. Production certification is NOT_ESTABLISHED.

## Delivery rule

Only use the ZIP and evidence artifacts from the same successful current-head pipeline. Confirm source commit, pipeline ID, byte count, archive SHA-256, JUnit, translation audit, mobile dependency audit and root PostgreSQL runtime dependency audit before handover. Never claim production-ready, all-language-qualified, human-reviewed translation, signed apps, or live provider connections without direct evidence.
