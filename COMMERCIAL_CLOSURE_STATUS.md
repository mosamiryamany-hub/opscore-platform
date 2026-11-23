# OpsCore — Technical and Commercial Closure Status

**Reconciled:** 2026-11-22
**Main SHA at reconciliation start:** `63682774b7f81e123f996f6508fed5a714fea0be`  
**Application/runtime baseline:** `43554492218adbf0cde2d700bd0dedfadce67f5e` (closeout merge changed docs, tests and static audit tooling only)
**Current classification:** `HOLD — SELLER RELEASE NOT CERTIFIED`  
**Buyer-specific qualification:** `NOT_ESTABLISHED`  
**Buyer environment:** `NOT_VERIFIED` — seller evidence does not transfer to buyer infrastructure.

## Exact current release evidence

| Control | Current verified value | Interpretation |
|---|---|---|
| GitHub main | `43554492218adbf0cde2d700bd0dedfadce67f5e` | Confirmed from `origin/main` on 2026-11-22 |
| GitHub workflow | `44993913435` | Post-merge verify PASS: 960 passed, 0 failed, 3 skipped |
| Vercel workflow | `44993913475` | Source, isolated PostgreSQL 18, contract and isolated RLS/HTTP checks PASS; PITR, Neon Preview migration and deploy jobs SKIPPED |
| Signed-tenant PostgreSQL 18 artifact | `PASS 67/67` | Disposable CI route probes; all 67 signed/session/transaction-bound and raw-GUC tamper-denied; no Production deployment ID/certification/promotion |
| Mobile audit artifact | `PASS`, 0 findings | Full and production trees, 497 dependency nodes, exact reconciliation-base source hint |
| Production certification / promotion | `NOT_ESTABLISHED` / `NOT_PROVEN` | No exact-head authorized Production workflow or matching runtime evidence |
| Vercel deployment for reconciliation base SHA `63682774…` | None found | No deployment record for current main closeout commit |
| Latest application-source Vercel Production-target deployments | `dpl_G15K6Sg9Q7xJQKrHKFRYJGSNDerN`; `dpl_EC2Ri4BJrZTN7ca53xurrUV9LvmR` | Both READY on application/runtime parent SHA `43554492218adbf0cde2d700bd0dedfadce67f5e`; both alias lists empty |
| Canonical production domain | `opscore-platform.vercel.app` → `dpl_EacspS7o2jntgw8uS1YMpzf45CFt` | Domain verified; alias deployment source SHA `b7f63445c1748ebaec426a9ebe0ea629e4998839`, not current main |

The workflow's source and isolated PostgreSQL 18 checks passed, but its Vercel deploy, PITR and Neon Preview migration jobs were skipped. No Vercel deployment record exists for reconciliation base SHA `63682774…`. Two READY Production-target deployments exist on its application/runtime parent SHA `435544922…`, both with empty alias lists. The verified canonical domain remains attached to deployment `dpl_EacspS7o2jntgw8uS1YMpzf45CFt` on SHA `b7f63445…`. The public domain is still on the older release; final runtime/database proof, promotion and canonical-domain verification remain unproven.

## Seller-owned closeout gates

