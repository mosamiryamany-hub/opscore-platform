# OpsCore v0.11.62 — Honest Product Positioning

## What this is
A multi-sector operational **source-code foundation**: browser console + HTTP API + Expo mobile source on a server-owned work-order/field-execution contract.

## What is integrated
- Core work-order, dispatch, offline sync, evidence and governed completion source.
- Contact Center locale runtime with 105 selectable locale codes (1 English source, 100 machine-assisted drafts, 4 English fallbacks), visible AI/machine-translation notice, and a separate 114-row qualification register.
- Four reproducible structural/forensic i18n audit rounds enforced by CI, with a generated report on the exact build.

## What translation status means
The runtime manifest currently contains 105 selectable locale codes: 1 English source, 100 machine-assisted drafts and 4 explicit English-fallback locales (din, nus, pau, ch); 89 keys per locale. The separate qualification register contains 114 source rows; 9 flagged locales (ms, sw, hy, uz, my, ml, es, sr, te) are withdrawn from runtime selection pending remediation and native review. The four audit rounds check integrity, exact key and placeholder structure, registry alignment and safe runtime notice wiring; they do not establish linguistic approval. Native-speaker reviewed = 0/114; production-qualified = 0/105 selectable runtime locales. Do not claim human-reviewed or fully qualified translations.

## Buyer responsibilities
- **External integrations:** buyer provisions and operates required provider accounts/licenses/credentials, webhooks, identity, messaging, external call-center/telephony, payments, object storage, KMS, maps and cloud.
- **Mobile apps:** buyer builds, signs, device-tests, submits and distributes Android/iOS apps, maintains EAS/accounts and remediates mobile dependencies. Only mobile source is included.
- **Production:** buyer verifies database behavior/isolation, backups/restore, KMS, TLS/WAF, observability and the target environment.

The current `main` lockfile baseline is Expo SDK 58.0.23 / React Native 0.88.1 / React 19.3.0. Draft PR #222 candidate head 807dee55f050bc96a4123091f09be1503c10004d uses Expo SDK 58.0.26. Exact-head run 44158727347 reports 25 High findings in the full mobile dependency tree and 26 High with `--omit=dev` (0 Critical), linked to GHSA-fc5q-39xc-vjpf / CVE-2026-112366 through transitive picomatch copies. The backend runtime dependency audit reports 0 findings. PostgreSQL 18 isolated acceptance passed on the same head in run 44158727249, but the report continues to say `isolationCertification=NOT_CERTIFIED`. The mobile audit gate remains fail-closed; do not claim the advisory is resolved. No exact-head Secure Release ZIP or release statement is available.

## What this is not
- Not a hosted SaaS subscription.
- Not signed store binaries or store-approved distribution.
- Not production-certified PostgreSQL/PostGIS, tenant isolation, KMS, DR, or external integrations.
- Not a claim of native-speaker language certification.
