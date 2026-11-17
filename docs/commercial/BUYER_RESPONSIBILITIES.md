# OpsCore v0.11.62 — Buyer Responsibilities and Translation Notice

Package: commercial source-code delivery, not a hosted SaaS subscription and not a signed mobile store release. Evidence authority: exact archive-producing pipeline's release statement, JUnit, i18n report, mobile audit JSON and SHA-256 sums.

## 1. Integrated Contact Center and translation

The Contact Center module, locale selector, 114 locale resources, loader, RTL behavior, safe text rendering, fallback handling and visible AI/machine-translation notice are included in the source.

Catalogue: 1 English source locale, 109 machine-assisted draft resources and 4 explicit English-fallback resources (din, nus, pau, ch), 89 keys per resource. The current runtime exposes 105 selectable locales: 1 English source, 100 machine-assisted drafts and 4 fallbacks; 9 flagged resources are withdrawn from runtime selection pending remediation/native review. Four structural/forensic rounds run in CI. Native-speaker reviewed = 0/114; production-qualified = 0/105 selectable runtime locales. Structural verification does not establish linguistic accuracy or cultural/legal suitability. Keep the machine-translation notice visible.

## 2. External integrations — buyer/customer responsibility

The buyer provisions, licenses, secures, configures and live-tests provider accounts and services required by its deployment, including identity/OIDC/JWKS, email/SMS/WhatsApp/PSTN/SIP, external call-center/telephony services, payments, webhooks, object storage, KMS/HSM, cloud accounts, credentials, quotas, billing and provider contracts.

The delivered source includes only the internal interfaces, routes, adapters and integration contracts present in the package. Source presence is not proof that an external provider is connected or accepted. Credentials must remain in buyer-controlled secret management and must never be committed to source.

## 3. Maps and road routing — buyer/customer responsibility

The buyer selects and licenses the map/road-routing provider, obtains API keys, pays provider fees, satisfies attribution and quota terms, configures credentials and performs live acceptance tests. No map-provider license or account is transferred with the source package.

## 4. Android and iOS apps — buyer/customer responsibility

The package includes Expo mobile source and source-level verification only. It does not include signed APK/AAB/IPA, an EAS account/project, Apple/Google developer accounts, signing credentials, completed physical-device acceptance, store submission or distribution.

The buyer owns buyer-specific EAS setup, Android/iOS signing, native builds, physical-device GPS/camera/offline/upgrade testing, store accounts, submission and distribution. The seller remains responsible for defects in the supplied mobile source and for pre-delivery remediation of high/critical dependency advisories. After handover, ongoing dependency/security maintenance is buyer-owned.

Current candidate security status: PR #222 head `bd6d7ee56a0f3b7db3cf09cefefe11fd46ba76e3`; exact-head OpsCore CI run 44167795172 reports 26 High in the required mobile `npm audit --omit=dev --audit-level=high` step (the separate npm ci install summary prints 25 High), 0 Critical, through transitive picomatch dependencies linked to GHSA-fc5q-39xc-vjpf / CVE-2026-112366. Vercel contract run 44167795351 also reports 26 High. Backend runtime dependency audit: 0 findings. PostgreSQL 18 isolated acceptance passed on the same head in run 44167795388 (346 route checks, 137 restore tables; isolation certification NOT_CERTIFIED). The fail-closed mobile audit gate remains open; no High/Critical risk is assigned to the buyer or silently waived. Seller must resolve or formally disposition the finding before issuing a qualified source package.

## Acceptance rule

Only make a positive claim supported by evidence for the exact delivered commit. Backend/source acceptance, provider integration, maps licensing, native app signing/device QA, translation quality and production certification are separate states.
