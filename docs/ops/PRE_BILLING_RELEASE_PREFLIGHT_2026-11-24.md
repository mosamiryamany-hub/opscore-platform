# OpsCore — Pre-Billing Production Release Preflight

**Recorded:** 2026-11-24  
**Current source main at record time:** `60af86adc2cc1923d56be3f0651b43d5e55d8bef`  
**Decision:** `NOT CLOSED — BILLING-BLOCKED`

This is an operator handoff and a point-in-time evidence register. It is not a release certificate, buyer acceptance, legal opinion, or authorization to operate on Production.

## 1. Source and CI state

- PR #423 is merged. Its squash commit was `e8bf23909c3de2cab4d1ca70a40649275075d45f`.
- PR #424 was subsequently merged as `60af86adc2cc1923d56be3f0651b43d5e55d8bef`. It routes signed tenant HMAC calls through the existing helper and corrects disposable RLS-purpose test fixtures to hash random opaque tokens with the existing token helper. No Production token, password, key, row, database, environment variable or secret was changed.
- Current main CI on `60af86...`: `verify`, `vercel-contract-verify`, `vercel-source-verify`, both disposable PostgreSQL 18/RLS acceptance jobs, and CodeQL Analyze for JavaScript/TypeScript, Actions, and Python passed.
- On that exact main SHA, `deploy`, Production Neon PITR historical probe, and Neon Preview migration/HTTP acceptance were `SKIPPED`. Do not represent these as passes.
- PR #425 carries this document and the evidence-backed SBOM license inventory plus the 401-branch historical snapshot. Its checks must be completed before merging.
- PR #426 re-applies the action pin updates from stale Dependabot PRs #421/#422 on current main. PR #421/#422 were closed unmerged as superseded; they must not be treated as merged.

## 2. Production deployment and billing

- Vercel project: `opscore-platform`; project id `prj_8jMqBt0l6OALicWSwQ3ECQTn8yPe`.
- Last directly inspected Production deployment: `dpl_66C6JM3okLFrYj1LR5SngN2KALX4`, READY, source SHA `65de6e2dcd51e4cd04140cf8c6b67eb76d9c8402`.
- Canonical domain: `opscore-platform.vercel.app`; domain record verified and alias previously mapped to the older deployment.
- Project metadata reported `live=false`. No deployment for current main `60af86...` was verified.
- The owner’s direct measurement reports HTTP 402 `DEPLOYMENT_DISABLED` with Vercel team plan `pro`, subscription `canceled`. The connected Vercel team read in this review did not expose billing status, so the canceled state remains owner-supplied evidence; no billing mutation was performed.
- Production environment-variable inventory was inspected without decrypting values. One security warning was found on `OPSC_TENANT_CONTEXT_HMAC_KEY`: legacy `type=encrypted` with `securityIssues=[readable-secret]`. I changed only its storage type to `sensitive` (`visibility=secret`), keeping the same variable id, Production target and value (no value was retrieved or rotated). A second read confirmed `type=sensitive`, `visibility=secret`, `securityIssues=[]`. This classification change applies to future deployments; it did not change the already-created deployment.
- `AUTHORIZE_PRODUCTION_RELEASE` is a GitHub Actions `workflow_dispatch` choice, not a Vercel environment variable. The `vercel-deploy.yml` gate also requires repository variables `OPSC_PRODUCTION_AUTODEPLOY_ENABLED=true` and `OPSC_STAGED_PRODUCTION_PROBE_READY=true`, plus the typed confirmation `I_AUTHORIZE_PRODUCTION_DEPLOYMENT`. The installed GitHub connector cannot inspect repository Actions variables, so their current values remain UNVERIFIED. Do not set the staged-probe readiness variable true until the candidate probe evidence is actually accepted.
- A public fetch attempt during this review failed with cache miss; no new independent HTTP status is claimed here.

**Owner action:** Restore the Vercel team subscription in Vercel Billing. Do not share payment-card information or credentials in this repository or chat.

**After billing is restored, do these in order:**

1. Verify the subscription is active in Vercel Billing.
2. Recheck `/api/health`, `/api/version`, `/api/verify/release`, `/api/verify/database`, and `/api/verify/database-security` on the canonical domain. Capture status code, response body, deployment id and served commit SHA.
3. Verify the current main `60af86...` is the intended candidate and that all required source/CI checks are green. Use the normal release workflow and its explicit production authorization gate; do not perform an ad hoc deployment or bypass a HOLD.
4. Verify canonical domain alias maps to the exact deployment built from `60af86...` (or a later reviewed main SHA), not merely a READY deployment with an older SHA.
5. Re-run the independent two-tenant Production HTTP isolation test only after served deployment identity and Neon target identity have been verified before any writes. Require both tenants’ own asset creation, cross-tenant read/write denial, and complete cleanup. Record actual HTTP status/error for any failure.
6. Recheck Legal routes only after the live service responds. A 402 does not prove 404 or page content. Publish only rights-holder/legal-approved content.
7. Rebuild the final commercial package only from the exact accepted main SHA and exact deployment evidence. Bind every artifact and checksum to that same release.

## 3. Neon Production — Free plan retained

Directly inspected project: `summer-leaf-18448271`, organization `org-red-bread-35633140`, organization plan `free`.

