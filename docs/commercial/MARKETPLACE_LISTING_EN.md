# Marketplace listing — OpsCore v0.11.62

**Offer publication:** The rights holder may publish, list and negotiate this offer before a buyer is identified. No buyer signature is required to publish the listing. A buyer-specific License Schedule is executed only when a transaction proceeds and before rights or delivery are granted.

**Title**  
OpsCore — Multi-Sector Operational Source Kit (Web + API + Expo Mobile Source)

**Subtitle**  
Work orders, dispatch, offline field sync, evidence, audit and governed closeout — a source kit your team runs and extends.

**Opening paragraph**  
OpsCore v0.11.62 is an operational source foundation for work-order-driven field operations. It contains a Node.js API, a browser operations console and Expo mobile source using a server-owned contract. It is source code, not a hosted SaaS subscription or store-ready native app release.

**What you receive**
- Multi-tenant backend and operational UI with RBAC/workflow controls.
- Work orders, scheduling/dispatch, offline sync, evidence and completion records.
- Contact Center locale resources, runtime selector and visible AI/machine-translation notice.
- Verification scripts, test evidence, release statement template and SHA-256 manifests.

**Translation disclosure**  
The Contact Center runtime currently exposes 105 selectable locale codes: 1 English source, 100 machine-assisted drafts, and 4 explicit English fallback locales. A separate qualification register contains 114 source rows; 9 flagged locales (ms, sw, hy, uz, my, ml, es, sr, te) are withdrawn from runtime selection pending remediation and native-speaker review. Structural/integrity checks do not certify linguistic quality; native-speaker review is 0/114 and production qualification is 0/105 currently selectable locales. The in-app machine-translation notice must remain visible.

**Customer responsibilities**
- External providers/accounts, licenses, credentials, identity, webhooks, messaging/payment, storage, KMS, maps and live integration tests.
- Native mobile build, dependency remediation, EAS setup, signing, physical-device tests, store accounts/submission and distribution. No signed binaries are included.
- Production infrastructure, PostgreSQL/RLS, backup/restore, TLS/WAF, operations and certification.

The current main branch uses Expo SDK 58.0.23 / React Native 0.88.1. Draft PR #222 candidate head 807dee55f050bc96a4123091f09be1503c10004d updates the candidate to Expo SDK 58.0.26. Exact-head run 44158727347 reports 25 High findings in the full mobile audit and 26 High with `--omit=dev` (0 Critical), linked to GHSA-fc5q-39xc-vjpf / CVE-2026-112366 through transitive picomatch dependencies. Backend runtime dependency audit: 0 findings. PostgreSQL 18 isolated acceptance passed on the same head in run 44158727249, but this is not Production certification. CI remains fail-closed and no current-head Secure Release ZIP exists. Disclose the unresolved seller-owned mobile blocker; do not market the candidate as a qualified download.

**Explicit non-claims**  
Not production-certified. Not 114 human-reviewed translations. Not signed store binaries. Not proof that each external provider is live. The sale price and transfer rights are agreed separately in writing.
