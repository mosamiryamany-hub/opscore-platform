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

The current `main` lockfile baseline is Expo SDK 58.0.23 / React Native 0.88.1 / React 19.3.0. PR #222 candidate head `bd6d7ee56a0f3b7db3cf09cefefe11fd46ba76e3` uses Expo SDK 58.0.26. Exact-head OpsCore CI run 44167795172 reports 807/810 backend release tests passed (0 failed, 3 skipped), backend runtime dependency audit 0 vulnerabilities, npm ci install summary 25 High, and the required mobile `npm audit --omit=dev --audit-level=high` failure with 26 High (0 Critical) through transitive picomatch dependencies associated with GHSA-fc5q-39xc-vjpf / CVE-2026-112366. Vercel contract run 44167795351 also reports 26 High; deploy was skipped. PostgreSQL 18 isolated acceptance passed on the same head in run 44167795388 (346 route checks; 137 restore tables), but the report continues to say `isolationCertification=NOT_CERTIFIED`. The mobile audit gate remains fail-closed; do not claim the advisory is resolved. No exact-head Secure Release ZIP or release statement is available.

## What this is not
- Not a hosted SaaS subscription.
- Not signed store binaries or store-approved distribution.
- Not production-certified PostgreSQL/PostGIS, tenant isolation, KMS, DR, or external integrations.
- Not a claim of native-speaker language certification.
