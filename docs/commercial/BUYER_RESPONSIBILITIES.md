# OpsCore v0.11.62 — Buyer Responsibilities and Translation Notice

Package: commercial source-code delivery, not a hosted SaaS subscription and not a signed mobile store release. Evidence authority: exact archive-producing pipeline's release statement, JUnit, i18n report, mobile audit JSON and SHA-256 sums.

## 1. Integrated Contact Center and translation

The Contact Center module, locale selector, 114 locale resources, loader, RTL behavior, safe text rendering, fallback handling and visible AI/machine-translation notice are included in the source.

Catalogue: 1 English source locale, 109 machine-assisted draft locales, 4 explicit English-fallback locales (din, nus, pau, ch), 89 keys per locale. Four structural/forensic rounds run in CI. Native-speaker reviewed = 0/114; production-qualified = 0/114. The audit verifies structure, provenance and safe integration, not linguistic accuracy or cultural/legal suitability. Keep the machine-translation notice visible.

## 2. External integrations — buyer/customer responsibility

The buyer provisions, licenses, secures, configures and live-tests provider accounts and services required by its deployment, including identity/OIDC/JWKS, email/SMS/WhatsApp/PSTN/SIP, external call-center/telephony services, payments, webhooks, object storage, KMS/HSM, cloud accounts, credentials, quotas, billing and provider contracts.

The delivered source includes only the internal interfaces, routes, adapters and integration contracts present in the package. Source presence is not proof that an external provider is connected or accepted. Credentials must remain in buyer-controlled secret management and must never be committed to source.

## 3. Maps and road routing — buyer/customer responsibility

The buyer selects and licenses the map/road-routing provider, obtains API keys, pays provider fees, satisfies attribution and quota terms, configures credentials and performs live acceptance tests. No map-provider license or account is transferred with the source package.

## 4. Android and iOS apps — buyer/customer responsibility

The package includes Expo mobile source and source-level verification only. It does not include signed APK/AAB/IPA, an EAS account/project, Apple/Google developer accounts, signing credentials, completed physical-device acceptance, store submission or distribution.

The buyer owns buyer-specific EAS setup, Android/iOS signing, native builds, physical-device GPS/camera/offline/upgrade testing, store accounts, submission and distribution. The seller remains responsible for defects in the supplied mobile source and for pre-delivery remediation of high/critical dependency advisories. After handover, ongoing dependency/security maintenance is buyer-owned.

The last verified locked-tree baseline reported 12 npm findings: 0 critical, 0 high, 10 moderate, 2 low. CI blocks high/critical findings and preserves the complete JSON report in the exact archive pipeline. Moderate/low findings remain disclosed; the package is not described as vulnerability-free.

## Acceptance rule

Only make a positive claim supported by evidence for the exact delivered commit. Backend/source acceptance, provider integration, maps licensing, native app signing/device QA, translation quality and production certification are separate states.
