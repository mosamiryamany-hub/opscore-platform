# Seller-side commercial closeout — OpsCore v0.11.62

> **Decision: SELLER SOURCE-RELEASE HOLD. This is not a buyer-acquisition hold.**
>
> A named buyer, buyer signature, payment, buyer-specific legal review or transaction License Schedule is **not** required to complete seller engineering, prepare a release package, publish or list the offer, present the product, or negotiate. **No prospective buyer or buyer signature is needed to complete the product.** The buyer-specific Schedule is required only at transaction close, before granting the named buyer licensed rights or making the licensed delivery. **No license grant is made to a buyer until** the rights holder and named buyer execute the License Schedule pinned to the exact released source commit and package digest.

**Updated:** 2026-11-17  
**Current `main`:** `6adea6fa209e394b464c4272db1860422d608afb`  
**Current candidate branch:** PR #222, branch `fix/mobile-sdk58-current-main-20261117`.  
**Candidate status:** Draft / not merged / not a qualified release. The latest complete workflow evidence below tested candidate head `7b88f8fc18ec07bad09928038f9c1fe8176526a1`. The subsequent update to this report is documentation-only; the application source, manifests and mobile lockfiles remain the same tested candidate.

## 1. Current exact-head evidence

| Gate | Exact-head result | Interpretation |
|---|---|---|
| OpsCore CI | [Run 44168632307](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44168632307) — failed only at Mobile dependency audit | Backend release regression suite: 810 tests, 807 passed, 0 failed, 3 skipped; backend runtime audit: 0 vulnerabilities |
| Mobile full audit | 25 High, 0 Critical | Dedicated exact-candidate JSON `mobile-dependency-audit.json`; fail-closed audit gate remains active |
| Mobile production audit (`--omit=dev`) | 26 High, 0 Critical | Dedicated exact-candidate JSON `mobile-production-dependency-audit.json`; required CI audit step fails |
| Expo SDK58 candidate validation | [Run 44168624849](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44168624849) — fail-closed at unresolved High gate | Expo 58.0.26 / React 19.3.0 / React Native 0.88.1; Android, iOS and Web exports PASS; known picomatch signatures absent from exported bundles; full/production audit JSONs 25/26 High |
| PostgreSQL 18 isolated RLS/HTTP acceptance | [Run 44168632188](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44168632188) — PASS on this exact head | Caller-bound tenant matrix: 346 route checks; logical restore: 137 tables; report remains `isolationCertification=NOT_CERTIFIED` |
| Vercel contract verification | [Run 44168632421](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44168632421) — failed only at Mobile dependency audit | 26 High / 0 Critical in the required mobile production audit; deploy-bound PostgreSQL and deploy jobs were skipped. No Production deployment occurred |

The counts are reconciled by the two separate JSON reports: 25 High in the full dependency graph and 26 High in the production-only (`--omit=dev`) graph. These are audit package/path records linked to the same picomatch advisory, not 25 or 26 independent CVEs. The enforced production audit gate returns 26 High and fails.

The current candidate validation run 44168624849 resolved Expo 58.0.26, React 19.3.0, React Native 0.88.1 and the matching Expo SDK58 modules; it completed Android, iOS and Web JavaScript exports and did not find the known picomatch signatures in those exported client bundles. The full and production-only audit JSONs still report 25 and 26 High respectively. Bundle string scans do not prove that the vulnerable tooling code is unreachable in all Expo/Metro/package workflows, so these successful exports do **not** resolve the dependency audit finding.

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

Older Production pins, package digests and Secure Release artifacts are historical records only. They must not be reused as identity or proof for `7b88f8fc18ec07bad09928038f9c1fe8176526a1` or a later source head. A current handover identity exists only when a successful Secure Release run creates the ZIP and its matching external release statement for the exact source commit.
