# Commercial closeout — seller release posture

> **Current status (2026-11-17): SELLER RELEASE HOLD — security and exact-head package gates remain open.**
>
> A buyer is **not required** to complete engineering, create a release package, publish the offer, or begin negotiations. Buyer identification, transaction negotiation, signature, payment and the transaction-specific License Schedule are post-sale steps, not seller release gates.
>
> Current `main` is `6adea6fa209e394b464c4272db1860422d608afb`. Draft PR #222 is based on that main and has advanced Expo SDK 58 to 58.0.26. On the latest checked PR head `522205a4d73ccacb2563aeb58ec31fdd9d0671b1`, the PostgreSQL 18 isolated RLS/HTTP acceptance passed. OpsCore CI and Vercel contract verification failed only at the mobile dependency audit: 26 High findings in the full mobile tree and 25 High findings with `--omit=dev`, associated with GHSA-fc5q-39xc-vjpf / CVE-2026-112366 through transitive picomatch dependencies. No audit suppression or forced downgrade was applied. The Vercel deploy job was skipped. PR #222 remains a draft and is not a release.
>
> The older Production proof below is historical evidence bound to its earlier commit/deployment. It does not certify current main or the SDK58 candidate. Do not use its package digest as a current deliverable fingerprint.

**Updated:** 2026-11-17T19:10Z UTC  
**Current main:** `6adea6fa209e394b464c4272db1860422d608afb`  
**Latest candidate head with exact SDK58 audit evidence:** `8f2cd2f8a43925f33fc4bc1bfbd8bde17c6b384f`  
**Historical Production pin:** `4017497068defa9c1d0761fcb07bc746925e002a`

## Latest source-candidate evidence

| Gate | Result |
|---|---|
| SDK58 validation | Expo Doctor 20/20; Android/iOS/Web exports PASS |
| Full mobile audit | 26 High, 0 Critical |
| Mobile audit with `--omit=dev` | 25 High, 0 Critical |
| Fail-closed release condition | FAIL — mobile High findings unresolved |
| Evidence artifact | `mobile-sdk58-current-main-evidence-44157086377` |
| Artifact SHA-256 | `32fe23c57c3eb51f50cd98c540dfaa5c81b1eb0883715589423bd159f443b77d` |
| Isolated PostgreSQL 18 RLS/HTTP | PASS on tested PR head `335e9a5` |
| Full backend regression suite | 806 passed, 0 failed, 3 skipped on tested PR head `335e9a5` |

The backend and PostgreSQL evidence above is bound to the listed tested PR head, not automatically to later documentation-only branch heads. The current exact-head audit remains blocked. No qualified release ZIP or release statement has been generated for the latest candidate.

## Historical runtime evidence — earlier Production pin only

The following records are retained for traceability. They describe the earlier pinned deployment and must not be represented as current-main or current-package acceptance.

| Gate | Historical status |
|---|---|
| Overall | PASS_WITH_BUYER_RESIDUALS |
| Isolation | CERTIFIED |
| Session boundary | PASS_PRODUCTION |
| Recovery bundle | PASS_PRODUCTION |
| Package SHA-256 | dea02a40c556fee6abfc84c372fb153009317867593bf9dafe8f21e171b02880 |
| Proof URL | https://opscore-platform.vercel.app/api/verify/release |

## Historical git-stored evidence for the earlier pin

| Artifact | Historical status | Notes |
|---|---|---|
| PRODUCTION_SESSION_ISOLATION.json | PASS | dual-tenant HTTP probes; sourceCommitHint=4017497…; run 44029395474 |
| PRODUCTION_RECOVERY_POINT.json | PASS | 135 tables compared; mismatchCount=0; recovery branch created then eligible for ephemeral prune |

No `evidenceRebind` / `probesReexecuted=false` on these historical files.

## Seller offer status

- OPEN FOR MARKETING, PRESENTATIONS AND COMMERCIAL NEGOTIATION.
- No prospective buyer or buyer signature is needed to complete the product or prepare its release package.
- No license grant is made to a buyer until the rights holder and named buyer execute a transaction-specific License Schedule that pins the exact deliverable.
- Tiers A (use), B (use+modify), and C (use+modify+distribute) remain transaction options, not release prerequisites.

## Remaining seller-owned source-release gates

1. Resolve or formally disposition the mobile picomatch advisory without suppressing the audit or forcing an incompatible SDK downgrade.
2. Complete the source/data-flow threat review and retain exact-candidate full and production-only audit JSON.
3. Complete the 67-route signed-session coverage evidence and review the PR #163 security-hardening lineage.
4. Pass every required CI check on one exact candidate head, including independent review.
5. Generate one successful exact-head Secure Release package with SHA-256, SBOM, provenance, test reports and forensic i18n evidence.
6. Reconcile buyer-facing documentation and package manifests to that same release statement and digest.

## Separate hosted-service and Production operations

Neon paid backup/PITR capacity, Vercel commercial hosting, Preview SSO, Production migration, HMAC rotation, WAF enforcement and Production promotion belong to a separate seller-hosted SaaS / operational certification track. They are not prerequisites for a source-code-only commercial release. They must not be claimed as complete without current target-bound evidence, and no Production mutation is authorized by this document.

Production certification remains NOT_ESTABLISHED for the current candidate. That limitation must be disclosed; it does not create a buyer-identification gate or prevent marketing a source-code offer.
