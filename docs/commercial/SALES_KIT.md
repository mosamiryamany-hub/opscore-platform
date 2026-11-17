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

**Mobile dependency security — current seller release blocker:** The current `main` baseline remains Expo SDK 58.0.23 / React Native 0.88.1 / React 19.3.0. The PR #222 candidate branch head is `bd6d7ee56a0f3b7db3cf09cefefe11fd46ba76e3` using Expo SDK 58.0.26. On this exact head, [OpsCore CI run 44167795172](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44167795172) reports 807/810 backend release tests passed (0 failed, 3 skipped), backend runtime dependency audit 0 vulnerabilities, mobile install audit summary 25 High, and the required mobile `npm audit --omit=dev --audit-level=high` gate fails with 26 High (0 Critical) through transitive picomatch dependencies associated with GHSA-fc5q-39xc-vjpf / CVE-2026-112366. [Vercel contract run 44167795351](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44167795351) also fails its mobile audit at 26 High; deployment jobs were skipped. [PostgreSQL 18 isolated acceptance run 44167795388](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44167795388) passed on this exact head: 346 tenant route checks and 137 logical-restore tables; `isolationCertification=NOT_CERTIFIED`. Earlier run 44157820028 validated Expo Doctor 20/20 and Android/iOS/Web exports on `d59819b`; later PR commits are documentation-only, so the mobile source and lockfile tested there remain unchanged. No exact-head Secure Release ZIP or external release statement exists. No advisory waiver, suppression, unreviewed fork, or forced downgrade was applied. See `mobile/security/DEPENDENCY_ADVISORY_REVIEW_2026-11-17.md` and `docs/commercial/COMMERCIAL_CLOSEOUT_FINAL.md`.

**Production:** the buyer validates production PostgreSQL/RLS, backup/restore, KMS, TLS/WAF, observability, operations and tenant isolation. Production certification is NOT_ESTABLISHED.

## Delivery rule

Only use the ZIP and evidence artifacts from the same successful current-head pipeline. Confirm source commit, pipeline ID, byte count, archive SHA-256, JUnit, translation audit, mobile dependency audit and root PostgreSQL runtime dependency audit before handover. Never claim production-ready, all-language-qualified, human-reviewed translation, signed apps, or live provider connections without direct evidence.