- Production branch: `br-proud-salad-bcshhdap` (main), READY.
- Project branches at inspection: 8; Free plan branch limit: 10.
- PostgreSQL 18.7; `opscore_acceptance` database.
- Direct catalog counts: 137 public tables, 136 RLS-enabled and FORCE-RLS tables, 279 policies. Sole table without RLS was `public.spatial_ref_sys`.
- `opscore_runtime`: non-superuser, `BYPASSRLS=false`, no SELECT privilege on `schema_migrations`.
- One manual snapshot listed: `snap-aged-thunder-bcsxc1a5`, created 2026-11-19.
- Automatic snapshot schedule is empty. On Free, scheduled backups are unavailable; the Free plan includes one manual snapshot and a six-hour instant-restore window. See Neon's official [Plans documentation](https://neon.com/docs/introduction/plans) and [Free plan limits](https://neon.com/docs/faqs/free-plan-limits-and-quotas).
- Attempt to protect Production main was rejected by Neon with HTTP 422 because the plan reported its maximum protected-branch count had been reached. No protection was changed; no other project's protection was removed; no plan upgrade was attempted.
- Full CU-hours/network transfer consumption could not be retrieved through the Free-plan consumption endpoint. Do not claim consumption was independently measured.

**Restrictions:** Keep Neon Free. Do not create branches or snapshots just for this release without rechecking capacity. Do not remove the only manual snapshot. The six-hour restore history and one manual snapshot are limited recovery mechanisms, not an independently stored backup.

## 4. WAF state

The inspected Vercel Firewall configuration was version 6:

- CRS general/RCE/SQLi/XSS and bot protection active in `log` mode.
- No custom IP rules.
- Existing POST login/mobile-login rate limit: 60 requests per source IP per 60-second fixed window, active.

No production WAF change was made. A one-week log baseline is not established by the current short observation window. After service restoration, collect a full baseline, rehearse false positives on Preview, then stage narrowly scoped challenge/block rules with documented rollback. Do not enable broad blocking merely to close a checklist.

## 5. CodeQL — three prior findings remain a review item

The latest PR #424 CodeQL check passed and reported no new alert in its check summary. That does not prove the three previously reported `js/insufficient-password-hash` alerts are closed. Their last recorded locations were:

- `backend/src/signed-tenant-context.js` — HMAC-SHA256 signature for signed tenant-context claims.
- `backend/scripts/postgres-signed-rls-purpose-acceptance.js` — SHA-256 token-hash fixtures for high-entropy random session/API-key tokens.
- `backend/scripts/collect-production-recovery-point.js` — SHA-256 evidence checksum for an operation-failure marker.

No alert was dismissed, suppressed or severity-lowered. Do not replace these with Argon2/bcrypt: they are not password storage, and changing token hashing would change lookup semantics. Re-query the live CodeQL alert list after the current main analysis and require explicit reviewer resolution of any surviving findings.

## 6. Branch inventory and cleanup

- The attached `docs/ops/branch_inventory_2026-11-24.json` is a point-in-time snapshot from main `e8bf2390...`, captured before PR #424 merged and before the action-refresh PR #426 was created.
- At that snapshot it contained 401 branch refs and 416 PR records, with conservative triage. It identified merged exact-tip archive candidates, open PR branches, closed-unmerged branches and no-PR-association branches.
- It is not a blanket deletion authorization. No branch was deleted in this review. A merged PR branch can still hold deployment/evidence references.
- PR #399 was closed unmerged as a stale historical reconciliation; its branch and audit trail remain. PRs #421/#422 were closed unmerged as stale and are replaced by #426.

Refresh the inventory before any cleanup. Delete only after verifying no open PR, no active deployment/alias, no release/evidence dependency, and exact merged state.

## 7. License inventory and distribution rights

- Committed SBOM on the pre-merge source had 496 components and 15 distinct license expressions. The attached `docs/commercial/THIRD_PARTY_LICENSE_INVENTORY_2026-11-24.json` records the exact component list and SPDX expressions.
- Two first-party components have no license expression in the SBOM: `opscore-starter` and `opscore-mobile`. The source package manifest says `UNLICENSED`; the root `NO_LICENSE_GRANT_NOTICE.txt` remains authoritative.
- Third-party NOTICE and upstream license-text collection is not complete. MPL-2.0, CC-BY-4.0, Apache/BSD/BlueOak and SPDX OR expressions require package-specific notice/legal review.
- The inventory is not legal clearance. No `NOTICE.txt` was fabricated from SPDX labels.
- No license, IP assignment, use, modification, distribution, resale, sublicensing or hosting rights are granted by this technical record. An executed License Schedule from the rights holder is still required before buyer rights are granted.

## 8. Buyer-owned residuals — unchanged

- Android/iOS signing, native builds, physical-device QA and app-store publication.
- Native-speaker translation review: 0/114 locales.
- Licensed maps, road-routing, provider accounts/credentials, attribution, quotas and buyer acceptance.
- Buyer-specific legal identity, pricing, tax, refunds and legal terms.
- Rights-holder decision and signed License Schedule for any use/distribution/resale/IP rights.
- No ISO 27001, SOC 2, PCI DSS or external independent certification is established.

Do not alter or silently remove these residuals.

## 9. Current decision

`NOT CLOSED`.

The main source/CI checks passed on `60af86...`, but Production deployment is skipped/disabled, live health is not verified, WAF is log-only, Neon Free has limited recovery and no scheduled backups, license notices/legal clearance are unfinished, and buyer-owned residuals remain. This document is a pre-billing handoff, not authorization to claim production release or commercial closure.
