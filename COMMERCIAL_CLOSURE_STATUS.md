# Commercial Closure Status — OpsCore v0.11.62

**Last mainline production head:** `4ef126ccd59f23cebeead30224d1bcf7199535ab`  
**Bound production pipeline:** `43588278472`  
**Commercial class:** `PASS_WITH_BUYER_RESIDUALS`  
**Seller-reference production isolation certification:** `CERTIFIED` (live gates on the bound commit/pipeline only)  
**Documentation refresh:** 2026-11-14 — aligned to live `/api/verify/release` and `/api/verify/database-security`.

## Live seller-reference gates (informative)

Measured on the seller reference deployment bound to the commit/pipeline above:

| Gate | Status |
|------|--------|
| commercialClosure | PASS_WITH_BUYER_RESIDUALS |
| productionSessionTenantBoundary | PASS_PRODUCTION |
| productionRecoveryBundle | PASS_PRODUCTION |
| productionIsolationCertification | CERTIFIED |
| neonPointInTimeRecovery | PASS_BRANCH_POINT |
| livePostgresRls | PASS_TEST_SCOPE |
| tenantRouteSecurityCoverage | PASS_TEST_SCOPE |
| functionalApiRouteAcceptance | PASS_CONTRACT_SCOPE |
| postgresHttpAcceptance | PASS |
| mobileStoreArtifacts | REMAINING_BUYER |
| nativeTranslationReview | REMAINING_BUYER |
| licensedStreetMap | REMAINING_BUYER |

Database-security surface: `IDENTITY_PLANE_RLS_ENFORCED` with runtime role `opscore_runtime` (least privilege; no superuser; no bypassrls).

## What CERTIFIED means here

`productionIsolationCertification=CERTIFIED` on the seller reference means:

1. Dual-tenant HTTP session isolation evidence was bound and activated for this commit/pipeline.
2. Production branch recovery-point evidence (table parity) was bound.
3. Commit-bound acceptance evidence hash matched.
4. Runtime env flag was derived from behavioral evidence files — not from an env flag alone.

It does **not** mean a buyer’s own production environment is certified. Buyers must reproduce install, migrations, isolation, and recovery checks in their environment.

## Buyer residuals (explicit)

1. Signed Android/iOS store artifacts and store publication  
2. Native-speaker translation/locale review (structural locales ≠ linguistic qualification)  
3. Licensed maps / external providers and credentials  
4. Buyer-environment acceptance and operational runbooks

## Open engineering track (not required to keep current live CERTIFIED)

PR `#103` (`security/priority-production-hardening-20261114`) remains **Draft**: signed-tenant-context migrations 063–065 and path coverage are incomplete for production merge. Do not treat that branch as the commercial candidate until Preview proof, keying, and full path cutover are done without breaking auth/sessions.

## Honesty

- CI success alone does not certify buyer production.
- Historical archives bound to older commits (e.g. `d940152…`) are not the current live candidate.
- Any new commercial archive must be regenerated from the exact release-producing commit and pipeline.

Buyer-environment production certification: **NOT_ESTABLISHED** until the buyer reproduces acceptance in their own environment.
