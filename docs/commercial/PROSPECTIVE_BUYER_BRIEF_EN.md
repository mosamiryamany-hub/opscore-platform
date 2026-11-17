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
- No seller-provided production hosting, cloud account, map license, telephony, WhatsApp, email/SMS carrier, payment gateway, KMS/HSM, or identity-provider contract is included unless expressly added to the buyer's signed Schedule.
- Buyer owns deployment and validation in its target environment.

## Current release and security disclosure — important

The current main source head is `6adea6fa209e394b464c4272db1860422d608afb`. Draft PR #222 candidate head is `807dee55f050bc96a4123091f09be1503c10004d`; it is not merged or approved as a release.

The SDK58 source candidate passed clean dependency installation, source checks, Expo Doctor (20/20), and Android/iOS/Web JavaScript exports on earlier tested head `d59819b` (run 44157820028). A Git comparison confirmed that the next 12 commits to tested head `807dee55f050bc96a4123091f09be1503c10004d` changed documentation/advisory records only, not mobile source or dependency lockfiles. Exact-head OpsCore CI run 44158727347 on `807dee55f050bc96a4123091f09be1503c10004d` reports 25 High findings in the full mobile dependency tree and 26 High with `npm audit --omit=dev` (0 Critical), associated with GHSA-fc5q-39xc-vjpf / CVE-2026-112366 through transitive picomatch dependencies. The backend runtime dependency audit reports 0 findings. The required mobile audit gate remains fail-closed. PostgreSQL 18 isolated RLS/HTTP acceptance passed on the exact tested head in run 44158727249, but the result is not Production certification. Subsequent edits on PR #222 are documentation-only and must receive a fresh complete run on the final branch head. No exact-head Secure Release ZIP or external release statement exists; this advisory remains unresolved and is not waived.

The seller is responsible for resolving or formally assessing this release blocker before issuing a qualified delivery package. A successful bundle export alone is not security acceptance.

## Language disclosure

The current Contact Center runtime exposes 105 selectable locales: 1 English source, 100 machine-assisted drafts and 4 explicit English fallbacks. A separate qualification register contains 114 rows; 9 flagged locales are withdrawn from runtime selection pending remediation. Native-speaker review is 0/114 and production qualification is 0/105 selectable runtime locales. The machine-translation notice must remain visible.

## License and transaction

Three license tiers are available for negotiation:
- **A — Use:** operate the agreed deployment(s).
- **B — Use + Modify:** Tier A plus agreed internal modifications.
- **C — Use + Modify + Distribute:** Tier B plus explicitly scoped distribution rights.

The final rights depend only on a transaction-specific License Schedule signed by the rights holder and named buyer. The Schedule must pin the exact source commit and/or package SHA-256 and define scope, instances, territory, term, price/payment, support and other negotiated terms.

No buyer right to access, install, run, copy, modify, distribute, resell, sublicense or host the software is granted by this brief, an unsigned template, a repository listing or a negotiation. Delivery and licensed use remain unauthorized until the named buyer's Schedule is signed and the exact delivery package is release-qualified.

**Next step:** A buyer may request a scoped technical walkthrough and discuss tier, target operating scope and transaction conditions. Any evaluation access requires a separate written evaluation authorization.