- [ ] Implement and pass full Production PostgreSQL HTTP route **and business-flow** acceptance, bound to exact source commit, pipeline, deployment ID, database identity, complete route/flow inventory and zero failures. SQLite route contract evidence is not sufficient.
- [ ] Close the remaining PostgreSQL tenant trust-boundary findings: migration 071 is recorded as applied in the live Primary ledger, and a fresh raw-GUC probe returned NULL/empty context values; identity-table grants, privileged helper exposure, independent AI/search pools and non-PostgreSQL operational worker paths still require exact-target behavioral proof. Require runtime-role denial tests, not catalog-only claims.
- [x] Reconcile GHSA-fc5q-39xc-vjpf / CVE-2026-112366: GitHub/OSV withdrew the advisory on 2026-11-18 and the obsolete exception was removed. Six full / `--omit=dev` audits across root, backend and mobile returned zero findings against current lockfiles. Withdrawal is not a package patch and audit results do not certify the complete dependency graph; repeat on the final package.
- [ ] Complete seller-hosted recovery capability: scheduled protected backups, appropriate retention, tested restore and explicitly measured recovery objectives. Current Neon Free limits do not establish scheduled backup or RPO/RTO coverage.
- [ ] Rehearse WAF enforcement on Preview, review false positives and then apply narrowly scoped production deny/challenge controls with evidence. Current managed attack and bot rules are log-only.
- [ ] Tighten and run Secure Release on one exact main commit; verify the package, archive digest, SBOM, provenance/signature, regression/security results, dependency audits and localization evidence from that same run.
- [ ] Reconcile seller documents and verify public routes. Legal content must be approved by the rights holder/legal reviewer before publication; the last recorded observation found the required legal routes returning 404 and is not a fresh 21-Nov HTTP check.
- [ ] Only after the above gates pass, run the explicitly authorized production release workflow, verify the staged runtime and public domain, and prove the canonical alias maps to the exact released commit.

PR #381 is included in current `main` and updates release-proof controls. The local red-team analyzer correction and regression test are uncommitted and not in `main`; its local PASS cannot replace main's current REVIEW report. Production functional route/business-flow evidence, a post-merge authorized workflow and exact-target proof remain absent, so release stays HOLD.

**NO LICENSE GRANT.** No buyer license or commercial distribution right exists until the rights holder and named buyer execute a **signed** exact-deliverable License Schedule.

## Production environment binding

Read-only Vercel environment inspection on 2026-11-22 found `OPSC_PRODUCTION_HOLD=false`, `OPSC_RELEASE_VERIFIED=true`, and internal `OPSC_PRODUCTION_ISOLATION_CERTIFICATION=CERTIFIED`. These are deployment flags, not external certification. `OPSC_RELEASE_PACKAGE_COMMIT`, `OPSC_RELEASE_CI_COMMIT` and `OPSC_SOURCE_COMMIT_SHA` all bind to `b7f63445c1748ebaec426a9ebe0ea629e4998839`, the canonical alias source SHA. `OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID` points to a separate READY Production-target deployment on the same SHA. This state is consistent with the older public release, not current reconciliation base SHA `63682774…`.

Production TLS settings are `OPSC_PG_SSL_MODE=verify-full` and `OPSC_PG_SSL_REJECT_UNAUTHORIZED=true`. This confirms strict configuration, not actual worker TLS negotiation. Keep the application-worker TLS gate open until exact-deployment runtime evidence passes.

## Neon and database boundaries

A fresh Neon read on 2026-11-22 confirms Production Primary `br-proud-salad-bcshhdap`, PostgreSQL 18, Free plan, six-hour history retention, 1 GiB branch logical-size limit, one manual snapshot and an empty automatic snapshot schedule. Primary and recovery branch `br-calm-poetry-bc7l7wik` are both unprotected; the allowed IP list is empty and public connections are not blocked. Read-only ledger queries found 70 Primary rows ending at `071_signed_rls_context_all_access_modes.sql`, and 68 recovery rows ending at migration 069. The migration number is not the ledger row count. The 2026-11-20 native PITR probe passed only a historical-branch schema/catalog comparison; it did not establish row-content equality, a tested full restore, or RPO/RTO.

The last catalog observation recorded 136 public tables, with 135 carrying RLS and FORCE RLS; `spatial_ref_sys` is the PostGIS metadata exception. At that observation the runtime role had no superuser/BYPASSRLS attributes. **Historical P0 trust-boundary reproduction (2026-11-21):** a read-only, transaction-local probe using `opscore_runtime` and no signed payload showed `opscore_current_tenant()`, `opscore_current_user()` and `opscore_access_mode()` accepting attacker-supplied raw GUC values; on a count-only test, this exposed 2 rows from `activity_log` for a selected existing tenant context. No row contents were read and no persistent database changes were made. Migration 071 now implements HMAC-verified context in current source and rejects raw-GUC-dependent RLS policies, but no fresh Production catalog evidence confirms it was applied or verifies current grants and policies. Treat Production tenant isolation as **NOT CERTIFIED** until current state and runtime-role denial are independently tested.

