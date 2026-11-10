# OpsCore v0.11.62 — Web / API / Mobile Source Integration Contract

## Included source contract

The package contains a web operations console, HTTP API and Expo Android/iOS source. The root runtime dependency pg 8.23.1 is pinned by package-lock.json and installed with npm ci. The backend remains the source of truth for tenants, users, customers, work orders, appointments, authorization, evidence and audit state. Source presence does not imply a signed native app or a live external provider.

## Authentication and field flow

- Web uses the HttpOnly __opscore_session cookie.
- Native login uses POST /api/v1/auth/mobile-login; token storage uses Expo SecureStore.
- Office dispatches an appointment; the field client receives it, performs check-in/evidence/offline sync, and the backend validates tenant/actor/appointment ownership.
- Offline operations remain pending until accepted by the server; failed/retryable events must never be represented as synchronized.

## Contact Center and translation

The Contact Center locale runtime includes 114 resources, selector, loader, RTL support, safe rendering, fallbacks and a visible AI/machine-translation notice. Four CI structural/forensic rounds are run. Coverage: 1 English source, 109 machine-assisted drafts, 4 English fallbacks, 89 keys/locale. Native-speaker reviewed = 0/114; production-qualified = 0/114. This is not linguistic certification.

## Buyer responsibility — external providers

Buyer provisions/licenses/configures/tests required OIDC/JWKS, email/SMS/WhatsApp/PSTN/SIP, external call-center/telephony providers, payments, webhooks, object storage, KMS/HSM, maps/road-routing and cloud accounts. Source adapters/routes do not prove live provider connection.

## Buyer responsibility — Android/iOS native release

Buyer owns EAS project/account linkage, Android/iOS signing credentials, native builds, physical-device tests, Apple/Google developer accounts, store submission/distribution and post-handover maintenance. The package includes Expo source only; no signed APK/AAB/IPA is included. The current locked-tree audit gate blocks high/critical findings; latest baseline reported 0 high, 0 critical, 10 moderate, 2 low. Full JSON from the exact package pipeline is authoritative.

## Production boundary

Production PostgreSQL/RLS runtime role, full backup/restore, KMS/key rotation, TLS ingress/WAF, production identity, external providers, live maps, physical-device behavior and production certification are target-specific. Production certification remains NOT_ESTABLISHED; production isolation certification remains NOT_CERTIFIED.
