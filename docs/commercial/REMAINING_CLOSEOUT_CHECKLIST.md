# Seller commercial-release closeout checklist

**Buyer-independent rule:** A named buyer, buyer signature, buyer-specific legal review, payment, or transaction schedule is **not** a prerequisite to finish the product, generate its release package, publish the offer, or begin sales discussions. Those are post-sale transaction steps only. This checklist contains seller-owned release work only.

## Source-code commercial release — seller-owned gates

- [ ] Obtain an authorized, signed seller-side risk disposition for GHSA-fc5q-39xc-vjpf / CVE-2026-112366 or a complete upstream patch. Main CI currently passes only under the time-limited allowlist entry reviewed by 2026-12-18; this is not a security fix, clean audit or signed risk acceptance. PR #230 remains Draft/HOLD.
- [x] Complete the first-party mobile source/config static scan for direct picomatch/glob APIs; evidence and limitations recorded in `mobile/security/DEPENDENCY_ADVISORY_REVIEW_2026-11-17.md` (partial reachability review only, not risk acceptance).
- [ ] Complete independent third-party Expo/Metro call-site and CI build-input reachability review; preserve full + `--omit=dev` npm audit JSONs from the same exact candidate run. Do not label the advisory dev-only or accept risk from the first-party scan alone.
- [x] PR #222 mobile SDK58 source candidate is merged into main. Current main 88f0f7377244d89f063de7c07714f9c2849fbc57 has passed post-merge OpsCore CI (44205567188) and Vercel contract/isolated PostgreSQL acceptance (44205566999). The last product application-code baseline was 27d41476a115d81ddd3ad1b4f03025142a7e5be6; PR #235 changed only closeout docs and their consistency test. This does not replace the exact-main Secure Release artifact gate.
- [x] Integrated signed-tenant security-hardening lineage: superseding PR #174 is already merged. Verify its behavior remains covered by current-main regression tests; do not reopen superseded PR #163.
- [ ] Run Secure Release on exact repository main 88f0f7377244d89f063de7c07714f9c2849fbc57 and verify the generated ZIP, external statement, archive SHA-256, SBOM, provenance, test reports, mobile audit and i18n forensic evidence. No current-main artifact exists yet; the manual dispatch was blocked because the separate browser automation wallet was -$0.12 and no workflow run started.
- [ ] Merge documentation reconciliation PR #235, then bind final buyer handoff files to the exact Secure Release statement, source commit and package digest once that artifact exists.
- [ ] Confirm that the downloadable source package contains only intended distributable files and no credentials, customer data, local state, or unrelated artifacts.

## Separate seller-hosted SaaS track — not a source-code sale gate

- Vercel commercial hosting or alternate hosting is required only before the seller offers a hosted SaaS service. It is not required to sell a source-code package.
- Neon project is currently Free, history retention 6 hours, 1 GiB branch logical-size limit, 6 active branches (6/10 included), 3 root branches, all six currently unprotected, one listed manual snapshot and empty automatic snapshot schedule. No PITR/RPO/RTO guarantee is established. Do not delete the sole current snapshot without explicit approval.
- Production database opscore_acceptance has 68 migration-ledger rows. Migrations 063–067 and 069 are present; the historical Production workflow failed in a post-apply postcondition. PR #234 fixed the source runner for an absent opscore_app role, but a post-fix Production APPLIED_AND_VERIFIED run has not been recorded. Do not reapply present migrations.
- The Primary now has the opscore_security.context_hmac_keys table but 0 key rows. Signed Production tenant context is not activated. The live 67-route signed-session HTTP acceptance matrix remains NOT_ESTABLISHED.
- Preview SSO and authenticated Preview acceptance remain environment hardening tasks. They must not be solved by weakening Production controls.
- Production migration verification, HMAC rotation, WAF enforcement changes and promotion of a new Production deployment remain separately authorized operations. The 67-route signed-session HTTP acceptance matrix is Production certification work, not a source-code package release gate. Current Production certification remains NOT_ESTABLISHED.
- Production certification remains NOT_ESTABLISHED unless separately proven against the actual Production target. This limitation must be disclosed; it does not by itself prevent a source-code-only release if all source-release gates pass.

## Transaction boundary — explicitly outside product closeout

After a prospective buyer is identified and transaction terms are agreed, the rights holder and buyer execute the applicable License Schedule, pinning the exact released commit/package digest and defining permitted use, modification, distribution, territory, term, price and support. That agreement is required before granting the buyer licensed use or delivery rights; it is not a product-completion, release, marketing, or buyer-identification gate.

Mobile store signing, native-speaker translation review, licensed map/provider accounts and third-party service credentials remain disclosed buyer/environment responsibilities unless the seller separately agrees to provide them.
