# Seller-side commercial closeout — OpsCore v0.11.62

> **Decision: SELLER SOURCE-RELEASE HOLD. This is not a buyer-acquisition hold.**
>
> A named buyer, buyer signature, payment, buyer-specific legal review or transaction License Schedule is **not** required to complete seller engineering, prepare a release package, publish or list the offer, present the product, or negotiate. **No prospective buyer or buyer signature is needed to complete the product.** The buyer-specific Schedule is required only at transaction close, before granting the named buyer licensed rights or making the licensed delivery. **No license grant is made to a buyer until** the rights holder and named buyer execute the License Schedule pinned to the exact released source commit and package digest.

**Updated:** 2026-11-17  
**Current `main`:** `6adea6fa209e394b464c4272db1860422d608afb`  
**Current candidate branch:** PR #222, branch `fix/mobile-sdk58-current-main-20261117`.  
**Candidate status:** Draft / not merged / not a qualified release. The latest full workflow evidence below is from tested candidate code head `5afd48c85b04bb4f7a6a5d73ce3ad7fdd8331371`. This run validates the current app source, manifests, lockfiles and seller/buyer documentation on that exact head.

## 1. Current exact-head evidence

| Gate | Exact-head result | Interpretation |
|---|---|---|
| OpsCore CI | [Run 44167258493](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44167258493) — failed at Mobile dependency audit | Backend release regression suite: 810 tests, 807 passed, 0 failed, 3 skipped; backend runtime audit: 0 vulnerabilities |
| Mobile dependency audit in OpsCore CI | 25 High, 0 Critical | Fail-closed release gate |
| PostgreSQL 18 isolated RLS/HTTP acceptance | [Run 44167258471](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44167258471) — PASS on this exact head | Caller-bound tenant matrix: 346 route checks; logical restore: 137 tables; report remains `isolationCertification=NOT_CERTIFIED` |
| Vercel contract verification | [Run 44167258499](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44167258499) — failed at Mobile dependency audit | Vercel workflow reported 26 High, 0 Critical on the same head; deploy-bound PostgreSQL and deploy jobs were skipped. No Production deployment occurred |

The two workflows report a 25-versus-26 High-row variance on the same head. Both trace the records to the picomatch dependency paths associated with the same advisory; this is not evidence of 25 or 26 independent CVEs. Preserve and reconcile the exact audit JSONs before any release.

The mobile build/export evidence is from the earlier candidate validation: run 44157820028 on `d59819b94c5953e17413b4f9cbf1ef1172145e90` recorded Expo Doctor 20/20 and Android, iOS and Web exports as PASS. A Git comparison from the earlier export-tested head `d59819b94c5953e17413b4f9cbf1ef1172145e90` through tested head `5afd48c85b04bb4f7a6a5d73ce3ad7fdd8331371` shows that later commits touched seller/buyer documentation and the advisory review only; the mobile application source, `package.json`, and `package-lock.json` did not change. That build evidence therefore relates to the same mobile source/lockfile, but it does **not** resolve the audit finding.

The current audit still flags transitive `picomatch@4.0.7` and `picomatch@2.3.2` through the Expo/Metro dependency graph under GHSA-fc5q-39xc-vjpf / CVE-2026-112366. The advisory remains unresolved for this candidate. No audit suppression, unreviewed patch, forced major downgrade, or risk waiver was applied. `npm audit fix --force` proposes installing React Native 0.83.10, a breaking change from the candidate's 0.88.1 line; that option was rejected. The backend audit passing and successful JavaScript exports do not establish mobile supply-chain security. The High rows are repeated dependency-path audit findings around the advisory, not 26 independently confirmed CVEs.

## 2. Commercial status — buyer-independent

- **Offer publication, listing, presentation and negotiation:** permitted by the seller-side commercial framework before any buyer is identified.
- **Qualified downloadable source release:** not yet available for this candidate because the seller-owned mobile dependency gate and exact-head Secure Release package gate remain open.
- **Hosted SaaS:** not included in this source-code offer. Vercel/Neon seller-hosted operations and Production certification are a separate track.
- **License grant:** none by default. A transaction-specific Schedule is prepared only when a real transaction proceeds; it pins the exact released source commit and package SHA-256 and specifies tier, rights, term, territory, payment and support.

No buyer acquisition, buyer signature or payment task appears in the seller closeout checklist. The offer can be prepared and presented while the seller completes release gates, but the present candidate must not be represented as a qualified download or production-certified service.

## 3. Remaining seller-owned source-release gates

1. Resolve the mobile advisory through an upstream fix or a documented, independently reviewed, evidence-based disposition. Do not suppress npm audit or force an incompatible downgrade.
2. Complete the independent Expo/Metro call-site and CI build-input reachability review; retain full and `--omit=dev` audit JSONs from the same exact candidate.
3. Run all mandatory workflows on one exact final candidate head and record the required review.
4. Generate the exact-head Secure Release ZIP, external release statement, SHA-256, SBOM, provenance, JUnit/test reports, mobile audit JSON and forensic i18n evidence from one successful run.
5. Reconcile README, buyer quickstart, offer pages and transfer documents to that exact release statement and digest; scan the archive for secrets, customer data, local state and unintended files.

## 4. Separate hosted-service / Production track

Neon backup/PITR capacity, branch protection, Vercel commercial hosting entitlement, domains, Preview SSO, the Production 67-route signed-session collector, Production migrations, HMAC rotation, WAF enforcement and Production promotion are not prerequisites for selling a source-code package. They remain necessary before the seller offers and operates a hosted Production service, and must not be described as complete without current target-bound evidence.

The isolated PostgreSQL route matrix is not the missing live Production 67-route certification. Production certification remains `NOT_ESTABLISHED`; no Production migration, key rotation, WAF change or Production deployment is authorized by this source-code closeout.

## 5. Historical evidence boundary

Older Production pins, package digests and Secure Release artifacts are historical records only. They must not be reused as identity or proof for `5afd48c85b04bb4f7a6a5d73ce3ad7fdd8331371` or a later source head. A current handover identity exists only when a successful Secure Release run creates the ZIP and its matching external release statement for the exact source commit.
