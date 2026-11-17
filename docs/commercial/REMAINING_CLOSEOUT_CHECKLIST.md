# Seller commercial-release closeout checklist

**Buyer-independent rule:** A named buyer, buyer signature, buyer-specific legal review, payment, or transaction schedule is **not** a prerequisite to finish the product, generate its release package, publish the offer, or begin sales discussions. Those are post-sale transaction steps only. This checklist contains seller-owned release work only.

## Source-code commercial release — seller-owned gates

- [ ] Resolve or formally disposition GHSA-fc5q-39xc-vjpf / CVE-2026-112366 for the exact mobile SDK 58 dependency tree. No unreviewed upstream patch, silent audit suppression, or forced major downgrade.
- [ ] Complete the source/data-flow threat review for build-time glob patterns and retain full + production-only npm audit JSONs from the exact candidate run.
- [ ] Complete PR #222 candidate verification on its latest head; merge only after every required check passes and independent review is recorded.
- [x] Integrated signed-tenant security-hardening lineage: superseding PR #174 is already merged. Verify its behavior remains covered by current-main regression tests; do not reopen superseded PR #163.
- [ ] Complete and verify the approved 67-route signed-session coverage matrix; do not substitute inventory counts or CI-only route contracts.
- [ ] Generate the final exact-head Secure Release artifact, SBOM, provenance, test reports and checksum statement from one successful pipeline.
- [ ] Reconcile all seller-facing offer and handoff documentation to the exact release statement, source commit and package digest.
- [ ] Confirm that the downloadable source package contains only intended distributable files and no credentials, customer data, local state, or unrelated artifacts.

## Separate seller-hosted SaaS track — not a source-code sale gate

- Vercel commercial hosting or alternate hosting is required only before the seller offers a hosted SaaS service. It is not required to sell a source-code package.
- Neon paid retention, multi-day PITR and protected-branch capacity are service-operability decisions for a seller-hosted environment. Do not advertise Free-plan capabilities as production backup guarantees.
- Preview SSO and authenticated Preview acceptance remain environment hardening tasks. They must not be solved by weakening Production controls.
- Production migration, HMAC rotation, WAF enforcement changes and promotion of a new Production deployment remain separately authorized operations. Do not run them merely to produce a source-code sales package.
- Production certification remains NOT_ESTABLISHED unless separately proven against the actual Production target. This limitation must be disclosed; it does not by itself prevent a source-code-only release if all source-release gates pass.

## Transaction boundary — explicitly outside product closeout

After a prospective buyer is identified and transaction terms are agreed, the rights holder and buyer execute the applicable License Schedule, pinning the exact released commit/package digest and defining permitted use, modification, distribution, territory, term, price and support. That agreement is required before granting the buyer licensed use or delivery rights; it is not a product-completion, release, marketing, or buyer-identification gate.

Mobile store signing, native-speaker translation review, licensed map/provider accounts and third-party service credentials remain disclosed buyer/environment responsibilities unless the seller separately agrees to provide them.
