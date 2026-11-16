# OpsCore — Technical and Commercial Closure Status

**Technical classification:** `HOLD_FOR_PRODUCTION_EVIDENCE_REVALIDATION` — current seller-reference isolation evidence is not verified for the active Production commit and Neon branch.  
**Commercial license status:** **NO LICENSE GRANTED — COMMERCIAL MODEL PENDING**.  
**Distribution status:** **HOLD — DO NOT SELL OR DISTRIBUTE**.

The exact source commit, pipeline, artifact, archive digest, SBOM, and attestation are generated per Secure Release run. This repository document deliberately avoids fixed candidate identifiers; use only the release statement and artifact from the same successful exact-head run.

## Commercial rights hold

The former use-only source license is withdrawn. This notice grants no right to use, install, run, inspect, modify, copy, distribute, resell, sublicense, host, or otherwise commercially exploit the source package. All rights are reserved. A future grant requires a separate written agreement approved and signed by the rights holder.

The authoritative package notice is `NO_LICENSE_GRANT_NOTICE.txt`. Package metadata remains `UNLICENSED`; the package must contain no first-party `LICENSE` or `LICENCE` grant file. CI success, production deployment, archive, fingerprint, SBOM, or attestation does not create a license or imply permission to distribute.

## Seller-reference technical evidence

The current stored Production session-isolation and recovery evidence is `NOT_VERIFIED`: both records contain an evidence-rebind marker with `probesReexecuted=false`, and the recovery record refers to a previous Neon branch rather than the active Production branch. The evidence commit therefore cannot certify the current deployment/database pair. Vercel Production metadata still contains certification/release values that conflict with those embedded records; treat those values as stale, not as proof.

Do not report seller-reference Production isolation as certified until new dual-tenant Production probes and a real recovery-point comparison are rerun against the exact current application commit and active Neon Production branch, with independent review. A `READY` Vercel deployment or successful CI run is not a substitute. Buyer environments remain NOT CERTIFIED.

## Remaining engineering and buyer-environment work

1. Signed tenant-context cutover remains incomplete: Preview-only signed-context work is under review; production migrations and the remaining authentication, system/background, Knowledge-pool and route-purpose paths are not yet proven end-to-end. Do not claim complete trust-boundary coverage.
2. WAF enforcement must be proven in blocking mode; logging-only rules are not blocking protection.
3. Neon PITR/restore must be validated with a real restore drill and measured RPO/RTO.
4. Mobile source is included, but signed Android/iOS store artifacts, buyer-specific signing, physical-device QA, and store publication remain outstanding.
5. Native-speaker/domain translation review remains outstanding.
6. Licensed maps/road-routing and buyer-specific external providers, credentials, contracts, and live acceptance remain outstanding.
7. Buyer-environment installation, migration, isolation, backup/restore, and operational acceptance remain buyer-environment gates.

## Release integrity

- Every source change invalidates the previous package identity.
- Secure Release artifacts are for internal technical verification only while the rights hold is active; they must not be distributed.
- No archive, checksum, SBOM, or attestation overrides this rights hold.
- Do not create a sale listing or buyer delivery until the commercial model and signed rights agreement are approved.

**Final commercial decision:** PENDING.  
**Current permission to sell/distribute:** NONE.  
**Buyer-environment certification:** NOT ESTABLISHED.


## Live revalidation addendum — 2026-11-16

The latest live cross-platform evidence is recorded in `COMMERCIAL_CLOSURE_REVALIDATION_2026-11-16.md`. The commercial decision remains **HOLD — DO NOT SELL OR DISTRIBUTE**.

Key corrections and confirmations:
- The latest Production Vercel deployment `dpl_Hy9ymDff1oChGpBAxmAjr4cfwyyG` is `READY` and uses the same SHA as `main`: `4017497068defa9c1d0761fcb07bc746925e002a`. This confirms deployment alignment only.
- Run `43827648670` records `productionIsolationCertification=false` in the Production acceptance artifact. A later legacy workflow log line printed `ISOLATION_CERT CERTIFIED`, but its v1 evidence check did not prove the required `opscore_acceptance` database identity or signed-session route coverage.
- The current `main` session collector hard-codes the cross-tenant write-denial result as PASS. The current recovery collector falls back across database names; the observed run selected `opscore_http_acceptance` rather than proving recovery of `opscore_acceptance`.
- The current `main` recovery collector deleted an existing recovery branch in run `43827648670`. PR #161 removes automatic branch deletion and fails closed on capacity, but remains open and Draft.
- PR #160 and PR #161 have successful reported pull-request CI, but both remain unmerged and have no independent review recorded. Their deployment jobs were skipped on PR events.
- Preview has migrations 063–068; Production has migration 068 with matching checksum. Signed tenant-context variables remain Preview-only, and the required 67-route Production proof is not verified.
- Neon automatic snapshot schedule is empty. A manual snapshot is not PITR, a scheduled backup, or measured RPO/RTO.
- Active Vercel Firewall managed rules and the login observation rule use `log`, not blocking actions.
- Vercel plan metadata reports `Hobby`; commercial plan suitability remains an owner/billing decision.