## Localization qualification

Contact Center has 105 selectable locales, but native-speaker review and production language qualification remain 0/114. The AI/machine translation notice must remain explicit; no native linguistic approval is claimed.

## Buyer-owned residuals — not included in seller remediation

1. Buyer-specific mobile (Android/iOS) signing, native builds, physical-device QA and store publication.
2. Native-speaker review and production qualification (currently 0/114 reviewed/qualified).
3. Licensed maps and road routing, provider account/credentials, attribution, quotas and buyer-specific live acceptance.

These remain explicitly disclosed; excluding them from the seller work list does not make them complete.

## Commercial offer and rights

Published seller asking floors remain L1 USD 45,000 (use), L2 USD 85,000 (use, modify and redistribute), and L3 USD 175,000 (exclusive/IP assignment subject to the executed schedule). These are seller asking floors, not independently validated market valuations or accepted offers.

**OPEN FOR MARKETING** does not mean delivery authorization. The repository remains `UNLICENSED`; no buyer license is granted until the rights holder and the named buyer execute a transaction-specific License Schedule pinning the exact released artifact and rights.

`backend/docs/verification/COMMERCIAL_CLOSURE_GATE_RESULT.json` dated 2026-11-02 is historical evidence only; it is not the current release verdict.


## Latest reconciliation — 2026-11-23 final deployment binding

The final deployment-binding workflow succeeded on run [45236113208](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45236113208). Binding artifact ID: `14850520927`; in-toto statement SHA-256: `97208c28f918223a36a101c9cb1e19f1affa6f3c472295682425eb8330c0ff22`. It associates release archive SHA-256 `47a1afb9718437c5f4c9f67c449525efed0646a98b70bdc424efe7cc54c340e0` (source `8011bc5550372a318dbf47bf89e6837059987f58`) with final Vercel deployment `dpl_6r4ZCJiuVHonja32AXhsjwMSDoig` and the verified public alias. Six public HTTPS smoke checks, source-pinned GitHub attestation, SLSA verification, original Cosign archive signature and final binding statement signature passed.

This result supersedes the older statement that no final deployment binding existed. It does **not** supersede the following boundaries: 358 API routes remain candidate-only; 67 signed-tenant routes remain disposable PostgreSQL 18 CI-only; six public HTTP checks are smoke checks, not complete route/business-flow acceptance; the archive and Vercel deployment are separately built outputs, not byte-identical; and internal evidence is not external accreditation.

The release archive remains version 0.11.62 and is pinned to source commit `8011bc...`. The later main commit `8e00b72995876910d3f21506c09f821462e24aec` contains the binding-workflow/docs correction, not a regenerated application release. GitHub compare from release source `8011bc5550372a318dbf47bf89e6837059987f58` to current `main` `8e00b72995876910d3f21506c09f821462e24aec` contains only the final deployment-binding workflow and its plan document. Both are excluded from the 936-entry inner `OpsCore-release.zip`; therefore the current application payload remains aligned with current `main` application source for this delta. A new secure package is required only after an application-source, runtime-dependency/lockfile, release-metadata, or packaging-input change.

Commercial rights remain unchanged: `licenseGrant=NONE_PENDING_RIGHTS_HOLDER_DECISION`, `distributionAuthorized=false`. No buyer license, resale or distribution permission is created by CI, signatures or deployment evidence. The I18N audit reports 105 selectable locales (1 English source, 100 machine-assisted drafts, 4 English fallbacks), 0 native-speaker reviewed and 0 production-qualified. Mobile signed binaries/device acceptance, licensed maps, legal-page owner content, full production business-flow acceptance, production tenant behavioral proof, protected scheduled backup/restore/RPO/RTO, WAF enforcement, and external accreditation remain open or buyer-owned as detailed in [issue #418](https://github.com/mosamiryamany-hub/opscore-platform/issues/418).

**Updated decision: final deployment binding PASS; commercial closure remains HOLD / OPEN.**
