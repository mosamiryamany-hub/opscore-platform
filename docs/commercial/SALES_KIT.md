# OpsCore v0.11.62 — Commercial Sales Kit

**Product:** Multi-Sector Operational Source Kit — web console, HTTP API and Expo mobile source.  
**Sale type:** source-code handoff, not a hosted SaaS subscription. Transaction price is agreed separately in writing.

## What the source contains

- Work-order, scheduling, dispatch, evidence and completion workflows.
- Multi-tenant backend/security controls, operational UI, audit paths and APIs.
- Expo mobile source and integration contract; not signed, built or store-published native apps.
- Contact Center module with 114 registered locale codes and visible AI/machine-translation disclosure.
- Release checks, acceptance evidence, checksums and buyer handoff documents.

## Translation disclosure

The Contact Center locale runtime is integrated. Its catalog has 109 machine-assisted draft locales, 4 explicit English-fallback locales (din, nus, pau, ch), and English as the source locale; 89 keys per locale. Four reproducible structural/integrity audit rounds are run by CI. This is not linguistic approval: 0/114 locales are native-speaker reviewed or production-qualified. The machine-translation notice must remain visible.

## Customer responsibilities

**External integrations:** buyer owns provider accounts, credentials, licenses, configuration, live acceptance tests and operations (as applicable: identity/OIDC/JWKS, email/SMS/WhatsApp/carrier, external call-center/telephony, payments, webhooks, object storage, KMS/HSM, maps/routing and cloud).

**Mobile release:** buyer owns EAS project/account setup, Android/iOS signing, native builds, physical-device QA, developer accounts, store submission/distribution and post-handover dependency maintenance. No signed APK/AAB/IPA is included; the delivered item is mobile source plus source-level verification.

**Mobile security:** Current locked Expo SDK 57.0.31 / React Native 0.86.3 baseline: 0 critical, 0 high, 10 moderate, 2 low. CI blocks high/critical findings; the complete audit JSON from the exact archive-producing pipeline is authoritative. Moderate/low findings remain disclosed.

**Production:** the buyer validates production PostgreSQL/RLS, backup/restore, KMS, TLS/WAF, observability, operations and tenant isolation. Production certification is NOT_ESTABLISHED.

## Delivery rule

Only use the ZIP and evidence artifacts from the same successful current-head pipeline. Confirm source commit, pipeline ID, byte count, archive SHA-256, JUnit, translation audit, mobile dependency audit and root PostgreSQL runtime dependency audit before handover. Never claim production-ready, all-language-qualified, human-reviewed translation, signed apps, or live provider connections without direct evidence.
