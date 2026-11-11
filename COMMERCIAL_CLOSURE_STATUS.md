# Commercial Closure Status — OpsCore v0.11.62

<badge>HOLD — NOT CLEARED FOR BUYER DELIVERY</badge>

**Historical engineering status:** PASS_WITH_BUYER_RESIDUALS was reported by an older candidate pipeline. It is not a current release approval and must not be reused as evidence for a new source commit.
**Current production certification:** NOT_ESTABLISHED.
**Production isolation certification:** NOT_CERTIFIED.
**Current release identity:** must be generated from one exact GitHub main commit, its successful release workflow, immutable archive, SBOM and attestations. No older GitLab pipeline or archive is a substitute.

## Verified engineering facts and boundaries

- PostgreSQL migration 053 is present in the current Neon acceptance schema; older references to migration 051 are historical and incomplete.
- The isolated PostgreSQL 18 RLS workflow has passed on recent main commits. This is isolated test evidence, not proof of every production route or every cross-tenant relationship.
- The default Neon main branch is currently unprotected. The available Neon plan rejected a protection request because its protected-branch quota was reached. Do not delete rollback/verification branches merely to bypass the quota.
- Live catalog inspection found 131 of 132 public tables with RLS and FORCE RLS; the remaining table is the PostGIS reference table `spatial_ref_sys`. This does not close the separate tenant-to-tenant foreign-key integrity gap.
- 73 foreign-key relationships connect tenant-owned tables without a paired `organization_id` key. Same-tenant relationship enforcement remains open.
- The mobile source enables the SQLCipher build option but does not yet set and verify a database key in the runtime open path. Whole-database encryption is therefore NOT_VERIFIED.
- The production Vercel database connection role has not been proven to be `opscore_runtime` (NOBYPASSRLS). The live role `opscore_app` has BYPASSRLS and must not be treated as the restricted runtime identity.
- The latest inspected Vercel production deployment does not match current GitHub main. The main deploy workflow's production preflight blocked deployment; a green workflow result must not be read as a successful production promotion.
- The old release statement under `docs/release/COMMERCIAL_RELEASE_STATEMENT.json` is historical evidence for an older GitLab commit/pipeline. It is not the current GitHub release statement.

## Open release blockers

1. SQLCipher key management, safe legacy database migration, fail-closed behavior and native iOS/Android acceptance — GitHub issue #30.
2. Same-tenant database relationship enforcement and two-tenant negative tests for all applicable tenant-owned FK edges — issue #31.
3. Mobile CI privacy inventory and generated iOS privacy-manifest verification — issue #32.
4. Exact-main release provenance, production deployment identity, runtime-role proof and buyer-facing document reconciliation — issue #33.

## Buyer-owned and external gates

- Signed Android AAB and iOS IPA, signing identities, physical-device acceptance, TestFlight/Play internal testing and store approval.
- Human native-speaker review and sign-off of 114 locale entries. Machine-generated translations are not production-qualified.
- Licensed commercial map tiles/routing and external provider accounts, contracts, credentials and live acceptance.
- Customer-specific identity, telephony/contact-center, messaging, payments, storage and KMS/HSM configuration where included in the purchased scope.

## Release decision

Do not issue a buyer-ready or production-certified claim while any applicable P0/P1 blocker remains open. A successful CI run, a READY historical Vercel deployment, a valid checksum, or an isolated RLS test is not sufficient on its own.

The older PASS_WITH_BUYER_RESIDUALS result remains historical; the current commercial decision is HOLD until the exact candidate is rebuilt, independently verified and deliberately promoted.
