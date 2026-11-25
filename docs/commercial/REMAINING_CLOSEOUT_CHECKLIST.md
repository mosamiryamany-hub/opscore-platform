# Seller commercial-release closeout checklist

**Buyer-independent rule:** A named buyer, buyer signature, buyer-specific legal review, payment, or transaction schedule is **not** a prerequisite to finish the product, generate its release package, publish an approved offer, or begin sales discussions. This checklist contains seller-owned release work only.

## Source-code commercial release — seller-owned gates

- [x] Reconcile GHSA-fc5q-39xc-vjpf / CVE-2026-112366 as withdrawn on 2026-11-18 in the upstream advisory record; remove the obsolete exception. [ ] Run fresh full and `--omit=dev` mobile npm audits on the exact release candidate and independently assess any remaining active High/Critical findings. The withdrawn advisory is not a patched dependency.
- [x] Complete first-party mobile source/config static scan for direct picomatch/glob APIs; evidence and limitations are recorded in `mobile/security/DEPENDENCY_ADVISORY_REVIEW_2026-11-17.md`. This is a partial reachability review, not risk acceptance.
- [ ] Complete third-party Expo/Metro call-site and CI build-input reachability review; preserve full and `--omit=dev` npm audit JSON from the same exact candidate. Do not label the advisory dev-only.
- [x] Merge the SDK58 candidate lineage represented by PR #222. Its prior successful checks are historical evidence only and do not replace exact-current-main Secure Release.
- [ ] Run Secure Release on exact current main `b4f3bc81135acbf1bbe7262a0ae58b3573cddf82` after seller-owned blockers are resolved; verify ZIP, external release statement, archive SHA-256, SBOM, provenance/signature, JUnit, root/mobile audits, security results and i18n forensic evidence from that same run.
- [ ] Require full Production PostgreSQL HTTP route and business-flow evidence bound to the exact commit, pipeline, deployment ID, database, route inventory and business-flow inventory. The existing 358/358 SQLite result is contract scope only.
- [ ] Verify the package contains only intended distributable files and no credentials, customer data, local state or unrelated artifacts.
- [ ] Reconcile all seller closeout documents to the exact successful Secure Release evidence and current deployment; do not copy stale hashes, workflow IDs or deployment IDs into the final handoff.

The current fail-closed route-gate implementation is being reviewed on branch `fix/fail-closed-production-functional-release-proof-2026-11-21`. It requires `PASS_PRODUCTION_FUNCTIONAL_SCOPE`; the existing SQLite-only evidence cannot satisfy it. The PR and CI results must be reviewed before merge.

## Seller-hosted SaaS track — distinct from a source-code sale

- [ ] Establish an adequate managed backup tier or equivalent independently managed backup system with protected production branch, scheduled backups, defined retention, tested restore and explicitly measured RPO/RTO.
- [ ] Complete seller-owned PostgreSQL trust-boundary remediation: raw-GUC context fallbacks, identity-table direct grants, privileged helper access, AI/search pools and operational worker database parity.
- [ ] Complete production behavior and functional acceptance without substituting isolated CI fixtures or contract-only route results.
- [ ] Rehearse Vercel managed firewall enforcement on Preview, analyze false positives, then implement narrowly scoped Production mitigation. Do not change current log-only rules directly without evidence.
- [ ] Recheck legal routes; publish only rights-holder/legal-approved terms, privacy, refund, pricing and security disclosures.
- [ ] Run the production-release workflow only after its explicit dispatch inputs and repository variables are verified. Confirm staged runtime proof, exact public-domain mapping and production promotion.

Current production evidence: GitHub run `44808632964` is `CANDIDATE_EVIDENCE_ONLY`; Production certification and promotion are both false, and Production environment restoration is true. The current Vercel candidate is READY on SHA `b4f3bc8` with no aliases; the canonical domain still maps to an older deployment on SHA `b7f6344`. This is not a production release.

Current Neon Free plan: six-hour history retention, 1 GiB logical branch limit, one listed manual snapshot, no scheduled snapshot schedule, and Primary `protected=false`. The native PITR probe passed only a historical schema/catalog match, not complete data equality or RPO/RTO certification. Do not delete the sole listed snapshot or any Neon branch without checking its ownership, purpose, expiry and restore role.

GHSA-fc5q-39xc-vjpf is now classified WITHDRAWN by its upstream advisory record, not an active confirmed advisory. A fresh mobile audit on the exact candidate remains required; PR #230 is **closed, not merged** and is not a fix for this advisory.

## Transaction boundary — explicitly outside product closeout

Marketing, buyer discovery, demonstrations, quotations and negotiations may proceed without a pre-sale signature or separate License Schedule. If a transaction proceeds, the accepted buyer-specific offer/order/contract records the exact released commit/package digest, selected tier, permitted use and redistribution scope, territory, term, price and support. A separate License Schedule is optional and is not a product-completion, release, marketing or buyer-identification gate.

## Buyer-owned residuals — remain disclosed, not seller tasks

- Android/iOS signing, native builds, physical-device QA, store accounts and publication.
- Native-speaker translation review and language qualification (0/114).
- Licensed maps/road-routing, buyer/provider accounts, credentials, attribution, quotas and buyer-specific live acceptance.
