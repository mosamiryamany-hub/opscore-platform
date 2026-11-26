# OpsCore — Prospective Buyer Brief

**Commercial status:** Open for commercial discussion and negotiation. Current source delivery remains on HOLD pending a release-qualified, exact-head package and security disposition described below.

## Product

OpsCore is a multi-sector operational source-code foundation. The current source package includes a web console, HTTP API, backend services and Expo mobile source around a server-owned work-order and field-execution contract.

The integrated workflow scope includes:
- Work orders, scheduling, dispatch and field execution.
- Evidence collection, integrity checks, customer sign-off and governed completion.
- Offline-capable mobile source and retryable sync workflows.
- Audit history, tenant-aware access controls and operational interfaces.
- A Contact Center candidate module with 105 selectable locale codes and visible machine-translation disclosure.

## Demonstrated source-level value

The source includes an evidence-package endpoint that returns work-order state, appointment/check-in evidence, SLA state, parts, attachments, customer sign-offs, safety acknowledgements, activity and audit records. Stored attachments are re-hashed before package return; a canonical SHA-256 digest is included.

These controls are source-level integrity mechanisms. They are not a claim of legal immutability, regulatory certification, or production certification.

## Delivery form

- Source-code handoff, not a hosted SaaS subscription.
- Web/API source and Expo mobile source.
- No signed APK, AAB or IPA is included.
- No seller-provided production hosting, cloud account, map license, telephony, WhatsApp, email/SMS carrier, payment gateway, KMS/HSM, or identity-provider contract is included unless expressly included in the accepted buyer-specific offer/order/contract.
- Buyer owns deployment and validation in its target environment.

## Current release and security disclosure — important

The current main source head is `6adea6fa209e394b464c4272db1860422d608afb`. Draft PR #222 candidate head is `807dee55f050bc96a4123091f09be1503c10004d`; it is not merged or approved as a release.

The SDK58 source candidate passed clean dependency installation, source checks, Expo Doctor (20/20), and Android/iOS/Web JavaScript exports on earlier tested head `d59819b` (run 44157820028). Mobile application source, manifests and lockfiles were unchanged by later documentation-only commits. On current PR #222 head `bd6d7ee56a0f3b7db3cf09cefefe11fd46ba76e3`, OpsCore CI run 44167795172 reports 807/810 backend release tests passed (0 failed, 3 skipped) and 0 backend runtime audit findings. `npm ci` prints a separate install summary of 25 High, while the required mobile `npm audit --omit=dev --audit-level=high` fails with 26 High (0 Critical) through transitive picomatch dependencies associated with GHSA-fc5q-39xc-vjpf / CVE-2026-112366. Vercel contract run 44167795351 also reports 26 High and skips deployment. PostgreSQL 18 isolated RLS/HTTP acceptance passed on the exact current head in run 44167795388 (346 route checks; logical restore across 137 tables), but the result explicitly remains `isolationCertification=NOT_CERTIFIED`. The mobile advisory remains unresolved and is not waived. No exact-head Secure Release ZIP or external release statement exists.

The seller is responsible for resolving or formally assessing this release blocker before issuing a qualified delivery package. A successful bundle export alone is not security acceptance.

## Language disclosure

The current Contact Center runtime exposes 105 selectable locales: 1 English source, 100 machine-assisted drafts and 4 explicit English fallbacks. A separate qualification register contains 114 rows; 9 flagged locales are withdrawn from runtime selection pending remediation. Native-speaker review is 0/114 and production qualification is 0/105 selectable runtime locales. The machine-translation notice must remain visible.

## License and transaction

Three license tiers are available for negotiation:
- **A — Use:** operate the agreed deployment(s).
- **B — Use + Modify:** Tier A plus agreed internal modifications.
- **C — Use + Modify + Distribute:** Tier B plus explicitly scoped distribution rights.

The final rights depend only on a transaction-specific License Schedule signed by the rights holder and named buyer. The Schedule must pin the exact source commit and/or package SHA-256 and define scope, instances, territory, term, price/payment, support and other negotiated terms.

This brief, an unsigned template, a repository listing or a negotiation does not itself grant buyer rights. Marketing, demonstrations, buyer discovery, quotations and negotiation are open without a pre-sale signature or separate License Schedule. If a sale proceeds, the accepted buyer-specific offer/order/contract states the exact deliverable and permitted access, installation, use, modification, distribution, resale, sublicensing and hosting rights. Delivery also requires an exact release-qualified package.

**Next step:** A buyer may request a scoped technical walkthrough and discuss tier, target operating scope and transaction conditions. Any evaluation access requires a separate written evaluation authorization.
