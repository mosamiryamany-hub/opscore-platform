# OpsCore v0.11.62 — Honest Product Positioning

## What this is
A multi-sector operational **source-code foundation**: browser console + HTTP API + Expo mobile source on a server-owned work-order/field-execution contract.

## What is integrated
- Core work-order, dispatch, offline sync, evidence and governed completion source.
- Contact Center locale runtime with 114 selectable locale codes and visible AI/machine-translation notice.
- Four reproducible structural/forensic i18n audit rounds enforced by CI, with a generated report on the exact build.

## What translation status means
The catalog contains 1 English source locale, 109 machine-assisted drafts and 4 explicit English-fallback locales (din, nus, pau, ch); 89 keys per locale. The four rounds check integrity, exact key and placeholder structure, registry alignment and safe runtime notice wiring. Native-speaker reviewed = 0/114; production-qualified = 0/114. Do not claim human-reviewed or fully qualified translations.

## Buyer responsibilities
- **External integrations:** buyer provisions and operates required provider accounts/licenses/credentials, webhooks, identity, messaging, external call-center/telephony, payments, object storage, KMS, maps and cloud.
- **Mobile apps:** buyer builds, signs, device-tests, submits and distributes Android/iOS apps, maintains EAS/accounts and remediates mobile dependencies. Only mobile source is included.
- **Production:** buyer verifies database behavior/isolation, backups/restore, KMS, TLS/WAF, observability and the target environment.

The current `main` lockfile baseline is Expo SDK 58.0.23 / React Native 0.88.1 / React 19.3.0. GitHub Actions on 2026-11-17 reported 26 High findings in the mobile dependency tree, associated with GHSA-fc5q-39xc-vjpf / CVE-2026-112366 through transitive picomatch copies. The root PostgreSQL runtime dependency audit reported 0 findings. Required CI blocks High/Critical results and is currently failing on the mobile audit. The separate Expo SDK 58.0.26 candidate is draft PR #222, not a released or merged baseline. Do not claim the mobile advisory is resolved; disclose it to prospective buyers and use only a same-run exact-head audit in any future package.

## What this is not
- Not a hosted SaaS subscription.
- Not signed store binaries or store-approved distribution.
- Not production-certified PostgreSQL/PostGIS, tenant isolation, KMS, DR, or external integrations.
- Not a claim of native-speaker language certification.