The live revalidation intentionally does not rebind old evidence files, generate a synthetic PASS report, enable Production signed-session flags, publish Firewall changes, alter Neon roles/settings, apply migrations, or promote a deployment. Historical evidence files remain historical.

The full evidence, exact identifiers, source limitations, gate-by-gate status, and prohibited claims are documented in `COMMERCIAL_CLOSURE_REVALIDATION_2026-11-16.md`.

**No commercial license is granted by this addendum.** A separate written agreement approved and signed by the rights holder remains mandatory before sale, distribution, resale, sublicensing, hosting, or buyer source delivery.


### Additional read-only Production SQL audit

The live audit of `opscore_acceptance` found 134/135 public base tables with RLS and FORCE RLS; eleven `SECURITY DEFINER` functions are owned by `neondb_owner`, not `opscore_auth_definer`; no function is owned by `opscore_auth_definer`. The functions grant EXECUTE to `opscore_runtime`, not PUBLIC, and `public` is not CREATE-writable by either runtime role. However, `opscore_app_least` still has CRUD grant metadata on 134 public relations, and `opscore_runtime` on 136. Two definer functions set `row_security=off`. These are hardening/review items; no role, grant, schema, or function was modified. Detailed SQL findings and limits are in `COMMERCIAL_CLOSURE_REVALIDATION_2026-11-16.md`.


### Integrated PR #163 — final CI and merge outcome (2026-11-16)

PR #163 at head `360067dd1aac25932a8fcb92e26af947033ee3b3` passed OpsCore CI run `43865467244`, PostgreSQL 18 isolated RLS/HTTP acceptance run `43865467363`, and Vercel contract verification run `43865467227`. Production deploy jobs were skipped on the PR event. Production deploy is now manual-only: it requires `workflow_dispatch` on `main`, input `I_AUTHORIZE_PRODUCTION_DEPLOYMENT`, and `OPSC_PRODUCTION_AUTODEPLOY_ENABLED=true`; a push to `main` cannot deploy.

GitHub rejected the squash merge with HTTP 405 requiring approval from someone other than the last pusher. PR #163 remains open/unmerged. `main` remains `4017497068defa9c1d0761fcb07bc746925e002a`, and Production deployment `dpl_Hy9ymDff1oChGpBAxmAjr4cfwyyG` remains on that SHA.

A Neon Production branch protection attempt was rejected with HTTP 422 because the current Free plan has reached its maximum protected-branch allowance. Ten branches are present; zero are protected. No branch was deleted or unprotected.

The commercial decision remains **HOLD — DO NOT SELL OR DISTRIBUTE**. The remaining 67-route Production proof, backup/PITR entitlement and measured recovery targets, WAF blocking validation, buyer artifacts, and rights-holder agreement remain unclosed.


## Signed-tenant route policy follow-up — 2026-11-16

A source-only hardening repair was added to PR #163:
- Centralized the existing Preview-only signed work-order read/write allowlists and session-autobind gate in `backend/src/signed-tenant-context-policy.js`.
- Added an early request-context guard: when `OPSC_REQUIRE_SIGNED_TENANT_CONTEXT=true`, a route without an enabled signed-session path now fails explicitly with `503 SIGNED_TENANT_CONTEXT_ROUTE_NOT_ENABLED` before the legacy unsigned field-GUC bind is attempted.
- Added `backend/test/signed-tenant-context-policy.test.js` to test Preview-only/method-specific read and write policies, separate write flag, Preview-only global autobind, required-but-unsupported route behavior, and guard ordering.
- Recorded the source/inventory comparison in `backend/docs/verification/SIGNED_TENANT_CONTEXT_ROUTE_AUDIT_2026-11-16.md`.

**Latest integrated PR head:** `d4ef367f76d84d660b507d14629f8fad722ebbea`

Latest PR #163 checks:
- OpsCore CI run `43868453565`: SUCCESS.
- PostgreSQL 18 isolated RLS/HTTP acceptance run `43868453533`: SUCCESS.
- Vercel contract run `43868453622`: SUCCESS.
- `deploy-bound-postgres-18-acceptance` and `deploy`: SKIPPED on the PR event.

Coverage interpretation:
- Source allowlists currently match 18 read + 9 write route inventory entries (27 exact inventory entries).
- The work-orders/evidence-upload inventory contains 40 entries.
- The API inventory has 358 route entries and the release-proof eligibility filter yields 346 candidates. These figures have different meanings; none equals signed-session Production proof.
- Historical disposable PostgreSQL 18 signed work-order CI proof is not the missing 67-route Production coverage artifact.
- The approved 67-row route manifest and exact-commit/pipeline/branch-bound Production coverage JSON are still absent. No route was assigned PASS and no Production probe was run.

PR #163 remains open/unmerged. The prior merge attempt was refused by GitHub HTTP 405 because approval from someone other than the last pusher is required. No bypass was attempted.

No Preview or Production Vercel flag, signing key, database schema, role, grant, data, WAF rule, or deployment was changed by this route-policy repair. Commercial and Production isolation status remain **HOLD / NOT CERTIFIED**.

